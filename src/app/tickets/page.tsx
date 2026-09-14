import { BookingFlow } from "@/components/booking/booking-flow";
import { eventConfig, type TicketType } from "@/lib/event-config";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

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
    const dayNumber = override.event_days?.[0]?.day_number;
    const ticketTypeCode = override.ticket_types?.[0]?.code;
    return typeof dayNumber === "number" && (ticketTypeCode === "SINGLE" || ticketTypeCode === "COUPLE" || ticketTypeCode === "GROUP_OF_4")
      ? [{ dayNumber, ticketTypeCode, price: Number(override.price) }]
      : [];
  });

  return <BookingFlow ticketTypes={ticketTypes} dateSpecificPrices={dateSpecificPrices} />;
}
