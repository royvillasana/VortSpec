import { createClient } from "@supabase/supabase-js";

/**
 * Server-side Supabase client.
 * In dev bypass mode, uses service-role key (skips RLS).
 * In production, uses the anon key with user's session.
 */
export async function createServerSupabaseClient() {
  const devBypass = process.env.VORTSPEC_DEV_BYPASS_AUTH === "true";

  if (devBypass && process.env.NODE_ENV === "production") {
    throw new Error(
      "VORTSPEC_DEV_BYPASS_AUTH must not be enabled in production. " +
        "Remove it from your environment before deploying.",
    );
  }

  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = devBypass
    ? process.env.SUPABASE_SERVICE_ROLE_KEY!
    : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  return createClient(url, key);
}
