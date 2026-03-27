import { createClient } from "@/lib/supabase/server";

/** Read a single setting value by key. Returns null if not found. */
export async function getSetting(key: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", key)
    .single();
  return data?.value ?? null;
}

/** Write (upsert) a setting value. */
export async function setSetting(key: string, value: string): Promise<void> {
  const supabase = await createClient();
  await supabase.from("app_settings").upsert({
    key,
    value,
    updated_at: new Date().toISOString(),
  });
}

export async function deleteSetting(key: string): Promise<void> {
  const supabase = await createClient();
  await supabase.from("app_settings").delete().eq("key", key);
}
