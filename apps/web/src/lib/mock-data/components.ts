import type {
  ComponentIR,
  Provenance,
  VariantAxis,
  PropDefinition,
  ComponentState,
  StructureNode,
  NodeBinding,
  CompletenessReport,
} from '@/types/ir';

// ─── Helper factories ──────────────────────────────────────────────────────

const confirmed = (source = 'figma-export'): Provenance => ({
  confidence: 'confirmed',
  source,
  extractor: 'component-parser-v2',
  importedAt: '2026-07-02T14:30:00Z',
});

const inferred = (source = 'figma-export'): Provenance => ({
  confidence: 'inferred',
  source,
  extractor: 'component-parser-v2',
  importedAt: '2026-07-02T14:30:00Z',
});

const pending = (source = 'zip-upload'): Provenance => ({
  confidence: 'pending',
  source,
  extractor: 'component-parser-v2',
  importedAt: '2026-07-02T14:30:00Z',
});

// ─── 1. Button ─────────────────────────────────────────────────────────────

const buttonVariantAxes: VariantAxis[] = [
  { name: 'intent', options: ['primary', 'secondary', 'ghost'], provenance: confirmed() },
  { name: 'size', options: ['sm', 'md', 'lg'], provenance: confirmed() },
];

const buttonProps: PropDefinition[] = [
  { name: 'label', type: 'string', default: 'Button', controlHint: 'text', provenance: confirmed() },
  { name: 'intent', type: 'enum', default: 'primary', controlHint: 'select', options: ['primary', 'secondary', 'ghost'], provenance: confirmed() },
  { name: 'size', type: 'enum', default: 'md', controlHint: 'select', options: ['sm', 'md', 'lg'], provenance: confirmed() },
  { name: 'disabled', type: 'boolean', default: 'false', controlHint: 'toggle', provenance: confirmed() },
  { name: 'iconLeft', type: 'boolean', default: 'false', controlHint: 'toggle', provenance: inferred() },
];

const buttonStates: ComponentState[] = [
  { name: 'default', provenance: confirmed() },
  { name: 'hover', provenance: confirmed() },
  { name: 'focus', provenance: confirmed() },
  { name: 'disabled', provenance: confirmed() },
  { name: 'active', provenance: inferred() },
];

const buttonBindings: NodeBinding[] = [
  { nodePath: 'Button', property: 'background', tokenId: 'tok_001', flagged: false },
  { nodePath: 'Button', property: 'border-radius', tokenId: 'tok_042', flagged: false },
  { nodePath: 'Button', property: 'padding-x', tokenId: 'tok_036', flagged: false },
  { nodePath: 'Button', property: 'padding-y', tokenId: 'tok_034', flagged: false },
  { nodePath: 'Button > Label', property: 'color', tokenId: 'tok_014', flagged: false },
  { nodePath: 'Button > Label', property: 'font', tokenId: 'tok_028', flagged: false },
  { nodePath: 'Button:hover', property: 'background', tokenId: 'tok_002', flagged: false },
  { nodePath: 'Button:disabled', property: 'opacity', literalValue: '0.5', flagged: true },
];

const buttonStructure: StructureNode = {
  tag: 'button',
  name: 'Button',
  depth: 0,
  bindings: [
    { nodePath: 'Button', property: 'background', tokenId: 'tok_001', flagged: false },
    { nodePath: 'Button', property: 'border-radius', tokenId: 'tok_042', flagged: false },
    { nodePath: 'Button', property: 'padding-x', tokenId: 'tok_036', flagged: false },
    { nodePath: 'Button', property: 'padding-y', tokenId: 'tok_034', flagged: false },
  ],
  children: [
    {
      tag: 'span',
      name: 'IconSlot',
      depth: 1,
      bindings: [
        { nodePath: 'Button > IconSlot', property: 'size', tokenId: 'tok_036', flagged: false },
      ],
    },
    {
      tag: 'span',
      name: 'Label',
      depth: 1,
      bindings: [
        { nodePath: 'Button > Label', property: 'color', tokenId: 'tok_014', flagged: false },
        { nodePath: 'Button > Label', property: 'font', tokenId: 'tok_028', flagged: false },
      ],
    },
  ],
};

const buttonCompleteness: CompletenessReport = {
  score: 82,
  checks: [
    { name: 'All variants defined', passed: true, value: '3 axes, 9 combinations' },
    { name: 'All states documented', passed: true, value: '5 states' },
    { name: 'Token bindings complete', passed: false, value: '7/8 bound', detail: 'Button:disabled opacity uses raw value 0.5' },
    { name: 'Props have defaults', passed: true, value: '5/5 have defaults' },
    { name: 'Accessibility', passed: false, value: 'Missing focus ring spec', detail: 'No focus-visible binding found' },
    { name: 'Documentation', passed: true, value: 'Description present' },
  ],
};

const buttonComponent: ComponentIR = {
  id: 'comp_001',
  name: 'Button',
  status: 'normalized',
  variantAxes: buttonVariantAxes,
  props: buttonProps,
  states: buttonStates,
  structure: buttonStructure,
  bindings: buttonBindings,
  completeness: buttonCompleteness,
  provenance: confirmed(),
  version: 14,
};

// ─── 2. Input ──────────────────────────────────────────────────────────────

const inputComponent: ComponentIR = {
  id: 'comp_002',
  name: 'Input',
  status: 'normalized',
  variantAxes: [
    { name: 'size', options: ['sm', 'md', 'lg'], provenance: confirmed() },
    { name: 'state', options: ['default', 'error', 'success'], provenance: inferred() },
  ],
  props: [
    { name: 'placeholder', type: 'string', default: 'Enter text...', controlHint: 'text', provenance: confirmed() },
    { name: 'size', type: 'enum', default: 'md', controlHint: 'select', options: ['sm', 'md', 'lg'], provenance: confirmed() },
    { name: 'disabled', type: 'boolean', default: 'false', controlHint: 'toggle', provenance: confirmed() },
    { name: 'label', type: 'string', default: 'Label', controlHint: 'text', provenance: confirmed() },
    { name: 'helperText', type: 'string', controlHint: 'text', provenance: inferred() },
    { name: 'error', type: 'boolean', default: 'false', controlHint: 'toggle', provenance: confirmed() },
  ],
  states: [
    { name: 'default', provenance: confirmed() },
    { name: 'focus', provenance: confirmed() },
    { name: 'disabled', provenance: confirmed() },
    { name: 'error', provenance: confirmed() },
  ],
  structure: {
    tag: 'div',
    name: 'InputWrapper',
    depth: 0,
    bindings: [
      { nodePath: 'InputWrapper', property: 'gap', tokenId: 'tok_032', flagged: false },
    ],
    children: [
      {
        tag: 'label',
        name: 'Label',
        depth: 1,
        bindings: [
          { nodePath: 'InputWrapper > Label', property: 'font', tokenId: 'tok_028', flagged: false },
          { nodePath: 'InputWrapper > Label', property: 'color', tokenId: 'tok_012', flagged: false },
        ],
      },
      {
        tag: 'input',
        name: 'Field',
        depth: 1,
        bindings: [
          { nodePath: 'InputWrapper > Field', property: 'border', literalValue: '1px solid #E2E8F0', flagged: true },
          { nodePath: 'InputWrapper > Field', property: 'border-radius', tokenId: 'tok_041', flagged: false },
          { nodePath: 'InputWrapper > Field', property: 'padding', tokenId: 'tok_035', flagged: false },
          { nodePath: 'InputWrapper > Field', property: 'font', tokenId: 'tok_026', flagged: false },
          { nodePath: 'InputWrapper > Field', property: 'background', tokenId: 'tok_014', flagged: false },
        ],
      },
      {
        tag: 'span',
        name: 'HelperText',
        depth: 1,
        bindings: [
          { nodePath: 'InputWrapper > HelperText', property: 'font', tokenId: 'tok_027', flagged: false },
          { nodePath: 'InputWrapper > HelperText', property: 'color', tokenId: 'tok_010', flagged: false },
        ],
      },
    ],
  },
  bindings: [
    { nodePath: 'InputWrapper', property: 'gap', tokenId: 'tok_032', flagged: false },
    { nodePath: 'InputWrapper > Label', property: 'font', tokenId: 'tok_028', flagged: false },
    { nodePath: 'InputWrapper > Label', property: 'color', tokenId: 'tok_012', flagged: false },
    { nodePath: 'InputWrapper > Field', property: 'border', literalValue: '1px solid #E2E8F0', flagged: true },
    { nodePath: 'InputWrapper > Field', property: 'border-radius', tokenId: 'tok_041', flagged: false },
    { nodePath: 'InputWrapper > Field', property: 'padding', tokenId: 'tok_035', flagged: false },
    { nodePath: 'InputWrapper > Field', property: 'font', tokenId: 'tok_026', flagged: false },
    { nodePath: 'InputWrapper > Field', property: 'background', tokenId: 'tok_014', flagged: false },
    { nodePath: 'InputWrapper > HelperText', property: 'font', tokenId: 'tok_027', flagged: false },
    { nodePath: 'InputWrapper > HelperText', property: 'color', tokenId: 'tok_010', flagged: false },
  ],
  completeness: {
    score: 68,
    checks: [
      { name: 'All variants defined', passed: true, value: '2 axes, 9 combinations' },
      { name: 'All states documented', passed: true, value: '4 states' },
      { name: 'Token bindings complete', passed: false, value: '9/10 bound', detail: 'Field border uses raw value "1px solid #E2E8F0"' },
      { name: 'Props have defaults', passed: false, value: '4/6 have defaults', detail: 'helperText and error missing defaults' },
      { name: 'Accessibility', passed: false, value: 'Label association unclear', detail: 'No explicit htmlFor / aria-labelledby' },
      { name: 'Documentation', passed: true, value: 'Description present' },
    ],
  },
  provenance: confirmed(),
  version: 14,
};

// ─── 3. Card ───────────────────────────────────────────────────────────────

const cardComponent: ComponentIR = {
  id: 'comp_003',
  name: 'Card',
  status: 'normalized',
  variantAxes: [
    { name: 'elevation', options: ['flat', 'raised', 'outlined'], provenance: confirmed() },
    { name: 'padding', options: ['compact', 'default', 'spacious'], provenance: inferred() },
  ],
  props: [
    { name: 'elevation', type: 'enum', default: 'raised', controlHint: 'select', options: ['flat', 'raised', 'outlined'], provenance: confirmed() },
    { name: 'padding', type: 'enum', default: 'default', controlHint: 'select', options: ['compact', 'default', 'spacious'], provenance: inferred() },
    { name: 'clickable', type: 'boolean', default: 'false', controlHint: 'toggle', provenance: inferred() },
  ],
  states: [
    { name: 'default', provenance: confirmed() },
    { name: 'hover', provenance: inferred() },
  ],
  structure: {
    tag: 'div',
    name: 'Card',
    depth: 0,
    bindings: [
      { nodePath: 'Card', property: 'background', tokenId: 'tok_014', flagged: false },
      { nodePath: 'Card', property: 'border-radius', tokenId: 'tok_042', flagged: false },
      { nodePath: 'Card', property: 'box-shadow', tokenId: 'tok_047', flagged: false },
      { nodePath: 'Card', property: 'padding', tokenId: 'tok_036', flagged: false },
    ],
    children: [
      {
        tag: 'div',
        name: 'CardHeader',
        depth: 1,
        bindings: [
          { nodePath: 'Card > CardHeader', property: 'padding-bottom', tokenId: 'tok_035', flagged: false },
        ],
        children: [
          {
            tag: 'h3',
            name: 'Title',
            depth: 2,
            bindings: [
              { nodePath: 'Card > CardHeader > Title', property: 'font', tokenId: 'tok_024', flagged: false },
              { nodePath: 'Card > CardHeader > Title', property: 'color', tokenId: 'tok_013', flagged: false },
            ],
          },
          {
            tag: 'p',
            name: 'Subtitle',
            depth: 2,
            bindings: [
              { nodePath: 'Card > CardHeader > Subtitle', property: 'font', tokenId: 'tok_026', flagged: false },
              { nodePath: 'Card > CardHeader > Subtitle', property: 'color', tokenId: 'tok_010', flagged: false },
            ],
          },
        ],
      },
      {
        tag: 'div',
        name: 'CardBody',
        depth: 1,
        bindings: [],
      },
      {
        tag: 'div',
        name: 'CardFooter',
        depth: 1,
        bindings: [
          { nodePath: 'Card > CardFooter', property: 'border-top', literalValue: '1px solid #E2E8F0', flagged: true },
          { nodePath: 'Card > CardFooter', property: 'padding-top', tokenId: 'tok_035', flagged: false },
        ],
      },
    ],
  },
  bindings: [
    { nodePath: 'Card', property: 'background', tokenId: 'tok_014', flagged: false },
    { nodePath: 'Card', property: 'border-radius', tokenId: 'tok_042', flagged: false },
    { nodePath: 'Card', property: 'box-shadow', tokenId: 'tok_047', flagged: false },
    { nodePath: 'Card', property: 'padding', tokenId: 'tok_036', flagged: false },
    { nodePath: 'Card > CardHeader', property: 'padding-bottom', tokenId: 'tok_035', flagged: false },
    { nodePath: 'Card > CardHeader > Title', property: 'font', tokenId: 'tok_024', flagged: false },
    { nodePath: 'Card > CardHeader > Title', property: 'color', tokenId: 'tok_013', flagged: false },
    { nodePath: 'Card > CardHeader > Subtitle', property: 'font', tokenId: 'tok_026', flagged: false },
    { nodePath: 'Card > CardHeader > Subtitle', property: 'color', tokenId: 'tok_010', flagged: false },
    { nodePath: 'Card > CardFooter', property: 'border-top', literalValue: '1px solid #E2E8F0', flagged: true },
    { nodePath: 'Card > CardFooter', property: 'padding-top', tokenId: 'tok_035', flagged: false },
  ],
  completeness: {
    score: 74,
    checks: [
      { name: 'All variants defined', passed: true, value: '2 axes, 9 combinations' },
      { name: 'All states documented', passed: false, value: '2 states', detail: 'Hover state is inferred, not confirmed' },
      { name: 'Token bindings complete', passed: false, value: '10/11 bound', detail: 'CardFooter border-top uses raw value' },
      { name: 'Props have defaults', passed: true, value: '3/3 have defaults' },
      { name: 'Accessibility', passed: true, value: 'Semantic heading used' },
      { name: 'Documentation', passed: false, value: 'No description', detail: 'Component description is missing' },
    ],
  },
  provenance: confirmed(),
  version: 14,
};

// ─── 4. Modal ──────────────────────────────────────────────────────────────

const modalComponent: ComponentIR = {
  id: 'comp_004',
  name: 'Modal',
  status: 'normalized',
  variantAxes: [
    { name: 'size', options: ['sm', 'md', 'lg', 'fullscreen'], provenance: confirmed() },
  ],
  props: [
    { name: 'title', type: 'string', default: 'Dialog Title', controlHint: 'text', provenance: confirmed() },
    { name: 'size', type: 'enum', default: 'md', controlHint: 'select', options: ['sm', 'md', 'lg', 'fullscreen'], provenance: confirmed() },
    { name: 'showClose', type: 'boolean', default: 'true', controlHint: 'toggle', provenance: confirmed() },
    { name: 'overlayDismiss', type: 'boolean', default: 'true', controlHint: 'toggle', provenance: inferred() },
  ],
  states: [
    { name: 'open', provenance: confirmed() },
    { name: 'closing', provenance: pending() },
  ],
  structure: {
    tag: 'div',
    name: 'ModalOverlay',
    depth: 0,
    bindings: [
      { nodePath: 'ModalOverlay', property: 'background', literalValue: 'rgba(0,0,0,0.5)', flagged: true },
    ],
    children: [
      {
        tag: 'div',
        name: 'ModalContainer',
        depth: 1,
        bindings: [
          { nodePath: 'ModalOverlay > ModalContainer', property: 'background', tokenId: 'tok_014', flagged: false },
          { nodePath: 'ModalOverlay > ModalContainer', property: 'border-radius', tokenId: 'tok_043', flagged: false },
          { nodePath: 'ModalOverlay > ModalContainer', property: 'box-shadow', tokenId: 'tok_048', flagged: false },
          { nodePath: 'ModalOverlay > ModalContainer', property: 'max-width', literalValue: '560px', flagged: true },
        ],
        children: [
          {
            tag: 'header',
            name: 'ModalHeader',
            depth: 2,
            bindings: [
              { nodePath: 'ModalOverlay > ModalContainer > ModalHeader', property: 'padding', tokenId: 'tok_037', flagged: false },
              { nodePath: 'ModalOverlay > ModalContainer > ModalHeader', property: 'border-bottom', literalValue: '1px solid #E2E8F0', flagged: true },
            ],
            children: [
              {
                tag: 'h2',
                name: 'Title',
                depth: 3,
                bindings: [
                  { nodePath: 'ModalOverlay > ModalContainer > ModalHeader > Title', property: 'font', tokenId: 'tok_024', flagged: false },
                  { nodePath: 'ModalOverlay > ModalContainer > ModalHeader > Title', property: 'color', tokenId: 'tok_013', flagged: false },
                ],
              },
              {
                tag: 'button',
                name: 'CloseButton',
                depth: 3,
                bindings: [
                  { nodePath: 'ModalOverlay > ModalContainer > ModalHeader > CloseButton', property: 'size', literalValue: '24px', flagged: true },
                ],
              },
            ],
          },
          {
            tag: 'div',
            name: 'ModalBody',
            depth: 2,
            bindings: [
              { nodePath: 'ModalOverlay > ModalContainer > ModalBody', property: 'padding', tokenId: 'tok_037', flagged: false },
            ],
          },
          {
            tag: 'footer',
            name: 'ModalFooter',
            depth: 2,
            bindings: [
              { nodePath: 'ModalOverlay > ModalContainer > ModalFooter', property: 'padding', tokenId: 'tok_036', flagged: false },
              { nodePath: 'ModalOverlay > ModalContainer > ModalFooter', property: 'gap', tokenId: 'tok_034', flagged: false },
            ],
          },
        ],
      },
    ],
  },
  bindings: [
    { nodePath: 'ModalOverlay', property: 'background', literalValue: 'rgba(0,0,0,0.5)', flagged: true },
    { nodePath: 'ModalOverlay > ModalContainer', property: 'background', tokenId: 'tok_014', flagged: false },
    { nodePath: 'ModalOverlay > ModalContainer', property: 'border-radius', tokenId: 'tok_043', flagged: false },
    { nodePath: 'ModalOverlay > ModalContainer', property: 'box-shadow', tokenId: 'tok_048', flagged: false },
    { nodePath: 'ModalOverlay > ModalContainer', property: 'max-width', literalValue: '560px', flagged: true },
    { nodePath: 'ModalOverlay > ModalContainer > ModalHeader', property: 'padding', tokenId: 'tok_037', flagged: false },
    { nodePath: 'ModalOverlay > ModalContainer > ModalHeader', property: 'border-bottom', literalValue: '1px solid #E2E8F0', flagged: true },
    { nodePath: 'ModalOverlay > ModalContainer > ModalHeader > Title', property: 'font', tokenId: 'tok_024', flagged: false },
    { nodePath: 'ModalOverlay > ModalContainer > ModalHeader > Title', property: 'color', tokenId: 'tok_013', flagged: false },
    { nodePath: 'ModalOverlay > ModalContainer > ModalHeader > CloseButton', property: 'size', literalValue: '24px', flagged: true },
    { nodePath: 'ModalOverlay > ModalContainer > ModalBody', property: 'padding', tokenId: 'tok_037', flagged: false },
    { nodePath: 'ModalOverlay > ModalContainer > ModalFooter', property: 'padding', tokenId: 'tok_036', flagged: false },
    { nodePath: 'ModalOverlay > ModalContainer > ModalFooter', property: 'gap', tokenId: 'tok_034', flagged: false },
  ],
  completeness: {
    score: 55,
    checks: [
      { name: 'All variants defined', passed: true, value: '1 axis, 4 combinations' },
      { name: 'All states documented', passed: false, value: '2 states', detail: '"closing" state is pending confirmation' },
      { name: 'Token bindings complete', passed: false, value: '9/13 bound', detail: '4 raw values: overlay bg, max-width, border, close size' },
      { name: 'Props have defaults', passed: true, value: '4/4 have defaults' },
      { name: 'Accessibility', passed: false, value: 'Missing aria-modal, role="dialog"', detail: 'No ARIA attributes found in structure' },
      { name: 'Documentation', passed: false, value: 'No description', detail: 'Component description is missing' },
    ],
  },
  provenance: confirmed(),
  version: 14,
};

// ─── 5. Badge ──────────────────────────────────────────────────────────────

const badgeComponent: ComponentIR = {
  id: 'comp_005',
  name: 'Badge',
  status: 'approved',
  variantAxes: [
    { name: 'intent', options: ['neutral', 'primary', 'success', 'warning', 'error'], provenance: confirmed() },
    { name: 'size', options: ['sm', 'md'], provenance: confirmed() },
  ],
  props: [
    { name: 'label', type: 'string', default: 'Badge', controlHint: 'text', provenance: confirmed() },
    { name: 'intent', type: 'enum', default: 'neutral', controlHint: 'select', options: ['neutral', 'primary', 'success', 'warning', 'error'], provenance: confirmed() },
    { name: 'size', type: 'enum', default: 'md', controlHint: 'select', options: ['sm', 'md'], provenance: confirmed() },
    { name: 'dot', type: 'boolean', default: 'false', controlHint: 'toggle', provenance: confirmed() },
  ],
  states: [
    { name: 'default', provenance: confirmed() },
  ],
  structure: {
    tag: 'span',
    name: 'Badge',
    depth: 0,
    bindings: [
      { nodePath: 'Badge', property: 'background', tokenId: 'tok_005', flagged: false },
      { nodePath: 'Badge', property: 'border-radius', tokenId: 'tok_045', flagged: false },
      { nodePath: 'Badge', property: 'padding-x', tokenId: 'tok_034', flagged: false },
      { nodePath: 'Badge', property: 'padding-y', tokenId: 'tok_031', flagged: false },
    ],
    children: [
      {
        tag: 'span',
        name: 'Dot',
        depth: 1,
        bindings: [
          { nodePath: 'Badge > Dot', property: 'size', tokenId: 'tok_032', flagged: false },
          { nodePath: 'Badge > Dot', property: 'background', tokenId: 'tok_001', flagged: false },
          { nodePath: 'Badge > Dot', property: 'border-radius', tokenId: 'tok_045', flagged: false },
        ],
      },
      {
        tag: 'span',
        name: 'Label',
        depth: 1,
        bindings: [
          { nodePath: 'Badge > Label', property: 'font', tokenId: 'tok_027', flagged: false },
          { nodePath: 'Badge > Label', property: 'color', tokenId: 'tok_001', flagged: false },
        ],
      },
    ],
  },
  bindings: [
    { nodePath: 'Badge', property: 'background', tokenId: 'tok_005', flagged: false },
    { nodePath: 'Badge', property: 'border-radius', tokenId: 'tok_045', flagged: false },
    { nodePath: 'Badge', property: 'padding-x', tokenId: 'tok_034', flagged: false },
    { nodePath: 'Badge', property: 'padding-y', tokenId: 'tok_031', flagged: false },
    { nodePath: 'Badge > Dot', property: 'size', tokenId: 'tok_032', flagged: false },
    { nodePath: 'Badge > Dot', property: 'background', tokenId: 'tok_001', flagged: false },
    { nodePath: 'Badge > Dot', property: 'border-radius', tokenId: 'tok_045', flagged: false },
    { nodePath: 'Badge > Label', property: 'font', tokenId: 'tok_027', flagged: false },
    { nodePath: 'Badge > Label', property: 'color', tokenId: 'tok_001', flagged: false },
  ],
  completeness: {
    score: 91,
    checks: [
      { name: 'All variants defined', passed: true, value: '2 axes, 10 combinations' },
      { name: 'All states documented', passed: true, value: '1 state (stateless component)' },
      { name: 'Token bindings complete', passed: true, value: '9/9 bound' },
      { name: 'Props have defaults', passed: true, value: '4/4 have defaults' },
      { name: 'Accessibility', passed: true, value: 'Semantic span with role implied' },
      { name: 'Documentation', passed: false, value: 'No description', detail: 'Component description is missing' },
    ],
  },
  provenance: confirmed(),
  version: 14,
};

// ─── Export ────────────────────────────────────────────────────────────────

export const mockComponents: ComponentIR[] = [
  buttonComponent,
  inputComponent,
  cardComponent,
  modalComponent,
  badgeComponent,
];
