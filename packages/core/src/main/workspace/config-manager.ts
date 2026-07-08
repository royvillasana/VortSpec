import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { projectConfigSchema, type ProjectConfig } from "@vortspec/core/setup";

/**
 * Reads back `.sdd-de/project.yaml` (written by the setup wizard / CLI) into the
 * typed config the guided flow needs — so the first stage can drive the
 * configured design source (Figma file URL, framework, language, token file…)
 * without asking the user again.
 */

const KEY_MAP: Record<string, keyof ProjectConfig> = {
  design_source: "designSource",
  figma_file_url: "figmaFileUrl",
  figma_token_collection: "figmaTokenCollection",
  component_library: "componentLibrary",
  github_repo_url: "githubRepoUrl",
  github_branch: "githubBranch",
  github_component_dir: "githubComponentDir",
  zip_file_path: "zipFilePath",
  stitch_connection: "stitchConnection",
  framework: "framework",
  language: "language",
  styling: "styling",
  token_file: "tokenFile",
  component_dir: "componentDir",
};

/** Minimal flat `key: value` YAML parse (the file the CLI writes is flat). */
function parseFlatYaml(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

export async function readProjectConfig(
  projectPath: string,
): Promise<ProjectConfig | null> {
  let text: string;
  try {
    text = await readFile(join(projectPath, ".sdd-de", "project.yaml"), "utf8");
  } catch {
    return null;
  }
  const flat = parseFlatYaml(text);
  const config: Record<string, string> = {};
  for (const [yamlKey, value] of Object.entries(flat)) {
    const mapped = KEY_MAP[yamlKey];
    if (mapped) config[mapped] = value;
  }
  const parsed = projectConfigSchema.safeParse(config);
  return parsed.success ? parsed.data : null;
}
