/** Vehicle body colours (must match the check on public.vehicles.colour) and their swatch colours. */
export const VEHICLE_COLOURS = {
  black: { label: "Black", hex: "#1C1C20" },
  white: { label: "White", hex: "#F3F3F1" },
  grey: { label: "Grey", hex: "#6F747B" },
  silver: { label: "Silver", hex: "#C2C5CA" },
  red: { label: "Red", hex: "#C8102E" },
  blue: { label: "Blue", hex: "#1F4E9C" },
  green: { label: "Green", hex: "#2E6B3F" },
  yellow: { label: "Yellow", hex: "#E8B90E" },
  orange: { label: "Orange", hex: "#E8641C" },
  brown: { label: "Brown", hex: "#7B5434" },
} as const;
export type VehicleColour = keyof typeof VEHICLE_COLOURS;
export const isVehicleColour = (c: unknown): c is VehicleColour => typeof c === "string" && c in VEHICLE_COLOURS;
