import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
export const cloudConfigured = Boolean(url && key);

let client: SupabaseClient | undefined;

export function getSupabase() {
  if (url && key) client ??= createClient(url, key);
  return client;
}
