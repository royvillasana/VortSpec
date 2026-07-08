import { join } from "node:path";
import { readFile, writeFile, mkdir, readdir, stat } from "node:fs/promises";
import {
  DEFAULT_FLOW,
  flowStateSchema,
  type Flow,
  type FlowState,
  type StageStatus,
} from "@vortspec/core/flow";

/**
 * Reads and writes the guided-flow state for a project. State lives as plain
 * JSON in `.vortspec/flow.json`, so it is always derivable from disk and
 * survives closing/reopening the app (design D7). Approval decisions are
 * recorded here; nothing advances without an explicit approval.
 */

function vortspecDir(projectPath: string): string {
  return join(projectPath, ".vortspec");
}
function flowFile(projectPath: string): string {
  return join(vortspecDir(projectPath), "flow.json");
}

function initialState(): FlowState {
  const first = DEFAULT_FLOW[0]!;
  return {
    currentStageId: first.id,
    stages: DEFAULT_FLOW.map((def) => ({
      id: def.id,
      status: "pending" as StageStatus,
      updatedAt: new Date().toISOString(),
    })),
  };
}

async function readState(projectPath: string): Promise<FlowState> {
  try {
    const raw = await readFile(flowFile(projectPath), "utf8");
    const parsed = flowStateSchema.safeParse(JSON.parse(raw));
    if (parsed.success) return reconcile(parsed.data);
  } catch {
    /* fall through to fresh state */
  }
  return initialState();
}

/** Keep persisted state aligned with the current stage definitions. */
function reconcile(state: FlowState): FlowState {
  const byId = new Map(state.stages.map((s) => [s.id, s]));
  const stages = DEFAULT_FLOW.map(
    (def) =>
      byId.get(def.id) ?? {
        id: def.id,
        status: "pending" as StageStatus,
        updatedAt: new Date().toISOString(),
      },
  );
  const currentValid = DEFAULT_FLOW.some((d) => d.id === state.currentStageId);
  return {
    currentStageId: currentValid ? state.currentStageId : DEFAULT_FLOW[0]!.id,
    stages,
    publishRepoUrl: state.publishRepoUrl,
  };
}

async function writeState(projectPath: string, state: FlowState): Promise<void> {
  await mkdir(vortspecDir(projectPath), { recursive: true });
  await writeFile(flowFile(projectPath), JSON.stringify(state, null, 2), "utf8");
}

function withFlow(state: FlowState): Flow {
  return { definitions: DEFAULT_FLOW, state };
}

function patchStage(
  state: FlowState,
  stageId: string,
  patch: Partial<{ status: StageStatus; decisionNotes: string | undefined }>,
): FlowState {
  return {
    ...state,
    stages: state.stages.map((s) =>
      s.id === stageId
        ? { ...s, ...patch, updatedAt: new Date().toISOString() }
        : s,
    ),
  };
}

function nextStageId(stageId: string): string | null {
  const index = DEFAULT_FLOW.findIndex((d) => d.id === stageId);
  const next = DEFAULT_FLOW[index + 1];
  return next ? next.id : null;
}

export async function getFlow(projectPath: string): Promise<Flow> {
  return withFlow(await readState(projectPath));
}

export async function setStageStatus(
  projectPath: string,
  stageId: string,
  status: StageStatus,
): Promise<Flow> {
  const next = patchStage(await readState(projectPath), stageId, { status });
  await writeState(projectPath, next);
  return withFlow(next);
}

/**
 * Persist the opt-in GitHub publish target (a repo URL) for this project. Only
 * the URL is stored — the actual push runs through the user's own git/gh in the
 * commit stage. Passing an empty string clears it.
 */
export async function setPublishTarget(
  projectPath: string,
  repoUrl: string,
): Promise<Flow> {
  const state = await readState(projectPath);
  const next: FlowState = {
    ...state,
    publishRepoUrl: repoUrl.trim() || undefined,
  };
  await writeState(projectPath, next);
  return withFlow(next);
}

/** Approve a gated stage and advance the flow to the next stage. */
export async function approveStage(
  projectPath: string,
  stageId: string,
): Promise<Flow> {
  let state = patchStage(await readState(projectPath), stageId, {
    status: "approved",
    decisionNotes: undefined,
  });
  const next = nextStageId(stageId);
  if (next) state = { ...state, currentStageId: next };
  await writeState(projectPath, state);
  return withFlow(state);
}

/** Record change requests; the stage stays gated (needs-review) for a re-run. */
export async function requestChanges(
  projectPath: string,
  stageId: string,
  notes: string,
): Promise<Flow> {
  const next = patchStage(await readState(projectPath), stageId, {
    status: "needs-review",
    decisionNotes: notes,
  });
  await writeState(projectPath, next);
  return withFlow(next);
}

/** Persist the design brief to `.sdd-de/brief.md` and complete the brief stage. */
export async function saveIntake(
  projectPath: string,
  content: string,
): Promise<Flow> {
  const sddeDir = join(projectPath, ".sdd-de");
  await mkdir(sddeDir, { recursive: true });
  await writeFile(join(sddeDir, "brief.md"), content, "utf8");
  return approveStage(projectPath, "brief");
}

/**
 * Resolve a dynamic artifact (SDD-DE writes specs/[feature-name]/…). Scans
 * `specs/` recursively for files whose name ends with `suffix` and returns the
 * most recently modified one.
 */
export async function findLatestArtifact(
  projectPath: string,
  suffix: string,
): Promise<{ path: string; content: string } | null> {
  const specsRoot = join(projectPath, "specs");
  let best: { path: string; mtime: number } | null = null;

  async function walk(dir: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.name.endsWith(suffix)) {
        const { mtimeMs } = await stat(full);
        if (!best || mtimeMs > best.mtime) best = { path: full, mtime: mtimeMs };
      }
    }
  }

  await walk(specsRoot);
  if (!best) return null;
  const chosen: { path: string; mtime: number } = best;
  const content = await readFile(chosen.path, "utf8");
  return { path: chosen.path.slice(projectPath.length + 1), content };
}

/** Mark a non-gated input stage (e.g. design-input) complete and advance. */
export async function completeInput(
  projectPath: string,
  stageId: string,
): Promise<Flow> {
  return approveStage(projectPath, stageId);
}

export async function readArtifact(
  projectPath: string,
  relPath: string,
): Promise<string | null> {
  try {
    return await readFile(join(projectPath, relPath), "utf8");
  } catch {
    return null;
  }
}
