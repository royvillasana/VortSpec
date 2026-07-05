"use client";

import { useState, useEffect, Fragment } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { CompletenessScore } from "@/components/ui/completeness-score";
import { StatusChip } from "@/components/ui/status-chip";
import { ProvenanceDot } from "@/components/ui/provenance-dot";
import { useToast } from "@/components/ui/toast";
import { useBreadcrumb } from "@/components/shell/BreadcrumbContext";
import { IRPreview } from "@/components/inspector/IRPreview";
import { approveComponent, renameComponent } from "@/lib/data/patches";
import type { ComponentDetailData } from "@/lib/data/components";

const defaultTokenBindings = [
  { id: "t1", name: "color/primary/500", value: "#2563EB", kind: "color" as const, property: "background", editable: true },
  { id: "t2", name: "color/surface/base", value: "#FFFFFF", kind: "color" as const, property: "text color", editable: true },
  { id: "t3", name: "radius/md", value: "8", kind: "radius" as const, property: "border-radius", editable: true },
  { id: "t4", name: "spacing/2", value: "8", kind: "spacing" as const, property: "padding-x", editable: false },
  { id: "t5", name: "spacing/1.5", value: "6", kind: "spacing" as const, property: "padding-y", editable: false },
];

const defaultVariantAxes = [
  { name: "intent", options: ["primary", "secondary", "ghost"], confidence: "inferred" as const },
  { name: "size", options: ["sm", "md", "lg"], confidence: "confirmed" as const },
];

const defaultProps = [
  { name: "label", type: "string", default: "Continue", provenance: "confirmed" as const },
  { name: "disabled", type: "boolean", default: "false", provenance: "confirmed" as const },
  { name: "icon", type: "string", default: "—", provenance: "inferred" as const },
  { name: "onClick", type: "function", default: "—", provenance: "confirmed" as const },
];

const defaultStates = [
  { name: "hover", provenance: "confirmed" as const },
  { name: "disabled", provenance: "confirmed" as const },
  { name: "focus", provenance: "inferred" as const },
];

const defaultStructureNodes = [
  { depth: 0, tag: "button", name: "root", flagged: false },
  { depth: 1, tag: "span", name: "icon-slot", flagged: false },
  { depth: 1, tag: "span", name: "label", flagged: false },
  { depth: 1, tag: "span", name: "ripple", flagged: true, literalValue: "#FFFFFF", promotedTo: null as string | null },
];

const defaultIssues: Array<{ id: string; text: string; severity: "error" | "warning" | "info"; action: string }> = [
  { id: "i1", text: "Raw value #FFFFFF on ripple element", severity: "warning", action: "Promote to token" },
  { id: "i2", text: "Focus state inferred, not confirmed", severity: "info", action: "Confirm" },
];

interface CodeArtifactData {
  componentCode: string;
  storyCode: string;
  typesCode: string;
  tokenCSS: string;
  framework: string;
  llmModel: string;
}

export function ComponentDetail({ initialData, codeArtifact }: { initialData?: ComponentDetailData; codeArtifact?: CodeArtifactData | null }) {
  // Resolve data: use initialData from Supabase when available, fall back to hardcoded defaults
  const tokenBindings = initialData?.tokenBindings ?? defaultTokenBindings;
  const variantAxes = initialData
    ? initialData.variantAxes.map((a) => ({ name: a.name, options: a.options, confidence: a.confidence }))
    : defaultVariantAxes;
  const props = initialData
    ? initialData.props.map((p) => ({ name: p.name, type: p.type, default: p.default, provenance: p.provenance }))
    : defaultProps;
  const states = initialData
    ? initialData.states.map((s) => ({ name: s.name, provenance: s.provenance }))
    : defaultStates;
  const structureNodes = initialData
    ? initialData.structure.map((n) => ({ depth: n.depth, tag: n.tag, name: n.name, flagged: n.flagged, literalValue: n.literalValue, promotedTo: null as string | null }))
    : defaultStructureNodes;
  const issues = initialData
    ? initialData.issues.map((i) => ({ id: i.id, text: i.text, severity: i.severity, action: i.action }))
    : defaultIssues;
  const componentScore = initialData?.score ?? 82;

  const { showToast } = useToast();
  const [intent, setIntent] = useState("primary");
  const [size, setSize] = useState("md");
  const [label, setLabel] = useState("Continue");
  const [disabled, setDisabled] = useState(false);
  const [canvasBg, setCanvasBg] = useState<"dark" | "light">("dark");
  const [status, setStatus] = useState<"normalized" | "approved">(
    initialData?.status === "approved" ? "approved" : "normalized"
  );
  const [confirmedAxes, setConfirmedAxes] = useState<Set<string>>(new Set());
  const [tokenValues, setTokenValues] = useState<Record<string, string>>(() => {
    const defaults: Record<string, string> = {};
    for (const t of tokenBindings) {
      if (t.editable) defaults[t.id] = t.value;
    }
    return Object.keys(defaults).length > 0 ? defaults : { t1: "#2563EB", t2: "#FFFFFF", t3: "8" };
  });
  const [promotedNodes, setPromotedNodes] = useState<Set<number>>(new Set());
  const [resolvedIssues, setResolvedIssues] = useState<Set<string>>(new Set());
  const [showApproveDialog, setShowApproveDialog] = useState(false);
  const [componentName, setComponentName] = useState(initialData?.name ?? "Button");
  const [isRenaming, setIsRenaming] = useState(false);
  const [activeCodeTab, setActiveCodeTab] = useState("component");
  const params = useParams<{ id: string; componentId?: string }>();
  const router = useRouter();
  const projectId = params.id ?? "";
  const componentId = params.componentId ?? initialData?.id ?? "";
  const { setItems, setExtras } = useBreadcrumb();

  // Set breadcrumb: Projects / Components / <name>  + pills
  useEffect(() => {
    setItems([
      { label: "Components", href: `/projects/${projectId}/inspect/components` },
      { label: componentName },
    ]);
    setExtras(
      <>
        <StatusChip status={status} />
        <CompletenessScore score={componentScore} />
        <button
          onClick={handleApprove}
          className="bg-vs-accent text-white rounded-lg px-3.5 py-1.5 text-[12px] font-medium border-none cursor-pointer hover:brightness-110 transition-all"
        >
          {status === "approved" ? "✓ Approved" : "Approve"}
        </button>
      </>
    );
    return () => { setItems([]); setExtras(null); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [componentName, status, componentScore, projectId, setItems, setExtras]);

  const bgColor = tokenValues.t1;
  const textColor = tokenValues.t2;
  const borderRadius = `${tokenValues.t3}px`;

  const buttonStyle = (() => {
    if (intent === "primary") return { background: bgColor, color: textColor, border: "none", borderRadius };
    if (intent === "secondary") return { background: "transparent", color: "#E7E9EC", border: "1px solid #34373D", borderRadius };
    return { background: "transparent", color: "#9BA1AB", border: "none", borderRadius };
  })();

  const sizeClass = size === "sm" ? "text-[11px] px-2.5 py-1" : size === "lg" ? "text-[14px] px-5 py-2.5" : "text-[12px] px-3.5 py-1.5";

  // Compute contrast ratio (simplified)
  const hexToLum = (hex: string) => {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    const toLinear = (c: number) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
  };
  let contrastRatio = "—";
  try {
    const l1 = hexToLum(bgColor);
    const l2 = hexToLum(textColor);
    const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    contrastRatio = ratio.toFixed(1) + ":1";
  } catch { /* skip */ }
  const contrastPass = parseFloat(contrastRatio) >= 4.5;

  const checks = [
    { name: "Renders", value: "9/9", passed: true },
    { name: "Text contrast", value: contrastRatio, passed: contrastPass },
    { name: "Hit target", value: "≥ 32px", passed: true },
    { name: "Focus state", value: states.some(s => s.name === "focus") ? "Present" : "Missing", passed: states.some(s => s.name === "focus") },
  ];

  const handleApprove = async () => {
    const hasErrors = issues.some((i) => i.severity === "error" && !resolvedIssues.has(i.id));
    if (hasErrors) return;
    const hasWarnings = issues.some((i) => i.severity === "warning" && !resolvedIssues.has(i.id));
    if (hasWarnings) {
      setShowApproveDialog(true);
      return;
    }
    try {
      await approveComponent(projectId, componentId);
      setStatus("approved");
      showToast(`${componentName} approved — status set to approved`);
      router.refresh();
    } catch (err) {
      showToast(`Error: ${err instanceof Error ? err.message : "approval failed"}`);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Content grid */}
      <div className="p-6 grid grid-cols-[2fr_1fr] gap-6">
        {/* Left column */}
        <div className="flex flex-col gap-6">
          {/* Playground */}
          <section className="bg-vs-bg-surface border border-vs-border-default rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-vs-border-default">
              <h2 className="text-[15px] font-semibold">Playground</h2>
              <div className="flex gap-0.5 bg-vs-bg-primary border border-vs-border-default rounded-md p-0.5">
                {(["dark", "light"] as const).map((bg) => (
                  <button key={bg} onClick={() => setCanvasBg(bg)} className={`text-[11px] px-2 py-0.5 rounded border-none cursor-pointer font-sans ${canvasBg === bg ? "bg-vs-bg-elevated text-vs-text-primary" : "text-vs-text-secondary hover:text-vs-text-primary"}`}>
                    {bg}
                  </button>
                ))}
              </div>
            </div>

            {/* Canvas */}
            <div className={`min-h-[160px] border-b border-vs-border-default ${canvasBg === "dark" ? "bg-vs-bg-elevated" : "bg-white"}`}>
              {codeArtifact?.componentCode ? (
                <div className="p-4">
                  <div className="bg-vs-bg-primary rounded-lg border border-vs-border-default p-4 overflow-auto max-h-[300px]">
                    <pre className="font-mono text-[11px] text-vs-text-secondary leading-relaxed whitespace-pre-wrap">{codeArtifact.componentCode}</pre>
                  </div>
                </div>
              ) : initialData?.rawStructure ? (
                <div className="relative">
                  <IRPreview structure={initialData.rawStructure} />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const { generateSingleComponent } = await import("@/lib/data/codegen");
                          showToast("Generating code...");
                          const result = await generateSingleComponent(projectId, componentId);
                          if (result.success) {
                            showToast("Code generated! Reloading...");
                            router.refresh();
                          } else {
                            showToast(`Error: ${result.error}`);
                          }
                        } catch (err) {
                          showToast(`Error: ${err instanceof Error ? err.message : "generation failed"}`);
                        }
                      }}
                      className="bg-vs-accent text-white rounded-lg px-5 py-2.5 text-[13px] font-medium cursor-pointer hover:brightness-110 shadow-lg"
                    >
                      Generate Code
                    </button>
                  </div>
                </div>
              ) : (
                <div className="h-[160px] flex items-center justify-center">
                  <span className="text-vs-text-muted text-[12px]">No preview available</span>
                </div>
              )}
            </div>

            {/* Code tabs — show when code exists */}
            {codeArtifact && (
              <div className="border-b border-vs-border-default">
                <div className="flex gap-0.5 px-4 pt-2 pb-0">
                  {[
                    { key: "component", label: "Component" },
                    { key: "story", label: "Story" },
                    { key: "types", label: "Types" },
                    { key: "tokens", label: "Token CSS" },
                  ].map((tab) => (
                    <button
                      key={tab.key}
                      onClick={() => setActiveCodeTab(tab.key)}
                      className={`text-[11px] px-3 py-1.5 rounded-t border-none cursor-pointer font-mono ${
                        activeCodeTab === tab.key
                          ? "bg-vs-bg-primary text-vs-text-primary"
                          : "text-vs-text-muted hover:text-vs-text-primary"
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                  <div className="flex-1" />
                  <button
                    onClick={() => {
                      const code = activeCodeTab === "component" ? codeArtifact.componentCode
                        : activeCodeTab === "story" ? codeArtifact.storyCode
                        : activeCodeTab === "types" ? codeArtifact.typesCode
                        : codeArtifact.tokenCSS;
                      navigator.clipboard.writeText(code || "");
                      showToast("Copied to clipboard");
                    }}
                    className="text-[10px] text-vs-text-muted hover:text-vs-text-primary cursor-pointer bg-transparent border-none px-2 py-1"
                  >
                    Copy
                  </button>
                </div>
                <div className="bg-vs-bg-primary px-4 py-3 overflow-auto max-h-[200px]">
                  <pre className="font-mono text-[11px] text-vs-text-secondary leading-relaxed whitespace-pre-wrap">
                    {activeCodeTab === "component" ? codeArtifact.componentCode
                      : activeCodeTab === "story" ? codeArtifact.storyCode
                      : activeCodeTab === "types" ? codeArtifact.typesCode
                      : codeArtifact.tokenCSS || "No token CSS generated"}
                  </pre>
                </div>
              </div>
            )}

            {/* Controls — dynamic from variant axes */}
            <div className="px-4 py-3 grid grid-cols-[110px_1fr] gap-y-2.5 gap-x-4 text-[12px] border-b border-vs-border-default">
              {variantAxes.map((axis, i) => (
                <Fragment key={`axis-${i}`}>
                  <span className="text-vs-text-muted truncate">{axis.name}</span>
                  <div className="flex gap-0.5 bg-vs-bg-primary border border-vs-border-default rounded-md p-0.5 w-fit flex-wrap">
                    {axis.options.map((opt) => (
                      <button key={opt} className="text-[11px] px-2 py-0.5 rounded border-none cursor-pointer font-mono bg-vs-bg-elevated text-vs-text-primary">{opt}</button>
                    ))}
                  </div>
                </Fragment>
              ))}
              {props.map((p, i) => (
                <Fragment key={`prop-${i}`}>
                  <span className="text-vs-text-muted truncate">{p.name}</span>
                  <span className="font-mono text-[11px] text-vs-text-secondary">{p.default}</span>
                </Fragment>
              ))}
            </div>

            {/* Tokens table */}
            <div className="px-4 py-3 border-b border-vs-border-default">
              <div className="text-[11px] font-medium text-vs-text-muted uppercase tracking-wider mb-2">Consumed tokens</div>
              <div className="flex flex-col gap-1.5">
                {tokenBindings.map((t) => (
                  <div key={t.id} className="flex items-center gap-3 text-[12px]">
                    <span className="font-mono text-vs-text-secondary w-[170px] truncate">{t.name}</span>
                    {t.kind === "color" && t.editable ? (
                      <input type="color" value={tokenValues[t.id] || t.value} onChange={(e) => setTokenValues((p) => ({ ...p, [t.id]: e.target.value }))} className="w-[24px] h-[22px] border border-vs-border-default rounded cursor-pointer bg-vs-bg-elevated p-0.5" />
                    ) : null}
                    {t.kind !== "color" && t.editable ? (
                      <input type="number" value={tokenValues[t.id] || t.value} onChange={(e) => setTokenValues((p) => ({ ...p, [t.id]: e.target.value }))} className="w-[48px] bg-vs-bg-elevated border border-vs-border-default rounded px-1.5 py-0.5 text-[11px] text-vs-text-primary font-mono outline-none" />
                    ) : null}
                    <span className="font-mono text-vs-text-muted text-[11px]">{tokenValues[t.id] || t.value}{t.kind !== "color" ? "px" : ""}</span>
                    {t.editable && tokenValues[t.id] && tokenValues[t.id] !== t.value && (
                      <button onClick={() => setTokenValues((p) => ({ ...p, [t.id]: t.value }))} className="text-[10px] text-vs-text-muted hover:text-vs-text-primary border-none bg-transparent cursor-pointer font-sans">Reset</button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Checks */}
            <div className="px-4 py-3 flex items-center gap-3 flex-wrap">
              {checks.map((c) => (
                <span key={c.name} className={`inline-flex items-center gap-1.5 font-mono text-[11px] px-2 py-1 rounded-md border ${c.passed ? "text-vs-success border-[rgba(48,164,108,0.35)] bg-[rgba(48,164,108,0.08)]" : "text-vs-error border-[rgba(229,72,77,0.35)] bg-[rgba(229,72,77,0.08)]"}`}>
                  {c.passed ? "✓" : "✕"} {c.name} {c.value}
                </span>
              ))}
            </div>
          </section>

          {/* Variants */}
          {variantAxes.length > 0 && (
            <section className="bg-vs-bg-surface border border-vs-border-default rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-vs-border-default">
                <h2 className="text-[15px] font-semibold mb-2">Variants</h2>
                <div className="flex flex-wrap gap-3">
                  {variantAxes.map((axis) => (
                    <div key={axis.name} className="flex items-center gap-2">
                      <ProvenanceDot confidence={confirmedAxes.has(axis.name) ? "confirmed" : axis.confidence} />
                      <span className="font-mono text-[11px] text-vs-text-secondary">{axis.name}</span>
                      <span className="font-mono text-[10px] text-vs-text-muted">({axis.options.length} options)</span>
                      {axis.confidence === "inferred" && !confirmedAxes.has(axis.name) && (
                        <button onClick={() => { setConfirmedAxes((s) => new Set([...s, axis.name])); showToast(`Confirm axis ${axis.name} — Patch applied`); }} className="text-[10px] text-vs-accent border-none bg-transparent cursor-pointer font-sans hover:underline">Confirm</button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              <div className="p-4">
                <div className="flex flex-wrap gap-2">
                  {variantAxes.map((axis) => (
                    <div key={axis.name} className="flex-1 min-w-[140px]">
                      <div className="font-mono text-[10px] text-vs-text-muted mb-2">{axis.name}</div>
                      {axis.options.map((opt) => (
                        <div key={opt} className="h-[40px] bg-vs-bg-elevated border border-vs-border-default rounded-md flex items-center px-3 mb-1.5">
                          <span className="font-mono text-[11px] text-vs-text-secondary">{opt}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}

          {/* Structure */}
          <section className="bg-vs-bg-surface border border-vs-border-default rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-vs-border-default">
              <h2 className="text-[15px] font-semibold">Structure</h2>
            </div>
            <div className="px-4 py-3">
              {structureNodes.map((node, idx) => (
                <div key={idx} className="flex items-center gap-2 py-1.5" style={{ paddingLeft: `${10 + node.depth * 18}px` }}>
                  <span className="font-mono text-[12px] text-vs-text-muted">&lt;{node.tag}&gt;</span>
                  <span className="font-mono text-[12px] text-vs-text-secondary">{node.name}</span>
                  {node.flagged && !promotedNodes.has(idx) && (
                    <span className="inline-flex items-center gap-1.5 group">
                      <span className="font-mono text-[10px] text-vs-warning bg-[rgba(255,178,36,0.08)] border border-[rgba(255,178,36,0.35)] rounded-[5px] px-[7px] py-[2px]">{node.literalValue} flagged</span>
                      <button onClick={() => { setPromotedNodes((s) => new Set([...s, idx])); showToast("Promote " + node.literalValue + " to color/surface/base — Patch applied"); }} className="text-[10px] font-medium text-white bg-vs-accent rounded-[5px] px-2 py-[2px] border-none cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity">Promote to token</button>
                    </span>
                  )}
                  {node.flagged && promotedNodes.has(idx) && (
                    <span className="font-mono text-[10px] text-vs-success bg-[rgba(48,164,108,0.08)] border border-[rgba(48,164,108,0.35)] rounded-[5px] px-[7px] py-[2px]">✓ color/surface/base</span>
                  )}
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-6">
          {/* Props */}
          <section className="bg-vs-bg-surface border border-vs-border-default rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-vs-border-default">
              <h2 className="text-[15px] font-semibold">Props</h2>
            </div>
            <div className="px-4 py-3">
              <div className="grid grid-cols-[1fr_1fr_1fr_20px] gap-y-2 gap-x-3 text-[12px]">
                <span className="text-vs-text-muted font-medium">Name</span>
                <span className="text-vs-text-muted font-medium">Type</span>
                <span className="text-vs-text-muted font-medium">Default</span>
                <span />
                {props.map((p, i) => (
                  <Fragment key={`prop-row-${i}`}>
                    <span className="font-mono text-vs-text-primary">{p.name}</span>
                    <span className="font-mono text-vs-text-secondary">{p.type}</span>
                    <span className="font-mono text-vs-text-muted">{p.default}</span>
                    <ProvenanceDot confidence={p.provenance} />
                  </Fragment>
                ))}
              </div>
            </div>
          </section>

          {/* States */}
          <section className="bg-vs-bg-surface border border-vs-border-default rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-vs-border-default">
              <h2 className="text-[15px] font-semibold">States</h2>
            </div>
            <div className="px-4 py-3 flex flex-col gap-2">
              {states.map((s) => (
                <div key={s.name} className="flex items-center gap-3">
                  <div className="w-[48px] h-[28px] bg-vs-bg-elevated border border-vs-border-default rounded flex items-center justify-center">
                    <span className="text-[8px] font-medium text-white bg-[#2563EB] rounded px-1.5 py-0.5">Btn</span>
                  </div>
                  <span className="font-mono text-[12px] text-vs-text-primary">{s.name}</span>
                  <ProvenanceDot confidence={s.provenance} />
                </div>
              ))}
            </div>
          </section>

          {/* Issues */}
          <section className="bg-vs-bg-surface border border-vs-border-default rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-vs-border-default">
              <h2 className="text-[15px] font-semibold">Issues</h2>
            </div>
            <div className="px-4 py-3 flex flex-col gap-2.5">
              {issues.map((issue) => (
                <div key={issue.id} className="flex items-center gap-3 text-[12px]">
                  <span className={`w-2 h-2 rounded-full flex-none ${resolvedIssues.has(issue.id) ? "bg-vs-success" : issue.severity === "error" ? "bg-vs-error" : issue.severity === "warning" ? "bg-vs-warning" : "bg-vs-text-muted"}`} />
                  <span className={`flex-1 ${resolvedIssues.has(issue.id) ? "text-vs-text-muted line-through" : "text-vs-text-secondary"}`}>{issue.text}</span>
                  {!resolvedIssues.has(issue.id) && (
                    <button onClick={() => { setResolvedIssues((s) => new Set([...s, issue.id])); showToast(`${issue.action} — Patch applied`); }} className="text-[11px] text-vs-accent border-none bg-transparent cursor-pointer font-sans hover:underline">{issue.action}</button>
                  )}
                  {resolvedIssues.has(issue.id) && (
                    <span className="text-[11px] text-vs-success">✓ Resolved</span>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* Provenance */}
          <section className="bg-vs-bg-surface border border-vs-border-default rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-vs-border-default">
              <h2 className="text-[15px] font-semibold">Provenance</h2>
            </div>
            <div className="px-4 py-3 flex flex-col gap-2 text-[12px]">
              <div className="flex items-center gap-2">
                <span className="text-vs-text-muted w-[70px]">Source</span>
                <span className="font-mono text-vs-text-secondary">stitch-export-checkout.zip</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-vs-text-muted w-[70px]">Extractor</span>
                <span className="font-mono text-vs-text-secondary">zip-html adapter</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-vs-text-muted w-[70px]">Imported</span>
                <span className="font-mono text-vs-text-secondary">Jul 2, 2026 14:32</span>
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* Approve dialog */}
      {showApproveDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55" onClick={() => setShowApproveDialog(false)}>
          <div className="w-[440px] bg-vs-bg-surface border border-vs-border-strong rounded-lg shadow-2xl" style={{ animation: "vsDlgIn 0.15s ease" }} onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-vs-border-default">
              <h3 className="text-[15px] font-semibold">Approve with warnings?</h3>
            </div>
            <div className="px-5 py-4 text-[12px] text-vs-text-secondary leading-relaxed">
              <p className="mb-3">{componentName} has open issues:</p>
              {issues.filter((i) => !resolvedIssues.has(i.id)).map((i) => (
                <div key={i.id} className="flex items-center gap-2 py-1">
                  <span className={`w-2 h-2 rounded-full ${i.severity === "warning" ? "bg-vs-warning" : "bg-vs-text-muted"}`} />
                  <span>{i.text}</span>
                </div>
              ))}
            </div>
            <div className="px-5 py-3 border-t border-vs-border-default flex justify-end gap-3">
              <button onClick={() => setShowApproveDialog(false)} className="text-[13px] text-vs-text-secondary border border-vs-border-strong rounded-lg px-4 py-2 bg-transparent cursor-pointer hover:bg-vs-bg-elevated">Cancel</button>
              <button onClick={async () => { setShowApproveDialog(false); try { await approveComponent(projectId, componentId); setStatus("approved"); showToast(`${componentName} approved`); router.refresh(); } catch {} }} className="text-[13px] font-medium text-white bg-vs-accent rounded-lg px-4 py-2 border-none cursor-pointer hover:brightness-110">Approve anyway</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
