/**
 * Bounded-concurrency gate for Puppeteer/Chromium PDF rendering.
 *
 * RF-001a — fault isolation. Chromium is memory-bound, not CPU-bound. Before
 * this gate, every concurrent request could open a new `page` on the shared
 * browser with no ceiling, so a burst (e.g. 8 AM invoice run) would exhaust
 * Railway container memory and OOM-kill the whole API — taking attendance and
 * login down with it.
 *
 * This caps in-flight renders and bounds the wait queue, so under load excess
 * requests fail fast with a typed error (map to HTTP 503) instead of piling up
 * until the process dies. The `runPdfJob` interface is the seam RF-001b will
 * re-back with a pg-boss worker on a separate service — callers won't change.
 */

/** Thrown when the render gate is saturated; callers should return HTTP 503. */
export class PdfQueueSaturatedError extends Error {
  readonly code = 'PDF_QUEUE_SATURATED';
  constructor(message = 'PDF rendering is at capacity, please retry shortly') {
    super(message);
    this.name = 'PdfQueueSaturatedError';
  }
}

function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  const n = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

// Chromium renders in flight at once. 2 is safe for a ~512MB–1GB Railway box.
const MAX_CONCURRENT = intFromEnv('PDF_MAX_CONCURRENCY', 2);
// Waiters allowed to queue behind the active renders before we shed load.
const MAX_QUEUE = intFromEnv('PDF_QUEUE_LIMIT', 20);
// Max time a job may wait for a slot before giving up.
const ACQUIRE_TIMEOUT_MS = intFromEnv('PDF_ACQUIRE_TIMEOUT_MS', 20_000);

let active = 0;
const waiters: Array<{ resolve: () => void; reject: (e: Error) => void; timer: NodeJS.Timeout }> = [];

function acquire(): Promise<void> {
  if (active < MAX_CONCURRENT) {
    active++;
    return Promise.resolve();
  }
  if (waiters.length >= MAX_QUEUE) {
    return Promise.reject(new PdfQueueSaturatedError());
  }
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      const idx = waiters.findIndex((w) => w.timer === timer);
      if (idx !== -1) waiters.splice(idx, 1);
      reject(new PdfQueueSaturatedError('PDF render timed out waiting for a slot'));
    }, ACQUIRE_TIMEOUT_MS);
    waiters.push({ resolve, reject, timer });
  });
}

function release(): void {
  const next = waiters.shift();
  if (next) {
    clearTimeout(next.timer);
    next.resolve(); // hands the just-freed slot straight to the next waiter
    return;
  }
  active = Math.max(0, active - 1);
}

/** Run a PDF render under the concurrency gate. Rejects fast when saturated. */
export async function runPdfJob<T>(job: () => Promise<T>): Promise<T> {
  await acquire();
  try {
    return await job();
  } finally {
    release();
  }
}

/** Test/introspection helper. */
export function pdfGateStats() {
  return { active, queued: waiters.length, maxConcurrent: MAX_CONCURRENT, maxQueue: MAX_QUEUE };
}
