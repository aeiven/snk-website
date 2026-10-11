import os
import re
from typing import Optional, Any, Dict, List
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
from api.utils.auth import get_current_user, use_token, get_tokens

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
    vehicle_type: str = "car"
    mudah: Optional[Dict] = None
    carlist: Optional[Dict] = None
    insurable: Optional[Dict] = None

@valuationRouter.post("/get_marketdata", summary="Unified market data endpoint. Costs 1 token per call.")
def get_marketdata(request: MarketDataRequest, user=Depends(get_current_user)):
    tokens_after = use_token(user)
    results, errors = {}, {}

    if request.carlist and search_carlist:
        try:
            params = request.carlist
            results["carlist"] = search_carlist(query=CarlistSearchQuery(**params.get("query", {})), filters=CarlistSearchFilters(**params.get("filters", {})), whitelist_attributes=params.get("whitelist_attributes"))
        except Exception as e:
            log_error("carlist", "search_error", str(e), request.carlist)
            errors["carlist"] = str(e)
            results["carlist"] = []

    if request.mudah and search_mudah:
        try:
            params = request.mudah
            query_model = MudahMotorQuery if request.vehicle_type == "motorcycle" else MudahCarQuery
            mudah_listings = search_mudah(searchQuery=query_model(**params.get("searchQuery", {})), whitelist_attributes=params.get("whitelist_attributes"))
            # search() returns an error response instead of a list when Mudah fails
            results["mudah"] = mudah_listings if isinstance(mudah_listings, list) else []
        except Exception as e:
            log_error("mudah", "search_error", str(e), request.mudah)
            errors["mudah"] = str(e)
            results["mudah"] = []

    if request.insurable and request.insurable.get("vehicle_detail"):
        try:
            vd = request.insurable["vehicle_detail"]
            
            query = supabase.table('vehicles').select('id')
            
            # Use ilike for case-insensitive robust matching against the DB strings
            query = query.ilike('make', str(vd.get('make', '')).strip())
            
            candidates = normalize_db_model(vd.get('make', ''), vd.get('model', ''))
            query = query.in_('model', candidates)
            
            if vd.get('year'): query = query.eq('year', str(vd.get('year')))
            if vd.get('variant'): query = query.ilike('variant', str(vd.get('variant')).strip())
            
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
            log_error("insurable", "db_error", str(e), request.insurable)
            errors["insurable"] = str(e)

    return {"results": results, "errors": errors if errors else None, "tokens_remaining": tokens_after}


@valuationRouter.get('/tokens', summary="Get the current user's token count (applies the weekly refill if due).")
def tokens(user=Depends(get_current_user)):
    return get_tokens(user)