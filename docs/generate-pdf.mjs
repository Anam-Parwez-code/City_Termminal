/**
 * Generate PDF from City_Terminal_DFF_10X_Project_Brief.html
 * Usage: node docs/generate-pdf.mjs
 */
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.join(__dirname, 'City_Terminal_DFF_10X_Project_Brief.html');
const pdfPath = path.join(__dirname, 'City_Terminal_DFF_10X_Project_Brief.pdf');

if (!fs.existsSync(htmlPath)) {
  console.error('HTML not found:', htmlPath);
  process.exit(1);
}

const puppeteer = await import('puppeteer').catch(() => null);
if (!puppeteer?.default) {
  console.error('Install puppeteer: npm install puppeteer --no-save (in docs or project root)');
  process.exit(1);
}

const browser = await puppeteer.default.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});
const page = await browser.newPage();
await page.goto(`file:///${htmlPath.replace(/\\/g, '/')}`, {
  waitUntil: 'networkidle0',
});
await page.pdf({
  path: pdfPath,
  format: 'A4',
  printBackground: true,
  margin: { top: '12mm', right: '12mm', bottom: '14mm', left: '12mm' },
});
await browser.close();
console.log('PDF written:', pdfPath);
