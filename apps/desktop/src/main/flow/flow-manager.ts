import { join } from "node:path";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import {
  DEFAULT_FLOW,
  flowStateSchema,
  type Flow,
  type FlowState,
  type StageStatus,
} from "../../shared/flow";

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

/** Persist intake answers to the project and complete the intake stage. */
export async function saveIntake(
  projectPath: string,
  content: string,
): Promise<Flow> {
  await writeFile(join(projectPath, "intake.md"), content, "utf8");
  return approveStage(projectPath, "intake");
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
