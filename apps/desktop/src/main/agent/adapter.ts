import { spawn, type ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { parseStreamLine } from "./events";
import type { AgentRunOptions, RunEvent } from "../../shared/run-events";

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
    if (opts.resumeSessionId) {
      args.push("--resume", opts.resumeSessionId);
    }

    this.child = spawn("claude", args, {
      cwd: opts.cwd,
      env: process.env,
      shell: false,
    });

    this.child.stdout?.on("data", (chunk: Buffer) => this.onStdout(chunk.toString()));
    this.child.stderr?.on("data", (chunk: Buffer) => {
      const text = chunk.toString().trim();
      if (text) this.emitEvent({ kind: "notice", text });
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
