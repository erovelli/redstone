#!/usr/bin/env node
// node scripts/build.js  ->  dist/redstone-ui.js, dist/redstone-ui.css, dist/index.html (docs), dist/catalogue.html (workbench)
//
// Files are discovered in the load order from docs/SPEC.md section 5; nobody edits a manifest. Each source file
// is evaluated in its own block scope, so top-level const/let/class names cannot collide between files. Files
// share things only through window globals (RS, Catalogue, RSR, ...) and window.Redstone.
// Plain Node 18, no dependencies.
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const rel = p => path.relative(ROOT, p).split(path.sep).join('/');
const read = p => fs.readFileSync(p, 'utf8');
const exists = p => fs.existsSync(p);

// Every *.js directly in a directory, in name order.
function dir(d, ext = '.js') {
  const full = path.join(ROOT, d);
  if (!exists(full)) return [];
  return fs.readdirSync(full, { withFileTypes: true })
    .filter(f => f.isFile() && f.name.endsWith(ext))
    .map(f => path.join(full, f.name))
    .sort();
}
const file = f => [path.join(ROOT, f)];
const optional = f => (exists(path.join(ROOT, f)) ? file(f) : []);

function sources() {
  return [
    ...file('src/engine.js'),
    ...dir('src/blocks'),
    ...dir('src/contraptions'),
    ...file('src/catalogue.js'),
    ...dir('src/contraptions/ui'),
    ...optional('src/textures.js'),
    ...file('src/render.js'),
    ...file('src/ui/core.js'),
    ...dir('src/ui/components'),
  ];
}

function cssSources() {
  return [...file('src/ui/ui.css'), ...dir('src/ui/components', '.css')];
}

function bundleJs(version, css) {
  const parts = sources().map(f => `// ---- ${rel(f)} ----\n{\n${read(f)}\n}\n`);
  const head = `/*! redstone-ui ${version}: a redstone tick engine and UI components that are working contraptions.\n` +
    ` * <script src="redstone-ui.js"></script> defines window.Redstone and the <rs-*> elements. */\n`;
  const foot = `// ---- bundle footer ----\n{\n` +
    `const Redstone = window.Redstone = window.Redstone || {};\n` +
    `Object.assign(Redstone, { version: ${JSON.stringify(version)}, engine: Redstone.engine || window.RS, catalogue: Redstone.catalogue || window.Catalogue, render: Redstone.render || window.RSR, textures: Redstone.textures || window.RSTextures || null });\n` +
    `if (Redstone.ui && Redstone.ui.injectStyles) Redstone.ui.injectStyles(${JSON.stringify(css)});\n}\n`;
  return head + parts.join('\n') + foot;
}

function bundleCss(version) {
  return `/*! redstone-ui ${version} */\n` + cssSources().map(f => `/* ---- ${rel(f)} ---- */\n${read(f)}`).join('\n');
}

const escapeHtml = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Strip the common leading indentation and blank edges from a block of markup.
function dedent(s) {
  const lines = s.replace(/\t/g, '  ').split('\n');
  while (lines.length && !lines[0].trim()) lines.shift();
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  const indent = Math.min(...lines.filter(l => l.trim()).map(l => l.match(/^ */)[0].length));
  return lines.map(l => l.slice(indent)).join('\n');
}

// A demo fragment marks its live markup with <!-- example --> ... <!-- /example -->. The snippet shown on
// the docs page is that markup, copied here, so it can never drift from the live example.
function demoSection(f) {
  const html = read(f);
  const name = path.basename(f, '.html');
  const m = html.match(/<!--\s*example\s*-->([\s\S]*?)<!--\s*\/example\s*-->/);
  if (!m) throw new Error(`${rel(f)}: no <!-- example --> ... <!-- /example --> block`);
  const snippet = dedent(m[1]);
  const code = `<div class="snippet"><div class="snippet-bar"><span>html</span><button type="button" class="copy">Copy</button></div><pre><code>${escapeHtml(snippet)}</code></pre></div>`;
  return `<!-- ---- ${rel(f)} ---- -->\n<div class="demo-src" data-demo="${name}">\n${html.replace(m[0], `<div class="live">${m[1]}</div>\n${code}`)}\n</div>`;
}

function build() {
  const pkg = JSON.parse(read(path.join(ROOT, 'package.json')));
  const version = pkg.version;
  fs.mkdirSync(DIST, { recursive: true });
  const css = bundleCss(version);
  const js = bundleJs(version, css);
  const out = {};
  out['redstone-ui.js'] = js;
  out['redstone-ui.css'] = css;

  const demos = dir('pages/demos', '.html').map(demoSection).join('\n');
  out['index.html'] = read(path.join(ROOT, 'pages/docs.html'))
    .replace('<!--DEMOS-->', () => demos)
    .replace(/\{\{version\}\}/g, version);

  // The workbench stays a single self-contained file.
  out['catalogue.html'] = read(path.join(ROOT, 'pages/catalogue.html'))
    .replace('/*BUNDLE*/', () => js.replace(/<\/script/gi, '<\\/script'))
    .replace('/*CATAPP*/', () => read(path.join(ROOT, 'pages/catalogue-app.js')));

  for (const [name, text] of Object.entries(out)) {
    fs.writeFileSync(path.join(DIST, name), text);
    console.log(`built dist/${name}`.padEnd(28), `${Math.round(text.length / 1024)} KB`);
  }
  return out;
}

if (require.main === module) build();
module.exports = { build, sources, cssSources, dedent, demoSection };
