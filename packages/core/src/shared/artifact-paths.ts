/**
 * Where the generated AI artifacts live — OpenSpec change: agentic-design-system, task 3.1.
 *
 * In `shared/` rather than beside the builder because the query-protocol documents NAME these paths
 * in their prose, and `shared/` cannot import from `main/`. Two copies of a path string is exactly
 * the drift that would have a rule document point an agent at a file that moved.
 */
export const AI_DIR = ".vortspec/ai";
export const INDEX_PATH = `${AI_DIR}/index.toon`;
export const USAGE_PATH = `${AI_DIR}/component-usage.toon`;
export const TOKENS_PATH = `${AI_DIR}/design-tokens.toon`;
export const RULES_DIR = `${AI_DIR}/rules`;
