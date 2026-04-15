"use client";

import { useEffect, useMemo, useState } from "react";
import { X, Send, Sparkles, Loader2, ShoppingCart, Check, ExternalLink, ArrowRight } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useCart } from "@/components/cart/CartContext";
import { useOrg } from "@/components/org/OrgContext";
import { formatCurrency } from "@/lib/utils";

interface InsightsChatModalProps {
  open: boolean;
  onClose: () => void;
  /** Called when the user clicks "View" on a recommended test. The modal closes itself first. */
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
  const org = useOrg();
  const checkoutHref = org
    ? `/checkout?org_slug=${encodeURIComponent(org.slug)}`
    : "/checkout";
  const cartItemCount = cart.reduce((s, c) => s + c.quantity, 0);

  const [messages, setMessages] = useState<ChatMessage[]>([INTRO_MESSAGE]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testIndex, setTestIndex] = useState<Map<string, CatalogueLookupTest>>(new Map());

  // Load test catalogue (sku → test) once when modal opens.
  // Public read — no auth required (matches the catalogue page itself).
  useEffect(() => {
    if (!open || testIndex.size > 0) return;
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
  }, [open, supabase, testIndex.size]);

  // Lock body scroll when open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Escape closes
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
        setMessages(messages); // roll back
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
      className="fixed inset-0 z-50 flex items-stretch sm:items-center sm:justify-center sm:px-4 sm:py-6"
      style={{ backgroundColor: "rgba(0,0,0,0.7)" }}
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-2xl border-0 sm:border rounded-none sm:rounded-2xl flex flex-col h-full sm:h-auto sm:max-h-[85vh]"
        style={{
          backgroundColor: "#1a3d22",
          borderColor: "#2d6b35",
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

        {/* Body — open to all visitors */}
        {(
          <>
            <div
              className="flex-1 overflow-y-auto px-5 py-4 space-y-5"
              style={{ minHeight: "320px" }}
            >
              {messages.map((m, i) =>
                m.role === "user" ? (
                  <UserMessage key={i} content={m.content} />
                ) : (
                  <AssistantMessage
                    key={i}
                    content={m.content}
                    testIndex={testIndex}
                    cart={cart}
                    onAdd={handleAdd}
                    onView={(testId) => {
                      onClose();
                      onScrollToTest?.(testId);
                    }}
                  />
                )
              )}
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
            {cartItemCount > 0 && (
              <div
                className="border-t px-4 py-3 flex items-center justify-between gap-3"
                style={{ borderColor: "#2d6b35", backgroundColor: "#0f2614" }}
              >
                <p className="text-xs" style={{ color: "#e8d5a3" }}>
                  <span className="font-semibold" style={{ color: "#c4973a" }}>
                    {cartItemCount}
                  </span>{" "}
                  test{cartItemCount !== 1 ? "s" : ""} in cart
                </p>
                <Link
                  href={checkoutHref}
                  onClick={onClose}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
                  style={{ backgroundColor: "#c4973a", color: "#0a1a0d" }}
                >
                  Continue to Checkout
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            )}
            <p className="px-5 pb-3 text-xs" style={{ color: "#6ab04c" }}>
              Educational only — not a diagnosis. Discuss results with a healthcare provider of your choice.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

// ─── User message bubble ──────────────────────────────────────────────

function UserMessage({ content }: { content: string }) {
  // Short single-line message → pill; longer → softly-rounded bubble
  const isShort = content.length < 40 && !content.includes("\n");
  return (
    <div className="flex justify-end">
      <div
        className={`max-w-[70%] px-4 py-2 text-sm whitespace-pre-wrap ${
          isShort ? "rounded-full" : "rounded-2xl"
        }`}
        style={{
          backgroundColor: "#c4973a",
          color: "#0a1a0d",
          fontFamily: '"DM Sans", system-ui, sans-serif',
        }}
      >
        {content}
      </div>
    </div>
  );
}

// ─── Assistant message: structured render ─────────────────────────────

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

interface AssistantMessageProps {
  content: string;
  testIndex: Map<string, CatalogueLookupTest>;
  cart: { test_id: string }[];
  onAdd: (test: CatalogueLookupTest) => void;
  onView: (testId: string) => void;
}

const AssistantMessage = ({
  content,
  testIndex,
  cart,
  onAdd,
  onView,
}: AssistantMessageProps) => {
  const codes = extractCodes(content);
  const referencedTests = codes
    .map((c) => testIndex.get(c))
    .filter((t): t is CatalogueLookupTest => !!t);

  return (
    <div className="flex gap-3">
      {/* AV avatar dot */}
      <div
        className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center mt-0.5"
        style={{
          backgroundColor: "#0f2614",
          border: "1px solid #c4973a",
        }}
      >
        <span style={{ color: "#c4973a", fontSize: "10px", fontWeight: 700 }}>AV</span>
      </div>

      <div
        className="flex-1 pl-4 min-w-0"
        style={{ borderLeft: "4px solid #2d6b35" }}
      >
        <RenderMarkdown content={content} />

        {referencedTests.length > 0 && (
          <div
            className="mt-4 pt-3 flex flex-col gap-2"
            style={{ borderTop: "1px solid #2d6b35" }}
          >
            {referencedTests.map((t) => {
              const inCart = cart.some((c) => c.test_id === t.id);
              const canAdd = t.price_cad != null;
              return (
                <div
                  key={t.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                >
                  <div className="min-w-0 flex items-baseline gap-2 flex-wrap">
                    <span style={{ color: "#ffffff" }}>{t.name}</span>
                    <span style={{ color: "#c4973a", fontWeight: 600 }}>
                      —{" "}
                      {t.price_cad != null
                        ? `${formatCurrency(t.price_cad)} CAD`
                        : "Contact us"}
                    </span>
                  </div>
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
};

// ─── Markdown subset renderer ─────────────────────────────────────────

function RenderMarkdown({ content }: { content: string }) {
  const lines = content.split("\n");
  const blocks: React.ReactNode[] = [];
  let bulletBuffer: string[] = [];
  let key = 0;

  const flushBullets = () => {
    if (bulletBuffer.length === 0) return;
    blocks.push(
      <ul key={key++} className="my-2 space-y-1.5 list-none pl-0">
        {bulletBuffer.map((b, i) => (
          <li key={i} className="flex gap-2 text-sm" style={{ color: "#ffffff" }}>
            <span style={{ color: "#c4973a", lineHeight: 1.5 }}>•</span>
            <span className="flex-1">{renderInline(b)}</span>
          </li>
        ))}
      </ul>
    );
    bulletBuffer = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trim();

    if (line === "") {
      flushBullets();
      continue;
    }

    if (line === "---") {
      flushBullets();
      blocks.push(
        <hr
          key={key++}
          className="my-3"
          style={{ border: "none", borderTop: "1px solid #2d6b35" }}
        />
      );
      continue;
    }

    if (line.startsWith("## ")) {
      flushBullets();
      blocks.push(
        <p
          key={key++}
          className="mt-4 mb-2 font-semibold uppercase"
          style={{
            color: "#c4973a",
            fontSize: "11px",
            letterSpacing: "0.15em",
          }}
        >
          {line.slice(3).trim()}
        </p>
      );
      continue;
    }

    if (line.startsWith("- ")) {
      bulletBuffer.push(line.slice(2));
      continue;
    }

    flushBullets();

    // Closing italic disclaimer line: an entire line wrapped in single asterisks
    const fullItalic = /^\*([^*]+)\*$/.exec(line);
    if (fullItalic) {
      blocks.push(
        <p
          key={key++}
          className="mt-3 italic"
          style={{ color: "#6ab04c", fontSize: "12px" }}
        >
          {fullItalic[1]}
        </p>
      );
      continue;
    }

    // Default paragraph
    blocks.push(
      <p
        key={key++}
        className="my-2"
        style={{ color: "#ffffff", fontSize: "15px", lineHeight: 1.55 }}
      >
        {renderInline(line)}
      </p>
    );
  }

  flushBullets();
  return <>{blocks}</>;
}

// Inline parser: **bold**, *italic*
function renderInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let lastIdx = 0;
  let key = 0;
  let m: RegExpExecArray | null;

  while ((m = regex.exec(text)) !== null) {
    if (m.index > lastIdx) {
      parts.push(text.slice(lastIdx, m.index));
    }
    const token = m[0];
    if (token.startsWith("**")) {
      parts.push(
        <strong key={key++} style={{ color: "#ffffff", fontWeight: 700 }}>
          {token.slice(2, -2)}
        </strong>
      );
    } else {
      parts.push(
        <em
          key={key++}
          className="italic"
          style={{ color: "#e8d5a3", fontSize: "0.95em" }}
        >
          {token.slice(1, -1)}
        </em>
      );
    }
    lastIdx = m.index + token.length;
  }
  if (lastIdx < text.length) {
    parts.push(text.slice(lastIdx));
  }
  return <>{parts}</>;
}
