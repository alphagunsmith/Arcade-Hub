'use strict';
/** Utilidades dos testes (sem Electron, rodam com "npm test" e no CI). */
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const BASE = path.join(os.tmpdir(), 'arcade-hub-testes');

/** Pasta temporária limpa para um teste. */
function tmp(nome) {
  const d = path.join(BASE, nome);
  fs.rmSync(d, { recursive: true, force: true });
  fs.mkdirSync(d, { recursive: true });
  return d;
}

let falhas = 0;
async function t(nome, fn) {
  try { await fn(); console.log('  ✓', nome); } catch (e) { falhas++; console.log('  ✗', nome, '→', (e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e)); }
}
function pular(nome, motivo) { console.log('  –', nome, `(pulado: ${motivo})`); }
function fim() {
  console.log(falhas ? `  ${falhas} falha(s)` : '  ok');
  process.exit(falhas ? 1 : 0);
}
const espera = ms => new Promise(r => setTimeout(r, ms));

/** Resposta falsa de fetch. */
const resp = (status, corpo, json = true) => ({
  ok: status < 400, status,
  json: async () => (json ? corpo : JSON.parse('x')),
  text: async () => (typeof corpo === 'string' ? corpo : JSON.stringify(corpo)),
  headers: { get: () => '' }, arrayBuffer: async () => new ArrayBuffer(0)
});

module.exports = { ROOT, tmp, t, pular, fim, espera, resp };
