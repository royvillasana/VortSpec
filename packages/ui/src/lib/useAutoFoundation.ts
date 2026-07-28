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
  const [extracting, setExtracting] = useState(false);
  const [justFinished, setJustFinished] = useState(0);

  useEffect(() => {
    if (!project) return;
    let alive = true;
    void (async () => {
      if (startedRef.current === project.path) return;
      const [toks, comps, active, cfg] = await Promise.all([
        api.inspectorTokens(project.path).catch(() => null),
        api.inspectorComponents(project.path).catch(() => null),
        api.hasActiveRun(project.path).catch(() => false),
        api.projectConfig(project.path).catch(() => null),
      ]);
      if (!alive || startedRef.current === project.path) return;
      const ready = (toks?.tokens.length ?? 0) > 0 || (comps?.components.length ?? 0) > 0;
      // Nothing to extract without a configured design source; skip if ready or a run is in flight.
      if (ready || active || !cfg?.designSource) return;
      startedRef.current = project.path; // claim this project so we don't double-start
      setExtracting(true);
      // Enterprise projects CONSUME an existing design system: run the validate → index → snapshot
      // Foundation (never extraction/build). Every other source uses the extract-and-detect Foundation.
      const enterprise = cfg.designSource === "enterprise";
      await run.start({
        prompt: enterprise
          ? buildEnterpriseFoundationPrompt(cfg)
          : (FOUNDATION_DEF.promptTemplate ?? "Extract tokens and detect components."),
        cwd: project.path,
        allowedTools: enterprise ? ["Read", "Write", "Edit", "Bash"] : FOUNDATION_DEF.allowedTools,
        bypassPermissions: true,
      });
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.path]);

  // When the extraction run finishes, clear the flag and bump the completion signal.
  useEffect(() => {
    if (run.model.status === "done" && extracting) {
      setExtracting(false);
      setJustFinished((n) => n + 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run.model.status]);

  return { extracting, justFinished };
}
