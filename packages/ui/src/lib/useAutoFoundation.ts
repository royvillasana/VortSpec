import { useEffect, useRef, useState } from "react";
import type { Project } from "@vortspec/core/ipc";
import { DEFAULT_FLOW } from "@vortspec/core/flow";
import { buildEnterpriseFoundationPrompt } from "@vortspec/core/enterprise-consume";
import { api } from "./api";
import { useAgentRun } from "./useAgentRun";

const FOUNDATION_DEF = DEFAULT_FLOW.find((d) => d.kind === "source")!;

/**
 * Automatic design-system foundation extraction. When a project is opened that has NO tokens and NO
 * detected components (a fresh, just-set-up project), extract the foundation — tokens + component
 * detection — in the BACKGROUND. This used to be gated on visiting the SDD-DE pipeline (the flow view);
 * now that intake lands the user on the Design System page (in the Design-tokens section), the extraction
 * runs at the app level so that page populates itself without the user having to go anywhere.
 *
 * Runs at most once per project, and only when nothing is already running (so it never fights a
 * user-started run or the auto component build). `justFinished` bumps on completion so the shell can
 * refresh the palette; `extracting` drives the "setting up…" affordance.
 */
export function useAutoFoundation(project: Project | null): { extracting: boolean; justFinished: number } {
  const run = useAgentRun();
  const startedRef = useRef<string | null>(null);
  const wasExtractingRef = useRef(false); // so completion (ready) bumps justFinished exactly once
  const [extracting, setExtracting] = useState(false);
  const [justFinished, setJustFinished] = useState(0);

  useEffect(() => {
    if (!project) {
      setExtracting(false);
      return;
    }
    let alive = true;
    let poll: number | undefined;
    // POLLED so the "setting up…" state reflects an ONGOING foundation run even across a reload/navigation
    // (a run started in a previous mount, or another view), not only one this hook kicked off itself.
    const check = async (): Promise<void> => {
      const [toks, comps, active, cfg] = await Promise.all([
        api.inspectorTokens(project.path).catch(() => null),
        api.inspectorComponents(project.path).catch(() => null),
        api.hasActiveRun(project.path).catch(() => false),
        api.projectConfig(project.path).catch(() => null),
      ]);
      if (!alive) return;
      const ready = (toks?.tokens.length ?? 0) > 0 || (comps?.components.length ?? 0) > 0;
      if (ready || !cfg?.designSource) {
        // Terminal: the design system is populated (or there's nothing to set up). Signal completion once.
        if (wasExtractingRef.current) {
          wasExtractingRef.current = false;
          setJustFinished((n) => n + 1);
        }
        setExtracting(false);
        if (poll) window.clearInterval(poll);
        return;
      }
      if (active) {
        // A foundation run is in flight (ours or one already running) — reflect it, don't start another.
        wasExtractingRef.current = true;
        setExtracting(true);
        return;
      }
      if (startedRef.current === project.path) {
        // We started it, it's no longer active, yet not ready → it ended (maybe with gaps). Stop showing.
        wasExtractingRef.current = false;
        setExtracting(false);
        if (poll) window.clearInterval(poll);
        return;
      }
      // Nothing running and not ready → kick the foundation once. Enterprise projects CONSUME an existing
      // design system (validate → index → snapshot); every other source extracts + detects.
      startedRef.current = project.path;
      wasExtractingRef.current = true;
      setExtracting(true);
      const enterprise = cfg.designSource === "enterprise";
      await run.start({
        prompt: enterprise
          ? buildEnterpriseFoundationPrompt(cfg)
          : (FOUNDATION_DEF.promptTemplate ?? "Extract tokens and detect components."),
        cwd: project.path,
        allowedTools: enterprise ? ["Read", "Write", "Edit", "Bash"] : FOUNDATION_DEF.allowedTools,
        bypassPermissions: true,
      });
    };
    void check();
    poll = window.setInterval(() => void check(), 5000);
    return () => {
      alive = false;
      if (poll) window.clearInterval(poll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.path]);

  return { extracting, justFinished };
}
