"use client";

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  Check,
  X,
  Info,
  Search,
  Mic,
  MicOff,
  ArrowRight,
  ArrowUpRight,
  FlaskConical,
  Sparkles,
} from "lucide-react";
import { OrgAwareHeader } from "@/components/org/OrgAwareHeader";
import { TestCard } from "./TestCard";
import { TestTable } from "./TestTable";
import { SearchBar } from "./SearchBar";
import { CartBar } from "./CartBar";
import { InsightsChatModal } from "./InsightsChatModal";
import { AskPromptLauncher } from "./AskPromptLauncher";
import { useCart } from "@/components/cart/CartContext";
import { useAnalytics } from "@/lib/analytics/useAnalytics";
import type { CatalogueTest, CatalogueCartItem } from "./types";

// Shortcut tiles under the hero search. Clicking one fills the search
// query with the label text, which filters the catalogue table below
// via the shared searchQuery state. Chosen to match the four most
// common first-timer intents.
const POPULAR_TILES: Array<{ label: string; query: string }> = [
  { label: "Vitamin D", query: "vitamin d" },
  { label: "Hormones", query: "hormone" },
  { label: "Thyroid", query: "thyroid" },
  { label: "Allergy & Immune", query: "allergy" },
];

// New Oct 2026 palette (ivory-first "lighter premium healthcare"):
//   Forest Green  #092819  header / footer / premium brand sections
//   Warm Ivory    #F7F6F0  primary page background
//   White         #FFFFFF  search fields, cards, test listings
//   Deep Green    #154D31  primary buttons, important actions
//   Muted Gold    #C6A04B  small accents, dividers, highlights
//   Avocado Lime  #88D45D  brand highlights, icons, selected states
// Only the hero region on /tests uses this palette today; rest of the
// portal still runs the old dark forest. Full migration is a separate
// larger piece of work gated on sign-off of this preview.
const C = {
  forest: "#092819",
  ivory: "#F7F6F0",
  white: "#FFFFFF",
  deepGreen: "#154D31",
  gold: "#C6A04B",
  lime: "#88D45D",
  textMuted: "rgba(9, 40, 25, 0.6)",
  border: "#E5E2D4",
};

interface CatalogueClientProps {
  featuredTests: CatalogueTest[];
  panelTests: CatalogueTest[];
  allTests: CatalogueTest[];
  categories: string[];
  labs: string[];
  isLoggedIn: boolean;
}

export function CatalogueClient({
  featuredTests,
  panelTests,
  allTests,
  categories,
  labs,
  isLoggedIn,
}: CatalogueClientProps) {
  const router = useRouter();
  const { cart, totals, addItem, hydrated } = useCart();
  const { trackEvent } = useAnalytics();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedLab, setSelectedLab] = useState<string | null>(null);
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null);
  const [highlightedTestId, setHighlightedTestId] = useState<string | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [notFoundBanner, setNotFoundBanner] = useState<string | null>(null);
  const [askPromptOpen, setAskPromptOpen] = useState(false);
  const [askPromptTestName, setAskPromptTestName] = useState<string | null>(null);
  // Ref on the Full Test Catalogue section so the hero search can
  // scroll filtered results into view as the user types.
  const catalogueRef = useRef<HTMLElement | null>(null);

  // Hero input state — a single prominent input at the top of /tests
  // that routes every query through the AI chat. Mobile-first:
  // elderly / non-technical users don't want to toggle between
  // "search" and "AI" modes, so there's one entry point. Pressing
  // Enter or the "Ask" button opens the chat modal and auto-sends
  // the query as the first message (via initialQuery on the modal).
  const [heroQuery, setHeroQuery] = useState("");
  const [pendingAiQuery, setPendingAiQuery] = useState<string | null>(null);

  // Voice dictation via the Web Speech API (Chrome/Edge/Safari —
  // webkit-prefixed on iOS Safari). Appends recognised speech into
  // the hero input so the user can edit before submitting.
  const [listening, setListening] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(true);
  type SpeechRecognitionInstance = {
    lang: string;
    continuous: boolean;
    interimResults: boolean;
    start: () => void;
    stop: () => void;
    onresult: ((e: unknown) => void) | null;
    onend: (() => void) | null;
    onerror: (() => void) | null;
  };
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionInstance;
      webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
    };
    if (!w.SpeechRecognition && !w.webkitSpeechRecognition) {
      setVoiceSupported(false);
    }
  }, []);

  const toggleVoice = () => {
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionInstance;
      webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
    };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) return;
    const r = new Ctor();
    r.lang = "en-US";
    r.continuous = false;
    r.interimResults = true;
    r.onresult = (e) => {
      const results = (e as { results: ArrayLike<ArrayLike<{ transcript: string }>> })
        .results;
      let transcript = "";
      for (let i = 0; i < results.length; i++) {
        transcript += results[i][0].transcript;
      }
      setHeroQuery(transcript);
    };
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    recognitionRef.current = r;
    setListening(true);
    try {
      r.start();
    } catch {
      setListening(false);
    }
  };

  const submitHeroQuery = () => {
    const q = heroQuery.trim();
    if (!q) return;
    recognitionRef.current?.stop();
    setListening(false);
    setPendingAiQuery(q);
    setAiOpen(true);
  };

  const handleAdd = (item: CatalogueCartItem) => {
    addItem({ ...item, line_type: "test" });
  };

  const toggleExpanded = useCallback((testId: string) => {
    setExpandedCardId((prev) => (prev === testId ? null : testId));
  }, []);

  const scrollToTest = useCallback((testId: string) => {
    setExpandedCardId(testId);
    requestAnimationFrame(() => {
      const el = document.getElementById(`test-${testId}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    });
  }, []);

  // Deep-link support: /tests?category=<exact label> pre-selects the
  // matching filter. Keyed on `categories` so the effect re-fires
  // once the server-rendered list has populated — fixes the case
  // where the initial render had an empty categories array.
  // Diagnostic: trace every selectedCategory state transition so we
  // can see in DevTools whether the URL-param effect is being overridden.
  useEffect(() => {
    console.log("[catalogue] selectedCategory changed:", selectedCategory);
  }, [selectedCategory]);

  const searchParams = useSearchParams();
  useEffect(() => {
    if (categories.length === 0) return;
    const rawCat = searchParams.get("category")?.trim();
    console.log("[catalogue] ?category= param:", rawCat);
    if (!rawCat) return;
    const lower = rawCat.toLowerCase();
    const match =
      categories.find((c) => c.toLowerCase() === lower) ??
      categories.find((c) => c.toLowerCase().startsWith(lower)) ??
      categories.find((c) => c.toLowerCase().includes(lower));
    console.log(
      `[catalogue] category match: ${match ?? "none"} (from ${categories.length} options)`
    );
    if (match) setSelectedCategory(match.trim());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories]);

  // Deep-link support: /tests?test=SKU or /tests?id=UUID scrolls to
  // the matching row in the CATALOGUE LIST (not panel cards above it),
  // expands it, and applies a persistent gold highlight.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const skuParam = params.get("test")?.trim().toLowerCase();
    const idParam = params.get("id")?.trim();
    let match: CatalogueTest | undefined;
    if (skuParam) {
      match = allTests.find((t) => t.sku?.toLowerCase() === skuParam);
    }
    if (!match && idParam) {
      match = allTests.find((t) => t.id === idParam);
    }
    if (!match) return;
    const target = match;
    setExpandedCardId(target.id);
    setHighlightedTestId(target.id);
    // Scope scroll to the catalogue list container so panel cards
    // above it are skipped. Wait for the expanded row to render.
    const timer = setTimeout(() => {
      const container = document.getElementById("catalogue-list");
      const el = container?.querySelector(`[data-testid="test-${target.id}"]`) as HTMLElement | null;
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 150);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // â”€â”€â”€ Cart handoff from Ask AvoVita (and any other src) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Contract: /tests?add=SKU1,SKU2&src=ask
  //   - Match each SKU on tests.sku (case-insensitive, trimmed both
  //     sides — one legacy row has a trailing space in its SKU).
  //   - Skip quote-only tests (price_cad === null).
  //   - Add each match to the cart in the given order via the normal
  //     addItem() path, so Tuesday-only tests still trigger the
  //     schedule-acknowledgement modal.
  //   - Fallback for schedule-constrained tests: stay on /tests so
  //     the ack modal is visible in context. Otherwise redirect to
  //     /checkout so the customer lands ready to pay.
  //   - Zero matches â†’ quiet "we couldn't find those tests" banner
  //     (an assistant that hallucinates a code should cost the
  //     customer nothing).
  //   - Strip the query params via router.replace so a refresh or a
  //     shared link doesn't add the same tests twice.
  //   - `src` is written to localStorage under 'avovita-order-src' so
  //     the checkout flow can plumb it through onto orders.src for
  //     attribution analytics.
  // URL handoff shares a ref with the post-add launcher so a batch of
  // ?add= adds doesn't trigger the "want suggestions?" nudge — that
  // arrival already means the customer's intent was formed elsewhere
  // (the Ask AvoVita widget on the marketing site, an SMS link, etc.).
  const handoffAdding = useRef(false);
  const handoffProcessed = useRef(false);
  useEffect(() => {
    if (!hydrated || handoffProcessed.current) return;
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const addParam = params.get("add");
    const srcParam = params.get("src");
    if (!addParam) return;
    handoffProcessed.current = true;

    if (srcParam) {
      try {
        window.localStorage.setItem(
          "avovita-order-src",
          srcParam.trim().slice(0, 32),
        );
      } catch {
        /* ignore */
      }
    }

    const rawSkus = addParam
      .split(",")
      .map((s) => {
        try {
          return decodeURIComponent(s);
        } catch {
          return s;
        }
      })
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    // Build a lookup once — normalise both sides (uppercase, trim).
    // Some catalogue rows carry a stray trailing space (ALBR ), so a
    // simple .toUpperCase() on both sides isn't enough on its own.
    const skuIndex = new Map<string, CatalogueTest>();
    for (const t of allTests) {
      if (!t.sku) continue;
      const key = t.sku.trim().toUpperCase();
      if (key.length > 0) skuIndex.set(key, t);
    }

    const matches: CatalogueTest[] = [];
    for (const sku of rawSkus) {
      const key = sku.trim().toUpperCase();
      const hit = skuIndex.get(key);
      if (hit && hit.price_cad != null) matches.push(hit);
    }

    // Strip the query params either way — a refresh must not re-add.
    router.replace("/tests", { scroll: false });

    if (matches.length === 0) {
      setNotFoundBanner(
        "We couldn't find those tests — here's the full catalogue.",
      );
      return;
    }

    const hasConstrainedTest = matches.some(
      (t) =>
        t.sku === "DCTR" ||
        t.sku === "KS" ||
        t.id === "8e46bec5-526c-42be-909c-447235e9ecd0",
    );

    handoffAdding.current = true;
    for (const t of matches) {
      addItem({
        line_type: "test" as const,
        test_id: t.id,
        test_name: t.name,
        sku: t.sku,
        price_cad: t.price_cad as number,
        lab_name: t.lab.name,
        quantity: 1,
        collection_method: t.collection_method,
      });
    }
    // Release the guard after the trailing microtask so the launcher's
    // cart-size-change effect sees the flag while it processes this
    // burst of adds.
    queueMicrotask(() => {
      handoffAdding.current = false;
    });

    // If none of the incoming SKUs trigger the schedule-ack modal,
    // send the customer straight to checkout. Otherwise stay on
    // /tests so the modal renders in familiar context.
    if (!hasConstrainedTest) {
      const t = setTimeout(() => router.push("/checkout"), 150);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  // â”€â”€â”€ Post-add Ask AvoVita nudge â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Fires when the customer adds a test on /tests. The visit fee is
  // the most likely cause of the 81% checkout drop-off, and once one
  // test is in the cart it's a sunk cost — a second test on the same
  // appointment costs only the test price. Telling the customer that
  // at the exact moment of the first add turns the biggest surprise
  // in the funnel into an argument for a second test, where nearly
  // all the marginal margin is.
  //
  // Trigger rules (all must be true):
  //   - test count strictly increased
  //   - test count BEFORE the add was < 2 (i.e. 0 â†’ 1 or 1 â†’ 2 —
  //     someone already at 2+ tests has understood the model)
  //   - not a ?add= URL handoff (their intent was already formed
  //     elsewhere)
  //   - hasn't already fired this browser session
  //   - hasn't been dismissed this session (sessionStorage sticks)
  //
  // Once dismissed we set BOTH refs so a mid-session refresh of the
  // page doesn't re-arm the prompt — the sessionStorage flag survives
  // the refresh and the effect skips on cart mount.
  const prevTestCountRef = useRef<number | null>(null);
  const askPromptFiredRef = useRef(false);
  const ASK_DISMISSED_KEY = "avovita-ask-prompt-dismissed";
  useEffect(() => {
    if (!hydrated) return;
    const testCount = totals.testItems.length;
    const prev = prevTestCountRef.current;
    prevTestCountRef.current = testCount;
    // First run after hydration primes the ref without triggering —
    // whatever was in the cart from a previous session isn't a fresh
    // add.
    if (prev === null) return;
    if (testCount <= prev) return; // removal or no change
    if (handoffAdding.current) return; // URL handoff burst
    if (askPromptFiredRef.current) return; // already this session
    if (prev >= 2) return; // customer already understands the model
    try {
      if (
        typeof window !== "undefined" &&
        window.sessionStorage.getItem(ASK_DISMISSED_KEY) === "1"
      ) {
        askPromptFiredRef.current = true;
        return;
      }
    } catch {
      /* sessionStorage disabled — no persistence, that's fine */
    }
    const newestTest = totals.testItems[totals.testItems.length - 1];
    setAskPromptTestName(newestTest?.test_name ?? null);
    setAskPromptOpen(true);
    askPromptFiredRef.current = true;
    trackEvent("ask_prompt_shown", {
      test_name: newestTest?.test_name ?? null,
      test_count_after: testCount,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, totals.testItems.length]);

  const handleAskPromptAccept = useCallback(() => {
    setAskPromptOpen(false);
    setAiOpen(true);
    trackEvent("ask_prompt_accepted", {
      test_name: askPromptTestName,
    });
  }, [trackEvent, askPromptTestName]);

  const handleAskPromptDismiss = useCallback(() => {
    setAskPromptOpen(false);
    try {
      window.sessionStorage.setItem(ASK_DISMISSED_KEY, "1");
    } catch {
      /* ignore */
    }
    trackEvent("ask_prompt_dismissed", {
      test_name: askPromptTestName,
    });
  }, [trackEvent, askPromptTestName]);

  // Dev-only sanity log so we can verify in browser devtools that data is
  // actually flowing through to TestTable. Stripped from production builds.
  useEffect(() => {
    if (process.env.NODE_ENV === "development") {
      // eslint-disable-next-line no-console
      console.log("[catalogue] data on mount", {
        featuredTests: featuredTests.length,
        allTests: allTests.length,
        categories: categories.length,
        labs: labs.length,
      });
    }
  }, [featuredTests.length, allTests.length, categories.length, labs.length]);

  const filteredTests = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    console.log(
      "[catalogue] filter run — selectedCategory:",
      JSON.stringify(selectedCategory),
      "selectedLab:",
      JSON.stringify(selectedLab),
      "searchQuery:",
      JSON.stringify(query)
    );
    let logged = 0;
    let dumpedCharCodes = false;

    // Match tier per result so description-only matches rank below
    // name / sku / category matches. Tier 1 = primary field hit,
    // tier 2 = description-only hit. Computed once here and used by
    // the sort below so filter + sort stay in a single pass.
    type Scored = { test: (typeof allTests)[number]; tier: number };

    const scored: Scored[] = [];
    for (const test of allTests) {
      // One-shot: dump char codes the first time we see an Allergy test
      // while the URL param is active so any hidden bytes are visible.
      if (
        selectedCategory &&
        test.category &&
        test.category.toLowerCase().startsWith("allergy") &&
        !dumpedCharCodes
      ) {
        console.log(
          "[catalogue] char codes:",
          [...selectedCategory].map((c) => c.charCodeAt(0)),
          [...test.category].map((c) => c.charCodeAt(0))
        );
        dumpedCharCodes = true;
      }
      if (logged < 5) {
        console.log(
          `[catalogue] test #${logged} name=${JSON.stringify(test.name)} ` +
            `test.category=${JSON.stringify(test.category)} ` +
            `selectedCategory=${JSON.stringify(selectedCategory)} ` +
            `equal=${test.category === selectedCategory} ` +
            `lengths=${test.category?.length ?? 0}/${selectedCategory?.length ?? 0}`
        );
        logged += 1;
      }

      const matchesCategory =
        selectedCategory === null ||
        (test.category !== null &&
          test.category.trim() === selectedCategory.trim());
      const matchesLab = selectedLab === null || test.lab.name === selectedLab;
      if (!matchesCategory || !matchesLab) continue;

      if (query === "") {
        scored.push({ test, tier: 1 });
        continue;
      }

      // Tier 1: name / sku / category hit — existing behaviour.
      const primary =
        test.name.toLowerCase().includes(query) ||
        (test.sku !== null && test.sku.toLowerCase().includes(query)) ||
        (test.category !== null && test.category.toLowerCase().includes(query));
      if (primary) {
        scored.push({ test, tier: 1 });
        continue;
      }
      // Tier 2: description-only hit — new this pass. Catches tests
      // like Cytokine Panel 13 when a customer searches "interleukin"
      // but the term only appears in the long description.
      if (
        test.description !== null &&
        test.description.toLowerCase().includes(query)
      ) {
        scored.push({ test, tier: 2 });
      }
    }

    // Order when a query is active:
    //   1. search_priority DESC — admin-boosted rows always jump the
    //      queue. A bundle at priority 100 whose description contains
    //      the searched term must beat individual tests at priority 0
    //      whose names contain the term, otherwise the bundle upsell
    //      never gets a chance (Fatigue Bundle vs individual Vitamin D
    //      rows was the case that surfaced this).
    //   2. tier ASC as tiebreaker — for the ~445 rows that never got a
    //      priority set (default 0), the old "name/sku hit beats
    //      description-only hit" ordering still applies.
    //   3. Stable sort preserves alphabetical for same-priority same-tier.
    // Browse / no-query lists stay in the alphabetical order Supabase
    // returned — priority is a search-ranking signal, not a browse one.
    const hasQuery = query !== "";
    scored.sort((a, b) => {
      if (hasQuery) {
        const pDiff =
          (b.test.search_priority ?? 0) - (a.test.search_priority ?? 0);
        if (pDiff !== 0) return pDiff;
      }
      if (a.tier !== b.tier) return a.tier - b.tier;
      return 0;
    });
    return scored.map((s) => s.test);
  }, [allTests, searchQuery, selectedCategory, selectedLab]);

  const hasFiltersActive =
    searchQuery.trim() !== "" || selectedCategory !== null || selectedLab !== null;

  const clearFilters = () => {
    setSearchQuery("");
    setSelectedCategory(null);
    setSelectedLab(null);
  };

  return (
    <div className="min-h-screen pb-32" style={{ backgroundColor: "#F7F6F0" }}>
      {/* Top nav — auto-swaps to org branding when wrapped in OrgProvider */}
      {/* AccountIndicator inside OrgAwareHeader handles Sign In / account
          dropdown for both logged-in and logged-out visitors. */}
      <OrgAwareHeader />

      {/* Quiet "we couldn't match those SKUs" banner surfaced only
          after an /tests?add=... handoff produced zero matches. See
          the URL-add effect above. */}
      {notFoundBanner && (
        <div
          className="max-w-7xl mx-auto px-4 sm:px-6 pt-6"
          role="status"
          aria-live="polite"
        >
          <div
            className="flex items-start gap-2.5 rounded-lg border px-4 py-3"
            style={{
              backgroundColor: "#FFFFFF",
              borderColor: "#C6A04B",
              color: "#154D31",
            }}
          >
            <Info
              className="w-4 h-4 shrink-0 mt-0.5"
              style={{ color: "#C6A04B" }}
            />
            <p className="text-sm flex-1">{notFoundBanner}</p>
            <button
              type="button"
              onClick={() => setNotFoundBanner(null)}
              className="p-0.5"
              style={{ color: "#C6A04B" }}
              aria-label="Dismiss"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Hero region — new Oct 2026 ivory palette.
       *   Full-width ivory band so the lighter aesthetic reads cleanly
       *   on mobile. The forest-green nav above and the dark catalogue
       *   section below act as the "25% green" from the palette ratio.
       *   Rest of the portal still runs the old dark palette; full
       *   migration pending Mike's sign-off on this preview.
       */}
      <div
        className="w-full"
        style={{ backgroundColor: C.ivory }}
      >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-8 pb-8">
        <h1
          className="font-heading text-3xl md:text-4xl font-semibold mb-2"
          style={{
            color: C.forest,
            fontFamily: '"Cormorant Garamond", Georgia, serif',
            lineHeight: 1.1,
          }}
        >
          Your health.{" "}
          <span style={{ color: C.deepGreen }}>Your answers.</span>
        </h1>
        <p
          className="mb-6"
          style={{ color: C.textMuted, fontSize: "14px" }}
        >
          Specialized blood testing, delivered to your door in Calgary.
        </p>

        {/* â”€â”€â”€ Clean hero card â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
            Oct 2026 redesign (Mike, GPT mockup reference): minimal
            chrome, one obvious action. "What test are you looking
            for?" + search input that filters the catalogue table
            below as the user types. "Browse All Tests" scrolls to
            the table. "Not sure? Ask AvoVita AI" link opens the chat
            as a secondary / fallback path for people who can't name
            what they want. */}
        <div
          className="rounded-xl border p-5 shadow-sm"
          style={{
            backgroundColor: C.white,
            borderColor: C.border,
          }}
        >
          <label
            htmlFor="hero-ai-input"
            className="block mb-3"
            style={{
              color: C.forest,
              fontSize: "15px",
              fontWeight: 600,
            }}
          >
            What test are you looking for?
          </label>
          <div className="relative mb-4">
            <Search
              className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 pointer-events-none"
              style={{ color: C.textMuted }}
            />
            <input
              id="hero-ai-input"
              type="text"
              value={heroQuery}
              onChange={(e) => {
                const next = e.target.value;
                const wasEmpty = searchQuery.trim().length === 0;
                const nowFilled = next.trim().length > 0;
                setHeroQuery(next);
                setSearchQuery(next);
                if (wasEmpty && nowFilled && catalogueRef.current) {
                  catalogueRef.current.scrollIntoView({
                    behavior: "smooth",
                    block: "start",
                  });
                  requestAnimationFrame(() => {
                    const bottom = document.getElementById(
                      "catalogue-search-input",
                    );
                    if (bottom instanceof HTMLInputElement) {
                      bottom.focus();
                      const len = bottom.value.length;
                      bottom.setSelectionRange(len, len);
                    }
                  });
                }
              }}
              placeholder={`Search ${allTests.length} lab tests…`}
              className="w-full rounded-xl border py-3.5 pl-12 pr-4 focus:outline-none"
              style={{
                backgroundColor: C.ivory,
                borderColor: C.border,
                color: C.forest,
                fontSize: "16px",
              }}
              aria-label="Search lab tests"
            />
          </div>
          <button
            type="button"
            onClick={() => {
              catalogueRef.current?.scrollIntoView({
                behavior: "smooth",
                block: "start",
              });
            }}
            className="w-full inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-lg font-semibold transition-colors"
            style={{
              backgroundColor: C.deepGreen,
              color: C.white,
              fontSize: "15px",
            }}
          >
            Browse All Tests
            <ArrowRight className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={() => setAiOpen(true)}
            className="mt-3 w-full inline-flex items-center justify-center gap-2 text-sm"
            style={{ color: C.deepGreen, fontWeight: 500 }}
          >
            <Sparkles className="w-4 h-4" style={{ color: C.gold }} />
            Not sure? Ask AvoVita AI
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        {/* â”€â”€â”€ Popular tests grid â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
            Four category shortcuts. Taps set the search query to the
            tile's label; the catalogue filters live and the page
            scrolls down to show results. Chosen for first-time
            visitors who have a vague idea ("something about my
            hormones") but can't name a specific test. */}
        <div
          className="mt-6"
          aria-label="Popular test categories"
        >
          <p
            className="mb-3 font-semibold"
            style={{ color: C.forest, fontSize: "14px" }}
          >
            Popular tests
          </p>
          <div className="grid grid-cols-2 gap-3">
            {POPULAR_TILES.map((t) => (
              <button
                key={t.label}
                type="button"
                onClick={() => {
                  setHeroQuery(t.query);
                  setSearchQuery(t.query);
                  if (catalogueRef.current) {
                    catalogueRef.current.scrollIntoView({
                      behavior: "smooth",
                      block: "start",
                    });
                  }
                }}
                className="text-left rounded-xl border px-4 py-4 transition-colors shadow-sm"
                style={{
                  backgroundColor: C.white,
                  borderColor: C.border,
                }}
              >
                <div
                  className="rounded-lg inline-flex items-center justify-center mb-2"
                  style={{
                    backgroundColor: "rgba(136,212,93,0.18)",
                    width: 36,
                    height: 36,
                  }}
                >
                  <FlaskConical
                    className="w-4 h-4"
                    style={{ color: C.deepGreen }}
                  />
                </div>
                <p
                  style={{ color: C.forest, fontSize: "14px", fontWeight: 600 }}
                >
                  {t.label}
                </p>
                <ArrowUpRight
                  className="w-3.5 h-3.5 mt-1"
                  style={{ color: C.textMuted }}
                />
              </button>
            ))}
          </div>
        </div>
      </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 space-y-12 mt-10">
        {/* â”€â”€â”€ Full catalogue â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <section ref={catalogueRef} id="full-catalogue">
          <SectionHeading title="Full Test Catalogue" />

          <p style={{ color: "#154D31", fontSize: "13px" }}>
            Choose from our {allTests.length} test catalogue.
          </p>
          <p style={{ color: "#154D31", fontSize: "13px" }}>
            Tests without pricing —{" "}
            <a
              href="mailto:support@avovita.ca"
              className="no-underline hover:underline"
              style={{ color: "#C6A04B" }}
            >
              contact us
            </a>{" "}
            to request a quote.
          </p>
          <p
            className="mb-5"
            style={{ color: "#154D31", fontSize: "13px" }}
          >
            Don&apos;t see the test you&apos;re looking for? We have access to thousands of Mayo Clinic tests not listed here —{" "}
            <a
              href="mailto:support@avovita.ca"
              className="no-underline hover:underline"
              style={{ color: "#C6A04B" }}
            >
              contact us
            </a>{" "}
            and we&apos;ll get it added.
          </p>

          {/* Filter row — search only. The category + lab dropdowns
              were removed Oct 2026 (Mike): nobody filters by "Allergy
              & Sensitivity", they just type "food allergies" or
              "dog dander" into the search. Keeping fewer controls on
              the primary surface. categories + labs props still flow
              in so clearFilters stays correct if we add filters back
              later via admin surfaces. */}
          <div className="mb-6">
            <SearchBar
              inputId="catalogue-search-input"
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder="Search by test name or SKU..."
            />
          </div>

          <TestTable
            tests={filteredTests}
            cart={cart}
            onAdd={handleAdd}
            onClearFilters={clearFilters}
            hasFiltersActive={hasFiltersActive}
            totalTestsInDb={allTests.length}
            expandedId={expandedCardId}
            onToggleExpand={toggleExpanded}
            highlightedId={highlightedTestId}
          />
        </section>
      </div>

      {/* Sticky cart bar */}
      <CartBar cart={cart} />

      {/* Post-add Ask AvoVita nudge — appears once after the first
          add of the session, above the CartBar, dismissible. Never
          obscures Checkout: the launcher yields to the CartBar and
          uses a fixed offset above it. */}
      {askPromptOpen && (
        <AskPromptLauncher
          testName={askPromptTestName}
          totalTestCount={allTests.length}
          onAccept={handleAskPromptAccept}
          onDismiss={handleAskPromptDismiss}
        />
      )}

      {/* AI Test Finder modal */}
      <InsightsChatModal
        open={aiOpen}
        onClose={() => {
          setAiOpen(false);
          // Clear the pending query so the next open with a different
          // or null query triggers a fresh auto-send instead of being
          // suppressed by the "already sent" ref inside the modal.
          setPendingAiQuery(null);
          // Also clear the hero input — the chat now has the state.
          setHeroQuery("");
        }}
        onScrollToTest={scrollToTest}
        initialQuery={pendingAiQuery}
      />
    </div>
  );
}

function FeaturedCarousel({
  tests,
  cart,
  onAdd,
  expandedId,
  onToggleExpand,
}: {
  tests: CatalogueTest[];
  cart: CatalogueCartItem[];
  onAdd: (item: CatalogueCartItem) => void;
  expandedId: string | null;
  onToggleExpand: (testId: string) => void;
}) {
  const [visibleCount, setVisibleCount] = useState(3);
  const [index, setIndex] = useState(0);

  // Responsive: 1 on mobile, 2 on tablet, 3 on desktop
  useEffect(() => {
    const compute = () => {
      const w = window.innerWidth;
      if (w >= 1024) setVisibleCount(3);
      else if (w >= 768) setVisibleCount(2);
      else setVisibleCount(1);
    };
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, []);

  const maxIndex = Math.max(0, tests.length - visibleCount);

  // Clamp index when visibleCount changes
  useEffect(() => {
    setIndex((prev) => Math.min(prev, maxIndex));
  }, [maxIndex]);

  const slotWidthPct = 100 / visibleCount;
  const translatePct = -index * slotWidthPct;

  const canPrev = index > 0;
  const canNext = index < maxIndex;

  return (
    <div className="relative">
      <div className="overflow-hidden">
        <div
          className="flex"
          style={{
            transform: `translateX(${translatePct}%)`,
            transition: "transform 300ms ease",
          }}
        >
          {tests.map((test) => {
            const isExpanded = expandedId === test.id;
            const inCart = cart.some(
              (c) => c.line_type === "test" && c.test_id === test.id,
            );
            return (
              <div
                key={test.id}
                className="px-2.5 shrink-0"
                style={{ width: `${slotWidthPct}%` }}
              >
                <div
                  role="button"
                  tabIndex={0}
                  aria-expanded={isExpanded}
                  onClick={() => onToggleExpand(test.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onToggleExpand(test.id);
                    }
                  }}
                  className="cursor-pointer focus:outline-none h-full"
                >
                  <TestCard
                    test={test}
                    inCart={inCart}
                    onAdd={onAdd}
                    expanded={isExpanded}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {tests.length > visibleCount && (
        <>
          <CarouselArrow
            direction="left"
            disabled={!canPrev}
            onClick={() => setIndex((i) => Math.max(0, i - 1))}
          />
          <CarouselArrow
            direction="right"
            disabled={!canNext}
            onClick={() => setIndex((i) => Math.min(maxIndex, i + 1))}
          />

          {/* Dot indicators */}
          <div className="mt-4 flex items-center justify-center gap-1.5">
            {Array.from({ length: maxIndex + 1 }).map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`Go to slide ${i + 1}`}
                className="rounded-full transition-colors"
                style={{
                  width: i === index ? "20px" : "8px",
                  height: "8px",
                  backgroundColor: i === index ? "#C6A04B" : "#E5E2D4",
                }}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function CarouselArrow({
  direction,
  disabled,
  onClick,
}: {
  direction: "left" | "right";
  disabled: boolean;
  onClick: () => void;
}) {
  const Icon = direction === "left" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={direction === "left" ? "Previous" : "Next"}
      className="absolute top-1/2 -translate-y-1/2 w-10 h-10 rounded-full flex items-center justify-center z-10 transition-opacity shadow-md"
      style={{
        backgroundColor: "#C6A04B",
        color: "#ffffff",
        border: "none",
        opacity: disabled ? 0.3 : 1,
        cursor: disabled ? "default" : "pointer",
        [direction === "left" ? "left" : "right"]: "4px",
      }}
    >
      <Icon className="w-5 h-5" />
    </button>
  );
}

function SectionHeading({
  title,
  hint,
  subtitle,
}: {
  title: string;
  hint?: string;
  subtitle?: string;
}) {
  return (
    <div className="mb-6">
      <div className="flex items-baseline gap-3 flex-wrap mb-2">
        <h2
          className="font-heading text-3xl font-semibold"
          style={{
            color: "#092819",
            fontFamily: '"Cormorant Garamond", Georgia, serif',
          }}
        >
          {title}
        </h2>
        {hint && (
          <span
            className="text-sm"
            style={{
              color: "#154D31",
              fontFamily: '"DM Sans", system-ui, sans-serif',
              fontSize: "14px",
            }}
          >
            {hint}
          </span>
        )}
      </div>
      {subtitle && (
        <p
          className="mb-2"
          style={{
            color: "#154D31",
            fontFamily: '"DM Sans", system-ui, sans-serif',
            fontSize: "14px",
          }}
        >
          {subtitle}
        </p>
      )}
      <div
        className="h-[3px] w-16 rounded-full"
        style={{ backgroundColor: "#C6A04B" }}
      />
    </div>
  );
}

