import { describe, expect, it } from "vitest";
import { normPhone, phoneLabel } from "./phone";

describe("normPhone", () => {
  it("reads Maldivian numbers in any common form", () => {
    for (const s of ["7771234", "777 1234", "+960 777-1234", "960 7771234", "00960 7771234"]) expect(normPhone(s)).toBe("+9607771234");
  });
  it("keeps international numbers with a country code", () => {
    expect(normPhone("+44 7700 900123")).toBe("+447700900123");
    expect(normPhone("0044 7700 900123")).toBe("+447700900123");
  });
  it("refuses what can't be called", () => {
    for (const s of ["", "12345", "2771234", "abc", "+0123456789"]) expect(normPhone(s)).toBeNull();
  });
  it("labels local numbers the way people write them", () => {
    expect(phoneLabel("+9607771234")).toBe("777 1234");
    expect(phoneLabel("+447700900123")).toBe("+447700900123");
  });
});
