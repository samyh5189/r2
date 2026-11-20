import { assertMinor, percentOf, type Minor } from "./money.ts";

const HOUR_MS = 60 * 60 * 1000;
const HOURS_PER_DAY = 24;
const HOURS_PER_WEEK = 168;

export interface PricePlan {
  hourly: Minor;
  daily: Minor;
  weekly: Minor;
  deposit: Minor;
  /** Seasonal / weekend multiplier, e.g. 1.2 for +20%. Defaults to 1. */
  multiplier?: number;
}

export interface Extra {
  code: string;
  label: string;
  /** Charged once per started rental day. */
  perDay: Minor;
  quantity: number;
}

export interface QuoteInput {
  plan: PricePlan;
  start: Date;
  end: Date;
  extras?: Extra[];
  /** Promo discount in percent (0–100), applied to rental base only. */
  promoPercent?: number;
}

export interface QuoteLine {
  code: string;
  label: string;
  amount: Minor;
}

export interface Quote {
  billableHours: number;
  rentalDays: number;
  lines: QuoteLine[];
  /** What the rider pays now. Deposit is a separate card hold, not included. */
  total: Minor;
  deposit: Minor;
}

/** Hours billed: every started hour counts. */
export function billableHours(start: Date, end: Date): number {
  const ms = end.getTime() - start.getTime();
  if (!Number.isFinite(ms) || ms <= 0) throw new RangeError("end must be after start");
  return Math.ceil(ms / HOUR_MS);
}

/** Cheapest combination of weeks, days and hours (e.g. 26 h = 1 day + 2 h, never more than 2 days). */
export function baseRental(hours: number, plan: Pick<PricePlan, "hourly" | "daily" | "weekly">): Minor {
  const daysCost = (h: number): Minor => {
    const fullDays = Math.floor(h / HOURS_PER_DAY);
    const rest = h % HOURS_PER_DAY;
    return Math.min(
      Math.ceil(h / HOURS_PER_DAY) * plan.daily,
      fullDays * plan.daily + Math.min(rest * plan.hourly, plan.daily),
    );
  };
  const fullWeeks = Math.floor(hours / HOURS_PER_WEEK);
  return Math.min(
    Math.ceil(hours / HOURS_PER_WEEK) * plan.weekly,
    fullWeeks * plan.weekly + Math.min(daysCost(hours % HOURS_PER_WEEK), plan.weekly),
  );
}

export function quote(input: QuoteInput): Quote {
  const { plan, start, end, extras = [], promoPercent = 0 } = input;
  for (const [k, v] of Object.entries({ hourly: plan.hourly, daily: plan.daily, weekly: plan.weekly, deposit: plan.deposit })) {
    assertMinor(v, k);
  }
  if (promoPercent < 0 || promoPercent > 100) throw new RangeError("promoPercent must be 0–100");

  const hours = billableHours(start, end);
  const rentalDays = Math.ceil(hours / HOURS_PER_DAY);
  const multiplier = plan.multiplier ?? 1;

  const base = Math.round(baseRental(hours, plan) * multiplier);
  const lines: QuoteLine[] = [{ code: "rental", label: `Rental (${hours} h)`, amount: base }];

  if (promoPercent > 0) {
    lines.push({ code: "promo", label: `Promo -${promoPercent}%`, amount: -percentOf(base, promoPercent) });
  }

  for (const extra of extras) {
    if (!Number.isInteger(extra.quantity) || extra.quantity < 1) continue;
    assertMinor(extra.perDay, extra.code);
    lines.push({
      code: `extra:${extra.code}`,
      label: `${extra.label} × ${extra.quantity}`,
      amount: extra.perDay * extra.quantity * rentalDays,
    });
  }

  const total = lines.reduce((sum, l) => sum + l.amount, 0);
  return { billableHours: hours, rentalDays, lines, total, deposit: plan.deposit };
}

export interface LateFeePolicy {
  graceMinutes: number;
  perStartedHour: Minor;
  /** Late fee never exceeds this (e.g. one extra day). */
  cap: Minor;
}

export function lateFee(scheduledEnd: Date, actualReturn: Date, policy: LateFeePolicy): Minor {
  const lateMs = actualReturn.getTime() - scheduledEnd.getTime() - policy.graceMinutes * 60_000;
  if (lateMs <= 0) return 0;
  return Math.min(Math.ceil(lateMs / HOUR_MS) * policy.perStartedHour, policy.cap);
}

export interface CancellationPolicy {
  /** Full refund if cancelled at least this many hours before start. */
  freeUntilHours: number;
  /** Percent refunded when cancelled after the free window but before start. */
  lateRefundPercent: number;
}

export const DEFAULT_CANCELLATION: CancellationPolicy = { freeUntilHours: 24, lateRefundPercent: 50 };

export function cancellationRefund(
  paid: Minor,
  start: Date,
  cancelledAt: Date,
  policy: CancellationPolicy = DEFAULT_CANCELLATION,
): Minor {
  const hoursBefore = (start.getTime() - cancelledAt.getTime()) / HOUR_MS;
  if (hoursBefore >= policy.freeUntilHours) return paid;
  if (hoursBefore > 0) return percentOf(paid, policy.lateRefundPercent);
  return 0;
}
