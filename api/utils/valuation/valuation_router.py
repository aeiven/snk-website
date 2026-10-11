import os
import re
from typing import Optional, Any, Dict, List, Literal
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv(".env.local")

supabase_url: str = os.environ.get("SUPABASE_URL")
supabase_key: str = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_KEY")
supabase: Client = create_client(supabase_url, supabase_key)

valuationRouter = APIRouter(prefix="/valuation", tags=["valuation"])

try:
    from api.utils.carlist.carlist_router import SearchQuery as CarlistSearchQuery, SearchFilters as CarlistSearchFilters, Search as search_carlist
except ImportError:
    try:
        from utils.carlist.carlist_router import SearchQuery as CarlistSearchQuery, SearchFilters as CarlistSearchFilters, Search as search_carlist
    except ImportError:
        search_carlist = None

try:
    from api.utils.mudah.mudah_router import search as search_mudah, CarSearchQuery as MudahCarQuery, MotorSearchQuery as MudahMotorQuery
except ImportError:
    try:
        from utils.mudah.mudah_router import search as search_mudah, CarSearchQuery as MudahCarQuery, MotorSearchQuery as MudahMotorQuery
    except ImportError:
        search_mudah = None

from api.utils.error_log import log_error
from api.utils.auth import get_current_user, use_token, get_tokens, is_admin
from api.utils.listings import (
    VehicleDetails, mudah_car_query, mudah_motorcycle_query, carlist_query,
    filter_mudah_by_variant, from_mudah, from_carlist, for_viewer,
)

def normalize_db_model(make: str, model: str) -> List[str]:
    make_clean = make.strip().upper()
    model_clean = model.strip().upper()
    candidates = [model_clean]
    if make_clean in ("BMW", "MERCEDES-BENZ", "MERCEDES"):
        stripped = model_clean.replace("SERIES", "").replace("CLASS", "").replace("-", " ").strip()
        if stripped and stripped not in candidates: candidates.append(stripped)
    no_spaces = model_clean.replace(" ", "").replace("-", "")
    if no_spaces not in candidates: candidates.append(no_spaces)
    return candidates

@valuationRouter.get('/options/variants')
def get_variants(make: str, model: str):
    try:
        candidates = normalize_db_model(make, model)
        res = supabase.table("vehicles").select("variant").ilike("make", make.replace("-", " ").strip()).in_("model", candidates).execute()
        variant_map = {}
        for row in res.data:
            v = row.get("variant")
            if v and str(v).strip():
                clean_v = re.sub(r'\s+', ' ', str(v)).strip()
                variant_map[clean_v.upper()] = clean_v
        return {"variants": sorted(list(variant_map.values()))}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@valuationRouter.get('/options/body-types')
def get_body_types(make: str, model: str, variant: str):
    try:
        candidates = normalize_db_model(make, model)
        res = supabase.table("vehicles").select("style").ilike("make", make.replace("-", " ").strip()).in_("model", candidates).ilike("variant", f"%{variant.strip()}%").execute()
        body_types = sorted(list({str(row["style"]).strip().upper() for row in res.data if row.get("style")}))
        return {"body_types": body_types}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@valuationRouter.get('/options/years')
def get_years(make: str, model: str, variant: str, style: str):
    try:
        candidates = normalize_db_model(make, model)
        res = supabase.table("vehicles").select("year").ilike("make", make.replace("-", " ").strip()).in_("model", candidates).ilike("variant", f"%{variant.strip()}%").ilike("style", style.strip()).execute()
        years = sorted(list({int(row["year"]) for row in res.data if row.get("year")}), reverse=True)
        return {"years": years}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@valuationRouter.get('/options/variant-specs')
def get_variant_specs(make: str, model: str, variant: str, style: str, year: int):
    try:
        candidates = normalize_db_model(make, model)
        res = supabase.table("vehicles").select("cc, transmission, specs, import_status").ilike("make", make.replace("-", " ").strip()).in_("model", candidates).ilike("variant", f"%{variant.strip()}%").ilike("style", style.strip()).eq("year", str(year)).execute()

        engine_ccs, engine_watts, transmissions, fuel_types = set(), set(), set(), set()
        translated_statuses = set()
        for row in res.data:
            if row.get("cc"): engine_ccs.add(str(row["cc"]).strip())
            if row.get("transmission"): transmissions.add(str(row["transmission"]).strip())
            
            specs = row.get("specs") or {}
            if isinstance(specs, dict):
                fuel = specs.get("fuel_type") or specs.get("fuel")
                if fuel: fuel_types.add(str(fuel).strip().upper())
                watt = specs.get("engine_power_watt") or specs.get("power_watt") or specs.get("watt")
                if watt: engine_watts.add(str(watt).strip())

            st = row.get("import_status")
            if st:
                clean_st = str(st).strip().upper()
                if clean_st == "CBU": translated_statuses.add("Imported New")
                elif clean_st == "CKD": translated_statuses.add("Local Assembled")
                elif clean_st in ("RECOND", "RCN"): translated_statuses.add("Imported Recond")

        return {
            "engine_ccs": sorted(list(engine_ccs)), 
            "engine_watts": sorted(list(engine_watts)), 
            "transmissions": sorted(list(transmissions)), 
            "fuel_types": sorted(list(fuel_types)),
            "import_statuses": sorted(list(translated_statuses))
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class MarketDataRequest(BaseModel):
    vehicle_type: Literal["car", "motorcycle"] = "car"
    vehicle: VehicleDetails

@valuationRouter.post("/get_marketdata", summary="Unified market data endpoint. Costs 1 token per call.")
def get_marketdata(request: MarketDataRequest, user=Depends(get_current_user)):
    tokens_after = use_token(user)
    v = request.vehicle
    is_motorcycle = request.vehicle_type == "motorcycle"
    listings, results, errors = [], {}, {}

    # The source searches are built here rather than in the browser, so requests never name the sources
    if search_mudah:
        try:
            query = MudahMotorQuery(**mudah_motorcycle_query(v)) if is_motorcycle else MudahCarQuery(**mudah_car_query(v))
            mudah_listings = search_mudah(searchQuery=query, whitelist_attributes=None)
            # search() returns an error response instead of a list when Mudah fails
            if isinstance(mudah_listings, list):
                if not is_motorcycle:
                    mudah_listings = filter_mudah_by_variant(mudah_listings, v.variant)
                listings += [from_mudah(item) for item in mudah_listings]
        except Exception as e:
            log_error("mudah", "search_error", str(e), v.model_dump())
            errors["mudah"] = str(e)

    if search_carlist and not is_motorcycle:
        try:
            query, filters = carlist_query(v)
            carlist_listings = search_carlist(query=CarlistSearchQuery(**query), filters=CarlistSearchFilters(**filters), whitelist_attributes=None)
            listings += [from_carlist(item) for item in carlist_listings]
        except Exception as e:
            log_error("carlist", "search_error", str(e), v.model_dump())
            errors["carlist"] = str(e)

    results["listings"] = for_viewer(listings, is_admin(user))

    if not is_motorcycle and v.year:
        try:
            query = supabase.table('vehicles').select('id')

            # Use ilike for case-insensitive robust matching against the DB strings
            db_make = v.make.replace('-', ' ').strip()
            query = query.ilike('make', db_make)

            candidates = normalize_db_model(db_make, v.model.replace('-', ' '))
            query = query.in_('model', candidates)

            query = query.eq('year', str(v.year))
            if v.variant: query = query.ilike('variant', v.variant.strip())

            res = query.execute()

            if res.data:
                vehicle_ids = [v['id'] for v in res.data]
                val_res = supabase.table('vehicle_values').select('value').in_('vehicle_id', vehicle_ids).execute()

                if val_res.data:
                    values = [float(v['value']) for v in val_res.data if v.get('value') is not None]
                    if values:
                        results["insurable"] = {
                            "lowest": int(min(values)),
                            "average": int(sum(values) / len(values)),
                            "highest": int(max(values))
                        }
                    else:
                        results["insurable"] = {"meta": "No valid values found"}
                else:
                    results["insurable"] = {"meta": "No vehicle values found"}
            else:
                results["insurable"] = {"meta": "No vehicle found"}
        except Exception as e:
            log_error("insurable", "db_error", str(e), v.model_dump())
            errors["insurable"] = str(e)

    # Error messages can contain source URLs, so only admins see them (everything is in error_logs)
    return {"results": results, "errors": (errors or None) if is_admin(user) else None, "tokens_remaining": tokens_after}


@valuationRouter.get('/tokens', summary="Get the current user's token count (applies the weekly refill if due).")
def tokens(user=Depends(get_current_user)):
    return get_tokens(user)