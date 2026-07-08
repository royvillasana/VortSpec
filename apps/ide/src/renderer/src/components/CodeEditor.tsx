import { useEffect, useRef } from "react";
import type { JSX } from "react";
import * as monaco from "monaco-editor";
import { languageForPath } from "../monaco/setup";

/**
 * A Monaco editor bound to the active file. One editor instance holds a model
 * per opened path (so undo history and cursor survive tab switches). Edits are
 * reported via `onChange`; the parent owns the file's content + dirty state.
 */
export function CodeEditor({
  path,
  value,
  readOnly = false,
  onChange,
}: {
  path: string | null;
  value: string;
  readOnly?: boolean;
  onChange: (value: string) => void;
}): JSX.Element {
  const elRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const modelsRef = useRef<Map<string, monaco.editor.ITextModel>>(new Map());
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Create the editor once.
  useEffect(() => {
    if (!elRef.current) return;
    const editor = monaco.editor.create(elRef.current, {
      theme: "vs-dark",
      automaticLayout: true,
      minimap: { enabled: false },
      fontSize: 13,
      fontFamily: "'Geist Mono Variable', ui-monospace, monospace",
      scrollBeyondLastLine: false,
      renderWhitespace: "selection",
      tabSize: 2,
    });
    editorRef.current = editor;
    const sub = editor.onDidChangeModelContent(() => {
      const model = editor.getModel();
      if (model) onChangeRef.current(model.getValue());
    });
    const models = modelsRef.current;
    return () => {
      sub.dispose();
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

  return <div ref={elRef} data-testid="code-editor" className="h-full w-full" />;
}

/**
 * A read-only side-by-side diff (original = HEAD, modified = working copy),
 * used by the Source Control activity to show a change in Monaco's diff editor.
 */
export function DiffView({
  path,
  original,
  modified,
}: {
  path: string;
  original: string;
  modified: string;
}): JSX.Element {
  const elRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!elRef.current) return;
    const editor = monaco.editor.createDiffEditor(elRef.current, {
      theme: "vs-dark",
      automaticLayout: true,
      readOnly: true,
      minimap: { enabled: false },
      fontSize: 13,
      renderSideBySide: true,
    });
    const lang = languageForPath(path);
    const originalModel = monaco.editor.createModel(original, lang);
    const modifiedModel = monaco.editor.createModel(modified, lang);
    editor.setModel({ original: originalModel, modified: modifiedModel });
    return () => {
      editor.dispose();
      originalModel.dispose();
      modifiedModel.dispose();
    };
  }, [path, original, modified]);

  return <div ref={elRef} data-testid="diff-editor" className="h-full w-full" />;
}
