/**
 * On-demand invoice/receipt PDF generator for orders.
 *
 * Pure function: takes a fully-resolved order shape, returns a
 * Uint8Array of a 1-page PDF. No DB, no fs, no Stripe — those happen
 * in the caller (the route handler). Pure for testability.
 *
 * Library choice: pdf-lib (already in package.json, used elsewhere for
 * page-counting). Yes it's lower-level than @react-pdf/renderer, but
 * adding a second PDF lib for a single feature isn't worth ~600KB of
 * extra deps. The layout below is hand-positioned but isolated to this
 * one file.
 *
 * Layout: 1-page Letter (8.5 × 11 in = 612 × 792 pt). Sections from
 * top: business header, "INVOICE" title + order id block, client info,
 * line-items table, totals block, payment line, footer.
 */

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

// ─── Inputs ─────────────────────────────────────────────────────────

export interface InvoiceLine {
  /** Customer-facing test/item name. Required. */
  description: string;
  /** Catalogue SKU. Optional — rendered as small subtext under name. */
  sku?: string | null;
  /** Person the line is for. Optional. */
  assignedToName?: string | null;
  /** Per-unit price in CAD. */
  unitPriceCad: number;
  quantity: number;
}

export interface InvoiceInput {
  /** Short id displayed to humans (e.g. "AABBCCDD"). */
  orderIdShort: string;
  /** Long id for the filename / footer reference. */
  orderIdFull: string;
  orderDateIso: string;
  /** YYYY-MM-DD or ISO. Null when no appointment chosen yet. */
  appointmentDateIso: string | null;
  /** Display label for the order's current status (e.g. "Shipped"). */
  statusLabel: string;

  clientName: string;
  clientDob: string | null;
  clientEmail: string | null;
  clientPhone: string | null;

  /** Each line ends up in the table. Include test / supplement /
   *  resource / custom lines — caller assembles the order. */
  lines: InvoiceLine[];

  /** Display lines for the collection address. Null when out-of-town
   *  or unavailable. Caller is responsible for OOT formatting. */
  collectionAddressLines: string[] | null;

  /** Pre-discount, pre-tax subtotal of all lines + visit fee.
   *  Caller passes whatever lives on the order. */
  subtotalCad: number;
  /** Combined multi-test + promo discount as a positive number. 0 when
   *  none. */
  discountCad: number;
  /** Home-visit / collection fee as on orders.home_visit_fee_cad. */
  homeVisitFeeCad: number;
  /** GST as stored on orders.tax_cad. */
  taxCad: number;
  totalCad: number;

  /** "Paid via credit card" or similar. */
  paymentLabel: string;
}

// ─── Layout constants ───────────────────────────────────────────────

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 50;
const RIGHT_X = PAGE_W - MARGIN;

const COLOR_TEXT = rgb(0.08, 0.1, 0.05); // near-black
const COLOR_MUTED = rgb(0.4, 0.42, 0.38);
const COLOR_ACCENT = rgb(0.77, 0.59, 0.23); // gold #c4973a
const COLOR_RULE = rgb(0.85, 0.85, 0.83);

const SIZE_TITLE = 22;
const SIZE_H2 = 11;
const SIZE_BODY = 9.5;
const SIZE_SMALL = 8;

// ─── Helpers ────────────────────────────────────────────────────────

const CURRENCY = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
});
function fmtMoney(n: number): string {
  return CURRENCY.format(n);
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  // Render YYYY-MM-DD as "Apr 15, 2026" without leaking timezone.
  // Strip any time component; treat as local date.
  const stripped = iso.length >= 10 ? iso.slice(0, 10) : iso;
  const [y, m, d] = stripped.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString("en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// ─── Generator ──────────────────────────────────────────────────────

export async function generateInvoicePdf(
  invoice: InvoiceInput,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([PAGE_W, PAGE_H]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  /**
   * Draws plain text at (x, y) with a given size + colour.
   */
  const text = (
    s: string,
    x: number,
    y: number,
    opts: {
      size?: number;
      bold?: boolean;
      color?: ReturnType<typeof rgb>;
      maxWidth?: number;
    } = {},
  ) => {
    const f = opts.bold ? bold : font;
    const size = opts.size ?? SIZE_BODY;
    const color = opts.color ?? COLOR_TEXT;
    let str = s;
    if (opts.maxWidth) {
      // Cheap trim: drop characters until it fits with an ellipsis.
      while (str.length > 4 && f.widthOfTextAtSize(str, size) > opts.maxWidth) {
        str = str.slice(0, -1);
      }
      if (str !== s) str = str.replace(/.$/, "…");
    }
    page.drawText(str, { x, y, size, font: f, color });
  };

  /**
   * Right-align text at the given right edge.
   */
  const textRight = (
    s: string,
    rightX: number,
    y: number,
    opts: {
      size?: number;
      bold?: boolean;
      color?: ReturnType<typeof rgb>;
    } = {},
  ) => {
    const f = opts.bold ? bold : font;
    const size = opts.size ?? SIZE_BODY;
    const w = f.widthOfTextAtSize(s, size);
    text(s, rightX - w, y, opts);
  };

  /**
   * Horizontal hairline. Returns the new cursor y.
   */
  const rule = (y: number, color = COLOR_RULE) => {
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: RIGHT_X, y },
      thickness: 0.5,
      color,
    });
    return y - 8;
  };

  let y = PAGE_H - MARGIN;

  // ── Header: business identity (left) + INVOICE label (right) ──
  text("AvoVita Wellness", MARGIN, y, { size: 18, bold: true, color: COLOR_ACCENT });
  textRight("INVOICE", RIGHT_X, y, { size: SIZE_TITLE, bold: true });
  y -= 18;
  text("204 Cougartown Close SW, Calgary, AB T3H 0B2", MARGIN, y, {
    size: SIZE_SMALL,
    color: COLOR_MUTED,
  });
  y -= 11;
  text("GST Registration: 735160749RT0001", MARGIN, y, {
    size: SIZE_SMALL,
    color: COLOR_MUTED,
  });
  y -= 11;
  text("1-855-286-8482 · results@avovita.ca", MARGIN, y, {
    size: SIZE_SMALL,
    color: COLOR_MUTED,
  });
  y -= 18;
  y = rule(y);

  // ── Order identification block (left) + dates (right) ──
  const orderBlockY = y;
  text("Order Reference", MARGIN, orderBlockY, {
    size: SIZE_SMALL,
    color: COLOR_MUTED,
    bold: true,
  });
  text(`#${invoice.orderIdShort}`, MARGIN, orderBlockY - 13, {
    size: 14,
    bold: true,
  });
  text(invoice.statusLabel, MARGIN, orderBlockY - 28, {
    size: SIZE_BODY,
    color: COLOR_ACCENT,
    bold: true,
  });

  textRight("Order Date", RIGHT_X, orderBlockY, {
    size: SIZE_SMALL,
    color: COLOR_MUTED,
    bold: true,
  });
  textRight(fmtDate(invoice.orderDateIso), RIGHT_X, orderBlockY - 13);
  textRight("Appointment", RIGHT_X, orderBlockY - 30, {
    size: SIZE_SMALL,
    color: COLOR_MUTED,
    bold: true,
  });
  textRight(fmtDate(invoice.appointmentDateIso), RIGHT_X, orderBlockY - 43);

  y = orderBlockY - 58;
  y = rule(y);

  // ── Client info block ──
  text("Client Information", MARGIN, y, {
    size: SIZE_H2,
    bold: true,
    color: COLOR_ACCENT,
  });
  y -= 14;
  text(invoice.clientName, MARGIN, y, { bold: true });
  y -= 12;
  const clientLines: string[] = [];
  if (invoice.clientDob) clientLines.push(`DOB ${fmtDate(invoice.clientDob)}`);
  if (invoice.clientEmail) clientLines.push(invoice.clientEmail);
  if (invoice.clientPhone) clientLines.push(invoice.clientPhone);
  for (const line of clientLines) {
    text(line, MARGIN, y, { size: SIZE_BODY, color: COLOR_MUTED });
    y -= 11;
  }
  if (invoice.collectionAddressLines && invoice.collectionAddressLines.length > 0) {
    y -= 4;
    text("Collection Address", MARGIN, y, {
      size: SIZE_SMALL,
      bold: true,
      color: COLOR_MUTED,
    });
    y -= 11;
    for (const line of invoice.collectionAddressLines) {
      text(line, MARGIN, y, { size: SIZE_BODY });
      y -= 11;
    }
  }
  y -= 8;
  y = rule(y);

  // ── Line items table ──
  const COL_DESC_X = MARGIN;
  const COL_QTY_X = MARGIN + 320;
  const COL_PRICE_X = MARGIN + 380;
  const COL_TOTAL_X = RIGHT_X;
  const COL_DESC_W = 290;

  text("Description", COL_DESC_X, y, {
    size: SIZE_SMALL,
    bold: true,
    color: COLOR_MUTED,
  });
  textRight("Qty", COL_QTY_X + 25, y, {
    size: SIZE_SMALL,
    bold: true,
    color: COLOR_MUTED,
  });
  textRight("Unit", COL_PRICE_X + 50, y, {
    size: SIZE_SMALL,
    bold: true,
    color: COLOR_MUTED,
  });
  textRight("Line Total", COL_TOTAL_X, y, {
    size: SIZE_SMALL,
    bold: true,
    color: COLOR_MUTED,
  });
  y -= 6;
  y = rule(y);

  for (const line of invoice.lines) {
    const lineTotal = line.unitPriceCad * line.quantity;
    text(line.description, COL_DESC_X, y, { bold: true, maxWidth: COL_DESC_W });
    textRight(String(line.quantity), COL_QTY_X + 25, y);
    textRight(fmtMoney(line.unitPriceCad), COL_PRICE_X + 50, y);
    textRight(fmtMoney(lineTotal), COL_TOTAL_X, y);
    y -= 11;
    const subBits: string[] = [];
    if (line.sku) subBits.push(`SKU ${line.sku}`);
    if (line.assignedToName) subBits.push(`for ${line.assignedToName}`);
    if (subBits.length > 0) {
      text(subBits.join(" · "), COL_DESC_X, y, {
        size: SIZE_SMALL,
        color: COLOR_MUTED,
        maxWidth: COL_DESC_W,
      });
      y -= 10;
    }
    y -= 4;
    // Safety: if we ever overflow on a giant cart, stop with an
    // indicator rather than running off the page.
    if (y < 180) {
      text("(additional lines truncated)", COL_DESC_X, y, {
        size: SIZE_SMALL,
        color: COLOR_MUTED,
      });
      y -= 11;
      break;
    }
  }
  y = rule(y);

  // ── Totals block (right-aligned) ──
  const totalsLeftX = MARGIN + 340;
  const rowH = 14;
  let totalsY = y - 6;
  const totalRow = (label: string, value: string, opts: { bold?: boolean } = {}) => {
    text(label, totalsLeftX, totalsY, { size: SIZE_BODY, bold: opts.bold, color: opts.bold ? COLOR_TEXT : COLOR_MUTED });
    textRight(value, COL_TOTAL_X, totalsY, { size: SIZE_BODY, bold: opts.bold });
    totalsY -= rowH;
  };
  totalRow("Subtotal", fmtMoney(invoice.subtotalCad));
  if (invoice.discountCad > 0) {
    totalRow("Discount", `-${fmtMoney(invoice.discountCad)}`);
  }
  if (invoice.homeVisitFeeCad > 0) {
    totalRow("Home visit fee", fmtMoney(invoice.homeVisitFeeCad));
  }
  if (invoice.taxCad > 0) {
    totalRow("GST 5%", fmtMoney(invoice.taxCad));
  }
  totalsY -= 4;
  page.drawLine({
    start: { x: totalsLeftX, y: totalsY + 6 },
    end: { x: RIGHT_X, y: totalsY + 6 },
    thickness: 0.75,
    color: COLOR_RULE,
  });
  totalRow("Total Paid", fmtMoney(invoice.totalCad), { bold: true });
  totalRow("Balance Owing", fmtMoney(0));

  // ── Payment + footer ──
  y = totalsY - 16;
  text(`Payment: ${invoice.paymentLabel}`, MARGIN, y, { size: SIZE_BODY });
  y -= 30;
  y = rule(y);
  text("Thank you for choosing AvoVita Wellness.", MARGIN, y, {
    size: SIZE_BODY,
    bold: true,
  });
  y -= 12;
  text(
    "For questions about this invoice, contact results@avovita.ca or 1-855-286-8482.",
    MARGIN,
    y,
    { size: SIZE_SMALL, color: COLOR_MUTED },
  );
  y -= 11;
  text(`Order reference: ${invoice.orderIdFull}`, MARGIN, y, {
    size: SIZE_SMALL,
    color: COLOR_MUTED,
  });

  return pdf.save();
}
