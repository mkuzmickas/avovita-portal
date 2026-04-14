import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import {
  INTERPRETATION_SYSTEM_PROMPT,
  type InterpretationReport,
} from "@/lib/ai-interpretation-prompt";

export const runtime = "nodejs";
// Claude PDF calls can run ~30-60s on larger reports; allow up to 300s.
export const maxDuration = 300;

/**
 * POST /api/portal/interpret
 * Body: { result_id: string }
 *
 * 1. Verifies the caller is signed in and owns the requested result
 *    (via results.profile → patient_profiles.account_id match).
 * 2. Downloads the PDF from private Supabase Storage.
 * 3. Sends it to Anthropic Claude as a document content block alongside
 *    the interpretation system prompt.
 * 4. Parses the model's JSON response and returns it to the client.
 *
 * Feature-gated behind NEXT_PUBLIC_ENABLE_AI_INTERPRETATION. When the
 * flag is not "true" the route returns 404 so the feature is invisible.
 */
export async function POST(request: NextRequest) {
  if (process.env.NEXT_PUBLIC_ENABLE_AI_INTERPRETATION !== "true") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const resultId: string | undefined = body.result_id;
    if (!resultId) {
      return NextResponse.json(
        { error: "result_id is required" },
        { status: 400 }
      );
    }

    const service = createServiceRoleClient();
    const { data: resultRow } = await service
      .from("results")
      .select(
        "id, storage_path, file_name, profile:patient_profiles(account_id)"
      )
      .eq("id", resultId)
      .maybeSingle();
    type Row = {
      id: string;
      storage_path: string;
      file_name: string;
      profile:
        | { account_id: string }
        | { account_id: string }[]
        | null;
    };
    const row = resultRow as Row | null;
    if (!row) {
      return NextResponse.json({ error: "Result not found" }, { status: 404 });
    }
    const profileAccountId = Array.isArray(row.profile)
      ? row.profile[0]?.account_id
      : row.profile?.account_id;
    if (profileAccountId !== user.id) {
      return NextResponse.json(
        { error: "This result does not belong to you" },
        { status: 403 }
      );
    }
    if (row.storage_path.startsWith("__")) {
      return NextResponse.json(
        { error: "This result has no PDF attached." },
        { status: 400 }
      );
    }

    // Fetch PDF bytes from private storage
    const { data: fileData, error: downloadErr } = await service.storage
      .from("results-pdfs")
      .download(row.storage_path);
    if (downloadErr || !fileData) {
      console.error("[interpret] storage download failed", downloadErr);
      return NextResponse.json(
        { error: "Could not load the result PDF." },
        { status: 500 }
      );
    }
    const pdfBase64 = Buffer.from(await fileData.arrayBuffer()).toString(
      "base64"
    );

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.error("[interpret] ANTHROPIC_API_KEY missing");
      return NextResponse.json(
        { error: "AI service not configured." },
        { status: 503 }
      );
    }

    const anthropic = new Anthropic({ apiKey });
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      system: INTERPRETATION_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: pdfBase64,
              },
            },
            {
              type: "text",
              text: "Analyze the attached lab report and return the structured JSON as instructed.",
            },
          ],
        },
      ],
    });

    const textBlock = message.content.find((c) => c.type === "text");
    const rawText =
      textBlock && textBlock.type === "text" ? textBlock.text : "";
    if (!rawText) {
      console.error("[interpret] no text block in response", message);
      return NextResponse.json(
        { error: "AI returned an empty response. Please try again." },
        { status: 502 }
      );
    }

    // Claude sometimes wraps JSON in a ```json fence even with explicit
    // instructions not to — strip defensively.
    const jsonText = rawText
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();

    let parsed: InterpretationReport;
    try {
      parsed = JSON.parse(jsonText) as InterpretationReport;
    } catch (parseErr) {
      console.error(
        "[interpret] JSON parse failed",
        parseErr,
        "raw:",
        rawText.slice(0, 500)
      );
      return NextResponse.json(
        {
          error:
            "AI returned a response in an unexpected format. Please try again.",
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      report: parsed,
      file_name: row.file_name,
    });
  } catch (err) {
    console.error("[interpret] handler error", err);
    const status =
      (err as { status?: number } | undefined)?.status ?? 500;
    const message =
      err instanceof Error ? err.message : "Interpretation failed.";
    return NextResponse.json({ error: message }, { status });
  }
}
