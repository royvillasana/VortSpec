# Design — Background verify & build pipeline

## Context

The workspace (`GuidedFlow.tsx`) drives Claude Code runs through `useAgentRun` +
`op(label, prompt, tools)`. Verify runs `/visual-verify`, whose skill body is a
human-at-a-browser checklist. All the primitives we need already exist and are
IPC-exposed:

- `api.startDevServer(path)` / `api.devServerStatus(path)` / `onDevServerUpdate` —
  managed Storybook/dev-server per project (`main/workspace/dev-server.ts`), prefers a
  `storybook` script, parses the local URL from output.
- `api.getPreviewInfo(path)` → `{ hasStorybook, script }`.
- `getVerification(path)` (`verification-reader.ts`) → findings parsed from
  `visual-verify-report.md` + adversarial reports, each with `status: open|resolved`.
- `useLatestRun()` already adopts the active run on `system-init` — the basis for
  reconnect.

So this change is **wiring + prompt + presentation**, not new engine work. Claude Code
still executes every skill; we provision its harness and show only the outcome.

## Decisions

### 1. Ensure a render harness before verify (auto-launch)

`ensureHarness(projectPath)` (renderer helper) before any verify op:
1. `getPreviewInfo` — if no Storybook, run the `/storybook` skill once (background op,
   reusing the existing DevPreview storybook-setup prompt) to create config + stories +
   scripts. This is the CLI's own recommended transition step.
2. `startDevServer` — idempotent (returns existing status if already starting/running);
   await `running` with a URL (subscribe to `onDevServerUpdate`, timeout ~90s).
3. Return the URL. On failure, verify still runs but the prompt says the live surface is
   unavailable — the agent does the code-level audit and logs the visual part as pending
   (never asks the user to start a server).

Rationale: reuses the same harness the Playground already embeds; one Storybook per
project; no new PTY. The `/storybook` bootstrap is idempotent (`ls .storybook/main.*`).

### 2. Autonomous verify prompt

Replace `verifyOnePrompt` / `VERIFY_ALL_PROMPT`. The new prompt, given the harness URL
and (for figma) `figma_file_url`:
- Runs `/visual-verify` **then** `/adversarial-review` back-to-back, autonomously.
- Explicit non-interaction clause: "Do NOT ask me to open a browser, open Figma Dev
  Mode, start a server, or perform any checklist step yourself. You have the live URL
  ({url}) and the Figma MCP — do it all yourself."
- Headless-honest clause: run the code-level audit fully (token audit via grep, variant/
  state/a11y-in-source, spec compliance) and use Figma-MCP screenshots as the visual
  reference; if a check genuinely needs a browser driver you don't have, record it as
  "visual spot-check pending" in the report — never surface it as a user step.
- Fix discrepancies inline; end with `visual-verify-report.md` + the adversarial report
  and a final one-line `VERIFY: PASS` / `VERIFY: ISSUES (n)`.

Tools stay permissive (bypassPermissions already permits Figma MCP + Bash); the op keeps
Write/Edit so the agent can fix + write reports without Bash heredoc hacks.

### 3. Outcome-not-process presentation

Verify (and pipeline) render as a **compact task card**, not the raw RunPanel:
`Verifying Button…` (spinner) → on done, read `getVerification` and show
`✓ passed` or `⚠ 2 issues` with the top finding, plus "View details" → the existing
RunPanel/Run screen. The RunPanel stays reachable, just not the default surface. Reuse
the roster refresh already wired on `run.status === "done"` so rows flip to
verified/has-issues from files.

### 4. Build → verify pipeline for "the rest"

`buildAndVerifyRest()` iterates the detected (unbuilt) components and, per component,
runs one background op that chains Apply then Verify in a single prompt (the CLI's
mandatory sequence: generate-artifacts → implement → visual-verify → adversarial-review),
on the current branch, ending with a per-component PASS/ISSUES line. A single gate/card
summarizes "built & verified k/n; m need attention." Sequential (not parallel) to avoid
clobbering shared files (`components.json`, tokens). Per-row Build and Verify remain for
one-offs. "Build & verify the rest" replaces the plain "Build all detected" as the
primary CTA; "Build only (no verify)" stays available as a secondary.

### 5. Reconnect + no double-start

- On mount, GuidedFlow checks for an active run (via `useLatestRun`/run-manager state)
  and, if one belongs to this project, adopts it so returning shows live status and the
  correct card.
- While any op is running, Build/Verify/Re-scan/pipeline start buttons are disabled with
  a "a run is in progress" hint — prevents a second concurrent run on the same files.

## Risks / tradeoffs

- **Storybook bootstrap cost**: first verify in a fresh project pays a one-time
  `/storybook` setup (install + config). Mitigated by idempotence + a clear "Setting up
  the preview harness…" status; subsequent verifies skip it.
- **No browser driver headless**: true pixel diffing isn't fully autonomous; we lean on
  Figma-MCP screenshots + code-level audit and are explicit in the report about what was
  and wasn't machine-checked. Honest and non-interactive beats fake-complete.
- **Sequential pipeline latency**: building+verifying N components in series is slower
  than parallel, but parallel writes to shared files would corrupt the inventory. The
  reconnect work lets the user walk away meanwhile.

## Invariants honored

Claude Code executes every skill (no re-implemented agent logic); same CLI steps in the
same order; spec-first gates preserved (the pipeline still writes specs before code and
stops on blockers); local-first (harness + reports are project files); arg-array spawns
confined to the project; never `--bare`.
