import { execFileSafe } from "./exec";

/**
 * macOS/Linux apps launched from Finder/Dock don't inherit the user's shell
 * PATH — they get a minimal PATH (e.g. /usr/bin:/bin:/usr/sbin:/sbin). So tools
 * the user installed in /opt/homebrew/bin, /usr/local/bin, nvm, volta, asdf,
 * ~/.local/bin, etc. are invisible to `spawn("node")` / `spawn("claude")`, and
 * the environment check wrongly reports them missing.
 *
 * Resolve the login shell's PATH (the one a terminal has) and merge it into
 * process.env.PATH before anything spawns, so every child process — env checks,
 * Claude Code runs, dev servers — finds the user's real tools. Idempotent, safe
 * to run in dev (re-derives the same PATH), and never throws.
 */

const MARKER = "__VS_PATH__";

/** Common install locations to add as a floor, in case the shell probe fails. */
const FALLBACK_DIRS = [
  "/opt/homebrew/bin",
  "/opt/homebrew/sbin",
  "/usr/local/bin",
  "/usr/local/sbin",
  `${process.env.HOME ?? ""}/.local/bin`,
  `${process.env.HOME ?? ""}/.volta/bin`,
  `${process.env.HOME ?? ""}/.bun/bin`,
];

/** Concatenate PATH strings, keeping first occurrence of each dir (dedup, order-stable). */
export function mergePath(...parts: string[]): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    for (const dir of p.split(":")) {
      if (dir && !seen.has(dir)) {
        seen.add(dir);
        out.push(dir);
      }
    }
  }
  return out.join(":");
}

export async function fixGuiPath(): Promise<void> {
  if (process.platform === "win32") return;

  let shellPath = "";
  const shell = process.env.SHELL || "/bin/zsh";
  // `-ilc` = interactive login shell running a command: sources the same profile
  // files a terminal does (.zprofile/.zshrc, nvm hooks, etc.). printf between
  // markers so we can extract PATH cleanly from any preamble the shell prints.
  const r = await execFileSafe(shell, ["-ilc", `printf '%s' "${MARKER}\${PATH}${MARKER}"`], {
    timeoutMs: 5000,
  });
  if (!r.spawnError && !r.timedOut) {
    const m = r.stdout.match(new RegExp(`${MARKER}(.*?)${MARKER}`, "s"));
    if (m?.[1]) shellPath = m[1];
  }

  // Merge: shell PATH first (authoritative), then the fallback floor, then
  // whatever the GUI launch gave us — deduped, nothing lost.
  process.env.PATH = mergePath(shellPath, FALLBACK_DIRS.join(":"), process.env.PATH ?? "");
}
