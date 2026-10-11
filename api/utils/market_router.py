from typing import Literal

from fastapi import APIRouter, Depends, HTTPException

from api.utils.auth import get_current_user
from api.utils.carlist.carlist_router import VEHICLE_MAP as CARLIST_CARS, get_filter_options
from api.utils.mudah.mudah_router import VEHICLE_MAP as MUDAH_CARS, MOTORCYCLE_MAP as MUDAH_MOTORCYCLES

# Neutral make/model lists for the dropdowns, merged from all sources without naming them
marketRouter = APIRouter(prefix="/market")

# Keys inside the maps that are ids rather than models
ID_KEYS = ("__id__", "@id")


def _maps(vehicle_type: str):
    return [MUDAH_MOTORCYCLES] if vehicle_type == "motorcycle" else [MUDAH_CARS, CARLIST_CARS]


@marketRouter.get("/makes")
def makes(type: Literal["car", "motorcycle"] = "car"):
    return {"makes": sorted({make for m in _maps(type) for make in m})}


@marketRouter.get("/models")
def models(make: str, type: Literal["car", "motorcycle"] = "car"):
    found = set()
    for m in _maps(type):
        entry = m.get(make.lower())
        if isinstance(entry, dict):
            found.update(k for k in entry if k not in ID_KEYS)
    return {"models": sorted(found)}


# --- Current Market Valuation page: dropdowns use the market source's own lists ---

@marketRouter.get("/options/makes")
def market_makes():
    return {"makes": sorted(CARLIST_CARS)}


@marketRouter.get("/options/models")
def market_models(make: str):
    """Returns [{value, label}]. For makes with model groups (BMW, Mercedes-Benz) the group names are
    left out and each model is labelled with its group, e.g. '1 SERIES 118I', because variants only
    exist at model level."""
    entry = CARLIST_CARS.get(make.lower())
    if not isinstance(entry, dict):
        return {"models": []}
    groups = {g for g in entry.values() if g}
    options = []
    for model, group in entry.items():
        if group is None and model in groups:
            continue  # a group heading; its models are listed instead
        name = model.replace("-", " ")
        label = f"{group.replace('-', ' ')} {name}" if group and group != "no-group" else name
        options.append({"value": model, "label": label.upper()})
    return {"models": sorted(options, key=lambda o: o["label"])}


# Login required: a first lookup for a make/model costs a scraping request
@marketRouter.get("/options/filters")
def market_filters(make: str, model: str, user=Depends(get_current_user)):
    if not isinstance(CARLIST_CARS.get(make.lower()), dict) or model.lower() not in CARLIST_CARS[make.lower()]:
        raise HTTPException(status_code=404, detail="Unknown make or model.")
    options = get_filter_options(make, model)
    if options is None:
        raise HTTPException(status_code=503, detail="Could not load the options right now. Please try again.")
    return options
