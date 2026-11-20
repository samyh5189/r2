import { describe, expect, it } from "vitest";
import { analyzeSlip, parseAmounts } from "./slip.ts";

const BML = `Bank of Maldives
Transfer Successful
From: AHMED ALI 7701****1234
To: RENT A MOTOR 7730000123456
Amount MVR 1,450.00
Remarks 3F9A2C1B
Date 20/11/2026 14:05`;

describe("parseAmounts", () => {
  it("reads grouped and plain amounts as laari", () => {
    expect(parseAmounts("MVR 1,450.00 fee 0.00 total 1450.00")).toEqual([145000, 0]);
    expect(parseAmounts("Rf 450.50")).toEqual([45050]);
  });
});

describe("analyzeSlip", () => {
  const expected = { total: 145000, reference: "3F9A2C1B", accountNumbers: ["7730-000-123456"] };

  it("passes all checks on a matching slip", () => {
    const r = analyzeSlip(BML, expected);
    expect(r).toMatchObject({ amountMatches: true, referenceFound: true, accountFound: true, score: 3, date: "20/11/2026" });
  });

  it("flags an underpaid slip", () => {
    expect(analyzeSlip(BML.replace("1,450.00", "1,000.00"), expected).amountMatches).toBe(false);
  });

  it("flags a missing reference and a different account", () => {
    const r = analyzeSlip(BML.replace("3F9A2C1B", "rent").replace("7730000123456", "7730000999999"), expected);
    expect(r.referenceFound).toBe(false);
    expect(r.accountFound).toBe(false);
    expect(r.score).toBe(1);
  });

  it("tolerates OCR spacing in the reference", () => {
    expect(analyzeSlip("Remarks 3F9A 2C1B MVR 1450.00", expected).referenceFound).toBe(true);
  });
});
