import { spawn, ChildProcess } from "child_process";
import * as path from "path";

interface ProcessInfo {
  name: string;
  process: ChildProcess | null;
  port?: number;
  running: boolean;
}

/**
 * Manages background processes (Next.js, Storybook, Inngest).
 */
export class ProcessManager {
  private processes: Map<string, ProcessInfo> = new Map();
  private projectRoot: string;

  constructor() {
    // Resolve the monorepo root (apps/desktop/dist/main.js → ../../..)
    this.projectRoot = path.resolve(__dirname, "..", "..", "..");
  }

  private spawnProcess(
    name: string,
    command: string,
    args: string[],
    cwd: string,
    port?: number,
  ): ProcessInfo {
    console.log(`[process-manager] Starting ${name}: ${command} ${args.join(" ")}`);

    const proc = spawn(command, args, {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
      shell: true,
      env: { ...process.env, FORCE_COLOR: "1", VORTSPEC_USE_CLAUDE_CLI: "true" },
    });

    const info: ProcessInfo = { name, process: proc, port, running: true };

    proc.stdout?.on("data", (data: Buffer) => {
      console.log(`[${name}] ${data.toString().trim()}`);
    });

    proc.stderr?.on("data", (data: Buffer) => {
      console.error(`[${name}] ${data.toString().trim()}`);
    });

    proc.on("exit", (code) => {
      console.log(`[${name}] exited with code ${code}`);
      info.running = false;
    });

    this.processes.set(name, info);
    return info;
  }

  startNextDev(): ProcessInfo {
    const webDir = path.join(this.projectRoot, "apps", "web");
    return this.spawnProcess("next", "pnpm", ["dev"], webDir, 3000);
  }

  startStorybook(): ProcessInfo {
    const webDir = path.join(this.projectRoot, "apps", "web");
    return this.spawnProcess(
      "storybook",
      "npx",
      ["storybook", "dev", "--port", "6006", "--no-open"],
      webDir,
      6006,
    );
  }

  stopStorybook(): void {
    const info = this.processes.get("storybook");
    if (info?.process) {
      info.process.kill("SIGTERM");
      info.running = false;
    }
  }

  startInngest(): ProcessInfo {
    return this.spawnProcess(
      "inngest",
      "npx",
      ["inngest-cli@latest", "dev", "--no-discovery", "-u", "http://localhost:3000/api/inngest"],
      this.projectRoot,
      8288,
    );
  }

  stopAll(): void {
    for (const [name, info] of this.processes) {
      if (info.process && info.running) {
        console.log(`[process-manager] Stopping ${name}`);
        info.process.kill("SIGTERM");
        info.running = false;
      }
    }
  }

  getStatus(): Record<string, { running: boolean; port?: number }> {
    const status: Record<string, { running: boolean; port?: number }> = {};
    for (const [name, info] of this.processes) {
      status[name] = { running: info.running, port: info.port };
    }
    return status;
  }
}
