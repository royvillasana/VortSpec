"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { startImport } from "@/app/projects/[id]/import/actions";

/* ── File chip ─────────────────────────────────────────────────── */

function FileChip({ name, size, onRemove }: { name: string; size: string; onRemove: () => void }) {
  return (
    <div className="inline-flex items-center gap-2 bg-vs-bg-elevated border border-vs-border-default rounded-md px-3 py-1.5">
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-vs-text-muted flex-none">
        <path d="M3.5 1.75h4.375L10.5 4.375v7.875H3.5V1.75Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      </svg>
      <span className="font-mono text-[12px] text-vs-text-primary">{name}</span>
      <span className="text-[11px] text-vs-text-muted">{size}</span>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        className="ml-0.5 w-4 h-4 rounded-sm flex items-center justify-center text-vs-text-muted hover:text-vs-text-primary hover:bg-vs-bg-hover transition-colors cursor-pointer"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M2.5 2.5l5 5M7.5 2.5l-5 5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}

/* ── Dropzone ──────────────────────────────────────────────────── */

function Dropzone({
  file,
  error,
  dragOver,
  onAttach,
  onRemove,
  onDragOver,
  onDragLeave,
  onDrop,
  inputRef,
  height = 120,
  placeholder,
  accept,
}: {
  file: { name: string; size: string } | null;
  error: string | null;
  dragOver: boolean;
  onAttach: (f: File) => void;
  onRemove: () => void;
  onDragOver: () => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  height?: number;
  placeholder: string;
  accept?: string;
}) {
  const handleClick = () => inputRef.current?.click();

  return (
    <div>
      {file ? (
        <FileChip name={file.name} size={file.size} onRemove={onRemove} />
      ) : (
        <button
          type="button"
          onClick={handleClick}
          onDragEnter={(e) => { e.preventDefault(); onDragOver(); }}
          onDragOver={(e) => { e.preventDefault(); }}
          onDragLeave={onDragLeave}
          onDrop={(e) => { e.preventDefault(); onDrop(e); }}
          style={{ height }}
          className={`w-full border rounded-lg flex flex-col items-center justify-center gap-2 transition-all cursor-pointer ${
            dragOver
              ? "border-vs-accent border-solid bg-[rgba(124,111,240,0.04)]"
              : "border-dashed border-vs-border-default hover:border-vs-accent"
          }`}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className={`${dragOver ? "text-vs-accent" : "text-vs-text-muted"}`}>
            <path d="M10 13V4m0 0L7 7m3-3 3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M4 13v2a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="text-[12px] text-vs-text-muted leading-relaxed text-center px-4">{placeholder}</span>
        </button>
      )}

      {error && (
        <p className="mt-2 text-[12px] text-vs-error">{error}</p>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={accept ?? ".zip"}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onAttach(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}

/* ── Main ──────────────────────────────────────────────────────── */

const MAX_SIZE = 50 * 1024 * 1024; // 50 MB

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

export function NewImport() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const projectId = params.id;

  // ZIP state — keep the actual File object for upload
  const [rawFile, setRawFile] = useState<File | null>(null);
  const [zipFile, setZipFile] = useState<{ name: string; size: string } | null>(null);
  const [zipError, setZipError] = useState<string | null>(null);
  const [zipDragOver, setZipDragOver] = useState(false);
  const zipInputRef = useRef<HTMLInputElement>(null);

  // DS state
  const [dsExpanded, setDsExpanded] = useState(false);
  const [dsFile, setDsFile] = useState<{ name: string; size: string } | null>(null);
  const [dsDragOver, setDsDragOver] = useState(false);
  const dsInputRef = useRef<HTMLInputElement>(null);

  // Upload state
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const hasSource = zipFile !== null;

  // ZIP file handler
  const handleZipAttach = useCallback((f: File) => {
    if (!f.name.toLowerCase().endsWith(".zip")) {
      setZipError("We could not find HTML or CSS inside this file");
      setZipFile(null);
      setRawFile(null);
      return;
    }
    if (f.size > MAX_SIZE) {
      setZipError("File exceeds the 50 MB limit. Try a smaller export.");
      setZipFile(null);
      setRawFile(null);
      return;
    }
    setZipError(null);
    setRawFile(f);
    setZipFile({ name: f.name, size: formatSize(f.size) });
  }, []);

  const handleZipDrop = useCallback((e: React.DragEvent) => {
    setZipDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleZipAttach(f);
  }, [handleZipAttach]);

  // DS file handler
  const handleDsAttach = useCallback((f: File) => {
    setDsFile({ name: f.name, size: formatSize(f.size) });
  }, []);

  const handleDsDrop = useCallback((e: React.DragEvent) => {
    setDsDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleDsAttach(f);
  }, [handleDsAttach]);

  // Start import — calls the server action
  const handleStartImport = useCallback(async () => {
    if (!rawFile || !projectId) return;
    setUploading(true);
    setUploadError(null);

    const formData = new FormData();
    formData.append("file", rawFile);

    const result = await startImport(projectId, formData);

    if (result.error) {
      setUploadError(result.error);
      setUploading(false);
      return;
    }

    router.push(`/projects/${projectId}/import/${result.importId}`);
  }, [rawFile, projectId, router]);

  return (
    <div className="min-h-screen bg-vs-bg-primary">
      {/* Top bar */}
      <header className="flex items-center justify-between px-6 h-12 border-b border-vs-border-default">
        <span className="text-[15px] font-semibold tracking-tight text-vs-text-primary">VortSpec</span>
        <button type="button" className="w-7 h-7 rounded-full bg-vs-bg-elevated border border-vs-border-strong flex items-center justify-center cursor-pointer">
          <span className="text-[11px] text-vs-text-secondary leading-none">RV</span>
        </button>
      </header>

      <main className="max-w-[640px] mx-auto px-6 py-10">
        {/* Title */}
        <h1 className="text-[20px] font-semibold tracking-tight text-vs-text-primary mb-8">
          Import a design
        </h1>

        {/* Source cards */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          {/* Card 1: ZIP */}
          <div className="bg-vs-bg-surface border border-vs-border-default rounded-lg p-6">
            <h2 className="text-[14px] font-medium text-vs-text-primary mb-1">
              Upload a ZIP export
            </h2>
            <p className="text-[12px] text-vs-text-secondary leading-relaxed mb-4">
              Google Stitch, Claude Design, or any HTML/CSS export.
            </p>

            <Dropzone
              file={zipFile}
              error={zipError}
              dragOver={zipDragOver}
              onAttach={handleZipAttach}
              onRemove={() => { setZipFile(null); setRawFile(null); setZipError(null); }}
              onDragOver={() => setZipDragOver(true)}
              onDragLeave={() => setZipDragOver(false)}
              onDrop={handleZipDrop}
              inputRef={zipInputRef}
              height={120}
              placeholder="Drop your .zip here or click to browse. Up to 50 MB."
            />
          </div>

          {/* Card 2: Figma */}
          <div className="bg-vs-bg-surface border border-vs-border-default rounded-lg p-6">
            <h2 className="text-[14px] font-medium text-vs-text-primary mb-1">
              Connect Figma
            </h2>
            <p className="text-[12px] text-vs-text-secondary leading-relaxed mb-4">
              Import published components and variables from a Figma file.
            </p>

            <button
              type="button"
              className="border border-vs-border-strong bg-vs-bg-elevated rounded-lg px-4 py-2 text-[13px] text-vs-text-primary font-medium cursor-pointer hover:bg-vs-bg-hover transition-colors mb-4"
            >
              Connect Figma
            </button>

            <p className="text-[12px] text-vs-text-muted leading-relaxed">
              Optional. You can always start with a ZIP and connect Figma later.
            </p>
          </div>
        </div>

        {/* Design system accordion */}
        <div className="border border-vs-border-default rounded-lg bg-vs-bg-surface mb-6">
          <button
            type="button"
            onClick={() => setDsExpanded(!dsExpanded)}
            className="w-full flex items-center justify-between px-4 py-3 text-[13px] text-vs-text-primary cursor-pointer hover:bg-vs-bg-hover transition-colors rounded-lg"
          >
            <span>Attach a design system (optional)</span>
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
              className={`text-vs-text-muted transition-transform duration-150 ${dsExpanded ? "rotate-90" : ""}`}
            >
              <path d="M4.5 2.5L8 6L4.5 9.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          {dsExpanded && (
            <div className="px-4 pb-4 pt-1">
              <Dropzone
                file={dsFile}
                error={null}
                dragOver={dsDragOver}
                onAttach={handleDsAttach}
                onRemove={() => setDsFile(null)}
                onDragOver={() => setDsDragOver(true)}
                onDragLeave={() => setDsDragOver(false)}
                onDrop={handleDsDrop}
                inputRef={dsInputRef}
                height={80}
                placeholder="tokens.json, CSS variables file, or a second ZIP"
              />
              <p className="mt-2 text-[12px] text-vs-text-muted leading-relaxed">
                We will match extracted values against your official tokens and flag conflicts.
              </p>
            </div>
          )}
        </div>

        {/* Upload error */}
        {uploadError && (
          <p className="mb-4 text-[12px] text-vs-error">{uploadError}</p>
        )}

        {/* Start import */}
        <div className="flex justify-end">
          <button
            type="button"
            disabled={!hasSource || uploading}
            onClick={handleStartImport}
            className={`rounded-lg px-5 py-2 text-[13px] font-medium transition-all ${
              hasSource && !uploading
                ? "bg-vs-accent text-white cursor-pointer hover:brightness-110"
                : "bg-vs-bg-elevated border border-vs-border-default text-vs-text-muted cursor-not-allowed"
            }`}
          >
            {uploading ? "Uploading…" : "Start import"}
          </button>
        </div>
      </main>
    </div>
  );
}
