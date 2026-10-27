import "server-only";
import { createClient } from "@/lib/supabase/server";

/** Returns a Supabase client for a logged-in user, or throws. Use at the top of every Server Action. */
export async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not logged in");
  return supabase;
}
