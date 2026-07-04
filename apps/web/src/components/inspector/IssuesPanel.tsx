"use client";

import { useState, useMemo } from "react";
import type { Issue, IssueSeverity, IssueKind } from "@/types/ir";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { mockIssues } from "@/lib/mock-data/issues";
import { cn } from "@/lib/utils";

// ─── Constants ────────────────────────────────────────────────────────────

const SEVERITY_FILTERS = ["All", "Error", "Warning", "Info"] as const;
type SeverityFilter = (typeof SEVERITY_FILTERS)[number];

const severityFilterMap: Record<SeverityFilter, IssueSeverity | null> = {
  All: null,
  Error: "error",
  Warning: "warning",
  Info: "info",
};

const KIND_OPTIONS: { value: IssueKind | "all"; label: string }[] = [
  { value: "all", label: "All kinds" },
  { value: "raw-value", label: "Raw values" },
  { value: "unconfirmed-inference", label: "Unconfirmed inferences" },
  { value: "possible-duplicate", label: "Possible duplicates" },
  { value: "missing-state", label: "Missing states" },
  { value: "token-conflict", label: "Token conflicts" },
  { value: "low-contrast", label: "Low contrast" },
];

const kindGroupLabels: Record<IssueKind, string> = {
  "raw-value": "Raw values",
  "unconfirmed-inference": "Unconfirmed inferences",
  "possible-duplicate": "Possible duplicates",
  "missing-state": "Missing states",
  "token-conflict": "Token conflicts",
  "low-contrast": "Low contrast",
};

const kindGroupOrder: IssueKind[] = [
  "raw-value",
  "unconfirmed-inference",
  "possible-duplicate",
  "missing-state",
  "token-conflict",
  "low-contrast",
];

const severityDotColors: Record<IssueSeverity, string> = {
  error: "bg-[#E5484D]",
  warning: "bg-[#FFB224]",
  info: "bg-[#6B7280]",
};

// ─── Helpers ──────────────────────────────────────────────────────────────

function getUniqueComponents(issues: Issue[]): string[] {
  const names = new Set<string>();
  for (const issue of issues) {
    if (issue.componentName) {
      names.add(issue.componentName);
    }
  }
  return Array.from(names).sort();
}

// ─── Issue Row ────────────────────────────────────────────────────────────

function IssueRow({
  issue,
  resolved,
  onResolve,
}: {
  issue: Issue;
  resolved: boolean;
  onResolve: (action: string) => void;
}) {
  const isResolved = resolved || issue.resolved;
  const resolvedLabel = issue.resolvedLabel;

  // Determine primary action label
  const primaryAction = issue.kind === "unconfirmed-inference"
    ? "Confirm"
    : issue.kind === "raw-value"
      ? "Promote"
      : issue.kind === "possible-duplicate"
        ? "Merge"
        : issue.kind === "missing-state"
          ? "Add state"
          : "Fix";

  return (
    <div
      className={cn(
        "group flex items-start min-h-[44px] px-6 py-1.5 border-b border-vs-border-default transition-colors",
        !isResolved && "hover:bg-vs-bg-hover"
      )}
    >
      {/* Severity dot */}
      <span className="flex-none mt-2.5 mr-3">
        <span
          className={cn(
            "block w-2 h-2 rounded-full",
            isResolved ? "bg-[#30A46C]" : severityDotColors[issue.severity]
          )}
        />
      </span>

      {/* Content */}
      <div className="flex-1 min-w-0 py-1">
        <div className="flex items-center gap-2 mb-0.5">
          {issue.componentName && (
            <span className="font-mono text-[11px] text-vs-text-muted flex-none">
              {issue.componentName}
            </span>
          )}
          {issue.tokenName && !issue.componentName && (
            <span className="font-mono text-[11px] text-vs-text-muted flex-none">
              {issue.tokenName}
            </span>
          )}
        </div>
        <p className="text-[12px] text-vs-text-primary leading-[18px] m-0">
          {issue.title}
        </p>
        {issue.description && (
          <p className="text-[11px] text-vs-text-muted leading-[16px] mt-0.5 m-0">
            {issue.description.length > 120
              ? issue.description.slice(0, 120) + "\u2026"
              : issue.description}
          </p>
        )}
      </div>

      {/* Actions or resolved label */}
      <div className="flex-none flex items-center gap-2 ml-3 mt-1.5">
        {isResolved ? (
          <span className="inline-flex items-center gap-1 text-[11px] text-vs-success font-medium">
            <span>&#x2713;</span>
            {resolvedLabel || (primaryAction === "Confirm" ? "Confirmed" : "Promoted")}
          </span>
        ) : (
          <>
            <button
              type="button"
              onClick={() => onResolve(primaryAction)}
              className="bg-vs-accent text-white rounded-md px-2.5 py-1 text-[11px] font-medium cursor-pointer hover:opacity-90 transition-opacity opacity-0 group-hover:opacity-100"
            >
              {primaryAction}
            </button>
            {issue.suggestedAction && (
              <button
                type="button"
                onClick={() => onResolve("dismiss")}
                className="border border-vs-border-strong text-vs-text-secondary rounded-md px-2.5 py-1 text-[11px] cursor-pointer hover:bg-vs-bg-elevated hover:text-vs-text-primary transition-colors opacity-0 group-hover:opacity-100"
              >
                Dismiss
              </button>
            )}
          </>
        )}

        {/* Chevron */}
        <span className="text-vs-text-muted text-[14px] opacity-0 group-hover:opacity-100 transition-opacity ml-1">
          &#x203A;
        </span>
      </div>
    </div>
  );
}

// ─── Main Panel ───────────────────────────────────────────────────────────

export function IssuesPanel() {
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("All");
  const [kindFilter, setKindFilter] = useState<IssueKind | "all">("all");
  const [componentFilter, setComponentFilter] = useState<string>("all");
  const [resolvedIds, setResolvedIds] = useState<Set<string>>(new Set());

  const allComponents = useMemo(() => getUniqueComponents(mockIssues), []);

  // Filter issues
  const filteredIssues = useMemo(() => {
    let issues = mockIssues;

    // Severity filter
    const severity = severityFilterMap[severityFilter];
    if (severity) {
      issues = issues.filter((i) => i.severity === severity);
    }

    // Kind filter
    if (kindFilter !== "all") {
      issues = issues.filter((i) => i.kind === kindFilter);
    }

    // Component filter
    if (componentFilter !== "all") {
      issues = issues.filter((i) => i.componentName === componentFilter);
    }

    return issues;
  }, [severityFilter, kindFilter, componentFilter]);

  // Group issues by kind
  const groupedIssues = useMemo(() => {
    const groups: { kind: IssueKind; label: string; issues: Issue[] }[] = [];

    for (const kind of kindGroupOrder) {
      const issues = filteredIssues.filter((i) => i.kind === kind);
      if (issues.length > 0) {
        groups.push({ kind, label: kindGroupLabels[kind], issues });
      }
    }

    return groups;
  }, [filteredIssues]);

  // Count totals for header
  const totalCount = filteredIssues.length;
  const unresolvedCount = filteredIssues.filter(
    (i) => !i.resolved && !resolvedIds.has(i.id)
  ).length;

  function handleResolve(issueId: string) {
    setResolvedIds((prev) => {
      const next = new Set(prev);
      next.add(issueId);
      return next;
    });
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-vs-bg-primary px-6 py-5 border-b border-vs-border-default">
        <div className="flex items-center gap-3 mb-4">
          <h1 className="text-[20px] font-semibold tracking-tight text-vs-text-primary">
            Issues
          </h1>
          <span className="font-mono text-[13px] text-vs-warning font-medium">
            {unresolvedCount}
          </span>
        </div>

        {/* Filter row */}
        <div className="flex items-center gap-3 flex-wrap">
          <SegmentedControl
            options={[...SEVERITY_FILTERS]}
            value={severityFilter}
            onChange={(v) => setSeverityFilter(v as SeverityFilter)}
            size="sm"
          />

          {/* Kind select */}
          <select
            value={kindFilter}
            onChange={(e) => setKindFilter(e.target.value as IssueKind | "all")}
            className="bg-vs-bg-surface border border-vs-border-default rounded-md text-[12px] text-vs-text-primary px-2.5 py-1.5 appearance-none cursor-pointer focus:border-vs-accent focus:shadow-[0_0_0_2px_rgba(124,111,240,0.25)] outline-none transition-colors pr-7"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' fill='none'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%236B7280' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
              backgroundRepeat: "no-repeat",
              backgroundPosition: "right 8px center",
            }}
          >
            {KIND_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          {/* Component select */}
          <select
            value={componentFilter}
            onChange={(e) => setComponentFilter(e.target.value)}
            className="bg-vs-bg-surface border border-vs-border-default rounded-md text-[12px] text-vs-text-primary px-2.5 py-1.5 appearance-none cursor-pointer focus:border-vs-accent focus:shadow-[0_0_0_2px_rgba(124,111,240,0.25)] outline-none transition-colors pr-7"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' fill='none'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%236B7280' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
              backgroundRepeat: "no-repeat",
              backgroundPosition: "right 8px center",
            }}
          >
            <option value="all">All components</option>
            {allComponents.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Issue list */}
      <div className="flex-1 overflow-y-auto">
        {groupedIssues.length === 0 ? (
          <div className="px-6 py-12 text-center text-[13px] text-vs-text-muted">
            No issues match the current filters.
          </div>
        ) : (
          groupedIssues.map((group) => (
            <div key={group.kind}>
              {/* Group header */}
              <div className="sticky top-0 z-[5] bg-vs-bg-primary border-b border-vs-border-default px-6 py-4 flex items-center gap-2">
                <span className="text-[15px] font-semibold text-vs-text-primary">
                  {group.label}
                </span>
                <span className="font-mono text-[11px] text-vs-text-muted">
                  {group.issues.length}
                </span>
              </div>

              {/* Issue rows */}
              {group.issues.map((issue) => (
                <IssueRow
                  key={issue.id}
                  issue={issue}
                  resolved={resolvedIds.has(issue.id)}
                  onResolve={() => handleResolve(issue.id)}
                />
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
