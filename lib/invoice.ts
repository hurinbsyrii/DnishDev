import { formatDate, money } from "./projects";

export type LineItem = { id: string; description: string; quantity: string; rate: string };
export type InvoiceDraft = {
  number: string; issued: string; due: string;
  sender: string; senderDetails: string; recipient: string; recipientDetails: string;
  paid: string; notes: string; lines: LineItem[];
};

export function invoiceNumber(today: string) {
  const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase();
  return `INV-${today.replaceAll("-", "")}-${suffix}`;
}

export function invoiceLineTotal(item: LineItem) {
  return Number(item.quantity) * Math.round(Number(item.rate) * 100);
}

export function invoiceTotal(lines: LineItem[]) {
  return lines.reduce((total, item) => total + invoiceLineTotal(item), 0);
}

export function formatInvoiceDate(value: string) {
  return value ? formatDate(value, { day: "numeric", month: "short", year: "numeric" }) : "";
}

export async function downloadInvoice(invoice: InvoiceDraft) {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "mm", format: "a4", compress: true });
  const ink = "#171717";
  const muted = "#525252";
  const line = "#e6e6e6";
  const panel = "#f3f3f3";
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

  pdf.setFillColor(ink).rect(x, 17, 10, 10, "F");
  const brandEnd = wrapped(invoice.sender, x + 14, 23.5, 94, 13, true);
  text("INVOICE", right, 26, 29, ink, true, "right");
  text(`ISSUED ${formatInvoiceDate(invoice.issued)}`, right, 32, 8, muted, false, "right");

  const partyY = Math.max(44, brandEnd + 9);
  const partyWidth = 74;
  const parties = [
    { label: "INVOICE TO", left: x + 7, name: invoice.recipient, details: invoice.recipientDetails },
    { label: "BILL FROM", left: 112, name: invoice.sender, details: invoice.senderDetails },
  ];
  const partyHeight = Math.max(40, ...parties.map(({ name, details }) =>
    20 + split(name, partyWidth, 10, true).length * 4.4 + split(details, partyWidth, 9).length * 3.96));
  pdf.setFillColor(panel).rect(x, partyY, right - x, partyHeight, "F");
  for (const { label, left, name, details } of parties) {
    text(label, left, partyY + 10, 8.5, ink, true);
    const nameEnd = wrapped(name, left, partyY + 18, partyWidth, 10, true);
    wrapped(details, left, nameEnd + 1, partyWidth, 9, false, muted);
  }

  let y = partyY + partyHeight + 11;

  function ensureRoom(height: number) {
    if (y + height <= 272) return;
    pdf.addPage();
    wrapped(`INVOICE NO. ${invoice.number}`, x, 21, right - x, 10, true, ink);
    y = 32;
  }

  function tableHeading() {
    pdf.setDrawColor(ink).setLineWidth(.35).line(x, y, right, y);
    text("NO.", x + 3, y + 6.5, 8, ink, true);
    text("ITEM DESCRIPTION", x + 16, y + 6.5, 8, ink, true);
    text("PRICE", 134, y + 6.5, 8, ink, true, "right");
    text("QTY", 151, y + 6.5, 8, ink, true, "right");
    text("TOTAL", right - 3, y + 6.5, 8, ink, true, "right");
    y += 10;
    pdf.setDrawColor(line).setLineWidth(.2).line(x, y, right, y);
  }

  const totalsHeight = 38;
  for (const [index, item] of invoice.lines.entries()) {
    const description = split(item.description, 67, 10);
    const height = Math.max(11, 3.5 + description.length * 4.4);
    const required = height + (index === invoice.lines.length - 1 ? totalsHeight : 0);
    if (index === 0) {
      ensureRoom(required + 20);
      text(`PAYMENT DUE ${formatInvoiceDate(invoice.due)}`, x, y, 8, muted, true);
      text(`INVOICE NO. ${invoice.number}`, right, y, 8, ink, true, "right");
      y += 4;
      tableHeading();
    } else if (y + required > 272) {
      ensureRoom(required + 10);
      tableHeading();
    }
    text(String(index + 1), x + 3, y + 6.7, 9, muted);
    description.forEach((value, row) => text(value, x + 16, y + 6.7 + row * 4.4));
    const rate = Math.round(Number(item.rate) * 100);
    text(money(rate), 134, y + 6.7, 9, ink, false, "right");
    text(item.quantity, 151, y + 6.7, 9, ink, false, "right");
    text(money(invoiceLineTotal(item)), right - 3, y + 6.7, 9, ink, true, "right");
    y += height;
    pdf.setDrawColor(line).line(x, y, right, y);
  }

  pdf.setDrawColor(ink).setLineWidth(.35).line(x, y, right, y);
  text("TOTAL DUE", x, y + 10, 9, ink, true);
  pdf.setFillColor(panel).rect(x, y + 14, 86, 15, "F");
  const due = money(total - paid);
  pdf.setFont("helvetica", "bold").setFontSize(21);
  const dueSize = Math.min(21, 21 * 76 / pdf.getTextWidth(due));
  text(due, x + 4, y + 24, dueSize, ink, true);
  text("Subtotal", 118, y + 10, 9, muted);
  text(money(total), right, y + 10, 9, ink, true, "right");
  text("Amount paid", 118, y + 18, 9, muted);
  text(money(paid), right, y + 18, 9, ink, true, "right");
  y += totalsHeight;

  if (invoice.notes.trim()) {
    const notes = split(invoice.notes, 174, 9);
    ensureRoom(11);
    text("PAYMENT DETAILS / NOTES", x, y, 8.5, ink, true);
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
    pdf.setDrawColor(line).setLineWidth(.2).line(x, 278, right, 278);
    text(`Invoice ${invoice.number}`, x, 284, 8, muted);
    text(`${page} / ${count}`, right, 284, 8, muted, false, "right");
  }

  pdf.setProperties({ title: `Invoice ${invoice.number}`, author: invoice.sender });
  pdf.save(`${invoice.number.replace(/[^a-z0-9_-]/gi, "_") || "invoice"}.pdf`);
}
