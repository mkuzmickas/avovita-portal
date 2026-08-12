import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ShippingProfile,
  OverlayTextPoint,
} from "@/lib/config/shipping-profiles";

const SIGNATURE_STORAGE_PATH = "signatures/mike-signature.png";
const STORAGE_BUCKET = "shipping-documents";

/**
 * Build the printable commercial invoice for a shipment.
 *
 * Loads the profile's CI template PDF from Supabase Storage and stamps
 * the tracking number, date, and shipper signature onto it at the
 * coordinates configured per-profile. FedEx's ETD flag still transmits
 * the invoice electronically to customs — this generates the physical
 * copies that go in the FedEx pouch.
 *
 * If the signature image is missing from Supabase Storage, the CI is
 * still generated (signature just skipped) — signature is optional but
 * expected for Armin and EpiSeek.
 */
export async function generateCommercialInvoice(params: {
  supabase: SupabaseClient;
  profile: ShippingProfile;
  trackingNumber: string;
  shipDate: Date;
}): Promise<Uint8Array> {
  const { supabase, profile, trackingNumber, shipDate } = params;
  const overlay = profile.commercialInvoice;

  // Load template PDF
  const { data: templateFile, error: templateErr } = await supabase.storage
    .from(STORAGE_BUCKET)
    .download(overlay.templatePath);
  if (templateErr || !templateFile) {
    throw new Error(
      `CI template not found at ${overlay.templatePath}: ${templateErr?.message ?? "no data"}. Upload the template PDF to the shipping-documents bucket.`,
    );
  }
  const templateBytes = new Uint8Array(await templateFile.arrayBuffer());

  const pdf = await PDFDocument.load(templateBytes);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const black = rgb(0, 0, 0);

  // Stamp tracking number wherever the profile says
  for (const spot of overlay.trackingNumberOverlays) {
    const page = pdf.getPage(spot.pageIndex);
    page.drawText(trackingNumber, {
      x: spot.x,
      y: spot.y,
      size: spot.fontSize ?? 10,
      font: bold,
      color: black,
    });
  }

  // Stamp date wherever the profile says
  for (const spot of overlay.dateOverlays) {
    const page = pdf.getPage(spot.pageIndex);
    page.drawText(formatDate(shipDate, spot.format), {
      x: spot.x,
      y: spot.y,
      size: spot.fontSize ?? 10,
      font,
      color: black,
    });
  }

  // Stamp signature if the profile wants one and the file exists
  if (overlay.signatureOverlay) {
    const sig = await loadSignatureImage(supabase);
    if (sig) {
      const image = sig.isPng
        ? await pdf.embedPng(sig.bytes)
        : await pdf.embedJpg(sig.bytes);
      const page = pdf.getPage(overlay.signatureOverlay.pageIndex);
      page.drawImage(image, {
        x: overlay.signatureOverlay.x,
        y: overlay.signatureOverlay.y,
        width: overlay.signatureOverlay.width,
        height: overlay.signatureOverlay.height,
      });
    }
  }

  return await pdf.save();
}

async function loadSignatureImage(
  supabase: SupabaseClient,
): Promise<{ bytes: Uint8Array; isPng: boolean } | null> {
  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .download(SIGNATURE_STORAGE_PATH);
  if (error || !data) {
    console.warn(
      `[commercial-invoice] Signature not found at ${SIGNATURE_STORAGE_PATH} — CI will be generated without signature. Upload a transparent PNG to sign automatically.`,
    );
    return null;
  }
  const bytes = new Uint8Array(await data.arrayBuffer());
  // PNG magic bytes: 89 50 4E 47
  const isPng =
    bytes.length > 4 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47;
  return { bytes, isPng };
}

function formatDate(date: Date, format: OverlayTextPoint["format"]): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  if (format === "us") return `${m}/${d}/${y}`;
  if (format === "long") {
    const months = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ];
    return `${date.getUTCDate()} ${months[date.getUTCMonth()]} ${y}`;
  }
  return `${y}-${m}-${d}`; // iso (default)
}
