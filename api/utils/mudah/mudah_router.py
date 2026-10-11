from requests import get
from json import load
from typing import Literal, Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, StringConstraints, field_validator
from os import path

from api.utils import market_cache
from api.utils.auth import require_admin
from api.utils.error_log import log_error

mudahRouter = APIRouter(prefix='/mudah')
CACHE_TABLE = 'temporary_mudah'
# Raise this whenever the search or formatting logic changes, so results saved by older code are ignored.
SCRAPER_VERSION = 1
VEHICLE_MAP_PATH = path.join(path.dirname(__file__), 'vehicle_map.json')
MOTORCYCLE_MAP_PATH = path.join(path.dirname(__file__), 'motorcycle_map.json')
with open(VEHICLE_MAP_PATH, 'r', encoding='utf-8') as f:
    VEHICLE_MAP = load(f)
with open(MOTORCYCLE_MAP_PATH, 'r', encoding='utf-8') as f:
    MOTORCYCLE_MAP = load(f)


class CarSearchQuery(BaseModel):
    make_id:    str 
    model_id:   str
    From:       Optional[Annotated[int, Field(ge=0)]] = 0
    limit:      Optional[Annotated[int, Field(gt=0)]] = 50
    sortby:     Optional[Literal['newest', 'price_asc', 'price_desc']] = 'price_asc'
    type:       Optional[Literal['sell', 'let']] = 'sell'
    mfg_year:   Optional[Annotated[str, StringConstraints(pattern=r'^\d{4}-(\d{4})?$')]] = None
    fueltype:   Optional[Literal['petrol', 'diesal', 'electric']] = None
    condition:  Optional[Literal['used', 'new', 'recon']] = None
    mileage:    Optional[Annotated[str, StringConstraints(pattern=r'^\d{1,6}-(\d{1,6})?$')]] = None
    car_type_id:        Optional[Literal['other', '4_wheels', 'coupe', 'hatchback', 'mpvs', 'pick_up', 'sedan', 'sports', 'suvs']] = None
    transmission_id:    Optional[Literal['auto', 'manual']] = None
    price:      Optional[Annotated[str, StringConstraints(pattern=r'^\d{1,10}-(\d{1,10})?$')]] = None

    @field_validator('make_id', mode='after')
    def indexMake(value: str):
        if value not in VEHICLE_MAP: raise ValueError(f'Unknown make: {value}')

        make_id = VEHICLE_MAP.get(value.replace(' ', '-').lower())
        if not make_id: raise ValueError(f'Unknown make: {value}')
        
        return f"{make_id['__id__']},{value}"
           
    @field_validator('model_id', mode='after')
    def indexModel(value: str, prev):
        make_name = prev.data.get('make_id')
        if not make_name: raise ValueError('Valid make must be provided before selecting model')

        _model_id = VEHICLE_MAP[make_name.split(',')[1]].get(value.replace(' ', '-').lower())
        if not _model_id: raise ValueError(f'Unknown model: {value}')

        return f"{_model_id},{value}"
    
    @field_validator('condition', 'transmission_id', 'car_type_id', mode='after')
    def validate_literal_fields(value: str | None, info):
        if value is None:
            return value
        # Get the options from the Literal type annotation for the current field
        options = CarSearchQuery.model_fields[info.field_name].annotation.__args__[0].__args__
        if value not in options:
            raise ValueError(f"Unknown {info.field_name}: {value}")
        return options.index(value) + 1

class MotorSearchQuery(BaseModel):
    motorcycle_make_id:    str 
    motorcycle_model_id:   str
    From:       Optional[Annotated[int, Field(ge=0)]] = 0
    limit:      Optional[Annotated[int, Field(gt=0)]] = 50
    sortby:     Optional[Literal['price_asc', 'price_desc']] = 'price_asc'
    mfg_year:   Optional[Annotated[str, StringConstraints(pattern=r'^\d{4}-(\d{4})?$')]] = None
    price:      Optional[Annotated[str, StringConstraints(pattern=r'^\d{1,10}-(\d{1,10})?$')]] = None
    type:       Optional[Literal['sell', 'buy']] = 'sell'

    @field_validator('motorcycle_make_id', mode='after')
    def indexMake(value: str):
        if value not in MOTORCYCLE_MAP: raise ValueError(f'Unknown make: {value}')

        make_id = MOTORCYCLE_MAP.get(value.replace(' ', '-').lower())
        if not make_id: raise ValueError(f'Unknown make: {value}')
        
        return f"{make_id['@id']},{value}"

    @field_validator('motorcycle_model_id', mode='after')
    def indexModel(value: str, prev):
        make_name = prev.data.get('motorcycle_make_id')
        if not make_name: raise ValueError('Valid make must be provided before selecting model')

        _model_id = MOTORCYCLE_MAP[make_name.split(',')[1]].get(value.replace(' ', '-').lower())
        if not _model_id: raise ValueError(f'Unknown model: {value}')

        return f"{_model_id},{value}"


def build_url(query_model: dict, type: int) -> str:
    url = f'https://search.mudah.my/v1/search?category={type}&'
    for parameter, value in query_model:
        if not value: continue
        url += f'{parameter}={str(value).split(",")[0]}&'

    return url.strip('&')


# Admin-only when called over HTTP; the valuation endpoint calls search() directly in Python.
@mudahRouter.post('/search', dependencies=[Depends(require_admin)], summary="Query the Mudah api for available listings based on the make and model", response_model=list[dict])
def search(searchQuery: CarSearchQuery | MotorSearchQuery,
           whitelist_attributes: list[str | None] | None = ['model_name', 'make_name', 'condition_name', 'manufactured_year', 'fueltype', 'price', 'mileage', 'transmission_name', 'engine_capacity', 'car_type_name', 'adview_url','image', 'variant']):
    category = 1020 if isinstance(searchQuery, CarSearchQuery) else 1040
    inputs = {'category': category, **searchQuery.model_dump()}
    search_key = market_cache.build_key(inputs)

    saved = market_cache.get_fresh(CACHE_TABLE, search_key, SCRAPER_VERSION)
    if saved is not None:
        listings = saved['listings']
    else:
        URL = build_url(searchQuery.model_dump().items(), type=category)
        try:
            html = get(URL, timeout=15)
        except Exception as e:
            log_error('mudah', 'scrape_failed', f"{e} for {URL}", inputs)
            return JSONResponse(status_code=400, content={'meta': "An unexpected error occured."})
        if not html.ok:
            log_error('mudah', 'scrape_failed', f"HTTP {html.status_code} for {URL}", inputs)
            return JSONResponse(status_code=400, content={'meta': "An unexpected error occured."})

        # Save the raw attributes; the whitelist and image fix below are applied on every read
        listings = [item.get('attributes') or {} for item in html.json().get('data', [])]
        if listings:
            vehicle_key = market_cache.build_key({k: inputs.get(k) for k in ('category', 'make_id', 'model_id', 'motorcycle_make_id', 'motorcycle_model_id', 'mfg_year', 'car_type_id')})
            market_cache.save(CACHE_TABLE, search_key, vehicle_key, SCRAPER_VERSION, inputs, listings)

    response = []
    for attributes in listings:
        item = {key: attributes[key] for key in whitelist_attributes if key in attributes} if whitelist_attributes else dict(attributes)

        if item.get('image'):
            # Remove the first directory segment
            path_parts = item['image'].lstrip('/').split('/')
            trimmed_path = '/'.join(path_parts[1:]) if len(path_parts) > 1 else path_parts[0]
            item['image'] = f"https://img.rnudah.com/images/{trimmed_path}"

        response.append(item)

    return response




@mudahRouter.get('/all_vehicles',
                 summary="Returns a map of every make and model available with their corresponding IDs. Or return a list of models from a specified make with their corresponding IDs",
                 response_model=dict[str, str] | dict[str, dict[str, str]])
def vehicle_map(make: str = None):
    # Return full map if no make specified
    if not make: return VEHICLE_MAP

    # Validate make exists
    if make not in VEHICLE_MAP:
        return HTTPException(404, f'Unknown make provided: {make}')

    # Return specific make's models
    return VEHICLE_MAP[make]


@mudahRouter.get('/all_motorcycles',
                 summary="Returns a map of every motorcycle make and model available with their corresponding IDs. Or return a list of models from a specified make with their corresponding IDs",
                 response_model=dict[str, str] | dict[str, dict[str, str]])
def motorcycle_map(make: str = None):
    # Return full map if no make specified
    if not make: return MOTORCYCLE_MAP

    # Validate make exists
    if make not in MOTORCYCLE_MAP:
        return HTTPException(404, f'Unknown make provided: {make}')

    # Return specific make's models
    return MOTORCYCLE_MAP[make]
