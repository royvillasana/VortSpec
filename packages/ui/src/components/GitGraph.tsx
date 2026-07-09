import { useEffect, useMemo, useState } from "react";
import type { JSX } from "react";
import type { GitGraphResult, Project } from "@vortspec/core/ipc";
import { api } from "../lib/api";
import { computeGraph, refKind, type GraphRow } from "../lib/git-graph";
import { Spinner } from "./ui";

/**
 * Commit Graph (change: source-control-commit-graph).
 *
 * A GitLens-style graph for the Source Control view: repo-wide stats
 * (commits / branches / merges / tags) atop a bifurcating lane graph of the
 * commit history with branch & merge decorations. Read-only — it drives the
 * user's own `git` through the adapter, no history rewrite.
 */
const LANE_W = 14;
const ROW_H = 30;

export function GitGraph({ project, refreshKey = 0 }: { project: Project; refreshKey?: number }): JSX.Element {
  const [data, setData] = useState<GitGraphResult | null>(null);

  useEffect(() => {
    let alive = true;
    setData(null);
    void api
      .gitGraph(project.path)
      .then((d) => alive && setData(d))
      .catch(() => alive && setData(null));
    return () => {
      alive = false;
    };
  }, [project.path, refreshKey]);

  const { rows, maxLanes } = useMemo(
    () => (data ? computeGraph(data.commits) : { rows: [], maxLanes: 1 }),
    [data],
  );
  const graphW = maxLanes * LANE_W + LANE_W;

  if (!data) {
    return (
      <div className="flex items-center gap-2 px-1 py-3 text-sm text-vs-text-secondary">
        <Spinner /> Reading history…
      </div>
    );
  }
  if (data.commits.length === 0) {
    return <p className="px-1 py-2 text-[12px] text-vs-text-muted">No commits yet.</p>;
  }

  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-center gap-2 pb-3">
        <Stat label="commits" value={data.stats.commits} />
        <Stat label="branches" value={data.stats.branches} />
        {data.stats.remoteBranches > 0 && <Stat label="remote" value={data.stats.remoteBranches} />}
        <Stat label="merges" value={data.stats.merges} />
        {data.stats.tags > 0 && <Stat label="tags" value={data.stats.tags} />}
      </div>
      {/* Horizontal scroll only (wide graphs); vertical flows in the page's single
          scroll container so there is at most one scrollbar. */}
      <div className="overflow-x-auto rounded-md border border-vs-border-default bg-vs-bg-surface">
        {rows.map((row) => (
          <GraphRowView key={row.commit.hash} row={row} graphW={graphW} />
        ))}
      </div>
      {data.truncated && (
        <p className="pt-1.5 text-[10px] text-vs-text-muted">
          Showing the {data.commits.length} most recent of {data.stats.commits} commits.
        </p>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }): JSX.Element {
  return (
    <span className="inline-flex items-baseline gap-1 rounded border border-vs-border-default bg-vs-bg-surface px-2 py-1 text-[11px]">
      <b className="text-sm text-vs-text-primary">{value}</b>
      <span className="text-vs-text-muted">{label}</span>
    </span>
  );
}

function GraphRowView({ row, graphW }: { row: GraphRow; graphW: number }): JSX.Element {
  const cx = (lane: number): number => lane * LANE_W + LANE_W / 2 + 4;
  const cy = (y: number): number => y * ROW_H;
  return (
    <div
      className="flex items-center gap-2 border-b border-vs-border-subtle px-1 last:border-b-0 hover:bg-vs-bg-hover"
      style={{ height: ROW_H }}
    >
      <svg width={graphW} height={ROW_H} className="flex-none">
        {row.lines.map((l, i) => {
          const midY = cy((l.y1 + l.y2) / 2);
          return (
            <path
              key={i}
              d={`M ${cx(l.x1)} ${cy(l.y1)} C ${cx(l.x1)} ${midY}, ${cx(l.x2)} ${midY}, ${cx(l.x2)} ${cy(l.y2)}`}
              stroke={l.color}
              strokeWidth={1.5}
              fill="none"
            />
          );
        })}
        <circle
          cx={cx(row.lane)}
          cy={cy(0.5)}
          r={3.5}
          fill={row.color}
          stroke="var(--color-vs-bg-surface)"
          strokeWidth={1.5}
        />
      </svg>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {row.commit.refs.map((r) => (
          <RefBadge key={r} name={r} />
        ))}
        <span className="min-w-0 flex-1 truncate text-[12px] text-vs-text-primary" title={row.commit.subject}>
          {row.commit.subject}
        </span>
        <span className="hidden flex-none text-[11px] text-vs-text-muted md:inline">{row.commit.author}</span>
        <span className="flex-none text-[11px] text-vs-text-muted">{row.commit.date}</span>
        <span className="flex-none font-mono text-[10px] text-vs-text-muted">{row.commit.shortHash}</span>
      </div>
    </div>
  );
}

function RefBadge({ name }: { name: string }): JSX.Element {
  const { kind, label } = refKind(name);
  const cls =
    kind === "head"
      ? "bg-vs-accent text-white"
      : kind === "remote"
        ? "border border-vs-border-default text-vs-text-secondary"
        : kind === "tag"
          ? "bg-vs-warning/20 text-vs-warning"
          : "bg-vs-bg-elevated text-vs-text-secondary";
  return <span className={`flex-none whitespace-nowrap rounded px-1.5 py-px text-[10px] ${cls}`}>{label}</span>;
}
