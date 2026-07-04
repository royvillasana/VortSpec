import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ importId: string }> },
) {
  const { importId } = await params;
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("imports")
    .select("id, status, stage_states, error, created_at")
    .eq("id", importId)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Import not found" }, { status: 404 });
  }

  return NextResponse.json(data);
}
