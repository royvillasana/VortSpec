import type { IRPatch } from '@/types/ir';

export const mockPatches: IRPatch[] = [
  // 1. Promote #FFFFFF — user, 2 min ago
  {
    id: 'patch_007',
    summary: 'Promote #FFFFFF to color/surface/base',
    author: 'user',
    status: 'applied',
    operations: [
      { op: 'add', path: '/tokens/tok_014', from: undefined, to: '{ name: "color/surface/base", value: "#FFFFFF" }' },
      { op: 'replace', path: '/components/comp_001/bindings/4/tokenId', from: undefined, to: 'tok_014' },
      { op: 'replace', path: '/components/comp_003/bindings/0/tokenId', from: undefined, to: 'tok_014' },
    ],
    baseVersion: 13,
    resultVersion: 14,
    createdAt: '2026-07-04T11:58:00Z',
  },

  // 2. Rename 18 color tokens — assistant, 1h ago
  {
    id: 'patch_006',
    summary: 'Rename 18 color tokens to follow category/shade convention',
    author: 'assistant',
    status: 'applied',
    operations: [
      { op: 'replace', path: '/tokens/tok_001/name', from: 'blue-500', to: 'color/primary/500' },
      { op: 'replace', path: '/tokens/tok_002/name', from: 'blue-600', to: 'color/primary/600' },
      { op: 'replace', path: '/tokens/tok_003/name', from: 'blue-700', to: 'color/primary/700' },
      { op: 'replace', path: '/tokens/tok_004/name', from: 'gray-50', to: 'color/neutral/50' },
      { op: 'replace', path: '/tokens/tok_005/name', from: 'gray-100', to: 'color/neutral/100' },
      { op: 'replace', path: '/tokens/tok_006/name', from: 'gray-200', to: 'color/neutral/200' },
      { op: 'replace', path: '/tokens/tok_007/name', from: 'gray-300', to: 'color/neutral/300' },
      { op: 'replace', path: '/tokens/tok_008/name', from: 'gray-400', to: 'color/neutral/400' },
      { op: 'replace', path: '/tokens/tok_009/name', from: 'gray-500', to: 'color/neutral/500' },
      { op: 'replace', path: '/tokens/tok_010/name', from: 'gray-600', to: 'color/neutral/600' },
      { op: 'replace', path: '/tokens/tok_011/name', from: 'gray-700', to: 'color/neutral/700' },
      { op: 'replace', path: '/tokens/tok_012/name', from: 'gray-800', to: 'color/neutral/800' },
      { op: 'replace', path: '/tokens/tok_013/name', from: 'gray-900', to: 'color/neutral/900' },
      { op: 'replace', path: '/tokens/tok_016/name', from: 'violet', to: 'color/accent/violet' },
      { op: 'replace', path: '/tokens/tok_017/name', from: 'teal', to: 'color/accent/teal' },
      { op: 'replace', path: '/tokens/tok_018/name', from: 'green-500', to: 'color/success/500' },
      { op: 'replace', path: '/tokens/tok_019/name', from: 'yellow-500', to: 'color/warning/500' },
      { op: 'replace', path: '/tokens/tok_020/name', from: 'red-500', to: 'color/error/500' },
    ],
    baseVersion: 12,
    resultVersion: 13,
    createdAt: '2026-07-04T11:00:00Z',
  },

  // 3. Normalize spacing — assistant, 1h ago
  {
    id: 'patch_005',
    summary: 'Normalize spacing scale to 4px grid',
    author: 'assistant',
    status: 'applied',
    operations: [
      { op: 'replace', path: '/tokens/tok_031/value', from: '3px', to: '2px' },
      { op: 'replace', path: '/tokens/tok_032/value', from: '5px', to: '4px' },
      { op: 'replace', path: '/tokens/tok_033/value', from: '10px', to: '8px' },
      { op: 'replace', path: '/tokens/tok_034/value', from: '14px', to: '12px' },
      { op: 'replace', path: '/tokens/tok_038/value', from: '30px', to: '32px' },
      { op: 'replace', path: '/tokens/tok_039/value', from: '50px', to: '48px' },
    ],
    baseVersion: 11,
    resultVersion: 12,
    createdAt: '2026-07-04T10:55:00Z',
  },

  // 4. Round Button corners — assistant, rejected, 1h ago
  {
    id: 'patch_004',
    summary: 'Round Button corners to 12px',
    author: 'assistant',
    status: 'rejected',
    operations: [
      { op: 'replace', path: '/components/comp_001/bindings/1/tokenId', from: 'tok_041', to: 'tok_042' },
    ],
    baseVersion: 11,
    resultVersion: undefined,
    createdAt: '2026-07-04T10:50:00Z',
  },

  // 5. Confirm axis size on Button — user, Yesterday
  {
    id: 'patch_003',
    summary: 'Confirm axis "size" on Button',
    author: 'user',
    status: 'applied',
    operations: [
      { op: 'replace', path: '/components/comp_001/variantAxes/1/provenance/confidence', from: 'inferred', to: 'confirmed' },
    ],
    baseVersion: 10,
    resultVersion: 11,
    createdAt: '2026-07-03T16:20:00Z',
  },

  // 6. Merge grey tokens — user, Yesterday
  {
    id: 'patch_002',
    summary: 'Merge 3 grey tokens into color/neutral/500',
    author: 'user',
    status: 'applied',
    operations: [
      { op: 'remove', path: '/tokens/tok_extra_1' },
      { op: 'remove', path: '/tokens/tok_extra_2' },
      { op: 'replace', path: '/tokens/tok_009/usageCount', from: '6', to: '19' },
    ],
    baseVersion: 9,
    resultVersion: 10,
    createdAt: '2026-07-03T15:40:00Z',
  },

  // 7. Initial import — pipeline, Jul 2
  {
    id: 'patch_001',
    summary: 'Imported stitch-export-checkout.zip',
    author: 'pipeline',
    status: 'applied',
    operations: [
      { op: 'add', path: '/project', to: '{ name: "Meridian Design System" }' },
      { op: 'add', path: '/tokens', to: '(48 tokens)' },
      { op: 'add', path: '/components', to: '(12 components)' },
    ],
    baseVersion: 0,
    resultVersion: 1,
    createdAt: '2026-07-02T14:30:00Z',
  },
];
