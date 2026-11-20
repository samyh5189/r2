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

export const CreateBookingRequest = z.object({
  quoteId: z.guid(),
  acceptedTermsVersion: z.string().min(1),
});
export type CreateBookingRequest = z.infer<typeof CreateBookingRequest>;

export const InspectionPhase = z.enum(["pickup", "return"]);

export const InspectionSubmit = z.object({
  bookingId: z.guid(),
  phase: InspectionPhase,
  photoPaths: z.array(z.string().min(1)).min(6, "6 photos required (front, back, left, right, dash, damage close-ups)"),
  fuelLevel: z.number().int().min(0).max(8),
  odometerKm: z.number().int().min(0),
  riderSignaturePath: z.string().min(1),
  staffSignaturePath: z.string().min(1),
  notes: z.string().max(2000).optional(),
});
export type InspectionSubmit = z.infer<typeof InspectionSubmit>;
