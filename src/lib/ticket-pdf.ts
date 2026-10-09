import "server-only";

import path from "node:path";
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
  isEarlyBird?: boolean;
};

const maroon = "#52030d";
const gold = "#efd476";
const cream = "#fff7df";
const pageWidth = 841.89;
const pageHeight = 595.28;
const backgroundPath = path.join(process.cwd(), "public", "images", "ticket-meet-background.png");
const jalaramLogoPath = path.join(process.cwd(), "public", "images", "jalaram-group-logo.png");

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${value.slice(0, 10)}T00:00:00`)).toUpperCase();
}

function formatAmount(amount: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(amount);
}

function writeLabelValue(doc: PDFKit.PDFDocument, label: string, value: string, x: number, y: number, width: number, valueSize = 13) {
  doc.font("Helvetica-Bold").fontSize(7.5).fillColor(gold).text(label.toUpperCase(), x, y, { width, characterSpacing: 1.2 });
  doc.font("Helvetica-Bold").fontSize(valueSize).fillColor(cream).text(value, x, y + 13, { width, lineGap: 2 });
}

function drawSourceCrop(doc: PDFKit.PDFDocument, crop: { x: number; y: number; width: number }, target: { x: number; y: number; width: number; height: number }) {
  const sourceSize = 8400;
  const scale = target.width / crop.width;
  doc.save();
  doc.roundedRect(target.x, target.y, target.width, target.height, 4).clip();
  doc.image(backgroundPath, target.x - crop.x * scale, target.y - crop.y * scale, { width: sourceSize * scale });
  doc.restore();
}

function drawPartnerMark(doc: PDFKit.PDFDocument) {
  // The supplied artwork is 8400px square. This clips the original Athena mark
  // rather than recreating it as text or vector artwork.
  drawSourceCrop(doc, { x: 3400, y: 7200, width: 1800 }, { x: 664, y: 457, width: 142, height: 88 });
}

export async function createTicketPdf(input: TicketPdfInput): Promise<Buffer> {
  const qr = await QRCode.toBuffer(input.ticketReference, { type: "png", width: 760, margin: 2, errorCorrectionLevel: "M", color: { dark: "#000000", light: "#ffffff" } });
  const dateLabel = input.isEarlyBird ? "11-19 OCTOBER 2026" : formatDate(input.eventDate);
  const entryRule = input.isEarlyBird ? "ONE QR ALLOWS ONE ENTRY PER EVENT DAY" : "VALID FOR ONE EVENT ENTRY ONLY";
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: [pageWidth, pageHeight], margin: 0, info: { Title: `Navrang Garba 2026 - ${input.ticketReference}`, Author: "Navrang Garba" } });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.rect(0, 0, pageWidth, pageHeight).fill(maroon);
    // Clean landscape base: derived from the supplied artwork's maroon-and-gold palette.
    // The source file is used only for the original Athena partner mark below.
    doc.save().opacity(0.15).strokeColor(gold).lineWidth(1);
    doc.circle(-20, 550, 138).stroke();
    doc.circle(-20, 550, 104).stroke();
    doc.circle(610, 610, 170).stroke();
    doc.circle(610, 610, 132).stroke();
    doc.circle(860, 44, 118).stroke();
    doc.circle(860, 44, 82).stroke();
    doc.restore();
    doc.roundedRect(2, 2, pageWidth - 4, pageHeight - 4, 18).lineWidth(1.6).strokeColor(gold).stroke();
    doc.strokeColor(gold).lineWidth(1.2).dash(5, { space: 6 }).moveTo(636, 19).lineTo(636, pageHeight - 19).stroke().undash();

    doc.image(jalaramLogoPath, 39, 37, { fit: [150, 58], valign: "center" });
    drawSourceCrop(doc, { x: 6800, y: 20, width: 1450 }, { x: 347, y: 24, width: 105, height: 100 });
    doc.font("Times-Bold").fontSize(18).fillColor(gold).text("NAVRANG GARBA MAHOTSAV 2.0", 190, 132, { width: 420, align: "center", characterSpacing: 0.7 });
    doc.strokeColor(gold).lineWidth(1).moveTo(253, 161).lineTo(546, 161).stroke();
    doc.circle(399.5, 161, 4).fill(gold);
    doc.circle(399.5, 161, 2).fillOpacity(0.72).fill(maroon).fillOpacity(1);

    const leftX = 58;
    writeLabelValue(doc, input.isEarlyBird ? "Pass validity" : "Event date", dateLabel, leftX, 196, 265, 15);
    writeLabelValue(doc, "Ticket type", input.ticketType, leftX, 258, 265, 15);
    writeLabelValue(doc, "Quantity", String(input.quantity), leftX, 320, 265, 15);
    writeLabelValue(doc, "Venue", "OSTWAL FARMS", leftX, 382, 265, 15);
    doc.font("Helvetica").fontSize(10).fillColor(gold).text("Badnera Road, Amravati", leftX, 409, { width: 265 });
    writeLabelValue(doc, "Event time", "7:00 PM ONWARDS", leftX, 433, 265, 15);

    doc.roundedRect(362, 187, 215, 215, 16).fill("#ffffff");
    doc.image(qr, 379, 204, { width: 181, height: 181 });
    doc.font("Helvetica-Bold").fontSize(8).fillColor(gold).text("TICKET REFERENCE", 370, 419, { width: 199, align: "center", characterSpacing: 1.3 });
    doc.font("Helvetica-Bold").fontSize(13).fillColor(cream).text(input.ticketReference, 370, 435, { width: 199, align: "center", characterSpacing: 0.65 });
    doc.roundedRect(333, 471, 273, 37, 18).lineWidth(1).strokeColor(gold).stroke();
    doc.font("Helvetica-Bold").fontSize(8.5).fillColor(gold).text(entryRule, 345, 484, { width: 249, align: "center", characterSpacing: 0.45 });

    doc.font("Times-Bold").fontSize(17).fillColor(gold).text("DANCE", 667, 202, { width: 137, align: "center", characterSpacing: 2.6 });
    doc.font("Times-Bold").fontSize(17).fillColor(gold).text("MUSIC", 667, 238, { width: 137, align: "center", characterSpacing: 2.6 });
    doc.font("Times-Bold").fontSize(17).fillColor(gold).text("TRADITION", 667, 274, { width: 137, align: "center", characterSpacing: 1.5 });
    doc.font("Times-Bold").fontSize(17).fillColor(gold).text("TOGETHER", 667, 310, { width: 137, align: "center", characterSpacing: 1.5 });
    doc.strokeColor(gold).lineWidth(1).moveTo(673, 347).lineTo(798, 347).stroke();
    doc.font("Helvetica-Bold").fontSize(7.5).fillColor(gold).text("TICKET PARTNER", 665, 385, { width: 141, align: "center", characterSpacing: 1.3 });
    drawPartnerMark(doc);

    doc.strokeColor(gold).lineWidth(0.6).moveTo(46, 533).lineTo(606, 533).stroke();
    doc.font("Helvetica").fontSize(8.5).fillColor(cream).text(`BOOKING ${input.bookingReference}  |  ORDERED ${formatDate(input.orderDate)}  |  ${formatAmount(input.amount)}`, 46, 547, { width: 560, align: "center", characterSpacing: 0.2 });
    doc.end();
  });
}
