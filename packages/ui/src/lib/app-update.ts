import type { UpdateInfo } from "@vortspec/core/update";

/**
 * The decisions two surfaces would otherwise duplicate: the IDE's initial
 * screen (which shows a dismissible prompt) and the Settings section (which
 * always reports the truth). Pure, so the dismissal rule the spec cares about
 * is unit-tested rather than only observed through a mounted component.
 */

/**
 * Whether the initial-screen prompt should appear.
 *
 * Dismissal is keyed to the version, not a boolean, so suppression expires by
 * itself the moment something newer ships. This binds to the PROMPT only —
 * Settings deliberately ignores it and reports the real state, so a user who
 * dismissed the banner can still ask "am I current?" and get a straight answer.
 */
export function shouldPromptForUpdate(
  info: UpdateInfo | null,
  dismissedVersion: string | null,
): boolean {
  if (!info?.hasUpdate || !info.latest) return false;
  return info.latest !== dismissedVersion;
}

/** The four states Settings must keep distinct. */
export type UpdateCheckState =
  /** Never checked in this session — show the running version only. */
  | { kind: "idle" }
  /** A request is in flight; the control must not be re-activatable. */
  | { kind: "checking" }
  /** We reached GitHub and the app is current. */
  | { kind: "current"; latest: string }
  /** We reached GitHub and there is something newer. */
  | { kind: "available"; info: UpdateInfo }
  /** We never found out. NOT the same as "current" — saying so would be a lie. */
  | { kind: "unreachable" };

/**
 * A settled `UpdateInfo` → the state Settings renders.
 *
 * `reachable` is the whole reason this is not a two-way branch on `hasUpdate`:
 * an offline check and an up-to-date check both report `hasUpdate: false`, and
 * telling an offline user they are current is the failure this guards against.
 */
export function toCheckState(info: UpdateInfo): UpdateCheckState {
  if (!info.reachable) return { kind: "unreachable" };
  if (info.hasUpdate && info.latest) return { kind: "available", info };
  return { kind: "current", latest: info.latest ?? info.current };
}
