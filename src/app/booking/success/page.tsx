import Link from "next/link";
import { Card } from "@/components/ui/card";
import { PaymentButton } from "@/components/booking/payment-button";
import { TicketCard } from "@/components/tickets/ticket-card";
import { createAdminClient } from "@/lib/supabase/admin";
import { fulfillPaidBooking, type TicketRecord } from "@/lib/tickets";
import type { EmailDelivery } from "@/lib/ticket-email";
type BookingView = { payment_status: string; quantity: number; amount: number | string; customers: { name: string; email: string | null } | Array<{ name: string; email: string | null }> | null; event_days: { event_date: string } | Array<{ event_date: string }> | null; ticket_types: { name: string } | Array<{ name: string }> | null };
function singleRelation<T>(value: T | T[] | null) { return Array.isArray(value) ? value[0] ?? null : value; }

export default async function BookingSuccessPage({ searchParams }: PageProps<"/booking/success">) {
  const { reference } = await searchParams;
  const bookingReference = typeof reference === "string" && /^BOOK-[A-Z0-9]{8,32}$/.test(reference) ? reference : null;
  let booking: BookingView | null = null; let ticket: TicketRecord | null = null; let email: EmailDelivery | null = null;
  if (bookingReference) { try { const supabase = createAdminClient(); const { data } = await supabase.from("bookings").select("payment_status,quantity,amount,customers(name,email),event_days(event_date),ticket_types(name)").eq("booking_reference", bookingReference).single(); booking = data; if (booking?.payment_status === "PAID") { const fulfilled = await fulfillPaidBooking(bookingReference); ticket = fulfilled.ticket; email = fulfilled.email; } } catch {} }
  const paid = booking?.payment_status === "PAID";
  const customer = booking ? singleRelation(booking.customers) : null;
  const eventDay = booking ? singleRelation(booking.event_days) : null;
  const ticketType = booking ? singleRelation(booking.ticket_types) : null;
  const paidTicket = paid && booking && ticket ? <TicketCard ticketReference={ticket.ticket_reference} date={eventDay?.event_date ?? ""} ticketType={ticketType?.name ?? "Pass"} quantity={booking.quantity} amount={Number(booking.amount)} customerName={customer?.name ?? ""} /> : null;
  return <main className="container placeholder-page"><p className="eyebrow">Navrang Garba</p><h1>{paid ? "Payment successful" : "Complete your payment"}</h1>{paidTicket}{paid && email?.state === "SENT" ? <p className="pending-note">Ticket emailed successfully to {email.maskedEmail}.</p> : null}{paid && email?.state === "FAILED" ? <p className="form-error">Your ticket is ready. We couldn&apos;t send the email right now. Please use the ticket shown above.</p> : null}{paid && email?.state === "PENDING" ? <p className="pending-note">Your ticket is ready. Email delivery is being confirmed.</p> : null}{paidTicket ? null : <Card className="confirmation-card"><p className="status-pill">{booking?.payment_status === "PENDING" ? "Payment pending" : "Booking unavailable"}</p><p className="booking-reference">{bookingReference ?? "Booking reference unavailable"}</p>{booking?.payment_status === "PENDING" && bookingReference ? <><p>Use secure Razorpay Test Mode checkout to complete this booking.</p><PaymentButton bookingReference={bookingReference} /></> : <p>We could not confirm this booking. Please return to ticket selection.</p>}</Card>}<Link className="button secondary-button" href="/tickets">Book another day</Link></main>;
}
