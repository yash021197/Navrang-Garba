import Link from "next/link";
import { Card } from "@/components/ui/card";

export default async function BookingSuccessPage({ searchParams }: PageProps<"/booking/success">) {
  const { reference } = await searchParams;
  const bookingReference = typeof reference === "string" && /^BOOK-[A-Z0-9]{8,32}$/.test(reference) ? reference : null;
  return <main className="container placeholder-page"><p className="eyebrow">Navrang Garba</p><h1>Booking created</h1><Card className="confirmation-card"><p className="status-pill">Payment pending</p><p className="booking-reference">{bookingReference ?? "Booking reference unavailable"}</p><p>Your booking has been created. Complete payment to receive your ticket.</p><Link className="button" href="/tickets">Book another day</Link></Card></main>;
}
