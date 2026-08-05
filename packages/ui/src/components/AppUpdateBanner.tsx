import type { JSX } from "react";
import type { UpdateInfo } from "@vortspec/core/update";
import { Button } from "@vortspec/ui/ui";

/**
 * A quiet, dismissible bar shown when a newer VortSpec release is available.
 *
 * Purely presentational: it fetches nothing, persists nothing, and calls no
 * `api` method — the host owns the check and the dismissal. That is what lets
 * it be component-tested from a plain object with no IPC mock, and what keeps
 * one banner serving both the IDE's initial screen and the Settings section.
 *
 * Distinct from `ToolkitUpdateBanner`, which is about the SDD-DE toolkit inside
 * a project. This one is about the app the user is running.
 *
 * The copy is explicit that this is a download, not an in-app install: the
 * build is ad-hoc signed, so macOS cannot auto-install an update, and implying
 * otherwise would be a promise the app can't keep.
 */
export function AppUpdateBanner({
  info,
  onDownload,
  onNotes,
  onDismiss,
  className = "",
}: {
  info: UpdateInfo;
  onDownload: () => void;
  onNotes: () => void;
  onDismiss: () => void;
  /** Layout overrides from the host — applied last so they win. */
  className?: string;
}): JSX.Element | null {
  // The host decides *whether* to render, but guard anyway: a banner announcing
  // `null` would be worse than absent.
  if (!info.hasUpdate || !info.latest) return null;

  // Only name an architecture when we actually resolved one. Without a matching
  // asset the button goes to the release page, and calling that "Download for
  // Apple Silicon" would be a lie about where the click leads.
  const downloadLabel = info.downloadArch
    ? `Download ${info.downloadArch === "arm64" ? "for Apple Silicon" : "for Intel"}`
    : "Get the update";

  return (
    <div
      role="status"
      data-testid="app-update-banner"
      className={`flex flex-none items-center gap-3 border-b border-vs-accent/40 bg-vs-accent-subtle px-4 py-1.5 text-[12px] ${className}`}
    >
      <span className="flex-none text-vs-accent" aria-hidden>
        ↑
      </span>
      <span className="min-w-0 flex-1 text-vs-text-primary">
        VortSpec <span className="font-mono">{info.latest}</span> is available
        <span className="text-vs-text-muted"> — you have {info.current}</span>
      </span>
      {info.releaseUrl && (
        <Button variant="ghost" onClick={onNotes}>
          What&rsquo;s new
        </Button>
      )}
      <Button variant="primary" onClick={onDownload}>
        {downloadLabel}
      </Button>
      <Button variant="ghost" onClick={onDismiss} aria-label="Dismiss update notice">
        Later
      </Button>
    </div>
  );
}
