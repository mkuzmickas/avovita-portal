import "server-only";

import type {
  AcquisitionChannelRow,
  DeviceRow,
  LandingPageRow,
  SessionsByDayPoint,
} from "./ga4Queries";

export interface GAResponse {
  range: { startDate: string; endDate: string };
  sessionsByDay: SessionsByDayPoint[];
  acquisitionChannels: AcquisitionChannelRow[];
  topLandingPages: LandingPageRow[];
  deviceBreakdown: DeviceRow[];
  outboundClicksToPortal: number | null;
}

export interface GAErrorPayload {
  error: string;
  code: "auth" | "quota" | "unavailable";
}

const CACHE_TTL_MS = 15 * 60 * 1_000;
const cache = new Map<string, { value: GAResponse; expiresAt: number }>();

export function cacheKey(range: string, start: string, end: string): string {
  return `${range}|${start}|${end}`;
}

export function getCached(key: string): GAResponse | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }
  return hit.value;
}

export function setCached(key: string, value: GAResponse): void {
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

export function clearGACache(): void {
  cache.clear();
}

/**
 * Map an error from the GA4 Data API onto a stable shape the dashboard
 * can render. Always returns HTTP 502 — the portal section keeps working
 * regardless; the marketing section shows the matching error card.
 */
export function mapGAError(err: unknown): {
  status: number;
  body: GAErrorPayload;
} {
  const e = err as {
    code?: number | string;
    status?: number;
    response?: { status?: number };
  };
  const httpStatus =
    typeof e?.response?.status === "number"
      ? e.response.status
      : typeof e?.status === "number"
        ? e.status
        : null;
  const grpcCode = typeof e?.code === "number" ? e.code : null;

  // gRPC: 16=UNAUTHENTICATED, 7=PERMISSION_DENIED, 8=RESOURCE_EXHAUSTED
  if (
    httpStatus === 401 ||
    httpStatus === 403 ||
    grpcCode === 16 ||
    grpcCode === 7
  ) {
    return {
      status: 502,
      body: { error: "Authentication issue — contact admin", code: "auth" },
    };
  }
  if (httpStatus === 429 || grpcCode === 8) {
    return {
      status: 502,
      body: { error: "GA quota exceeded, try again later", code: "quota" },
    };
  }
  return {
    status: 502,
    body: {
      error: "Marketing site data temporarily unavailable",
      code: "unavailable",
    },
  };
}
