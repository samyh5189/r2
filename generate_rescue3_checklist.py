#!/usr/bin/env python3
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.colors import HexColor, black, white
from reportlab.pdfgen import canvas

OUT = "/Users/mohamedsamyh/Desktop/samyhuu/HDK-ARFF-RESCUE3-CHECKLIST.pdf"

NAVY = HexColor("#0B2A4A")
LINE = HexColor("#222222")
HEAD = HexColor("#D9DEE6")
SECT = HexColor("#1F334D")
ALT = HexColor("#F4F6F8")
GREY = HexColor("#555555")
LIGHT = HexColor("#EEF1F4")

W, H = A4
M = 9 * mm
DAYS = ["Sat", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri"]


def box(c, x, y, w, h, fill=None, stroke=LINE, sw=0.45):
    if fill:
        c.setFillColor(fill)
        c.rect(x, y, w, h, fill=1, stroke=0)
    c.setStrokeColor(stroke)
    c.setLineWidth(sw)
    c.rect(x, y, w, h, fill=0, stroke=1)


def txt(c, s, x, y, size=7, color=black, bold=False, align="left"):
    c.setFillColor(color)
    c.setFont("Helvetica-Bold" if bold else "Helvetica", size)
    if align == "center":
        c.drawCentredString(x, y, s)
    elif align == "right":
        c.drawRightString(x, y, s)
    else:
        c.drawString(x, y, s)


def header(c, page, pages):
    inner = W - 2 * M
    box(c, M, H - 24.5 * mm, inner, 14.5 * mm, fill=NAVY, stroke=NAVY, sw=0)
    txt(c, "REGIONAL AIRPORTS COMPANY LTD", W / 2, H - 13.2 * mm, 7.5, white, True, "center")
    txt(c, "AIRPORT RESCUE AND FIREFIGHTING DEPARTMENT  —  KULHUDHUFFUSHI AIRPORT (HDK)", W / 2, H - 17.6 * mm, 8.2, white, True, "center")
    txt(c, "RESCUE 3  |  SECTION ONE — VEHICLE OPERATORS  |  Daily Inspection Checklist", W / 2, H - 21.8 * mm, 7.4, white, False, "center")

    y = H - 25.8 * mm
    box(c, M, y - 16.5 * mm, inner, 16.5 * mm, fill=LIGHT, sw=0.5)
    txt(c, "Vehicle / Equipment", M + 2.2 * mm, y - 5 * mm, 6, GREY, True)
    box(c, M + 32 * mm, y - 6.4 * mm, 38 * mm, 5.2 * mm, fill=white, sw=0.4)
    txt(c, "RESCUE 3", M + 34 * mm, y - 5 * mm, 7.2, NAVY, True)

    txt(c, "Fleet No.", M + 73 * mm, y - 5 * mm, 6, GREY, True)
    box(c, M + 86 * mm, y - 6.4 * mm, 28 * mm, 5.2 * mm, fill=white, sw=0.4)

    txt(c, "Week commencing", M + 117 * mm, y - 5 * mm, 6, GREY, True)
    box(c, M + 143 * mm, y - 6.4 * mm, 40 * mm, 5.2 * mm, fill=white, sw=0.4)

    txt(c, "Document No.", M + 2.2 * mm, y - 12.8 * mm, 6, GREY, True)
    txt(c, "HDK-ARFF/R3/CHK", M + 22 * mm, y - 12.8 * mm, 7, black, True)
    txt(c, "SOP: RACL-SQ-ARF-COP-24-2 (version 01)", M + 62 * mm, y - 12.8 * mm, 6.3, GREY)
    txt(c, f"Page {page} of {pages}", W - M - 2 * mm, y - 12.8 * mm, 6.5, GREY, True, "right")

    return y - 19.5 * mm


def footer(c):
    txt(
        c,
        "Legend:  OK = Good    NOK = Minor defect but operational    U/S = Unserviceable    NA = Not Applicable",
        W / 2,
        6.6 * mm,
        6.1,
        GREY,
        False,
        "center",
    )
    txt(
        c,
        "NOTE: Refer to Page 78, Appendix G (page 83) and Appendix H (page 83) of ARFF SOP (RACL-SQ-ARF-COP-24-2 version 01).",
        W / 2,
        3.6 * mm,
        5.8,
        GREY,
        False,
        "center",
    )


def col_geometry():
    inner = W - 2 * M
    day_w = 11.2 * mm
    no_w = 7.2 * mm
    rem_w = 22 * mm
    item_w = inner - no_w - 7 * day_w - rem_w
    return inner, no_w, item_w, day_w, rem_w


def draw_col_heads(c, y, rh=8.2 * mm):
    inner, no_w, item_w, day_w, rem_w = col_geometry()
    x = M
    box(c, x, y - rh, inner, rh, fill=HEAD, sw=0.45)
    txt(c, "#", x + no_w / 2, y - 3.4 * mm, 6.2, black, True, "center")
    txt(c, "Type and Location of Inspection", x + no_w + 1.6 * mm, y - 3.4 * mm, 6.2, black, True)
    dx = x + no_w + item_w
    for i, d in enumerate(DAYS):
        xx = dx + i * day_w
        c.setStrokeColor(LINE)
        c.setLineWidth(0.35)
        c.line(xx, y, xx, y - rh)
        txt(c, d, xx + day_w / 2, y - 3.2 * mm, 6.3, black, True, "center")
        txt(c, "date", xx + day_w / 2, y - 6.6 * mm, 5.2, GREY, False, "center")
    c.line(dx + 7 * day_w, y, dx + 7 * day_w, y - rh)
    txt(c, "Remarks", dx + 7 * day_w + rem_w / 2, y - 4.6 * mm, 6.2, black, True, "center")
    return y - rh


def section_bar(c, y, title, rh=4.7 * mm):
    inner, *_ = col_geometry()
    box(c, M, y - rh, inner, rh, fill=SECT, stroke=SECT, sw=0)
    txt(c, title, M + 1.8 * mm, y - 3.35 * mm, 6.4, white, True)
    return y - rh


def item_row(c, y, num, label, rh=4.55 * mm, alt=False):
    inner, no_w, item_w, day_w, rem_w = col_geometry()
    fill = ALT if alt else white
    box(c, M, y - rh, inner, rh, fill=fill, sw=0.3)
    txt(c, str(num) if num else "", M + no_w / 2, y - 3.2 * mm, 6.1, GREY, True, "center")
    txt(c, label, M + no_w + 1.5 * mm, y - 3.2 * mm, 6.2)
    dx = M + no_w + item_w
    c.setStrokeColor(HexColor("#B8BEC6"))
    c.setLineWidth(0.25)
    for i in range(8):
        c.line(dx + i * day_w, y, dx + i * day_w, y - rh)
    return y - rh


def draw_items(c, y, groups, start_alt=False):
    alt = start_alt
    for title, items in groups:
        y = section_bar(c, y, title)
        for i, label in enumerate(items, 1):
            y = item_row(c, y, i, label, alt=alt)
            alt = not alt
    return y


def table_block(c, x, y, w, headers, rows, col_ws, row_h=5.4 * mm, head_h=6.2 * mm):
    box(c, x, y - head_h, w, head_h, fill=HEAD, sw=0.4)
    cx = x
    for h, cw in zip(headers, col_ws):
        txt(c, h, cx + 1.6 * mm if h != headers[0] or True else cx, y - 4.2 * mm, 6.1, black, True)
        c.setStrokeColor(LINE)
        c.setLineWidth(0.3)
        c.line(cx, y, cx, y - head_h - row_h * len(rows))
        cx += cw
    y2 = y - head_h
    for i, row in enumerate(rows):
        fill = ALT if i % 2 else white
        box(c, x, y2 - row_h, w, row_h, fill=fill, sw=0.3)
        cx = x
        for j, (cell, cw) in enumerate(zip(row, col_ws)):
            if j == 0:
                txt(c, str(cell), cx + cw / 2, y2 - 3.7 * mm, 6.1, GREY, True, "center")
            else:
                txt(c, str(cell), cx + 1.6 * mm, y2 - 3.7 * mm, 6.2)
            cx += cw
        y2 -= row_h
    box(c, x, y2, w, y - y2, sw=0.45)
    return y2


def generate():
    c = canvas.Canvas(OUT, pagesize=A4)
    c.setTitle("HDK-ARFF Rescue 3 — Section One Vehicle Operators Checklist")
    c.setAuthor("Airport Rescue and Firefighting Department — RACL HDK")

    page1 = [
        ("PART ONE: ENGINE COMPARTMENT    —    1.1 Engine Compartment", [
            "Vehicle Fuel (Diesel) Level",
            "Engine Oil Level",
            "Coolant Level",
            "Hydraulic Fluid Level",
            "Transmission Fluid Level",
            "Brake Fluid Level",
            "Air Pressure Level",
            "Belts & Hoses",
            "Battery Condition / Connections",
            "Battery on/off Switch",
            "Engine Running Hours (record hours)",
        ]),
        ("PART TWO: EXTERIOR    —    2.1 Body", [
            "Dents, scratches, or other damage",
            "Body mounts and hardware",
            "Lights (front, tail, brake, sides etc.)",
            "Emergency Lights",
            "Warning Devices (cones, flares)",
            "Mirrors",
            "Body Damage",
            "Ladders / Platforms (if applicable)",
        ]),
        ("2.2 Tyres", [
            "Tyre Pressure",
            "Tread Depth",
            "Wheel Condition (lugs, bearings)",
        ]),
        ("2.3 Chassis", [
            "Frame and Suspension",
            "Exhaust System",
            "Fluid Leaks",
            "Differential Lock System",
        ]),
        ("PART THREE: INTERIOR    —    3.1 Cab", [
            "Master Switch",
            "HMI Display (control panel)",
            "Steering",
            "Brakes",
            "Hand Brakes",
            "Gear Selector and Monitor",
            "Seats and Seatbelts",
            "Windows & Windshield",
            "Communication Equipment",
            "Sirens and Horns",
            "Gauges",
            "Windshield Wipers / Washers",
            "Radio Set (1)",
        ]),
    ]
    page2_groups = [
        ("3.2 Compartments", [
            "Equipment Organization & Security",
            "Hoses Condition and Storage",
            "Tools Condition and Storage",
            "DCP Hose Reel (RH side)",
            "Control Panel (RH side)",
            "Hose Reel (LH side)",
            "Control Panel (LH side)",
        ]),
        ("PART FOUR: FIREFIGHTING SYSTEM AND EQUIPMENT    —    4.1 Extinguishing Agents", [
            "Water Tank Level",
            "Foam Tank Level",
            "DCP Tank Level",
            "Nitrogen Cylinder",
        ]),
        ("4.2 Pumps and Discharge", [
            "PTO",
            "Pump Pressure and Flow",
            "Valves and Control",
            "Hose Connections (couplings)",
            "Nozzles",
            "Priming Section",
            "Roof Turret",
            "Bumper Turret",
            "Undertruck Discharge (ground nozzle)",
            "Cabin Protection",
            "Side Discharge 02 (LH side)",
            "Side Discharge 04 (RH side)",
            "Drain (Tank, Deliveries, Pump, Monitor)",
        ]),
        ("4.3 Tanks and Others", [
            "Water Tank Condition",
            "Foam Tank Condition",
            "Indicators",
            "Gauges",
        ]),
    ]

    # PAGE 1
    y = header(c, 1, 3)
    txt(
        c,
        "Note: Items in this section shall be inspected and filled out by the assigned Vehicle Operator. Mark OK / NOK / U/S / NA.",
        M,
        y + 1.2 * mm,
        6.3,
        GREY,
    )
    y -= 2.2 * mm
    y = draw_col_heads(c, y)
    y = draw_items(c, y, page1)
    footer(c)
    c.showPage()

    # PAGE 2
    y = header(c, 2, 3)
    y = draw_col_heads(c, y)
    y = draw_items(c, y, page2_groups)

    y -= 2.2 * mm
    inner = W - 2 * M
    box(c, M, y - 5 * mm, inner, 5 * mm, fill=SECT, stroke=SECT, sw=0)
    txt(c, "MAINTENANCE", M + 1.8 * mm, y - 3.5 * mm, 6.5, white, True)
    y -= 5 * mm
    maint_w = inner
    cols = [8 * mm, 48 * mm, 48 * mm, 38 * mm, maint_w - 142 * mm]
    y = table_block(
        c,
        M,
        y,
        maint_w,
        ["#", "Item", "Date of Last Maintenance", "Due Date", "Performed By:"],
        [
            ["1", "Engine Oil and Filters", "", "", ""],
            ["2", "Transmission Fluid", "", "", ""],
            ["3", "Brakes", "", "", ""],
            ["4", "Tires", "", "", ""],
            ["5", "Refuel (Diesel)", "", "", ""],
            ["6", "Pump", "", "", ""],
        ],
        cols,
        row_h=5.15 * mm,
        head_h=5.6 * mm,
    )

    y -= 2.4 * mm
    box(c, M, y - 5 * mm, inner, 5 * mm, fill=SECT, stroke=SECT, sw=0)
    txt(c, "VEHICLE'S OVERALL APPEARANCE / CONDITION", M + 1.8 * mm, y - 3.5 * mm, 6.5, white, True)
    y -= 5 * mm
    app_cols = [16 * mm, 28 * mm, 32 * mm, 24 * mm, 24 * mm, 22 * mm, inner - 146 * mm]
    y = table_block(
        c,
        M,
        y,
        inner,
        ["Day", "Date", "Crew", "Excellent", "Good", "Poor", "Remarks"],
        [[d, "", "", "", "", "", ""] for d in DAYS],
        app_cols,
        row_h=5.05 * mm,
        head_h=5.6 * mm,
    )

    footer(c)
    c.showPage()

    # PAGE 3 — comments and operator sign-off only
    y = header(c, 3, 3)
    inner = W - 2 * M
    box(c, M, y - 5 * mm, inner, 5 * mm, fill=SECT, stroke=SECT, sw=0)
    txt(c, "COMMENTS", M + 1.8 * mm, y - 3.5 * mm, 6.5, white, True)
    y -= 5 * mm
    box(c, M, y - 42 * mm, inner, 42 * mm, fill=white, sw=0.45)
    c.setStrokeColor(HexColor("#C5CBD2"))
    c.setLineWidth(0.3)
    yy = y - 8 * mm
    while yy > y - 40 * mm:
        c.line(M + 3 * mm, yy, W - M - 3 * mm, yy)
        yy -= 6.2 * mm
    y -= 46 * mm

    txt(
        c,
        "By signing below, you (vehicle operator) acknowledge that you have inspected above vehicle (Rescue 3) and its equipment, and above vehicle is in good and safe working condition.",
        M,
        y,
        6.2,
        GREY,
    )
    y -= 3.5 * mm

    head_h = 10.5 * mm
    row_h = 8.2 * mm
    box(c, M, y - head_h - 7 * row_h, inner, head_h + 7 * row_h, sw=0.45)
    box(c, M, y - head_h, inner, head_h, fill=HEAD, sw=0.4)
    sig_cols = [18 * mm, 26 * mm, 34 * mm, 42 * mm, 28 * mm, 42 * mm]
    sig_cols.append(inner - sum(sig_cols))
    txt(c, "Day", M + sig_cols[0] / 2, y - 6.4 * mm, 6.4, black, True, "center")
    txt(c, "Date", M + sig_cols[0] + sig_cols[1] / 2, y - 6.4 * mm, 6.4, black, True, "center")
    txt(c, "Crew", M + sig_cols[0] + sig_cols[1] + sig_cols[2] / 2, y - 6.4 * mm, 6.4, black, True, "center")
    op_x = M + sum(sig_cols[:3])
    txt(c, "Vehicle Inspector / Operator", op_x + (sig_cols[3] + sig_cols[4]) / 2, y - 4.0 * mm, 6.4, black, True, "center")
    txt(c, "Name", op_x + sig_cols[3] / 2, y - 8.6 * mm, 6, GREY, True, "center")
    txt(c, "Sign", op_x + sig_cols[3] + sig_cols[4] / 2, y - 8.6 * mm, 6, GREY, True, "center")
    do_x = op_x + sig_cols[3] + sig_cols[4]
    txt(c, "Duty Officer", do_x + (sig_cols[5] + sig_cols[6]) / 2, y - 4.0 * mm, 6.4, black, True, "center")
    txt(c, "Name", do_x + sig_cols[5] / 2, y - 8.6 * mm, 6, GREY, True, "center")
    txt(c, "Sign", do_x + sig_cols[5] + sig_cols[6] / 2, y - 8.6 * mm, 6, GREY, True, "center")
    c.setStrokeColor(LINE)
    c.setLineWidth(0.3)
    xs = [M]
    for wcol in sig_cols:
        xs.append(xs[-1] + wcol)
    for xline in xs[1:-1]:
        c.line(xline, y, xline, y - head_h - 7 * row_h)
    c.line(op_x, y - 5.4 * mm, W - M, y - 5.4 * mm)

    yy = y - head_h
    for i, d in enumerate(DAYS):
        fill = ALT if i % 2 else white
        box(c, M, yy - row_h, inner, row_h, fill=fill, sw=0.25)
        txt(c, d, M + sig_cols[0] / 2, yy - 5.4 * mm, 6.4, black, True, "center")
        for xline in xs[1:-1]:
            c.setStrokeColor(LINE)
            c.setLineWidth(0.25)
            c.line(xline, yy, xline, yy - row_h)
        yy -= row_h

    y = yy - 6 * mm
    box(c, M, y - 28 * mm, 92 * mm, 28 * mm, fill=white, sw=0.45)
    txt(c, "Legend", M + 2.5 * mm, y - 5.2 * mm, 7, NAVY, True)
    txt(c, "OK     Good", M + 2.5 * mm, y - 11 * mm, 6.4)
    txt(c, "NOK   Minor defect but operational", M + 2.5 * mm, y - 16.2 * mm, 6.4)
    txt(c, "U/S    Unserviceable", M + 2.5 * mm, y - 21.4 * mm, 6.4)
    txt(c, "NA     Not Applicable", M + 2.5 * mm, y - 26.4 * mm, 6.4)

    box(c, M + 96 * mm, y - 28 * mm, inner - 96 * mm, 28 * mm, fill=white, sw=0.45)
    txt(c, "ARFFS Section Head", M + 99 * mm, y - 5.2 * mm, 7, NAVY, True)
    txt(c, "Name:", M + 99 * mm, y - 12.2 * mm, 6.4, GREY)
    c.setStrokeColor(HexColor("#C5CBD2"))
    c.line(M + 112 * mm, y - 12.4 * mm, W - M - 4 * mm, y - 12.4 * mm)
    txt(c, "Sign:", M + 99 * mm, y - 19.2 * mm, 6.4, GREY)
    c.line(M + 112 * mm, y - 19.4 * mm, W - M - 4 * mm, y - 19.4 * mm)
    txt(c, "Date:", M + 99 * mm, y - 26.2 * mm, 6.4, GREY)
    c.line(M + 112 * mm, y - 26.4 * mm, W - M - 4 * mm, y - 26.4 * mm)

    footer(c)
    c.save()
    print(OUT)


if __name__ == "__main__":
    generate()
