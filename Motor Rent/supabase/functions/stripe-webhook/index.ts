// POST /stripe-webhook — the ONLY place a booking becomes `confirmed`.
// Deploy with --no-verify-jwt; authenticity comes from the Stripe signature.
import Stripe from "stripe";
import { stripeClient } from "../_shared/stripe.ts";
import { adminClient } from "../_shared/supabase.ts";

const cryptoProvider = Stripe.createSubtleCryptoProvider();

Deno.serve(async (req) => {
  const stripe = stripeClient();
  const secret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  const signature = req.headers.get("Stripe-Signature");
  if (!stripe || !secret || !signature) return new Response("not configured", { status: 400 });

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(await req.text(), signature, secret, undefined, cryptoProvider);
  } catch {
    return new Response("bad signature", { status: 400 });
  }

  const db = adminClient();
  try {
    switch (event.type) {
      case "payment_intent.succeeded": {
        const pi = event.data.object as Stripe.PaymentIntent;
        await db.from("payments").update({ status: "succeeded", raw: pi }).eq("provider_ref", pi.id);
        const bookingId = pi.metadata.booking_id;
        if (!bookingId) break;

        // Confirm only if still held. If the hold already expired or was cancelled,
        // the rider paid for a bike they no longer have → refund automatically.
        const { data: confirmed } = await db.from("bookings")
          .update({ status: "confirmed", held_until: null })
          .eq("id", bookingId).eq("status", "held").select("id");
        if (!confirmed?.length) {
          const { data: b } = await db.from("bookings").select("status").eq("id", bookingId).single();
          if (b && ["expired", "cancelled"].includes(b.status)) {
            const refundKey = `${bookingId}:auto-refund`;
            const refund = await stripe.refunds.create({ payment_intent: pi.id }, { idempotencyKey: refundKey });
            await db.from("payments").upsert({
              booking_id: bookingId, kind: "refund", provider: "stripe", provider_ref: refund.id,
              idempotency_key: refundKey, amount: refund.amount, currency: pi.currency.toUpperCase(),
              status: refund.status === "succeeded" ? "succeeded" : "pending",
            }, { onConflict: "idempotency_key" });
          }
        }
        break;
      }
      case "payment_intent.payment_failed":
      case "payment_intent.canceled": {
        const pi = event.data.object as Stripe.PaymentIntent;
        await db.from("payments")
          .update({ status: event.type === "payment_intent.canceled" ? "cancelled" : "failed", raw: pi })
          .eq("provider_ref", pi.id);
        break; // booking stays held; cron expires it if the rider does not retry
      }
    }
  } catch (err) {
    console.error(err);
    return new Response("retry", { status: 500 }); // Stripe retries with backoff
  }
  return new Response(JSON.stringify({ received: true }), { headers: { "Content-Type": "application/json" } });
});
