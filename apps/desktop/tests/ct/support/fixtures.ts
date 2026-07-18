/** Deterministic fixture data for the Inspector / Playground component tests. */
import type {
  Project,
  InspectorTokensResult,
  InspectorComponentsResult,
} from "@vortspec/core/ipc";
import type { RunEvent } from "@vortspec/core/run-events";

export const PROJECT: Project = {
  id: "proj-1",
  name: "Acme DS",
  path: "/tmp/acme-ds",
  toolkit: { present: true, configured: true, version: "1.0.0", updateAvailable: false },
  lastRunStatus: "approved",
  addedAt: "2026-01-01T00:00:00.000Z",
};

/** Tokens across types, one drifted from Figma, one Figma-only variable. */
export const TOKENS: InspectorTokensResult = {
  tokenFile: "src/tokens.css",
  figmaSynced: true,
  figmaOnly: [{ name: "color/surface", resolvedValue: "#141518", type: "color" }],
  // The mode-aware fields (change: figma-native-token-model). The mock returns this
  // fixture verbatim (no zod defaults applied), so these MUST be present — the
  // Inspector does `collections.find(...)` during render and crashes on undefined.
  collections: [],
  activeCollection: null,
  activeMode: null,
  modeMap: {},
  usage: {
    "color-primary": [{ component: "Button", property: "background" }],
    "radius-md": [{ component: "Card", property: "rounded" }],
  },
  tokens: [
    {
      name: "color-primary",
      type: "color",
      rawValue: "#7C6FF0",
      resolvedValue: "#7C6FF0",
      source: "figma-variable",
      uses: 1,
      figmaValue: "#7C6FF0",
      drift: "in-sync",
    },
    {
      name: "color-text",
      type: "color",
      rawValue: "#E7E9EC",
      resolvedValue: "#E7E9EC",
      source: "figma-variable",
      uses: 0,
      figmaValue: "#111111",
      drift: "drifted",
    },
    {
      name: "radius-md",
      type: "radius",
      rawValue: "8px",
      resolvedValue: "8px",
      source: "generated-code",
      uses: 1,
    },
  ],
};

export const COMPONENTS: InspectorComponentsResult = {
  componentDir: "src/components",
  previewUrl: null,
  components: [
    {
      name: "Button",
      level: "atom",
      description: "Primary action",
      file: "src/components/Button.tsx",
      props: [
        { key: "variant", kind: "enum", options: ["primary", "ghost"], defaultValue: "primary" },
        { key: "disabled", kind: "boolean", options: ["true", "false"] },
      ],
      tokens: ["color-primary", "color-text"],
      status: "verified",
      issues: [],
      specPath: "specs/button/spec.md",
      reportPath: "specs/button/visual-verify-report.md",
    },
    {
      name: "Card",
      level: "molecule",
      description: "Container",
      file: "src/components/Card.tsx",
      props: [],
      tokens: ["radius-md"],
      status: "has-issues",
      issues: ["D2 Contrast too low"],
      specPath: null,
      reportPath: null,
    },
  ],
};

/** A recorded harness-generation transcript: init → tool writes → prose → done. */
export const HARNESS_TRANSCRIPT: RunEvent[] = [
  {
    kind: "system-init",
    model: "claude-opus-4-8",
    sessionId: "sess-1",
    tools: ["Read", "Write", "Edit", "Bash"],
    mcpServers: [],
    mcpErrors: [],
  },
  { kind: "tool-use", id: "t1", name: "Write", path: "index.html" },
  { kind: "tool-use", id: "t2", name: "Write", path: "src/main.tsx" },
  { kind: "assistant-text", text: "Created a preview harness that renders every component." },
  { kind: "result", isError: false, text: "Done", sessionId: "sess-1", costUsd: 0.01 },
];
