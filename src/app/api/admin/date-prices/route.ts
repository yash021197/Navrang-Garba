import { requireAdmin } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const ticketCodes = new Set(["SINGLE", "COUPLE", "GROUP_OF_4"]);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function authorizeAndParse(request: Request) {
  const authorization = await requireAdmin();
  if (authorization.error) return { response: Response.json({ error: "Admin authorization is required." }, { status: authorization.error }) };
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const eventDayId = typeof body?.eventDayId === "string" ? body.eventDayId : "";
  const ticketTypeCode = typeof body?.ticketTypeCode === "string" ? body.ticketTypeCode : "";
  if (!uuid.test(eventDayId) || !ticketCodes.has(ticketTypeCode)) return { response: Response.json({ error: "Invalid date or ticket type." }, { status: 400 }) };
  return { eventDayId, ticketTypeCode, body };
}

async function findIds(eventDayId: string, ticketTypeCode: string) {
  const supabase = createAdminClient();
  const [{ data: eventDay, error: dayError }, { data: ticketType, error: typeError }] = await Promise.all([
    supabase.from("event_days").select("id").eq("id", eventDayId).lte("day_number", 9).maybeSingle(),
    supabase.from("ticket_types").select("id").eq("code", ticketTypeCode).maybeSingle(),
  ]);
  if (dayError || typeError || !eventDay || !ticketType) return null;
  return { eventDayId: eventDay.id, ticketTypeId: ticketType.id };
}

export async function PATCH(request: Request) {
  const parsed = await authorizeAndParse(request);
  if ("response" in parsed) return parsed.response;
  const price = parsed.body?.price;
  if (typeof price !== "number" || !Number.isSafeInteger(price) || price < 1 || price > 1_000_000) return Response.json({ error: "Enter a whole-number price from ₹1 to ₹1,000,000." }, { status: 400 });
  const ids = await findIds(parsed.eventDayId, parsed.ticketTypeCode);
  if (!ids) return Response.json({ error: "Date-specific price could not be updated." }, { status: 404 });
  const { data, error } = await createAdminClient().from("event_day_ticket_prices").upsert({ event_day_id: ids.eventDayId, ticket_type_id: ids.ticketTypeId, price }, { onConflict: "event_day_id,ticket_type_id" }).select("price").single();
  if (error || !data) return Response.json({ error: "Date-specific price could not be updated." }, { status: 500 });
  return Response.json({ price: Number(data.price), isOverride: true });
}

export async function DELETE(request: Request) {
  const parsed = await authorizeAndParse(request);
  if ("response" in parsed) return parsed.response;
  const ids = await findIds(parsed.eventDayId, parsed.ticketTypeCode);
  if (!ids) return Response.json({ error: "Date-specific price could not be removed." }, { status: 404 });
  const { error } = await createAdminClient().from("event_day_ticket_prices").delete().eq("event_day_id", ids.eventDayId).eq("ticket_type_id", ids.ticketTypeId);
  if (error) return Response.json({ error: "Date-specific price could not be removed." }, { status: 500 });
  return Response.json({ removed: true });
}
