/**
 * Typed access to the main process, exposed by the preload bridge.
 * Every call is validated against the zod IPC contract in the main process.
 */
export const api = window.vortspec;
