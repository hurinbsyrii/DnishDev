import { formatDate, money } from "./projects";

export type LineItem = { id: string; description: string; quantity: string; rate: string };
export type InvoiceDraft = {
  number: string; issued: string; due: string;
  sender: string; senderDetails: string; recipient: string; recipientDetails: string;
  paid: string; notes: string; lines: LineItem[];
};

export function invoiceTotal(lines: LineItem[]) {
  return lines.reduce((total, item) => total + Number(item.quantity) * Math.round(Number(item.rate) * 100), 0);
}

export async function downloadInvoice(invoice: InvoiceDraft) {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "mm", format: "a4", compress: true });
  const ink = "#22222a";
  const muted = "#615d6d";
  const line = "#e9e5f0";
  const x = 18;
  const right = 192;
  const total = invoiceTotal(invoice.lines);
  const paid = Math.round(Number(invoice.paid) * 100);
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  const mmPerPixel = 25.4 / 96;
  const needsFallback = (value: string) => /[^\x20-\x7e\xa0-\xff–—‘’“”€]/u.test(value);
  const words = new Intl.Segmenter(undefined, { granularity: "word" });
  const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });

  function canvasFont(size: number, bold: boolean) {
    return `${bold ? 700 : 400} ${size * 4 / 3}px sans-serif`;
  }

  function text(value: string, left: number, y: number, size = 10, color = ink, bold = false, align: "left" | "right" = "left") {
    if (context && needsFallback(value)) {
      const scale = 3;
      const font = canvasFont(size, bold);
      context.font = font;
      const width = Math.ceil(context.measureText(value).width + 2);
      const height = Math.ceil(size * 2);
      canvas.width = width * scale;
      canvas.height = height * scale;
      context.scale(scale, scale);
      context.font = font;
      context.fillStyle = color;
      context.fillText(value, 1, size * 1.45);
      const offset = align === "right" ? width * mmPerPixel : 0;
      pdf.addImage(canvas, "PNG", left - offset, y - size * 1.45 * mmPerPixel, width * mmPerPixel, height * mmPerPixel);
      return;
    }
    pdf.setFont("helvetica", bold ? "bold" : "normal").setFontSize(size).setTextColor(color);
    pdf.text(value, left, y, { align });
  }

  function split(value: string, width: number, size: number, bold = false): string[] {
    pdf.setFont("helvetica", bold ? "bold" : "normal").setFontSize(size);
    return value.trim().split(/\r?\n/).flatMap((paragraph) => {
      if (!context || !needsFallback(paragraph)) return pdf.splitTextToSize(paragraph, width);
      context.font = canvasFont(size, bold);
      const fits = (value: string) => context.measureText(value).width * mmPerPixel <= width;
      const pieces = Array.from(words.segment(paragraph), ({ segment }) => segment).flatMap((word) =>
        fits(word) ? [word] : Array.from(graphemes.segment(word), ({ segment }) => segment));
      const lines: string[] = [];
      let current = "";
      for (const piece of pieces) {
        if (current && !fits(current + piece)) {
          lines.push(current.trimEnd());
          current = "";
        }
        current += current ? piece : piece.trimStart();
      }
      return [...lines, current.trim()];
    });
  }

  function wrapped(value: string, left: number, y: number, width: number, size: number, bold = false, color = ink) {
    const lines = split(value, width, size, bold);
    const leading = size * 0.44;
    lines.forEach((item, index) => text(item, left, y + index * leading, size, color, bold));
    return y + lines.length * leading;
  }

  pdf.setFillColor("#e9e4f9").roundedRect(x, 17, 174, 39, 5, 5, "F");
  text("INVOICE", 25, 35, 25, ink, true);
  wrapped(invoice.number, 25, 44, 110, 10, false, muted);
  text("ISSUED", 184, 29, 8, muted, true, "right");
  text(formatDate(invoice.issued, { day: "numeric", month: "short", year: "numeric" }), 184, 35, 10, ink, true, "right");
  text(`Due ${formatDate(invoice.due, { day: "numeric", month: "short", year: "numeric" })}`, 184, 44, 10, muted, false, "right");

  text("FROM", x, 69, 8, muted, true);
  text("BILL TO", 109, 69, 8, muted, true);
  const senderY = wrapped(invoice.sender, x, 76, 80, 12, true);
  const recipientY = wrapped(invoice.recipient, 109, 76, 83, 12, true);
  let y = Math.max(
    wrapped(invoice.senderDetails, x, senderY + 2, 80, 9, false, muted),
    wrapped(invoice.recipientDetails, 109, recipientY + 2, 83, 9, false, muted),
  ) + 8;

  function ensureRoom(height: number) {
    if (y + height <= 272) return;
    pdf.addPage();
    wrapped(`INVOICE  ${invoice.number}`, x, 21, 174, 10, true, muted);
    y = 32;
  }

  function tableHeading() {
    pdf.setFillColor("#f4f2f8").roundedRect(x, y, 174, 10, 2, 2, "F");
    text("DESCRIPTION", x + 4, y + 6.6, 8, muted, true);
    text("QTY", 116, y + 6.6, 8, muted, true, "right");
    text("RATE", 151, y + 6.6, 8, muted, true, "right");
    text("AMOUNT", right - 4, y + 6.6, 8, muted, true, "right");
    y += 10;
  }

  const totalsHeight = 36;
  for (const [index, item] of invoice.lines.entries()) {
    const description = split(item.description, 83, 10);
    const height = Math.max(11, 3.5 + description.length * 4.4);
    const required = height + (index === invoice.lines.length - 1 ? totalsHeight : 0);
    if (index === 0 || y + required > 272) { ensureRoom(required + 10); tableHeading(); }
    description.forEach((value, index) => text(value, x + 4, y + 6.7 + index * 4.4));
    const rate = Math.round(Number(item.rate) * 100);
    text(item.quantity, 116, y + 6.7, 10, ink, false, "right");
    text(money(rate), 151, y + 6.7, 10, ink, false, "right");
    text(money(Number(item.quantity) * rate), right - 4, y + 6.7, 10, ink, true, "right");
    y += height;
    pdf.setDrawColor(line).line(x, y, right, y);
  }

  y += 10;
  text("Subtotal", 111, y, 10, muted);
  text(money(total), right, y, 10, ink, false, "right");
  text("Amount paid", 111, y + 7, 10, muted);
  text(money(paid), right, y + 7, 10, ink, false, "right");
  pdf.setFillColor("#e9e4f9").roundedRect(106, y + 12, 86, 12, 3, 3, "F");
  text("Balance due", 111, y + 20, 11, ink, true);
  text(money(total - paid), right - 4, y + 20, 12, ink, true, "right");
  y += totalsHeight;

  if (invoice.notes.trim()) {
    const notes = split(invoice.notes, 174, 9);
    ensureRoom(11);
    text("PAYMENT DETAILS / NOTES", x, y, 8, muted, true);
    y += 6;
    notes.forEach((value) => {
      ensureRoom(5);
      text(value, x, y, 9, muted);
      y += 4;
    });
  }

  const count = pdf.getNumberOfPages();
  for (let page = 1; page <= count; page++) {
    pdf.setPage(page);
    pdf.setDrawColor(line).line(x, 278, right, 278);
    text("Thank you for your business.", x, 284, 8, muted);
    text(`${page} / ${count}`, right, 284, 8, muted, false, "right");
  }

  pdf.setProperties({ title: `Invoice ${invoice.number}`, author: invoice.sender });
  pdf.save(`${invoice.number.replace(/[^a-z0-9_-]/gi, "_") || "invoice"}.pdf`);
}
