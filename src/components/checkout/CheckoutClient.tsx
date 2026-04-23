"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCart } from "@/components/cart/CartContext";
import { OrgAwareHeader } from "@/components/org/OrgAwareHeader";
import { CheckoutProgress } from "./CheckoutProgress";
import { CheckoutCartSummary } from "./CheckoutCartSummary";
import { Step1People } from "./Step1People";
import {
  Step2AssignTests,
  type PersonAssignmentEntry,
} from "./Step2AssignTests";
import { Step3CollectionDetails } from "./Step3CollectionDetails";
import { Step4Review } from "./Step4Review";
import { SupplementFulfillmentStep } from "./SupplementFulfillmentStep";
import { computeVisitFees } from "@/lib/checkout/visit-fees";
import { computeKitServiceFee } from "@/lib/checkout/kit-service-fee";
import { reconcileAssignments } from "@/lib/checkout/reconcileAssignments";
import { useAnalytics } from "@/lib/analytics/useAnalytics";
import type { SupplementFulfillment, SupplementShippingAddress } from "@/types/supplements";
import type {
  CheckoutPerson,
  CollectionAddress,
  RepresentativeBlock,
  AppliedPromo,
} from "@/lib/checkout/types";

interface CheckoutClientProps {
  /** Authenticated account id, or null for guest checkout. */
  accountUserId: string | null;
  /** Authenticated email, used to skip account creation if logged in. */
  accountEmail: string | null;
  /** Show supplement fulfillment step between address and review. */
  showSupplementFulfillmentStep?: boolean;
  /** Show resource download notice on success page. */
  showResourceSuccessNotice?: boolean;
}

const STORAGE_KEY = "avovita-checkout-v1";

export type OrderMode = "self" | "caregiver";

const BLANK_REPRESENTATIVE: RepresentativeBlock = {
  first_name: "",
  last_name: "",
  email: "",
  phone: "",
  relationship: "power_of_attorney",
  poa_confirmed: false,
};

interface PersistedCheckoutState {
  personCount: number;
  assignments: PersonAssignmentEntry[];
  persons: CheckoutPerson[];
  collectionAddress: CollectionAddress;
  step: number;
  orderMode?: OrderMode;
  representative?: RepresentativeBlock;
}

function defaultPersons(count: number): CheckoutPerson[] {
  return Array.from({ length: count }, (_, i) => ({
    index: i,
    is_account_holder: i === 0,
    first_name: "",
    last_name: "",
    date_of_birth: "",
    biological_sex: "",
    relationship: i === 0 ? "account_holder" : null,
    consent_acknowledged: i === 0,
  }));
}

const defaultAddress: CollectionAddress = {
  address_line1: "",
  address_line2: "",
  city: "Calgary",
  province: "AB",
  postal_code: "",
};

export function CheckoutClient({
  accountUserId,
  accountEmail: _accountEmail,
  showSupplementFulfillmentStep = false,
  showResourceSuccessNotice: _showResourceSuccessNotice = false,
}: CheckoutClientProps) {
  void _accountEmail;
  void _showResourceSuccessNotice;
  const router = useRouter();
  const { cart, hydrated, addItem, clearCart } = useCart();
  const { trackEvent } = useAnalytics();
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [appliedQuoteNumber, setAppliedQuoteNumber] = useState<string | null>(null);
  // Admin-entered additional discount carried from an accepted quote.
  // Resolved to CAD dollars by /api/quotes/[number]; applied here and
  // verified server-side in /api/stripe/checkout via the same lookup.
  const [quoteDiscountCad, setQuoteDiscountCad] = useState(0);

  const [step, setStep] = useState(1);
  const [personCount, setPersonCount] = useState(1);
  const [persons, setPersons] = useState<CheckoutPerson[]>(defaultPersons(1));
  const [assignments, setAssignments] = useState<PersonAssignmentEntry[]>([]);
  const [collectionAddress, setCollectionAddress] =
    useState<CollectionAddress>(defaultAddress);
  const [restored, setRestored] = useState(false);
  const [appliedPromo, setAppliedPromo] = useState<AppliedPromo | null>(null);
  const [orderMode, setOrderMode] = useState<OrderMode>("self");
  const [representative, setRepresentative] = useState<RepresentativeBlock>(
    BLANK_REPRESENTATIVE
  );
  // Supplement fulfillment state — only used when showSupplementFulfillmentStep
  const [suppFulfillment, setSuppFulfillment] =
    useState<SupplementFulfillment | null>(null);
  const [suppShippingAddress, setSuppShippingAddress] =
    useState<SupplementShippingAddress | null>(null);

  // Org tagging — when the user arrived via /org/[slug]/checkout the
  // server redirect drops org_slug into the query string. We persist it
  // to localStorage so any in-flight cart from the same browser session
  // keeps its org affinity even if the user wanders out and back.
  const searchParams = useSearchParams();
  useEffect(() => {
    if (typeof window === "undefined") return;
    const fromQuery = searchParams.get("org_slug");
    if (fromQuery) {
      try {
        window.localStorage.setItem("avovita-org-slug", fromQuery);
      } catch {
        /* ignore */
      }
    }
  }, [searchParams]);

  // Accept-quote deep link: /checkout?quote=AVO-YYYY-NNNN pre-populates
  // the cart from the quote's lines. Validates expiry + status server-
  // side; on failure the checkout still renders, with a friendly banner.
  useEffect(() => {
    if (!hydrated) return;
    const quoteNumber = searchParams.get("quote");
    if (!quoteNumber) return;
    // Guard: only apply once per quote per mount.
    if (appliedQuoteNumber === quoteNumber) return;

    let cancelled = false;
    setQuoteLoading(true);
    setQuoteError(null);
    (async () => {
      try {
        const res = await fetch(
          `/api/quotes/${encodeURIComponent(quoteNumber)}`
        );
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setQuoteError(
            data.error ?? "This quote is no longer available."
          );
          return;
        }
        type QuoteItem = {
          test_id: string;
          test_name: string;
          lab_name: string;
          price_cad: number;
        };
        const items = (data.items ?? []) as QuoteItem[];
        if (items.length === 0) {
          setQuoteError("This quote has no tests attached.");
          return;
        }
        clearCart();
        for (const it of items) {
          addItem({
            line_type: "test" as const,
            test_id: it.test_id,
            test_name: it.test_name,
            lab_name: it.lab_name,
            price_cad: it.price_cad,
            quantity: 1,
          });
        }
        const rawDiscount = Number(data.manual_discount_cad);
        setQuoteDiscountCad(
          Number.isFinite(rawDiscount) && rawDiscount > 0 ? rawDiscount : 0
        );
        // Pre-populate person count + collection city from the quote so
        // the home-visit fee preview matches the emailed quote the moment
        // the customer lands in checkout.
        const quotedPersonCount = Number(data.person_count);
        if (Number.isFinite(quotedPersonCount) && quotedPersonCount >= 1) {
          const clamped = Math.min(6, Math.max(1, quotedPersonCount));
          setPersonCount(clamped);
          setPersons((prev) => {
            const next = defaultPersons(clamped);
            for (let i = 0; i < clamped; i++) {
              if (prev[i])
                next[i] = {
                  ...next[i],
                  ...prev[i],
                  index: i,
                  is_account_holder: i === 0,
                };
              if (i === 0) {
                next[i].relationship = "account_holder";
                next[i].consent_acknowledged = true;
                next[i].is_account_holder = true;
              }
            }
            return next;
          });
        }
        if (typeof data.collection_city === "string" && data.collection_city) {
          setCollectionAddress((prev) =>
            prev.city === data.collection_city
              ? prev
              : { ...prev, city: data.collection_city as string }
          );
        }
        setAppliedQuoteNumber(quoteNumber);
      } finally {
        if (!cancelled) setQuoteLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, searchParams]);

  // ─── Restore persisted state ──────────────────────────────────────────
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as PersistedCheckoutState;
        if (parsed && typeof parsed === "object") {
          const restoredCount =
            typeof parsed.personCount === "number" && parsed.personCount > 0
              ? parsed.personCount
              : 1;
          setPersonCount(restoredCount);
          // Always align persons[] length with personCount on restore.
          // A mismatch (e.g. legacy persisted state with an extra empty
          // person) caused additionalAllValid to fail silently, leaving
          // the Continue button greyed with no visible field to fix.
          const restoredPersons =
            Array.isArray(parsed.persons) && parsed.persons.length > 0
              ? parsed.persons
              : defaultPersons(restoredCount);
          const aligned = defaultPersons(restoredCount).map((blank, i) => {
            const prior = restoredPersons[i];
            if (!prior) return blank;
            return {
              ...blank,
              ...prior,
              index: i,
              is_account_holder: i === 0,
              relationship:
                i === 0 ? "account_holder" : (prior.relationship ?? null),
            };
          });
          setPersons(aligned);
          if (Array.isArray(parsed.assignments)) {
            // Dedupe by test_id — older versions of the wizard allowed
            // multiple assignments per test, but the new rule is one
            // assignment per test, so we collapse duplicates by keeping
            // the most recently-pushed entry.
            const seen = new Set<string>();
            const deduped: PersonAssignmentEntry[] = [];
            for (let i = parsed.assignments.length - 1; i >= 0; i--) {
              const a = parsed.assignments[i];
              if (!seen.has(a.test_id)) {
                seen.add(a.test_id);
                deduped.unshift(a);
              }
            }
            setAssignments(deduped);
          }
          if (parsed.collectionAddress) {
            setCollectionAddress(parsed.collectionAddress);
          }
          if (typeof parsed.step === "number") {
            setStep(parsed.step);
          }
          if (parsed.orderMode === "self" || parsed.orderMode === "caregiver") {
            setOrderMode(parsed.orderMode);
          }
          if (parsed.representative) {
            setRepresentative({
              ...BLANK_REPRESENTATIVE,
              ...parsed.representative,
            });
          }
        }
      }
    } catch {
      // Ignore parse errors — start fresh
    }

    // Org-aware default: Always Best Care almost always orders on behalf
    // of a resident, so pre-select the caregiver flow. Users can still
    // flip to "Myself" if they wish. We only set this when there's no
    // persisted value to avoid overriding a deliberate earlier choice.
    try {
      const orgSlug = window.localStorage.getItem("avovita-org-slug");
      const persistedRaw = window.localStorage.getItem(STORAGE_KEY);
      const hadPersistedMode =
        !!persistedRaw && /"orderMode"/.test(persistedRaw);
      if (orgSlug === "AlwaysBestCare" && !hadPersistedMode) {
        setOrderMode("caregiver");
      }
    } catch {
      /* ignore */
    }

    setRestored(true);
  }, []);

  // ─── Reconcile assignments to cart + personCount ─────────────────────
  // Single authoritative sync: assignments is fully derived from cart,
  // personCount, and prior per-person split choices. Any path that
  // changes the cart (quote-accept deep-link, add from another tab,
  // cart empty-then-refill) or changes personCount re-runs this, so
  // Step 4's left pane can never diverge from the right-pane cart
  // summary. See src/lib/checkout/reconcileAssignments.ts for the
  // rules + regression tests.
  useEffect(() => {
    if (!restored || !hydrated) return;
    setAssignments((prev) => {
      const next = reconcileAssignments(cart, personCount, prev);
      if (next.length !== prev.length) return next;
      for (let i = 0; i < next.length; i++) {
        if (
          next[i].test_id !== prev[i].test_id ||
          next[i].person_index !== prev[i].person_index ||
          next[i].price_cad !== prev[i].price_cad
        ) {
          return next;
        }
      }
      return prev;
    });
  }, [restored, hydrated, cart, personCount]);

  // ─── Persist on every change ──────────────────────────────────────────
  useEffect(() => {
    if (!restored || typeof window === "undefined") return;
    try {
      const snapshot: PersistedCheckoutState = {
        personCount,
        persons,
        assignments,
        collectionAddress,
        step,
        orderMode,
        representative,
      };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    } catch {
      // Ignore quota errors
    }
  }, [
    personCount,
    persons,
    assignments,
    collectionAddress,
    step,
    orderMode,
    representative,
    restored,
  ]);

  // ─── Cart composition for fee gating ──────────────────────────────────
  const kitFeeInfo = computeKitServiceFee(cart);
  // Kit-only orders have no phlebotomist visit — skip people step + visit fee
  const isKitOnly = kitFeeInfo.hasKitTests && !kitFeeInfo.hasPhlebotomistTests;

  // ─── Analytics: checkout started ─────────────────────────────────────
  const trackedStartRef = useRef(false);
  useEffect(() => {
    if (hydrated && restored && cart.length > 0 && !trackedStartRef.current) {
      trackedStartRef.current = true;
      trackEvent("checkout_started");
    }
  }, [hydrated, restored, cart.length, trackEvent]);

  // ─── Kit-only auto-advance: skip Step 1 (people count) ────────────
  // For kit-only orders there's no phlebotomist visit, so person count
  // is always 1. The reconcile effect above populates assignments
  // from the cart whenever personCount changes, so we only need to
  // set the count + jump ahead.
  useEffect(() => {
    if (!hydrated || !restored || !isKitOnly || step !== 1) return;
    setPersonCount(1);
    setStep(3);
  }, [hydrated, restored, isKitOnly, step, cart]);

  // ─── Analytics: checkout abandoned (beforeunload) ──────────────────
  useEffect(() => {
    if (!hydrated || !restored || cart.length === 0) return;
    const handleUnload = () => {
      trackEvent("checkout_abandoned", { last_step: step });
    };
    window.addEventListener("beforeunload", handleUnload);
    return () => window.removeEventListener("beforeunload", handleUnload);
  }, [hydrated, restored, cart.length, step, trackEvent]);

  // ─── Cart redirect ────────────────────────────────────────────────────
  // Don't bounce to /tests while a ?quote= deep-link is loading items or
  // while a quote error banner is being shown — the user should see the
  // message on /checkout, not get kicked back to the catalogue.
  useEffect(() => {
    if (quoteLoading || quoteError) return;
    if (searchParams.get("quote") && !appliedQuoteNumber) return;
    if (hydrated && cart.length === 0) {
      router.replace("/tests");
    }
  }, [
    hydrated,
    cart.length,
    router,
    quoteLoading,
    quoteError,
    searchParams,
    appliedQuoteNumber,
  ]);

  // ─── Adjust persons when count changes ────────────────────────────────
  // `assignments` is handled by the reconcile effect above — no direct
  // filter/rebuild needed here. We just keep `persons` in step.
  const handlePersonCountChange = (count: number) => {
    setPersonCount(count);
    setPersons((prev) => {
      // Preserve existing entries up to the new count
      const next = defaultPersons(count);
      for (let i = 0; i < count; i++) {
        if (prev[i]) next[i] = { ...next[i], ...prev[i], index: i, is_account_holder: i === 0 };
        // Account holder must always have account_holder relationship
        if (i === 0) {
          next[i].relationship = "account_holder";
          next[i].consent_acknowledged = true;
          next[i].is_account_holder = true;
        }
      }
      return next;
    });
  };

  // ─── Step navigation ──────────────────────────────────────────────────
  const skipStep2 = personCount === 1;

  const handleStep1Continue = () => {
    trackEvent("checkout_step_completed", { step: 1 });
    // `assignments` is auto-kept-in-sync by the reconcile effect, so
    // there's nothing to populate here — just advance.
    setStep(personCount === 1 ? 3 : 2);
  };

  const handleStep2Back = () => setStep(1);
  const handleStep2Continue = () => {
    trackEvent("checkout_step_completed", { step: 2 });
    setStep(3);
  };
  const handleStep3Back = () => (skipStep2 ? setStep(1) : setStep(2));
  const handleStep3Continue = () => {
    trackEvent("checkout_step_completed", { step: 3 });
    if (showSupplementFulfillmentStep) {
      setStep(35); // Supplement fulfillment step
    } else {
      setStep(4);
    }
  };
  const handleStep35Back = () => setStep(3);
  const handleStep35Continue = () => {
    trackEvent("checkout_step_completed", { step: 3.5 });
    setStep(4);
  };
  const handleStep4Back = () =>
    showSupplementFulfillmentStep ? setStep(35) : setStep(3);

  const visitFees = useMemo(
    () => {
      if (isKitOnly) return null;
      // On step 1 we normally hide the visit fee because the user hasn't
      // picked a person count yet. When the flow was kicked off by a
      // quote-accept link we already know the person count from the
      // quote, so show the fee from step 1 to match the emailed quote.
      if (step === 1 && !appliedQuoteNumber) return null;
      return computeVisitFees(personCount, collectionAddress.postal_code);
    },
    [personCount, step, collectionAddress.postal_code, isKitOnly, appliedQuoteNumber]
  );

  // Sidebar always reflects the cart, never the partial assignment state.
  // Each cart item is exactly one order line — assigning it to a person
  // moves it but never duplicates it — so the cart is the single source
  // of truth for line count, subtotal, and discount preview on every
  // checkout step. The Step 2 step body uses the same numbers, so the
  // sidebar and step body always agree.
  const testCartItems = cart.filter((c) => c.line_type === "test");
  const sidebarLineCount = testCartItems.length;
  const sidebarSubtotal = testCartItems.reduce(
    (s, c) => s + c.price_cad * c.quantity,
    0
  );

  // Don't render anything until hydration is done — avoids React mismatch
  if (!hydrated || !restored) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ backgroundColor: "#0a1a0d" }}
      >
        <p className="text-sm" style={{ color: "#6ab04c" }}>
          Loading checkout…
        </p>
      </div>
    );
  }

  if (cart.length === 0) {
    if (quoteLoading) {
      return (
        <div
          className="min-h-screen flex items-center justify-center"
          style={{ backgroundColor: "#0a1a0d" }}
        >
          <p className="text-sm" style={{ color: "#6ab04c" }}>
            Loading your quote…
          </p>
        </div>
      );
    }
    if (quoteError) {
      return (
        <div
          className="min-h-screen flex items-center justify-center px-4"
          style={{ backgroundColor: "#0a1a0d" }}
        >
          <div
            className="max-w-md w-full rounded-2xl border p-6 text-center"
            style={{ backgroundColor: "#1a3d22", borderColor: "#c4973a" }}
          >
            <h1
              className="font-heading text-2xl font-semibold mb-3"
              style={{
                color: "#ffffff",
                fontFamily: '"Cormorant Garamond", Georgia, serif',
              }}
            >
              Quote <span style={{ color: "#c4973a" }}>unavailable</span>
            </h1>
            <p className="text-sm mb-5" style={{ color: "#e8d5a3" }}>
              {quoteError}
            </p>
            <Link
              href="/tests"
              className="inline-flex items-center justify-center px-5 py-2.5 rounded-lg text-sm font-semibold"
              style={{ backgroundColor: "#c4973a", color: "#0a1a0d" }}
            >
              Browse our test catalogue
            </Link>
          </div>
        </div>
      );
    }
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ backgroundColor: "#0a1a0d" }}
      >
        <p className="text-sm" style={{ color: "#6ab04c" }}>
          Redirecting to test catalogue…
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#0a1a0d" }}>
      <OrgAwareHeader
        rightSlot={
          <Link
            href="/tests"
            className="text-xs font-medium px-3 py-1.5 rounded-lg border whitespace-nowrap"
            style={{
              color: "#e8d5a3",
              borderColor: "#2d6b35",
              backgroundColor: "transparent",
            }}
          >
            ← Back to catalogue
          </Link>
        }
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <CheckoutProgress
          currentStep={step as 1 | 2 | 3 | 4}
          skipStep2={skipStep2}
        />

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
          {/* Main step area */}
          <div>
            {step === 1 && (
              <Step1People
                personCount={personCount}
                onPersonCountChange={handlePersonCountChange}
                onContinue={handleStep1Continue}
                orderMode={orderMode}
                onOrderModeChange={setOrderMode}
              />
            )}
            {step === 2 && (
              <Step2AssignTests
                cart={testCartItems as import("@/components/catalogue/types").CatalogueCartItem[]}
                personCount={personCount}
                assignments={assignments}
                onAssignmentsChange={setAssignments}
                onBack={handleStep2Back}
                onContinue={handleStep2Continue}
              />
            )}
            {step === 3 && (
              <Step3CollectionDetails
                persons={persons}
                collectionAddress={collectionAddress}
                assignments={assignments}
                onPersonsChange={setPersons}
                onAddressChange={setCollectionAddress}
                onBack={handleStep3Back}
                onContinue={handleStep3Continue}
                orderMode={orderMode}
                representative={representative}
                onRepresentativeChange={setRepresentative}
              />
            )}
            {/* Step 3.5 = supplement fulfillment, injected between address (3) and review (4)
                when cart contains supplements. Non-integer step ID avoids renumbering the
                existing test-flow step sequence (1→2→3→4), which would have rippled into
                step navigation, progress indicators, and analytics events. Only rendered
                when showSupplementFulfillmentStep === true. */}
            {step === 35 && showSupplementFulfillmentStep && (
              <SupplementFulfillmentStep
                collectionAddress={collectionAddress}
                fulfillment={suppFulfillment}
                shippingAddress={suppShippingAddress}
                onFulfillmentChange={setSuppFulfillment}
                onShippingAddressChange={setSuppShippingAddress}
                onBack={handleStep35Back}
                onContinue={handleStep35Continue}
              />
            )}
            {step === 4 && (
              <Step4Review
                persons={persons}
                collectionAddress={collectionAddress}
                assignments={assignments}
                accountUserId={accountUserId}
                onBack={handleStep4Back}
                appliedPromo={appliedPromo}
                onPromoChange={setAppliedPromo}
                orderMode={orderMode}
                representative={representative}
                suppFulfillment={suppFulfillment}
                suppShippingAddress={suppShippingAddress}
                acceptedQuoteNumber={appliedQuoteNumber}
                quoteDiscountCad={quoteDiscountCad}
              />
            )}
          </div>

          {/* Sidebar — stacks below step content on mobile, beside on desktop */}
          <div className="order-2 lg:order-none">
            <CheckoutCartSummary
              cart={cart}
              visitFees={visitFees}
              lineCount={sidebarLineCount}
              subtotalOverride={sidebarSubtotal}
              appliedPromo={appliedPromo}
              quoteDiscountCad={quoteDiscountCad}
              acceptedQuoteNumber={appliedQuoteNumber}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
