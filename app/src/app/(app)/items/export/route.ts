import ExcelJS from "exceljs";
import { and, asc, eq, ilike, or, type SQL } from "drizzle-orm";
import { getDb } from "@/db";
import { items, vendors } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { canRead, canSeeCost } from "@/lib/rbac";
import { SYSTEMS } from "@/lib/constants";
import { todayIST } from "@/lib/format";
import { NB_SIZES, isPriceStale, latestCostOf, normaliseNB, priceAgeDays, suggestedSupplyRate } from "@/lib/items";

export const dynamic = "force-dynamic";

/** GET /items/export: Excel workbook: price matrix (group × NB size) + full item price list. */
export async function GET(req: Request) {
  const user = await getSession();
  if (!user) return new Response("Not signed in", { status: 401 });
  if (!canRead(user.role, "items")) return new Response("Forbidden", { status: 403 });
  const seeCost = canSeeCost(user.role);
  const url = new URL(req.url);
  const system = url.searchParams.get("system") ?? "";
  const group = url.searchParams.get("group") ?? "";
  const make = url.searchParams.get("make") ?? "";
  const q = url.searchParams.get("q") ?? "";

  const conds: (SQL | undefined)[] = [eq(items.active, true)];
  if (system && system in SYSTEMS) conds.push(eq(items.system, system));
  if (group) conds.push(eq(items.groupName, group));
  if (make) conds.push(eq(items.make, make));
  if (q) conds.push(or(ilike(items.code, `%${q}%`), ilike(items.name, `%${q}%`), ilike(items.size, `%${q}%`)));

  const db = await getDb();
  const rows = await db.select({ it: items, vendorName: vendors.name }).from(items)
    .leftJoin(vendors, eq(vendors.id, items.lastPurchaseVendorId))
    .where(and(...conds)).orderBy(asc(items.system), asc(items.groupName), asc(items.make), asc(items.code));
  const today = todayIST();

  const wb = new ExcelJS.Workbook();
  wb.creator = "Linga Bhairavi Enterprise CRM";
  wb.created = new Date();
  const moneyFmt = "₹#,##,##0.00";
  const header = (ws: ExcelJS.Worksheet) => {
    const r = ws.getRow(1);
    r.font = { bold: true, color: { argb: "FFFFFFFF" } };
    r.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFAD1A16" } };
    ws.views = [{ state: "frozen", ySplit: 1, xSplit: 1 }];
  };

  // Sheet 1: size matrix
  const basisLabel = seeCost ? "Latest cost" : "Suggested selling rate";
  const matrix = new Map<string, { group: string; make: string | null; system: string; cells: Map<string, number | null> }>();
  const used = new Set<string>();
  for (const { it } of rows) {
    const nb = normaliseNB(it.size);
    if (!nb) continue;
    const key = `${it.groupName}||${it.make ?? ""}`;
    if (!matrix.has(key)) matrix.set(key, { group: it.groupName, make: it.make, system: it.system, cells: new Map() });
    const c = latestCostOf(it);
    matrix.get(key)!.cells.set(nb, seeCost ? c.rate : suggestedSupplyRate(c.rate, it.markupPct));
    used.add(nb);
  }
  const sizes = NB_SIZES.filter((s) => used.has(s));
  const ws1 = wb.addWorksheet("Price Master");
  ws1.columns = [
    { header: `Group (${basisLabel})`, key: "group", width: 34 },
    { header: "Make", key: "make", width: 16 },
    { header: "System", key: "system", width: 22 },
    ...sizes.map((s) => ({ header: s.replace("NB", " NB"), key: s, width: 12, style: { numFmt: moneyFmt } })),
  ];
  for (const r of matrix.values()) {
    const rec: Record<string, string | number | null> = { group: r.group, make: r.make ?? "", system: SYSTEMS[r.system as keyof typeof SYSTEMS] ?? r.system };
    for (const s of sizes) rec[s] = r.cells.get(s) ?? null;
    ws1.addRow(rec);
  }
  header(ws1);

  // Sheet 2: item list
  const ws2 = wb.addWorksheet("Item Price List");
  ws2.columns = [
    { header: "Code", key: "code", width: 16 },
    { header: "Item", key: "name", width: 40 },
    { header: "System", key: "system", width: 22 },
    { header: "Group", key: "group", width: 26 },
    { header: "Size", key: "size", width: 12 },
    { header: "Make", key: "make", width: 16 },
    { header: "UOM", key: "uom", width: 8 },
    { header: "HSN", key: "hsn", width: 10 },
    { header: "GST %", key: "gst", width: 8 },
    ...(seeCost ? [
      { header: "Latest cost", key: "cost", width: 14, style: { numFmt: moneyFmt } },
      { header: "Cost source", key: "source", width: 12 },
      { header: "Last purchase date", key: "lpd", width: 16 },
      { header: "Last vendor", key: "vendor", width: 28 },
      { header: "Price age (days)", key: "age", width: 14 },
      { header: "Stale", key: "stale", width: 8 },
      { header: "List price", key: "list", width: 14, style: { numFmt: moneyFmt } },
      { header: "Markup %", key: "markup", width: 10 },
    ] : []),
    { header: "Suggested sell", key: "sell", width: 14, style: { numFmt: moneyFmt } },
    { header: "Erection rate", key: "erection", width: 14, style: { numFmt: moneyFmt } },
    { header: "Last sale rate", key: "sale", width: 14, style: { numFmt: moneyFmt } },
    { header: "Last sale date", key: "saleDate", width: 14 },
  ];
  for (const { it, vendorName } of rows) {
    const c = latestCostOf(it);
    ws2.addRow({
      code: it.code, name: it.name, system: SYSTEMS[it.system as keyof typeof SYSTEMS] ?? it.system, group: it.groupName, size: it.size ?? "", make: it.make ?? "",
      uom: it.uom, hsn: it.hsn ?? "", gst: it.gstRate,
      cost: c.rate, source: c.source, lpd: it.lastPurchaseDate ?? "", vendor: vendorName ?? "", age: priceAgeDays(it.lastPurchaseDate, today),
      stale: isPriceStale(it, today) ? "Yes" : "No", list: it.listPrice, markup: it.markupPct,
      sell: suggestedSupplyRate(c.rate, it.markupPct), erection: it.erectionRate, sale: it.lastSaleRate, saleDate: it.lastSaleDate ?? "",
    });
  }
  header(ws2);
  ws2.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws2.columnCount } };

  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="LBE-Price-Master-${today}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
