import { useEffect, useMemo, useRef, useState } from "react";
import {
  FONT_SOURCE_LABEL,
  SYSTEM_FONT_FALLBACKS,
  fontStack,
  googleFontUrl,
  type FontFamily,
  type FontSource,
} from "@vortspec/core/fonts";
import { Spinner } from "@vortspec/ui/ui";
import { api } from "../lib/api";

/**
 * Choose a font family (change: design-system-style-panel, Phase 3).
 *
 * A picker rather than a text field, because typing a family name is how you silently end up with a
 * fallback — misspelled, not installed, or never fetched, with nothing to tell you. Each family is shown
 * IN ITS OWN FACE and labelled with where it came from, so "installed here" and "will be fetched" are
 * distinguishable before you commit to one.
 */
export function FontPicker({
  value,
  onChoose,
  projectPath,
  disabled,
  onClose,
}: {
  /** The family currently in effect (the head of the token's stack). */
  value: string;
  /** Chosen: the CSS stack to write, plus the Google family when one needs fetching. */
  onChoose: (stack: string, google?: string) => void;
  projectPath: string;
  disabled?: boolean;
  onClose: () => void;
}): React.JSX.Element {
  const [families, setFamilies] = useState<FontFamily[]>([]);
  const [complete, setComplete] = useState(false);
  const [loading, setLoading] = useState(true);
  const [expanding, setExpanding] = useState(false);
  const [query, setQuery] = useState("");
  const previewed = useRef<Set<string>>(new Set());

  /** Merge in the machine's own fonts — only the renderer can enumerate them. */
  async function systemFamilies(): Promise<FontFamily[]> {
    const q = (window as unknown as { queryLocalFonts?: () => Promise<Array<{ family: string }>> }).queryLocalFonts;
    if (!q) {
      // No Local Font Access API (or it is blocked): offer the families every OS ships rather than
      // dropping the source entirely.
      return SYSTEM_FONT_FALLBACKS.map((family) => ({ family, source: "system" as const }));
    }
    try {
      const seen = new Set<string>();
      const out: FontFamily[] = [];
      for (const f of await q()) {
        const k = f.family.toLowerCase();
        if (!seen.has(k)) {
          seen.add(k);
          out.push({ family: f.family, source: "system" });
        }
      }
      return out;
    } catch {
      return SYSTEM_FONT_FALLBACKS.map((family) => ({ family, source: "system" as const }));
    }
  }

  async function load(full: boolean): Promise<void> {
    const [remote, system] = await Promise.all([
      api.designSystemFonts(projectPath, full).catch(() => ({ families: [], googleComplete: false })),
      systemFamilies(),
    ]);
    // Project/Figma/Google come from main; system is merged here. Dedupe keeps the FIRST label, and
    // main's list already orders project → figma → google, so a family the design system uses is never
    // relabelled as a generic suggestion.
    const seen = new Set<string>();
    const merged: FontFamily[] = [];
    for (const f of [...remote.families.filter((x) => x.source !== "google"), ...system, ...remote.families.filter((x) => x.source === "google")]) {
      const k = f.family.toLowerCase();
      if (!seen.has(k)) {
        seen.add(k);
        merged.push(f);
      }
    }
    setFamilies(merged);
    setComplete(remote.googleComplete);
    setLoading(false);
    setExpanding(false);
  }

  useEffect(() => {
    void load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectPath]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? families.filter((f) => f.family.toLowerCase().includes(q)) : families;
    return list.slice(0, 120);
  }, [families, query]);

  /**
   * Load the webfont for each Google family on screen, so the row is previewed in its own face rather
   * than in the UI's. Without this the picker would show every family in the same typeface, which tells
   * the user nothing about what they are choosing.
   */
  useEffect(() => {
    const fresh = shown
      .filter((f) => f.source === "google" && !previewed.current.has(f.family))
      .map((f) => f.family);
    if (fresh.length === 0) return;
    fresh.forEach((f) => previewed.current.add(f));
    const url = googleFontUrl(fresh, [400]);
    if (!url) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = url;
    document.head.appendChild(link);
  }, [shown]);

  const noMatch = !loading && shown.length === 0;

  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-vs-border-strong bg-vs-bg-elevated p-2">
      <div className="flex items-center gap-1.5">
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && onClose()}
          placeholder="Search fonts…"
          aria-label="Search font families"
          className="min-w-0 flex-1 rounded border border-vs-border-default bg-vs-bg-primary px-1.5 py-1 text-[11px] text-vs-text-primary focus:outline-none focus-visible:ring-1 focus-visible:ring-vs-accent"
        />
        <button
          type="button"
          onClick={onClose}
          aria-label="Close font picker"
          className="rounded px-1.5 py-1 text-[10px] text-vs-text-muted hover:bg-vs-bg-hover hover:text-vs-text-primary"
        >
          Close
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-3">
          <Spinner />
        </div>
      ) : (
        <div className="flex max-h-64 flex-col overflow-y-auto">
          {shown.map((f) => (
            <button
              key={`${f.source}:${f.family}`}
              type="button"
              disabled={disabled}
              onClick={() => onChoose(fontStack(f.family), f.source === "google" ? f.family : undefined)}
              className={`flex items-baseline gap-2 rounded px-1.5 py-1 text-left transition-colors hover:bg-vs-bg-hover disabled:opacity-50 ${
                f.family.toLowerCase() === value.toLowerCase() ? "bg-vs-bg-hover" : ""
              }`}
            >
              <span className="min-w-0 flex-1 truncate text-[12px] text-vs-text-primary" style={{ fontFamily: fontStack(f.family) }}>
                {f.family}
              </span>
              <span className="shrink-0 text-[9px] text-vs-text-muted" title={FONT_SOURCE_LABEL[f.source as FontSource]}>
                {shortLabel(f.source)}
              </span>
            </button>
          ))}

          {noMatch && (
            <p className="px-1.5 py-2 text-[10px] text-vs-text-muted">No family matches “{query.trim()}”.</p>
          )}

          {/* The bundled head covers what almost everyone picks; the rest is fetched only when the user
              looks past it — which is the only case that genuinely needs the network. */}
          {!complete && (
            <button
              type="button"
              disabled={expanding}
              onClick={() => {
                setExpanding(true);
                void load(true);
              }}
              className="mt-1 rounded border border-vs-border-default px-1.5 py-1 text-[10px] text-vs-text-secondary transition-colors hover:border-vs-accent hover:text-vs-text-primary disabled:opacity-50"
            >
              {expanding ? "Loading all Google Fonts…" : "Show all Google Fonts"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** A short source tag — the full wording is the row's tooltip. */
function shortLabel(source: string): string {
  if (source === "project") return "in use";
  if (source === "figma") return "Figma";
  if (source === "system") return "installed";
  return "Google";
}
