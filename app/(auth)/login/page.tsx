"use client";

import { useActionState, useState } from "react";
import { login, type LoginState } from "./actions";

const initial: LoginState = { error: null };

export default function LoginPage() {
  const [state, action, pending] = useActionState(login, initial);
  const [show, setShow] = useState(false);

  return (
    <main className="min-h-screen bg-[#0f3b2c] lg:grid lg:grid-cols-[1.1fr_1fr]">
      {/* Parcel side */}
      <section className="relative flex items-center justify-center overflow-hidden px-6 pb-16 pt-10 lg:py-16">
        {/* faint postal grid */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage: "linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)",
            backgroundSize: "32px 32px",
          }}
        />
        <ParcelLabel />
      </section>

      {/* Form side */}
      <section className="relative -mt-8 flex items-start justify-center rounded-t-3xl bg-stone-100 px-5 pb-12 pt-8 lg:mt-0 lg:items-center lg:rounded-none lg:px-12">
        <form action={action} className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-lg bg-emerald-600 text-base font-bold text-white">K</span>
            <span className="text-lg font-semibold tracking-tight text-stone-900">
              Kartzo <span className="font-normal text-stone-500">Manager</span>
            </span>
          </div>

          <h1 className="text-[28px] font-semibold leading-tight tracking-tight text-stone-900">Sign in</h1>
          <p className="mt-1.5 text-[15px] text-stone-500">Orders, dispatch and profit for your shop.</p>

          <label className="mt-8 block text-sm font-medium text-stone-700">
            Email
            <input
              name="email"
              type="email"
              autoComplete="email"
              inputMode="email"
              required
              className="mt-1.5 w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-base text-stone-900 outline-none transition focus:border-emerald-600 focus:ring-4 focus:ring-emerald-600/15"
            />
          </label>

          <label className="mt-4 block text-sm font-medium text-stone-700">
            Password
            <div className="relative mt-1.5">
              <input
                name="password"
                type={show ? "text" : "password"}
                autoComplete="current-password"
                required
                className="w-full rounded-xl border border-stone-300 bg-white py-3 pl-4 pr-16 text-base text-stone-900 outline-none transition focus:border-emerald-600 focus:ring-4 focus:ring-emerald-600/15"
              />
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                className="absolute inset-y-0 right-0 rounded-r-xl px-4 text-sm font-medium text-stone-500 hover:text-stone-800 focus-visible:outline-2 focus-visible:outline-emerald-600"
                aria-label={show ? "Hide password" : "Show password"}
              >
                {show ? "Hide" : "Show"}
              </button>
            </div>
          </label>

          {state.error && (
            <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
              {state.error}
            </p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-3.5 text-base font-semibold text-white shadow-sm transition hover:bg-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:opacity-70"
          >
            {pending && <span className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white motion-reduce:hidden" aria-hidden />}
            {pending ? "Signing in…" : "Sign in"}
          </button>

          <p className="mt-6 text-center text-xs text-stone-400">Forgot your password? Reset it in your Supabase dashboard under Authentication.</p>
        </form>
      </section>
    </main>
  );
}

/** A Kartzo parcel label, like the ones printed from Dispatch. */
function ParcelLabel() {
  return (
    <div className="relative w-full max-w-[420px] motion-safe:animate-[label-in_700ms_cubic-bezier(.2,.8,.2,1)_both]">
      <style>{`
        @keyframes label-in { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>

      {/* parcel tape behind */}
      <div aria-hidden className="absolute -left-10 -right-10 top-1/2 h-14 -translate-y-1/2 rotate-[8deg] bg-[#c9a46a]/25" />

      <div
        className="relative rotate-[-2.5deg] rounded-[6px] bg-[#f4ead6] p-5 text-stone-900 shadow-[0_30px_60px_-20px_rgba(0,0,0,0.55)] sm:p-6"
        style={{ fontFamily: "Arial, Helvetica, sans-serif" }}
      >
        <div className="flex items-stretch gap-3">
          <div className="flex flex-1 flex-col justify-center rounded-[3px] bg-stone-900 px-4 py-2.5 text-[#f4ead6]">
            <span className="text-[11px] font-bold tracking-[0.18em]">KARTZO</span>
            <span className="text-2xl font-extrabold leading-tight sm:text-[28px]">Manager</span>
          </div>
          <div className="flex w-[34%] flex-col items-center justify-center rounded-[3px] border-2 border-stone-900 text-center">
            <span className="text-[13px] font-bold">KZT</span>
            <span className="text-[11px] text-stone-600">every order</span>
          </div>
        </div>

        <div className="mt-5 text-[11px] font-bold tracking-[0.14em] text-stone-500">TO</div>
        <div className="text-xl font-extrabold leading-tight sm:text-2xl">YOUR CUSTOMERS</div>
        <div className="mt-1 text-[15px] leading-snug text-stone-700">
          Across Kerala and the rest of India
          <br />
          by India Post, DTDC and Delhivery
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <span className="rounded-[3px] border-[2.5px] border-stone-900 px-3 py-0.5 text-xl font-extrabold tracking-[0.16em]">PIN 682024</span>
          <span className="text-sm font-bold">Edappally</span>
        </div>

        {/* barcode */}
        <div aria-hidden className="mt-5 hidden h-10 items-stretch gap-[2px] sm:flex">
          {BARS.map((w, i) => (
            <span key={i} className="bg-stone-900" style={{ width: w }} />
          ))}
        </div>

        <div className="mt-4 border-t-2 border-stone-900 pt-2 pr-20 text-[13px] leading-snug text-stone-700">
          <b className="text-stone-900">Contents:</b> orders, labels, tracking messages, stock, ad spend and profit
        </div>

        {/* stamp */}
        <div
          aria-hidden
          className="absolute -bottom-7 right-3 grid size-[78px] rotate-[14deg] sm:-right-5 sm:size-[86px] place-items-center rounded-full border-[3px] border-emerald-700 text-center text-[10px] font-extrabold leading-tight tracking-wider text-emerald-700 opacity-90 sm:-right-5"
          style={{ background: "rgba(244,234,214,0.85)" }}
        >
          <span>
            PACKED
            <br />
            WITH
            <br />
            CARE
          </span>
        </div>
      </div>
    </div>
  );
}

const BARS = [3, 1, 2, 1, 3, 2, 1, 1, 3, 1, 2, 3, 1, 2, 1, 1, 3, 2, 1, 3, 1, 2, 2, 1, 3, 1, 1, 2, 3, 1, 2, 1, 3, 2, 1, 1, 2, 3, 1, 2, 1, 3, 1, 2, 2, 1, 3, 1].map(
  (n) => `${n * 2}px`,
);
