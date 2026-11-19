'use strict';
/**
 * Arcade Hub — capas pela internet
 *
 * Fontes:
 *  1. Steam CDN (não precisa de chave) — busca o appid pelo nome e baixa
 *     a capa vertical oficial (library_600x900).
 *  2. SteamGridDB (opcional, precisa de uma API key gratuita do usuário) —
 *     milhares de capas feitas pela comunidade, inclusive para jogos que
 *     não estão na Steam (emuladores, portáteis, GOG, Epic…).
 *
 * Tudo é baixado para o disco (~/.arcade-hub/art) e salvo no library.json,
 * então o app funciona offline depois e você pode editar/trocar quando quiser.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const UA = 'ArcadeHub/1.0 (+launcher local)';
const TIMEOUT = 12000;

async function httpGet(url, opts) {
  opts = opts || {};
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeout || TIMEOUT);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': UA, Accept: opts.accept || '*/*', ...(opts.headers || {}) }
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

async function getJson(url, opts) {
  const res = await httpGet(url, { accept: 'application/json', ...(opts || {}) });
  if (!res.ok) throw new Error(`HTTP ${res.status} em ${url}`);
  return res.json();
}

/* ------------------------------------------------------------------ */
/* Cache em disco                                                      */
/* ------------------------------------------------------------------ */

function artDir(dataDir) {
  const dir = path.join(dataDir || path.join(require('os').homedir(), '.arcade-hub'), 'art');
  try { fs.mkdirSync(dir, { recursive: true }); } catch { /* noop */ }
  return dir;
}

function extFromContentType(ct) {
  if (!ct) return '.jpg';
  if (/png/i.test(ct)) return '.png';
  if (/webp/i.test(ct)) return '.webp';
  if (/gif/i.test(ct)) return '.gif';
  return '.jpg';
}

/**
 * Baixa uma imagem para o cache. Retorna "file://..." apontando para o disco —
 * mais rápido e funciona sem internet nas próximas aberturas.
 */
async function downloadImage(url, opts) {
  const dataDir = opts.dataDir;
  const key = opts.key || crypto.createHash('sha1').update(url).digest('hex').slice(0, 16);
  const dir = artDir(dataDir);
  // reaproveita se já existe
  const existing = fs.readdirSync(dir).find(f => f.startsWith(key + '.'));
  if (existing) return 'file://' + path.join(dir, existing).replace(/\\/g, '/');

  const res = await httpGet(url, { accept: 'image/*' });
  if (!res.ok) throw new Error(`HTTP ${res.status} ao baixar a imagem`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 1024) throw new Error('imagem vazia/inválida');
  const file = path.join(dir, key + extFromContentType(res.headers.get('content-type')));
  fs.writeFileSync(file, buf);
  return 'file://' + file.replace(/\\/g, '/');
}

/* ------------------------------------------------------------------ */
/* Fonte 1: Steam (sem chave)                                          */
/* ------------------------------------------------------------------ */

const steamSearchCache = new Map();

async function steamSearch(name, opts) {
  opts = opts || {};
  const cc = opts.cc || 'br';
  const key = `${cc}:${name.toLowerCase()}`;
  if (steamSearchCache.has(key)) return steamSearchCache.get(key);

  const url = `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(name)}&cc=${cc}&l=portuguese`;
  const data = await getJson(url);
  const items = (data && data.items) || [];
  // ordena: nome mais parecido primeiro
  const norm = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const target = norm(name);
  items.sort((a, b) => {
    const sa = similarity(norm(a.name), target);
    const sb = similarity(norm(b.name), target);
    return sb - sa;
  });
  const result = items.map(it => ({
    source: 'steam',
    appId: String(it.id),
    name: it.name,
    thumb: it.tiny_image
      ? it.tiny_image.replace(/capsule_231x87/, 'capsule_231x87')
      : null,
    urls: steamCapsuleUrls(it.id),
    meta: it.metascore ? `Meta ${it.metascore}` : ''
  }));
  steamSearchCache.set(key, result);
  return result;
}

const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * O nome encontrado contém a consulta como sequência contígua de palavras?
 * "dante's inferno" → aceita "Dante's Inferno (2010)" e "Dante's Inferno Demo"
 *                    → recusa "Dantes Bullet Inferno" (é outro jogo!)
 * Esta é a trava que impede capa de jogo nada a ver.
 */
function contemSequencia(nome, consulta) {
  const n = normWords(nome).split(' ').filter(Boolean);
  const q = normWords(consulta).split(' ').filter(Boolean);
  if (!n.length || !q.length) return false;
  for (let i = 0; i + q.length <= n.length; i++) {
    let ok = true;
    for (let j = 0; j < q.length; j++) if (n[i + j] !== q[j]) { ok = false; break; }
    if (ok) return true;
  }
  return false;
}

/**
 * Quão perto o nome encontrado está do que foi pedido (0 a 1).
 * "crash bandicoot" vs "crash bandicoot n sane trilogy" = 0.5 → longe demais,
 * é outro jogo. "dante's inferno" vs "dante's inferno europe" = 1.0 → o mesmo.
 */
function coberturaDaConsulta(nome, consulta) {
  // tira "(USA)", "[Rev 1]", "(En,Fr,De)" antes de comparar
  const limpo = t => normWords(String(t).replace(/\[[^\]]*\]/g, ' ').replace(/\([^)]*\)/g, ' '));
  const q = limpo(consulta).split(' ').filter(w => w.length > 1);
  const n = limpo(nome).split(' ').filter(w => w.length > 1);
  if (!q.length) return 0;
  const cobertura = q.filter(w => n.includes(w)).length / q.length;
  // palavra EXTRA no nome indica outro produto ("Crash Bandicoot" vs
  // "Crash Bandicoot N Sane Trilogy"): cada 2 extras puxa a nota para baixo
  const extras = Math.max(0, n.length - q.length);
  return cobertura / (1 + extras / 2);
}

function similarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 10;               // nome idêntico sempre primeiro
  const aWords = new Set(a.split(' ').filter(Boolean));
  const bWords = new Set(b.split(' ').filter(Boolean));
  let hit = 0;
  for (const w of aWords) if (bWords.has(w)) hit++;
  const containment = (a.includes(b) || b.includes(a)) ? 0.5 : 0;
  return (hit / Math.max(aWords.size, bWords.size, 1)) + containment;
}

function steamCapsuleUrls(appId) {
  const base = 'https://cdn.cloudflare.steamstatic.com/steam/apps';
  return [
    `${base}/${appId}/library_600x900_2x.jpg`,   // vertical alta resolução
    `${base}/${appId}/library_600x900.jpg`,      // vertical padrão
    `${base}/${appId}/header.jpg`,               // horizontal
    `${base}/${appId}/capsule_616x353.jpg`
  ];
}

/** Nota de quão bem a candidata encaixa num card retrato 3:4. */
function fitScore(c) {
  if (!c) return 0;
  if (c.kind === 'vertical') return 3;
  if (c.kind === 'square') return 2;
  if (c.kind === 'horizontal') return 0;
  return 1;
}


/**
 * SteamGridDB sem chave (endpoint público usado pelo site).
 * Cobre milhares de jogos de console/retrô com capas feitas pela comunidade.
 * Se falhar (mudança no site), cai no fluxo normal com API key.
 */
async function sgdbPublicCandidates(title) {
  const chave = 'pub:' + String(title || '').toLowerCase();
  if (sgdbPublicCache.has(chave)) return sgdbPublicCache.get(chave);
  const out = [];
  try {
    const busca = await getJson(`https://www.steamgriddb.com/api/public/search/assets/autocomplete/${encodeURIComponent(title)}`,
      { headers: { Accept: 'application/json' } });
    const jogos = (busca && (busca.data || busca)) || [];
    const id = Array.isArray(jogos) && jogos[0] && (jogos[0].id || jogos[0].game_id);
    if (id) {
      const grids = await getJson(`https://www.steamgriddb.com/api/public/grids/game/${id}?dimensions=600x900&limit=8`,
        { headers: { Accept: 'application/json' } });
      const lista = (grids && (grids.data || grids)) || [];
      for (const g of Array.isArray(lista) ? lista : []) {
        if (!g || !g.url) continue;
        out.push({
          source: 'steamgriddb',
          kind: 'vertical',
          label: `${title} · comunidade (SteamGridDB)`,
          thumbUrl: g.thumb || g.url,
          url: g.url
        });
      }
    }
  } catch { /* endpoint pode mudar: silencioso */ }
  sgdbPublicCache.set(chave, out.slice(0, 6));
  return out.slice(0, 6);
}

/** Candidatas de capa para um jogo, usando só a Steam (sem chave). */
async function steamCandidates(title, opts) {
  const found = await steamSearch(title, opts);
  const out = [];
  // só jogos cujo nome contém a consulta (evita "Dantes Bullet Inferno")
  const relevantes = found.filter(it =>
    contemSequencia(it.name, title) && coberturaDaConsulta(it.name, title) >= 0.7);
  for (const item of relevantes.slice(0, 3)) {
    for (const url of item.urls) {
      out.push({
        source: 'steam',
        appId: item.appId,
        label: `${item.name}${item.meta ? ' · ' + item.meta : ''}`,
        thumbUrl: item.thumb,
        url,
        kind: /library_600x900/.test(url) ? 'vertical'
            : /capsule_600x600/.test(url) ? 'square'
            : 'horizontal'
      });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Fonte nova: Wikipedia (capa do infobox do artigo)                   */
/* ------------------------------------------------------------------ */

const WIKI_API = 'https://en.wikipedia.org/w/api.php';
const wikiCache = new Map();

/**
 * A capa de praticamente todo jogo comercial está no infobox do artigo da
 * Wikipedia — inclusive de jogos que a Steam não vende (Xbox 360, PS3, Wii,
 * portáteis). É a fonte que resolve casos como "Dante's Inferno" do 360.
 *
 * Fluxo: busca o artigo → lista os arquivos da página → pega o primeiro que
 * parece capa (não logo, não foto de evento) → pergunta a URL do arquivo.
 */
async function wikipediaCandidates(title, game) {
  const chave = String(title || '').toLowerCase();
  if (!chave) return [];
  if (wikiCache.has(chave)) return wikiCache.get(chave);

  // 1) achar o artigo do jogo (com o console no termo ajuda a desambiguar)
  const plataforma = (game && (game.platform || (game.ident && game.ident.empresa))) || '';
  const buscas = [
    `${title} video game${/xbox|playstation|nintendo|wii|ps[234]|360/i.test(plataforma) ? ' ' + plataforma : ''}`,
    `${title} video game`,
    String(title)
  ];

  let artigo = null;
  for (const termo of buscas) {
    try {
      const j = await getJson(`${WIKI_API}?action=query&list=search&srsearch=${encodeURIComponent(termo)}&srlimit=3&format=json`);
      const hits = (j && j.query && j.query.search) || [];
      // só aceita artigo que claramente é sobre um jogo
      artigo = hits.find(h => /video game|game/i.test(h.title) || /video game/i.test(h.snippet || '')) || hits[0];
      if (artigo) break;
    } catch { /* tenta o próximo termo */ }
  }
  if (!artigo) { wikiCache.set(chave, []); return []; }

  // 2) arquivos da página → escolher o que parece capa
  let arquivos = [];
  try {
    const j = await getJson(`${WIKI_API}?action=query&prop=images&imlimit=20&format=json&redirects=1&titles=${encodeURIComponent(artigo.title)}`);
    const pages = (j && j.query && j.query.pages) || {};
    const pg = pages[Object.keys(pages)[0]] || {};
    arquivos = (pg.images || []).map(i => i.title);
  } catch { /* sem lista */ }

  // descarta logo, ícone, mapa, screenshot e FOTO DE PESSOA (ator, evento, cosplay)
  const NAO_E_CAPA = /(logo|icon|symbol|commons|wiki\b|map|screenshot|screen\.|booth|convention|festival|photo|cosplay|cover art of|boxart of|portrait|headshot|by gage|by\s+[a-z]+\s+[a-z]+\s+\d)/i;
  const PREFERE = /(cover|box\s*art|boxart|capa|front)/i;
  // nome com cara de capa: o título do artigo aparece inteiro no nome do arquivo
  const caraDeCapa = (arquivo) => {
    const nome = String(arquivo).replace(/^File:/, '').replace(/\.[a-z]+$/i, '');
    const tituloArtigo = String(artigo.title).replace(/\s*\(.*\)$/, '');
    return contemSequencia(nome, tituloArtigo) ? 10 : 0;
  };
  const candidatosArquivos = arquivos
    .filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f))
    .filter(f => !NAO_E_CAPA.test(f))
    .map(f => ({
      f,
      nota: caraDeCapa(f) + (PREFERE.test(f) ? 6 : 0) +
            (coberturaDaConsulta(String(f).replace(/^File:/, ''), artigo.title) >= 0.7 ? 8 : 0)
    }))
    // só entra o que realmente parece a capa DESTE jogo: o nome do arquivo precisa
    // conter o título (ou dizer "cover"/"box art"). Sem isso vinha foto de ator
    // e até um iMac no meio das capas do Dino Crisis.
    .filter(x => x.nota >= 8)
    .sort((a, b) => b.nota - a.nota)
    .map(x => x.f)
    .slice(0, 2);

  // fallback: capa declarada no Wikidata/lead image
  const out = [];
  for (const arq of candidatosArquivos) {
    try {
      const j = await getJson(`${WIKI_API}?action=query&prop=imageinfo&iiprop=url|size&format=json&titles=${encodeURIComponent(arq)}`);
      const pages = (j && j.query && j.query.pages) || {};
      const info = (pages[Object.keys(pages)[0]] || {}).imageinfo || [];
      const d = info[0];
      if (!d || !d.url) continue;
      // ignora imagens minúsculas (ícones) e gigantes (mapas)
      if (d.width && d.width < 150) continue;
      out.push({
        source: 'wikipedia',
        kind: d.width && d.height && d.width / d.height > 1.1 ? 'horizontal' : 'vertical',
        label: `${artigo.title} · ${String(arq).replace(/^File:/, '').replace(/\.[a-z]+$/i, '')}`,
        thumbUrl: d.url,
        url: d.url
      });
    } catch { /* próximo arquivo */ }
  }

  wikiCache.set(chave, out.slice(0, 4));
  return out.slice(0, 4);
}

/* ------------------------------------------------------------------ */
/* Fonte 2: SteamGridDB (opcional, com API key)                        */
/* ------------------------------------------------------------------ */

async function sgdbCandidates(title, apiKey, opts) {
  if (!apiKey) return [];
  const headers = { Authorization: `Bearer ${apiKey}` };
  const search = await getJson(
    `https://www.steamgriddb.com/api/v2/search/autocomplete/${encodeURIComponent(title)}`,
    { headers }
  );
  const games = (search && search.data) || [];
  if (!games.length) return [];
  const out = [];
  // pega até 2 jogos do resultado e as grades verticais (600x900) de cada
  for (const game of games.slice(0, 2)) {
    await sleep(120);
    let grids = [];
    try {
      const g = await getJson(
        `https://www.steamgriddb.com/api/v2/grids/game/${game.id}?dimensions=600x900&types=static&limit=12`,
        { headers }
      );
      grids = (g && g.data) || [];
    } catch { /* jogo sem grid vertical */ }
    for (const grid of grids) {
      if (grid.game && grid.game.name && !contemSequencia(grid.game.name, title)) continue;
      out.push({
        source: 'steamgriddb',
        sgdbId: game.id,
        label: `${game.name}${grid.author ? ' · por ' + grid.author.username : ''}`,
        thumbUrl: grid.thumb,
        url: grid.url,
        kind: 'vertical',
        nsfw: grid.nsfw,
        humor: grid.humor
      });
    }
    if (out.length >= (opts && opts.limit ? opts.limit : 24)) break;
  }
  return out.filter(c => !c.nsfw && !c.humor);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));


/* ------------------------------------------------------------------ */
/* Fonte 3: Thumbnails Libretro (capas/boxart de ROMs, sem chave)       */
/* ------------------------------------------------------------------ */

const LIBRETRO_BASE = 'https://thumbnails.libretro.com';
const sgdbPublicCache = new Map();

// plataforma interna -> pasta do acervo libretro
/**
 * Plataforma interna → pasta do acervo Libretro (thumbnails.libretro.com).
 * O acervo tem 127 sistemas; aqui estão os consoles domésticos e portáteis —
 * inclusive Xbox 360, Xbox, PS3, PS4, Vita, PSP, Saturn e Dreamcast.
 */
const LIBRETRO_SYSTEM = {
  // Nintendo
  nes: 'Nintendo - Nintendo Entertainment System',
  snes: 'Nintendo - Super Nintendo Entertainment System',
  n64: 'Nintendo - Nintendo 64',
  n64dd: 'Nintendo - Nintendo 64DD',
  gb: 'Nintendo - Game Boy',
  gbc: 'Nintendo - Game Boy Color',
  gba: 'Nintendo - Game Boy Advance',
  nds: 'Nintendo - Nintendo DS',
  dsi: 'Nintendo - Nintendo DSi',
  '3ds': 'Nintendo - Nintendo 3DS',
  gc: 'Nintendo - GameCube',
  wii: 'Nintendo - Wii',
  wiiu: 'Nintendo - Wii U',
  switch: 'Nintendo - Nintendo Switch',
  virtualboy: 'Nintendo - Virtual Boy',
  fds: 'Nintendo - Family Computer Disk System',
  satellaview: 'Nintendo - Satellaview',
  sufami: 'Nintendo - Sufami Turbo',
  pokemini: 'Nintendo - Pokemon Mini',
  // Sega
  genesis: 'Sega - Mega Drive - Genesis',
  megadrive: 'Sega - Mega Drive - Genesis',
  sms: 'Sega - Master System - Mark III',
  gg: 'Sega - Game Gear',
  sega32x: 'Sega - 32X',
  segacd: 'Sega - Mega-CD - Sega CD',
  saturn: 'Sega - Saturn',
  dreamcast: 'Sega - Dreamcast',
  sg1000: 'Sega - SG-1000',
  naomi: 'Sega - Naomi',
  // Sony
  ps1: 'Sony - PlayStation',
  psx: 'Sony - PlayStation',
  ps2: 'Sony - PlayStation 2',
  ps3: 'Sony - PlayStation 3',
  ps4: 'Sony - PlayStation 4',
  psp: 'Sony - PlayStation Portable',
  vita: 'Sony - PlayStation Vita',
  psn: 'Sony - PlayStation 3 (Downloadable)',
  // Microsoft
  xbox: 'Microsoft - Xbox',
  xbox360: 'Microsoft - Xbox 360',
  // Atari
  atari2600: 'Atari - 2600',
  atari5200: 'Atari - 5200',
  atari7800: 'Atari - 7800',
  atarijaguar: 'Atari - Jaguar',
  atarilynx: 'Atari - Lynx',
  atarist: 'Atari - ST',
  atari8bit: 'Atari - 8-bit',
  // NEC / SNK / outros
  pce: 'NEC - PC Engine - TurboGrafx 16',
  pcecd: 'NEC - PC Engine CD - TurboGrafx-CD',
  pcengine: 'NEC - PC Engine - TurboGrafx 16',
  pcenginecd: 'NEC - PC Engine CD - TurboGrafx-CD',
  pc88: 'NEC - PC-88',
  pc98: 'NEC - PC-98',
  pcfx: 'NEC - PC-FX',
  neogeo: 'SNK - Neo Geo',
  neogeocd: 'SNK - Neo Geo CD',
  neogeopocket: 'SNK - Neo Geo Pocket',
  neogeopocketcolor: 'SNK - Neo Geo Pocket Color',
  wonderswan: 'Bandai - WonderSwan',
  wonderswancolor: 'Bandai - WonderSwan Color',
  // Micros e consoles diversos
  c64: 'Commodore - 64',
  amiga: 'Commodore - Amiga',
  vic20: 'Commodore - VIC-20',
  cdi: 'Philips - CD-i',
  coleco: 'Coleco - ColecoVision',
  intellivision: 'Mattel - Intellivision',
  vectrex: 'GCE - Vectrex',
  '3do': 'The 3DO Company - 3DO',
  msx: 'Microsoft - MSX',
  zxspectrum: 'Sinclair - ZX Spectrum',
  arcade: 'MAME'
};

/**
 * Adivinha o sistema pelo texto (nome do jogo, pasta da ROM ou campo platform).
 * Serve para jogos que vieram de loja/pasta mas são de console (ex.: "Dante's
 * Inferno Xbox 360"), que antes não tinham busca retrô nenhuma.
 */
function sistemaPorTexto(texto) {
  const t = String(texto || '').toLowerCase();
  if (!t) return null;
  const regras = [
    [/xbox\s*360|x360|xbox360/, 'Microsoft - Xbox 360'],
    [/\bxbox\b(?!\s*360)/, 'Microsoft - Xbox'],
    [/playstation\s*4|\bps4\b/, 'Sony - PlayStation 4'],
    [/playstation\s*3|\bps3\b/, 'Sony - PlayStation 3'],
    [/playstation\s*2|\bps2\b/, 'Sony - PlayStation 2'],
    [/playstation\s*vita|\bps\s*vita|\bvita\b/, 'Sony - PlayStation Vita'],
    [/playstation\s*portable|\bpsp\b/, 'Sony - PlayStation Portable'],
    [/playstation|\bpsx\b|\bps1\b/, 'Sony - PlayStation'],
    [/super\s*nintendo|snes|super\s*nes/, 'Nintendo - Super Nintendo Entertainment System'],
    [/nintendo\s*64|\bn64\b/, 'Nintendo - Nintendo 64'],
    [/game\s*boy\s*advance|\bgba\b/, 'Nintendo - Game Boy Advance'],
    [/game\s*boy\s*color|\bgbc\b/, 'Nintendo - Game Boy Color'],
    [/game\s*boy|\bdmg\b/, 'Nintendo - Game Boy'],
    [/nintendo\s*ds|\bnds\b/, 'Nintendo - Nintendo DS'],
    [/3ds/, 'Nintendo - Nintendo 3DS'],
    [/gamecube|\bgcn?\b/, 'Nintendo - GameCube'],
    [/\bwii\s*u\b/, 'Nintendo - Wii U'],
    [/\bwii\b/, 'Nintendo - Wii'],
    [/switch/, 'Nintendo - Nintendo Switch'],
    [/mega\s*drive|genesis|mega-drive/, 'Sega - Mega Drive - Genesis'],
    [/master\s*system/, 'Sega - Master System - Mark III'],
    [/game\s*gear/, 'Sega - Game Gear'],
    [/dreamcast/, 'Sega - Dreamcast'],
    [/saturn/, 'Sega - Saturn'],
    [/atari\s*2600/, 'Atari - 2600'],
    [/atari\s*7800/, 'Atari - 7800'],
    [/neo\s*geo\s*pocket/, 'SNK - Neo Geo Pocket'],
    [/neo\s*geo/, 'SNK - Neo Geo'],
    [/turbografx|pc\s*engine/, 'NEC - PC Engine - TurboGrafx 16'],
    [/commodore\s*64|\bc64\b/, 'Commodore - 64'],
    [/amiga/, 'Commodore - Amiga'],
    [/3do/, 'The 3DO Company - 3DO'],
    [/vectrex/, 'GCE - Vectrex'],
    [/intellivision/, 'Mattel - Intellivision'],
    [/colecovision/, 'Coleco - ColecoVision'],
    [/wonderswan/, 'Bandai - WonderSwan'],
    [/msx/, 'Microsoft - MSX'],
    [/zx\s*spectrum/, 'Sinclair - ZX Spectrum'],
    [/mame|arcade|fliperama/, 'MAME']
  ];
  for (const [re, sys] of regras) if (re.test(t)) return sys;
  return null;
}

/**
 * Consoles "irmãos" de geração: a MESMA caixa/capa foi vendida em vários deles
 * (Dante's Inferno saiu para Xbox 360, PS3 e PSP com a mesma arte). Quando o
 * acervo não tem o jogo no console pedido, tentar o irmão resolve o caso.
 */
const SISTEMAS_IRMAOS = {
  'Microsoft - Xbox 360': ['Sony - PlayStation 3', 'Sony - PlayStation Portable', 'Microsoft - Xbox'],
  'Sony - PlayStation 3': ['Microsoft - Xbox 360', 'Sony - PlayStation Portable', 'Sony - PlayStation 2'],
  'Sony - PlayStation Portable': ['Sony - PlayStation 2', 'Sony - PlayStation 3'],
  'Sony - PlayStation Vita': ['Sony - PlayStation Portable', 'Sony - PlayStation 3'],
  'Sony - PlayStation 4': ['Sony - PlayStation 3', 'Microsoft - Xbox 360'],
  'Microsoft - Xbox': ['Sony - PlayStation 2', 'Microsoft - Xbox 360'],
  'Nintendo - Wii U': ['Nintendo - Wii', 'Nintendo - GameCube'],
  'Nintendo - Wii': ['Nintendo - GameCube', 'Nintendo - Wii U'],
  'Nintendo - GameCube': ['Nintendo - Wii'],
  'Nintendo - Nintendo 3DS': ['Nintendo - Nintendo DS'],
  'Nintendo - Nintendo DS': ['Nintendo - Game Boy Advance'],
  'Nintendo - Game Boy Advance': ['Nintendo - Game Boy Color', 'Nintendo - Super Nintendo Entertainment System'],
  'Sega - Saturn': ['Sega - Dreamcast', 'Sega - Mega-CD - Sega CD'],
  'Sega - Dreamcast': ['Sega - Saturn', 'Sony - PlayStation 2'],
  'Sony - PlayStation 2': ['Sony - PlayStation', 'Microsoft - Xbox']
};

/** Todas as pastas de mídia do acervo Libretro, em ordem de preferência. */
const LIBRETRO_FOLDERS = ['Named_Boxarts', 'Named_Snaps', 'Named_Titles'];



const listingCache = new Map();

function normWords(str) {
  return String(str || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\([^)]*\)/g, ' ')     // remove (USA), (Europe), (Rev 1)
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

async function libretroListing(system, folder) {
  const key = system + '/' + folder;
  if (listingCache.has(key)) return listingCache.get(key);
  const url = `${LIBRETRO_BASE}/${encodeURIComponent(system)}/${folder}/`;
  const html = await (await httpGet(url, { accept: 'text/html' })).text();
  const files = [...html.matchAll(/href="([^"]+)"/g)]
    .map(m => decodeURIComponent(m[1]))
    .filter(h => /\.(png|jpg|jpeg|webp)$/i.test(h) && !h.includes('/'));
  listingCache.set(key, files);
  return files;
}

/** Busca boxarts de um jogo de emulador (título exato/ aproximado). */
async function libretroCandidates(game, opts) {
  const plataforma = game.platformKey || '';
  const sistemas = [];

  // 1) sistema declarado no jogo (ROM com platformKey)
  if (LIBRETRO_SYSTEM[plataforma]) sistemas.push(LIBRETRO_SYSTEM[plataforma]);
  // 2) sistema deduzido do texto (jogo de loja/pasta que na verdade é de console)
  const porTexto = sistemaPorTexto(`${game.title} ${game.platform || ''} ${game.installDir || ''}`);
  if (porTexto && !sistemas.includes(porTexto)) sistemas.push(porTexto);
  // 3) sem nada: tenta os consoles mais comuns (para no primeiro que achar)
  if (!sistemas.length) {
    sistemas.push('Microsoft - Xbox 360', 'Sony - PlayStation 3', 'Sony - PlayStation 2', 'Sony - PlayStation');
  }
  // 4) irmãos de geração: mesma arte, outro console (caso Dante's Inferno no 360)
  for (const sys of [...sistemas].slice(0, 2)) {
    for (const irmao of (SISTEMAS_IRMAOS[sys] || [])) {
      if (!sistemas.includes(irmao)) sistemas.push(irmao);
    }
  }

  const romFile = game.launch && game.launch.rom
    ? path.basename(game.launch.rom, path.extname(game.launch.rom)) : '';
  const queries = [normWords(game.title), normWords(romFile)].filter(Boolean);
  if (!queries.length) return [];
  // nome limpo do título, usado na comparação de cobertura
  const tituloLimpo = String(game.title || '').replace(/\[[^\]]*\]/g, ' ').replace(/\([^)]*\)/g, ' ');

  const STOP = new Set(['the', 'of', 'a', 'an', 'and', 'in', 'no', 'da', 'do', 'de', 's', 'edition', 'game', 'video']);
  // palavras de 1 letra nunca contam (o "s" de "Dante's" fazia casar com "Demon's Souls")
  const tokens = str => normWords(str).split(' ').filter(w => w.length > 1 && !STOP.has(w));

  const score = (base, q) => {
    const b = new Set(tokens(base));
    const qs = tokens(q);
    if (!b.size || !qs.length) return 0;
    const hit = qs.filter(w => b.has(w)).length;
    const recall = hit / qs.length;
    const precision = hit / b.size;
    const f1 = recall + precision ? (2 * recall * precision) / (recall + precision) : 0;
    let s = f1 * 100;
    if (normWords(base) === normWords(q)) s += 40;         // nome idêntico
    return s;
  };

  const out = [];
  const lotes = [];
  const jaVistos = new Set();

  // percorre sistema x pasta até juntar candidatas suficientes
  for (const system of sistemas) {
    const itensDoSistema = [];
    for (const folder of LIBRETRO_FOLDERS) {
      let files = [];
      try { files = await libretroListing(system, folder); } catch { continue; }
      if (!files.length) continue;

      const scored = files.map(file => {
        const base = file.replace(/\.(png|jpg|jpeg|webp)$/i, '');
        let best = 0;
        for (const q of queries) best = Math.max(best, score(base, q));
        // prefere versões USA/World — são as que a maioria tem
        if (/\(.*\busa\b.*\)/i.test(file)) best += 8;
        else if (/\bworld\b/i.test(file)) best += 6;
        else if (/\beurope\b/i.test(file)) best += 3;
        // versões não finais atrapalham (Beta, Proto, Sample, Hack…)
        if (/\(.*\b(beta|proto|prototype|sample|demo|hack|pirate|aftermarket|unl|kiosk)\b.*\)/i.test(file)) best -= 25;
        // boxart > screenshot > título
        if (folder === 'Named_Boxarts') best += 6;
        else if (folder === 'Named_Titles') best -= 4;
        // tem que conter o título em sequência e cobrir as palavras pedidas
        const certo = contemSequencia(base, tituloLimpo) && coberturaDaConsulta(base, tituloLimpo) >= 0.7;
        if (certo) best += 30;
        return { file, score: best, certo };
      }).filter(x => x.certo && x.score >= 25)
        .sort((a, b) => b.score - a.score)
        .slice(0, 8);

      // dedupe por "nome base" (sem região/idioma): evita 7 vezes a mesma capa
      const basesVistas = new Set();
      for (const x of scored) {
        const baseNome = normWords(x.file.replace(/\([^)]*\)/g, '').replace(/\.(png|jpg|jpeg|webp)$/i, ''));
        if (basesVistas.has(baseNome)) continue;
        basesVistas.add(baseNome);
        const url = `${LIBRETRO_BASE}/${encodeURIComponent(system)}/${folder}/${encodeURIComponent(x.file)}`;
        if (jaVistos.has(url)) continue;
        jaVistos.add(url);
        itensDoSistema.push({
          source: 'libretro',
          system,
          ordemSistema: sistemas.indexOf(system),
          folder,
          // screenshot de console não tem proporção de capa: o card trata com contain
          kind: folder === 'Named_Boxarts' ? 'vertical' : 'square',
          label: `${x.file.replace(/\.(png|jpg|jpeg|webp)$/i, '')} · ${system.split(' - ').pop()}` +
                 (system !== sistemas[0] ? ' (outro console)' : ''),
          thumbUrl: url,
          url
        });
      }
      if (itensDoSistema.length >= 4) break;      // variedade, sem repetição
    }
    lotes.push(itensDoSistema);
    if (lotes.reduce((n, l) => n + l.length, 0) >= 6) break;
  }

  // ordem final: console pedido primeiro, depois os irmãos de geração
  const final = [];
  for (const lote of lotes) final.push(...lote);
  final.sort((a, b) => (a.ordemSistema ?? 99) - (b.ordemSistema ?? 99));
  return final.slice(0, 10);
}


/* ------------------------------------------------------------------ */
/* Miniatura pronta para a interface                                   */
/* ------------------------------------------------------------------ */

/**
 * As miniaturas do seletor de capas vinham como <img src="https://..."> direto.
 * Isso falha por dois motivos:
 *   1. o CSP da janela bloqueia imagem remota (corrigido no index.html)
 *   2. alguns sites recusam hotlink (Wikipedia/SteamGridDB devolvem 403 sem Referer)
 *
 * Aqui a imagem é baixada pelo processo principal (sem CSP e com User-Agent de
 * navegador) e guardada em cache no disco. Na interface ela entra como data URI:
 * sempre carrega, nunca pisca, e continua funcionando offline.
 * Se o download falhar, devolve a URL original (o Chromium tenta direto).
 */
async function thumbParaUI(candidate, dataDir) {
  if (!candidate || !candidate.url) return null;
  const url = candidate.thumbUrl || candidate.url;
  try {
    const dir = path.join(artDir(dataDir), 'thumbs');
    try { fs.mkdirSync(dir, { recursive: true }); } catch { /* noop */ }
    const chave = crypto.createHash('sha1').update(url).digest('hex').slice(0, 20);
    const cache = path.join(dir, chave);

    // cache em disco (20 min): reabrir o seletor não baixa tudo de novo
    try {
      const st = fs.statSync(cache);
      if (Date.now() - st.mtimeMs < 20 * 60 * 1000) {
        const buf = fs.readFileSync(cache);
        const tipo = /^\x89PNG/.test(buf.slice(0, 4).toString('latin1')) ? 'png'
          : /^GIF/.test(buf.slice(0, 3).toString('latin1')) ? 'gif'
          : /RIFF/.test(buf.slice(0, 4).toString('latin1')) ? 'webp' : 'jpeg';
        candidate._dataUri = `data:image/${tipo};base64,${buf.toString('base64')}`;
        return candidate._dataUri;
      }
    } catch { /* sem cache */ }

    const res = await httpGet(url, {
      accept: 'image/*',
      headers: {
        // alguns CDNs exigem Referer de navegador
        Referer: new URL(url).origin + '/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36'
      },
      timeout: 9000
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 512) throw new Error('imagem vazia');
    try { fs.writeFileSync(cache, buf); } catch { /* cache é luxo */ }
    const ct = res.headers.get('content-type') || '';
    const tipo = /png/i.test(ct) ? 'png' : /webp/i.test(ct) ? 'webp' : /gif/i.test(ct) ? 'gif' : 'jpeg';
    // reduz antes de mandar para a interface: 300px de altura basta para uma
    // miniatura e evita trafegar 400 KB de PNG por opção
    const pequena = await reduzirImagem(buf, 300, tipo);
    candidate._dataUri = `data:image/${pequena.tipo};base64,${pequena.buf.toString('base64')}`;
    return candidate._dataUri;
  } catch {
    return url;      // deixa o Chromium tentar
  }
}

/**
 * Reduz uma imagem para a altura desejada usando o próprio Chromium do Electron.
 * Fora do Electron (testes no Node) devolve o original — sem quebrar nada.
 */
async function reduzirImagem(buf, alturaMax, tipo) {
  try {
    const { nativeImage } = require('electron');
    const img = nativeImage.createFromBuffer(buf);
    if (img.isEmpty()) return { buf, tipo };
    const { width, height } = img.getSize();
    if (height <= alturaMax) return { buf, tipo };
    const escala = alturaMax / height;
    const menor = img.resize({ width: Math.round(width * escala), height: alturaMax, quality: 'good' });
    const out = menor.toPNG();
    return out.length < buf.length ? { buf: out, tipo: 'png' } : { buf, tipo };
  } catch {
    return { buf, tipo };
  }
}

/** Prepara até N miniaturas em paralelo (4 por vez) e anota `_dataUri`. */
async function prepararMiniaturas(candidates, dataDir, limite) {
  const alvo = (candidates || []).slice(0, limite || 24);
  const fila = [...alvo];
  const trabalhadores = Array.from({ length: 4 }, async () => {
    while (fila.length) {
      const c = fila.shift();
      await thumbParaUI(c, dataDir);
    }
  });
  await Promise.all(trabalhadores);
  return candidates;
}

/* ------------------------------------------------------------------ */
/* API de alto nível                                                   */
/* ------------------------------------------------------------------ */

/**
 * Busca capas. Steam sempre; SteamGridDB quando há chave.
 * @returns {Promise<{candidates: Array, warnings: string[]}>}
 */
async function searchCovers(title, settings, game) {
  settings = settings || {};
  const warnings = [];
  // Nome identificado pelo conteúdo do .exe entra como tentativa EXTRA de busca,
  // não como substituto: se "game.exe" virou "Hollow Knight", a primeira busca
  // com o título ruim falha e a segunda acerta.
  const tentativas = [title];
  const ident = game && game.ident;
  if (ident) {
    if (ident.tituloExe && norm(ident.tituloExe) !== norm(title)) tentativas.push(ident.tituloExe);
    if (ident.empresa) tentativas.push(`${title} ${ident.empresa}`);
  }

  const isRom = !!(game && (game.kind === 'rom' || game.platformKey));
  const temConsole = !!(game && /xbox|playstation|nintendo|wii|ps[234]|360|dreamcast|saturn|mega|snes|nes|game boy|gba|n64|atari|neo geo/i.test(String(game.platform || '')));
  const tasks = [];
  const vistos = new Set();
  const chaveUrl = u => String(u).split('?')[0].toLowerCase();
  const juntar = arr => arr.filter(c => c && c.url && !vistos.has(chaveUrl(c.url)) && vistos.add(chaveUrl(c.url)));

  const seguro = (p, rotulo) => p.catch(e => { warnings.push(`${rotulo}: ${e.message}`); return []; });

  // 1) RETRÔ / CONSOLE: Libretro (127 sistemas) — boxart, screenshot e título
  let promessaLibretro = null;
  if (isRom || temConsole) {
    promessaLibretro = seguro(libretroCandidates({ ...game, title }, {}), 'Libretro');
    tasks.push(promessaLibretro);
  }

  // 2) Steam (melhor cobertura para PC, sem chave)
  if (!isRom) {
    for (const t of tentativas) tasks.push(seguro(steamCandidates(t), 'Steam'));
  }

  // 3) SteamGridDB público (comunidade, cobre console/retrô sem chave)
  tasks.push(seguro(sgdbPublicCandidates(title), 'SteamGridDB'));

  // 4) SteamGridDB com API key do usuário (se configurou)
  if (settings.sgdbKey) {
    for (const t of tentativas.slice(0, 2)) {
      tasks.push(seguro(sgdbCandidates(t, settings.sgdbKey), 'SteamGridDB (chave)'));
    }
  }

  // 5) Wikipedia: capa do infobox — o que salva jogos fora de catálogo de loja
  tasks.push(seguro(wikipediaCandidates(title, game), 'Wikipedia'));

  const results = await Promise.all(tasks);
  const candidates = juntar(results.flat());

  // ordem final: para jogo de console, o retrô vem primeiro (é a arte certa do
  // console); depois retrato > quadrada > paisagem
  const peso = c => (c.kind === 'vertical' ? 3 : c.kind === 'square' ? 2 : c.kind === 'horizontal' ? 0 : 1);
  candidates.sort((a, b) => {
    if (isRom || temConsole) {
      // console pedido primeiro, depois irmãos, depois wikipedia
      const oa = a.source === 'libretro' ? (a.ordemSistema ?? 5) : (a.source === 'wikipedia' ? 50 : 60);
      const ob = b.source === 'libretro' ? (b.ordemSistema ?? 5) : (b.source === 'wikipedia' ? 50 : 60);
      if (oa !== ob) return oa - ob;
    }
    return peso(b) - peso(a);
  });

  return { candidates, warnings };
}

async function applyCover(candidate, dataDir) {
  if (!candidate || !candidate.url) throw new Error('capa inválida');
  const url = String(candidate.url);
  if (url.startsWith('file://')) {
    // só aceita arquivos que já estão no cache de capas do próprio app
    const local = path.resolve(decodeURIComponent(url.replace(/^file:\/\/\/?/i, process.platform === 'win32' ? '' : '/')));
    const dir = path.resolve(artDir(dataDir));
    if (local.toLowerCase().startsWith(dir.toLowerCase() + path.sep) && fs.existsSync(local)) return url;
    throw new Error('capa local fora da pasta do Arcade Hub — use "Escolher imagem do PC"');
  }
  if (!/^https:\/\//i.test(url)) throw new Error('endereço da capa inválido');
  return downloadImage(candidate.url, { dataDir, key: 'cover-' + (candidate.appId || candidate.sgdbId || '') + '-' + hashShort(candidate.url) });
}

/** Aplica capas automaticamente em vários jogos (uma por jogo). */
async function autoCovers(games, settings, dataDir, onProgress, isCancelled) {
  const done = [];
  const failed = [];
  for (const game of games) {
    if (typeof isCancelled === 'function' && isCancelled()) break;
    try {
      const { candidates } = await searchCovers(game.title, settings, game);
      // escolhe a que ENCAIXA melhor no card (retrato > quadrada > paisagem).
      // Antes pegava a primeira vertical; se só havia paisagem, o card cortava a arte.
      const best = [...candidates].sort((a, b) => fitScore(b) - fitScore(a))[0];
      if (!best) { failed.push({ id: game.id, title: game.title, reason: 'nada encontrado' }); continue; }
      const fileRef = await applyCover(best, dataDir);
      done.push({ id: game.id, title: game.title, art: fileRef, source: best.source });
      if (onProgress) onProgress(done.length, games.length);
      await sleep(180); // gentileza com a API
    } catch (e) {
      failed.push({ id: game.id, title: game.title, reason: e.message });
    }
  }
  return { done, failed };
}

function hashShort(s) {
  return crypto.createHash('sha1').update(String(s)).digest('hex').slice(0, 10);
}

/** Redimensiona uma capa local para um tamanho padrão (mantém a proporção). */
async function normalizeLocalImage(filePath, dataDir, maxW, maxH) {
  const { nativeImage } = require('electron');
  const img = nativeImage.createFromPath(filePath);
  if (img.isEmpty()) throw new Error('não consegui ler essa imagem');
  const size = img.getSize();
  const ratio = Math.min((maxW || 600) / size.width, (maxH || 900) / size.height, 1);
  const resized = ratio < 1 ? img.resize({ width: Math.round(size.width * ratio), height: Math.round(size.height * ratio), quality: 'good' }) : img;
  const dir = artDir(dataDir);
  const out = path.join(dir, 'cover-' + hashShort(filePath + fs.statSync(filePath).mtimeMs) + '.jpg');
  fs.writeFileSync(out, resized.toJPEG(90));
  return 'file://' + out.replace(/\\/g, '/');
}

module.exports = {
  searchCovers, applyCover, autoCovers, downloadImage, artDir,
  steamSearch, steamCandidates, sgdbCandidates, libretroCandidates, normalizeLocalImage,
  fitScore, contemSequencia, coberturaDaConsulta, sistemaPorTexto, LIBRETRO_SYSTEM, SISTEMAS_IRMAOS,
  wikipediaCandidates, libretoCandidates: libretroCandidates,
  thumbParaUI, prepararMiniaturas
};
