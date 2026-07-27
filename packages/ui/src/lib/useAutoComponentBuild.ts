import { useCallback, useEffect, useRef, useState } from "react";
import type { Project } from "@vortspec/core/ipc";
import { chunkByLevel, buildChunkPrompt } from "@vortspec/core/sdd-prompts";
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
): { building: boolean; remaining: number; justFinished: number } {
  const run = useAgentRun();
  const startedRef = useRef<string | null>(null);
  const queueRef = useRef<{ chunks: string[][]; index: number } | null>(null);
  const [building, setBuilding] = useState(false);
  const [remaining, setRemaining] = useState(0);
  const [justFinished, setJustFinished] = useState(0);

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
      prompt: buildChunkPrompt(names, { verify: true, storybook: true, manifest: true }),
      cwd: project.path,
      allowedTools: ["Read", "Write", "Edit", "Bash"],
      bypassPermissions: true,
      meta: { kind: "pipeline", label: `Building ${names.length} component${names.length === 1 ? "" : "s"} in the background` },
    });
  }, [project, run]);

  // Start once per project: only when there are unbuilt components AND nothing is already running (so it
  // never fights a user-started build). Best-effort styling + Storybook setup first, like the Flow.
  useEffect(() => {
    if (!project || startedRef.current === project.path) return;
    let alive = true;
    void (async () => {
      const [comps, active] = await Promise.all([
        api.inspectorComponents(project.path).catch(() => null),
        api.hasActiveRun(project.path).catch(() => false),
      ]);
      if (!alive || !comps || active) return;
      const unbuilt = comps.components.filter((c) => c.status === "unknown");
      if (unbuilt.length === 0) return;
      startedRef.current = project.path; // claim this project so we don't double-start
      await api.ensureStylingPipeline(project.path).catch(() => {});
      void api.ensureStorybook(project.path).catch(() => {});
      queueRef.current = { chunks: chunkByLevel(unbuilt, 5).map((ch) => ch.map((c) => c.name)), index: 0 };
      setBuilding(true);
      void runNextChunk();
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.path]);

  // Chain: when a chunk run finishes, kick the next one (the queue drives sequencing, not a single run).
  useEffect(() => {
    if (run.model.status === "done" && queueRef.current) void runNextChunk();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run.model.status]);

  return { building, remaining, justFinished };
}
