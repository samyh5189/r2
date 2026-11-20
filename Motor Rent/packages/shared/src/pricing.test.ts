import { describe, expect, it } from "vitest";
import { baseRental, billableHours, cancellationRefund, lateFee, quote } from "./pricing.ts";
import { canTransition, TRANSITIONS, BOOKING_STATUSES } from "./booking-status.ts";

const plan = { hourly: 5_000, daily: 30_000, weekly: 150_000, deposit: 100_000 }; // MVR 50/h, 300/day, 1500/wk
const at = (iso: string) => new Date(iso);

describe("billableHours", () => {
  it("counts every started hour", () => {
    expect(billableHours(at("2027-01-01T10:00:00Z"), at("2027-01-01T11:01:00Z"))).toBe(2);
  });
  it("rejects zero or negative ranges", () => {
    expect(() => billableHours(at("2027-01-01T10:00:00Z"), at("2027-01-01T10:00:00Z"))).toThrow();
  });
});

describe("baseRental — cheapest combination", () => {
  it("bills short rentals hourly", () => expect(baseRental(3, plan)).toBe(15_000));
  it("caps hourly at one day", () => expect(baseRental(10, plan)).toBe(30_000));
  it("26 h = 1 day + 2 h", () => expect(baseRental(26, plan)).toBe(40_000));
  it("never exceeds the next whole day", () => expect(baseRental(47, plan)).toBe(60_000));
  it("6 days costs more than a week → week wins", () => expect(baseRental(6 * 24, plan)).toBe(150_000));
  it("8 days = 1 week + 1 day", () => expect(baseRental(8 * 24, plan)).toBe(180_000));
});

describe("quote", () => {
  it("adds extras per started day and applies multiplier + promo", () => {
    const q = quote({
      plan: { ...plan, multiplier: 1.2 },
      start: at("2027-01-01T08:00:00Z"),
      end: at("2027-01-02T10:00:00Z"), // 26 h → 2 rental days
      extras: [{ code: "helmet", label: "Helmet", perDay: 2_000, quantity: 2 }],
      promoPercent: 10,
    });
    expect(q.billableHours).toBe(26);
    expect(q.rentalDays).toBe(2);
    expect(q.lines.find((l) => l.code === "rental")?.amount).toBe(48_000);
    expect(q.lines.find((l) => l.code === "promo")?.amount).toBe(-4_800);
    expect(q.lines.find((l) => l.code === "extra:helmet")?.amount).toBe(8_000);
    expect(q.total).toBe(51_200);
    expect(q.deposit).toBe(100_000);
  });
  it("rejects float money", () => {
    expect(() => quote({ plan: { ...plan, hourly: 50.5 }, start: at("2027-01-01T08:00:00Z"), end: at("2027-01-01T09:00:00Z") })).toThrow();
  });
});

describe("lateFee", () => {
  const policy = { graceMinutes: 15, perStartedHour: 5_000, cap: 30_000 };
  const end = at("2027-01-01T18:00:00Z");
  it("is free inside the grace period", () => expect(lateFee(end, at("2027-01-01T18:15:00Z"), policy)).toBe(0));
  it("charges per started hour after grace", () => expect(lateFee(end, at("2027-01-01T18:16:00Z"), policy)).toBe(5_000));
  it("is capped", () => expect(lateFee(end, at("2027-01-03T18:00:00Z"), policy)).toBe(30_000));
});

describe("cancellationRefund", () => {
  const start = at("2027-01-10T10:00:00Z");
  it("full refund ≥ 24 h before", () => expect(cancellationRefund(40_000, start, at("2027-01-09T10:00:00Z"))).toBe(40_000));
  it("50% inside 24 h", () => expect(cancellationRefund(40_000, start, at("2027-01-10T09:00:00Z"))).toBe(20_000));
  it("nothing after start", () => expect(cancellationRefund(40_000, start, at("2027-01-10T10:00:00Z"))).toBe(0));
});

describe("booking transitions", () => {
  it("terminal states go nowhere", () => {
    for (const s of ["closed", "expired", "cancelled"] as const) expect(TRANSITIONS[s]).toHaveLength(0);
  });
  it("cannot skip the pickup inspection", () => expect(canTransition("confirmed", "returned")).toBe(false));
  it("every target is a known status", () => {
    for (const targets of Object.values(TRANSITIONS)) for (const t of targets) expect(BOOKING_STATUSES).toContain(t);
  });
});
