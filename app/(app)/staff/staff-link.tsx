"use client";

import { useState, useSyncExternalStore, useTransition } from "react";
import { copyText } from "@/lib/dispatch";
import { changeStaffLink, type Result } from "./actions";

const noop = () => () => {};
const useOrigin = () => useSyncExternalStore(noop, () => window.location.origin, () => "");

/** Private read-only link for the staff member: her own pay and orders, no customer details or profit. */
export function StaffLink({
  token,
  staffName,
  onToast,
}: {
  /** undefined = DATABASE-UPDATE-14 not run, "" = switched off */
  token: string | undefined;
  staffName: string;
  onToast: (r: Result) => void;
}) {
  const origin = useOrigin();
  const [confirm, setConfirm] = useState<"new" | "off" | null>(null);
  const [pending, startTransition] = useTransition();

  if (token === undefined)
    return (
      <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
        Run <b>DATABASE-UPDATE-14.sql</b> in Supabase to get a private link {staffName} can open to see her own orders and pay.
      </p>
    );

  const url = `${origin}/s/${token}`;
  const message = `Hi ${staffName}, you can see your orders and pay here (updates by itself):\n${url}`;

  function change(mode: "new" | "off") {
    startTransition(async () => {
      const r = await changeStaffLink(mode);
      setConfirm(null);
      onToast(r);
      if (r.ok && r.token) await copyText(`${origin}/s/${r.token}`);
    });
  }

  const btn = "rounded-lg px-3 py-1.5 text-sm font-medium ring-1 disabled:opacity-40";

  return (
    <section className="rounded-2xl bg-white p-4 ring-1 ring-stone-200">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="grid size-10 shrink-0 place-items-center rounded-full bg-sky-50 text-lg ring-1 ring-sky-200" aria-hidden>
          🔗
        </div>
        <div className="min-w-0 flex-1 text-sm">
          <div className="font-medium text-stone-900">{token ? `${staffName}'s link` : `${staffName}'s link is switched off`}</div>
          <div className="text-xs text-stone-500">
            {token
              ? "She sees only her own orders per product, pay, bonus and paid / not paid. No customer details, prices or profit. No login needed."
              : "Make a link to let her see her own orders and pay on her phone."}
          </div>
        </div>
        {!token && (
          <button disabled={pending} onClick={() => change("new")} className={`${btn} bg-emerald-700 text-white ring-emerald-700 hover:bg-emerald-800`}>
            {pending ? "Making…" : "Make link"}
          </button>
        )}
      </div>

      {token && (
        <>
          <div className="mt-3 truncate rounded-lg bg-stone-50 px-3 py-2 font-mono text-xs text-stone-600 ring-1 ring-stone-200">{url || "…"}</div>
          {confirm ? (
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 ring-1 ring-amber-200">
              <span className="mr-auto text-sm text-amber-900">
                {confirm === "new" ? "The old link will stop working. Make a new one?" : "The link will stop working. Switch it off?"}
              </span>
              <button onClick={() => setConfirm(null)} className={`${btn} bg-white text-stone-700 ring-stone-300`}>
                Cancel
              </button>
              <button disabled={pending} onClick={() => change(confirm)} className={`${btn} bg-amber-600 text-white ring-amber-600 hover:bg-amber-700`}>
                {pending ? "Saving…" : confirm === "new" ? "Make new link" : "Switch off"}
              </button>
            </div>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={async () => onToast((await copyText(url)) ? { ok: true, message: "Link copied" } : { ok: false, message: "Couldn't copy" })}
                className={`${btn} bg-stone-900 text-white ring-stone-900 hover:bg-stone-800`}
              >
                Copy link
              </button>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(message)}`}
                target="_blank"
                rel="noopener noreferrer"
                className={`${btn} bg-emerald-600 text-white ring-emerald-600 hover:bg-emerald-700`}
              >
                Send on WhatsApp
              </a>
              <a href={url} target="_blank" rel="noopener noreferrer" className={`${btn} text-stone-700 ring-stone-300 hover:bg-stone-50`}>
                See what she sees
              </a>
              <span className="flex-1" />
              <button onClick={() => setConfirm("new")} className={`${btn} text-stone-600 ring-stone-200 hover:bg-stone-50`}>
                New link
              </button>
              <button onClick={() => setConfirm("off")} className={`${btn} text-red-600 ring-red-200 hover:bg-red-50`}>
                Switch off
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
