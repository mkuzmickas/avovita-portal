import React from "react";

/**
 * Minimal inline-markdown renderer for **bold** and *italic* in test
 * descriptions and chat messages. Kept intentionally small — full
 * markdown (tables, code blocks, links) would need a real library and
 * neither surface needs those.
 *
 * Extracted so the catalogue cards + chat modal use the same parser;
 * before, TestCard and TestTable rendered descriptions as plain text
 * and asterisks showed through, so "Must be booked on a **Tuesday**"
 * displayed literally in the CBC card. Chat had its own parser that
 * did handle bold/italic, so the two surfaces disagreed on the same
 * content string.
 */
export function renderInline(text: string): React.ReactNode {
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
        <strong key={key++} style={{ fontWeight: 700 }}>
          {token.slice(2, -2)}
        </strong>,
      );
    } else {
      parts.push(
        <em key={key++} className="italic">
          {token.slice(1, -1)}
        </em>,
      );
    }
    lastIdx = m.index + token.length;
  }
  if (lastIdx < text.length) {
    parts.push(text.slice(lastIdx));
  }
  return <>{parts}</>;
}
