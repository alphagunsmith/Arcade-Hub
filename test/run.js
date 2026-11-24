'use strict';
/** Roda todos os arquivos *.test.js, um de cada vez, e falha se algum falhar. */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const arquivos = fs.readdirSync(__dirname).filter(f => f.endsWith('.test.js')).sort();
let ruins = 0;
for (const f of arquivos) {
  console.log(`\n▶ ${f}`);
  const r = spawnSync(process.execPath, [path.join(__dirname, f)], { stdio: 'inherit', timeout: 5 * 60 * 1000 });
  if (r.status !== 0) { ruins++; console.log(`✗ ${f} falhou (código ${r.status}${r.signal ? ', ' + r.signal : ''})`); }
}
console.log(ruins ? `\n${ruins} de ${arquivos.length} arquivo(s) com falha` : `\nTodos os ${arquivos.length} arquivos de teste passaram`);
process.exit(ruins ? 1 : 0);
