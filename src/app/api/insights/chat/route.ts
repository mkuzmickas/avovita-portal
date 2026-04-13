import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { SYSTEM_PROMPT } from "@/lib/systemPrompt";

export const runtime = "nodejs";

const CATALOG_TTL_MS = 5 * 60 * 1000;

let cachedCatalog: { value: string; expiresAt: number } | null = null;

async function buildTestCatalog(): Promise<string> {
  const now = Date.now();
  if (cachedCatalog && cachedCatalog.expiresAt > now) {
    return cachedCatalog.value;
  }

  try {
    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from("tests")
      .select("name, sku, price_cad, lab:labs(name)")
      .eq("active", true)
      .order("name", { ascending: true });

    if (error) {
      console.error("[chat] Failed to load tests from Supabase:", error.message);
      return cachedCatalog?.value ?? "";
    }

    type Row = {
      name: string;
      sku: string | null;
      price_cad: number | null;
      lab: { name: string } | { name: string }[] | null;
    };
    const rows = (data ?? []) as unknown as Row[];

    const lines = rows.map((t) => {
      const lab = Array.isArray(t.lab) ? t.lab[0] : t.lab;
      const labName = lab?.name ?? "—";
      const code = t.sku ?? "—";
      const price =
        t.price_cad != null ? `$${t.price_cad} CAD` : "Contact us for pricing";
      return `- ${t.name} | Code: ${code} | ${price} | Lab: ${labName}`;
    });

    const value =
      "\n\n## AvoVita Test Directory\n\nThe following tests are available through AvoVita. You MUST only recommend tests from this list — never recommend a test that does not appear here.\n\n" +
      lines.join("\n");

    cachedCatalog = { value, expiresAt: now + CATALOG_TTL_MS };
    return value;
  } catch (err) {
    console.error("[chat] Unexpected error loading test catalog:", err);
    return cachedCatalog?.value ?? "";
  }
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  let messages: ChatMessage[];
  try {
    const body = await request.json();
    messages = body.messages;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: "Messages array is required." }, { status: 400 });
  }

  const sanitised = messages
    .filter(
      (m) =>
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string" &&
        m.content.trim().length > 0
    )
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content.trim() }));

  if (sanitised.length === 0) {
    return NextResponse.json({ error: "No valid messages provided." }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  console.log("[chat] ANTHROPIC_API_KEY exists:", !!apiKey);
  if (!apiKey) {
    console.error("[chat] ANTHROPIC_API_KEY is not set — check .env.local and restart the dev server.");
    return NextResponse.json(
      { error: "AI service is not configured. Contact support." },
      { status: 503 }
    );
  }

  const client = new Anthropic({ apiKey });

  try {
    const catalog = await buildTestCatalog();
    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: SYSTEM_PROMPT + catalog,
      messages: sanitised,
    });

    const text = message.content[0]?.type === "text" ? message.content[0].text : null;
    if (!text) {
      console.error("[chat] Unexpected response shape:", JSON.stringify(message));
      return NextResponse.json(
        { error: "Received an unexpected response from the AI. Please try again." },
        { status: 502 }
      );
    }

    return NextResponse.json({ content: text });
  } catch (err) {
    const apiErr = err as { status?: number; message?: string };
    console.error("[chat] Anthropic SDK error:", apiErr.status, apiErr.message, err);

    if (apiErr.status === 429) {
      return NextResponse.json(
        { error: "The AI service is currently busy. Please wait a moment and try again." },
        { status: 429 }
      );
    }
    if (apiErr.status === 401) {
      return NextResponse.json(
        { error: "AI service authentication failed. Check the API key." },
        { status: 502 }
      );
    }
    return NextResponse.json(
      { error: `AI service error${apiErr.message ? ": " + apiErr.message : ""}. Please try again.` },
      { status: 502 }
    );
  }
}
