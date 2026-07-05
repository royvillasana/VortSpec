/**
 * Electron integration — detect if running inside Electron and call IPC.
 * In cloud mode (no Electron), all functions return graceful fallbacks.
 */

interface VortSpecBridge {
  isElectron: boolean;
  runClaude: (prompt: string) => Promise<{ success: boolean; output: string; error?: string }>;
  startStorybook: () => Promise<unknown>;
  stopStorybook: () => Promise<unknown>;
  getProcessStatus: () => Promise<Record<string, { running: boolean; port?: number }>>;
  onTerminalData: (callback: (data: string) => void) => void;
  subscribeTerminal: () => void;
}

declare global {
  interface Window {
    vortspec?: VortSpecBridge;
  }
}

export function isElectron(): boolean {
  return typeof window !== "undefined" && !!window.vortspec?.isElectron;
}

export function isCloud(): boolean {
  return !isElectron();
}

export async function runClaude(prompt: string): Promise<{ success: boolean; output: string; error?: string }> {
  if (!isElectron()) {
    return { success: false, output: "", error: "Claude CLI is only available in the desktop app" };
  }
  return window.vortspec!.runClaude(prompt);
}

export async function startStorybook(): Promise<void> {
  if (isElectron()) {
    await window.vortspec!.startStorybook();
  }
}

export async function getProcessStatus(): Promise<Record<string, { running: boolean; port?: number }>> {
  if (!isElectron()) return {};
  return window.vortspec!.getProcessStatus();
}

export function onTerminalData(callback: (data: string) => void): void {
  if (isElectron()) {
    window.vortspec!.subscribeTerminal();
    window.vortspec!.onTerminalData(callback);
  }
}
