import { getRazorpay, verifyPaymentSignature } from "@/lib/razorpay";
import { processCapturedPayment } from "@/lib/payment-resilience";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const orderId = typeof body?.razorpay_order_id === "string" ? body.razorpay_order_id : "";
  const paymentId = typeof body?.razorpay_payment_id === "string" ? body.razorpay_payment_id : "";
  const signature = typeof body?.razorpay_signature === "string" ? body.razorpay_signature : "";
  if (!orderId || !paymentId || !signature || !verifyPaymentSignature(orderId, paymentId, signature)) return Response.json({ error: "Payment verification failed." }, { status: 400 });
  try {
    const razorpayPayment = await getRazorpay().payments.fetch(paymentId) as { order_id: string; status: string; amount: number; currency: string };
    if (razorpayPayment.order_id !== orderId || razorpayPayment.status !== "captured") return Response.json({ error: "Payment is not captured." }, { status: 409 });
    await processCapturedPayment({ orderId, paymentId, amount: razorpayPayment.amount, currency: razorpayPayment.currency, source: "VERIFY" });
    return Response.json({ paid: true });
  } catch (error) { console.error("Razorpay verification failed", error); return Response.json({ error: "Payment verification failed." }, { status: 503 }); }
}
