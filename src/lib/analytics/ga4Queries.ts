import "server-only";

import type { protos } from "@google-analytics/data";
import type { BetaAnalyticsDataClient } from "@google-analytics/data";

import { getGA4Client, getGA4PropertyId } from "./ga4Client";

type RunReportResponse = protos.google.analytics.data.v1beta.IRunReportResponse;

export interface SessionsByDayPoint {
  date: string; // YYYY-MM-DD
  sessions: number;
  users: number;
  newUsers: number;
}

export interface AcquisitionChannelRow {
  channel: string;
  sessions: number;
  users: number;
}

export interface LandingPageRow {
  pagePath: string;
  sessions: number;
  bounceRate: number; // 0..1
  engagementRate: number; // 0..1
}

export interface DeviceRow {
  deviceCategory: string;
  sessions: number;
  users: number;
}

function num(s: string | null | undefined): number {
  if (!s) return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function dimVal(
  row: protos.google.analytics.data.v1beta.IRow | null | undefined,
  i: number,
): string {
  return row?.dimensionValues?.[i]?.value ?? "";
}

function metVal(
  row: protos.google.analytics.data.v1beta.IRow | null | undefined,
  i: number,
): string {
  return row?.metricValues?.[i]?.value ?? "0";
}

/** YYYYMMDD → YYYY-MM-DD. */
function fmtGA4Date(yyyymmdd: string): string {
  if (yyyymmdd.length !== 8) return yyyymmdd;
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}

function clientOrDefault(c?: BetaAnalyticsDataClient): BetaAnalyticsDataClient {
  return c ?? getGA4Client();
}

function propertyName(): string {
  return `properties/${getGA4PropertyId()}`;
}

/**
 * Wraps an existing dimension filter (or returns a fresh one) plus an extra
 * exact-match expression on `sessionDefaultChannelGroup`. Used by the
 * unified-funnel channel slicer.
 */
function withChannelFilter(
  channel: string | undefined,
  base?: protos.google.analytics.data.v1beta.IFilterExpression,
): protos.google.analytics.data.v1beta.IFilterExpression | undefined {
  if (!channel || channel === "All") return base;
  const channelExpr: protos.google.analytics.data.v1beta.IFilterExpression = {
    filter: {
      fieldName: "sessionDefaultChannelGroup",
      stringFilter: { matchType: "EXACT", value: channel },
    },
  };
  if (!base) return channelExpr;
  // Merge: if base already uses andGroup, append; else wrap both in andGroup.
  if (base.andGroup?.expressions) {
    return {
      andGroup: {
        expressions: [...base.andGroup.expressions, channelExpr],
      },
    };
  }
  return { andGroup: { expressions: [base, channelExpr] } };
}

export async function getSessionsAndUsersByDay(
  startDate: string,
  endDate: string,
  client?: BetaAnalyticsDataClient,
  channel?: string,
): Promise<SessionsByDayPoint[]> {
  const [resp] = (await clientOrDefault(client).runReport({
    property: propertyName(),
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: "date" }],
    metrics: [
      { name: "sessions" },
      { name: "totalUsers" },
      { name: "newUsers" },
    ],
    orderBys: [{ dimension: { dimensionName: "date" } }],
    dimensionFilter: withChannelFilter(channel),
  })) as [RunReportResponse, unknown, unknown];

  return (resp.rows ?? []).map((r) => ({
    date: fmtGA4Date(dimVal(r, 0)),
    sessions: num(metVal(r, 0)),
    users: num(metVal(r, 1)),
    newUsers: num(metVal(r, 2)),
  }));
}

export async function getAcquisitionChannels(
  startDate: string,
  endDate: string,
  client?: BetaAnalyticsDataClient,
): Promise<AcquisitionChannelRow[]> {
  const [resp] = (await clientOrDefault(client).runReport({
    property: propertyName(),
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: "sessionDefaultChannelGroup" }],
    metrics: [{ name: "sessions" }, { name: "totalUsers" }],
    orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
    limit: 25,
  })) as [RunReportResponse, unknown, unknown];

  return (resp.rows ?? []).map((r) => ({
    channel: dimVal(r, 0) || "(unknown)",
    sessions: num(metVal(r, 0)),
    users: num(metVal(r, 1)),
  }));
}

export async function getTopLandingPages(
  startDate: string,
  endDate: string,
  limit = 10,
  client?: BetaAnalyticsDataClient,
): Promise<LandingPageRow[]> {
  const [resp] = (await clientOrDefault(client).runReport({
    property: propertyName(),
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: "landingPage" }],
    metrics: [
      { name: "sessions" },
      { name: "bounceRate" },
      { name: "engagementRate" },
    ],
    orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
    limit,
  })) as [RunReportResponse, unknown, unknown];

  return (resp.rows ?? []).map((r) => ({
    pagePath: dimVal(r, 0) || "(not set)",
    sessions: num(metVal(r, 0)),
    bounceRate: num(metVal(r, 1)),
    engagementRate: num(metVal(r, 2)),
  }));
}

export async function getDeviceBreakdown(
  startDate: string,
  endDate: string,
  client?: BetaAnalyticsDataClient,
): Promise<DeviceRow[]> {
  const [resp] = (await clientOrDefault(client).runReport({
    property: propertyName(),
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: "deviceCategory" }],
    metrics: [{ name: "sessions" }, { name: "totalUsers" }],
    orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
  })) as [RunReportResponse, unknown, unknown];

  return (resp.rows ?? []).map((r) => ({
    deviceCategory: dimVal(r, 0) || "unknown",
    sessions: num(metVal(r, 0)),
    users: num(metVal(r, 1)),
  }));
}

/**
 * Counts outbound `click` events to portal.avovita.ca. GA4's enhanced
 * measurement emits a `click` event with a `link_domain` parameter for
 * outbound links. Returns null if the click event isn't being captured
 * for the requested range — UI shows "Not tracked".
 */
export async function getOutboundClicksToPortal(
  startDate: string,
  endDate: string,
  client?: BetaAnalyticsDataClient,
  channel?: string,
): Promise<number | null> {
  const baseFilter: protos.google.analytics.data.v1beta.IFilterExpression = {
    andGroup: {
      expressions: [
        {
          filter: {
            fieldName: "eventName",
            stringFilter: { matchType: "EXACT", value: "click" },
          },
        },
        {
          filter: {
            fieldName: "linkDomain",
            stringFilter: {
              matchType: "CONTAINS",
              value: "portal.avovita.ca",
            },
          },
        },
      ],
    },
  };

  const [resp] = (await clientOrDefault(client).runReport({
    property: propertyName(),
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: "linkDomain" }],
    metrics: [{ name: "eventCount" }],
    dimensionFilter: withChannelFilter(channel, baseFilter),
  })) as [RunReportResponse, unknown, unknown];

  const rows = resp.rows ?? [];
  if (rows.length === 0) return null;

  let total = 0;
  for (const r of rows) total += num(metVal(r, 0));
  return total;
}
