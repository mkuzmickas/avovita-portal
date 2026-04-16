"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useCallback,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { useOrg } from "@/components/org/OrgContext";
import { createClient } from "@/lib/supabase/client";

/* ── session id (persists for the browser tab) ──────────────────────── */

function getSessionId(): string {
  if (typeof window === "undefined") return "";
  let sid = window.sessionStorage.getItem("av-analytics-sid");
  if (!sid) {
    sid = crypto.randomUUID();
    window.sessionStorage.setItem("av-analytics-sid", sid);
  }
  return sid;
}

/* ── device type from screen width ──────────────────────────────────── */

function getDeviceType(): string {
  if (typeof window === "undefined") return "desktop";
  const w = window.innerWidth;
  if (w < 768) return "mobile";
  if (w < 1024) return "tablet";
  return "desktop";
}

/* ── context ────────────────────────────────────────────────────────── */

interface AnalyticsCtx {
  trackEvent: (
    eventType: string,
    eventData?: Record<string, unknown>,
  ) => void;
}

const Ctx = createContext<AnalyticsCtx>({
  trackEvent: () => {},
});

export function useAnalytics() {
  return useContext(Ctx);
}

/* ── provider ───────────────────────────────────────────────────────── */

export function AnalyticsProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const org = useOrg();
  const orgIdRef = useRef<string | null>(org?.id ?? null);
  const accountIdRef = useRef<string | null>(null);
  const isAdminRef = useRef(false);
  const lastTrackedPath = useRef<string | null>(null);

  // Keep org ref fresh
  useEffect(() => {
    orgIdRef.current = org?.id ?? null;
  }, [org?.id]);

  // Resolve account_id and role once (lazy). If the user is an admin
  // we permanently suppress all tracking from this browser tab.
  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (cancelled || !data.user) return;
      accountIdRef.current = data.user.id;
      const { data: acc } = await supabase
        .from("accounts")
        .select("role")
        .eq("id", data.user.id)
        .single();
      if (!cancelled && acc && (acc as { role: string }).role === "admin") {
        isAdminRef.current = true;
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Track page views on path change
  useEffect(() => {
    if (!pathname) return;
    if (isAdminRef.current) return;
    // Avoid duplicate tracking of the same path (e.g. re-renders)
    if (lastTrackedPath.current === pathname) return;
    lastTrackedPath.current = pathname;

    const payload = {
      path: pathname,
      referrer: typeof document !== "undefined" ? document.referrer : "",
      session_id: getSessionId(),
      org_id: orgIdRef.current || undefined,
      account_id: accountIdRef.current || undefined,
      user_agent:
        typeof navigator !== "undefined" ? navigator.userAgent : undefined,
      device_type: getDeviceType(),
    };

    fetch("/api/analytics/pageview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {});
  }, [pathname]);

  const trackEvent = useCallback(
    (eventType: string, eventData?: Record<string, unknown>) => {
      if (isAdminRef.current) return;
      const payload = {
        event_type: eventType,
        event_data: eventData,
        path:
          typeof window !== "undefined" ? window.location.pathname : undefined,
        session_id: getSessionId(),
        org_id: orgIdRef.current || undefined,
        account_id: accountIdRef.current || undefined,
      };

      fetch("/api/analytics/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        keepalive: true,
      }).catch(() => {});
    },
    [],
  );

  return <Ctx.Provider value={{ trackEvent }}>{children}</Ctx.Provider>;
}
