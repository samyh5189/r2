export type ItemStatus = "OK" | "NOK" | "U/S" | "NA" | "";

export type CheckKind = "daily" | "weekly" | "monthly" | "yearly";

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
  /** Shown to the operator on the item: what it is and what OK looks like */
  guide?: string;
  /** Where on the vehicle to find it */
  location?: string;
  /** Reference photo of the item / location (an uploaded file link) */
  refPhoto?: string;
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

export interface Operator {
  id: string;
  name: string;
  rank?: string;
  inCharge: boolean;
  /** Maintenance officers record repairs; everyone else is ARFF (absent = ARFF) */
  role?: "arff" | "maintenance";
  hasPin?: boolean;         // from the server; the PIN itself never leaves it
  hasSignature?: boolean;
  pin?: string;             // admin: set a new PIN
  clearPin?: boolean;
  clearSignature?: boolean;
}

export interface ShiftSignoff {
  name: string;
  signature: string;
  signedAt: string;
}

// Lower half of the paper fault report form: repair, then acceptance test.
// Dates are DD/MM/YYYY and times HH:MM, matching the form's digit boxes.
export interface FaultRepair {
  desiredStartDate?: string;
  desiredStartTime?: string;
  requiredEndDate?: string;
  requiredEndTime?: string;
  repairedBy?: string;
  repairedBySignature?: string;
  details?: string;
  remarks?: string;
}

export interface FaultAcceptance {
  date?: string;
  time?: string;
  requiredEndDate?: string;
  requiredEndTime?: string;
  comments?: string;
  maintenanceName?: string;
  maintenanceSignature?: string;
  arffName?: string;
  arffSignature?: string;
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
  shiftSignoff?: ShiftSignoff;
  deviceId?: string;
  kind?: CheckKind;        // absent on older logs → daily
  periodKey?: string;      // set by the server: date, week start, MM/YYYY or YYYY
  markedAllOk?: number;    // items the operator marked OK in one go
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
  shiftSignoff?: ShiftSignoff;
  repair?: FaultRepair;
  acceptance?: FaultAcceptance;
  resolvedAt?: string;     // set by the server when the report closes
  repairStartedAt?: string;  // set by the server: first repair update
  repairStartedBy?: string;
  repairUpdatedAt?: string;
  repairUpdatedBy?: string;
  emailedAt?: string;
  emailedTo?: number;
  createdAt: string;
}

/** A fault report cut down to what age tracking and the monthly summary need */
export type FaultBrief = Pick<FaultReport, "id" | "reportNumber" | "date" | "time" | "createdAt" | "resolvedAt" | "status" | "priority" | "operatorName" | "vehicleEquipmentLine"> & {
  acceptance?: Pick<FaultAcceptance, "date" | "time">;
  faults: Pick<FaultItem, "itemId" | "label">[];
};

/** Setup → Rules */
export interface GeneralSettings {
  /** Days a fault may stay open before it counts as overdue */
  targetDays?: { grounding?: number; urgent?: number; routine?: number };
  /** An item marked U/S can't be confirmed without a photo */
  requirePhotoUS?: boolean;
  /** Offer "Mark remaining OK" on the checklist (default on) */
  allowMarkAllOk?: boolean;
  /** When the weekly, monthly and yearly checks fall due */
  schedule?: CheckSchedule;
}

/** Setup → Rules → Check schedule (absent = Saturday, the 1st, 1 January) */
export interface CheckSchedule {
  /** 0 = Sunday … 6 = Saturday */
  weeklyDay?: number;
  /** 1–31; past the month's end means its last day */
  monthlyDay?: number;
  yearlyMonth?: number;
  yearlyDay?: number;
}

/** Engine service schedule (Setup) */
export interface ServiceSettings {
  intervalHours?: number;
  intervalMonths?: number;
  lastServiceHours?: number;
  lastServiceDate?: string;  // DD/MM/YYYY
  warnHours?: number;
}
