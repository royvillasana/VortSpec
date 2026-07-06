import { useEffect, useMemo, useState } from "react";
import type {
  InspectorToken,
  Project,
  TokenSource,
  TokenType,
  TokenUsage,
} from "../../../shared/ipc";
import { api } from "../lib/api";
import { Spinner } from "../components/ui";
import { ProjectRail } from "../components/ProjectRail";

const TYPE_ORDER: TokenType[] = ["color", "typography", "spacing", "radius", "shadow", "other"];
const TYPE_LABEL: Record<TokenType, string> = {
  color: "Color",
  typography: "Typography",
  spacing: "Spacing",
  radius: "Radius",
  shadow: "Shadow",
  other: "Other",
};
const SOURCE: Record<TokenSource, { label: string; dot: string; text: string; line: string }> = {
  "figma-variable": {
    label: "Figma variable",
    dot: "#30A46C",
    text: "text-vs-success",
    line: "From Figma variables (authoritative)",
  },
  "generated-code": {
    label: "From code",
    dot: "#FFB224",
    text: "text-vs-warning",
    line: "Read from the generated token file",
  },
  "hand-edited": {
    label: "Hand-edited",
    dot: "#7C6FF0",
    text: "text-vs-accent",
    line: "Edited by you in the Inspector",
  },
};

/**
 * Design System Inspector — Tokens page (design: "Tokens.dc.html", adapted to
 * v2). Left rail + grouped token table + a detail drawer that opens on selection
 * with the token's value editor (gated, written to the token file), source line,
 * and where-used listing. All file-derived; no IR store.
 */
export function Inspector({
  project,
  onBack,
  onOpenPreview,
  onOpenRun,
  onOpenHistory,
}: {
  project: Project;
  onBack: () => void;
  onOpenPreview: () => void;
  onOpenRun: () => void;
  onOpenHistory: () => void;
}): React.JSX.Element {
  const [tokens, setTokens] = useState<InspectorToken[] | null>(null);
  const [usage, setUsage] = useState<Record<string, TokenUsage[]>>({});
  const [tokenFile, setTokenFile] = useState<string | null>(null);
  const [segment, setSegment] = useState<TokenType | "all">("all");
  const [query, setQuery] = useState("");
  const [codeOnly, setCodeOnly] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [toast, setToast] = useState("");

  useEffect(() => {
    void api.inspectorTokens(project.path).then((r) => {
      setTokens(r.tokens);
      setUsage(r.usage);
      setTokenFile(r.tokenFile);
    });
  }, [project.path]);

  function flash(msg: string): void {
    setToast(msg);
    window.setTimeout(() => setToast(""), 2600);
  }

  const groups = useMemo(() => {
    if (!tokens) return [];
    const q = query.trim().toLowerCase();
    const filtered = tokens.filter(
      (t) =>
        (segment === "all" || t.type === segment) &&
        (!codeOnly || t.source === "generated-code") &&
        (q === "" || t.name.toLowerCase().includes(q) || t.resolvedValue.toLowerCase().includes(q)),
    );
    return TYPE_ORDER.map((type) => ({
      type,
      items: filtered.filter((t) => t.type === type),
    })).filter((g) => g.items.length > 0);
  }, [tokens, query, segment, codeOnly]);

  const total = tokens?.length ?? 0;
  const resultCount = groups.reduce((a, g) => a + g.items.length, 0);
  const selectedToken = tokens?.find((t) => t.name === selected) ?? null;

  async function saveValue(name: string, value: string): Promise<void> {
    const r = await api.setTokenValue(project.path, name, value);
    setTokens(r.tokens);
    setUsage(r.usage);
    flash(`Saved --${name} to ${tokenFile ?? "token file"}`);
  }

  return (
    <div className="flex h-[calc(100vh-3rem)] w-full overflow-hidden bg-vs-bg-primary text-[13px] text-vs-text-primary">
      <ProjectRail
        project={project}
        onHeaderClick={onBack}
        items={[
          { label: "Flow", onClick: onBack },
          { label: "Run", onClick: onOpenRun },
          { label: "Preview", onClick: onOpenPreview },
          {
            label: "Tokens",
            active: true,
            badge: <span className="font-mono text-[11px] text-vs-text-muted">{total}</span>,
          },
          { label: "History", onClick: onOpenHistory },
        ]}
      />

      {/* Main */}
      <main className="flex min-w-0 flex-1 flex-col bg-vs-bg-primary">
        <header className="flex flex-none flex-col gap-3.5 border-b border-vs-border-default px-6 pb-3 pt-5">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold tracking-[-0.01em]">Tokens</h1>
            <span className="font-mono text-xs text-vs-text-muted">
              {total} tokens
              {tokenFile && <span> · {tokenFile}</span>}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex gap-0.5 rounded-lg border border-vs-border-default bg-vs-bg-surface p-0.5">
              <Segment active={segment === "all"} onClick={() => setSegment("all")}>
                All
              </Segment>
              {TYPE_ORDER.map((t) => (
                <Segment key={t} active={segment === t} onClick={() => setSegment(t)}>
                  {TYPE_LABEL[t]}
                </Segment>
              ))}
            </div>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search tokens…"
              className="w-52 rounded-md border border-vs-border-default bg-vs-bg-surface px-2.5 py-1.5 text-xs text-vs-text-primary placeholder:text-vs-text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-vs-accent-subtle"
            />
            <button
              onClick={() => setCodeOnly((v) => !v)}
              className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${
                codeOnly
                  ? "border-vs-accent bg-vs-bg-elevated text-vs-text-primary"
                  : "border-vs-border-default bg-vs-bg-surface text-vs-text-secondary hover:border-vs-border-strong"
              }`}
            >
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-vs-warning" />
              From code only
              {codeOnly && <span className="ml-0.5 text-vs-text-secondary">×</span>}
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-x-hidden overflow-y-auto">
          {tokens === null ? (
            <div className="flex items-center gap-2 p-6 text-sm text-vs-text-secondary">
              <Spinner /> Reading tokens…
            </div>
          ) : total === 0 ? (
            <Empty text="No tokens found. Run the design-system stage to extract them." />
          ) : resultCount === 0 ? (
            <div className="py-16 text-center text-vs-text-muted">
              <p className="mb-2 text-[13px]">No tokens match</p>
              <button
                onClick={() => {
                  setQuery("");
                  setSegment("all");
                  setCodeOnly(false);
                }}
                className="text-xs text-vs-accent underline hover:text-vs-text-primary"
              >
                Clear filters
              </button>
            </div>
          ) : (
            groups.map((g) => (
              <div key={g.type}>
                <div className="sticky top-0 z-[3] flex items-baseline gap-2 border-b border-vs-border-default bg-vs-bg-primary px-6 pb-2 pt-4">
                  <span className="text-[15px] font-semibold">{TYPE_LABEL[g.type]}</span>
                  <span className="font-mono text-[11px] text-vs-text-muted">
                    {g.items.length} tokens
                  </span>
                </div>
                {g.items.map((t) => (
                  <TokenRow
                    key={t.name}
                    token={t}
                    selected={t.name === selected}
                    onSelect={() => setSelected(t.name)}
                    onCopy={(text, what) => {
                      void navigator.clipboard?.writeText(text);
                      flash(`Copied ${what}`);
                    }}
                  />
                ))}
              </div>
            ))
          )}
        </div>
      </main>

      {/* Detail drawer */}
      {selectedToken && (
        <TokenDrawer
          key={selectedToken.name}
          token={selectedToken}
          usage={usage[selectedToken.name] ?? []}
          tokenFile={tokenFile}
          onClose={() => setSelected(null)}
          onSave={saveValue}
        />
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-2 rounded-lg border border-vs-border-strong bg-vs-bg-elevated px-4 py-2.5 text-xs text-vs-text-primary shadow-lg">
          <span className="text-vs-success">✓</span>
          <span className="font-mono">{toast}</span>
        </div>
      )}
    </div>
  );
}

function Segment({
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
      className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
        active ? "bg-vs-bg-elevated text-vs-text-primary" : "text-vs-text-secondary hover:text-vs-text-primary"
      }`}
    >
      {children}
    </button>
  );
}

function Empty({ text }: { text: string }): React.JSX.Element {
  return (
    <div className="m-6 rounded-md border border-vs-border-default bg-vs-bg-surface px-4 py-10 text-center text-sm text-vs-text-muted">
      {text}
    </div>
  );
}

function TokenRow({
  token,
  selected,
  onSelect,
  onCopy,
}: {
  token: InspectorToken;
  selected: boolean;
  onSelect: () => void;
  onCopy: (text: string, what: string) => void;
}): React.JSX.Element {
  const [menu, setMenu] = useState(false);
  const src = SOURCE[token.source];
  return (
    <div
      onClick={onSelect}
      style={selected ? { boxShadow: "inset 2px 0 0 #7C6FF0" } : undefined}
      className={`relative flex h-11 cursor-pointer items-center gap-3 border-b border-vs-border-default pl-[22px] pr-5 ${
        selected ? "bg-vs-bg-elevated" : "hover:bg-vs-bg-hover"
      }`}
    >
      <Preview token={token} />
      <span className="w-[210px] shrink-0 truncate font-mono text-xs text-vs-text-primary">
        {token.name}
      </span>
      <span className="w-40 shrink-0 truncate font-mono text-xs text-vs-text-secondary">
        {token.resolvedValue}
      </span>
      <span className="flex w-24 shrink-0 items-center gap-1.5">
        <span className="inline-block h-2 w-2 rounded-full" style={{ background: src.dot }} />
        <span className="text-xs text-vs-text-secondary">{src.label}</span>
      </span>
      <span className="flex-1" />
      <span className="font-mono text-xs text-vs-text-muted">
        {token.uses} {token.uses === 1 ? "use" : "uses"}
      </span>
      <span className="relative shrink-0">
        <button
          onClick={(e) => {
            e.stopPropagation();
            setMenu((v) => !v);
          }}
          className="rounded px-1.5 py-1 leading-none tracking-widest text-vs-text-muted hover:bg-vs-bg-elevated hover:text-vs-text-primary"
        >
          ⋯
        </button>
        {menu && (
          <div
            className="absolute right-0 top-7 z-30 w-40 rounded-lg border border-vs-border-strong bg-vs-bg-elevated p-1 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <MenuItem onClick={() => { onSelect(); setMenu(false); }}>Edit</MenuItem>
            <MenuItem onClick={() => { onCopy(`--${token.name}`, "name"); setMenu(false); }}>
              Copy name
            </MenuItem>
            <MenuItem onClick={() => { onCopy(token.resolvedValue, "value"); setMenu(false); }}>
              Copy value
            </MenuItem>
          </div>
        )}
      </span>
    </div>
  );
}

function MenuItem({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <button
      onClick={onClick}
      className="block w-full rounded px-2 py-1.5 text-left text-xs text-vs-text-primary hover:bg-vs-border-default"
    >
      {children}
    </button>
  );
}

// ── Detail drawer ────────────────────────────────────────────────────

function TokenDrawer({
  token,
  usage,
  tokenFile,
  onClose,
  onSave,
}: {
  token: InspectorToken;
  usage: TokenUsage[];
  tokenFile: string | null;
  onClose: () => void;
  onSave: (name: string, value: string) => Promise<void>;
}): React.JSX.Element {
  const [value, setValue] = useState(token.rawValue);
  const [saving, setSaving] = useState(false);
  const src = SOURCE[token.source];
  const isColor = token.type === "color";
  const dirty = value.trim() !== token.rawValue.trim();
  const colorHex = /^#[0-9a-fA-F]{6}$/.test(value.trim()) ? value.trim() : "#000000";

  async function save(): Promise<void> {
    if (!dirty) return;
    setSaving(true);
    await onSave(token.name, value);
    setSaving(false);
  }

  return (
    <aside
      className="flex w-[360px] shrink-0 flex-col overflow-y-auto border-l border-vs-border-default bg-vs-bg-surface"
      style={{ animation: "vsFade 0.18s ease" }}
    >
      <div className="flex items-center justify-between border-b border-vs-border-default px-4 pb-3 pt-4">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-vs-text-muted">
          Token details
        </span>
        <button
          onClick={onClose}
          className="rounded px-1.5 py-1 leading-none text-vs-text-muted hover:bg-vs-bg-elevated hover:text-vs-text-primary"
        >
          ×
        </button>
      </div>

      <div className="flex flex-col gap-4 p-4">
        <Field label="Name">
          <div className="rounded-md border border-vs-border-default bg-vs-bg-elevated px-2.5 py-2 font-mono text-xs text-vs-text-primary">
            --{token.name}
          </div>
        </Field>

        <Field label="Type">
          <div className="rounded-md border border-vs-border-default bg-vs-bg-elevated px-2.5 py-2 text-xs text-vs-text-secondary">
            {TYPE_LABEL[token.type]}
          </div>
        </Field>

        <Field label="Value">
          <div className="flex items-center gap-2">
            {isColor && (
              <input
                type="color"
                value={colorHex}
                onChange={(e) => setValue(e.target.value.toUpperCase())}
                className="h-8 w-9 shrink-0 cursor-pointer rounded-md border border-vs-border-default bg-vs-bg-elevated p-0.5"
              />
            )}
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="flex-1 rounded-md border border-vs-border-default bg-vs-bg-elevated px-2.5 py-2 font-mono text-xs text-vs-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-vs-accent-subtle"
            />
          </div>
        </Field>

        {/* live preview */}
        <div className="flex items-center gap-3 rounded-lg border border-vs-border-default bg-vs-bg-primary p-3">
          <Preview token={{ ...token, resolvedValue: value }} large />
          <div className="min-w-0">
            <div className="truncate font-mono text-xs text-vs-text-primary">--{token.name}</div>
            <div className="font-mono text-[11px] text-vs-text-secondary">{value}</div>
          </div>
        </div>

        {/* source */}
        <div className="flex items-center gap-2 border-t border-vs-border-default pt-4">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: src.dot }} />
          <span className="text-xs text-vs-text-secondary">{src.line}</span>
        </div>

        {/* where used */}
        <div className="flex flex-col gap-2 border-t border-vs-border-default pt-4">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-vs-text-muted">
            Where used <span className="text-vs-border-strong">· {token.uses}</span>
          </span>
          {usage.length === 0 ? (
            <span className="px-2 py-1.5 text-xs text-vs-text-muted">Not referenced yet</span>
          ) : (
            usage.map((u, i) => (
              <div
                key={`${u.component}-${i}`}
                className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-vs-bg-elevated"
              >
                <span className="text-xs text-vs-text-primary">{u.component}</span>
                {u.property && (
                  <span className="font-mono text-[11px] text-vs-text-secondary">{u.property}</span>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      <div className="mt-auto flex items-center gap-3 border-t border-vs-border-default px-4 py-3.5">
        <span className="flex-1 text-[11px] text-vs-text-muted">
          {dirty ? "Value edits are written to the token file" : `Saved to ${tokenFile ?? "token file"}`}
        </span>
        <button
          disabled={!dirty || saving}
          onClick={() => void save()}
          className={`rounded-lg px-4 py-2 text-xs font-medium ${
            dirty && !saving
              ? "bg-vs-accent text-white hover:brightness-110"
              : "cursor-not-allowed bg-vs-bg-elevated text-vs-text-muted"
          }`}
        >
          {saving ? "Saving…" : "Save value"}
        </button>
      </div>
    </aside>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[11px] text-vs-text-muted">{label}</label>
      {children}
    </div>
  );
}

/** Type preview: swatch for colors, "Ag" for type, bar for spacing, corner for radius, box for shadow. */
function Preview({ token, large }: { token: InspectorToken; large?: boolean }): React.JSX.Element {
  const size = large ? "h-9 w-9" : "h-5 w-5";
  const v = token.resolvedValue;
  if (token.type === "color") {
    return (
      <span
        className={`${size} shrink-0 rounded-md border border-vs-border-strong`}
        style={{ background: isCssColor(v) ? v : "transparent" }}
      />
    );
  }
  const inner =
    token.type === "typography" ? (
      <span className="text-[10px] text-vs-text-primary">Ag</span>
    ) : token.type === "spacing" ? (
      <span className="h-0.5 w-2.5 rounded-sm bg-vs-text-secondary" />
    ) : token.type === "radius" ? (
      <span className="h-2.5 w-2.5 rounded-tl border-l-2 border-t-2 border-vs-text-secondary" />
    ) : token.type === "shadow" ? (
      <span className="h-2.5 w-2.5 rounded bg-vs-border-strong shadow" />
    ) : (
      <span className="h-1.5 w-1.5 rounded-full bg-vs-text-muted" />
    );
  return (
    <span
      className={`${size} grid shrink-0 place-items-center rounded-md border border-vs-border-strong bg-vs-bg-elevated`}
    >
      {inner}
    </span>
  );
}

function isCssColor(v: string): boolean {
  return /^#|^(rgb|rgba|hsl|hsla|oklch)\(|^(white|black|transparent|currentcolor)$/i.test(v.trim());
}
