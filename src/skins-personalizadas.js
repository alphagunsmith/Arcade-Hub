'use strict';
/**
 * Skins personalizadas (criador de skin) e arquivos do usuário usados no visual:
 * fundo (imagem, GIF ou vídeo), personagem e logo de cada jogo no Modo TV.
 *
 * Tudo que vem de fora (arquivo .arcadeskin de outra pessoa, ajustes salvos) passa
 * por limparSkin(): só cores, números e nomes conhecidos chegam ao CSS, e só
 * arquivos dentro da pasta de dados do app viram fundo.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PASTAS = { fundos: 'fundos', personagens: 'personagens', logos: 'logos' };
const EXT_IMAGEM = /\.(png|jpe?g|webp|gif|bmp|avif)$/i;
const EXT_VIDEO = /\.(mp4|webm|m4v|mov)$/i;
const LIMITE_ARQUIVO = 200 * 1024 * 1024;          // vídeo de fundo: até 200 MB
const LIMITE_EMBUTIR = 40 * 1024 * 1024;           // no arquivo exportado vai junto até 40 MB
const MAX_SKINS = 60;

const VARS = ['--bg', '--bg-2', '--panel', '--panel-2', '--input-bg', '--txt', '--muted', '--accent', '--accent-2', '--accent-3',
  '--on-accent', '--line', '--line-strong', '--radius-card', '--radius-sheet'];
const FONTES = {
  padrao: '', segoe: '"Segoe UI Variable", "Segoe UI", system-ui, sans-serif', bahnschrift: 'Bahnschrift, "Segoe UI", sans-serif',
  trebuchet: '"Trebuchet MS", "Segoe UI", sans-serif', verdana: 'Verdana, "Segoe UI", sans-serif', georgia: 'Georgia, serif',
  consolas: 'Consolas, "Cascadia Mono", monospace', impact: 'Impact, "Arial Black", sans-serif', arialblack: '"Arial Black", Arial, sans-serif',
  pixel: '"Press Start 2P", "Lucida Console", Consolas, monospace'
};
const TIPOS_FUNDO = ['xmb', 'ps4', 'psp', 'ps2', 'orbes', 'nucleo', 'blocos', 'listras', 'pontos', 'cubo', 'bolhas', 'aurora', 'grade', 'pixels', 'espiral', 'estrelas', 'neon'];
const DASHBOARDS = ['xmb', 'blades', 'canais', 'coverflow', 'tiles', 'carrossel', 'lb-caixas', 'lb-lista', 'bb-parede', 'bb-roda', 'bb-texto'];

const COR = /^(#[0-9a-f]{3,8}|rgba?\(\s*[\d.]+%?\s*,\s*[\d.]+%?\s*,\s*[\d.]+%?\s*(,\s*[\d.]+%?\s*)?\))$/i;
const RAIO = /^\d{1,2}px$/;

const num = (v, lo, hi, padrao) => { const n = Number(v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : padrao; };
const texto = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, max);

function urlDeArquivo(p) { return 'file://' + String(p).replace(/\\/g, '/'); }
function caminhoDeUrl(url) {
  let p = String(url || '').replace(/^file:\/\//i, '');
  if (/^\/[A-Za-z]:[\\/]/.test(p)) p = p.slice(1);
  if (process.platform !== 'win32' && !p.startsWith('/')) p = '/' + p;
  try { if (/%[0-9a-f]{2}/i.test(p) && !fs.existsSync(p)) p = decodeURIComponent(p); } catch { /* fica */ }
  return p;
}
/** O arquivo está dentro de <dados>/<pasta>? (evita fundo apontando para qualquer lugar do PC) */
function dentroDe(dadosDir, pasta, url) {
  if (!url || !/^file:/i.test(url)) return false;
  const base = path.resolve(dadosDir, pasta) + path.sep;
  const alvo = path.resolve(caminhoDeUrl(url));
  return (process.platform === 'win32' ? alvo.toLowerCase().startsWith(base.toLowerCase()) : alvo.startsWith(base));
}

function tipoDoArquivo(p) { return EXT_VIDEO.test(p) ? 'video' : EXT_IMAGEM.test(p) ? 'imagem' : null; }

/** Copia um arquivo escolhido pelo usuário para a pasta do app (nome = hash do conteúdo). */
function guardarArquivo(dadosDir, pasta, origem) {
  if (!PASTAS[pasta]) throw new Error('pasta inválida');
  const tipo = tipoDoArquivo(origem || '');
  if (!tipo || (pasta !== 'fundos' && tipo !== 'imagem')) throw new Error('Formato de arquivo não suportado');
  const st = fs.statSync(origem);
  if (!st.isFile() || st.size > LIMITE_ARQUIVO) throw new Error('Arquivo grande demais (máximo 200 MB)');
  const hash = crypto.createHash('sha1');
  const fd = fs.openSync(origem, 'r');
  try {
    const buf = Buffer.alloc(1 << 20);
    let n;
    while ((n = fs.readSync(fd, buf, 0, buf.length, null)) > 0) hash.update(buf.subarray(0, n));
  } finally { fs.closeSync(fd); }
  const dir = path.join(dadosDir, PASTAS[pasta]);
  fs.mkdirSync(dir, { recursive: true });
  const destino = path.join(dir, hash.digest('hex').slice(0, 20) + path.extname(origem).toLowerCase());
  if (!fs.existsSync(destino)) fs.copyFileSync(origem, destino);
  return { url: urlDeArquivo(destino), tipo };
}

function limparSkin(s, dadosDir) {
  if (!s || typeof s !== 'object') return null;
  const id = /^meu-[a-z0-9-]{1,40}$/.test(String(s.id || '')) ? s.id : 'meu-' + crypto.randomBytes(5).toString('hex');
  const vars = {};
  for (const k of VARS) {
    const v = s.vars && typeof s.vars[k] === 'string' ? s.vars[k].trim() : '';
    if (!v) continue;
    if (k.startsWith('--radius') ? RAIO.test(v) : COR.test(v)) vars[k] = v;
  }
  if (!vars['--bg'] || !vars['--accent'] || !vars['--txt']) return null;   // sem o básico não dá para usar
  const out = {
    id, personalizada: true,
    name: texto(s.name, 40) || 'Minha skin',
    console: 'Personalizada', year: new Date().getFullYear(), brand: texto(s.brand, 12) || 'MEU',
    vars,
    swatch: [vars['--bg'], vars['--accent'], vars['--accent-2'] || vars['--accent']]
  };
  if (TIPOS_FUNDO.includes(s.fundo)) out.fundo = s.fundo;
  if (s.fundo === 'nenhum') out.fundo = 'nenhum';
  if (DASHBOARDS.includes(s.dashboard)) out.dashboard = s.dashboard;
  if (s.fonteId && Object.prototype.hasOwnProperty.call(FONTES, s.fonteId)) { out.fonteId = s.fonteId; if (FONTES[s.fonteId]) out.fonte = FONTES[s.fonteId]; }
  if (s.scanline) out.scanline = true;
  out.fundoVelocidade = num(s.fundoVelocidade, .1, 3, 1);
  out.fundoEscurecer = num(s.fundoEscurecer, 0, .9, 0);
  out.fundoDesfoque = num(s.fundoDesfoque, 0, 40, 0);
  if (s.midia && (s.midia.tipo === 'imagem' || s.midia.tipo === 'video') && dadosDir && dentroDe(dadosDir, 'fundos', s.midia.url)) {
    out.midia = { tipo: s.midia.tipo, url: String(s.midia.url) };
  }
  if (typeof s.base === 'string' && /^[a-z0-9-]{1,40}$/.test(s.base)) out.base = s.base;
  return out;
}

function limparLista(lista, dadosDir) {
  const vistos = new Set();
  return (Array.isArray(lista) ? lista : []).map(s => limparSkin(s, dadosDir)).filter(s => {
    if (!s || vistos.has(s.id)) return false;
    vistos.add(s.id);
    return true;
  }).slice(0, MAX_SKINS);
}

/** Skin para compartilhar: um JSON com o fundo junto (base64), se couber. */
function exportarSkin(skin, dadosDir) {
  const s = limparSkin(skin, dadosDir);
  if (!s) throw new Error('Skin inválida');
  const pacote = { app: 'Arcade Hub', tipo: 'skin', versao: 1, skin: { ...s } };
  delete pacote.skin.midia;
  if (s.midia) {
    const p = caminhoDeUrl(s.midia.url);
    const st = fs.statSync(p);
    if (st.size <= LIMITE_EMBUTIR) {
      pacote.midia = { tipo: s.midia.tipo, ext: path.extname(p).toLowerCase(), dados: fs.readFileSync(p).toString('base64') };
    } else {
      pacote.avisoMidia = 'fundo grande demais para ir junto';
    }
  }
  return pacote;
}

/** Lê um arquivo de skin (de qualquer pessoa): valida tudo e grava o fundo na pasta do app. */
function importarSkin(conteudo, dadosDir) {
  let pacote;
  try { pacote = typeof conteudo === 'string' ? JSON.parse(conteudo) : conteudo; } catch { throw new Error('Este arquivo não é uma skin do Arcade Hub'); }
  if (!pacote || pacote.tipo !== 'skin' || !pacote.skin) throw new Error('Este arquivo não é uma skin do Arcade Hub');
  const bruto = { ...pacote.skin, id: null };     // id novo: nunca sobrescreve uma skin sua
  const m = pacote.midia;
  if (m && (m.tipo === 'imagem' || m.tipo === 'video') && typeof m.dados === 'string' && /^\.[a-z0-9]{2,5}$/.test(m.ext || '')) {
    const ext = m.ext.toLowerCase();
    if ((m.tipo === 'video' ? EXT_VIDEO : EXT_IMAGEM).test('x' + ext)) {
      const buf = Buffer.from(m.dados, 'base64');
      if (buf.length <= LIMITE_EMBUTIR) {
        const dir = path.join(dadosDir, PASTAS.fundos);
        fs.mkdirSync(dir, { recursive: true });
        const destino = path.join(dir, crypto.createHash('sha1').update(buf).digest('hex').slice(0, 20) + ext);
        if (!fs.existsSync(destino)) fs.writeFileSync(destino, buf);
        bruto.midia = { tipo: m.tipo, url: urlDeArquivo(destino) };
      }
    }
  }
  const s = limparSkin(bruto, dadosDir);
  if (!s) throw new Error('A skin deste arquivo está incompleta');
  return s;
}

/** Personagem/logo de um jogo: só arquivos guardados pelo app. */
function limparImagemDoJogo(url, dadosDir, pasta) {
  if (!url) return null;
  return dentroDe(dadosDir, pasta, url) && EXT_IMAGEM.test(caminhoDeUrl(url)) ? String(url) : null;
}

module.exports = {
  VARS, FONTES, TIPOS_FUNDO, DASHBOARDS, MAX_SKINS,
  limparSkin, limparLista, guardarArquivo, exportarSkin, importarSkin, limparImagemDoJogo, dentroDe, tipoDoArquivo
};
