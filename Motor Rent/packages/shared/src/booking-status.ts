/**
 * Booking lifecycle. Mirrors the `booking_status` enum and the
 * `booking_transition_allowed()` function in the database — keep them in sync.
 */
export const BOOKING_STATUSES = [
  "held",
  "confirmed",
  "active",
  "overdue",
  "returned",
  "damage_claim",
  "closed",
  "expired",
  "cancelled",
] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const TRANSITIONS: Readonly<Record<BookingStatus, readonly BookingStatus[]>> = {
  held: ["confirmed", "expired", "cancelled"],
  confirmed: ["active", "cancelled"],
  active: ["overdue", "returned"],
  overdue: ["returned"],
  returned: ["damage_claim", "closed"],
  damage_claim: ["closed"],
  closed: [],
  expired: [],
  cancelled: [],
};

/** Statuses during which the bike is unavailable to anyone else. */
export const BLOCKING_STATUSES: readonly BookingStatus[] = ["held", "confirmed", "active", "overdue"];

export const TERMINAL_STATUSES: readonly BookingStatus[] = ["closed", "expired", "cancelled"];

export function canTransition(from: BookingStatus, to: BookingStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(from: BookingStatus, to: BookingStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`Illegal booking transition: ${from} -> ${to}`);
  }
}
