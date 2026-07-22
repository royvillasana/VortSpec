import type { JSX, ReactNode } from "react";
import type { DeviceFrameKind } from "./viewports";

/**
 * Lightweight CSS device frames for the Playground (change: canvas-viewports).
 *
 * Wraps the emulated viewport (its children) in a phone bezel so a Mobile/Tablet
 * preview reads as a real device — an iPhone (rounded bezel + dynamic island +
 * home indicator) or an Android (thinner bezel + centered camera hole). No assets:
 * pure CSS so it scales cleanly with the canvas fit transform.
 *
 * The frame adds a fixed bezel around the children; the child screen keeps the
 * viewport's exact CSS px size (so page media queries + guest rects are unaffected).
 */

const BEZEL = { iphone: 14, android: 12, none: 0 } as const;

export function DeviceFrame({ kind, children }: { kind: DeviceFrameKind; children: ReactNode }): JSX.Element {
  if (kind === "none") return <>{children}</>;
  const b = BEZEL[kind];
  const radius = kind === "iphone" ? 56 : 40;
  const innerRadius = Math.max(0, radius - b);
  return (
    <div
      aria-hidden
      style={{
        padding: b,
        background: kind === "iphone" ? "#0b0b0e" : "#111214",
        borderRadius: radius,
        boxShadow: `0 0 0 2px ${kind === "iphone" ? "#3a3a40" : "#2c2d31"}, 0 24px 60px -18px rgba(0,0,0,.55)`,
        position: "relative",
      }}
    >
      <div style={{ position: "relative", borderRadius: innerRadius, overflow: "hidden", background: "#000" }}>
        {children}
        {kind === "iphone" ? (
          // Dynamic island — floats over the top of the screen.
          <div
            style={{
              position: "absolute",
              top: 9,
              left: "50%",
              transform: "translateX(-50%)",
              width: 92,
              height: 26,
              borderRadius: 999,
              background: "#000",
              zIndex: 2,
            }}
          />
        ) : (
          // Android — centered camera punch-hole.
          <div
            style={{
              position: "absolute",
              top: 8,
              left: "50%",
              transform: "translateX(-50%)",
              width: 10,
              height: 10,
              borderRadius: 999,
              background: "#000",
              boxShadow: "0 0 0 2px rgba(255,255,255,.06)",
              zIndex: 2,
            }}
          />
        )}
      </div>
      {kind === "iphone" && (
        // Home indicator.
        <div
          style={{
            position: "absolute",
            bottom: b + 7,
            left: "50%",
            transform: "translateX(-50%)",
            width: "34%",
            height: 5,
            borderRadius: 999,
            background: "rgba(255,255,255,.5)",
            zIndex: 2,
          }}
        />
      )}
    </div>
  );
}

/** The extra px the frame adds around the viewport on each axis — for fit math. */
export function frameBezel(kind: DeviceFrameKind): number {
  return BEZEL[kind] * 2 + (kind === "none" ? 0 : 4); // padding both sides + the 2px ring
}
