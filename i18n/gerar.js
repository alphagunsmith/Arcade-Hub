'use strict';
/**
 * Gera os dicionários de tradução a partir de i18n/textos/*.tsv.
 *
 * Cada linha: texto em português <TAB> inglês <TAB> espanhol <TAB> japonês <TAB> chinês simplificado.
 * {0}, {1}… são as partes variáveis (nome do jogo, números). "\n" vira quebra de linha.
 *
 *   node i18n/gerar.js           grava renderer/i18n/*.js e dualsense/i18n/*.json
 *   node i18n/gerar.js --conferir só confere (falha se algo estiver desatualizado ou inválido)
 */
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const IDIOMAS = ['en', 'es', 'ja', 'zh-CN'];
const norm = s => s.replace(/\s+/g, ' ').trim();
const marcas = s => (s.match(/\{\d+\}/g) || []).sort().join(',');

function ler() {
  const pasta = path.join(__dirname, 'textos');
  const dic = Object.fromEntries(IDIOMAS.map(i => [i, {}]));
  const erros = [];
  for (const arq of fs.readdirSync(pasta).filter(f => f.endsWith('.tsv')).sort()) {
    fs.readFileSync(path.join(pasta, arq), 'utf8').replace(/\r/g, '').split('\n').forEach((linha, n) => {
      if (!linha.trim() || linha.startsWith('#')) return;
      const col = linha.split('\t');
      const onde = `${arq}:${n + 1}`;
      if (col.length !== 5) { erros.push(`${onde}: ${col.length} colunas (precisa de 5)`); return; }
      const pt = norm(col[0].replace(/\\n/g, '\n'));
      IDIOMAS.forEach((id, i) => {
        const tr = col[i + 1].replace(/\\n/g, '\n').trim();
        if (!tr) { erros.push(`${onde}: falta ${id}`); return; }
        if (marcas(tr) !== marcas(pt)) erros.push(`${onde}: ${id} com partes variáveis diferentes (${marcas(pt)} ≠ ${marcas(tr)})`);
        const tagsPt = (pt.match(/<[a-z]+/gi) || []).length, tagsTr = (tr.match(/<[a-z]+/gi) || []).length;
        if (tagsPt !== tagsTr) erros.push(`${onde}: ${id} com marcação HTML diferente`);
        dic[id][pt] = tr;
      });
    });
  }
  return { dic, erros };
}

function arquivos(dic) {
  const out = {};
  for (const id of IDIOMAS) {
    const ordenado = Object.fromEntries(Object.entries(dic[id]).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
    const json = JSON.stringify(ordenado, null, 0).replace(/","/g, '",\n"');
    out[path.join('renderer', 'i18n', id + '.js')] =
      `// Gerado por i18n/gerar.js a partir de i18n/textos/*.tsv — não edite à mão.\n` +
      `(function (r, d) { if (typeof module !== 'undefined' && module.exports) module.exports = d; ` +
      `else (r.I18N_DICIONARIOS = r.I18N_DICIONARIOS || {})[${JSON.stringify(id)}] = d; })` +
      `(typeof window !== 'undefined' ? window : globalThis, ${json});\n`;
    out[path.join('dualsense', 'i18n', id + '.json')] = json + '\n';
  }
  // o painel do DualSense Auto usa a mesma camada de tradução
  out[path.join('dualsense', 'i18n', 'runtime.js')] = fs.readFileSync(path.join(RAIZ, 'renderer', 'i18n.js'), 'utf8').replace(/\r\n/g, '\n');
  return out;
}

const { dic, erros } = ler();
if (erros.length) { console.error(erros.join('\n')); process.exit(1); }
const saida = arquivos(dic);
const conferir = process.argv.includes('--conferir');
const velhos = [];
for (const [rel, conteudo] of Object.entries(saida)) {
  const p = path.join(RAIZ, rel);
  let atual = null;
  try { atual = fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n'); } catch { /* novo */ }   // checkout do Windows pode vir com CRLF
  if (atual === conteudo) continue;
  if (conferir) velhos.push(rel);
  else { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, conteudo); }
}
if (conferir && velhos.length) { console.error('Desatualizados (rode node i18n/gerar.js):\n' + velhos.join('\n')); process.exit(1); }
console.log(`${Object.keys(dic.en).length} textos × ${IDIOMAS.length} idiomas${conferir ? ' — em dia' : ' — gerados'}`);
