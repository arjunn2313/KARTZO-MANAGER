import { buildBackup } from "@/lib/backup";
import { createClient } from "@/lib/supabase/server";
import { todayIST } from "@/lib/validation";

/** GET /backup?m=2026-10 → Excel file with that month's summary, calculations and every record. */
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Please log in", { status: 401 });

  const today = todayIST();
  const m = new URL(request.url).searchParams.get("m") ?? today.slice(0, 7);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(m) || m > today.slice(0, 7)) return new Response("Pick a valid month", { status: 400 });

  try {
    const { buffer } = await buildBackup(supabase, m, today);
    return new Response(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="kartzo-backup-${m}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return new Response(`Backup failed: ${e instanceof Error ? e.message : "unknown error"}`, { status: 500 });
  }
}
