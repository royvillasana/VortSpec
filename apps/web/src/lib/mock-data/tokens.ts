import type { DesignToken, Provenance } from '@/types/ir';

// ─── Helper factories ──────────────────────────────────────────────────────

const confirmed = (source = 'figma-export'): Provenance => ({
  confidence: 'confirmed',
  source,
  extractor: 'token-extractor-v2',
  importedAt: '2026-07-02T14:30:00Z',
});

const inferred = (source = 'figma-export'): Provenance => ({
  confidence: 'inferred',
  source,
  extractor: 'token-extractor-v2',
  importedAt: '2026-07-02T14:30:00Z',
});

const pending = (source = 'zip-upload'): Provenance => ({
  confidence: 'pending',
  source,
  extractor: 'token-extractor-v2',
  importedAt: '2026-07-02T14:30:00Z',
});

let _id = 0;
const nextId = () => `tok_${String(++_id).padStart(3, '0')}`;

// ─── Color tokens ──────────────────────────────────────────────────────────

const colorTokens: DesignToken[] = [
  // Primary scale
  { id: nextId(), name: 'color/primary/500', kind: 'color', value: '{color.blue.500}', resolvedValue: '#2563EB', alias: 'color.blue.500', provenance: confirmed(), usageCount: 34, deprecated: false },
  { id: nextId(), name: 'color/primary/600', kind: 'color', value: '{color.blue.600}', resolvedValue: '#1D4ED8', alias: 'color.blue.600', provenance: confirmed(), usageCount: 18, deprecated: false },
  { id: nextId(), name: 'color/primary/700', kind: 'color', value: '{color.blue.700}', resolvedValue: '#1E40AF', alias: 'color.blue.700', provenance: confirmed(), usageCount: 8, deprecated: false },

  // Neutral scale
  { id: nextId(), name: 'color/neutral/50', kind: 'color', value: '#F8FAFC', resolvedValue: '#F8FAFC', provenance: confirmed(), usageCount: 22, deprecated: false },
  { id: nextId(), name: 'color/neutral/100', kind: 'color', value: '#F1F5F9', resolvedValue: '#F1F5F9', provenance: confirmed(), usageCount: 16, deprecated: false },
  { id: nextId(), name: 'color/neutral/200', kind: 'color', value: '#E2E8F0', resolvedValue: '#E2E8F0', provenance: confirmed(), usageCount: 14, deprecated: false },
  { id: nextId(), name: 'color/neutral/300', kind: 'color', value: '#CBD5E1', resolvedValue: '#CBD5E1', provenance: confirmed(), usageCount: 11, deprecated: false },
  { id: nextId(), name: 'color/neutral/400', kind: 'color', value: '#94A3B8', resolvedValue: '#94A3B8', provenance: inferred(), usageCount: 9, deprecated: false },
  { id: nextId(), name: 'color/neutral/500', kind: 'color', value: '#64748B', resolvedValue: '#64748B', provenance: confirmed(), usageCount: 19, deprecated: false },
  { id: nextId(), name: 'color/neutral/600', kind: 'color', value: '#475569', resolvedValue: '#475569', provenance: confirmed(), usageCount: 12, deprecated: false },
  { id: nextId(), name: 'color/neutral/700', kind: 'color', value: '#334155', resolvedValue: '#334155', provenance: confirmed(), usageCount: 7, deprecated: false },
  { id: nextId(), name: 'color/neutral/800', kind: 'color', value: '#1E293B', resolvedValue: '#1E293B', provenance: confirmed(), usageCount: 15, deprecated: false },
  { id: nextId(), name: 'color/neutral/900', kind: 'color', value: '#0F172A', resolvedValue: '#0F172A', provenance: confirmed(), usageCount: 21, deprecated: false },

  // Surface
  { id: nextId(), name: 'color/surface/base', kind: 'color', value: '#FFFFFF', resolvedValue: '#FFFFFF', provenance: confirmed(), usageCount: 28, deprecated: false },
  { id: nextId(), name: 'color/surface/subtle', kind: 'color', value: '{color.neutral.50}', resolvedValue: '#F8FAFC', alias: 'color.neutral.50', provenance: confirmed(), usageCount: 17, deprecated: false },

  // Accent
  { id: nextId(), name: 'color/accent/violet', kind: 'color', value: '#7C3AED', resolvedValue: '#7C3AED', provenance: inferred(), usageCount: 6, deprecated: false },
  { id: nextId(), name: 'color/accent/teal', kind: 'color', value: '#0D9488', resolvedValue: '#0D9488', provenance: confirmed(), usageCount: 5, deprecated: false },

  // Semantic
  { id: nextId(), name: 'color/success/500', kind: 'color', value: '#22C55E', resolvedValue: '#22C55E', provenance: confirmed(), usageCount: 10, deprecated: false },
  { id: nextId(), name: 'color/warning/500', kind: 'color', value: '#F59E0B', resolvedValue: '#F59E0B', provenance: confirmed(), usageCount: 8, deprecated: false },
  { id: nextId(), name: 'color/error/500', kind: 'color', value: '#EF4444', resolvedValue: '#EF4444', provenance: confirmed(), usageCount: 12, deprecated: false },
  { id: nextId(), name: 'color/info/500', kind: 'color', value: '#3B82F6', resolvedValue: '#3B82F6', provenance: inferred(), usageCount: 4, deprecated: false },

  // Border / overlay
  { id: nextId(), name: 'color/border/default', kind: 'color', value: '{color.neutral.200}', resolvedValue: '#E2E8F0', alias: 'color.neutral.200', provenance: inferred(), usageCount: 13, deprecated: false },
  { id: nextId(), name: 'color/overlay', kind: 'color', value: 'rgba(15,23,42,0.5)', resolvedValue: 'rgba(15,23,42,0.5)', provenance: pending(), usageCount: 3, deprecated: false },
];

// ─── Typography tokens ─────────────────────────────────────────────────────

const typographyTokens: DesignToken[] = [
  { id: nextId(), name: 'type/heading/xl', kind: 'typography', value: '700 30px/36px Inter', resolvedValue: '700 30px/36px Inter', provenance: confirmed(), usageCount: 6, deprecated: false },
  { id: nextId(), name: 'type/heading/lg', kind: 'typography', value: '600 24px/32px Inter', resolvedValue: '600 24px/32px Inter', provenance: confirmed(), usageCount: 10, deprecated: false },
  { id: nextId(), name: 'type/heading/md', kind: 'typography', value: '600 20px/28px Inter', resolvedValue: '600 20px/28px Inter', provenance: confirmed(), usageCount: 14, deprecated: false },
  { id: nextId(), name: 'type/body/lg', kind: 'typography', value: '400 18px/28px Inter', resolvedValue: '400 18px/28px Inter', provenance: confirmed(), usageCount: 8, deprecated: false },
  { id: nextId(), name: 'type/body/md', kind: 'typography', value: '400 14px/20px Inter', resolvedValue: '400 14px/20px Inter', provenance: confirmed(), usageCount: 26, deprecated: false },
  { id: nextId(), name: 'type/body/sm', kind: 'typography', value: '400 12px/16px Inter', resolvedValue: '400 12px/16px Inter', provenance: inferred(), usageCount: 15, deprecated: false },
  { id: nextId(), name: 'type/label', kind: 'typography', value: '500 14px/20px Inter', resolvedValue: '500 14px/20px Inter', provenance: confirmed(), usageCount: 20, deprecated: false },
  { id: nextId(), name: 'type/caption', kind: 'typography', value: '400 11px/14px Inter', resolvedValue: '400 11px/14px Inter', provenance: pending(), usageCount: 7, deprecated: false },
  { id: nextId(), name: 'type/code', kind: 'typography', value: '400 13px/20px "JetBrains Mono"', resolvedValue: '400 13px/20px "JetBrains Mono"', provenance: confirmed(), usageCount: 3, deprecated: false },
];

// ─── Spacing tokens ────────────────────────────────────────────────────────

const spacingTokens: DesignToken[] = [
  { id: nextId(), name: 'spacing/0.5', kind: 'spacing', value: '2px', resolvedValue: '2px', provenance: confirmed(), usageCount: 5, deprecated: false },
  { id: nextId(), name: 'spacing/1', kind: 'spacing', value: '4px', resolvedValue: '4px', provenance: confirmed(), usageCount: 18, deprecated: false },
  { id: nextId(), name: 'spacing/2', kind: 'spacing', value: '8px', resolvedValue: '8px', provenance: confirmed(), usageCount: 24, deprecated: false },
  { id: nextId(), name: 'spacing/3', kind: 'spacing', value: '12px', resolvedValue: '12px', provenance: confirmed(), usageCount: 16, deprecated: false },
  { id: nextId(), name: 'spacing/4', kind: 'spacing', value: '16px', resolvedValue: '16px', provenance: confirmed(), usageCount: 22, deprecated: false },
  { id: nextId(), name: 'spacing/6', kind: 'spacing', value: '24px', resolvedValue: '24px', provenance: confirmed(), usageCount: 14, deprecated: false },
  { id: nextId(), name: 'spacing/8', kind: 'spacing', value: '32px', resolvedValue: '32px', provenance: inferred(), usageCount: 9, deprecated: false },
  { id: nextId(), name: 'spacing/12', kind: 'spacing', value: '48px', resolvedValue: '48px', provenance: confirmed(), usageCount: 4, deprecated: false },
];

// ─── Radius tokens ─────────────────────────────────────────────────────────

const radiusTokens: DesignToken[] = [
  { id: nextId(), name: 'radius/sm', kind: 'radius', value: '4px', resolvedValue: '4px', provenance: confirmed(), usageCount: 12, deprecated: false },
  { id: nextId(), name: 'radius/md', kind: 'radius', value: '8px', resolvedValue: '8px', provenance: confirmed(), usageCount: 20, deprecated: false },
  { id: nextId(), name: 'radius/lg', kind: 'radius', value: '12px', resolvedValue: '12px', provenance: confirmed(), usageCount: 10, deprecated: false },
  { id: nextId(), name: 'radius/xl', kind: 'radius', value: '16px', resolvedValue: '16px', provenance: inferred(), usageCount: 5, deprecated: false },
  { id: nextId(), name: 'radius/full', kind: 'radius', value: '999px', resolvedValue: '999px', provenance: confirmed(), usageCount: 8, deprecated: false },
];

// ─── Shadow tokens ─────────────────────────────────────────────────────────

const shadowTokens: DesignToken[] = [
  { id: nextId(), name: 'shadow/sm', kind: 'shadow', value: '0 1px 2px rgba(0,0,0,0.05)', resolvedValue: '0 1px 2px rgba(0,0,0,0.05)', provenance: confirmed(), usageCount: 11, deprecated: false },
  { id: nextId(), name: 'shadow/md', kind: 'shadow', value: '0 4px 6px -1px rgba(0,0,0,0.1)', resolvedValue: '0 4px 6px -1px rgba(0,0,0,0.1)', provenance: confirmed(), usageCount: 8, deprecated: false },
  { id: nextId(), name: 'shadow/lg', kind: 'shadow', value: '0 10px 15px -3px rgba(0,0,0,0.1)', resolvedValue: '0 10px 15px -3px rgba(0,0,0,0.1)', provenance: pending(), usageCount: 2, deprecated: false },
];

// ─── Other tokens ─────────────────────────────────────────────────────────

const otherTokens: DesignToken[] = [
  { id: nextId(), name: 'opacity/disabled', kind: 'other', value: '0.5', resolvedValue: '0.5', provenance: inferred(), usageCount: 6, deprecated: false },
  { id: nextId(), name: 'opacity/overlay', kind: 'other', value: '0.4', resolvedValue: '0.4', provenance: confirmed(), usageCount: 3, deprecated: false },
  { id: nextId(), name: 'z-index/modal', kind: 'other', value: '1000', resolvedValue: '1000', provenance: confirmed(), usageCount: 2, deprecated: false },
  { id: nextId(), name: 'z-index/dropdown', kind: 'other', value: '900', resolvedValue: '900', provenance: pending(), usageCount: 4, deprecated: false },
  { id: nextId(), name: 'transition/default', kind: 'other', value: '150ms ease', resolvedValue: '150ms ease', provenance: inferred(), usageCount: 12, deprecated: false },
];

// ─── Export ────────────────────────────────────────────────────────────────

export const mockTokens: DesignToken[] = [
  ...colorTokens,
  ...typographyTokens,
  ...spacingTokens,
  ...radiusTokens,
  ...shadowTokens,
  ...otherTokens,
];
