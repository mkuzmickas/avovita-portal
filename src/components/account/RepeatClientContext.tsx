"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Client-side wrapper for repeat-client discount eligibility.
 *
 * Fetches /api/account/repeat-client-status once on mount, and again
 * whenever Supabase auth state changes (sign-in, sign-out, another
 * tab). Everywhere in the UI that decides whether to show the multi-
 * test discount reads through useRepeatClient() so the answer is
 * consistent across the CartBar, checkout summaries, and the Step 4
 * review pane.
 *
 * Defaults to { eligible: false, loggedIn: false } — safe default,
 * so we never advertise a discount to a guest while eligibility is
 * still resolving. The Stripe checkout routes re-check server-side;
 * this context is display-only.
 */

interface RepeatClientState {
  eligible: boolean;
  loggedIn: boolean;
  loading: boolean;
}

const RepeatClientContext = createContext<RepeatClientState>({
  eligible: false,
  loggedIn: false,
  loading: true,
});

export function RepeatClientProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [state, setState] = useState<RepeatClientState>({
    eligible: false,
    loggedIn: false,
    loading: true,
  });

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const res = await fetch("/api/account/repeat-client-status", {
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`status ${res.status}`);
        const data = await res.json();
        if (cancelled) return;
        setState({
          eligible: !!data.eligible,
          loggedIn: !!data.loggedIn,
          loading: false,
        });
      } catch {
        if (cancelled) return;
        setState({ eligible: false, loggedIn: false, loading: false });
      }
    };
    refresh();

    const supabase = createClient();
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      refresh();
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo(() => state, [state]);
  return (
    <RepeatClientContext.Provider value={value}>
      {children}
    </RepeatClientContext.Provider>
  );
}

export function useRepeatClient(): RepeatClientState {
  return useContext(RepeatClientContext);
}
