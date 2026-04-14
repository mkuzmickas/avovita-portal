import "server-only";
import type { createServiceRoleClient } from "@/lib/supabase/server";

type ServiceClient = ReturnType<typeof createServiceRoleClient>;

export interface NotificationLogEntry {
  channel: "email" | "sms";
  template: string;
  recipient: string;
  status: "sent" | "failed";
  account_id?: string | null;
  profile_id?: string | null;
  order_id?: string | null;
  result_id?: string | null;
  error_message?: string | null;
}

/**
 * Best-effort log of an outbound notification. Never throws — a logging
 * failure must never block the notification itself. Callers should pass
 * the service-role client so RLS can't reject the insert.
 */
export async function logNotification(
  service: ServiceClient,
  entry: NotificationLogEntry
): Promise<void> {
  try {
    await service.from("notifications").insert({
      channel: entry.channel,
      template: entry.template,
      recipient: entry.recipient,
      status: entry.status,
      account_id: entry.account_id ?? null,
      profile_id: entry.profile_id ?? null,
      order_id: entry.order_id ?? null,
      result_id: entry.result_id ?? null,
      error_message: entry.error_message ?? null,
    });
  } catch (err) {
    console.error(
      `[notifications:log] insert failed (${entry.template}/${entry.channel}):`,
      err
    );
  }
}
