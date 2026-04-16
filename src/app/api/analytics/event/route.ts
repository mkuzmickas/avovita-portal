import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      event_type,
      event_data,
      path,
      session_id,
      org_id,
      account_id,
    } = body as {
      event_type: string;
      event_data?: Record<string, unknown>;
      path?: string;
      session_id?: string;
      org_id?: string;
      account_id?: string;
    };

    if (!event_type) {
      return NextResponse.json(
        { error: "event_type required" },
        { status: 400 },
      );
    }

    const supabase = createServiceRoleClient();
    await supabase.from("analytics_events").insert({
      event_type,
      event_data: event_data ?? null,
      path: path || null,
      session_id: session_id || null,
      org_id: org_id || null,
      account_id: account_id || null,
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true });
  }
}
