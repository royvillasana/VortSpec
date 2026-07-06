/**
 * Typed access to the main process, exposed by the preload bridge.
 * Every call is validated against the zod IPC contract in the main process.
 *
 * Resolved lazily on each access rather than captured at import time: in
 * production `window.vortspec` is always installed by preload before the
 * renderer bundle runs, so this is behaviourally identical — but it also lets
 * component tests install a stub `window.vortspec` before the first call,
 * regardless of module evaluation order.
 */
export const api: Window["vortspec"] = new Proxy({} as Window["vortspec"], {
  get(_target, prop) {
    const impl = window.vortspec as unknown as Record<string | symbol, unknown> | undefined;
    if (!impl) throw new Error("window.vortspec is not available (preload bridge missing)");
    return impl[prop];
  },
});
