import "server-only";
import { connection } from "next/server";
import { todayIST } from "./validation";

/** Today's date (India time) for a page. Marks the page as per-request first, so Next.js never freezes the date at build time. */
export async function requestToday() {
  await connection();
  return todayIST();
}
