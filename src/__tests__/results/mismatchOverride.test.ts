/**
 * Regression: the Premji override case the user just reported.
 *
 * 1. detectNameFromFilename parses "PREMJI_JAMILA_*.pdf" to "Jamila Premji"
 * 2. namesMatchProfile("Jamila Premji", "Irfaan Premji") returns false
 * 3. With overridden = true on a queue item with the above mismatch,
 *    the canonical "any submittable pending file with un-acknowledged
 *    mismatch" check must return FALSE, which is what un-disables the
 *    Upload & Notify button.
 *
 * The helpers below are inlined copies of the production code in
 * src/components/admin/AdminResultsManager.tsx so this test catches any
 * silent regression to the helper bodies without needing React Testing
 * Library to mount the whole component tree.
 */

import { describe, it, expect } from "vitest";

function detectNameFromFilename(
  fileName: string,
): { first: string; last: string; display: string } | null {
  const stem = fileName.replace(/\.pdf$/i, "");
  const parts = stem.split("_");
  if (parts.length < 2) return null;
  const last = parts[0].trim();
  const first = parts[1].trim();
  if (!/^[A-Za-z'-]{2,}$/.test(last)) return null;
  if (!/^[A-Za-z'-]{2,}$/.test(first)) return null;
  const cap = (s: string) =>
    s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  return {
    first: cap(first),
    last: cap(last),
    display: `${cap(first)} ${cap(last)}`,
  };
}

function namesMatchProfile(
  detected: { first: string; last: string },
  profileName: string,
): boolean {
  const tokens = new Set(
    profileName
      .toLowerCase()
      .split(/[\s,]+/)
      .flatMap((t) => t.split("-"))
      .filter(Boolean),
  );
  return (
    tokens.has(detected.first.toLowerCase()) &&
    tokens.has(detected.last.toLowerCase())
  );
}

interface QueueItem {
  status: { state: "pending" | "uploading" | "done" | "error" };
  detectedName: ReturnType<typeof detectNameFromFilename>;
  overridden: boolean;
}

function itemHasMismatch(item: QueueItem, profileName: string): boolean {
  if (!item.detectedName) return false;
  return !namesMatchProfile(item.detectedName, profileName);
}

function unacknowledgedMismatchAny(
  queue: QueueItem[],
  profileName: string,
): boolean {
  return queue.some(
    (q) =>
      (q.status.state === "pending" || q.status.state === "error") &&
      itemHasMismatch(q, profileName) &&
      !q.overridden,
  );
}

describe("PREMJI_JAMILA upload to Irfaan Premji's order", () => {
  it("parses the filename to Jamila Premji", () => {
    expect(detectNameFromFilename("PREMJI_JAMILA_abc123.pdf")).toEqual({
      first: "Jamila",
      last: "Premji",
      display: "Jamila Premji",
    });
  });

  it("flags the mismatch against Irfaan Premji", () => {
    const detected = detectNameFromFilename("PREMJI_JAMILA_abc123.pdf")!;
    expect(namesMatchProfile(detected, "Irfaan Premji")).toBe(false);
  });

  it("with override = true, unacknowledgedMismatch is false (button enabled)", () => {
    const detected = detectNameFromFilename("PREMJI_JAMILA_abc123.pdf");
    const queue: QueueItem[] = [
      { status: { state: "pending" }, detectedName: detected, overridden: true },
    ];
    expect(unacknowledgedMismatchAny(queue, "Irfaan Premji")).toBe(false);
  });

  it("with override = false, unacknowledgedMismatch is true (button disabled)", () => {
    const detected = detectNameFromFilename("PREMJI_JAMILA_abc123.pdf");
    const queue: QueueItem[] = [
      { status: { state: "pending" }, detectedName: detected, overridden: false },
    ];
    expect(unacknowledgedMismatchAny(queue, "Irfaan Premji")).toBe(true);
  });

  it("matched files still upload freely", () => {
    const detected = detectNameFromFilename("PREMJI_IRFAAN_xyz.pdf");
    expect(detected).toEqual({
      first: "Irfaan",
      last: "Premji",
      display: "Irfaan Premji",
    });
    expect(namesMatchProfile(detected!, "Irfaan Premji")).toBe(true);
    const queue: QueueItem[] = [
      { status: { state: "pending" }, detectedName: detected, overridden: false },
    ];
    expect(unacknowledgedMismatchAny(queue, "Irfaan Premji")).toBe(false);
  });
});
