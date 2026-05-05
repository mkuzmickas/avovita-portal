/**
 * Shared date-range resolver for analytics dashboards.
 *
 * One source of truth for translating the dashboard's "Today / 7d / 30d /
 * 90d / Custom" selector into concrete start/end Dates and the GA4
 * Data API's required YYYY-MM-DD format.
 */

export type DateRange = "today" | "7d" | "30d" | "90d" | "custom";

export interface ResolvedRange {
  startDate: Date;
  endDate: Date;
  /** YYYY-MM-DD — used by the GA4 Data API. */
  startDateYMD: string;
  /** YYYY-MM-DD — used by the GA4 Data API. */
  endDateYMD: string;
}

const DAY_MS = 86_400_000;

function toYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Parse YYYY-MM-DD as local midnight to avoid the JS UTC-vs-local off-by-one. */
function parseLocalYMD(s: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return new Date(s);
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export function resolveDateRange(
  range: DateRange,
  customStart?: string,
  customEnd?: string,
): ResolvedRange {
  const now = new Date();
  let start: Date;
  let end: Date = now;

  switch (range) {
    case "today":
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      break;
    case "7d":
      start = new Date(now.getTime() - 7 * DAY_MS);
      break;
    case "30d":
      start = new Date(now.getTime() - 30 * DAY_MS);
      break;
    case "90d":
      start = new Date(now.getTime() - 90 * DAY_MS);
      break;
    case "custom":
      start = customStart
        ? parseLocalYMD(customStart)
        : new Date(now.getTime() - 30 * DAY_MS);
      if (customEnd) {
        const base = parseLocalYMD(customEnd);
        if (!Number.isNaN(base.getTime())) {
          end = new Date(
            base.getFullYear(),
            base.getMonth(),
            base.getDate(),
            23,
            59,
            59,
          );
        }
      }
      break;
  }

  return {
    startDate: start,
    endDate: end,
    startDateYMD: toYMD(start),
    endDateYMD: toYMD(end),
  };
}
