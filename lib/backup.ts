import "server-only";
import ExcelJS from "exceljs";
import { spendByDay } from "./ad-wallet";
import { loadWallet } from "./ad-wallet-data";
import { aggregateDays, eachDay, shiftDays, totals, type DailyInput, type DashOrder } from "./dashboard";
import { STATUS_LABEL, type OrderStatus } from "./orders";
import { productReport, ratios, type ReportOrder } from "./product-report";
import type { createClient } from "./supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;
type Row = Record<string, unknown>;

/** "2026-10" → first and last day of that month */
export function monthRange(month: string) {
  const from = `${month}-01`;
  const to = shiftDays(`${shiftDays(from, 32).slice(0, 7)}-01`, -1);
  return { from, to };
}

export const monthLabel = (month: string) =>
  new Date(month + "-01T00:00:00Z").toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });

/** Reads every row (pages past Supabase's 1000-row limit). */
async function all<T = Row>(make: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>) {
  const out: T[] = [];
  for (let i = 0; i < 200; i++) {
    const { data, error } = await make(i * 1000, i * 1000 + 999);
    if (error) return { rows: out, error: error.message };
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return { rows: out, error: null as string | null };
}

type OrderFull = {
  id: string;
  order_code: string;
  order_date: string;
  dispatch_date: string | null;
  customer_name: string;
  phone: string;
  address: string;
  pincode: string | null;
  order_type: string;
  payment_mode: string;
  order_value: number;
  advance_paid: number;
  cod_balance: number;
  tracking_id: string | null;
  status: string;
  profit: number;
  shipping_cost: number;
  cod_fee: number;
  items_cost: number;
  rto_charge: number;
  damaged: boolean | null;
  refund_amount: number | null;
  return_shipping: number | null;
  notes: string | null;
  taken_by?: string | null;
  created_at: string;
  courier: { name: string } | null;
  items: { product_id: string; qty: number; unit_cost: number; unit_price: number }[] | null;
};

const INR = '"₹"#,##0;[Red]-"₹"#,##0';
const HEAD_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF065F46" } };

/** Adds a sheet with a bold green header, frozen top row, filters and sensible widths. */
function table(wb: ExcelJS.Workbook, name: string, cols: { header: string; key: string; width?: number; money?: boolean; date?: boolean }[], rows: Row[], totalsRow?: Row) {
  const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = cols.map((c) => ({ header: c.header, key: c.key, width: c.width ?? Math.max(10, c.header.length + 2) }));
  for (const r of rows) ws.addRow(r);
  if (totalsRow) {
    const t = ws.addRow(totalsRow);
    t.font = { bold: true };
    t.eachCell((c) => (c.border = { top: { style: "thin" } }));
  }
  const head = ws.getRow(1);
  head.font = { bold: true, color: { argb: "FFFFFFFF" } };
  head.fill = HEAD_FILL;
  head.alignment = { vertical: "middle" };
  head.height = 20;
  cols.forEach((c, i) => {
    if (c.money) ws.getColumn(i + 1).numFmt = INR;
  });
  if (rows.length) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
  return ws;
}

const sum = (rows: Row[], key: string) => rows.reduce((s, r) => s + (Number(r[key]) || 0), 0);

/** Builds the month's backup workbook: summary with all the calculations, plus every record of the month. */
export async function buildBackup(supabase: Supabase, month: string, today: string) {
  const { from, to } = monthRange(month);
  const inMonth = <Q extends { gte: (c: string, v: string) => Q; lte: (c: string, v: string) => Q }>(q: Q, col = "date") => q.gte(col, from).lte(col, to);

  const [ordersRes, products, couriers, inputsRes, cashRes, codRes, stockRes, settings, wallet] = await Promise.all([
    all<OrderFull>((a, b) =>
      supabase
        .from("orders")
        .select("*, courier:couriers(name), items:order_items(product_id, qty, unit_cost, unit_price)")
        .gte("order_date", from)
        .lte("order_date", to)
        .order("order_date")
        .order("order_code")
        .range(a, b),
    ),
    supabase.from("products").select("id, name, price_paid, price_cod, cost, active").order("name"),
    supabase.from("couriers").select("id, name"),
    inMonth(supabase.from("daily_inputs").select("*")).order("date"),
    inMonth(supabase.from("cash_entries").select("date, amount, note, created_at, category:expense_categories(name, kind)")).order("date").limit(20000),
    inMonth(supabase.from("cod_remittances").select("date, amount, expected, reference, note, courier_id")).order("date").limit(5000),
    inMonth(supabase.from("stock_in").select("*")).order("date").limit(10000),
    supabase.from("app_settings").select("key, value"),
    loadWallet(supabase, from, to),
  ]);
  if (ordersRes.error) throw new Error(ordersRes.error);

  const orders = ordersRes.rows;
  const productList = (products.data ?? []) as { id: string; name: string; price_paid: number; price_cod: number; cost: number; active: boolean }[];
  const pName = new Map(productList.map((p) => [p.id, p.name]));
  const cName = new Map(((couriers.data ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name]));
  const kv = Object.fromEntries(((settings.data ?? []) as { key: string; value: string }[]).map((r) => [r.key, r.value]));
  const dailyRows = (inputsRes.data ?? []) as Row[];

  // ----- same maths as the Dashboard -----
  const inputs: DailyInput[] = dailyRows.map((i) => ({
    date: i.date as string,
    ad_spend: Number(i.ad_spend ?? 0),
    staff_amount: Number(i.staff_amount ?? 0),
    staff_bonus: Number(i.staff_bonus ?? 0),
  }));
  const walletSpend = wallet.ready ? spendByDay(wallet.periods) : new Map<string, number>();
  if (wallet.ready) {
    const byDate = new Map(inputs.map((i) => [i.date, i]));
    for (const [date, cost] of walletSpend) {
      if (date < from || date > to) continue;
      const row = byDate.get(date);
      if (row) Object.assign(row, { ad_spend: cost, ad_from_wallet: true });
      else inputs.push({ date, ad_spend: cost, staff_amount: 0, staff_bonus: 0, ad_from_wallet: true });
    }
  }
  const cash = ((cashRes.data ?? []) as unknown as { date: string; amount: number; note: string | null; category: { name: string; kind: string } | null }[]).filter(Boolean);
  const otherCosts = cash.filter((c) => c.category?.kind === "cost").reduce((s, c) => s + c.amount, 0);
  const days = aggregateDays(orders as unknown as DashOrder[], inputs, from, to);
  const t = totals(orders as unknown as DashOrder[], days, otherCosts);

  const dayCosts = days.map((d) => ({ date: d.date, ad: d.adSpend, staff: d.staff }));
  const report = productReport(orders as unknown as ReportOrder[], dayCosts, productList, from, to);

  const wb = new ExcelJS.Workbook();
  wb.creator = "Kartzo Manager";
  wb.created = new Date();

  // ----- 1. Summary -----
  const ws = wb.addWorksheet("Summary", { views: [{ showGridLines: false }] });
  ws.columns = [{ width: 38 }, { width: 18 }, { width: 50 }];
  ws.addRow([`${kv.business_name || "Kartzo"} — backup for ${monthLabel(month)}`]).font = { bold: true, size: 16 };
  ws.addRow([`${from} to ${to} · made on ${today}${to > today ? " (month not finished yet)" : ""}`]).font = { color: { argb: "FF78716C" } };
  ws.addRow([]);
  const section = (title: string) => {
    const r = ws.addRow([title]);
    r.font = { bold: true, color: { argb: "FFFFFFFF" } };
    r.fill = HEAD_FILL;
    ws.mergeCells(r.number, 1, r.number, 3);
  };
  const line = (label: string, value: number, note = "", opts: { money?: boolean; bold?: boolean } = { money: true }) => {
    const r = ws.addRow([label, value, note]);
    if (opts.money !== false) r.getCell(2).numFmt = INR;
    if (opts.bold) r.font = { bold: true };
    r.getCell(3).font = { color: { argb: "FF78716C" }, italic: true };
  };
  const cnt = (s: string) => t.statusCounts[s] ?? 0;

  section("Profit");
  line("Orders (not cancelled)", t.orders, "", { money: false });
  line("Sales (new + dispatched + delivered)", t.sales);
  line("Product cost", -t.productCost, "of orders sold");
  line("Shipping", -t.shipping, "of orders sold");
  line("COD fees", -t.codFees, "delivered COD orders");
  line("RTO / returns loss", t.rtoLoss, `${t.rtoCount} orders came back`);
  line("Gross profit (from orders)", t.grossProfit, "sum of each order's profit", { money: true, bold: true });
  line("Ad spend", -t.adSpend, wallet.ready ? "from Ad wallet balances where entered" : "typed per day");
  line("Profit after ads", t.profitAfterAds, "", { money: true, bold: true });
  line("Staff pay (incl. bonus)", -t.staff, t.staffBonus ? `bonus ${t.staffBonus}` : "");
  line("Other expenses (business costs)", -t.otherCosts, "from Expenses, whole month");
  line("NET PROFIT", t.netProfit, "", { money: true, bold: true });
  ws.getRow(ws.rowCount).font = { bold: true, size: 13 };
  ws.addRow([]);

  section("Orders by status");
  for (const s of ["new", "dispatched", "delivered", "rto", "returned", "cancelled"])
    line(STATUS_LABEL[s as OrderStatus] ?? s, cnt(s), "", { money: false });
  line("Total orders entered", orders.length, "", { money: false, bold: true });
  line("Taken by staff", orders.filter((o) => o.taken_by !== "owner" && o.status !== "cancelled").length, "not cancelled", { money: false });
  line("Taken by you", orders.filter((o) => o.taken_by === "owner" && o.status !== "cancelled").length, "not cancelled", { money: false });
  line("COD orders", orders.filter((o) => o.payment_mode === "cod" && o.status !== "cancelled").length, "", { money: false });
  line("Prepaid orders", orders.filter((o) => o.payment_mode !== "cod" && o.status !== "cancelled").length, "", { money: false });
  ws.addRow([]);

  section("Money");
  const cod = (codRes.data ?? []) as Row[];
  line("COD received from courier", sum(cod, "amount"), `${cod.length} remittances`);
  line("COD still on the way", t.codInTransit, "COD of this month's new + dispatched orders");
  for (const kind of ["income", "cost", "transfer"] as const) {
    const label = kind === "income" ? "Money in (Expenses page)" : kind === "cost" ? "Business costs (Expenses page)" : "Cash out (wallet recharges, stock…)";
    line(label, cash.filter((c) => c.category?.kind === kind).reduce((s, c) => s + c.amount, 0));
  }
  ws.addRow([]);

  section("Pieces sold");
  for (const p of report.lines) line(p.name, p.pieces, `${p.orders} orders`, { money: false });

  // ----- 2. Daily -----
  table(
    wb,
    "Daily",
    [
      { header: "Date", key: "date", width: 12 },
      { header: "Orders", key: "orders" },
      { header: "Sales", key: "sales", money: true },
      { header: "Gross profit", key: "gross", money: true },
      { header: "RTO", key: "rto" },
      { header: "RTO loss", key: "rtoLoss", money: true },
      { header: "Ad spend", key: "ads", money: true },
      { header: "Profit after ads", key: "afterAds", money: true, width: 16 },
      { header: "Staff", key: "staff", money: true },
      { header: "Net (before other expenses)", key: "net", money: true, width: 26 },
    ],
    days.map((d) => ({ date: d.date, orders: d.orders, sales: d.sales, gross: d.grossProfit, rto: d.rtoCount, rtoLoss: d.rtoLoss, ads: d.adSpend, afterAds: d.profitAfterAds, staff: d.staff, net: d.netProfit })),
    { date: "Total", orders: t.orders, sales: t.sales, gross: t.grossProfit, rto: t.rtoCount, rtoLoss: t.rtoLoss, ads: t.adSpend, afterAds: t.profitAfterAds, staff: t.staff, net: t.grossProfit - t.adSpend - t.staff },
  );

  // ----- 3. Orders -----
  const orderRows = orders.map((o) => ({
    code: o.order_code,
    date: o.order_date,
    status: STATUS_LABEL[o.status as OrderStatus] ?? o.status,
    customer: o.customer_name,
    phone: o.phone,
    address: (o.address ?? "").replace(/\s*\n\s*/g, ", "),
    pincode: o.pincode,
    products: (o.items ?? []).map((i) => `${pName.get(i.product_id) ?? "Product"} × ${i.qty}`).join(", "),
    pay: o.payment_mode === "cod" ? "COD" : "Prepaid",
    type: o.order_type,
    value: o.order_value,
    advance: o.advance_paid,
    codBal: o.cod_balance,
    courier: o.courier?.name ?? "",
    tracking: o.tracking_id ?? "",
    dispatch: o.dispatch_date ?? "",
    itemsCost: o.items_cost,
    shipping: o.shipping_cost,
    codFee: o.cod_fee,
    rtoCharge: o.rto_charge,
    refund: o.refund_amount ?? 0,
    damaged: o.damaged ? "Yes" : "",
    profit: o.profit,
    takenBy: o.taken_by === "owner" ? "You" : "Staff",
    notes: o.notes ?? "",
  }));
  table(
    wb,
    "Orders",
    [
      { header: "Order", key: "code" },
      { header: "Date", key: "date", width: 12 },
      { header: "Status", key: "status", width: 11 },
      { header: "Customer", key: "customer", width: 22 },
      { header: "Phone", key: "phone", width: 13 },
      { header: "Address", key: "address", width: 40 },
      { header: "PIN", key: "pincode" },
      { header: "Products", key: "products", width: 30 },
      { header: "Payment", key: "pay" },
      { header: "Type", key: "type" },
      { header: "Value", key: "value", money: true },
      { header: "Advance", key: "advance", money: true },
      { header: "COD to collect", key: "codBal", money: true },
      { header: "Courier", key: "courier" },
      { header: "Tracking", key: "tracking", width: 16 },
      { header: "Dispatched", key: "dispatch", width: 12 },
      { header: "Product cost", key: "itemsCost", money: true },
      { header: "Shipping", key: "shipping", money: true },
      { header: "COD fee", key: "codFee", money: true },
      { header: "RTO charge", key: "rtoCharge", money: true },
      { header: "Refund", key: "refund", money: true },
      { header: "Damaged", key: "damaged" },
      { header: "Profit", key: "profit", money: true },
      { header: "Taken by", key: "takenBy" },
      { header: "Notes", key: "notes", width: 30 },
    ],
    orderRows,
    { code: "Total", value: sum(orderRows, "value"), advance: sum(orderRows, "advance"), codBal: sum(orderRows, "codBal"), profit: sum(orderRows, "profit") },
  );

  // ----- 4. Products -----
  table(
    wb,
    "Products",
    [
      { header: "Product", key: "name", width: 26 },
      { header: "Orders", key: "orders" },
      { header: "Pieces", key: "pieces" },
      { header: "Revenue", key: "revenue", money: true },
      { header: "Product cost", key: "cost", money: true },
      { header: "Shipping", key: "shipping", money: true },
      { header: "COD fees", key: "codFees", money: true },
      { header: "RTO", key: "rto" },
      { header: "RTO loss", key: "rtoLoss", money: true },
      { header: "Gross profit", key: "gross", money: true },
      { header: "Ad spend (share)", key: "ads", money: true, width: 16 },
      { header: "Staff (share)", key: "staff", money: true },
      { header: "Net profit", key: "net", money: true },
      { header: "Ad cost / order", key: "cpo", money: true, width: 15 },
      { header: "RTO %", key: "rtoRate" },
    ],
    report.lines.map((l) => {
      const r = ratios(l);
      return { name: l.name, orders: l.orders, pieces: l.pieces, revenue: l.revenue, cost: l.productCost, shipping: l.shipping, codFees: l.codFees, rto: l.rtoCount, rtoLoss: l.rtoLoss, gross: l.grossProfit, ads: Math.round(l.adSpend), staff: Math.round(l.staff), net: Math.round(l.netProfit), cpo: Math.round(r.cpo), rtoRate: `${Math.round(r.rtoRate * 100)}%` };
    }),
  );

  // ----- 5. Staff -----
  const staffRows = eachDay(from, to).map((date) => {
    const d = dailyRows.find((x) => x.date === date);
    const amount = Number(d?.staff_amount ?? 0);
    const bonus = Number(d?.staff_bonus ?? 0);
    return {
      date,
      orders: d?.staff_orders_taken ?? "",
      amount,
      bonus,
      note: (d?.staff_bonus_note as string) ?? "",
      total: amount + bonus,
      paid: d?.staff_paid ? "Yes" : amount + bonus ? "No" : "",
      paidOn: (d?.staff_paid_date as string) ?? "",
    };
  });
  table(
    wb,
    `Staff${kv.staff_name ? " - " + kv.staff_name.slice(0, 20) : ""}`.replace(/[\\/*?:[\]]/g, ""),
    [
      { header: "Date", key: "date", width: 12 },
      { header: "Orders counted", key: "orders" },
      { header: "Pay", key: "amount", money: true },
      { header: "Bonus", key: "bonus", money: true },
      { header: "Bonus note", key: "note", width: 20 },
      { header: "Total", key: "total", money: true },
      { header: "Paid", key: "paid" },
      { header: "Paid on", key: "paidOn", width: 12 },
    ],
    staffRows,
    { date: "Total", amount: sum(staffRows, "amount"), bonus: sum(staffRows, "bonus"), total: sum(staffRows, "total") },
  );

  // ----- 6. Expenses (cash book) -----
  const cashRows = cash.map((c) => ({
    date: c.date,
    category: c.category?.name ?? "",
    kind: c.category?.kind === "cost" ? "Business cost" : c.category?.kind === "income" ? "Money in" : "Cash out",
    amount: c.amount,
    note: c.note ?? "",
  }));
  table(
    wb,
    "Expenses",
    [
      { header: "Date", key: "date", width: 12 },
      { header: "Category", key: "category", width: 20 },
      { header: "Type", key: "kind", width: 14 },
      { header: "Amount", key: "amount", money: true },
      { header: "Note", key: "note", width: 36 },
    ],
    cashRows,
    { date: "Total", amount: sum(cashRows, "amount") },
  );

  // ----- 7. Ad wallet -----
  if (wallet.ready) {
    const readings = new Map(wallet.readings.map((r) => [r.date, r.balance]));
    const recharges = new Map<string, number>();
    for (const r of wallet.recharges) recharges.set(r.date, (recharges.get(r.date) ?? 0) + r.amount);
    const adRows = eachDay(from, to).map((date) => ({
      date,
      balance: readings.has(date) ? readings.get(date) : "",
      recharge: recharges.get(date) ?? "",
      spend: days.find((d) => d.date === date)?.adSpend ?? 0,
    }));
    table(
      wb,
      "Ad wallet",
      [
        { header: "Date", key: "date", width: 12 },
        { header: "Morning balance", key: "balance", money: true, width: 16 },
        { header: "Recharge", key: "recharge", money: true },
        { header: "Ad spend", key: "spend", money: true },
      ],
      adRows,
      { date: "Total", recharge: sum(adRows, "recharge"), spend: sum(adRows, "spend") },
    );
  }

  // ----- 8. COD remittances -----
  table(
    wb,
    "COD received",
    [
      { header: "Date", key: "date", width: 12 },
      { header: "Courier", key: "courier", width: 14 },
      { header: "Received", key: "amount", money: true },
      { header: "Expected", key: "expected", money: true },
      { header: "Difference", key: "diff", money: true },
      { header: "Reference", key: "reference", width: 18 },
      { header: "Note", key: "note", width: 30 },
    ],
    cod.map((c) => ({ date: c.date, courier: cName.get(c.courier_id as string) ?? "", amount: c.amount, expected: c.expected, diff: Number(c.amount) - Number(c.expected), reference: c.reference ?? "", note: c.note ?? "" })),
    { date: "Total", amount: sum(cod, "amount"), expected: sum(cod, "expected") },
  );

  // ----- 9. Stock in -----
  const stock = (stockRes.data ?? []) as Row[];
  table(
    wb,
    "Stock in",
    [
      { header: "Date", key: "date", width: 12 },
      { header: "Product", key: "product", width: 26 },
      { header: "Qty", key: "qty" },
      { header: "Type", key: "kind" },
      { header: "Supplier", key: "supplier", width: 20 },
      { header: "Unit cost", key: "unit", money: true },
      { header: "Note", key: "note", width: 30 },
    ],
    stock.map((s) => ({ date: s.date, product: pName.get(s.product_id as string) ?? "", qty: s.qty, kind: s.kind ?? "", supplier: s.supplier ?? "", unit: s.unit_cost ?? "", note: s.note ?? "" })),
  );

  // ----- 10. Product list (prices at the time of the backup) -----
  table(
    wb,
    "Product prices",
    [
      { header: "Product", key: "name", width: 26 },
      { header: "Prepaid price", key: "price_paid", money: true, width: 14 },
      { header: "COD price", key: "price_cod", money: true },
      { header: "Cost", key: "cost", money: true },
      { header: "Active", key: "active" },
    ],
    productList.map((p) => ({ ...p, active: p.active ? "Yes" : "No" })),
  );

  const buf = await wb.xlsx.writeBuffer();
  return { buffer: buf as ArrayBuffer, orders: orders.length };
}
