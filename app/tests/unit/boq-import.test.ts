import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { deflateRawSync } from "node:zlib";
import ExcelJS from "exceljs";
import { beforeAll, describe, expect, it } from "vitest";
import {
  boqTotals, BOQ_MAX_ITEM_ROWS, cleanText, detectHeader, extractSizes, fileTypeProblem, historyKey, isSizeOnly, KNOWN_MAKES,
  matchDescription, normaliseSize, parseBoqGrid, parseBoqSheets, parseCsv, parseNumberish, prepareDescription, prepareItem,
  scoreItem, summariseRows, supplyFromCost, workbookBytesProblem, worksheetToGrid,
  type BoqParseResult, type BoqSheet, type MatchItem, type WorksheetLike,
} from "@/lib/boq-import";
import { readBoqFile } from "@/app/(app)/boq-import/_lib/workbook";
import { SEED_ITEMS } from "@/db/seed-data/items";

const SAMPLE = path.resolve(__dirname, "../../../Hydrant,Sprinkler & Fas,PA-Quotation Sampel- Karthick_3122.xlsx");
const hasSample = existsSync(SAMPLE);

const CATALOGUE: MatchItem[] = SEED_ITEMS.map((it, i) => ({ id: i + 1, name: it.name, groupName: it.groupName, size: it.size, make: it.make, system: it.system }));
const PREPARED = CATALOGUE.map(prepareItem);
const MAKES = [...new Set([...KNOWN_MAKES, ...CATALOGUE.flatMap((c) => (c.make ?? "").split("/").map((m) => m.replace(/\bUL\b/, "").trim()).filter(Boolean))])];
const nameOf = (id: number | null) => (id == null ? null : CATALOGUE[id - 1].name);
const items = (s: BoqSheet) => s.rows.filter((r) => r.kind === "item");
const byRef = (s: BoqSheet, ref: string) => s.rows.find((r) => r.kind === "item" && r.ref === ref);

// ---------------------------------------------------------------- the real consultant sample (4 sheets, 4 layouts)
describe.skipIf(!hasSample)("real sample BOQ workbook", () => {
  let viaExcel: BoqParseResult;
  let viaReader: BoqParseResult;
  beforeAll(async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(SAMPLE);
    const sheets: { name: string; grid: ReturnType<typeof worksheetToGrid> }[] = [];
    wb.eachSheet((ws) => sheets.push({ name: ws.name, grid: worksheetToGrid(ws as unknown as WorksheetLike) }));
    viaExcel = parseBoqSheets(sheets);
    viaReader = await readBoqFile("sample.xlsx", new Uint8Array(readFileSync(SAMPLE)));
  });

  it("reads all four sheets, the same way through exceljs directly and through the upload reader", () => {
    expect(viaExcel.sheets.map((s) => s.name)).toEqual(["Hydrat & Sprinkler-1", "Hydrant Sprinkler-2", "FAS & PA-1", "FAS-2"]);
    expect(viaReader.sheets.map((s) => items(s).length)).toEqual(viaExcel.sheets.map((s) => items(s).length));
  });

  it("sheet 1: BOQ Ref | Description | Quantity | UOM | Rate | Amount | Rate | Amount | Remarks", () => {
    const s = viaExcel.sheets[0];
    expect(s.headerRow).toBe(2);
    expect(s.columns).toMatchObject({ ref: 1, description: 2, qty: 3, unit: 4, rate: 5, erectionRate: 7, remarks: 9 });
    expect(items(s)).toHaveLength(85);
    expect(s.rows.filter((r) => r.kind === "section").map((r) => r.section)).toEqual(["A", "B", "C", "D"]);
    expect(items(s)[0]).toMatchObject({ ref: "A.1.1", section: "A", qty: null });
    expect(byRef(s, "B.1.1")?.section).toBe("B");
    expect(byRef(s, "A.6.3")?.description).toMatch(/butterfly valve[\s\S]*150mm dia\.$/i);
  });

  it("sheet 2: formula refs, short title in Description and the real text under Quantity, size-only child rows", () => {
    const s = viaExcel.sheets[1];
    expect(s.headerRow).toBe(2);
    expect(s.columns).toMatchObject({ ref: 1, title: 2, description: 3, qty: null });
    expect(viaExcel.warnings.some((w) => w.includes("Hydrant Sprinkler-2") && w.includes("Quantity column"))).toBe(true);
    expect(items(s)).toHaveLength(31);
    // refs come from cached formula results (A3+0.1 = 1.2000000000000002 -> "1.2")
    expect(items(s).slice(0, 3).map((r) => r.ref)).toEqual(["1.1", "1.2", "1.3"]);
    const pipe25 = byRef(s, "1.1")!;
    expect(pipe25.description.startsWith("MS PIPE:")).toBe(true);
    expect(pipe25.description.endsWith("\n25NB")).toBe(true);
    // the 4 parent rows whose text was carried into their size rows, plus the TOTAL row
    const skipped = s.rows.filter((r) => r.kind === "skip");
    expect(skipped).toHaveLength(5);
    expect(skipped.filter((r) => r.note === "Total row")).toHaveLength(1);
    expect(byRef(s, "5.5")?.description).toMatch(/BUTTERFLY VALVE[\s\S]*\n150MM$/);
  });

  it("FAS & PA-1: S.NO / DESCRIPTION headers, section rows A, B and 'Fire Alarm System', preamble and totals", () => {
    const s = viaExcel.sheets[2];
    expect(s.headerRow).toBe(2);
    expect(s.columns).toMatchObject({ ref: 1, description: 2, qty: 3, unit: 4 });
    expect(items(s)).toHaveLength(19);
    expect(s.rows.filter((r) => r.kind === "section").map((r) => r.section)).toEqual([
      "Fire Alarm System", "A AUTOMATIC ADDRESSABLE FIRE DETECTION AND ALARM SYSTEM", "B PA SYSTEM",
    ]);
    const panel = byRef(s, "A.1")!;
    expect(panel.description).toMatch(/^Supply, installation, test and commissioning of EN\/VDS approved addressable/);
    expect(panel.description.endsWith("\n2 Loop Panel.")).toBe(true);
    const conduits = items(s).filter((r) => r.description.includes("G.I conduit"));
    expect(conduits.map((r) => r.description.split("\n").pop())).toEqual(["20 mm dia.", "25 mm dia."]);
    expect(s.rows.filter((r) => r.note === "Total row").map((r) => r.description)).toEqual(["TOTAL OF FIRE DETECTION SYSTEM", "Grand Total Basic"]);
    expect(byRef(s, "B.4")?.section).toBe("B PA SYSTEM");
  });

  it("FAS-2: numbered refs, sub-sections, continuation line and 'carried over' total", () => {
    const s = viaExcel.sheets[3];
    expect(s.headerRow).toBe(2);
    expect(items(s)).toHaveLength(15);
    expect(s.rows.filter((r) => r.kind === "section").map((r) => r.section)).toEqual(["Fire Alarm System", "1.13 CABLING & WIRING", "2 MISCELLANEOUS ITEM"]);
    expect(byRef(s, "b)")?.description.endsWith("\n1 run of cable")).toBe(true);
    expect(s.rows.at(-1)).toMatchObject({ kind: "skip", note: "Total row", description: "TOTAL CARRIED OVER TO SUMMARY" });
  });

  it("no row carries a quantity in this unpriced sample, so every row starts excluded (zero qty)", () => {
    for (const s of viaExcel.sheets) for (const r of items(s)) expect(r.qty ?? 0).toBe(0);
  });

  it("matches the sample against the item catalogue: most rows auto-matched, removal work flagged for a check", () => {
    const tally = { matched: 0, check: 0, none: 0 };
    const results = new Map<string, ReturnType<typeof matchDescription>>();
    viaExcel.sheets.forEach((s, si) => {
      for (const r of items(s)) {
        const m = matchDescription(r.description, PREPARED, { makes: MAKES });
        tally[m.status]++;
        results.set(`${si}:${r.ref}`, m);
      }
    });
    expect(tally.matched + tally.check + tally.none).toBe(150);
    expect(tally.matched).toBeGreaterThanOrEqual(90);
    expect(tally.none).toBe(0);
    const name = (k: string) => nameOf(results.get(k)!.itemId);
    expect(name("0:A.6.3")).toBe("Butterfly Valve 150NB");
    expect(name("0:A.5.2")).toBe("Gate Valve 200NB");
    expect(name("0:A.8.2")).toBe("NRV 150NB");
    expect(name("0:B.1.3")).toBe("Pipe GI 150NB");
    expect(name("0:A.11.4")).toBe("Pipe MS 150NB");
    expect(name("0:B.3")).toBe("Hose reel drum");
    expect(name("1:1.1")).toBe("Pipe MS 25NB");
    expect(name("1:1.9")).toBe("Pipe MS 200NB");
    expect(name("2:B.4")).toMatch(/^Ceiling Speaker 6W/);
    expect(name("2:B.6")).toMatch(/^FRLS Cable 2C x 1.5 sqmm/);
    expect(results.get("0:A.6.3")!.status).toBe("matched");
    // "REMOVING AND REUSING OF EXISTING BALL VALVE ... 32MM": right item, but a person must price the service
    const removal = results.get("1:4.2")!;
    expect(nameOf(removal.itemId)).toBe("Ball Valve 32NB");
    expect(removal.status).toBe("check");
    expect(removal.score).toBeLessThanOrEqual(45);
    // detectors exist in several makes: never auto-picked silently
    expect(results.get("2:A.3")!.status).toBe("check");
    expect(results.get("2:A.3")!.ambiguous).toBe(true);
  });
});

// ---------------------------------------------------------------- sizes
describe("size normalisation", () => {
  it.each([
    ["150 mm dia", "150NB"], ["150mm dia.", "150NB"], ["25NB", "25NB"], ["25 NB", "25NB"], ["DN 100", "100NB"],
    ['1"', "25NB"], ['1 1/2"', "40NB"], ["3/4 inch", "20NB"], ["2.5 inch", "65NB"], ["6\" pipe", "150NB"],
    ["2C x 1.5 sq mm", "2CX1.5"], ["2Cx1.5 sqmm", "2CX1.5"], ["3.5C x 150 Sq.mm", "3.5CX150"], ["2x1.5 sqm", "2CX1.5"],
    ["Capacity 6.0kg.", "6KG"], ["4.5 Kg", "4.5KG"], ["9 litres capacity", "9L"], ["63 mm", "63MM"], ["2 Loop Panel", "2LOOP"],
    ["6 watt ceiling speaker", "6W"], ["2280 LPM", "2280LPM"], ["100 cum", "100CUM"],
  ])("%s -> %s", (text, want) => {
    expect(normaliseSize(text)).toBe(want);
  });

  it("returns sizes in reading order with the line's own size last", () => {
    expect(extractSizes("Hose reel with 20 mm dia hose and 25 mm ball valve")).toEqual(["20NB", "25NB"]);
    expect(extractSizes("density 150Kg/m3, 150 mm dia")).toEqual(["150NB"]);
    expect(extractSizes(null)).toEqual([]);
  });

  it("recognises size-only child rows", () => {
    for (const t of ["25NB", "150 mm dia.", "20 mm dia.", '1 1/2"', "2C x 1.5 sq mm", "100 x 50", "DN 80", "a) 25 mm"]) expect(isSizeOnly(t), t).toBe(true);
    for (const t of ["2 Loop Panel.", "1 run of cable", "MS PIPE", "Fire Alarm System", ""]) expect(isSizeOnly(t), t).toBe(false);
  });
});

// ---------------------------------------------------------------- scoring
describe("item scoring", () => {
  const item = (name: string) => PREPARED[CATALOGUE.findIndex((c) => c.name === name)];
  const score = (text: string, name: string) => scoreItem(prepareDescription(text, MAKES), item(name));

  it("group + size gives a high score, wrong size or wrong group a low one", () => {
    const t = "Supply and laying of GI pipe heavy class, 150 mm dia";
    expect(score(t, "Pipe GI 150NB")).toBeGreaterThanOrEqual(90);
    expect(score(t, "Pipe GI 100NB")).toBeLessThan(70);
    expect(score(t, "Pipe MS 150NB")).toBeLessThan(score(t, "Pipe GI 150NB"));
    expect(score(t, "Butterfly Valve 150NB")).toBeLessThan(40);
  });

  it("understands inch sizes and NRV wording", () => {
    const m = matchDescription('Dual plate non-return valve PN16, 4"', PREPARED, { makes: MAKES });
    expect(nameOf(m.itemId)).toBe("NRV 100NB");
    expect(m.status).toBe("matched");
  });

  it("extinguisher type and capacity, and a named make wins", () => {
    const m = matchDescription("ABC type stored pressure fire extinguisher 6 kg, make Safex", PREPARED, { makes: MAKES });
    expect(nameOf(m.itemId)).toBe("Fire Extinguisher ABC 6 Kg, Safex");
    expect(m.score).toBeGreaterThanOrEqual(70);
    const co2 = matchDescription("CO2 fire extinguisher 4.5 kg capacity, Safex", PREPARED, { makes: MAKES });
    expect(nameOf(co2.itemId)).toMatch(/CO2 4.5 Kg, Safex/);
  });

  it("detector with a make named is matched to that make", () => {
    const m = matchDescription("Analogue addressable multi sensor detector, make Ravel", PREPARED, { makes: MAKES });
    expect(nameOf(m.itemId)).toBe("Multi Detector Addressable, Ravel");
    expect(m.status).toBe("matched");
  });

  it("unknown work gives no match", () => {
    const m = matchDescription("Civil work: excavation and PCC for pump room foundation", PREPARED, { makes: MAKES });
    expect(m.status).toBe("none");
    expect(m.itemId).toBeNull();
  });

  it("learns from history: an exact description quoted before wins with 95", () => {
    const text = "Supply of special pump room item as per drawing";
    const history = new Map([[historyKey("  Supply of SPECIAL pump room item   as per drawing "), 7]]);
    const m = matchDescription(text, PREPARED, { history, makes: MAKES });
    expect(m).toMatchObject({ itemId: 7, score: 95, status: "matched" });
  });
});

// ---------------------------------------------------------------- parsing helpers
describe("parsing helpers", () => {
  it("reads numbers typed as text", () => {
    expect(parseNumberish("12 Nos")).toEqual({ value: 12, unit: "Nos" });
    expect(parseNumberish("1,20,000")?.value).toBe(120000);
    expect(parseNumberish("Rs. 1,250.50")?.value).toBe(1250.5);
    expect(parseNumberish("30 Rmt")?.value).toBe(30);
    expect(parseNumberish("LS")?.value).toBe(1);
    expect(parseNumberish(" 7 ")?.value).toBe(7);
    expect(parseNumberish("25NB")).toBeNull();
    expect(parseNumberish("-")).toBeNull();
    expect(parseNumberish(null)).toBeNull();
  });

  it("strips control characters but keeps line breaks", () => {
    expect(cleanText("Pipe\u0000 GI\u0007\r\n150​ NB  ")).toBe("Pipe GI\n150 NB");
  });

  it("parses CSV with quotes and line breaks, finds the header and skips totals", () => {
    const csv = [
      "Project: Warehouse,,,",
      "Sl No,Item Description,Qty,Unit",
      "A,Hydrant system,,",
      '1,"GI pipe heavy class ""C""\n150 mm dia",120 Mtr,',
      "2,Butterfly valve 100 mm,4,Nos",
      "3,Hose reel drum,0,Nos",
      ",Total,,",
    ].join("\r\n");
    const grid = parseCsv(csv);
    expect(grid[3][1]).toBe('GI pipe heavy class "C"\n150 mm dia');
    expect(detectHeader(grid)?.headerRow).toBe(2);
    const s = parseBoqGrid("csv", grid);
    expect(s.rows.map((r) => r.kind)).toEqual(["section", "item", "item", "item", "skip"]);
    expect(s.rows[1]).toMatchObject({ ref: "1", qty: 120, unit: "Mtr", section: "A Hydrant system" });
    expect(s.rows[3].qty).toBe(0);
    expect(parseCsv("a;b;c\n1;2;3")[1]).toEqual(["1", "2", "3"]);
  });

  it("caps the import at 2,000 item rows", () => {
    const grid = [["S.No", "Description", "Qty", "Unit"], ...Array.from({ length: 2100 }, (_, i) => [i + 1, `Smoke detector type ${i}`, 1, "Nos"])];
    const r = parseBoqSheets([{ name: "big", grid }]);
    expect(r.sheets[0].rows.filter((x) => x.kind === "item")).toHaveLength(BOQ_MAX_ITEM_ROWS);
    expect(r.warnings.some((w) => w.includes("2,000"))).toBe(true);
  });
});

// ---------------------------------------------------------------- file checks
describe("file checks", () => {
  it("accepts .xlsx and .csv, explains everything else", () => {
    expect(fileTypeProblem("BOQ.xlsx")).toBeNull();
    expect(fileTypeProblem("boq.CSV")).toBeNull();
    expect(fileTypeProblem("boq.xlsm")).toMatch(/Macro-enabled/);
    expect(fileTypeProblem("boq.xls")).toMatch(/97-2003/);
    expect(fileTypeProblem("boq.pdf")).toMatch(/\.xlsx/);
  });

  it("spots password-protected, corrupt and macro workbooks from their bytes", () => {
    expect(workbookBytesProblem(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0, 0]))).toMatch(/password protected/);
    expect(workbookBytesProblem(new TextEncoder().encode("hello world"))).toMatch(/not a valid/);
    const fakeZip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, ...new TextEncoder().encode("xl/vbaProject.bin")]);
    expect(workbookBytesProblem(fakeZip)).toMatch(/macros/);
  });

  it("gives a friendly error for a damaged workbook", async () => {
    const broken = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4, 5, 6, 7, 8]);
    await expect(readBoqFile("broken.xlsx", broken)).rejects.toThrow(/could not open this workbook/);
  });

  it("reads a workbook built in memory (merged cells, formulas, rich text)", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("BOQ");
    ws.addRow(["SITE BOQ", null, null, null]);
    ws.mergeCells("A1:D1");
    ws.addRow(["S.No", "Particulars", "Quantity", "UOM"]);
    ws.addRow([1, { richText: [{ text: "Smoke " }, { text: "detector" }] }, { formula: "2*5", result: 10 }, "Nos"]);
    ws.addRow([2, "Manual call point", "12 Nos", null]);
    const buf = new Uint8Array(await wb.xlsx.writeBuffer());
    const r = await readBoqFile("built.xlsx", buf);
    const s = r.sheets[0];
    expect(s.headerRow).toBe(2);
    expect(s.rows.map((x) => [x.ref, x.description, x.qty, x.unit])).toEqual([["1", "Smoke detector", 10, "Nos"], ["2", "Manual call point", 12, "Nos"]]);
  });
});

// ---------------------------------------------------------------- review totals
describe("review totals (rules 2 and 3)", () => {
  it("suggested supply = cost x (1 + markup)", () => {
    expect(supplyFromCost(1650, 40)).toBe(2310);
    expect(supplyFromCost(0, 40)).toBe(0);
  });

  it("counts only ticked rows with qty above zero", () => {
    const t = boqTotals([
      { include: true, qty: 120, supplyRate: 2310, erectionRate: 250, costRate: 1650 },
      { include: true, qty: 0, supplyRate: 999, erectionRate: 99, costRate: 500 },
      { include: false, qty: 10, supplyRate: 100, erectionRate: 0, costRate: 50 },
    ], 18);
    expect(t).toMatchObject({ supply: 277200, erection: 30000, tax: 55296, grand: 362496, cost: 198000, lineCount: 1 });
  });

  it("summary chips", () => {
    expect(summariseRows([
      { include: true, status: "matched", itemId: 1 },
      { include: true, status: "check", itemId: 2 },
      { include: true, status: "none", itemId: null },
      { include: false, status: "matched", itemId: 3 },
    ])).toEqual({ matched: 1, check: 1, unmatched: 1, excluded: 1, items: 4 });
  });
});

describe("zip-bomb guard (security review V2-02)", () => {
  /** One-entry zip whose central directory can claim any uncompressed size. */
  function oneEntryZip(name: string, data: Buffer, claimedSize: number) {
    const comp = deflateRawSync(data);
    const n = Buffer.from(name);
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(8, 8);
    local.writeUInt32LE(comp.length, 18); local.writeUInt32LE(claimedSize, 22); local.writeUInt16LE(n.length, 26);
    const cd = Buffer.alloc(46); cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(8, 10);
    cd.writeUInt32LE(comp.length, 20); cd.writeUInt32LE(claimedSize, 24); cd.writeUInt16LE(n.length, 28); cd.writeUInt32LE(0, 42);
    const cdOffset = 30 + n.length + comp.length;
    const eocd = Buffer.alloc(22); eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(1, 8); eocd.writeUInt16LE(1, 10);
    eocd.writeUInt32LE(46 + n.length, 12); eocd.writeUInt32LE(cdOffset, 16);
    return new Uint8Array(Buffer.concat([local, n, comp, cd, n, eocd]));
  }

  it("rejects a workbook whose declared size is huge", () => {
    expect(workbookBytesProblem(oneEntryZip("xl/worksheets/sheet1.xml", Buffer.from("x"), 0xfffffff0))).toMatch(/too large/);
  });

  it("rejects a workbook that lies about its size but inflates past the limit", async () => {
    const bomb = oneEntryZip("xl/worksheets/sheet1.xml", Buffer.alloc(130 * 1024 * 1024), 100);
    expect(bomb.length).toBeLessThan(1024 * 1024);
    expect(workbookBytesProblem(bomb)).toBeNull();
    await expect(readBoqFile("bomb.xlsx", bomb)).rejects.toThrow(/too large/);
  });
});
