import puppeteer from 'puppeteer';

let browserInstance: Awaited<ReturnType<typeof puppeteer.launch>> | null = null;
let browserCreated = false;

export async function getBrowser() {
  if (!browserInstance || !browserInstance.connected) {
    if (browserCreated) {
      throw new Error('Browser singleton has already been instantiated once; a second instantiation is not allowed.');
    }
    browserCreated = true;
    browserInstance = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
  }
  return browserInstance;
}
