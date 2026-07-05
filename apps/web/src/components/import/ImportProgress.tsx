"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

/* ── types ──────────────────────────────────────────────────────── */

type StageStatus = "done" | "running" | "failed" | "queued";

interface Stage {
  key: string;
  number: number;
  name: string;
  description: string;
  status: StageStatus;
  error?: string;
  result?: Record<string, unknown>;
}

const ZIP_STAGES: Array<{ key: string; name: string; description: string }> = [
  { key: "parse", name: "Parse", description: "Extract HTML, CSS, and assets from the uploaded file." },
  { key: "style_mining", name: "Style mining", description: "Collect every literal style value, group duplicates, compute usage." },
  { key: "token_inference", name: "Token inference", description: "Promote candidates to tokens with semantic names." },
  { key: "structure_inference", name: "Structure inference", description: "Detect repeated patterns as components, infer variants and states." },
  { key: "ds_merge", name: "Design system merge", description: "Match mined tokens to official design system tokens." },
  { key: "report", name: "Report", description: "Compute completeness scores and generate the project summary." },
];

const FIGMA_STAGES: Array<{ key: string; name: string; description: string }> = [
  { key: "discover", name: "Discover", description: "Read file structure, find components and pages." },
  { key: "extract_variables", name: "Extract variables", description: "Read Figma variables and map to design tokens." },
  { key: "extract_components", name: "Extract components", description: "Read component sets, variants, and styles." },
  { key: "report", name: "Report", description: "Compute completeness scores and persist to database." },
];

/* ── spinner ────────────────────────────────────────────────────── */

function Spinner() {
  return (
    <div
      className="w-[14px] h-[14px] rounded-full border-2 border-vs-accent border-t-transparent"
      style={{ animation: "vsSpin 0.8s linear infinite" }}
    />
  );
}

/* ── status indicator ───────────────────────────────────────────── */

function StatusIndicator({ status }: { status: StageStatus }) {
  switch (status) {
    case "done":
      return <span className="text-vs-success text-[14px] font-medium">&#10003;</span>;
    case "running":
      return <Spinner />;
    case "failed":
      return <span className="text-vs-error text-[14px] font-medium">&#10005;</span>;
    case "queued":
      return <div className="w-2 h-2 rounded-full bg-vs-text-muted" />;
  }
}

/* ── stage card ─────────────────────────────────────────────────── */

function StageCard({ stage }: { stage: Stage }) {
  return (
    <div
      className={`bg-vs-bg-surface border border-vs-border-default rounded-lg px-4 py-3 flex items-start justify-between ${
        stage.status === "running"
          ? "shadow-[inset_2px_0_0_#7C6FF0]"
          : stage.status === "failed"
            ? "shadow-[inset_2px_0_0_#E5484D]"
            : ""
      }`}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="font-mono text-[12px] text-vs-text-muted">{stage.number}</span>
          <span className="text-[13px] font-medium text-vs-text-primary">{stage.name}</span>
        </div>
        <p className="text-[12px] text-vs-text-secondary leading-[1.5]">
          {stage.error ? (
            <span className="text-vs-error">{stage.error}</span>
          ) : (
            stage.description
          )}
        </p>
      </div>
      <div className="ml-3 flex-shrink-0 mt-1">
        <StatusIndicator status={stage.status} />
      </div>
    </div>
  );
}

/* ── completion summary ─────────────────────────────────────────── */

function CompletionSummary({
  tokenCount,
  componentCount,
  issueCount,
  projectId,
}: {
  tokenCount: number;
  componentCount: number;
  issueCount: number;
  projectId: string;
}) {
  return (
    <div style={{ animation: "vsFade 0.5s ease-out" }}>
      <div className="flex items-center justify-center gap-10 mt-8 mb-8">
        <div className="text-center">
          <p className="font-mono text-[44px] font-medium tracking-tight text-vs-text-primary leading-none">
            {tokenCount}
          </p>
          <p className="text-[12px] text-vs-text-secondary mt-1">tokens</p>
        </div>
        <div className="text-center">
          <p className="font-mono text-[44px] font-medium tracking-tight text-vs-text-primary leading-none">
            {componentCount}
          </p>
          <p className="text-[12px] text-vs-text-secondary mt-1">components</p>
        </div>
        <div className="text-center">
          <p className="font-mono text-[44px] font-medium tracking-tight text-vs-warning leading-none">
            {issueCount}
          </p>
          <p className="text-[12px] text-vs-text-secondary mt-1">issues</p>
        </div>
      </div>

      <div className="flex justify-center">
        <Link
          href={`/projects/${projectId}/inspect/tokens`}
          className="bg-vs-accent text-white rounded-lg px-5 py-2.5 text-[13px] font-medium hover:opacity-90 transition-opacity no-underline"
        >
          Open Inspector
        </Link>
      </div>
    </div>
  );
}

/* ── main component ─────────────────────────────────────────────── */

interface ImportProgressProps {
  importId: string;
  projectId: string;
  fileName?: string;
  sourceKind?: "zip" | "figma";
}

export function ImportProgress({ importId, projectId, fileName, sourceKind = "zip" }: ImportProgressProps) {
  const stageMeta = sourceKind === "figma" ? FIGMA_STAGES : ZIP_STAGES;
  const [stages, setStages] = useState<Stage[]>(
    stageMeta.map((m, i) => ({
      ...m,
      number: i + 1,
      status: "queued" as StageStatus,
    })),
  );
  const [complete, setComplete] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [summary, setSummary] = useState<{ tokenCount: number; componentCount: number; issueCount: number } | null>(null);

  // Poll the real API for stage_states
  const pollImport = useCallback(async () => {
    try {
      const res = await fetch(`/api/imports/${importId}`);
      if (!res.ok) return;
      const data = await res.json();

      if (data.error && data.status === "failed") {
        setImportError(data.error);
      }

      const stageStates = data.stage_states as Record<string, { status: StageStatus; error?: string; result?: Record<string, unknown> }> | undefined;
      if (!stageStates) return;

      setStages((prev) =>
        prev.map((stage) => {
          const stateData = stageStates[stage.key];
          if (!stateData) return stage;
          return {
            ...stage,
            status: stateData.status,
            error: stateData.error,
            result: stateData.result,
          };
        }),
      );

      // Check completion
      if (data.status === "done") {
        setComplete(true);
        // Extract summary from report stage result
        const reportResult = stageStates.report?.result;
        if (reportResult) {
          setSummary({
            tokenCount: (reportResult.tokenCount as number) ?? 0,
            componentCount: (reportResult.componentCount as number) ?? 0,
            issueCount: (reportResult.issueCount as number) ?? 0,
          });
        }
      }
    } catch {
      // Network error — will retry on next interval
    }
  }, [importId]);

  useEffect(() => {
    // Poll immediately, then every 2 seconds
    pollImport();
    const interval = setInterval(pollImport, 2000);

    return () => clearInterval(interval);
  }, [pollImport]);

  // Stop polling when complete or failed
  useEffect(() => {
    if (complete || importError) {
      // Polling will continue but won't update state meaningfully
    }
  }, [complete, importError]);

  // Progress calculation
  const doneCount = stages.filter((s) => s.status === "done").length;
  const hasRunning = stages.some((s) => s.status === "running");
  const progressPercent = hasRunning
    ? ((doneCount + 0.5) / stages.length) * 100
    : complete
      ? 100
      : (doneCount / stages.length) * 100;

  return (
    <div className="min-h-screen bg-vs-bg-primary">
      {/* Top bar */}
      <header className="flex items-center justify-between px-6 h-12 border-b border-vs-border-default">
        <span className="text-[15px] font-semibold tracking-tight text-vs-text-primary">VortSpec</span>
        <button type="button" className="w-7 h-7 rounded-full bg-vs-bg-elevated border border-vs-border-strong flex items-center justify-center cursor-pointer">
          <span className="text-[11px] text-vs-text-secondary leading-none">RV</span>
        </button>
      </header>

      <main className="max-w-[720px] mx-auto py-10 px-6">
        {/* Heading */}
        <h1 className="text-[20px] font-semibold tracking-tight text-vs-text-primary mb-6">
          Importing{" "}
          <span className="font-mono font-medium">{fileName ?? "design export"}</span>
        </h1>

        {/* Progress bar */}
        <div className="h-1 bg-vs-border-default rounded-full overflow-hidden mb-6">
          <div
            className="h-full bg-vs-accent rounded-full transition-[width] duration-600"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* Stage cards */}
        <div className="flex flex-col gap-3.5 mb-6">
          {stages.map((stage) => (
            <StageCard key={stage.key} stage={stage} />
          ))}
        </div>

        {/* Import error */}
        {importError && (
          <p className="text-[12px] text-vs-error mb-4">{importError}</p>
        )}

        {/* Continue in background */}
        {!complete && !importError && (
          <div className="text-center">
            <Link href="/projects" className="text-[13px] text-vs-accent hover:underline no-underline">
              Continue in background
            </Link>
          </div>
        )}

        {/* Completion summary */}
        {complete && summary && (
          <CompletionSummary
            tokenCount={summary.tokenCount}
            componentCount={summary.componentCount}
            issueCount={summary.issueCount}
            projectId={projectId}
          />
        )}
      </main>
    </div>
  );
}
