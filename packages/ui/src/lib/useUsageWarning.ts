import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";
import { sessionUsage, nextWarningThreshold, rearmedLastWarned } from "@vortspec/core/usage-warn";

export interface UsageWarning {
  /** Current session usage, 0–100. */
  percent: number;
  /** The threshold that triggered this warning (75 / 85 / 95). */
  threshold: number;
  /** Reset label as Claude reports it, or null. */
  resetsAt: string | null;
}

/**
 * Polls the user's Claude SESSION usage and surfaces a warning as it climbs
 * toward the limit — once at 75%, then again at each +10% step (85%, 95%). Reads
 * the existing `/usage` snapshot (a local, $0 command via `api.getUsage()`), so
 * it adds no model usage of its own. Warns once per threshold; a fresh session
 * (usage dropping back below 75%) re-arms the tracker.
 */
export function useUsageWarning(opts?: { intervalMs?: number; enabled?: boolean }): {
  warning: UsageWarning | null;
  dismiss: () => void;
  refresh: () => void;
} {
  const intervalMs = opts?.intervalMs ?? 4 * 60_000;
  const enabled = opts?.enabled ?? true;
  const [warning, setWarning] = useState<UsageWarning | null>(null);
  // Highest threshold already warned — so we don't repeat the same warning.
  const lastWarned = useRef(0);

  const check = useCallback(async () => {
    const usage = await api.getUsage().catch(() => null);
    if (!usage || !usage.available) return;
    const s = sessionUsage(usage);
    if (!s) return;
    lastWarned.current = rearmedLastWarned(s.percent, lastWarned.current);
    const t = nextWarningThreshold(s.percent, lastWarned.current);
    if (t != null) {
      lastWarned.current = t;
      setWarning({ percent: s.percent, threshold: t, resetsAt: s.resetsAt });
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void check();
    const id = setInterval(() => void check(), intervalMs);
    return () => clearInterval(id);
  }, [enabled, intervalMs, check]);

  return {
    warning,
    // Acknowledge the current warning; it re-appears only at the NEXT threshold.
    dismiss: () => setWarning(null),
    refresh: () => void check(),
  };
}
