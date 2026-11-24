'use strict';
/** Todo .js do app compila e todo <script> do index.html existe. */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const assert = require('assert');
const { ROOT, t, fim } = require('./_base');

(async () => {
  const arquivos = ['main.js', 'preload.js',
    ...fs.readdirSync(path.join(ROOT, 'src')).filter(f => f.endsWith('.js')).map(f => 'src/' + f),
    ...fs.readdirSync(path.join(ROOT, 'renderer')).filter(f => f.endsWith('.js')).map(f => 'renderer/' + f)];
  for (const f of arquivos) {
    await t(`compila: ${f}`, () => {
      const r = spawnSync(process.execPath, ['--check', path.join(ROOT, f)], { encoding: 'utf8' });
      assert.strictEqual(r.status, 0, r.stderr);
    });
  }
  const html = fs.readFileSync(path.join(ROOT, 'renderer', 'index.html'), 'utf8');
  await t('index.html: os scripts existem', () => {
    const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
    assert.ok(scripts.length > 5);
    for (const s of scripts) assert.ok(fs.existsSync(path.join(ROOT, 'renderer', s)), s);
  });
  await t('index.html: política de segurança sem scripts de fora', () => {
    assert.ok(/script-src 'self';/.test(html));
    assert.ok(!/unsafe-eval/.test(html));
  });
  fim();
})();
