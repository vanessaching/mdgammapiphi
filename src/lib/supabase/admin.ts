import "server-only";
import { createClient } from "@supabase/supabase-js";
import { publicEnv, serverEnv } from "@/lib/env";

/**
 * Service-role client. BYPASSES RLS — only use after the caller's permission
 * has been verified (e.g. an RPC that checks exec status succeeded), and never
 * import it from client components (`server-only` enforces this at build time).
 */
export function createAdminClient() {
  return createClient(publicEnv.supabaseUrl, serverEnv().serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
