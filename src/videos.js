/* ================= Arcade Hub — vídeos dos jogos =================
 *
 * O rondel toca um vídeo do jogo selecionado quando ele fica 2 s no centro.
 * De onde vem o vídeo, na ordem:
 *
 *   1. ARQUIVO LOCAL — se o usuário apontou uma pasta de vídeos em Ajustes,
 *      procura `<nome do jogo>.mp4` (também .webm/.mkv/.mov). Vale até para
 *      jogo de emulador, então dá para usar vídeo gravado à mão.
 *   2. CACHE LOCAL — vídeo já baixado antes (não baixa de novo).
 *   3. STEAM — API pública `appdetails` do appid (sem chave), pega o trailer
 *      com `highlight: true` (o mesmo do Steam) e baixa para o cache.
 *
 * IMPORTANTE (offline-first): o renderer NUNCA recebe URL remota de vídeo. O
 * processo principal baixa, valida e devolve um `file://` local. Também existe
 * `iniciarServidorVideos`, que serve os arquivos por HTTP em 127.0.0.1 para
 * quando o Chromium se recusar a tocar `file://` dentro do <video>.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const crypto = require('crypto');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const TIMEOUT = 20000;
const VIDEO_EXT = /\.(mp4|webm|mkv|mov|m4v|ogv)$/i;
const MAX_MB = 220;                     // trailer de verdade fica entre 8 e 60 MB

function dataDirOf(dir) {
  return dir || path.join(os.homedir(), '.arcade-hub');
}

function videoDir(dir) {
  const d = path.join(dataDirOf(dir), 'videos');
  try { fs.mkdirSync(d, { recursive: true }); } catch { /* noop */ }
  return d;
}

function videoLocalDir(dir) {
  const d = path.join(dataDirOf(dir), 'trailers');
  try { fs.mkdirSync(d, { recursive: true }); } catch { /* noop */ }
  return d;
}

/** "Crash Bandicoot N. Sane Trilogy" -> "crash bandicoot n sane trilogy" */
function chaveTitulo(titulo) {
  return String(titulo || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['’`´]/g, '')            // "Dante's" == "Dantes"
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(the|a|o|os|as|de|do|da|edition|edicao|goty|definitive)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Nome de arquivo seguro. */
function slug(titulo) {
  return chaveTitulo(titulo).replace(/ /g, '-').slice(0, 70) || 'jogo';
}

function extDeContentType(ct) {
  if (!ct) return '.mp4';
  if (/webm/i.test(ct)) return '.webm';
  if (/quicktime/i.test(ct)) return '.mov';
  if (/ogg/i.test(ct)) return '.ogv';
  return '.mp4';
}

function toFileUrl(p) {
  return 'file://' + String(p).replace(/\\/g, '/');
}

/* ------------------------------------------------------------------ */
/* 1) pasta local do usuário                                           */
/* ------------------------------------------------------------------ */

/**
 * Procura o vídeo do jogo na pasta que o usuário indicou.
 * Compara pelo nome do arquivo sem extensão, ignorando acento/caixa/pontuação,
 * então "Crash Bandicoot 2 - Cortex Strikes Back.mp4" casa com o jogo.
 */
function procurarLocal(titulo, pasta) {
  if (!pasta || !fs.existsSync(pasta)) return null;
  const alvo = chaveTitulo(titulo);
  if (!alvo) return null;

  let arquivos = [];
  try {
    arquivos = fs.readdirSync(pasta, { withFileTypes: true })
      .filter(e => e.isFile() && VIDEO_EXT.test(e.name))
      .map(e => e.name);
  } catch { return null; }

  // 1º passe: nome idêntico; 2º: um começa com o outro (jogo + subtítulo)
  let escolhido = arquivos.find(n => chaveTitulo(path.basename(n, path.extname(n))) === alvo);
  if (!escolhido) {
    escolhido = arquivos.find(n => {
      const k = chaveTitulo(path.basename(n, path.extname(n)));
      return k && alvo && (k.startsWith(alvo) || alvo.startsWith(k));
    });
  }
  return escolhido ? path.join(pasta, escolhido) : null;
}

/* ------------------------------------------------------------------ */
/* 2/3) Steam                                                          */
/* ------------------------------------------------------------------ */

async function fetchJson(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': UA, Accept: 'application/json' }
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** Descobre o appid do jogo pelo nome (API pública de busca do Steam). */
async function appIdPorNome(titulo) {
  const url = `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(titulo)}&cc=br&l=portuguese`;
  const j = await fetchJson(url);
  const itens = (j && j.items) || [];
  if (!itens.length) return null;
  const alvo = chaveTitulo(titulo);
  // prefere o item cujo nome bate inteiro, senão o primeiro (o Steam já ordena)
  const exato = itens.find(i => chaveTitulo(i.name) === alvo);
  return String((exato || itens[0]).id || '') || null;
}

/**
 * Trailers de um appid, o destaque primeiro.
 *
 * A API devolve manifests adaptativos (DASH/HLS), que um <video> comum não toca
 * e cujo cache offline exigiria remuxar dezenas de segmentos. O CDN do Steam
 * também publica o MESMO trailer em MP4 progressivo, no padrão
 *   https://cdn.akamai.steamstatic.com/steam/apps/<movieId>/movie480.mp4
 * — um arquivo só, que toca em qualquer lugar e cabe no cache (≈8–15 MB).
 * Preferimos ele; os manifests ficam como reserva.
 */
async function trailersDoApp(appId) {
  if (!appId) return [];
  const url = `https://store.steampowered.com/api/appdetails?appids=${encodeURIComponent(appId)}&filters=movies&l=portuguese`;
  const j = await fetchJson(url);
  const d = j && j[appId] && j[appId].success ? j[appId].data : null;
  const filmes = (d && d.movies) || [];
  const lista = filmes.map(m => {
    if (!m) return null;
    const idFilme = m.id || '';
    const mp4 = idFilme
      ? `https://cdn.akamai.steamstatic.com/steam/apps/${idFilme}/movie480.mp4`
      : '';
    return {
      nome: m.name || '',
      mp4,
      // reserva: fica registrado de onde veio, para diagnóstico
      manifesto: m.hls_h264 || m.dash_h264 || '',
      destacado: !!m.highlight
    };
  }).filter(m => m && m.mp4);
  return lista.sort((a, b) => Number(b.destacado) - Number(a.destacado));
}

/** Confirma que o MP4 existe (alguns trailers antigos só têm manifest). */
async function mp4Existe(url) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 12000);
    const r = await fetch(url, { method: 'HEAD', signal: ctrl.signal, headers: { 'User-Agent': UA } });
    clearTimeout(t);
    return r.ok && /video/i.test(r.headers.get('content-type') || '');
  } catch { return false; }
}

async function baixarArquivo(url, destino) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 120000);
  const tmp = destino + '.part';
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': UA, Accept: 'video/*', Referer: 'https://store.steampowered.com/' }
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const total = Number(res.headers.get('content-length') || 0);
    if (total && total > MAX_MB * 1024 * 1024) throw new Error('vídeo grande demais');
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 20000) throw new Error('arquivo de vídeo inválido');
    fs.writeFileSync(tmp, buf);
    fs.renameSync(tmp, destino);
    return destino;
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch { /* noop */ }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------------------------------------------ */
/* API principal                                                        */
/* ------------------------------------------------------------------ */

/**
 * Resolve o vídeo de um jogo.
 * @returns {Promise<{ok:boolean, url?:string, origem?:string, arquivo?:string,
 *                    appId?:string, nome?:string, motivo?:string}>}
 */
async function resolverVideo(jogo, opts) {
  const o = opts || {};
  const dir = dataDirOf(o.dataDir);
  const titulo = (jogo && jogo.title) || '';
  if (!titulo) return { ok: false, motivo: 'jogo sem nome' };

  // 1) pasta do usuário
  const local = procurarLocal(titulo, o.localDir);
  if (local) {
    return { ok: true, url: toFileUrl(local), arquivo: local, origem: 'pasta local', nome: path.basename(local) };
  }

  // 2) cache
  const cache = path.join(videoDir(dir), slug(titulo) + '.mp4');
  const metaArq = cache.replace(/\.mp4$/, '.json');
  if (fs.existsSync(cache) && fs.statSync(cache).size > 20000) {
    let doCache = {};
    try { doCache = JSON.parse(fs.readFileSync(metaArq, 'utf8')); } catch { /* cache antigo, sem metadados */ }
    return {
      ok: true, url: toFileUrl(cache), arquivo: cache, origem: 'cache',
      appId: (jogo && jogo.steamAppId) || doCache.appId || '', nome: doCache.nome || ''
    };
  }
  if (o.somenteLocal) return { ok: false, motivo: 'sem vídeo local' };

  // 3) Steam
  try {
    const appId = (jogo && jogo.steamAppId) || await appIdPorNome(titulo);
    if (!appId) return { ok: false, motivo: 'não achei esse jogo no Steam' };
    const trailers = await trailersDoApp(appId);
    if (!trailers.length) return { ok: false, motivo: 'o Steam não tem trailer desse jogo', appId };
    // tenta os primeiros: trailer antigo pode não ter MP4 no CDN
    for (const t of trailers.slice(0, 3)) {
      if (!(await mp4Existe(t.mp4))) continue;
      await baixarArquivo(t.mp4, cache);
      // guarda de qual trailer/appid veio (diagnóstico e replay do cache)
      try { fs.writeFileSync(metaArq, JSON.stringify({ appId, nome: t.nome, url: t.mp4, em: Date.now() })); } catch { /* noop */ }
      return { ok: true, url: toFileUrl(cache), arquivo: cache, origem: 'steam', appId, nome: t.nome };
    }
    return { ok: false, motivo: 'os trailers desse jogo não estão em MP4', appId };
  } catch (e) {
    return { ok: false, motivo: String((e && e.message) || e) };
  }
}

/**
 * Servidor HTTP local para os vídeos.
 *
 * O <video> dentro do app consegue abrir `file://`, mas essa é a única forma e
 * ela quebra em algumas configurações. Servir por http://127.0.0.1 resolve e
 * ainda permite busca (range) no vídeo, o que deixa o play instantâneo.
 * Só aceita arquivos que estão DENTRO da pasta de vídeos (nada de path traversal).
 */
function iniciarServidorVideos(dir, porta) {
  const raiz = path.resolve(dataDirOf(dir));
  const permitidas = [path.join(raiz, 'videos'), path.join(raiz, 'trailers')];

  const server = http.createServer((req, res) => {
    let alvo;
    try { alvo = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').searchParams.get('f') || ''); }
    catch { res.writeHead(400); return res.end('pedido inválido'); }
    if (!alvo) { res.writeHead(400); return res.end('faltou o arquivo'); }

    const abs = path.resolve(alvo);
    const dentro = permitidas.some(p => abs === p || abs.startsWith(p + path.sep));
    if (!dentro || !fs.existsSync(abs)) { res.writeHead(404); return res.end('não encontrado'); }

    const stat = fs.statSync(abs);
    const tipo = /\.webm$/i.test(abs) ? 'video/webm' : /\.(ogv|ogg)$/i.test(abs) ? 'video/ogg'
      : /\.(mov|m4v)$/i.test(abs) ? 'video/quicktime' : 'video/mp4';
    const range = req.headers.range;

    if (range) {
      const m = /bytes=(\d*)-(\d*)/.exec(range);
      let ini = m && m[1] ? Number(m[1]) : 0;
      let fim = m && m[2] ? Number(m[2]) : stat.size - 1;
      if (m && !m[1] && m[2]) { ini = Math.max(0, stat.size - Number(m[2])); fim = stat.size - 1; }   // "bytes=-500"
      fim = Math.min(fim, stat.size - 1);
      if (!m || ini > fim || ini >= stat.size) {
        res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` });
        return res.end();
      }
      res.writeHead(206, {
        'Content-Type': tipo, 'Accept-Ranges': 'bytes',
        'Content-Range': `bytes ${ini}-${fim}/${stat.size}`,
        'Content-Length': fim - ini + 1, 'Cache-Control': 'no-store'
      });
      fs.createReadStream(abs, { start: ini, end: fim }).pipe(res);
      return;
    }

    res.writeHead(200, {
      'Content-Type': tipo, 'Content-Length': stat.size,
      'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store'
    });
    fs.createReadStream(abs).pipe(res);
  });

  return new Promise((resolve) => {
    server.on('error', () => resolve({ ok: false, porta: 0 }));
    server.listen(porta || 0, '127.0.0.1', () => resolve({ ok: true, porta: server.address().port, server }));
  });
}

module.exports = {
  resolverVideo, procurarLocal, chaveTitulo, slug, videoDir, videoLocalDir,
  appIdPorNome, trailersDoApp, mp4Existe, iniciarServidorVideos, toFileUrl, VIDEO_EXT
};
