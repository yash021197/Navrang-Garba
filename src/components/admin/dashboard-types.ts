export type DashboardSnapshot = {
  paymentHealth: { pending: number; stalePending: number; reconciliationFailures: number; paidWithoutTicket: number };
  earlyBird: { price: number; active: boolean } | null;
  pricing: Array<{
    code: "SINGLE" | "COUPLE" | "GROUP_OF_4" | "EARLY_BIRD_9_DAY";
    name: string;
    price: number;
  }>;
  dateSpecificPricing: Array<{
    eventDayId: string;
    dayNumber: number;
    date: string | null;
    prices: Array<{
      code: "SINGLE" | "COUPLE" | "GROUP_OF_4";
      name: string;
      price: number;
      defaultPrice: number;
      isOverride: boolean;
    }>;
  }>;
  summary: {
    totalBookings: number;
    paidBookings: number;
    totalRevenue: number;
    ticketsGenerated: number;
    ticketsScanned: number;
    unusedTickets: number;
  };
  days: Array<{
    dayNumber: number;
    date: string | null;
    paidBookings: number;
    tickets: number;
    revenue: number;
    scanned: number;
    unused: number;
  }>;
  ticketTypes: Array<{
    code: "SINGLE" | "COUPLE" | "GROUP_OF_4" | "EARLY_BIRD_9_DAY";
    name: string;
    paidBookings: number;
    selectedQuantity: number;
    revenue: number;
  }>;
  recentBookings: Array<{
    reference: string;
    customerName: string;
    eventDate: string | null;
    ticketType: string;
    amount: number;
    createdAt: string;
  }>;
  recentScans: Array<{
    ticketReference: string;
    scannedAt: string;
    result: string;
    scannerIdentifier: string | null;
  }>;
};
