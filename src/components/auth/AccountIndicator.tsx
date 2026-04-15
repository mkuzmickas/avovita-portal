"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { User, ChevronDown, LogOut, LayoutDashboard } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

/**
 * Small header-right element that shows the current auth state:
 * - Logged out: a plain "Sign In" link.
 * - Logged in:  a muted-gold user chip with first-name or email local-part,
 *   opening a dropdown with "My Portal" and "Sign Out".
 *
 * Pure client component — reads the session on mount and subscribes to
 * auth state changes so it stays in sync after login/logout in another
 * tab.
 */
export function AccountIndicator() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
    const supabase = createClient();

    const loadProfile = async (userEmail: string, userId: string) => {
      setEmail(userEmail);
      // Best-effort first-name fetch from the primary profile. Falls
      // back to the email local-part.
      const { data } = await supabase
        .from("patient_profiles")
        .select("first_name")
        .eq("account_id", userId)
        .eq("is_primary", true)
        .maybeSingle();
      const first = (data as { first_name: string } | null)?.first_name;
      setDisplayName(first ?? userEmail.split("@")[0] ?? userEmail);
    };

    supabase.auth.getUser().then(({ data }) => {
      if (data.user?.email) {
        loadProfile(data.user.email, data.user.id);
      } else {
        setEmail(null);
        setDisplayName(null);
      }
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      if (session?.user?.email) {
        loadProfile(session.user.email, session.user.id);
      } else {
        setEmail(null);
        setDisplayName(null);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Click-outside to close the dropdown
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    setOpen(false);
    router.push("/login");
    router.refresh();
  };

  // Reserve space on the server render so the header doesn't reflow once
  // the client mounts and resolves auth state.
  if (!mounted) {
    return <span className="inline-block w-[72px]" aria-hidden />;
  }

  if (!email) {
    return (
      <Link
        href="/login"
        className="text-sm font-medium whitespace-nowrap"
        style={{ color: "#c4973a" }}
      >
        Sign In
      </Link>
    );
  }

  return (
    <div ref={dropdownRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-xs sm:text-sm font-medium max-w-[180px]"
        style={{ color: "#c4973a" }}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <User className="w-4 h-4 shrink-0" />
        <span className="truncate">{displayName ?? email}</span>
        <ChevronDown
          className="w-3.5 h-3.5 shrink-0 transition-transform"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-2 min-w-[180px] rounded-lg border shadow-lg z-50 overflow-hidden"
          style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
        >
          <Link
            href="/portal"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-3 py-2 text-sm"
            style={{ color: "#e8d5a3" }}
            role="menuitem"
          >
            <LayoutDashboard
              className="w-4 h-4 shrink-0"
              style={{ color: "#8dc63f" }}
            />
            My Portal
          </Link>
          <button
            type="button"
            onClick={handleSignOut}
            className="flex items-center gap-2 px-3 py-2 text-sm w-full text-left border-t"
            style={{ color: "#e8d5a3", borderColor: "#2d6b35" }}
            role="menuitem"
          >
            <LogOut
              className="w-4 h-4 shrink-0"
              style={{ color: "#c4973a" }}
            />
            Sign Out
          </button>
        </div>
      )}
    </div>
  );
}
