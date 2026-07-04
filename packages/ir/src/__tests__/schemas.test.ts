import { describe, it, expect } from "vitest";
import {
  ComponentIRSchema,
  DesignTokenSchema,
  StyleValueSchema,
  PatchOpSchema,
  IRPatchSchema,
} from "../index";
import buttonFixture from "../__fixtures__/button.json";

describe("ComponentIR Schema", () => {
  it("validates the example Button fixture", () => {
    const result = ComponentIRSchema.safeParse(buttonFixture);
    if (!result.success) {
      console.error("Validation errors:", JSON.stringify(result.error.issues, null, 2));
    }
    expect(result.success).toBe(true);
  });

  it("round-trips the Button fixture (parse then serialize)", () => {
    const parsed = ComponentIRSchema.parse(buttonFixture);
    const serialized = JSON.parse(JSON.stringify(parsed));
    const reparsed = ComponentIRSchema.parse(serialized);
    expect(reparsed).toEqual(parsed);
  });

  it("rejects a component with missing required fields", () => {
    const result = ComponentIRSchema.safeParse({
      id: "cmp_bad",
      name: "Bad",
      // missing: slug, status, version, provenance, structure, etc.
    });
    expect(result.success).toBe(false);
  });
});

describe("StyleValue invariant", () => {
  it("accepts a token reference", () => {
    const result = StyleValueSchema.safeParse({
      kind: "token",
      tokenId: "tok_primary500",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a flagged literal", () => {
    const result = StyleValueSchema.safeParse({
      kind: "literal",
      value: "#FFFFFF",
      flagged: true,
    });
    expect(result.success).toBe(true);
  });

  it("rejects an unflagged literal (core invariant)", () => {
    const result = StyleValueSchema.safeParse({
      kind: "literal",
      value: "#FFFFFF",
      flagged: false,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a literal without the flagged field", () => {
    const result = StyleValueSchema.safeParse({
      kind: "literal",
      value: "#FFFFFF",
    });
    expect(result.success).toBe(false);
  });
});

describe("DesignToken Schema", () => {
  it("validates a color token", () => {
    const result = DesignTokenSchema.safeParse({
      id: "tok_primary500",
      name: "color/primary/500",
      type: "color",
      value: { type: "color", value: { hex: "#2563EB" } },
      provenance: {
        source: "zip-html",
        extractor: "zip-html/token-miner@1",
        extractedAt: "2026-07-04T10:12:00Z",
        confidence: "confirmed",
        confirmedBy: "user",
      },
    },
    );
    if (!result.success) {
      console.error(JSON.stringify(result.error.issues, null, 2));
    }
    expect(result.success).toBe(true);
  });

  it("rejects a token with invalid type", () => {
    const result = DesignTokenSchema.safeParse({
      id: "tok_bad",
      name: "bad",
      type: "nonexistent",
      value: { type: "color", value: { hex: "#000" } },
      provenance: {
        source: "zip-html",
        extractor: "test",
        extractedAt: "2026-07-04T10:00:00Z",
        confidence: "confirmed",
      },
    });
    expect(result.success).toBe(false);
  });
});

describe("PatchOp Schema", () => {
  it("validates token.delete with inline-literal fallback", () => {
    const result = PatchOpSchema.safeParse({
      op: "token.delete",
      tokenId: "tok_old",
      fallback: "inline-literal",
    });
    expect(result.success).toBe(true);
  });

  it("validates token.delete with replacement token fallback", () => {
    const result = PatchOpSchema.safeParse({
      op: "token.delete",
      tokenId: "tok_old",
      fallback: { replacementTokenId: "tok_new" },
    });
    expect(result.success).toBe(true);
  });

  it("rejects token.delete without fallback", () => {
    const result = PatchOpSchema.safeParse({
      op: "token.delete",
      tokenId: "tok_old",
      // missing fallback — this must fail
    });
    expect(result.success).toBe(false);
  });
});

describe("IRPatch Schema", () => {
  it("validates a complete patch", () => {
    const result = IRPatchSchema.safeParse({
      id: "pat_001",
      projectId: "proj_001",
      ops: [
        {
          op: "token.update",
          tokenId: "tok_primary500",
          changes: { name: "color/brand/500" },
        },
      ],
      summary: "Rename primary token",
      generatedBy: "user",
      status: "applied",
      createdAt: "2026-07-04T11:00:00Z",
      baseVersion: 2,
    });
    if (!result.success) {
      console.error(JSON.stringify(result.error.issues, null, 2));
    }
    expect(result.success).toBe(true);
  });
});
