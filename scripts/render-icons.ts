/**
 * Renders assets/icon.svg to public/icon/{16,32,48,128}.png with a local browser.
 * Run after changing the icon: `PW_CHANNEL=msedge node scripts/render-icons.ts`.
 */
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const SIZES = [16, 32, 48, 128];

const svg = readFileSync(path.join(ROOT, 'assets', 'icon.svg'), 'utf8');
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? 'chromium' });
try {
  for (const size of SIZES) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    await page.setContent(
      `<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`,
    );
    await page.locator('svg').screenshot({
      path: path.join(ROOT, 'public', 'icon', `${size}.png`),
      omitBackground: true,
    });
    await page.close();
  }
} finally {
  await browser.close();
}
console.log(`아이콘 ${SIZES.join(', ')}px를 만들었습니다.`);
