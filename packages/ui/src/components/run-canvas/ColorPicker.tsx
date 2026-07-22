import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { JSX, RefObject } from "react";

/**
 * Figma-style color control (change: run-canvas-visual-editor).
 *
 * A color field shows the bound design **token** (swatch + name), not a raw hex.
 * Clicking opens a popover with two tabs, like Figma: **Libraries** — the
 * project's color tokens (styles) to pick from — and **Custom** — a raw picker.
 * Picking a token sets the value to `var(--token)`; a custom color sets the hex.
 */
export interface ColorToken {
  name: string;
  value: string; // resolved color (rgb/hex) for the swatch
}

export function ColorTokenField({
  value,
  token,
  colorTokens,
  onChange,
}: {
  value: string;
  token: string | null;
  colorTokens: ColorToken[];
  onChange: (cssValue: string) => void;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  // Optimistic display — props lag a pick until the selection is rebuilt.
  const [display, setDisplay] = useState(() => derive(value, token, colorTokens));
  useEffect(() => setDisplay(derive(value, token, colorTokens)), [value, token, colorTokens]);

  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent): void => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || popRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  function toggle(): void {
    if (btnRef.current) setAnchor(btnRef.current.getBoundingClientRect());
    setOpen((o) => !o);
  }
  function pickToken(t: ColorToken): void {
    setDisplay({ label: t.name, swatch: t.value, isToken: true });
    onChange(`var(--${t.name})`);
    setOpen(false);
  }
  function pickCustom(hex: string): void {
    setDisplay({ label: hex, swatch: hex, isToken: false });
    onChange(hex);
  }
  // Reset to NO value — clears the property entirely (no color), not transparent/#000.
  function clear(): void {
    setDisplay(derive("", null, colorTokens));
    onChange("");
    setOpen(false);
  }

  return (
    <div className="flex w-full items-center gap-1">
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        className="flex min-w-0 flex-1 items-center gap-2 rounded border border-vs-border-default bg-vs-bg-surface px-2 py-1 text-left hover:border-vs-accent"
      >
        <span
          className="h-3.5 w-3.5 flex-none rounded-sm border border-vs-border-strong"
          style={{ background: display.swatch }}
        />
        <span
          className={`min-w-0 flex-1 truncate text-[12px] ${
            display.none
              ? "text-vs-text-muted"
              : display.isToken
                ? "text-vs-accent"
                : "font-mono text-vs-text-primary"
          }`}
        >
          {display.label}
        </span>
      </button>
      {!display.none && (
        <button
          type="button"
          onClick={clear}
          title="Reset — no value (removes the color)"
          aria-label="Reset to no value"
          className="flex-none rounded p-1 text-vs-text-muted hover:bg-vs-bg-hover hover:text-vs-text-primary"
        >
          ✕
        </button>
      )}
      {open &&
        anchor &&
        createPortal(
          <ColorPopover
            rootRef={popRef}
            anchor={anchor}
            colorTokens={colorTokens}
            initial={display.swatch}
            onPickToken={pickToken}
            onPickCustom={pickCustom}
            onClose={() => setOpen(false)}
          />,
          document.body,
        )}
    </div>
  );
}

/** A cleared color: no value at all (the property is removed, not set to transparent). */
const NONE_SWATCH =
  "repeating-conic-gradient(var(--vs-border-default, #888) 0% 25%, transparent 0% 50%) 50% / 8px 8px";

function derive(
  value: string,
  token: string | null,
  colorTokens: ColorToken[],
): { label: string; swatch: string; isToken: boolean; none?: boolean } {
  if (!value.trim() || value.trim().toLowerCase() === "none") {
    return { label: "None", swatch: NONE_SWATCH, isToken: false, none: true };
  }
  const varMatch = value.match(/var\(--([^),\s]+)/);
  const name = token ?? (varMatch ? varMatch[1] : null);
  if (name) {
    const t = colorTokens.find((c) => c.name === name);
    return { label: name, swatch: t?.value ?? value, isToken: true };
  }
  return { label: value, swatch: value, isToken: false };
}

function ColorPopover({
  rootRef,
  anchor,
  colorTokens,
  initial,
  onPickToken,
  onPickCustom,
  onClose,
}: {
  rootRef: RefObject<HTMLDivElement | null>;
  anchor: DOMRect;
  colorTokens: ColorToken[];
  initial: string;
  onPickToken: (t: ColorToken) => void;
  onPickCustom: (hex: string) => void;
  onClose: () => void;
}): JSX.Element {
  const [tab, setTab] = useState<"libraries" | "custom">(colorTokens.length ? "libraries" : "custom");
  const [q, setQ] = useState("");
  const filtered = colorTokens.filter((t) => t.name.toLowerCase().includes(q.toLowerCase()));
  const groups = groupTokens(filtered);

  // Float over the whole app (portal) — prefer just right of the chip, flip left
  // if it would overflow, and clamp vertically. Doesn't affect sidebar layout.
  const W = 256;
  const MAXH = 420;
  let left = anchor.right + 8;
  if (left + W > window.innerWidth - 8) left = anchor.left - W - 8;
  left = Math.max(8, left);
  const top = Math.max(8, Math.min(anchor.top, window.innerHeight - MAXH - 8));

  return (
    <div
      ref={rootRef}
      style={{ position: "fixed", left, top, width: W, maxHeight: MAXH }}
      className="z-[100] flex flex-col overflow-hidden rounded-lg border border-vs-border-default bg-vs-bg-elevated shadow-2xl">
      <div className="flex items-center gap-1 border-b border-vs-border-subtle p-1 text-[11px]">
        <TabBtn active={tab === "custom"} onClick={() => setTab("custom")} label="Custom" />
        <TabBtn active={tab === "libraries"} onClick={() => setTab("libraries")} label="Libraries" />
        <button
          type="button"
          onClick={onClose}
          className="ml-auto grid h-5 w-5 place-items-center rounded text-vs-text-muted hover:bg-vs-bg-hover"
        >
          ✕
        </button>
      </div>

      {tab === "libraries" ? (
        <div className="flex max-h-72 flex-col">
          <div className="border-b border-vs-border-subtle p-2">
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search styles"
              className="w-full rounded border border-vs-border-default bg-vs-bg-surface px-2 py-1 text-[12px] text-vs-text-primary outline-none focus:border-vs-accent"
            />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {colorTokens.length === 0 ? (
              <p className="px-1 py-2 text-[11px] text-vs-text-muted">
                No color tokens found in this project's token file.
              </p>
            ) : (
              groups.map((g) => (
                <div key={g.name} className="mb-1">
                  <p className="px-1 pb-0.5 pt-1 text-[10px] font-semibold uppercase tracking-wide text-vs-text-muted">
                    {g.name}
                  </p>
                  {g.items.map((t) => (
                    <button
                      key={t.name}
                      type="button"
                      onClick={() => onPickToken(t)}
                      title={t.name}
                      className="flex w-full items-center gap-2 rounded px-1 py-1 text-left hover:bg-vs-bg-hover"
                    >
                      <span
                        className="h-4 w-4 flex-none rounded-sm border border-vs-border-strong"
                        style={{ background: t.value }}
                      />
                      <span className="min-w-0 flex-1 truncate text-[12px] text-vs-text-primary">{t.label}</span>
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>
        </div>
      ) : (
        <CustomPicker initial={initial} onChange={onPickCustom} />
      )}
    </div>
  );
}

function CustomPicker({ initial, onChange }: { initial: string; onChange: (hex: string) => void }): JSX.Element {
  const [hex, setHex] = useState(toHex(initial));
  return (
    <div className="flex flex-col gap-2 p-3">
      <input
        type="color"
        value={hex}
        onChange={(e) => {
          setHex(e.target.value);
          onChange(e.target.value);
        }}
        className="h-28 w-full cursor-pointer rounded border border-vs-border-default bg-transparent"
      />
      <div className="flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-wide text-vs-text-muted">Hex</span>
        <input
          value={hex}
          onChange={(e) => setHex(e.target.value)}
          onBlur={() => onChange(hex)}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          className="min-w-0 flex-1 rounded border border-vs-border-default bg-vs-bg-surface px-2 py-1 font-mono text-[12px] text-vs-text-primary outline-none focus:border-vs-accent"
        />
      </div>
    </div>
  );
}

function TabBtn({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded px-2 py-1 ${active ? "bg-vs-bg-surface text-vs-text-primary" : "text-vs-text-muted hover:text-vs-text-secondary"}`}
    >
      {label}
    </button>
  );
}

/** Group tokens by the prefix before the last segment (e.g. `brand-primary-500` → `brand-primary` / `500`). */
function groupTokens(tokens: ColorToken[]): { name: string; items: (ColorToken & { label: string })[] }[] {
  const map = new Map<string, (ColorToken & { label: string })[]>();
  for (const t of tokens) {
    const idx = t.name.lastIndexOf("-");
    const group = idx > 0 ? t.name.slice(0, idx) : "Colors";
    const label = idx > 0 ? t.name.slice(idx + 1) : t.name;
    const list = map.get(group) ?? [];
    list.push({ ...t, label });
    map.set(group, list);
  }
  return Array.from(map, ([name, items]) => ({ name, items }));
}

/** Best-effort convert an `rgb()/rgba()` or hex string to `#rrggbb` for the native picker. */
function toHex(v: string): string {
  const s = v.trim();
  if (/^#[0-9a-f]{6}$/i.test(s)) return s;
  if (/^#[0-9a-f]{3}$/i.test(s)) return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`;
  const m = s.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (m) {
    const h = (n: string): string => Math.max(0, Math.min(255, parseInt(n, 10))).toString(16).padStart(2, "0");
    return `#${h(m[1])}${h(m[2])}${h(m[3])}`;
  }
  return "#000000";
}
