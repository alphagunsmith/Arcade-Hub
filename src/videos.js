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
const fontes = require('./fontes-video');

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
  if (!alvo) return null;
  // Só nome igual. "Contém" pegava outro jogo da série ("Minecraft" → "Minecraft
  // Dungeons II", "Warcraft" → "Guardian of Warcraft"): melhor ficar sem vídeo.
  const exato = itens.find(i => chaveTitulo(i.name) === alvo);
  if (exato) return String(exato.id || '') || null;
  // única exceção: o nome do jogo é o subtítulo do nome no Steam
  // ("Expedition 33" ↔ "Clair Obscur: Expedition 33")
  const subtitulo = alvo.length >= 6 && itens.find(i => {
    const partes = String(i.name || '').split(/\s*:\s+|\s+[-–—]\s+/).slice(1).map(chaveTitulo);
    return partes.includes(alvo);
  });
  return subtitulo ? String(subtitulo.id || '') || null : null;
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
  const url = `https://store.steampowered.com/api/appdetails?appids=${encodeURIComponent(appId)}&filters=basic,movies&l=portuguese`;
  const j = await fetchJson(url);
  const d = j && j[appId] && j[appId].success ? j[appId].data : null;
  // o Steam também vende filmes, séries e trilhas sonoras: só serve jogo
  if (d && d.type && d.type !== 'game') return [];
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
      // trailers enviados a partir de 2025 não têm MP4 no CDN: só HLS/DASH
      hls: m.hls_h264 || '',
      destacado: !!m.highlight
    };
  }).filter(m => m && (m.mp4 || m.hls));
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

/* ------------------------------------------------------------------ */
/* HLS → MP4 (trailers novos do Steam)                                 */
/* ------------------------------------------------------------------ */

async function fetchTexto(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': UA, Referer: 'https://store.steampowered.com/' } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.text();
  } finally { clearTimeout(timer); }
}

async function fetchBuffer(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 60000);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': UA, Referer: 'https://store.steampowered.com/' } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return Buffer.from(await res.arrayBuffer());
  } finally { clearTimeout(timer); }
}

/** Escolhe a variante de vídeo: 720p se houver, senão a maior abaixo disso, senão a menor. */
function escolherVariante(master, baseUrl) {
  const linhas = master.split(/\r?\n/);
  const opcoes = [];
  for (let i = 0; i < linhas.length; i++) {
    const m = /^#EXT-X-STREAM-INF:(.*)$/.exec(linhas[i]);
    if (!m) continue;
    const alt = /RESOLUTION=\d+x(\d+)/.exec(m[1]);
    const uri = (linhas[i + 1] || '').trim();
    if (uri && !uri.startsWith('#')) opcoes.push({ altura: alt ? Number(alt[1]) : 0, url: new URL(uri, baseUrl).href });
  }
  if (!opcoes.length) return null;
  const ate720 = opcoes.filter(o => o.altura && o.altura <= 720).sort((a, b) => b.altura - a.altura);
  return (ate720[0] || opcoes.sort((a, b) => a.altura - b.altura)[0]).url;
}

/** Lê a playlist HLS e devolve as URLs na ordem: o início (EXT-X-MAP) e os pedaços. */
async function listaHls(masterUrl) {
  const master = await fetchTexto(masterUrl);
  const varUrl = escolherVariante(master, masterUrl);
  if (!varUrl) throw new Error('trailer sem variante de vídeo');
  const lista = await fetchTexto(varUrl);
  if (/#EXT-X-KEY:METHOD=(?!NONE)/.test(lista)) throw new Error('trailer protegido');
  const mapa = /#EXT-X-MAP:URI="([^"]+)"/.exec(lista);
  if (!mapa) throw new Error('trailer em formato antigo (TS), não suportado');
  const pedacos = lista.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#'))
    .map(u => new URL(u, varUrl).href);
  if (!pedacos.length) throw new Error('trailer vazio');
  return [new URL(mapa[1], varUrl).href, ...pedacos];
}

/**
 * Baixa um trailer HLS (fMP4) e junta num MP4 só, que o <video> toca do disco.
 * Os segmentos .m4s são pedaços de um MP4 fragmentado: o arquivo de início
 * (EXT-X-MAP) seguido dos pedaços, em ordem, já é um MP4 válido.
 * Só o vídeo (o rondel toca sem som), então não precisa juntar o áudio.
 */
async function baixarHls(masterUrl, destino) {
  const urls = await listaHls(masterUrl);
  // baixa 4 de cada vez, mantendo a ordem
  const partes = new Array(urls.length);
  let total = 0;
  for (let i = 0; i < urls.length; i += 4) {
    const lote = await Promise.all(urls.slice(i, i + 4).map(fetchBuffer));
    lote.forEach((b, j) => { partes[i + j] = b; total += b.length; });
    if (total > MAX_MB * 1024 * 1024) throw new Error('vídeo grande demais');
  }
  const mp4 = Buffer.concat(partes);
  if (mp4.length < 20000 || mp4.toString('ascii', 4, 8) !== 'ftyp') throw new Error('arquivo de vídeo inválido');
  const tmp = destino + '.part';
  fs.writeFileSync(tmp, mp4);
  fs.renameSync(tmp, destino);
  return destino;
}

async function baixarArquivo(url, destino) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 120000);
  const tmp = destino + '.part';
  try {
    const steam = /steamstatic\.com/i.test(url);
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': UA, Accept: 'video/*', ...(steam ? { Referer: 'https://store.steampowered.com/' } : {}) }
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

/** Steam: MP4 direto (trailers antigos) ou HLS montado em MP4 (novos). */
async function viaSteam(jogo, titulo, cache, metaArq, o) {
  if (o && o.stream) {
    const plano = await planoSteam(jogo, titulo);
    if (!plano.ok) return plano;
    const meta = { appId: plano.appId, nome: plano.nome, url: plano.fonte, em: Date.now(), v2: true };
    const url = await urlStreaming(o.dataDir, plano, cache, metaArq, meta);
    if (url) return { ok: true, url, arquivo: cache, origem: 'steam', streaming: true, appId: plano.appId, nome: plano.nome };
    // sem servidor local: cai no download completo abaixo
  }
  const appId = (jogo && jogo.steamAppId) || await appIdPorNome(titulo);
  if (!appId) return { ok: false, motivo: 'não achei esse jogo no Steam' };
  const trailers = await trailersDoApp(appId);
  if (!trailers.length) return { ok: false, motivo: 'o Steam não tem trailer desse jogo', appId };
  let ultimoErro = '';
  for (const t of trailers.slice(0, 3)) {
    try {
      let fonte = '';
      if (t.mp4 && await mp4Existe(t.mp4)) { await baixarArquivo(t.mp4, cache); fonte = t.mp4; }
      else if (t.hls) { await baixarHls(t.hls, cache); fonte = t.hls; }
      else continue;
      try { fs.writeFileSync(metaArq, JSON.stringify({ appId, nome: t.nome, url: fonte, em: Date.now(), v2: true })); } catch { /* noop */ }
      return { ok: true, url: toFileUrl(cache), arquivo: cache, origem: 'steam', appId, nome: t.nome };
    } catch (e) {
      ultimoErro = String((e && e.message) || e);
    }
  }
  return { ok: false, motivo: ultimoErro || 'não consegui baixar o trailer desse jogo', appId };
}

/* ------------------------------------------------------------------ */
/* Streaming: toca enquanto baixa                                       */
/* ------------------------------------------------------------------ */
/*
 * Em vez de baixar o trailer inteiro (10–60 MB) antes de mostrar, o servidor
 * local entrega os bytes ao <video> conforme chegam e, ao mesmo tempo, grava
 * no cache. O MP4 do Steam já vem com o índice (moov) no começo e o HLS é
 * MP4 fragmentado, então os dois começam a tocar com o primeiro pedaço.
 * Quem pedir de novo no meio do download (o loop, por exemplo) recebe o que
 * já chegou e continua junto; depois de pronto, vem do arquivo.
 */

const PLANO_VALIDADE = 30 * 60 * 1000;
const ABANDONO_MS = 3000;          // sem ninguém assistindo por 3 s: cancela o download
const planos = new Map();          // chave do jogo -> { em, plano } (só os endereços)
const transmissoes = new Map();    // token -> { plano, destino, metaArq, meta }
const downloads = new Map();       // destino -> Transmissao em andamento
const inicios = new Map();         // fonte -> { pedacos, pronto } começo pré-baixado dos vizinhos
const INICIO_MAX = 6;              // no máximo 6 começos na memória (~2 MB cada)
const INICIO_MP4 = 768 * 1024;     // MP4: 768 KB já passam o índice e uns segundos de vídeo
const INICIO_HLS = 3;              // HLS: init + 2 pedaços (o player começa com 2)

/** Descobre de onde vem o trailer do Steam sem baixar nada (alguns KB). */
async function planoSteam(jogo, titulo) {
  const chave = 'steam:' + ((jogo && jogo.steamAppId) || chaveTitulo(titulo));
  const guardado = planos.get(chave);
  if (guardado && Date.now() - guardado.em < PLANO_VALIDADE) return guardado.plano;
  const appId = (jogo && jogo.steamAppId) || await appIdPorNome(titulo);
  if (!appId) return { ok: false, motivo: 'não achei esse jogo no Steam' };
  const trailers = await trailersDoApp(appId);
  if (!trailers.length) return { ok: false, motivo: 'o Steam não tem trailer desse jogo', appId };
  let ultimoErro = '';
  for (const t of trailers.slice(0, 3)) {
    try {
      let plano = null;
      if (t.mp4 && await mp4Existe(t.mp4)) plano = { ok: true, tipo: 'mp4', url: t.mp4, fonte: t.mp4, appId, nome: t.nome };
      else if (t.hls) plano = { ok: true, tipo: 'hls', urls: await listaHls(t.hls), fonte: t.hls, appId, nome: t.nome };
      if (plano) { planos.set(chave, { em: Date.now(), plano }); return plano; }
    } catch (e) { ultimoErro = String((e && e.message) || e); }
  }
  return { ok: false, motivo: ultimoErro || 'não consegui ler o trailer desse jogo', appId };
}

class Transmissao {
  constructor(plano, destino, aoTerminar) {
    this.plano = plano; this.destino = destino; this.aoTerminar = aoTerminar;
    this.pedacos = []; this.total = 0; this.tamanho = 0;
    this.pronto = false; this.erro = null;
    this.ouvintes = new Set();
    this.cabecalho = new Promise(res => { this._cabecalho = res; });
  }

  // entrega a quem está assistindo e grava no cache
  _empurrar(b) {
    if (this.total === 0 && (b.length < 8 || b.toString('ascii', 4, 8) !== 'ftyp')) throw new Error('arquivo de vídeo inválido');
    this.pedacos.push(b); this.total += b.length;
    if (this.total > MAX_MB * 1024 * 1024) throw new Error('vídeo grande demais');
    this.arquivo.write(b);
    for (const o of this.ouvintes) { try { o.write(b); } catch { /* quem saiu sai */ } }
  }

  async _fetch(url, signal, extra) {
    const steam = /steamstatic\.com/i.test(url);
    const res = await fetch(url, { signal, headers: { 'User-Agent': UA, Accept: 'video/*,*/*', ...(steam ? { Referer: 'https://store.steampowered.com/' } : {}), ...(extra || {}) } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res;
  }

  async iniciar() {
    const tmp = this.destino + '.part';
    const ctrl = new AbortController();
    this.ctrl = ctrl;
    const parado = setTimeout(() => ctrl.abort(), 180000);
    this.arquivo = fs.createWriteStream(tmp);
    try {
      // começo já pré-baixado (vizinho do rondel)? entrega na hora e segue dali
      let comeco = [];
      const ini = inicios.get(this.plano.fonte);
      if (ini) { try { comeco = (await ini.pronto) || []; } catch { comeco = []; } }
      if (this.plano.tipo === 'mp4') {
        const jaTem = comeco.reduce((n, b) => n + b.length, 0);
        const res = await this._fetch(this.plano.url, ctrl.signal, jaTem ? { Range: `bytes=${jaTem}-` } : null);
        let pular = 0;
        if (jaTem && res.status === 206) {
          const tot = /\/(\d+)$/.exec(res.headers.get('content-range') || '');
          this.tamanho = tot ? Number(tot[1]) : 0;
        } else {
          this.tamanho = Number(res.headers.get('content-length') || 0);
          pular = jaTem;                 // servidor ignorou o range: descarta o que já temos
        }
        if (this.tamanho > MAX_MB * 1024 * 1024) throw new Error('vídeo grande demais');
        this._cabecalho();
        for (const b of comeco) this._empurrar(b);
        for await (const parte of res.body) {
          let b = Buffer.from(parte);
          if (pular) { const corte = Math.min(pular, b.length); b = b.subarray(corte); pular -= corte; if (!b.length) continue; }
          this._empurrar(b);
        }
        if (this.tamanho && this.total !== this.tamanho) throw new Error('download incompleto');
      } else {
        // HLS: um pedaço de cada vez, na ordem, com a banda toda: o player
        // precisa dos primeiros pedaços inteiros para começar, e buscar vários
        // juntos atrasava todos. Só o init (pequeno) vai junto com o 1º.
        this._cabecalho();
        const urls = this.plano.urls;
        const pegar = u => {
          const p = this._fetch(u, ctrl.signal).then(r => r.arrayBuffer()).then(a => Buffer.from(a));
          p.catch(() => {});            // erro é tratado quando chega a vez dele
          return p;
        };
        for (const b of comeco) this._empurrar(b);
        const fila = [...comeco.map(b => Promise.resolve(b)), ...urls.slice(comeco.length, comeco.length + 2).map(pegar)];
        for (let i = comeco.length; i < urls.length; i++) {
          const b = await fila[i];
          while (fila.length < Math.min(urls.length, i + 3)) fila.push(pegar(urls[fila.length]));
          this._empurrar(b);
        }
      }
      if (this.total < 20000) throw new Error('arquivo de vídeo inválido');
      await new Promise((res, rej) => this.arquivo.end(e => (e ? rej(e) : res())));
      fs.renameSync(tmp, this.destino);
      this.pronto = true;
      try { this.aoTerminar && this.aoTerminar(); } catch { /* noop */ }
    } catch (e) {
      this.erro = e;
      this._cabecalho();
      try { this.arquivo.destroy(); } catch { /* noop */ }
      try { fs.unlinkSync(tmp); } catch { /* noop */ }
    } finally {
      clearTimeout(parado);
      for (const o of this.ouvintes) { try { this.erro ? o.destroy() : o.end(); } catch { /* noop */ } }
      this.ouvintes.clear();
      this.pedacos = [];                 // o arquivo já tem tudo
      downloads.delete(this.destino);
    }
  }

  /** Liga uma resposta HTTP: manda o que já chegou e segue mandando. */
  async servir(res, req) {
    await this.cabecalho;
    if (this.erro) { res.writeHead(502); return res.end(); }
    res.writeHead(200, {
      'Content-Type': 'video/mp4', 'Cache-Control': 'no-store', 'Accept-Ranges': 'none',
      ...(this.tamanho ? { 'Content-Length': this.tamanho } : {})
    });
    for (const b of this.pedacos) res.write(b);
    if (this.pronto || this.erro) return res.end();
    this.ouvintes.add(res);
    clearTimeout(this.abandono);
    req.on('close', () => {
      this.ouvintes.delete(res);
      if (this.ouvintes.size || this.pronto || this.erro) return;
      // o rondel girou para outro jogo: não deixa este disputar a banda com o próximo
      clearTimeout(this.abandono);
      this.abandono = setTimeout(() => {
        if (!this.ouvintes.size && !this.pronto && this.ctrl) this.ctrl.abort();
      }, ABANDONO_MS);
    });
  }
}

function transmissaoDe(t) {
  let d = downloads.get(t.destino);
  if (!d) {
    d = new Transmissao(t.plano, t.destino, () => {
      try { fs.writeFileSync(t.metaArq, JSON.stringify(t.meta)); } catch { /* noop */ }
    });
    downloads.set(t.destino, d);
    d.iniciar();
  }
  return d;
}

let servidor = null;               // Promise<{ok, porta}>
function portaDoServidor(dir) {
  if (!servidor) servidor = iniciarServidorVideos(dir).then(r => { if (!r.ok) servidor = null; return r; });
  return servidor.then(r => r.porta || 0);
}

/** Registra um trailer para tocar por streaming e devolve a URL local. */
async function urlStreaming(dir, plano, destino, metaArq, meta) {
  const porta = await portaDoServidor(dir);
  if (!porta) return '';
  const token = crypto.randomBytes(12).toString('hex');
  transmissoes.set(token, { plano, destino, metaArq, meta });
  if (transmissoes.size > 200) transmissoes.delete(transmissoes.keys().next().value);
  return `http://127.0.0.1:${porta}/stream/${token}`;
}

/** Baixa só o começo do trailer (para o vizinho do rondel começar na hora). */
function preCarregarInicio(plano) {
  if (!plano || !plano.ok || !plano.fonte || inicios.has(plano.fonte)) return inicios.get(plano && plano.fonte);
  const ent = { em: Date.now() };
  ent.pronto = (async () => {
    const H = { 'User-Agent': UA, Referer: 'https://store.steampowered.com/' };
    const pegar = async (u, extra) => {
      const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 30000);
      try {
        const r = await fetch(u, { signal: ctrl.signal, headers: { ...H, ...(extra || {}) } });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return { r, b: Buffer.from(await r.arrayBuffer()) };
      } finally { clearTimeout(t); }
    };
    if (plano.tipo === 'hls') {
      const out = [];
      for (const u of plano.urls.slice(0, INICIO_HLS)) out.push((await pegar(u)).b);
      return out;
    }
    const { r, b } = await pegar(plano.url, { Range: `bytes=0-${INICIO_MP4 - 1}` });
    return r.status === 206 ? [b] : [];     // sem range, não vale guardar o arquivo inteiro aqui
  })();
  ent.pronto.catch(() => inicios.delete(plano.fonte));
  inicios.set(plano.fonte, ent);
  while (inicios.size > INICIO_MAX) inicios.delete(inicios.keys().next().value);
  return ent;
}

/**
 * Prepara os vizinhos do rondel. Sempre descobre os endereços (alguns KB);
 * com `comeco`, também baixa o começo do trailer (~1–2 MB) para tocar na hora.
 */
async function prepararVideo(jogo, opts) {
  const o = opts || {};
  const titulo = (jogo && jogo.title) || '';
  if (!titulo) return false;
  const dir = dataDirOf(o.dataDir);
  if (procurarLocal(titulo, o.localDir)) return true;
  const base = path.join(videoDir(dir), slug(titulo));
  if (fs.existsSync(base + '.mp4') || fs.existsSync(base + '.yt.json')) return true;
  const ehRom = jogo.kind === 'rom';
  if (ehRom && !jogo.steamAppId) return false;
  try {
    const p = await planoSteam(jogo, titulo);
    if (!p || !p.ok) return false;
    if (o.comeco) { const ent = preCarregarInicio(p); if (ent) await ent.pronto.catch(() => {}); }
    return true;
  } catch { return false; }
}

/* ------------------------------------------------------------------ */
/* API principal                                                        */
/* ------------------------------------------------------------------ */

/**
 * O trailer guardado é mesmo deste jogo? true = sim, false = apagar,
 * null = não deu para conferir agora (sem internet): fica e confere depois.
 */
async function cacheSteamValido(jogo, titulo, meta) {
  const idLoja = jogo && jogo.steamAppId ? String(jogo.steamAppId) : '';
  if (idLoja) return !meta.appId || String(meta.appId) === idLoja;
  try {
    const certo = await appIdPorNome(titulo);
    return !!certo && String(certo) === String(meta.appId || '');
  } catch { return null; }
}

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
    // vídeo baixado com a regra antiga de nome (que pegava outro jogo): confere uma vez
    if (!o.somenteLocal && doCache.fonte !== 'screenscraper' && !doCache.v2) {
      const valido = await cacheSteamValido(jogo, titulo, doCache);
      if (valido === false) {
        for (const a of [cache, metaArq]) { try { fs.unlinkSync(a); } catch { /* noop */ } }
        planos.delete('steam:' + ((jogo && jogo.steamAppId) || chaveTitulo(titulo)));
      } else if (valido === true) {
        try { fs.writeFileSync(metaArq, JSON.stringify({ ...doCache, v2: true })); } catch { /* noop */ }
      }
    }
  }
  if (fs.existsSync(cache) && fs.statSync(cache).size > 20000) {
    let doCache = {};
    try { doCache = JSON.parse(fs.readFileSync(metaArq, 'utf8')); } catch { /* cache antigo, sem metadados */ }
    return {
      ok: true, url: toFileUrl(cache), arquivo: cache, origem: 'cache',
      appId: (jogo && jogo.steamAppId) || doCache.appId || '', nome: doCache.nome || ''
    };
  }
  // vídeo do YouTube escolhido antes (não gasta a cota de novo)
  const cacheYt = path.join(videoDir(dir), slug(titulo) + '.yt.json');
  let ytIgnorados = [];
  if (o.youtubeKey && fs.existsSync(cacheYt)) {
    try {
      const y = JSON.parse(fs.readFileSync(cacheYt, 'utf8'));
      // escolhido com o filtro antigo e não passa no novo (ex.: trailer do filme)? busca outro
      if (y && y.id && !fontes.youtubeAceito(y.nome, jogo)) {
        ytIgnorados = [...(y.ignorados || []), y.id];
        try { fs.writeFileSync(cacheYt, JSON.stringify({ ignorados: ytIgnorados })); } catch { /* noop */ }
      } else if (y && y.id) return { ok: true, tipo: 'youtube', youtubeId: y.id, url: fontes.urlEmbed(y.id), origem: 'youtube (cache)', nome: y.nome || '' };
      else ytIgnorados = (y && y.ignorados) || [];      // "Outro vídeo": não repete os recusados
    } catch { /* cache corrompido: busca de novo */ }
  }
  if (o.somenteLocal) return { ok: false, motivo: 'sem vídeo local' };

  // fila de fontes: a primeira que achar vence
  const ehRom = jogo && jogo.kind === 'rom';
  const fila = [];
  if (!ehRom || (jogo && jogo.steamAppId)) fila.push(['Steam', () => viaSteam(jogo, titulo, cache, metaArq, o)]);
  if (ehRom && fontes.credenciaisCompletas(o.screenscraper)) {
    fila.push(['ScreenScraper', async () => {
      const r = await fontes.videoScreenScraper(jogo, o.screenscraper, o.fetcher);
      if (!r.ok) return r;
      // sem a URL (ela leva as credenciais): só de onde veio
      const meta = { fonte: 'screenscraper', jogoId: r.jogoId, nome: r.nome, em: Date.now() };
      if (o.stream) {
        const url = await urlStreaming(o.dataDir, { tipo: 'mp4', url: r.url }, cache, metaArq, meta);
        if (url) return { ok: true, url, arquivo: cache, origem: 'screenscraper', streaming: true, nome: r.nome };
      }
      await baixarArquivo(r.url, cache);
      try { fs.writeFileSync(metaArq, JSON.stringify(meta)); } catch { /* noop */ }
      return { ok: true, url: toFileUrl(cache), arquivo: cache, origem: 'screenscraper', nome: r.nome };
    }]);
  }
  if (o.youtubeKey) {
    fila.push(['YouTube', async () => {
      const r = await fontes.buscarYoutube(jogo, o.youtubeKey, o.fetcher, ytIgnorados);
      if (!r.ok) return r;
      try { fs.writeFileSync(cacheYt, JSON.stringify({ id: r.youtubeId, nome: r.nome, em: Date.now(), ignorados: ytIgnorados })); } catch { /* noop */ }
      return { ok: true, tipo: 'youtube', youtubeId: r.youtubeId, url: fontes.urlEmbed(r.youtubeId), origem: 'youtube', nome: r.nome };
    }]);
  }
  if (!fila.length) return { ok: false, motivo: ehRom ? 'configure o ScreenScraper ou o YouTube para vídeos de ROMs' : 'sem fonte de vídeo' };
  const motivos = [];
  for (const [nome, tentar] of fila) {
    try {
      const r = await tentar();
      if (r && r.ok) return r;
      motivos.push(`${nome}: ${(r && r.motivo) || 'sem vídeo'}`);
    } catch (e) {
      motivos.push(`${nome}: ${String((e && e.message) || e)}`);
    }
  }
  return { ok: false, motivo: motivos.join(' · ') };
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
    // só o próprio app: um site aberto no navegador que "aponte" um domínio para
    // 127.0.0.1 (DNS rebinding) chega aqui com outro Host e é recusado
    if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/i.test(String(req.headers.host || ''))) {
      res.writeHead(403); return res.end();
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
    const st = /^\/stream\/([0-9a-f]{24})$/.exec((req.url || '').split('?')[0]);
    if (st) {
      const t = transmissoes.get(st[1]);
      if (!t) { res.writeHead(404); return res.end('não encontrado'); }
      // já terminou de baixar: vem do arquivo, com busca (range)
      if (!downloads.has(t.destino) && fs.existsSync(t.destino) && fs.statSync(t.destino).size > 20000) {
        return servirArquivo(t.destino, req, res);
      }
      transmissaoDe(t).servir(res, req).catch(() => { try { res.destroy(); } catch { /* noop */ } });
      return;
    }
    let alvo;
    try { alvo = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').searchParams.get('f') || ''); }
    catch { res.writeHead(400); return res.end('pedido inválido'); }
    if (!alvo) { res.writeHead(400); return res.end('faltou o arquivo'); }

    const abs = path.resolve(alvo);
    const dentro = permitidas.some(p => abs === p || abs.startsWith(p + path.sep));
    if (!dentro || !fs.existsSync(abs)) { res.writeHead(404); return res.end('não encontrado'); }
    servirArquivo(abs, req, res);
  });

  return new Promise((resolve) => {
    server.on('error', () => resolve({ ok: false, porta: 0 }));
    server.listen(porta || 0, '127.0.0.1', () => resolve({ ok: true, porta: server.address().port, server }));
  });
}

function servirArquivo(abs, req, res) {
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
}

module.exports = {
  baixarHls, escolherVariante, listaHls, planoSteam, prepararVideo, portaDoServidor, urlStreaming, preCarregarInicio,
  resolverVideo, procurarLocal, chaveTitulo, slug, videoDir, videoLocalDir,
  appIdPorNome, trailersDoApp, mp4Existe, iniciarServidorVideos, toFileUrl, VIDEO_EXT
};
