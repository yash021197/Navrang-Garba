import { createAdminClient } from "@/lib/supabase/admin";
import { verifyPaymentSignature } from "@/lib/razorpay";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const orderId = typeof body?.razorpay_order_id === "string" ? body.razorpay_order_id : "";
  const paymentId = typeof body?.razorpay_payment_id === "string" ? body.razorpay_payment_id : "";
  const signature = typeof body?.razorpay_signature === "string" ? body.razorpay_signature : "";
  if (!orderId || !paymentId || !signature || !verifyPaymentSignature(orderId, paymentId, signature)) return Response.json({ error: "Payment verification failed." }, { status: 400 });
  try {
    const supabase = createAdminClient();
    const { data: payment, error } = await supabase.from("payments").select("id,booking_id,status,provider_order_id,bookings(payment_status)").eq("provider_order_id", orderId).single();
    if (error || !payment || payment.provider_order_id !== orderId) return Response.json({ error: "Payment order not found." }, { status: 404 });
    if (payment.status === "PAID") return Response.json({ paid: true });
    const { error: paymentError } = await supabase.from("payments").update({ status: "PAID", provider_payment_id: paymentId, provider_signature: signature, paid_at: new Date().toISOString() }).eq("id", payment.id).eq("status", "PENDING");
    if (paymentError) throw paymentError;
    const { error: bookingError } = await supabase.from("bookings").update({ payment_status: "PAID" }).eq("id", payment.booking_id).eq("payment_status", "PENDING");
    if (bookingError) throw bookingError;
    return Response.json({ paid: true });
  } catch (error) { console.error("Razorpay verification failed", error); return Response.json({ error: "Payment verification failed." }, { status: 503 }); }
}
