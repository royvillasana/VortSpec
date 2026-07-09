// Vite/Vitest `?raw` imports inline a file's contents as a string. The IDE MCP
// server ships as a standalone `.mjs`; the bridge imports its source this way so
// it can write a temp copy to spawn, keeping one source of truth without any
// bundler-path assumptions.
declare module "*?raw" {
  const source: string;
  export default source;
}
