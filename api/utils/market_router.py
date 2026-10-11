from typing import Literal

from fastapi import APIRouter

from api.utils.carlist.carlist_router import VEHICLE_MAP as CARLIST_CARS
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
