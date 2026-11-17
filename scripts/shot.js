#!/usr/bin/env node
// node scripts/shot.js <component> [--width 320] [--dark] [--inspect] [--out file.png] [--page]
//
// Builds dist/, opens the docs gallery in Chromium (Playwright), and saves a screenshot of one component's
// section, e.g. `node scripts/shot.js toggle --width 320 --dark`. <component> is a tag (rs-toggle), a demo
// name (toggle), "core" for the core section, or "page" for the top of the page. Screenshots go to the
// system temp directory unless --out is given; the path is printed. Console errors are printed and make
// the exit code 1.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { build } = require('./build.js');

function args(argv) {
  const o = { width: 1280, dark: false, inspect: false, out: null, page: false, name: null, wait: 600 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--width') o.width = Number(argv[++i]);
    else if (a === '--dark') o.dark = true;
    else if (a === '--inspect') o.inspect = true;
    else if (a === '--out') o.out = argv[++i];
    else if (a === '--page') o.page = true;
    else if (a === '--wait') o.wait = Number(argv[++i]);
    else if (!o.name) o.name = a;
  }
  return o;
}

async function main() {
  const o = args(process.argv.slice(2));
  if (!o.name) {
    console.error('usage: node scripts/shot.js <component> [--width 320] [--dark] [--inspect] [--out file.png] [--page]');
    process.exit(2);
  }
  let playwright;
  try { playwright = require('playwright'); } catch (e) {
    console.error('Playwright is not installed; nothing to do.');
    process.exit(2);
  }
  build();
  const id = o.name === 'core' ? 'core-opening' : o.name === 'page' ? 'top' : o.name.startsWith('rs-') ? o.name : 'rs-' + o.name;
  const browser = await playwright.chromium.launch();
  const page = await browser.newPage({ viewport: { width: o.width, height: 900 }, deviceScaleFactor: 1, colorScheme: o.dark ? 'dark' : 'light' });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  await page.addInitScript(theme => { try { localStorage.setItem('rs-theme', theme); } catch (e) {} }, o.dark ? 'dark' : 'light');
  await page.goto('file://' + path.join(__dirname, '..', 'dist', 'index.html'));
  await page.evaluate(() => document.fonts && document.fonts.ready);
  const target = page.locator('#' + id);
  if (!(await target.count())) {
    console.error(`no section #${id} on the docs page`);
    await browser.close();
    process.exit(2);
  }
  await target.scrollIntoViewIfNeeded();
  if (o.inspect) {
    const xray = target.locator('.xray').first();
    if (await xray.count()) await xray.click();
  }
  await page.waitForTimeout(o.wait);
  const suffix = [o.width, o.dark && 'dark', o.inspect && 'inspect'].filter(Boolean).join('-');
  const out = o.out || path.join(os.tmpdir(), 'redstone-shots', `${id}-${suffix}.png`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  if (o.page) await page.screenshot({ path: out });
  else await target.screenshot({ path: out });
  await browser.close();
  console.log(out);
  if (errors.length) {
    console.error('console errors:\n  ' + errors.join('\n  '));
    process.exit(1);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
