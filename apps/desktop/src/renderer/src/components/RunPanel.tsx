import { useEffect, useRef, useState } from "react";
import { activityTone, type RunModel, type RunStatus } from "../lib/run-model";
import { Card, Spinner } from "./ui";

/**
 * Presentational view of a run model: status bar, friendly progress (streaming
 * text, files touched, activity, result) and a raw-terminal toggle. Stateless
 * except for the local friendly/raw toggle.
 */
export function RunPanel({ model }: { model: RunModel }): React.JSX.Element {
  const [showRaw, setShowRaw] = useState(false);
  const running = model.status === "running";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <StatusBar model={model} />
        <button
          onClick={() => setShowRaw((v) => !v)}
          className="text-xs text-vs-text-secondary hover:text-vs-text-primary"
          title="Toggle the raw Claude Code output"
        >
          {showRaw ? "Friendly view" : "Terminal"}
        </button>
      </div>
      {showRaw ? (
        <RawTerminal lines={model.raw} />
      ) : (
        <FriendlyView model={model} running={running} />
      )}
    </div>
  );
}

function StatusBar({ model }: { model: RunModel }): React.JSX.Element {
  const label: Record<RunStatus, string> = {
    idle: "Ready",
    running: "Running",
    done: "Completed",
    error: "Failed",
    canceled: "Canceled",
  };
  const tone: Record<RunStatus, string> = {
    idle: "text-vs-text-muted",
    running: "text-vs-warning",
    done: "text-vs-success",
    error: "text-vs-error",
    canceled: "text-vs-text-secondary",
  };
  return (
    <div className="flex items-center gap-2 text-xs">
      {model.status === "running" && <Spinner />}
      <span className={tone[model.status]}>{label[model.status]}</span>
      {model.model && <span className="text-vs-text-muted">· {model.model}</span>}
      {model.result?.costUsd !== undefined && (
        <span className="text-vs-text-muted">· ${model.result.costUsd.toFixed(4)}</span>
      )}
    </div>
  );
}

function FriendlyView({
  model,
  running,
}: {
  model: RunModel;
  running: boolean;
}): React.JSX.Element {
  const idle = model.status === "idle";
  if (idle) {
    return (
      <p className="text-xs text-vs-text-muted">
        Start the step to stream live progress here.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {model.mcpErrors.length > 0 && (
        <div className="rounded-md border border-vs-warning-border bg-vs-warning-muted px-3 py-2 text-xs text-vs-warning">
          MCP issue: {model.mcpErrors.join("; ")}
        </div>
      )}
      {model.files.length > 0 && (
        <Card className="p-3">
          <p className="mb-1 text-xs font-medium text-vs-text-secondary">Files touched</p>
          <ul className="flex flex-col gap-0.5">
            {model.files.map((f) => (
              <li key={f} className="font-mono text-xs text-vs-text-primary">
                {f}
              </li>
            ))}
          </ul>
        </Card>
      )}
      {(model.streamingText || running) && (
        <Card className="p-3">
          <p className="mb-1 text-xs font-medium text-vs-text-secondary">Assistant</p>
          <p className="whitespace-pre-wrap text-sm text-vs-text-primary">
            {model.streamingText}
            {running && <span className="text-vs-text-muted"> ▍</span>}
          </p>
        </Card>
      )}
      {model.activity.length > 0 && (
        <Card className="p-3">
          <p className="mb-1 text-xs font-medium text-vs-text-secondary">Activity</p>
          <ul className="flex flex-col gap-1">
            {model.activity.map((a) => (
              <li key={a.key} className="text-xs text-vs-text-secondary">
                <span className={activityTone(a.tone)}>•</span> {a.label}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function RawTerminal({ lines }: { lines: string[] }): React.JSX.Element {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView();
  }, [lines.length]);
  return (
    <div className="h-80 overflow-auto rounded-md border border-vs-border-default bg-black/40 p-3">
      <pre className="font-mono text-[11px] leading-relaxed text-vs-text-secondary">
        {lines.length === 0 ? "Raw Claude Code output will appear here…" : lines.join("\n")}
      </pre>
      <div ref={endRef} />
    </div>
  );
}
