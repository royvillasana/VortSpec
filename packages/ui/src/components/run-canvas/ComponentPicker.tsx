import { useEffect, useRef, useState } from "react";
import type { JSX } from "react";
import type { InspectorComponent } from "@vortspec/core/ipc";

/**
 * The shared design-system component picker (change: canvas-compose-and-preview-bar).
 *
 * One searchable roster list, reused wherever the user picks a component: the
 * insert dialog's Components tab (pick → insert into the slot) and the inspect
 * dialog (pick → assign to the selected element). Hovering a row reveals a preview
 * with the component's rendered thumbnail (fetched on demand via `getThumbnail`
 * and cached), so the user sees what they're about to place.
 */

const LEVEL_ORDER: Record<string, number> = { atom: 0, molecule: 1, organism: 2 };

export function ComponentPicker({
  components,
  onPick,
  recommended = null,
  actionLabel = "Insert",
  showAllSimilar = false,
  onExtract,
  getThumbnail,
}: {
  components: InspectorComponent[];
  /** Pick a component — opts.allSimilar only meaningful when `showAllSimilar`. */
  onPick: (component: InspectorComponent, opts: { allSimilar: boolean }) => void;
  /** A recommended component pinned first with a badge (assign mode). */
  recommended?: string | null;
  /** Verb shown in the empty-hover hint ("Insert" / "Assign"). */
  actionLabel?: string;
  /** Show the "apply to every matching element" toggle (assign mode). */
  showAllSimilar?: boolean;
  /** Offer extract-a-new-component when nothing fits. */
  onExtract?: () => void;
  /** Fetch a cached thumbnail (data URL) for a component; null when none yet. */
  getThumbnail?: (name: string) => Promise<string | null>;
}): JSX.Element {
  const [query, setQuery] = useState("");
  const [allSimilar, setAllSimilar] = useState(true);
  const [hovered, setHovered] = useState<InspectorComponent | null>(null);

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

      {/* Hover preview — the component's thumbnail + details for the row under the pointer. */}
      <ComponentPreview component={hovered} getThumbnail={getThumbnail} actionLabel={actionLabel} />

      <div className="max-h-56 overflow-y-auto rounded border border-vs-border-subtle" data-testid="component-picker-list">
        {shown.length === 0 ? (
          <p className="px-2 py-3 text-center text-[10px] text-vs-text-muted">No matching components.</p>
        ) : (
          shown.map((c) => (
            <button
              key={c.name}
              type="button"
              onClick={() => onPick(c, { allSimilar })}
              onMouseEnter={() => setHovered(c)}
              onFocus={() => setHovered(c)}
              className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-[11px] hover:bg-vs-bg-hover"
            >
              <span className="min-w-0 flex-1 truncate text-vs-text-primary">{c.name}</span>
              {c.name === recommended && (
                <span className="rounded-full bg-vs-accent px-1.5 py-px text-[9px] font-medium text-white">Recommended</span>
              )}
              {c.level && <span className="text-[9px] uppercase text-vs-text-muted">{c.level}</span>}
              {c.variants && c.variants.length > 0 && (
                <span className="font-mono text-[9px] text-vs-text-muted">⎇ {c.variants.join("·")}</span>
              )}
            </button>
          ))
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

/** The hover preview: the component's rendered thumbnail (on demand) + its details. */
function ComponentPreview({
  component,
  getThumbnail,
  actionLabel,
}: {
  component: InspectorComponent | null;
  getThumbnail?: (name: string) => Promise<string | null>;
  actionLabel: string;
}): JSX.Element {
  const [thumb, setThumb] = useState<string | null>(null);
  // Cache thumbnails across hovers so re-hovering a component is instant.
  const cache = useRef<Map<string, string | null>>(new Map());

  useEffect(() => {
    if (!component || !getThumbnail) {
      setThumb(null);
      return;
    }
    const name = component.name;
    if (cache.current.has(name)) {
      setThumb(cache.current.get(name) ?? null);
      return;
    }
    let alive = true;
    void getThumbnail(name).then((url) => {
      cache.current.set(name, url);
      if (alive) setThumb(url);
    });
    return () => {
      alive = false;
    };
  }, [component, getThumbnail]);

  if (!component) {
    return (
      <div className="rounded border border-dashed border-vs-border-subtle px-2 py-2 text-center text-[10px] text-vs-text-muted">
        Hover a component to preview it · click to {actionLabel.toLowerCase()}
      </div>
    );
  }
  return (
    <div data-testid="component-preview" className="rounded border border-vs-border-subtle bg-vs-bg-primary p-2">
      <div className="grid h-20 place-items-center overflow-hidden rounded bg-vs-bg-elevated">
        {thumb ? (
          <img src={thumb} alt={`${component.name} preview`} className="max-h-20 max-w-full object-contain" />
        ) : (
          <span className="text-[10px] text-vs-text-muted">{getThumbnail ? "Rendering preview…" : "No preview"}</span>
        )}
      </div>
      <div className="mt-1.5 text-[11px] font-medium text-vs-text-primary">{component.name}</div>
      {component.description && <div className="text-[10px] text-vs-text-secondary">{component.description}</div>}
      {component.variants && component.variants.length > 0 && (
        <div className="mt-0.5 font-mono text-[9px] text-vs-text-muted">variants: {component.variants.join(", ")}</div>
      )}
    </div>
  );
}
