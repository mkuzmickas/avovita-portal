import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { SHIPPER, type ShippingProfile } from "@/lib/config/shipping-profiles";

/**
 * Server-side commercial invoice generator.
 *
 * FedEx's auto-CI feature transmits an invoice electronically to
 * customs via ETD (that part still works), but their Ship API
 * response often omits the printable PDF — especially on sandbox
 * and even sporadically in production. Rather than depend on it,
 * we generate our own CI from the same data used for the shipment
 * request. Guarantees the printed pouch contents always match what
 * customs was told electronically.
 *
 * Single letter-size page, one shipment per invoice. Line items are
 * limited to what fits in the commodity table below the header —
 * for these three shipping profiles it's always a single commodity
 * so the fixed layout is fine.
 */
export async function generateCommercialInvoice(params: {
  profile: ShippingProfile;
  trackingNumber: string;
  shipDate: Date;
}): Promise<Uint8Array> {
  const { profile, trackingNumber, shipDate } = params;

  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]); // US letter
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const black = rgb(0, 0, 0);
  const grey = rgb(0.5, 0.5, 0.5);

  const dateStr = shipDate.toISOString().slice(0, 10);

  // ─── Header ─────────────────────────────────────────────
  page.drawText("COMMERCIAL INVOICE", {
    x: 40,
    y: 750,
    size: 20,
    font: bold,
    color: black,
  });
  page.drawText("For customs purposes only", {
    x: 40,
    y: 733,
    size: 10,
    font,
    color: grey,
  });

  // Right-aligned metadata block
  const metaRight = 572;
  const metaLines: Array<[string, string]> = [
    ["Waybill / Tracking #", trackingNumber],
    ["Invoice date", dateStr],
    ["Ship date", dateStr],
    ["Currency", profile.currency],
    ["Terms of sale", profile.incoterm],
    ["Reason for export", profile.shipmentPurpose.replace(/_/g, " ")],
    ["Duties paid by", profile.dutiesPaidBy],
  ];
  let metaY = 748;
  for (const [label, value] of metaLines) {
    page.drawText(label + ":", {
      x: metaRight - 220,
      y: metaY,
      size: 9,
      font,
      color: grey,
    });
    page.drawText(value, {
      x: metaRight - widthOf(value, bold, 10),
      y: metaY,
      size: 10,
      font: bold,
      color: black,
    });
    metaY -= 13;
  }

  // ─── Shipper / Consignee ────────────────────────────────
  const boxTopY = 640;
  drawAddressBox({
    page,
    x: 40,
    y: boxTopY,
    width: 250,
    title: "Shipper / Exporter",
    lines: [
      SHIPPER.contactName,
      SHIPPER.company,
      SHIPPER.address.line1,
      ...(SHIPPER.address.line2 ? [SHIPPER.address.line2] : []),
      `${SHIPPER.address.city}, ${SHIPPER.address.stateOrProvince} ${SHIPPER.address.postalCode}`,
      SHIPPER.address.country,
      `Phone: ${SHIPPER.phone}`,
    ],
    font,
    bold,
  });

  drawAddressBox({
    page,
    x: 322,
    y: boxTopY,
    width: 250,
    title: "Consignee / Importer",
    lines: [
      profile.consigneeForInvoice.name,
      profile.consigneeForInvoice.company,
      ...profile.consigneeForInvoice.address.split("\n"),
      `Phone: ${profile.consigneeForInvoice.phone}`,
    ],
    font,
    bold,
  });

  // ─── Commodities table ──────────────────────────────────
  const tableY = 460;
  const cols = [
    { label: "Description", x: 40, w: 250 },
    { label: "HTS Code", x: 295, w: 85 },
    { label: "Origin", x: 385, w: 45 },
    { label: "Qty", x: 435, w: 35 },
    { label: "Unit price", x: 475, w: 55 },
    { label: "Total", x: 535, w: 40 },
  ];

  // Header row
  page.drawRectangle({
    x: 40,
    y: tableY - 4,
    width: 535,
    height: 18,
    color: rgb(0.9, 0.9, 0.9),
  });
  for (const col of cols) {
    page.drawText(col.label, {
      x: col.x + 2,
      y: tableY,
      size: 9,
      font: bold,
      color: black,
    });
  }

  // Single commodity row (all three profiles ship a single line item)
  const c = profile.commodity;
  const unitPrice = c.customsValue / c.quantity;
  const rowY = tableY - 22;
  drawWrappedText({
    page,
    text: c.description,
    x: cols[0].x + 2,
    y: rowY,
    maxWidth: cols[0].w - 4,
    lineHeight: 11,
    font,
    size: 9,
    color: black,
  });
  page.drawText(c.harmonizedCode, {
    x: cols[1].x + 2,
    y: rowY,
    size: 9,
    font,
    color: black,
  });
  page.drawText(c.countryOfManufacture, {
    x: cols[2].x + 2,
    y: rowY,
    size: 9,
    font,
    color: black,
  });
  page.drawText(`${c.quantity} ${c.quantityUnit}`, {
    x: cols[3].x + 2,
    y: rowY,
    size: 9,
    font,
    color: black,
  });
  page.drawText(fmt(unitPrice, profile.currency), {
    x: cols[4].x + 2,
    y: rowY,
    size: 9,
    font,
    color: black,
  });
  page.drawText(fmt(c.customsValue, profile.currency), {
    x: cols[5].x + 2,
    y: rowY,
    size: 9,
    font,
    color: black,
  });

  // Totals
  const totalsY = rowY - 40;
  page.drawLine({
    start: { x: 40, y: totalsY + 18 },
    end: { x: 575, y: totalsY + 18 },
    thickness: 0.5,
    color: black,
  });
  page.drawText("Total invoice value:", {
    x: 400,
    y: totalsY,
    size: 10,
    font: bold,
    color: black,
  });
  page.drawText(fmt(c.customsValue, profile.currency), {
    x: 535,
    y: totalsY,
    size: 10,
    font: bold,
    color: black,
  });
  page.drawText(`Net weight: ${c.netWeightLb} lb`, {
    x: 40,
    y: totalsY,
    size: 9,
    font,
    color: black,
  });

  // ─── Declaration + signature ────────────────────────────
  const declY = 220;
  drawWrappedText({
    page,
    text:
      profile.shipmentPurpose === "NOT_SOLD"
        ? "The items covered by this invoice are not sold. Values are stated for customs purposes only. I hereby certify that the information on this invoice is true and correct and that the contents of this shipment are as stated above."
        : "I hereby certify that the information on this invoice is true and correct and that the contents of this shipment are as stated above.",
    x: 40,
    y: declY,
    maxWidth: 535,
    lineHeight: 12,
    font,
    size: 9,
    color: black,
  });

  page.drawLine({
    start: { x: 40, y: 140 },
    end: { x: 290, y: 140 },
    thickness: 0.5,
    color: black,
  });
  page.drawText("Signature of shipper", {
    x: 40,
    y: 128,
    size: 8,
    font,
    color: grey,
  });
  page.drawText(SHIPPER.contactName, {
    x: 40,
    y: 148,
    size: 10,
    font: bold,
    color: black,
  });

  page.drawLine({
    start: { x: 322, y: 140 },
    end: { x: 572, y: 140 },
    thickness: 0.5,
    color: black,
  });
  page.drawText("Date", {
    x: 322,
    y: 128,
    size: 8,
    font,
    color: grey,
  });
  page.drawText(dateStr, {
    x: 322,
    y: 148,
    size: 10,
    font: bold,
    color: black,
  });

  // Footer
  page.drawText(
    `AvoVita Wellness · ${SHIPPER.email} · ${SHIPPER.phone}`,
    {
      x: 40,
      y: 40,
      size: 8,
      font,
      color: grey,
    },
  );
  page.drawText("Page 1 of 1 · Print 3 copies for the FedEx pouch", {
    x: 320,
    y: 40,
    size: 8,
    font,
    color: grey,
  });

  return await pdf.save();
}

// ─── Helpers ──────────────────────────────────────────────
function fmt(value: number, currency: string): string {
  return `${currency} ${value.toFixed(2)}`;
}

function widthOf(
  text: string,
  font: import("pdf-lib").PDFFont,
  size: number,
): number {
  return font.widthOfTextAtSize(text, size);
}

function drawAddressBox(params: {
  page: import("pdf-lib").PDFPage;
  x: number;
  y: number;
  width: number;
  title: string;
  lines: string[];
  font: import("pdf-lib").PDFFont;
  bold: import("pdf-lib").PDFFont;
}) {
  const { page, x, y, width, title, lines, font, bold } = params;
  const black = rgb(0, 0, 0);
  const grey = rgb(0.5, 0.5, 0.5);

  page.drawText(title.toUpperCase(), {
    x,
    y,
    size: 9,
    font: bold,
    color: grey,
  });
  page.drawLine({
    start: { x, y: y - 4 },
    end: { x: x + width, y: y - 4 },
    thickness: 0.5,
    color: grey,
  });
  let ly = y - 18;
  for (const line of lines) {
    page.drawText(line, {
      x,
      y: ly,
      size: 10,
      font,
      color: black,
    });
    ly -= 13;
  }
}

function drawWrappedText(params: {
  page: import("pdf-lib").PDFPage;
  text: string;
  x: number;
  y: number;
  maxWidth: number;
  lineHeight: number;
  font: import("pdf-lib").PDFFont;
  size: number;
  color: ReturnType<typeof rgb>;
}) {
  const { page, text, x, y, maxWidth, lineHeight, font, size, color } = params;
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  lines.forEach((line, i) => {
    page.drawText(line, { x, y: y - i * lineHeight, size, font, color });
  });
}
