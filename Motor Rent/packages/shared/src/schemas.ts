import { z } from "zod";

/** What a client may send to request a quote. Price is NEVER accepted from a client. */
export const QuoteRequest = z
  .object({
    vehicleId: z.guid(),
    start: z.iso.datetime({ offset: true }),
    end: z.iso.datetime({ offset: true }),
    extras: z
      .array(z.object({ code: z.string().min(1).max(32), quantity: z.number().int().min(1).max(4) }))
      .max(10)
      .default([]),
    promoCode: z.string().trim().max(32).optional(),
  })
  .refine((v) => new Date(v.end) > new Date(v.start), { message: "end must be after start", path: ["end"] });
export type QuoteRequest = z.infer<typeof QuoteRequest>;

/** Pick up at the counter, or have the vehicle brought to an address. */
export const Handover = z.enum(["counter", "delivery"]);
const deliveryFields = {
  handover: Handover.default("counter"),
  deliveryAddress: z.string().trim().max(200).optional(),
};
const needsAddress = (v: { handover: string; deliveryAddress?: string }) => v.handover === "counter" || (v.deliveryAddress?.length ?? 0) >= 5;
const addressMessage = { message: "Tell us where to bring it (at least 5 characters)", path: ["deliveryAddress"] };

export const CreateBookingRequest = z.object({
  quoteId: z.guid(),
  acceptedTermsVersion: z.string().min(1),
  ...deliveryFields,
  /** Saved to the profile when it has no number yet. */
  phone: z.string().trim().max(24).optional(),
}).refine(needsAddress, addressMessage);
export type CreateBookingRequest = z.infer<typeof CreateBookingRequest>;

/** Booking without an account: name and mobile number, staff call to confirm and take payment. */
export const GuestBookingRequest = z.object({
  quoteId: z.guid(),
  acceptedTermsVersion: z.string().min(1),
  name: z.string().trim().min(2, "Enter your name").max(80),
  phone: z.string().trim().min(7, "Enter your mobile number").max(24),
  ...deliveryFields,
}).refine(needsAddress, addressMessage);
export type GuestBookingRequest = z.infer<typeof GuestBookingRequest>;

export const GuestLookupRequest = z.object({
  reference: z.string().trim().toUpperCase().regex(/^[0-9A-F]{8}$/, "The reference has 8 letters and numbers"),
  phone: z.string().trim().min(7).max(24),
});
export type GuestLookupRequest = z.infer<typeof GuestLookupRequest>;
export const InspectionPhase = z.enum(["pickup", "return"]);

export const InspectionSubmit = z.object({
  bookingId: z.guid(),
  phase: InspectionPhase,
  photoPaths: z.array(z.string().min(1)).min(6, "6 photos required (front, back, left, right, dash, damage close-ups)"),
  fuelLevel: z.number().int().min(0).max(8),
  odometerKm: z.number().int().min(0),
  /** Engine hour meter reading, one decimal; null = vehicle has no hour meter. */
  engineHours: z.number().min(0).max(100000).nullable(),
  riderSignaturePath: z.string().regex(/\/rider-signature-\d+\.svg$/, "Rider signature required"),
  staffSignaturePath: z.string().regex(/\/staff-signature-\d+\.svg$/, "Staff signature required"),
  notes: z.string().max(2000).optional(),
  /** Car checklist, item → ok / issue. */
  checklist: z.record(z.string().max(40), z.enum(["ok", "issue"])).optional(),
  /** Pickup: staff confirm the rider read and accepted the rental agreement before signing. */
  agreementAccepted: z.boolean().optional(),
});
export type InspectionSubmit = z.infer<typeof InspectionSubmit>;
