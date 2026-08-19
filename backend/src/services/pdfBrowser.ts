import puppeteer from 'puppeteer';

let browserInstance: Awaited<ReturnType<typeof puppeteer.launch>> | null = null;
let launchPromise: Promise<Awaited<ReturnType<typeof puppeteer.launch>>> | null = null;
let launchAttempted = false;

export async function getBrowser() {
  if (browserInstance && browserInstance.connected) return browserInstance;
  if (launchPromise) return launchPromise;
  if (launchAttempted && !browserInstance) {
    launchAttempted = false;
  }
  if (launchAttempted) {
    throw new Error('Browser singleton has already been instantiated once; a second instantiation is not allowed.');
  }
  launchAttempted = true;
  launchPromise = puppeteer
    .launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    })
    .then((b) => {
      browserInstance = b;
      return b;
    })
    .catch((err) => {
      launchAttempted = false;
      browserInstance = null;
      throw err;
    });
  try {
    return await launchPromise;
  } finally {
    launchPromise = null;
  }
}
