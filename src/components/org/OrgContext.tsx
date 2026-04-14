"use client";

import {
  createContext,
  useContext,
  useEffect,
  type ReactNode,
} from "react";
import type { Organization } from "@/types/database";

const STORAGE_KEY = "avovita-org-slug";

export type OrgBranding = Pick<
  Organization,
  "id" | "name" | "slug" | "logo_url" | "primary_color" | "accent_color"
>;

const OrgContext = createContext<OrgBranding | null>(null);

/**
 * Wraps any subtree under /org/[slug] so child components can read
 * branding (logo, colours, name). Outside an org route the value is
 * null and consumers fall back to default AvoVita styling.
 *
 * Side effect: persists the slug to localStorage on mount so the cart →
 * checkout flow can attach the org_id even when the user navigates out
 * of /org/[slug] (e.g. clicks the standalone /tests link by accident).
 * Cleared on successful checkout via clearOrgSession().
 */
export function OrgProvider({
  org,
  children,
}: {
  org: OrgBranding;
  children: ReactNode;
}) {
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY, org.slug);
    } catch {
      /* ignore */
    }
  }, [org.slug]);

  return <OrgContext.Provider value={org}>{children}</OrgContext.Provider>;
}

/** Returns the current org if rendered under /org/[slug], otherwise null. */
export function useOrg(): OrgBranding | null {
  return useContext(OrgContext);
}

/**
 * Reads the persisted org slug from localStorage. Used at checkout to
 * resolve the org_id even when the user is on a non-/org URL.
 */
export function readPersistedOrgSlug(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Clears the persisted org — call after a successful order. */
export function clearOrgSession(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
