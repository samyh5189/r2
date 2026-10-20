export type ItemStatus = "OK" | "NOK" | "U/S" | "NA" | "";

export interface EvidenceItem {
  id: string;
  type: "photo" | "video";
  dataUrl: string;
  name: string;
  capturedAt: string;
}

// How an item is answered: the 4 status buttons, a number reading, or free text.
// Number/text values are stored in `remarks` (status is set to OK, or NOK when a number is out of limits).
export type ItemInputType = "status" | "number" | "text";

export interface ChecklistItemConfig {
  id: string;
  label: string;
  type: ItemInputType;
  unit?: string;
  min?: number;
  max?: number;
}

export interface ChecklistSectionConfig {
  id: string;
  title: string;
  items: ChecklistItemConfig[];
}

export interface ChecklistItem {
  id: string;
  label: string;
  type?: ItemInputType;
  unit?: string;
  min?: number;
  max?: number;
  status: ItemStatus;
  remarks: string;
  evidence: EvidenceItem[];
}

export interface ChecklistSection {
  id: string;
  title: string;
  items: ChecklistItem[];
}

export interface InspectionLog {
  id: string;
  date: string;
  time: string;
  duration: number;        // seconds elapsed during inspection
  operatorName: string;
  fleetNumber: string;
  operatorSignature: string;
  sections: ChecklistSection[];
  overallCondition: "Excellent" | "Good" | "Poor" | "";
  comments: string;
  faultCount: number;
  faultReportId?: string;
  createdAt: string;
}

export interface FaultItem {
  itemId: string;
  section: string;
  label: string;
  status: "NOK" | "U/S";
  remarks: string;
  evidence: EvidenceItem[];
  severity: string;
  recommendedAction: string;
}

export interface FaultReport {
  id: string;
  reportNumber: string;
  inspectionLogId: string;
  date: string;
  time: string;
  vehicle: string;
  vehicleEquipmentLine: string;
  operatorName: string;
  fleetNumber: string;
  operatorSignature?: string;
  faults: FaultItem[];
  detailsOfDefects: string;
  faultSummary: string;
  aiAssessment: string;
  priority: "Routine" | "Urgent" | "Immediate Grounding";
  status: "Open" | "In Progress" | "Resolved";
  createdAt: string;
}
