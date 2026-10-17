import Link from "next/link";
import { Leaf, KeyRound, AlertCircle } from "lucide-react";

/**
 * /auth/reset-start — interstitial page for the password-reset email.
 *
 * The problem this exists to solve: Supabase recovery URLs
 * (/auth/v1/verify?token=…) are ONE-TIME use. Many inboxes
 * (Outlook Safe Links, Gmail/Google Workspace, iOS Mail Protect-My-
 * Activity, corporate antivirus proxies) prefetch every URL in a
 * received email to scan for malware. That prefetch GET consumes the
 * Supabase token, so by the time the actual user clicks, Supabase
 * says "invalid token" and we render "Link expired."
 *
 * Fix: the email link points here instead, carrying the Supabase URL
 * base64url-encoded in the `rt` query param. Prefetchers GET this
 * page and get back a static form — no token consumed. The user
 * clicks the button, which POSTs the token to /api/auth/reset-start,
 * which decodes it and 302-redirects to the real Supabase URL. The
 * Supabase token stays alive until the human actually clicks.
 *
 * This is the same pattern used by GitHub, Vercel, Stripe for the
 * same reason.
 */
export default async function ResetStartPage({
  searchParams,
}: {
  searchParams: Promise<{ rt?: string }>;
}) {
  const { rt } = await searchParams;
  const missing = !rt;

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ backgroundColor: "#FFFFFF" }}
    >
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4 border"
            style={{ backgroundColor: "#FFFFFF", borderColor: "#E5E2D4" }}
          >
            <Leaf className="w-7 h-7" style={{ color: "#88D45D" }} />
          </div>
          <h1
            className="font-heading text-3xl font-semibold"
            style={{
              color: "#092819",
              fontFamily: '"Cormorant Garamond", Georgia, serif',
            }}
          >
            Reset your password
          </h1>
          <p className="mt-2 text-sm" style={{ color: "#154D31" }}>
            One more click confirms it&apos;s really you.
          </p>
        </div>

        <div
          className="rounded-2xl border p-6 sm:p-8"
          style={{ backgroundColor: "#FFFFFF", borderColor: "#E5E2D4" }}
        >
          {missing ? (
            <div className="text-center py-4">
              <AlertCircle
                className="w-10 h-10 mx-auto mb-3"
                style={{ color: "#e05252" }}
              />
              <h2
                className="font-heading text-xl font-semibold mb-2"
                style={{ color: "#092819" }}
              >
                Link incomplete
              </h2>
              <p className="text-sm mb-6" style={{ color: "#154D31" }}>
                This reset link is missing the token. Please request a fresh
                one from the forgot-password page.
              </p>
              <Link
                href="/forgot-password"
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors"
                style={{ backgroundColor: "#C6A04B", color: "#ffffff" }}
              >
                Request a new reset link
              </Link>
            </div>
          ) : (
            <>
              <p
                className="text-sm mb-5"
                style={{ color: "#154D31", lineHeight: 1.5 }}
              >
                Click the button below to open the password-reset form. The
                link is single-use, so we only hand it off when you confirm
                — this prevents email scanners from accidentally consuming
                it before you get there.
              </p>
              <form method="POST" action="/api/auth/reset-start">
                <input type="hidden" name="rt" value={rt} />
                <button
                  type="submit"
                  className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-lg text-base font-semibold transition-colors"
                  style={{ backgroundColor: "#C6A04B", color: "#ffffff" }}
                >
                  <KeyRound className="w-5 h-5" />
                  Reset my password
                </button>
              </form>
              <p
                className="mt-5 text-xs text-center"
                style={{ color: "#88D45D" }}
              >
                Didn&apos;t request this?{" "}
                <Link
                  href="/"
                  style={{ color: "#C6A04B", textDecoration: "underline" }}
                >
                  Ignore this email and nothing happens.
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
