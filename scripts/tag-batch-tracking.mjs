/**
 * One-shot: for every patient in ONE sub-batch of a Mayo batch sheet
 * PDF, stamp a FedEx tracking number on their portal order. No
 * notifications fire.
 *
 * Usage (dry-run default):
 *   node scripts/tag-batch-tracking.mjs "./Mayo Batches/24.pdf" 52936901 875950141572
 *   node scripts/tag-batch-tracking.mjs "./Mayo Batches/24.pdf" 52936901 875950141572 --apply
 */

import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { extractText, getDocumentProxy } from "unpdf";
import { config as loadDotenv } from "dotenv";
loadDotenv({ path: ".env.local" });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const [pdfPath, batchNo, tracking, ...flags] = process.argv.slice(2);
const APPLY = flags.includes("--apply");
if (!pdfPath || !batchNo || !tracking) {
  console.error('Usage: node scripts/tag-batch-tracking.mjs "<pdf>" <batchNo> <trackingNumber> [--apply]');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const WEB_RE = /WEB[A-Z0-9]{6,}/;
const MRN_RE = /^(?:1CJ|47R)[A-Z0-9]{5,}$/;
const ML_RE = /^ML\d{7,}[A-Z]?$/;
const BATCH_HEADER_RE = /^Batch\s+(\d{6,})$/i;
const PRINTED_RE = /Printed\s+(\d{2})\/(\d{2})\/(\d{4})/;
const ROW_RE = new RegExp(
  "^(WEB[A-Z0-9]{6,})\\s+(.+?)\\s+((?:1CJ|47R)[A-Z0-9]{5,})\\s+(\\d{1,2}\\s+[A-Z][a-z]{2}\\s+\\d{4}\\s+\\d{2}:\\d{2})$",
);
const ROW_WRAP_START_RE = new RegExp("^(WEB[A-Z0-9]{6,})\\s+(.+,)\\s*$");
const ROW_WRAP_END_RE = new RegExp("^((?:1CJ|47R)[A-Z0-9]{5,})\\s+(\\d{1,2}\\s+[A-Z][a-z]{2}\\s+\\d{4}\\s+\\d{2}:\\d{2})$");

const buf = await readFile(pdfPath);
const pdf = await getDocumentProxy(new Uint8Array(buf));
const { text: pages } = await extractText(pdf, { mergePages: false });
const pagesArr = Array.isArray(pages) ? pages : [pages];

// Find the page that belongs to the requested batch
let targetPageLines = null;
let printedISO = null;
for (const raw of pagesArr) {
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const p = lines.find((l) => PRINTED_RE.test(l));
  if (p && !printedISO) {
    const m = PRINTED_RE.exec(p);
    printedISO = `${m[3]}-${m[1]}-${m[2]}`;
  }
  const hasBatch = lines.some((l) => {
    const bm = BATCH_HEADER_RE.exec(l);
    return bm && bm[1] === batchNo;
  });
  if (hasBatch) { targetPageLines = lines; break; }
}
if (!targetPageLines) {
  console.error(`Batch ${batchNo} not found on any page of ${pdfPath}`);
  process.exit(1);
}

// Parse rows on that page
const rows = [];
const mls = [];
for (const line of targetPageLines) if (ML_RE.test(line)) mls.push(line);
for (let i = 0; i < targetPageLines.length; i++) {
  const line = targetPageLines[i];
  const m = ROW_RE.exec(line);
  if (m) {
    rows.push({ order_no: m[1], patient_name: m[2].trim(), mayo_patient_id: m[3], collected_at: m[4] });
    continue;
  }
  const wrap = ROW_WRAP_START_RE.exec(line);
  if (wrap && i + 2 < targetPageLines.length) {
    const tail = ROW_WRAP_END_RE.exec(targetPageLines[i + 2]);
    if (tail) {
      rows.push({
        order_no: wrap[1],
        patient_name: `${wrap[2].trim()} ${targetPageLines[i + 1].trim()}`,
        mayo_patient_id: tail[1],
        collected_at: tail[2],
      });
      i += 2;
    }
  }
}
for (let i = 0; i < rows.length; i++) rows[i].ml_accession = mls[i] ?? null;

console.log(`\nBatch ${batchNo} (printed ${printedISO}) — ${rows.length} patient row(s):`);
for (const r of rows) console.log(`  ${r.order_no}  ${r.patient_name}  MRN=${r.mayo_patient_id}`);

// Match each row to a portal order — same fallback chain as the invoice matcher
async function findOrder(row) {
  // 1. WEB accession
  let { data } = await supabase.from("orders").select("id, fedex_tracking_number, status").eq("mayo_order_number", row.order_no).limit(1);
  if (data?.[0]) return { order: data[0], via: "web" };
  // 2. ML accession
  if (row.ml_accession) {
    ({ data } = await supabase.from("orders").select("id, fedex_tracking_number, status").eq("mayo_ml_order_number", row.ml_accession).limit(1));
    if (data?.[0]) return { order: data[0], via: "ml" };
  }
  // 3. MRN → filter by uniqueness
  if (row.mayo_patient_id) {
    ({ data } = await supabase.from("orders").select("id, fedex_tracking_number, status").eq("mayo_patient_id", row.mayo_patient_id).limit(2));
    if (data?.length === 1) return { order: data[0], via: "mrn" };
  }
  // 4. Name + date fallback
  const parts = row.patient_name.split(",").map((s) => s.trim());
  if (parts.length < 2) return null;
  const last = parts[0];
  const first = parts[1].split(" ")[0];
  const { data: profiles } = await supabase.from("patient_profiles").select("id, account_id, first_name, last_name").ilike("last_name", last);
  if (!profiles?.length) return null;
  const narrowed = profiles.filter((p) => (p.first_name ?? "").toUpperCase().startsWith(first.toUpperCase()));
  const candidates = narrowed.length > 0 ? narrowed : profiles;
  const accountIds = [...new Set(candidates.map((c) => c.account_id))];
  if (!accountIds.length) return null;
  const anchor = new Date(printedISO);
  const start = new Date(anchor); start.setDate(anchor.getDate() - 45);
  const end = new Date(anchor); end.setDate(anchor.getDate() + 5);
  const { data: ordersData } = await supabase.from("orders").select("id, fedex_tracking_number, status, created_at, appointment_at, appointment_date").in("account_id", accountIds);
  const inWindow = (ordersData ?? []).filter((o) => {
    const d = new Date(o.appointment_at || o.appointment_date || o.created_at);
    return d >= start && d <= end;
  });
  if (!inWindow.length) return null;
  inWindow.sort((a, b) => {
    const ad = Math.abs(new Date(a.appointment_at || a.appointment_date || a.created_at).getTime() - anchor.getTime());
    const bd = Math.abs(new Date(b.appointment_at || b.appointment_date || b.created_at).getTime() - anchor.getTime());
    return ad - bd;
  });
  return { order: inWindow[0], via: "name+date" };
}

console.log(`\n─── Match preview ───`);
const updates = [];
for (const r of rows) {
  const hit = await findOrder(r);
  if (!hit) { console.log(`  ✗ ${r.patient_name} — no match`); continue; }
  const cur = hit.order.fedex_tracking_number ? ` (current: ${hit.order.fedex_tracking_number})` : "";
  console.log(`  ✓ ${r.patient_name} → order ${hit.order.id.slice(0,8)}  via ${hit.via}${cur}`);
  updates.push(hit.order.id);
}
console.log(`\n${updates.length}/${rows.length} matched. Tracking to stamp: ${tracking}\n`);

if (!APPLY) {
  console.log(`Dry-run. Re-run with --apply to write.\n`);
  process.exit(0);
}

let ok = 0, fail = 0;
for (const id of updates) {
  const { error } = await supabase.from("orders").update({ fedex_tracking_number: tracking }).eq("id", id);
  if (error) { console.log(`  ✗ ${id}: ${error.message}`); fail++; }
  else ok++;
}
console.log(`Stamped tracking on ${ok} order(s), ${fail} failed.`);
