import { generateTicketForPaidBooking } from "@/lib/tickets";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const { bookingReference } = await request.json().catch(() => ({}));
  if (typeof bookingReference !== "string" || !/^BOOK-[A-Z0-9]{8,32}$/.test(bookingReference)) return Response.json({ error: "Invalid booking." }, { status: 400 });
  try { const ticket = await generateTicketForPaidBooking(bookingReference); return Response.json({ ticketReference: ticket.ticket_reference, status: ticket.status }); }
  catch (error) { const message = error instanceof Error ? error.message : ""; return Response.json({ error: message === "PAYMENT_NOT_PAID" ? "Payment is not verified." : "Ticket could not be generated." }, { status: message === "PAYMENT_NOT_PAID" ? 409 : 400 }); }
}
