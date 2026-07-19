import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildDesignAudit } from "./design-audit";

async function scaffold(dir: string): Promise<void> {
  await mkdir(join(dir, ".sdd-de"), { recursive: true });
  await mkdir(join(dir, ".vortspec"), { recursive: true });
  await mkdir(join(dir, "src/components"), { recursive: true });
  await writeFile(join(dir, ".sdd-de/project.yaml"), "token_file: tokens.css\ncomponent_dir: src/components\n", "utf8");
  await writeFile(join(dir, "tokens.css"), ":root {\n  --color-primary: #0055FF;\n}\n", "utf8");
  await writeFile(join(dir, ".sdd-de/components.json"), JSON.stringify([{ name: "Button" }, { name: "Toolbar" }]), "utf8");
  // Button hardcodes the primary color; Toolbar uses the token correctly.
  await writeFile(join(dir, "src/components/Button.tsx"), "export const Button = () => <button style={{ color: '#0055FF' }}/>;\n", "utf8");
  await writeFile(join(dir, "src/components/Toolbar.tsx"), "export const Toolbar = () => <div style={{ color: 'var(--color-primary)' }}/>;\n", "utf8");
  // Figma has color-primary at a DIFFERENT value → the code token drifted.
  await writeFile(
    join(dir, ".vortspec/figma-variables.json"),
    JSON.stringify({
      collections: [{ name: "Tokens", modes: [{ id: "d", name: "Default" }], defaultModeId: "d" }],
      variables: [{ name: "color-primary", resolvedType: "COLOR", resolvedValue: "#FF0000", valuesByMode: { Default: { value: "#FF0000" } } }],
    }),
    "utf8",
  );
}

describe("buildDesignAudit (Plan B4)", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "vs-audit-"));
    await scaffold(dir);
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("flags a hardcoded color a token already names, and not a correct token use", async () => {
    const audit = await buildDesignAudit(dir);
    const hard = audit.findings.filter((f) => f.kind === "hardcoded-color");
    expect(hard).toHaveLength(1);
    expect(hard[0]).toMatchObject({ component: "Button", severity: "error" });
    expect(hard[0].message).toContain("var(--color-primary)");
    // Toolbar uses the token → no hardcoded finding for it.
    expect(hard.some((f) => f.component === "Toolbar")).toBe(false);
  });

  it("flags a token that drifted from its Figma variable", async () => {
    const audit = await buildDesignAudit(dir);
    const drift = audit.findings.filter((f) => f.kind === "token-drift");
    expect(drift).toHaveLength(1);
    expect(drift[0].message).toContain("color-primary");
    expect(audit.summary.drifted).toBe(1);
  });

  it("ranks errors (hardcoded) before warnings (drift)", async () => {
    const audit = await buildDesignAudit(dir);
    expect(audit.findings[0].severity).toBe("error");
    expect(audit.summary.findings).toBe(audit.findings.length);
  });
});
