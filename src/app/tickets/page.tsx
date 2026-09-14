import { BookingFlow } from "@/components/booking/booking-flow";
import { eventConfig, type TicketType } from "@/lib/event-config";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

function singleRelation<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function TicketsPage() {
  const supabase = createAdminClient();
  const [{ data }, { data: overrides }] = await Promise.all([
    supabase
    .from("ticket_types")
    .select("code, price, active"),
    supabase
      .from("event_day_ticket_prices")
      .select("price,event_days(day_number),ticket_types(code)"),
  ]);

  const ticketTypes = eventConfig.ticketTypes.map((ticket) => {
    const current = data?.find((item) => item.code === ticket.code);

    return {
      ...ticket,
      price: current ? Number(current.price) : ticket.price,
      active: current?.active ?? ticket.active,
    };
  }) satisfies TicketType[];

  const dateSpecificPrices = (overrides ?? []).flatMap((override) => {
    const eventDay = singleRelation(override.event_days);
    const ticketType = singleRelation(override.ticket_types);
    const dayNumber = eventDay?.day_number;
    const ticketTypeCode = ticketType?.code;
    return typeof dayNumber === "number" && (ticketTypeCode === "SINGLE" || ticketTypeCode === "COUPLE" || ticketTypeCode === "GROUP_OF_4")
      ? [{ dayNumber, ticketTypeCode, price: Number(override.price) }]
      : [];
  });

  return <BookingFlow ticketTypes={ticketTypes} dateSpecificPrices={dateSpecificPrices} />;
}
