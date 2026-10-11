import os
import re
import json
import concurrent.futures
from datetime import datetime, timedelta, timezone
from typing import Literal, Optional, Annotated
from os import path

from fastapi import APIRouter, Depends, status
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from pydantic import BaseModel, Field, field_validator, model_validator
from lxml import etree
from dotenv import load_dotenv

from zenrows import ZenRowsClient

from api.utils import market_cache
from api.utils.auth import require_admin
from api.utils.db import supabase
from api.utils.error_log import log_error

load_dotenv(".env.local")

carlistRouter = APIRouter(prefix="/carlist")

CACHE_TABLE = "temporary_carlist"
# Raise this whenever the URL builder or matching logic changes, so results saved by older code are ignored.
SCRAPER_VERSION = 1

vehicle_map_path = path.join(path.dirname(__file__), "vehicle_map.json")
with open(vehicle_map_path, "r") as f:
    VEHICLE_MAP = json.load(f)

class SearchQuery(BaseModel):
    make: str
    model: str
    condition: str = "used"
    variant: Optional[str] = None
    body_type: Optional[str] = None
    year: Optional[str] = None
    cc: Optional[str] = None
    # Exact path segments taken from Carlist's own filter links (Current Market Valuation page),
    # e.g. "1-5-e" and "body-Sedan". When set, no guessing or title matching is needed.
    variant_slug: Optional[str] = None
    body_slug: Optional[str] = None

    @field_validator('make')
    @classmethod
    def validate_make(cls, v: str) -> str:
        make_lower = v.lower()
        if make_lower not in VEHICLE_MAP:
            raise RequestValidationError(f"Make '{v}' not found in vehicle map")
        return v

    @model_validator(mode='after')
    def validate_model(self):
        models = VEHICLE_MAP.get(self.make.lower())
        if self.model.lower() not in models:
            raise RequestValidationError(f"Model '{self.model}' not found for make '{self.make}'.")
        return self

class SearchFilters(BaseModel):
    page_size: Optional[Annotated[int, Field(gt=1)]] = 50
    sort: Optional[str] = None
    min_year: Optional[Annotated[int, Field(ge=1900, le=2100)]] = None
    max_year: Optional[Annotated[int, Field(ge=1900, le=2100)]] = None
    min_price: Optional[Annotated[int, Field(ge=0)]] = None
    max_price: Optional[Annotated[int, Field(ge=0)]] = None
    min_mileage: Optional[Annotated[int, Field(ge=0)]] = None
    max_mileage: Optional[Annotated[int, Field(ge=0)]] = None
    transmission: Optional[str] = None
    fuel_type: Optional[str] = None
    driven_wheel: Optional[str] = None

def slugify_variant(query: SearchQuery) -> Optional[str]:
    """Generates Carlist path slugs (e.g., '1-5-e' for 1498cc Civic E, or '2-0i')."""
    if not query.variant:
        return None
        
    v = query.variant.lower().replace("(cbu)", "").replace("(ckd)", "").strip()
    
    # Single-letter trims (e.g. E, V, RS) require engine displacement prefixes
    if len(v) <= 2 and query.cc:
        try:
            cc_float = round(int(query.cc) / 1000.0, 1)
            return f"{str(cc_float).replace('.', '-')}-{v}"
        except Exception:
            pass
            
    s = v.replace(".", "-").replace(" ", "-")
    s = re.sub(r'[^a-z0-9\-]', '', s)
    slug = re.sub(r'-+', '-', s).strip('-')
    return slug if len(slug) > 1 else None

def build_carlist_url(query: SearchQuery, filters: SearchFilters, sort_order: str) -> str:
    path_parts = ["https://www.carlist.my/"]
    path_parts.append(f"{query.condition}-cars-for-sale/")
    path_parts.append(f"{query.make.lower()}/")
    
    models = VEHICLE_MAP.get(query.make.lower(), {})
    clean_model = query.model.lower()
    group = models.get(clean_model) if isinstance(models, dict) else None
    
    if group:
        path_parts.append(f"{group}/{clean_model}/")
    else:
        path_parts.append(f"{clean_model}/")

    var_slug = query.variant_slug or slugify_variant(query)
    if var_slug:
        path_parts.append(f"{var_slug}/")

    if query.body_slug:
        path_parts.append(f"{query.body_slug}/")
    elif query.body_type:
        clean_body = query.body_type.replace("4D ", "").replace("2D ", "").strip().capitalize()
        path_parts.append(f"body-{clean_body}/")

    year_val = filters.min_year or query.year
    if year_val:
        path_parts.append(f"year-{year_val}/")

    path_parts.append("malaysia")
    url = "".join(path_parts)
    
    # Query parameters
    query_params = [f"sort={sort_order}", "page_number=1"]
    
    if filters.transmission:
        trans_str = filters.transmission.lower()
        if "auto" in trans_str:
            query_params.append("transmission=automatic")
        elif "manual" in trans_str:
            query_params.append("transmission=manual")
            
    url += "?" + "&".join(query_params)
    return url

def fetch_page(url: str, timeout: int = 25):
    """Fetches a Carlist page through ZenRows and returns its parsed HTML tree, or None on failure."""
    api_key = os.environ.get("ZENROWS_API_KEY")
    if not api_key:
        log_error("carlist", "config_error", "ZENROWS_API_KEY is not set")
        return None

    client = ZenRowsClient(api_key)
    params = {
        "js_render": "true",
        "antibot": "true",
        "premium_proxy": "true",
        "block_resources": "image,media,font,stylesheet"
    }
    try:
        response = client.get(url, params=params, timeout=timeout)
        if response.status_code != 200:
            log_error("carlist", "scrape_failed", f"HTTP {response.status_code} for {url}")
            return None
        tree = etree.HTML(response.text, etree.HTMLParser())
        if tree is None:
            log_error("carlist", "scrape_failed", f"Empty page for {url}")
        return tree
    except Exception as e:
        log_error("carlist", "scrape_failed", f"{e} for {url}")
        return None

def zenrows_scrape(url: str):
    """Returns a list of listings ([] means Carlist had none), or None if the scrape failed."""
    tree = fetch_page(url)
    if tree is None:
        return None

    try:
        script_tags = tree.xpath('//script[@type="application/ld+json"]')
        if not script_tags:
            log_error("carlist", "scrape_failed", f"No listing data on page for {url}")
            return None

        data = json.loads(script_tags[0].text)[-1].get("itemListElement")
        return [i['item'] for i in data] if data else []
    except Exception as e:
        log_error("carlist", "scrape_failed", f"{e} for {url}")
        return None

def search_inputs(query: SearchQuery, filters: SearchFilters) -> dict:
    """Every input that changes the Carlist URL. cc is included because it changes the variant slug."""
    return {
        "make": query.make,
        "model": query.model,
        "condition": query.condition,
        "variant": query.variant,
        "cc": query.cc,
        "body_type": query.body_type,
        "variant_slug": query.variant_slug,
        "body_slug": query.body_slug,
        "year": filters.min_year or query.year,
        "transmission": filters.transmission,
    }

def vehicle_key(inputs: dict) -> str:
    """Identifies the car itself, ignoring condition/cc/transmission, for linking to insurable later."""
    return market_cache.build_key({k: inputs[k] for k in ("make", "model", "variant", "variant_slug", "body_type", "body_slug", "year")})

def scrape_low_and_high(query: SearchQuery, filters: SearchFilters):
    """Scrapes the cheapest and priciest pages at the same time."""
    url_low = build_carlist_url(query, filters, sort_order="price.asc")
    url_high = build_carlist_url(query, filters, sort_order="price.desc")
    print(f"Scraping Carlist Lowest URL:  {url_low}")
    print(f"Scraping Carlist Highest URL: {url_high}")
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        future_low = executor.submit(zenrows_scrape, url_low)
        future_high = executor.submit(zenrows_scrape, url_high)
        return future_low.result(), future_high.result()

def local_match(title: str, target_variant: str) -> bool:
    if not title or not target_variant:
        return True
        
    t = title.upper()
    v = target_variant.upper().replace("(CBU)", "").replace("(CKD)", "").strip()
    
    # Single-letter trims (e.g. 'E', 'V', 'RS')
    if len(v) <= 2:
        patterns = [
            rf"\b{re.escape(v)}\b",
            rf"\b\d+\.\d+\s*{re.escape(v)}\b",
            rf"\b{re.escape(v)}\s*SPEC\b",
            rf"\b{re.escape(v)}\s*SEDAN\b"
        ]
        return any(re.search(p, t) for p in patterns)

    tokens = [tok for tok in re.split(r"[\s\-_/()]+", v) if len(tok) > 1]
    if not tokens:
        return v in t

    if "20I" in tokens:
        return any(term in t for term in ["20I", "120I", "320I"])

    matched = [tok for tok in tokens if tok in t]
    return len(matched) >= max(1, len(tokens) - 1)

def find_listings(query: SearchQuery, filters: SearchFilters):
    """Returns (matching raw listings, when they were scraped as an ISO date string).
    Uses a saved result from the last 7 days when there is one, otherwise scrapes."""
    inputs = search_inputs(query, filters)
    search_key = market_cache.build_key(inputs)

    saved = market_cache.get_fresh(CACHE_TABLE, search_key, SCRAPER_VERSION)
    if saved is not None:
        unique_listings = saved["listings"]
        scraped_at = saved["scraped_at"]
    else:
        scraped_at = datetime.now(timezone.utc).isoformat()
        cheapest_listings, priciest_listings = scrape_low_and_high(query, filters)

        # Fallback to broader URL path if slug returns zero results.
        # Not for exact Carlist slugs: those are what the user picked, so a broader search would be wrong.
        if not cheapest_listings and not priciest_listings and query.variant and not query.variant_slug:
            broad_query = query.model_copy(update={"variant": None})
            cheapest_listings, priciest_listings = scrape_low_and_high(broad_query, filters)

        all_listings = (cheapest_listings or []) + (priciest_listings or [])
        unique_listings = list({item.get('url'): item for item in all_listings if item.get('url')}.values())

        # Only save real results: a failed or empty scrape should be retried by the next search.
        if unique_listings:
            market_cache.save(CACHE_TABLE, search_key, vehicle_key(inputs), SCRAPER_VERSION, inputs, unique_listings)
        elif cheapest_listings is None and priciest_listings is None:
            log_error("carlist", "scrape_failed", "Both price pages failed", inputs)

    filtered_listings = []
    for item in unique_listings:
        title = item.get("name", "")
        # Title matching is only needed when the variant was guessed from our database wording
        if query.variant and not query.variant_slug:
            if local_match(title, query.variant):
                filtered_listings.append(item)
        else:
            filtered_listings.append(item)

    prices = [
        int(item.get("offers", {}).get("price", 0)) 
        for item in filtered_listings 
        if item.get("offers", {}).get("price")
    ]
    if prices:
        print(f"Matched {len(filtered_listings)} listings. Price Range: RM {min(prices):,} -> RM {max(prices):,}")
    else:
        print(f"Matched {len(filtered_listings)} listings.")

    return filtered_listings, scraped_at

# Admin-only when called over HTTP; the valuation endpoint calls Search() directly in Python.
@carlistRouter.post('/search', dependencies=[Depends(require_admin)])
def Search(
    query: SearchQuery,
    filters: SearchFilters,
    whitelist_attributes: Optional[list[str]] = [
        "brand.name", "model", "itemCondition", "vehicleModelDate",
        "fuelType", "offers.price", "mileageFromOdometer.value",
        "vehicleTransmission", "image[0].url", "mainEntityOfPage"
    ]
):
    filtered_listings, _ = find_listings(query, filters)

    response_data = []
    if not whitelist_attributes: 
        response_data = filtered_listings
    else:
        for item in filtered_listings:
            filtered_item = {}
            for attribute in whitelist_attributes:
                keys = []
                for part in attribute.split('.'):
                    keys.extend(re.findall(r'([^\[\]]+)', part))
                value = item
                try:
                    for key in keys:
                        value = value[int(key)] if isinstance(value, list) and key.isdigit() else value[key]
                    filtered_item[attribute] = value
                except (KeyError, IndexError, TypeError):
                    filtered_item[attribute] = None
            response_data.append(filtered_item)

    return response_data

OPTIONS_TABLE = "carlist_filter_options"
# Carlist's filter lists change slowly, so each make/model is fetched at most once per this many days
OPTIONS_FRESH_DAYS = 30

def _model_path(make: str, model: str) -> str:
    group = VEHICLE_MAP.get(make, {}).get(model) if isinstance(VEHICLE_MAP.get(make), dict) else None
    return f"{make}/{group}/{model}" if group else f"{make}/{model}"

def _path_segment(href: str) -> str:
    """'https://www.carlist.my/used-cars-for-sale/honda/civic/1-5-e/malaysia' -> '1-5-e'"""
    parts = href.split("?")[0].rstrip("/").split("/")
    return parts[-2] if len(parts) >= 2 else ""

def _count(li) -> int:
    match = re.search(r"\(?(\d+)\)?\s*$", " ".join("".join(li.itertext()).split()))
    return int(match.group(1)) if match else 0

def parse_filter_options(tree) -> dict:
    """Reads Carlist's own filter menus (variant, body type, year, transmission) from a listing page."""
    def items(name):
        return tree.xpath(f'//ul[contains(@class,"smenu__select--{name}")]/li')

    variants = []
    for li in items("variant"):
        href = (li.xpath('.//a/@href') or [""])[0]
        count = "".join(li.xpath('.//span[contains(@class,"text--muted")]/text()')).strip()
        if li.get("data-value") and href:
            variants.append({"label": li.get("data-value"), "slug": _path_segment(href), "count": int(count) if count.isdigit() else 0})

    body_types = []
    for li in items("body-type"):
        href = (li.xpath('.//a/@href') or [""])[0]
        if li.get("data-value") and href:
            body_types.append({"label": li.get("data-value"), "slug": _path_segment(href)})

    years = [li.get("data-value") for li in items("year") if (li.get("data-value") or "").isdigit() and _count(li) > 0]

    transmissions = []
    for href in tree.xpath('//ul[contains(@class,"smenu__select--transmission")]/li//a/@href'):
        match = re.search(r"transmission=(\w+)", href)
        if match and match.group(1) not in transmissions:
            transmissions.append(match.group(1))

    return {"variants": variants, "body_types": body_types, "years": years, "transmissions": transmissions}

def get_filter_options(make: str, model: str) -> Optional[dict]:
    """Carlist's filter lists for a make/model: saved copy if newer than OPTIONS_FRESH_DAYS, otherwise fetched once and saved."""
    make, model = make.lower(), model.lower()
    cutoff = (datetime.now(timezone.utc) - timedelta(days=OPTIONS_FRESH_DAYS)).isoformat()
    try:
        res = supabase.table(OPTIONS_TABLE).select("options").eq("make", make).eq("model", model).gte("fetched_at", cutoff).limit(1).execute()
        if res.data:
            return res.data[0]["options"]
    except Exception as e:
        log_error("cache", "db_error", f"Reading {OPTIONS_TABLE}: {e}", {"make": make, "model": model})

    # "cars-for-sale" covers new, used and recon listings, so the lists include every variant
    url = f"https://www.carlist.my/cars-for-sale/{_model_path(make, model)}/malaysia"
    print(f"Fetching Carlist filter options: {url}")
    # The full model page is large (over 1 MB) and needs browser rendering, so allow extra time.
    # This only happens once per make/model every OPTIONS_FRESH_DAYS.
    tree = fetch_page(url, timeout=90)
    if tree is None:
        return None

    options = parse_filter_options(tree)
    if not options["variants"] and not options["body_types"] and not options["years"]:
        log_error("carlist", "no_filter_options", f"No filter lists found on {url}", {"make": make, "model": model})
        return options

    try:
        supabase.table(OPTIONS_TABLE).upsert(
            {"make": make, "model": model, "options": options, "fetched_at": datetime.now(timezone.utc).isoformat()},
            on_conflict="make,model",
        ).execute()
    except Exception as e:
        log_error("cache", "db_error", f"Saving {OPTIONS_TABLE}: {e}", {"make": make, "model": model})
    return options

@carlistRouter.get('/all_vehicles', dependencies=[Depends(require_admin)])
def vehicle_map(make: str = None):
    if not make:
        return VEHICLE_MAP
    if make.lower() not in VEHICLE_MAP:
        return JSONResponse(status_code=status.HTTP_404_NOT_FOUND, content={"meta": f"Unknown make: {make}"})
    return VEHICLE_MAP[make.lower()]