/**
 * One-shot audit: reconcile Mayo batch sheet PDFs with portal order
 * shipping status. Two phases:
 *
 *   Phase A (default): parse every PDF in the given folder, match
 *   each patient row against orders.mayo_order_number /
 *   mayo_ml_order_number / mayo_patient_id, mark matched orders as
 *   shipped (with the batch sheet's printed date as the shipped_at,
 *   fedex_tracking_number left NULL — historical, no tracking).
 *
 *   Phase B (--sweep): any order still in status ('confirmed',
 *   'awaiting_shipment') AND created more than 21 days ago gets
 *   force-marked as shipped so the queue stops accumulating stale
 *   entries. shipped_at = created_at + 7 days (rough estimate) since
 *   we don't know the real ship date.
 *
 * DEFAULT IS DRY-RUN. Add --apply to actually write.
 *
 * Usage (from repo root):
 *   node scripts/audit-mayo-batches.mjs "./Mayo Batches"
 *   node scripts/audit-mayo-batches.mjs "./Mayo Batches" --apply
 *   node scripts/audit-mayo-batches.mjs "./Mayo Batches" --apply --sweep
 *
 * Requires .env.local with NEXT_PUBLIC_SUPABASE_URL +
 * SUPABASE_SERVICE_ROLE_KEY (already present per prior setup).
 *
 * NEVER fires patient notifications — historical audit only. If you
 * want notifications on a specific batch, use the drop-zone UI on
 * /admin/orders instead.
 */

import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { extractText, getDocumentProxy } from "unpdf";
import "dotenv/config";
// Fallback: load .env.local manually since dotenv/config auto-loads .env only.
import { config as loadDotenv } from "dotenv";
loadDotenv({ path: ".env.local" });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Add them to .env.local and re-run.",
  );
  process.exit(1);
}

const args = process.argv.slice(2);
const folder = args.find((a) => !a.startsWith("--")) ?? "./Mayo Batches";
const APPLY = args.includes("--apply");
const SWEEP = args.includes("--sweep");

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

// ─── Parse helpers (mirror of src/lib/mayo/parse-batch-sheet.ts) ─────
const WEB_RE = /WEB[A-Z0-9]{6,}/;
const ML_RE = /^ML\d{7,}[A-Z]?$/;
const MRN_RE = /^(?:1CJ|47R)[A-Z0-9]{5,}$/;
const BATCH_HEADER_RE = /^Batch\s+(\d{6,})$/i;
const NAME_RE = /^[A-Z][A-Za-z' -]+,\s*[A-Z][A-Za-z' -]+$/;
const COLLECTED_RE = /^\d{1,2}\s+[A-Z][a-z]{2}\s+\d{4}\s+\d{2}:\d{2}$/;
const PRINTED_RE = /Printed\s+(\d{2})\/(\d{2})\/(\d{4})/;

// Combined row: '<WEB> <Last, First[ Middle]> <MRN> <DD Mon YYYY HH:MM>'
// Some rows wrap the name onto the next line — handle that by peeking.
const ROW_RE = new RegExp(
  "^(WEB[A-Z0-9]{6,})\\s+(.+?)\\s+((?:1CJ|47R)[A-Z0-9]{5,})\\s+(\\d{1,2}\\s+[A-Z][a-z]{2}\\s+\\d{4}\\s+\\d{2}:\\d{2})$",
);
// When the name wraps, first physical line ends with the WEB + partial
// name (comma-terminated). Second line is the wrapped remainder, then
// third line has MRN + collected.
const ROW_WRAP_START_RE = new RegExp(
  "^(WEB[A-Z0-9]{6,})\\s+(.+,)\\s*$",
);
const ROW_WRAP_END_RE = new RegExp(
  "^((?:1CJ|47R)[A-Z0-9]{5,})\\s+(\\d{1,2}\\s+[A-Z][a-z]{2}\\s+\\d{4}\\s+\\d{2}:\\d{2})$",
);

async function parsePdf(path) {
  const buf = await readFile(path);
  const pdf = await getDocumentProxy(new Uint8Array(buf));
  const { text: pages } = await extractText(pdf, { mergePages: false });
  const pagesArr = Array.isArray(pages) ? pages : [pages];
  const rows = [];
  const batches = [];
  let printedISO = null;
  for (const raw of pagesArr) {
    const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

    // Header/footer metadata
    for (const line of lines) {
      const p = PRINTED_RE.exec(line);
      if (p && !printedISO) printedISO = `${p[3]}-${p[1]}-${p[2]}`; // MM/DD/YYYY → YYYY-MM-DD
      const b = BATCH_HEADER_RE.exec(line);
      if (b && !batches.includes(b[1])) batches.push(b[1]);
    }

    // ML accessions appear as their own lines above the header row.
    // We collect them per-page and pair with the parsed rows by index.
    const mls = [];
    for (const line of lines) {
      if (ML_RE.test(line)) mls.push(line);
    }

    // Parse patient rows
    const pageRows = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const m = ROW_RE.exec(line);
      if (m) {
        pageRows.push({
          order_no: m[1],
          patient_name: m[2].trim(),
          mayo_patient_id: m[3],
          collected_at: m[4],
        });
        continue;
      }
      // Wrapped name — first line has WEB + last-name-with-comma
      const wrap = ROW_WRAP_START_RE.exec(line);
      if (wrap && i + 2 < lines.length) {
        const remainder = lines[i + 1];
        const tail = ROW_WRAP_END_RE.exec(lines[i + 2]);
        if (tail) {
          pageRows.push({
            order_no: wrap[1],
            patient_name: `${wrap[2].trim()} ${remainder.trim()}`,
            mayo_patient_id: tail[1],
            collected_at: tail[2],
          });
          i += 2;
        }
      }
    }

    // Pair MLs by order — Mayo prints them top-to-bottom in the same
    // order as the patient rows.
    for (let i = 0; i < pageRows.length; i++) {
      rows.push({
        order_no: pageRows[i].order_no,
        ml_accession: mls[i] ?? null,
        mayo_patient_id: pageRows[i].mayo_patient_id,
        patient_name: pageRows[i].patient_name,
      });
    }
  }
  return { rows, batches, printedISO };
}

// ─── Main ────────────────────────────────────────────────────────────
console.log(`\n=== Mayo batch audit ===`);
console.log(`folder: ${folder}`);
console.log(`mode:   ${APPLY ? "APPLY" : "DRY-RUN"}`);
console.log(`sweep:  ${SWEEP ? "yes (21d+ orphans)" : "no"}\n`);

const entries = await readdir(folder);
const pdfs = entries.filter((f) => f.toLowerCase().endsWith(".pdf")).sort();

let totalRows = 0;
let totalMatched = 0;
let totalAlreadyShipped = 0;
let totalMisses = 0;
const perFile = [];
const updates = new Map(); // order_id → { shipped_at }
const backstamps = new Map(); // order_id → { mayo_order_number, mayo_ml_order_number?, mayo_patient_id? }

for (const pdf of pdfs) {
  const path = join(folder, pdf);
  let parsed;
  try {
    parsed = await parsePdf(path);
  } catch (err) {
    console.log(`  ✗ ${pdf} — parse failed: ${err.message}`);
    continue;
  }
  const { rows, batches, printedISO } = parsed;
  totalRows += rows.length;

  // Build one query per identifier type
  const webs = [...new Set(rows.map((r) => r.order_no).filter(Boolean))];
  const mls = [...new Set(rows.map((r) => r.ml_accession).filter(Boolean))];
  const mrns = [...new Set(rows.map((r) => r.mayo_patient_id).filter(Boolean))];
  const hits = new Map();
  async function lookup(column, values) {
    if (values.length === 0) return;
    const { data, error } = await supabase
      .from("orders")
      .select("id, status, shipped_at, fedex_tracking_number, mayo_order_number, mayo_ml_order_number, mayo_patient_id")
      .in(column, values);
    if (error) throw error;
    for (const o of data ?? []) hits.set(o.id, o);
  }
  await lookup("mayo_order_number", webs);
  await lookup("mayo_ml_order_number", mls);
  await lookup("mayo_patient_id", mrns);

  // Name-based fallback — most orders don't have Mayo IDs stamped yet.
  // Look each unresolved patient up by (last name + first name prefix +
  // date window around the batch's printed date).
  async function nameFallback(row) {
    if (!row.patient_name) return null;
    const parts = row.patient_name.split(",").map((s) => s.trim());
    if (parts.length < 2) return null;
    const last = parts[0];
    const first = parts[1].split(" ")[0]; // drop middle names
    if (!last || !first) return null;

    // Strict last-name match; fall back to substring on ≥4 chars.
    let { data: profiles } = await supabase
      .from("patient_profiles")
      .select("id, account_id, first_name, last_name")
      .ilike("last_name", last);
    if ((profiles ?? []).length === 0 && last.length >= 4) {
      const { data: fallback } = await supabase
        .from("patient_profiles")
        .select("id, account_id, first_name, last_name")
        .ilike("last_name", `%${last}%`);
      profiles = fallback ?? [];
    }
    if (!profiles || profiles.length === 0) return null;
    const firstMatch = profiles.filter((p) =>
      (p.first_name ?? "").toUpperCase().startsWith(first.toUpperCase()),
    );
    const candidates = firstMatch.length > 0 ? firstMatch : profiles;
    const accountIds = [...new Set(candidates.map((c) => c.account_id))];
    if (accountIds.length === 0) return null;

    // Window: batch print date ± wide range (batches can be days late).
    const anchor = printedISO ? new Date(printedISO) : new Date();
    const start = new Date(anchor); start.setDate(anchor.getDate() - 45);
    const end = new Date(anchor);   end.setDate(anchor.getDate() + 5);

    const { data: ordersData } = await supabase
      .from("orders")
      .select("id, status, shipped_at, fedex_tracking_number, mayo_order_number, mayo_ml_order_number, mayo_patient_id, created_at, appointment_at, appointment_date")
      .in("account_id", accountIds);
    const inWindow = (ordersData ?? []).filter((o) => {
      const anchorDate = o.appointment_at || o.appointment_date || o.created_at;
      if (!anchorDate) return false;
      const d = new Date(anchorDate);
      return d >= start && d <= end;
    });
    if (inWindow.length === 0) return null;
    // Pick the CLOSEST to batch date
    inWindow.sort((a, b) => {
      const ad = Math.abs(new Date(a.appointment_at || a.appointment_date || a.created_at).getTime() - anchor.getTime());
      const bd = Math.abs(new Date(b.appointment_at || b.appointment_date || b.created_at).getTime() - anchor.getTime());
      return ad - bd;
    });
    return inWindow[0];
  }

  let matched = 0;
  let alreadyShipped = 0;
  const misses = [];
  for (const r of rows) {
    let match = null;
    let matchMethod = null;
    for (const o of hits.values()) {
      if (r.order_no && o.mayo_order_number === r.order_no) { match = o; matchMethod = "web"; break; }
    }
    if (!match) for (const o of hits.values()) {
      if (r.ml_accession && o.mayo_ml_order_number === r.ml_accession) { match = o; matchMethod = "ml"; break; }
    }
    if (!match) for (const o of hits.values()) {
      if (r.mayo_patient_id && o.mayo_patient_id === r.mayo_patient_id) { match = o; matchMethod = "mrn"; break; }
    }
    // Name + date fallback (this is what unlocks most matches — very few
    // orders have Mayo IDs stamped)
    if (!match) {
      match = await nameFallback(r);
      if (match) matchMethod = "name+date";
    }
    if (!match) {
      misses.push(r);
      continue;
    }
    matched++;
    // Track method usage
    r._matchMethod = matchMethod;
    if (match.status === "shipped" || match.status === "resulted" || match.status === "complete") {
      alreadyShipped++;
      continue;
    }
    // Queue update. Use the LATEST batch date across all sheets that
    // mention this order (later sheets often reprint the same accession).
    const shippedAt = `${printedISO ?? new Date().toISOString().slice(0,10)}T00:00:00Z`;
    const prior = updates.get(match.id);
    if (!prior || prior.shipped_at < shippedAt) {
      updates.set(match.id, { shipped_at: shippedAt });
    }
    // Also backstamp Mayo IDs if not already set (learning loop)
    if (matchMethod === "name+date" && r.order_no && !match.mayo_order_number) {
      const patch = { mayo_order_number: r.order_no };
      if (r.ml_accession && !match.mayo_ml_order_number) patch.mayo_ml_order_number = r.ml_accession;
      if (r.mayo_patient_id && !match.mayo_patient_id) patch.mayo_patient_id = r.mayo_patient_id;
      backstamps.set(match.id, patch);
    }
  }
  totalMatched += matched;
  totalAlreadyShipped += alreadyShipped;
  totalMisses += misses.length;
  perFile.push({ pdf, batches, printedISO, rows: rows.length, matched, alreadyShipped, misses: misses.length, missDetail: misses.slice(0, 3) });
}

// Report
console.log(`\n─── Per-file summary ───`);
for (const f of perFile) {
  const batchLabel = f.batches.length ? f.batches.join(",") : "?";
  console.log(
    `${f.pdf.padEnd(10)}  printed=${(f.printedISO ?? "?").padEnd(10)}  batch=${batchLabel.padEnd(24)}  rows=${String(f.rows).padStart(3)}  matched=${String(f.matched).padStart(3)}  already=${String(f.alreadyShipped).padStart(3)}  missed=${String(f.misses).padStart(3)}`,
  );
  for (const m of f.missDetail) {
    console.log(`   ↳ MISS ${m.order_no ?? "?"}  ${m.patient_name ?? ""}  MRN=${m.mayo_patient_id ?? "?"}`);
  }
}
console.log(`\n─── Totals ───`);
console.log(`  rows scanned:        ${totalRows}`);
console.log(`  orders matched:      ${totalMatched}`);
console.log(`  already shipped:     ${totalAlreadyShipped}`);
console.log(`  rows without match:  ${totalMisses}`);
console.log(`  orders to update:    ${updates.size}\n`);

// Phase B — sweep old orphans
let sweepIds = [];
let completeIds = [];
if (SWEEP) {
  const twentyOneDaysAgo = new Date(Date.now() - 21 * 24 * 60 * 60 * 1000).toISOString();

  // B1: unshipped orders older than 21 days → force shipped
  const { data: stale, error } = await supabase
    .from("orders")
    .select("id, created_at, status")
    .in("status", ["confirmed", "awaiting_shipment", "pending"])
    .lt("created_at", twentyOneDaysAgo);
  if (error) {
    console.error("Sweep-shipped query failed:", error.message);
  } else {
    sweepIds = (stale ?? []).map((o) => ({
      id: o.id,
      shipped_at: new Date(new Date(o.created_at).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    }));
  }

  // B2: shipped orders older than 21 days → force complete
  // Mike sometimes emails results directly (portal login issues) which
  // leaves orders orphaned in 'shipped' forever. Any shipment 21+ days
  // old has had ample time for results to land — flip to complete.
  const { data: shippedStale, error: shipErr } = await supabase
    .from("orders")
    .select("id, shipped_at, status")
    .eq("status", "shipped")
    .lt("shipped_at", twentyOneDaysAgo);
  if (shipErr) {
    console.error("Sweep-complete query failed:", shipErr.message);
  } else {
    completeIds = (shippedStale ?? []).map((o) => o.id);
  }

  console.log(`─── Sweep ───`);
  console.log(`  unshipped 21d+ (→ shipped):     ${sweepIds.length}`);
  console.log(`  shipped 21d+ (→ complete):      ${completeIds.length}\n`);
}

if (!APPLY) {
  console.log(`Dry-run complete. Re-run with --apply to write:\n  node scripts/audit-mayo-batches.mjs "${folder}" --apply${SWEEP ? " --sweep" : ""}\n`);
  process.exit(0);
}

// ─── APPLY ────────────────────────────────────────────────────────
console.log(`\nAPPLYING…`);
let updated = 0;
let failed = 0;
for (const [id, patch] of updates) {
  const { error } = await supabase
    .from("orders")
    .update({
      status: "shipped",
      shipped_at: patch.shipped_at,
      shipping_date: patch.shipped_at.slice(0, 10),
      // fedex_tracking_number intentionally NOT touched — historical
      // backfill with no tracking; preserves whatever was there.
    })
    .eq("id", id);
  if (error) { console.log(`  ✗ ${id}: ${error.message}`); failed++; }
  else updated++;
}
console.log(`  batch-matched orders shipped: ${updated} ok, ${failed} failed`);

// Backstamp Mayo IDs onto orders that were name+date matched (learning
// loop — next time these show up on an invoice they'll auto-match via PK).
let stamped = 0;
let stampFailed = 0;
for (const [id, patch] of backstamps) {
  const { error } = await supabase.from("orders").update(patch).eq("id", id);
  if (error) stampFailed++;
  else stamped++;
}
if (backstamps.size > 0) {
  console.log(`  Mayo IDs backstamped:         ${stamped} ok, ${stampFailed} failed`);
}

if (SWEEP) {
  let sweepUpdated = 0;
  let sweepFailed = 0;
  for (const s of sweepIds) {
    const { error } = await supabase
      .from("orders")
      .update({ status: "shipped", shipped_at: s.shipped_at, shipping_date: s.shipped_at.slice(0, 10) })
      .eq("id", s.id);
    if (error) { console.log(`  ✗ ${s.id}: ${error.message}`); sweepFailed++; }
    else sweepUpdated++;
  }
  console.log(`  unshipped orphans → shipped:  ${sweepUpdated} ok, ${sweepFailed} failed`);

  let completeUpdated = 0;
  let completeFailed = 0;
  for (const id of completeIds) {
    const { error } = await supabase
      .from("orders")
      .update({ status: "complete" })
      .eq("id", id);
    if (error) { console.log(`  ✗ ${id}: ${error.message}`); completeFailed++; }
    else completeUpdated++;
  }
  console.log(`  shipped orphans → complete:   ${completeUpdated} ok, ${completeFailed} failed`);
}
console.log(`\nDone.`);
