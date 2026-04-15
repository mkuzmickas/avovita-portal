"use client";

import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Leaf } from "lucide-react";
import { useCart } from "@/components/cart/CartContext";
import { CheckoutProgress } from "./CheckoutProgress";
import { CheckoutCartSummary } from "./CheckoutCartSummary";
import { Step1People } from "./Step1People";
import {
  Step2AssignTests,
  type PersonAssignmentEntry,
} from "./Step2AssignTests";
import { Step3CollectionDetails } from "./Step3CollectionDetails";
import { Step4Review } from "./Step4Review";
import { computeVisitFees } from "@/lib/checkout/visit-fees";
import type {
  CheckoutPerson,
  CollectionAddress,
  RepresentativeBlock,
} from "@/lib/checkout/types";

interface CheckoutClientProps {
  /** Authenticated account id, or null for guest checkout. */
  accountUserId: string | null;
  /** Authenticated email, used to skip account creation if logged in. */
  accountEmail: string | null;
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
}: CheckoutClientProps) {
  void _accountEmail;
  const router = useRouter();
  const { cart, hydrated } = useCart();

  const [step, setStep] = useState(1);
  const [personCount, setPersonCount] = useState(1);
  const [persons, setPersons] = useState<CheckoutPerson[]>(defaultPersons(1));
  const [assignments, setAssignments] = useState<PersonAssignmentEntry[]>([]);
  const [collectionAddress, setCollectionAddress] =
    useState<CollectionAddress>(defaultAddress);
  const [restored, setRestored] = useState(false);
  const [promoApplied, setPromoApplied] = useState(false);
  const [orderMode, setOrderMode] = useState<OrderMode>("self");
  const [representative, setRepresentative] = useState<RepresentativeBlock>(
    BLANK_REPRESENTATIVE
  );

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

  // ─── Restore persisted state ──────────────────────────────────────────
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as PersistedCheckoutState;
        if (parsed && typeof parsed === "object") {
          if (parsed.personCount) setPersonCount(parsed.personCount);
          if (Array.isArray(parsed.persons) && parsed.persons.length > 0) {
            setPersons(parsed.persons);
          }
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

  // ─── Sync assignments to cart ───────────────────────────────────────
  // Drop any assignment whose underlying cart item has been removed.
  // Only updates state when the filter actually changes anything so it
  // can't loop. Runs after restore + whenever the cart changes.
  useEffect(() => {
    if (!restored || !hydrated) return;
    setAssignments((prev) => {
      const filtered = prev.filter((a) =>
        cart.some((c) => c.test_id === a.test_id)
      );
      return filtered.length === prev.length ? prev : filtered;
    });
  }, [restored, hydrated, cart]);

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

  // ─── Cart redirect ────────────────────────────────────────────────────
  useEffect(() => {
    if (hydrated && cart.length === 0) {
      router.replace("/tests");
    }
  }, [hydrated, cart.length, router]);

  // ─── Adjust persons when count changes ────────────────────────────────
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
    // Drop assignments for people that no longer exist
    setAssignments((prev) => prev.filter((a) => a.person_index < count));
  };

  // ─── Step navigation ──────────────────────────────────────────────────
  const skipStep2 = personCount === 1;

  const handleStep1Continue = () => {
    if (personCount === 1) {
      // Auto-assign every cart item to person 0
      setAssignments(
        cart.map((item) => ({
          test_id: item.test_id,
          test_name: item.test_name,
          lab_name: item.lab_name,
          price_cad: item.price_cad,
          person_index: 0,
        }))
      );
      setStep(3);
    } else {
      // Going to multi-person flow — clear any auto-assigned single-person
      // entries that no longer match (e.g. user changed person count)
      setStep(2);
    }
  };

  const handleStep2Back = () => setStep(1);
  const handleStep2Continue = () => setStep(3);
  const handleStep3Back = () => (skipStep2 ? setStep(1) : setStep(2));
  const handleStep3Continue = () => setStep(4);
  const handleStep4Back = () => setStep(3);

  const visitFees = useMemo(
    () =>
      step === 1
        ? null
        : computeVisitFees(personCount, collectionAddress.postal_code),
    [personCount, step, collectionAddress.postal_code]
  );

  // Sidebar always reflects the cart, never the partial assignment state.
  // Each cart item is exactly one order line — assigning it to a person
  // moves it but never duplicates it — so the cart is the single source
  // of truth for line count, subtotal, and discount preview on every
  // checkout step. The Step 2 step body uses the same numbers, so the
  // sidebar and step body always agree.
  const sidebarLineCount = cart.length;
  const sidebarSubtotal = cart.reduce(
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
      {/* Header */}
      <header
        className="border-b"
        style={{ backgroundColor: "#0f2614", borderColor: "#1a3d22" }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-3">
          <Link href="/tests" className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center border"
              style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
            >
              <Leaf className="w-4 h-4" style={{ color: "#8dc63f" }} />
            </div>
            <span
              className="font-heading text-xl font-semibold"
              style={{
                color: "#ffffff",
                fontFamily: '"Cormorant Garamond", Georgia, serif',
              }}
            >
              AvoVita
            </span>
          </Link>
          <Link
            href="/tests"
            className="text-xs font-medium px-3 py-1.5 rounded-lg border"
            style={{
              color: "#e8d5a3",
              borderColor: "#2d6b35",
              backgroundColor: "transparent",
            }}
          >
            ← Back to catalogue
          </Link>
        </div>
      </header>

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
                cart={cart}
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
            {step === 4 && (
              <Step4Review
                persons={persons}
                collectionAddress={collectionAddress}
                assignments={assignments}
                accountUserId={accountUserId}
                onBack={handleStep4Back}
                promoApplied={promoApplied}
                onPromoChange={setPromoApplied}
                orderMode={orderMode}
                representative={representative}
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
              promoApplied={promoApplied}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
