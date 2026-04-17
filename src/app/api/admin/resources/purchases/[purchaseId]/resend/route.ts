import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { resend } from "@/lib/resend";
import { logNotification } from "@/lib/notifications";
import {
  renderResourceDownloadEmail,
  resourceDownloadSubject,
} from "@/lib/emails/resourceDownload";

export const runtime = "nodejs";

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: acc } = await supabase
    .from("accounts")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!acc || (acc as { role: string }).role !== "admin") return null;
  return user;
}

/**
 * POST /api/admin/resources/purchases/[purchaseId]/resend
 *
 * Admin-only. Re-sends the download email for an existing purchase
 * using the EXISTING download_token (does not regenerate).
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ purchaseId: string }> },
) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { purchaseId } = await params;
  const service = createServiceRoleClient();

  // Fetch purchase + resource
  const { data: purchaseRaw, error: purchaseErr } = await service
    .from("resource_purchases")
    .select("id, resource_id, email, download_token, expires_at, max_downloads")
    .eq("id", purchaseId)
    .single();

  if (purchaseErr || !purchaseRaw) {
    return NextResponse.json(
      { error: "Purchase not found" },
      { status: 404 },
    );
  }

  const purchase = purchaseRaw as {
    id: string;
    resource_id: string;
    email: string;
    download_token: string;
    expires_at: string;
    max_downloads: number;
  };

  const { data: resRaw } = await service
    .from("resources")
    .select("title, description")
    .eq("id", purchase.resource_id)
    .single();

  const resource = resRaw as {
    title: string;
    description: string | null;
  } | null;

  if (!resource) {
    return NextResponse.json(
      { error: "Associated resource not found" },
      { status: 404 },
    );
  }

  const portalUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? "https://portal.avovita.ca";
  const downloadUrl = `${portalUrl}/api/resources/purchased/download/${purchase.download_token}`;

  const html = renderResourceDownloadEmail({
    resourceTitle: resource.title,
    resourceDescription: resource.description,
    downloadUrl,
    expiresAt: purchase.expires_at,
    maxDownloads: purchase.max_downloads,
  });

  try {
    await resend.emails.send({
      from: process.env.RESEND_FROM_ORDERS!,
      to: purchase.email,
      subject: resourceDownloadSubject(resource.title),
      html,
    });
    await logNotification(service, {
      channel: "email",
      template: "resource_download_resend",
      recipient: purchase.email,
      status: "sent",
    });
    return NextResponse.json({ ok: true, email: purchase.email });
  } catch (err) {
    console.error(
      `[admin-resend] Failed to resend for purchase ${purchaseId}:`,
      err,
    );
    await logNotification(service, {
      channel: "email",
      template: "resource_download_resend",
      recipient: purchase.email,
      status: "failed",
      error_message: String(err),
    }).catch(() => {});
    return NextResponse.json(
      { error: "Failed to send email" },
      { status: 500 },
    );
  }
}
