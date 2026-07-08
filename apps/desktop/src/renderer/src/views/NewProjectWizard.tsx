import { useState } from "react";
import type { Project, SetupAnswers } from "@vortspec/core/ipc";
import {
  FRAMEWORK_OPTIONS,
  DESIGN_SOURCE_OPTIONS,
  COMPONENT_LIBRARY_OPTIONS,
  STYLING_OPTIONS,
  TEST_RUNNER_OPTIONS,
  autoStyling,
  autoTokenFile,
  autoComponentDir,
} from "@vortspec/core/setup";
import { api } from "../lib/api";
import { Button, Card } from "../components/ui";

/**
 * The project setup questionnaire — a GUI of the SDD-DE CLI's init questions,
 * asked before the project is created. On finish, the main process writes
 * `.sdd-de/project.yaml` and installs the toolkit, then the flow opens.
 */
export function NewProjectWizard({
  project,
  initialSource,
  onCreated,
  onCancel,
}: {
  project: Project;
  initialSource?: Partial<SetupAnswers>;
  onCreated: (p: Project) => void;
  onCancel: () => void;
}): React.JSX.Element {
  const [a, setA] = useState<SetupAnswers>(() => ({ ...defaults(), ...initialSource }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Recompute framework/source-derived defaults when those change.
  function setFramework(framework: SetupAnswers["framework"]): void {
    setA((prev) => ({
      ...prev,
      framework,
      styling: autoStyling(framework, prev.designSource, prev.componentLibrary) as SetupAnswers["styling"],
      tokenFile: autoTokenFile(framework),
      componentDir: autoComponentDir(framework),
    }));
  }
  function setSource(designSource: SetupAnswers["designSource"]): void {
    setA((prev) => ({
      ...prev,
      designSource,
      styling: autoStyling(prev.framework, designSource, prev.componentLibrary) as SetupAnswers["styling"],
    }));
  }
  function setLibrary(componentLibrary: SetupAnswers["componentLibrary"]): void {
    setA((prev) => ({
      ...prev,
      componentLibrary,
      styling: autoStyling(prev.framework, prev.designSource, componentLibrary) as SetupAnswers["styling"],
    }));
  }
  function set<K extends keyof SetupAnswers>(key: K, value: SetupAnswers[K]): void {
    setA((prev) => ({ ...prev, [key]: value }));
  }

  async function create(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      // A remote GitHub repo as the source → clone it into the project folder first,
      // then lay down the SDD-DE toolkit. (A local folder path is read in place.)
      if (a.designSource === "github" && a.githubRepoUrl && /^(https?:\/\/|git@|ssh:\/\/)/.test(a.githubRepoUrl)) {
        const r = await api.gitImport({
          projectPath: project.path,
          url: a.githubRepoUrl.trim(),
          branch: a.githubBranch?.trim() || undefined,
        });
        if (!r.ok) {
          setError(`Couldn't import the repository: ${r.message}`);
          setBusy(false);
          return;
        }
      }
      onCreated(await api.createProject(project.path, a));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not set up the project");
      setBusy(false);
    }
  }

  const ready = isReady(a);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-6 py-8">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-vs-text-primary">Set up project</h2>
          <p className="truncate text-xs text-vs-text-muted">{project.path}</p>
        </div>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </header>

      {/* Design source first — the key question. */}
      <Section title="Where do your components and design specs come from?">
        <RadioGroup
          options={DESIGN_SOURCE_OPTIONS}
          value={a.designSource}
          onChange={(v) => setSource(v as SetupAnswers["designSource"])}
        />
        {a.designSource === "figma" && (
          <div className="mt-3 flex flex-col gap-2">
            <TextField
              label="Figma file URL"
              value={a.figmaFileUrl ?? ""}
              placeholder="https://www.figma.com/design/…"
              onChange={(v) => set("figmaFileUrl", v)}
            />
            <TextField
              label="Figma variable collection (design tokens)"
              value={a.figmaTokenCollection ?? "Tokens"}
              placeholder="Tokens"
              onChange={(v) => set("figmaTokenCollection", v)}
            />
          </div>
        )}
        {a.designSource === "library" && (
          <div className="mt-3">
            <p className="mb-1 text-xs text-vs-text-muted">Which component library?</p>
            <RadioGroup
              options={COMPONENT_LIBRARY_OPTIONS}
              value={a.componentLibrary ?? "shadcn"}
              onChange={(v) => setLibrary(v as SetupAnswers["componentLibrary"])}
            />
          </div>
        )}
        {a.designSource === "github" && (
          <div className="mt-3 flex flex-col gap-2">
            <TextField
              label="GitHub repository URL"
              value={a.githubRepoUrl ?? ""}
              placeholder="https://github.com/org/design-system"
              onChange={(v) => set("githubRepoUrl", v)}
            />
            <TextField
              label="Branch"
              value={a.githubBranch ?? "main"}
              placeholder="main"
              onChange={(v) => set("githubBranch", v)}
            />
            <TextField
              label="Component directory in the repo"
              value={a.githubComponentDir ?? "src/components"}
              placeholder="src/components"
              onChange={(v) => set("githubComponentDir", v)}
            />
          </div>
        )}
        {a.designSource === "zip" && (
          <div className="mt-3 flex flex-col gap-2">
            <TextField
              label="Path to the ZIP file"
              value={a.zipFilePath ?? ""}
              placeholder="./design-system.zip"
              onChange={(v) => set("zipFilePath", v)}
            />
            <TextField
              label="Component directory inside the ZIP"
              value={a.zipComponentDir ?? "src/components"}
              placeholder="src/components"
              onChange={(v) => set("zipComponentDir", v)}
            />
          </div>
        )}
        {a.designSource === "stitch" && (
          <div className="mt-3 flex flex-col gap-2">
            <RadioGroup
              options={[
                { value: "mcp", label: "Stitch MCP", hint: "Live connection via API" },
                { value: "zip", label: "Exported ZIP", hint: "design.md + screen PNGs" },
              ]}
              value={a.stitchConnection ?? "mcp"}
              onChange={(v) => set("stitchConnection", v as SetupAnswers["stitchConnection"])}
            />
            {(a.stitchConnection ?? "mcp") === "mcp" ? (
              <>
                <TextField
                  label="Stitch API key"
                  value={a.stitchApiKey ?? ""}
                  placeholder="AIza…"
                  onChange={(v) => set("stitchApiKey", v)}
                />
                <TextField
                  label="Stitch project ID (optional)"
                  value={a.stitchProjectId ?? ""}
                  placeholder="proj_abc123 — blank to list at runtime"
                  onChange={(v) => set("stitchProjectId", v)}
                />
              </>
            ) : (
              <TextField
                label="Path to the Stitch exported ZIP"
                value={a.stitchZipPath ?? ""}
                placeholder="./stitch-export.zip"
                onChange={(v) => set("stitchZipPath", v)}
              />
            )}
          </div>
        )}
      </Section>

      <Section title="Framework">
        <RadioGroup
          options={FRAMEWORK_OPTIONS}
          value={a.framework}
          onChange={(v) => setFramework(v as SetupAnswers["framework"])}
        />
      </Section>

      <Section title="Language">
        <RadioGroup
          options={[
            { value: "typescript", label: "TypeScript" },
            { value: "javascript", label: "JavaScript" },
          ]}
          value={a.language}
          onChange={(v) => set("language", v as SetupAnswers["language"])}
        />
      </Section>

      <Section title={`Styling (${a.styling} suggested)`}>
        <RadioGroup
          options={STYLING_OPTIONS}
          value={a.styling}
          onChange={(v) => set("styling", v as SetupAnswers["styling"])}
        />
      </Section>

      <Section title="Files">
        <div className="flex flex-col gap-2">
          <TextField
            label="Design token file"
            value={a.tokenFile}
            onChange={(v) => set("tokenFile", v)}
          />
          <TextField
            label="Component directory"
            value={a.componentDir}
            onChange={(v) => set("componentDir", v)}
          />
        </div>
      </Section>

      <Section title="Test runner">
        <RadioGroup
          options={TEST_RUNNER_OPTIONS}
          value={a.testRunner}
          onChange={(v) => set("testRunner", v as SetupAnswers["testRunner"])}
        />
      </Section>

      {error && (
        <div className="rounded-md border border-vs-error/40 bg-vs-error/10 px-4 py-2 text-sm text-vs-error">
          {error}
        </div>
      )}

      <div className="flex items-center justify-end gap-2 border-t border-vs-border-subtle pt-4">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="primary" disabled={busy || !ready} onClick={() => void create()}>
          {busy ? "Setting up…" : "Create project"}
        </Button>
      </div>
    </div>
  );
}

function defaults(): SetupAnswers {
  return {
    framework: "react",
    language: "typescript",
    designSource: "figma",
    figmaTokenCollection: "Tokens",
    styling: autoStyling("react", "figma") as SetupAnswers["styling"],
    tokenFile: autoTokenFile("react"),
    componentDir: autoComponentDir("react"),
    testRunner: "vitest",
  };
}

function isReady(a: SetupAnswers): boolean {
  if (a.designSource === "github") return (a.githubRepoUrl ?? "").startsWith("https://github.com/");
  if (a.designSource === "zip") return (a.zipFilePath ?? "").endsWith(".zip");
  if (a.designSource === "stitch") {
    return (a.stitchConnection ?? "mcp") === "mcp"
      ? (a.stitchApiKey ?? "").trim().length >= 10
      : (a.stitchZipPath ?? "").endsWith(".zip");
  }
  return a.tokenFile.trim().length > 0 && a.componentDir.trim().length > 0;
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <Card className="p-4">
      <h3 className="mb-2 text-sm font-medium text-vs-text-primary">{title}</h3>
      {children}
    </Card>
  );
}

function RadioGroup({
  options,
  value,
  onChange,
}: {
  options: readonly { value: string; label: string; hint?: string }[];
  value: string;
  onChange: (v: string) => void;
}): React.JSX.Element {
  return (
    <div className="grid grid-cols-2 gap-2">
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={`flex flex-col items-start rounded-md border px-3 py-2 text-left transition-colors ${
              selected
                ? "border-vs-accent bg-vs-accent-muted"
                : "border-vs-border-default hover:bg-vs-bg-hover"
            }`}
          >
            <span className="text-sm text-vs-text-primary">{o.label}</span>
            {o.hint && <span className="text-[11px] text-vs-text-muted">{o.hint}</span>}
          </button>
        );
      })}
    </div>
  );
}

function TextField({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (v: string) => void;
}): React.JSX.Element {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-vs-text-muted">{label}</span>
      <input
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-vs-border-default bg-vs-bg-primary px-3 py-2 text-sm text-vs-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-vs-accent-subtle"
      />
    </label>
  );
}
