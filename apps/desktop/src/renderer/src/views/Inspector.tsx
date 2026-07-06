import { useEffect, useMemo, useState } from "react";
import type { InspectorToken, Project, TokenType } from "../../../shared/ipc";
import { api } from "../lib/api";
import { Spinner } from "../components/ui";

const TYPE_ORDER: TokenType[] = [
  "color",
  "typography",
  "spacing",
  "radius",
  "shadow",
  "other",
];
const TYPE_LABEL: Record<TokenType, string> = {
  color: "Color",
  typography: "Typography",
  spacing: "Spacing",
  radius: "Radius",
  shadow: "Shadow",
  other: "Other",
};

/**
 * Design System Inspector (change: add-design-system-inspector). This first
 * slice is the read-only Tokens view over the project's real token file.
 * Components + Playground tabs are stubbed until their slices land.
 */
export function Inspector({
  project,
  onBack,
  onOpenPreview,
}: {
  project: Project;
  onBack: () => void;
  onOpenPreview: () => void;
}): React.JSX.Element {
  const [tokens, setTokens] = useState<InspectorToken[] | null>(null);
  const [tokenFile, setTokenFile] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<TokenType | "all">("all");

  useEffect(() => {
    void api.inspectorTokens(project.path).then((r) => {
      setTokens(r.tokens);
      setTokenFile(r.tokenFile);
    });
  }, [project.path]);

  const groups = useMemo(() => {
    if (!tokens) return [];
    const q = query.trim().toLowerCase();
    const filtered = tokens.filter(
      (t) =>
        (typeFilter === "all" || t.type === typeFilter) &&
        (q === "" || t.name.toLowerCase().includes(q) || t.resolvedValue.toLowerCase().includes(q)),
    );
    return TYPE_ORDER.map((type) => ({
      type,
      items: filtered.filter((t) => t.type === type),
    })).filter((g) => g.items.length > 0);
  }, [tokens, query, typeFilter]);

  const total = tokens?.length ?? 0;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-6 py-8">
      <header className="flex items-center justify-between">
        <div>
          <button
            onClick={onBack}
            className="mb-1 text-xs text-vs-text-secondary hover:text-vs-text-primary"
          >
            ← {project.name}
          </button>
          <h2 className="text-base font-semibold text-vs-text-primary">Design Inspector</h2>
          {tokenFile && (
            <p className="mt-0.5 font-mono text-[11px] text-vs-text-muted">{tokenFile}</p>
          )}
        </div>
        <div className="flex gap-0.5 rounded-md border border-vs-border-default bg-vs-bg-primary p-0.5 text-xs">
          <span className="rounded bg-vs-bg-elevated px-2.5 py-1 text-vs-text-primary">
            Tokens {total > 0 && <span className="text-vs-text-muted">· {total}</span>}
          </span>
          <button
            onClick={onOpenPreview}
            className="rounded px-2.5 py-1 text-vs-text-muted hover:text-vs-text-primary"
          >
            Components
          </button>
          <button
            onClick={onOpenPreview}
            className="rounded px-2.5 py-1 text-vs-text-muted hover:text-vs-text-primary"
          >
            Playground
          </button>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search tokens…"
          className="w-56 rounded-md border border-vs-border-default bg-vs-bg-primary px-3 py-1.5 text-sm text-vs-text-primary placeholder:text-vs-text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-vs-accent-subtle"
        />
        <div className="flex gap-0.5 rounded-md border border-vs-border-default bg-vs-bg-primary p-0.5 text-xs">
          <FilterChip active={typeFilter === "all"} onClick={() => setTypeFilter("all")}>
            All
          </FilterChip>
          {TYPE_ORDER.map((t) => (
            <FilterChip key={t} active={typeFilter === t} onClick={() => setTypeFilter(t)}>
              {TYPE_LABEL[t]}
            </FilterChip>
          ))}
        </div>
      </div>

      {tokens === null ? (
        <div className="flex items-center gap-2 py-16 text-sm text-vs-text-secondary">
          <Spinner /> Reading tokens…
        </div>
      ) : total === 0 ? (
        <div className="rounded-md border border-vs-border-default bg-vs-bg-surface px-4 py-10 text-center text-sm text-vs-text-muted">
          No tokens found. Run the design-system stage to extract tokens into the project token file.
        </div>
      ) : groups.length === 0 ? (
        <div className="rounded-md border border-vs-border-default bg-vs-bg-surface px-4 py-10 text-center text-sm text-vs-text-muted">
          No tokens match your search.
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {groups.map((g) => (
            <section key={g.type}>
              <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-vs-text-secondary">
                {TYPE_LABEL[g.type]}{" "}
                <span className="text-vs-text-muted">· {g.items.length}</span>
              </h3>
              <div className="overflow-hidden rounded-md border border-vs-border-default">
                {g.items.map((t, i) => (
                  <TokenRow key={t.name} token={t} last={i === g.items.length - 1} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <button
      onClick={onClick}
      className={`rounded px-2 py-1 transition-colors ${
        active ? "bg-vs-bg-elevated text-vs-text-primary" : "text-vs-text-muted hover:text-vs-text-primary"
      }`}
    >
      {children}
    </button>
  );
}

const SOURCE_LABEL = {
  "figma-variable": { text: "Figma variable", cls: "text-vs-success" },
  "generated-code": { text: "From code", cls: "text-vs-warning" },
  "hand-edited": { text: "Hand-edited", cls: "text-vs-accent" },
} as const;

function TokenRow({ token, last }: { token: InspectorToken; last: boolean }): React.JSX.Element {
  const src = SOURCE_LABEL[token.source];
  return (
    <div
      className={`flex items-center gap-3 bg-vs-bg-surface px-3 py-2 ${
        last ? "" : "border-b border-vs-border-subtle"
      }`}
    >
      <Preview token={token} />
      <span className="min-w-0 flex-1 truncate font-mono text-xs text-vs-text-primary">
        {token.name}
      </span>
      <span className="max-w-[40%] truncate font-mono text-xs text-vs-text-secondary">
        {token.resolvedValue}
      </span>
      <span className={`shrink-0 text-[10px] uppercase tracking-wide ${src.cls}`}>{src.text}</span>
    </div>
  );
}

/** A 20px preview: swatch for colors, "Ag" for type, a bar for spacing, a corner for radius. */
function Preview({ token }: { token: InspectorToken }): React.JSX.Element {
  const v = token.resolvedValue;
  if (token.type === "color") {
    return (
      <span
        className="h-5 w-5 shrink-0 rounded-[5px] border border-vs-border-strong"
        style={{ background: isCssColor(v) ? v : "transparent" }}
      />
    );
  }
  if (token.type === "typography") {
    return (
      <span className="grid h-5 w-5 shrink-0 place-items-center rounded-[5px] border border-vs-border-default text-[11px] text-vs-text-secondary">
        Ag
      </span>
    );
  }
  if (token.type === "radius") {
    return (
      <span className="h-5 w-5 shrink-0 rounded-tl-[8px] border-l-2 border-t-2 border-vs-border-strong" />
    );
  }
  if (token.type === "spacing") {
    const px = Math.min(20, Math.max(2, parseFloat(v) || 4));
    return (
      <span className="flex h-5 w-5 shrink-0 items-center">
        <span className="rounded-sm bg-vs-accent" style={{ width: `${px}px`, height: "4px" }} />
      </span>
    );
  }
  return <span className="h-5 w-5 shrink-0 rounded-full border border-vs-border-default" />;
}

function isCssColor(v: string): boolean {
  return /^#|^(rgb|rgba|hsl|hsla|oklch)\(|^(white|black|transparent|currentcolor)$/i.test(
    v.trim(),
  );
}
