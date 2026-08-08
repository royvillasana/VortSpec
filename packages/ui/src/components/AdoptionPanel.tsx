import { useState } from "react";
import type { JSX } from "react";
import { ChevronDown, ChevronRight, Copy, AlertTriangle } from "lucide-react";
import type { AdoptionSummary } from "@vortspec/core/ipc";

/**
 * Component adoption on the Design System screen.
 *
 * The adoption report was generated from the first day of the index and read by nobody: it lived
 * only as `.vortspec/ai/reports/adoption.md`, which the app could reveal in Finder and not display.
 * This is the surface for it.
 *
 * **Ordered by what is actionable, not by size.** Imported-but-never-rendered comes first because it
 * is the only unambiguous waste — the import is paid on every build and buys nothing. `unimported`
 * comes second and is deliberately NOT called dead: the graph cannot tell a component nobody kept
 * using from one built this morning, and a panel that labelled both "unused" would get the new one
 * deleted.
 */
export function AdoptionPanel({
  adoption,
  onOpenReport,
}: {
  adoption: AdoptionSummary | null;
  /** Reveals `reports/adoption.md`. Omitted → the link is not shown rather than shown dead. */
  onOpenReport?: () => void;
}): JSX.Element | null {
  const [open, setOpen] = useState(false);

  // Null means the index has not been built. Rendering zeroes would say "nothing is unused" while
  // meaning "we have not looked" — the two are opposite claims.
  if (!adoption) return null;

  const waste = adoption.importedNeverRendered.length;
  const unused = adoption.unimported.length;
  const shadows = adoption.shadows.length;
  const clean = waste === 0 && unused === 0 && shadows === 0;

  return (
    <section
      data-testid="adoption-panel"
      className="border-b border-vs-border-subtle bg-vs-bg-secondary px-4 py-2"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] uppercase tracking-wide text-vs-text-muted">Adoption</span>
        <span className="text-[12px] text-vs-text-primary">
          {adoption.adopted.length} of {adoption.total} components in use
        </span>
        {waste > 0 && (
          <span className="rounded bg-vs-danger-subtle px-1 text-[10px] uppercase text-vs-danger">
            {waste} imported, never rendered
          </span>
        )}
        {unused > 0 && (
          <span className="rounded bg-vs-bg-hover px-1 text-[10px] uppercase text-vs-text-muted">
            {unused} unimported
          </span>
        )}
        {shadows > 0 && (
          <span className="rounded bg-vs-bg-hover px-1 text-[10px] uppercase text-vs-text-muted">
            {shadows} shadow
          </span>
        )}

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="ml-auto flex items-center gap-1 text-[11px] text-vs-text-secondary hover:text-vs-text-primary"
        >
          {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          {open ? "Hide" : "Details"}
        </button>
      </div>

      {adoption.stale && (
        <p data-testid="adoption-stale" className="flex items-center gap-1 pt-1 text-[11px] text-vs-warning">
          <AlertTriangle size={11} className="flex-none" />
          The index has not been rebuilt since the code changed — these numbers describe an earlier state.
        </p>
      )}
      {adoption.truncated && (
        <p className="pt-1 text-[11px] text-vs-text-muted">
          The scan hit its file limit, so these counts are a floor rather than a total.
        </p>
      )}

      {open && (
        <div className="pt-2">
          {clean && (
            <p data-testid="adoption-clean" className="text-[12px] text-vs-text-secondary">
              Every component is imported and rendered somewhere, and nothing reimplements one.
            </p>
          )}

          <Group
            title="Imported but never rendered"
            note="The import is paid for on every build and buys nothing. This is the actionable list."
            rows={adoption.importedNeverRendered.map((row) => ({
              key: row.name,
              primary: row.name,
              secondary: row.importedBy.length ? `imported by ${row.importedBy.join(", ")}` : row.path,
            }))}
          />

          <Group
            title="Unimported"
            note="Nothing imports these — either just built, or nobody kept using them. The graph cannot tell which."
            rows={adoption.unimported.map((row) => ({
              key: row.name,
              primary: row.name,
              secondary: [row.tier, row.path].filter(Boolean).join(" · "),
            }))}
          />

          <Group
            title="Shadow implementations"
            note="Files reproducing a component's token signature without importing it — the duplicate built when nobody knew the component existed."
            icon={<Copy size={11} className="flex-none text-vs-text-muted" />}
            rows={adoption.shadows.map((shadow, i) => ({
              key: `${shadow.component}-${i}`,
              primary: `${shadow.component} → ${shadow.file}`,
              secondary: `${Math.round(shadow.overlap * 100)}% overlap · ${shadow.sharedTokens.join(", ")}`,
            }))}
          />

          {onOpenReport && (
            <button
              type="button"
              onClick={onOpenReport}
              className="pt-1 text-[11px] text-vs-text-secondary hover:text-vs-text-primary"
            >
              Open the full adoption report
            </button>
          )}
        </div>
      )}
    </section>
  );
}

/** A section that found nothing is OMITTED here, because the summary line above already said so. */
function Group({
  title,
  note,
  rows,
  icon,
}: {
  title: string;
  note: string;
  icon?: JSX.Element;
  rows: { key: string; primary: string; secondary: string }[];
}): JSX.Element | null {
  if (!rows.length) return null;
  return (
    <div className="pb-2">
      <p className="flex items-center gap-1 text-[11px] font-medium text-vs-text-primary">
        {icon}
        {title} ({rows.length})
      </p>
      <p className="pb-1 text-[11px] text-vs-text-muted">{note}</p>
      <ul className="max-h-40 overflow-y-auto">
        {rows.map((row) => (
          <li key={row.key} data-testid="adoption-row" className="py-0.5 text-[12px]">
            <span className="text-vs-text-primary">{row.primary}</span>
            {row.secondary && <span className="block text-vs-text-muted">{row.secondary}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
