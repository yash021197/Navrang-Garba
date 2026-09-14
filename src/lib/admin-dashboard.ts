import "server-only";

import type { DashboardSnapshot } from "@/components/admin/dashboard-types";
import { createAdminClient } from "@/lib/supabase/admin";

type PaidBookingRow = {
  id: string;
  booking_reference: string;
  amount: number | string;
  quantity: number;
  created_at: string;
  event_day_id: string;
  ticket_type_id: string;
  customers: Array<{ name: string }>;
  event_days: Array<{ day_number: number; event_date: string | null }>;
  ticket_types: Array<{ code: "SINGLE" | "COUPLE" | "GROUP_OF_4"; name: string }>;
};

type TicketRow = { booking_id: string; event_day_id: string; status: "ACTIVE" | "USED" | "CANCELLED" };
type EventDayRow = { id: string; day_number: number; event_date: string | null };
type OverrideRow = { event_day_id: string; ticket_type_id: string; price: number | string };
type ScanRow = {
  result: string;
  scanned_at: string;
  scanned_by: string | null;
  tickets: Array<{ ticket_reference: string }>;
};

const ticketTypeOrder = ["SINGLE", "COUPLE", "GROUP_OF_4"] as const;

async function fetchAll<T>(fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  const pageSize = 500;
  const rows: T[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await fetchPage(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const page = data ?? [];
    rows.push(...page);
    if (page.length < pageSize) return rows;
    from += pageSize;
  }
}

function amount(value: number | string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function getAdminDashboard(): Promise<DashboardSnapshot> {
  const supabase = createAdminClient();
  const [bookingCountResult, eventDays, paidBookings, tickets, recentScansResult, ticketTypesResult, overridesResult] = await Promise.all([
    supabase.from("bookings").select("id", { count: "exact", head: true }),
    supabase.from("event_days").select("id,day_number,event_date").lte("day_number", 9).order("day_number"),
    fetchAll<PaidBookingRow>((from, to) => supabase.from("bookings").select("id,booking_reference,amount,quantity,created_at,event_day_id,ticket_type_id,customers(name),event_days(day_number,event_date),ticket_types(code,name)").eq("payment_status", "PAID").order("created_at", { ascending: false }).range(from, to)),
    fetchAll<TicketRow>((from, to) => supabase.from("tickets").select("booking_id,event_day_id,status").range(from, to)),
    supabase.from("scan_logs").select("result,scanned_at,scanned_by,tickets(ticket_reference)").order("scanned_at", { ascending: false }).limit(10),
    supabase.from("ticket_types").select("id,code,name,price").in("code", ticketTypeOrder),
    supabase.from("event_day_ticket_prices").select("event_day_id,ticket_type_id,price"),
  ]);

  if (bookingCountResult.error) throw new Error(bookingCountResult.error.message);
  if (eventDays.error) throw new Error(eventDays.error.message);
  if (recentScansResult.error) throw new Error(recentScansResult.error.message);
  if (ticketTypesResult.error) throw new Error(ticketTypesResult.error.message);
  if (overridesResult.error) throw new Error(overridesResult.error.message);

  const paidBookingIds = new Set(paidBookings.map((booking) => booking.id));
  const paidTickets = tickets.filter((ticket) => paidBookingIds.has(ticket.booking_id));
  const paidTicketsByDay = new Map<string, TicketRow[]>();
  for (const ticket of paidTickets) {
    const dayTickets = paidTicketsByDay.get(ticket.event_day_id) ?? [];
    dayTickets.push(ticket);
    paidTicketsByDay.set(ticket.event_day_id, dayTickets);
  }

  const dayRows = (eventDays.data ?? []) as EventDayRow[];
  const days = dayRows.map((day) => {
    const dayBookings = paidBookings.filter((booking) => booking.event_day_id === day.id);
    const dayTickets = paidTicketsByDay.get(day.id) ?? [];
    return {
      dayNumber: day.day_number,
      date: day.event_date,
      paidBookings: dayBookings.length,
      tickets: dayTickets.length,
      revenue: dayBookings.reduce((total, booking) => total + amount(booking.amount), 0),
      scanned: dayTickets.filter((ticket) => ticket.status === "USED").length,
      unused: dayTickets.filter((ticket) => ticket.status === "ACTIVE").length,
    };
  });

  const ticketTypes = ticketTypeOrder.map((code) => {
    const typeBookings = paidBookings.filter((booking) => booking.ticket_types[0]?.code === code);
    return {
      code,
      name: typeBookings[0]?.ticket_types[0]?.name ?? (code === "GROUP_OF_4" ? "Group of 4" : code[0] + code.slice(1).toLowerCase()),
      paidBookings: typeBookings.length,
      selectedQuantity: typeBookings.reduce((total, booking) => total + booking.quantity, 0),
      revenue: typeBookings.reduce((total, booking) => total + amount(booking.amount), 0),
    };
  });

  return {
    pricing: ticketTypeOrder.map((code) => {
      const ticketType = ticketTypesResult.data?.find((item) => item.code === code);
      return {
        code,
        name: ticketType?.name ?? (code === "GROUP_OF_4" ? "Group of 4" : code === "SINGLE" ? "Single" : "Couple"),
        price: amount(ticketType?.price ?? 0),
      };
    }),
    dateSpecificPricing: dayRows.map((day) => ({
      eventDayId: day.id,
      dayNumber: day.day_number,
      date: day.event_date,
      prices: ticketTypeOrder.map((code) => {
        const ticketType = ticketTypesResult.data?.find((item) => item.code === code);
        const override = (overridesResult.data as OverrideRow[] | null)?.find((item) => item.event_day_id === day.id && item.ticket_type_id === ticketType?.id);
        const defaultPrice = amount(ticketType?.price ?? 0);
        return { code, name: ticketType?.name ?? code, price: override ? amount(override.price) : defaultPrice, defaultPrice, isOverride: Boolean(override) };
      }),
    })),
    summary: {
      totalBookings: bookingCountResult.count ?? 0,
      paidBookings: paidBookings.length,
      totalRevenue: paidBookings.reduce((total, booking) => total + amount(booking.amount), 0),
      ticketsGenerated: paidTickets.length,
      ticketsScanned: paidTickets.filter((ticket) => ticket.status === "USED").length,
      unusedTickets: paidTickets.filter((ticket) => ticket.status === "ACTIVE").length,
    },
    days,
    ticketTypes,
    recentBookings: paidBookings.slice(0, 10).map((booking) => ({
      reference: booking.booking_reference,
      customerName: booking.customers[0]?.name ?? "Customer",
      eventDate: booking.event_days[0]?.event_date ?? null,
      ticketType: booking.ticket_types[0]?.name ?? "Ticket",
      amount: amount(booking.amount),
      createdAt: booking.created_at,
    })),
    recentScans: ((recentScansResult.data ?? []) as ScanRow[]).map((scan) => ({
      ticketReference: scan.tickets[0]?.ticket_reference ?? "Unknown ticket",
      scannedAt: scan.scanned_at,
      result: scan.result,
      scannerIdentifier: scan.scanned_by ? `Staff ${scan.scanned_by.slice(0, 8)}` : null,
    })),
  };
}
