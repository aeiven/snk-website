from datetime import datetime, timedelta, timezone

from fastapi import Depends, Header, HTTPException

from api.utils.db import supabase

ADMIN_ROLES = ("admin", "master_admin")
DEFAULT_TOKENS_PER_WEEK = 3
REFILL_DAYS = 7


def get_current_user(authorization: str = Header(None)):
    """Checks the Supabase login token sent by the frontend ('Authorization: Bearer <token>')."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Please log in again.")
    try:
        res = supabase.auth.get_user(authorization.split("Bearer ", 1)[1])
    except Exception:
        raise HTTPException(status_code=401, detail="Please log in again.")
    if not res or not res.user:
        raise HTTPException(status_code=401, detail="Please log in again.")
    return res.user


def is_admin(user) -> bool:
    # app_metadata can only be changed by the server, unlike user_metadata
    return (user.app_metadata or {}).get("role") in ADMIN_ROLES


def require_admin(user=Depends(get_current_user)):
    if not is_admin(user):
        raise HTTPException(status_code=403, detail="Admins only.")
    return user


def _current_tokens(meta: dict):
    """Returns (tokens, last_refill_at, refilled). Tops tokens up to tokens_per_week every REFILL_DAYS days."""
    tokens = int(meta.get("tokens_remaining") or 0)
    per_week = int(meta.get("tokens_per_week") or DEFAULT_TOKENS_PER_WEEK)
    last_refill = meta.get("last_refill_at")
    now = datetime.now(timezone.utc)
    try:
        last_dt = datetime.fromisoformat(str(last_refill).replace("Z", "+00:00"))
    except ValueError:
        last_dt = None
    if last_dt is None or now - last_dt >= timedelta(days=REFILL_DAYS):
        # max() so a manual top-up above the weekly amount is not taken away
        return max(tokens, per_week), now.isoformat(), True
    return tokens, last_refill, False


def get_tokens(user) -> dict:
    """Current token count, applying the weekly refill if it is due."""
    meta = user.app_metadata or {}
    tokens, last_refill, refilled = _current_tokens(meta)
    if refilled:
        supabase.auth.admin.update_user_by_id(user.id, {"app_metadata": {"tokens_remaining": tokens, "last_refill_at": last_refill}})
    return {"tokens_remaining": tokens, "tokens_per_week": int(meta.get("tokens_per_week") or DEFAULT_TOKENS_PER_WEEK)}


def use_token(user) -> int:
    """Deducts 1 token (after any due refill) and returns how many are left."""
    tokens, last_refill, _ = _current_tokens(user.app_metadata or {})
    if tokens <= 0:
        raise HTTPException(status_code=403, detail="No valuation tokens remaining. Tokens refresh weekly.")
    try:
        supabase.auth.admin.update_user_by_id(user.id, {"app_metadata": {"tokens_remaining": tokens - 1, "last_refill_at": last_refill}})
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update token count: {e}")
    return tokens - 1
