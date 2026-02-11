import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from '../config/env';

// Admin client (service_role) — bypasses RLS, used for server operations
export const supabaseAdmin: SupabaseClient = createClient(
  config.SUPABASE_URL,
  config.SUPABASE_SERVICE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// Create a user-scoped client from a JWT (for RPC calls that use auth.uid())
export function createUserClient(jwt: string): SupabaseClient {
  return createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
