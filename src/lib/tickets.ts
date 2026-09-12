import crypto from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

export type TicketRecord = { ticket_reference: string; status: string; booking_id: string; event_day_id: string; ticket_type_id: string };
export async function generateTicketForPaidBooking(bookingReference: string): Promise<TicketRecord> {
  const supabase = createAdminClient();
  const { data: booking, error } = await supabase.from("bookings").select("id,payment_status,event_day_id,ticket_type_id,payments(status)").eq("booking_reference", bookingReference).single();
  const payment = booking?.payments?.[0];
  if (error || !booking) throw new Error("BOOKING_NOT_FOUND");
  if (booking.payment_status !== "PAID" || payment?.status !== "PAID") throw new Error("PAYMENT_NOT_PAID");
  const { data: existing } = await supabase.from("tickets").select("ticket_reference,status,booking_id,event_day_id,ticket_type_id").eq("booking_id", booking.id).maybeSingle();
  if (existing) return existing;
  const ticketReference = `TKT-${crypto.randomBytes(12).toString("hex").toUpperCase()}`;
  const { data: created, error: insertError } = await supabase.from("tickets").insert({ booking_id: booking.id, event_day_id: booking.event_day_id, ticket_type_id: booking.ticket_type_id, ticket_reference: ticketReference, status: "ACTIVE" }).select("ticket_reference,status,booking_id,event_day_id,ticket_type_id").single();
  if (!insertError && created) return created;
  const { data: raced } = await supabase.from("tickets").select("ticket_reference,status,booking_id,event_day_id,ticket_type_id").eq("booking_id", booking.id).single();
  if (raced) return raced;
  throw insertError ?? new Error("TICKET_GENERATION_FAILED");
}
