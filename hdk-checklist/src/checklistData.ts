import type { ChecklistItem, ChecklistSection, ChecklistSectionConfig, ItemInputType } from "./types";

export function defaultChecklistConfig(): ChecklistSectionConfig[] {
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

export const ENGINE_HOURS_ID = "p1-10";

export function itemType(item: { id: string; type?: ItemInputType }): ItemInputType {
  return item.type ?? (item.id === ENGINE_HOURS_ID ? "number" : "status");
}

export function buildChecklist(config: ChecklistSectionConfig[]): ChecklistSection[] {
  return config.map((sec) => ({
    id: sec.id,
    title: sec.title,
    items: sec.items.map((it): ChecklistItem => ({ ...it, status: "", remarks: "", evidence: [] })),
  }));
}

export function buildBlankChecklist(): ChecklistSection[] {
  return buildChecklist(defaultChecklistConfig());
}
