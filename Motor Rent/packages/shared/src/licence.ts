/** Driving licence categories we rent against. One licence lists several categories. */
export const LICENCE_CATEGORIES = {
  A: { label: "A · Motorcycle and scooter", short: "Motorcycle" },
  B: { label: "B · Car (light vehicle)", short: "Car" },
} as const;
export type LicenceCategory = keyof typeof LICENCE_CATEGORIES;

/** The category a vehicle needs: cars B, everything on two wheels A. Mirrors public.licence_category_for. */
export const licenceCategoryFor = (kind: string): LicenceCategory => (kind === "car" ? "B" : "A");

export const licenceCovers = (categories: readonly string[] | null | undefined, kind: string) =>
  (categories ?? []).includes(licenceCategoryFor(kind));
