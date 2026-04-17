import "server-only";
import crypto from "crypto";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { resend } from "@/lib/resend";
import { logNotification } from "@/lib/notifications";
import {
  renderResourceDownloadEmail,
  resourceDownloadSubject,
} from "@/lib/emails/resourceDownload";

// ─── Error types ────────────────────────────────────────────────────

export class ResourceNotFoundError extends Error {
  constructor(id: string) {
    super(`Resource ${id} not found`);
    this.name = "ResourceNotFoundError";
  }
}

export class ResourceInactiveError extends Error {
  constructor(id: string) {
    super(`Resource ${id} is inactive`);
    this.name = "ResourceInactiveError";
  }
}

export class FreeResourceError extends Error {
  constructor(id: string) {
    super(
      `Resource ${id} is free — use the direct download endpoint instead`,
    );
    this.name = "FreeResourceError";
  }
}

// ─── Main fulfillment function ──────────────────────────────────────

interface FulfillParams {
  resourceId: string;
  email: string;
  orderId?: string | null;
  accountId?: string | null;
}

interface FulfillResult {
  purchaseId: string;
  downloadToken: string;
}

/**
 * Creates a resource_purchases row with a cryptographic download token
 * and sends the branded download email. Called by the Stripe webhook
 * after a paid resource is purchased.
 *
 * Validation errors throw (caller must handle). Email send failures
 * are logged but DO NOT throw — the purchase row is saved regardless.
 */
export async function fulfillResourcePurchase(
  params: FulfillParams,
): Promise<FulfillResult> {
  const { resourceId, email, orderId = null, accountId = null } = params;
  const supabase = createServiceRoleClient();

  // 1. Validate the resource
  const { data: resRaw, error: resErr } = await supabase
    .from("resources")
    .select("id, title, description, price_cad, active, file_path")
    .eq("id", resourceId)
    .single();

  if (resErr || !resRaw) {
    throw new ResourceNotFoundError(resourceId);
  }

  const resource = resRaw as {
    id: string;
    title: string;
    description: string | null;
    price_cad: number;
    active: boolean;
    file_path: string;
  };

  if (!resource.active) {
    throw new ResourceInactiveError(resourceId);
  }

  if (resource.price_cad === 0) {
    throw new FreeResourceError(resourceId);
  }

  // 2. Generate cryptographic download token
  const downloadToken = crypto.randomBytes(16).toString("hex");

  // 3. Insert resource_purchases row
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30);

  const { data: purchaseRaw, error: purchaseErr } = await supabase
    .from("resource_purchases")
    .insert({
      resource_id: resourceId,
      email: email.toLowerCase().trim(),
      order_id: orderId,
      account_id: accountId,
      download_token: downloadToken,
      download_count: 0,
      max_downloads: 5,
      expires_at: expiresAt.toISOString(),
    })
    .select("id")
    .single();

  if (purchaseErr || !purchaseRaw) {
    throw new Error(
      `Failed to create resource_purchase: ${purchaseErr?.message}`,
    );
  }

  const purchaseId = (purchaseRaw as { id: string }).id;

  // 4. Send download email (non-fatal — purchase row is saved regardless)
  try {
    const portalUrl =
      process.env.NEXT_PUBLIC_APP_URL ?? "https://portal.avovita.ca";
    const downloadUrl = `${portalUrl}/api/resources/purchased/download/${downloadToken}`;

    const html = renderResourceDownloadEmail({
      resourceTitle: resource.title,
      resourceDescription: resource.description,
      downloadUrl,
      expiresAt: expiresAt.toISOString(),
      maxDownloads: 5,
    });

    await resend.emails.send({
      from: process.env.RESEND_FROM_ORDERS!,
      to: email.toLowerCase().trim(),
      subject: resourceDownloadSubject(resource.title),
      html,
    });

    await logNotification(supabase, {
      channel: "email",
      template: "resource_download",
      recipient: email.toLowerCase().trim(),
      status: "sent",
    });

    console.log(
      `[resource-fulfillment] Email sent for resource ${resource.title} to ${email}`,
    );
  } catch (emailErr) {
    console.error(
      `[resource-fulfillment] Email send failed for resource ${resourceId}:`,
      emailErr,
    );
    await logNotification(supabase, {
      channel: "email",
      template: "resource_download",
      recipient: email.toLowerCase().trim(),
      status: "failed",
      error_message: String(emailErr),
    }).catch(() => {});
  }

  return { purchaseId, downloadToken };
}
