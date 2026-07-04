"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

/* ── types ──────────────────────────────────────────────────────── */

type StageStatus = "done" | "running" | "failed" | "queued";

interface Stage {
  number: number;
  name: string;
  description: string;
  status: StageStatus;
}

const initialStages: Stage[] = [
  {
    number: 1,
    name: "Unpack archive",
    description: "Extracting files from the ZIP and validating structure.",
    status: "done",
  },
  {
    number: 2,
    name: "Parse tokens",
    description: "Reading design token definitions from JSON and CSS sources.",
    status: "done",
  },
  {
    number: 3,
    name: "Resolve aliases",
    description: "Linking alias tokens to their base values across files.",
    status: "done",
  },
  {
    number: 4,
    name: "Extract components",
    description:
      "Identifying component boundaries and mapping props to tokens.",
    status: "running",
  },
  {
    number: 5,
    name: "Lint & validate",
    description:
      "Running design-lint rules to flag contrast, naming, and completeness issues.",
    status: "queued",
  },
  {
    number: 6,
    name: "Build snapshot",
    description:
      "Creating an immutable snapshot for diffing against future imports.",
    status: "queued",
  },
];

/* ── top bar ────────────────────────────────────────────────────── */

function TopBar() {
  return (
    <header className="flex items-center justify-between px-6 h-[52px] border-b border-vs-border-default">
      <div className="flex items-center gap-2">
        <Link
          href="/projects"
          className="flex items-center gap-2 hover:opacity-80 transition-opacity"
        >
          <div className="w-[18px] h-[18px] rounded-[5px] bg-vs-accent flex items-center justify-center">
            <span className="font-mono text-[11px] font-medium text-vs-bg-primary leading-none">
              V
            </span>
          </div>
          <span className="text-[13px] text-vs-text-secondary">VortSpec</span>
        </Link>
      </div>

      <button
        type="button"
        className="w-[28px] h-[28px] rounded-full bg-vs-bg-elevated border border-vs-border-strong flex items-center justify-center"
      >
        <span className="text-[11px] text-vs-text-secondary leading-none">
          RV
        </span>
      </button>
    </header>
  );
}

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

function StatusIndicator({
  status,
  onRetry,
}: {
  status: StageStatus;
  onRetry?: () => void;
}) {
  switch (status) {
    case "done":
      return (
        <span className="text-vs-success text-[14px] font-medium">&#10003;</span>
      );
    case "running":
      return <Spinner />;
    case "failed":
      return (
        <div className="flex items-center gap-2">
          <span className="text-vs-error text-[14px] font-medium">&#10005;</span>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="text-[11px] text-vs-accent hover:underline"
            >
              Retry
            </button>
          )}
        </div>
      );
    case "queued":
      return <div className="w-2 h-2 rounded-full bg-vs-text-muted" />;
  }
}

/* ── stage card ─────────────────────────────────────────────────── */

function StageCard({
  stage,
  onRetry,
}: {
  stage: Stage;
  onRetry?: () => void;
}) {
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
          <span className="font-mono text-[12px] text-vs-text-muted">
            {stage.number}
          </span>
          <span className="text-[13px] font-medium text-vs-text-primary">
            {stage.name}
          </span>
        </div>
        <p className="text-[12px] text-vs-text-secondary leading-[1.5]">
          {stage.description}
        </p>
      </div>
      <div className="ml-3 flex-shrink-0 mt-1">
        <StatusIndicator status={stage.status} onRetry={onRetry} />
      </div>
    </div>
  );
}

/* ── completion summary ─────────────────────────────────────────── */

function CompletionSummary() {
  return (
    <div style={{ animation: "vsFade 0.5s ease-out" }}>
      <div className="flex items-center justify-center gap-10 mt-8 mb-8">
        <div className="text-center">
          <p className="font-mono text-[44px] font-medium tracking-tight text-vs-text-primary leading-none">
            48
          </p>
          <p className="text-[12px] text-vs-text-secondary mt-1">tokens</p>
        </div>
        <div className="text-center">
          <p className="font-mono text-[44px] font-medium tracking-tight text-vs-text-primary leading-none">
            12
          </p>
          <p className="text-[12px] text-vs-text-secondary mt-1">components</p>
        </div>
        <div className="text-center">
          <p className="font-mono text-[44px] font-medium tracking-tight text-vs-warning leading-none">
            31
          </p>
          <p className="text-[12px] text-vs-text-secondary mt-1">issues</p>
        </div>
      </div>

      <div className="flex justify-center">
        <Link
          href="/projects/proj-1/inspect/tokens"
          className="bg-vs-accent text-white rounded-lg px-5 py-2.5 text-[13px] font-medium hover:opacity-90 transition-opacity"
        >
          Open Inspector
        </Link>
      </div>
    </div>
  );
}

/* ── main component ─────────────────────────────────────────────── */

export function ImportProgress() {
  const [stages, setStages] = useState<Stage[]>(initialStages);
  const [complete, setComplete] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setStages((prev) => {
        const runningIdx = prev.findIndex((s) => s.status === "running");

        // All done
        if (runningIdx === -1) {
          const allDone = prev.every((s) => s.status === "done");
          if (allDone) {
            setComplete(true);
            clearInterval(interval);
          }
          return prev;
        }

        const updated = [...prev];
        // Mark running as done
        updated[runningIdx] = { ...updated[runningIdx], status: "done" };

        // Start next if available
        if (runningIdx + 1 < updated.length) {
          updated[runningIdx + 1] = {
            ...updated[runningIdx + 1],
            status: "running",
          };
        }

        return updated;
      });
    }, 1800);

    return () => clearInterval(interval);
  }, []);

  // Progress calculation
  const doneCount = stages.filter((s) => s.status === "done").length;
  const runningIdx = stages.findIndex((s) => s.status === "running");
  const progressPercent =
    runningIdx !== -1
      ? ((doneCount + 0.5) / stages.length) * 100
      : complete
        ? 100
        : (doneCount / stages.length) * 100;

  const handleRetry = useCallback((stageNum: number) => {
    setStages((prev) =>
      prev.map((s) =>
        s.number === stageNum ? { ...s, status: "running" as StageStatus } : s,
      ),
    );
  }, []);

  return (
    <div className="min-h-screen bg-vs-bg-primary">
      <TopBar />

      <main className="max-w-[720px] mx-auto py-10 px-6">
        {/* heading */}
        <h1 className="text-[20px] font-semibold tracking-tight text-vs-text-primary mb-6">
          Importing{" "}
          <span className="font-mono font-medium">
            stitch-export-checkout.zip
          </span>
        </h1>

        {/* progress bar */}
        <div className="h-1 bg-vs-border-default rounded-full overflow-hidden mb-6">
          <div
            className="h-full bg-vs-accent rounded-full transition-[width] duration-600"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* stage cards */}
        <div className="flex flex-col gap-3.5 mb-6">
          {stages.map((stage) => (
            <StageCard
              key={stage.number}
              stage={stage}
              onRetry={
                stage.status === "failed"
                  ? () => handleRetry(stage.number)
                  : undefined
              }
            />
          ))}
        </div>

        {/* continue in background */}
        {!complete && (
          <div className="text-center">
            <Link
              href="/projects"
              className="text-[13px] text-vs-accent hover:underline"
            >
              Continue in background
            </Link>
          </div>
        )}

        {/* completion summary */}
        {complete && <CompletionSummary />}
      </main>
    </div>
  );
}
