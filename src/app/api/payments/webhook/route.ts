import { verifyWebhookSignature } from "@/lib/razorpay";
import { finishWebhookEvent, processCapturedPayment, recordWebhookEvent } from "@/lib/payment-resilience";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-razorpay-signature") ?? "";
  if (!signature || !verifyWebhookSignature(rawBody, signature)) return Response.json({ error: "Invalid webhook signature." }, { status: 400 });
  const event = JSON.parse(rawBody) as { event?: string; payload?: { payment?: { entity?: { id?: string; order_id?: string; status?: string; amount?: number; currency?: string } } } };
  const paymentEntity = event.payload?.payment?.entity;
  const audit = await recordWebhookEvent({ rawBody, eventType: event.event ?? "unknown", paymentId: paymentEntity?.id, orderId: paymentEntity?.order_id, eventId: request.headers.get("x-razorpay-event-id") ?? undefined });
  if (audit.duplicate) return Response.json({ received: true, duplicate: true });
  if (event.event !== "payment.captured" || !paymentEntity?.id || !paymentEntity.order_id || paymentEntity.status !== "captured" || typeof paymentEntity.amount !== "number" || !Number.isSafeInteger(paymentEntity.amount) || !paymentEntity.currency) { await finishWebhookEvent(audit.id, "IGNORED", "Unsupported or incomplete event."); return Response.json({ received: true }); }
  const { order_id: orderId, id: paymentId, amount, currency } = paymentEntity;
  try {
    await processCapturedPayment({ orderId, paymentId, amount, currency, source: "WEBHOOK" });
    await finishWebhookEvent(audit.id, "PROCESSED");
    return Response.json({ received: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook reconciliation failed.";
    await finishWebhookEvent(audit.id, "FAILED", message);
    console.error("payment.webhook.failed", message);
    return Response.json({ error: "Webhook reconciliation failed." }, { status: 503 });
  }
}
