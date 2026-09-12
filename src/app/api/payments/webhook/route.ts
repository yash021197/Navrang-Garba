import { createAdminClient } from "@/lib/supabase/admin";
import { verifyWebhookSignature } from "@/lib/razorpay";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-razorpay-signature") ?? "";
  if (!signature || !verifyWebhookSignature(rawBody, signature)) return Response.json({ error: "Invalid webhook signature." }, { status: 400 });
  const event = JSON.parse(rawBody) as { event?: string; payload?: { payment?: { entity?: { id?: string; order_id?: string; status?: string } } } };
  const paymentEntity = event.payload?.payment?.entity;
  if (event.event !== "payment.captured" || !paymentEntity?.id || !paymentEntity.order_id) return Response.json({ received: true });
  const supabase = createAdminClient();
  const { data: payment } = await supabase.from("payments").select("id,booking_id,status").eq("provider_order_id", paymentEntity.order_id).single();
  if (!payment || payment.status === "PAID") return Response.json({ received: true });
  const { error } = await supabase.from("payments").update({ status: "PAID", provider_payment_id: paymentEntity.id, paid_at: new Date().toISOString() }).eq("id", payment.id).eq("status", "PENDING");
  if (error) return Response.json({ error: "Webhook reconciliation failed." }, { status: 503 });
  await supabase.from("bookings").update({ payment_status: "PAID" }).eq("id", payment.booking_id).eq("payment_status", "PENDING");
  return Response.json({ received: true });
}
