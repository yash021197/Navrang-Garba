import Image from "next/image";
import QRCode from "qrcode";
export async function TicketCard({ ticketReference, date, ticketType, quantity, amount, customerName, isEarlyBird = false }: { ticketReference: string; date: string; ticketType: string; quantity: number; amount: number; customerName: string; isEarlyBird?: boolean }) {
  const qr = await QRCode.toDataURL(ticketReference, { margin: 1, width: 280, errorCorrectionLevel: "M" });
  return <section className="card confirmation-card"><p className="eyebrow">Navrang Garba 2026</p><h2>Your entry ticket</h2><Image unoptimized src={qr} alt={`QR code for ticket ${ticketReference}`} width={280} height={280} /><p className="booking-reference">{ticketReference}</p><p><strong>{ticketType} × {quantity}</strong><br />Amount paid: ₹{amount.toLocaleString("en-IN")}<br />{isEarlyBird ? "Valid 11–19 October 2026" : date}<br />Ostwal Farms · 7 PM onwards</p><p>{customerName}</p><p className="pending-note">{isEarlyBird ? "ONE QR · ALL 9 DAYS · One entry per event day." : "Valid for one entry only. Show this QR at the venue."}</p></section>;
}
