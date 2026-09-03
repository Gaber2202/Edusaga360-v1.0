#!/usr/bin/env node
/**
 * Render a release-notes HTML file to PDF via Puppeteer.
 *
 * Usage:
 *   node scripts/generateReleaseNotesPdf.mjs [input.html] [output.pdf]
 *
 * Defaults:
 *   docs/releases/RELEASE_NOTES_v0.3.0-p4.html
 *   docs/releases/RELEASE_NOTES_v0.3.0-p4.pdf
 */
import { readFileSync, existsSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const require = createRequire(join(repoRoot, 'backend/package.json'));
const puppeteer = require('puppeteer');

const inputHtml = resolve(repoRoot, process.argv[2] || 'docs/releases/RELEASE_NOTES_v0.3.0-p4.html');
const outputPdf = resolve(repoRoot, process.argv[3] || inputHtml.replace(/\.html$/i, '.pdf'));

if (!existsSync(inputHtml)) {
  console.error(`Input not found: ${inputHtml}`);
  process.exit(1);
}

const html = readFileSync(inputHtml, 'utf8');

const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});

try {
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle0' });
  await page.emulateMediaType('print');
  await page.pdf({
    path: outputPdf,
    format: 'A4',
    printBackground: true,
    margin: { top: '18mm', right: '14mm', bottom: '18mm', left: '14mm' },
    displayHeaderFooter: true,
    headerTemplate: '<span></span>',
    footerTemplate:
      '<div style="width:100%;font-size:8px;color:#64748b;text-align:center;padding:0 14mm;">EduSaga 360 Release Notes · Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>',
  });
  console.log(`Wrote ${outputPdf}`);
} finally {
  await browser.close();
}
