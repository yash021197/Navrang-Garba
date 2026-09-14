import "server-only";

import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabase/admin";
import { createTicketPdf } from "@/lib/ticket-pdf";

export type EmailDelivery = { state: "SENT" | "FAILED" | "PENDING" | "NOT_REQUESTED"; maskedEmail?: string };
type TicketRow = { id: string; booking_id: string; ticket_reference: string; ticket_email_status: string | null; ticket_email_sent_at: string | null };
type BookingRow = {
  id: string; booking_reference: string; amount: number | string; quantity: number; currency: string; payment_status: string; created_at: string;
  customers: Array<{ name: string; email: string | null }>;
  event_days: Array<{ event_date: string | null }>;
  ticket_types: Array<{ name: string }>;
  payments: Array<{ status: string }>;
};

function escapeHtml(value: string) { return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]!); }
function formatDate(value: string) { return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "long", year: "numeric" }).format(new Date(`${value.slice(0, 10)}T00:00:00`)); }
function formatAmount(value: number | string) { return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(value)); }

export function maskEmail(email: string) {
  const [local, domain] = email.split("@");
  return `${local.slice(0, 1)}${"*".repeat(Math.max(1, local.length - 1))}@${domain}`;
}

async function markFailed(ticketId: string, message: string) {
  await createAdminClient().from("tickets").update({ ticket_email_status: "FAILED", ticket_email_error: message.slice(0, 500) }).eq("id", ticketId).eq("ticket_email_status", "SENDING");
}

export async function deliverTicketEmail(bookingReference: string, ticketReference: string): Promise<EmailDelivery> {
  const supabase = createAdminClient();
  const { data: ticket, error: ticketError } = await supabase.from("tickets").select("id,booking_id,ticket_reference,ticket_email_status,ticket_email_sent_at").eq("ticket_reference", ticketReference).maybeSingle<TicketRow>();
  if (ticketError || !ticket || ticket.ticket_reference !== ticketReference) return { state: "FAILED" };
  if (ticket.ticket_email_sent_at || ticket.ticket_email_status === "SENT") return { state: "SENT" };

  const { data: booking, error: bookingError } = await supabase.from("bookings").select("id,booking_reference,amount,quantity,currency,payment_status,created_at,customers(name,email),event_days(event_date),ticket_types(name),payments(status)").eq("id", ticket.booking_id).maybeSingle<BookingRow>();
  if (bookingError || !booking || booking.booking_reference !== bookingReference || booking.payment_status !== "PAID" || !booking.payments.some((payment) => payment.status === "PAID")) return { state: "FAILED" };
  const customer = booking.customers[0];
  const eventDay = booking.event_days[0];
  const ticketType = booking.ticket_types[0];
  if (!customer?.email) return { state: "NOT_REQUESTED" };

  const { data: claim, error: claimError } = await supabase.from("tickets").update({ ticket_email_status: "SENDING", ticket_email_attempted_at: new Date().toISOString(), ticket_email_error: null }).eq("id", ticket.id).is("ticket_email_sent_at", null).or("ticket_email_status.is.null,ticket_email_status.eq.FAILED").select("id").maybeSingle();
  if (claimError) return { state: "FAILED", maskedEmail: maskEmail(customer.email) };
  if (!claim) return { state: "PENDING", maskedEmail: maskEmail(customer.email) };

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    await markFailed(ticket.id, "Email delivery is not configured.");
    return { state: "FAILED", maskedEmail: maskEmail(customer.email) };
  }
  if (from.includes("onboarding@resend.dev") && !customer.email.endsWith("@resend.dev")) {
    await markFailed(ticket.id, "Customer delivery requires a verified sender domain.");
    return { state: "FAILED", maskedEmail: maskEmail(customer.email) };
  }

  try {
    const eventDate = eventDay?.event_date;
    if (!eventDate || !ticketType) throw new Error("Ticket event data is unavailable.");
    const pdf = await createTicketPdf({ ticketReference, bookingReference, customerName: customer.name, eventDate, ticketType: ticketType.name, quantity: booking.quantity, amount: Number(booking.amount), orderDate: booking.created_at });
    const ticketUrl = `https://navranggarba.vercel.app/booking/success?reference=${encodeURIComponent(bookingReference)}`;
    const eventDateLabel = formatDate(eventDate);
    const html = `<main style="font-family:Arial,sans-serif;background:#fff7e4;color:#321316;padding:32px"><section style="max-width:600px;margin:auto;border:1px solid #e6c15f;border-radius:16px;overflow:hidden;background:#fffaf0"><header style="padding:28px;background:#5b0713;color:#fff7e4"><p style="margin:0;color:#e6c15f;font-weight:bold;letter-spacing:1px">NAVRANG GARBA 2026</p><h1 style="margin:10px 0 0;font-size:28px">Your ticket is confirmed</h1></header><div style="padding:28px"><p>Hello ${escapeHtml(customer.name)},</p><p>Your Navrang Garba 2026 booking is confirmed. Your ticket is attached as a PDF.</p><table style="width:100%;border-collapse:collapse"><tr><td style="padding:8px 0;color:#72514b">Date</td><td style="padding:8px 0;font-weight:bold">${escapeHtml(eventDateLabel)}</td></tr><tr><td style="padding:8px 0;color:#72514b">Time</td><td style="padding:8px 0;font-weight:bold">7 PM onwards</td></tr><tr><td style="padding:8px 0;color:#72514b">Venue</td><td style="padding:8px 0;font-weight:bold">Ostwal Farms</td></tr><tr><td style="padding:8px 0;color:#72514b">Ticket</td><td style="padding:8px 0;font-weight:bold">${escapeHtml(ticketType.name)}</td></tr><tr><td style="padding:8px 0;color:#72514b">Amount paid</td><td style="padding:8px 0;font-weight:bold">${escapeHtml(formatAmount(booking.amount))}</td></tr><tr><td style="padding:8px 0;color:#72514b">Booking ID</td><td style="padding:8px 0;font-weight:bold">${escapeHtml(bookingReference)}</td></tr></table><p style="margin-top:24px">Please keep this ticket/QR ready when arriving. Each ticket QR can be scanned only once for entry.</p><p><a href="${ticketUrl}" style="display:inline-block;background:#5b0713;color:#fff7e4;padding:13px 18px;border-radius:8px;font-weight:bold;text-decoration:none">VIEW MY TICKET</a></p></div></section></main>`;
    const response = await new Resend(apiKey).emails.send({ from, to: [customer.email], subject: `Your Navrang Garba 2026 Ticket - ${eventDateLabel}`, html, attachments: [{ filename: `Navrang-Garba-2026-Ticket-${ticketReference}.pdf`, content: pdf }] }, { idempotencyKey: `navrang-ticket-email/${ticketReference}` });
    if (response.error || !response.data?.id) throw new Error(response.error?.message ?? "Email provider did not confirm delivery.");
    const { error: sentError } = await supabase.from("tickets").update({ ticket_email_status: "SENT", ticket_email_sent_at: new Date().toISOString(), ticket_email_provider_id: response.data.id, ticket_email_error: null }).eq("id", ticket.id).eq("ticket_email_status", "SENDING");
    if (sentError) throw sentError;
    return { state: "SENT", maskedEmail: maskEmail(customer.email) };
  } catch (error) {
    await markFailed(ticket.id, error instanceof Error ? error.message : "Email delivery failed.");
    return { state: "FAILED", maskedEmail: maskEmail(customer.email) };
  }
}
