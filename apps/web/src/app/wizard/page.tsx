"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { saveFigmaPAT } from "@/lib/data/figma";
import { saveProjectConfig } from "@/lib/data/project-config";
import { startFigmaImport } from "@/app/projects/[id]/import/figma-actions";
import { startImport } from "@/app/projects/[id]/import/actions";
import { generateAllComponents } from "@/lib/data/codegen";

// ── Types ──

type Step = "welcome" | "framework" | "style" | "library" | "source" | "figma" | "zip" | "processing" | "done";
type Framework = "react" | "nextjs" | "vue" | "svelte";
type StyleLib = "tailwind" | "css-modules" | "styled-components";
type CompLib = "shadcn" | "radix" | "headless-ui" | "none";
type Source = "figma" | "zip";

interface ProcessingStatus {
  step: string;
  detail: string;
  progress: number; // 0-100
}

// ── Option Card ──

function Option<T extends string>({ value, selected, onSelect, icon, label, desc }: {
  value: T; selected: boolean; onSelect: (v: T) => void; icon: string; label: string; desc: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 text-left transition-all cursor-pointer ${
        selected
          ? "border-vs-accent bg-[rgba(124,111,240,0.08)]"
          : "border-vs-border-default hover:border-vs-border-strong bg-vs-bg-surface"
      }`}
    >
      <span className="text-[24px] flex-none w-10 text-center">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="text-[14px] font-semibold text-vs-text-primary">{label}</div>
        <div className="text-[12px] text-vs-text-secondary mt-0.5">{desc}</div>
      </div>
      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-none ${
        selected ? "border-vs-accent" : "border-vs-border-strong"
      }`}>
        {selected && <div className="w-2.5 h-2.5 rounded-full bg-vs-accent" />}
      </div>
    </button>
  );
}

// ── Step Components ──

function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <div className="flex flex-col items-center text-center py-12">
      <img src="/favicon.png" alt="VortSpec" width={64} height={64} className="mb-6" />
      <h1 className="text-[32px] font-bold tracking-tight text-vs-text-primary mb-3">
        Welcome to VortSpec
      </h1>
      <p className="text-[16px] text-vs-text-secondary max-w-[440px] leading-relaxed mb-8">
        Turn your design system into production components.
        Import from Figma or a ZIP export, pick your stack, and let AI generate the code.
      </p>
      <button
        onClick={onNext}
        className="bg-vs-accent text-white rounded-xl px-8 py-3.5 text-[15px] font-semibold cursor-pointer hover:brightness-110 transition-all"
      >
        Get Started
      </button>
    </div>
  );
}

function FrameworkStep({ value, onChange }: { value: Framework; onChange: (v: Framework) => void }) {
  const options: Array<{ value: Framework; icon: string; label: string; desc: string }> = [
    { value: "react", icon: "⚛️", label: "React", desc: "Component library with JSX and hooks" },
    { value: "nextjs", icon: "▲", label: "Next.js", desc: "Full-stack React framework with App Router" },
    { value: "vue", icon: "🌿", label: "Vue", desc: "Progressive framework with single-file components" },
    { value: "svelte", icon: "🔥", label: "Svelte", desc: "Compile-time framework, minimal runtime" },
  ];
  return (
    <div>
      <h2 className="text-[22px] font-bold text-vs-text-primary mb-2">What framework are you using?</h2>
      <p className="text-[13px] text-vs-text-secondary mb-6">Your components will be generated in this framework.</p>
      <div className="flex flex-col gap-3">
        {options.map((o) => <Option key={o.value} {...o} selected={value === o.value} onSelect={onChange} />)}
      </div>
    </div>
  );
}

function StyleStep({ value, onChange }: { value: StyleLib; onChange: (v: StyleLib) => void }) {
  const options: Array<{ value: StyleLib; icon: string; label: string; desc: string }> = [
    { value: "tailwind", icon: "🌊", label: "Tailwind CSS", desc: "Utility-first CSS with design token classes" },
    { value: "css-modules", icon: "🗂️", label: "CSS Modules", desc: "Scoped CSS with automatic class hashing" },
    { value: "styled-components", icon: "💅", label: "styled-components", desc: "CSS-in-JS with tagged templates" },
  ];
  return (
    <div>
      <h2 className="text-[22px] font-bold text-vs-text-primary mb-2">How do you style your components?</h2>
      <p className="text-[13px] text-vs-text-secondary mb-6">Generated code will use this approach for all styling.</p>
      <div className="flex flex-col gap-3">
        {options.map((o) => <Option key={o.value} {...o} selected={value === o.value} onSelect={onChange} />)}
      </div>
    </div>
  );
}

function LibraryStep({ value, onChange }: { value: CompLib; onChange: (v: CompLib) => void }) {
  const options: Array<{ value: CompLib; icon: string; label: string; desc: string }> = [
    { value: "shadcn", icon: "🎨", label: "shadcn/ui", desc: "Copy-paste components built on Radix + Tailwind" },
    { value: "radix", icon: "⬡", label: "Radix UI", desc: "Unstyled, accessible primitives" },
    { value: "headless-ui", icon: "🧩", label: "Headless UI", desc: "Unstyled components from Tailwind Labs" },
    { value: "none", icon: "—", label: "No library", desc: "Generate standalone components from scratch" },
  ];
  return (
    <div>
      <h2 className="text-[22px] font-bold text-vs-text-primary mb-2">Component library?</h2>
      <p className="text-[13px] text-vs-text-secondary mb-6">Optional. Generated code can use primitives from a headless library.</p>
      <div className="flex flex-col gap-3">
        {options.map((o) => <Option key={o.value} {...o} selected={value === o.value} onSelect={onChange} />)}
      </div>
    </div>
  );
}

function SourceStep({ value, onChange }: { value: Source; onChange: (v: Source) => void }) {
  return (
    <div>
      <h2 className="text-[22px] font-bold text-vs-text-primary mb-2">Where are your designs?</h2>
      <p className="text-[13px] text-vs-text-secondary mb-6">VortSpec will read your design system and generate components from it.</p>
      <div className="flex flex-col gap-3">
        <Option value="figma" icon="🔗" label="Figma file" desc="Paste a Figma URL — we'll read components, variables, and styles" selected={value === "figma"} onSelect={onChange} />
        <Option value="zip" icon="📦" label="ZIP export" desc="Upload an HTML/CSS export from Claude Design, Stitch, or any tool" selected={value === "zip"} onSelect={onChange} />
      </div>
    </div>
  );
}

function FigmaStep({ url, onUrlChange, pat, onPatChange, patSaved, onSavePat }: {
  url: string; onUrlChange: (v: string) => void;
  pat: string; onPatChange: (v: string) => void;
  patSaved: boolean; onSavePat: () => void;
}) {
  return (
    <div>
      <h2 className="text-[22px] font-bold text-vs-text-primary mb-2">Connect your Figma file</h2>
      <p className="text-[13px] text-vs-text-secondary mb-6">Paste the URL and your access token.</p>

      <div className="space-y-4">
        <div>
          <label className="block text-[12px] text-vs-text-muted mb-1.5 font-medium">Figma file URL</label>
          <input
            type="text"
            value={url}
            onChange={(e) => onUrlChange(e.target.value)}
            placeholder="https://figma.com/design/..."
            className="w-full bg-vs-bg-surface border border-vs-border-default rounded-lg px-4 py-3 text-[13px] text-vs-text-primary placeholder:text-vs-text-muted outline-none focus:border-vs-accent transition-colors"
          />
        </div>
        <div>
          <label className="block text-[12px] text-vs-text-muted mb-1.5 font-medium">Personal Access Token</label>
          <div className="flex gap-2">
            <input
              type="password"
              value={pat}
              onChange={(e) => onPatChange(e.target.value)}
              placeholder="figd_..."
              className="flex-1 bg-vs-bg-surface border border-vs-border-default rounded-lg px-4 py-3 text-[13px] text-vs-text-primary font-mono placeholder:text-vs-text-muted outline-none focus:border-vs-accent"
            />
            {!patSaved && (
              <button onClick={onSavePat} disabled={!pat.trim()} className="bg-vs-accent text-white rounded-lg px-4 py-3 text-[12px] font-medium cursor-pointer hover:brightness-110 disabled:opacity-50">
                Save
              </button>
            )}
          </div>
          {patSaved && <p className="text-[11px] text-vs-success mt-1">✓ Token saved</p>}
          <p className="text-[11px] text-vs-text-muted mt-1.5">
            Free at <a href="https://www.figma.com/developers/api#access-tokens" target="_blank" rel="noopener" className="text-vs-accent">figma.com/developers</a>
          </p>
        </div>
      </div>
    </div>
  );
}

function ZipStep({ file, onFileChange }: { file: File | null; onFileChange: (f: File | null) => void }) {
  return (
    <div>
      <h2 className="text-[22px] font-bold text-vs-text-primary mb-2">Upload your design export</h2>
      <p className="text-[13px] text-vs-text-secondary mb-6">Drop a ZIP file with HTML/CSS from any design tool.</p>

      {file ? (
        <div className="flex items-center gap-3 bg-vs-bg-surface border border-vs-border-default rounded-lg px-4 py-3">
          <span className="text-[14px]">📄</span>
          <span className="font-mono text-[13px] text-vs-text-primary flex-1">{file.name}</span>
          <span className="text-[12px] text-vs-text-muted">{(file.size / 1024 / 1024).toFixed(1)} MB</span>
          <button onClick={() => onFileChange(null)} className="text-vs-text-muted hover:text-vs-error cursor-pointer bg-transparent border-none text-[14px]">✕</button>
        </div>
      ) : (
        <label className="block w-full h-[140px] border-2 border-dashed border-vs-border-default hover:border-vs-accent rounded-xl flex items-center justify-center cursor-pointer transition-colors">
          <div className="text-center">
            <span className="text-[24px] block mb-2">📦</span>
            <span className="text-[13px] text-vs-text-muted">Drop ZIP here or click to browse</span>
          </div>
          <input type="file" accept=".zip" className="hidden" onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            onFileChange(f);
          }} />
        </label>
      )}
    </div>
  );
}

function ProcessingStep({ status }: { status: ProcessingStatus }) {
  return (
    <div className="py-8">
      <h2 className="text-[22px] font-bold text-vs-text-primary mb-2 text-center">Building your components</h2>
      <p className="text-[13px] text-vs-text-secondary mb-8 text-center">This may take a few minutes. VortSpec is reading your designs and generating production code.</p>

      {/* Progress bar */}
      <div className="h-2 bg-vs-border-default rounded-full overflow-hidden mb-4 max-w-[400px] mx-auto">
        <div className="h-full bg-vs-accent rounded-full transition-[width] duration-500" style={{ width: `${status.progress}%` }} />
      </div>

      <div className="text-center">
        <p className="text-[14px] font-medium text-vs-text-primary">{status.step}</p>
        <p className="text-[12px] text-vs-text-muted mt-1">{status.detail}</p>
      </div>

      {/* Animated dots */}
      <div className="flex justify-center gap-1.5 mt-6">
        {[0, 1, 2].map((i) => (
          <div key={i} className="w-2 h-2 rounded-full bg-vs-accent" style={{
            animation: "vsPulse 1.4s ease-in-out infinite",
            animationDelay: `${i * 0.2}s`,
          }} />
        ))}
      </div>
    </div>
  );
}

function DoneStep({ componentCount, tokenCount, projectId }: { componentCount: number; tokenCount: number; projectId: string }) {
  const router = useRouter();
  return (
    <div className="flex flex-col items-center text-center py-8">
      <div className="w-16 h-16 rounded-full bg-vs-success/20 flex items-center justify-center mb-6">
        <span className="text-[28px]">✓</span>
      </div>
      <h2 className="text-[24px] font-bold text-vs-text-primary mb-3">Your components are ready!</h2>
      <div className="flex gap-8 mb-8">
        <div>
          <p className="font-mono text-[32px] font-bold text-vs-text-primary">{componentCount}</p>
          <p className="text-[12px] text-vs-text-secondary">components</p>
        </div>
        <div>
          <p className="font-mono text-[32px] font-bold text-vs-text-primary">{tokenCount}</p>
          <p className="text-[12px] text-vs-text-secondary">tokens</p>
        </div>
      </div>
      <button
        onClick={() => router.push(`/projects/${projectId}/inspect/components`)}
        className="bg-vs-accent text-white rounded-xl px-8 py-3.5 text-[15px] font-semibold cursor-pointer hover:brightness-110 transition-all"
      >
        Browse Components
      </button>
    </div>
  );
}

// ── Main Wizard ──

const STEP_ORDER: Step[] = ["welcome", "framework", "style", "library", "source"];

export default function WizardPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("welcome");
  const [framework, setFramework] = useState<Framework>("react");
  const [styleLib, setStyleLib] = useState<StyleLib>("tailwind");
  const [compLib, setCompLib] = useState<CompLib>("none");
  const [source, setSource] = useState<Source>("figma");
  const [figmaUrl, setFigmaUrl] = useState("");
  const [figmaPat, setFigmaPat] = useState("");
  const [patSaved, setPatSaved] = useState(false);
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [processing, setProcessing] = useState<ProcessingStatus>({ step: "", detail: "", progress: 0 });
  const [projectId, setProjectId] = useState("");
  const [resultCounts, setResultCounts] = useState({ components: 0, tokens: 0 });
  const [error, setError] = useState<string | null>(null);

  const currentStepIndex = STEP_ORDER.indexOf(step);
  const totalSteps = STEP_ORDER.length;

  const canProceed = (() => {
    if (step === "source" && source === "figma") return true;
    if (step === "source" && source === "zip") return true;
    if (step === "figma") return !!figmaUrl.match(/figma\.com\/(design|file)\/[A-Za-z0-9]+/) && patSaved;
    if (step === "zip") return !!zipFile;
    return true;
  })();

  const goNext = useCallback(async () => {
    setError(null);

    if (step === "welcome") { setStep("framework"); return; }
    if (step === "framework") { setStep("style"); return; }
    if (step === "style") { setStep("library"); return; }
    if (step === "library") { setStep("source"); return; }
    if (step === "source") { setStep(source === "figma" ? "figma" : "zip"); return; }

    // Start processing
    if (step === "figma" || step === "zip") {
      setStep("processing");

      try {
        // Step 1: Import
        setProcessing({ step: "Importing designs", detail: "Reading your design file...", progress: 10 });

        let importResult: { importId: string; projectId?: string; error?: string };

        if (step === "figma") {
          importResult = await startFigmaImport("new", figmaUrl);
        } else {
          const formData = new FormData();
          formData.append("file", zipFile!);
          importResult = await startImport("new", formData);
        }

        if (importResult.error) {
          setError(importResult.error);
          setStep(step); // Go back
          return;
        }

        const pid = importResult.projectId || "new";
        setProjectId(pid);

        // Step 2: Wait for import to complete (poll)
        setProcessing({ step: "Processing designs", detail: "Extracting tokens and components...", progress: 30 });

        let importDone = false;
        for (let i = 0; i < 120; i++) { // Max 4 minutes
          await new Promise((r) => setTimeout(r, 2000));
          try {
            const res = await fetch(`/api/imports/${importResult.importId}`);
            const data = await res.json();
            if (data.status === "done") {
              importDone = true;
              const report = data.stage_states?.report?.result;
              setResultCounts({
                components: report?.componentCount ?? 0,
                tokens: report?.tokenCount ?? 0,
              });
              break;
            }
            if (data.status === "failed") {
              setError(data.error || "Import failed");
              setStep(step === "figma" ? "figma" : "zip");
              return;
            }
            setProcessing({
              step: "Processing designs",
              detail: getStageDetail(data.stage_states),
              progress: 30 + Math.min(30, i * 2),
            });
          } catch {
            // Network error, keep trying
          }
        }

        if (!importDone) {
          setError("Import timed out. Try again with a smaller file.");
          setStep(step === "figma" ? "figma" : "zip");
          return;
        }

        // Step 3: Save config
        setProcessing({ step: "Configuring project", detail: `${framework} + ${styleLib}`, progress: 65 });
        await saveProjectConfig(pid, framework, styleLib, compLib);

        // Step 4: Generate code
        setProcessing({ step: "Generating components", detail: "AI is writing your code...", progress: 70 });
        const genResult = await generateAllComponents(pid);

        setResultCounts((prev) => ({
          ...prev,
          components: genResult.generated,
        }));
        setProcessing({ step: "Done!", detail: `${genResult.generated} components generated`, progress: 100 });

        // Brief pause to show 100%
        await new Promise((r) => setTimeout(r, 1000));
        setStep("done");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
        setStep(step === "figma" ? "figma" : "zip");
      }
    }
  }, [step, source, figmaUrl, zipFile, framework, styleLib, compLib, figmaPat]);

  const goBack = () => {
    if (step === "figma" || step === "zip") { setStep("source"); return; }
    const idx = STEP_ORDER.indexOf(step);
    if (idx > 0) setStep(STEP_ORDER[idx - 1]);
  };

  return (
    <div className="min-h-screen bg-vs-bg-primary flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-6 h-14 border-b border-vs-border-default flex-none">
        <div className="flex items-center gap-2.5">
          <img src="/favicon.png" alt="" width={22} height={22} />
          <span className="text-[15px] font-semibold text-vs-text-primary tracking-tight">VortSpec</span>
        </div>
        {step !== "welcome" && step !== "processing" && step !== "done" && (
          <span className="text-[11px] text-vs-text-muted font-mono">
            Step {Math.min(currentStepIndex + 1, totalSteps)}/{totalSteps}
          </span>
        )}
      </header>

      {/* Progress bar */}
      {step !== "welcome" && step !== "done" && (
        <div className="h-1 bg-vs-border-default flex-none">
          <div
            className="h-full bg-vs-accent transition-[width] duration-300"
            style={{ width: step === "processing" ? `${processing.progress}%` : `${((currentStepIndex) / totalSteps) * 100}%` }}
          />
        </div>
      )}

      {/* Content */}
      <main className="flex-1 flex items-center justify-center px-6">
        <div className="w-full max-w-[520px]">
          {step === "welcome" && <WelcomeStep onNext={goNext} />}
          {step === "framework" && <FrameworkStep value={framework} onChange={setFramework} />}
          {step === "style" && <StyleStep value={styleLib} onChange={setStyleLib} />}
          {step === "library" && <LibraryStep value={compLib} onChange={setCompLib} />}
          {step === "source" && <SourceStep value={source} onChange={setSource} />}
          {step === "figma" && (
            <FigmaStep
              url={figmaUrl} onUrlChange={setFigmaUrl}
              pat={figmaPat} onPatChange={setFigmaPat}
              patSaved={patSaved}
              onSavePat={async () => {
                await saveFigmaPAT(figmaPat);
                setPatSaved(true);
              }}
            />
          )}
          {step === "zip" && <ZipStep file={zipFile} onFileChange={setZipFile} />}
          {step === "processing" && <ProcessingStep status={processing} />}
          {step === "done" && <DoneStep componentCount={resultCounts.components} tokenCount={resultCounts.tokens} projectId={projectId} />}

          {/* Error */}
          {error && step !== "processing" && (
            <p className="text-[12px] text-vs-error mt-4 text-center">{error}</p>
          )}

          {/* Navigation */}
          {step !== "welcome" && step !== "processing" && step !== "done" && (
            <div className="flex items-center justify-between mt-8">
              <button onClick={goBack} className="text-[13px] text-vs-text-secondary hover:text-vs-text-primary cursor-pointer bg-transparent border-none">
                ← Back
              </button>
              <button
                onClick={goNext}
                disabled={!canProceed}
                className={`rounded-xl px-6 py-2.5 text-[13px] font-semibold transition-all ${
                  canProceed
                    ? "bg-vs-accent text-white cursor-pointer hover:brightness-110"
                    : "bg-vs-bg-elevated text-vs-text-muted cursor-not-allowed"
                }`}
              >
                {(step === "figma" || step === "zip") ? "Start Building →" : "Continue →"}
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function getStageDetail(stageStates: Record<string, { status: string }> | undefined): string {
  if (!stageStates) return "Starting...";
  for (const [name, state] of Object.entries(stageStates)) {
    if (state.status === "running") {
      const labels: Record<string, string> = {
        parse: "Parsing files...",
        style_mining: "Mining styles...",
        token_inference: "Naming tokens...",
        structure_inference: "Detecting components...",
        ds_merge: "Merging design system...",
        report: "Building report...",
        discover: "Reading file structure...",
        extract_variables: "Extracting tokens...",
        extract_components: "Extracting components...",
      };
      return labels[name] ?? `Running ${name}...`;
    }
  }
  return "Processing...";
}
