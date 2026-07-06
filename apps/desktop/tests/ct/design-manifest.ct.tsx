import { test, expect } from "@playwright/experimental-ct-react";
import { DesignManifest } from "../../src/renderer/src/views/DesignManifest";
import { PROJECT } from "./support/fixtures";
import type { RunEvent } from "../../src/shared/run-events";

// A recorded design-doc run: init → write DESIGN.md → prose → done.
const DESIGN_DOC_RUN: RunEvent[] = [
  {
    kind: "system-init",
    model: "claude-opus-4-8",
    sessionId: "sess-dd",
    tools: ["Read", "Write", "Edit", "Bash"],
    mcpServers: [],
    mcpErrors: [],
  },
  { kind: "tool-use", id: "t1", name: "Bash", path: undefined },
  { kind: "tool-use", id: "t2", name: "Write", path: "DESIGN.md" },
  { kind: "assistant-text", text: "Generated and validated DESIGN.md." },
  { kind: "result", isError: false, text: "done", sessionId: "sess-dd" },
];

const MD = [
  "# Meridian — Design Context",
  "",
  "## Tokens",
  "",
  "- color/primary/500 #2563EB",
  "- radius/md 8px",
  "",
  "## Components",
  "",
  "### Button",
  "props: variant, size",
].join("\n");

const MANIFEST = { path: "DESIGN.md", content: MD, exists: true };
const EMPTY = { path: "DESIGN.md", content: "", exists: false };
const FLOW_REVIEW = {
  state: { currentStageId: "design-manifest", stages: [{ id: "design-manifest", status: "needs-review" }] },
};
const FLOW_APPROVED = {
  state: { currentStageId: "design-manifest", stages: [{ id: "design-manifest", status: "approved" }] },
};

const noop = (): void => {};
const props = { project: PROJECT, onBack: noop, onOpenRun: noop, onOpenPreview: noop, onOpenHistory: noop };

test("renders the manifest and its path in the rendered view", async ({ mount }) => {
  const c = await mount(<DesignManifest {...props} />, {
    hooksConfig: { mock: { manifest: MANIFEST, flow: FLOW_REVIEW } },
  });
  await expect(c.getByText("Design manifest")).toBeVisible();
  await expect(c.getByText("DESIGN.md").first()).toBeVisible();
  // Rendered markdown: the H1 and a token line.
  await expect(c.getByText("Meridian — Design Context")).toBeVisible();
  await expect(c.getByText("color/primary/500 #2563EB")).toBeVisible();
});

test("toggles to the line-numbered markdown source view", async ({ mount }) => {
  const c = await mount(<DesignManifest {...props} />, {
    hooksConfig: { mock: { manifest: MANIFEST, flow: FLOW_REVIEW } },
  });
  await c.getByRole("button", { name: "markdown", exact: true }).click();
  // File bar with Copy/Download, and the raw heading text with a leading '#'.
  await expect(c.getByRole("button", { name: "Download" })).toBeVisible();
  await expect(c.getByText("# Meridian — Design Context")).toBeVisible();
});

test("shows the review action bar with Approve", async ({ mount }) => {
  const c = await mount(<DesignManifest {...props} />, {
    hooksConfig: { mock: { manifest: MANIFEST, flow: FLOW_REVIEW } },
  });
  await expect(c.getByRole("button", { name: "Approve manifest" })).toBeVisible();
  await expect(c.getByRole("button", { name: "Regenerate" })).toBeVisible();
  await expect(c.getByRole("button", { name: "Edit" })).toBeVisible();
});

test("shows the approved state when the stage is approved", async ({ mount }) => {
  const c = await mount(<DesignManifest {...props} />, {
    hooksConfig: { mock: { manifest: MANIFEST, flow: FLOW_APPROVED } },
  });
  await expect(c.getByText(/Manifest approved and written to/)).toBeVisible();
  await expect(c.getByRole("button", { name: "Approve manifest" })).toHaveCount(0);
});

test("offers a generate CTA when no manifest exists", async ({ mount }) => {
  const c = await mount(<DesignManifest {...props} />, {
    hooksConfig: { mock: { manifest: EMPTY, flow: FLOW_REVIEW } },
  });
  await expect(c.getByText("No manifest yet")).toBeVisible();
  await expect(c.getByRole("button", { name: "Generate DESIGN.md" })).toBeVisible();
});

test("opens the version drawer and lists versions", async ({ mount }) => {
  const c = await mount(<DesignManifest {...props} />, {
    hooksConfig: {
      mock: {
        manifest: MANIFEST,
        flow: FLOW_REVIEW,
        manifestVersions: [
          { id: "2026-07-06T10-00-00-000Z", timestamp: "2026-07-06T10:00:00.000Z", approved: true, size: 512 },
        ],
      },
    },
  });
  await c.getByRole("button", { name: /Versions/ }).click();
  await expect(c.getByText("Version history")).toBeVisible();
  await expect(c.getByText("approved")).toBeVisible();
  await expect(c.getByRole("button", { name: "Restore" })).toBeVisible();
});

test("generates from a recorded transcript, then renders the produced manifest", async ({
  mount,
}) => {
  const c = await mount(<DesignManifest {...props} />, {
    hooksConfig: {
      mock: {
        manifest: EMPTY,
        flow: FLOW_REVIEW,
        runScript: DESIGN_DOC_RUN,
        manifestAfterGenerate: MANIFEST,
      },
    },
  });
  // Empty → click Generate → the recorded design-doc run drives the write, and on
  // completion the produced manifest is read from disk and rendered.
  await c.getByRole("button", { name: "Generate DESIGN.md" }).click();
  await expect(c.getByText("Meridian — Design Context")).toBeVisible();
  await expect(c.getByText("color/primary/500 #2563EB")).toBeVisible();
  await expect(c.getByRole("button", { name: "Approve manifest" })).toBeVisible();
});

test("enters edit mode with the raw source in a textarea", async ({ mount }) => {
  const c = await mount(<DesignManifest {...props} />, {
    hooksConfig: { mock: { manifest: MANIFEST, flow: FLOW_REVIEW } },
  });
  await c.getByRole("button", { name: "Edit" }).click();
  const ta = c.locator("textarea");
  await expect(ta).toBeVisible();
  await expect(ta).toHaveValue(MD);
  await expect(c.getByRole("button", { name: "Save manifest" })).toBeVisible();
});
