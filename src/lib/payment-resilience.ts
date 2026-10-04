import "server-only";

import crypto from "node:crypto";
import type Razorpay from "razorpay";
import { fulfillPaidBooking } from "@/lib/tickets";
import { createAdminClient } from "@/lib/supabase/admin";
import { isEligibleCapturedPayment } from "@/lib/payment-reconciliation-policy";

const staleAfterMs = 15 * 60 * 1000;
const mask = (value: string) => `${value.slice(0, 8)}…${value.slice(-4)}`;
const log = (event: string, details: Record<string, unknown>) => console.info(JSON.stringify({ event, ...details }));

type Capture = { orderId: string; paymentId: string; amount: number; currency: string; source: "VERIFY" | "WEBHOOK" | "RECONCILIATION" };
type PaymentRow = { id: string; booking_id: string; status: string; provider_order_id: string | null; provider_payment_id: string | null; amount: number | string; currency: string; bookings: { booking_reference: string; amount: number | string; currency: string; payment_status: string } | Array<{ booking_reference: string; amount: number | string; currency: string; payment_status: string }> | null };

function bookingOf(payment: PaymentRow) {
  return Array.isArray(payment.bookings) ? payment.bookings[0] : payment.bookings;
}

export async function processCapturedPayment(capture: Capture) {
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("payments").select("id,booking_id,status,provider_order_id,provider_payment_id,amount,currency,bookings(booking_reference,amount,currency,payment_status)").eq("provider_order_id", capture.orderId).maybeSingle<PaymentRow>();
  if (error) throw new Error(`Payment lookup failed: ${error.message}`);
  if (!data) throw new Error("No internal payment matches the Razorpay order.");
  const booking = bookingOf(data);
  const expectedPaise = Math.round(Number(data.amount) * 100);
  if (!booking || data.provider_order_id !== capture.orderId || expectedPaise !== capture.amount || data.currency !== capture.currency || Number(booking.amount) !== Number(data.amount) || booking.currency !== data.currency) throw new Error("Captured payment metadata does not match the internal booking.");
  if (data.provider_payment_id && data.provider_payment_id !== capture.paymentId) throw new Error("Razorpay payment ID conflicts with the recorded payment.");

  if (data.status !== "PAID") {
    const { error: paymentError } = await supabase.from("payments").update({ status: "PAID", provider_payment_id: capture.paymentId, paid_at: new Date().toISOString() }).eq("id", data.id).eq("status", "PENDING");
    if (paymentError) throw new Error(`Payment update failed: ${paymentError.message}`);
    const { error: bookingError } = await supabase.from("bookings").update({ payment_status: "PAID" }).eq("id", data.booking_id).eq("payment_status", "PENDING");
    if (bookingError) throw new Error(`Booking update failed: ${bookingError.message}`);
  }

  log("payment.captured.reconciled", { source: capture.source, bookingReference: booking.booking_reference, orderId: mask(capture.orderId), paymentId: mask(capture.paymentId) });
  const fulfillment = await fulfillPaidBooking(booking.booking_reference);
  log("payment.fulfillment.completed", { bookingReference: booking.booking_reference, ticketReference: fulfillment.ticket.ticket_reference, email: fulfillment.email.state });
  return { bookingReference: booking.booking_reference, ticketReference: fulfillment.ticket.ticket_reference };
}

export async function recordWebhookEvent(input: { rawBody: string; eventType: string; paymentId?: string; orderId?: string; eventId?: string }) {
  const deliveryKey = input.eventId || crypto.createHash("sha256").update(input.rawBody).digest("hex");
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("payment_webhook_events").upsert({ delivery_key: deliveryKey, event_type: input.eventType, provider_payment_id: input.paymentId ?? null, provider_order_id: input.orderId ?? null, processing_status: "RECEIVED" }, { onConflict: "delivery_key", ignoreDuplicates: true }).select("id").maybeSingle();
  if (error) throw new Error(`Webhook audit insert failed: ${error.message}`);
  return { id: data?.id ?? null, duplicate: !data };
}

export async function finishWebhookEvent(id: string | null, status: "PROCESSED" | "IGNORED" | "FAILED", reason?: string) {
  if (!id) return;
  await createAdminClient().from("payment_webhook_events").update({ processing_status: status, failure_reason: reason?.slice(0, 500) ?? null, processed_at: new Date().toISOString() }).eq("id", id);
}

type RazorpayPayment = { id: string; order_id: string; status: string; amount: number; currency: string };
export async function reconcileStalePendingPayments(razorpay: Razorpay) {
  const cutoff = new Date(Date.now() - staleAfterMs).toISOString();
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("payments").select("id,provider_order_id,amount,currency,bookings!inner(booking_reference,payment_status)").eq("provider", "RAZORPAY").eq("status", "PENDING").not("provider_order_id", "is", null).lt("created_at", cutoff).limit(50);
  if (error) throw new Error(`Pending payment lookup failed: ${error.message}`);
  const results: Array<{ orderId: string; state: string }> = [];
  for (const row of data ?? []) {
    const orderId = row.provider_order_id as string;
    try {
      const response = await razorpay.orders.fetchPayments(orderId);
      const captured = (response.items as RazorpayPayment[]).filter((payment) => isEligibleCapturedPayment(payment, { orderId, amount: Math.round(Number(row.amount) * 100), currency: row.currency }));
      if (captured.length !== 1) { results.push({ orderId: mask(orderId), state: captured.length ? "AMBIGUOUS_CAPTURE" : "NOT_CAPTURED" }); continue; }
      const payment = captured[0];
      await processCapturedPayment({ orderId, paymentId: payment.id, amount: payment.amount, currency: payment.currency, source: "RECONCILIATION" });
      results.push({ orderId: mask(orderId), state: "RECONCILED" });
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Unknown reconciliation error";
      log("payment.reconciliation.failed", { orderId: mask(orderId), reason: message });
      results.push({ orderId: mask(orderId), state: "FAILED" });
    }
  }
  return { staleAfterMinutes: staleAfterMs / 60000, results };
}
