import type { JSX } from "react";
import type { Rect } from "@vortspec/core/ipc";

/**
 * "AI is working" placeholders for the Run canvas (change: canvas-ai-skeleton).
 *
 * Two shapes, modeled on the generating effects in Figma AI First Draft, Google
 * Stitch and Pencil: an iridescent gradient that MOVES so the wait reads as active
 * generation, not a frozen screen.
 *
 *  - `block` — an in-place shimmer where a component is being built/inserted. It
 *     replaces the element at `rect` (guest-viewport coords; the overlay it lives
 *     in shares the webview's transform, so the rect maps 1:1 at any zoom).
 *  - `page`  — a full-bleed animated gradient mesh + shimmer sweep over the whole
 *     preview while the AI works the page. Semi-transparent so the page shows
 *     through, with a small "Working…" pill.
 *
 * Motion respects `prefers-reduced-motion` (falls back to a slow opacity pulse).
 */

/** The shared keyframes/vars — injected once (id-guarded) so N skeletons share one <style>. */
const STYLE_ID = "vs-ai-skeleton-styles";
const CSS = `
.vs-ai-skel { --c1: #8b5cf6; --c2: #3b82f6; --c3: #06b6d4; --c4: #d946ef; }
@keyframes vs-ai-sweep { 0% { transform: translateX(-120%) skewX(-18deg); } 100% { transform: translateX(220%) skewX(-18deg); } }
@keyframes vs-ai-drift {
  0%   { transform: translate3d(-8%, -6%, 0) rotate(0deg) scale(1.25); }
  50%  { transform: translate3d(8%, 6%, 0) rotate(180deg) scale(1.5); }
  100% { transform: translate3d(-8%, -6%, 0) rotate(360deg) scale(1.25); }
}
@keyframes vs-ai-breathe { 0%,100% { opacity: .7; } 50% { opacity: 1; } }
@keyframes vs-ai-bar { 0%,100% { opacity: .35; } 50% { opacity: .7; } }
@keyframes vs-ai-dot { 0%,100% { opacity: .4; transform: scale(.85); } 50% { opacity: 1; transform: scale(1.15); } }

.vs-ai-block {
  position: absolute; overflow: hidden; border-radius: 10px;
  background: color-mix(in srgb, var(--c2) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--c1) 45%, transparent);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--c1) 20%, transparent), 0 8px 30px -8px color-mix(in srgb, var(--c1) 55%, transparent);
  animation: vs-ai-breathe 2.4s ease-in-out infinite;
}
.vs-ai-block::before {
  content: ""; position: absolute; inset: 0;
  background: linear-gradient(115deg, transparent 20%, color-mix(in srgb, var(--c1) 55%, transparent) 45%, color-mix(in srgb, var(--c3) 55%, transparent) 55%, transparent 80%);
  animation: vs-ai-sweep 1.8s linear infinite;
}
.vs-ai-block-bars { position: absolute; inset: 14% 12%; display: flex; flex-direction: column; gap: 10%; }
.vs-ai-block-bars > i {
  display: block; border-radius: 6px; height: 14px;
  background: color-mix(in srgb, var(--c1) 30%, color-mix(in srgb, var(--c2) 30%, transparent));
  animation: vs-ai-bar 1.8s ease-in-out infinite;
}

.vs-ai-page { position: absolute; inset: 0; overflow: hidden; pointer-events: none; }
.vs-ai-page-mesh {
  position: absolute; inset: -40%;
  background:
    radial-gradient(35% 45% at 30% 30%, color-mix(in srgb, var(--c1) 55%, transparent), transparent 70%),
    radial-gradient(40% 40% at 70% 35%, color-mix(in srgb, var(--c2) 50%, transparent), transparent 70%),
    radial-gradient(45% 45% at 55% 75%, color-mix(in srgb, var(--c4) 45%, transparent), transparent 70%),
    radial-gradient(40% 40% at 25% 70%, color-mix(in srgb, var(--c3) 45%, transparent), transparent 70%);
  filter: blur(24px); opacity: .32;
  animation: vs-ai-drift 9s ease-in-out infinite;
}
.vs-ai-page-sweep {
  position: absolute; inset: 0;
  background: linear-gradient(115deg, transparent 35%, color-mix(in srgb, #fff 22%, transparent) 50%, transparent 65%);
  animation: vs-ai-sweep 2.6s linear infinite;
}
.vs-ai-pill {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 6px 12px; border-radius: 999px;
  background: color-mix(in srgb, #0b0b12 78%, transparent); color: #fff;
  border: 1px solid color-mix(in srgb, var(--c1) 45%, transparent);
  box-shadow: 0 8px 30px -8px color-mix(in srgb, var(--c1) 60%, transparent);
  font-size: 12px; font-weight: 500; letter-spacing: .01em; backdrop-filter: blur(6px);
}
.vs-ai-pill > b { width: 8px; height: 8px; border-radius: 999px; background: linear-gradient(90deg, var(--c1), var(--c3)); animation: vs-ai-dot 1s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) {
  .vs-ai-block, .vs-ai-block::before, .vs-ai-block-bars > i,
  .vs-ai-page-mesh, .vs-ai-page-sweep, .vs-ai-pill > b { animation: vs-ai-breathe 2.4s ease-in-out infinite; }
  .vs-ai-block::before, .vs-ai-page-sweep { display: none; }
}
`;

function Styles(): JSX.Element {
  // A single shared <style>; React dedupes by the element identity per mount, and the
  // id guard keeps it harmless if two skeletons mount at once.
  return <style id={STYLE_ID} dangerouslySetInnerHTML={{ __html: CSS }} />;
}

/** In-place shimmer where a component is being generated. */
export function AiSkeletonBlock({ rect, label }: { rect: Rect; label?: string }): JSX.Element {
  return (
    <div className="vs-ai-skel" aria-hidden>
      <Styles />
      <div
        className="vs-ai-block"
        style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
        role="status"
        aria-label={label ?? "Building this element"}
      >
        <div className="vs-ai-block-bars">
          <i style={{ width: "70%" }} />
          <i style={{ width: "90%" }} />
          <i style={{ width: "45%" }} />
        </div>
      </div>
    </div>
  );
}

/** Full-preview animated gradient while the AI works the whole page. The "Working…"
 *  label is NOT here — it's rendered by the host as a toolbar-anchored pill so it stays
 *  above the bottom toolbar in every viewport (not floating inside a scaled device). */
export function AiSkeletonPage({ label = "Working on the page…" }: { label?: string }): JSX.Element {
  return (
    <div className="vs-ai-skel vs-ai-page" role="status" aria-label={label}>
      <Styles />
      <div className="vs-ai-page-mesh" />
      <div className="vs-ai-page-sweep" />
    </div>
  );
}

/** The "AI is working" pill — a flow element the host pins just above the canvas toolbar
 *  (screen-space), so it reads the same across Desktop/Tablet/Mobile. */
export function AiWorkingPill({ label = "Working…" }: { label?: string }): JSX.Element {
  return (
    <div className="vs-ai-skel" role="status" aria-label={label}>
      <Styles />
      <div className="vs-ai-pill">
        <b />
        {label}
      </div>
    </div>
  );
}
