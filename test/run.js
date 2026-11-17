// node test/run.js [filter]  -> runs every catalogue entry's tests, then every test/**/*.test.js suite.
// A suite file exports { suite: 'name', tests: [{ name, fn }] } (or just the tests array). fn returns truthy to pass
// or throws. An optional filter argument runs only the entries and suites whose name or id contains it.
const fs = require('fs'), path = require('path');
const C = require('../src/index.js');
const filter = (process.argv[2] || '').toLowerCase(), want = s => !filter || String(s).toLowerCase().includes(filter);
let pass = 0, fail = 0;
const report = (name, results) => {
  results.forEach(x => x.pass ? pass++ : fail++);
  console.log(`  ${results.every(x => x.pass) ? 'PASS' : 'FAIL'}  ${name}`);
  results.filter(x => !x.pass).forEach(x => console.log(`        x ${x.name} ${x.err || ''}`));
};
for (const cat of C.CATEGORIES){
  const list = C.entries.filter(e => e.category === cat && (want(e.id) || want(e.name)));
  if (!list.length) continue;
  console.log('\n' + cat);
  for (const e of list) report(e.name, C.runTests(e));
}
const walk = dir => fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes:true }).flatMap(d => d.isDirectory() ? walk(path.join(dir, d.name)) : d.name.endsWith('.test.js') ? [path.join(dir, d.name)] : []) : [];
const files = walk(__dirname).sort();
if (files.length) console.log('\nSuites');
for (const f of files){
  const m = require(f), tests = Array.isArray(m) ? m : m.tests, name = m.suite || path.relative(__dirname, f);
  if (!want(name)) continue;
  report(name, tests.map(t => { let ok = false, err = null; try { ok = !!t.fn(); } catch (x){ err = String(x && x.message || x); } return { name:t.name, pass:ok, err }; }));
}
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
