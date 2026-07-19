import { useState } from "react";
import type { JSX } from "react";
import { ShieldAlert, ChevronRight, ChevronDown } from "lucide-react";
import type { DesignAudit } from "@vortspec/core/ipc";

/**
 * The design-system audit surface (Plan B4). A compact, collapsible banner over the
 * token inspector that shows how many divergences the index found — hardcoded values a
 * token already names, and tokens drifted from Figma — and lists them on expand. Renders
 * nothing when the system is clean, so it's silent until there's something to fix.
 */
export function AuditBanner({ audit }: { audit: DesignAudit | null }): JSX.Element | null {
  const [open, setOpen] = useState(false);
  if (!audit || audit.findings.length === 0) return null;

  const errors = audit.findings.filter((f) => f.severity === "error").length;
  const summary = [
    `${audit.summary.findings} audit ${audit.summary.findings === 1 ? "finding" : "findings"}`,
    errors > 0 ? `${errors} to fix` : null,
    audit.summary.drifted > 0 ? `${audit.summary.drifted} drifted` : null,
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
        <ul className="max-h-56 overflow-y-auto px-4 pb-2">
          {audit.findings.map((f, i) => (
            <li key={`${f.component}-${i}`} data-testid="audit-finding" className="flex items-start gap-2 py-1 text-[12px]">
              <span
                className={`mt-px flex-none rounded px-1 text-[9px] uppercase ${
                  f.severity === "error" ? "bg-vs-danger-subtle text-vs-danger" : "bg-vs-bg-hover text-vs-text-muted"
                }`}
              >
                {f.severity === "error" ? "fix" : "drift"}
              </span>
              <span className="min-w-0">
                <span className="font-medium text-vs-text-primary">{f.component}</span>{" "}
                <span className="text-vs-text-secondary">{f.message}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
