import "server-only";

import PDFDocument from "pdfkit";
import QRCode from "qrcode";

export type TicketPdfInput = {
  ticketReference: string;
  bookingReference: string;
  customerName: string;
  eventDate: string;
  ticketType: string;
  quantity: number;
  amount: number;
  orderDate: string;
};

const maroon = "#5b0713";
const gold = "#e6c15f";
const cream = "#fff7e4";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "long", year: "numeric" }).format(new Date(`${value.slice(0, 10)}T00:00:00`));
}

function formatAmount(amount: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(amount);
}

function writeLabelValue(doc: PDFKit.PDFDocument, label: string, value: string, x: number, y: number, width: number) {
  doc.font("Helvetica-Bold").fontSize(8).fillColor(gold).text(label.toUpperCase(), x, y, { width });
  doc.font("Helvetica").fontSize(10).fillColor(cream).text(value, x, y + 13, { width, lineGap: 2 });
}

export async function createTicketPdf(input: TicketPdfInput): Promise<Buffer> {
  const qr = await QRCode.toBuffer(input.ticketReference, { type: "png", width: 560, margin: 2, errorCorrectionLevel: "M" });
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 0, info: { Title: `Navrang Garba 2026 - ${input.ticketReference}`, Author: "Navrang Garba" } });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.rect(0, 0, 595.28, 841.89).fill(maroon);
    doc.circle(545, 80, 150).fillOpacity(0.13).fill(gold).fillOpacity(1);
    doc.circle(60, 760, 170).fillOpacity(0.09).fill(gold).fillOpacity(1);
    doc.fillColor(gold).font("Helvetica-Bold").fontSize(27).text("NAVRANG GARBA 2026", 48, 48);
    doc.fillColor(cream).font("Helvetica").fontSize(11).text("Your confirmed entry ticket", 50, 84);
    doc.strokeColor(gold).lineWidth(1.5).moveTo(48, 110).lineTo(547, 110).stroke();

    doc.roundedRect(48, 140, 205, 205, 14).fill("#ffffff");
    doc.image(qr, 62, 154, { width: 177, height: 177 });
    doc.fillColor(cream).font("Helvetica-Bold").fontSize(10).text("SCAN AT ENTRY", 84, 362, { width: 135, align: "center" });
    doc.font("Helvetica").fontSize(8).fillColor("#f7dfc0").text("One QR is valid for one entry only", 62, 378, { width: 178, align: "center" });

    doc.roundedRect(278, 140, 269, 253, 14).lineWidth(1.2).strokeColor(gold).stroke();
    writeLabelValue(doc, "Event date", formatDate(input.eventDate), 302, 165, 215);
    writeLabelValue(doc, "Time", "7 PM onwards", 302, 207, 215);
    writeLabelValue(doc, "Venue", "Ostwal Farms", 302, 249, 215);
    writeLabelValue(doc, "Address", "Beside Khandelwal Lawns, in front of TCC Mall, Badnera Road, Amravati - 444607", 302, 291, 215);
    writeLabelValue(doc, "Ticket & price", `${input.ticketType} × ${input.quantity} - ${formatAmount(input.amount)}`, 302, 349, 215);

    doc.roundedRect(48, 425, 499, 124, 14).fill("#711020");
    writeLabelValue(doc, "Ordered by", input.customerName, 72, 449, 190);
    writeLabelValue(doc, "Ticket no.", input.ticketReference, 72, 497, 190);
    writeLabelValue(doc, "Order no.", input.bookingReference, 300, 449, 190);
    writeLabelValue(doc, "Order date", formatDate(input.orderDate), 300, 497, 190);

    doc.fillColor(gold).font("Helvetica-Bold").fontSize(14).text("Event rules", 48, 587);
    const rules = [
      "Ticket is non-refundable unless organizer policy says otherwise.",
      "One ticket/QR is valid for one entry only. Present the QR at the entrance.",
      "Outside food, drinks, and prohibited items are not allowed according to event policy.",
      "Misbehavior, harassment, or violence may result in removal from the venue.",
      "Vehicles must be parked only in designated areas.",
      "Please respect Garba traditions, organizers, and venue instructions.",
    ];
    doc.font("Helvetica").fontSize(9.5).fillColor(cream);
    let ruleY = 615;
    for (const [index, rule] of rules.entries()) {
      doc.text(`${index + 1}. ${rule}`, 58, ruleY, { width: 480, lineGap: 2 });
      ruleY += 32;
    }
    doc.strokeColor(gold).moveTo(48, 797).lineTo(547, 797).stroke();
    doc.font("Helvetica-Bold").fontSize(10).fillColor(gold).text("NAVRANG GARBA 2026", 48, 809);
    doc.font("Helvetica").fontSize(8).fillColor(cream).text("11-19 October 2026 | Ostwal Farms | 7 PM onwards", 48, 823);
    doc.end();
  });
}
