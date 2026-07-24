/**
 * Monaco worker wiring for electron-vite.
 *
 * Monaco offloads language services (TS/JSON/CSS/HTML) to web workers. Under
 * Vite we load them via `?worker` imports so they are bundled locally — no CDN,
 * consistent with the local-first invariant. Importing this module once (before
 * any editor is created) installs `self.MonacoEnvironment`.
 */
import * as monaco from "monaco-editor";
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import jsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";
import cssWorker from "monaco-editor/esm/vs/language/css/css.worker?worker";
import htmlWorker from "monaco-editor/esm/vs/language/html/html.worker?worker";
import tsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";

const env: { getWorker(_: unknown, label: string): Worker } = {
  getWorker(_: unknown, label: string): Worker {
    if (label === "json") return new jsonWorker();
    if (label === "css" || label === "scss" || label === "less") return new cssWorker();
    if (label === "html" || label === "handlebars" || label === "razor") return new htmlWorker();
    if (label === "typescript" || label === "javascript") return new tsWorker();
    return new editorWorker();
  },
};

(self as unknown as { MonacoEnvironment: typeof env }).MonacoEnvironment = env;

/**
 * Tame the TS/JavaScript language service for a project-less viewer.
 *
 * Monaco's TS worker runs its OWN type-checker, but in the IDE it has no `node_modules`,
 * no `tsconfig`, and no multi-file program — so its SEMANTIC diagnostics (module resolution
 * and types) are ALL false positives ("Cannot find module 'react'", "Cannot find name …"),
 * which is what paints opened files red. There is no real project type context to give it,
 * so we turn OFF semantic + suggestion diagnostics and keep only SYNTAX validation — genuine
 * syntax errors still underline, the phantom import/type errors do not. We also set permissive,
 * JSX-aware compiler options; combined with models being created under their real `.tsx`/`.jsx`
 * URI (see CodeEditor), the worker parses JSX correctly instead of syntax-erroring on it.
 */
export function configureMonacoTypeScript(): void {
  // This runs at module import time (below), on the project-open path (EditorGroup → CodeEditor →
  // here), and the IDE has no error boundary — so a throw here would blank the whole workbench.
  // Configuring editor diagnostics is best-effort: never let it take down the app.
  const ts = monaco.languages?.typescript;
  if (!ts?.typescriptDefaults || !ts.javascriptDefaults) return;
  const compilerOptions: monaco.languages.typescript.CompilerOptions = {
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.NodeJs,
    jsx: ts.JsxEmit.ReactJSX,
    allowJs: true,
    allowNonTsExtensions: true,
    esModuleInterop: true,
    allowSyntheticDefaultImports: true,
    skipLibCheck: true,
    noEmit: true,
  };
  const diagnostics: monaco.languages.typescript.DiagnosticsOptions = {
    // No project program → semantic + suggestion diagnostics are noise. Keep syntax errors.
    noSemanticValidation: true,
    noSuggestionDiagnostics: true,
    noSyntaxValidation: false,
  };
  for (const defaults of [ts.typescriptDefaults, ts.javascriptDefaults]) {
    defaults.setCompilerOptions(compilerOptions);
    defaults.setDiagnosticsOptions(diagnostics);
  }
}

// Configure once, at module load — before any editor/model is created. Guarded: this runs while
// the workbench mounts (there is no error boundary), so a failure must never blank the app.
try {
  configureMonacoTypeScript();
} catch (err) {
  console.error("[monaco] failed to configure TypeScript diagnostics:", err);
}

/** Map a file path to a Monaco language id. */
export function languageForPath(path: string): string {
  const ext = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
  switch (ext) {
    case "ts":
    case "mts":
    case "cts":
      return "typescript";
    case "tsx":
      return "typescript";
    case "js":
    case "mjs":
    case "cjs":
    case "jsx":
      return "javascript";
    case "json":
      return "json";
    case "css":
      return "css";
    case "scss":
      return "scss";
    case "less":
      return "less";
    case "html":
    case "htm":
      return "html";
    case "md":
    case "mdx":
      return "markdown";
    case "yml":
    case "yaml":
      return "yaml";
    case "sh":
    case "bash":
      return "shell";
    default:
      return "plaintext";
  }
}
