import crypto from "node:crypto";

import { getRazorpay } from "@/lib/razorpay";
import { createAdminClient } from "@/lib/supabase/admin";
import { fulfillPaidBooking } from "@/lib/tickets";

export const runtime = "nodejs";

const INCIDENT_BOOKING_PATTERN = "BOOK-29%5EFB";
const INCIDENT_PAYMENT_ID = "pay_Tjt0LduAoGYdw5";
const EXPECTED_AMOUNT_PAISE = 180_000;
const EXPECTED_BOOKING_AMOUNT_RUPEES = 1_800;
const EXPECTED_CURRENCY = "INR";

type PaymentRow = {
  id: string;
  status: string;
  provider: string;
  provider_order_id: string | null;
  provider_payment_id: string | null;
  amount: number | string;
  currency: string;
};

type IncidentBooking = {
  id: string;
  booking_reference: string;
  payment_status: string;
  amount: number | string;
  currency: string;
  payments: PaymentRow[];
  tickets: { id: string }[];
};

function isAuthorized(request: Request) {
  const configuredSecret = process.env.INCIDENT_RECOVERY_SECRET;
  const authorization = request.headers.get("authorization");
  if (!configuredSecret || !authorization?.startsWith("Bearer ")) return false;

  const suppliedSecret = authorization.slice("Bearer ".length);
  return suppliedSecret.length === configuredSecret.length
    && crypto.timingSafeEqual(Buffer.from(suppliedSecret), Buffer.from(configuredSecret));
}

function validPendingState(booking: IncidentBooking, payment: PaymentRow) {
  return booking.payment_status === "PENDING"
    && payment.status === "PENDING"
    && payment.provider === "RAZORPAY"
    && booking.tickets.length === 0
    && Number(booking.amount) === EXPECTED_BOOKING_AMOUNT_RUPEES
    && booking.currency === EXPECTED_CURRENCY
    && Number(payment.amount) === EXPECTED_BOOKING_AMOUNT_RUPEES
    && payment.currency === EXPECTED_CURRENCY
    && Boolean(payment.provider_order_id);
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) return Response.json({ error: "Unauthorized." }, { status: 401 });

  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("bookings")
      .select("id,booking_reference,payment_status,amount,currency,payments(id,status,provider,provider_order_id,provider_payment_id,amount,currency),tickets(id)")
      .like("booking_reference", INCIDENT_BOOKING_PATTERN)
      .maybeSingle();
    const booking = data as IncidentBooking | null;

    if (error || !booking || booking.payments.length !== 1) {
      console.error("Incident recovery stopped: target booking could not be resolved.");
      return Response.json({ error: "Incident target could not be resolved." }, { status: 404 });
    }

    const payment = booking.payments[0];
    if (booking.payment_status === "PAID" && payment.status === "PAID") {
      return Response.json({ recovered: true, already_recovered: true, ticket_count: booking.tickets.length });
    }

    if (!validPendingState(booking, payment)) {
      console.error("Incident recovery stopped: database preconditions failed.");
      return Response.json({ error: "Incident database preconditions failed." }, { status: 409 });
    }

    const razorpayPayment = await getRazorpay().payments.fetch(INCIDENT_PAYMENT_ID) as {
      id?: string;
      status?: string;
      amount?: number;
      currency?: string;
      order_id?: string;
    };
    if (razorpayPayment.id !== INCIDENT_PAYMENT_ID
      || razorpayPayment.status !== "captured"
      || razorpayPayment.amount !== EXPECTED_AMOUNT_PAISE
      || razorpayPayment.currency !== EXPECTED_CURRENCY
      || razorpayPayment.order_id !== payment.provider_order_id) {
      console.error("Incident recovery stopped: Razorpay payment preconditions failed.");
      return Response.json({ error: "Incident Razorpay preconditions failed." }, { status: 409 });
    }

    const { error: paymentUpdateError } = await supabase
      .from("payments")
      .update({ status: "PAID", provider_payment_id: INCIDENT_PAYMENT_ID, paid_at: new Date().toISOString() })
      .eq("id", payment.id)
      .eq("status", "PENDING");
    if (paymentUpdateError) throw paymentUpdateError;

    const { error: bookingUpdateError } = await supabase
      .from("bookings")
      .update({ payment_status: "PAID" })
      .eq("id", booking.id)
      .eq("payment_status", "PENDING");
    if (bookingUpdateError) throw bookingUpdateError;

    const fulfillment = await fulfillPaidBooking(booking.booking_reference);
    console.info("Incident recovery completed after captured-payment validation.");
    return Response.json({
      recovered: true,
      ticket_status: fulfillment.ticket.status,
      email_status: fulfillment.email.state,
    });
  } catch (error) {
    console.error("Incident recovery failed.", error);
    return Response.json({ error: "Incident recovery failed." }, { status: 503 });
  }
}
