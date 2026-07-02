import { describe, it, expect, beforeEach, vi } from 'vitest';

// Pin the gate to small, deterministic limits before the module is imported
// (the limits are read from env at module load).
process.env.PDF_MAX_CONCURRENCY = '2';
process.env.PDF_QUEUE_LIMIT = '3';
process.env.PDF_ACQUIRE_TIMEOUT_MS = '10000';

const { runPdfJob, pdfGateStats, PdfQueueSaturatedError } = await import('../lib/pdfConcurrency.js');

/** A job we can hold open until we choose to release it. */
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => { resolve = r; });
  return { promise, resolve };
}

describe('pdf concurrency gate (RF-001a)', () => {
  beforeEach(() => {
    // Drain any residual state between tests.
    expect(pdfGateStats().active).toBe(0);
    expect(pdfGateStats().queued).toBe(0);
  });

  it('never runs more than PDF_MAX_CONCURRENCY jobs at once', async () => {
    let running = 0;
    let peak = 0;
    const gates = Array.from({ length: 5 }, deferred);

    const jobs = gates.map((g, i) =>
      runPdfJob(async () => {
        running++;
        peak = Math.max(peak, running);
        await g.promise;
        running--;
        return i;
      }),
    );

    // Let the scheduler admit the first batch.
    await new Promise((r) => setTimeout(r, 0));
    expect(pdfGateStats().active).toBe(2); // only 2 admitted

    // Release them one at a time; each release should admit exactly one waiter.
    for (const g of gates) {
      g.resolve();
      await new Promise((r) => setTimeout(r, 0));
    }

    await Promise.all(jobs);
    expect(peak).toBe(2);
    expect(pdfGateStats().active).toBe(0);
  });

  it('sheds load with PdfQueueSaturatedError once the queue is full', async () => {
    const gates = Array.from({ length: 2 }, deferred);
    // 2 active (fill concurrency) + 3 queued (fill MAX_QUEUE) = 5 accepted.
    const active = gates.map((g) => runPdfJob(() => g.promise.then(() => 'ok')));
    await new Promise((r) => setTimeout(r, 0));

    const queued = Array.from({ length: 3 }, () =>
      runPdfJob(() => Promise.resolve('queued')),
    );
    await new Promise((r) => setTimeout(r, 0));
    expect(pdfGateStats().queued).toBe(3);

    // The 6th request must be rejected immediately, not queued.
    await expect(runPdfJob(() => Promise.resolve('overflow'))).rejects.toBeInstanceOf(
      PdfQueueSaturatedError,
    );

    // Drain.
    gates.forEach((g) => g.resolve());
    await Promise.all([...active, ...queued]);
    expect(pdfGateStats().active).toBe(0);
    expect(pdfGateStats().queued).toBe(0);
  });

  it('releases the slot even when a job throws', async () => {
    await expect(
      runPdfJob(async () => { throw new Error('boom'); }),
    ).rejects.toThrow('boom');
    expect(pdfGateStats().active).toBe(0);
  });
});
