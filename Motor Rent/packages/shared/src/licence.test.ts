import { describe, expect, it } from "vitest";
import { licenceCategoryFor, licenceCovers } from "./licence.ts";

describe("licence categories", () => {
  it("two-wheelers need A, cars need B", () => {
    expect(licenceCategoryFor("scooter")).toBe("A");
    expect(licenceCategoryFor("motorbike")).toBe("A");
    expect(licenceCategoryFor("car")).toBe("B");
  });
  it("covers only what the licence lists", () => {
    expect(licenceCovers(["A"], "car")).toBe(false);
    expect(licenceCovers(["A", "B"], "car")).toBe(true);
    expect(licenceCovers(["B"], "motorbike")).toBe(false);
    expect(licenceCovers(null, "scooter")).toBe(false);
  });
});
