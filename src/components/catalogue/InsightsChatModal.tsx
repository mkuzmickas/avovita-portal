"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { X, Send, Sparkles, Loader2, ShoppingCart, Check, ExternalLink } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useCart } from "@/components/cart/CartContext";

interface InsightsChatModalProps {
  open: boolean;
  onClose: () => void;
  /**
   * Called when the user clicks "View" on a recommended test.
   * The modal closes itself before invoking this. Receives the test id.
   */
  onScrollToTest?: (testId: string) => void;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface CatalogueLookupTest {
  id: string;
  name: string;
  sku: string;
  price_cad: number | null;
  lab_name: string;
}

const INTRO_MESSAGE: ChatMessage = {
  role: "assistant",
  content:
    "Hi — I'm AvoVita's AI Test Finder. Tell me what symptoms you're experiencing or what you're hoping to learn about your health, and I'll suggest relevant tests from our catalogue.",
};

export function InsightsChatModal({
  open,
  onClose,
  onScrollToTest,
}: InsightsChatModalProps) {
  const supabase = useMemo(() => createClient(), []);
  const { cart, addItem } = useCart();

  const [authState, setAuthState] = useState<"loading" | "signed_in" | "signed_out">("loading");
  const [messages, setMessages] = useState<ChatMessage[]>([INTRO_MESSAGE]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testIndex, setTestIndex] = useState<Map<string, CatalogueLookupTest>>(new Map());

  const scrollRef = useRef<HTMLDivElement>(null);

  // Auth subscription
  useEffect(() => {
    let mounted = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!mounted) return;
      setAuthState(data.user ? "signed_in" : "signed_out");
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setAuthState(session?.user ? "signed_in" : "signed_out");
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [supabase]);

  // Load test catalogue (sku → test) once when modal opens for a signed-in user
  useEffect(() => {
    if (!open || authState !== "signed_in" || testIndex.size > 0) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("tests")
        .select("id, name, sku, price_cad, lab:labs(name)")
        .eq("active", true);
      if (cancelled || !data) return;
      type Row = {
        id: string;
        name: string;
        sku: string | null;
        price_cad: number | null;
        lab: { name: string } | { name: string }[] | null;
      };
      const map = new Map<string, CatalogueLookupTest>();
      for (const r of data as unknown as Row[]) {
        if (!r.sku) continue;
        const lab = Array.isArray(r.lab) ? r.lab[0] : r.lab;
        map.set(r.sku.toLowerCase(), {
          id: r.id,
          name: r.name,
          sku: r.sku,
          price_cad: r.price_cad,
          lab_name: lab?.name ?? "—",
        });
      }
      setTestIndex(map);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, authState, supabase, testIndex.size]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, sending]);

  // Lock body scroll when open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Escape closes the modal
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const send = async () => {
    const trimmed = input.trim();
    if (!trimmed || sending) return;
    setError(null);

    const next: ChatMessage[] = [...messages, { role: "user", content: trimmed }];
    setMessages(next);
    setInput("");
    setSending(true);

    try {
      const res = await fetch("/api/insights/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: next.filter((m) => m !== INTRO_MESSAGE),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        setMessages(messages); // roll back to pre-send state
        return;
      }
      setMessages([...next, { role: "assistant", content: data.content }]);
    } catch {
      setError("Network error. Please try again.");
      setMessages(messages);
    } finally {
      setSending(false);
    }
  };

  const handleAdd = (test: CatalogueLookupTest) => {
    if (test.price_cad == null) return;
    if (cart.some((c) => c.test_id === test.id)) return;
    addItem({
      test_id: test.id,
      test_name: test.name,
      price_cad: test.price_cad,
      lab_name: test.lab_name,
      quantity: 1,
    });
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6"
      style={{ backgroundColor: "rgba(0,0,0,0.7)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-2xl border flex flex-col"
        style={{
          backgroundColor: "#1a3d22",
          borderColor: "#2d6b35",
          maxHeight: "90vh",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 border-b"
          style={{ borderColor: "#2d6b35" }}
        >
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: "#0f2614", border: "1px solid #c4973a" }}
            >
              <Sparkles className="w-4 h-4" style={{ color: "#c4973a" }} />
            </div>
            <h2
              className="font-heading text-xl font-semibold"
              style={{
                color: "#ffffff",
                fontFamily: '"Cormorant Garamond", Georgia, serif',
              }}
            >
              AI Test Finder
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1 rounded-md transition-colors"
            style={{ color: "#e8d5a3" }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        {authState === "loading" ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin" style={{ color: "#c4973a" }} />
          </div>
        ) : authState === "signed_out" ? (
          <SignedOut />
        ) : (
          <>
            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto px-5 py-4 space-y-4"
              style={{ minHeight: "320px" }}
            >
              {messages.map((m, i) => (
                <MessageBubble
                  key={i}
                  message={m}
                  testIndex={testIndex}
                  cart={cart}
                  onAdd={handleAdd}
                  onView={(testId) => {
                    onClose();
                    onScrollToTest?.(testId);
                  }}
                />
              ))}
              {sending && (
                <div className="flex items-center gap-2" style={{ color: "#e8d5a3" }}>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm">Thinking…</span>
                </div>
              )}
            </div>

            {error && (
              <div
                className="px-5 py-2 text-sm border-t"
                style={{
                  color: "#e05252",
                  borderColor: "#2d6b35",
                  backgroundColor: "rgba(224,82,82,0.08)",
                }}
              >
                {error}
              </div>
            )}

            {/* Input */}
            <div
              className="border-t px-4 py-3 flex items-end gap-2"
              style={{ borderColor: "#2d6b35" }}
            >
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                placeholder="Describe your symptoms or what you'd like to learn…"
                rows={2}
                className="mf-input flex-1 resize-none"
                disabled={sending}
              />
              <button
                type="button"
                onClick={send}
                disabled={sending || !input.trim()}
                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors"
                style={{
                  backgroundColor: "#c4973a",
                  color: "#0a1a0d",
                  opacity: sending || !input.trim() ? 0.5 : 1,
                }}
              >
                <Send className="w-4 h-4" />
                Send
              </button>
            </div>
            <p
              className="px-5 pb-3 text-xs"
              style={{ color: "#6ab04c" }}
            >
              Educational only — not a diagnosis. Discuss results with a healthcare provider of your choice.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Signed-out state ─────────────────────────────────────────────────

function SignedOut() {
  return (
    <div className="flex flex-col items-center justify-center text-center px-6 py-16 gap-6">
      <Sparkles className="w-10 h-10" style={{ color: "#c4973a" }} />
      <p
        className="font-heading text-2xl"
        style={{
          color: "#ffffff",
          fontFamily: '"Cormorant Garamond", Georgia, serif',
        }}
      >
        Sign in or Create Account to use AI Test Finder
      </p>
      <div className="flex flex-col sm:flex-row items-stretch gap-3 w-full sm:w-auto">
        <Link
          href="/login"
          className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg text-sm font-semibold transition-colors"
          style={{ backgroundColor: "#c4973a", color: "#0a1a0d" }}
        >
          Sign In
        </Link>
        <Link
          href="/signup"
          className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg text-sm font-semibold border transition-colors"
          style={{
            backgroundColor: "transparent",
            borderColor: "#c4973a",
            color: "#c4973a",
          }}
        >
          Create Account
        </Link>
      </div>
    </div>
  );
}

// ─── Message bubble + inline test action chips ────────────────────────

const TEST_CODE_REGEX = /Code:\s*([A-Za-z0-9_\-]+)/g;

function extractCodes(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of text.matchAll(TEST_CODE_REGEX)) {
    const code = m[1].toLowerCase();
    if (!seen.has(code)) {
      seen.add(code);
      out.push(code);
    }
  }
  return out;
}

function MessageBubble({
  message,
  testIndex,
  cart,
  onAdd,
  onView,
}: {
  message: ChatMessage;
  testIndex: Map<string, CatalogueLookupTest>;
  cart: { test_id: string }[];
  onAdd: (test: CatalogueLookupTest) => void;
  onView: (testId: string) => void;
}) {
  const isUser = message.role === "user";
  const codes = isUser ? [] : extractCodes(message.content);
  const referencedTests = codes
    .map((c) => testIndex.get(c))
    .filter((t): t is CatalogueLookupTest => !!t);

  return (
    <div className={isUser ? "flex justify-end" : "flex justify-start"}>
      <div
        className="max-w-[85%] rounded-xl px-4 py-3 text-sm whitespace-pre-wrap"
        style={
          isUser
            ? {
                backgroundColor: "#c4973a",
                color: "#0a1a0d",
                fontFamily: '"DM Sans", system-ui, sans-serif',
              }
            : {
                backgroundColor: "#0f2614",
                color: "#e8d5a3",
                border: "1px solid #2d6b35",
                fontFamily: '"DM Sans", system-ui, sans-serif',
              }
        }
      >
        {message.content}

        {referencedTests.length > 0 && (
          <div
            className="mt-3 pt-3 border-t flex flex-col gap-2"
            style={{ borderColor: "#2d6b35" }}
          >
            {referencedTests.map((t) => {
              const inCart = cart.some((c) => c.test_id === t.id);
              const canAdd = t.price_cad != null;
              return (
                <div
                  key={t.id}
                  className="flex items-center justify-between gap-2 text-xs"
                >
                  <span style={{ color: "#ffffff" }}>{t.name}</span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {canAdd ? (
                      <button
                        type="button"
                        onClick={() => onAdd(t)}
                        disabled={inCart}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold"
                        style={
                          inCart
                            ? {
                                backgroundColor: "rgba(141,198,63,0.15)",
                                color: "#8dc63f",
                                border: "1px solid #8dc63f",
                                cursor: "default",
                              }
                            : { backgroundColor: "#c4973a", color: "#0a1a0d" }
                        }
                      >
                        {inCart ? (
                          <>
                            <Check className="w-3 h-3" />
                            In Cart
                          </>
                        ) : (
                          <>
                            <ShoppingCart className="w-3 h-3" />
                            Add
                          </>
                        )}
                      </button>
                    ) : (
                      <a
                        href="mailto:support@avovita.ca"
                        className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold"
                        style={{ backgroundColor: "#c4973a", color: "#0a1a0d" }}
                      >
                        Contact
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => onView(t.id)}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold border"
                      style={{
                        backgroundColor: "transparent",
                        borderColor: "#c4973a",
                        color: "#c4973a",
                      }}
                    >
                      <ExternalLink className="w-3 h-3" />
                      View
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
