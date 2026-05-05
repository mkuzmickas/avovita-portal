/**
 * Unit tests for the GA4 Data API query helpers + the API-route error
 * mapper. The real BetaAnalyticsDataClient never runs — we hand each query
 * a fake client whose runReport returns canned rows, and we assert the
 * dimension/metric requests + the response shape we hand to the dashboard.
 *
 * These tests do not call the real GA service: hitting it from CI would
 * burn quota and require credentials.
 */

import { describe, it, expect, beforeEach } from "vitest";
import type { BetaAnalyticsDataClient } from "@google-analytics/data";

import {
  getSessionsAndUsersByDay,
  getAcquisitionChannels,
  getTopLandingPages,
  getDeviceBreakdown,
  getOutboundClicksToPortal,
} from "@/lib/analytics/ga4Queries";
import { mapGAError } from "@/lib/analytics/gaCache";
import { resolveDateRange } from "@/lib/dates/range";

process.env.GA4_PROPERTY_ID = "470613793";

interface FakeRow {
  dimensionValues: { value: string }[];
  metricValues: { value: string }[];
}

function fakeClient(rows: FakeRow[]) {
  const calls: unknown[] = [];
  const client = {
    runReport: async (req: unknown) => {
      calls.push(req);
      return [{ rows }, null, null];
    },
  } as unknown as BetaAnalyticsDataClient;
  return { client, calls };
}

describe("getSessionsAndUsersByDay", () => {
  it("requests date dim + sessions/totalUsers/newUsers metrics, formats YYYYMMDD → YYYY-MM-DD", async () => {
    const { client, calls } = fakeClient([
      {
        dimensionValues: [{ value: "20260427" }],
        metricValues: [{ value: "120" }, { value: "84" }, { value: "30" }],
      },
      {
        dimensionValues: [{ value: "20260428" }],
        metricValues: [{ value: "150" }, { value: "100" }, { value: "40" }],
      },
    ]);

    const result = await getSessionsAndUsersByDay(
      "2026-04-27",
      "2026-04-28",
      client,
    );

    expect(result).toEqual([
      { date: "2026-04-27", sessions: 120, users: 84, newUsers: 30 },
      { date: "2026-04-28", sessions: 150, users: 100, newUsers: 40 },
    ]);

    const req = calls[0] as {
      property: string;
      dimensions: { name: string }[];
      metrics: { name: string }[];
      dateRanges: { startDate: string; endDate: string }[];
    };
    expect(req.property).toBe("properties/470613793");
    expect(req.dimensions.map((d) => d.name)).toEqual(["date"]);
    expect(req.metrics.map((m) => m.name)).toEqual([
      "sessions",
      "totalUsers",
      "newUsers",
    ]);
    expect(req.dateRanges[0]).toEqual({
      startDate: "2026-04-27",
      endDate: "2026-04-28",
    });
  });
});

describe("getAcquisitionChannels", () => {
  it("groups by sessionDefaultChannelGroup with sessions + totalUsers", async () => {
    const { client, calls } = fakeClient([
      {
        dimensionValues: [{ value: "Organic Search" }],
        metricValues: [{ value: "500" }, { value: "350" }],
      },
      {
        dimensionValues: [{ value: "Direct" }],
        metricValues: [{ value: "200" }, { value: "180" }],
      },
    ]);

    const rows = await getAcquisitionChannels(
      "2026-04-01",
      "2026-04-28",
      client,
    );

    expect(rows).toEqual([
      { channel: "Organic Search", sessions: 500, users: 350 },
      { channel: "Direct", sessions: 200, users: 180 },
    ]);

    const req = calls[0] as { dimensions: { name: string }[] };
    expect(req.dimensions[0].name).toBe("sessionDefaultChannelGroup");
  });

  it("falls back to '(unknown)' when GA returns an empty channel name", async () => {
    const { client } = fakeClient([
      {
        dimensionValues: [{ value: "" }],
        metricValues: [{ value: "10" }, { value: "5" }],
      },
    ]);
    const rows = await getAcquisitionChannels("2026-04-01", "2026-04-28", client);
    expect(rows[0].channel).toBe("(unknown)");
  });
});

describe("getTopLandingPages", () => {
  it("returns rows with sessions / bounceRate / engagementRate and respects limit param", async () => {
    const { client, calls } = fakeClient([
      {
        dimensionValues: [{ value: "/" }],
        metricValues: [
          { value: "1000" },
          { value: "0.42" },
          { value: "0.58" },
        ],
      },
    ]);

    const rows = await getTopLandingPages(
      "2026-04-01",
      "2026-04-28",
      5,
      client,
    );
    expect(rows).toEqual([
      {
        pagePath: "/",
        sessions: 1000,
        bounceRate: 0.42,
        engagementRate: 0.58,
      },
    ]);

    const req = calls[0] as { limit: number };
    expect(req.limit).toBe(5);
  });
});

describe("getDeviceBreakdown", () => {
  it("groups by deviceCategory", async () => {
    const { client, calls } = fakeClient([
      {
        dimensionValues: [{ value: "mobile" }],
        metricValues: [{ value: "700" }, { value: "500" }],
      },
      {
        dimensionValues: [{ value: "desktop" }],
        metricValues: [{ value: "300" }, { value: "250" }],
      },
    ]);

    const rows = await getDeviceBreakdown(
      "2026-04-01",
      "2026-04-28",
      client,
    );
    expect(rows).toEqual([
      { deviceCategory: "mobile", sessions: 700, users: 500 },
      { deviceCategory: "desktop", sessions: 300, users: 250 },
    ]);

    const req = calls[0] as { dimensions: { name: string }[] };
    expect(req.dimensions[0].name).toBe("deviceCategory");
  });
});

describe("channel filter (sessionDefaultChannelGroup)", () => {
  it("getSessionsAndUsersByDay omits the dimensionFilter when channel is undefined or 'All'", async () => {
    const { client: c1, calls: calls1 } = fakeClient([]);
    await getSessionsAndUsersByDay("2026-04-01", "2026-04-28", c1);
    expect((calls1[0] as { dimensionFilter?: unknown }).dimensionFilter)
      .toBeUndefined();

    const { client: c2, calls: calls2 } = fakeClient([]);
    await getSessionsAndUsersByDay("2026-04-01", "2026-04-28", c2, "All");
    expect((calls2[0] as { dimensionFilter?: unknown }).dimensionFilter)
      .toBeUndefined();
  });

  it("getSessionsAndUsersByDay adds an EXACT sessionDefaultChannelGroup filter when channel is set", async () => {
    const { client, calls } = fakeClient([]);
    await getSessionsAndUsersByDay(
      "2026-04-01",
      "2026-04-28",
      client,
      "Organic Search",
    );
    const req = calls[0] as {
      dimensionFilter?: {
        filter?: {
          fieldName: string;
          stringFilter: { matchType: string; value: string };
        };
      };
    };
    expect(req.dimensionFilter?.filter).toEqual({
      fieldName: "sessionDefaultChannelGroup",
      stringFilter: { matchType: "EXACT", value: "Organic Search" },
    });
  });

  it("getOutboundClicksToPortal merges the channel filter into the existing andGroup", async () => {
    const { client, calls } = fakeClient([
      {
        dimensionValues: [{ value: "portal.avovita.ca" }],
        metricValues: [{ value: "5" }],
      },
    ]);
    await getOutboundClicksToPortal(
      "2026-04-01",
      "2026-04-28",
      client,
      "Direct",
    );
    const req = calls[0] as {
      dimensionFilter: {
        andGroup: {
          expressions: Array<{ filter: { fieldName: string } }>;
        };
      };
    };
    const fields = req.dimensionFilter.andGroup.expressions.map(
      (x) => x.filter.fieldName,
    );
    expect(fields).toEqual([
      "eventName",
      "linkDomain",
      "sessionDefaultChannelGroup",
    ]);
  });
});

describe("getOutboundClicksToPortal", () => {
  it("sums eventCount when GA has matching click rows", async () => {
    const { client, calls } = fakeClient([
      {
        dimensionValues: [{ value: "portal.avovita.ca" }],
        metricValues: [{ value: "42" }],
      },
    ]);

    const total = await getOutboundClicksToPortal(
      "2026-04-01",
      "2026-04-28",
      client,
    );
    expect(total).toBe(42);

    // Verify the dimensionFilter pins eventName=click AND linkDomain CONTAINS portal.
    const req = calls[0] as {
      dimensionFilter: {
        andGroup: {
          expressions: Array<{
            filter: {
              fieldName: string;
              stringFilter: { matchType: string; value: string };
            };
          }>;
        };
      };
    };
    const filters = req.dimensionFilter.andGroup.expressions.map(
      (x) => x.filter,
    );
    expect(filters).toEqual([
      {
        fieldName: "eventName",
        stringFilter: { matchType: "EXACT", value: "click" },
      },
      {
        fieldName: "linkDomain",
        stringFilter: {
          matchType: "CONTAINS",
          value: "portal.avovita.ca",
        },
      },
    ]);
  });

  it("returns null when GA has no matching rows (proxy for 'not tracked')", async () => {
    const { client } = fakeClient([]);
    const total = await getOutboundClicksToPortal(
      "2026-04-01",
      "2026-04-28",
      client,
    );
    expect(total).toBeNull();
  });
});

describe("mapGAError", () => {
  it("maps gRPC UNAUTHENTICATED (16) to auth", () => {
    expect(mapGAError({ code: 16 })).toEqual({
      status: 502,
      body: {
        error: "Authentication issue — contact admin",
        code: "auth",
      },
    });
  });

  it("maps gRPC PERMISSION_DENIED (7) to auth", () => {
    expect(mapGAError({ code: 7 }).body.code).toBe("auth");
  });

  it("maps HTTP 401/403 to auth", () => {
    expect(mapGAError({ status: 401 }).body.code).toBe("auth");
    expect(mapGAError({ response: { status: 403 } }).body.code).toBe("auth");
  });

  it("maps gRPC RESOURCE_EXHAUSTED (8) and HTTP 429 to quota", () => {
    expect(mapGAError({ code: 8 }).body.code).toBe("quota");
    expect(mapGAError({ status: 429 }).body.code).toBe("quota");
  });

  it("maps generic / unknown errors to unavailable", () => {
    expect(mapGAError(new Error("boom")).body.code).toBe("unavailable");
    expect(mapGAError({ status: 503 }).body.code).toBe("unavailable");
    expect(mapGAError(null).body.code).toBe("unavailable");
  });
});

describe("resolveDateRange", () => {
  beforeEach(() => {
    /* No fake timers — assertions check shape, not exact values. */
  });

  it("yields YYYY-MM-DD strings consumable by GA4", () => {
    const r = resolveDateRange("30d");
    expect(r.startDateYMD).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(r.endDateYMD).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(r.startDate.getTime()).toBeLessThan(r.endDate.getTime());
  });

  it("custom range honours both endpoints", () => {
    const r = resolveDateRange("custom", "2026-01-01", "2026-01-31");
    expect(r.startDateYMD).toBe("2026-01-01");
    expect(r.endDateYMD).toBe("2026-01-31");
  });
});
