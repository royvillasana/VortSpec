/**
 * Storybook story catalog (connect-enterprise-design-system, group 3). Parse a Storybook's own
 * machine-readable index — `index.json` (Storybook v7/v8) or `stories.json` (v6) — into the model VortSpec
 * consumes: each component (`title`) → its stories/variants. This is the catalog that drives both the
 * readiness check ("does every component have a story?") and the harvest (which story renders to snapshot).
 * Pure: the fetch of the index (URL or static dir) is wiring layered on top.
 */

/** One story/variant of a component. */
export interface StoryEntry {
  id: string;
  name: string;
  /** The component grouping title (e.g. "Atoms/Button"). */
  title: string;
  /** The story's source file, when the index provides it. */
  importPath?: string;
}

/** A component in the catalog: its title, a display name, and its stories. */
export interface CatalogComponent {
  title: string;
  /** Display name — the last path segment of the title (e.g. "Atoms/Button" → "Button"). */
  component: string;
  stories: StoryEntry[];
}

export type StoryCatalog = CatalogComponent[];

/** The last path segment of a Storybook title, used as the component's name. */
export function componentNameFromTitle(title: string): string {
  const seg = title.split("/").filter(Boolean).pop() ?? title;
  return seg.trim();
}

interface RawEntry {
  id?: unknown;
  name?: unknown;
  title?: unknown;
  importPath?: unknown;
  type?: unknown;
}

/**
 * Parse a Storybook index (either `index.json` v7/v8 — `{ entries: {...} }` — or `stories.json` v6 —
 * `{ stories: {...} }`) into a `StoryCatalog`. Only `story` entries are kept (docs/mdx pages are
 * skipped); stories are grouped by `title` in first-seen order. Returns `[]` for an unrecognized shape.
 */
export function parseStorybookIndex(raw: unknown): StoryCatalog {
  if (!raw || typeof raw !== "object") return [];
  const map = (raw as { entries?: unknown; stories?: unknown }).entries ?? (raw as { stories?: unknown }).stories;
  if (!map || typeof map !== "object") return [];

  const byTitle = new Map<string, CatalogComponent>();
  for (const value of Object.values(map as Record<string, RawEntry>)) {
    if (!value || typeof value !== "object") continue;
    // v7/v8 entries carry a `type`; keep only stories. v6 stories.json has no type → treat as a story.
    if (typeof value.type === "string" && value.type !== "story") continue;
    const id = typeof value.id === "string" ? value.id : "";
    const title = typeof value.title === "string" ? value.title : "";
    if (!id || !title) continue;
    const entry: StoryEntry = {
      id,
      name: typeof value.name === "string" ? value.name : id,
      title,
      ...(typeof value.importPath === "string" ? { importPath: value.importPath } : {}),
    };
    let comp = byTitle.get(title);
    if (!comp) {
      comp = { title, component: componentNameFromTitle(title), stories: [] };
      byTitle.set(title, comp);
    }
    comp.stories.push(entry);
  }
  return [...byTitle.values()];
}

/** The standalone-render URL for a story in a Storybook (the iframe the harvest snapshots). */
export function storyIframeUrl(storybookBaseUrl: string, storyId: string): string {
  const base = storybookBaseUrl.replace(/\/+$/, "");
  return `${base}/iframe.html?id=${encodeURIComponent(storyId)}&viewMode=story`;
}
