import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      path,
      referrer,
      session_id,
      org_id,
      account_id,
      user_agent,
      device_type,
    } = body as {
      path: string;
      referrer?: string;
      session_id?: string;
      org_id?: string;
      account_id?: string;
      user_agent?: string;
      device_type?: string;
    };

    if (!path) {
      return NextResponse.json({ error: "path required" }, { status: 400 });
    }

    const supabase = createServiceRoleClient();

    // Hard-exclude admin accounts — never record their activity.
    if (account_id) {
      const { data: acc } = await supabase
        .from("accounts")
        .select("role")
        .eq("id", account_id)
        .single();
      if (acc && (acc as { role: string }).role === "admin") {
        return NextResponse.json({ ok: true });
      }
    }

    await supabase.from("page_views").insert({
      path,
      referrer: referrer || null,
      session_id: session_id || null,
      org_id: org_id || null,
      account_id: account_id || null,
      user_agent: user_agent || null,
      device_type: device_type || null,
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true });
  }
}
