import type { Operator } from "./types";

/** True when this operator must enter a PIN */
export const needsPin = (operators: Operator[], name: string) => !!operators.find((o) => o.name === name)?.hasPin;

export const isMaintenance = (o?: Operator) => o?.role === "maintenance";

/** The name last chosen on this device for a purpose ("operator", "in-charge", "repair") */
export function rememberedName(purpose: string): string {
  try { return localStorage.getItem(`hdk_last_${purpose}`) ?? ""; } catch { return ""; }
}

export function rememberName(purpose: string, name: string) {
  try { localStorage.setItem(`hdk_last_${purpose}`, name); } catch { /* ignore */ }
}
