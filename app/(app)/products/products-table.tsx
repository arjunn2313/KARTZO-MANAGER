"use client";

import { useRef, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { addStock, saveProduct, type ActionResult } from "./actions";

export type ProductRow = {
  id: string;
  name: string;
  price_paid: number;
  price_cod: number;
  cost: number;
  active: boolean;
  image_url: string | null;
  low_stock_alert: number;
  available: number;
  stock_added: number;
  sold: number;
  pending: number;
};

type Modal = { kind: "edit"; product?: ProductRow } | { kind: "stock"; product: ProductRow } | null;

const rs = (n: number) => `₹${n.toLocaleString("en-IN")}`;
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

const input =
  "w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-stone-900 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20";

/* ---------------- Table ---------------- */

export function ProductsTable({ rows }: { rows: ProductRow[] }) {
  const [modal, setModal] = useState<Modal>(null);

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Products</h1>
          <p className="mt-1 text-sm text-stone-500">
            Prices fill in automatically on new orders. Stock goes down when an order is dispatched.
          </p>
        </div>
        <button
          onClick={() => setModal({ kind: "edit" })}
          className="shrink-0 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
        >
          + Add product
        </button>
      </div>

      {/* Desktop table */}
      <div className="hidden overflow-hidden rounded-xl bg-white ring-1 ring-stone-200 md:block">
        <table className="w-full text-sm">
          <thead className="bg-stone-50 text-left text-xs font-medium uppercase tracking-wide text-stone-500">
            <tr>
              <th className="px-4 py-3">Product</th>
              <th className="px-4 py-3 text-right">Paid price</th>
              <th className="px-4 py-3 text-right">COD price</th>
              <th className="px-4 py-3 text-right">Cost</th>
              <th className="px-4 py-3 text-right">Profit / unit</th>
              <th className="px-4 py-3 text-right">In stock</th>
              <th className="px-4 py-3 text-right">Pending</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {rows.map((p) => (
              <tr key={p.id} className={p.active ? "" : "opacity-50"}>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Thumb url={p.image_url} name={p.name} />
                    <div>
                      <div className="font-medium text-stone-900">{p.name}</div>
                      {!p.active && <div className="text-xs text-stone-500">Inactive</div>}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-right">{rs(p.price_paid)}</td>
                <td className="px-4 py-3 text-right">{rs(p.price_cod)}</td>
                <td className="px-4 py-3 text-right text-stone-500">{rs(p.cost)}</td>
                <td className="px-4 py-3 text-right text-stone-600">
                  {rs(p.price_paid - p.cost)}
                  {p.price_cod !== p.price_paid && (
                    <span className="text-stone-400"> / {rs(p.price_cod - p.cost)}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <StockBadge p={p} />
                </td>
                <td className="px-4 py-3 text-right text-stone-600">{p.pending || "–"}</td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1">
                    <RowButton onClick={() => setModal({ kind: "stock", product: p })}>+ Stock</RowButton>
                    <RowButton onClick={() => setModal({ kind: "edit", product: p })}>Edit</RowButton>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="border-t border-stone-100 px-4 py-2 text-xs text-stone-400">
          Profit / unit = price − cost (paid / COD), before shipping. Pending = orders not yet dispatched.
        </p>
      </div>

      {/* Mobile cards */}
      <div className="space-y-3 md:hidden">
        {rows.map((p) => (
          <div key={p.id} className={`rounded-xl bg-white p-4 ring-1 ring-stone-200 ${p.active ? "" : "opacity-50"}`}>
            <div className="flex items-start gap-3">
              <Thumb url={p.image_url} name={p.name} size="lg" />
              <div className="min-w-0 flex-1">
                <div className="font-medium">{p.name}</div>
                <div className="mt-0.5 text-sm text-stone-500">
                  {rs(p.price_paid)} paid · {rs(p.price_cod)} COD · cost {rs(p.cost)}
                </div>
                <div className="mt-2 flex items-center gap-2 text-sm">
                  <StockBadge p={p} />
                  {p.pending > 0 && <span className="text-stone-500">{p.pending} pending</span>}
                </div>
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <RowButton wide onClick={() => setModal({ kind: "stock", product: p })}>+ Stock</RowButton>
              <RowButton wide onClick={() => setModal({ kind: "edit", product: p })}>Edit</RowButton>
            </div>
          </div>
        ))}
      </div>

      {rows.length === 0 && <p className="text-sm text-stone-500">No products yet.</p>}

      {modal?.kind === "edit" && (
        <ProductDialog key={modal.product?.id ?? "new"} product={modal.product} onClose={() => setModal(null)} />
      )}
      {modal?.kind === "stock" && <StockDialog product={modal.product} onClose={() => setModal(null)} />}
    </>
  );
}

function RowButton({
  children,
  onClick,
  wide,
}: {
  children: React.ReactNode;
  onClick: () => void;
  wide?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md px-3 py-1.5 text-sm font-medium text-stone-700 ring-1 ring-stone-200 hover:bg-stone-50 ${
        wide ? "flex-1" : ""
      }`}
    >
      {children}
    </button>
  );
}

function StockBadge({ p }: { p: ProductRow }) {
  const low = p.available <= p.low_stock_alert;
  const out = p.available <= 0;
  const cls = out
    ? "bg-red-100 text-red-700"
    : low
      ? "bg-amber-100 text-amber-800"
      : "bg-emerald-100 text-emerald-800";
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-sm font-semibold ${cls}`}>
      {p.available}
      {out ? " · out" : low ? " · low" : ""}
    </span>
  );
}

function Thumb({ url, name, size = "md" }: { url: string | null; name: string; size?: "md" | "lg" }) {
  const box = size === "lg" ? "size-16" : "size-11";
  if (!url)
    return (
      <div className={`${box} grid shrink-0 place-items-center rounded-lg bg-stone-100 text-lg font-semibold text-stone-400`}>
        {name.charAt(0).toUpperCase()}
      </div>
    );
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={name} className={`${box} shrink-0 rounded-lg object-cover ring-1 ring-stone-200`} />;
}

/* ---------------- Dialog shell ---------------- */

function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:max-w-lg sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="rounded-md px-2 py-1 text-stone-400 hover:bg-stone-100" aria-label="Close">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm font-medium text-stone-700">
      {label}
      <div className="mt-1">{children}</div>
      {hint && <div className="mt-1 text-xs font-normal text-stone-400">{hint}</div>}
    </label>
  );
}

function Money({ name, defaultValue }: { name: string; defaultValue?: number }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-stone-400">₹</span>
      <input name={name} type="number" inputMode="numeric" min={0} step={1} required defaultValue={defaultValue} className={`${input} pl-7`} />
    </div>
  );
}

function Footer({ result, pending, label, onClose }: { result: ActionResult | null; pending: boolean; label: string; onClose: () => void }) {
  return (
    <div className="mt-5 flex items-center gap-3">
      {result && !result.ok && <span className="flex-1 text-sm text-red-600">{result.message}</span>}
      <div className="flex-1" />
      <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-stone-600 hover:bg-stone-100">
        Cancel
      </button>
      <button disabled={pending} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-60">
        {pending ? "Saving…" : label}
      </button>
    </div>
  );
}

/* ---------------- Add / edit product ---------------- */

const MAX_IMAGE_MB = 5;

function ProductDialog({ product, onClose }: { product?: ProductRow; onClose: () => void }) {
  const [imageUrl, setImageUrl] = useState(product?.image_url ?? "");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    if (!file.type.startsWith("image/")) return setUploadError("Please choose an image file");
    if (file.size > MAX_IMAGE_MB * 1024 * 1024) return setUploadError(`Image must be under ${MAX_IMAGE_MB} MB`);

    setUploading(true);
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const path = `products/${crypto.randomUUID()}.${ext}`;
    const supabase = createClient();
    const { error } = await supabase.storage.from("product-images").upload(path, file, {
      cacheControl: "31536000",
      contentType: file.type,
    });
    setUploading(false);
    if (error) {
      setUploadError(
        error.message.includes("Bucket not found") ? "Run DATABASE-UPDATE-2.sql in Supabase first" : error.message,
      );
      return;
    }
    setImageUrl(supabase.storage.from("product-images").getPublicUrl(path).data.publicUrl);
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const r = await saveProduct(formData);
      setResult(r);
      if (r.ok) onClose();
    });
  }

  return (
    <Dialog title={product ? "Edit product" : "Add product"} onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-4">
        {product && <input type="hidden" name="id" value={product.id} />}
        <input type="hidden" name="image_url" value={imageUrl} />

        <div className="flex items-center gap-4">
          <div className="grid size-24 shrink-0 place-items-center overflow-hidden rounded-xl bg-stone-100 ring-1 ring-stone-200">
            {imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imageUrl} alt="" className="size-full object-cover" />
            ) : (
              <span className="text-xs text-stone-400">No image</span>
            )}
          </div>
          <div className="space-y-2">
            <input ref={fileRef} type="file" accept="image/*" onChange={onFile} className="hidden" />
            <div className="flex gap-2">
              <button
                type="button"
                disabled={uploading}
                onClick={() => fileRef.current?.click()}
                className="rounded-md px-3 py-1.5 text-sm font-medium text-stone-700 ring-1 ring-stone-300 hover:bg-stone-50 disabled:opacity-60"
              >
                {uploading ? "Uploading…" : imageUrl ? "Change image" : "Upload image"}
              </button>
              {imageUrl && !uploading && (
                <button type="button" onClick={() => setImageUrl("")} className="rounded-md px-3 py-1.5 text-sm text-stone-500 hover:bg-stone-100">
                  Remove
                </button>
              )}
            </div>
            {uploadError ? (
              <p className="text-xs text-red-600">{uploadError}</p>
            ) : (
              <p className="text-xs text-stone-400">JPG or PNG, up to {MAX_IMAGE_MB} MB</p>
            )}
          </div>
        </div>

        <Field label="Product name">
          <input name="name" required defaultValue={product?.name} className={input} />
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Paid price">
            <Money name="price_paid" defaultValue={product?.price_paid} />
          </Field>
          <Field label="COD price">
            <Money name="price_cod" defaultValue={product?.price_cod} />
          </Field>
          <Field label="Cost">
            <Money name="cost" defaultValue={product?.cost} />
          </Field>
        </div>
        <Field label="Low stock warning at" hint="The stock count turns amber at or below this number.">
          <input
            name="low_stock_alert"
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            required
            defaultValue={product?.low_stock_alert ?? 20}
            className={input}
          />
        </Field>
        {product ? (
          <label className="flex items-center gap-2 text-sm text-stone-700">
            <input type="checkbox" name="active" defaultChecked={product.active} className="size-4 accent-emerald-700" />
            Active (untick to hide a product you no longer sell)
          </label>
        ) : (
          <input type="hidden" name="active" value="true" />
        )}

        <Footer result={result} pending={pending || uploading} label={product ? "Save" : "Add product"} onClose={onClose} />
      </form>
    </Dialog>
  );
}

/* ---------------- Add stock ---------------- */

function StockDialog({ product, onClose }: { product: ProductRow; onClose: () => void }) {
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const [qty, setQty] = useState("");
  const n = Number(qty) || 0;

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const r = await addStock(formData);
      setResult(r);
      if (r.ok) onClose();
    });
  }

  return (
    <Dialog title={`Add stock: ${product.name}`} onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-4">
        <input type="hidden" name="product_id" value={product.id} />
        <div className="rounded-lg bg-stone-50 px-4 py-3 text-sm">
          In stock now: <span className="font-semibold">{product.available}</span>
          {n !== 0 && (
            <>
              {" "}→ after this: <span className="font-semibold text-emerald-700">{product.available + n}</span>
            </>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Quantity" hint="Use a minus number to correct, e.g. −2 for damaged.">
            <input
              name="qty"
              type="number"
              inputMode="numeric"
              step={1}
              required
              autoFocus
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              className={input}
            />
          </Field>
          <Field label="Date">
            <input name="date" type="date" required defaultValue={today()} className={input} />
          </Field>
        </div>
        <Field label="Note (optional)">
          <input name="note" placeholder="e.g. Bulk stock from vendor, opening stock" className={input} />
        </Field>
        <Footer result={result} pending={pending} label="Save stock" onClose={onClose} />
      </form>
    </Dialog>
  );
}
