// node test/run.js  -> runs every catalogue entry's tests
const C = require('../src/catalogue.js');
let pass = 0, fail = 0;
for (const cat of C.CATEGORIES){
  console.log('\n' + cat);
  for (const e of C.entries.filter(e => e.category === cat)){
    const r = C.runTests(e); r.forEach(x => x.pass ? pass++ : fail++);
    console.log(`  ${r.every(x=>x.pass)?'PASS':'FAIL'}  ${e.name}`); r.filter(x=>!x.pass).forEach(x => console.log(`        x ${x.name} ${x.err||''}`));
  }
}
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
