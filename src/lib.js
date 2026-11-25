/**
 * Arcade Hub - núcleo (biblioteca + scanner + lançador)
 * Este arquivo é isomórfico: roda no processo principal do Electron e também
 * no Node puro (usado pelos scripts de teste/preview).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const covers = require('./covers');
const genres = require('./genres');
const videos = require('./videos');
const metadata = require('./metadata');
const identity = require('./identity');
const { VigiaDeSessoes, pastaVigiavel } = require('./sessions');
const { criarZip, lerZip } = require('./zip');
const { EventEmitter } = require('events');
const fontesVideo = require('./fontes-video');
const conquistas = require('./conquistas');
const consoleMod = require('./console');
const discord = require('./discord');

/* Senhas guardadas cifradas pelo sistema (Windows DPAPI via safeStorage). */
function cifrar(txt) {
  if (!txt) return '';
  try {
    const { safeStorage } = require('electron');
    if (safeStorage && safeStorage.isEncryptionAvailable()) return 'enc:' + safeStorage.encryptString(String(txt)).toString('base64');
  } catch { /* fora do Electron (testes) */ }
  return 'b64:' + Buffer.from(String(txt), 'utf8').toString('base64');
}
function decifrar(v) {
  if (!v) return '';
  const s = String(v);
  try {
    if (s.startsWith('enc:')) return require('electron').safeStorage.decryptString(Buffer.from(s.slice(4), 'base64'));
    if (s.startsWith('b64:')) return Buffer.from(s.slice(4), 'base64').toString('utf8');
  } catch { return ''; }
  return s;
}
/** Credenciais do ScreenScraper já decifradas (só no processo principal). */
function credScreenScraper(settings) {
  const c = (settings && settings.screenscraper) || {};
  return { usuario: c.usuario || '', devid: c.devid || '', senha: decifrar(c.senha), devpassword: decifrar(c.devsenha) };
}

/** Avisos para o main.js (bandeja, janela): 'sessao:inicio', 'sessao:fim'. */
const eventos = new EventEmitter();

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function norm(p) {
  return String(p || '').replace(/\\/g, '/').replace(/\/+$/, '');
}

function idFor(str) {
  let h = 5381;
  const s = String(str).toLowerCase();
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return 'g' + (h >>> 0).toString(36);
}

function stripExt(f) {
  return f.replace(/\.[^.]+$/, '');
}

// Nome "limpo" a partir de nomes de arquivo/pasta de ROM
function prettifyName(str) {
  let n = stripExt(str);
  n = n.replace(/\[[^\]]*\]/g, ' ')          // [USA], [!], [Rev 1]
       .replace(/\([^)]*\)/g, ' ')           // (Europe), (USA)
       .replace(/[_.]+/g, ' ')
       .replace(/\s{2,}/g, ' ')
       .trim();
  return n;
}

const GENERIC_ROM = /^(disco|disc|disk|cd|dvd|game|jogo|rom|iso|track\s*\d+|\d+|data)$/i;

function cleanRomName(file) {
  let name = prettifyName(path.basename(file));
  // "disco.cue" dentro de "Castlevania .../": usa o nome da pasta
  if (!name || GENERIC_ROM.test(name) || name.length < 3) {
    const folder = prettifyName(path.basename(path.dirname(file)));
    // e se a pasta também for genérica (ex.: ROMs/PS1/), tenta o avô
    if (folder && !GENERIC_ROM.test(folder)) name = folder;
  }
  return name || stripExt(path.basename(file));
}

// Remove sufixos chatos de pastas de jogos portáteis
function cleanGameName(name) {
  return String(name)
    .replace(/[-_. ]?(win64|win32|x64|x86|shipping|release|final|setup|installer)$/i, '')
    .replace(/[-_. ](v?\d+\.\d+(\.\d+)*)$/i, '')
    .replace(/[_]+/g, ' ')
    .trim() || String(name);
}

function walk(dir, opts, out, depth) {
  out = out || [];
  depth = depth || 0;
  const maxDepth = opts.maxDepth == null ? 4 : opts.maxDepth;
  if (depth > maxDepth) return out;
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (opts.skipDirs && opts.skipDirs.includes(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, opts, out, depth + 1);
    else if (e.isFile() && opts.match(e.name)) out.push(full);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Emuladores / plataformas                                            */
/* ------------------------------------------------------------------ */

// extensão -> plataforma
const ROM_EXT = {
  '.nes': 'nes', '.fds': 'nes', '.unf': 'nes',
  '.sfc': 'snes', '.smc': 'snes', '.fig': 'snes', '.swc': 'snes', '.bs': 'snes',
  '.n64': 'n64', '.z64': 'n64', '.v64': 'n64',
  '.gb': 'gb', '.gbc': 'gbc', '.sgb': 'gb',
  '.gba': 'gba',
  '.nds': 'nds', '.dsi': 'nds',
  '.3ds': '3ds', '.cia': '3ds', '.cci': '3ds', '.cxi': '3ds',
  '.cso': 'psp',
  '.nsp': 'switch', '.xci': 'switch', '.nca': 'switch',
  '.iso': 'iso', '.gcm': 'gc', '.rvz': 'wii', '.wbfs': 'wii', '.wad': 'wii', '.gcz': 'gc', '.ciso': 'gc', '.dol': 'gc', '.elf': 'gc', '.wia': 'gc',
  '.wud': 'wiiu', '.wux': 'wiiu', '.rpx': 'wiiu',
  '.cue': 'disc', '.bin': 'disc', '.chd': 'disc', '.pbp': 'disc', '.m3u': 'disc', '.gdi': 'disc', '.cdi': 'disc',
  '.md': 'genesis', '.gen': 'genesis', '.smd': 'genesis', '.32x': 'genesis', '.sms': 'sms', '.gg': 'gg',
  '.pce': 'pce', '.sgx': 'pce',
  '.a26': 'atari2600', '.a52': 'atari5200', '.a78': 'atari7800',
  '.d64': 'c64', '.crt': 'c64', '.prg': 'c64', '.t64': 'c64', '.tap': 'c64',
  '.vb': 'virtualboy', '.ws': 'wonderswan', '.wsc': 'wonderswan',
  '.ngp': 'neogeo', '.ngc': 'neogeo',
  '.zip': 'arcade', '.7z': 'arcade'
};

const PLATFORM_LABEL = {
  nes: 'NES', snes: 'SNES', n64: 'Nintendo 64', gb: 'Game Boy', gbc: 'Game Boy Color',
  gba: 'Game Boy Advance', nds: 'Nintendo DS', '3ds': 'Nintendo 3DS', switch: 'Switch',
  gc: 'GameCube', wii: 'Wii', wiiu: 'Wii U', iso: 'Imagem de disco', disc: 'Disco',
  genesis: 'Mega Drive', sms: 'Master System', gg: 'Game Gear', pce: 'PC Engine',
  atari2600: 'Atari 2600', atari5200: 'Atari 5200', atari7800: 'Atari 7800',
  c64: 'Commodore 64', virtualboy: 'Virtual Boy', wonderswan: 'WonderSwan',
  neogeo: 'Neo Geo Pocket', arcade: 'Arcade', ps1: 'PlayStation', ps2: 'PlayStation 2',
  psp: 'PSP', dreamcast: 'Dreamcast', saturn: 'Saturn'
};

// Plataformas que usam disco: o nome da pasta/arquivo decide o emulador.
// Compara PALAVRAS INTEIRAS de cada pasta, da mais próxima do arquivo para a raiz.
// (Antes era substring no caminho todo: "C:/Users/dcosta" virava Dreamcast e
//  qualquer "cd" no caminho virava PC Engine.)
const DISC_RULES = [
  [/\b(ps2|playstation 2|playstation2)\b/, 'ps2'],
  [/\b(psp|playstation portable)\b/, 'psp'],
  [/\b(ps1|psx|psone|playstation 1|playstation1|playstation)\b/, 'ps1'],
  [/\b(dreamcast|dc)\b/, 'dreamcast'],
  [/\b(saturn)\b/, 'saturn'],
  [/\b(gamecube|gc|ngc)\b/, 'gc'],
  [/\b(wii)\b/, 'wii'],
  [/\b(sega cd|mega cd|segacd|megacd)\b/, 'genesis'],
  [/\b(pce|pcecd|pc engine|pc engine cd|turbografx|turbografx 16|turbografx cd|tg16)\b/, 'pce']
];
// .bin de cartucho (só olha o nome das pastas)
const BIN_RULES = [
  [/\b(genesis|mega drive|megadrive|md)\b/, 'genesis'],
  [/\b(atari 2600|atari2600|2600|a2600)\b/, 'atari2600'],
  [/\b(master system|sms)\b/, 'sms']
];
function refineDiscPlatform(romPath, fallback, rules) {
  const partes = String(romPath).split(/[\\/]+/).filter(Boolean).reverse();
  for (const parte of partes) {
    const palavras = ' ' + parte.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() + ' ';
    for (const [re, plat] of (rules || DISC_RULES)) if (re.test(palavras)) return plat;
  }
  return fallback || 'ps1';
}

// Emuladores sugeridos por plataforma (usados se você não configurar nada)
const EMULATOR_HINTS = {
  psp: 'PPSSPP',
  nes: 'Mesen / Nestopia', snes: 'Snes9x', n64: 'Project64 / Mupen64Plus',
  gb: 'SameBoy / mGBA', gbc: 'SameBoy / mGBA', gba: 'mGBA', nds: 'melonDS / DeSmuME',
  '3ds': 'Azahar / Citra', switch: 'Ryujinx / Sudachi', gc: 'Dolphin', wii: 'Dolphin',
  wiiu: 'Cemu', ps1: 'DuckStation', ps2: 'PCSX2', dreamcast: 'Flycast', saturn: 'Kronos / Mednafen',
  genesis: 'Ares / Kega Fusion', sms: 'Ares / Kega Fusion', gg: 'Ares / Kega Fusion',
  pce: 'Mednafen / Ares', arcade: 'MAME / RetroArch', atari2600: 'Stella',
  atari5200: 'Atari800', atari7800: 'A7800', c64: 'VICE', virtualboy: 'Mednafen',
  wonderswan: 'Mednafen', neogeo: 'Mednafen', disc: 'DuckStation'
};

// Emuladores já configurados por padrão (caminhos vazios = "não configurado")
function defaultEmulators() {
  const map = {};
  for (const p of Object.keys(PLATFORM_LABEL)) {
    map[p] = { platform: p, label: PLATFORM_LABEL[p], exe: '', args: '"{rom}"', hint: EMULATOR_HINTS[p] || '' };
  }
  return map;
}

const DEFAULT_SETTINGS = {
  folders: [],
  romFolders: [],
  emulators: defaultEmulators(),
  retroarch: { exe: '', cores: '' },        // cores = pasta de cores do RetroArch
  scanDepth: 4,
  includeStoreLaunchers: true,
  sort: 'recent',
  sgdbKey: '',
  layout: 'grade',          // 'grade' | 'rondel'
  videoFolder: '',          // pasta com trailers locais (opcional)
  autoScan: true,           // varre sozinho ao abrir e quando as pastas mudam
  minimizarAoJogar: true,   // esconde na bandeja enquanto o jogo roda
  cardSize: 158,            // largura mínima do card na grade (px)
  abrirNoModoTV: false,     // começa direto no Modo TV (PC ligado na TV)
  youtubeKey: '',           // chave da YouTube Data API v3 (vídeos de qualquer jogo)
  screenscraper: { usuario: '', senha: '', devid: '', devsenha: '' },  // senhas cifradas
  perfis: [],               // [{ id, nome, cor, avatar }] — vazio = um perfil com o nome do usuário do PC
  perfilAtivo: '',
  conquistas: {},           // { perfilId: { conquistaId: quando } }
  biosFolder: '',           // pasta extra onde procurar BIOS (opcional)
  discord: {
    appId: '',              // vazio = o ID padrão do Arcade Hub (DISCORD_APP_ID)
    ligado: true,           // mostrar "Jogando X" no Discord
    mostrarNavegando: false,// mostrar "No Arcade Hub" mesmo sem jogo aberto
    convites: true,         // botão "Participar" para os amigos
    aceitarPedidos: true,   // pedido para participar: aceita sozinho
    portaNetplay: 55435     // porta do jogo online do RetroArch
  }
};

/** ID do aplicativo "Arcade Hub" no Discord (público: aparece no status de todo mundo). */
const DISCORD_APP_ID = '1574982778829672558';

/* ------------------------------------------------------------------ */
/* Perfis (quem está jogando)                                          */
/* ------------------------------------------------------------------ */
const CORES_PERFIL = ['#22d3ee', '#e879f9', '#facc15', '#4ade80', '#fb7185', '#a78bfa', '#fb923c', '#38bdf8'];

function nomeDoUsuario() {
  try { const n = os.userInfo().username; return n ? n.charAt(0).toUpperCase() + n.slice(1) : 'Jogador 1'; } catch { return 'Jogador 1'; }
}

/** Lista de perfis (sempre ao menos um). O primeiro é o principal: herda as sessões antigas. */
function perfisDe(settings) {
  const lista = Array.isArray(settings && settings.perfis) ? settings.perfis.filter(p => p && p.id) : [];
  return lista.length ? lista : [{ id: 'p1', nome: nomeDoUsuario(), cor: CORES_PERFIL[0], avatar: '🎮' }];
}
function perfilAtivoDe(settings) {
  const lista = perfisDe(settings);
  return (lista.find(p => p.id === (settings && settings.perfilAtivo)) || lista[0]).id;
}
/** Valida o que veio da interface (nome curto, cor hex, avatar de até 2 caracteres visíveis). */
function limparPerfis(lista) {
  if (!Array.isArray(lista)) throw new Error('lista de perfis inválida');
  const vistos = new Set();
  const out = [];
  for (const p of lista.slice(0, 8)) {
    const id = String((p && p.id) || '').replace(/[^a-z0-9-]/gi, '').slice(0, 24) || 'p' + crypto.randomBytes(4).toString('hex');
    if (vistos.has(id)) continue;
    vistos.add(id);
    const nome = String((p && p.nome) || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 24) || 'Jogador';
    const cor = /^#[0-9a-f]{6}$/i.test(p && p.cor) ? p.cor : CORES_PERFIL[out.length % CORES_PERFIL.length];
    const avatar = [...String((p && p.avatar) || '')].slice(0, 2).join('') || nome.charAt(0).toUpperCase();
    out.push({ id, nome, cor, avatar });
  }
  if (!out.length) throw new Error('precisa ter pelo menos um perfil');
  return out;
}

/* ------------------------------------------------------------------ */
/* Steam                                                               */
/* ------------------------------------------------------------------ */

function parseVdf(text) {
  // parser mínimo de KeyValues da Valve ("chave" "valor" / "chave" { ... })
  let i = 0;
  const unescape = s => s.replace(/\\(.)/g, '$1');

  function skipWs() {
    while (i < text.length) {
      if (/\s/.test(text[i])) { i++; continue; }
      if (text[i] === '/' && text[i + 1] === '/') { while (i < text.length && text[i] !== '\n') i++; continue; }
      break;
    }
  }

  function readKey() {
    skipWs();
    if (i >= text.length || text[i] === '}') return null;
    const m = /^"((?:[^"\\]|\\.)*)"|^([^\s{}"]+)/.exec(text.slice(i));
    if (!m) { i++; return null; }
    i += m[0].length;
    return unescape(m[1] != null ? m[1] : m[2]);
  }

  function readValue() {
    skipWs();
    if (text[i] === '{') {
      i++;
      const obj = {};
      for (;;) {
        skipWs();
        if (i >= text.length) break;
        if (text[i] === '}') { i++; break; }
        const key = readKey();
        if (key == null) continue;
        obj[key] = readValue();
      }
      return obj;
    }
    const q = /^"((?:[^"\\]|\\.)*)"/.exec(text.slice(i));
    if (q) { i += q[0].length; return unescape(q[1]); }
    const bare = /^[^\s{}"]+/.exec(text.slice(i));
    if (bare) { i += bare[0].length; return bare[0]; }
    return '';
  }

  // o arquivo raiz pode ter ou não chaves externas
  const root = {};
  for (;;) {
    skipWs();
    if (i >= text.length) break;
    const key = readKey();
    if (key == null) continue;
    root[key] = readValue();
  }
  return root;
}

let steamRootsCache = null;            // o registro não muda enquanto o app está aberto
function steamRoots() {
  if (steamRootsCache) return steamRootsCache;
  steamRootsCache = steamRootsSemCache();
  return steamRootsCache;
}
function steamRootsSemCache() {
  const roots = [];
  const guesses = [
    'C:/Program Files (x86)/Steam',
    'C:/Program Files/Steam',
    'D:/Steam', 'D:/SteamLibrary', 'E:/Steam'
  ];
  const fromReg = (() => {
    if (process.platform !== 'win32') return null;
    const keys = [
      ['HKCU\\Software\\Valve\\Steam', 'SteamPath'],
      ['HKLM\\SOFTWARE\\WOW6432Node\\Valve\\Steam', 'InstallPath']
    ];
    for (const [key, name] of keys) {
      try {
        const out = execFileSync('reg', ['query', key, '/v', name], { encoding: 'utf8', windowsHide: true });
        const m = new RegExp(name + '\\s+REG_SZ\\s+(.+)').exec(out);
        if (m) return m[1].trim();
      } catch { /* ignora */ }
    }
    return null;
  })();
  if (fromReg) roots.push(fromReg);
  roots.push(...guesses);
  return [...new Set(roots.map(norm))];
}

function scanSteam(rootsOverride) {
  const games = [];
  const roots = rootsOverride && rootsOverride.length ? rootsOverride.map(norm) : steamRoots();
  for (const root of roots) {
    for (const appId of steamAppsIn(root)) {
      const info = readSteamAcf(root, appId);
      if (!info) continue;
      games.push(info);
    }
    if (games.length) break; // achou a instalação principal
  }
  return games;
}

const steamLibCache = new Map();          // libraryfolders.vdf era relido para CADA jogo
function steamLibraries(root) {
  const chave = norm(root);
  const t = steamLibCache.get(chave);
  if (t && Date.now() - t.at < 5000) return t.libs;
  const libs = steamLibrariesSemCache(root);
  steamLibCache.set(chave, { libs, at: Date.now() });
  return libs;
}
function steamLibrariesSemCache(root) {
  const libs = [root];
  const lf = path.join(root, 'steamapps', 'libraryfolders.vdf');
  try {
    const vdf = parseVdf(fs.readFileSync(lf, 'utf8'));
    const folders = vdf.libraryfolders || vdf.LibraryFolders || {};
    for (const k of Object.keys(folders)) {
      const v = folders[k];
      const p = typeof v === 'string' ? v : v && v.path;
      if (p && typeof p === 'string') libs.push(norm(p));
    }
  } catch { /* sem libraryfolders */ }
  return [...new Set(libs.map(norm))];
}

function steamAppsIn(root) {
  const found = new Set();
  for (const lib of steamLibraries(root)) {
    const appsDir = path.join(lib, 'steamapps');
    let files = [];
    try { files = fs.readdirSync(appsDir); } catch { continue; }
    for (const f of files) {
      const m = /^appmanifest_(\d+)\.acf$/i.exec(f);
      if (m) found.add(m[1]);
    }
  }
  return [...found];
}

function readSteamAcf(root, appId) {
  for (const lib of steamLibraries(root)) {
    const acf = path.join(lib, 'steamapps', `appmanifest_${appId}.acf`);
    if (!fs.existsSync(acf)) continue;
    try {
      const vdf = parseVdf(fs.readFileSync(acf, 'utf8'));
      const st = vdf.AppState || vdf.appState || {};
      const name = st.name;
      if (!name) continue;
      const installDir = path.join(lib, 'steamapps', 'common', st.installdir || '');
      const art = steamArt(root, appId);
      return {
        id: 'steam-' + appId,
        title: String(name),
        source: 'steam',
        platform: 'PC',
        kind: 'game',
        launch: { type: 'steam', appId: String(appId) },
        installDir,
        sizeOnDisk: Number(st.SizeOnDisk) || 0,
        steamStateFlags: Number(st.StateFlags) || 0,
        art,
        addedAt: Date.now()
      };
    } catch { /* manifest corrompido */ }
  }
  return null;
}

function steamArt(root, appId) {
  const userdata = path.join(root, 'userdata');
  const namesPortrait = [`${appId}_library_600x900.jpg`, `${appId}_library_600x900.png`, `${appId}p.jpg`, `${appId}p.png`];
  let dirs = [];
  try { dirs = fs.readdirSync(userdata).map(u => path.join(userdata, u, 'config', 'grid')); } catch { /* noop */ }
  dirs.push(path.join(root, 'appcache', 'librarycache'));
  for (const dir of dirs) {
    for (const n of namesPortrait) {
      const p = path.join(dir, n);
      try { if (fs.statSync(p).isFile()) return 'file://' + norm(p); } catch { /* noop */ }
    }
  }
  // Steam a partir de 2024: appcache/librarycache/<appid>/library_600x900.jpg
  // (às vezes dentro de uma subpasta com hash)
  const porApp = path.join(root, 'appcache', 'librarycache', String(appId));
  const procurar = (dir, nivel) => {
    let itens = [];
    try { itens = fs.readdirSync(dir, { withFileTypes: true }); } catch { return null; }
    for (const e of itens) {
      if (e.isFile() && /^library_600x900(_\w+)?\.(jpg|png)$/i.test(e.name)) return path.join(dir, e.name);
    }
    if (nivel > 0) for (const e of itens) if (e.isDirectory()) { const r = procurar(path.join(dir, e.name), nivel - 1); if (r) return r; }
    return null;
  };
  const achado = procurar(porApp, 1);
  return achado ? 'file://' + norm(achado) : null;
}

/* ------------------------------------------------------------------ */
/* Epic Games                                                          */
/* ------------------------------------------------------------------ */

function scanEpic(dirsOverride) {
  if (process.platform !== 'win32' && !dirsOverride) return [];
  const dirs = dirsOverride || [
    'C:/ProgramData/Epic/EpicGamesLauncher/Data/Manifests',
    'C:/ProgramData/Epic Games/EpicGamesLauncher/Data/Manifests'
  ];
  const games = [];
  for (const dir of dirs) {
    let files = [];
    try { files = fs.readdirSync(dir); } catch { continue; }
    for (const f of files) {
      if (!f.toLowerCase().endsWith('.item')) continue;
      try {
        const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
        if (!j.DisplayName) continue;
        if (j.AppCategories && !j.AppCategories.some(c => /game/i.test(c))) continue;
        games.push({
          id: 'epic-' + (j.AppName || f),
          title: cleanGameName(j.DisplayName),
          source: 'epic',
          platform: 'PC',
          kind: 'game',
          launch: { type: 'epic', appName: j.AppName, catalogItemId: j.CatalogItemId },
          installDir: j.InstallLocation || '',
          sizeOnDisk: Number(j.InstallSize) || 0,
          art: null,
          addedAt: Date.now()
        });
      } catch { /* ignora manifest inválido */ }
    }
  }
  return games;
}

/* ------------------------------------------------------------------ */
/* GOG                                                                 */
/* ------------------------------------------------------------------ */

/**
 * GOG — três caminhos, porque cada versão do Galaxy guarda de um jeito:
 *
 *  1. REGISTRO em HKCU (é onde o Galaxy moderno grava; o código antigo só olhava
 *     HKLM, e por isso não achava nada em muitas máquinas)
 *  2. REGISTRO em HKLM (instalações antigas / "para todos os usuários")
 *  3. ARQUIVOS `goggame-*.info` dentro das pastas de jogo — funciona mesmo se o
 *     registro estiver limpo e pega jogos comprados em outra conta
 *
 * O `goggame-<id>.info` é um JSON com o nome real do jogo, o executável de
 * lançamento e os idiomas. É a fonte mais confiável das três.
 */
function scanGog(opts) {
  const o = opts || {};
  o.diag = o.diag || {};
  if (process.platform !== 'win32') {
    o.diag.gog = { encontrados: 0, plataforma: process.platform, dica: 'A varredura de GOG só funciona no Windows.' };
    return [];
  }
  const achados = new Map();          // gameId -> jogo

  const registrar = (jogo) => {
    if (!jogo || !jogo.title) return;
    const id = String(jogo.launch.gameId || idFor(jogo.title));
    if (achados.has(id)) {
      // completa o que faltava (ex.: exe veio do registro, nome do .info)
      const atual = achados.get(id);
      achados.set(id, { ...atual, ...Object.fromEntries(Object.entries(jogo).filter(([, v]) => v)) });
      return;
    }
    achados.set(id, jogo);
  };

  /* 1 e 2 — registro, agora incluindo HKCU */
  const roots = [
    'HKCU\\SOFTWARE\\GOG.com\\Games',
    'HKCU\\SOFTWARE\\WOW6432Node\\GOG.com\\Games',
    'HKLM\\SOFTWARE\\WOW6432Node\\GOG.com\\Games',
    'HKLM\\SOFTWARE\\GOG.com\\Games'
  ];
  for (const root of roots) {
    let out = '';
    try { out = execFileSync('reg', ['query', root, '/s'], { encoding: 'utf8', windowsHide: true }); } catch { continue; }
    // separa por chave, não por linha em branco (o "reg query" varia)
    const blocos = out.split(/\r?\n(?=HKEY_)/);
    for (const b of blocos) {
      const get = k => {
        const m = new RegExp(k + '\\s+REG_[A-Z_]*(?:EXPAND)?_?SZ\\s+(.+)', 'i').exec(b);
        return m ? m[1].trim() : '';
      };
      const id = get('gameId') || get('GameID') || get('INSTALLID');
      const title = get('gameName') || get('GameName') || get('PRODUCTNAME');
      // "path" é a PASTA de instalação; "exe" às vezes não existe
      const pasta = get('path') || get('PATH') || get('INSTALLPATH') || '';
      let exe = get('exe') || get('EXE') || '';
      if (!exe && pasta) exe = acharExeDoGog(pasta, id);
      if (!id && !title) continue;
      registrar({
        id: 'gog-' + (id || idFor(title)),
        title: title || path.basename(pasta),
        source: 'gog',
        platform: 'PC',
        kind: 'game',
        launch: { type: 'gog', gameId: id, exe },
        installDir: pasta || norm(exe).replace(/[^/]+$/, ''),
        sizeOnDisk: 0,
        art: null,
        addedAt: Date.now()
      });
    }
  }

  /* 3 — arquivos goggame-*.info nas pastas que o usuário já scanneia */
  const pastasCandidatas = new Set([
    ...(o.extraDirs || []),
    ...(o.folders || []),
    'C:\\GOG Games',
    'C:\\Program Files (x86)\\GOG Galaxy\\Games',
    'C:\\Program Files\\GOG Galaxy\\Games',
    'D:\\GOG Games', 'E:\\GOG Games'
  ].filter(Boolean).map(norm));

  for (const pasta of pastasCandidatas) {
    const infos = encontrarInfosGog(pasta);
    for (const arq of infos) {
      try {
        const dados = JSON.parse(fs.readFileSync(arq, 'utf8'));
        const dirJogo = path.dirname(arq);
        const id = String(dados.gameId || '').replace(/^gog_?/, '') || path.basename(dirJogo);
        const exeRel = dados.launchCommand || '';
        const exe = exeRel
          ? path.join(dirJogo, exeRel.replace(/^["']|["']$/g, ''))
          : (dados.playTasks && dados.playTasks[0] && dados.playTasks[0].path
              ? path.join(dirJogo, dados.playTasks[0].path)
              : '');
        const titulo = dados.name || (dados.rootGameInfo && dados.rootGameInfo.title) || path.basename(dirJogo);
        registrar({
          id: 'gog-' + id,
          title: titulo,
          source: 'gog',
          platform: 'PC',
          kind: 'game',
          launch: { type: 'gog', gameId: id, exe: fs.existsSync(exe) ? exe : '' },
          installDir: dirJogo,
          sizeOnDisk: 0,
          art: null,
          addedAt: Date.now()
        });
      } catch { /* .info corrompido: ignora */ }
    }
  }

  const jogos = [...achados.values()];
  o.diag.gog = {
    encontrados: jogos.length,
    registrosConsultados: roots.length,
    pastasProcuradas: pastasCandidatas.size
  };
  // dica útil quando não achou nada (é o que o usuário precisa para resolver)
  if (!jogos.length) {
    o.diag.gog.dica = 'Nenhum jogo GOG encontrado. Confira: (1) o GOG Galaxy está instalado e você entrou na conta; ' +
      '(2) seus jogos não estão numa pasta fora das comuns — adicione a pasta em Ajustes › Pastas e escaneie de novo.';
  }
  return jogos;
}

/** Procura goggame-*.info até 2 níveis abaixo (padrão: <pasta>/<jogo>/goggame.info). */
function encontrarInfosGog(raiz, nivel) {
  const saida = [];
  const prof = nivel == null ? 2 : nivel;
  if (prof < 0) return saida;
  let entradas;
  try { entradas = fs.readdirSync(raiz, { withFileTypes: true }); } catch { return saida; }
  for (const e of entradas) {
    const cheio = path.join(raiz, e.name);
    if (e.isDirectory()) saida.push(...encontrarInfosGog(cheio, prof - 1));
    // nomes reais: goggame-<id>.info, goggame-<id>.script, goggame.info
    else if (/^goggame.*\.info$/i.test(e.name)) saida.push(cheio);
  }
  return saida;
}

/** Acha o .exe principal de uma pasta de jogo GOG. */
function acharExeDoGog(pasta, id) {
  if (!pasta || !fs.existsSync(pasta)) return '';
  // 1) o .info manda no executável
  const infos = encontrarInfosGog(pasta, 1);
  for (const arq of infos) {
    try {
      const d = JSON.parse(fs.readFileSync(arq, 'utf8'));
      const alvo = d.launchCommand || (d.playTasks && d.playTasks[0] && d.playTasks[0].path);
      if (alvo) {
        const exe = path.join(path.dirname(arq), alvo.replace(/^["']|["']$/g, ''));
        if (fs.existsSync(exe)) return exe;
      }
    } catch { /* ignora */ }
  }
  // 2) senão, o maior .exe da pasta (ignorando desinstalador)
  let exes = [];
  try {
    exes = walk(pasta, { maxDepth: 2, match: n => /\.exe$/i.test(n) && !EXE_BLACKLIST.test(n) })
      .map(f => ({ f, size: tamanhoArquivo(f) }))
      .sort((a, b) => b.size - a.size);
  } catch { /* sem permissão */ }
  return exes.length ? exes[0].f : '';
}

/* ------------------------------------------------------------------ */
/* Pastas de jogos portáteis (.exe)                                    */
/* ------------------------------------------------------------------ */

const EXE_BLACKLIST = /^(unins|setup|install|vc_?redist|dxsetup|vcredist|dotnet|crashreport|launcher_helper|7z|zsync|unitycrashhandler|ue4prereqsetup|python|node|ffmpeg|touchup|cleanup|eula|readme|updater|update|patcher|config|settings|dxwebsetup|directx)/i;

function scanFolders(folders, depth) {
  const games = [];
  const vistos = new Set();

  for (const folder of folders) {
    if (!fs.existsSync(folder)) continue;
    const exes = walk(folder, {
      maxDepth: depth == null ? 4 : depth,
      // pastas que nunca contêm o executável do jogo
      skipDirs: ['node_modules', 'redist', 'redistributables', '_commonredist', 'directx',
        'dotnet', 'vcredist', 'support', 'docs', 'doc', 'manual', 'tools', 'thirdparty',
        '$recycle.bin', 'system volume information', 'windows', 'temp', 'cache'],
      match: n => /\.exe$/i.test(n) && !EXE_BLACKLIST.test(n)
    });
    if (!exes.length) continue;

    // Agrupa por PASTA DO JOGO (a pasta que contém a pasta do .exe quando ela é
    // auxiliar: Binaries\Win64\Jogo.exe → a raiz é "Jogo", não "Win64").
    const porPasta = new Map();
    for (const exe of exes) {
      const raiz = raizDoJogo(exe, folder);
      if (!porPasta.has(raiz)) porPasta.set(raiz, []);
      porPasta.get(raiz).push(exe);
    }

    for (const [raiz, lista] of porPasta) {
      if (vistos.has(raiz)) continue;
      vistos.add(raiz);

      // analisa os .exe da pasta: metadados de versão + nome + tamanho
      const ident = identity.identificarPasta(raiz, lista);
      const info = evalIdentidade(ident, raiz, lista);
      if (!info.aceito) continue;

      const stat = (() => { try { return fs.statSync(info.exe); } catch { return null; } })();
      games.push({
        id: idFor(info.exe),
        title: info.title,
        source: 'folder',
        platform: 'PC',
        kind: 'game',
        launch: { type: 'exe', exe: info.exe, args: '' },
        installDir: raiz,
        art: null,
        // guardado para o usuário entender de onde veio o nome e conferir depois
        ident: {
          origem: info.origem,
          confianca: info.confianca,
          empresa: info.empresa || '',
          versao: info.versao || '',
          exe: path.basename(info.exe),
          tituloExe: info.title,          // usado como busca extra de capa/nota
          candidatos: info.diagnosticos || []
        },
        addedAt: (stat && stat.birthtimeMs) || Date.now(),
        playedAt: (stat && stat.atimeMs) || 0
      });
    }
  }
  return games;
}

/** Sobe até a pasta que representa o jogo (pula bin/win64/binaries/engine). */
const PASTA_AUX = /^(bin|bin32|bin64|binaries|win32|win64|x86|x64|_retail|_shipping|retail|shipping|engine|binary|build|game|app|client)$/i;
function raizDoJogo(exe, raizVarredura) {
  let dir = path.dirname(exe);
  let subiu = 0;
  while (subiu < 3) {
    const pai = path.dirname(dir);
    if (!pai || pai === dir || norm(pai).length <= norm(raizVarredura).length) break;
    if (!PASTA_AUX.test(path.basename(dir))) break;   // esta pasta tem nome de jogo
    dir = pai;
    subiu++;
  }
  return dir;
}

/**
 * Decide se a identidade encontrada vale como jogo.
 * Regras (é aqui que param os "jogos nada a ver"):
 *  - precisa de um nome que pareça título, de fonte confiável
 *  - executável minúsculo (< 200 KB) é stub/launcher, não é o jogo
 *  - nome genérico sem metadados = descarta em vez de inventar
 */
function evalIdentidade(ident, raiz, lista) {
  const maior = lista.slice().sort((a, b) => tamanhoArquivo(b) - tamanhoArquivo(a))[0];
  const exe = (ident && ident.exe) || maior;
  const size = tamanhoArquivo(exe);

  if (!exe) return { aceito: false };
  const origemForte = !!(ident && (ident.origem === 'productName' || ident.origem === 'fileDescription'));

  // Stub/launcher: abaixo de 64 KB nunca é jogo. Entre 64 e 200 KB só passa se
  // o próprio executável se identifica (jogos indie antigos são pequenos).
  if (size < 64 * 1024) return { aceito: false, motivo: 'executável pequeno demais (stub)' };
  if (size < 200 * 1024 && !origemForte) {
    return { aceito: false, motivo: 'executável pequeno e sem identificação' };
  }

  if (!ident) return { aceito: false, motivo: 'sem nome identificável' };
  if (!origemForte && !identity.pareceNomeDeJogo(ident.title)) return { aceito: false };

  return {
    aceito: true,
    title: ident.title,
    exe,
    origem: ident.origem,
    confianca: ident.confianca,
    empresa: ident.empresa,
    versao: ident.versao,
    diagnosticos: ident.diagnosticos
  };
}

function tamanhoArquivo(f) {
  try { return fs.statSync(f).size; } catch { return 0; }
}

/* ------------------------------------------------------------------ */
/* ROMs (emuladores)                                                   */
/* ------------------------------------------------------------------ */

// Arquivos que só existem como parte de outro (faixas .bin de um .cue, discos de
// um .m3u). Eles NÃO viram jogos próprios: senão "Crash.cue" + 2 faixas .bin
// apareciam como 3 jogos.
const DISC_INDEX_EXT = new Set(['.m3u', '.cue', '.gdi']);
function arquivosReferenciados(indexFile) {
  const out = [];
  let txt = '';
  try {
    if (fs.statSync(indexFile).size > 512 * 1024) return out;   // não é um índice de verdade
    txt = fs.readFileSync(indexFile, 'utf8');
  } catch { return out; }
  const dir = path.dirname(indexFile);
  const ext = path.extname(indexFile).toLowerCase();
  const add = nome => { if (nome) out.push(path.resolve(dir, nome.trim())); };
  if (ext === '.cue') {
    const re = /^\s*FILE\s+(?:"([^"]+)"|(\S+))/gim;
    let m;
    while ((m = re.exec(txt))) add(m[1] || m[2]);
  } else if (ext === '.gdi') {
    for (const linha of txt.split(/\r?\n/).slice(1)) {
      const m = /"([^"]+)"|(\S+\.(?:bin|raw|iso))/i.exec(linha);
      if (m) add(m[1] || m[2]);
    }
  } else if (ext === '.m3u') {
    for (const linha of txt.split(/\r?\n/)) {
      const l = linha.trim();
      if (l && !l.startsWith('#')) add(l);
    }
  }
  return out;
}

function scanRoms(romFolders, depth) {
  const games = [];
  const seen = new Set();
  for (const folder of romFolders) {
    if (!fs.existsSync(folder)) continue;
    const files = walk(folder, {
      maxDepth: (depth == null ? 4 : depth) + 2,
      skipDirs: [],
      match: n => Object.prototype.hasOwnProperty.call(ROM_EXT, path.extname(n).toLowerCase())
    });

    // 1) o que é "parte" de outro arquivo fica de fora
    const chave = f => path.resolve(f).toLowerCase();
    const partes = new Set();
    // .m3u primeiro: os .cue que ele lista também viram partes (e as faixas deles)
    const indices = files.filter(f => DISC_INDEX_EXT.has(path.extname(f).toLowerCase()))
      .sort((x, y) => (path.extname(x).toLowerCase() === '.m3u' ? -1 : 0) - (path.extname(y).toLowerCase() === '.m3u' ? -1 : 0));
    for (const idx of indices) {
      if (partes.has(chave(idx))) {
        // índice já coberto por um .m3u: as faixas dele também são partes
        for (const r of arquivosReferenciados(idx)) partes.add(chave(r));
        continue;
      }
      for (const r of arquivosReferenciados(idx)) partes.add(chave(r));
    }
    // reserva (índice ilegível): .bin cujo nome começa com o nome de um .cue/.gdi da mesma pasta
    const stems = indices.map(f => (path.dirname(f) + '/' + path.basename(f, path.extname(f))).toLowerCase());
    const faixaDeIndice = f => {
      const st = (path.dirname(f) + '/' + path.basename(f, path.extname(f))).toLowerCase();
      return stems.some(x => st.startsWith(x));
    };

    for (const rom of files) {
      const ext = path.extname(rom).toLowerCase();
      if (partes.has(chave(rom))) continue;
      if (ext === '.bin' && faixaDeIndice(rom)) continue;

      let platform = ROM_EXT[ext];
      // .bin solto também é cartucho de Mega Drive / Atari: a pasta decide
      if (ext === '.bin') platform = refineDiscPlatform(rom, 'disc', BIN_RULES);
      // PS2 quase sempre é .iso; PS1 quase sempre .cue/.bin/.chd
      if (platform === 'iso') platform = refineDiscPlatform(rom, 'ps2');
      if (platform === 'disc') platform = refineDiscPlatform(rom, 'ps1');
      const id = idFor(rom);
      if (seen.has(id)) continue;
      seen.add(id);
      const stat = (() => { try { return fs.statSync(rom); } catch { return null; } })();
      games.push({
        id,
        title: cleanRomName(rom),
        source: 'emulator',
        platform: PLATFORM_LABEL[platform] || platform.toUpperCase(),
        platformKey: platform,
        kind: 'rom',
        launch: { type: 'rom', rom, platform },
        installDir: path.dirname(rom),
        art: null,
        addedAt: (stat && stat.mtimeMs) || Date.now()
      });
    }
  }
  return games;
}

/* ------------------------------------------------------------------ */
/* Deduplicação (mesmo jogo achado por Steam + pasta, Epic + pasta…)   */
/* ------------------------------------------------------------------ */

const SOURCE_PRIORITY = { steam: 6, epic: 5, gog: 4, manual: 3, folder: 2, emulator: 1 };

function normTitle(t) {
  return String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '');
}

function normPath(p) {
  return norm(p || '').toLowerCase();
}

/** Pasta "raiz" do jogo: remove o executável e subpastas de binários. */
function dirOf(game) {
  let target = game.installDir || (game.launch && (game.launch.exe || game.launch.url)) || '';
  let dir = normPath(target);
  dir = dir.replace(/\/[^/]+\.(exe|bin|app|sh|bat|cmd|lnk)$/i, '');       // tira o executável
  dir = dir.replace(/\/(bin|binaries|win64|win32|x64|x86|x86_64|game|build|builds|release|retail|shipping|data)(\/.*)?$/i, '');
  return dir;
}

function exeOf(game) {
  return game.launch && (game.launch.exe || game.launch.rom) ? normPath(game.launch.exe || game.launch.rom) : '';
}

/** Chave de identidade física do jogo — usada ao adicionar manualmente. */
function installKey(game) {
  if (game.kind === 'rom') return 'rom:' + (exeOf(game) || normTitle(game.title));
  const exe = exeOf(game);
  if (exe) return 'exe:' + exe;
  return 'dir:' + dirOf(game) + '|' + normTitle(game.title);
}

const STORE_SOURCES = new Set(['steam', 'epic', 'gog']);

/** Um caminho está dentro do outro? (para casar Steam × pasta) */
function isInside(child, parent) {
  if (!child || !parent || child.length < 3 || parent.length < 3) return false;
  return child === parent || child.startsWith(parent + '/') || parent.startsWith(child + '/');
}

/**
 * Une jogos que são REALMENTE o mesmo, sem fundir jogos diferentes:
 *   1. mesma ROM (caminho idêntico)
 *   2. mesmo executável (caminho idêntico)
 *   3. jogo de loja × jogo de pasta cujo executável está dentro da pasta da loja
 *   4. mesma pasta E títulos equivalentes (ex.: "ELDEN RING" da Steam e da pasta)
 * Fontes diferentes com títulos diferentes na mesma pasta NÃO são fundidas
 * (uma pasta com Fallout4.exe, Skyrim.exe e Doom.exe continua com 3 jogos).
 */
function dedupeGames(list) {
  const groups = [];                      // { base, keys: {...} }
  const findGroup = game => {
    const exe = exeOf(game);
    const dir = dirOf(game);
    const title = normTitle(game.title);
    for (const g of groups) {
      const base = g.base;
      // 1) ROMs: só o mesmo arquivo
      if (game.kind === 'rom' || base.kind === 'rom') {
        if (game.kind === 'rom' && base.kind === 'rom' && exe && exe === g.exe) return g;
        continue;
      }
      // 2) mesmo executável
      if (exe && exe === g.exe) return g;
      // 3) loja × pasta: exe dentro da pasta do jogo de loja
      const storeVsFolder = STORE_SOURCES.has(base.source) !== STORE_SOURCES.has(game.source);
      if (storeVsFolder && isInside(exe, dirOf(base)) && isInside(dir, dirOf(base))) return g;
      // 4) mesma pasta + mesmo título (ou um contém o outro, com 6+ letras)
      const sameDir = dir && dir === g.dir;
      const titlesMatch = title && g.title && (
        title === g.title ||
        (title.length >= 6 && g.title.length >= 6 && (title.includes(g.title) || g.title.includes(title)))
      );
      if (sameDir && titlesMatch) return g;
    }
    return null;
  };

  for (const game of list) {
    const existing = findGroup(game);
    if (!existing) {
      groups.push({ base: game, exe: exeOf(game), dir: dirOf(game), title: normTitle(game.title) });
      continue;
    }
    const prev = existing.base;
    const win = (SOURCE_PRIORITY[game.source] || 0) > (SOURCE_PRIORITY[prev.source] || 0) ? game : prev;
    const lose = win === game ? prev : game;
    existing.base = {
      ...win,
      art: win.art || lose.art,
      customArt: win.customArt || lose.customArt,
      coverSource: win.coverSource || lose.coverSource,
      genres: (Array.isArray(win.genres) && win.genres.length) ? win.genres : lose.genres,
      genresSource: win.genresSource || lose.genresSource,
      meta: win.meta || lose.meta,
      rating: win.rating || lose.rating,
      tags: win.tags || lose.tags,
      playedAt: Math.max(win.playedAt || 0, lose.playedAt || 0) || undefined,
      playtime: (win.playtime && lose.playtime)
        ? { totalMs: Math.max(win.playtime.totalMs || 0, lose.playtime.totalMs || 0), sessions: (win.playtime.sessions || 0) + (lose.playtime.sessions || 0) }
        : (win.playtime || lose.playtime),
      addedAt: Math.min(win.addedAt || Infinity, lose.addedAt || Infinity) || Date.now(),
      alsoOn: [...new Set([...(win.alsoOn || []), lose.source, ...(lose.alsoOn || [])])].filter(src => src !== win.source),
      sizeOnDisk: win.sizeOnDisk || lose.sizeOnDisk
    };
    existing.exe = existing.exe || exeOf(game);
    existing.dir = existing.dir || dirOf(game);
    existing.title = existing.title || normTitle(win.title);
  }
  return groups.map(g => g.base);
}

/** Marca o que está realmente instalado no disco. */
function markInstalled(list) {
  return list.map(g => {
    let installed = true;
    if (g.source === 'steam') {
      installed = g.steamStateFlags == null ? true : (Number(g.steamStateFlags) & 4) === 4;
    } else if (g.launch && g.launch.type === 'exe' && g.launch.exe) {
      installed = fs.existsSync(g.launch.exe);
    } else if (g.launch && g.launch.type === 'rom' && g.launch.rom) {
      installed = fs.existsSync(g.launch.rom);
    } else if (g.installDir) {
      installed = fs.existsSync(g.installDir);
    }
    return { ...g, installed };
  });
}

/* ------------------------------------------------------------------ */
/* Store                                                               */
/* ------------------------------------------------------------------ */

/** Chaves de API que ficam cifradas no library.json (no Windows, pela conta do usuário). */
const CHAVES_CIFRADAS = ['youtubeKey', 'sgdbKey'];

class Store {
  constructor(dataDir) {
    this.dir = dataDir || path.join(os.homedir(), '.arcade-hub');
    this.file = path.join(this.dir, 'library.json');
    this.data = null;
  }
  load() {
    if (this.data) return this.data;
    const data = this._lerComRecuperacao();
    const settings = { ...DEFAULT_SETTINGS, ...(data && data.settings ? data.settings : {}) };
    // chaves de API ficam cifradas no disco; na memória, em texto
    for (const k of CHAVES_CIFRADAS) settings[k] = decifrar(settings[k]);
    settings.discord = { ...DEFAULT_SETTINGS.discord, ...(settings.discord || {}) };
    settings.emulators = { ...defaultEmulators(), ...(settings.emulators || {}) };
    this.data = {
      settings,
      games: Array.isArray(data && data.games) ? data.games : [],
      hidden: Array.isArray(data && data.hidden) ? data.hidden : [],
      genreCache: (data && data.genreCache) || {},
      favorites: Array.isArray(data && data.favorites) ? data.favorites : [],
      lastScan: (data && data.lastScan) || 0
    };
    return this.data;
  }
  /**
   * Lê o library.json. Se ele estiver danificado (queda de energia, disco), NÃO
   * começa com a biblioteca vazia: guarda o arquivo estragado e usa a cópia da
   * gravação anterior (.bak) ou a gravação interrompida (.tmp). Antes, o app
   * abria vazio e a próxima gravação apagava tudo de vez.
   */
  _lerComRecuperacao() {
    const ler = f => {
      const d = JSON.parse(fs.readFileSync(f, 'utf8'));
      if (!d || typeof d !== 'object' || (d.games && !Array.isArray(d.games))) throw new Error('formato inválido');
      return d;
    };
    this.recuperado = null;
    try {
      const d = ler(this.file);
      this._principalBom = true;
      return d;
    } catch (e) {
      this._principalBom = false;
      const existe = e.code !== 'ENOENT';
      let danificado = null;
      if (existe) {
        danificado = path.join(this.dir, `library.danificado-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
        try { fs.copyFileSync(this.file, danificado); } catch { danificado = null; }
      }
      for (const alt of [this.file + '.bak', this.file + '.tmp']) {
        try {
          const d = ler(alt);
          this.recuperado = { de: path.basename(alt), danificado: danificado && path.basename(danificado), jogos: (d.games || []).length };
          console.warn(`[arcade-hub] library.json ${existe ? 'danificado' : 'sumiu'}: recuperado de ${path.basename(alt)}`);
          return d;
        } catch { /* tenta a próxima */ }
      }
      if (existe) {
        this.recuperado = { de: null, danificado: danificado && path.basename(danificado), jogos: 0 };
        console.error('[arcade-hub] library.json danificado e sem cópia: começando vazio, o arquivo foi guardado em', danificado);
      }
      return null;                     // primeira execução
    }
  }

  /**
   * Agenda a gravação. Várias mudanças seguidas (ex.: buscar notas de 80 jogos)
   * viram UMA gravação, em vez de reescrever o library.json inteiro a cada jogo.
   * Chame flush() para gravar na hora (o main.js chama ao fechar o app).
   */
  save() {
    this.load();
    this._dirty = true;
    if (!this._timer) this._timer = setTimeout(() => this.flush(), 400);
    return true;
  }
  flush() {
    if (this._timer) { clearTimeout(this._timer); this._timer = null; }
    if (!this._dirty) return true;
    this._dirty = false;
    const d = this.load();
    try { fs.mkdirSync(this.dir, { recursive: true }); } catch { /* noop */ }
    const cifradas = {};
    for (const k of CHAVES_CIFRADAS) cifradas[k] = cifrar(d.settings[k]);
    const json = JSON.stringify({ ...d, settings: { ...d.settings, ...cifradas } });
    const tmp = this.file + '.tmp';
    // a versão anterior (se estava boa) vira a cópia de segurança
    if (this._principalBom) {
      try { fs.copyFileSync(this.file, this.file + '.bak'); } catch { /* primeira gravação */ }
    }
    try {
      fs.writeFileSync(tmp, json, 'utf8');
      fs.renameSync(tmp, this.file);
    } catch {
      // antivírus/indexador às vezes segura o arquivo no Windows: grava direto
      fs.writeFileSync(this.file, json, 'utf8');
      try { fs.unlinkSync(tmp); } catch { /* noop */ }
    }
    this._principalBom = true;
    return true;
  }
  get settings() { return this.load().settings; }
  get games() { return this.load().games; }
  setGames(list) { this.load().games = list; this.save(); return list; }
  updateGame(id, patch) {
    const d = this.load();
    const i = d.games.findIndex(g => g.id === id);
    if (i < 0) return null;
    d.games[i] = { ...d.games[i], ...patch };
    this.save();
    return d.games[i];
  }
  addGame(game) {
    const d = this.load();
    if (d.games.some(g => g.id === game.id)) return d.games.find(g => g.id === game.id);
    d.games.push(game);
    this.save();
    return game;
  }
  removeGame(id) {
    const d = this.load();
    d.games = d.games.filter(g => g.id !== id);
    d.hidden = [...new Set([...d.hidden, id])];
    this.save();
    return d.games;
  }
  toggleFavorite(id) {
    const d = this.load();
    const set = new Set(d.favorites);
    set.has(id) ? set.delete(id) : set.add(id);
    d.favorites = [...set];
    this.save();
    return d.favorites;
  }
  toggleHidden(id) {
    const d = this.load();
    const set = new Set(d.hidden);
    set.has(id) ? set.delete(id) : set.add(id);
    d.hidden = [...set];
    this.save();
    return d.hidden;
  }
  saveSettings(patch) {
    const d = this.load();
    d.settings = { ...d.settings, ...patch };
    this.save();
    return d.settings;
  }
}

/* ------------------------------------------------------------------ */
/* Scan completo                                                       */
/* ------------------------------------------------------------------ */

/**
 * Parte pesada da varredura (lê disco e registro). Não mexe no store, então
 * pode rodar num processo separado (ver runScanAsync) sem travar a janela.
 */
function collectScan(s, opts) {
  opts = opts || {};
  const collected = [];
  const report = { startedAt: Date.now(), sources: {}, problems: [], duplicates: 0, total: 0 };

  const track = (name, fn) => {
    const t0 = Date.now();
    try {
      const found = fn() || [];
      report.sources[name] = { found: found.length, ms: Date.now() - t0 };
      collected.push(...found);
      return found;
    } catch (e) {
      report.sources[name] = { found: 0, ms: Date.now() - t0, error: String((e && e.message) || e) };
      report.problems.push({ source: name, message: String((e && e.message) || e) });
      return [];
    }
  };

  if (s.includeStoreLaunchers) {
    track('steam', () => scanSteam(opts.steamRoots || s.steamRoots));
    track('epic', () => scanEpic(opts.epicManifests || s.epicManifests));
    const diagGog = {};
    track('gog', () => scanGog({ folders: s.folders || [], diag: diagGog }));
    if (diagGog.gog) {
      report.sources.gog = { ...(report.sources.gog || { found: 0 }), ...diagGog.gog };
      if (diagGog.gog.dica) report.problems.push({ source: 'gog', message: diagGog.gog.dica });
    }
  } else {
    report.problems.push({ source: 'lojas', message: 'varredura de Steam/Epic/GOG está desligada nos ajustes' });
  }
  track('pastas', () => scanFolders(s.folders || [], s.scanDepth));
  track('roms', () => scanRoms(s.romFolders || [], s.scanDepth));

  // pastas configuradas que não existem mais (HD externo desconectado, etc.)
  for (const f of [...(s.folders || []), ...(s.romFolders || [])]) {
    if (!fs.existsSync(f)) report.problems.push({ source: 'pastas', message: `pasta não encontrada: ${f}` });
  }
  return { collected, report };
}

// Campos que a VARREDURA manda (de onde o jogo veio e como abrir). Todo o resto
// — tempo de jogo, notas, gêneros, capa escolhida, título editado, argumentos —
// é do usuário e vem do registro antigo. Antes era o contrário: o merge partia do
// jogo recém-escaneado e esquecia playtime/meta, então reescanear zerava tudo.
const SCAN_FIELDS = ['source', 'platform', 'platformKey', 'kind', 'installDir', 'sizeOnDisk', 'steamStateFlags', 'ident'];

function mergeScanned(old, g) {
  if (!old) return g;
  const out = { ...old };
  for (const f of SCAN_FIELDS) if (g[f] !== undefined) out[f] = g[f];
  if (old.launchEdited && old.launch) {
    out.launch = old.launch;                                  // usuário editou: respeita
  } else if (old.launch && g.launch && old.launch.type === g.launch.type) {
    out.launch = { ...g.launch, args: (old.launch.args || g.launch.args || '') };
  } else {
    out.launch = g.launch;
  }
  out.title = old.customTitle || g.title;
  out.art = old.customArt || g.art || old.art;
  out.playedAt = old.playedAt || g.playedAt;                 // atime do .exe só serve na 1ª vez
  out.addedAt = old.addedAt || g.addedAt;
  delete out.totalPlayMs;                                     // campo antigo, nunca usado
  return out;
}

/** Junta o que foi coletado com a biblioteca atual e grava. */
function finishScan(store, collected, report, opts) {
  opts = opts || {};
  limparCacheLojas();                 // a loja pode ter sido instalada/removida
  const prev = new Map(store.games.map(g => [g.id, g]));
  const dados = store.load();
  const hidden = new Set(dados.hidden || []);
  // jogos que saíram (desinstalados): guardados para voltar com tempo, capa e
  // conquistas se forem reinstalados
  const arquivados = { ...(dados.arquivados || {}) };
  const merged = collected.filter(g => !hidden.has(g.id)).map(g => {
    const antigo = prev.get(g.id) || arquivados[g.id];
    delete arquivados[g.id];
    return mergeScanned(antigo, g);
  });
  report.removidos = [];

  if (opts.keepMissing !== false) {
    // Jogo que não apareceu nesta varredura. Antes ficava se a PASTA existisse —
    // mas Steam/Epic/GOG deixam a pasta (saves, restos) ao desinstalar, então o
    // jogo nunca saía. Agora: loja manda nas lojas; arquivo manda em pasta/ROM.
    const ids = new Set(merged.map(g => g.id));
    const discoPresente = p => { try { return fs.existsSync(path.parse(path.resolve(p)).root); } catch { return true; } };
    const contaAntes = src => store.games.filter(g => g.source === src).length;
    const lojaConferida = src => {
      const r = report.sources[src];
      // loja lida sem erro; se de repente achou 0 de N jogos, desconfia (Steam fora do ar, registro ilegível)
      return !!r && !r.error && !(r.found === 0 && contaAntes(src) > 0);
    };
    for (const old of store.games) {
      if (ids.has(old.id)) continue;
      const lt = old.launch && old.launch.type;
      const arq = lt === 'rom' ? old.launch.rom : lt === 'exe' ? old.launch.exe : null;
      let manter;
      if (old.source === 'manual') manter = true;
      else if (['steam', 'epic', 'gog'].includes(old.source)) {
        manter = !lojaConferida(old.source) || (old.installDir && !discoPresente(old.installDir));
      } else if (arq) {
        manter = fs.existsSync(arq) || !discoPresente(arq);           // HD externo desligado: não apaga
      } else {
        manter = old.installDir ? fs.existsSync(old.installDir) : true;
      }
      if (manter) merged.push(old);
      else { arquivados[old.id] = { ...old, arquivadoEm: Date.now() }; report.removidos.push(old.title); }
    }
  }
  // guarda no máximo 400 jogos arquivados (os mais recentes)
  const chavesArq = Object.keys(arquivados).sort((a, b) => (arquivados[b].arquivadoEm || 0) - (arquivados[a].arquivadoEm || 0));
  for (const k of chavesArq.slice(400)) delete arquivados[k];
  dados.arquivados = arquivados;

  // unifica duplicatas (Steam + pasta + Epic…) e marca o que está instalado
  const deduped = dedupeGames(merged);
  const final = markInstalled(deduped);
  report.duplicates = merged.length - deduped.length;
  report.total = final.length;
  report.installed = final.filter(g => g.installed !== false).length;
  report.ms = Date.now() - report.startedAt;
  if (!final.length) report.problems.push({ source: 'geral', message: 'nenhum jogo encontrado — confira as pastas nos ajustes' });

  const d = store.load();
  d.lastScan = Date.now();
  d.lastScanReport = report;
  d.games = final;
  refreshProblems(store);      // marca em cada jogo o que impede de abrir
  store.save();
  return final;
}

/** Versão síncrona (usada pelos scripts de teste e como reserva). */
function runScan(store, opts) {
  const { collected, report } = collectScan(store.settings, opts);
  return finishScan(store, collected, report, opts);
}

/**
 * Varredura sem travar a janela: a coleta roda num utilityProcess do Electron.
 * Se não der (Electron antigo, erro, demora demais), cai na versão síncrona.
 */
let scanEmAndamento = null;
function runScanAsync(store, opts) {
  if (scanEmAndamento) return scanEmAndamento;          // clique duplo não escaneia 2x
  const settings = JSON.parse(JSON.stringify(store.settings));
  const coletar = () => new Promise((resolve, reject) => {
    let electron;
    const semProcesso = msg => Object.assign(new Error(msg), { semProcesso: true });
    try { electron = require('electron'); } catch { return reject(semProcesso('fora do Electron')); }
    if (!electron || !electron.utilityProcess) return reject(semProcesso('utilityProcess indisponível'));
    let child;
    try {
      child = electron.utilityProcess.fork(path.join(__dirname, 'scan-worker.js'), [], { serviceName: 'Arcade Hub - varredura' });
    } catch (e) { return reject(semProcesso('não abriu o processo de varredura: ' + (e && e.message))); }
    let acabou = false;
    const fim = (fn, v) => { if (acabou) return; acabou = true; clearTimeout(timer); try { child.kill(); } catch { /* já saiu */ } fn(v); };
    const timer = setTimeout(() => fim(reject, new Error('varredura demorou demais')), 10 * 60 * 1000);
    child.on('message', m => (m && m.ok ? fim(resolve, m) : fim(reject, new Error((m && m.error) || 'falha na varredura'))));
    child.on('exit', code => fim(reject, new Error('processo de varredura saiu (' + code + ')')));
    child.postMessage({ settings, opts: opts || {} });
  });
  scanEmAndamento = coletar()
    .catch(err => {
      // Só refaz aqui (no processo da janela) se o processo separado nem conseguiu
      // começar. Se ele demorou demais ou quebrou no meio, refazer aqui congelaria
      // o app pelo mesmo tempo: melhor avisar o erro.
      if (!err || !err.semProcesso) throw err;
      console.warn('[arcade-hub] varredura em processo separado indisponível, usando a síncrona:', err.message);
      return collectScan(store.settings, opts);
    })
    .then(({ collected, report }) => finishScan(store, collected, report, opts))
    .finally(() => { scanEmAndamento = null; });
  return scanEmAndamento;
}

/* ------------------------------------------------------------------ */
/* Lançamento                                                          */
/* ------------------------------------------------------------------ */

// Esquemas que um item "link" pode abrir. Fora disso (file:, ms-msdt:, search-ms:,
// javascript:…) é recusado: um link é aberto pelo Windows sem confirmação.
const URL_SCHEMES = new Set([
  'http:', 'https:', 'steam:', 'com.epicgames.launcher:', 'goggalaxy:',
  'uplay:', 'origin:', 'origin2:', 'eaapp:', 'battlenet:', 'itch:', 'heroic:',
  'amazon-games:', 'xbox:', 'ms-windows-store:'
]);
function urlPermitida(u) {
  try { return URL_SCHEMES.has(new URL(String(u)).protocol.toLowerCase()); } catch { return false; }
}

const LAUNCH_TYPES = new Set(['steam', 'epic', 'gog', 'url', 'exe', 'rom']);
/** Mantém só campos conhecidos (texto) de um "launch" vindo do renderer ou de um backup. */
function sanitizeLaunch(l) {
  if (!l || typeof l !== 'object' || !LAUNCH_TYPES.has(l.type)) return null;
  const out = { type: l.type };
  for (const k of ['appId', 'appName', 'catalogItemId', 'gameId', 'exe', 'args', 'url', 'rom', 'platform']) {
    if (l[k] != null && l[k] !== '') out[k] = String(l[k]);
  }
  if (out.type === 'steam' && !/^\d+$/.test(out.appId || '')) return null;
  if (out.type === 'url' && out.url && !urlPermitida(out.url)) return null;
  return out;
}

/**
 * Jogo retrô online pelo RetroArch (netplay). Os dois lados precisam do mesmo
 * core e da mesma ROM. `modo`: { hospedar: true } ou { conectar: endereço }.
 */
function planoNetplay(game, settings, modo) {
  const g = game || {};
  if (!g.launch || g.launch.type !== 'rom' || !g.launch.rom) return { kind: 'broken', reason: 'jogo online só funciona com ROMs' };
  const ra = settings.retroarch || {};
  if (!ra.exe) return { kind: 'broken', reason: 'o jogo online usa o RetroArch: configure o RetroArch em Ajustes › Emuladores (ou na seção Emuladores do Modo TV)' };
  const platform = g.launch.platform || g.platformKey;
  const coreNome = modo.core || RETROARCH_CORE[platform];
  if (!coreNome || !/^[\w.-]+$/.test(coreNome)) return { kind: 'broken', reason: 'esse console ainda não tem jogo online pelo RetroArch' };
  const pastaCores = ra.cores || path.join(path.dirname(ra.exe), 'cores');
  const core = path.join(pastaCores, coreNome);
  if (!fs.existsSync(core)) return { kind: 'broken', reason: `falta o core ${coreNome} no RetroArch (baixe pelo "Atualizador online" do RetroArch)` };
  const porta = Math.max(1, Math.min(65535, Number(modo.porta) || 55435));
  const nick = String(modo.nick || 'Jogador').replace(/[^\p{L}\p{N} _-]/gu, '').slice(0, 20) || 'Jogador';
  const args = ['-L', core];
  if (modo.hospedar) args.push('--host');
  else args.push(`--connect=${modo.conectar}`);
  args.push(`--port=${porta}`, `--nick=${nick}`, g.launch.rom);
  return { kind: 'exe', target: ra.exe, args, cwd: path.dirname(ra.exe), label: 'RetroArch (online)', core: coreNome, porta };
}

/** Identidade da ROM para achar a mesma do outro lado: CRC32 (ou o tamanho, se for enorme). */
function chaveDaRom(rom) {
  try {
    const t = fs.statSync(rom).size;
    return fontesVideo.crcDaRom(rom, t) || ('S' + t.toString(16).toUpperCase());
  } catch { return ''; }
}

function buildLaunchPlan(game, settings) {
  const g = game;
  if (!g || typeof g !== 'object' || !g.launch || typeof g.launch !== 'object') {
    return { kind: 'unknown', label: 'Este jogo não tem forma de abrir configurada' };
  }
  if (g.launch.type === 'steam') {
    if (!/^\d+$/.test(String(g.launch.appId || ''))) return { kind: 'broken', label: 'Steam', reason: 'ID da Steam inválido' };
    return { kind: 'url', target: `steam://rungameid/${g.launch.appId}`, label: 'Steam' };
  }
  if (g.launch.type === 'epic') {
    const app = g.launch.appName || g.launch.catalogItemId;
    if (!app) return { kind: 'broken', label: 'Epic Games', reason: 'jogo da Epic sem identificador' };
    return { kind: 'url', target: `com.epicgames.launcher://apps/${encodeURIComponent(app)}?action=launch&silent=true`, label: 'Epic Games' };
  }
  if (g.launch.type === 'gog') {
    if (g.launch.exe) {
      return { kind: 'exe', target: g.launch.exe, args: [], cwd: path.dirname(g.launch.exe), label: 'GOG' };
    }
    return { kind: 'url', target: `goggalaxy://openGameView/${encodeURIComponent(g.launch.gameId || '')}`, label: 'GOG Galaxy' };
  }
  if (g.launch.type === 'url') {
    if (!g.launch.url) return { kind: 'broken', label: 'Sem link', reason: 'este item está sem URL — use Editar para colar o link' };
    if (!urlPermitida(g.launch.url)) return { kind: 'broken', label: 'Link bloqueado', reason: 'esse tipo de link não é permitido (use http(s) ou o link de uma loja, como steam://)' };
    return { kind: 'url', target: g.launch.url, label: 'Navegador' };
  }
  if (g.launch.type === 'exe') {
    if (!g.launch.exe) {
      return { kind: 'broken', label: 'Sem executável', reason: 'este jogo está sem o caminho do .exe — use Editar para apontar o arquivo' };
    }
    return { kind: 'exe', target: g.launch.exe, args: splitArgs(g.launch.args || ''), cwd: path.dirname(g.launch.exe), label: 'Executável' };
  }
  if (g.launch.type === 'rom') {
    if (!g.launch.rom) {
      return { kind: 'broken', label: 'Sem ROM', reason: 'este jogo está sem o arquivo da ROM — use Editar para apontar o arquivo' };
    }
    const platform = g.launch.platform || g.platformKey;
    const emu = (settings.emulators || {})[platform];
    if (emu && emu.exe) {
      return {
        kind: 'exe',
        target: emu.exe,
        args: splitArgs(emu.args || '"{rom}"').map(a => a.replace('{rom}', g.launch.rom)),
        cwd: path.dirname(emu.exe),
        label: emu.hint || emu.label || 'Emulador'
      };
    }
    if (settings.retroarch && settings.retroarch.exe) {
      const core = RETROARCH_CORE[platform];
      const args = [];
      if (core && settings.retroarch.cores) {
        args.push('-L', path.join(settings.retroarch.cores, core));
      } else if (core) {
        args.push('-L', core);
      }
      args.push(g.launch.rom);
      return { kind: 'exe', target: settings.retroarch.exe, args, cwd: path.dirname(settings.retroarch.exe), label: 'RetroArch' };
    }
    return {
      kind: 'needs-emulator',
      platform,
      hint: (EMULATOR_HINTS[platform] || 'um emulador'),
      label: 'Emulador não configurado'
    };
  }
  return { kind: 'unknown', label: 'Origem desconhecida' };
}

const RETROARCH_CORE = {
  nes: 'nestopia_libretro.dll', snes: 'snes9x_libretro.dll', n64: 'mupen64plus_next_libretro.dll',
  gb: 'gambatte_libretro.dll', gbc: 'gambatte_libretro.dll', gba: 'mgba_libretro.dll',
  nds: 'melonds_libretro.dll', '3ds': 'citra_libretro.dll', genesis: 'genesis_plus_gx_libretro.dll',
  sms: 'genesis_plus_gx_libretro.dll', gg: 'genesis_plus_gx_libretro.dll', pce: 'mednafen_pce_libretro.dll',
  ps1: 'swanstation_libretro.dll', ps2: 'pcsx2_libretro.dll', dreamcast: 'flycast_libretro.dll',
  saturn: 'kronos_libretro.dll', gc: 'dolphin_libretro.dll', wii: 'dolphin_libretro.dll',
  psp: 'ppsspp_libretro.dll',
  arcade: 'mame_libretro.dll', atari2600: 'stella_libretro.dll', c64: 'vice_x64_libretro.dll'
};

function splitArgs(str) {
  const out = [];
  const re = /"([^"]*)"|(\S+)/g;
  let m;
  while ((m = re.exec(str))) out.push(m[1] != null ? m[1] : m[2]);
  return out;
}

/* ------------------------------------------------------------------ */
/* Tempo de jogo                                                       */
/* ------------------------------------------------------------------ */

const runningProcesses = new Map();   // gameId -> { startedAt, child }

function fmtDuration(ms) {
  const value = Number(ms);
  if (!Number.isFinite(value) || value <= 0) return 'nunca contado';
  const min = Math.round(value / 60000);
  if (min < 1) return 'menos de 1 min';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h}h${m ? ' ' + m + 'min' : ''}` : `${m}min`;
}

/**
 * Registra o início/fim de uma sessão. Retorna um "stop" que grava o tempo no store.
 */
const MIN_SESSAO_MS = 20000;             // <20s: não conta (engano, crash, launcher que só repassa)

/**
 * Soma uma sessão ao jogo e guarda no histórico (usado pela página de estatísticas).
 * O histórico guarda as últimas 500 sessões: { at: fim da sessão, ms: duração }.
 */
function registrarSessao(store, gameId, elapsed, perfil) {
  if (!(elapsed >= MIN_SESSAO_MS)) return null;
  const current = store.games.find(g => g.id === gameId);
  if (!current) return null;
  const pt = current.playtime || {};
  const total = (pt.totalMs || 0) + elapsed;
  const sessions = (pt.sessions || 0) + 1;
  const quem = perfil || perfilAtivoDe(store.settings);
  const history = [...(Array.isArray(pt.history) ? pt.history : []), { at: Date.now(), ms: Math.round(elapsed), perfil: quem }].slice(-500);
  store.updateGame(gameId, {
    playtime: { ...pt, totalMs: total, sessions, lastSessionMs: elapsed, lastAt: Date.now(), history },
    playedAt: Date.now()
  });
  return { elapsed, total, sessions, perfil: quem };
}

function startSession(store, game, child) {
  const startedAt = Date.now();
  const entry = { startedAt, child, perfil: perfilAtivoDe(store.settings) };
  runningProcesses.set(game.id, entry);
  const finish = (save) => {
    const entry = runningProcesses.get(game.id);
    runningProcesses.delete(game.id);
    if (!entry || save === false) return null;
    return registrarSessao(store, game.id, Date.now() - entry.startedAt, entry.perfil);
  };
  return { startedAt, finish, _entry: entry };
}

/* ------------------------------------------------------------------ */
/* Backup (exportar / importar)                                        */
/* ------------------------------------------------------------------ */

/** Caminho local de uma URL file:// gravada pelo app (formato "file://C:/..." ou "file:///home/..."). */
function caminhoDeFileUrl(url) {
  let p = String(url || '').replace(/^file:\/\//i, '');
  if (/^\/[A-Za-z]:[\\/]/.test(p)) p = p.slice(1);
  if (process.platform !== 'win32' && !p.startsWith('/')) p = '/' + p;
  // URL no formato padrão vem com %20, %7E… ("RUNNER~1" vira "RUNNER%7E1"). O app
  // grava o caminho cru, mas capas escolhidas pelo usuário ou de backup podem vir
  // codificadas: sem decodificar, a capa ficava de fora do backup no Windows.
  if (/%[0-9a-f]{2}/i.test(p) && !fs.existsSync(p)) {
    try { p = decodeURIComponent(p); } catch { /* "%" de verdade no nome: fica como está */ }
  }
  return p;
}
const IMG_EXT = /\.(jpe?g|png|webp|gif|bmp)$/i;

function exportLibrary(store, targetFile) {
  const data = store.load();
  const payload = {
    app: 'Arcade Hub',
    formatVersion: 2,
    exportedAt: new Date().toISOString(),
    settings: {
      ...data.settings,
      // chaves e senhas são suas — não vão no arquivo
      sgdbKey: '',
      youtubeKey: '',
      screenscraper: { usuario: '', senha: '', devid: '', devsenha: '' }
    },
    games: data.games,
    favorites: data.favorites,
    hidden: data.hidden,
    genreCache: data.genreCache
  };
  fs.mkdirSync(path.dirname(targetFile), { recursive: true });

  if (!/\.zip$/i.test(targetFile)) {
    fs.writeFileSync(targetFile, JSON.stringify(payload, null, 2), 'utf8');
    return { file: targetFile, games: data.games.length, bytes: fs.statSync(targetFile).size, capas: 0 };
  }

  // .zip: leva as capas junto. No JSON, a capa vira "zip:capas/<arquivo>".
  const entradas = [];
  const vistos = new Map();                    // caminho local -> nome no zip
  const empacotar = url => {
    if (typeof url !== 'string' || !/^file:\/\//i.test(url)) return url;
    const local = caminhoDeFileUrl(url);
    if (!IMG_EXT.test(local)) return url;
    if (!vistos.has(local)) {
      let st;
      try { st = fs.statSync(local); } catch { return url; }
      if (!st.isFile() || st.size > 20 * 1024 * 1024) return url;
      const nome = 'capas/' + crypto.createHash('sha1').update(local).digest('hex').slice(0, 16) + path.extname(local).toLowerCase();
      entradas.push({ name: nome, data: fs.readFileSync(local), compress: false });
      vistos.set(local, nome);
    }
    return 'zip:' + vistos.get(local);
  };
  payload.games = data.games.map(g => ({ ...g, art: empacotar(g.art), customArt: empacotar(g.customArt) }));
  entradas.unshift({ name: 'biblioteca.json', data: Buffer.from(JSON.stringify(payload, null, 2), 'utf8') });
  const tmp = targetFile + '.tmp';
  fs.writeFileSync(tmp, criarZip(entradas));
  fs.renameSync(tmp, targetFile);
  return { file: targetFile, games: data.games.length, bytes: fs.statSync(targetFile).size, capas: vistos.size };
}

/** Lê e valida um backup. Não altera nada — serve para mostrar o que vai entrar. */
function lerBackup(sourceFile) {
  let raw;
  let capas = null;
  if (/\.zip$/i.test(sourceFile)) {
    let zip;
    try { zip = lerZip(fs.readFileSync(sourceFile)); } catch (e) { throw new Error('não consegui abrir esse .zip: ' + e.message); }
    const json = zip.get('biblioteca.json');
    if (!json) throw new Error('esse .zip não é um backup do Arcade Hub (falta o biblioteca.json)');
    try { raw = JSON.parse(json().toString('utf8')); } catch { throw new Error('o biblioteca.json dentro do .zip está corrompido'); }
    capas = zip;
  } else {
    try {
      raw = JSON.parse(fs.readFileSync(sourceFile, 'utf8'));
    } catch (e) {
      throw new Error('não consegui ler esse arquivo — ele não é um JSON válido (o backup foi salvo pelo Arcade Hub?)');
    }
  }
  if (!raw || !Array.isArray(raw.games)) throw new Error('arquivo inválido (não parece um backup do Arcade Hub)');
  const games = [];
  let ignorados = 0;
  for (const g of raw.games) {
    if (!g || typeof g !== 'object' || !g.id) { ignorados++; continue; }
    const launch = sanitizeLaunch(g.launch);
    if (!launch) { ignorados++; continue; }
    // estado calculado não vem do arquivo (é refeito aqui)
    const { problem, installed, launchersOk, ...resto } = g;
    games.push({ ...resto, id: String(g.id), launch });
  }
  const strArr = v => (Array.isArray(v) ? v.filter(x => typeof x === 'string') : null);
  let settings = null;
  if (raw.settings && typeof raw.settings === 'object') {
    settings = { ...raw.settings };
    delete settings.sgdbKey;
    delete settings.youtubeKey;
    delete settings.screenscraper;
    delete settings.windowBounds;
  }
  return {
    games, ignorados, settings, capas,
    favorites: strArr(raw.favorites), hidden: strArr(raw.hidden),
    genreCache: raw.genreCache && typeof raw.genreCache === 'object' ? raw.genreCache : null
  };
}

/** Programas que o backup faria o Arcade Hub executar (para pedir confirmação). */
function programasDoBackup(b, mode) {
  const lista = new Set();
  for (const g of b.games) {
    if (g.launch.exe) lista.add(g.launch.exe);
    if (g.launch.type === 'url' && g.launch.url && !/^https?:/i.test(g.launch.url)) lista.add(g.launch.url);
  }
  if (mode === 'replace' && b.settings) {
    for (const emu of Object.values(b.settings.emulators || {})) if (emu && emu.exe) lista.add(emu.exe);
    if (b.settings.retroarch && b.settings.retroarch.exe) lista.add(b.settings.retroarch.exe);
  }
  return [...lista];
}

/** Assinatura dos formatos de imagem aceitos (não confia na extensão). */
function pareceImagem(buf) {
  if (!buf || buf.length < 12) return false;
  if (buf[0] === 0xff && buf[1] === 0xd8) return true;                                  // jpg
  if (buf.readUInt32BE(0) === 0x89504e47) return true;                                  // png
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return true;
  if (buf.toString('ascii', 0, 4) === 'GIF8') return true;
  if (buf[0] === 0x42 && buf[1] === 0x4d) return true;                                  // bmp
  return false;
}

/** Tira as capas do zip para a pasta de capas e troca "zip:capas/x" pelo caminho local. */
function extrairCapas(b, store) {
  if (!b.capas) return 0;
  const dir = covers.artDir(store.dir);
  const feitas = new Map();
  let n = 0;
  const resolver = ref => {
    if (typeof ref !== 'string' || !ref.startsWith('zip:')) return ref;
    const nomeZip = ref.slice(4);
    if (feitas.has(nomeZip)) return feitas.get(nomeZip);
    let url = null;
    const base = path.basename(nomeZip);
    const ler = b.capas.get(nomeZip);
    if (ler && /^[\w.-]+$/.test(base) && IMG_EXT.test(base)) {
      try {
        const dados = ler();
        if (dados.length <= 20 * 1024 * 1024 && pareceImagem(dados)) {
          const destino = path.join(dir, 'backup-' + base);
          fs.writeFileSync(destino, dados);
          url = 'file://' + destino.replace(/\\/g, '/');
          n++;
        }
      } catch { /* capa corrompida: o jogo fica sem capa */ }
    }
    feitas.set(nomeZip, url);
    return url;
  };
  for (const g of b.games) {
    g.art = resolver(g.art);
    g.customArt = resolver(g.customArt);
  }
  return n;
}

function importLibrary(store, sourceFile, mode, backupJaLido) {
  const b = backupJaLido || lerBackup(sourceFile);
  const capasImportadas = extrairCapas(b, store);
  const d = store.load();
  // "substituir" começa do zero. (Antes o mapa era montado ANTES de zerar a lista,
  // então os jogos antigos continuavam lá e o modo agia como "mesclar".)
  const byId = new Map(mode === 'replace' ? [] : d.games.map(g => [g.id, g]));
  let added = 0; let updated = 0;
  for (const g of b.games) {
    if (byId.has(g.id)) { updated++; byId.set(g.id, { ...byId.get(g.id), ...g }); }
    else { added++; byId.set(g.id, g); }
  }
  d.games = [...byId.values()];
  if (b.favorites) d.favorites = [...new Set([...(mode === 'replace' ? [] : d.favorites), ...b.favorites])];
  if (b.hidden) d.hidden = [...new Set([...(mode === 'replace' ? [] : d.hidden), ...b.hidden])];
  if (b.settings && mode === 'replace') {
    d.settings = {
      ...d.settings, ...b.settings, sgdbKey: d.settings.sgdbKey, windowBounds: d.settings.windowBounds,
      youtubeKey: d.settings.youtubeKey, screenscraper: d.settings.screenscraper
    };
    d.settings.emulators = { ...defaultEmulators(), ...(d.settings.emulators || {}) };
  }
  if (b.genreCache) d.genreCache = { ...d.genreCache, ...b.genreCache };
  refreshProblems(store);
  store.save();
  return { added, updated, ignored: b.ignorados, total: d.games.length, capas: capasImportadas };
}

/* ------------------------------------------------------------------ */
/* Diagnóstico por jogo (o card avisa o problema antes do clique)      */
/* ------------------------------------------------------------------ */

/**
 * Lojas instaladas, com cache de 60s. Antes cada resposta da interface (favoritar,
 * salvar ajuste, abrir jogo…) consultava o registro do Windows de novo.
 */
let launchersCache = null;
function launchersCacheados() {
  if (launchersCache && Date.now() - launchersCache.at < 60000) return launchersCache.v;
  const v = detectLaunchers();
  launchersCache = { v, at: Date.now() };
  return v;
}
function limparCacheLojas() { launchersCache = null; steamRootsCache = null; }

/** Descobre se as lojas estão instaladas nesta máquina. */
function detectLaunchers() {
  const out = {
    steam: { installed: false, path: '' },
    epic: { installed: false, path: '' },
    gog: { installed: false, path: '' }
  };
  // Steam: registro no Windows ou pasta padrão
  for (const root of steamRoots()) {
    if (fs.existsSync(path.join(root, 'steam.exe')) || fs.existsSync(path.join(root, 'steamapps'))) {
      out.steam = { installed: true, path: root };
      break;
    }
  }
  // Epic: manifests ou pasta do launcher
  const epicPaths = [
    'C:/ProgramData/Epic/EpicGamesLauncher/Data/Manifests',
    'C:/Program Files (x86)/Epic Games/Launcher/Portal/Binaries/Win32/EpicGamesLauncher.exe'
  ];
  out.epic.installed = epicPaths.some(pth => fs.existsSync(pth));
  out.epic.path = epicPaths.find(pth => fs.existsSync(pth)) || '';
  // GOG Galaxy
  const gogPaths = [
    'C:/Program Files (x86)/GOG Galaxy/GalaxyClient.exe',
    'C:/Program Files/GOG Galaxy/GalaxyClient.exe'
  ];
  out.gog.installed = gogPaths.some(pth => fs.existsSync(pth));
  out.gog.path = gogPaths.find(pth => fs.existsSync(pth)) || '';
  return out;
}

/**
 * Marca em cada jogo o motivo de ele não abrir (ou null se está tudo bem).
 * Rodado na varredura e quando os ajustes mudam — não a cada ação da interface.
 */
function refreshProblems(store) {
  const d = store.load();
  const settings = d.settings || {};
  const launchers = launchersCacheados();
  const emulators = settings.emulators || {};
  const retro = settings.retroarch || {};
  let changed = 0;

  d.games = d.games.map(game => {
    let problem = null;
    const launch = game.launch || {};
    const hasEmu = pkey => !!(emulators[pkey] && emulators[pkey].exe) || !!retro.exe;

    if (game.kind === 'rom') {
      if (launch.rom && !fs.existsSync(launch.rom)) problem = 'arquivo da ROM não encontrado';
      else if (game.platformKey && !hasEmu(game.platformKey)) problem = 'sem emulador para ' + (game.platform || game.platformKey);
      else if (game.platformKey) {
        const emu = emulators[game.platformKey];
        const exe = emu && emu.exe ? emu.exe : (retro.exe || '');
        if (exe && !fs.existsSync(exe)) problem = 'emulador não encontrado (' + path.basename(exe) + ')';
      }
    } else if (launch.type === 'exe') {
      if (!launch.exe) problem = 'sem executável definido';
      else if (!fs.existsSync(launch.exe)) problem = 'arquivo não encontrado';
    } else if (launch.type === 'steam') {
      if (!launchers.steam.installed) problem = 'Steam não está instalada';
    } else if (launch.type === 'epic') {
      if (!launchers.epic.installed) problem = 'Epic Games não está instalado';
    } else if (launch.type === 'gog') {
      if (launch.exe && !fs.existsSync(launch.exe) && !launchers.gog.installed) problem = 'GOG Galaxy não está instalado';
    } else if (launch.type === 'url' && !launch.url) {
      problem = 'sem link definido';
    }

    if ((game.problem || null) !== problem) changed++;
    const { launchersOk, ...resto } = game;          // não guarda mais cópia das lojas em cada jogo
    if (launchersOk) changed++;
    return { ...resto, problem };
  });

  if (changed) store.save();
  return { changed, launchers };
}

/* ------------------------------------------------------------------ */
/* Detecção automática de emuladores                                   */
/* ------------------------------------------------------------------ */

// nome do executável (minúsculo, sem .exe) -> plataformas que ele cobre
const KNOWN_EMULATORS = [
  { match: /^retroarch$/, label: 'RetroArch', kind: 'retroarch', platforms: ['*'] },
  { match: /^(snes9x|snes9x-x64)$/, label: 'Snes9x', platforms: ['snes'] },
  { match: /^(mgba|mgba-qt|visualboyadvance|vbam|visualboyadvance-m)$/, label: 'mGBA / VBA-M', platforms: ['gb', 'gbc', 'gba'] },
  { match: /^(melonds|desmume|desmume_x64)$/, label: 'melonDS / DeSmuME', platforms: ['nds'] },
  { match: /^(dolphin|dolphin-emu|dolphin-emu-nogui)$/, label: 'Dolphin', platforms: ['gc', 'wii'] },
  { match: /^(pcsx2|pcsx2-qt|pcsx2x64)$/, label: 'PCSX2', platforms: ['ps2'] },
  { match: /^(duckstation|duckstation-qt-x64|duckstation-nogui-x64)$/, label: 'DuckStation', platforms: ['ps1'] },
  { match: /^(epsxe|ePSXe)$/i, label: 'ePSXe', platforms: ['ps1'] },
  { match: /^(ppsspp|ppssppwindows64|ppssppwindows)$/, label: 'PPSSPP', platforms: ['psp'] },
  { match: /^(citra|citra-qt|azahar|azahar-qt)$/, label: 'Citra / Azahar', platforms: ['3ds'] },
  { match: /^(ryujinx|sudachi|yuzu)$/, label: 'Ryujinx / Sudachi', platforms: ['switch'] },
  { match: /^(cemu|cemu_)/, label: 'Cemu', platforms: ['wiiu'] },
  { match: /^(project64|pj64|mupen64plus|mupen64|rmg)$/, label: 'Project64 / Mupen64Plus', platforms: ['n64'] },
  { match: /^(fusion|kega fusion|gens|blastem)$/, label: 'Kega Fusion / BlastEm', platforms: ['genesis', 'sms', 'gg'] },
  { match: /^(ares|bsnes|higan)$/, label: 'Ares / bsnes', platforms: ['snes', 'nes', 'n64', 'gb', 'gba', 'genesis'] },
  { match: /^(mesen|mesen-s|nestopia|fceux|puNES)$/, label: 'Mesen / Nestopia / FCEUX', platforms: ['nes'] },
  { match: /^(stella)$/, label: 'Stella', platforms: ['atari2600'] },
  { match: /^(a7800|atari800|altirra)$/, label: 'Atari 7800 / 800', platforms: ['atari7800', 'atari5200'] },
  { match: /^(mame|mame64|mameui64)$/, label: 'MAME', platforms: ['arcade'] },
  { match: /^(mednafen)$/, label: 'Mednafen', platforms: ['pce', 'wonderswan', 'neogeo', 'virtualboy', 'saturn', 'ps1'] },
  { match: /^(flycast|redream|nullDC)$/, label: 'Flycast / redream', platforms: ['dreamcast'] },
  { match: /^(vice|vice_x64|x64sc)$/, label: 'VICE', platforms: ['c64'] },
  { match: /^(sameboy)$/, label: 'SameBoy', platforms: ['gb', 'gbc'] },
  { match: /^(xemu|xenia|xenia-canary)$/, label: 'xemu / Xenia', platforms: [] },
  { match: /^(rpcs3)$/, label: 'RPCS3', platforms: [] },
  { match: /^(bizhawk)$/, label: 'BizHawk', platforms: ['nes', 'snes', 'gba', 'n64', 'genesis', 'ps1'] }
];

const EMU_SEARCH_DIRS = [
  'C:/Emuladores', 'C:/Emulacao', 'C:/Emulation', 'C:/Emulators',
  'D:/Emuladores', 'D:/Emulacao', 'D:/Emulation', 'D:/Emulators',
  'E:/Emuladores', 'E:/Emulacao', 'E:/Emulation',
  'C:/RetroArch', 'C:/RetroArch-Win64', 'D:/RetroArch',
  'C:/Program Files/RetroArch', 'C:/Program Files (x86)/RetroArch',
  'C:/Program Files/Dolphin', 'C:/Program Files/PCSX2', 'C:/Program Files/mGBA',
  'C:/Program Files/DuckStation', 'C:/Program Files/melonDS',
  'C:/Users/Public/Documents/Emuladores'
];

/**
 * Procura emuladores instalados nas pastas comuns (e nas pastas do usuário).
 * @returns {{found: Array<{exe,label,platforms,kind}>, scanned: string[]}}
 */
function detectEmulators(extraDirs) {
  const userHome = (() => { try { return os.homedir().replace(/\\/g, '/'); } catch { return ''; } })();
  const dirs = [
    ...(extraDirs || []),
    ...EMU_SEARCH_DIRS,
    userHome ? `${userHome}/Emuladores` : null,
    userHome ? `${userHome}/Emulation` : null,
    userHome ? `${userHome}/Downloads` : null,
    userHome ? `${userHome}/Documents/Emuladores` : null
  ].filter(Boolean);

  const scanned = [];
  const found = [];
  const seen = new Set();

  for (const dir of [...new Set(dirs.map(norm))]) {
    if (!fs.existsSync(dir)) continue;
    scanned.push(dir);
    // pastas de emulador têm poucos níveis; limita em 4 e evita node_modules etc.
    let exes = [];
    try {
      exes = walk(dir, {
        maxDepth: 4,
        skipDirs: ['node_modules', 'saves', 'save', 'states', 'savestates', 'screenshots', 'bios', 'system', 'shaders', 'cheats', 'config', 'Cache', 'cache'],
        match: n => /\.exe$/i.test(n)
      });
    } catch { continue; }
    for (const exe of exes) {
      const base = path.basename(exe, path.extname(exe)).toLowerCase();
      const known = KNOWN_EMULATORS.find(k => k.match.test(base));
      if (!known) continue;
      const key = norm(exe).toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      found.push({
        exe,
        label: known.label,
        platforms: known.platforms,
        kind: known.kind || 'single',
        dir: path.dirname(exe)
      });
    }
  }
  return { found, scanned };
}

/** Pasta de cores do RetroArch, se existir perto do executável. */
function retroarchCores(exePath) {
  const base = path.dirname(exePath);
  for (const candidate of ['cores', 'Cores', '../cores', '../Cores']) {
    const p = path.resolve(base, candidate);
    try {
      if (fs.statSync(p).isDirectory()) {
        const has = fs.readdirSync(p).some(f => /_libretro\.(dll|so)$/i.test(f));
        if (has) return p;
      }
    } catch { /* sem pasta de cores */ }
  }
  return '';
}

/* ------------------------------------------------------------------ */
/* Cancelamento de buscas em lote                                      */
/* ------------------------------------------------------------------ */

const batchState = { meta: false, genres: false, covers: false };
function cancelBatches(which) {
  if (!which) { batchState.meta = true; batchState.genres = true; batchState.covers = true; return batchState; }
  if (batchState[which] !== undefined) batchState[which] = true;
  return batchState;
}
function resetBatch(which) { if (batchState[which] !== undefined) batchState[which] = false; }
function batchCancelled(which) { return !!batchState[which]; }

/* ------------------------------------------------------------------ */
/* IPC                                                                 */
/* ------------------------------------------------------------------ */

/**
 * Inicia o processo e só resolve depois que o Windows confirmou que ele subiu.
 * Antes o IPC respondia "ok" na hora e o erro (ex.: jogo que exige administrador)
 * chegava depois, em silêncio.
 */
function iniciarProcesso(plan) {
  const { spawn } = require('child_process');
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(plan.target, plan.args || [], { cwd: plan.cwd, detached: false, stdio: 'ignore', windowsHide: false });
    } catch (e) { return reject(traduzErroSpawn(e, plan)); }
    child.on('error', () => { /* depois de subir, erro não pode derrubar o app */ });
    child.once('spawn', () => resolve(child));
    child.once('error', e => reject(traduzErroSpawn(e, plan)));
  });
}

function traduzErroSpawn(e, plan) {
  const code = e && e.code;
  const nome = path.basename(plan.target || '');
  if (code === 'EACCES' || code === 'EPERM' || (e && e.errno === 740) || /elevation|740/i.test(String(e && e.message))) {
    const err = new Error(`O Windows negou acesso a ${nome} — normalmente é porque o jogo exige administrador.`);
    err.precisaAdmin = true;
    return err;
  }
  if (code === 'ENOENT') return new Error(`Arquivo não encontrado: ${plan.target}`);
  if (code === 'UNKNOWN' || code === 'EFTYPE') return new Error(`O Windows não conseguiu executar ${nome} (arquivo bloqueado, corrompido ou de outra arquitetura).`);
  return new Error(`Não consegui abrir ${nome}: ${(e && e.message) || e}`);
}

function register(ipcMain, deps) {
  const { shell, dialog, BrowserWindow, app } = deps;
  let win = null;
  if (BrowserWindow) {
    const windows = BrowserWindow.getAllWindows();
    if (windows.length) win = windows[0];
    else app.once('browser-window-created', (_e, w) => { win = w; });
  }
  const store = deps.store;
  const ok = data => ({ ok: true, data });
  const fail = err => ({ ok: false, error: String(err && err.message || err) });

  /** Manda um aviso para todas as janelas abertas. */
  const enviar = (canal, dados) => {
    const ws = BrowserWindow && BrowserWindow.getAllWindows ? BrowserWindow.getAllWindows() : [];
    for (const w of ws) {
      try { if (!w.isDestroyed()) w.webContents.send(canal, dados); } catch { /* janela fechando */ }
    }
  };

  /* ---------------- conquistas ---------------- */
  /**
   * Avalia as conquistas de um perfil e guarda as novas. Na primeira vez de um
   * perfil (ou ao atualizar o app), desbloqueia em silêncio o que ele já tinha
   * feito antes — senão viriam 15 avisos de uma vez.
   */
  const checarConquistas = (perfilId, opts) => {
    const o = opts || {};
    const s = store.settings;
    const perfis = perfisDe(s);
    const perfil = perfilId && perfis.some(p => p.id === perfilId) ? perfilId : perfilAtivoDe(s);
    const todas = { ...(s.conquistas || {}) };
    const primeiraVez = !todas[perfil];
    const r = conquistas.avaliar({
      jogos: store.games, perfil, principal: perfis[0].id,
      favoritos: (store.favorites || []).length, guardadas: todas[perfil] || {}
    });
    if (r.novas.length || primeiraVez) {
      todas[perfil] = r.guardadas;
      store.saveSettings({ conquistas: todas });
    }
    if (r.novas.length && !primeiraVez && !o.silencioso) {
      enviar('conquista:nova', { perfil, conquistas: r.novas, pontos: r.pontos });
    }
    return { perfil, ...r, novas: primeiraVez ? [] : r.novas };
  };

  // perfis sem conquistas guardadas: registra o que já tinham feito, em silêncio,
  // logo ao abrir — assim a PRÓXIMA conquista (até a primeira partida) aparece na tela
  const iniciarConquistas = () => {
    const guardadas = store.settings.conquistas || {};
    for (const p of perfisDe(store.settings)) if (!guardadas[p.id]) { try { checarConquistas(p.id, { silencioso: true }); } catch { /* segue */ } }
  };
  const timerConquistas = setTimeout(iniciarConquistas, deps.atrasoConquistas != null ? deps.atrasoConquistas : 1500);
  if (timerConquistas.unref) timerConquistas.unref();

  /* ---------------- Discord (status e convites, sem servidor) ---------------- */
  let cliente = null;
  let estadoDiscord = 'desligado';
  let ipPublico = { ip: null, em: 0 };
  const appIdDiscord = () => String(((store.settings.discord || {}).appId) || DISCORD_APP_ID || '').trim();

  const iniciarDiscord = () => {
    if (cliente) { cliente.removeAllListeners(); cliente.parar(); cliente = null; }
    const d = store.settings.discord || {};
    const id = appIdDiscord();
    if (!d.ligado || !id || deps.semDiscord) { estadoDiscord = !id ? 'sem-id' : 'desligado'; enviar('discord:estado', estadoDiscord); return; }
    // o Discord abre o Arcade Hub do amigo por discord-<id>:// quando ele clica em "Participar"
    try {
      if (app && typeof app.setAsDefaultProtocolClient === 'function') {
        if (process.defaultApp && process.argv.length >= 2) app.setAsDefaultProtocolClient(`discord-${id}`, process.execPath, [path.resolve(process.argv[1])]);
        else app.setAsDefaultProtocolClient(`discord-${id}`);
      }
    } catch { /* sem registro: o status funciona, só o "Participar" não abre o app fechado */ }
    cliente = new discord.ClienteDiscord({ clientId: id, caminhos: deps.caminhosDiscord });
    cliente.on('estado', e => { estadoDiscord = e; enviar('discord:estado', e); if (e === 'conectado') atualizarPresenca(); });
    cliente.on('entrar', segredo => entrarPeloDiscord(segredo));
    cliente.on('pedido', usuario => {
      if (!usuario || !usuario.id) return;
      const nome = usuario.global_name || usuario.username || 'Um amigo';
      if ((store.settings.discord || {}).aceitarPedidos !== false) {
        cliente.aceitarPedido(usuario.id);
        enviar('discord:aviso', { tipo: 'ok', texto: `${nome} está entrando na sua partida pelo Discord` });
      } else {
        cliente.recusarPedido(usuario.id);
        enviar('discord:aviso', { tipo: 'info', texto: `${nome} pediu para entrar (pedidos estão desligados em Ajustes › Discord)` });
      }
    });
    cliente.iniciar();
  };

  /** O status do Discord: o jogo aberto agora (o mais recente), ou nada. */
  const atualizarPresenca = () => {
    if (!cliente) return;
    const d = store.settings.discord || {};
    const abertas = [...sessoesAtivas.entries()].sort((a, b) => b[1].inicio - a[1].inicio);
    if (!abertas.length) {
      if (!d.mostrarNavegando) { cliente.definirAtividade(null); return; }
      cliente.definirAtividade({ details: 'Escolhendo um jogo', state: `${store.games.length} jogos na biblioteca`, assets: { large_image: 'logo', large_text: 'Arcade Hub' }, instance: false });
      return;
    }
    const [id, sess] = abertas[0];
    const g = store.games.find(x => x.id === id) || { title: sess.title };
    const steamId = g.launch && g.launch.type === 'steam' ? String(g.launch.appId) : null;
    const plataforma = g.kind === 'rom' ? (PLATFORM_LABEL[g.platformKey] || g.platform || 'Retrô') : 'PC';
    const atividade = {
      details: String(g.title || 'Jogando').slice(0, 120),
      state: sess.online && sess.online.segredo ? `Online · ${plataforma} · chame no "Participar"` : sess.online && sess.online.convidado ? `Online com um amigo · ${plataforma}` : plataforma,
      timestamps: { start: sess.inicio },
      assets: {
        large_image: steamId ? `https://cdn.cloudflare.steamstatic.com/steam/apps/${steamId}/header.jpg` : 'logo',
        large_text: String(g.title || '').slice(0, 120),
        small_image: 'logo',
        small_text: 'Arcade Hub'
      },
      instance: false
    };
    if (d.convites !== false) {
      const segredo = sess.online && sess.online.segredo
        ? sess.online.segredo
        : steamId ? discord.criarSegredo({ tipo: 'steam', appId: steamId })
          : discord.criarSegredo({ tipo: 'titulo', plataforma: g.kind === 'rom' ? g.platformKey : '', titulo: g.title });
      const partida = crypto.createHash('sha1').update(String(id) + sess.inicio).digest('hex').slice(0, 32);
      atividade.party = { id: partida, size: [1, sess.online && sess.online.segredo ? 2 : 4] };
      atividade.secrets = { join: segredo };
    }
    cliente.definirAtividade(atividade);
  };

  /** Hospedando online: monta o convite com os endereços deste PC (rede de casa, VPN e internet). */
  const prepararConvite = async (game, plan) => {
    const sess = sessoesAtivas.get(game.id);
    if (!sess) return;
    const locais = discord.enderecosLocais();
    const enderecos = [...locais.filter(x => x.tipo === 'vpn'), ...locais.filter(x => x.tipo === 'lan')].map(x => x.ip);
    // endereço público: um serviço de "qual é meu IP" (não é servidor do Arcade Hub)
    try {
      if (!ipPublico.ip || Date.now() - ipPublico.em > 600000) {
        const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 4000);
        const r = await fetch('https://api.ipify.org', { signal: ctrl.signal }).finally(() => clearTimeout(t));
        const ip = (await r.text()).trim();
        if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) ipPublico = { ip, em: Date.now() };
      }
    } catch { /* sem internet para descobrir: fica só VPN/rede de casa */ }
    if (ipPublico.ip) enderecos.push(ipPublico.ip);
    const atual = sessoesAtivas.get(game.id);
    if (!atual || !enderecos.length) return;
    atual.online = {
      segredo: discord.criarSegredo({ tipo: 'netplay', crc: chaveDaRom(game.launch.rom), enderecos: [...new Set(enderecos)], porta: plan.porta, core: plan.core, plataforma: game.platformKey }),
      porta: plan.porta
    };
    atualizarPresenca();
  };

  /** Um amigo clicou em "Participar" no Discord e o convite chegou aqui. */
  const entrarPeloDiscord = async segredo => {
    const c = discord.lerSegredo(segredo);
    const avisar = (texto, tipo) => enviar('discord:aviso', { texto, tipo: tipo || 'info' });
    if (!c) return avisar('O convite do Discord veio num formato que esta versão não entende. Atualize o Arcade Hub.', 'erro');
    const norm = t => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
    if (c.tipo === 'steam') {
      const g = store.games.find(x => x.launch && x.launch.type === 'steam' && String(x.launch.appId) === c.appId);
      if (g) { avisar(`Abrindo ${g.title} para jogar com seu amigo`, 'ok'); return lancar(g.id); }
      await shell.openExternal(`steam://run/${c.appId}`);
      return avisar('Abrindo o jogo pela Steam (se você não tiver, a Steam mostra a página dele)');
    }
    if (c.tipo === 'titulo') {
      const alvo = norm(c.titulo);
      const g = store.games.find(x => norm(x.title) === alvo && (!c.plataforma || x.kind !== 'rom' || x.platformKey === c.plataforma));
      if (!g) return avisar(`Seu amigo está jogando ${c.titulo}, mas esse jogo não está na sua biblioteca`, 'erro');
      avisar(`Abrindo ${g.title} para jogar com seu amigo`, 'ok');
      return lancar(g.id);
    }
    // netplay: a mesma ROM (pelo CRC) e conecta no endereço certo
    const candidatas = store.games.filter(x => x.kind === 'rom' && x.launch && x.launch.rom && (!c.plataforma || x.platformKey === c.plataforma));
    const g = candidatas.find(x => chaveDaRom(x.launch.rom) === c.crc);
    if (!g) return avisar('Para entrar, você precisa da mesma ROM que seu amigo (a sua é diferente ou não está na biblioteca)', 'erro');
    const endereco = discord.escolherEndereco(c.enderecos, discord.enderecosLocais());
    if (!endereco) return avisar('O convite veio sem endereço para conectar', 'erro');
    avisar(`Entrando no ${g.title} do seu amigo…`, 'ok');
    const r = await lancar(g.id, { conectar: { endereco, porta: c.porta, core: c.core } });
    if (!r.ok) avisar(r.error || 'Não consegui entrar na partida', 'erro');
    return r;
  };
  setTimeout(iniciarDiscord, deps.atrasoDiscord != null ? deps.atrasoDiscord : 1200).unref?.();

  /* ---------------- sessões de jogo (tempo de jogo) ---------------- */
  const sessoesAtivas = new Map();          // gameId -> { title, inicio, origem }
  const pastasProibidas = () => [...(store.settings.folders || []), ...(store.settings.romFolders || [])];

  const marcarInicio = (game, origem, inicio) => {
    if (sessoesAtivas.has(game.id)) return;
    sessoesAtivas.set(game.id, { title: game.title, inicio: inicio || Date.now(), origem, perfil: perfilAtivoDe(store.settings) });
    eventos.emit('sessao:inicio', { id: game.id, title: game.title });
    enviar('game:sessionStart', { id: game.id, title: game.title, origem });
    atualizarPresenca();
  };
  const encerrar = (game, ms, info) => {
    const sess = sessoesAtivas.get(game.id);
    const tinha = sessoesAtivas.delete(game.id);
    const res = registrarSessao(store, game.id, ms, sess && sess.perfil);
    if (res) setTimeout(() => checarConquistas(res.perfil), 50);
    atualizarPresenca();
    const atual = store.games.find(g => g.id === game.id);
    if (tinha) eventos.emit('sessao:fim', { id: game.id, title: game.title, session: res, ativas: sessoesAtivas.size });
    enviar('game:sessionEnd', {
      id: game.id, title: game.title, session: res,
      playtime: atual ? atual.playtime : null,
      nuncaAbriu: !!(info && info.nuncaAbriu)
    });
  };
  const vigia = deps.vigia || new VigiaDeSessoes({
    onInicio: game => marcarInicio(game, 'pasta'),
    onFim: (game, ms, info) => encerrar(game, ms, info)
  });
  /** Começa a vigiar a pasta do jogo (lojas, atalhos, launchers que fecham logo). */
  const vigiarPasta = (game, opts) => (game.kind === 'rom'
    ? false
    : vigia.vigiar(game, { proibidas: pastasProibidas(), ...(opts || {}) }));

  /** Ao fechar o app: grava o tempo das sessões que ainda estão abertas. */
  const fecharSessoes = () => {
    for (const [id, sess] of [...sessoesAtivas]) {
      const it = vigia.itens && vigia.itens.get(id);
      const fim = it && it.ultimo ? it.ultimo : Date.now();
      sessoesAtivas.delete(id);
      vigia.parar(id);
      registrarSessao(store, id, fim - sess.inicio, sess.perfil);
    }
  };

  /* ---------------- varredura automática ---------------- */
  let vigiasDePastas = [];
  let esperaVarredura = null;
  let varrendoSozinho = false;

  const varrerEmSegundoPlano = async motivo => {
    if (store.settings.autoScan === false || varrendoSozinho) return null;
    varrendoSozinho = true;
    try {
      const antes = new Set(store.games.map(g => g.id));
      await runScanAsync(store, { keepMissing: true });
      const depois = store.games;
      const novos = depois.filter(g => !antes.has(g.id)).map(g => g.title);
      const removidos = [...antes].filter(id => !depois.some(g => g.id === id)).length;
      enviar('library:changed', { motivo, novos, removidos, state: state() });
      return { novos, removidos };
    } catch (e) {
      console.warn('[arcade-hub] varredura automática falhou:', e && e.message);
      return null;
    } finally {
      varrendoSozinho = false;
    }
  };

  const agendarVarredura = () => {
    clearTimeout(esperaVarredura);
    // espera as cópias/instalações assentarem: cada mudança nova adia 20s
    esperaVarredura = setTimeout(() => varrerEmSegundoPlano('pastas'), deps.esperaVarreduraMs || 20000);
    if (esperaVarredura.unref) esperaVarredura.unref();
  };

  /** Liga um fs.watch em cada pasta que pode ganhar jogos novos. */
  const religarVigiasDePastas = () => {
    for (const w of vigiasDePastas) { try { w.close(); } catch { /* já fechado */ } }
    vigiasDePastas = [];
    const st = store.settings;
    if (st.autoScan === false) return;
    const alvos = [];
    // jogo novo numa pasta de jogos = pasta nova na raiz (não precisa olhar dentro)
    for (const f of st.folders || []) alvos.push({ dir: f, recursive: false });
    for (const f of st.romFolders || []) alvos.push({ dir: f, recursive: true });
    if (st.includeStoreLaunchers !== false && process.platform === 'win32') {
      try {
        for (const root of steamRoots()) {
          for (const lib of steamLibraries(root)) {
            alvos.push({ dir: path.join(lib, 'steamapps'), recursive: false, filtro: n => /^appmanifest_\d+\.acf$/i.test(n) });
          }
        }
      } catch { /* sem Steam */ }
      for (const d of ['C:/ProgramData/Epic/EpicGamesLauncher/Data/Manifests']) {
        alvos.push({ dir: d, recursive: false, filtro: n => /\.item$/i.test(n) });
      }
    }
    const vistos = new Set();
    for (const a of alvos) {
      const chave = norm(a.dir).toLowerCase();
      if (vistos.has(chave) || !fs.existsSync(a.dir)) continue;
      vistos.add(chave);
      try {
        const w = fs.watch(a.dir, { recursive: a.recursive, persistent: false }, (_ev, nome) => {
          if (a.filtro && nome && !a.filtro(String(nome))) return;
          agendarVarredura();
        });
        w.on('error', () => { /* pasta removida/desconectada */ });
        vigiasDePastas.push(w);
      } catch { /* sem suporte a watch nessa pasta */ }
    }
  };

  const state = () => {
    const d = store.load();
    const settings = { ...d.settings };
    settings.emulators = { ...settings.emulators };
    const ss = settings.screenscraper || {};
    settings.screenscraper = { usuario: ss.usuario || '', devid: ss.devid || '', temSenha: !!ss.senha, temDevSenha: !!ss.devsenha };
    return {
      games: d.games,
      favorites: d.favorites,
      hidden: d.hidden,
      settings,
      lastScan: d.lastScan,
      lastScanReport: d.lastScanReport || null,
      launchers: launchersCacheados(),
      sessoes: [...sessoesAtivas].map(([id, x]) => ({ id, ...x })),
      versions: { app: app.getVersion(), electron: process.versions.electron, os: `${os.platform()} ${os.release()}` },
      dataDir: store.dir,
      avisoBiblioteca: store.recuperado || null,
      discordEstado: estadoDiscord,
      perfis: perfisDe(store.settings),
      perfilAtivo: perfilAtivoDe(store.settings),
      modoConsole: {
        iniciarComWindows: consoleMod.estadoInicio(app),
        abertoPeloWindows: process.argv.includes(consoleMod.ARG_CONSOLE),
        energiaDisponivel: process.platform === 'win32' || process.platform === 'linux'
      }
    };
  };

  let videoPort = 0;          // porta do servidor local de vídeos (subido sob demanda)

  ipcMain.handle('state:get', () => ok(state()));

  ipcMain.handle('scan:run', async () => {
    try {
      const games = await runScanAsync(store, { keepMissing: true });
      return ok({ games, lastScan: store.load().lastScan, state: state() });
    } catch (e) { return fail(e); }
  });

  ipcMain.handle('settings:save', (_e, patch) => {
    try {
      if (patch && patch.screenscraper) {
        const atual = store.settings.screenscraper || {};
        const novo = patch.screenscraper;
        patch = {
          ...patch,
          screenscraper: {
            usuario: novo.usuario != null ? String(novo.usuario).trim() : (atual.usuario || ''),
            devid: novo.devid != null ? String(novo.devid).trim() : (atual.devid || ''),
            // senha vazia = mantém a guardada; "-" = apaga
            senha: novo.senha === '-' ? '' : novo.senha ? cifrar(novo.senha) : (atual.senha || ''),
            devsenha: novo.devsenha === '-' ? '' : novo.devsenha ? cifrar(novo.devsenha) : (atual.devsenha || '')
          }
        };
      }
      if (patch && 'youtubeKey' in patch) patch = { ...patch, youtubeKey: String(patch.youtubeKey || '').trim() };
      store.saveSettings(patch || {});
      // mudou emulador/pasta? recalcula quais jogos estão quebrados
      if (patch && (patch.emulators || patch.retroarch || patch.folders || patch.romFolders)) {
        refreshProblems(store);
      }
      if (patch && ('folders' in patch || 'romFolders' in patch || 'autoScan' in patch || 'includeStoreLaunchers' in patch)) {
        religarVigiasDePastas();
      }
      return ok(state());
    } catch (e) { return fail(e); }
  });

  ipcMain.handle('dialog:pickFolders', async () => {
    const r = await dialog.showOpenDialog({ properties: ['openDirectory', 'multiSelections'], title: 'Escolha as pastas' });
    return ok(r.canceled ? [] : r.filePaths);
  });

  ipcMain.handle('dialog:pickFile', async (_e, opts) => {
    opts = opts || {};
    const r = await dialog.showOpenDialog({
      properties: ['openFile'],
      title: opts.title || 'Escolha um arquivo',
      filters: opts.filters || []
    });
    return ok(r.canceled ? [] : r.filePaths);
  });

  ipcMain.handle('game:add', (_e, payload) => {
    try {
      const g = payload || {};
      const launch = sanitizeLaunch(g.launch);
      if (!launch) throw new Error('forma de abrir inválida (link não permitido ou tipo desconhecido)');
      // compatibilidade: "launchArgs" nunca era usado; agora vira os argumentos do .exe
      if (g.launchArgs && !launch.args) launch.args = String(g.launchArgs);
      const id = g.id || idFor(launch.exe || launch.rom || g.title || String(Date.now()));
      const game = {
        id,
        title: g.title || 'Jogo sem nome',
        source: g.source || 'manual',
        platform: g.platform || 'PC',
        platformKey: g.platformKey,
        kind: g.kind || 'game',
        launch,
        installDir: g.installDir || '',
        art: g.art || g.customArt || null,
        customArt: g.customArt || null,
        addedAt: Date.now()
      };
      // se já existe o MESMO jogo, atualiza em vez de duplicar (não funde jogos diferentes)
      const probe = dedupeGames([...store.games, game]);
      const existing = probe.length === store.games.length
        ? store.games.find(g => g.id !== game.id && installKey(g) === installKey(game))
        : null;
      if (existing) {
        const updated = store.updateGame(existing.id, {
          ...game,
          id: existing.id,
          addedAt: existing.addedAt,
          alsoOn: [...new Set([...(existing.alsoOn || []), existing.source])]
        });
        return ok(updated);
      }
      return ok(store.addGame(game));
    } catch (e) { return fail(e); }
  });

  ipcMain.handle('game:update', (_e, { id, patch }) => {
    try {
      if (!id) throw new Error('id ausente');
      const clean = { ...(patch || {}) };
      if (clean.title) { clean.customTitle = clean.title; }
      // caminho/argumentos editados à mão não são desfeitos pela próxima varredura
      if (clean.launch) {
        clean.launch = sanitizeLaunch(clean.launch);
        if (!clean.launch) throw new Error('forma de abrir inválida (link não permitido ou tipo desconhecido)');
        clean.launchEdited = true;
      }
      const atualizado = store.updateGame(id, clean);
      if (clean.launch) refreshProblems(store);        // caminho corrigido: o aviso some na hora
      return ok(store.games.find(g => g.id === id) || atualizado);
    } catch (e) { return fail(e); }
  });

  ipcMain.handle('game:remove', (_e, id) => {
    try { return ok(store.removeGame(id)); } catch (e) { return fail(e); }
  });

  /** Jogos que não estão mais no PC (arquivo sumido ou desinstalado da loja). */
  const sumidos = () => {
    refreshProblems(store);
    const discoPresente = p => { try { return fs.existsSync(path.parse(path.resolve(p)).root); } catch { return true; } };
    return store.games.filter(g => {
      const lt = g.launch && g.launch.type;
      const arq = lt === 'rom' ? g.launch.rom : lt === 'exe' ? g.launch.exe : null;
      if (arq && !discoPresente(arq)) return false;                 // HD externo desligado
      if (arq) return !fs.existsSync(arq);
      if (g.installed === false) return true;
      return ['steam', 'epic', 'gog'].includes(g.source) && g.installDir && discoPresente(g.installDir) && !fs.existsSync(g.installDir);
    });
  };
  ipcMain.handle('library:sumidos', () => {
    try { return ok(sumidos().map(g => ({ id: g.id, title: g.title }))); } catch (e) { return fail(e); }
  });
  ipcMain.handle('library:limparSumidos', () => {
    try {
      const lista = sumidos();
      const d = store.load();
      const arquivados = { ...(d.arquivados || {}) };
      for (const g of lista) arquivados[g.id] = { ...g, arquivadoEm: Date.now() };
      const fora = new Set(lista.map(g => g.id));
      d.arquivados = arquivados;
      d.games = d.games.filter(g => !fora.has(g.id));
      store.save();
      return ok({ removidos: lista.map(g => g.title), state: state() });
    } catch (e) { return fail(e); }
  });

  ipcMain.handle('game:favorite', (_e, id) => {
    try {
      const r = store.toggleFavorite(id);
      setTimeout(() => checarConquistas(), 50);       // "Os escolhidos" (10 favoritos)
      return ok(r);
    } catch (e) { return fail(e); }
  });

  /* ---------------- perfis e conquistas ---------------- */
  ipcMain.handle('discord:salvar', (_e, patch) => {
    try {
      const atual = { ...DEFAULT_SETTINGS.discord, ...(store.settings.discord || {}) };
      const p = patch || {};
      const novo = { ...atual };
      if ('appId' in p) { const id = String(p.appId || '').trim(); if (id && !/^\d{15,22}$/.test(id)) throw new Error('o ID do aplicativo do Discord tem só números (17 a 20 dígitos)'); novo.appId = id; }
      for (const k of ['ligado', 'mostrarNavegando', 'convites', 'aceitarPedidos']) if (k in p) novo[k] = !!p[k];
      if ('portaNetplay' in p) { const n = Number(p.portaNetplay); if (!(n >= 1024 && n <= 65535)) throw new Error('porta entre 1024 e 65535'); novo.portaNetplay = n; }
      store.saveSettings({ discord: novo });
      iniciarDiscord();
      return ok({ discord: novo, estado: estadoDiscord });
    } catch (e) { return fail(e); }
  });
  ipcMain.handle('discord:estado', () => ok({ estado: estadoDiscord, appIdPadrao: !!DISCORD_APP_ID }));

  ipcMain.handle('perfis:salvar', (_e, lista) => {
    try {
      const perfis = limparPerfis(lista);
      const ids = new Set(perfis.map(p => p.id));
      const todas = { ...(store.settings.conquistas || {}) };
      for (const k of Object.keys(todas)) if (!ids.has(k)) delete todas[k];
      const ativo = ids.has(store.settings.perfilAtivo) ? store.settings.perfilAtivo : perfis[0].id;
      store.saveSettings({ perfis, conquistas: todas, perfilAtivo: ativo });
      iniciarConquistas();
      return ok({ perfis, perfilAtivo: ativo });
    } catch (e) { return fail(e); }
  });
  ipcMain.handle('perfis:ativar', (_e, id) => {
    try {
      if (!perfisDe(store.settings).some(p => p.id === id)) throw new Error('perfil não existe');
      store.saveSettings({ perfilAtivo: id });
      checarConquistas(id, { silencioso: true });
      return ok(id);
    } catch (e) { return fail(e); }
  });
  ipcMain.handle('conquistas:listar', (_e, perfilId) => {
    try {
      const r = checarConquistas(perfilId);
      return ok({ perfil: r.perfil, lista: r.lista, pontos: r.pontos, total: r.total });
    } catch (e) { return fail(e); }
  });

  /* ---------------- Modo Console ---------------- */
  const ENERGIA = new Set(['desligar', 'reiniciar', 'suspender']);
  ipcMain.handle('console:energia', async (_e, acao) => {
    if (!ENERGIA.has(acao)) return fail('ação inválida');
    // antes de desligar: grava o tempo das sessões abertas e a biblioteca
    if (acao !== 'suspender') { try { fecharSessoes(); store.flush(); } catch { /* segue */ } }
    const r = await consoleMod.energia(acao);
    return r.ok ? ok(true) : fail(r.erro);
  });
  ipcMain.handle('console:iniciarComWindows', (_e, ligar) => {
    const r = consoleMod.iniciarComWindows(app, !!ligar);
    return r.ok ? ok(r.ligado) : fail(r.erro);
  });
  let instaladosCache = null;
  ipcMain.handle('console:emuladores', (_e, opts) => {
    try {
      instaladosCache = consoleMod.acharInstalados();
      const lista = consoleMod.statusEmuladores(store.settings, store.games, PLATFORM_LABEL, { instalados: instaladosCache, todos: !!(opts && opts.todos) });
      return ok({ lista, instalados: instaladosCache });
    } catch (e) { return fail(e); }
  });
  ipcMain.handle('console:usarEmulador', (_e, platformKey, emuladorId) => {
    try {
      // só caminhos que o próprio app achou (a interface não manda caminho)
      const exe = (instaladosCache || consoleMod.acharInstalados())[emuladorId];
      if (!exe || !PLATFORM_LABEL[platformKey]) throw new Error('emulador não encontrado');
      if (emuladorId === 'retroarch') {
        const cores = path.join(path.dirname(exe), 'cores');
        store.saveSettings({ retroarch: { ...(store.settings.retroarch || {}), exe, cores: fs.existsSync(cores) ? cores : (store.settings.retroarch || {}).cores || '' } });
      } else {
        const emus = { ...store.settings.emulators };
        emus[platformKey] = { ...(emus[platformKey] || {}), exe };
        store.saveSettings({ emulators: emus });
      }
      return ok(exe);
    } catch (e) { return fail(e); }
  });
  ipcMain.handle('console:abrirSite', async (_e, emuladorId) => {
    const e = consoleMod.EMULADORES[emuladorId];
    if (!e) return fail('emulador desconhecido');
    await shell.openExternal(e.site);
    return ok(true);
  });

  ipcMain.handle('game:hide', (_e, id) => {
    try { return ok(store.toggleHidden(id)); } catch (e) { return fail(e); }
  });

  ipcMain.handle('game:launch', (_e, id, opts) => lancar(id, opts));

  /**
   * Abre um jogo. `opts.online` = hospeda partida online (ROM pelo RetroArch);
   * `opts.conectar` = entra na partida de um amigo ({ endereco, porta, core }).
   */
  async function lancar(id, opts) {
    const o = opts || {};
    try {
      const game = store.games.find(g => g.id === id);
      if (!game) throw new Error('Jogo não encontrado');
      const dsc = store.settings.discord || {};
      const nick = (perfisDe(store.settings).find(p => p.id === perfilAtivoDe(store.settings)) || {}).nome;
      const plan = o.online ? planoNetplay(game, store.settings, { hospedar: true, porta: dsc.portaNetplay, nick })
        : o.conectar ? planoNetplay(game, store.settings, { conectar: o.conectar.endereco, porta: o.conectar.porta, core: o.conectar.core, nick })
          : buildLaunchPlan(game, store.settings);
      if (plan.kind === 'broken') {
        return { ok: false, error: plan.reason || 'Este jogo está incompleto' };
      }
      if (plan.kind === 'needs-emulator') {
        return { ok: false, needsEmulator: true, platform: plan.platform, hint: plan.hint, error: `Configure o emulador de ${plan.hint} em Ajustes` };
      }
      if (sessoesAtivas.has(id)) {
        return { ok: false, error: `${game.title} já está aberto` };
      }
      let session = null;
      if (plan.kind === 'url') {
        await shell.openExternal(plan.target);
        // Steam/Epic/GOG: o tempo é medido vigiando os programas abertos dentro da pasta do jogo
        const vigiando = vigiarPasta(game);
        store.updateGame(id, { playedAt: Date.now() });
        return ok({ plan, timed: vigiando ? 'pasta' : false });
      } else if (plan.kind === 'exe') {
        if (!plan.target || !fs.existsSync(plan.target)) {
          throw new Error(`Arquivo não encontrado: ${plan.target}`);
        }
        // .bat/.cmd/.lnk/.url não são executáveis "de verdade": o spawn falharia.
        // O Windows abre pelo programa associado (sem medir tempo de jogo).
        if (!/\.exe$/i.test(plan.target)) {
          const erro = await shell.openPath(plan.target);
          if (erro) throw new Error(erro);
          const vigiando = vigiarPasta(game);
          store.updateGame(id, { playedAt: Date.now() });
          return ok({ plan, timed: vigiando ? 'pasta' : false });
        }
        let child;
        try {
          child = await iniciarProcesso(plan);
        } catch (err) {
          // jogo que exige administrador: o Windows abre pelo shell e mostra o pedido do UAC
          // (só dá sem argumentos, e aí o tempo de jogo não é medido)
          if (err.precisaAdmin && !(plan.args || []).length) {
            const erro = await shell.openPath(plan.target);
            if (erro) throw err;
            vigiarPasta(game);
            store.updateGame(id, { playedAt: Date.now() });
            return ok({ plan, timed: false, elevated: true });
          }
          throw err;
        }
        const inicio = Date.now();
        session = { startedAt: inicio };
        marcarInicio(game, 'processo', inicio);
        if (o.online) prepararConvite(game, plan);
        else if (o.conectar) { const sx = sessoesAtivas.get(game.id); if (sx) sx.online = { convidado: true }; atualizarPresenca(); }
        child.on('exit', () => {
          const ms = Date.now() - inicio;
          // fechou rápido: era um launcher que abriu o jogo de verdade e saiu.
          // Passa a vigiar a pasta do jogo, contando desde o clique em Jogar.
          if (ms < MIN_SESSAO_MS && vigiarPasta(game, { inicio, espera: 60000, primeiraChecagem: 2000 })) return;
          encerrar(game, ms);
        });
        child.unref();
      } else {
        throw new Error('Não sei como abrir este jogo');
      }
      store.updateGame(id, { playedAt: Date.now() });
      return ok({ plan, timed: !!session, startedAt: session ? session.startedAt : null });
    } catch (e) { return fail(e); }
  }

  /* ---------------- tempo de jogo ---------------- */

  ipcMain.handle('playtime:tick', (_e, { id, seconds }) => {
    try {
      const game = store.games.find(g => g.id === id);
      if (!game) throw new Error('jogo não encontrado');
      const add = Math.max(0, Math.min(Number(seconds) || 0, 4 * 3600)) * 1000;
      const total = ((game.playtime && game.playtime.totalMs) || 0) + add;
      store.updateGame(id, { playtime: { ...(game.playtime || {}), totalMs: total, sessions: (game.playtime && game.playtime.sessions) || 0, lastAt: Date.now() }, playedAt: Date.now() });
      return ok({ totalMs: total });
    } catch (e) { return fail(e); }
  });

  ipcMain.handle('playtime:reset', (_e, id) => {
    try {
      store.updateGame(id, { playtime: { totalMs: 0, sessions: 0, history: [] } });
      return ok(state());
    } catch (e) { return fail(e); }
  });

  /* ---------------- backup ---------------- */

  ipcMain.handle('library:export', async () => {
    try {
      const r = await dialog.showSaveDialog({
        title: 'Exportar biblioteca',
        defaultPath: `arcade-hub-backup-${new Date().toISOString().slice(0, 10)}.zip`,
        filters: [
          { name: 'Backup com capas (.zip)', extensions: ['zip'] },
          { name: 'Só a biblioteca, sem capas (.json)', extensions: ['json'] }
        ]
      });
      if (r.canceled || !r.filePath) return ok({ canceled: true });
      const info = exportLibrary(store, r.filePath);
      return ok(info);
    } catch (e) { return fail(e); }
  });

  ipcMain.handle('library:import', async (_e, { mode }) => {
    try {
      const r = await dialog.showOpenDialog({
        title: 'Importar biblioteca',
        properties: ['openFile'],
        filters: [{ name: 'Backup do Arcade Hub', extensions: ['zip', 'json'] }]
      });
      if (r.canceled || !r.filePaths[0]) return ok({ canceled: true });
      const modo = mode === 'replace' ? 'replace' : 'merge';
      const backup = lerBackup(r.filePaths[0]);
      // um backup pode apontar para QUALQUER programa: mostra o que ele vai abrir
      const programas = programasDoBackup(backup, modo);
      if (programas.length) {
        const mostra = programas.slice(0, 12).join('\n') + (programas.length > 12 ? `\n… e mais ${programas.length - 12}` : '');
        const resp = await dialog.showMessageBox({
          type: 'warning',
          title: 'Importar biblioteca',
          message: `Este backup tem ${programas.length} programa(s)/link(s) que o Arcade Hub vai abrir quando você clicar em Jogar.`,
          detail: 'Só importe se o backup é seu ou de alguém em quem você confia.\n\n' + mostra,
          buttons: ['Importar', 'Cancelar'],
          defaultId: 1,
          cancelId: 1,
          noLink: true
        });
        if (resp.response !== 0) return ok({ canceled: true });
      }
      const info = importLibrary(store, r.filePaths[0], modo, backup);
      return ok({ ...info, state: state() });
    } catch (e) { return fail(e); }
  });

  /* ---------------- diagnóstico ---------------- */

  ipcMain.handle('diag:get', () => {
    try {
      const d = store.load();
      const checks = [];

      // pastas configuradas
      for (const f of d.settings.folders || []) {
        checks.push({ type: 'folder', ok: fs.existsSync(f), label: 'Pasta de jogos', detail: f });
      }
      for (const f of d.settings.romFolders || []) {
        checks.push({ type: 'romfolder', ok: fs.existsSync(f), label: 'Pasta de ROMs', detail: f });
      }

      // emuladores configurados
      for (const [key, emu] of Object.entries(d.settings.emulators || {})) {
        if (!emu.exe) continue;
        checks.push({ type: 'emulator', ok: fs.existsSync(emu.exe), label: `Emulador ${emu.label || key}`, detail: emu.exe });
      }
      if (d.settings.retroarch && d.settings.retroarch.exe) {
        checks.push({ type: 'emulator', ok: fs.existsSync(d.settings.retroarch.exe), label: 'RetroArch', detail: d.settings.retroarch.exe });
      }

      // jogos que apontam para arquivos inexistentes
      const missing = d.games.filter(g => g.launch && g.launch.type === 'exe' && g.launch.exe && !fs.existsSync(g.launch.exe));
      const missingRoms = d.games.filter(g => g.launch && g.launch.type === 'rom' && g.launch.rom && !fs.existsSync(g.launch.rom));

      // ROMs sem emulador
      const noEmu = d.games.filter(g => g.kind === 'rom' && g.platformKey
        && !((d.settings.emulators || {})[g.platformKey] || {}).exe
        && !(d.settings.retroarch && d.settings.retroarch.exe));

      return ok({
        checks,
        counts: {
          games: d.games.length,
          installed: d.games.filter(g => g.installed !== false).length,
          withScore: d.games.filter(g => g.meta && g.meta.score != null).length,
          withArt: d.games.filter(g => !!g.art).length,
          withGenres: d.games.filter(g => Array.isArray(g.genres) && g.genres.length).length,
          roms: d.games.filter(g => g.kind === 'rom').length
        },
        missing: missing.map(g => ({ id: g.id, title: g.title, path: g.launch.exe })),
        missingRoms: missingRoms.map(g => ({ id: g.id, title: g.title, path: g.launch.rom })),
        noEmulator: [...new Set(noEmu.map(g => g.platformKey))],
        lastScanReport: d.lastScanReport || null,
      launchers: launchersCacheados(),
        dataDir: store.dir,
        versions: { app: app.getVersion(), electron: process.versions.electron, node: process.versions.node, os: `${os.platform()} ${os.release()}` }
      });
    } catch (e) { return fail(e); }
  });

  /* ---------------- capas ---------------- */

  /* ---------------- cancelar buscas em lote ---------------- */

  ipcMain.handle('batch:cancel', (_e, which) => {
    cancelBatches(which || null);
    return ok({ cancelled: which || 'todas' });
  });

  /* ---------------- detecção de emuladores e lojas ---------------- */

  ipcMain.handle('detect:emulators', (_e, { extraDirs }) => {
    try {
      const r = detectEmulators(extraDirs);
      // sugere sem aplicar
      const suggestions = r.found.map(f => ({
        ...f,
        cores: f.kind === 'retroarch' ? retroarchCores(f.exe) : '',
        alreadySet: Object.values(store.settings.emulators || {}).some(e => e.exe === f.exe)
          || (store.settings.retroarch || {}).exe === f.exe
      }));
      return ok({ found: suggestions, scanned: r.scanned });
    } catch (e) { return fail(e); }
  });

  ipcMain.handle('detect:apply', (_e, { picks }) => {
    try {
      const emulators = { ...(store.settings.emulators || {}) };
      let retroarch = { ...(store.settings.retroarch || {}) };
      let applied = 0;
      for (const pick of picks || []) {
        if (!pick || !pick.exe) continue;
        if (pick.kind === 'retroarch') {
          retroarch = { exe: pick.exe, cores: pick.cores || retroarch.cores || '' };
          applied++;
          continue;
        }
        let usou = false;
        for (const platform of pick.platforms || []) {
          if (!emulators[platform]) continue;
          emulators[platform] = { ...emulators[platform], exe: pick.exe, args: emulators[platform].args || '"{rom}"' };
          usou = true;
        }
        if (usou) applied++;
      }
      store.saveSettings({ emulators, retroarch });
      refreshProblems(store);
      return ok({ applied, state: state() });
    } catch (e) { return fail(e); }
  });

  ipcMain.handle('detect:launchers', () => {
    try { limparCacheLojas(); return ok({ launchers: launchersCacheados() }); } catch (e) { return fail(e); }
  });

  /* ---------------- gêneros ---------------- */

  ipcMain.handle('genres:list', () => ok(genres.GENRES));

  // classificação em lote: usa a ficha completa (Steam → Metacritic → Wikidata)
  ipcMain.handle('genres:auto', async (e, { ids }) => {
    try {
      const d = store.load();
      const targets = (ids && ids.length ? ids.map(id => d.games.find(g => g.id === id)) : d.games)
        .filter(g => g && !(Array.isArray(g.genres) && g.genres.length));
      const total = targets.length;
      const sender = e.sender;
      const done = [];
      const failed = [];
      resetBatch('genres');
      let cancelled = false;
      for (let i = 0; i < targets.length; i++) {
        if (batchCancelled('genres')) { cancelled = true; break; }
        const game = targets[i];
        try {
          const meta = await metadata.lookup(game);
          let keys = genres.toGenreKeys(meta.genresRaw || []);
          let from = meta.sources.join('+') || 'metadados';
          if (!keys.length) { keys = genres.heuristicGenres(game); from = 'heurística'; }
          if (keys.length) {
            done.push({ id: game.id, title: game.title, genres: keys, source: from });
            store.updateGame(game.id, { genres: keys, genresSource: from, meta });
          } else {
            failed.push({ id: game.id, title: game.title, reason: 'sem gênero identificado' });
          }
        } catch (err) {
          failed.push({ id: game.id, title: game.title, reason: String(err && err.message || err) });
        }
        try { sender.send('genres:progress', { done: i + 1, total, title: game.title }); } catch { /* janela fechada */ }
        await new Promise(r => setTimeout(r, 250));   // gentileza com as APIs
      }
      store.save();
      return ok({ updated: done.length, failed, total, cancelled, state: state() });
    } catch (e) { return fail(e); }
  });

  /* ---------------- ficha do jogo (Metacritic / Wikidata / Steam) ---------------- */

  // busca a nota em segundo plano (para mostrar no canto da capa) — não baixa capas
  ipcMain.handle('meta:prime', async (e, { ids, limit }) => {
    try {
      const d = store.load();
      const pool = (ids && ids.length ? ids.map(id => d.games.find(g => g.id === id)) : d.games)
        .filter(g => g && !(g.meta && g.meta.at));   // só quem ainda não tem ficha
      const targets = pool.slice(0, limit || 80);
      const sender = e.sender;
      const done = [];
      const failed = [];
      const CONCURRENCY = 3;     // no máximo 3 jogos ao mesmo tempo (2 requisições cada)
      let index = 0;
      let finished = 0;

      resetBatch('meta');
      let cancelled = false;

      const worker = async () => {
        for (;;) {
          if (batchCancelled('meta')) { cancelled = true; return; }
          const i = index++;
          if (i >= targets.length) return;
          const game = targets[i];
          try {
            const meta = await metadata.lookup(game);
            const patch = { meta };
            if (!Array.isArray(game.genres) || !game.genres.length) {
              const keys = genres.toGenreKeys(meta.genresRaw || []).length
                ? genres.toGenreKeys(meta.genresRaw || [])
                : genres.heuristicGenres(game);
              if (keys.length) { patch.genres = keys; patch.genresSource = meta.sources.join('+') || 'heurística'; }
            }
            store.updateGame(game.id, patch);
            done.push({ id: game.id, title: game.title, score: meta.score != null ? meta.score : null });
          } catch (err) {
            failed.push({ id: game.id, title: game.title, reason: String(err && err.message || err) });
          }
          finished++;
          try { sender.send('meta:progress', { done: finished, total: targets.length, title: game.title }); } catch { /* janela fechada */ }
          if (finished % 5 === 0) store.save();
        }
      };

      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, targets.length) }, worker));
      store.save();
      return ok({ updated: done.length, failed, total: targets.length, cancelled, state: state() });
    } catch (e) { return fail(e); }
  });

  ipcMain.handle('meta:lookup', async (_e, { id, refresh }) => {
    try {
      const game = store.games.find(g => g.id === id);
      if (!game) throw new Error('jogo não encontrado');
      if (!refresh && game.meta && game.meta.at && Date.now() - game.meta.at < 30 * 24 * 3600 * 1000) {
        return ok({ meta: game.meta, cached: true });
      }
      const meta = await metadata.lookup(game);
      // aplica o que der para aplicar automaticamente
      const patch = { meta };
      if (!Array.isArray(game.genres) || !game.genres.length) {
        let keys = genres.toGenreKeys(meta.genresRaw || []);
        if (!keys.length) keys = genres.heuristicGenres(game);
        if (keys.length) { patch.genres = keys; patch.genresSource = meta.sources.join('+') || 'heurística'; }
      }
      // não sobrescreve capa escolhida pelo usuário
      if (!game.customArt && meta.cover && meta.cover.url) {
        try {
          const art = await covers.applyCover({ url: meta.cover.url, source: 'metacritic' }, store.dir);
          patch.art = art;
          patch.coverSource = 'metacritic';
        } catch { /* capa opcional */ }
      }
      store.updateGame(id, patch);
      store.save();
      return ok({ meta, cached: false, state: state() });
    } catch (e) { return fail(e); }
  });

  // definir/remover gênero na mão (tem prioridade sobre o automático)
  ipcMain.handle('genres:set', (_e, { id, genres: list }) => {
    try {
      const game = store.games.find(g => g.id === id);
      if (!game) throw new Error('jogo não encontrado');
      const clean = [...new Set((list || []).filter(Boolean))];
      store.updateGame(id, { genres: clean, genresSource: clean.length ? 'manual' : null });
      return ok({ game, state: state() });
    } catch (e) { return fail(e); }
  });

  ipcMain.handle('covers:search', async (_e, { id, title }) => {
    try {
      const game = id ? store.games.find(g => g.id === id) : null;
      const name = title || (game && game.title) || '';
      if (!name) throw new Error('nome do jogo ausente');
      const r = await covers.searchCovers(name, store.settings, game || undefined);
      // baixa as miniaturas e devolve como data URI (o CSP da janela não permite
      // <img src="https://..."> e alguns CDNs recusam hotlink)
      await covers.prepararMiniaturas(r.candidates, store.dir);
      return ok(r);
    } catch (e) { return fail(e); }
  });

  ipcMain.handle('covers:apply', async (_e, { id, candidate }) => {
    try {
      const game = store.games.find(g => g.id === id);
      if (!game) throw new Error('jogo não encontrado');
      const art = await covers.applyCover(candidate, store.dir);
      store.updateGame(id, { art, customArt: art, coverSource: candidate.source, coverPickedAt: Date.now() });
      return ok({ art, state: state() });
    } catch (e) { return fail(e); }
  });

  ipcMain.handle('covers:local', async (_e, { id, filePath }) => {
    try {
      const game = store.games.find(g => g.id === id);
      if (!game) throw new Error('jogo não encontrado');
      if (!filePath || !/\.(jpe?g|png|webp|gif|bmp)$/i.test(String(filePath))) throw new Error('escolha uma imagem (jpg, png ou webp)');
      const art = await covers.normalizeLocalImage(filePath, store.dir, 1200, 1800);
      store.updateGame(id, { art, customArt: art, coverSource: 'local', coverPickedAt: Date.now() });
      return ok({ art, state: state() });
    } catch (e) { return fail(e); }
  });

  ipcMain.handle('covers:auto', async (e, { ids }) => {
    try {
      // em lote: só jogos sem capa definida pelo usuário (não sobrescreve escolhas)
      const games = (ids && ids.length ? ids.map(id => store.games.find(g => g.id === id)) : store.games)
        .filter(g => g && !g.customArt);
      const total = games.length;
      const sender = e.sender;
      const progress = (done) => {
        try { sender.send('covers:progress', { done, total }); } catch { /* janela fechada */ }
      };
      resetBatch('covers');
      const r = await covers.autoCovers(games, store.settings, store.dir, (done) => progress(done), () => batchCancelled('covers'));
      const byId = new Map(r.done.map(d => [d.id, d.art]));
      for (const [id, art] of byId) store.updateGame(id, { art, coverSource: 'auto', coverPickedAt: Date.now() });
      return ok({ updated: r.done.length, failed: r.failed, state: state() });
    } catch (e) { return fail(e); }
  });

  /* ---------------------------- vídeos ---------------------------- */
  // O renderer NUNCA recebe URL remota: o principal baixa e devolve file://
  ipcMain.handle('video:for', async (_e, { id, title, steamAppId }) => {
    try {
      const g = (store.games || []).find(x => x.id === id) || { title };
      const r = await videos.resolverVideo(
        {
          title: g.title || title, id: g.id || id,
          // jogo da Steam: usa o appid da própria loja (mais certeiro que buscar pelo nome)
          steamAppId: g.steamAppId || (g.launch && g.launch.type === 'steam' && g.launch.appId) || steamAppId,
          kind: g.kind, platform: g.platform, platformKey: g.platformKey || (g.launch && g.launch.platform),
          rom: g.launch && g.launch.rom
        },
        {
          dataDir: store.dir, localDir: store.settings.videoFolder,
          youtubeKey: store.settings.youtubeKey || '',
          screenscraper: credScreenScraper(store.settings),
          stream: true                        // toca enquanto baixa
        }
      );
      return ok(r);
    } catch (e) { return ok({ ok: false, motivo: String((e && e.message) || e) }); }
  });

  // rondel: deixa prontos os endereços dos trailers vizinhos (não baixa nada)
  ipcMain.handle('video:preparar', async (_e, ids) => {
    try {
      const lista = (Array.isArray(ids) ? ids : []).slice(0, 4);
      // um de cada vez, em segundo plano: os 2 primeiros (vizinhos colados) já
      // baixam o começo do trailer; os outros só descobrem o endereço
      (async () => {
        for (const [i, id] of lista.entries()) {
          const g = (store.games || []).find(x => x.id === id);
          if (!g) continue;
          await videos.prepararVideo({
            title: g.title, kind: g.kind,
            steamAppId: g.steamAppId || (g.launch && g.launch.type === 'steam' && g.launch.appId)
          }, { dataDir: store.dir, localDir: store.settings.videoFolder, comeco: i < 2 }).catch(() => {});
        }
      })();
      return ok(true);
    } catch (e) { return ok(false); }
  });

  // botão "Testar" das fontes de vídeo nos ajustes
  ipcMain.handle('video:testarFonte', async (_e, fonte) => {
    try {
      if (fonte === 'youtube') return ok(await fontesVideo.testarYoutube(store.settings.youtubeKey || ''));
      if (fonte === 'screenscraper') return ok(await fontesVideo.testarScreenScraper(credScreenScraper(store.settings)));
      return ok({ ok: false, motivo: 'fonte desconhecida' });
    } catch (e) { return ok({ ok: false, motivo: String((e && e.message) || e) }); }
  });

  // "Trocar vídeo": apaga o vídeo guardado do jogo para buscar de novo
  ipcMain.handle('video:esquecer', (_e, id) => {
    try {
      const g = store.games.find(x => x.id === id);
      if (!g) return ok(false);
      const base = path.join(videos.videoDir(store.dir), videos.slug(g.title));
      // YouTube: guarda o vídeo recusado para a próxima busca pular ele
      try {
        const y = JSON.parse(fs.readFileSync(base + '.yt.json', 'utf8'));
        if (y && y.id) fs.writeFileSync(base + '.yt.json', JSON.stringify({ ignorados: [...(y.ignorados || []), y.id] }));
      } catch { /* não era do YouTube */ }
      for (const ext of ['.mp4', '.json']) { try { fs.unlinkSync(base + ext); } catch { /* não existia */ } }
      return ok(true);
    } catch (e) { return fail(e); }
  });

  // reserva quando o Chromium recusa file:// no <video>
  ipcMain.handle('video:http', async (_e, { arquivo }) => {
    try {
      if (!arquivo) return ok({ ok: false });
      if (!videoPort) videoPort = await videos.portaDoServidor(store.dir);
      if (!videoPort) return ok({ ok: false });
      return ok({ ok: true, url: `http://127.0.0.1:${videoPort}/?f=${encodeURIComponent(arquivo)}` });
    } catch (e) { return ok({ ok: false }); }
  });

  // "Abrir pasta": só abre PASTAS. Antes, um jogo sem installDir mandava o .exe
  // e o openPath executava o jogo (sem medir tempo e sem nenhum aviso).
  ipcMain.handle('app:openPath', async (_e, p) => {
    try {
      if (!p || typeof p !== 'string') throw new Error('caminho vazio');
      let alvo = p.replace(/^file:\/\//i, '');
      const st = fs.statSync(alvo);
      if (!st.isDirectory()) alvo = path.dirname(alvo);
      const erro = await shell.openPath(alvo);
      if (erro) throw new Error(erro);
      return ok(true);
    } catch (e) { return fail(e.code === 'ENOENT' ? 'essa pasta não existe mais' : e); }
  });

  ipcMain.handle('app:reveal', (_e, p) => {
    try {
      if (!p || typeof p !== 'string' || !fs.existsSync(p)) throw new Error('arquivo não encontrado');
      shell.showItemInFolder(p);
      return ok(true);
    } catch (e) { return fail(e); }
  });

  // (os botões da janela usam o 'win:action' do main.js)

  ipcMain.handle('detect:launchers:fresh', () => { limparCacheLojas(); return ok({ launchers: launchersCacheados() }); });

  // varredura automática: vigia as pastas e confere a biblioteca pouco depois de abrir.
  // Fica fora do caminho da abertura (consulta o registro no Windows).
  const tVigias = setTimeout(religarVigiasDePastas, deps.atrasoVigias != null ? deps.atrasoVigias : 3000);
  if (tVigias.unref) tVigias.unref();
  if (deps.varrerAoAbrir !== false) {
    const t = setTimeout(() => {
      const d = store.load();
      if (d.games.length && Date.now() - (d.lastScan || 0) > 10 * 60 * 1000) varrerEmSegundoPlano('inicio');
    }, deps.atrasoVarreduraInicial || 5000);
    if (t.unref) t.unref();
  }

  return { state, fecharSessoes, varrerEmSegundoPlano, religarVigiasDePastas, vigia, sessoesAtivas };
}

module.exports = {
  planoNetplay, chaveDaRom, DISCORD_APP_ID,
  perfisDe, perfilAtivoDe, limparPerfis,
  DEFAULT_SETTINGS, Store, cifrar, decifrar, credScreenScraper, runScan, runScanAsync, registrarSessao, eventos, limparCacheLojas, launchersCacheados, extrairCapas, caminhoDeFileUrl, collectScan, finishScan, mergeScanned, buildLaunchPlan, register, genres,
  dedupeGames, installKey, markInstalled, dirOf, exeOf, startSession,
  detectLaunchers, refreshProblems, detectEmulators, retroarchCores, KNOWN_EMULATORS,
  cancelBatches, resetBatch, batchCancelled, exportLibrary, importLibrary, lerBackup, programasDoBackup, sanitizeLaunch, urlPermitida, refineDiscPlatform, fmtDuration,
  scanSteam, scanEpic, scanGog, scanFolders, scanRoms,
  encontrarInfosGog, acharExeDoGog,
  parseVdf, cleanRomName, cleanGameName, idFor, PLATFORM_LABEL, ROM_EXT, EMULATOR_HINTS
};
