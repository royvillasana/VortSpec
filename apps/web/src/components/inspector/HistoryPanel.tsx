"use client";

import { useState, useCallback, useEffect } from "react";
import { useToast } from "@/components/ui/toast";
import type { HistoryEntry as DataHistoryEntry } from "@/lib/data/history";

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

type Author = "user" | "assistant" | "pipeline";
type Kind = "patch" | "import";

interface RenameOp {
  from: string;
  to: string;
}

interface HistoryEntry {
  id: number | string;
  title: string;
  author: Author;
  kind: Kind;
  rejected?: boolean;
  versionFrom?: number;
  versionTo?: number;
  timestamp: string;
  renames?: RenameOp[];
  undoable?: boolean;
  importMeta?: string;
}

/* ------------------------------------------------------------------ */
/*  Static data                                                       */
/* ------------------------------------------------------------------ */

const ENTRIES: HistoryEntry[] = [
  {
    id: 1,
    title: "Promote #FFFFFF to color/surface/base",
    author: "user",
    kind: "patch",
    versionFrom: 13,
    versionTo: 14,
    timestamp: "2 min ago",
    undoable: true,
  },
  {
    id: 2,
    title: "Rename 18 color tokens",
    author: "assistant",
    kind: "patch",
    versionFrom: 12,
    versionTo: 13,
    timestamp: "1h ago",
    renames: [
      { from: "color/primary/100", to: "color/brand/primary/100" },
      { from: "color/primary/200", to: "color/brand/primary/200" },
      { from: "color/primary/300", to: "color/brand/primary/300" },
      { from: "color/primary/400", to: "color/brand/primary/400" },
      { from: "color/primary/500", to: "color/brand/primary/500" },
      { from: "color/secondary/100", to: "color/brand/secondary/100" },
      { from: "color/secondary/200", to: "color/brand/secondary/200" },
      { from: "color/secondary/300", to: "color/brand/secondary/300" },
      { from: "color/neutral/100", to: "color/base/neutral/100" },
      { from: "color/neutral/200", to: "color/base/neutral/200" },
      { from: "color/neutral/300", to: "color/base/neutral/300" },
      { from: "color/neutral/400", to: "color/base/neutral/400" },
      { from: "color/neutral/500", to: "color/base/neutral/500" },
      { from: "color/accent/100", to: "color/brand/accent/100" },
      { from: "color/accent/200", to: "color/brand/accent/200" },
      { from: "color/accent/300", to: "color/brand/accent/300" },
      { from: "color/success", to: "color/semantic/success" },
      { from: "color/error", to: "color/semantic/error" },
    ],
    undoable: true,
  },
  {
    id: 3,
    title: "Normalize spacing scale to 4px grid",
    author: "assistant",
    kind: "patch",
    versionFrom: 11,
    versionTo: 12,
    timestamp: "1h ago",
  },
  {
    id: 4,
    title: "Round Button corners to 12px",
    author: "assistant",
    kind: "patch",
    rejected: true,
    timestamp: "1h ago",
  },
  {
    id: 5,
    title: "Confirm axis size on Button",
    author: "user",
    kind: "patch",
    versionFrom: 10,
    versionTo: 11,
    timestamp: "Yesterday",
  },
  {
    id: 6,
    title: "Merge 3 grey tokens into color/neutral/500",
    author: "user",
    kind: "patch",
    versionFrom: 9,
    versionTo: 10,
    timestamp: "Yesterday",
  },
  {
    id: 7,
    title: "Imported stitch-export-checkout.zip, 48 tokens, 12 components",
    author: "pipeline",
    kind: "import",
    versionTo: 1,
    timestamp: "Jul 2",
  },
];

/* ------------------------------------------------------------------ */
/*  Dot color map                                                     */
/* ------------------------------------------------------------------ */

const DOT_COLOR: Record<Author, string> = {
  user: "bg-vs-success",
  assistant: "bg-vs-accent",
  pipeline: "bg-vs-text-muted",
};

/* ------------------------------------------------------------------ */
/*  Sub-components                                                    */
/* ------------------------------------------------------------------ */

function CheckIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      className="flex-none text-vs-success"
    >
      <path
        d="M3 6.5L5 8.5L9 3.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function AuthorChip({ author }: { author: Author }) {
  const styles: Record<Author, string> = {
    user: "text-vs-text-secondary border-vs-border-strong",
    assistant: "text-vs-accent border-[rgba(124,111,240,0.4)]",
    pipeline: "text-vs-text-muted border-vs-border-default",
  };
  return (
    <span
      className={`font-mono text-[10px] rounded px-1.5 py-px border ${styles[author]}`}
    >
      {author}
    </span>
  );
}

function KindChip({ kind }: { kind: Kind }) {
  return (
    <span className="font-mono text-[10px] rounded px-1.5 py-px border border-vs-border-default text-vs-text-muted">
      {kind}
    </span>
  );
}

function RejectedChip() {
  return (
    <span className="font-mono text-[10px] rounded px-1.5 py-px border border-vs-error/40 text-vs-error">
      rejected
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Diff table                                                        */
/* ------------------------------------------------------------------ */

function DiffTable({ renames }: { renames: RenameOp[] }) {
  return (
    <table className="w-full font-mono text-[11px] mt-2">
      <tbody>
        {renames.map((r, i) => (
          <tr key={i} className="border-t border-vs-border-default">
            <td className="py-1 pr-3 text-vs-text-muted line-through whitespace-nowrap">
              {r.from}
            </td>
            <td className="py-1 text-vs-text-muted px-1">&rarr;</td>
            <td className="py-1 pl-1">
              <span className="bg-[rgba(48,164,108,0.12)] text-vs-success px-1 rounded-sm">
                {r.to}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ------------------------------------------------------------------ */
/*  History Card                                                      */
/* ------------------------------------------------------------------ */

function HistoryCard({
  entry,
  expanded,
  onToggleExpand,
  onUndo,
  undone,
}: {
  entry: HistoryEntry;
  expanded: boolean;
  onToggleExpand: () => void;
  onUndo: () => void;
  undone: boolean;
}) {
  const isApplied = !entry.rejected && !undone;
  const isImport = entry.kind === "import";

  const cardBorder = isImport
    ? "border-vs-border-default"
    : "border-vs-border-strong";

  const versionText = undone
    ? "Undone"
    : entry.rejected
      ? "Rejected"
      : entry.versionFrom
        ? `Applied, v${entry.versionFrom} \u2192 v${entry.versionTo}`
        : entry.versionTo
          ? `v${entry.versionTo}`
          : "";

  return (
    <div
      className={`bg-vs-bg-elevated border ${cardBorder} rounded-lg px-3 py-2.5`}
    >
      {/* Title row */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {isApplied && !isImport && <CheckIcon />}
        <span className="text-[12px] text-vs-text-primary font-medium mr-auto">
          {entry.title}
        </span>
        <AuthorChip author={entry.author} />
        {entry.rejected && <RejectedChip />}
        <KindChip kind={entry.kind} />
      </div>

      {/* Meta row */}
      <div className="flex items-center gap-2 mt-1.5 text-[11px] text-vs-text-muted">
        {versionText && <span className="font-mono">{versionText}</span>}
        <span>&middot;</span>
        <span>{entry.timestamp}</span>

        {entry.renames && entry.renames.length > 0 && (
          <>
            <span>&middot;</span>
            <button
              onClick={onToggleExpand}
              className="text-vs-accent hover:underline font-mono text-[11px]"
            >
              {expanded
                ? "Hide renames"
                : `Show ${entry.renames.length} renames`}
            </button>
          </>
        )}

        {entry.undoable && !entry.rejected && !undone && (
          <>
            <span className="ml-auto" />
            <button
              onClick={onUndo}
              className="border border-vs-border-strong rounded-md px-2 py-1 text-[11px] text-vs-text-secondary hover:bg-vs-bg-elevated transition-colors"
            >
              Undo
            </button>
          </>
        )}
      </div>

      {/* Expandable diff */}
      {expanded && entry.renames && <DiffTable renames={entry.renames} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  History Panel (main export)                                       */
/* ------------------------------------------------------------------ */

function mapDataEntries(entries: DataHistoryEntry[]): HistoryEntry[] {
  return entries.map((e) => ({
    id: e.id,
    title: e.title,
    author: e.author,
    kind: e.kind,
    rejected: e.rejected,
    versionFrom: e.versionFrom,
    versionTo: e.versionTo,
    timestamp: e.timestamp,
    renames: e.renames,
    undoable: e.undoable,
    importMeta: e.importMeta,
  }));
}

export function HistoryPanel({ initialEntries }: { initialEntries?: DataHistoryEntry[] }) {
  const entries = initialEntries ? mapDataEntries(initialEntries) : ENTRIES;

  const { showToast } = useToast();
  const [expandedEntry, setExpandedEntry] = useState<number | string | null>(null);
  const [undoneIds, setUndoneIds] = useState<Set<number | string>>(new Set());
  const [version, setVersion] = useState(14);

  const handleUndo = useCallback(
    (entry: HistoryEntry) => {
      setUndoneIds((prev) => new Set(prev).add(entry.id));
      setVersion((v) => v - 1);
      showToast(`Undone: "${entry.title}" \u2014 now at v${version - 1}`);
    },
    [showToast, version],
  );

  /* Cmd+Z / Ctrl+Z keyboard shortcut for undo */
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        const active = entries.filter((en) => !en.rejected && !undoneIds.has(en.id));
        if (active.length > 0) handleUndo(active[0]);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [entries, undoneIds, handleUndo]);

  return (
    <div className="px-6 py-6 max-w-[640px]">
      <h1 className="text-[20px] font-semibold tracking-tight text-vs-text-primary mb-6">
        History
      </h1>

      {/* Timeline list */}
      <div className="relative">
        {entries.map((entry, idx) => {
          const isLast = idx === entries.length - 1;
          const isRejected = entry.rejected;
          const isUndone = undoneIds.has(entry.id);
          const dimmed = isRejected || isUndone;

          return (
            <div
              key={entry.id}
              className={`flex gap-4 ${dimmed ? "opacity-55" : ""}`}
            >
              {/* Gutter */}
              <div className="flex flex-col items-center flex-none w-3">
                {/* Dot */}
                <div
                  className={`w-2 h-2 rounded-full mt-3 flex-none ${DOT_COLOR[entry.author]}`}
                />
                {/* Vertical line */}
                {!isLast && (
                  <div className="w-px flex-1 bg-vs-border-default mt-1" />
                )}
              </div>

              {/* Card */}
              <div className="flex-1 min-w-0 pb-4">
                <HistoryCard
                  entry={entry}
                  expanded={expandedEntry === entry.id}
                  onToggleExpand={() =>
                    setExpandedEntry((prev) =>
                      prev === entry.id ? null : entry.id,
                    )
                  }
                  onUndo={() => handleUndo(entry)}
                  undone={isUndone}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
