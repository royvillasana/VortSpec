# Launch Gate: Anthropic policy on wrapping Claude Code

**Task:** `pivot-to-desktop-cockpit` 0.1
**Date verified:** 2026-07-05
**Status:** ⚠️ Clearable for local development; **written confirmation required before public launch**.

## The question

VortSpec v2 drives the user's **local Claude Code** to do the work. Does Anthropic's current policy permit a third-party desktop app to invoke `claude -p` (headless) using the user's own Claude subscription login?

## What changed in 2026 (why this is a gate)

The policy landscape shifted materially in early-to-mid 2026 (after the assistant's training cutoff — verified via web research):

1. **Feb 2026 — ToS tightened.** Anthropic restricted OAuth authentication to **Claude Code and Claude.ai only**. Consumer ToS (≈ §3.7) forbids automated access tools/harnesses that are not officially endorsed.
2. **Apr 4 2026 — third-party harness ban.** Anthropic blocked third-party *agents using subscription credentials* (e.g. OpenClaw, OpenCode) that **routed requests through a Claude subscription to avoid API costs**, citing infrastructure strain.
3. **Reinstatement "with a catch" — separate credit pool.** Programmatic usage was re-permitted under a **separate credit pool** drawn from the subscription, covering four surfaces:
   - the Claude Agent SDK (Python/TypeScript),
   - **`claude -p` — the non-interactive headless mode** used in scripts/cron,
   - the Claude Code GitHub Actions integration,
   - third-party apps that authenticate with a subscription **through the Agent SDK**.
4. **Agent SDK requires an API key.** OAuth tokens from Free/Pro/Max accounts **cannot** be used with the Agent SDK directly.
5. **Interactive use is untouched** (web/desktop/mobile chat, interactive Claude Code in terminal/IDE).

## Conclusion for VortSpec

**The pivot premise is on the compliant path — with conditions.** The distinction that matters:

- ✅ **Compliant path (what VortSpec must do):** invoke the user's **officially installed `claude` binary** in headless mode (`claude -p …`), using the user's *own* existing Claude Code login. This is the sanctioned `claude -p` surface; usage is metered under the subscription's separate **programmatic credit pool**. VortSpec is not re-implementing auth, not a harness re-routing credentials, and stores no keys.
- ❌ **Non-compliant patterns to avoid:**
  - Re-implementing a harness that injects/reuses the user's OAuth/subscription credentials directly (this is the OpenClaw-style pattern that was banned).
  - Using the Agent SDK with the user's Free/Pro/Max OAuth token (not allowed — the SDK requires an API key).
  - Using `--bare` mode, which **skips OAuth/keychain and requires `ANTHROPIC_API_KEY`** — VortSpec supplying a key violates the "no provider keys ever" principle. **VortSpec must use non-bare `claude -p`** so authentication comes from the user's own login. (See `launch-gate-claude-code-headless.md`.)

### Architectural consequences (feed into design)
- **AgentAdapter must spawn the real `claude` binary, non-bare**, resolving it from the user's PATH/install — never a bundled or re-implemented client.
- **VortSpec never handles credentials.** Login happens through Claude Code's own `/login` (run in the PTY, since `/login` is unavailable in `-p` mode).
- Surface the programmatic-credit-pool reality to the user (usage draws from their subscription's programmatic pool), so billing is transparent.

## Residual risk — before public launch (do NOT ship public without this)
- **Get written confirmation from Anthropic** that a GUI desktop wrapper driving the user's own `claude -p` is permitted, and whether any **third-party self-identification** is required (e.g. a required User-Agent, env var, or `x-app`/client-identifier). Web sources did not conclusively specify a mandatory self-identification mechanism for CLI-driven wrappers — this must be confirmed against official docs/support, not inferred.
- Re-verify at ship time: policy has changed multiple times in 2026 and may change again.

## Sources
- [Anthropic reinstates OpenClaw and third-party agent usage on Claude subscriptions — with a catch (VentureBeat)](https://venturebeat.com/technology/anthropic-reinstates-openclaw-and-third-party-agent-usage-on-claude-subscriptions-with-a-catch)
- [Anthropic cracks down on unauthorized Claude usage by third-party harnesses (VentureBeat)](https://venturebeat.com/technology/anthropic-cracks-down-on-unauthorized-claude-usage-by-third-party-harnesses)
- [Anthropic clarifies ban on third-party tool access to Claude (The Register)](https://www.theregister.com/software/2026/02/20/anthropic-clarifies-ban-on-third-party-tool-access-to-claude/5014546)
- [Anthropic Ends Subscription Subsidy for Agents June 15 (TechTimes)](https://www.techtimes.com/articles/317625/20260602/anthropic-ends-subscription-subsidy-agents-june-15-credit-pool-replaces-flat-rate-access.htm)
- [Is This Allowed? Claude Code Terms of Service Explained (autonomee.ai)](https://autonomee.ai/blog/claude-code-terms-of-service-explained/)
- [Run Claude Code programmatically — official docs](https://code.claude.com/docs/en/headless)

> **These are secondary/press sources plus official CLI docs. The policy conclusion must be confirmed with Anthropic directly (official ToS + support) before any public release.**
