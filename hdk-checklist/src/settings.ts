import { useEffect, useState } from "react";
import type { GeneralSettings } from "./types";
import { getGeneralSettings } from "./storage";
import { TARGET_DAYS } from "./faultAge";

const DEFAULT_TARGETS = { ...TARGET_DAYS };

/** Puts Setup → Rules into effect app-wide (repair targets used by fault age tracking) */
export function applyGeneral(s: GeneralSettings) {
  TARGET_DAYS["Immediate Grounding"] = s.targetDays?.grounding ?? DEFAULT_TARGETS["Immediate Grounding"];
  TARGET_DAYS.Urgent = s.targetDays?.urgent ?? DEFAULT_TARGETS.Urgent;
  TARGET_DAYS.Routine = s.targetDays?.routine ?? DEFAULT_TARGETS.Routine;
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
