"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

// ─── Patch record ──────────────────────────────────────────────

async function recordPatch(
  projectId: string,
  summary: string,
  ops: Record<string, unknown>[],
  generatedBy: "user" | "llm" = "user",
) {
  const supabase = await createServerSupabaseClient();

  // Get current max version
  const { data: latest } = await supabase
    .from("patches")
    .select("base_version")
    .eq("project_id", projectId)
    .order("base_version", { ascending: false })
    .limit(1)
    .single();

  const baseVersion = latest?.base_version ? latest.base_version + 1 : 1;

  await supabase.from("patches").insert({
    project_id: projectId,
    doc: {
      id: `pat_${Date.now()}`,
      projectId,
      ops,
      summary,
      generatedBy,
      status: "applied",
      createdAt: new Date().toISOString(),
      baseVersion,
    },
    status: "applied",
    base_version: baseVersion,
  });

  return baseVersion;
}

// ─── Token operations ──────────────────────────────────────────

export async function renameToken(
  projectId: string,
  tokenId: string,
  newName: string,
) {
  const supabase = await createServerSupabaseClient();

  // Get current token doc
  const { data: row } = await supabase
    .from("tokens")
    .select("id, doc")
    .eq("id", tokenId)
    .single();

  if (!row) throw new Error("Token not found");

  const doc = row.doc as Record<string, unknown>;
  const oldName = String(doc.name ?? "");
  doc.name = newName;

  await supabase.from("tokens").update({ doc }).eq("id", tokenId);

  const version = await recordPatch(projectId, `Rename token "${oldName}" → "${newName}"`, [
    { op: "token.update", tokenId, changes: { name: newName } },
  ]);

  revalidatePath(`/projects/${projectId}/inspect`);
  return { version };
}

export async function deleteToken(
  projectId: string,
  tokenId: string,
  fallback: "literal" | "remap",
  remapTargetId?: string,
) {
  const supabase = await createServerSupabaseClient();

  const { data: row } = await supabase
    .from("tokens")
    .select("id, doc")
    .eq("id", tokenId)
    .single();

  if (!row) throw new Error("Token not found");
  const tokenName = String((row.doc as Record<string, unknown>).name ?? "");

  // Delete the token
  await supabase.from("tokens").delete().eq("id", tokenId);

  const fallbackDesc = fallback === "remap" && remapTargetId
    ? { replacementTokenId: remapTargetId }
    : "inline-literal";

  const version = await recordPatch(
    projectId,
    `Delete token "${tokenName}" (${fallback === "remap" ? "remapped" : "inlined as flagged literals"})`,
    [{ op: "token.delete", tokenId, fallback: fallbackDesc }],
  );

  revalidatePath(`/projects/${projectId}/inspect`);
  return { version };
}

export async function mergeTokens(
  projectId: string,
  sourceTokenId: string,
  targetTokenId: string,
) {
  const supabase = await createServerSupabaseClient();

  const { data: sourceRow } = await supabase.from("tokens").select("doc").eq("id", sourceTokenId).single();
  const { data: targetRow } = await supabase.from("tokens").select("doc").eq("id", targetTokenId).single();

  if (!sourceRow || !targetRow) throw new Error("Token not found");

  const sourceName = String((sourceRow.doc as Record<string, unknown>).name ?? "");
  const targetName = String((targetRow.doc as Record<string, unknown>).name ?? "");

  // Delete source token (merged into target)
  await supabase.from("tokens").delete().eq("id", sourceTokenId);

  const version = await recordPatch(
    projectId,
    `Merge token "${sourceName}" into "${targetName}"`,
    [{ op: "token.merge", sourceTokenIds: [sourceTokenId], targetTokenId }],
  );

  revalidatePath(`/projects/${projectId}/inspect`);
  return { version };
}

// ─── Component operations ──────────────────────────────────────

export async function approveComponent(
  projectId: string,
  componentId: string,
) {
  const supabase = await createServerSupabaseClient();

  const { data: row } = await supabase
    .from("components")
    .select("id, doc, version")
    .eq("id", componentId)
    .single();

  if (!row) throw new Error("Component not found");

  const doc = row.doc as Record<string, unknown>;
  const componentName = String(doc.name ?? "");
  doc.status = "approved";

  await supabase
    .from("components")
    .update({ doc, status: "approved", version: (row.version ?? 1) + 1 })
    .eq("id", componentId);

  const version = await recordPatch(
    projectId,
    `Approve component "${componentName}"`,
    [{ op: "component.setStatus", componentId, status: "approved" }],
  );

  revalidatePath(`/projects/${projectId}/inspect`);
  return { version };
}

export async function renameComponent(
  projectId: string,
  componentId: string,
  newName: string,
) {
  const supabase = await createServerSupabaseClient();

  const { data: row } = await supabase
    .from("components")
    .select("id, doc")
    .eq("id", componentId)
    .single();

  if (!row) throw new Error("Component not found");

  const doc = row.doc as Record<string, unknown>;
  const oldName = String(doc.name ?? "");
  doc.name = newName;
  doc.slug = newName.toLowerCase().replace(/[^a-z0-9]+/g, "-");

  await supabase.from("components").update({ doc }).eq("id", componentId);

  const version = await recordPatch(
    projectId,
    `Rename component "${oldName}" → "${newName}"`,
    [{ op: "component.rename", componentId, name: newName }],
  );

  revalidatePath(`/projects/${projectId}/inspect`);
  return { version };
}

// ─── Undo ──────────────────────────────────────────────────────

export async function undoPatch(projectId: string, patchId: string) {
  const supabase = await createServerSupabaseClient();

  await supabase
    .from("patches")
    .update({ status: "undone" })
    .eq("id", patchId);

  // Note: full undo (reverting data changes) would require storing
  // the previous state. For now we just mark the patch as undone.
  // The UI will filter out undone patches.

  revalidatePath(`/projects/${projectId}/inspect`);
}
