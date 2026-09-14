import { createAdminClient } from "@/lib/supabase/admin";
import { eventConfig } from "@/lib/event-config";

const mobilePattern = /^(?:\+91)?[6-9]\d{9}$/;
const namePattern = /^[\p{L}\s.'-]{2,120}$/u;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ticketTypes = new Set(["SINGLE", "COUPLE", "GROUP_OF_4"]);

function badRequest(message: string) { return Response.json({ error: message }, { status: 400 }); }

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return badRequest("Please submit a valid booking request."); }
  const eventDayNumber = Number(body.eventDayNumber);
  const ticketTypeCode = typeof body.ticketTypeCode === "string" ? body.ticketTypeCode : "";
  const quantity = Number(body.quantity);
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const mobile = typeof body.mobile === "string" ? body.mobile.trim().replace(/[ -]/g, "") : "";
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const idempotencyKey = typeof body.idempotencyKey === "string" ? body.idempotencyKey : "";

  if (!Number.isInteger(eventDayNumber) || !eventConfig.days.some((day) => day.number === eventDayNumber && day.active)) return badRequest("Please choose an available event day.");
  if (!ticketTypes.has(ticketTypeCode)) return badRequest("Please choose a valid ticket type.");
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) return badRequest("Please select a quantity between 1 and 20.");
  if (!namePattern.test(name)) return badRequest("Enter your full name using valid characters.");
  if (!mobilePattern.test(mobile)) return badRequest("Enter a valid Indian mobile number.");
  if (!emailPattern.test(email)) return badRequest("Enter a valid email address.");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idempotencyKey)) return badRequest("Please refresh and try again.");

  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase.rpc("create_pending_booking", {
      p_event_day_number: eventDayNumber,
      p_ticket_type_code: ticketTypeCode,
      p_quantity: quantity,
      p_customer_name: name,
      p_mobile: mobile,
      p_email: email,
      p_idempotency_key: idempotencyKey,
    });
    if (error) {
      const safeMessages = ["Selected event day is unavailable", "Selected ticket type is unavailable", "Ticket pricing is not configured", "Invalid quantity", "Invalid customer name", "Invalid mobile number", "Invalid email address"];
      const message = safeMessages.find((known) => error.message.includes(known)) ?? "We could not create your booking. Please try again.";
      return Response.json({ error: message }, { status: message === "We could not create your booking. Please try again." ? 500 : 400 });
    }
    const booking = data?.[0];
    if (!booking?.booking_reference) return Response.json({ error: "We could not create your booking. Please try again." }, { status: 500 });
    return Response.json({ bookingReference: booking.booking_reference, amount: booking.amount, currency: booking.currency }, { status: 201 });
  } catch (error) {
    console.error("Pending booking creation failed", error);
    return Response.json({ error: "Booking service is temporarily unavailable. Please try again later." }, { status: 503 });
  }
}
