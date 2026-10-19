"use client";

import { useState } from "react";
import { Loader2, Mail, MessageSquare, Check, AlertCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface SettingsClientProps {
  email: string;
  initialEmailNotifications: boolean;
  initialSmsNotifications: boolean;
}

/**
 * Client settings widget handling:
 *   - "Change password" → Supabase password reset email to the current address
 *   - Communication preferences stored in Supabase Auth user_metadata
 *     (email_notifications + sms_notifications booleans). Stored on the
 *     auth user so no schema change is needed.
 */
export function SettingsClient({
  email,
  initialEmailNotifications,
  initialSmsNotifications,
}: SettingsClientProps) {
  const [emailOptIn, setEmailOptIn] = useState(initialEmailNotifications);
  const [smsOptIn, setSmsOptIn] = useState(initialSmsNotifications);

  const [resetting, setResetting] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  const [savingPrefs, setSavingPrefs] = useState(false);
  const [prefsSaved, setPrefsSaved] = useState(false);
  const [prefsError, setPrefsError] = useState<string | null>(null);

  const handleChangePassword = async () => {
    setResetting(true);
    setResetError(null);
    setResetSent(false);

    const supabase = createClient();
    const redirectTo =
      typeof window !== "undefined"
        ? `${window.location.origin}/login`
        : undefined;

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
    });

    if (error) {
      setResetError(error.message);
      setResetting(false);
      return;
    }

    setResetSent(true);
    setResetting(false);
    setTimeout(() => setResetSent(false), 6000);
  };

  const handleSavePrefs = async () => {
    setSavingPrefs(true);
    setPrefsError(null);
    setPrefsSaved(false);

    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({
      data: {
        email_notifications: emailOptIn,
        sms_notifications: smsOptIn,
      },
    });

    if (error) {
      setPrefsError(error.message);
      setSavingPrefs(false);
      return;
    }

    setPrefsSaved(true);
    setSavingPrefs(false);
    setTimeout(() => setPrefsSaved(false), 3000);
  };

  return (
    <div className="space-y-6">
      {/* Account section */}
      <section
        className="rounded-xl border p-6"
        style={{ backgroundColor: "#FFFFFF", borderColor: "#E5E2D4" }}
      >
        <h2
          className="font-heading text-xl font-semibold mb-4"
          style={{
            color: "#092819",
            fontFamily: '"Cormorant Garamond", Georgia, serif',
          }}
        >
          Account
        </h2>

        <div className="space-y-4">
          <div>
            <p
              className="text-xs font-medium uppercase tracking-wider mb-1"
              style={{ color: "#4a7a56" }}
            >
              Email
            </p>
            <p className="text-sm" style={{ color: "#092819" }}>
              {email}
            </p>
          </div>

          <div>
            <p
              className="text-xs font-medium uppercase tracking-wider mb-2"
              style={{ color: "#4a7a56" }}
            >
              Password
            </p>
            <button
              type="button"
              onClick={handleChangePassword}
              disabled={resetting}
              className="mf-btn-secondary px-4 py-2 text-sm"
            >
              {resetting && <Loader2 className="w-4 h-4 animate-spin" />}
              {resetting ? "Sending…" : "Change Password"}
            </button>

            {resetSent && (
              <div
                className="mt-3 flex items-center gap-2 text-sm rounded-lg px-3 py-2 border"
                style={{
                  backgroundColor: "rgba(141, 198, 63, 0.125)",
                  borderColor: "#88D45D",
                  color: "#88D45D",
                }}
              >
                <Check className="w-4 h-4 shrink-0" />
                Password reset email sent to {email}
              </div>
            )}

            {resetError && (
              <div
                className="mt-3 flex items-center gap-2 text-sm rounded-lg px-3 py-2 border"
                style={{
                  backgroundColor: "rgba(224, 82, 82, 0.12)",
                  borderColor: "#e05252",
                  color: "#e05252",
                }}
              >
                <AlertCircle className="w-4 h-4 shrink-0" />
                {resetError}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Communication preferences */}
      <section
        className="rounded-xl border p-6"
        style={{ backgroundColor: "#FFFFFF", borderColor: "#E5E2D4" }}
      >
        <h2
          className="font-heading text-xl font-semibold mb-2"
          style={{
            color: "#092819",
            fontFamily: '"Cormorant Garamond", Georgia, serif',
          }}
        >
          Communication Preferences
        </h2>
        <p className="text-xs mb-5" style={{ color: "#4a7a56" }}>
          Critical transactional notifications (order confirmations,
          results-ready alerts) are always sent regardless of these settings.
        </p>

        <div className="space-y-3">
          <PrefToggle
            icon={Mail}
            label="Email Notifications"
            description="Order updates, reminders, and newsletters"
            value={emailOptIn}
            onChange={setEmailOptIn}
          />
          <PrefToggle
            icon={MessageSquare}
            label="SMS Notifications"
            description="Text messages when results are ready"
            value={smsOptIn}
            onChange={setSmsOptIn}
          />
        </div>

        <div className="mt-5 flex items-center gap-3">
          <button
            type="button"
            onClick={handleSavePrefs}
            disabled={savingPrefs}
            className="mf-btn-primary px-5 py-2.5"
          >
            {savingPrefs && <Loader2 className="w-4 h-4 animate-spin" />}
            {savingPrefs ? "Saving…" : "Save Preferences"}
          </button>

          {prefsSaved && (
            <span
              className="flex items-center gap-1 text-sm font-medium"
              style={{ color: "#88D45D" }}
            >
              <Check className="w-4 h-4" />
              Saved
            </span>
          )}
        </div>

        {prefsError && (
          <div
            className="mt-3 flex items-center gap-2 text-sm rounded-lg px-3 py-2 border"
            style={{
              backgroundColor: "rgba(224, 82, 82, 0.12)",
              borderColor: "#e05252",
              color: "#e05252",
            }}
          >
            <AlertCircle className="w-4 h-4 shrink-0" />
            {prefsError}
          </div>
        )}
      </section>
    </div>
  );
}

function PrefToggle({
  icon: Icon,
  label,
  description,
  value,
  onChange,
}: {
  icon: typeof Mail;
  label: string;
  description: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      role="switch"
      aria-checked={value}
      className="w-full flex items-center gap-3 px-4 py-3 rounded-lg border text-left transition-colors"
      style={{
        backgroundColor: "#F7F6F0",
        borderColor: "#E5E2D4",
      }}
    >
      <Icon className="w-4 h-4 shrink-0" style={{ color: "#88D45D" }} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium" style={{ color: "#092819" }}>
          {label}
        </p>
        <p className="text-xs" style={{ color: "#4a7a56" }}>
          {description}
        </p>
      </div>
      <span
        className="relative inline-block w-10 h-5 rounded-full transition-colors shrink-0"
        style={{ backgroundColor: value ? "#C6A04B" : "#E5E2D4" }}
      >
        <span
          className="absolute top-0.5 w-4 h-4 rounded-full transition-transform"
          style={{
            backgroundColor: value ? "#F7F6F0" : "#154D31",
            transform: value ? "translateX(22px)" : "translateX(2px)",
          }}
        />
      </span>
    </button>
  );
}
