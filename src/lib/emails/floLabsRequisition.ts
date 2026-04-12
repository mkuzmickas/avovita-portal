import "server-only";
import { resend } from "@/lib/resend";
import type { createServiceRoleClient } from "@/lib/supabase/server";
import type { OrderMetadataPayload } from "@/lib/checkout/materialise";

type ServiceClient = ReturnType<typeof createServiceRoleClient>;

/**
 * Sends the FloLabs internal requisition email for a new order.
 * Only called when FLOLABS_NOTIFICATIONS_ENABLED=true.
 *
 * Placeholder — the full implementation with specimen details,
 * collection containers, and shipping notes will be added when
 * the FloLabs email template is finalised.
 */
export async function sendFloLabsRequisition(
  supabase: ServiceClient,
  orderId: string,
  payload: OrderMetadataPayload
): Promise<void> {
  const orderIdShort = orderId.slice(0, 8).toUpperCase();
  const accountHolder = payload.persons.find((p) => p.is_account_holder);
  const lastName = accountHolder?.last_name ?? "Unknown";

  // Resolve test details for the email
  const testIds = [...new Set(payload.assignments.map((a) => a.test_id))];
  const { data: testsRaw } = await supabase
    .from("tests")
    .select(
      "id, name, specimen_type, ship_temp, stability_notes, turnaround_display, lab:labs(name, shipping_notes)"
    )
    .in("id", testIds);

  type TestRow = {
    id: string;
    name: string;
    specimen_type: string | null;
    ship_temp: string | null;
    stability_notes: string | null;
    turnaround_display: string | null;
    lab: { name: string; shipping_notes: string | null } | { name: string; shipping_notes: string | null }[] | null;
  };
  const testMap = new Map<string, TestRow>();
  for (const t of (testsRaw ?? []) as unknown as TestRow[]) {
    testMap.set(t.id, t);
  }

  // Build person → tests table rows
  const personBlocks = payload.persons.map((person) => {
    const personAssignments = payload.assignments.filter(
      (a) => a.person_index === person.index
    );
    const rows = personAssignments
      .map((a) => {
        const t = testMap.get(a.test_id);
        const lab = Array.isArray(t?.lab) ? t?.lab[0] : t?.lab;
        const fasting = /fasting/i.test(t?.turnaround_display ?? "");
        return `<tr>
          <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-size:13px;">${esc(t?.name ?? "Unknown")}</td>
          <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-size:13px;">${esc(lab?.name ?? "")}</td>
          <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-size:13px;">${esc(t?.specimen_type ?? "—")}</td>
          <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-size:13px;">${esc(t?.ship_temp ?? "—")}</td>
          <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-size:13px;">${esc(t?.stability_notes ?? "—")}</td>
          <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-size:13px;">${fasting ? '<strong style="color:#dc2626;">YES</strong>' : ""}</td>
        </tr>`;
      })
      .join("");

    const rel = person.is_account_holder
      ? ""
      : ` — ${person.relationship?.replace("_", " ") ?? "Additional person"}`;

    return `<div style="margin-bottom:24px;">
      <h3 style="margin:0 0 4px;font-size:15px;color:#111827;">${esc(person.first_name)} ${esc(person.last_name)}${rel}</h3>
      <p style="margin:0 0 8px;font-size:12px;color:#6b7280;">DOB: ${person.date_of_birth} · Sex: ${person.biological_sex}</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-top:2px solid #0f2614;">
        <tr style="background:#f9fafb;">
          <th style="padding:6px 8px;text-align:left;font-size:11px;text-transform:uppercase;color:#6b7280;">Test</th>
          <th style="padding:6px 8px;text-align:left;font-size:11px;text-transform:uppercase;color:#6b7280;">Lab</th>
          <th style="padding:6px 8px;text-align:left;font-size:11px;text-transform:uppercase;color:#6b7280;">Specimen</th>
          <th style="padding:6px 8px;text-align:left;font-size:11px;text-transform:uppercase;color:#6b7280;">Temp</th>
          <th style="padding:6px 8px;text-align:left;font-size:11px;text-transform:uppercase;color:#6b7280;">Stability</th>
          <th style="padding:6px 8px;text-align:left;font-size:11px;text-transform:uppercase;color:#6b7280;">Fasting</th>
        </tr>
        ${rows}
      </table>
    </div>`;
  });

  const addr = payload.collection_address;
  const addressLine = [
    addr.address_line1,
    addr.address_line2,
    addr.city,
    addr.province,
    addr.postal_code,
  ]
    .filter(Boolean)
    .join(", ");

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;font-family:Arial,sans-serif;background:#f4f4f4;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px;">
<table width="700" cellpadding="0" cellspacing="0" style="max-width:700px;background:#fff;border-radius:8px;overflow:hidden;">
  <tr><td style="background:#0f2614;padding:24px 32px;border-bottom:3px solid #c4973a;">
    <h1 style="margin:0;font-size:22px;color:#fff;font-family:Georgia,serif;">AvoVita <span style="color:#c4973a;">Wellness</span></h1>
    <p style="margin:4px 0 0;font-size:12px;color:#8dc63f;">INTERNAL COLLECTION REQUEST</p>
  </td></tr>
  <tr><td style="padding:28px 32px;">
    <h2 style="margin:0 0 16px;font-size:18px;color:#111827;">Collection Details</h2>
    <p style="margin:0 0 4px;font-size:14px;color:#4b5563;"><strong>Order:</strong> ${orderIdShort}</p>
    <p style="margin:0 0 4px;font-size:14px;color:#4b5563;"><strong>Date:</strong> ${new Date().toLocaleDateString("en-CA")}</p>
    <p style="margin:0 0 16px;font-size:14px;color:#4b5563;"><strong>Collection Address:</strong> ${esc(addressLine)}</p>
    <h2 style="margin:0 0 12px;font-size:18px;color:#111827;">Patient(s) and Tests</h2>
    ${personBlocks.join("")}
    <div style="margin-top:20px;padding:16px;background:#fffbeb;border-left:4px solid #c4973a;border-radius:4px;">
      <h3 style="margin:0 0 8px;font-size:14px;color:#78350f;">Shipping Notes</h3>
      <p style="margin:0;font-size:13px;color:#78350f;line-height:1.5;">
        Please ensure all Mayo Clinic specimens are frozen and held for Wednesday shipping.
        Armin Labs specimens must ship same day as collection.
      </p>
    </div>
  </td></tr>
  <tr><td style="padding:16px 32px;background:#f9fafb;border-top:1px solid #e5e7eb;">
    <p style="margin:0;font-size:11px;color:#9ca3af;">
      This is an internal collection request generated by AvoVita Wellness portal.
      Do not reply to this email. For questions contact info@avovita.ca
    </p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;

  await resend.emails.send({
    from: process.env.RESEND_FROM_RESULTS!,
    to: "info@flolabs.ca",
    subject: `New AvoVita Collection Request — Order ${orderIdShort} — ${esc(lastName)}`,
    html,
  });

  // Log to notifications table
  await supabase.from("notifications").insert({
    profile_id: null,
    order_id: orderId,
    result_id: null,
    channel: "email",
    template: "flolabs_requisition",
    recipient: "info@flolabs.ca",
    status: "sent",
  });

  console.log(
    `[stripe-webhook] FloLabs requisition email sent for order ${orderIdShort}`
  );
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
