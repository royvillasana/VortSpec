import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { detectLibrary, type LibraryDetection } from "@vortspec/core/setup";

/**
 * Inspect a target repo on disk and suggest which component library it already uses + the consume
 * kind, so intake can pre-select it instead of the user guessing (change: consume-component-libraries).
 * Reads `package.json` dependencies + checks for a root `components.json` (the shadcn signal); the
 * classification itself is the pure {@link detectLibrary}.
 */
export async function detectLibraryInRepo(projectPath: string): Promise<LibraryDetection> {
  let deps: Record<string, string> = {};
  try {
    const pkg = JSON.parse(await readFile(join(projectPath, "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    deps = { ...pkg.dependencies, ...pkg.devDependencies };
  } catch {
    // no/invalid package.json — fall through with empty deps
  }
  let hasComponentsJson = false;
  try {
    await access(join(projectPath, "components.json"));
    hasComponentsJson = true;
  } catch {
    // absent
  }
  return detectLibrary(deps, hasComponentsJson);
}
