import type { Operator } from "./types";

/** True when this operator must enter a PIN */
export const needsPin = (operators: Operator[], name: string) => !!operators.find((o) => o.name === name)?.hasPin;
