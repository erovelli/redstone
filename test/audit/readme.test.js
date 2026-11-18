// The README's component table is generated from the catalogue (scripts/readme-table.js): it must be up to date.
const fs = require('fs');
const path = require('path');
const gen = require('../../scripts/readme-table.js');

module.exports = {
  suite: 'readme',
  tests: [{
    name: 'the README component table matches the catalogue (run node scripts/readme-table.js)',
    fn: () => {
      const readme = fs.readFileSync(path.join(__dirname, '..', '..', 'README.md'), 'utf8');
      return gen.render(readme) === readme && gen.elements().every(e => e.tags.length && e.ids.length);
    },
  }],
};
