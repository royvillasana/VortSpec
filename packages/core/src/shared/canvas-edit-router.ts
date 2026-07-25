/**
 * The Playground edit classification rule (change: instant-playground-edits).
 *
 * ONE function decides where every Playground edit goes. It is input-modality-first,
 * resolvability-second, and it encodes two hard invariants from the spec:
 *
 *   1. The AI is reached ONLY from a language `prompt` — never as a side effect of a
 *      direct-manipulation handler.
 *   2. A handler edit routes to `deterministic` (write source via an AST codemod) OR
 *      `handoff` (keep the optimistic overlay, withhold the write, offer an EXPLICIT
 *      "ask the assistant" action) — but NEVER silently to the AI.
 *
 * Pure and dependency-free so both the renderer (to route a gesture) and the main
 * process (to accept a deterministic write) share the identical rule.
 */

/** Where an edit originated. A handler is a direct manipulation; a prompt is language intent. */
export type EditSource = "handler" | "prompt";

/**
 * The direct-manipulation operations that can be written to source deterministically.
 * Structural: insert / move / grab (reparent) / duplicate / delete. Field: prop / style /
 * variant / text. (`token` stays its own existing deterministic path.)
 */
export type HandlerOp =
  | "insert"
  | "move"
  | "grab"
  | "duplicate"
  | "delete"
  | "prop"
  | "style"
  | "variant"
  | "text";

/** The static-guard result for a handler's target JSX anchor. */
export interface Resolvability {
  /** True when the anchor is a direct JSX child with a stable location (not inside a
   *  `.map()`/loop, conditional, or opaque HOC). */
  resolvable: boolean;
  /** Why it isn't resolvable — surfaced to the user in the hand-off offer. */
  reason?: string;
}

/** The three destinations an edit can be routed to. */
export type Route =
  /** Write the change to source via an AST codemod — no AI. */
  | { path: "deterministic"; op: HandlerOp }
  /** Language intent → the assistant. The ONLY route to the AI. */
  | { path: "ai"; via: "prompt" }
  /** A handler op whose target isn't statically resolvable: keep the optimistic overlay,
   *  withhold the write, and offer an explicit assistant hand-off. Never auto-runs the AI. */
  | { path: "handoff"; op: HandlerOp; reason: string };

export interface EditInput {
  source: EditSource;
  /** Required when `source === "handler"`. */
  op?: HandlerOp;
  /** Required when `source === "handler"` — the result of the static resolvability guard. */
  resolvability?: Resolvability;
}

const DEFAULT_UNRESOLVABLE_REASON =
  "This element isn't statically resolvable (it's rendered dynamically, e.g. inside a list or condition).";

/**
 * Classify an edit into exactly one route. Input-modality first: a `prompt` is the only
 * path to the AI; a `handler` never reaches the AI on its own — it is deterministic when
 * its target resolves, otherwise an explicit hand-off.
 */
export function classifyEdit(input: EditInput): Route {
  if (input.source === "prompt") {
    // Language intent is the sole trigger for the AI.
    return { path: "ai", via: "prompt" };
  }

  // source === "handler": deterministic or hand-off — never the AI.
  const op = input.op;
  if (!op) {
    // A handler with no operation is a programming error; fail closed to a hand-off so we
    // never silently do the wrong thing (and never reach the AI).
    return { path: "handoff", op: "prop", reason: "No operation was provided for this manipulation." };
  }

  const resolvable = input.resolvability?.resolvable === true;
  if (resolvable) {
    return { path: "deterministic", op };
  }
  return {
    path: "handoff",
    op,
    reason: input.resolvability?.reason?.trim() || DEFAULT_UNRESOLVABLE_REASON,
  };
}

/**
 * The load-bearing invariant, exposed as a predicate for callers and tests: a handler-sourced
 * edit is NEVER allowed to reach the AI implicitly. Only `source === "prompt"` may.
 */
export function reachesAi(route: Route, source: EditSource): boolean {
  const isAi = route.path === "ai";
  // An AI route is legal only when the edit came from a language prompt.
  return isAi && source === "prompt";
}
