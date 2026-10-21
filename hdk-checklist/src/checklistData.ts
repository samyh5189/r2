import type { CheckKind, ChecklistItem, ChecklistSection, ChecklistSectionConfig, ChecklistItemConfig, ItemInputType } from "./types";

export function defaultChecklistConfig(kind: CheckKind = "daily"): ChecklistSectionConfig[] {
  if (kind !== "daily") return periodicDefaults(kind);
  const raw: { id: string; title: string; items: string[] }[] = [
    {
      id: "p1",
      title: "PART ONE: ENGINE COMPARTMENT — 1.1 Engine Compartment",
      items: [
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
      ],
    },
    {
      id: "p2-1",
      title: "PART TWO: EXTERIOR — 2.1 Body",
      items: [
        "Dents, scratches, or other damage",
        "Body mounts and hardware",
        "Lights (front, tail, brake, sides etc.)",
        "Emergency Lights",
        "Warning Devices (cones, flares)",
        "Mirrors",
        "Body Damage",
        "Ladders / Platforms (if applicable)",
      ],
    },
    {
      id: "p2-2",
      title: "2.2 Tyres",
      items: [
        "Tyre Pressure",
        "Tread Depth",
        "Wheel Condition (lugs, bearings)",
      ],
    },
    {
      id: "p2-3",
      title: "2.3 Chassis",
      items: [
        "Frame and Suspension",
        "Exhaust System",
        "Fluid Leaks",
        "Differential Lock System",
      ],
    },
    {
      id: "p3-1",
      title: "PART THREE: INTERIOR — 3.1 Cab",
      items: [
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
      ],
    },
    {
      id: "p3-2",
      title: "3.2 Compartments",
      items: [
        "Equipment Organization & Security",
        "Hoses Condition and Storage",
        "Tools Condition and Storage",
        "DCP Hose Reel (RH side)",
        "Control Panel (RH side)",
        "Hose Reel (LH side)",
        "Control Panel (LH side)",
      ],
    },
    {
      id: "p4-1",
      title: "PART FOUR: FIREFIGHTING SYSTEM — 4.1 Extinguishing Agents",
      items: [
        "Water Tank Level",
        "Foam Tank Level",
        "DCP Tank Level",
        "Nitrogen Cylinder",
      ],
    },
    {
      id: "p4-2",
      title: "4.2 Pumps and Discharge",
      items: [
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
      ],
    },
    {
      id: "p4-3",
      title: "4.3 Tanks and Others",
      items: [
        "Water Tank Condition",
        "Foam Tank Condition",
        "Indicators",
        "Gauges",
      ],
    },
  ];

  return raw.map((sec) => ({
    id: sec.id,
    title: sec.title,
    items: sec.items.map((label, idx) => {
      const id = `${sec.id}-${idx}`;
      return id === ENGINE_HOURS_ID
        ? { id, label, type: "number" as const, unit: "hrs" }
        : { id, label, type: "status" as const };
    }),
  }));
}

// Starting points for the periodic checks; admins tailor them under Setup.
// An item is a label, or [label, unit] for a number reading.
type RawItem = string | [string, string];
const PERIODIC: Record<Exclude<CheckKind, "daily">, { id: string; title: string; items: RawItem[] }[]> = {
  weekly: [
    { id: "w1", title: "WEEKLY — 1. Engine & Chassis", items: [
      "Engine start and run-up (5 min)", "Air tank / dryer drain (moisture)", "Wheel nuts and rims",
      "Tyre tread and sidewalls", "Leaks under vehicle (oil, fuel, coolant)", "Steering play and operation", "Parking brake test",
    ] },
    { id: "w2", title: "WEEKLY — 2. Firefighting System", items: [
      ["Fire pump run test — discharge pressure", "bar"], "Foam proportioning system operation", "Roof turret / monitor operation",
      "Bumper turret operation", "Hose reels — deploy and rewind", "Undertruck nozzles", "Valves and drains", "Water / foam tank level gauges",
    ] },
    { id: "w3", title: "WEEKLY — 3. Equipment & Cab", items: [
      "Breathing apparatus sets", "Portable extinguishers (gauge in green)", "Rescue tools and equipment inventory",
      "Radio communication check", "Siren, PA and warning lights", "Wipers and washers", "First aid kit",
    ] },
  ],
  monthly: [
    { id: "m1", title: "MONTHLY — 1. Vehicle", items: [
      "Battery terminals cleaned and protected", "Lubrication points greased", "Brake lining wear and slack adjusters",
      "Air system leak-down test", "Drive belt tension", "Air filter restriction indicator", "Suspension and springs", "Exhaust system",
    ] },
    { id: "m2", title: "MONTHLY — 2. Firefighting System", items: [
      ["Pump pressure test at rated output", "bar"], "Foam system flushed with water", "Primer operation (draft test)",
      "Turret flow pattern", "Complementary agent system pressure", "Hoses and couplings (cracks, wear)", "Nozzles and strainers cleaned",
    ] },
    { id: "m3", title: "MONTHLY — 3. Equipment", items: [
      "Breathing apparatus — full functional check", "Portable extinguishers — weight / pressure", "Thermal imaging camera",
      "Ladders", "Lighting equipment / generator run",
    ] },
  ],
  yearly: [
    { id: "y1", title: "YEARLY — 1. Vehicle", items: [
      "Annual service by workshop / manufacturer", "Engine oil and filters changed", "Transmission and axle oils changed",
      "Coolant tested / replaced", "Brake system overhaul inspection", "Chassis and body corrosion inspection", "Roadworthiness / registration",
    ] },
    { id: "y2", title: "YEARLY — 2. Firefighting System", items: [
      "Pump performance test and certification", "Fire hose pressure test", "Foam concentrate quality test",
      "Water / foam tank internal inspection", "Turret / monitor service", "Pressure gauges calibrated",
    ] },
    { id: "y3", title: "YEARLY — 3. Equipment", items: [
      "Extinguishers annual service", "BA cylinders — hydrostatic test in date", "Rescue tools service", "Ladder load test",
    ] },
  ],
};

function periodicDefaults(kind: Exclude<CheckKind, "daily">): ChecklistSectionConfig[] {
  return PERIODIC[kind].map((sec) => ({
    id: sec.id,
    title: sec.title,
    items: sec.items.map((raw, idx): ChecklistItemConfig => {
      const id = `${sec.id}-${idx}`;
      return typeof raw === "string" ? { id, label: raw, type: "status" } : { id, label: raw[0], type: "number", unit: raw[1] };
    }),
  }));
}

export const ENGINE_HOURS_ID = "p1-10";

export function itemType(item: { id: string; type?: ItemInputType }): ItemInputType {
  return item.type ?? (item.id === ENGINE_HOURS_ID ? "number" : "status");
}

export function buildChecklist(config: ChecklistSectionConfig[]): ChecklistSection[] {
  return config.map((sec) => ({
    id: sec.id,
    title: sec.title,
    // The guide stays in the checklist setup; logs keep only what was answered
    items: sec.items.map(({ guide: _g, location: _l, refPhoto: _p, ...it }): ChecklistItem => ({ ...it, status: "", remarks: "", evidence: [] })),
  }));
}

export function buildBlankChecklist(): ChecklistSection[] {
  return buildChecklist(defaultChecklistConfig());
}
