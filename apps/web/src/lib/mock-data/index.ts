import type {
  Project,
  DesignToken,
  ComponentIR,
  Issue,
  IRPatch,
  TokenUsage,
} from '@/types/ir';

import { mockProjects } from './projects';
import { mockTokens } from './tokens';
import { mockComponents } from './components';
import { mockIssues } from './issues';
import { mockPatches } from './patches';

// ─── Async service functions ───────────────────────────────────────────────
// These simulate network latency and mirror the shape of real API calls.

const delay = (ms = 80) => new Promise<void>((r) => setTimeout(r, ms));

export async function getProjects(): Promise<Project[]> {
  await delay();
  return mockProjects;
}

export async function getProject(id: string): Promise<Project | undefined> {
  await delay();
  return mockProjects.find((p) => p.id === id);
}

export async function getTokens(): Promise<DesignToken[]> {
  await delay();
  return mockTokens;
}

export async function getToken(id: string): Promise<DesignToken | undefined> {
  await delay();
  return mockTokens.find((t) => t.id === id);
}

export async function getTokensByKind(kind: string): Promise<DesignToken[]> {
  await delay();
  return mockTokens.filter((t) => t.kind === kind);
}

export async function getComponents(): Promise<ComponentIR[]> {
  await delay();
  return mockComponents;
}

export async function getComponent(id: string): Promise<ComponentIR | undefined> {
  await delay();
  return mockComponents.find((c) => c.id === id);
}

export async function getIssues(): Promise<Issue[]> {
  await delay();
  return mockIssues;
}

export async function getIssuesByComponent(componentId: string): Promise<Issue[]> {
  await delay();
  return mockIssues.filter((i) => i.componentId === componentId);
}

export async function getIssuesBySeverity(severity: string): Promise<Issue[]> {
  await delay();
  return mockIssues.filter((i) => i.severity === severity);
}

export async function getPatches(): Promise<IRPatch[]> {
  await delay();
  return mockPatches;
}

export async function getPatch(id: string): Promise<IRPatch | undefined> {
  await delay();
  return mockPatches.find((p) => p.id === id);
}

export async function getTokenUsages(tokenId: string): Promise<TokenUsage[]> {
  await delay();
  const usages: TokenUsage[] = [];
  for (const comp of mockComponents) {
    for (const binding of comp.bindings) {
      if (binding.tokenId === tokenId) {
        usages.push({
          tokenId,
          componentId: comp.id,
          componentName: comp.name,
          nodePath: binding.nodePath,
          property: binding.property,
        });
      }
    }
  }
  return usages;
}

// ─── Summary helpers ───────────────────────────────────────────────────────

export async function getIssueSummary(): Promise<{
  errors: number;
  warnings: number;
  info: number;
  total: number;
}> {
  await delay();
  const errors = mockIssues.filter((i) => i.severity === 'error').length;
  const warnings = mockIssues.filter((i) => i.severity === 'warning').length;
  const info = mockIssues.filter((i) => i.severity === 'info').length;
  return { errors, warnings, info, total: mockIssues.length };
}

export async function getTokenSummary(): Promise<{
  total: number;
  byKind: Record<string, number>;
  confirmed: number;
  inferred: number;
  pending: number;
}> {
  await delay();
  const byKind: Record<string, number> = {};
  let confirmed = 0;
  let inferred = 0;
  let pending = 0;

  for (const t of mockTokens) {
    byKind[t.kind] = (byKind[t.kind] || 0) + 1;
    if (t.provenance.confidence === 'confirmed') confirmed++;
    else if (t.provenance.confidence === 'inferred') inferred++;
    else pending++;
  }

  return { total: mockTokens.length, byKind, confirmed, inferred, pending };
}

// ─── Re-exports ────────────────────────────────────────────────────────────

export { mockProjects, mockTokens, mockComponents, mockIssues, mockPatches };
