import { useEffect, useRef } from "react";
import type { JSX } from "react";
import * as monaco from "monaco-editor";
import { languageForPath } from "../monaco/setup";

/**
 * A Monaco editor bound to the active file. One editor instance holds a model
 * per opened path (so undo history and cursor survive tab switches). Edits are
 * reported via `onChange`; the parent owns the file's content + dirty state.
 *
 * Layout is driven explicitly: Monaco's `automaticLayout` misses reflows when a
 * flex sibling (a resizable sidebar) repeatedly changes this container's width,
 * leaving `wordWrap` stale on grow. Instead we observe a STABLE outer wrapper
 * (not Monaco's own heavily-mutated host) and call `editor.layout({w,h})` with
 * the observed content box on every change, in both directions. `relayoutKey`
 * forces a relayout even when the size didn't change (e.g. the editor was hidden
 * then shown, or the panel dock moved).
 */
/** A resolved text selection reported up to the assistant grounding. */
export interface CodeSelection {
  startLine: number;
  endLine: number;
  text: string;
}

export function CodeEditor({
  path,
  value,
  readOnly = false,
  relayoutKey,
  onChange,
  onSelection,
}: {
  path: string | null;
  value: string;
  readOnly?: boolean;
  /** Bump to force a relayout when the container is shown/re-docked. */
  relayoutKey?: number;
  onChange: (value: string) => void;
  /** Reports the active selection (or null when empty) so the assistant can be
   *  grounded in what the user has highlighted, like the Claude Code extension. */
  onSelection?: (selection: CodeSelection | null) => void;
}): JSX.Element {
  const wrapRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const modelsRef = useRef<Map<string, monaco.editor.ITextModel>>(new Map());
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onSelectionRef = useRef(onSelection);
  onSelectionRef.current = onSelection;

  // Create the editor once.
  useEffect(() => {
    const wrap = wrapRef.current;
    const host = hostRef.current;
    if (!wrap || !host) return;
    const editor = monaco.editor.create(host, {
      theme: "vs-dark",
      automaticLayout: false,
      minimap: { enabled: false },
      fontSize: 13,
      fontFamily: "'Geist Mono Variable', ui-monospace, monospace",
      scrollBeyondLastLine: false,
      renderWhitespace: "selection",
      tabSize: 2,
      // Always soft-wrap to the editor's current width so a line is never cut
      // off; the observer relayouts (re-wraps) on every size change.
      wordWrap: "on",
    });
    editorRef.current = editor;
    const sub = editor.onDidChangeModelContent(() => {
      const model = editor.getModel();
      if (model) onChangeRef.current(model.getValue());
    });
    const selSub = editor.onDidChangeCursorSelection((e) => {
      const report = onSelectionRef.current;
      if (!report) return;
      const model = editor.getModel();
      const sel = e.selection;
      if (!model || sel.isEmpty()) {
        report(null);
        return;
      }
      report({
        startLine: sel.startLineNumber,
        endLine: sel.endLineNumber,
        text: model.getValueInRange(sel),
      });
    });
    // Observe the stable wrapper and lay out with the exact observed box, so the
    // wrap re-computes reliably as neighboring regions resize — both directions.
    const relayout = (): void => {
      const box = wrap.getBoundingClientRect();
      if (box.width > 0 && box.height > 0) editor.layout({ width: box.width, height: box.height });
    };
    // Initial layout once the DOM has settled (the container may be 0 at mount).
    const raf = requestAnimationFrame(relayout);
    const ro = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (box && box.width > 0 && box.height > 0) {
        editor.layout({ width: box.width, height: box.height });
      }
    });
    ro.observe(wrap);
    const models = modelsRef.current;
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      sub.dispose();
      selSub.dispose();
      editor.dispose();
      models.forEach((m) => m.dispose());
      models.clear();
    };
  }, []);

  // Swap to the active file's model (caching one model per path).
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || path === null) return;
    let model = modelsRef.current.get(path);
    if (!model) {
      model = monaco.editor.createModel(value, languageForPath(path));
      modelsRef.current.set(path, model);
    } else if (model.getValue() !== value) {
      // External update (e.g. reload-from-disk) — replace the buffer.
      model.setValue(value);
    }
    if (editor.getModel() !== model) editor.setModel(model);
  }, [path, value]);

  // Keep readOnly in sync.
  useEffect(() => {
    editorRef.current?.updateOptions({ readOnly });
  }, [readOnly]);

  // Forced relayout on show/re-dock (size may be unchanged, so measure directly).
  useEffect(() => {
    const editor = editorRef.current;
    const wrap = wrapRef.current;
    if (!editor || !wrap) return;
    const box = wrap.getBoundingClientRect();
    if (box.width > 0 && box.height > 0) editor.layout({ width: box.width, height: box.height });
  }, [relayoutKey]);

  return (
    <div ref={wrapRef} className="absolute inset-0 overflow-hidden">
      <div ref={hostRef} data-testid="code-editor" className="absolute inset-0" />
    </div>
  );
}

/**
 * A read-only side-by-side diff (original = HEAD, modified = working copy),
 * used by the Source Control activity to show a change in Monaco's diff editor.
 * Same explicit-layout treatment as the editor.
 */
export function DiffView({
  path,
  original,
  modified,
  relayoutKey,
}: {
  path: string;
  original: string;
  modified: string;
  /** Bump to force a relayout when the container is shown/re-docked. */
  relayoutKey?: number;
}): JSX.Element {
  const wrapRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneDiffEditor | null>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const host = hostRef.current;
    if (!wrap || !host) return;
    const editor = monaco.editor.createDiffEditor(host, {
      theme: "vs-dark",
      automaticLayout: false,
      readOnly: true,
      minimap: { enabled: false },
      fontSize: 13,
      renderSideBySide: true,
      wordWrap: "on",
    });
    editorRef.current = editor;
    const lang = languageForPath(path);
    const originalModel = monaco.editor.createModel(original, lang);
    const modifiedModel = monaco.editor.createModel(modified, lang);
    editor.setModel({ original: originalModel, modified: modifiedModel });
    const raf = requestAnimationFrame(() => {
      const box = wrap.getBoundingClientRect();
      if (box.width > 0 && box.height > 0) editor.layout({ width: box.width, height: box.height });
    });
    const ro = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (box && box.width > 0 && box.height > 0) {
        editor.layout({ width: box.width, height: box.height });
      }
    });
    ro.observe(wrap);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      editor.dispose();
      originalModel.dispose();
      modifiedModel.dispose();
    };
  }, [path, original, modified]);

  useEffect(() => {
    const editor = editorRef.current;
    const wrap = wrapRef.current;
    if (!editor || !wrap) return;
    const box = wrap.getBoundingClientRect();
    if (box.width > 0 && box.height > 0) editor.layout({ width: box.width, height: box.height });
  }, [relayoutKey]);

  return (
    <div ref={wrapRef} className="absolute inset-0 overflow-hidden">
      <div ref={hostRef} data-testid="diff-editor" className="absolute inset-0" />
    </div>
  );
}
