"use client";

import {
  useState,
  useCallback,
  useRef,
  useEffect,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { CompletenessScore } from "@/components/ui/completeness-score";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────

type Lens = "Component" | "Token";
type Variant = "primary" | "secondary" | "ghost";
type TokenKindLocal = "color" | "radius" | "type" | "spacing";

interface TokenNode {
  key: string;
  top: number;
  cy: number;
  name: string;
  value: string;
  kind: TokenKindLocal;
  prov: string;
}

interface HandleDef {
  key: string;
  label: string;
  y: number;
}

interface Thumbnail {
  top: number;
  name: string;
  prop: string;
  score: number;
  scoreColor: string;
  type: "button" | "card" | "input" | "badge";
}

// ─── Data ────────────────────────────────────────────────────────────────

const tokens: TokenNode[] = [
  { key: "p500", top: 120, cy: 152, name: "color/primary/500", value: "#2563EB", kind: "color", prov: "#30A46C" },
  { key: "p600", top: 200, cy: 232, name: "color/primary/600", value: "#1D4ED8", kind: "color", prov: "#FFB224" },
  { key: "rmd",  top: 280, cy: 312, name: "radius/md",         value: "8px",     kind: "radius", prov: "#30A46C" },
  { key: "body", top: 360, cy: 392, name: "type/body",         value: "Geist 14/20", kind: "type", prov: "#30A46C" },
  { key: "sp2",  top: 440, cy: 472, name: "spacing/2",         value: "8px",     kind: "spacing", prov: "#30A46C" },
];

const handles: HandleDef[] = [
  { key: "background",  label: "background",  y: 200 },
  { key: "textcolor",   label: "text color",  y: 256 },
  { key: "radius",      label: "radius",      y: 312 },
  { key: "typography",  label: "typography",   y: 368 },
  { key: "gap",         label: "gap",          y: 424 },
];

const thumbs: Thumbnail[] = [
  { top: 80,  name: "Button", prop: "meta text",    score: 82, scoreColor: "#30A46C", type: "button" },
  { top: 200, name: "Card",   prop: "border",       score: 74, scoreColor: "#FFB224", type: "card" },
  { top: 320, name: "Input",  prop: "placeholder",  score: 68, scoreColor: "#FFB224", type: "input" },
  { top: 440, name: "Badge",  prop: "text",         score: 91, scoreColor: "#30A46C", type: "badge" },
];

// ─── Helpers ─────────────────────────────────────────────────────────────

function bezierPath(x1: number, y1: number, x2: number, y2: number): string {
  const dx = Math.max(50, (x2 - x1) / 2);
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}

// ─── Token Swatch Icon ──────────────────────────────────────────────────

function TokenIcon({ kind, value }: { kind: TokenKindLocal; value: string }) {
  if (kind === "color") {
    return (
      <span
        className="w-[18px] h-[18px] rounded-[5px] flex-none border border-vs-border-strong"
        style={{ backgroundColor: value }}
      />
    );
  }
  if (kind === "type") {
    return (
      <span className="w-[18px] h-[18px] rounded-[5px] flex-none bg-vs-bg-elevated border border-vs-border-strong flex items-center justify-center">
        <span className="font-sans text-[9px] text-vs-text-secondary leading-none">Ag</span>
      </span>
    );
  }
  if (kind === "spacing") {
    return (
      <span className="w-[18px] h-[18px] rounded-[5px] flex-none bg-vs-bg-elevated border border-vs-border-strong flex items-center justify-center">
        <span className="w-[9px] h-[2px] bg-vs-text-secondary rounded-sm" />
      </span>
    );
  }
  // radius
  return (
    <span className="w-[18px] h-[18px] rounded-[5px] flex-none bg-vs-bg-elevated border border-vs-border-strong flex items-center justify-center">
      <span
        className="w-[9px] h-[9px] border-vs-text-secondary"
        style={{
          borderWidth: "1.5px",
          borderStyle: "solid",
          borderRadius: "3px 1px 1px 1px",
          borderColor: "var(--color-vs-text-secondary, #9BA1AB)",
        }}
      />
    </span>
  );
}

// ─── Component Lens: Token Node ─────────────────────────────────────────

function TokenNodeCard({
  token,
  dragging,
  isCurrentBgSource,
  isDragCompatible,
  onMouseUp,
}: {
  token: TokenNode;
  dragging: boolean;
  isCurrentBgSource: boolean;
  isDragCompatible: boolean;
  onMouseUp: () => void;
}) {
  const isColorToken = token.kind === "color";
  const socketColor = isCurrentBgSource ? "rgba(37,99,235,0.9)" : "#6B7280";

  const showIncompatibleTooltip = dragging && !isDragCompatible && token.kind !== "color";

  return (
    <div
      className={cn(
        "absolute left-[60px] w-[210px] h-[64px] bg-vs-bg-surface border rounded-md flex items-center gap-2.5 px-3 transition-all duration-200",
        dragging && isDragCompatible
          ? "border-vs-accent"
          : "border-vs-border-default",
        dragging && !isDragCompatible && "opacity-40",
      )}
      style={{
        top: token.top,
        ...(dragging && isDragCompatible
          ? { boxShadow: "0 0 0 3px rgba(124,111,240,0.2)" }
          : {}),
      }}
      onMouseUp={isColorToken ? onMouseUp : undefined}
    >
      <TokenIcon kind={token.kind} value={token.value} />
      <div className="flex-1 min-w-0 flex flex-col">
        <span className="font-mono text-[11px] text-vs-text-primary truncate">{token.name}</span>
        <span className="font-mono text-[11px] text-vs-text-secondary">{token.value}</span>
      </div>
      <span
        className="w-[7px] h-[7px] rounded-full flex-none"
        style={{ backgroundColor: token.prov }}
      />
      {/* Output socket */}
      <span
        className="absolute right-[-5px] top-[27px] w-2.5 h-2.5 rounded-full bg-vs-bg-primary"
        style={{ borderWidth: "1.5px", borderStyle: "solid", borderColor: socketColor }}
      />
      {/* Incompatible tooltip */}
      {showIncompatibleTooltip && (
        <div className="absolute left-1/2 -translate-x-1/2 -bottom-9 bg-vs-bg-elevated border border-vs-border-strong rounded-md px-2 py-1 text-[11px] text-vs-text-secondary whitespace-nowrap z-20">
          {token.name} is not a color
        </div>
      )}
    </div>
  );
}

// ─── Component Lens: Component Node ─────────────────────────────────────

function ComponentNode({
  variant,
  setVariant,
  bgColor,
  promoted,
  flagHover,
  setFlagHover,
  onPromote,
  onDragStart,
}: {
  variant: Variant;
  setVariant: (v: Variant) => void;
  bgColor: string;
  promoted: boolean;
  flagHover: boolean;
  setFlagHover: (v: boolean) => void;
  onPromote: () => void;
  onDragStart: (e: ReactMouseEvent) => void;
}) {
  const previewBg =
    variant === "primary"
      ? bgColor
      : variant === "secondary"
        ? "transparent"
        : "transparent";

  const previewText =
    variant === "primary"
      ? "text-white"
      : variant === "secondary"
        ? "text-vs-text-primary"
        : "text-vs-text-secondary";

  const previewBorder =
    variant === "secondary"
      ? "border border-vs-border-strong"
      : variant === "ghost"
        ? ""
        : "";

  return (
    <div
      className="absolute w-[360px] h-[360px] bg-vs-bg-surface border border-vs-border-strong rounded-lg"
      style={{ left: 600, top: 140 }}
    >
      {/* Input handles */}
      {handles.map((h) => (
        <div
          key={h.key}
          className="absolute flex items-center gap-2"
          style={{ left: -5, top: h.y - 140 }}
        >
          {/* Socket */}
          <span
            className={cn(
              "w-2.5 h-2.5 rounded-full bg-vs-bg-primary border-[1.5px]",
              h.key === "background" ? "border-[rgba(37,99,235,0.9)] cursor-grab" : "border-vs-border-strong",
            )}
            onMouseDown={h.key === "background" ? onDragStart : undefined}
          />
          {/* Label */}
          <span className="font-mono text-[10px] text-vs-text-secondary whitespace-nowrap">
            {h.label}
          </span>

          {/* Flagged literal chip for text color */}
          {h.key === "textcolor" && !promoted && (
            <div
              className="relative flex items-center gap-1.5"
              onMouseEnter={() => setFlagHover(true)}
              onMouseLeave={() => setFlagHover(false)}
            >
              <span
                className="font-mono text-[10px] rounded-[5px] px-[7px] py-[2px]"
                style={{
                  color: "#FFB224",
                  backgroundColor: "rgba(255,178,36,0.08)",
                  border: "1px solid rgba(255,178,36,0.35)",
                }}
              >
                #FFFFFF flagged
              </span>
              {flagHover && (
                <button
                  type="button"
                  onClick={onPromote}
                  className="bg-vs-accent text-white rounded-[5px] px-2 py-[2px] text-[10px] font-medium cursor-pointer hover:opacity-90 transition-opacity whitespace-nowrap"
                >
                  Promote to token
                </button>
              )}
            </div>
          )}

          {h.key === "textcolor" && promoted && (
            <span
              className="font-mono text-[10px] rounded-[5px] px-[7px] py-[2px]"
              style={{
                color: "#30A46C",
                backgroundColor: "rgba(48,164,108,0.08)",
                border: "1px solid rgba(48,164,108,0.35)",
              }}
            >
              ✓ color/surface/base
            </span>
          )}
        </div>
      ))}

      {/* Node inner content */}
      <div className="absolute flex flex-col gap-3" style={{ left: 130, top: 16, right: 16, bottom: 16 }}>
        {/* Variant selector */}
        <SegmentedControl
          options={["primary", "secondary", "ghost"]}
          value={variant}
          onChange={(v) => setVariant(v as Variant)}
          size="sm"
        />

        {/* Preview area */}
        <div className="flex-1 bg-vs-bg-elevated border border-vs-border-default rounded-md flex items-center justify-center">
          <button
            type="button"
            className={cn(
              "rounded-lg px-3.5 py-1.5 text-[12px] font-medium cursor-default",
              previewText,
              previewBorder,
            )}
            style={variant === "primary" ? { backgroundColor: previewBg } : undefined}
          >
            Continue
          </button>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2">
          <span className="font-mono text-[11px] text-vs-text-secondary">Button · 82</span>
          <CompletenessScore score={82} className="text-[10px] px-[7px] py-px" />
          <span className="text-vs-accent text-[11px] cursor-pointer hover:underline ml-auto">Open</span>
        </div>
      </div>
    </div>
  );
}

// ─── Token Lens: Central Token Node ─────────────────────────────────────

function CentralTokenNode({ color }: { color: string }) {
  return (
    <div
      className="absolute w-[220px] h-[72px] bg-vs-bg-surface border border-vs-border-strong rounded-lg flex items-center gap-2.5 px-3.5"
      style={{
        left: 60,
        top: 268,
        boxShadow: "0 0 0 3px rgba(124,111,240,0.15)",
      }}
    >
      {/* Color swatch */}
      <span
        className="w-[20px] h-[20px] rounded-[5px] flex-none border border-vs-border-strong"
        style={{ backgroundColor: color }}
      />
      <div className="flex-1 min-w-0 flex flex-col">
        <span className="font-mono text-[11px] text-vs-text-primary truncate">color/neutral/500</span>
        <span className="font-mono text-[11px] text-vs-text-secondary">{color} · 22 uses</span>
      </div>
      {/* Provenance dot */}
      <span className="w-[7px] h-[7px] rounded-full flex-none" style={{ backgroundColor: "#FFB224" }} />
      {/* Output socket */}
      <span
        className="absolute right-[-5px] top-[31px] w-2.5 h-2.5 rounded-full bg-vs-bg-primary"
        style={{ borderWidth: "1.5px", borderStyle: "solid", borderColor: "rgba(37,99,235,0.9)" }}
      />
    </div>
  );
}

// ─── Token Lens: Thumbnail Card ─────────────────────────────────────────

function ThumbnailCard({ thumb }: { thumb: Thumbnail }) {
  return (
    <div
      className="absolute w-[220px] h-[88px] bg-vs-bg-surface border border-vs-border-default rounded-lg flex flex-col overflow-hidden hover:border-vs-border-strong transition-colors"
      style={{ left: 620, top: thumb.top }}
    >
      {/* Input socket */}
      <span
        className="absolute left-[-5px] top-[39px] w-2.5 h-2.5 rounded-full bg-vs-bg-primary"
        style={{ borderWidth: "1.5px", borderStyle: "solid", borderColor: "#6B7280" }}
      />

      {/* Preview area */}
      <div className="flex-1 bg-vs-bg-elevated flex items-center justify-center border-b border-vs-border-default">
        {thumb.type === "button" && (
          <span className="bg-vs-info text-white rounded-md px-2.5 py-1 text-[10px] font-medium">
            Continue
          </span>
        )}
        {thumb.type === "card" && (
          <span className="w-[64px] h-[34px] bg-white border border-vs-border-default rounded-[5px]" />
        )}
        {thumb.type === "input" && (
          <span className="w-[80px] h-[22px] bg-white border border-vs-border-default rounded flex items-center px-1.5">
            <span className="text-[8px] text-gray-400">placeholder</span>
          </span>
        )}
        {thumb.type === "badge" && (
          <span className="font-mono text-[9px] text-vs-text-secondary border border-vs-border-strong rounded-full px-2 py-0.5">
            Badge
          </span>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center gap-2 px-2.5 py-1.5">
        <span className="text-[11px] font-medium text-vs-text-primary">{thumb.name}</span>
        <span className="font-mono text-[10px] text-vs-text-muted">{thumb.prop}</span>
        <span
          className="font-mono text-[10px] font-medium border border-vs-border-strong bg-vs-bg-elevated rounded-full px-[7px] py-px ml-auto"
          style={{ color: thumb.scoreColor }}
        >
          {thumb.score}%
        </span>
      </div>
    </div>
  );
}

// ─── Token Lens: Detail Panel ───────────────────────────────────────────

function TokenDetailPanel({
  color,
  onColorChange,
}: {
  color: string;
  onColorChange: (c: string) => void;
}) {
  return (
    <div className="absolute top-4 right-4 z-10 w-[260px] bg-vs-bg-surface border border-vs-border-default rounded-lg p-3.5 flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-semibold text-vs-text-primary">Token details</span>
        <span className="font-mono text-[10px] text-vs-text-muted border border-vs-border-strong rounded-full px-2 py-0.5">
          Color
        </span>
      </div>

      {/* Token name */}
      <span className="font-mono text-[12px] text-vs-text-primary">color/neutral/500</span>

      {/* Color picker + hex */}
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={color}
          onChange={(e) => onColorChange(e.target.value)}
          className="w-8 h-8 rounded-md border border-vs-border-default cursor-pointer bg-transparent p-0"
        />
        <input
          type="text"
          value={color}
          onChange={(e) => onColorChange(e.target.value)}
          className="flex-1 bg-vs-bg-primary border border-vs-border-default rounded-md text-[12px] text-vs-text-primary font-mono px-2.5 py-1.5 focus:border-vs-accent focus:shadow-[0_0_0_2px_rgba(124,111,240,0.25)] outline-none transition-colors"
        />
      </div>

      {/* Provenance */}
      <div className="flex items-center gap-2">
        <span className="w-[7px] h-[7px] rounded-full flex-none" style={{ backgroundColor: "#FFB224" }} />
        <span className="text-[11px] text-vs-text-secondary">
          Inferred by VortSpec from stitch-export.zip
        </span>
      </div>

      {/* Help text */}
      <p className="text-[11px] text-vs-text-muted leading-relaxed">
        Edits ripple to the 4 connected components instantly.
      </p>
    </div>
  );
}

// ─── Zoom Controls ──────────────────────────────────────────────────────

function ZoomControls({
  scale,
  onZoomIn,
  onZoomOut,
  onFitView,
}: {
  scale: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitView: () => void;
}) {
  return (
    <div className="absolute bottom-4 right-4 z-10 bg-vs-bg-surface border border-vs-border-default rounded-lg p-0.5 flex gap-0.5">
      <button
        type="button"
        onClick={onZoomOut}
        className="w-7 h-[26px] rounded-md hover:bg-vs-bg-elevated flex items-center justify-center text-vs-text-secondary cursor-pointer text-[14px]"
      >
        −
      </button>
      <span className="w-10 h-[26px] flex items-center justify-center font-mono text-[11px] text-vs-text-muted">
        {Math.round(scale * 100)}%
      </span>
      <button
        type="button"
        onClick={onZoomIn}
        className="w-7 h-[26px] rounded-md hover:bg-vs-bg-elevated flex items-center justify-center text-vs-text-secondary cursor-pointer text-[14px]"
      >
        +
      </button>
      <button
        type="button"
        onClick={onFitView}
        className="h-[26px] rounded-md hover:bg-vs-bg-elevated flex items-center justify-center text-vs-text-muted cursor-pointer px-2 text-[11px] font-mono"
      >
        Fit view
      </button>
    </div>
  );
}

// ─── Component Lens SVG Edges ───────────────────────────────────────────

function ComponentEdges({
  bgSource,
  dragging,
  mx,
  my,
}: {
  bgSource: string;
  dragging: boolean;
  mx: number;
  my: number;
}) {
  const tokenX = 270;
  const compX = 600;

  // Map each handle to a token
  const edgeMap: Record<string, string> = {
    background: bgSource,
    textcolor: "p600",
    radius: "rmd",
    typography: "body",
    gap: "sp2",
  };

  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ overflow: "visible" }}
    >
      {handles.map((h) => {
        const tokenKey = edgeMap[h.key];
        const token = tokens.find((t) => t.key === tokenKey);
        if (!token) return null;

        const isBackground = h.key === "background";
        const stroke = isBackground ? "rgba(37,99,235,0.8)" : "#34373D";
        const strokeWidth = isBackground ? 2 : 1.5;

        return (
          <path
            key={h.key}
            d={bezierPath(tokenX, token.cy, compX, h.y)}
            fill="none"
            stroke={stroke}
            strokeWidth={strokeWidth}
          />
        );
      })}

      {/* Drag edge */}
      {dragging && (
        <path
          d={bezierPath(compX, handles[0].y, mx, my)}
          fill="none"
          stroke="#7C6FF0"
          strokeWidth={2}
          strokeDasharray="6 4"
        />
      )}
    </svg>
  );
}

// ─── Token Lens SVG Edges ───────────────────────────────────────────────

function TokenEdges({ ripple }: { ripple: boolean }) {
  const tokenOutX = 280;
  const thumbInX = 620;
  const tokenCy = 268 + 36; // center of the central token node

  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ overflow: "visible" }}
    >
      {thumbs.map((t) => {
        const thumbCy = t.top + 44;
        return (
          <path
            key={t.name}
            d={bezierPath(tokenOutX, tokenCy, thumbInX, thumbCy)}
            fill="none"
            stroke={ripple ? "#7C6FF0" : "rgba(37,99,235,0.5)"}
            strokeWidth={ripple ? 2 : 1.5}
            className={ripple ? "animate-pulse" : ""}
          />
        );
      })}
    </svg>
  );
}

// ─── Main GraphView ─────────────────────────────────────────────────────

export function GraphView() {
  const { showToast } = useToast();

  // Shared state
  const [lens, setLens] = useState<Lens>("Component");
  const [scale, setScale] = useState(0.85);

  // Component lens state
  const [variant, setVariant] = useState<Variant>("primary");
  const [dragging, setDragging] = useState(false);
  const [mx, setMx] = useState(0);
  const [my, setMy] = useState(0);
  const [bgSource, setBgSource] = useState("p500");
  const [promoted, setPromoted] = useState(false);
  const [flagHover, setFlagHover] = useState(false);
  const [patchVersion, setPatchVersion] = useState(12);

  // Token lens state
  const [tokenColor, setTokenColor] = useState("#6B7280");
  const [ripple, setRipple] = useState(false);

  const canvasRef = useRef<HTMLDivElement>(null);

  // ─── Drag handlers ────────────────────────────────────────────────────

  const handleDragStart = useCallback((e: ReactMouseEvent) => {
    e.preventDefault();
    setDragging(true);
    if (canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      setMx((e.clientX - rect.left) / scale);
      setMy((e.clientY - rect.top) / scale);
    }
  }, [scale]);

  useEffect(() => {
    if (!dragging) return;

    const handleMove = (e: globalThis.MouseEvent) => {
      if (canvasRef.current) {
        const rect = canvasRef.current.getBoundingClientRect();
        setMx((e.clientX - rect.left) / scale);
        setMy((e.clientY - rect.top) / scale);
      }
    };

    const handleUp = () => {
      setDragging(false);
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [dragging, scale]);

  // ─── Actions ──────────────────────────────────────────────────────────

  const handleRewire = useCallback(
    (tokenKey: string) => {
      const token = tokens.find((t) => t.key === tokenKey);
      if (!token || token.kind !== "color") return;

      setBgSource(tokenKey);
      setDragging(false);
      const oldV = patchVersion;
      const newV = oldV + 1;
      setPatchVersion(newV);
      showToast(`Rewire Button background to ${token.name} — Patch applied, v${oldV} → v${newV}`);
    },
    [patchVersion, showToast],
  );

  const handlePromote = useCallback(() => {
    setPromoted(true);
    setFlagHover(false);
    const oldV = patchVersion;
    const newV = oldV + 1;
    setPatchVersion(newV);
    showToast(`Promote #FFFFFF to color/surface/base — Patch applied, v${oldV} → v${newV}`);
  }, [patchVersion, showToast]);

  const handleTokenColorChange = useCallback(
    (newColor: string) => {
      setTokenColor(newColor);
      setRipple(true);
      const oldV = patchVersion;
      const newV = oldV + 1;
      setPatchVersion(newV);
      showToast(`Edit color/neutral/500 to ${newColor} — Patch applied, v${oldV} → v${newV}`);
      setTimeout(() => setRipple(false), 900);
    },
    [patchVersion, showToast],
  );

  // ─── Zoom handlers ───────────────────────────────────────────────────

  const handleZoomIn = useCallback(() => {
    setScale((s) => Math.min(1.5, Math.round((s + 0.1) * 10) / 10));
  }, []);

  const handleZoomOut = useCallback(() => {
    setScale((s) => Math.max(0.5, Math.round((s - 0.1) * 10) / 10));
  }, []);

  const handleFitView = useCallback(() => {
    setScale(0.85);
  }, []);

  // Resolve current bg color for the component preview
  const currentBgToken = tokens.find((t) => t.key === bgSource);
  const currentBgColor = currentBgToken?.value ?? "#2563EB";

  return (
    <div
      className="relative w-full h-full overflow-hidden"
      style={{
        backgroundColor: "#0B0C0E",
        backgroundImage: "radial-gradient(#1B1D21 1px, transparent 1px)",
        backgroundSize: "24px 24px",
      }}
    >
      {/* Lens switcher */}
      <div className="absolute top-4 left-4 z-10">
        <SegmentedControl
          options={["Component", "Token"]}
          value={lens}
          onChange={(v) => setLens(v as Lens)}
          size="sm"
        />
      </div>

      {/* Token lens detail panel */}
      {lens === "Token" && (
        <TokenDetailPanel color={tokenColor} onColorChange={handleTokenColorChange} />
      )}

      {/* Zoom controls */}
      <ZoomControls
        scale={scale}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onFitView={handleFitView}
      />

      {/* Scalable canvas */}
      <div
        ref={canvasRef}
        className="absolute inset-0"
        style={{
          transform: `scale(${scale})`,
          transformOrigin: "0 0",
          width: `${100 / scale}%`,
          height: `${100 / scale}%`,
        }}
      >
        {/* ─── Component Lens ──────────────────────────────────────────── */}
        {lens === "Component" && (
          <>
            {/* SVG edges */}
            <ComponentEdges
              bgSource={bgSource}
              dragging={dragging}
              mx={mx}
              my={my}
            />

            {/* Token nodes */}
            {tokens.map((token) => (
              <TokenNodeCard
                key={token.key}
                token={token}
                dragging={dragging}
                isCurrentBgSource={token.key === bgSource}
                isDragCompatible={token.kind === "color"}
                onMouseUp={() => handleRewire(token.key)}
              />
            ))}

            {/* Component node */}
            <ComponentNode
              variant={variant}
              setVariant={setVariant}
              bgColor={currentBgColor}
              promoted={promoted}
              flagHover={flagHover}
              setFlagHover={setFlagHover}
              onPromote={handlePromote}
              onDragStart={handleDragStart}
            />
          </>
        )}

        {/* ─── Token Lens ──────────────────────────────────────────────── */}
        {lens === "Token" && (
          <>
            {/* SVG edges */}
            <TokenEdges ripple={ripple} />

            {/* Central token node */}
            <CentralTokenNode color={tokenColor} />

            {/* Thumbnail cards */}
            {thumbs.map((thumb) => (
              <ThumbnailCard key={thumb.name} thumb={thumb} />
            ))}
          </>
        )}
      </div>
    </div>
  );
}
