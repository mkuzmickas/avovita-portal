"use client";

import { useState } from "react";
import { Link2, Check } from "lucide-react";

/**
 * Small inline block showing a direct link with a copy-to-clipboard button.
 * Used in admin edit forms to generate shareable product URLs.
 */
export function CopyLinkButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement("textarea");
      textarea.value = url;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div
      className="flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs"
      style={{ backgroundColor: "#0f2614", borderColor: "#2d6b35" }}
    >
      <Link2 className="w-3.5 h-3.5 shrink-0" style={{ color: "#6ab04c" }} />
      <span
        className="truncate min-w-0"
        style={{ color: "#e8d5a3" }}
        title={url}
      >
        {url}
      </span>
      <button
        type="button"
        onClick={handleCopy}
        className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold shrink-0 transition-colors"
        style={
          copied
            ? { backgroundColor: "#8dc63f", color: "#0a1a0d" }
            : { backgroundColor: "#c4973a", color: "#0a1a0d" }
        }
      >
        {copied ? (
          <>
            <Check className="w-3 h-3" />
            Copied!
          </>
        ) : (
          "Copy"
        )}
      </button>
    </div>
  );
}
