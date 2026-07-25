import { describe, expect, it } from "vitest";
import { classifyEdit, reachesAi, type HandlerOp, type Route } from "./canvas-edit-router";

const HANDLER_OPS: HandlerOp[] = ["insert", "move", "grab", "duplicate", "delete", "prop", "style", "variant", "text"];

describe("classifyEdit — the Playground classification rule", () => {
  it("routes a language prompt to the AI (the only AI path)", () => {
    expect(classifyEdit({ source: "prompt" })).toEqual({ path: "ai", via: "prompt" });
  });

  it("routes every resolvable handler op to a deterministic write — no AI", () => {
    for (const op of HANDLER_OPS) {
      const route = classifyEdit({ source: "handler", op, resolvability: { resolvable: true } });
      expect(route).toEqual({ path: "deterministic", op });
      expect(route.path).not.toBe("ai");
    }
  });

  it("routes an un-resolvable handler op to an explicit hand-off, carrying the reason", () => {
    const route = classifyEdit({
      source: "handler",
      op: "move",
      resolvability: { resolvable: false, reason: "inside a .map()" },
    });
    expect(route).toEqual({ path: "handoff", op: "move", reason: "inside a .map()" });
  });

  it("supplies a default reason when the guard gives none", () => {
    const route = classifyEdit({ source: "handler", op: "delete", resolvability: { resolvable: false } });
    expect(route.path).toBe("handoff");
    expect((route as Extract<Route, { path: "handoff" }>).reason.length).toBeGreaterThan(0);
  });

  it("never routes a handler edit to the AI — for any op, resolvable or not", () => {
    for (const op of HANDLER_OPS) {
      for (const resolvable of [true, false]) {
        const route = classifyEdit({ source: "handler", op, resolvability: { resolvable } });
        expect(route.path).not.toBe("ai");
      }
    }
  });

  it("fails closed to a hand-off when a handler carries no op (never the AI)", () => {
    const route = classifyEdit({ source: "handler" });
    expect(route.path).toBe("handoff");
    expect(route.path).not.toBe("ai");
  });

  it("treats a missing resolvability as un-resolvable (fail closed, not deterministic)", () => {
    const route = classifyEdit({ source: "handler", op: "insert" });
    expect(route.path).toBe("handoff");
  });
});

describe("reachesAi — the never-silent-AI invariant", () => {
  it("is true only for an AI route that came from a prompt", () => {
    expect(reachesAi({ path: "ai", via: "prompt" }, "prompt")).toBe(true);
  });

  it("is false for every handler-sourced route", () => {
    for (const op of HANDLER_OPS) {
      const det = classifyEdit({ source: "handler", op, resolvability: { resolvable: true } });
      const off = classifyEdit({ source: "handler", op, resolvability: { resolvable: false } });
      expect(reachesAi(det, "handler")).toBe(false);
      expect(reachesAi(off, "handler")).toBe(false);
    }
  });

  it("would flag an illegal AI route attributed to a handler source", () => {
    // A defensive check: an AI route must never be paired with a handler source.
    expect(reachesAi({ path: "ai", via: "prompt" }, "handler")).toBe(false);
  });
});
