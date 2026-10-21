import { useEffect, useState } from "react";
import type { GeneralSettings } from "./types";
import { getGeneralSettings } from "./storage";
import { TARGET_DAYS } from "./faultAge";
import { DEFAULT_SCHEDULE, SCHEDULE } from "./checkKinds";

const DEFAULT_TARGETS = { ...TARGET_DAYS };

/** Puts Setup → Rules into effect app-wide (repair targets for fault age tracking, the check schedule) */
export function applyGeneral(s: GeneralSettings) {
  TARGET_DAYS["Immediate Grounding"] = s.targetDays?.grounding ?? DEFAULT_TARGETS["Immediate Grounding"];
  TARGET_DAYS.Urgent = s.targetDays?.urgent ?? DEFAULT_TARGETS.Urgent;
  TARGET_DAYS.Routine = s.targetDays?.routine ?? DEFAULT_TARGETS.Routine;
  Object.assign(SCHEDULE, DEFAULT_SCHEDULE);
  for (const [k, v] of Object.entries(s.schedule ?? {})) if (typeof v === "number") SCHEDULE[k as keyof typeof SCHEDULE] = v;
}

function cached(): GeneralSettings {
  try { return JSON.parse(localStorage.getItem("hdk_general") || "null") ?? {}; } catch { return {}; }
}

// The last known rules apply from the first render; the server's copy follows
applyGeneral(cached());

/** Setup → Rules, refreshed from the server once */
export function useGeneralSettings(): GeneralSettings {
  const [s, setS] = useState<GeneralSettings>(cached);
  useEffect(() => { getGeneralSettings().then((g) => { applyGeneral(g); setS(g); }); }, []);
  return s;
}
