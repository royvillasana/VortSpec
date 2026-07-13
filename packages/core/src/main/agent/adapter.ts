import { spawn, type ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { parseStreamLine } from "./events";
import type { AgentRunOptions, RunEvent } from "@vortspec/core/run-events";
import { detectUsageLimit } from "@vortspec/core/usage-limit";

/**
 * The AgentAdapter — the single boundary that knows how to invoke Claude Code
 * headless and how its stream is shaped. It spawns the user's own `claude`
 * binary (non-bare, so authentication comes from the user's login), line-buffers
 * stdout, and emits typed `RunEvent`s plus raw lines (for the terminal toggle).
 *
 * Emits:
 *   - "event" (RunEvent)  — typed, friendly events
 *   - "raw"   (string)    — raw stdout lines for the transparency terminal
 */
export class AgentAdapter extends EventEmitter {
  private child: ChildProcess | null = null;
  private stdoutBuffer = "";
  private canceled = false;

  start(opts: AgentRunOptions): void {
    // Argument array only — user input is never interpolated into a shell.
    // NEVER pass --bare: it would require an ANTHROPIC_API_KEY and skip the
    // SDD-DE skills/CLAUDE.md (see docs/launch-gate-anthropic-policy.md).
    const args = [
      "-p",
      opts.prompt,
      "--output-format",
      "stream-json",
      "--verbose",
      "--include-partial-messages",
    ];
    if (opts.appendSystemPrompt) {
      args.push("--append-system-prompt", opts.appendSystemPrompt);
    }
    if (opts.allowedTools && opts.allowedTools.length > 0) {
      args.push("--allowedTools", opts.allowedTools.join(","));
    }
    if (opts.model) {
      args.push("--model", opts.model);
    }
    if (opts.mcpConfigPath) {
      // Load extra MCP servers (e.g. the VortSpec IDE control/read server) for
      // this run. Non-strict: the user's globally configured servers still load.
      args.push("--mcp-config", opts.mcpConfigPath);
    }
    if (opts.strictMcp) {
      // Ignore the user's globally-configured MCP servers (Figma, etc.) for this
      // run — a small source edit doesn't need them, and skipping their startup
      // connections is most of the win. Not `--bare`: skills/CLAUDE.md still load.
      args.push("--strict-mcp-config");
    }
    if (opts.resumeSessionId) {
      args.push("--resume", opts.resumeSessionId);
    }
    if (opts.bypassPermissions) {
      // Headless `-p` cannot prompt; without this, MCP tools (Figma/Stitch)
      // and Bash are auto-denied. Equivalent to `--permission-mode bypassPermissions`.
      args.push("--dangerously-skip-permissions");
    }

    this.child = spawn("claude", args, {
      cwd: opts.cwd,
      env: process.env,
      shell: false,
    });

    this.child.stdout?.on("data", (chunk: Buffer) => this.onStdout(chunk.toString()));
    this.child.stderr?.on("data", (chunk: Buffer) => {
      const text = chunk.toString().trim();
      if (!text) return;
      // The usage-limit message can surface on stderr — treat it as a pause, not
      // a stray notice, so the run halts with a resumable "limit reached" state.
      const limit = detectUsageLimit(text);
      if (limit) {
        this.emitEvent({
          kind: "limit-reached",
          scope: limit.scope,
          resetLabel: limit.resetLabel,
          resetsAt: limit.resetsAt,
          raw: limit.raw,
        });
      }
      this.emitEvent({ kind: "notice", text });
    });
    this.child.on("error", (err: Error) => {
      this.emitEvent({
        kind: "error",
        message: `Could not start Claude Code: ${err.message}. Is it installed and on PATH?`,
      });
    });
    this.child.on("close", (code: number | null) => {
      this.flush();
      if (!this.canceled) this.emitEvent({ kind: "exit", code });
      this.child = null;
    });
  }

  cancel(): void {
    if (this.canceled) return;
    this.canceled = true;
    const child = this.child;
    if (child) {
      child.kill("SIGTERM");
      setTimeout(() => {
        if (!child.killed) child.kill("SIGKILL");
      }, 2000);
    }
    this.emitEvent({ kind: "notice", text: "Run canceled." });
    this.emitEvent({ kind: "exit", code: null });
  }

  private onStdout(chunk: string): void {
    this.stdoutBuffer += chunk;
    let newlineIndex = this.stdoutBuffer.indexOf("\n");
    while (newlineIndex >= 0) {
      const line = this.stdoutBuffer.slice(0, newlineIndex);
      this.stdoutBuffer = this.stdoutBuffer.slice(newlineIndex + 1);
      this.dispatch(line);
      newlineIndex = this.stdoutBuffer.indexOf("\n");
    }
  }

  private flush(): void {
    if (this.stdoutBuffer.trim()) {
      this.dispatch(this.stdoutBuffer);
    }
    this.stdoutBuffer = "";
  }

  private dispatch(line: string): void {
    if (line.trim()) this.emit("raw", line);
    for (const event of parseStreamLine(line)) {
      this.emitEvent(event);
    }
  }

  private emitEvent(event: RunEvent): void {
    this.emit("event", event);
  }
}
