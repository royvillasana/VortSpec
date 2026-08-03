import { useCallback, useEffect, useRef, useState } from "react";
import type { Project } from "@vortspec/core/ipc";
import { chunkByLevel, buildChunkPrompt } from "@vortspec/core/sdd-prompts";
import { isConsumeSource } from "@vortspec/core/setup";
import { frameworkSupportError } from "@vortspec/core/framework-profiles";
import { api } from "./api";
import { useAgentRun } from "./useAgentRun";

/**
 * Automatic background component build (OpenSpec change: light-pages-on-canvas, group 9). When a project
 * has detected-but-unbuilt design-system components, VortSpec builds them AUTOMATICALLY in the background —
 * FIVE at a time, each BUILT and VERIFIED, in the framework the project was set up with — while the user
 * keeps creating/editing screens. It runs at the app level (via the run machinery, which keeps going across
 * navigation), starts at most once per project, and only when nothing is already building. `justFinished`
 * bumps when the whole roster is done so the shell can notify the user.
 */
export function useAutoComponentBuild(
  project: Project | null,
): { building: boolean; remaining: number; justFinished: number; setupRequired: string | null } {
  const run = useAgentRun();
  const startedRef = useRef<string | null>(null);
  const queueRef = useRef<{ chunks: string[][]; index: number } | null>(null);
  // The project's framework, captured when the queue is claimed, so every chunk prompt in the
  // run states that framework's real conventions instead of leaving the agent to infer them.
  const frameworkRef = useRef<string | null>(null);
  const [building, setBuilding] = useState(false);
  const [remaining, setRemaining] = useState(0);
  const [justFinished, setJustFinished] = useState(0);
  // Non-null when the project's framework is unset or unrecognized. The auto-builder then
  // does NOT run, and the shell can say why instead of silently doing nothing.
  const [setupRequired, setSetupRequired] = useState<string | null>(null);

  const runNextChunk = useCallback(async () => {
    const q = queueRef.current;
    if (!q || !project) return;
    if (q.index >= q.chunks.length) {
      queueRef.current = null;
      setBuilding(false);
      setRemaining(0);
      setJustFinished((n) => n + 1); // whole roster built + verified → notify
      return;
    }
    const names = q.chunks[q.index];
    q.index += 1;
    setRemaining(q.chunks.slice(q.index - 1).reduce((n, c) => n + c.length, 0));
    // Build + verify this chunk in the configured framework (the agent reads project.yaml). Storybook +
    // manifest refresh per chunk so partial results are usable before the whole roster finishes.
    await run.start({
      prompt: buildChunkPrompt(names, {
        verify: true,
        storybook: true,
        manifest: true,
        framework: frameworkRef.current,
      }),
      cwd: project.path,
      allowedTools: ["Read", "Write", "Edit", "Bash"],
      bypassPermissions: true,
      meta: { kind: "pipeline", label: `Building ${names.length} component${names.length === 1 ? "" : "s"} in the background` },
    });
  }, [project, run]);

  // Start when the design system exists: unbuilt components present AND nothing already running (so it
  // never fights a user-started build). POLLED, so it fires the MOMENT the design system is created
  // during the session (extraction detects the components) — not only if they exist at project open.
  // Once per project (startedRef); best-effort styling + Storybook setup first, like the Flow.
  useEffect(() => {
    if (!project) return;
    let alive = true;
    let poll: number | undefined;
    const check = async (): Promise<void> => {
      if (!alive || startedRef.current === project.path) return;
      const [comps, active, cfg] = await Promise.all([
        api.inspectorComponents(project.path).catch(() => null),
        api.hasActiveRun(project.path).catch(() => false),
        api.projectConfig(project.path).catch(() => null),
      ]);
      if (!alive || startedRef.current === project.path) return;
      // Consume sources (enterprise + any component library) CONSUME an existing component system —
      // never auto-BUILD their components (that would create VortSpec-owned look-alikes that drift
      // from their source). Claim + stop. (change: consume-component-libraries)
      if (isConsumeSource(cfg?.designSource)) {
        startedRef.current = project.path;
        if (poll) window.clearInterval(poll);
        return;
      }
      // TYPED PRE-RUN GATE. Generating without a known framework means generating React into
      // whatever this project actually is — the defect this whole change exists to remove. The
      // prompt's STOP clause is defense in depth; refusing to start the run is the real gate.
      // Surfaced as `setupRequired` rather than swallowed, so the shell can prompt for /setup.
      const unsupported = frameworkSupportError(cfg?.framework);
      if (unsupported) {
        setSetupRequired(unsupported);
        startedRef.current = project.path;
        if (poll) window.clearInterval(poll);
        return;
      }
      if (!comps || active) return; // no data yet, or a run is in flight — re-check next tick
      const unbuilt = comps.components.filter((c) => c.status === "unknown");
      if (unbuilt.length === 0) return; // design system not created yet — keep polling
      startedRef.current = project.path; // claim this project so we don't double-start
      frameworkRef.current = cfg?.framework ?? null; // captured here; every chunk prompt reads it
      if (poll) window.clearInterval(poll);
      await api.ensureStylingPipeline(project.path).catch(() => {});
      void api.ensureStorybook(project.path).catch(() => {});
      queueRef.current = { chunks: chunkByLevel(unbuilt, 5).map((ch) => ch.map((c) => c.name)), index: 0 };
      setBuilding(true);
      void runNextChunk();
    };
    void check();
    poll = window.setInterval(() => void check(), 15000); // catch the design system being created mid-session
    return () => {
      alive = false;
      if (poll) window.clearInterval(poll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.path]);

  // Chain: when a chunk run finishes, kick the next one (the queue drives sequencing, not a single run).
  useEffect(() => {
    if (run.model.status === "done" && queueRef.current) void runNextChunk();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run.model.status]);

  return { building, remaining, justFinished, setupRequired };
}
