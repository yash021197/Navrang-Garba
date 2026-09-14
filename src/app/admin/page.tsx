import { redirect } from "next/navigation";
import { DashboardRefresh } from "@/components/admin/dashboard-refresh";
import { AdminLogoutButton } from "@/components/admin/logout-button";
import { PricingManager } from "@/components/admin/pricing-manager";
import { DateSpecificPricingManager } from "@/components/admin/date-specific-pricing-manager";
import { requireAdmin } from "@/lib/admin-auth";
import { getAdminDashboard } from "@/lib/admin-dashboard";

const currency = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const date = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" });
const time = new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit" });

export default async function AdminPage() {
  const auth = await requireAdmin();
  if (auth.error === 401) redirect("/admin/login");
  if (auth.error === 403) return <main className="container placeholder-page"><h1>Unauthorized</h1><p>Your account is not an active Navrang Garba administrator.</p></main>;
  const dashboard = await getAdminDashboard();

  return <main className="admin-dashboard">
    <header className="admin-header"><div className="container admin-header-content"><div><p className="eyebrow">Navrang Garba 2026</p><h1>Admin Dashboard</h1><p>{auth.user.email}</p></div><div className="admin-actions"><DashboardRefresh /><AdminLogoutButton /></div></div></header>
    <div className="container admin-content">
      <section aria-label="Dashboard summary" className="admin-summary-grid">
        {[
          ["Total bookings", dashboard.summary.totalBookings], ["Paid bookings", dashboard.summary.paidBookings], ["Total revenue", currency.format(dashboard.summary.totalRevenue)],
          ["Tickets generated", dashboard.summary.ticketsGenerated], ["Tickets scanned", dashboard.summary.ticketsScanned], ["Unused tickets", dashboard.summary.unusedTickets],
        ].map(([label, value]) => <article className="admin-metric" key={String(label)}><p>{label}</p><strong>{value}</strong></article>)}
      </section>

      <PricingManager pricing={dashboard.pricing} />
      <DateSpecificPricingManager pricing={dashboard.dateSpecificPricing} />

      <section className="admin-section"><div className="admin-section-heading"><p className="eyebrow">Live overview</p><h2>Day-wise performance</h2></div><div className="admin-day-grid">
        {dashboard.days.map((day) => <article className="admin-day-card" key={day.dayNumber}><p>Day {day.dayNumber}</p><h3>{day.date ? date.format(new Date(`${day.date}T00:00:00`)) : "Date unavailable"}</h3><dl><div><dt>Paid bookings</dt><dd>{day.paidBookings}</dd></div><div><dt>Tickets</dt><dd>{day.tickets}</dd></div><div><dt>Revenue</dt><dd>{currency.format(day.revenue)}</dd></div><div><dt>Scanned</dt><dd>{day.scanned}</dd></div><div><dt>Unused</dt><dd>{day.unused}</dd></div></dl></article>)}
      </div></section>

      <section className="admin-section"><div className="admin-section-heading"><p className="eyebrow">Authoritative bookings</p><h2>Ticket type breakdown</h2></div><div className="admin-type-grid">
        {dashboard.ticketTypes.map((ticketType) => <article className="admin-type-card" key={ticketType.code}><h3>{ticketType.name}</h3><dl><div><dt>Paid bookings</dt><dd>{ticketType.paidBookings}</dd></div><div><dt>Selected quantity</dt><dd>{ticketType.selectedQuantity}</dd></div><div><dt>Revenue</dt><dd>{currency.format(ticketType.revenue)}</dd></div></dl><p>Each paid booking has one QR ticket.</p></article>)}
      </div></section>

      <section className="admin-section admin-recent-grid"><div><div className="admin-section-heading"><p className="eyebrow">Latest 10</p><h2>Recent paid bookings</h2></div><div className="admin-table-wrap"><table><thead><tr><th>Booking</th><th>Customer</th><th>Event day</th><th>Ticket type</th><th>Amount</th><th>Paid</th></tr></thead><tbody>{dashboard.recentBookings.length ? dashboard.recentBookings.map((booking) => <tr key={booking.reference}><td>{booking.reference}</td><td>{booking.customerName}</td><td>{booking.eventDate ? date.format(new Date(`${booking.eventDate}T00:00:00`)) : "—"}</td><td>{booking.ticketType}</td><td>{currency.format(booking.amount)}</td><td>{time.format(new Date(booking.createdAt))}</td></tr>) : <tr><td colSpan={6}>No paid bookings yet.</td></tr>}</tbody></table></div></div>
        <div><div className="admin-section-heading"><p className="eyebrow">Latest activity</p><h2>Recent scans</h2></div><div className="admin-scan-list">{dashboard.recentScans.length ? dashboard.recentScans.map((scan, index) => <article key={`${scan.ticketReference}-${scan.scannedAt}-${index}`}><div><strong>{scan.ticketReference}</strong><p>{time.format(new Date(scan.scannedAt))}{scan.scannerIdentifier ? ` · ${scan.scannerIdentifier}` : ""}</p></div><span className={`admin-scan-status admin-scan-${scan.result.toLowerCase()}`}>{scan.result === "SUCCESS" ? "VALID" : scan.result}</span></article>) : <p className="muted">No scan activity yet.</p>}</div></div>
      </section>
    </div>
  </main>;
}
