# Motor Rent

Scooter & motorbike rental: rider app (iOS, Android, web PWA), staff app (iOS, Android) and admin console (web), on one Supabase backend.

| Path | What | Stack |
| --- | --- | --- |
| `apps/rider` | Browse bikes, quote, book, my rentals, account | Expo SDK 58 + Expo Router |
| `apps/staff` | Booking lookup, pickup/return inspection (6 photos, fuel, odometer) | Expo SDK 58 |
| `apps/admin` | Today dashboard, bookings, fleet | Next.js 16 (Cache Components) |
| `packages/shared` | Pricing engine, booking state machine, Zod schemas (tested) | TypeScript |
| `supabase/` | Schema, RLS, cron jobs, storage, Edge Functions, DB tests | Postgres + Deno |

## Rules enforced by the system, not by people

- **No double bookings** — Postgres exclusion constraint on `bookings(vehicle_id, period)`; maintenance windows locked against bookings.
- **Server sets every price** — clients send bike + period + extras; `quote` computes, `create-booking` books from a stored quote.
- **Only the payment webhook confirms a booking**; a payment that lands after the 15-min hold expired is refunded automatically.
- **Legal status moves only** (`held → confirmed → active → returned → closed`, etc.), every move logged in `booking_events`.
- **Immutable** inspections, booking history and audit log. Clients can only read their own rows (RLS); all writes go through Edge Functions.

## Getting started

```bash
npm install
cp .env.example .env            # fill in after `supabase start`
npm test                        # pricing + lifecycle unit tests
supabase start && supabase db reset   # needs Docker; applies migrations + seed
supabase test db                # pgTAP tests (double booking, transitions, ...)
supabase functions serve        # quote, create-booking, submit-inspection, stripe-webhook

npm run dev -w @motor-rent/admin      # http://localhost:3000
cd apps/rider && npx expo start       # i / a / w for iOS, Android, web
```

Edge Function secrets: `supabase secrets set STRIPE_SECRET_KEY=... STRIPE_WEBHOOK_SECRET=...`.
Deploy the webhook with `supabase functions deploy stripe-webhook --no-verify-jwt`.

## Not built yet (tracked as TODOs in code)

Stripe PaymentSheet in the rider app · deposit hold at pickup · late-fee / damage charge off-session · KYC upload flow · signature pad · offline inspection queue · QR scan · push/SMS notifications · delete-account function · fleet editing in admin.

Plan doc: Motor Rent App — Product & Technical Plan (Claude Docs).
