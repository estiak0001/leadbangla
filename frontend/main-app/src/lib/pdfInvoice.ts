import { authHeaders } from "./billing";
import { loadJsPDF } from "./jspdf";

export interface InvoiceDetail {
  invoice_number: string;
  status: "due" | "paid" | "void";
  amount_bdt: number;
  plan_name: string;
  period_start: string;
  period_end: string;
  issued_at: string | null;
  due_at: string | null;
  paid_at: string | null;
  payment_method: string | null;
  company_name: string;
  company_address: string | null;
  company_support_email: string | null;
  bill_to_name: string;
  bill_to_lines: string[];
}

async function fetchInvoiceDetail(id: string): Promise<InvoiceDetail> {
  const res = await fetch(`/api/v1/billing/invoices/${id}/data`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Could not load this invoice");
  return res.json();
}

const hex = (h: string): [number, number, number] => {
  const n = parseInt(h.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const BRAND = hex("#4f46e5"), INK = hex("#111827"), MUTED = hex("#6b7280"), LINE = hex("#e5e7eb");
const STATUS: Record<string, { label: string; bg: [number, number, number]; fg: [number, number, number] }> = {
  paid: { label: "Paid", bg: hex("#d1fae5"), fg: hex("#065f46") },
  due: { label: "Due", bg: hex("#fef3c7"), fg: hex("#92400e") },
  void: { label: "Void", bg: hex("#e5e7eb"), fg: hex("#374151") },
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

async function loadLogo(): Promise<{ dataUrl: string; ratio: number } | null> {
  try {
    const res = await fetch("/api/v1/public/company-logo");
    if (!res.ok) return null;
    const blob = await res.blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    const { width, height } = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = reject;
      img.src = dataUrl;
    });
    return { dataUrl, ratio: width / height };
  } catch {
    return null;
  }
}

/** Draws the invoice directly with jsPDF's own text/line/rect primitives -- not an
 * HTML-to-canvas screenshot -- so there's no CSS-rendering fidelity to get wrong. */
export async function renderInvoicePdf(id: string): Promise<Blob> {
  const [detail, jsPDF, logo] = await Promise.all([fetchInvoiceDetail(id), loadJsPDF(), loadLogo()]);
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const PAGE_W = 595.28;
  const M = 48;
  const RIGHT = PAGE_W - M;
  let y = M;

  // Header: logo left, invoice meta right
  if (logo) {
    const h = 22;
    doc.addImage(logo.dataUrl, "PNG", M, y, h * logo.ratio, h);
  }
  doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(...BRAND);
  doc.text("INVOICE", RIGHT, y + 8, { align: "right" });
  doc.setFontSize(17); doc.setTextColor(...INK);
  doc.text(detail.invoice_number, RIGHT, y + 26, { align: "right" });
  const st = STATUS[detail.status] ?? STATUS.void;
  const pillW = doc.getTextWidth(st.label) + 20;
  doc.setFillColor(...st.bg);
  doc.roundedRect(RIGHT - pillW, y + 33, pillW, 16, 8, 8, "F");
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(...st.fg);
  doc.text(st.label, RIGHT - pillW / 2, y + 44, { align: "center" });

  y += 58;
  doc.setDrawColor(...BRAND); doc.setLineWidth(2);
  doc.line(M, y, RIGHT, y);
  y += 28;

  // From / Billed to
  const blockTop = y;
  doc.setFont("helvetica", "bold"); doc.setFontSize(10.5); doc.setTextColor(...INK);
  doc.text("From", M, y);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.setTextColor(...MUTED);
  const fromLines = [detail.company_name, detail.company_address, detail.company_support_email].filter((x): x is string => !!x);
  let fy = y + 14;
  for (const line of fromLines) { doc.text(line, M, fy); fy += 13; }

  doc.setFont("helvetica", "bold"); doc.setFontSize(10.5); doc.setTextColor(...INK);
  doc.text("Billed to", RIGHT, blockTop, { align: "right" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.setTextColor(...MUTED);
  const toLines = [detail.bill_to_name, ...detail.bill_to_lines];
  let ty = blockTop + 14;
  for (const line of toLines) { doc.text(line, RIGHT, ty, { align: "right" }); ty += 13; }

  y = Math.max(fy, ty) + 18;

  // Line item table
  doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.setTextColor(...MUTED);
  doc.text("DESCRIPTION", M, y);
  doc.text("AMOUNT", RIGHT, y, { align: "right" });
  y += 8;
  doc.setDrawColor(...LINE); doc.setLineWidth(1.2);
  doc.line(M, y, RIGHT, y);
  y += 20;

  doc.setFont("helvetica", "normal"); doc.setFontSize(11); doc.setTextColor(...INK);
  doc.text(`${detail.plan_name} plan`, M, y);
  doc.text(`${detail.amount_bdt.toLocaleString()} BDT`, RIGHT, y, { align: "right" });
  y += 13;
  doc.setFontSize(9); doc.setTextColor(...MUTED);
  doc.text(`${fmtDate(detail.period_start)} – ${fmtDate(detail.period_end)}`, M, y);
  y += 14;
  doc.setDrawColor(...LINE); doc.setLineWidth(0.75);
  doc.line(M, y, RIGHT, y);
  y += 26;

  // Totals (right-aligned narrow block)
  const totalsLeft = RIGHT - 180;
  doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(...INK);
  doc.text("Subtotal", totalsLeft, y);
  doc.text(`${detail.amount_bdt.toLocaleString()} BDT`, RIGHT, y, { align: "right" });
  y += 18;
  doc.setDrawColor(...INK); doc.setLineWidth(1.3);
  doc.line(totalsLeft, y - 10, RIGHT, y - 10);
  doc.setFont("helvetica", "bold"); doc.setFontSize(13);
  doc.text("Total", totalsLeft, y + 4);
  doc.text(`${detail.amount_bdt.toLocaleString()} BDT`, RIGHT, y + 4, { align: "right" });
  y += 36;

  // Meta row
  doc.setDrawColor(...LINE); doc.setLineWidth(0.75);
  doc.line(M, y, RIGHT, y);
  y += 18;
  const colW = (RIGHT - M) / 3;
  const periodLabel = detail.status === "paid" ? "Paid on" : "Due on";
  const periodValue = detail.status === "paid" ? fmtDate(detail.paid_at) : fmtDate(detail.due_at);
  const metaCols: [string, string][] = [
    ["Issued", fmtDate(detail.issued_at)],
    [periodLabel, periodValue],
    ["Payment method", (detail.payment_method ?? "—").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())],
  ];
  metaCols.forEach(([label, value], i) => {
    const x = M + i * colW;
    doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(...MUTED);
    doc.text(label.toUpperCase(), x, y);
    doc.setFont("helvetica", "normal"); doc.setFontSize(10.5); doc.setTextColor(...INK);
    doc.text(value, x, y + 15);
  });
  y += 46;

  // Footer
  doc.setDrawColor(...LINE); doc.setLineWidth(0.75);
  doc.line(M, y, RIGHT, y);
  y += 20;
  doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(...MUTED);
  doc.text(`Questions about this invoice? Contact ${detail.company_support_email ?? "support"}.`, PAGE_W / 2, y, { align: "center" });

  return doc.output("blob");
}
