/**
 * Background auto-persist scheduler for instant Playground edits (change:
 * instant-playground-edits, Group 5). Models Instatic's `usePersistence`: a manual edit
 * applies to the preview optimistically and is written to source here — debounced (rapid
 * edits collapse into one write), single-flight (at most one write on the wire + one queued
 * follow-up), and non-blocking (the edit loop never waits on it).
 *
 * The `persist` callback drains the dirty set itself, so this only sequences WHEN it runs.
 * Timer fns are injectable for deterministic tests.
 */
export interface AutoPersist {
  /** A new edit landed — schedule a (debounced) write. */
  schedule(): void;
  /** Persist now (Cmd+S / unmount / before a move so source is current), bypassing the debounce.
   *  Awaitable — resolves once the pending writes (and any single-flight follow-up) have drained. */
  flush(): Promise<void>;
  /** True while a write is on the wire. */
  readonly busy: boolean;
  /** Cancel any pending timer (teardown). */
  dispose(): void;
}

export interface AutoPersistOptions {
  /** Write everything currently dirty; drains the dirty set itself. */
  persist: () => Promise<void>;
  /** Debounce window (ms). Default 400 — tight, since a local codemod is fast. */
  debounceMs?: number;
  /** Called when a persist rejects, so the UI can surface a fixable notice (the optimistic
   *  edit is retained regardless). */
  onError?: (err: unknown) => void;
  setTimer?: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimer?: (t: ReturnType<typeof setTimeout>) => void;
}

export function createAutoPersist(opts: AutoPersistOptions): AutoPersist {
  const debounce = opts.debounceMs ?? 400;
  const set = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clr = opts.clearTimer ?? ((t) => clearTimeout(t));

  let timer: ReturnType<typeof setTimeout> | null = null;
  let inFlight = false;
  let queued = false;

  const run = async (): Promise<void> => {
    // Single-flight: a request during a write coalesces into ONE follow-up. The owner run drains
    // every follow-up before resolving, so `await run()` (via flush) truly waits for a settled disk.
    if (inFlight) {
      queued = true;
      return;
    }
    inFlight = true;
    try {
      do {
        queued = false;
        try {
          await opts.persist();
        } catch (err) {
          opts.onError?.(err);
        }
      } while (queued);
    } finally {
      inFlight = false;
    }
  };

  const clearTimer = (): void => {
    if (timer !== null) {
      clr(timer);
      timer = null;
    }
  };

  return {
    schedule() {
      clearTimer(); // reset the debounce so a burst collapses into one write
      timer = set(() => {
        timer = null;
        void run();
      }, debounce);
    },
    flush() {
      clearTimer();
      return run(); // run() drains all follow-ups before resolving
    },
    get busy() {
      return inFlight;
    },
    dispose() {
      clearTimer();
    },
  };
}
