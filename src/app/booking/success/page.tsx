import Link from "next/link";
import { Card } from "@/components/ui/card";
import { PaymentButton } from "@/components/booking/payment-button";
import { TicketCard } from "@/components/tickets/ticket-card";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateTicketForPaidBooking, type TicketRecord } from "@/lib/tickets";
type BookingView = { payment_status: string; quantity: number; customers: { name: string }[]; event_days: { event_date: string }[]; ticket_types: { name: string }[] };

export default async function BookingSuccessPage({ searchParams }: PageProps<"/booking/success">) {
  const { reference } = await searchParams;
  const bookingReference = typeof reference === "string" && /^BOOK-[A-Z0-9]{8,32}$/.test(reference) ? reference : null;
  let booking: BookingView | null = null; let ticket: TicketRecord | null = null;
  if (bookingReference) { try { const supabase = createAdminClient(); const { data } = await supabase.from("bookings").select("payment_status,quantity,customers(name),event_days(event_date),ticket_types(name)").eq("booking_reference", bookingReference).single(); booking = data; if (booking?.payment_status === "PAID") ticket = await generateTicketForPaidBooking(bookingReference); } catch {} }
  const paid = booking?.payment_status === "PAID";
  const paidTicket = paid && booking && ticket ? <TicketCard ticketReference={ticket.ticket_reference} date={booking.event_days[0]?.event_date ?? ""} ticketType={booking.ticket_types[0]?.name ?? "Pass"} quantity={booking.quantity} customerName={booking.customers[0]?.name ?? ""} /> : null;
  return <main className="container placeholder-page"><p className="eyebrow">Navrang Garba</p><h1>{paid ? "Payment successful" : "Complete your payment"}</h1>{paidTicket ?? <Card className="confirmation-card"><p className="status-pill">{booking?.payment_status === "PENDING" ? "Payment pending" : "Booking unavailable"}</p><p className="booking-reference">{bookingReference ?? "Booking reference unavailable"}</p>{booking?.payment_status === "PENDING" && bookingReference ? <><p>Use secure Razorpay Test Mode checkout to complete this booking.</p><PaymentButton bookingReference={bookingReference} /></> : <p>We could not confirm this booking. Please return to ticket selection.</p>}</Card>}<Link className="button secondary-button" href="/tickets">Book another day</Link></main>;
}
