#!/usr/bin/env node
// node scripts/contact.js <out-dir> [--only chip,input] [--per-sheet 8]
//
// Builds dist/, opens the docs gallery in Chromium (Playwright) and screenshots the live bench of every component
// section in four modes: 1280 px light, 1280 px dark, 320 px light and 1280 px x-ray. The shots go to
// <out-dir>/<mode>/<tag>.png and are composed into contact sheets, <out-dir>/sheet-<mode>-<n>.png, a few
// components to a sheet. <out-dir> must be outside the repository (screenshots are never committed).
//
// It also writes <out-dir>/report.json and prints a summary: for every piece of sign text in a section, its
// font size, weight, family, ink contrast against the sign board under it (the canvas pixels, averaged), and
// whether the glyphs' ink is clipped, overflows its sign row or sits off centre (horizontally or vertically); and, at 320 px, every section whose
// content is wider than the page.
'use strict';
const fs = require('fs');
const path = require('path');
const { build } = require('./build.js');

const ROOT = path.join(__dirname, '..');
const MODES = [
  { name: '1280-light', width: 1280, dark: false, xray: false },
  { name: '1280-dark', width: 1280, dark: true, xray: false },
  { name: '320-light', width: 320, dark: false, xray: false },
  { name: '1280-xray', width: 1280, dark: false, xray: true },
];

function args(argv) {
  const o = { out: null, only: null, perSheet: 8 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--only') o.only = argv[++i].split(',').map(s => (s.startsWith('rs-') ? s : 'rs-' + s));
    else if (a === '--per-sheet') o.perSheet = Number(argv[++i]);
    else if (!o.out) o.out = path.resolve(a);
  }
  return o;
}

// Runs in the page: every piece of sign text inside a section, measured.
function measureSection(id) {
  const sec = document.getElementById(id);
  const out = [];
  const lum = c => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const L = rgb => 0.2126 * lum(rgb[0]) + 0.7152 * lum(rgb[1]) + 0.0722 * lum(rgb[2]);
  const rgbOf = s => (s.match(/[\d.]+/g) || [0, 0, 0]).slice(0, 3).map(Number);
  // The average colour of the component's canvas under a page rect (the sign boards: text is never on the canvas).
  const boardColour = (host, r) => {
    const canvas = host.shadowRoot && host.shadowRoot.querySelector('.stage canvas');
    if (!canvas) return null;
    const c = canvas.getBoundingClientRect();
    const sx = canvas.width / c.width, sy = canvas.height / c.height;
    const x = Math.max(0, Math.floor((r.left - c.left) * sx)), y = Math.max(0, Math.floor((r.top - c.top) * sy));
    const w = Math.min(canvas.width - x, Math.ceil(r.width * sx)), h = Math.min(canvas.height - y, Math.ceil(r.height * sy));
    if (w <= 0 || h <= 0) return null;
    const d = canvas.getContext('2d').getImageData(x, y, w, h).data;
    let n = 0;
    const sum = [0, 0, 0];
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 200) continue;
      sum[0] += d[i]; sum[1] += d[i + 1]; sum[2] += d[i + 2];
      n++;
    }
    return n ? sum.map(v => Math.round(v / n)) : null;
  };
  const textRect = node => {
    const range = document.createRange();
    range.selectNodeContents(node);
    const rects = [...range.getClientRects()].filter(r => r.width > 0);
    if (!rects.length) return null;
    const x0 = Math.min(...rects.map(r => r.left)), x1 = Math.max(...rects.map(r => r.right));
    const y0 = Math.min(...rects.map(r => r.top)), y1 = Math.max(...rects.map(r => r.bottom));
    return { left: x0, right: x1, top: y0, bottom: y1, width: x1 - x0, height: y1 - y0 };
  };
  const visit = (host, box, textNode, styleNode, what) => {
    const b = box.getBoundingClientRect();
    if (!b.width || !b.height) return;
    const cs = getComputedStyle(styleNode);
    if (cs.visibility === 'hidden') return;
    const line = textRect(textNode);
    if (!line) return;
    // The glyphs' ink: the line's content area holds the font's ascent and descent; the ink is inside it.
    const g = document.createElement('canvas').getContext('2d');
    g.font = cs.fontStyle + ' ' + cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
    const m = g.measureText(textNode.textContent.trim() || 'x');
    const base = line.top + m.fontBoundingBoxAscent;
    const t = { left: line.left, right: line.right, top: base - m.actualBoundingBoxAscent, bottom: base + m.actualBoundingBoxDescent };
    const text = textNode.textContent.replace(/\s+/g, ' ').trim();
    if (!text) return;
    const bg = boardColour(host, b);
    const ink = rgbOf(cs.color);
    const contrast = bg ? (Math.max(L(ink), L(bg)) + 0.05) / (Math.min(L(ink), L(bg)) + 0.05) : null;
    out.push({
      tag: host.localName, what, text: text.slice(0, 40),
      size: parseFloat(cs.fontSize), weight: Number(cs.fontWeight), family: cs.fontFamily.split(',')[0].trim(),
      box: { w: Math.round(b.width), h: Math.round(b.height) },
      ink: cs.color, board: bg && 'rgb(' + bg.join(',') + ')', contrast: contrast && Math.round(contrast * 100) / 100,
      // Glyphs outside the sign row (clipped by it, or running past it).
      overflow: Math.round(Math.max(0, b.left - t.left, t.right - b.right, b.top - t.top, t.bottom - b.bottom) * 10) / 10,
      // Off centre on the board (rs-input's text starts at the left, like a native field's: only vertical counts).
      offCentre: Math.round(Math.max(host.localName === 'rs-input' ? 0 : Math.abs((t.left + t.right) / 2 - (b.left + b.right) / 2), Math.abs((t.top + t.bottom) / 2 - (b.top + b.bottom) / 2)) * 10) / 10,
    });
  };
  const hosts = [...sec.querySelectorAll('.live *')].filter(el => el.localName.startsWith('rs-') && el.shadowRoot);
  for (const host of hosts) {
    const root = host.shadowRoot;
    // Text the core or a component lays over its signs.
    for (const box of root.querySelectorAll('.label, [class^="rs-"][class*="label"], .rs-text, .rs-link, .rs-crumb')) {
      if (box.closest('[hidden]') || box.classList.contains('caption')) continue;
      const slot = box.querySelector('slot');
      if (slot) {
        for (const n of slot.assignedNodes({ flatten: true })) visit(host, box, n, n.nodeType === 1 ? n : box, 'slot');
        if (!slot.assignedNodes().length && slot.textContent.trim()) visit(host, box, slot, box, 'fallback');
      } else {
        visit(host, box, box, box, box.className);
      }
    }
  }
  return out;
}

async function shoot(browser, mode, ids, dir) {
  const page = await browser.newPage({ viewport: { width: mode.width, height: 900 }, deviceScaleFactor: 1, colorScheme: mode.dark ? 'dark' : 'light' });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  await page.addInitScript(theme => { try { localStorage.setItem('rs-theme', theme); } catch (e) {} }, mode.dark ? 'dark' : 'light');
  await page.goto('file://' + path.join(ROOT, 'dist', 'index.html'));
  await page.evaluate(() => document.fonts && document.fonts.ready);
  const all = await page.$$eval('#gallery section.demo[id^="rs-"]', els => els.map(e => e.id));
  const want = ids ? all.filter(id => ids.includes(id)) : all;
  const shots = [];
  const measures = [];
  const wide = [];
  fs.mkdirSync(dir, { recursive: true });
  for (const id of want) {
    const bench = page.locator(`#${id} .bench`).first();
    await bench.scrollIntoViewIfNeeded();
    if (mode.xray) await bench.locator('.xray').click();
    await page.waitForTimeout(450);
    const file = path.join(dir, id + '.png');
    await bench.screenshot({ path: file });
    shots.push({ id, file });
    if (!mode.xray) measures.push(...(await page.evaluate(measureSection, id)).map(m => Object.assign({ mode: mode.name }, m)));
    const over = await page.evaluate(id => {
      const live = document.querySelector(`#${id} .live`);
      const r = live.getBoundingClientRect();
      let worst = 0;
      // The live area's children and every component host (a component that scrolls inside its own box is fine).
      const els = [...live.children, ...[...live.querySelectorAll('*')].filter(el => el.localName.startsWith('rs-'))];
      for (const el of els) {
        // A component's machine can be wider than its host: that counts unless the host scrolls it.
        const inner = el.shadowRoot && getComputedStyle(el).overflowX === 'visible' && el.shadowRoot.querySelector('.box');
        const q = (inner || el).getBoundingClientRect();
        if (q.width && getComputedStyle(el).position !== 'fixed') worst = Math.max(worst, q.right - r.right);
      }
      return { page: document.documentElement.scrollWidth - innerWidth, live: live.scrollWidth - live.clientWidth, child: Math.round(worst) };
    }, id);
    if (over.page > 0 || over.live > 0 || over.child > 1) wide.push(Object.assign({ id }, over));
  }
  await page.close();
  return { shots, measures, wide, errors };
}

// One contact sheet: the shots in a grid, captioned, rendered by the browser and saved as a PNG.
async function compose(browser, title, shots, file, cols) {
  const page = await browser.newPage({ viewport: { width: 400, height: 400 }, deviceScaleFactor: 1 });
  const src = f => 'data:image/png;base64,' + fs.readFileSync(f).toString('base64');
  const cells = shots.map(s => `<figure><figcaption>${s.id}</figcaption><img src="${src(s.file)}"></figure>`).join('');
  await page.setContent(`<!doctype html><style>
    body { margin: 0; padding: 12px; background: #888; font: 600 16px/1.2 sans-serif; width: max-content; }
    h1 { margin: 0 0 10px; font-size: 18px; }
    .grid { display: grid; grid-template-columns: repeat(${cols}, max-content); gap: 12px; align-items: start; }
    figure { margin: 0; background: #fff; padding: 4px; } figcaption { padding: 2px 4px 4px; }
    img { display: block; }
  </style><h1>${title}</h1><div class="grid">${cells}</div>`, { waitUntil: 'load' });
  const size = await page.evaluate(() => ({ width: Math.ceil(document.body.getBoundingClientRect().width), height: Math.ceil(document.body.scrollHeight) }));
  await page.setViewportSize({ width: size.width, height: Math.min(size.height, 16000) });
  await page.screenshot({ path: file, fullPage: true });
  await page.close();
}

async function main() {
  const o = args(process.argv.slice(2));
  if (!o.out) {
    console.error('usage: node scripts/contact.js <out-dir> [--only chip,input] [--per-sheet 8]');
    process.exit(2);
  }
  if (!path.relative(ROOT, o.out).startsWith('..')) {
    console.error('the output directory must be outside the repository');
    process.exit(2);
  }
  let playwright;
  try { playwright = require('playwright'); } catch (e) {
    console.error('Playwright is not installed; nothing to do.');
    process.exit(2);
  }
  build();
  const browser = await playwright.chromium.launch();
  const report = { measures: [], wide: {}, errors: {} };
  for (const mode of MODES) {
    const r = await shoot(browser, mode, o.only, path.join(o.out, mode.name));
    report.measures.push(...r.measures);
    report.wide[mode.name] = r.wide;
    if (r.errors.length) report.errors[mode.name] = r.errors;
    const cols = mode.width < 600 ? 5 : 2;
    const per = mode.width < 600 ? o.perSheet + 2 : o.perSheet;
    for (let i = 0, n = 1; i < r.shots.length; i += per, n++) {
      const file = path.join(o.out, `sheet-${mode.name}-${n}.png`);
      await compose(browser, `${mode.name} (${n})`, r.shots.slice(i, i + per), file, cols);
      console.log(file);
    }
  }
  await browser.close();
  fs.writeFileSync(path.join(o.out, 'report.json'), JSON.stringify(report, null, 2));

  // Summary: the worst sign text per mode, and anything wider than the page.
  const m = report.measures;
  if (m.length) {
    const min = k => Math.min(...m.map(x => x[k]).filter(v => v !== null));
    console.log(`\nsign text: ${m.length} pieces; size ${min('size')}..${Math.max(...m.map(x => x.size))} px, weight >= ${min('weight')}, contrast >= ${min('contrast')}`);
    for (const x of m) {
      const bad = [x.size < 15 && 'size', x.weight < 600 && 'weight', x.contrast !== null && x.contrast < 4.5 && 'contrast', x.overflow > 0.5 && 'overflow', x.offCentre > 2 && 'off-centre'].filter(Boolean);
      if (bad.length) console.log(`  ${x.mode} ${x.tag} "${x.text}": ${bad.join(', ')} (${x.size}px ${x.weight} ${x.family}, box ${x.box.w}x${x.box.h}, contrast ${x.contrast}, overflow ${x.overflow}, off ${x.offCentre})`);
    }
  }
  for (const [mode, list] of Object.entries(report.wide)) for (const w of list) console.log(`  ${mode} ${w.id}: wider than its box (page +${w.page}, live +${w.live}, child +${w.child})`);
  for (const [mode, list] of Object.entries(report.errors)) console.log(`  ${mode} console errors:\n    ${list.join('\n    ')}`);
  console.log(path.join(o.out, 'report.json'));
}

main().catch(e => { console.error(e); process.exit(1); });
