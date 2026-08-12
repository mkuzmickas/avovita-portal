import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getShippingProfile } from "@/lib/config/shipping-profiles";
import { createShipment, uploadEtdDocument } from "@/lib/fedex/ship";
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
    notes?: string;
    shipped_by_name?: string;
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

  // ─── Upload ETD docs to FedEx ─────────────────────────────────
  // Every recipient-specific PDF lives in Supabase Storage bucket
  // `shipping-documents`. Fetch bytes → upload to FedEx → collect
  // the returned docIds to reference in the Ship API call.
  let etdDocIds: string[] = [];
  try {
    for (const path of profile.etdDocumentPaths) {
      const { data: file, error } = await supabase.storage
        .from("shipping-documents")
        .download(path);
      if (error || !file) {
        throw new Error(
          `Failed to load ${path} from Supabase Storage: ${error?.message ?? "not found"}. Upload it to the shipping-documents bucket.`,
        );
      }
      const buffer = new Uint8Array(await file.arrayBuffer());
      const docId = await uploadEtdDocument(buffer, path, "OTHER");
      etdDocIds.push(docId);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `ETD document upload failed: ${message}` },
      { status: 500 },
    );
  }

  // ─── Call FedEx Ship API ──────────────────────────────────────
  let ship;
  try {
    ship = await createShipment({
      profile,
      etdDocumentIds: etdDocIds,
      reference: body.notes?.slice(0, 40),
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

  // Additional docs (auto-generated commercial invoice, etc.) —
  // persist same way. Keys them by docType so callers know which is
  // which.
  const additionalDocUrls: Record<string, string> = {};
  for (let i = 0; i < ship.additionalDocs.length; i += 1) {
    const doc = ship.additionalDocs[i];
    const path = `docs/${new Date().toISOString().slice(0, 10)}/${ship.trackingNumber}-${doc.docType}.pdf`;
    try {
      const bytes = Uint8Array.from(atob(doc.pdfBase64), (c) => c.charCodeAt(0));
      const { error: uploadErr } = await supabase.storage
        .from("shipping-documents")
        .upload(path, bytes, {
          contentType: "application/pdf",
          upsert: false,
        });
      if (!uploadErr) {
        const { data } = supabase.storage
          .from("shipping-documents")
          .getPublicUrl(path);
        additionalDocUrls[doc.docType] = data.publicUrl;
      }
    } catch {
      /* non-fatal */
    }
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
      notes: body.notes ?? null,
      environment,
      shipped_by_name: body.shipped_by_name ?? null,
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
          Weight: ${profile.package.weightLb} lb${profile.package.dryIceWeightKg > 0 ? ` (${profile.package.dryIceWeightKg} kg dry ice)` : ""}<br>
          Shipped by: ${body.shipped_by_name ?? "(not provided)"}<br>
          ${body.notes ? `Notes: ${body.notes}<br>` : ""}
        </p>
        <p>
          ${labelStorageUrl ? `<a href="${labelStorageUrl}">Label PDF</a>` : "Label PDF: (not stored — check server logs)"}
        </p>
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
    additional_docs: additionalDocUrls,
    environment,
    shipment_id: shipmentRow?.id ?? null,
  });
}
