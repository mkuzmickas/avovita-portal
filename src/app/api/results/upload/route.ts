import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    // Authenticate and verify admin role
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: account } = await supabase
      .from("accounts")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!account || account.role !== "admin") {
      return NextResponse.json({ error: "Forbidden — admin only" }, { status: 403 });
    }

    // Parse multipart form
    const formData = await request.formData();
    const orderLineId = formData.get("order_line_id") as string;
    const profileId = formData.get("profile_id") as string;
    const labReferenceNumber = formData.get("lab_reference_number") as string | null;
    const file = formData.get("file") as File | null;

    if (!orderLineId || !profileId || !file) {
      return NextResponse.json(
        { error: "Missing required fields: order_line_id, profile_id, file" },
        { status: 400 }
      );
    }

    if (file.type !== "application/pdf") {
      return NextResponse.json(
        { error: "Only PDF files are accepted" },
        { status: 400 }
      );
    }

    const serviceClient = createServiceRoleClient();

    // Build storage path
    const timestamp = Date.now();
    const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = `results/${profileId}/${orderLineId}/${timestamp}_${safeFileName}`;

    // Upload to private Supabase storage bucket
    const fileBuffer = await file.arrayBuffer();
    const { error: uploadError } = await serviceClient.storage
      .from("results-pdfs")
      .upload(storagePath, fileBuffer, {
        contentType: "application/pdf",
        upsert: false,
      });

    if (uploadError) {
      console.error("Storage upload error:", uploadError);
      return NextResponse.json(
        { error: `Upload failed: ${uploadError.message}` },
        { status: 500 }
      );
    }

    // Insert result record
    const { data: result, error: resultError } = await serviceClient
      .from("results")
      .insert({
        order_line_id: orderLineId,
        profile_id: profileId,
        lab_reference_number: labReferenceNumber ?? null,
        storage_path: storagePath,
        file_name: file.name,
        uploaded_by: user.id,
      })
      .select()
      .single();

    if (resultError || !result) {
      // Attempt to clean up orphaned file
      await serviceClient.storage.from("results-pdfs").remove([storagePath]);
      return NextResponse.json(
        { error: `Failed to save result record: ${resultError?.message}` },
        { status: 500 }
      );
    }

    // Trigger notification
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://portal.avovita.ca";
    await fetch(`${appUrl}/api/notify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ result_id: result.id }),
    });

    return NextResponse.json({ result_id: result.id, success: true });
  } catch (error) {
    console.error("Result upload error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
