import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const SNAPSHOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../snapshots');

function snapshotPath(name: string, ext: string) {
  return join(SNAPSHOT_DIR, `${name}.${ext}`);
}

export function golden<T extends Buffer | string>(name: string, actual: T, ext: string): T {
  mkdirSync(SNAPSHOT_DIR, { recursive: true });
  const path = snapshotPath(name, ext);
  const actualBuf = Buffer.isBuffer(actual) ? actual : Buffer.from(actual, 'utf8');

  if (!existsSync(path)) {
    if (process.env.UPDATE_GOLDEN === '1') {
      writeFileSync(path, actualBuf);
      return actual;
    }
    throw new Error(
      `Missing golden snapshot ${name}.${ext}. Re-run with UPDATE_GOLDEN=1 to create it.`,
    );
  }

  const expected = readFileSync(path);
  if (Buffer.compare(expected, actualBuf) !== 0) {
    if (process.env.UPDATE_GOLDEN === '1') {
      writeFileSync(path, actualBuf);
      return actual;
    }
    const preview = actualBuf.length < 800
      ? actualBuf.toString('utf8').replace(/\s+/g, ' ').slice(0, 200)
      : `<binary ${actualBuf.length} bytes>`;
    throw new Error(
      `Golden snapshot mismatch for ${name}.${ext}.\n` +
        `Expected: ${expected.length} bytes\n` +
        `Received: ${actualBuf.length} bytes\n` +
        `Preview: ${preview}`,
    );
  }

  return actual;
}
