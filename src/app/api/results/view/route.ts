import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateSignedResultUrl } from "@/lib/server-utils";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { result_id } = await request.json();

    if (!result_id) {
      return NextResponse.json({ error: "Missing result_id" }, { status: 400 });
    }

    // Fetch result — RLS ensures only own profile results are returned
    const { data: result, error } = await supabase
      .from("results")
      .select("id, storage_path, profile_id")
      .eq("id", result_id)
      .single();

    if (error || !result) {
      return NextResponse.json({ error: "Result not found" }, { status: 404 });
    }

    // Generate signed URL (1 hour)
    const url = await generateSignedResultUrl(result.storage_path);

    // Mark as viewed if not already (update viewed_at via RLS-allowed update)
    await supabase
      .from("results")
      .update({ viewed_at: new Date().toISOString() })
      .eq("id", result.id)
      .is("viewed_at", null);

    return NextResponse.json({ url });
  } catch (error) {
    console.error("View result error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
