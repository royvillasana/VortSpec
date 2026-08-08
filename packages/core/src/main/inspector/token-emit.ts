import { createHash } from "node:crypto";
import { dirname, join, posix } from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import {
  emitTokensForStyling,
  resolveEmitFormat,
  type EmittedFile,
  type StylingEmitOptions,
  type TokenEmitFormat,
} from "@vortspec/core/token-emitters";
import { isConsumeSource } from "@vortspec/core/setup";
import {
  describeDivergence,
  nextTokenEmitLedger,
  parseTokenEmitLedger,
  planTokenEmit,
  serializeTokenEmitLedger,
  TOKEN_EMIT_LEDGER_PATH,
  type DivergenceResolution,
  type TokenEmitCandidate,
  type TokenEmitFileReport,
  type TokenEmitResult,
  type TokenEmitSummary,
} from "@vortspec/core/token-emit-ledger";
import { readCanonicalTokens } from "./canonical-tokens";
import { readProjectConfig } from "../workspace/config-manager";

/**
 * The fs half of "`token_file` is a derived artifact" — OpenSpec change: agentic-design-system,
 * task 7.8.
 *
 * It closes the pipeline end to end: read `.sdd-de/project.yaml` for the styling approach, read the
 * canonical artifact, run the matching emitter, and write the result — but only over files VortSpec
 * can prove it wrote. The ownership decision itself is pure and lives in
 * `shared/token-emit-ledger.ts`; every fs and hashing concern lives here.
 *
 * Nothing here consults the design source. That is the point of the split (task 7.9): re-emitting
 * for a different `styling` value is a read of `.vortspec/tokens.json` and nothing else.
 */

/**
 * The result shapes moved to `shared/token-emit-ledger.ts` when the emit became reachable over IPC
 * (task 7.14) — every channel response is zod-validated, so there has to be a schema, and two
 * definitions of "what an emit returns" would drift. Re-exported here so existing importers of
 * `TokenEmitResult` are untouched.
 *
 * A reminder of the statuses, since they are what a caller branches on: `diverged` means nothing was
 * written and a choice is owed; `read-only` means nothing was written and no choice exists, because
 * the project CONSUMES its design system and its `token_file` is someone else's source (task 7.10).
 */
export type {
  TokenEmitStatus,
  TokenEmitFileReport,
  TokenEmitResult,
} from "@vortspec/core/token-emit-ledger";

export interface EmitTokenFilesOptions extends StylingEmitOptions {
  /**
   * The user's answer to a divergence previously reported. Omitted ⇒ no answer yet, and a diverged
   * file stops the emit. There is deliberately no "force" default: the caller has to have asked.
   */
  onDivergence?: DivergenceResolution;
}

/**
 * Emit the project's token file(s) from the canonical artifact.
 *
 * Throws only for the things that make an emit meaningless — no project config, no configured
 * `token_file`, no canonical artifact, or a styling approach with no emitter (which
 * `emitTokensForStyling` throws for, by name, per task 7.7). A DIVERGENCE is not a throw: it is a
 * normal outcome the caller must present as a choice, so it comes back as a result.
 */
export async function emitTokenFiles(
  projectPath: string,
  options: EmitTokenFilesOptions = {},
): Promise<TokenEmitResult> {
  const config = await readProjectConfig(projectPath);
  if (!config)
    throw new Error(
      "No .sdd-de/project.yaml — run /setup before emitting tokens; the emitter needs the project's styling approach.",
    );
  const styling = config.styling;
  const tokenFile = config.tokenFile;
  if (!tokenFile)
    throw new Error(
      "No token_file in .sdd-de/project.yaml — VortSpec will not guess where the project's token file belongs.",
    );

  // Consume-source guard (task 7.10). For `enterprise`/`library` the `token_file` POINTS AT the
  // vendor's or client's real source — a reference, never a VortSpec-owned copy — so emitting over
  // it would overwrite someone else's design system with our projection of it. The divergence check
  // below would in practice catch this too, but only as an ambiguous "this file changed" that an
  // `onDivergence: "overwrite"` would happily resolve by destroying the source. This is not a
  // divergence, it is a category error, and it has no resolution.
  if (isConsumeSource(config.designSource))
    return {
      status: "read-only",
      styling: styling ?? "",
      format: resolveEmitFormat(styling, options) ?? "css",
      files: [],
      written: [],
      diverged: [],
      kept: [],
      message:
        `This project consumes its design system (design_source: ${config.designSource}), so ` +
        `${tokenFile} is the consumed source, not a file VortSpec emits. The canonical artifact is a ` +
        `read-only projection of it; personalize tokens through the durable overlay instead.`,
    };

  const document = await readCanonicalTokens(projectPath);
  if (!document)
    throw new Error(
      "No canonical token artifact at .vortspec/tokens.json — read the design source first; " +
        "the token file is derived from it, never authored directly.",
    );

  const emitted = emitTokensForStyling(styling, document, options);
  // Past the emit, `styling` is necessarily set — an unset one has no emitter and threw above.
  const stylingName = styling ?? "";
  const targets = emitted.files.map((file) => ({ file, path: targetPath(tokenFile, file) }));

  const candidates: TokenEmitCandidate[] = await Promise.all(
    targets.map(async ({ file, path }) => ({
      path,
      role: file.role,
      nextHash: hash(file.content),
      currentHash: await hashOnDisk(join(projectPath, path)),
    })),
  );

  const ledger = await readLedger(projectPath);
  const plan = planTokenEmit(
    { format: emitted.format, styling: stylingName, candidates, ledger },
    { onDivergence: options.onDivergence },
  );
  const files: TokenEmitFileReport[] = plan.files.map(({ path, role, disposition }) => ({
    path,
    role,
    disposition,
  }));

  if (plan.diverged.length)
    return {
      status: "diverged",
      styling: stylingName,
      format: plan.format,
      files,
      written: [],
      diverged: plan.diverged,
      kept: [],
      message: describeDivergence(plan),
    };

  const written: string[] = [];
  for (const { file, path } of targets) {
    const decided = plan.files.find((entry) => entry.path === path);
    if (!decided || decided.disposition === "unchanged" || decided.disposition === "kept") continue;
    const absolute = join(projectPath, path);
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, file.content, "utf8");
    written.push(path);
  }
  await writeLedger(projectPath, plan, ledger);

  return {
    status: written.length ? "written" : "up-to-date",
    styling: stylingName,
    format: plan.format,
    files,
    written,
    diverged: [],
    kept: plan.files.filter((file) => file.disposition === "kept").map((file) => file.path),
  };
}

export interface EmitAfterIngestOptions extends EmitTokenFilesOptions {
  /**
   * The project-relative file the ingest just READ, when the ingest read one. Set by the
   * non-design-tool path, where the design source is a file inside the project; a design-tool ingest
   * leaves it unset because its source is not a file here at all.
   */
  ingestedFrom?: string;
}

/** Two project-relative paths pointing at the same file, compared platform-independently. */
function samePath(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  return normalize(a) === normalize(b);
}

/**
 * Emit as the tail of an INGEST — the call that makes `token_file` actually derived (task 7.14).
 *
 * NEVER THROWS. That is the whole contract, and it is why this exists rather than callers using
 * `emitTokenFiles` directly. An ingest has already done the expensive, fallible thing: it read the
 * design source and wrote the canonical artifact. Failing that whole operation because the project
 * has no `styling` set, or no emitter for the one it has, would throw away a successful read over a
 * configuration gap — and the states `emitTokenFiles` throws for (no config, no `token_file`, no
 * artifact, no emitter) are all NORMAL for a project mid-setup.
 *
 * A divergence is not a failure either: it comes back as `diverged` with the paths, so the caller
 * can put the choice in front of the user. Same for `read-only` on a consumed source. The one thing
 * that must never happen is silence — every outcome, including "could not emit", carries a message.
 */
export async function emitAfterIngest(
  projectPath: string,
  options: EmitAfterIngestOptions = {},
): Promise<TokenEmitSummary> {
  // Circularity guard. When the ingest READ the very file the emit would WRITE — which is the whole
  // shape of the non-design-tool path, where `token_file` IS the design source — emitting would
  // overwrite the user's authored stylesheet with a projection of itself, losing its comments,
  // ordering and any structure the emitter does not model. There the derived artifact is
  // `.vortspec/tokens.json`, and `token_file` is the input; only a design-tool ingest has an
  // external source that makes the token file genuinely downstream.
  if (options.ingestedFrom) {
    const config = await readProjectConfig(projectPath);
    // A consumed source falls through to `emitTokenFiles`, which reports `read-only` — a more
    // specific and more useful answer than "we read this file", and it writes nothing either way.
    if (!isConsumeSource(config?.designSource) && samePath(options.ingestedFrom, config?.tokenFile))
      return {
        status: "skipped",
        written: [],
        diverged: [],
        message:
          `${options.ingestedFrom} is this project's design source, not an emitted file — the ` +
          `canonical artifact was refreshed from it. Emitting would overwrite it with a projection ` +
          `of itself.`,
      };
  }
  try {
    const result = await emitTokenFiles(projectPath, options);
    return {
      status: result.status,
      written: result.written,
      diverged: result.diverged,
      message: result.message ?? describeEmit(result),
    };
  } catch (error) {
    return {
      status: "skipped",
      written: [],
      diverged: [],
      message: error instanceof Error ? error.message : "The token file could not be emitted.",
    };
  }
}

/** The human sentence for an emit that succeeded. Pure + exported so the wording is testable. */
export function describeEmit(result: TokenEmitResult): string {
  if (result.status === "up-to-date")
    return `${result.styling} token file is already up to date (${result.format}).`;
  const count = result.written.length;
  return `Emitted ${count} ${result.format} token file${count === 1 ? "" : "s"}: ${result.written.join(", ")}.`;
}

/**
 * Where one emitted file lands.
 *
 * The `token-file` role goes exactly where `project.yaml → token_file` says — that path is the
 * project's contract with its own build, and second-guessing it (say, by correcting its extension)
 * would break every import that already points at it. The `custom-properties` companion has no
 * configured home, so it lands beside the token file as `tokens.css`; only the Tailwind v3 emit
 * produces one, where the token file is a `.js` config, so the two cannot collide in practice — the
 * suffix below is belt-and-braces for a future format where they might.
 */
function targetPath(tokenFile: string, file: EmittedFile): string {
  const configured = normalize(tokenFile);
  if (file.role === "token-file") return configured;
  const dir = posix.dirname(configured);
  const companion = posix.join(dir === "." ? "" : dir, `tokens${file.extension}`);
  return companion === configured
    ? posix.join(dir === "." ? "" : dir, `tokens-vars${file.extension}`)
    : companion;
}

/** Project-relative POSIX form, so a path hashes and compares the same on every platform. */
function normalize(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\//, "");
}

function hash(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

/** The hash of a file's current bytes, or null when it does not exist. */
async function hashOnDisk(absolutePath: string): Promise<string | null> {
  try {
    return hash(await readFile(absolutePath, "utf8"));
  } catch {
    return null;
  }
}

async function readLedger(projectPath: string) {
  try {
    return parseTokenEmitLedger(JSON.parse(await readFile(join(projectPath, TOKEN_EMIT_LEDGER_PATH), "utf8")));
  } catch {
    return null;
  }
}

async function writeLedger(
  projectPath: string,
  plan: Parameters<typeof nextTokenEmitLedger>[0],
  previous: Parameters<typeof nextTokenEmitLedger>[1],
): Promise<void> {
  await mkdir(join(projectPath, ".vortspec"), { recursive: true });
  await writeFile(
    join(projectPath, TOKEN_EMIT_LEDGER_PATH),
    serializeTokenEmitLedger(nextTokenEmitLedger(plan, previous)),
    "utf8",
  );
}
