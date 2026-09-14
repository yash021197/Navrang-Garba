import { BookingFlow } from "@/components/booking/booking-flow";
import { eventConfig, type TicketType } from "@/lib/event-config";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export default async function TicketsPage() {
  const { data } = await createAdminClient()
    .from("ticket_types")
    .select("code, price, active");

  const ticketTypes = eventConfig.ticketTypes.map((ticket) => {
    const current = data?.find((item) => item.code === ticket.code);

    return {
      ...ticket,
      price: current ? Number(current.price) : ticket.price,
      active: current?.active ?? ticket.active,
    };
  }) satisfies TicketType[];

  return <BookingFlow ticketTypes={ticketTypes} />;
}
