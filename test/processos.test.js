'use strict';
/** Lista de programas do Windows (o PowerShell que fica aberto durante o jogo). */
const path = require('path'), assert = require('assert');
const { EventEmitter } = require('events');
const { PassThrough } = require('stream');
const { ROOT, t, pular, fim, espera } = require('./_base');
const { ListadorPersistente } = require(path.join(ROOT, 'src', 'processos-win.js'));

/** PowerShell de mentira que fala o mesmo protocolo. */
function falso(opts) {
  const o = opts || {};
  const p = new EventEmitter();
  p.stdin = new PassThrough(); p.stdout = new PassThrough();
  p.kill = () => { p.morto = true; p.emit('exit', 1); };
  p.pedidos = 0;
  setTimeout(() => p.stdout.write('##PRONTO##\r\n'), o.demoraPronto || 5);
  let buf = '';
  p.stdin.on('data', d => {
    buf += d;
    while (buf.includes('\n')) {
      const linha = buf.slice(0, buf.indexOf('\n')); buf = buf.slice(buf.indexOf('\n') + 1);
      if (linha === 'Q') { p.emit('exit', 0); return; }
      p.pedidos++;
      if (o.mudo) continue;
      // resposta em pedaços, com CRLF, como o Windows manda
      const txt = 'C:\\Jogos\\A\\a.exe\r\nC:\\Program Files\\B\\b.exe\r\n##FIM##\r\n';
      p.stdout.write(txt.slice(0, 9)); setTimeout(() => p.stdout.write(txt.slice(9)), 3);
    }
  });
  return p;
}

(async () => {
  let abertos = 0;
  const l = new ListadorPersistente({ abrir: () => { abertos++; return falso(); }, ocioso: 200 });
  const a = await l.listar();
  const b = await l.listar();
  await t('responde a lista, inteira e sem o \\r', () => assert.deepStrictEqual(a, ['C:\\Jogos\\A\\a.exe', 'C:\\Program Files\\B\\b.exe']));
  await t('um só PowerShell para vários pedidos', () => { assert.deepStrictEqual(b, a); assert.strictEqual(abertos, 1); });
  await espera(350);
  await t('fecha sozinho depois de um tempo sem uso', () => assert.strictEqual(l.proc, null));
  await l.listar();
  await t('e reabre quando precisa de novo', () => assert.strictEqual(abertos, 2));
  l.encerrar();

  const mudo = new ListadorPersistente({ abrir: () => falso({ mudo: true }), limite: 150 });
  await t('sem resposta: devolve null (o vigia tenta depois), sem travar', async () => assert.strictEqual(await mudo.listar(), null));
  await mudo.listar(); await mudo.listar();
  await t('3 falhas seguidas: deixa de ser confiável (usa o plano B)', () => assert.strictEqual(mudo.confiavel, false));

  const quebrado = new ListadorPersistente({ abrir: () => { const p = falso({ demoraPronto: 50 }); setTimeout(() => p.emit('exit', 1), 10); return p; } });
  await t('PowerShell que morre ao abrir: null, sem exceção', async () => assert.strictEqual(await quebrado.listar(), null));

  if (process.platform === 'win32') {
    // o script de verdade, no Windows do CI: o próprio Node tem que aparecer
    const real = new ListadorPersistente();
    const lista = await real.listar();
    await t('Windows: o PowerShell de verdade lista os programas com caminho', () => {
      assert.ok(Array.isArray(lista) && lista.length > 5, 'lista: ' + JSON.stringify(lista && lista.slice(0, 3)));
      const eu = process.execPath.toLowerCase();
      assert.ok(lista.some(c => c.toLowerCase() === eu), 'não achei ' + process.execPath);
    });
    const segunda = await real.listar();
    await t('Windows: segundo pedido usa o mesmo processo e é rápido', () => assert.ok(segunda && segunda.length > 5));
    real.encerrar();
  } else pular('PowerShell de verdade', 'só no Windows (roda no CI)');
  fim();
})();
