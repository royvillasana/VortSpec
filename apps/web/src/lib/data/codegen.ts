"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { generateComponentCode } from "@vortspec/codegen";
import type { CodeGenConfig } from "@vortspec/codegen";

/**
 * Generate code for all components in a project.
 */
export async function generateAllComponents(
  projectId: string,
): Promise<{ generated: number; failed: number }> {
  const supabase = await createServerSupabaseClient();

  // 1. Fetch project config
  const { data: project, error: projError } = await supabase
    .from("projects")
    .select("framework, style_library, component_library")
    .eq("id", projectId)
    .single();

  if (projError || !project) {
    throw new Error(`Failed to fetch project config: ${projError?.message ?? "not found"}`);
  }

  const config: CodeGenConfig = {
    framework: project.framework ?? "react",
    styleLibrary: project.style_library ?? "tailwind",
    componentLibrary: project.component_library ?? "none",
  };

  // 2. Fetch all components for this project
  const { data: components, error: compError } = await supabase
    .from("components")
    .select("id, doc, status")
    .eq("project_id", projectId);

  if (compError) {
    throw new Error(`Failed to fetch components: ${compError.message}`);
  }
  if (!components || components.length === 0) {
    return { generated: 0, failed: 0 };
  }

  // 3. Fetch all tokens for this project
  const { data: tokenRows } = await supabase
    .from("tokens")
    .select("id, doc")
    .eq("project_id", projectId);

  const tokens = (tokenRows ?? []).map((row) => row.doc ?? {});

  // 4. Generate code for each component
  let generated = 0;
  let failed = 0;

  for (const component of components) {
    try {
      const result = await generateComponentCode(
        component.doc,
        tokens,
        config,
        { projectId },
      );

      // Store in code_artifacts table
      // Delete existing artifact for this component (if regenerating)
      await supabase.from("code_artifacts").delete().eq("component_id", component.id);

      const { error: upsertError } = await supabase
        .from("code_artifacts")
        .insert({
            component_id: component.id,
            project_id: projectId,
            component_code: result.componentCode,
            story_code: result.storyCode,
            types_code: result.typesCode,
            token_css: result.tokenCSS,
            framework: config.framework,
            llm_model: result.model,
          },
        );

      if (upsertError) {
        console.error(`[codegen] Failed to store artifact for ${component.id}: ${upsertError.message}`);
        failed++;
        continue;
      }

      // Update component status to 'validated'
      await supabase
        .from("components")
        .update({ status: "validated" })
        .eq("id", component.id);

      generated++;
    } catch (err) {
      console.error(
        `[codegen] Failed to generate for ${component.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
      failed++;
    }
  }

  return { generated, failed };
}

/**
 * Generate code for a single component.
 */
export async function generateSingleComponent(
  projectId: string,
  componentId: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createServerSupabaseClient();

  // Fetch project config
  const { data: project } = await supabase
    .from("projects")
    .select("framework, style_library, component_library")
    .eq("id", projectId)
    .single();

  if (!project) {
    return { success: false, error: "Project not found" };
  }

  const config: CodeGenConfig = {
    framework: project.framework ?? "react",
    styleLibrary: project.style_library ?? "tailwind",
    componentLibrary: project.component_library ?? "none",
  };

  // Fetch the component
  const { data: component } = await supabase
    .from("components")
    .select("id, doc")
    .eq("id", componentId)
    .eq("project_id", projectId)
    .single();

  if (!component) {
    return { success: false, error: "Component not found" };
  }

  // Fetch tokens
  const { data: tokenRows } = await supabase
    .from("tokens")
    .select("id, doc")
    .eq("project_id", projectId);

  const tokens = (tokenRows ?? []).map((row) => row.doc ?? {});

  try {
    const result = await generateComponentCode(
      component.doc,
      tokens,
      config,
      { projectId },
    );

    await supabase.from("code_artifacts").delete().eq("component_id", componentId);

    const { error: upsertError } = await supabase
      .from("code_artifacts")
      .insert({
        component_id: componentId,
        project_id: projectId,
        component_code: result.componentCode,
        story_code: result.storyCode,
        types_code: result.typesCode,
        token_css: result.tokenCSS,
        framework: config.framework,
        llm_model: result.model,
      });

    if (upsertError) {
      return { success: false, error: `Failed to store artifact: ${upsertError.message}` };
    }

    await supabase
      .from("components")
      .update({ status: "validated" })
      .eq("id", componentId);

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Fetch the generated code artifact for a component.
 */
export async function getCodeArtifact(componentId: string): Promise<{
  componentCode: string;
  storyCode: string;
  typesCode: string;
  tokenCSS: string;
  framework: string;
  llmModel: string;
} | null> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("code_artifacts")
    .select("component_code, story_code, types_code, token_css, framework, llm_model")
    .eq("component_id", componentId)
    .single();

  if (error || !data) return null;

  return {
    componentCode: data.component_code,
    storyCode: data.story_code,
    typesCode: data.types_code,
    tokenCSS: data.token_css,
    framework: data.framework,
    llmModel: data.llm_model,
  };
}

/**
 * Delete old artifact and regenerate code for a component.
 */
export async function regenerateCode(
  projectId: string,
  componentId: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createServerSupabaseClient();

  // Delete existing artifact
  await supabase
    .from("code_artifacts")
    .delete()
    .eq("component_id", componentId);

  // Generate new
  return generateSingleComponent(projectId, componentId);
}
