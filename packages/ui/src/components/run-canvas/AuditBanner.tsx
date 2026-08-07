import { useMemo, useState } from "react";
import type { JSX } from "react";
import { ShieldAlert, ChevronRight, ChevronDown, FileText } from "lucide-react";
import type { AuditFinding, DesignAudit } from "@vortspec/core/ipc";

/**
 * The design-system audit surface (Plan B4, extended by agentic-design-system task 4.8).
 *
 * A compact, collapsible banner over the token inspector listing what the audit found. It now
 * carries governance v2's INTENT findings alongside the existence ones, filterable by kind, and
 * links the two generated reports.
 *
 * Renders nothing when everything is clean and nothing was deferred, so it stays silent until there
 * is something to act on.
 */

/** Short chip labels. A kind nobody has a label for shows its raw kind rather than a blank chip. */
const KIND_LABEL: Record<string, string> = {
  "hardcoded-color": "hardcoded",
  "token-drift": "drift",
  unused: "unused",
  "shadow-implementation": "shadow",
  "styling-lost-token": "lost token",
  "wrong-variant-for-context": "variant",
  "hierarchy-inversion": "hierarchy",
  "elevation-drift": "elevation",
  "semantic-misuse": "semantic",
  "typography-split": "typography",
};

export interface AuditBannerProps {
  audit: DesignAudit | null;
  /** Governance v2 violations, from the report run (task 4.8). */
  governance?: readonly AuditFinding[];
  /** How many judgment rules have not been judged — surfaced, never counted as clean. */
  deferred?: number;
  /** Project-relative report paths, for the "open the report" affordance. */
  reports?: readonly string[];
  /** Opens a report file. Omitted → the paths render as plain text rather than dead buttons. */
  onOpenReport?: (path: string) => void;
}

export function AuditBanner({
  audit,
  governance = [],
  deferred = 0,
  reports = [],
  onOpenReport,
}: AuditBannerProps): JSX.Element | null {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<string | null>(null);

  const findings = useMemo(
    () => [...(audit?.findings ?? []), ...governance],
    [audit, governance],
  );

  // Deferred checks alone are enough to show the banner: "nothing was found" and "some checks have
  // not run" are different states, and collapsing them would report a project as clean on the
  // strength of checks nobody performed.
  if (findings.length === 0 && deferred === 0) return null;

  const errors = findings.filter((f) => f.severity === "error").length;
  const kinds = [...new Set(findings.map((f) => f.kind))].sort();
  const shown = kind ? findings.filter((f) => f.kind === kind) : findings;

  const summary = [
    `${findings.length} audit ${findings.length === 1 ? "finding" : "findings"}`,
    errors > 0 ? `${errors} to fix` : null,
    audit && audit.summary.drifted > 0 ? `${audit.summary.drifted} drifted` : null,
    deferred > 0 ? `${deferred} not yet judged` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <section data-testid="audit-banner" className="border-b border-vs-border-subtle bg-vs-bg-secondary">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-4 py-2 text-left text-[12px] text-vs-text-secondary hover:text-vs-text-primary"
      >
        {open ? <ChevronDown size={13} className="flex-none" /> : <ChevronRight size={13} className="flex-none" />}
        <ShieldAlert size={13} className={`flex-none ${errors > 0 ? "text-vs-danger" : "text-vs-warning"}`} />
        <span className="font-medium">{summary}</span>
      </button>

      {open && (
        <div className="px-4 pb-2">
          {kinds.length > 1 && (
            <div data-testid="audit-kind-filter" className="flex flex-wrap gap-1 pb-2">
              <FilterChip label={`all (${findings.length})`} active={kind === null} onClick={() => setKind(null)} />
              {kinds.map((k) => (
                <FilterChip
                  key={k}
                  label={`${KIND_LABEL[k] ?? k} (${findings.filter((f) => f.kind === k).length})`}
                  active={kind === k}
                  onClick={() => setKind(k)}
                />
              ))}
            </div>
          )}

          <ul className="max-h-56 overflow-y-auto">
            {shown.map((f, i) => (
              <li
                key={`${f.component}-${f.kind}-${i}`}
                data-testid="audit-finding"
                className="flex items-start gap-2 py-1 text-[12px]"
              >
                <span
                  className={`mt-px flex-none rounded px-1 text-[10px] uppercase ${
                    f.severity === "error" ? "bg-vs-danger-subtle text-vs-danger" : "bg-vs-bg-hover text-vs-text-muted"
                  }`}
                >
                  {KIND_LABEL[f.kind] ?? f.kind}
                </span>
                <span className="min-w-0">
                  <span className="font-medium text-vs-text-primary">{f.component}</span>{" "}
                  <span className="text-vs-text-secondary">{f.message}</span>
                  {/* The correction is its own line, not appended: it is the part that gets acted on. */}
                  {f.correction && (
                    <span data-testid="audit-correction" className="block text-vs-text-muted">
                      Fix: {f.correction}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>

          {deferred > 0 && (
            <p data-testid="audit-deferred" className="pt-1 text-[11px] text-vs-text-muted">
              {deferred} check{deferred === 1 ? "" : "s"} need a model to decide and have not been judged — neither
              passing nor failing.
            </p>
          )}

          {reports.length > 0 && (
            <div data-testid="audit-reports" className="flex flex-wrap gap-2 pt-2">
              {reports.map((path) =>
                onOpenReport ? (
                  <button
                    key={path}
                    type="button"
                    onClick={() => onOpenReport(path)}
                    className="flex items-center gap-1 text-[11px] text-vs-text-secondary hover:text-vs-text-primary"
                  >
                    <FileText size={11} className="flex-none" />
                    {path.split("/").pop()}
                  </button>
                ) : (
                  <span key={path} className="flex items-center gap-1 text-[11px] text-vs-text-muted">
                    <FileText size={11} className="flex-none" />
                    {path.split("/").pop()}
                  </span>
                ),
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded px-1.5 py-0.5 text-[10px] ${
        active ? "bg-vs-bg-hover text-vs-text-primary" : "text-vs-text-muted hover:text-vs-text-secondary"
      }`}
    >
      {label}
    </button>
  );
}
