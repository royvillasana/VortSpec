import React, { type JSX } from "react";
import { UsageWarning } from "@vortspec/ui/UsageWarning";

void React; // classic JSX runtime in the support dir needs React in scope
import { useUsageWarning } from "@vortspec/ui/useUsageWarning";

/** Drives the real UsageWarning banner off the hook (which reads the mocked /usage). */
export function UsageWarningHarness(): JSX.Element {
  const u = useUsageWarning({ intervalMs: 10_000_000 });
  return u.warning ? <UsageWarning warning={u.warning} onDismiss={u.dismiss} /> : <div>no warning yet</div>;
}
