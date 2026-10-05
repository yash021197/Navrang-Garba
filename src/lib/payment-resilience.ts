import "server-only";

import crypto from "node:crypto";
import { getRazorpay } from "@/lib/razorpay";
import { fulfillPaidBooking } from "@/lib/tickets";
import { createAdminClient } from "@/lib/supabase/admin";
import { isEligibleCapturedPayment } from "@/lib/payment-reconciliation-policy";

const staleAfterMs = 15 * 60 * 1000;
const mask = (value: string) => `${value.slice(0, 8)}…${value.slice(-4)}`;
const log = (event: string, details: Record<string, unknown>) => console.info(JSON.stringify({ event, ...details }));

type Capture = { orderId: string; paymentId: string; source: "VERIFY" | "WEBHOOK" | "RECONCILIATION" };
type RazorpayPayment = { id: string; order_id: string; status: string; amount: number; currency: string };
type Finalization = { booking_reference: string; already_paid: boolean };

async function fetchCapturedPayment(capture: Capture) {
  const payment = await getRazorpay().payments.fetch(capture.paymentId) as RazorpayPayment;
  if (!isEligibleCapturedPayment(payment, { orderId: capture.orderId, amount: payment.amount, currency: "INR" })) {
    throw new Error("Razorpay payment is not an INR captured payment for this order.");
  }
  return payment;
}

export async function processCapturedPayment(capture: Capture) {
  const razorpayPayment = await fetchCapturedPayment(capture);
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("finalize_captured_razorpay_payment", {
    p_provider_order_id: capture.orderId,
    p_provider_payment_id: razorpayPayment.id,
    p_amount_paise: razorpayPayment.amount,
    p_currency: razorpayPayment.currency,
  }).maybeSingle<Finalization>();
  if (error || !data) throw new Error(`Atomic payment finalization failed: ${error?.message ?? "no result"}`);

  log("payment.captured.finalized", { source: capture.source, orderId: mask(capture.orderId), paymentId: mask(capture.paymentId), alreadyPaid: data.already_paid });
  const fulfillment = await fulfillPaidBooking(data.booking_reference);
  log("payment.fulfillment.completed", { source: capture.source, ticketReference: fulfillment.ticket.ticket_reference, email: fulfillment.email.state });
  return { bookingReference: data.booking_reference, ticketReference: fulfillment.ticket.ticket_reference, alreadyPaid: data.already_paid };
}

export async function recordWebhookEvent(input: { rawBody: string; eventType: string; paymentId?: string; orderId?: string; eventId?: string }) {
  const deliveryKey = input.eventId || crypto.createHash("sha256").update(input.rawBody).digest("hex");
  const { data, error } = await createAdminClient().rpc("claim_razorpay_webhook_event", {
    p_delivery_key: deliveryKey,
    p_event_type: input.eventType,
    p_provider_payment_id: input.paymentId ?? null,
    p_provider_order_id: input.orderId ?? null,
  }).maybeSingle<{ id: string; claimed: boolean }>();
  if (error) throw new Error(`Webhook audit claim failed: ${error.message}`);
  return { id: data?.id ?? null, claimed: data?.claimed === true };
}

export async function finishWebhookEvent(id: string | null, status: "PROCESSED" | "IGNORED" | "FAILED", reason?: string) {
  if (!id) return;
  const { error } = await createAdminClient().from("payment_webhook_events").update({ processing_status: status, failure_reason: reason?.slice(0, 500) ?? null, processed_at: new Date().toISOString() }).eq("id", id).eq("processing_status", "RECEIVED");
  if (error) throw new Error(`Webhook audit completion failed: ${error.message}`);
}

export async function reconcileStalePendingPayments() {
  const cutoff = new Date(Date.now() - staleAfterMs).toISOString();
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("payments").select("provider_order_id,amount,currency").eq("provider", "RAZORPAY").eq("status", "PENDING").not("provider_order_id", "is", null).lt("created_at", cutoff).limit(50);
  if (error) throw new Error(`Pending payment lookup failed: ${error.message}`);

  const results: Array<{ orderId: string; state: string }> = [];
  for (const row of data ?? []) {
    const orderId = row.provider_order_id as string;
    try {
      const response = await getRazorpay().orders.fetchPayments(orderId);
      const captured = (response.items as RazorpayPayment[]).filter((payment) => isEligibleCapturedPayment(payment, { orderId, amount: Math.round(Number(row.amount) * 100), currency: "INR" }));
      if (captured.length !== 1) {
        results.push({ orderId: mask(orderId), state: captured.length ? "AMBIGUOUS_CAPTURE" : "NOT_CAPTURED" });
        continue;
      }
      const payment = captured[0];
      await processCapturedPayment({ orderId, paymentId: payment.id, source: "RECONCILIATION" });
      results.push({ orderId: mask(orderId), state: "RECONCILED" });
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Unknown reconciliation error";
      log("payment.reconciliation.failed", { orderId: mask(orderId), reason: message });
      results.push({ orderId: mask(orderId), state: "FAILED" });
    }
  }
  const { data: paidWithoutTicket, error: fulfillmentRepairError } = await supabase
    .from("bookings")
    .select("booking_reference,tickets(id),payments!inner(status)")
    .eq("payment_status", "PAID")
    .eq("payments.status", "PAID")
    .limit(50);
  if (fulfillmentRepairError) throw new Error(`Paid booking fulfillment lookup failed: ${fulfillmentRepairError.message}`);
  for (const booking of paidWithoutTicket ?? []) {
    if (booking.tickets.length !== 0) continue;
    try {
      const fulfillment = await fulfillPaidBooking(booking.booking_reference);
      log("payment.fulfillment.repaired", { ticketReference: fulfillment.ticket.ticket_reference, email: fulfillment.email.state });
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Unknown fulfillment repair error";
      log("payment.fulfillment.repair_failed", { reason: message });
    }
  }
  return { staleAfterMinutes: staleAfterMs / 60000, results };
}
