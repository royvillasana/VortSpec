import { useState } from "react";
import type { JSX } from "react";

/**
 * A "＋ Create variable…" row for the token pickers (change: instant-playground-edits). Lets the
 * user promote the field's current literal value to a NAMED design token even when the project has
 * none yet — VortSpec writes it to the token file (bootstrapping the file + import on first use) and
 * the field binds to `var(--name)`. Collapsed to a button until clicked, then an inline name input.
 *
 * Shared by the length/box pickers (DesignPanel) and the color picker (ColorPicker) — its own file
 * so both import it without a circular dependency.
 */
export function CreateVariableRow({
  value,
  tokenType,
  onCreateToken,
  onCreated,
}: {
  value: string;
  tokenType?: string;
  onCreateToken?: (name: string, value: string, tokenType?: string) => Promise<void>;
  onCreated: (name: string) => void;
}): JSX.Element | null {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!onCreateToken) return null;
  const submit = async (): Promise<void> => {
    const clean = name.trim().replace(/^--/, "");
    if (!clean || busy) return;
    setBusy(true);
    setErr(null);
    try {
      await onCreateToken(clean, value, tokenType);
      onCreated(clean);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't create the variable.");
      setBusy(false);
    }
  };
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-1.5 border-b border-vs-border-subtle px-2.5 py-1.5 text-[11px] text-vs-accent hover:bg-vs-bg-hover"
      >
        <span className="text-[11px] leading-none">＋</span>
        <span>Create variable…</span>
      </button>
    );
  }
  return (
    <div className="flex flex-col gap-1 border-b border-vs-border-subtle px-2.5 py-1.5">
      <div className="flex items-center gap-1">
        <span className="font-mono text-[10px] text-vs-text-muted">--</span>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void submit();
            else if (e.key === "Escape") setOpen(false);
          }}
          placeholder="token-name"
          disabled={busy}
          className="min-w-0 flex-1 rounded border border-vs-border-default bg-vs-bg-surface px-1.5 py-0.5 font-mono text-[11px] text-vs-text-primary outline-none focus:border-vs-accent"
        />
        <span className="flex-none font-mono text-[10px] text-vs-text-muted">= {value}</span>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy || !name.trim()}
          className="flex-none rounded bg-vs-accent px-1.5 py-0.5 text-[10px] font-medium text-white disabled:opacity-40"
        >
          Add
        </button>
      </div>
      {err && <p className="text-[10px] text-vs-danger">{err}</p>}
    </div>
  );
}
