import { createAdminClient } from "@/lib/supabase/admin";
import { getRazorpay, getRazorpayKeyId } from "@/lib/razorpay";

export const runtime = "nodejs";
const refPattern = /^BOOK-[A-Z0-9]{8,32}$/;

export async function POST(request: Request) {
  const { bookingReference } = await request.json().catch(() => ({}));
  if (typeof bookingReference !== "string" || !refPattern.test(bookingReference)) return Response.json({ error: "Invalid booking." }, { status: 400 });
  try {
    const supabase = createAdminClient();
    const { data: booking, error } = await supabase.from("bookings").select("id,amount,currency,payment_status,payments(id,provider_order_id,status)").eq("booking_reference", bookingReference).single();
    const payment = booking?.payments?.[0];
    if (error || !booking || !payment) return Response.json({ error: "Booking not found." }, { status: 404 });
    if (booking.payment_status === "PAID" || payment.status === "PAID") return Response.json({ error: "This booking has already been paid." }, { status: 409 });
    const amountPaise = Math.round(Number(booking.amount) * 100);
    if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0 || booking.currency !== "INR") return Response.json({ error: "Payment configuration is unavailable." }, { status: 400 });
    let orderId = payment.provider_order_id;
    if (!orderId) {
      const order = await getRazorpay().orders.create({ amount: amountPaise, currency: "INR", receipt: bookingReference, notes: { booking_reference: bookingReference } });
      orderId = order.id;
      const { error: updateError } = await supabase.from("payments").update({ provider: "RAZORPAY", provider_order_id: orderId }).eq("id", payment.id).is("provider_order_id", null);
      if (updateError) throw updateError;
    }
    return Response.json({ keyId: getRazorpayKeyId(), orderId, amount: amountPaise, currency: "INR", bookingReference });
  } catch (error) {
    console.error("Razorpay order creation failed", error);
    return Response.json({ error: "Unable to start payment. Please try again." }, { status: 503 });
  }
}
