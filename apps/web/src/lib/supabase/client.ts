import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  const devBypass = process.env.NEXT_PUBLIC_VORTSPEC_DEV_BYPASS_AUTH === "true";

  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    devBypass
      ? process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY!
      : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
