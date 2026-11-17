// Node entry point. Loads the engine and the catalogue, then every self-registering file:
// block definitions (src/blocks/*.js) and UI contraptions (src/contraptions/ui/*.js).
// The browser bundle concatenates the same files in the same order (see docs/SPEC.md, "Files and load order").
const fs = require('fs'), path = require('path');
const engine = require('./engine.js');
const loadDir = dir => {
  const full = path.join(__dirname, dir);
  if (!fs.existsSync(full)) return;
  for (const f of fs.readdirSync(full).filter(f => f.endsWith('.js')).sort()) require(path.join(full, f));
};
loadDir('blocks');
const catalogue = require('./catalogue.js');
loadDir('contraptions/ui');
module.exports = Object.assign(catalogue, { engine });
