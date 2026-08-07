import { dirname, join } from "node:path";
import { mkdir, writeFile, access } from "node:fs/promises";
import { scaffoldFiles, type ScaffoldFile, type ScaffoldInput } from "@vortspec/core/scaffold";
import { isConsumeSource } from "@vortspec/core/setup";
import { readProjectConfig } from "../workspace/config-manager";

/**
 * Writing the component scaffold — OpenSpec change: agentic-design-system, tasks 6.2, 6.6 and 6.8.
 *
 * The file set is decided by the pure `scaffoldFiles`; this writes it and enforces the two rules that
 * need the filesystem to check.
 */

export class ScaffoldError extends Error {
  constructor(
    message: string,
    /** What went wrong, so a caller can tell a refusal from a failure. */
    readonly reason: "consume-source" | "missing-config" | "write-failed",
  ) {
    super(message);
    this.name = "ScaffoldError";
  }
}

export interface ScaffoldResult {
  written: string[];
  /** Files that already existed and were left alone. */
  skipped: string[];
  files: ScaffoldFile[];
}

/**
 * Scaffold one component into the project.
 *
 * **Existing files are never overwritten.** Scaffolding is meant to be safe to re-run — the model
 * fills these files in afterwards, and a re-scaffold that clobbered its work would destroy the thing
 * the scaffold exists to make possible. Re-running reports the same file set with the already-written
 * ones skipped, which is also what makes task 6.6's determinism assertion checkable against a real
 * project rather than only against the pure function.
 */
export async function scaffoldComponent(
  projectPath: string,
  input: Omit<ScaffoldInput, "framework" | "language" | "styling" | "componentDir"> &
    Partial<Pick<ScaffoldInput, "framework" | "language" | "styling" | "componentDir">>,
): Promise<ScaffoldResult> {
  const config = await readProjectConfig(projectPath);

  // 6.8 — a consumed library's source tree is a dependency. Writing a component into it is an edit to
  // someone else's package: it will be wiped by the next install, and until then it is a local fork
  // nobody can see. Refused by NAME rather than silently redirected, because the caller asked for
  // something this project cannot do and needs to know that.
  if (isConsumeSource(config?.designSource))
    throw new ScaffoldError(
      `This project consumes its design system (${config?.designSource}); components are not scaffolded into a consumed library.`,
      "consume-source",
    );

  const resolved: ScaffoldInput = {
    ...input,
    framework: (input.framework ?? config?.framework ?? "react") as ScaffoldInput["framework"],
    language: (input.language ?? config?.language ?? "typescript") as ScaffoldInput["language"],
    styling: (input.styling ?? config?.styling ?? "css") as ScaffoldInput["styling"],
    componentDir: input.componentDir ?? config?.componentDir ?? "src/components",
  };

  const files = scaffoldFiles(resolved);
  const written: string[] = [];
  const skipped: string[] = [];

  for (const file of files) {
    // A zero-content file must never reach disk (task 6.3). The pure layer is tested not to produce
    // one; this is the backstop, and it throws rather than writing an empty file quietly.
    if (!file.contents.trim())
      throw new ScaffoldError(`Refusing to write an empty ${file.role} file at ${file.path}.`, "write-failed");

    const absolute = join(projectPath, file.path);
    if (await exists(absolute)) {
      skipped.push(file.path);
      continue;
    }
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, file.contents, "utf8");
    written.push(file.path);
  }

  return { written, skipped, files };
}

/**
 * Whether every file the scaffold declares is present (task 6.6).
 *
 * The point of this is diagnostic ATTRIBUTION. A missing `.variants.ts` currently looks like the
 * model wrote a worse component; with a declared file set it is a scaffold failure with a name, and
 * the two get fixed in completely different places.
 */
export async function verifyScaffold(
  projectPath: string,
  input: ScaffoldInput,
): Promise<{ complete: boolean; missing: string[] }> {
  const missing: string[] = [];
  for (const file of scaffoldFiles(input))
    if (!(await exists(join(projectPath, file.path)))) missing.push(file.path);
  return { complete: missing.length === 0, missing };
}

async function exists(path: string): Promise<boolean> {
  return access(path).then(
    () => true,
    () => false,
  );
}
