import os
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv(".env.local")

# Server-side client. The service role key bypasses Row Level Security,
# which is what lets the API use the private cache and log tables.
supabase: Client = create_client(
    os.environ.get("SUPABASE_URL"),
    os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_KEY"),
)
