import { spawn, ChildProcess } from "child_process";
import { EventEmitter } from "events";
import * as path from "path";

/**
 * Manages terminal interactions, primarily with the Claude Code CLI.
 * Emits 'output' events with terminal data that can be streamed to the renderer.
 */
export class TerminalManager extends EventEmitter {
  private projectRoot: string;

  constructor() {
    super();
    this.projectRoot = path.resolve(__dirname, "..", "..", "..");
  }

  /**
   * Run a Claude Code CLI command and return the result.
   * Uses `claude --print --output-format json` for structured output.
   */
  async runClaude(prompt: string): Promise<{ success: boolean; output: string; error?: string }> {
    return new Promise((resolve) => {
      this.emit("output", `\n$ claude --print "${prompt.slice(0, 50)}..."\n`);

      const proc = spawn("claude", ["--print", "--output-format", "json", prompt], {
        cwd: this.projectRoot,
        stdio: ["pipe", "pipe", "pipe"],
        shell: true,
        env: process.env,
      });

      let stdout = "";
      let stderr = "";

      proc.stdout?.on("data", (data: Buffer) => {
        const text = data.toString();
        stdout += text;
        this.emit("output", text);
      });

      proc.stderr?.on("data", (data: Buffer) => {
        const text = data.toString();
        stderr += text;
        this.emit("output", `[stderr] ${text}`);
      });

      proc.on("error", (err) => {
        this.emit("output", `[error] ${err.message}\n`);
        resolve({
          success: false,
          output: "",
          error: `Failed to run claude CLI: ${err.message}. Make sure Claude Code is installed.`,
        });
      });

      proc.on("exit", (code) => {
        this.emit("output", `\n[exit code: ${code}]\n`);
        if (code === 0) {
          resolve({ success: true, output: stdout });
        } else {
          resolve({
            success: false,
            output: stdout,
            error: stderr || `Claude CLI exited with code ${code}`,
          });
        }
      });

      // Timeout after 5 minutes
      setTimeout(() => {
        proc.kill("SIGTERM");
        resolve({
          success: false,
          output: stdout,
          error: "Claude CLI timed out after 5 minutes",
        });
      }, 300000);
    });
  }

  /**
   * Run an arbitrary command and stream output.
   */
  async runCommand(command: string, args: string[], cwd?: string): Promise<string> {
    return new Promise((resolve, reject) => {
      this.emit("output", `\n$ ${command} ${args.join(" ")}\n`);

      const proc = spawn(command, args, {
        cwd: cwd ?? this.projectRoot,
        stdio: ["pipe", "pipe", "pipe"],
        shell: true,
      });

      let output = "";

      proc.stdout?.on("data", (data: Buffer) => {
        const text = data.toString();
        output += text;
        this.emit("output", text);
      });

      proc.stderr?.on("data", (data: Buffer) => {
        this.emit("output", data.toString());
      });

      proc.on("exit", (code) => {
        if (code === 0) resolve(output);
        else reject(new Error(`Command exited with code ${code}`));
      });
    });
  }
}
