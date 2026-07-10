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
import { Button } from "../components/ui";

/**
 * Unified project setup — one Intake-style stepper that merges the tech-stack
 * setup (design source + framework/language/styling → `project.yaml`) with the
 * SDD-DE intake questions (product/scope/constraints → `intake.json`). One
 * process: Setup → Product → Scope → Advanced. Setup is required; the rest are
 * optional. On finish it creates the project, then saves the intake. Replaces
 * the old NewProjectWizard + separate Intake for the create flow.
 */

const STEPS = [
  { label: "Setup", title: "Set up your stack", blurb: "Where your components come from, and what the generated code targets." },
  { label: "Product", title: "What are you building?", blurb: "The CLI's opening questions — in your words. Written to intake.json." },
  { label: "Scope", title: "Scope & goal", blurb: "Draw the boundary so the agent builds the right thing and stops there." },
  { label: "Advanced", title: "Advanced development setup", blurb: "Optional — files, test runner, package manager, and the constraints verification enforces." },
] as const;

const PKG_OPTIONS = ["Auto (pnpm)", "pnpm", "npm", "yarn", "bun"];

export function ProjectSetup({
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
  const [step, setStep] = useState(0);
  const [a, setA] = useState<SetupAnswers>(() => ({ ...defaults(), ...initialSource }));
  // Intake answers (product/scope/constraints + package-manager preference).
  const [intake, setIntake] = useState<Record<string, string>>({ pkg: "Auto (pnpm)" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
  const setI = (key: string, v: string): void => setIntake((s) => ({ ...s, [key]: v }));

  const ready = isReady(a); // Setup step complete → can create.
  const isLast = step === STEPS.length - 1;
  const def = STEPS[step];

  async function finish(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
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
      const created = await api.createProject(project.path, a);
      // Intake is optional context — never block project creation on it.
      await api.saveIntake(created.path, serializeIntake(intake)).catch(() => undefined);
      onCreated(created);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not set up the project");
      setBusy(false);
    }
  }

  return (
    <div className="min-h-[calc(100vh-3rem)] bg-vs-bg-primary text-vs-text-primary">
      <div className="mx-auto flex w-full max-w-[860px] gap-9 px-6 pb-16 pt-10">
        {/* step rail */}
        <div className="flex w-48 flex-none flex-col gap-0.5 pt-1.5">
          <div className="px-2 pb-2.5 text-[11px] font-semibold uppercase tracking-wide text-vs-text-muted">
            New project
          </div>
          {STEPS.map((s, i) => {
            const done = i < step;
            const active = i === step;
            // Can't jump ahead past Setup until it's valid.
            const reachable = i <= step || (i > 0 && ready);
            return (
              <button
                key={s.label}
                disabled={!reachable}
                onClick={() => reachable && setStep(i)}
                className={`flex items-center gap-2.5 rounded-md p-2 text-left text-[13px] disabled:opacity-40 ${
                  active ? "bg-vs-bg-elevated" : "hover:bg-vs-bg-elevated"
                }`}
              >
                <span
                  className="flex h-[18px] w-[18px] flex-none items-center justify-center rounded-full border-[1.5px] font-mono text-[10px]"
                  style={{
                    borderColor: done ? "#30A46C" : active ? "#7C6FF0" : "#34373D",
                    background: done ? "#30A46C" : "transparent",
                    color: done ? "#0B0C0E" : active ? "#7C6FF0" : "#6B7280",
                  }}
                >
                  {done ? "✓" : i + 1}
                </span>
                <span className={active ? "text-vs-text-primary" : "text-vs-text-secondary"}>{s.label}</span>
                {i >= 2 && <span className="ml-auto text-[10px] text-vs-text-muted">optional</span>}
              </button>
            );
          })}
        </div>

        {/* form */}
        <div className="flex min-w-0 flex-1 flex-col gap-6">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2.5">
              <h1 className="text-[20px] font-semibold tracking-[-0.01em]">{def.title}</h1>
              <span className="font-mono text-[11px] text-vs-text-muted">
                step {step + 1} / {STEPS.length}
              </span>
            </div>
            <p className="max-w-[62ch] text-[13px] leading-relaxed text-vs-text-secondary">{def.blurb}</p>
            <p className="truncate font-mono text-[11px] text-vs-text-muted">{project.path}</p>
          </div>

          {step === 0 && (
            <SetupStep a={a} setSource={setSource} setFramework={setFramework} setLibrary={setLibrary} set={set} />
          )}
          {step === 1 && (
            <div className="flex flex-col gap-5">
              <Area label="What are you building?" value={intake.building ?? ""} placeholder="One or two sentences on the feature or product." onChange={(v) => setI("building", v)} />
              <Area label="Who is it for?" value={intake.audience ?? ""} placeholder="The primary user and their context." onChange={(v) => setI("audience", v)} />
            </div>
          )}
          {step === 2 && (
            <div className="flex flex-col gap-5">
              <Text label="Primary user goal" value={intake.goal ?? ""} placeholder="What must the user be able to accomplish?" onChange={(v) => setI("goal", v)} />
              <Area label="In scope for this run" optional value={intake.inScope ?? ""} placeholder="Bullet the surfaces to generate." onChange={(v) => setI("inScope", v)} />
            </div>
          )}
          {step === 3 && (
            <div className="flex flex-col gap-5">
              <div className="grid grid-cols-2 gap-3">
                <Text label="Design token file" value={a.tokenFile} onChange={(v) => set("tokenFile", v)} />
                <Text label="Component directory" value={a.componentDir} onChange={(v) => set("componentDir", v)} />
              </div>
              <Chips label="Package manager" hint="Auto picks the best for your framework (prefers pnpm)." options={PKG_OPTIONS} value={intake.pkg ?? "Auto (pnpm)"} onChange={(v) => setI("pkg", v)} />
              <Radios label="Test runner" options={TEST_RUNNER_OPTIONS} value={a.testRunner} onChange={(v) => set("testRunner", v as SetupAnswers["testRunner"])} />
              <Chips label="Accessibility target" optional options={["WCAG 2.2 AA", "WCAG 2.1 AA", "No specific target"]} value={intake.a11y ?? ""} onChange={(v) => setI("a11y", v)} />
              <div className="grid grid-cols-2 gap-3">
                <Text label="Browser support" optional value={intake.browsers ?? ""} placeholder="evergreen + iOS Safari 16" onChange={(v) => setI("browsers", v)} />
                <Text label="Performance budget" optional value={intake.perf ?? ""} placeholder="LCP < 2.5s on 4G" onChange={(v) => setI("perf", v)} />
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-md border border-vs-error/40 bg-vs-error/10 px-4 py-2 text-sm text-vs-error">{error}</div>
          )}

          <div className="flex items-center gap-3 border-t border-vs-border-default pt-5">
            {step > 0 ? (
              <Button variant="default" onClick={() => setStep((s) => s - 1)}>← Back</Button>
            ) : (
              <Button variant="ghost" onClick={onCancel}>Cancel</Button>
            )}
            <span className="flex-1" />
            {/* Skip the remaining optional steps and create now (Setup must be valid). */}
            {step >= 1 && !isLast && (
              <Button variant="ghost" disabled={!ready || busy} onClick={() => void finish()}>
                Skip &amp; create
              </Button>
            )}
            {isLast ? (
              <Button variant="primary" disabled={!ready || busy} onClick={() => void finish()}>
                {busy ? "Setting up…" : "Create project"}
              </Button>
            ) : step === 0 ? (
              <Button variant="primary" disabled={!ready} onClick={() => setStep((s) => s + 1)}>Next →</Button>
            ) : (
              <Button variant="primary" onClick={() => setStep((s) => s + 1)}>Next →</Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Steps ────────────────────────────────────────────────────────────

function SetupStep({
  a,
  setSource,
  setFramework,
  setLibrary,
  set,
}: {
  a: SetupAnswers;
  setSource: (v: SetupAnswers["designSource"]) => void;
  setFramework: (v: SetupAnswers["framework"]) => void;
  setLibrary: (v: SetupAnswers["componentLibrary"]) => void;
  set: <K extends keyof SetupAnswers>(key: K, value: SetupAnswers[K]) => void;
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-5">
      <Field label="Where do your components and design specs come from?">
        <Radios options={DESIGN_SOURCE_OPTIONS} value={a.designSource} onChange={(v) => setSource(v as SetupAnswers["designSource"])} />
        {a.designSource === "figma" && (
          <div className="mt-2 grid grid-cols-1 gap-2">
            <Text label="Figma file URL" value={a.figmaFileUrl ?? ""} placeholder="https://www.figma.com/design/…" onChange={(v) => set("figmaFileUrl", v)} />
            <Text label="Figma variable collection (design tokens)" value={a.figmaTokenCollection ?? "Tokens"} placeholder="Tokens" onChange={(v) => set("figmaTokenCollection", v)} />
          </div>
        )}
        {a.designSource === "library" && (
          <div className="mt-2">
            <p className="mb-1.5 text-[11px] text-vs-text-muted">Which component library?</p>
            <Radios options={COMPONENT_LIBRARY_OPTIONS} value={a.componentLibrary ?? "shadcn"} onChange={(v) => setLibrary(v as SetupAnswers["componentLibrary"])} />
          </div>
        )}
        {a.designSource === "github" && (
          <div className="mt-2 grid grid-cols-1 gap-2">
            <Text label="GitHub repository URL" value={a.githubRepoUrl ?? ""} placeholder="https://github.com/org/design-system" onChange={(v) => set("githubRepoUrl", v)} />
            <Text label="Branch" value={a.githubBranch ?? "main"} placeholder="main" onChange={(v) => set("githubBranch", v)} />
            <Text label="Component directory in the repo" value={a.githubComponentDir ?? "src/components"} placeholder="src/components" onChange={(v) => set("githubComponentDir", v)} />
          </div>
        )}
        {a.designSource === "zip" && (
          <div className="mt-2 grid grid-cols-1 gap-2">
            <Text label="Path to the ZIP file" value={a.zipFilePath ?? ""} placeholder="./design-system.zip" onChange={(v) => set("zipFilePath", v)} />
            <Text label="Component directory inside the ZIP" value={a.zipComponentDir ?? "src/components"} placeholder="src/components" onChange={(v) => set("zipComponentDir", v)} />
          </div>
        )}
        {a.designSource === "stitch" && (
          <div className="mt-2 grid grid-cols-1 gap-2">
            <Radios
              options={[
                { value: "mcp", label: "Stitch MCP", hint: "Live connection via API" },
                { value: "zip", label: "Exported ZIP", hint: "design.md + screen PNGs" },
              ]}
              value={a.stitchConnection ?? "mcp"}
              onChange={(v) => set("stitchConnection", v as SetupAnswers["stitchConnection"])}
            />
            {(a.stitchConnection ?? "mcp") === "mcp" ? (
              <>
                <Text label="Stitch API key" value={a.stitchApiKey ?? ""} placeholder="AIza…" onChange={(v) => set("stitchApiKey", v)} />
                <Text label="Stitch project ID (optional)" value={a.stitchProjectId ?? ""} placeholder="proj_abc123 — blank to list at runtime" onChange={(v) => set("stitchProjectId", v)} />
              </>
            ) : (
              <Text label="Path to the Stitch exported ZIP" value={a.stitchZipPath ?? ""} placeholder="./stitch-export.zip" onChange={(v) => set("stitchZipPath", v)} />
            )}
          </div>
        )}
      </Field>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Radios label="Framework" options={FRAMEWORK_OPTIONS} value={a.framework} onChange={(v) => setFramework(v as SetupAnswers["framework"])} />
        <Radios
          label="Language"
          options={[
            { value: "typescript", label: "TypeScript" },
            { value: "javascript", label: "JavaScript" },
          ]}
          value={a.language}
          onChange={(v) => set("language", v as SetupAnswers["language"])}
        />
      </div>
      <Radios label={`Styling (${a.styling} suggested)`} options={STYLING_OPTIONS} value={a.styling} onChange={(v) => set("styling", v as SetupAnswers["styling"])} />
    </div>
  );
}

// ── Field controls (Intake-styled) ───────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[13px] font-medium text-vs-text-primary">{label}</span>
      {children}
    </div>
  );
}

function labelNode(label: string, optional?: boolean): React.JSX.Element {
  return (
    <span className="text-[13px] font-medium text-vs-text-primary">
      {label} {optional && <span className="font-normal text-vs-text-muted">(optional)</span>}
    </span>
  );
}

function Text({
  label,
  value,
  placeholder,
  optional,
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  optional?: boolean;
  onChange: (v: string) => void;
}): React.JSX.Element {
  return (
    <label className="flex min-w-0 flex-col gap-2">
      {labelNode(label, optional)}
      <input
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="h-[38px] rounded-md border border-vs-border-default bg-vs-bg-surface px-3 text-[13px] text-vs-text-primary placeholder:text-vs-text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-vs-accent-subtle"
      />
    </label>
  );
}

function Area({
  label,
  value,
  placeholder,
  optional,
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  optional?: boolean;
  onChange: (v: string) => void;
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-2">
      {labelNode(label, optional)}
      <textarea
        rows={3}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="resize-none rounded-md border border-vs-border-default bg-vs-bg-surface px-3 py-2.5 text-[13px] leading-relaxed text-vs-text-primary placeholder:text-vs-text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-vs-accent-subtle"
      />
    </div>
  );
}

function Chips({
  label,
  hint,
  options,
  value,
  optional,
  onChange,
}: {
  label: string;
  hint?: string;
  options: string[];
  value: string;
  optional?: boolean;
  onChange: (v: string) => void;
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-2">
      {labelNode(label, optional)}
      {hint && <span className="-mt-1 text-[11px] text-vs-text-muted">{hint}</span>}
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const active = value === o;
          return (
            <button
              key={o}
              onClick={() => onChange(o)}
              className="rounded-full border px-3.5 py-1.5 text-xs hover:border-vs-accent"
              style={{
                borderColor: active ? "#7C6FF0" : "#34373D",
                background: active ? "rgba(124,111,240,0.12)" : "transparent",
                color: active ? "#E7E9EC" : "#9BA1AB",
              }}
            >
              {o}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Radios({
  label,
  options,
  value,
  onChange,
}: {
  label?: string;
  options: readonly { value: string; label: string; hint?: string }[];
  value: string;
  onChange: (v: string) => void;
}): React.JSX.Element {
  const grid = (
    <div className="grid grid-cols-2 gap-2">
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={`flex flex-col items-start rounded-md border px-3 py-2 text-left transition-colors ${
              selected ? "border-vs-accent bg-vs-accent-muted" : "border-vs-border-default hover:bg-vs-bg-hover"
            }`}
          >
            <span className="text-[13px] text-vs-text-primary">{o.label}</span>
            {o.hint && <span className="text-[11px] text-vs-text-muted">{o.hint}</span>}
          </button>
        );
      })}
    </div>
  );
  if (!label) return grid;
  return (
    <div className="flex flex-col gap-2">
      {labelNode(label)}
      {grid}
    </div>
  );
}

// ── Data ─────────────────────────────────────────────────────────────

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

/** The intake answers → `.sdd-de/intake.json` markdown (no stack — that's in project.yaml). */
function serializeIntake(v: Record<string, string>): string {
  const line = (label: string, key: string): string => (v[key] ? `**${label}**\n${v[key]}\n` : "");
  return [
    "# Intake",
    "",
    "## Product",
    line("What are you building?", "building"),
    line("Who is it for?", "audience"),
    "## Scope",
    line("Primary user goal", "goal"),
    line("In scope", "inScope"),
    "## Advanced",
    line("Package manager", "pkg"),
    line("Accessibility", "a11y"),
    line("Browser support", "browsers"),
    line("Performance budget", "perf"),
  ]
    .filter((l) => l !== "")
    .join("\n");
}
