"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

type IconName =
  | "dashboard"
  | "orders"
  | "plus"
  | "truck"
  | "box"
  | "stock"
  | "staff"
  | "expenses"
  | "ads"
  | "chart"
  | "cod"
  | "settings"
  | "menu"
  | "close"
  | "logout";

const PATHS: Record<IconName, string> = {
  dashboard: "M4 13h6V4H4v9Zm0 7h6v-5H4v5Zm10 0h6v-9h-6v9Zm0-16v5h6V4h-6Z",
  orders: "M6 3h12l1 4H5l1-4Zm-1 6h14v11a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V9Zm4 3v2h6v-2H9Z",
  plus: "M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5Z",
  truck: "M2 5h12v10H2V5Zm12 3h4.5L22 11.5V15h-8V8ZM6 19.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm12 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z",
  box: "M12 3 3 7.5v9L12 21l9-4.5v-9L12 3Zm0 2.2 6.3 3.1L12 11.5 5.7 8.3 12 5.2ZM5 10l6 3v5.7l-6-3V10Zm8 8.7V13l6-3v5.7l-6 3Z",
  stock: "M3 20V10l4-3v13H3Zm6 0V4l4 3v13H9Zm6 0V9l4-3v14h-4Z",
  staff: "M9 11a4 4 0 1 1 0-8 4 4 0 0 1 0 8Zm-7 9c0-3.3 3.1-6 7-6s7 2.7 7 6H2Zm15.5-9a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM18 13c2.6.3 4 2.4 4 5h-4c0-1.9-.7-3.7-2-5h2Z",
  expenses: "M3 6h18v12H3V6Zm2 2v8h14V8H5Zm7 1.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5Z",
  chart: "M3 3h2v16h16v2H3V3Zm4 10h3v5H7v-5Zm5-6h3v11h-3V7Zm5 3h3v8h-3v-8Z",
  ads: "M3 10v4h3l5 4V6l-5 4H3Zm13.5 2a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4ZM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6Z",
  cod: "M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18Zm-1 4v1.1c-1.5.3-2.5 1.3-2.5 2.6 0 1.6 1.3 2.2 3 2.6 1.3.3 1.7.6 1.7 1.1 0 .5-.6.9-1.5.9-1 0-1.7-.4-2-1.1l-1.6.8c.5 1 1.5 1.7 2.9 1.9V18h2v-1.2c1.5-.3 2.4-1.3 2.4-2.6 0-1.7-1.4-2.3-3.1-2.7-1.2-.3-1.6-.5-1.6-1 0-.4.5-.8 1.3-.8.8 0 1.4.3 1.7.9l1.6-.8c-.4-.9-1.3-1.5-2.3-1.7V7h-2Z",
  settings: "m12 2 2 2.3 3-.4.6 3 2.6 1.5-1.2 2.8 1.2 2.8-2.6 1.5-.6 3-3-.4L12 22l-2-2.3-3 .4-.6-3-2.6-1.5L5 12.8 3.8 10l2.6-1.5.6-3 3 .4L12 2Zm0 6.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z",
  menu: "M3 6h18v2H3V6Zm0 5h18v2H3v-2Zm0 5h18v2H3v-2Z",
  close: "m6.4 5 5.6 5.6L17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4-5.6-5.6L6.4 19 5 17.6 10.6 12 5 6.4 6.4 5Z",
  logout: "M10 3h9v18h-9v-2h7V5h-7V3Zm1.6 5 1.4 1.4-1.6 1.6H3v2h8.4l-1.6 1.6L11.2 16l4-4-3.6-4Z",
};

export function Icon({ name, className = "size-5" }: { name: IconName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d={PATHS[name]} />
    </svg>
  );
}

type NavItem = { href: string; label: string; icon: IconName; soon?: boolean };

const GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: "Overview",
    items: [
      { href: "/", label: "Dashboard", icon: "dashboard" },
      { href: "/reports/products", label: "Product report", icon: "chart" },
    ],
  },
  {
    title: "Sales",
    items: [
      { href: "/orders", label: "Orders", icon: "orders" },
      { href: "/orders/new", label: "Add order", icon: "plus" },
      { href: "/dispatch", label: "Dispatch", icon: "truck" },
      { href: "/cod", label: "COD remittance", icon: "cod" },
    ],
  },
  {
    title: "Inventory",
    items: [
      { href: "/products", label: "Products", icon: "box" },
      { href: "/stock", label: "Stock", icon: "stock" },
    ],
  },
  {
    title: "Money",
    items: [
      { href: "/ads", label: "Ad wallet", icon: "ads" },
      { href: "/expenses", label: "Expenses", icon: "expenses" },
      { href: "/staff", label: "Staff payouts", icon: "staff" },
    ],
  },
  {
    title: "System",
    items: [{ href: "/settings", label: "Settings", icon: "settings" }],
  },
];

const TABS: { href?: string; label: string; icon: IconName; big?: boolean }[] = [
  { href: "/", label: "Home", icon: "dashboard" },
  { href: "/orders", label: "Orders", icon: "orders" },
  { href: "/orders/new", label: "Add", icon: "plus", big: true },
  { href: "/dispatch", label: "Dispatch", icon: "truck" },
  { label: "More", icon: "menu" },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  if (href === "/orders") return pathname === "/orders" || /^\/orders\/(?!new)/.test(pathname);
  return pathname === href || pathname.startsWith(href + "/");
}

export function Sidebar({ logoutAction }: { logoutAction: () => Promise<void> }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const nav = (
    <nav className="flex h-full flex-col">
      <div className="flex items-center justify-between px-5 py-5">
        <Link href="/" onClick={() => setOpen(false)} className="flex items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-lg bg-emerald-500 text-sm font-bold text-emerald-950">
            K
          </span>
          <span className="font-semibold tracking-tight text-white">
            Kartzo <span className="font-normal text-stone-400">Manager</span>
          </span>
        </Link>
        <button
          onClick={() => setOpen(false)}
          className="rounded-md p-1 text-stone-400 hover:bg-white/10 lg:hidden"
          aria-label="Close menu"
        >
          <Icon name="close" />
        </button>
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto px-3 pb-4">
        {GROUPS.map((g) => (
          <div key={g.title}>
            <div className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-stone-500">
              {g.title}
            </div>
            <ul className="space-y-0.5">
              {g.items.map((item) => {
                const active = isActive(pathname, item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                        active
                          ? "bg-emerald-500/15 font-medium text-emerald-300"
                          : "text-stone-300 hover:bg-white/5 hover:text-white"
                      }`}
                    >
                      <Icon name={item.icon} className={`size-[18px] ${active ? "text-emerald-400" : "text-stone-500"}`} />
                      <span className="flex-1">{item.label}</span>
                      {item.soon && (
                        <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-stone-500">Soon</span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      <form action={logoutAction} className="border-t border-white/10 p-3">
        <button className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-stone-400 hover:bg-white/5 hover:text-white">
          <Icon name="logout" className="size-[18px]" />
          Log out
        </button>
      </form>
    </nav>
  );

  return (
    <>
      {/* Mobile top bar */}
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-stone-200 bg-white px-4 py-3 lg:hidden">
        <button onClick={() => setOpen(true)} className="rounded-md p-1 text-stone-700 hover:bg-stone-100" aria-label="Open menu">
          <Icon name="menu" />
        </button>
        <span className="font-semibold tracking-tight">
          Kartzo <span className="font-normal text-stone-500">Manager</span>
        </span>
      </header>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-30 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 bg-stone-900">{nav}</aside>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-10 hidden w-64 bg-stone-900 lg:block">{nav}</aside>

      {/* Phone bottom tabs: the everyday screens, one thumb away */}
      <nav
        className="fixed inset-x-0 bottom-0 z-20 border-t border-stone-200 bg-white/95 backdrop-blur lg:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        aria-label="Quick menu"
      >
        <ul className="grid grid-cols-5">
          {TABS.map((t) => {
            const active = t.href ? isActive(pathname, t.href) : open;
            const body = (
              <>
                {t.big ? (
                  <span className="-mt-5 grid size-12 place-items-center rounded-full bg-emerald-600 text-white shadow-lg shadow-emerald-900/20 ring-4 ring-white">
                    <Icon name={t.icon} className="size-6" />
                  </span>
                ) : (
                  <Icon name={t.icon} className={`size-[22px] ${active ? "text-emerald-600" : "text-stone-400"}`} />
                )}
                <span className={`text-[11px] ${active ? "font-semibold text-emerald-700" : "text-stone-500"}`}>{t.label}</span>
              </>
            );
            return (
              <li key={t.label}>
                {t.href ? (
                  <Link href={t.href} className="flex flex-col items-center gap-0.5 pb-1.5 pt-2">
                    {body}
                  </Link>
                ) : (
                  <button onClick={() => setOpen(true)} className="flex w-full flex-col items-center gap-0.5 pb-1.5 pt-2">
                    {body}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
