"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  Loader2,
  AlertCircle,
  Printer,
  RefreshCw,
  Pill,
  Heart,
  FlaskConical,
  ListChecks,
  Activity,
  Lightbulb,
  ExternalLink,
} from "lucide-react";
import type {
  InterpretationReport,
  MarkerStatus,
} from "@/lib/ai-interpretation-prompt";

interface Props {
  resultId: string;
  fileName: string;
  uploadedAt: string;
}

const SUPPLEMENTS_SHOP_URL =
  "https://shop.avovita.ca/collections/supplements-products";
const CATALOGUE_URL =
  (process.env.NEXT_PUBLIC_APP_URL ?? "https://portal.avovita.ca").replace(
    /\/$/,
    ""
  ) + "/tests";

function generateReportId(): string {
  // 8-char uppercase alphanumeric (no ambiguous chars)
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 8; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function InterpretationClient({ resultId, fileName, uploadedAt }: Props) {
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "error"; message: string }
    | { status: "ready"; report: InterpretationReport }
  >({ status: "loading" });
  const reportId = useMemo(() => generateReportId(), []);
  const generatedAt = useMemo(() => new Date().toISOString(), []);

  const runInterpretation = async () => {
    setState({ status: "loading" });
    try {
      const res = await fetch("/api/portal/interpret", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ result_id: resultId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setState({
          status: "error",
          message: data.error ?? `Request failed (HTTP ${res.status})`,
        });
        return;
      }
      setState({ status: "ready", report: data.report });
    } catch (err) {
      setState({
        status: "error",
        message:
          err instanceof Error
            ? err.message
            : "Network error — please try again.",
      });
    }
  };

  useEffect(() => {
    runInterpretation();
    // runs once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (state.status === "loading") {
    return <LoadingState />;
  }
  if (state.status === "error") {
    return <ErrorState message={state.message} onRetry={runInterpretation} />;
  }

  return (
    <div
      className="min-h-screen interpretation-root"
      style={{ backgroundColor: "#0a1a0d" }}
    >
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        {/* Print / back controls — hidden when printing */}
        <div className="ai-no-print mb-5 flex items-center justify-between gap-3">
          <Link
            href="/portal/results"
            className="text-sm"
            style={{ color: "#e8d5a3" }}
          >
            ← Back to My Results
          </Link>
          <button
            type="button"
            onClick={() => window.print()}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border transition-colors"
            style={{
              backgroundColor: "transparent",
              borderColor: "#c4973a",
              color: "#c4973a",
            }}
          >
            <Printer className="w-4 h-4" />
            Print / Save PDF
          </button>
        </div>

        {/* Header card */}
        <section
          className="rounded-2xl border p-6 sm:p-8 mb-6 print-safe"
          style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
        >
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-5">
            <div
              className="rounded-xl px-4 py-3"
              style={{ backgroundColor: "#0f2614" }}
            >
              <Image
                src="/logo-white.png"
                alt="AvoVita Wellness"
                width={140}
                height={32}
                priority
              />
            </div>
            <div className="flex-1 min-w-0">
              <p
                className="text-xs uppercase tracking-wider font-semibold"
                style={{ color: "#c4973a", letterSpacing: "0.15em" }}
              >
                AI Lab Interpretation Report
              </p>
              <p
                className="font-heading text-xl sm:text-2xl"
                style={{
                  color: "#ffffff",
                  fontFamily: '"Cormorant Garamond", Georgia, serif',
                }}
              >
                {fileName}
              </p>
              <p className="text-xs mt-1" style={{ color: "#6ab04c" }}>
                Report #{reportId} · Generated {formatDate(generatedAt)} · Source uploaded {formatDate(uploadedAt)}
              </p>
            </div>
          </div>

          <div
            className="rounded-lg border p-4 text-sm"
            style={{
              backgroundColor: "rgba(224, 82, 82, 0.08)",
              borderColor: "#e05252",
              color: "#ffffff",
            }}
          >
            <p>
              <strong style={{ color: "#e05252" }}>Important disclaimer:</strong>{" "}
              This report is AI-generated educational content only. It is not
              medical advice, not a clinical diagnosis, and should not replace
              consultation with a qualified healthcare provider.
            </p>
          </div>
        </section>

        {/* 1 — Results at a glance */}
        <Section
          icon={<Activity className="w-5 h-5" />}
          title="Results at a Glance"
          subtitle="A quick status check across the markers on your report"
        >
          {state.report.results_at_a_glance.length === 0 ? (
            <EmptyRow text="No marker values were extracted from this report." />
          ) : (
            <div className="overflow-x-auto -mx-2 sm:mx-0">
              <table className="w-full text-sm">
                <thead>
                  <tr
                    className="text-left text-xs uppercase tracking-wider"
                    style={{ color: "#c4973a" }}
                  >
                    <th className="px-3 py-2">Marker</th>
                    <th className="px-3 py-2">Value</th>
                    <th className="px-3 py-2">Range</th>
                    <th className="px-3 py-2 text-right">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {state.report.results_at_a_glance.map((row, i) => (
                    <tr
                      key={i}
                      style={{
                        backgroundColor: i % 2 === 0 ? "#0f2614" : "transparent",
                        color: "#ffffff",
                      }}
                    >
                      <td className="px-3 py-2.5 align-top">{row.marker}</td>
                      <td className="px-3 py-2.5 align-top whitespace-nowrap">
                        {row.value}
                        {row.unit ? ` ${row.unit}` : ""}
                      </td>
                      <td
                        className="px-3 py-2.5 align-top text-xs"
                        style={{ color: "#e8d5a3" }}
                      >
                        {row.reference_range || "—"}
                      </td>
                      <td className="px-3 py-2.5 align-top text-right">
                        <StatusBadge status={row.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        {/* 2 — What this may indicate */}
        <Section
          icon={<Lightbulb className="w-5 h-5" />}
          title="What This May Indicate"
          subtitle="Plain-language interpretation — not a diagnosis"
        >
          <p
            className="text-sm leading-relaxed whitespace-pre-line"
            style={{ color: "#ffffff" }}
          >
            {state.report.what_this_may_indicate}
          </p>
        </Section>

        {/* 3 — Follow-up testing */}
        <Section
          icon={<FlaskConical className="w-5 h-5" />}
          title="Follow-Up Testing to Consider"
          subtitle="Relevant tests available through AvoVita"
          headerRight={
            <Link
              href="/tests"
              target="_blank"
              className="ai-no-print text-xs font-semibold inline-flex items-center gap-1"
              style={{ color: "#c4973a" }}
            >
              Browse catalogue
              <ExternalLink className="w-3 h-3" />
            </Link>
          }
        >
          {state.report.follow_up_testing.length === 0 ? (
            <EmptyRow text="No additional testing recommended based on these results." />
          ) : (
            <ul className="space-y-3">
              {state.report.follow_up_testing.map((t, i) => (
                <li
                  key={i}
                  className="rounded-lg border p-4"
                  style={{ backgroundColor: "#0f2614", borderColor: "#2d6b35" }}
                >
                  <a
                    href={CATALOGUE_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ai-no-print font-semibold text-sm inline-flex items-center gap-1.5"
                    style={{ color: "#c4973a" }}
                  >
                    {t.test_name}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                  <span
                    className="ai-print-only font-semibold text-sm hidden"
                    style={{ color: "#c4973a" }}
                  >
                    {t.test_name}
                  </span>
                  <p
                    className="mt-1 text-sm leading-relaxed"
                    style={{ color: "#ffffff" }}
                  >
                    {t.reason}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Section>

        {/* 4 — Supplement considerations */}
        <Section
          icon={<Pill className="w-5 h-5" />}
          title="Nutrition & Supplement Considerations"
          subtitle="AvoVita supplements aligned with your markers"
          headerRight={
            <a
              href={SUPPLEMENTS_SHOP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="ai-no-print text-xs font-semibold inline-flex items-center gap-1"
              style={{ color: "#c4973a" }}
            >
              Shop supplements
              <ExternalLink className="w-3 h-3" />
            </a>
          }
        >
          {state.report.supplement_considerations.length === 0 ? (
            <EmptyRow text="No supplement considerations flagged." />
          ) : (
            <ul className="space-y-3">
              {state.report.supplement_considerations.map((s, i) => (
                <li
                  key={i}
                  className="rounded-lg border p-4 flex flex-col sm:flex-row sm:items-start gap-3"
                  style={{ backgroundColor: "#0f2614", borderColor: "#2d6b35" }}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-xs uppercase tracking-wider" style={{ color: "#8dc63f" }}>
                      {s.marker}
                    </p>
                    <a
                      href={SUPPLEMENTS_SHOP_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ai-no-print font-semibold text-sm inline-flex items-center gap-1.5"
                      style={{ color: "#c4973a" }}
                    >
                      {s.supplement_name}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                    <span
                      className="ai-print-only font-semibold text-sm hidden"
                      style={{ color: "#c4973a" }}
                    >
                      {s.supplement_name}
                    </span>
                    <p
                      className="mt-1 text-sm leading-relaxed"
                      style={{ color: "#ffffff" }}
                    >
                      {s.reason}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>

        {/* 5 — Lifestyle */}
        <Section
          icon={<Heart className="w-5 h-5" />}
          title="Lifestyle Factors to Explore"
          subtitle="Sleep, stress, nutrition and wellness prompts"
        >
          {state.report.lifestyle_factors.length === 0 ? (
            <EmptyRow text="No lifestyle factors flagged." />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {state.report.lifestyle_factors.map((l, i) => (
                <div
                  key={i}
                  className="rounded-lg border p-4"
                  style={{ backgroundColor: "#0f2614", borderColor: "#2d6b35" }}
                >
                  <p
                    className="text-xs uppercase tracking-wider mb-1 font-semibold"
                    style={{ color: "#8dc63f" }}
                  >
                    {l.factor}
                  </p>
                  <p
                    className="text-sm leading-relaxed"
                    style={{ color: "#ffffff" }}
                  >
                    {l.recommendation}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* 6 — Next steps */}
        <Section
          icon={<ListChecks className="w-5 h-5" />}
          title="Your Next Steps"
          subtitle="Three actions you can take this week"
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[0, 1, 2].map((i) => {
              const step = state.report.next_steps[i];
              if (!step) return null;
              return (
                <div
                  key={i}
                  className="rounded-lg border p-4 flex flex-col gap-2"
                  style={{ backgroundColor: "#0f2614", borderColor: "#c4973a" }}
                >
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center font-bold"
                    style={{ backgroundColor: "#c4973a", color: "#0a1a0d" }}
                  >
                    {i + 1}
                  </div>
                  <p
                    className="text-sm leading-relaxed"
                    style={{ color: "#ffffff" }}
                  >
                    {step}
                  </p>
                </div>
              );
            })}
          </div>
        </Section>

        <p
          className="ai-no-print text-xs text-center mt-8"
          style={{ color: "#6ab04c" }}
        >
          Educational only — not a diagnosis. Always discuss results with a
          qualified healthcare provider.
        </p>
      </div>
    </div>
  );
}

// ─── Subcomponents ────────────────────────────────────────────────────

function Section({
  icon,
  title,
  subtitle,
  headerRight,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section
      className="rounded-2xl border p-5 sm:p-6 mb-5 print-safe"
      style={{ backgroundColor: "#1a3d22", borderColor: "#2d6b35" }}
    >
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-start gap-3">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
            style={{
              backgroundColor: "#0f2614",
              border: "1px solid #c4973a",
              color: "#c4973a",
            }}
          >
            {icon}
          </div>
          <div>
            <h2
              className="font-heading font-semibold text-xl sm:text-2xl leading-tight"
              style={{
                color: "#ffffff",
                fontFamily: '"Cormorant Garamond", Georgia, serif',
              }}
            >
              {title}
            </h2>
            {subtitle && (
              <p className="text-xs mt-0.5" style={{ color: "#6ab04c" }}>
                {subtitle}
              </p>
            )}
          </div>
        </div>
        {headerRight && <div className="shrink-0">{headerRight}</div>}
      </div>
      {children}
    </section>
  );
}

function StatusBadge({ status }: { status: MarkerStatus }) {
  const palette =
    status === "HIGH" || status === "LOW"
      ? { bg: "rgba(224,82,82,0.12)", fg: "#e05252", border: "#e05252" }
      : { bg: "rgba(141,198,63,0.12)", fg: "#8dc63f", border: "#8dc63f" };
  return (
    <span
      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border"
      style={{
        backgroundColor: palette.bg,
        color: palette.fg,
        borderColor: palette.border,
      }}
    >
      {status}
    </span>
  );
}

function EmptyRow({ text }: { text: string }) {
  return (
    <p
      className="text-sm italic px-3 py-4 rounded-lg text-center border"
      style={{
        color: "#6ab04c",
        backgroundColor: "#0f2614",
        borderColor: "#2d6b35",
      }}
    >
      {text}
    </p>
  );
}

function LoadingState() {
  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ backgroundColor: "#0a1a0d" }}
    >
      <div className="text-center">
        <div
          className="rounded-2xl px-6 py-5 mx-auto mb-6 inline-block"
          style={{ backgroundColor: "#1a3d22", border: "1px solid #2d6b35" }}
        >
          <Image
            src="/logo-white.png"
            alt="AvoVita Wellness"
            width={160}
            height={36}
            priority
          />
        </div>
        <div className="flex items-center justify-center gap-2.5 mb-3">
          <Loader2
            className="w-5 h-5 animate-spin"
            style={{ color: "#c4973a" }}
          />
          <p
            className="font-heading text-xl"
            style={{
              color: "#c4973a",
              fontFamily: '"Cormorant Garamond", Georgia, serif',
            }}
          >
            Analyzing your results…
          </p>
        </div>
        <p className="text-sm" style={{ color: "#6ab04c" }}>
          This can take up to a minute.
        </p>
      </div>
    </div>
  );
}

function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ backgroundColor: "#0a1a0d" }}
    >
      <div className="w-full max-w-md text-center">
        <div
          className="rounded-2xl border p-8"
          style={{ backgroundColor: "#1a3d22", borderColor: "#e05252" }}
        >
          <div className="flex justify-center mb-4">
            <AlertCircle
              className="w-12 h-12"
              style={{ color: "#e05252" }}
            />
          </div>
          <h1
            className="font-heading text-2xl font-semibold mb-2"
            style={{
              color: "#ffffff",
              fontFamily: '"Cormorant Garamond", Georgia, serif',
            }}
          >
            Interpretation unavailable
          </h1>
          <p className="text-sm mb-5" style={{ color: "#e8d5a3" }}>
            {message}
          </p>
          <div className="flex flex-col sm:flex-row gap-2 justify-center">
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors"
              style={{ backgroundColor: "#c4973a", color: "#0a1a0d" }}
            >
              <RefreshCw className="w-4 h-4" />
              Try again
            </button>
            <Link
              href="/portal/results"
              className="inline-flex items-center justify-center px-5 py-2.5 rounded-lg text-sm font-semibold border"
              style={{
                backgroundColor: "transparent",
                borderColor: "#2d6b35",
                color: "#e8d5a3",
              }}
            >
              Back to results
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
