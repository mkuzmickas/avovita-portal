import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getShippingProfile } from "@/lib/config/shipping-profiles";
import { createShipment } from "@/lib/fedex/ship";
import { generateCommercialInvoice } from "@/lib/fedex/generate-commercial-invoice";
import { resend } from "@/lib/resend";

export const runtime = "nodejs";
export const maxDuration = 60; // FedEx Ship + ETD can take 20-40s.

/**
 * POST /api/shipping/create-label
 *
 * Called by the /shipping page when FloLabs clicks a shipping preset
 * button. Validates the shared token, resolves the profile, uploads
 * any recipient customs docs via ETD, calls the FedEx Ship API,
 * persists the label PDF to Supabase Storage, records the shipment
 * to public.manual_shipments, and emails Mike so he has a
 * real-time audit trail.
 *
 * Token is compared against SHIPPING_ACCESS_TOKEN env var.
 * Rate-limited to 20 labels per rolling day to cap damage if the
 * token ever leaks — 20 is well above real volume, low enough that
 * a leak wouldn't burn a fortune before Mike sees the notification
 * email flood in his inbox.
 */

const TOKEN_HEADER = "x-shipping-token";
const DAILY_LABEL_CAP = 20;
const DAILY_WINDOW_MS = 24 * 60 * 60 * 1000;

// In-memory sliding window — resets on serverless cold start, which
// is fine for the "stop a leaked token before Mike wakes up" use
// case. If someone burns 20 labels and the function stays warm they
// hit the cap; if it goes cold and comes back, the count resets.
// Trade-off accepted for simplicity — swap to Redis if abuse
// happens.
let labelTimestamps: number[] = [];

function checkRateLimit(): { ok: boolean; retryAfterSec: number } {
  const now = Date.now();
  const cutoff = now - DAILY_WINDOW_MS;
  labelTimestamps = labelTimestamps.filter((t) => t > cutoff);
  if (labelTimestamps.length >= DAILY_LABEL_CAP) {
    const oldest = labelTimestamps[0];
    const retryAfterSec = Math.max(
      1,
      Math.ceil((oldest + DAILY_WINDOW_MS - now) / 1000),
    );
    return { ok: false, retryAfterSec };
  }
  labelTimestamps.push(now);
  return { ok: true, retryAfterSec: 0 };
}

export async function POST(request: NextRequest) {
  // ─── Auth ─────────────────────────────────────────────────────
  const expectedToken = process.env.SHIPPING_ACCESS_TOKEN;
  if (!expectedToken) {
    console.error(
      "[shipping/create-label] SHIPPING_ACCESS_TOKEN env var not set",
    );
    return NextResponse.json(
      { error: "Server is not configured for shipping." },
      { status: 503 },
    );
  }
  const providedToken =
    request.headers.get(TOKEN_HEADER) ??
    new URL(request.url).searchParams.get("token");
  if (providedToken !== expectedToken) {
    return NextResponse.json({ error: "Not authorised." }, { status: 401 });
  }

  // ─── Rate limit ───────────────────────────────────────────────
  const rl = checkRateLimit();
  if (!rl.ok) {
    return NextResponse.json(
      {
        error: `Daily label limit reached (${DAILY_LABEL_CAP}/day). Try again later.`,
      },
      {
        status: 429,
        headers: { "Retry-After": String(rl.retryAfterSec) },
      },
    );
  }

  // ─── Parse body ───────────────────────────────────────────────
  let body: {
    kind?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const profile = getShippingProfile(body.kind ?? "");
  if (!profile) {
    return NextResponse.json(
      { error: `Unknown shipping profile: ${body.kind}` },
      { status: 400 },
    );
  }

  const supabase = createServiceRoleClient();

  // ─── Resolve recipient customs paperwork URLs ─────────────────
  // FedEx auto-generates the commercial invoice (transmitted
  // electronically). Extra paperwork (CDC permits, proforma,
  // declaration) is not attached to the shipment — we return
  // download URLs so the shipper can print copies to include in
  // the FedEx pouch alongside the label.
  const customsDocUrls: Array<{ fileName: string; url: string }> = [];
  for (const path of profile.etdDocumentPaths) {
    const { data } = supabase.storage
      .from("shipping-documents")
      .getPublicUrl(path);
    if (data?.publicUrl) {
      customsDocUrls.push({
        fileName: path.split("/").pop() ?? path,
        url: data.publicUrl,
      });
    }
  }

  // ─── Call FedEx Ship API ──────────────────────────────────────
  let ship;
  try {
    ship = await createShipment({
      profile,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[shipping/create-label] FedEx Ship API failed:", message);
    return NextResponse.json(
      { error: `FedEx shipment failed: ${message}` },
      { status: 502 },
    );
  }

  // ─── Persist label PDF to Supabase Storage ────────────────────
  // FedEx serves label PDFs from a URL that expires; store our own
  // copy so the manual_shipments record always has a working link.
  const labelPath = `labels/${new Date().toISOString().slice(0, 10)}/${ship.trackingNumber}.pdf`;
  let labelStorageUrl: string | null = null;
  try {
    const labelBytes = Uint8Array.from(atob(ship.labelPdfBase64), (c) =>
      c.charCodeAt(0),
    );
    const { error: uploadErr } = await supabase.storage
      .from("shipping-documents")
      .upload(labelPath, labelBytes, {
        contentType: "application/pdf",
        upsert: false,
      });
    if (uploadErr) {
      console.warn(
        `[shipping/create-label] Failed to persist label PDF for ${ship.trackingNumber}: ${uploadErr.message}`,
      );
    } else {
      // Public bucket — signed URL not needed. If the bucket becomes
      // private later, swap to createSignedUrl.
      const { data } = supabase.storage
        .from("shipping-documents")
        .getPublicUrl(labelPath);
      labelStorageUrl = data.publicUrl;
    }
  } catch (err) {
    console.warn(
      `[shipping/create-label] Label PDF storage error for ${ship.trackingNumber}:`,
      err,
    );
  }

  // Generate our own commercial invoice from the profile + shipment
  // data. FedEx's ETD flag still transmits the invoice electronically
  // to customs via the Ship API, but their response omits the printable
  // PDF (empty shipmentDocuments on sandbox despite the label showing
  // 'ICE ETD'). Generating server-side guarantees the shipper always
  // has a printable copy that matches what customs was told.
  const additionalDocUrls: Record<string, string> = {};
  const fedexGeneratedDocs: Array<{
    contentType: string;
    fileName: string;
    url: string;
    copiesToPrint: number;
  }> = [];

  try {
    const ciBytes = await generateCommercialInvoice({
      supabase,
      profile,
      trackingNumber: ship.trackingNumber,
      shipDate: new Date(),
    });
    const ciFileName = `${ship.trackingNumber}-COMMERCIAL_INVOICE.pdf`;
    const ciPath = `docs/${new Date().toISOString().slice(0, 10)}/${ciFileName}`;
    const { error: ciUploadErr } = await supabase.storage
      .from("shipping-documents")
      .upload(ciPath, ciBytes, {
        contentType: "application/pdf",
        upsert: false,
      });
    if (!ciUploadErr) {
      const { data } = supabase.storage
        .from("shipping-documents")
        .getPublicUrl(ciPath);
      additionalDocUrls["COMMERCIAL_INVOICE"] = data.publicUrl;
      fedexGeneratedDocs.push({
        contentType: "COMMERCIAL_INVOICE",
        fileName: ciFileName,
        url: data.publicUrl,
        copiesToPrint: 3,
      });
    } else {
      console.warn(
        `[shipping/create-label] Failed to persist commercial invoice for ${ship.trackingNumber}: ${ciUploadErr.message}`,
      );
    }
  } catch (err) {
    console.error(
      `[shipping/create-label] Failed to generate commercial invoice for ${ship.trackingNumber}:`,
      err,
    );
  }

  // ─── Record to manual_shipments ───────────────────────────────
  const environment = process.env.FEDEX_API_URL?.includes("sandbox")
    ? "sandbox"
    : "production";

  const { data: shipmentRow, error: insertErr } = await supabase
    .from("manual_shipments")
    .insert({
      profile_kind: profile.kind,
      tracking_number: ship.trackingNumber,
      service_type: profile.serviceType,
      label_url: labelStorageUrl,
      documents_urls: additionalDocUrls,
      weight_lb: profile.package.weightLb,
      // Column named declared_value_cad for historical reasons; the
      // actual currency is per-profile (Mayo USD, Armin EUR, EpiSeek
      // USD). Record as-is; convert in the reporting view if needed.
      declared_value_cad: profile.package.declaredValue,
      notes: null,
      environment,
      shipped_by_name: null,
    })
    .select("id")
    .single();

  if (insertErr) {
    console.error(
      "[shipping/create-label] Failed to insert manual_shipments row:",
      insertErr.message,
    );
    // Non-fatal — FedEx already accepted the shipment. Return
    // success with a warning so FloLabs can print the label.
  }

  // ─── Notify Mike ──────────────────────────────────────────────
  // Fire-and-forget: we don't fail the request if the email doesn't
  // send. Mike has the tracking number in the response, plus the
  // shipment is in manual_shipments regardless.
  try {
    await resend.emails.send({
      from: "AvoVita Shipping <noreply@notify.avovita.ca>",
      to: "mike@avovita.ca",
      subject: `[Shipped] ${profile.displayLabel} · ${ship.trackingNumber}`,
      html: `
        <p><strong>${profile.displayLabel}</strong> just went out via /shipping.</p>
        <p>
          Tracking: <strong>${ship.trackingNumber}</strong><br>
          Service: ${profile.serviceType}<br>
          Environment: ${environment}<br>
          Weight: ${profile.package.weightLb} lb${profile.package.dryIceWeightKg > 0 ? ` (${profile.package.dryIceWeightKg} kg dry ice)` : ""}
        </p>
        <p>
          ${labelStorageUrl ? `<a href="${labelStorageUrl}">Label PDF</a>` : "Label PDF: (not stored — check server logs)"}
        </p>
        <p><strong>Pouch contents to print + assemble:</strong></p>
        <ul>
          <li>FedEx label — <strong>print 3 copies</strong> (1 affixed to box, 2 in pouch)</li>
          ${fedexGeneratedDocs
            .map(
              (d) =>
                `<li><a href="${d.url}">${d.contentType}</a> — <strong>print ${d.copiesToPrint} copies</strong> (in pouch)</li>`,
            )
            .join("")}
          ${customsDocUrls
            .map(
              (d) =>
                `<li><a href="${d.url}">${d.fileName}</a> — <strong>print 1 copy</strong> (in pouch)</li>`,
            )
            .join("")}
        </ul>
        <p style="color:#888;font-size:12px;">Shipment id: ${shipmentRow?.id ?? "(insert failed — see logs)"}</p>
      `,
    });
  } catch (err) {
    console.warn("[shipping/create-label] Notification email failed:", err);
  }

  return NextResponse.json({
    ok: true,
    tracking_number: ship.trackingNumber,
    label_url: labelStorageUrl,
    label_copies_to_print: 3,
    additional_docs: additionalDocUrls,
    fedex_generated_docs: fedexGeneratedDocs,
    customs_docs: customsDocUrls,
    environment,
    shipment_id: shipmentRow?.id ?? null,
  });
}
