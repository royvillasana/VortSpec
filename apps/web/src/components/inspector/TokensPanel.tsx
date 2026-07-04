"use client";

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import type { DesignToken, TokenKind, Confidence } from "@/types/ir";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { TokenSwatch } from "@/components/ui/token-swatch";
import { ProvenanceDot } from "@/components/ui/provenance-dot";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

type ModalAction = "rename" | "merge" | "delete" | null;

// ─── Constants ────────────────────────────────────────────────────────────

const TYPE_FILTERS = ["All", "Color", "Typography", "Spacing", "Radius", "Shadow"] as const;
type TypeFilter = (typeof TYPE_FILTERS)[number];

const filterToKind: Record<TypeFilter, TokenKind | null> = {
  All: null,
  Color: "color",
  Typography: "typography",
  Spacing: "spacing",
  Radius: "radius",
  Shadow: "shadow",
};

const kindLabels: Record<TokenKind, string> = {
  color: "Color",
  typography: "Typography",
  spacing: "Spacing",
  radius: "Radius",
  shadow: "Shadow",
  other: "Other",
};

const provenanceLabels: Record<Confidence, string> = {
  confirmed: "Confirmed",
  inferred: "Inferred",
  pending: "Pending",
};

// ─── Overflow Menu ────────────────────────────────────────────────────────

function OverflowMenu({
  open,
  onClose,
  anchorRef,
  onAction,
}: {
  open: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  onAction: (action: ModalAction) => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        anchorRef.current &&
        !anchorRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open, onClose, anchorRef]);

  if (!open) return null;

  const items: { label: string; action: ModalAction; danger?: boolean }[] = [
    { label: "Rename", action: "rename" },
    { label: "Edit value", action: null },
    { label: "Merge into\u2026", action: "merge" },
  ];

  return (
    <div
      ref={menuRef}
      className="absolute right-6 top-full mt-1 z-50 w-[160px] bg-vs-bg-elevated border border-vs-border-strong rounded-lg p-1 shadow-lg"
    >
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          onClick={() => { onClose(); if (item.action) onAction(item.action); }}
          className="w-full text-left text-[12px] text-vs-text-primary px-3 py-1.5 rounded-md hover:bg-vs-bg-hover cursor-pointer"
        >
          {item.label}
        </button>
      ))}
      <div className="my-1 border-t border-vs-border-default" />
      <button
        type="button"
        onClick={() => { onClose(); onAction("delete"); }}
        className="w-full text-left text-[12px] text-vs-error px-3 py-1.5 rounded-md hover:bg-vs-bg-hover cursor-pointer"
      >
        Delete
      </button>
    </div>
  );
}

// ─── Rename Modal ─────────────────────────────────────────────────────────

function RenameModal({ token, onClose, onRename }: { token: DesignToken; onClose: () => void; onRename: (newName: string) => void }) {
  const [name, setName] = useState(token.name);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55" onClick={onClose}>
      <div className="w-[440px] bg-vs-bg-surface border border-vs-border-strong rounded-lg shadow-2xl" style={{ animation: "vsDlgIn 0.15s ease" }} onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-vs-border-default">
          <h3 className="text-[15px] font-semibold">Rename token</h3>
        </div>
        <div className="px-5 py-4">
          <label className="block text-[11px] text-vs-text-muted mb-1.5 uppercase tracking-wider">New name</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} autoFocus className="w-full bg-vs-bg-primary border border-vs-border-default rounded-md text-[12px] text-vs-text-primary font-mono px-2.5 py-2 focus:border-vs-accent focus:shadow-[0_0_0_2px_rgba(124,111,240,0.25)] outline-none" />
          <p className="mt-3 text-[12px] text-vs-text-muted leading-relaxed">
            Renaming will update all {token.usageCount} usage{token.usageCount !== 1 ? "s" : ""} of <span className="font-mono text-vs-text-secondary">{token.name}</span> across the project.
          </p>
        </div>
        <div className="px-5 py-3 border-t border-vs-border-default flex justify-end gap-3">
          <button onClick={onClose} className="text-[13px] text-vs-text-secondary border border-vs-border-strong rounded-lg px-4 py-2 bg-transparent cursor-pointer hover:bg-vs-bg-elevated">Cancel</button>
          <button onClick={() => onRename(name)} disabled={!name.trim() || name === token.name} className="text-[13px] font-medium text-white bg-vs-accent rounded-lg px-4 py-2 border-none cursor-pointer hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed">Rename</button>
        </div>
      </div>
    </div>
  );
}

// ─── Merge Modal ──────────────────────────────────────────────────────────

function MergeModal({ token, allTokens, onClose, onMerge }: { token: DesignToken; allTokens: DesignToken[]; onClose: () => void; onMerge: (targetId: string) => void }) {
  const sameKind = allTokens.filter((t) => t.kind === token.kind && t.id !== token.id);
  const [targetId, setTargetId] = useState(sameKind[0]?.id ?? "");
  const target = sameKind.find((t) => t.id === targetId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55" onClick={onClose}>
      <div className="w-[640px] max-h-[80vh] bg-vs-bg-surface border border-vs-border-strong rounded-lg shadow-2xl overflow-hidden" style={{ animation: "vsDlgIn 0.15s ease" }} onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-vs-border-default">
          <h3 className="text-[15px] font-semibold">Merge token</h3>
        </div>
        <div className="px-5 py-4 grid grid-cols-2 gap-6">
          <div>
            <div className="text-[11px] text-vs-text-muted mb-2 uppercase tracking-wider">Merging</div>
            <div className="flex items-center gap-2 bg-vs-bg-elevated border border-vs-border-default rounded-md px-3 py-2">
              <TokenSwatch kind={token.kind} value={token.resolvedValue} />
              <span className="font-mono text-[12px] text-vs-text-primary truncate">{token.name}</span>
            </div>
            <p className="mt-3 text-[12px] text-vs-text-muted leading-relaxed">
              All {token.usageCount} reference{token.usageCount !== 1 ? "s" : ""} will be rewritten to the target token.
            </p>
          </div>
          <div>
            <div className="text-[11px] text-vs-text-muted mb-2 uppercase tracking-wider">Into</div>
            <select value={targetId} onChange={(e) => setTargetId(e.target.value)} className="w-full bg-vs-bg-primary border border-vs-border-default rounded-md text-[12px] text-vs-text-primary font-mono px-2.5 py-2 outline-none focus:border-vs-accent appearance-none cursor-pointer">
              {sameKind.map((t) => (
                <option key={t.id} value={t.id}>{t.name} ({t.value})</option>
              ))}
            </select>
            {target && (
              <div className="mt-2 flex items-center gap-2 bg-vs-bg-elevated border border-vs-accent rounded-md px-3 py-2">
                <TokenSwatch kind={target.kind} value={target.resolvedValue} />
                <span className="font-mono text-[12px] text-vs-text-primary truncate">{target.name}</span>
              </div>
            )}
          </div>
        </div>
        <div className="px-5 py-3 border-t border-vs-border-default flex justify-end gap-3">
          <button onClick={onClose} className="text-[13px] text-vs-text-secondary border border-vs-border-strong rounded-lg px-4 py-2 bg-transparent cursor-pointer hover:bg-vs-bg-elevated">Cancel</button>
          <button onClick={() => onMerge(targetId)} disabled={!targetId} className="text-[13px] font-medium text-white bg-vs-accent rounded-lg px-4 py-2 border-none cursor-pointer hover:brightness-110 disabled:opacity-50">Merge</button>
        </div>
      </div>
    </div>
  );
}

// ─── Delete Modal ─────────────────────────────────────────────────────────

function DeleteModal({ token, allTokens, onClose, onDelete }: { token: DesignToken; allTokens: DesignToken[]; onClose: () => void; onDelete: (fallback: "literal" | "remap", targetId?: string) => void }) {
  const [fallback, setFallback] = useState<"literal" | "remap">("literal");
  const sameKind = allTokens.filter((t) => t.kind === token.kind && t.id !== token.id);
  const [remapTarget, setRemapTarget] = useState(sameKind[0]?.id ?? "");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55" onClick={onClose}>
      <div className="w-[440px] bg-vs-bg-surface border border-vs-border-strong rounded-lg shadow-2xl" style={{ animation: "vsDlgIn 0.15s ease" }} onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-vs-border-default">
          <h3 className="text-[15px] font-semibold">Delete token</h3>
        </div>
        <div className="px-5 py-4">
          <p className="text-[12px] text-vs-text-secondary leading-relaxed mb-4">
            <span className="font-mono text-vs-text-primary">{token.name}</span> is used in {token.usageCount} place{token.usageCount !== 1 ? "s" : ""}. Choose how to handle existing references:
          </p>
          <div className="flex flex-col gap-2">
            <label className={`flex items-center gap-3 px-3 py-2.5 rounded-md border cursor-pointer ${fallback === "literal" ? "border-vs-accent bg-vs-bg-elevated" : "border-vs-border-default hover:border-vs-border-strong"}`}>
              <input type="radio" name="fallback" checked={fallback === "literal"} onChange={() => setFallback("literal")} className="accent-[#7C6FF0]" />
              <div>
                <div className="text-[12px] text-vs-text-primary font-medium">Inline as flagged literal</div>
                <div className="text-[11px] text-vs-text-muted">Each usage keeps the resolved value, marked as a flagged literal for future review.</div>
              </div>
            </label>
            <label className={`flex items-center gap-3 px-3 py-2.5 rounded-md border cursor-pointer ${fallback === "remap" ? "border-vs-accent bg-vs-bg-elevated" : "border-vs-border-default hover:border-vs-border-strong"}`}>
              <input type="radio" name="fallback" checked={fallback === "remap"} onChange={() => setFallback("remap")} className="accent-[#7C6FF0]" />
              <div>
                <div className="text-[12px] text-vs-text-primary font-medium">Remap to another token</div>
                <div className="text-[11px] text-vs-text-muted">All usages will reference the selected token instead.</div>
              </div>
            </label>
          </div>
          {fallback === "remap" && (
            <select value={remapTarget} onChange={(e) => setRemapTarget(e.target.value)} className="mt-3 w-full bg-vs-bg-primary border border-vs-border-default rounded-md text-[12px] text-vs-text-primary font-mono px-2.5 py-2 outline-none focus:border-vs-accent appearance-none cursor-pointer">
              {sameKind.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          )}
        </div>
        <div className="px-5 py-3 border-t border-vs-border-default flex justify-end gap-3">
          <button onClick={onClose} className="text-[13px] text-vs-text-secondary border border-vs-border-strong rounded-lg px-4 py-2 bg-transparent cursor-pointer hover:bg-vs-bg-elevated">Cancel</button>
          <button onClick={() => onDelete(fallback, fallback === "remap" ? remapTarget : undefined)} className="text-[13px] font-medium text-white bg-vs-error rounded-lg px-4 py-2 border-none cursor-pointer hover:brightness-110">Delete token</button>
        </div>
      </div>
    </div>
  );
}

// ─── Token Row ────────────────────────────────────────────────────────────

function TokenRow({
  token,
  selected,
  onSelect,
  overflowOpen,
  onToggleOverflow,
  onAction,
}: {
  token: DesignToken;
  selected: boolean;
  onSelect: () => void;
  overflowOpen: boolean;
  onToggleOverflow: () => void;
  onAction: (action: ModalAction) => void;
}) {
  const btnRef = useRef<HTMLButtonElement>(null);

  return (
    <div className="relative group">
      <button
        type="button"
        onClick={onSelect}
        className={cn(
          "w-full flex items-center h-[44px] px-6 border-b border-vs-border-default cursor-pointer transition-colors text-left",
          selected
            ? "bg-vs-bg-elevated shadow-[inset_2px_0_0_#7C6FF0]"
            : "hover:bg-vs-bg-hover"
        )}
      >
        {/* Swatch */}
        <span className="flex-none w-[20px] h-[20px] flex items-center justify-center mr-3">
          <TokenSwatch kind={token.kind} value={token.resolvedValue} />
        </span>

        {/* Name */}
        <span className="font-mono text-[12px] text-vs-text-primary w-[220px] truncate flex-none">
          {token.name}
        </span>

        {/* Value */}
        <span className="font-mono text-[12px] text-vs-text-secondary w-[170px] truncate flex-none">
          {token.value}
        </span>

        {/* Provenance */}
        <span className="flex items-center gap-1.5 w-[100px] flex-none">
          <ProvenanceDot confidence={token.provenance.confidence} />
          <span className="text-[11px] text-vs-text-muted capitalize">
            {provenanceLabels[token.provenance.confidence]}
          </span>
        </span>

        {/* Usage count */}
        <span className="font-mono text-[12px] text-vs-text-secondary hover:underline flex-none">
          {token.usageCount} uses
        </span>
      </button>

      {/* Overflow button */}
      <div className="absolute right-6 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          ref={btnRef}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleOverflow();
          }}
          className="w-8 h-8 rounded-md flex items-center justify-center text-vs-text-muted hover:bg-vs-bg-elevated hover:text-vs-text-primary cursor-pointer text-[16px]"
        >
          &#x22EF;
        </button>
        <OverflowMenu
          open={overflowOpen}
          onClose={onToggleOverflow}
          anchorRef={btnRef}
          onAction={onAction}
        />
      </div>
    </div>
  );
}

// ─── Detail Panel ─────────────────────────────────────────────────────────

function DetailPanel({
  token,
  onClose,
}: {
  token: DesignToken;
  onClose: () => void;
}) {
  return (
    <div
      className="w-[360px] flex-none bg-vs-bg-surface border-l border-vs-border-default overflow-y-auto"
      style={{ animation: "vsPanelIn 0.2s ease-out" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-vs-border-default">
        <h3 className="text-[14px] font-semibold text-vs-text-primary truncate">
          Token Detail
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="w-7 h-7 rounded-md flex items-center justify-center text-vs-text-muted hover:bg-vs-bg-elevated hover:text-vs-text-primary cursor-pointer text-[14px]"
        >
          &#x2715;
        </button>
      </div>

      <div className="px-5 py-4 space-y-5">
        {/* Name */}
        <div>
          <label className="block text-[11px] text-vs-text-muted mb-1.5 uppercase tracking-wider">
            Name
          </label>
          <input
            type="text"
            defaultValue={token.name}
            className="w-full bg-vs-bg-primary border border-vs-border-default rounded-md text-[12px] text-vs-text-primary font-mono px-2.5 py-1.5 focus:border-vs-accent focus:shadow-[0_0_0_2px_rgba(124,111,240,0.25)] outline-none transition-colors"
          />
        </div>

        {/* Type badge */}
        <div>
          <label className="block text-[11px] text-vs-text-muted mb-1.5 uppercase tracking-wider">
            Type
          </label>
          <span className="inline-block text-[11px] font-mono text-vs-text-secondary border border-vs-border-strong rounded-full px-2.5 py-0.5 capitalize">
            {token.kind}
          </span>
        </div>

        {/* Value editor */}
        <div>
          <label className="block text-[11px] text-vs-text-muted mb-1.5 uppercase tracking-wider">
            Value
          </label>
          {token.kind === "color" ? (
            <div className="flex items-center gap-2">
              <input
                type="color"
                defaultValue={token.resolvedValue}
                className="w-8 h-8 rounded-md border border-vs-border-default cursor-pointer bg-transparent p-0"
              />
              <input
                type="text"
                defaultValue={token.value}
                className="flex-1 bg-vs-bg-primary border border-vs-border-default rounded-md text-[12px] text-vs-text-primary font-mono px-2.5 py-1.5 focus:border-vs-accent focus:shadow-[0_0_0_2px_rgba(124,111,240,0.25)] outline-none transition-colors"
              />
            </div>
          ) : (
            <input
              type="text"
              defaultValue={token.value}
              className="w-full bg-vs-bg-primary border border-vs-border-default rounded-md text-[12px] text-vs-text-primary font-mono px-2.5 py-1.5 focus:border-vs-accent focus:shadow-[0_0_0_2px_rgba(124,111,240,0.25)] outline-none transition-colors"
            />
          )}
        </div>

        {/* Resolved value (if alias) */}
        {token.alias && (
          <div>
            <label className="block text-[11px] text-vs-text-muted mb-1.5 uppercase tracking-wider">
              Resolved
            </label>
            <span className="font-mono text-[12px] text-vs-text-secondary">
              {token.resolvedValue}
            </span>
          </div>
        )}

        {/* Provenance */}
        <div>
          <label className="block text-[11px] text-vs-text-muted mb-1.5 uppercase tracking-wider">
            Provenance
          </label>
          <div className="flex items-center gap-2">
            <ProvenanceDot confidence={token.provenance.confidence} />
            <span className="text-[12px] text-vs-text-secondary capitalize">
              {provenanceLabels[token.provenance.confidence]}
            </span>
            <span className="text-[11px] text-vs-text-muted">
              via {token.provenance.source}
            </span>
          </div>
          {token.provenance.confidence === "inferred" && (
            <button
              type="button"
              className="mt-2 bg-vs-accent text-white rounded-md px-3 py-1.5 text-[11px] font-medium cursor-pointer hover:opacity-90 transition-opacity"
            >
              Confirm token
            </button>
          )}
          {token.provenance.confidence === "pending" && (
            <button
              type="button"
              className="mt-2 bg-vs-accent text-white rounded-md px-3 py-1.5 text-[11px] font-medium cursor-pointer hover:opacity-90 transition-opacity"
            >
              Confirm token
            </button>
          )}
        </div>

        {/* Where used */}
        <div>
          <label className="block text-[11px] text-vs-text-muted mb-1.5 uppercase tracking-wider">
            Where used
          </label>
          <div className="space-y-1">
            {token.usageCount > 0 ? (
              <span className="text-[12px] text-vs-text-secondary">
                Used in {token.usageCount} place{token.usageCount !== 1 && "s"}
              </span>
            ) : (
              <span className="text-[12px] text-vs-text-muted italic">
                No usages found
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Panel ───────────────────────────────────────────────────────────

export function TokensPanel({ initialTokens }: { initialTokens?: DesignToken[] }) {
  const { showToast } = useToast();
  const [activeFilter, setActiveFilter] = useState<TypeFilter>("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [inferredOnly, setInferredOnly] = useState(false);
  const [selectedTokenId, setSelectedTokenId] = useState<string | null>(null);
  const [overflowMenuId, setOverflowMenuId] = useState<string | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [modalAction, setModalAction] = useState<ModalAction>(null);
  const [modalTokenId, setModalTokenId] = useState<string | null>(null);
  const [tokens, setTokens] = useState<DesignToken[]>(initialTokens ?? []);
  const [version, setVersion] = useState(14);

  const openModal = useCallback((tokenId: string, action: ModalAction) => {
    setModalTokenId(tokenId);
    setModalAction(action);
  }, []);

  const closeModal = useCallback(() => {
    setModalAction(null);
    setModalTokenId(null);
  }, []);

  const modalToken = modalTokenId ? tokens.find((t) => t.id === modalTokenId) : null;

  const handleRename = useCallback((newName: string) => {
    if (!modalTokenId) return;
    setTokens((prev) => prev.map((t) => t.id === modalTokenId ? { ...t, name: newName } : t));
    setVersion((v) => v + 1);
    showToast(`Rename to ${newName} — Patch applied, v${version} → v${version + 1}`);
    closeModal();
  }, [modalTokenId, version, showToast, closeModal]);

  const handleMerge = useCallback((targetId: string) => {
    if (!modalTokenId) return;
    const source = tokens.find((t) => t.id === modalTokenId);
    const target = tokens.find((t) => t.id === targetId);
    setTokens((prev) => prev.filter((t) => t.id !== modalTokenId).map((t) =>
      t.id === targetId ? { ...t, usageCount: t.usageCount + (source?.usageCount ?? 0) } : t
    ));
    setVersion((v) => v + 1);
    showToast(`Merge ${source?.name} into ${target?.name} — Patch applied, v${version} → v${version + 1}`);
    setSelectedTokenId(null);
    closeModal();
  }, [modalTokenId, tokens, version, showToast, closeModal]);

  const handleDelete = useCallback((fallback: "literal" | "remap", targetId?: string) => {
    if (!modalTokenId) return;
    const deleted = tokens.find((t) => t.id === modalTokenId);
    if (fallback === "remap" && targetId) {
      setTokens((prev) => prev.filter((t) => t.id !== modalTokenId).map((t) =>
        t.id === targetId ? { ...t, usageCount: t.usageCount + (deleted?.usageCount ?? 0) } : t
      ));
    } else {
      setTokens((prev) => prev.filter((t) => t.id !== modalTokenId));
    }
    setVersion((v) => v + 1);
    const strategy = fallback === "remap" ? "remapped" : "inlined as flagged literals";
    showToast(`Delete ${deleted?.name} (${strategy}) — Patch applied, v${version} → v${version + 1}`);
    setSelectedTokenId(null);
    closeModal();
  }, [modalTokenId, tokens, version, showToast, closeModal]);

  // Filter tokens
  const filteredTokens = useMemo(() => {
    let filtered = tokens;

    // Type filter
    const kind = filterToKind[activeFilter];
    if (kind) {
      filtered = filtered.filter((t) => t.kind === kind);
    }

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.value.toLowerCase().includes(q) ||
          t.resolvedValue.toLowerCase().includes(q)
      );
    }

    // Inferred only
    if (inferredOnly) {
      filtered = filtered.filter((t) => t.provenance.confidence === "inferred");
    }

    return filtered;
  }, [tokens, activeFilter, searchQuery, inferredOnly]);

  // Group tokens by kind
  const groupedTokens = useMemo(() => {
    const groups: { kind: TokenKind; label: string; tokens: DesignToken[] }[] = [];
    const kindOrder: TokenKind[] = ["color", "typography", "spacing", "radius", "shadow", "other"];

    for (const kind of kindOrder) {
      const tokens = filteredTokens.filter((t) => t.kind === kind);
      if (tokens.length > 0) {
        groups.push({ kind, label: kindLabels[kind], tokens });
      }
    }

    return groups;
  }, [filteredTokens]);

  const selectedToken = selectedTokenId
    ? tokens.find((t) => t.id === selectedTokenId) ?? null
    : null;

  return (
    <div className="flex h-full">
      {/* Main content */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-vs-bg-primary px-6 py-5 border-b border-vs-border-default">
          <Link
            href="/projects"
            className="inline-flex items-center gap-1.5 text-[12px] text-vs-text-muted hover:text-vs-text-primary no-underline mb-2 transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="flex-none">
              <path d="M7.5 9.5L4 6L7.5 2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Projects
          </Link>
          <h1 className="text-[20px] font-semibold tracking-tight text-vs-text-primary mb-4">
            Tokens
          </h1>

          {/* Controls row */}
          <div className="flex items-center gap-3 flex-wrap">
            <SegmentedControl
              options={[...TYPE_FILTERS]}
              value={activeFilter}
              onChange={(v) => setActiveFilter(v as TypeFilter)}
              size="sm"
            />

            {/* Search input */}
            <input
              type="text"
              placeholder="Search tokens…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-[220px] bg-vs-bg-surface border border-vs-border-default rounded-md text-[12px] text-vs-text-primary px-2.5 py-1.5 placeholder:text-vs-text-muted focus:border-vs-accent focus:shadow-[0_0_0_2px_rgba(124,111,240,0.25)] outline-none transition-colors"
            />

            {/* Inferred only toggle */}
            <button
              type="button"
              onClick={() => setInferredOnly(!inferredOnly)}
              className={cn(
                "rounded-full px-2.5 py-1.5 text-[12px] border cursor-pointer inline-flex items-center gap-1.5 transition-colors",
                inferredOnly
                  ? "border-vs-accent bg-vs-bg-elevated text-vs-text-primary"
                  : "border-vs-border-strong text-vs-text-secondary hover:text-vs-text-primary"
              )}
            >
              <span className="w-[7px] h-[7px] rounded-full bg-vs-warning flex-none" />
              Inferred only
            </button>
          </div>
        </div>

        {/* Token list */}
        <div className="flex-1 overflow-y-auto">
          {groupedTokens.length === 0 ? (
            <div className="px-6 py-12 text-center text-[13px] text-vs-text-muted">
              No tokens match the current filters.
            </div>
          ) : (
            groupedTokens.map((group) => {
              const isCollapsed = collapsedGroups.has(group.kind);
              return (
                <div key={group.kind}>
                  {/* Group header — clickable to collapse/expand */}
                  <button
                    type="button"
                    onClick={() =>
                      setCollapsedGroups((prev) => {
                        const next = new Set(prev);
                        if (next.has(group.kind)) next.delete(group.kind);
                        else next.add(group.kind);
                        return next;
                      })
                    }
                    className="sticky top-0 z-[5] w-full bg-vs-bg-primary border-b border-vs-border-default px-6 py-4 flex items-center gap-2 cursor-pointer hover:bg-vs-bg-hover transition-colors text-left"
                  >
                    <svg
                      width="10"
                      height="10"
                      viewBox="0 0 10 10"
                      fill="none"
                      className={`flex-none text-vs-text-muted transition-transform duration-150 ${isCollapsed ? "" : "rotate-90"}`}
                    >
                      <path d="M3 1.5L7 5L3 8.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span className="text-[15px] font-semibold text-vs-text-primary">
                      {group.label}
                    </span>
                    <span className="font-mono text-[11px] text-vs-text-muted">
                      {group.tokens.length}
                    </span>
                  </button>

                  {/* Token rows — hidden when collapsed */}
                  {!isCollapsed &&
                    group.tokens.map((token) => (
                      <TokenRow
                        key={token.id}
                        token={token}
                        selected={selectedTokenId === token.id}
                        onSelect={() =>
                          setSelectedTokenId(
                            selectedTokenId === token.id ? null : token.id
                          )
                        }
                        overflowOpen={overflowMenuId === token.id}
                        onToggleOverflow={() =>
                          setOverflowMenuId(
                            overflowMenuId === token.id ? null : token.id
                          )
                        }
                        onAction={(action) => openModal(token.id, action)}
                      />
                    ))}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Detail panel */}
      {selectedToken && (
        <DetailPanel
          token={selectedToken}
          onClose={() => setSelectedTokenId(null)}
        />
      )}

      {/* Modals */}
      {modalAction === "rename" && modalToken && (
        <RenameModal token={modalToken} onClose={closeModal} onRename={handleRename} />
      )}
      {modalAction === "merge" && modalToken && (
        <MergeModal token={modalToken} allTokens={tokens} onClose={closeModal} onMerge={handleMerge} />
      )}
      {modalAction === "delete" && modalToken && (
        <DeleteModal token={modalToken} allTokens={tokens} onClose={closeModal} onDelete={handleDelete} />
      )}
    </div>
  );
}
