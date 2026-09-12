import { requireScannerStaff } from "@/lib/scanner-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await requireScannerStaff();
  if (auth.error) return Response.json({ error: "Scanner authorization is required." }, { status: auth.error });
  const { ticketReference } = await request.json().catch(() => ({}));
  if (typeof ticketReference !== "string" || !/^TKT-[A-Z0-9]{8,32}$/.test(ticketReference)) return Response.json({ status: "INVALID_TICKET", entryAllowed: false, message: "ENTRY DENIED", reason: "INVALID TICKET" }, { status: 400 });
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("validate_and_consume_ticket_reference", { input_reference: ticketReference, scanner_user_id: auth.staff.user_id });
  if (error || !Array.isArray(data) || data.length !== 1) return Response.json({ error: "Ticket validation is temporarily unavailable." }, { status: 500 });
  const scan = data[0] as { result: string; ticket_reference: string | null; event_day_id: string | null; ticket_type_id: string | null };
  const entryAllowed = scan.result === "SUCCESS";
  const status = entryAllowed ? "VALID" : scan.result === "ALREADY_USED" ? "ALREADY_USED" : "INVALID_TICKET";
  const response: Record<string, unknown> = { status, entryAllowed, message: entryAllowed ? "ENTRY ALLOWED" : "ENTRY DENIED", reason: entryAllowed ? undefined : status === "ALREADY_USED" ? "TICKET ALREADY USED" : "INVALID TICKET" };
  if (scan.ticket_reference && scan.event_day_id && scan.ticket_type_id) {
    const [{ data: day }, { data: type }] = await Promise.all([supabase.from("event_days").select("event_date").eq("id", scan.event_day_id).maybeSingle(), supabase.from("ticket_types").select("name").eq("id", scan.ticket_type_id).maybeSingle()]);
    response.ticketReference = scan.ticket_reference; response.eventDay = day?.event_date ?? null; response.ticketType = type?.name ?? null;
  }
  return Response.json(response);
}
