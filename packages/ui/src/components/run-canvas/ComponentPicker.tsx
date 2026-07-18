import { useState } from "react";
import type { JSX } from "react";
import type { InspectorComponent } from "@vortspec/core/ipc";

/**
 * The shared design-system component picker (change: canvas-compose-and-preview-bar).
 *
 * One searchable roster list, reused wherever the user picks a component: the
 * insert dialog's Components tab (multi-select → build context) and the inspect
 * dialog (single pick → assign to the selected element). Hovering a row previews
 * the component **live from Storybook** — its story in its initial state, shown
 * the same way the Playground shows the running app — rather than a captured image.
 */

const LEVEL_ORDER: Record<string, number> = { atom: 0, molecule: 1, organism: 2 };

export function ComponentPicker({
  components,
  onPick,
  recommended = null,
  actionLabel = "pick",
  showAllSimilar = false,
  onExtract,
  getStoryUrl,
  selectedNames,
}: {
  components: InspectorComponent[];
  /** Click a row — opts.allSimilar only meaningful when `showAllSimilar`. */
  onPick: (component: InspectorComponent, opts: { allSimilar: boolean }) => void;
  /** A recommended component pinned first with a badge (assign mode). */
  recommended?: string | null;
  /** Verb shown in the empty-hover hint ("insert" / "assign"). */
  actionLabel?: string;
  /** Show the "apply to every matching element" toggle (assign mode). */
  showAllSimilar?: boolean;
  /** Offer extract-a-new-component when nothing fits. */
  onExtract?: () => void;
  /** A Storybook iframe URL for a component's initial state, or null when unavailable. */
  getStoryUrl?: (name: string) => string | null;
  /** Names currently selected (multi-select mode) — shown with a check; click toggles. */
  selectedNames?: string[];
}): JSX.Element {
  const [query, setQuery] = useState("");
  const [allSimilar, setAllSimilar] = useState(true);
  const [hovered, setHovered] = useState<InspectorComponent | null>(null);
  const selected = new Set(selectedNames ?? []);

  const q = query.trim().toLowerCase();
  const sorted = [...components].sort((a, b) => {
    if (a.name === recommended) return -1;
    if (b.name === recommended) return 1;
    const lv = (LEVEL_ORDER[a.level ?? ""] ?? 3) - (LEVEL_ORDER[b.level ?? ""] ?? 3);
    return lv !== 0 ? lv : a.name.localeCompare(b.name);
  });
  const shown = q ? sorted.filter((c) => c.name.toLowerCase().includes(q)) : sorted;

  return (
    <div className="flex flex-col gap-1.5">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search components…"
        className="w-full rounded border border-vs-border-default bg-vs-bg-primary px-2 py-1 text-[11px] text-vs-text-primary placeholder:text-vs-text-muted focus:outline-none focus:ring-1 focus:ring-vs-accent"
      />

      {/* Hover preview — the component rendered live from Storybook. */}
      <ComponentPreview component={hovered} getStoryUrl={getStoryUrl} actionLabel={actionLabel} />

      <div className="max-h-56 overflow-y-auto rounded border border-vs-border-subtle" data-testid="component-picker-list">
        {shown.length === 0 ? (
          <p className="px-2 py-3 text-center text-[10px] text-vs-text-muted">No matching components.</p>
        ) : (
          shown.map((c) => {
            const isSelected = selected.has(c.name);
            return (
              <button
                key={c.name}
                type="button"
                aria-pressed={selectedNames ? isSelected : undefined}
                onClick={() => onPick(c, { allSimilar })}
                onMouseEnter={() => setHovered(c)}
                onFocus={() => setHovered(c)}
                className={`flex w-full items-center gap-2 px-2 py-1.5 text-left text-[11px] hover:bg-vs-bg-hover ${
                  isSelected ? "bg-vs-accent-subtle/40" : ""
                }`}
              >
                {selectedNames && (
                  <span className={`text-[11px] ${isSelected ? "text-vs-accent" : "text-vs-text-muted/40"}`} aria-hidden>
                    {isSelected ? "✓" : "＋"}
                  </span>
                )}
                <span className="min-w-0 flex-1 truncate text-vs-text-primary">{c.name}</span>
                {c.name === recommended && (
                  <span className="rounded-full bg-vs-accent px-1.5 py-px text-[9px] font-medium text-white">Recommended</span>
                )}
                {c.level && <span className="text-[9px] uppercase text-vs-text-muted">{c.level}</span>}
                {c.variants && c.variants.length > 0 && (
                  <span className="font-mono text-[9px] text-vs-text-muted">⎇ {c.variants.join("·")}</span>
                )}
              </button>
            );
          })
        )}
      </div>

      {showAllSimilar && (
        <label className="flex cursor-pointer items-center gap-1.5 text-[10px] text-vs-text-secondary">
          <input type="checkbox" checked={allSimilar} onChange={(e) => setAllSimilar(e.target.checked)} className="accent-vs-accent" />
          Apply to every matching element, not just this one
        </label>
      )}
      {onExtract && (
        <button
          type="button"
          onClick={onExtract}
          className="self-start text-[10px] text-vs-text-muted hover:text-vs-text-secondary"
        >
          None fit — extract this as a new component →
        </button>
      )}
    </div>
  );
}

/** The hover preview: the component rendered live from Storybook (its initial state). */
function ComponentPreview({
  component,
  getStoryUrl,
  actionLabel,
}: {
  component: InspectorComponent | null;
  getStoryUrl?: (name: string) => string | null;
  actionLabel: string;
}): JSX.Element {
  // A fixed height in both states, so hovering a row doesn't reflow the list below.
  // Just the component itself renders here — the name/variants already show on the
  // list row, so no label block sits over the preview.
  if (!component) {
    return (
      <div className="grid h-[132px] place-items-center rounded border border-dashed border-vs-border-subtle px-2 text-center text-[10px] text-vs-text-muted">
        Hover a component to preview it · click to {actionLabel}
      </div>
    );
  }
  const storyUrl = getStoryUrl?.(component.name) ?? null;
  return (
    <div
      data-testid="component-preview"
      className="grid h-[132px] place-items-center overflow-hidden rounded border border-vs-border-subtle bg-white"
    >
      {storyUrl ? (
        <iframe
          key={storyUrl}
          src={storyUrl}
          title={`${component.name} — Storybook preview`}
          data-testid="component-preview-frame"
          className="h-full w-full border-0"
        />
      ) : (
        <span className="px-3 text-center text-[10px] text-vs-text-muted">
          No Storybook preview — start Storybook to see this component.
        </span>
      )}
    </div>
  );
}
