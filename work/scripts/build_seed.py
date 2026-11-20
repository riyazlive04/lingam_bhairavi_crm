"""
Build static seed-data TypeScript modules for the LBE CRM from the client's Excel files.

Run from anywhere:   python -I "work/scripts/build_seed.py"

Reads (project root = parent of app/):
  - Price list for Hydrandt and Fire alarm.xlsx
  - Hydrant,Sprinkler & Fas,PA-Quotation Sampel- Karthick_3122.xlsx
  - docs/meeting-transcript.md
Writes:
  - app/src/db/seed-data/items.ts
  - app/src/db/seed-data/boq-templates.ts
  - app/src/db/seed-data/meeting-transcript.ts

Prices: wherever the client's price list has a value it is used verbatim (formula cells are
evaluated here). Every other list price is a DEMO ASSUMPTION — client to confirm — and such
items carry `demoPrice: true` plus a note in their description.
"""
import json
import os
import re
import sys

import openpyxl

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
APP = os.path.join(ROOT, "app")
OUT = os.path.join(APP, "src", "db", "seed-data")
PRICE_XLSX = os.path.join(ROOT, "Price list for Hydrandt and Fire alarm.xlsx")
BOQ_XLSX = os.path.join(ROOT, "Hydrant,Sprinkler & Fas,PA-Quotation Sampel- Karthick_3122.xlsx")
TRANSCRIPT = os.path.join(ROOT, "docs", "meeting-transcript.md")

NB_COLS = "DEFGHIJKLMN"
NB_SIZES = [300, 250, 200, 150, 100, 80, 65, 50, 40, 32, 25]
DEMO_NOTE = "List price is a DEMO ASSUMPTION — client to confirm."

items = []
codes = set()


def rnd(v):
    """Round a demo price to a 'shop' figure."""
    if v >= 10000:
        return float(round(v / 100) * 100)
    if v >= 1000:
        return float(round(v / 50) * 50)
    if v >= 100:
        return float(round(v / 10) * 10)
    return float(round(v))


def add(code, name, system, group, *, size=None, make=None, uom="Nos", hsn=None, price=None,
        demo=True, markup=40.0, erection=0.0, reorder=0.0, volatile=False, desc=None, gst=18.0):
    if code in codes:
        raise SystemExit(f"duplicate code {code}")
    codes.add(code)
    d = desc or ""
    if demo:
        d = (d + " " if d else "") + DEMO_NOTE
    items.append({
        "code": code, "name": name, "system": system, "groupName": group, "size": size, "make": make,
        "uom": uom, "hsn": hsn, "gstRate": gst, "listPrice": float(price) if price is not None else None,
        "markupPct": float(markup), "erectionRate": float(erection), "reorderLevel": float(reorder),
        "volatilePrice": volatile, "description": d or None, "demoPrice": bool(demo),
    })


# ------------------------------------------------------------------ price list: Hydrant & Sprinkler
def eval_sheet(ws):
    """Evaluate simple formulas like =G6-500 / =C73+500 (cell refs +/- constant)."""
    vals = {}
    for row in ws.iter_rows():
        for c in row:
            if c.value is not None and c.value != "":
                vals[c.coordinate] = c.value

    def get(ref, depth=0):
        v = vals.get(ref)
        if isinstance(v, str) and v.startswith("="):
            m = re.fullmatch(r"=([A-Z]+\d+)\s*([+-])\s*(\d+(?:\.\d+)?)", v.strip())
            if not m:
                raise SystemExit(f"cannot evaluate {ref}: {v}")
            base = get(m.group(1), depth + 1)
            k = float(m.group(3))
            return base + k if m.group(2) == "+" else base - k
        return v

    return vals, get


wb = openpyxl.load_workbook(PRICE_XLSX)
ws = wb["Hydrant and Sprinkler"]
vals, get = eval_sheet(ws)

hs_rows = {}   # cleaned description -> {"std": price|None, "sizes": {nb: price}, "sub": [labels], "subprices": {label: price}}
pending_sub = None
for r in range(6, ws.max_row + 1):
    desc = vals.get(f"B{r}")
    if desc is None:
        # sub-size header row -> applies to the item on the next row
        labels = [(col, vals.get(f"{col}{r}")) for col in "CDEFG" if vals.get(f"{col}{r}") is not None]
        if labels:
            pending_sub = labels
        continue
    desc = " ".join(str(desc).split())
    entry = {"std": None, "sizes": {}, "sub": None}
    c = get(f"C{r}")
    sizes = {}
    for col, nb in zip(NB_COLS, NB_SIZES):
        v = get(f"{col}{r}")
        if isinstance(v, (int, float)):
            sizes[nb] = float(v)
    if pending_sub:
        # price row values align with the sub-header columns
        entry["sub"] = [(str(lbl), get(f"{col}{r}")) for col, lbl in pending_sub]
        pending_sub = None
    else:
        entry["sizes"] = sizes
        entry["std"] = float(c) if isinstance(c, (int, float)) else None
    hs_rows[desc] = entry

# sanity checks against the values the brief asked us to verify
assert hs_rows["Pipe GI"]["sizes"] == {200: 3750, 150: 3250, 100: 2750, 80: 2650, 65: 2500, 50: 2350, 40: 2200, 32: 2050, 25: 1900}, hs_rows["Pipe GI"]
assert hs_rows["Pipe MS"]["sizes"] == {200: 2600, 150: 2400, 100: 2200, 80: 1900, 65: 1750, 50: 1600, 40: 1500, 32: 1400, 25: 1300}, hs_rows["Pipe MS"]
assert [p for _, p in hs_rows["C Channel"]["sub"]] == [1200, 1700, 2200, 2700], hs_rows["C Channel"]


def hs_size_items(abbrev, group, sizes, price_fn, *, uom="Nos", hsn="8481", markup=40, erect_fn=None,
                  volatile=False, sheet_key=None, desc=None):
    sheet_sizes = hs_rows.get(sheet_key or group, {}).get("sizes", {}) if (sheet_key or group) in hs_rows else {}
    for nb in sizes:
        if nb in sheet_sizes:
            price, demo = sheet_sizes[nb], False
        else:
            price, demo = rnd(price_fn(nb)), True
        er = rnd(erect_fn(price, nb)) if erect_fn else 0
        add(f"HS-{abbrev}-{nb}", f"{group} {nb}NB", "hydrant_sprinkler", group, size=f"{nb}NB", uom=uom, hsn=hsn,
            price=price, demo=demo, markup=markup, erection=er, volatile=volatile, desc=desc)


def hs_std(abbrev, group, *, price=None, uom="Nos", hsn="8481", erection=0, size=None, desc=None, name=None,
           system="hydrant_sprinkler", markup=40, volatile=False, reorder=0):
    sheet = hs_rows.get(group, {}).get("std") if group in hs_rows else None
    if sheet is not None:
        p, demo = sheet, False
    else:
        p, demo = price, True
    add(f"HS-{abbrev}", name or (f"{group} {size}" if size else group), system, group, size=size, uom=uom, hsn=hsn,
        price=p, demo=demo, erection=erection, desc=desc, markup=markup, volatile=volatile, reorder=reorder)


PIPE_SIZES = [300, 250, 200, 150, 100, 80, 65, 50, 40, 32, 25]
FIT_SIZES = [200, 150, 100, 80, 65, 50, 40, 32, 25]
gi = dict(hs_rows["Pipe GI"]["sizes"]); gi.update({250: 4600, 300: 5600})     # DEMO: 250/300 NB GI
ms = dict(hs_rows["Pipe MS"]["sizes"]); ms.update({250: 3100, 300: 3700})     # DEMO: 250/300 NB MS
pipe_erect = lambda p, nb: p * 0.20

# DEMO ASSUMPTION — client to confirm: 250/300 NB pipe prices extrapolated from the 200 NB price.
hs_size_items("PGI", "Pipe GI", PIPE_SIZES, lambda nb: gi[nb], uom="Mtr", hsn="7306", markup=35,
              erect_fn=pipe_erect, volatile=True, desc="GI pipe IS 1239 heavy class (C class), per running metre.")
hs_size_items("PMS", "Pipe MS", PIPE_SIZES, lambda nb: ms[nb], uom="Mtr", hsn="7306", markup=35,
              erect_fn=pipe_erect, volatile=True, desc="MS/black steel ERW pipe IS 1239 / IS 3589 heavy class, per running metre.")
# DEMO ASSUMPTION — fittings priced as a % of the per-metre pipe price of the same size.
fit_erect = lambda p, nb: max(50, p * 0.15)
hs_size_items("EGI", "Elbow GI", FIT_SIZES, lambda nb: gi[nb] * 0.12, hsn="7307", erect_fn=fit_erect)
hs_size_items("EMS", "Elbow MS", FIT_SIZES, lambda nb: ms[nb] * 0.10, hsn="7307", erect_fn=fit_erect)
hs_size_items("RGI", "Reducer GI", [200, 150, 100, 80, 65, 50, 40, 32], lambda nb: gi[nb] * 0.10, hsn="7307", erect_fn=fit_erect)
hs_size_items("RMS", "Reducer MS", [200, 150, 100, 80, 65, 50, 40, 32], lambda nb: ms[nb] * 0.09, hsn="7307", erect_fn=fit_erect)

# Valves — DEMO ASSUMPTION price ladders (25 NB butterfly = ₹1,250 is from the client sheet).
BFV = {25: 1250, 50: 1800, 65: 2200, 80: 2600, 100: 3400, 150: 5600, 200: 8900, 250: 13500, 300: 18500}
GV = {50: 3200, 65: 4200, 80: 5200, 100: 7200, 150: 12500, 200: 21000, 250: 32000, 300: 45000}
BV = {25: 650, 32: 850, 40: 1150, 50: 1650}
NRV = {50: 2600, 65: 3200, 80: 3900, 100: 5200, 150: 8800, 200: 14500, 250: 22000, 300: 31000}
YS = {50: 2800, 65: 3500, 80: 4300, 100: 5800, 150: 9800, 200: 16500}
BEL = {50: 2400, 65: 2800, 80: 3200, 100: 3900, 150: 5600, 200: 7800}
FLG = {50: 450, 65: 550, 80: 650, 100: 850, 150: 1350, 200: 2100, 250: 3100, 300: 4200}
CPL = {25: 180, 32: 210, 40: 240, 50: 290, 65: 360, 80: 420, 100: 560, 150: 980, 200: 1650}
UCL = {25: 35, 32: 40, 40: 45, 50: 55, 65: 65, 80: 75, 100: 95, 150: 140}
GSK = {50: 60, 65: 70, 80: 85, 100: 110, 150: 160, 200: 230, 250: 320, 300: 420}
FV = {100: 18500, 150: 28000, 200: 42000}
FSW = {80: 6500, 100: 7200, 150: 8500}
valve_erect = lambda p, nb: max(250, p * 0.10)
hs_size_items("BFV", "Butterfly Valve", list(BFV), BFV.get, erect_fn=valve_erect,
              desc="CI butterfly valve IS 13095 PN16, CF8 disc, nitrile seat.")
hs_size_items("GV", "Gate Valve", list(GV), GV.get, erect_fn=valve_erect, desc="Double flanged sluice/gate valve PN 1.6, IS 780.")
hs_size_items("BV", "Ball Valve", list(BV), BV.get, erect_fn=lambda p, nb: 120, desc="Gun metal / brass ball valve, screwed.")
hs_size_items("NRV", "NRV", list(NRV), NRV.get, erect_fn=valve_erect, desc="CI dual plate non-return valve PN10.")
hs_size_items("YS", "Y Strainer", list(YS), YS.get, erect_fn=valve_erect, desc="Flanged CI Y-strainer with SS mesh.")
hs_size_items("BEL", "Bellows", list(BEL), BEL.get, erect_fn=valve_erect, desc="Neoprene rubber bellows / vibration eliminator.")
hs_size_items("FV", "Foot Valve", list(FV), FV.get, erect_fn=valve_erect)
hs_size_items("HVF", "Hydrant valve Flange", [80, 100], lambda nb: FLG[nb], hsn="7307", erect_fn=lambda p, nb: 80)
hs_size_items("NRVF", "NRV Flange", [50, 65, 80, 100, 150, 200, 250], FLG.get, hsn="7307", erect_fn=lambda p, nb: 80)
hs_size_items("BFVF", "Butterfly Valve flange", [50, 65, 80, 100, 150, 200, 250, 300], FLG.get, hsn="7307", erect_fn=lambda p, nb: 80)
hs_size_items("YSF", "Ystrainer Flange", [50, 65, 80, 100, 150, 200], FLG.get, hsn="7307", erect_fn=lambda p, nb: 80)
hs_size_items("CPL", "Coupling", list(CPL), CPL.get, hsn="7307", erect_fn=lambda p, nb: max(50, p * 0.15),
              sheet_key="coupling", desc="Grooved coupling, red finish.")
hs_size_items("UCL", "U Clamp", list(UCL), UCL.get, hsn="7326", erect_fn=lambda p, nb: 25)
hs_size_items("GSK", "Gasket", list(GSK), GSK.get, hsn="4016", erect_fn=lambda p, nb: 0)
hs_size_items("FS", "Flow Switch", list(FSW), FSW.get, hsn="9026", erect_fn=lambda p, nb: 600,
              desc="Vane type flow switch with junction box, UL/FM.")

# Standard / unsized hydrant items. Sheet price wins; else the DEMO price given here.
hs_std("SHV", "Single Hydrant Valve", erection=650, size="63mm", desc="SS single outlet landing valve, 63 mm instantaneous outlet, IS 5290.")
hs_std("DHV", "Double Hydrant Valve", price=11500, erection=750, size="63mm")
hs_std("FBI2", "2 way FBI valve", erection=1500, name="2 Way Fire Brigade Inlet", size="100NB")
hs_std("FBI4", "4 way FBI valve", price=21500, erection=2500, name="4 Way Fire Brigade Inlet", size="150NB")
hs_std("PG", "Pressure gauge", erection=250, hsn="9026", desc="Dial type pressure gauge 0-16 kg/cm2 with isolation valve.", reorder=2)
hs_std("PSW", "Pressure switch", erection=450, hsn="9026")
hs_std("HRD", "Hose reel drum", erection=1200, hsn="8424", desc="First aid hose reel drum, 30 m x 20 mm rubber hose, swinging type.")
hs_std("HBD", "Hose box double door", erection=500, hsn="7326")
hs_std("HBS", "Hose box single door", price=3900, erection=450, hsn="7326")
hs_std("RRL", "RRL Hose with SS", erection=150, hsn="4009", size="63mm x 15m", desc="RRL hose IS 636 Type A with SS male/female couplings.")
hs_std("DMP", "Dummy Plate", price=450, erection=50, hsn="7307")
hs_std("BRP", "Branch Pipe (nozzle)", erection=100, hsn="8424", desc="SS short branch pipe with 16 mm nozzle, 63 mm instantaneous coupling.")
hs_std("UNC", "Universal clamp", price=120, erection=30, hsn="7326")
hs_std("PLC", "Perlin Clamp", price=95, erection=30, hsn="7326")
hs_std("HCL", "Hose Clamp", price=60, erection=0, hsn="7326")
hs_std("RBH", "Rubber Hose", price=180, uom="Mtr", erection=0, hsn="4009")
hs_std("SPR-PEN", "Pendant Sprinkler", erection=150, hsn="8424", desc="Quick response pendant sprinkler 68°C K-80, glass bulb.", reorder=20)
hs_std("SPR-UPR", "Upright Sprinkler", price=550, erection=150, hsn="8424", desc="Quick response upright sprinkler 68°C K-80/K-115.", reorder=20)
hs_std("SPR-WAL", "Wall Sprinkler", price=650, erection=150, hsn="8424", desc="Horizontal sidewall sprinkler 68°C.")
hs_std("ROS", "Roser Plate", price=90, erection=20, hsn="7326", name="Rosette Plate")
hs_std("EPNL", "Electrical Panel", erection=6000, hsn="8537", desc="Pump starter panel (sheet price).")
hs_std("GBL", "Gang Bell", price=2800, erection=350, hsn="8531")
add("HS-ARV-25", "Air Release valve 25NB", "hydrant_sprinkler", "Air Release valve", size="25NB", hsn="8481",
    price=hs_rows["Air Release valve"]["sizes"][25], demo=False, erection=250)
add("HS-PRV-25", "Pressure Release valve 25NB", "hydrant_sprinkler", "Pressure Release valve", size="25NB", hsn="8481",
    price=hs_rows["Pressure Release valve"]["sizes"][25], demo=False, erection=250)
hs_std("DTK", "Diesel Tank", price=18000, erection=2500, hsn="7309", size="250L")
hs_std("BAT", "Battery", price=12500, erection=500, hsn="8507", size="12V 180Ah", name="Battery (Diesel Engine) 12V 180Ah")
hs_std("PNT", "Painting Charges", uom="Mtr", erection=0, hsn="9954", desc="Painting of pipes — red oxide primer + 2 coats enamel, per running metre.")
hs_std("ICV-150", "Installation Control Valve", price=145000, erection=12000, size="150NB", uom="Set",
       desc="Wet alarm valve ICV assembly with alarm motor gong, trim, gauges.")
hs_std("ORF-100", "Orifice Flange", price=1800, erection=300, size="100NB", hsn="7307")
hs_std("ITA-25", "Inspecting & Testing Assembly", price=6500, erection=800, size="25NB")
hs_std("SSF-1M", "SS Flexible Sprinkler Drop", price=1150, erection=200, size="1.0 m", hsn="8307")
hs_std("CBL2C", "2 C cable", price=85, uom="Mtr", hsn="8544", erection=25, volatile=True, size="2C x 1.5 sqmm", name="2C x 1.5 sqmm Cu Armoured Cable")
hs_std("CBL4C", "4 C cable", price=165, uom="Mtr", hsn="8544", erection=35, volatile=True, size="4C x 2.5 sqmm", name="4C x 2.5 sqmm Cu Armoured Cable")
hs_std("CBL6C", "6C cable", price=155, uom="Mtr", hsn="8544", erection=35, volatile=True, size="6C x 1.5 sqmm", name="6C x 1.5 sqmm Cu Armoured Cable")

# sub-sized hydrant items (sub-header row applies to the next item)
motor = hs_rows["Electrical Motor"]
assert motor["sub"][0][0] == "900LPM", motor
# Electrical Motor: 900 LPM = ₹1,20,000 (sheet); 1180 / 2250 LPM are DEMO ASSUMPTIONS.
for lpm, price, demo in [(900, 120000, False), (1180, 145000, True), (2250, 220000, True)]:
    add(f"HS-MTR-{lpm}", f"Electrical Motor {lpm} LPM", "hydrant_sprinkler", "Electrical Motor", size=f"{lpm} LPM",
        hsn="8501", price=price, demo=demo, erection=8000)
add("HS-PMP-STD", "Electrical Pump (bare pump set)", "hydrant_sprinkler", "Electrical Pump", hsn="8413",
    price=hs_rows["Electrical Pump"]["std"], demo=False, erection=8000)
add("HS-JKP-STD", "Jockey Pump (Jacky Pump)", "hydrant_sprinkler", "Jacky Pump", hsn="8413",
    price=hs_rows["Jacky Pump"]["std"], demo=False, erection=6000)
add("HS-DEN-STD", "Diesel Engine", "hydrant_sprinkler", "Diesel Engine", hsn="8408",
    price=hs_rows["Diesel Engine"]["std"], demo=False, erection=25000)
for lbl, price in [("250L", 9500), ("500L", 14500)]:
    add(f"HS-PTK-{lbl}", f"Primary Tank {lbl}", "hydrant_sprinkler", "Primary Tank", size=lbl, hsn="7309", price=price, erection=1500)
for lbl, price in [("M8", 45), ("M10", 65), ("M12", 95)]:
    add(f"HS-TR-{lbl}", f"Thread Rod with nut and washer {lbl}", "hydrant_sprinkler", "Thread Rod with nut and washer",
        size=lbl, uom="Mtr", hsn="7318", price=price, erection=15)
for lbl, price in [('3"', 18), ('4"', 22), ('5"', 26)]:
    add(f"HS-BN-{lbl[0]}IN", f"3/8 Bolt nut {lbl}", "hydrant_sprinkler", "3/8 Bolt nut", size=lbl, hsn="7318", price=price, erection=0)
for lbl, price in [("50x50", 260), ("75x50", 330)]:
    add(f"HS-LA-{lbl}", f"L Angle {lbl}", "hydrant_sprinkler", "L Angle", size=lbl, uom="Mtr", hsn="7216", price=price,
        erection=60, volatile=True)
for lbl, price in hs_rows["C Channel"]["sub"]:
    add(f"HS-CCH-{lbl}", f"C Channel {lbl}", "hydrant_sprinkler", "C Channel", size=lbl, uom="Mtr", hsn="7216",
        price=float(price), demo=False, erection=rnd(price * 0.15), volatile=True)
for lbl, code, price in [('1/2"', "15", 35), ('3/4"', "20", 45), ('1"', "25", 60)]:
    add(f"HS-NIP-{code}", f"Pipe Nipple {lbl}", "hydrant_sprinkler", "Pipe Nipple", size=lbl, hsn="7307", price=price, erection=10)
for lbl, code, price in [("25/20", "2520", 55), ("25/25", "2525", 65)]:
    add(f"HS-HNP-{code}", f"Hose Nipple {lbl}", "hydrant_sprinkler", "Hose Nipple", size=lbl, hsn="7307", price=price, erection=10)

# ------------------------------------------------------------------ Fire Alarm
ws = wb["Fire Alarm"]
fa_items = [" ".join(str(ws[f"B{r}"].value).split()) for r in range(7, 24)]
fa_makes = [" ".join(str(ws[f"{c}6"].value).split()) for c in "CDEFGHIJKL"]
assert len(fa_items) == 17 and fa_makes[2] == "Ravel", (fa_items, fa_makes)
MAKE_CODES = {
    "Honey well / Morle/System sensor": ("HON", "Honeywell/Morley/System Sensor", 1.55),
    "Honey well / Morle/System sensor UL": ("HONUL", "Honeywell/Morley/System Sensor UL", 1.55 * 1.3),
    "Ravel": ("RAV", "Ravel", 1.0), "Ravel UL": ("RAVUL", "Ravel UL", 1.3),
    "Glyptic": ("GLY", "Glyptic", 0.85), "Glyptic UL": ("GLYUL", "Glyptic UL", 0.85 * 1.3),
    "Edwards": ("EDW", "Edwards", 1.65), "Edwards UL": ("EDWUL", "Edwards UL", 1.65 * 1.3),
    "ASES": ("ASE", "ASES", 0.8), "ASES UL": ("ASEUL", "ASES UL", 0.8 * 1.3),
}
# DEMO ASSUMPTION — Ravel (non-UL) base prices; other makes = Ravel x make factor above.
FA_DEF = {
    "Fire alarm Panel Analog conventional": ("PNC", "Fire Alarm Panel Conventional", "4 Zone", 14500, 5000, 0),
    "Fire alarm Panel Analog Addressable": ("PNA", "Fire Alarm Panel Addressable", "2 Loop", 85000, 12000, 0),
    "Heat Detector": ("HD", "Heat Detector", None, 450, 250, 10),
    "Heat Detector Addressable": ("HDA", "Heat Detector Addressable", None, 1650, 250, 10),
    "Smoke Detector": ("SD", "Smoke Detector", None, 550, 250, 10),
    "Smoke Detector Addressable": ("SDA", "Smoke Detector Addressable", None, 1800, 250, 10),
    "Multi Detector": ("MD", "Multi Detector", None, 850, 250, 10),
    "Multi Detector Addressable": ("MDA", "Multi Detector Addressable", None, 2400, 250, 10),
    "Beam Detector": ("BD", "Beam Detector", "15-100 m", 32000, 600, 0),
    "Beam Detector Addressable": ("BDA", "Beam Detector Addressable", "15-100 m", 42000, 600, 0),
    "Gas Detector": ("GD", "Gas Detector", None, 3800, 600, 0),
    "Gas Detector Addressable": ("GDA", "Gas Detector Addressable", None, 6500, 600, 0),
    "Base": ("BASE", "Detector Base", None, 180, 150, 10),
    "Hooter": ("HTR", "Hooter cum Strobe", None, 1100, 350, 5),
    "MCP": ("MCP", "Manual Call Point", None, 650, 300, 5),
    "Isolator Module": ("ISO", "Isolator Module", None, 1900, 400, 5),
    "Control Module": ("CM", "Control Module", None, 2600, 400, 5),
}
for it in fa_items:
    abbr, group, size, base, erect, reorder = FA_DEF[it]
    for mk in fa_makes:
        mcode, mname, factor = MAKE_CODES[mk]
        add(f"FA-{abbr}-{mcode}", f"{group}{' ' + size if size else ''} — {mname}", "fire_alarm", group, size=size,
            make=mname, hsn="8531", price=rnd(base * factor), erection=erect, reorder=reorder if mcode in ("RAV", "HON", "RAVUL") else 0)
# extra fire alarm items needed by the BOQ templates (all DEMO prices)
for mcode, mname, factor in [("RAV", "Ravel", 1.0), ("HON", "Honeywell/Morley/System Sensor", 1.55)]:
    add(f"FA-RPT-{mcode}", f"Repeater Panel (Active, Touch Screen) — {mname}", "fire_alarm", "Repeater Panel", make=mname,
        hsn="8531", price=rnd(38000 * factor), erection=5000)
    add(f"FA-MM-{mcode}", f"Monitor Module — {mname}", "fire_alarm", "Monitor Module", make=mname, hsn="8531",
        price=rnd(2200 * factor), erection=400, reorder=5 if mcode == "RAV" else 0)
add("FA-PN8-HON", "Fire Alarm Panel Addressable 8 Loop (Networkable) — Honeywell/Morley/System Sensor", "fire_alarm",
    "Fire Alarm Panel Addressable", size="8 Loop", make="Honeywell/Morley/System Sensor", hsn="8531", price=485000, erection=25000)
add("FA-PN8-EDW", "Fire Alarm Panel Addressable 8 Loop (Networkable) — Edwards", "fire_alarm",
    "Fire Alarm Panel Addressable", size="8 Loop", make="Edwards", hsn="8531", price=520000, erection=25000)
add("FA-NWM-HON", "Network Module RS485 — Honeywell/Morley/System Sensor", "fire_alarm", "Network Module",
    make="Honeywell/Morley/System Sensor", hsn="8531", price=28000, erection=1500)
add("FA-RI-STD", "Response Indicator (LED)", "fire_alarm", "Response Indicator", hsn="8531", price=350, erection=150, reorder=10)
add("FA-PSB-RAV", "Power Supply Booster Unit — Ravel", "fire_alarm", "Power Supply Booster", make="Ravel", hsn="8504", price=18500, erection=1500)
# FRLS cable by make (sheet row 18) — DEMO price per metre for 2C x 1.5 sqmm armoured
ws_cable_makes = [" ".join(str(ws[f"{c}24"].value).split()) for c in "CDEFGHIJ"]
CABLE_F = {"Polycab": ("POL", 1.0), "LAP": ("LAP", 0.92), "Ambika": ("AMB", 0.85), "Orbit": ("ORB", 0.82)}
for mk in ws_cable_makes:
    ul = mk.endswith(" UL")
    base = mk[:-3] if ul else mk
    code, f = CABLE_F[base]
    if ul:
        code, f = code + "UL", f * 1.25
    add(f"FA-CBL2-{code}", f"FRLS Cable 2C x 1.5 sqmm Armoured — {mk}", "fire_alarm", "FRLS cable", size="2C x 1.5 sqmm",
        make=mk, uom="Mtr", hsn="8544", price=round(68 * f, 0), erection=18, volatile=True)
for code, mk, p in [("POL", "Polycab", 118), ("LAP", "LAP", 108)]:
    add(f"FA-CBL6-{code}", f"FRLS Cable 6C x 1.5 sqmm Armoured — {mk}", "fire_alarm", "FRLS cable", size="6C x 1.5 sqmm",
        make=mk, uom="Mtr", hsn="8544", price=p, erection=25, volatile=True)
    add(f"FA-FSC-{code}", f"Fire Survival Cable LSZH 2C x 1.5 sqmm — {mk}", "fire_alarm", "Fire Survival Cable", size="2C x 1.5 sqmm",
        make=mk, uom="Mtr", hsn="8544", price=round(p * 1.25), erection=20, volatile=True)
add("FA-BBX-STD", "Back box (detector / MCP)", "fire_alarm", "Back box", hsn="8538", price=85, erection=0, reorder=20)
for mk, code, p in [("Exide", "EXI", 1450), ("Amaron", "AMA", 1550)]:
    add(f"FA-BAT-{code}", f"Battery SMF 12V 7Ah — {mk}", "fire_alarm", "Battery", size="12V 7Ah", make=mk, hsn="8507", price=p, erection=0, reorder=4)

# ------------------------------------------------------------------ PA system (DEMO prices)
add("PA-VEC-6Z", "Digital Voice Evacuation Controller 6 Zone (1000W, EN54-16)", "pa_system", "Voice Evacuation Controller",
    size="6 Zone", make="Honeywell", hsn="8543", price=345000, erection=15000)
add("PA-AMP-250", "Power Amplifier Dual Channel 250W", "pa_system", "Power Amplifier", size="250W", make="Ahuja", hsn="8518",
    price=28500, erection=2500)
add("PA-HSP-15", "Horn Speaker 15W (100V line)", "pa_system", "Horn Speaker", size="15W", make="Ahuja", hsn="8518", price=1650, erection=300, reorder=5)
add("PA-CSP-6", "Ceiling Speaker 6W (100V line)", "pa_system", "Ceiling Speaker", size="6W", make="Ahuja", hsn="8518", price=950, erection=250, reorder=5)

# ------------------------------------------------------------------ Extinguishers
ws = wb["New Fire Extinguishers"]
ext_new_rows = [ws[f"B{r}"].value for r in range(7, 30) if ws[f"B{r}"].value]
ext_ref_rows = [ws[f"J{r}"].value for r in range(7, 33) if ws[f"J{r}"].value]
spare_rows = [ws[f"P{r}"].value for r in range(7, 14) if ws[f"P{r}"].value]
assert ext_new_rows[0] == "ABC 2 Kg" and "Clean Agent" in ext_new_rows and "Foam" in ext_new_rows, ext_new_rows


def ext_types():
    """Expand the sheet's type rows into concrete sizes. Clean Agent & Foam have blank size rows in the sheet."""
    out = []
    for t in ext_new_rows:
        t = " ".join(str(t).split())
        m = re.match(r"(ABC|CO2)\s*([\d.]+)\s*Kg", t, re.I)
        if m:
            out.append((m.group(1).upper(), m.group(2), "Kg"))
        elif t == "Clean Agent":
            out += [("Clean Agent", "2", "Kg"), ("Clean Agent", "4", "Kg"), ("Clean Agent", "6", "Kg")]
        elif t == "Foam":
            out += [("Foam", "9", "Ltr"), ("Foam", "50", "Ltr")]
    return out


# DEMO ASSUMPTION — Safex new-extinguisher prices; Chakraa = 92% of Safex.
NEW_SAFEX = {("ABC", "2"): 1450, ("ABC", "4"): 2100, ("ABC", "6"): 2650, ("ABC", "9"): 3600, ("ABC", "25"): 11500, ("ABC", "50"): 19500,
             ("CO2", "2"): 5200, ("CO2", "4.5"): 7800, ("CO2", "9"): 12500, ("CO2", "25"): 26500, ("CO2", "50"): 42000,
             ("Clean Agent", "2"): 6800, ("Clean Agent", "4"): 11500, ("Clean Agent", "6"): 15500,
             ("Foam", "9"): 3200, ("Foam", "50"): 22000}
# DEMO ASSUMPTION — refilling charge per cylinder (Safex consumables); Chakraa = 95%.
REF_SAFEX = {("ABC", "2"): 380, ("ABC", "4"): 520, ("ABC", "6"): 650, ("ABC", "9"): 850, ("ABC", "25"): 2200, ("ABC", "50"): 4000,
             ("CO2", "2"): 650, ("CO2", "4.5"): 950, ("CO2", "9"): 1500, ("CO2", "25"): 3800, ("CO2", "50"): 6500,
             ("Clean Agent", "2"): 2800, ("Clean Agent", "4"): 5200, ("Clean Agent", "6"): 7500,
             ("Foam", "9"): 650, ("Foam", "50"): 3200}
EXT_MAKES = [("Chakraa", "CHK", 0.92, 0.95), ("Safex", "SFX", 1.0, 1.0)]
for typ, sz, unit in ext_types():
    tcode = {"ABC": "ABC", "CO2": "CO2", "Clean Agent": "CA", "Foam": "FOAM"}[typ] + sz.replace(".", "")
    label = f"{typ} {sz} {unit}"
    big = float(sz) >= 25
    for mk, mcode, fnew, fref in EXT_MAKES:
        reorder = 5 if (typ in ("ABC", "CO2") and sz in ("4", "4.5", "6", "9")) else (2 if not big else 0)
        add(f"EXN-{tcode}-{mcode}", f"Fire Extinguisher {label}{' (Trolley)' if big else ''} — {mk}", "extinguisher_new", f"{typ} Extinguisher",
            size=f"{sz} {unit}", make=mk, hsn="8424", price=rnd(NEW_SAFEX[(typ, sz)] * fnew), erection=500 if big else 150,
            reorder=reorder, desc="ISI marked, with wall bracket / trolley as applicable.")
        add(f"EXR-{tcode}-{mcode}", f"Refilling {label} — {mk}", "extinguisher_refill", f"{typ} Refilling", size=f"{sz} {unit}", make=mk,
            hsn="998719", price=rnd(REF_SAFEX[(typ, sz)] * fref), erection=0,
            desc="Refilling charge per cylinder incl. pressure test of valve assembly.")

# Spares (DEMO prices) + zebra boards & stand listed under the refilling block
SPARES = {"Nozzle": ("NOZ", 120), "Handle": ("HDL", 180), "Washer": ("WSH", 25), "Body belt": ("BLT", 90),
          "Tube": ("TUB", 220), "horn": ("HRN", 350), "valve": ("VLV", 750)}
for s in spare_rows:
    s = " ".join(str(s).split())
    code, p = SPARES[s]
    nm = s[0].upper() + s[1:]
    add(f"SP-{code}", f"Extinguisher {nm}", "spares", nm, hsn="8424", price=p, erection=0, reorder=10 if code == "WSH" else 0)
for s in ext_ref_rows:
    s = " ".join(str(s).split())
    if s.startswith("Zebra board ABC"):
        add("SP-ZBA", "Zebra Sign Board — ABC / Foam", "spares", "Zebra board ABC / foam", hsn="3926", price=180, erection=30)
    elif s.startswith("Zebra board CO2"):
        add("SP-ZBC", "Zebra Sign Board — CO2", "spares", "Zebra board CO2", hsn="3926", price=180, erection=30)
    elif s == "Stand":
        add("SP-STD", "Extinguisher Stand (Double)", "spares", "Stand", hsn="7326", price=650, erection=50)

# ------------------------------------------------------------------ general items used by BOQ templates (DEMO prices)
G = [
    ("GN-PMP-EL2280", "Electric Main Fire Pump 2280 LPM @ 80 m head (with motor)", "Fire Pump", "2280 LPM", "Nos", "8413", 485000, 35000),
    ("GN-PMP-DE2280", "Diesel Engine Driven Fire Pump 2280 LPM (stand-by)", "Fire Pump", "2280 LPM", "Nos", "8413", 1250000, 45000),
    ("GN-PMP-JK180", "Jockey Pump 180 LPM @ 80 m head", "Fire Pump", "180 LPM", "Nos", "8413", 145000, 12000),
    ("GN-PMP-BS900", "Booster Pump 900 LPM @ 80 m head", "Fire Pump", "900 LPM", "Nos", "8413", 235000, 18000),
    ("GN-FFP-415", "Fire Fighting Pump Panel 415V (MCC, IP52, as per SLD)", "Electrical Panel", "415V", "Nos", "8537", 285000, 15000),
    ("GN-PV-450", "Pressure Vessel 450 mm dia x 2.0 m (8 mm MS)", "Pressure Vessel", "450x2000", "Nos", "7311", 68000, 6000),
    ("GN-TNK-ZN100", "Zincalume Water Tank 100 cum (overground)", "Water Tank", "100 cum", "Nos", "7309", 1450000, 0),
    ("GN-TNK-GFS20", "Glass Fused Steel Tank 20 cum", "Water Tank", "20 cum", "Nos", "7309", 520000, 0),
    ("GN-CBL-35C150AL", "Cable 3.5C x 150 sqmm Al Armoured XLPE", "Power Cable", "3.5C x 150 sqmm", "Mtr", "8544", 780, 85),
    ("GN-CBL-3C25CU", "Cable 3C x 25 sqmm Cu Armoured XLPE", "Power Cable", "3C x 25 sqmm", "Mtr", "8544", 920, 75),
    ("GN-CBL-3C16CU", "Cable 3C x 16 sqmm Cu Flexible", "Power Cable", "3C x 16 sqmm", "Mtr", "8544", 640, 60),
    ("GN-CTR-100", "Perforated GI Cable Tray 100 x 50 mm", "Cable Tray", "100x50", "Mtr", "7308", 420, 120),
    ("GN-EST-25", "GI Earthing Strip 25 x 6 mm", "Earthing", "25x6", "Mtr", "7326", 210, 60),
    ("GN-EXH-150", "Diesel Exhaust Pipe 150 mm with insulation & Al cladding", "Exhaust Pipe", "150NB", "Mtr", "7306", 3800, 750),
    ("GN-WRP-150", "Wrapping & Coating of UG pipe 150 mm (4 mm tape)", "Wrapping & Coating", "150NB", "Mtr", "3919", 450, 120),
    ("GN-STL-KG", "Structural Steel supports (fabricated, painted)", "Structural Steel", None, "Kg", "7308", 95, 35),
    ("GN-HPS-STD", "Hitech Pipe Support (tie rod + clamp + purlin clamp)", "Pipe Support", None, "Nos", "7326", 350, 80),
    ("GN-SBK-4", "Fire Bucket Set (4 nos) with MS stand", "Fire Bucket", "4 Nos", "Set", "7326", 4400, 300),
    ("GN-CND-20", "GI Conduit 20 mm with accessories", "GI Conduit", "20mm", "Mtr", "7306", 95, 45),
    ("GN-CND-25", "GI Conduit 25 mm with accessories", "GI Conduit", "25mm", "Mtr", "7306", 120, 50),
    ("GN-CAT6", "UTP CAT6 4 Pair LAN Cable", "LAN Cable", "CAT6", "Mtr", "8544", 38, 12),
]
for code, name, group, size, uom, hsn, price, er in G:
    add(code, name, "general", group, size=size, uom=uom, hsn=hsn, price=price, erection=er,
        volatile=hsn in ("8544", "7306"), markup=35 if hsn == "7306" else 40)

# ------------------------------------------------------------------ BOQ templates from the quotation workbook
wb2 = openpyxl.load_workbook(BOQ_XLSX)
item_by_code = {i["code"]: i for i in items}


def last_size(desc):
    m = re.findall(r"(\d+)\s*mm\s*dia", desc, re.I)
    if m:
        return int(m[-1])
    m = re.findall(r"(\d+)\s*(?:NB|MM)\b", desc)
    return int(m[-1]) if m else None


def sized(prefix, desc):
    s = last_size(desc)
    code = f"{prefix}-{s}" if s else None
    return code if code in item_by_code else None


HS_RULES = [
    (r"^Making end termination", lambda d: None),
    (r"booster Pump", lambda d: "GN-PMP-BS900"),
    (r"installation control valve", lambda d: "HS-ICV-150"),
    (r"pressure vessel", lambda d: "GN-PV-450"),
    (r"Electric Motor Driven Pump", lambda d: "GN-PMP-EL2280"),
    (r"Diesel Engine Driven Fire Pump", lambda d: "GN-PMP-DE2280"),
    (r"Driven Jockey Pump", lambda d: "GN-PMP-JK180"),
    (r"sluice/Gate", lambda d: sized("HS-GV", d)),
    (r"REMOVING", lambda d: None),
    (r"butterfly valve as per IS", lambda d: sized("HS-BFV", d)),
    (r"Y-strainer", lambda d: sized("HS-YS", d)),
    (r"dual plate non-return", lambda d: sized("HS-NRV", d)),
    (r"pressure gauge|Pressure gauges", lambda d: "HS-PG"),
    (r"vibration eliminators", lambda d: sized("HS-BEL", d)),
    (r"black steel pipes", lambda d: sized("HS-PMS", d)),
    (r"Exhaust pipe", lambda d: "GN-EXH-150"),
    (r"^Fire Fighting Panel", lambda d: "GN-FFP-415"),
    (r"3\.5C x 150", lambda d: "GN-CBL-35C150AL"),
    (r"3C x ?25 Sqmm Cu", lambda d: "GN-CBL-3C25CU"),
    (r"3C x 16 Sqmm", lambda d: "GN-CBL-3C16CU"),
    (r"4C x 2\.5", lambda d: "HS-CBL4C"),
    (r"cable tray", lambda d: "GN-CTR-100"),
    (r"Earthing strips", lambda d: "GN-EST-25"),
    (r"Pressure Switches", lambda d: "HS-PSW"),
    (r"Zincalume water tank", lambda d: "GN-TNK-ZN100"),
    (r"Glass Fused Steel Tank", lambda d: "GN-TNK-GFS20"),
    (r"GI\s+Pipe \(IS: 1239", lambda d: sized("HS-PGI", d)),
    (r"Fire Hydrant Valve", lambda d: "HS-SHV"),
    (r"Hose Reel", lambda d: "HS-HRD"),
    (r"Hose Pipe marked to IS:636", lambda d: "HS-RRL"),
    (r"Branch Pipe", lambda d: "HS-BRP"),
    (r"hose cabinet \(0.75x0.60x0.25\) Indoor", lambda d: "HS-HBS"),
    (r"weather proof standard hose cabinet", lambda d: "HS-HBD"),
    (r"Orifice Flange", lambda d: "HS-ORF-100"),
    (r"Inspecting & Testing Assembly", lambda d: "HS-ITA-25"),
    (r"Four Way Fire Brigade Inlet", lambda d: "HS-FBI4"),
    (r"Wrapping and Coating", lambda d: "GN-WRP-150"),
    (r"sprinkler heads", lambda d: "HS-SPR-PEN"),
    (r"air release valves", lambda d: "HS-ARV-25"),
    (r"flow indicating switches", lambda d: sized("HS-FS", d)),
    (r"SS flexible", lambda d: "HS-SSF-1M"),
    (r"Structural Steel", lambda d: "GN-STL-KG"),
    (r"Hitech Pipe Supports", lambda d: "GN-HPS-STD"),
    (r"10 mm Gi threaded tie rod", lambda d: "HS-TR-M10"),
    (r"Mechanical  Foam type", lambda d: "EXN-FOAM9-SFX"),
    (r"Fixing ABC type fire extinguishers", lambda d: "EXN-ABC6-SFX"),
    (r"trolley mounted", lambda d: "EXN-CO225-SFX"),
    (r"Clean Agent \(HFC 236\)", lambda d: "EXN-CA6-SFX"),
    (r"sand bucket", lambda d: "GN-SBK-4"),
    (r"^MS PIPE \d+NB", lambda d: sized("HS-PMS", d)),
    (r"UPRIGHT & PENTANT SPRINKLER", lambda d: "HS-SPR-UPR"),
    (r"rosette plate", lambda d: "HS-ROS"),
    (r"mild steel support work", lambda d: "GN-STL-KG"),
]


def fa_rules(mk):
    return [
        (r"CAT 6 LAN Cable", lambda d: "GN-CAT6"),
        (r"^2 Loop Panel", lambda d: f"FA-PNA-{mk}"),
        (r"8 Loops Fire Alarm Control Panel", lambda d: "FA-PN8-HON"),
        (r"Network Module", lambda d: "FA-NWM-HON"),
        (r"Repeater Panel|Repeator", lambda d: f"FA-RPT-{mk}"),
        (r"Multisensor Detector|Multi- Sensor", lambda d: f"FA-MDA-{mk}"),
        (r"Heat Detector|Multi-Heat sensor", lambda d: f"FA-HDA-{mk}"),
        (r"Beam Detector", lambda d: f"FA-BDA-{mk}"),
        (r"Response Indicator|response Indicators", lambda d: "FA-RI-STD"),
        (r"sensor common mounting base", lambda d: f"FA-BASE-{mk}"),
        (r"Manual Call Point", lambda d: f"FA-MCP-{mk}"),
        (r"Sounder & Visual Strobe|Hooter cum strobe", lambda d: f"FA-HTR-{mk}"),
        (r"Input/Output module|fire control module", lambda d: f"FA-CM-{mk}"),
        (r"Monitor module", lambda d: f"FA-MM-{mk}"),
        (r"Fire Survival Cable|fire survival armoured cable", lambda d: "FA-FSC-POL"),
        (r"2Cx1\.5 sq mm FRLS", lambda d: "FA-CBL2-POL"),
        (r"6Cx1\.5 sq mm FRLS", lambda d: "FA-CBL6-POL"),
        (r"Power supply booster", lambda d: "FA-PSB-RAV"),
        (r"Voice Evacuation system for 6 Zones", lambda d: "PA-VEC-6Z"),
        (r"250W Power Amplifier", lambda d: "PA-AMP-250"),
        (r"horn type Speaker", lambda d: "PA-HSP-15"),
        (r"ceiling\s+Mounted Voice Evacuation Speaker", lambda d: "PA-CSP-6"),
        (r"^20 mm dia", lambda d: "GN-CND-20"),
        (r"^25 mm dia", lambda d: "GN-CND-25"),
    ]


def match(desc, rules):
    for pat, fn in rules:
        if re.search(pat, desc, re.I):
            code = fn(desc)
            if code is not None and code not in item_by_code:
                raise SystemExit(f"rule {pat} -> unknown code {code}")
            return code
    return None


def guess_uom(desc, code):
    if code:
        return item_by_code[code]["uom"]
    d = desc.lower()
    if re.search(r"pipe|cable|conduit", d) and not re.search(r"valve|sprinkler", d):
        return "Mtr"
    if "structural steel" in d or "mild steel support" in d:
        return "Kg"
    if "recomissioning" in d:
        return "LS"
    return "Nos"


def clean(s):
    return str(s).replace(" ", " ").strip() if s is not None else ""


templates = []

# Sheet 1: Hydrant & Sprinkler — new installation
ws = wb2["Hydrat & Sprinkler-1"]
SEC1 = {"A": "A - Pump House & Tanks", "B": "B - Hydrant System", "C": "C - Sprinkler System", "D": "D - Fire Extinguishers"}
lines, section, n = [], None, 0
for r in range(3, ws.max_row + 1):
    ref, desc = clean(ws[f"A{r}"].value), clean(ws[f"B{r}"].value)
    if ref in SEC1:
        section = SEC1[ref]
        continue
    if not desc:
        continue
    if ref == "4C..1":
        ref = "C.4.1"   # typo in the client sheet
    code = match(desc, HS_RULES)
    n += 1
    lines.append({"sortOrder": n, "boqRef": ref or None, "section": section, "itemCode": code, "description": desc,
                  "uom": guess_uom(desc, code), "defaultQty": 0})
templates.append({"key": "hs1", "name": "Hydrant & Sprinkler — New Installation (Sample 1)", "system": "hydrant_sprinkler",
                  "description": "Full hydrant + sprinkler + pump house BOQ from the client's sample quotation (sheet 'Hydrat & Sprinkler-1').",
                  "lines": lines})

# Sheet 2: Sprinkler modification / retrofit (refs are formulas =A3+0.1 ...)
ws = wb2["Hydrant Sprinkler-2"]
lines, n, refs = [], 0, {}


def ref_value(r):
    v = ws[f"A{r}"].value
    if isinstance(v, (int, float)):
        return float(v)
    m = re.fullmatch(r"=A(\d+)\+([\d.]+)", str(v).strip())
    if m:
        return refs[int(m.group(1))] + float(m.group(2))
    return None


section = None
for r in range(3, ws.max_row + 1):
    title, body = clean(ws[f"B{r}"].value), clean(ws[f"C{r}"].value)
    if title.upper() == "TOTAL" or clean(ws[f"A{r}"].value).upper() == "TOTAL":
        continue
    v = ref_value(r)
    refs[r] = v
    if not title and not body:
        continue
    is_sub = abs(v - round(v)) > 1e-9
    ref = f"{v:.1f}" if is_sub else str(int(round(v)))
    if not is_sub:
        section = f"{ref} - {title.strip()}"
        desc = body or title
    else:
        desc = f"{title.strip()} {body}"
    code = match(desc, HS_RULES)
    n += 1
    lines.append({"sortOrder": n, "boqRef": ref, "section": section, "itemCode": code, "description": desc,
                  "uom": guess_uom(desc, code), "defaultQty": 0})
assert [l["boqRef"] for l in lines][:4] == ["1", "1.1", "1.2", "1.3"], lines[:4]
templates.append({"key": "hs2", "name": "Sprinkler Modification / Retrofit (Sample 2)", "system": "hydrant_sprinkler",
                  "description": "Sprinkler line modification BOQ incl. dismantling / reuse items (sheet 'Hydrant Sprinkler-2').",
                  "lines": lines})

# Sheet 3: FAS & PA (2-loop addressable, Ravel class)
ws = wb2["FAS & PA-1"]
SEC3 = {"A": "A - Addressable Fire Detection & Alarm", "B": "B - PA / Voice Evacuation"}
lines, n, section = [], 0, None
rules = fa_rules("RAV")
for r in range(3, ws.max_row + 1):
    ref, desc = clean(ws[f"A{r}"].value), clean(ws[f"B{r}"].value)
    if ref in SEC3:
        section = SEC3[ref]
        continue
    if not desc or desc.upper().startswith("TOTAL") or desc.startswith("Grand Total") or desc == "Fire Alarm System":
        continue
    code = match(desc, rules)
    n += 1
    lines.append({"sortOrder": n, "boqRef": ref or None, "section": section, "itemCode": code, "description": desc,
                  "uom": guess_uom(desc, code), "defaultQty": 0})
templates.append({"key": "fa1", "name": "Fire Alarm (2-Loop Addressable) & PA System", "system": "fire_alarm",
                  "description": "2-loop addressable FAS with voice evacuation PA (sheet 'FAS & PA-1'). Default make mapping: Ravel.",
                  "lines": lines})

# Sheet 4: FAS 8-loop networked (Honeywell/Morley class)
ws = wb2["FAS-2"]
lines, n, section = [], 0, "1 - Fire Alarm System"
rules = fa_rules("HON")
prev = None
for r in range(3, ws.max_row + 1):
    raw, desc = ws[f"A{r}"].value, clean(ws[f"B{r}"].value)
    if not desc or desc.upper().startswith("TOTAL") or desc == "Fire Alarm System":
        continue
    if isinstance(raw, float):
        # 1.1 after 1.9 is really 1.10 (Excel numeric refs)
        s = f"{raw:g}"
        if s == "1.1" and prev == "1.9":
            s = "1.10"
        ref = s
    elif isinstance(raw, int):
        ref = str(raw)
    else:
        ref = clean(raw) or None
    if desc == "CABLING & WIRING":
        section = "1.13 - Cabling & Wiring"
        prev = ref
        continue
    if desc == "MISCELLANEOUS ITEM":
        section = "2 - Miscellaneous"
        continue
    if ref and re.fullmatch(r"1\.\d+", ref):
        prev = ref
    code = match(desc, rules)
    n += 1
    lines.append({"sortOrder": n, "boqRef": ref, "section": section, "itemCode": code, "description": desc,
                  "uom": guess_uom(desc, code), "defaultQty": 0})
templates.append({"key": "fa2", "name": "Fire Alarm (8-Loop Networked)", "system": "fire_alarm",
                  "description": "8-loop networkable LPCB panel BOQ (sheet 'FAS-2'). Default make mapping: Honeywell/Morley/System Sensor.",
                  "lines": lines})


def quick(key, name, system, desc, spec):
    ls = []
    for i, (section, code, qty) in enumerate(spec, 1):
        it = item_by_code[code]
        ls.append({"sortOrder": i, "boqRef": None, "section": section, "itemCode": code, "description": it["name"],
                   "uom": it["uom"], "defaultQty": qty})
    templates.append({"key": key, "name": name, "system": system, "description": desc, "lines": ls})


quick("hsq", "Hydrant System — Standard (by size range)", "hydrant_sprinkler",
      "Quick-start hydrant ring main for a mid-size factory shed. Adjust sizes/quantities; zero-qty lines are dropped from the quote.", [
          ("A - Piping", "HS-PGI-150", 60), ("A - Piping", "HS-PGI-100", 120), ("A - Piping", "HS-PGI-80", 60),
          ("A - Piping", "HS-PGI-65", 30), ("A - Piping", "HS-PGI-50", 0), ("A - Piping", "HS-EGI-150", 6),
          ("A - Piping", "HS-EGI-100", 12), ("A - Piping", "HS-EGI-80", 8), ("A - Piping", "HS-RGI-150", 2), ("A - Piping", "HS-RGI-100", 4),
          ("A - Piping", "HS-UCL-150", 20), ("A - Piping", "HS-UCL-100", 40), ("A - Piping", "HS-PNT", 270),
          ("B - Valves", "HS-BFV-150", 2), ("B - Valves", "HS-BFV-100", 4), ("B - Valves", "HS-NRV-150", 1),
          ("B - Valves", "HS-YS-150", 1), ("B - Valves", "HS-BFVF-150", 4), ("B - Valves", "HS-PG", 2), ("B - Valves", "HS-ARV-25", 2),
          ("C - Hydrant Accessories", "HS-SHV", 6), ("C - Hydrant Accessories", "HS-HBS", 6), ("C - Hydrant Accessories", "HS-RRL", 12),
          ("C - Hydrant Accessories", "HS-BRP", 6), ("C - Hydrant Accessories", "HS-HRD", 6), ("C - Hydrant Accessories", "HS-FBI4", 1),
      ])
quick("exn", "Fire Extinguishers — New Supply", "extinguisher_new",
      "Quick-start supply of portable extinguishers with signage and stands (Safex defaults).", [
          ("A - Extinguishers", "EXN-ABC6-SFX", 10), ("A - Extinguishers", "EXN-ABC4-SFX", 6),
          ("A - Extinguishers", "EXN-CO245-SFX", 4), ("A - Extinguishers", "EXN-CO29-SFX", 2),
          ("A - Extinguishers", "EXN-CA2-SFX", 2), ("A - Extinguishers", "EXN-FOAM9-SFX", 0),
          ("B - Accessories", "SP-ZBA", 10), ("B - Accessories", "SP-ZBC", 6), ("B - Accessories", "SP-STD", 4),
      ])
quick("exr", "Extinguisher Refilling — Annual", "extinguisher_refill",
      "Annual refilling contract for an existing extinguisher population (Safex consumables).", [
          ("A - Refilling", "EXR-ABC6-SFX", 10), ("A - Refilling", "EXR-ABC4-SFX", 6), ("A - Refilling", "EXR-CO245-SFX", 4),
          ("A - Refilling", "EXR-CO29-SFX", 2), ("A - Refilling", "EXR-FOAM9-SFX", 2),
          ("B - Spares", "SP-WSH", 20), ("B - Spares", "SP-NOZ", 4), ("B - Spares", "SP-TUB", 2),
      ])

# ------------------------------------------------------------------ write TS modules
os.makedirs(OUT, exist_ok=True)
HEADER = "// AUTO-GENERATED by work/scripts/build_seed.py from the client's Excel files — do not edit by hand.\n"


def js(o):
    return json.dumps(o, ensure_ascii=False)


with open(os.path.join(OUT, "items.ts"), "w", encoding="utf-8", newline="\n") as f:
    f.write(HEADER)
    f.write("// Prices present in 'Price list for Hydrandt and Fire alarm.xlsx' are used verbatim (formula cells evaluated).\n")
    f.write("// Every item with demoPrice: true has a DEMO ASSUMPTION — client to confirm — list price (realistic Indian-market estimate).\n\n")
    f.write("export interface SeedItem {\n  code: string; name: string; system: string; groupName: string; size: string | null; make: string | null;\n"
            "  uom: string; hsn: string | null; gstRate: number; listPrice: number | null; markupPct: number; erectionRate: number;\n"
            "  reorderLevel: number; volatilePrice: boolean; description: string | null; demoPrice: boolean;\n}\n\n")
    f.write("export const SEED_ITEMS: SeedItem[] = [\n")
    for it in items:
        f.write("  " + js(it) + ",\n")
    f.write("];\n")

with open(os.path.join(OUT, "boq-templates.ts"), "w", encoding="utf-8", newline="\n") as f:
    f.write(HEADER)
    f.write("// Lines reference items by code (resolved to ids at seed time). Descriptions are verbatim from\n")
    f.write("// 'Hydrant,Sprinkler & Fas,PA-Quotation Sampel- Karthick_3122.xlsx'.\n\n")
    f.write("export interface SeedTemplateLine {\n  sortOrder: number; boqRef: string | null; section: string | null; itemCode: string | null;\n"
            "  description: string; uom: string; defaultQty: number;\n}\n")
    f.write("export interface SeedTemplate {\n  key: string; name: string; system: string; description: string; lines: SeedTemplateLine[];\n}\n\n")
    f.write("export const SEED_TEMPLATES: SeedTemplate[] = [\n")
    for t in templates:
        head = {k: v for k, v in t.items() if k != "lines"}
        f.write("  {\n")
        for k, v in head.items():
            f.write(f"    {k}: {js(v)},\n")
        f.write("    lines: [\n")
        for l in t["lines"]:
            f.write("      " + js(l) + ",\n")
        f.write("    ],\n  },\n")
    f.write("];\n")

with open(TRANSCRIPT, encoding="utf-8") as fh:
    transcript = fh.read().replace("\r\n", "\n")
with open(os.path.join(OUT, "meeting-transcript.ts"), "w", encoding="utf-8", newline="\n") as f:
    f.write("// AUTO-GENERATED by work/scripts/build_seed.py from docs/meeting-transcript.md — do not edit by hand.\n")
    f.write("export const KICKOFF_TRANSCRIPT: string =\n  " + js(transcript) + ";\n")

# summary
by_sys = {}
for it in items:
    by_sys[it["system"]] = by_sys.get(it["system"], 0) + 1
print("items:", len(items), by_sys, "demo-priced:", sum(1 for i in items if i["demoPrice"]))
for t in templates:
    mapped = sum(1 for l in t["lines"] if l["itemCode"])
    print(f"template {t['key']}: {len(t['lines'])} lines, {mapped} mapped")
