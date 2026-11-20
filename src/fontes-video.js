'use strict';
/**
 * Arcade Hub — fontes de vídeo além do Steam.
 *
 *  YouTube        busca pela YouTube Data API v3 (chave grátis do usuário) e toca
 *                 pelo player oficial embutido. Não baixa o vídeo (as regras do
 *                 YouTube não permitem), então precisa de internet para tocar.
 *                 A escolha fica em cache para não gastar a cota diária a cada vez.
 *
 *  ScreenScraper  API v2 (screenscraper.fr), a mesma usada pelo EmulationStation.
 *                 Para ROMs: identifica o jogo pelo sistema + nome/tamanho (e CRC,
 *                 em ROMs pequenas) e baixa o vídeo de gameplay para o cache.
 *                 Precisa da conta do usuário E de credenciais de desenvolvedor.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const UA = 'ArcadeHub/1.0 (+https://github.com/alphagunsmith/Arcade-Hub)';

/* ------------------------------------------------------------------ */
/* utilidades                                                          */
/* ------------------------------------------------------------------ */

const normal = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/['’`´]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

async function pegar(url, opts, fetcher) {
  const f = fetcher || fetch;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), (opts && opts.timeout) || 20000);
  try {
    return await f(url, { signal: ctrl.signal, headers: { 'User-Agent': UA, ...((opts && opts.headers) || {}) } });
  } finally { clearTimeout(t); }
}

/* ------------------------------------------------------------------ */
/* YouTube                                                             */
/* ------------------------------------------------------------------ */

const MOTIVO_YT = {
  keyInvalid: 'a chave do YouTube é inválida',
  badRequest: 'a chave do YouTube é inválida',
  quotaExceeded: 'o limite diário da chave do YouTube acabou (volta amanhã)',
  dailyLimitExceeded: 'o limite diário da chave do YouTube acabou (volta amanhã)',
  accessNotConfigured: 'ative a "YouTube Data API v3" no projeto da chave',
  forbidden: 'a chave do YouTube não tem permissão para buscar',
  ipRefererBlocked: 'a chave do YouTube tem restrição de site/IP — tire a restrição ou use "Nenhuma"'
};

/** Pontua um resultado: título do jogo presente + palavras de trailer/gameplay. */
function pontuar(item, jogo, ehRom) {
  const t = normal(item.snippet && item.snippet.title);
  const alvo = normal(jogo.title);
  let p = 0;
  if (alvo && t.includes(alvo)) p += 10;
  else {
    const palavras = alvo.split(' ').filter(w => w.length > 2);
    p += palavras.filter(w => t.includes(w)).length * 2;
  }
  if (ehRom ? /gameplay|longplay|playthrough/.test(t) : /trailer/.test(t)) p += 4;
  if (/official|oficial/.test(t)) p += 2;
  if (/reaction|react|review|analise|meme|tier list|top 10|ranking/.test(t)) p -= 8;
  return p;
}

async function buscarYoutube(jogo, chave, fetcher, ignorar) {
  if (!chave) return { ok: false, motivo: 'sem chave do YouTube' };
  const ehRom = jogo.kind === 'rom';
  const q = ehRom ? `${jogo.title} ${jogo.platform || ''} gameplay` : `${jogo.title} trailer`;
  const url = 'https://www.googleapis.com/youtube/v3/search?' + new URLSearchParams({
    part: 'snippet', type: 'video', videoEmbeddable: 'true', maxResults: '8',
    safeSearch: 'moderate', q: q.trim(), key: chave
  });
  let res;
  try { res = await pegar(url, {}, fetcher); } catch (e) { return { ok: false, motivo: 'sem conexão com o YouTube' }; }
  let j = {};
  try { j = await res.json(); } catch { /* resposta vazia */ }
  if (!res.ok) {
    const razao = j && j.error && j.error.errors && j.error.errors[0] && j.error.errors[0].reason;
    return { ok: false, motivo: MOTIVO_YT[razao] || `o YouTube recusou a busca (${res.status})` };
  }
  const fora = new Set(ignorar || []);
  const itens = (j.items || []).filter(i => i && i.id && i.id.videoId && !fora.has(i.id.videoId));
  if (!itens.length) return { ok: false, motivo: 'o YouTube não achou vídeo desse jogo' };
  const melhor = itens.map(i => ({ i, p: pontuar(i, jogo, ehRom) })).sort((a, b) => b.p - a.p)[0];
  if (melhor.p < 4) return { ok: false, motivo: 'o YouTube não achou um vídeo confiável desse jogo' };
  return { ok: true, youtubeId: melhor.i.id.videoId, nome: (melhor.i.snippet && melhor.i.snippet.title) || '' };
}

function urlEmbed(id) {
  return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?` + new URLSearchParams({
    autoplay: '1', mute: '1', controls: '0', loop: '1', playlist: id, rel: '0',
    playsinline: '1', iv_load_policy: '3', disablekb: '1', modestbranding: '1', fs: '0'
  });
}

/* ------------------------------------------------------------------ */
/* ScreenScraper                                                       */
/* ------------------------------------------------------------------ */

// códigos de sistema do ScreenScraper para as plataformas do Arcade Hub
const SS_SISTEMAS = {
  genesis: 1, sms: 2, nes: 3, snes: 4, gb: 9, gbc: 10, gba: 12, gc: 13, n64: 14, nds: 15,
  wii: 16, '3ds': 17, wiiu: 18, gg: 21, saturn: 22, dreamcast: 23, atari2600: 26, pce: 31,
  ps1: 57, ps2: 58, psp: 61, c64: 66, arcade: 75, switch: 225
};

const credenciaisCompletas = c => !!(c && c.devid && c.devpassword && c.usuario && c.senha);

function paramsBase(c) {
  return {
    devid: c.devid, devpassword: c.devpassword, softname: 'ArcadeHub',
    ssid: c.usuario, sspassword: c.senha, output: 'json'
  };
}

/** Traduz as respostas de erro do ScreenScraper (vêm como texto, em francês). */
function motivoSS(status, texto) {
  const t = String(texto || '');
  if (/identifiants d.veloppeur|developer/i.test(t)) return 'ID/senha de desenvolvedor do ScreenScraper recusados';
  if (/identifiants|login|utilisateur/i.test(t) || status === 401) return 'usuário ou senha do ScreenScraper recusados';
  if (/non trouv/i.test(t) || status === 404) return 'o ScreenScraper não achou essa ROM';
  if (status === 429 || status === 430 || status === 431 || /quota|limite/i.test(t)) return 'limite de uso do ScreenScraper atingido (tente mais tarde)';
  if (status === 423 || /ferm|closed|maintenance/i.test(t)) return 'o ScreenScraper está fora do ar agora';
  return `o ScreenScraper recusou (${status})`;
}

/** CRC32 de ROMs pequenas (ajuda o ScreenScraper a achar a versão certa). */
function crcDaRom(arquivo, tamanho) {
  if (typeof zlib.crc32 !== 'function' || tamanho > 64 * 1024 * 1024) return '';
  let fd = null;
  try {
    fd = fs.openSync(arquivo, 'r');
    const buf = Buffer.alloc(1024 * 1024);
    let crc = 0, n;
    while ((n = fs.readSync(fd, buf, 0, buf.length, null)) > 0) crc = zlib.crc32(buf.subarray(0, n), crc);
    return (crc >>> 0).toString(16).toUpperCase().padStart(8, '0');
  } catch { return ''; } finally { if (fd !== null) try { fs.closeSync(fd); } catch { /* noop */ } }
}

async function videoScreenScraper(jogo, cred, fetcher) {
  if (!credenciaisCompletas(cred)) return { ok: false, motivo: 'ScreenScraper sem conta configurada' };
  const sistema = SS_SISTEMAS[jogo.platformKey];
  if (!sistema) return { ok: false, motivo: 'essa plataforma não tem código no ScreenScraper' };
  if (!jogo.rom) return { ok: false, motivo: 'o ScreenScraper só busca ROMs' };
  let tamanho = 0;
  try { tamanho = fs.statSync(jogo.rom).size; } catch { return { ok: false, motivo: 'arquivo da ROM não encontrado' }; }
  const params = { ...paramsBase(cred), systemeid: String(sistema), romtype: 'rom', romnom: path.basename(jogo.rom), romtaille: String(tamanho) };
  const crc = crcDaRom(jogo.rom, tamanho);
  if (crc) params.crc = crc;
  let res, texto;
  try {
    res = await pegar('https://api.screenscraper.fr/api2/jeuInfos.php?' + new URLSearchParams(params), { timeout: 30000 }, fetcher);
    texto = await res.text();
  } catch { return { ok: false, motivo: 'sem conexão com o ScreenScraper' }; }
  let j = null;
  try { j = JSON.parse(texto); } catch { /* erro vem como texto */ }
  if (!res.ok || !j) return { ok: false, motivo: motivoSS(res.status, texto) };
  const jogoSS = j.response && j.response.jeu;
  const medias = (jogoSS && jogoSS.medias) || [];
  const video = medias.find(m => m.type === 'video-normalized' && m.url) || medias.find(m => m.type === 'video' && m.url);
  if (!video) return { ok: false, motivo: 'o ScreenScraper não tem vídeo dessa ROM' };
  return { ok: true, url: video.url, jogoId: String(jogoSS.id || ''), nome: ((jogoSS.noms || [])[0] || {}).text || jogo.title };
}

/** Confere a conta (botão "Testar" nos ajustes). */
async function testarScreenScraper(cred, fetcher) {
  if (!credenciaisCompletas(cred)) return { ok: false, motivo: 'preencha usuário, senha, ID e senha de desenvolvedor' };
  try {
    const res = await pegar('https://api.screenscraper.fr/api2/ssuserInfos.php?' + new URLSearchParams(paramsBase(cred)), {}, fetcher);
    const texto = await res.text();
    let j = null;
    try { j = JSON.parse(texto); } catch { /* erro em texto */ }
    if (!res.ok || !j) return { ok: false, motivo: motivoSS(res.status, texto) };
    const u = (j.response && j.response.ssuser) || {};
    return { ok: true, info: `conta ${u.id || cred.usuario} · ${u.requeststoday || 0} de ${u.maxrequestsperday || '?'} buscas hoje` };
  } catch { return { ok: false, motivo: 'sem conexão com o ScreenScraper' }; }
}

async function testarYoutube(chave, fetcher) {
  const r = await buscarYoutube({ title: 'Hollow Knight', kind: 'game' }, chave, fetcher);
  return r.ok ? { ok: true, info: 'chave funcionando' } : r;
}

module.exports = {
  buscarYoutube, urlEmbed, testarYoutube,
  videoScreenScraper, testarScreenScraper, credenciaisCompletas, SS_SISTEMAS, crcDaRom
};
