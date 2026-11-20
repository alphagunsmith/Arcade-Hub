/* ================= Arcade Hub — interface ================= */
'use strict';

/* ---------- API: Electron (preload) ou demo no navegador ---------- */
const api = (() => {
  if (window.arcadeAPI) return window.arcadeAPI;

  // ---------- modo demonstração (abrir index.html direto no navegador) ----------
  const now = Date.now();
  const demoGames = [
    // título, origem, plataforma, tipo, jogado em, gêneros
    ['Hollow Knight', 'steam', 'PC', 'game', now - 36e5 * 5, ['metroidvania', 'acao', 'indie']],
    ['Elden Ring', 'steam', 'PC', 'game', now - 36e5 * 30, ['rpg', 'acao', 'mundo-aberto']],
    ['Hades II', 'epic', 'PC', 'game', now - 36e5 * 52, ['roguelike', 'acao', 'indie']],
    ['The Witcher 3', 'gog', 'PC', 'game', now - 864e5 * 4, ['rpg', 'mundo-aberto']],
    ['Cyberpunk 2077', 'steam', 'PC', 'game', now - 864e5 * 9, ['rpg', 'fps', 'mundo-aberto']],
    ['Baldur\'s Gate 3', 'steam', 'PC', 'game', now - 864e5 * 12, ['rpg', 'estrategia']],
    ['Stardew Valley', 'folder', 'PC', 'game', now - 864e5 * 20, ['simulacao', 'indie', 'rpg']],
    ['Celeste', 'folder', 'PC', 'game', now - 864e5 * 33, ['plataforma', 'indie']],
    ['Super Metroid', 'emulator', 'SNES', 'rom', now - 864e5 * 2, ['metroidvania', 'plataforma']],
    ['Chrono Trigger', 'emulator', 'SNES', 'rom', now - 864e5 * 7, ['rpg']],
    ['Zelda: Ocarina of Time', 'emulator', 'Nintendo 64', 'rom', now - 864e5 * 15, ['aventura', 'acao']],
    ['Pokémon Emerald', 'emulator', 'Game Boy Advance', 'rom', now - 864e5 * 21, ['rpg']],
    ['Castlevania: SotN', 'emulator', 'PlayStation', 'rom', now - 864e5 * 26, ['metroidvania', 'acao']],
    ['Sonic 3 & Knuckles', 'emulator', 'Mega Drive', 'rom', now - 864e5 * 40, ['plataforma']],
    ['Metal Slug 3', 'emulator', 'Arcade', 'rom', now - 864e5 * 44, ['acao', 'arcade']]
  ].map(([title, source, platform, kind, playedAt, genres], i) => ({
    id: 'demo' + i, title, source, platform, kind, genres,
    installed: i !== 12,                                  // Castlevania "não instalado" na demo
    playtime: [i % 4 === 0 || i % 5 === 1 ? {
      totalMs: (i + 1) * 3.5 * 36e5, sessions: i + 2, lastAt: playedAt,
      history: Array.from({ length: i + 2 }, (_, k) => ({ at: now - k * 864e5 * (9 + i), ms: ((i + 1) * 3.5 * 36e5) / (i + 2) }))
    } : null][0],
    platformKey: platform.toLowerCase(),
    launch: { type: source === 'emulator' ? 'rom' : 'url', rom: 'C:/Roms/Game.sfc' },
    installDir: 'C:/Games/' + title,
    sizeOnDisk: 1.4e9 + i * 3.3e8,
    art: null, addedAt: now - 864e5 * (60 - i), playedAt,
    alsoOn: source === 'steam' && i % 3 === 0 ? ['folder'] : undefined,
    problem: i === 12 ? 'arquivo da ROM não encontrado' : (i === 6 ? 'Steam não está instalada' : null)
  }));

  const notasDemo = { demo0: 90, demo1: 96, demo2: 95, demo3: 94, demo4: 86, demo5: 96, demo7: 91, demo8: 96, demo9: 92, demo10: 99, demo12: 93 };
  demoGames.forEach(g => {
    g.meta = notasDemo[g.id]
      ? { score: notasDemo[g.id], platformScore: { platform: 'PC', score: notasDemo[g.id] - 2 }, sources: ['steam', 'metacritic'], at: now }
      : { sources: [], at: now };
  });
  let favs = ['demo0', 'demo3', 'demo9'];
  let state = {
    games: demoGames,
    favorites: favs,
    hidden: [],
    settings: {
      folders: ['C:/Games', 'D:/JogosPortateis'],
      romFolders: ['D:/Roms', 'E:/Emuladores/roms'],
      emulators: {},
      retroarch: { exe: '', cores: '' },
      scanDepth: 4,
      includeStoreLaunchers: true,
      sort: 'recent',
      groupBy: 'none',
      skin: 'neon'
    },
    lastScan: now - 864e5 * 2,
    versions: { app: '1.0.0', electron: '—', os: 'pré-visualização' },
    launchers: { steam: { installed: true, path: 'C:/Steam' }, epic: { installed: false, path: '' }, gog: { installed: true, path: 'C:/GOG Galaxy' } },
    dataDir: 'C:/Users/Você/.arcade-hub'
  };

  const reply = data => Promise.resolve({ ok: true, data });
  const notElectron = () => Promise.resolve({
    ok: false,
    error: 'Isto é só a pré-visualização no navegador. Abra o app (npm start) para abrir jogos de verdade.'
  });

  return {
    getState: () => reply(state),
    scan: () => new Promise(res => setTimeout(() => res({ ok: true, data: { state: { ...state, lastScan: Date.now() } } }), 900)),
    saveSettings: patch => { state = { ...state, settings: { ...state.settings, ...patch } }; return reply(state); },
    // no navegador não há downloads: devolve "sem vídeo" e o rondel mostra a imagem
    videoFor: () => Promise.resolve({ ok: true, data: { ok: false, motivo: 'modo demonstração' } }),
    videoUrlHttp: () => Promise.resolve({ ok: true, data: { ok: false } }),
    pickFolders: () => reply(['C:/Games/Escolha uma pasta']),
    pickFile: () => reply(['C:/Games/exemplo.exe']),
    addGame: g => { state.games = [...state.games, { ...g, id: 'demo' + state.games.length }]; return reply(g); },
    updateGame: ({ id, patch }) => {
      state.games = state.games.map(x => (x.id === id ? { ...x, ...patch } : x));
      return reply({ id, patch });
    },
    removeGame: id => {
      state.games = state.games.filter(x => x.id !== id);
      return reply({ games: state.games, favorites: state.favorites, settings: state.settings, hidden: state.hidden });
    },
    openPath: () => reply(true),
    toggleFavorite: id => {
      favs = favs.includes(id) ? favs.filter(f => f !== id) : [...favs, id];
      state.favorites = favs;
      return reply(favs);
    },
    toggleHidden: id => reply([]),
    listGenres: () => reply(GENRES),
    detectEmulators: () => new Promise(res => setTimeout(() => res({
      ok: true,
      data: {
        found: [
          { exe: 'C:/RetroArch-Win64/retroarch.exe', label: 'RetroArch', platforms: ['*'], kind: 'retroarch', cores: 'C:/RetroArch-Win64/cores', alreadySet: false },
          { exe: 'C:/Emuladores/Dolphin/Dolphin.exe', label: 'Dolphin', platforms: ['gc', 'wii'], kind: 'single', alreadySet: false },
          { exe: 'C:/Emuladores/Snes9x/snes9x-x64.exe', label: 'Snes9x', platforms: ['snes'], kind: 'single', alreadySet: true },
          { exe: 'C:/Emuladores/PCSX2/pcsx2-qt.exe', label: 'PCSX2', platforms: ['ps2'], kind: 'single', alreadySet: false }
        ],
        scanned: ['C:/Emuladores', 'C:/RetroArch-Win64', 'D:/Emulacao']
      }
    }), 900)),
    applyEmulators: ({ picks }) => reply({ applied: picks.length, state }),
    detectLaunchers: () => reply({ launchers: { steam: { installed: true, path: 'C:/Steam' }, epic: { installed: false, path: '' }, gog: { installed: true, path: 'C:/GOG Galaxy' } } }),
    cancelBatch: () => reply({ cancelled: 'todas' }),
    diagnostics: () => reply({
      checks: [
        { type: 'folder', ok: true, label: 'Pasta de jogos', detail: 'C:/Games' },
        { type: 'folder', ok: true, label: 'Pasta de jogos', detail: 'D:/JogosPortateis' },
        { type: 'romfolder', ok: true, label: 'Pasta de ROMs', detail: 'D:/Roms' },
        { type: 'romfolder', ok: false, label: 'Pasta de ROMs', detail: 'E:/Emuladores/roms (HD desconectado)' },
        { type: 'emulator', ok: true, label: 'Emulador SNES', detail: 'C:/Emuladores/snes9x.exe' }
      ],
      counts: {
        games: state.games.length,
        installed: state.games.filter(g => g.installed !== false).length,
        roms: state.games.filter(g => g.kind === 'rom').length,
        withArt: state.games.filter(g => !!g.art).length,
        withScore: state.games.filter(g => g.meta && g.meta.score != null).length,
        withGenres: state.games.filter(g => g.genres && g.genres.length).length
      },
      missing: [], missingRoms: [{ id: 'demo12', title: 'Castlevania: SotN', path: 'D:/Roms/PS1/disc.cue' }],
      noEmulator: ['ps1', 'arcade'],
      lastScanReport: { sources: { steam: { found: 4, ms: 180 }, epic: { found: 1, ms: 40 }, pastas: { found: 2, ms: 12 }, roms: { found: 7, ms: 30 } }, duplicates: 1, total: state.games.length, installed: 14, ms: 262, problems: [] },
      dataDir: state.dataDir, versions: { app: '1.0.0', electron: '—', node: '—', os: 'pré-visualização' }
    }),
    exportLibrary: () => new Promise(res => setTimeout(() => res({ ok: true, data: { games: state.games.length, bytes: 48210, file: 'C:/Users/Você/Desktop/arcade-hub-backup.json' } }), 400)),
    importLibrary: () => new Promise(res => setTimeout(() => res({ ok: true, data: { added: 0, updated: 0, canceled: true } }), 400)),
    primeMeta: () => new Promise(res => setTimeout(() => {
      // no demo, simula a chegada das notas
      const notas = { demo0: 90, demo1: 96, demo2: 95, demo3: 94, demo4: 86, demo5: 96, demo7: 91, demo8: 96, demo9: 92, demo10: 99, demo12: 93 };
      state.games = state.games.map(g => notas[g.id] ? { ...g, meta: { score: notas[g.id], sources: ['metacritic'], at: Date.now() } } : { ...g, meta: { sources: [], at: Date.now() } });
      res({ ok: true, data: { updated: Object.keys(notas).length, failed: [], state } });
    }, 1600)),
    lookupMeta: id => new Promise(res => setTimeout(() => res({
      ok: true,
      data: {
        meta: {
          sources: ['steam', 'metacritic'],
          score: 90, platformScore: { platform: 'PC', score: 87 }, year: 2018,
          developers: ['Team Cherry'], publishers: ['Team Cherry'], rating: 'E10+',
          genresRaw: ['Metacritic', 'Metroidvania', 'Action', 'Adventure'],
          description: 'Hollow Knight é um jogo de ação e aventura 2D com ênfase em animação tradicional, combate preciso e exploração de um reino subterrâneo enorme e interconectado.',
          mcUrl: 'https://www.metacritic.com/game/hollow-knight/',
          wikidataUrl: 'https://www.wikidata.org/wiki/Q29300592',
          steamAppId: '367520'
        },
        cached: false
      }
    }), 800)),
    autoGenres: () => new Promise(res => setTimeout(() => res({ ok: true, data: { updated: 6, failed: [], state } }), 1200)),
    setGenres: ({ id, genres: list }) => {
      state.games = state.games.map(g => (g.id === id ? { ...g, genres: list, genresSource: 'manual' } : g));
      return reply({ state });
    },
    onGenreProgress: () => () => {},
    searchCovers: () => new Promise(res => setTimeout(() => res({
      ok: true,
      data: {
        candidates: [
          { source: 'steam', url: 'https://cdn.cloudflare.steamstatic.com/steam/apps/367520/library_600x900.jpg', label: 'Steam · 600x900', kind: 'vertical' },
          { source: 'steam', url: 'https://cdn.cloudflare.steamstatic.com/steam/apps/367520/header.jpg', label: 'Steam · horizontal', kind: 'horizontal' },
          { source: 'steamgriddb', url: 'https://cdn.cloudflare.steamstatic.com/steam/apps/1145360/library_600x900.jpg', label: 'comunidade', kind: 'vertical' }
        ],
        warnings: []
      }
    }), 700)),
    applyCover: () => reply({ state }),
    applyLocalCover: () => reply({ state }),
    autoCovers: () => new Promise(res => setTimeout(() => res({ ok: true, data: { updated: 5, failed: [], state } }), 1400)),
    onCoverProgress: () => () => {},
    launch: notElectron,
    openPath: notElectron,
    reveal: notElectron,
    updateStatus: () => reply({ estado: 'parado', suportado: false, versaoAtual: '1.0.2' }),
    checkUpdates: notElectron,
    installUpdate: notElectron,
    onUpdateStatus: () => () => {},
    onSessionStart: () => () => {},
    onLibraryChanged: () => () => {},
    setFullscreen: () => reply(true),
    win: { min: () => {}, max: () => {}, close: () => {} }
  };
})();

/* ---------- estado local ---------- */
const ui = {
  state: null,
  view: 'all',
  platform: null,
  genre: null,
  source: null,
  query: '',
  sort: 'recent',
  groupBy: 'none',      // none | genre | platform | source
  installedOnly: false,
  minScore: 0,          // 0 = sem filtro; valores comuns: 75, 85, 90
  sessionTimer: null,
  editingId: null,
  typing: null,
  type: 'exe',
  coverGame: null,
  jogoNaFicha: null,       // jogo aberto na ficha (o controle X inicia ele)
  jogando: new Set(),      // jogos com sessão aberta agora
  atualizacao: null,       // último estado do atualizador
  avisoAtualizacaoFechado: false,
  pickPaths: { exe: '', rom: '', art: '' }
};

const $ = sel => document.querySelector(sel);
const $$ = sel => [...document.querySelectorAll(sel)];
// el(): o 3º argumento é TEXTO (textContent) — nome de jogo, nota, descrição
// vinda da internet nunca vira HTML. Para marcação fixa do próprio app (ícones
// SVG etc.) use elHtml(), e escape qualquer valor dinâmico dentro dela.
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};
const elHtml = (tag, cls, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
};

// espelho do catálogo de src/genres.js (usado para rótulos, ícones e no modo demo)
const GENRES = [
  { key: 'acao', label: 'Ação', icon: '🗡', color: '#f87171' },
  { key: 'aventura', label: 'Aventura', icon: '🧭', color: '#fbbf24' },
  { key: 'rpg', label: 'RPG', icon: '⚔', color: '#a78bfa' },
  { key: 'estrategia', label: 'Estratégia', icon: '♟', color: '#38bdf8' },
  { key: 'simulacao', label: 'Simulação', icon: '🏗', color: '#34d399' },
  { key: 'corrida', label: 'Corrida', icon: '🏎', color: '#fb923c' },
  { key: 'esporte', label: 'Esporte', icon: '⚽', color: '#4ade80' },
  { key: 'luta', label: 'Luta', icon: '🥊', color: '#ef4444' },
  { key: 'fps', label: 'Tiro / FPS', icon: '🎯', color: '#facc15' },
  { key: 'plataforma', label: 'Plataforma', icon: '🍄', color: '#f472b6' },
  { key: 'puzzle', label: 'Puzzle', icon: '🧩', color: '#22d3ee' },
  { key: 'terror', label: 'Terror', icon: '👻', color: '#818cf8' },
  { key: 'arcade', label: 'Arcade', icon: '🕹', color: '#e879f9' },
  { key: 'roguelike', label: 'Roguelike', icon: '🎲', color: '#c084fc' },
  { key: 'metroidvania', label: 'Metroidvania', icon: '🦇', color: '#a3e635' },
  { key: 'mundo-aberto', label: 'Mundo aberto', icon: '🌍', color: '#2dd4bf' },
  { key: 'sobrevivencia', label: 'Sobrevivência', icon: '🔥', color: '#fb7185' },
  { key: 'ritmo', label: 'Ritmo', icon: '🎵', color: '#f0abfc' },
  { key: 'cartas', label: 'Cartas', icon: '🃏', color: '#93c5fd' },
  { key: 'mmo', label: 'MMO', icon: '🌐', color: '#60a5fa' },
  { key: 'indie', label: 'Indie', icon: '✨', color: '#a5b4fc' },
  { key: 'casual', label: 'Casual', icon: '🎈', color: '#fda4af' },
  { key: 'hack-slash', label: 'Hack & Slash', icon: '🌀', color: '#fca5a5' },
  { key: 'plataforma-3d', label: 'Coleta / 3D', icon: '⭐', color: '#67e8f9' }
];
const genreInfo = key => GENRES.find(g => g.key === key) || { key, label: key, icon: '🎮', color: '#8792a8' };
const genreLabel = key => genreInfo(key).label;

const SOURCE_META = {
  steam: { label: 'Steam', color: '#66c0f4' },
  epic: { label: 'Epic', color: '#cfcdcc' },
  gog: { label: 'GOG', color: '#a855f7' },
  folder: { label: 'Pasta', color: '#34d399' },
  emulator: { label: 'Emulador', color: '#fbbf24' },
  manual: { label: 'Manual', color: '#f472b6' }
};

// usado quando ainda não há settings.emulators (ex.: primeira execução / prévia)
const FALLBACK_PLATFORMS = [
  ['nes', 'NES'], ['snes', 'SNES'], ['n64', 'Nintendo 64'], ['gb', 'Game Boy'],
  ['gbc', 'Game Boy Color'], ['gba', 'Game Boy Advance'], ['nds', 'Nintendo DS'],
  ['3ds', 'Nintendo 3DS'], ['switch', 'Switch'], ['gc', 'GameCube'], ['wii', 'Wii'],
  ['wiiu', 'Wii U'], ['ps1', 'PlayStation'], ['ps2', 'PlayStation 2'],
  ['dreamcast', 'Dreamcast'], ['saturn', 'Saturn'], ['genesis', 'Mega Drive'],
  ['sms', 'Master System'], ['gg', 'Game Gear'], ['pce', 'PC Engine'],
  ['arcade', 'Arcade'], ['atari2600', 'Atari 2600'], ['c64', 'Commodore 64']
];

const emulatorMap = () => {
  const m = (ui.state && ui.state.settings && ui.state.settings.emulators) || {};
  if (Object.keys(m).length) return m;
  return Object.fromEntries(FALLBACK_PLATFORMS.map(([k, label]) => [k, { platform: k, label, exe: '', args: '"{rom}"', hint: '' }]));
};

const fmtSize = b => {
  if (!b) return '';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0; let v = b;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v >= 10 || i < 2 ? Math.round(v) : v.toFixed(1)} ${u[i]}`;
};

const fmtPlaytime = ms => {
  const min = Math.round((ms || 0) / 60000);
  if (!min) return '0min';
  const h = Math.floor(min / 60);
  return h ? `${h}h${min % 60 ? ' ' + (min % 60) + 'm' : ''}` : `${min}min`;
};

const fmtDate = ts => {
  if (!ts) return 'Nunca';
  const d = new Date(ts);
  const diff = Date.now() - ts;
  const min = Math.round(diff / 6e4), h = Math.round(diff / 36e5), days = Math.round(diff / 864e5);
  if (min < 2) return 'agora mesmo';
  if (min < 60) return `há ${min} min`;
  if (h < 24) return `há ${h} h`;
  if (days === 1) return 'ontem';
  if (days < 30) return `há ${days} dias`;
  return d.toLocaleDateString('pt-BR');
};

/* ---------- toasts ---------- */
function toast(msg, kind) {
  const t = el('div', 'toast' + (kind ? ' ' + kind : ''), '');
  t.textContent = msg;
  $('#toasts').appendChild(t);
  setTimeout(() => {
    t.style.transition = 'opacity .2s, transform .2s';
    t.style.opacity = '0';
    t.style.transform = 'translateY(6px)';
    setTimeout(() => t.remove(), 220);
  }, kind === 'err' ? 5200 : 3200);
}

/* ---------- filtros ---------- */

/** card visível: usa offsetParent quando há layout; em ambientes sem layout, considera visível. */
const isVisible = el => {
  if (!el) return false;
  if (el.closest('[hidden]')) return false;
  if (el.offsetParent === null) {
    // sem layout (jsdom) todo card conta; com layout, offsetParent null = escondido
    return el.getBoundingClientRect().width === 0 && el.getBoundingClientRect().height === 0
      ? !document.body.getBoundingClientRect().height > 0
      : false;
  }
  return true;
};

/** cards da grade, na ordem visual */
const gridCards = () => [...document.querySelectorAll('#grid .card')].filter(isVisible);


/** Normaliza texto para busca: sem acento, sem ™/®, sem pontuação. */
const foldText = str => String(str || '')
  .toLowerCase()
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[\u2122\u00ae\u00a9]/g, '')
  .replace(/[\u2010-\u2015]/g, '-')
  .replace(/[^a-z0-9 ]+/g, ' ')
  .replace(/\s{2,}/g, ' ')
  .trim();

function visibleGames() {
  const s = ui.state;
  const favs = new Set(s.favorites || []);
  const hidden = new Set(s.hidden || []);
  const q = foldText(ui.query);

  let list = s.games.filter(g => !hidden.has(g.id));
  if (ui.installedOnly) list = list.filter(g => g.installed !== false);
  if (ui.minScore > 0) {
    list = list.filter(g => {
      const raw = g.meta && g.meta.score;
      const sc = Number.isFinite(Number(raw)) && raw !== null && raw !== '' ? Number(raw) : null;
      return sc != null && sc >= ui.minScore;
    });
  }

  if (ui.view === 'favorites') list = list.filter(g => favs.has(g.id));
  if (ui.view === 'recent') list = list.filter(g => g.playedAt).sort((a, b) => b.playedAt - a.playedAt).slice(0, 18);
  if (ui.view === 'pc') list = list.filter(g => g.kind !== 'rom');
  if (ui.view === 'emulator') list = list.filter(g => g.kind === 'rom');

  if (ui.genre === '__none') list = list.filter(g => !Array.isArray(g.genres) || !g.genres.length);
  else if (ui.genre) list = list.filter(g => Array.isArray(g.genres) && g.genres.includes(ui.genre));
  if (ui.platform) list = list.filter(g => (g.platformKey || g.platform) === ui.platform);
  if (ui.source) list = list.filter(g => g.source === ui.source);
  if (q) {
    list = list.filter(g => {
      const hay = [g.title, g.platform, g.platformKey, SOURCE_META[g.source] ? SOURCE_META[g.source].label : g.source]
        .map(foldText).join(' | ');
      // aceita todos os termos digitados, em qualquer ordem
      return q.split(' ').every(term => hay.includes(term));
    });
  }

  const sorters = {
    title: (a, b) => a.title.localeCompare(b.title, 'pt-BR', { numeric: true, sensitivity: 'base' }),
    recent: (a, b) => (b.playedAt || 0) - (a.playedAt || 0) || a.title.localeCompare(b.title),
    added: (a, b) => (b.addedAt || 0) - (a.addedAt || 0),
    // nota: maior primeiro, sem nota (SN) no fim
    score: (a, b) => {
      const sa = a.meta && a.meta.score != null ? a.meta.score : -1;
      const sb = b.meta && b.meta.score != null ? b.meta.score : -1;
      return sb - sa || a.title.localeCompare(b.title);
    },
    // tempo jogado: maior primeiro
    playtime: (a, b) => ((b.playtime && b.playtime.totalMs) || 0) - ((a.playtime && a.playtime.totalMs) || 0) || a.title.localeCompare(b.title)
  };
  if (ui.view === 'recent') return list;
  return list.sort(sorters[ui.sort] || sorters.title);
}

/* ---------- render ---------- */
function render() {
  if (!ui.state) return;
  const s = ui.state;
  const games = visibleGames();
  const favs = new Set(s.favorites || []);
  const romCount = s.games.filter(g => g.kind === 'rom').length;

  $('#count-all').textContent = s.games.length;
  $('#count-fav').textContent = (s.favorites || []).length;
  $('#count-pc').textContent = s.games.length - romCount;
  $('#count-rom').textContent = romCount;

  const titles = {
    all: 'Todos os jogos', favorites: 'Favoritos', recent: 'Jogados recentemente',
    pc: 'Jogos de PC', emulator: 'Emuladores', stats: 'Estatísticas'
  };
  $('#view-title').textContent = titles[ui.view] || 'Jogos';
  const totalSize = s.games.reduce((a, g) => a + (g.sizeOnDisk || 0), 0);
  const parts = [];
  if (ui.genre) parts.push(ui.genre === '__none' ? 'sem gênero' : genreLabel(ui.genre));
  if (ui.platform) parts.push(String(ui.platform));
  if (ui.source) parts.push((SOURCE_META[ui.source] || {}).label || ui.source);
  if (ui.groupBy !== 'none') parts.push('agrupado por ' + ({ genre: 'gênero', platform: 'console', source: 'origem' }[ui.groupBy]));
  $('#view-sub').textContent = parts.length ? parts.join(' · ') + ` — ${games.length} jogo(s)` : (games.length === s.games.length && !ui.query
    ? `${s.games.length} ${s.games.length === 1 ? 'jogo' : 'jogos'}${totalSize ? ' · ' + fmtSize(totalSize) + ' em disco' : ''}`
    : `${games.length} de ${s.games.length} jogos`);

  renderNav();

  // ---- estatísticas: uma página própria, no lugar da grade ----
  const statsBox = $('#stats');
  if (ui.view === 'stats') {
    document.body.dataset.layout = 'stats';
    statsBox.hidden = false;
    $('#grid').hidden = true; $('#rondel').hidden = true; $('#dashboard').hidden = true;
    $('#empty').hidden = true;
    renderHero([]);
    Rondel.pausar();
    Dashboards.ativar(null);
    renderStats();
    return;
  }
  statsBox.hidden = true;

  // ---- TEMA DE DASHBOARD tem prioridade: ele já É um layout ----
  const tema = temaAtual();
  const dashBox = $('#dashboard');
  if (tema && tema.dashboard) {
    document.body.dataset.layout = 'dashboard';
    Dashboards.ativar(tema.dashboard);
    dashBox.hidden = games.length === 0;
    $('#rondel').hidden = true;
    $('#grid').hidden = true;
    renderHero([]);
    Rondel.pausar();
    if (games.length) montarDashboard(games);
    else Dashboards.parar();
    $('#empty').hidden = games.length > 0;
    return;
  }
  Dashboards.ativar(null);          // tema de cor comum: desliga o dashboard
  dashBox.hidden = true;

  // ---- layout: grade (clássico) ou rondel ----
  const layout = currentLayout();
  document.body.dataset.layout = layout;
  const rondel = $('#rondel');
  const emRondel = layout === 'rondel';
  if (emRondel) {
    renderHero([]);                       // no rondel o topo é do próprio rondel
    $('#grid').hidden = true;
    rondel.hidden = games.length === 0;
    if (games.length) montarRondel(games);
    else { Rondel.pausar(); }
  } else {
    rondel.hidden = true;
    Rondel.pausar();
    renderHero(games);
    renderGrouped(games, favs);
  }

  const empty = games.length === 0;
  $('#grid').hidden = empty || emRondel;
  $('#empty').hidden = !empty;
  if (empty) {
    if (s.games.length === 0) {
      $('#empty-title').textContent = 'Sua biblioteca está vazia';
      $('#empty-text').textContent = 'Adicione as pastas onde ficam seus jogos e emuladores, depois escaneie. O Arcade Hub encontra Steam, Epic, GOG, .exe soltos e ROMs automaticamente.';
    } else {
      $('#empty-title').textContent = 'Nenhum jogo encontrado';
      $('#empty-text').textContent = 'Tente outra busca ou limpe os filtros de plataforma e origem.';
    }
  }
}

function renderNav() {
  $$('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === ui.view));

  const s = ui.state;
  // gêneros
  const genreCounts = new Map();
  let semGenero = 0;
  for (const g of s.games) {
    const list = Array.isArray(g.genres) ? g.genres.filter(Boolean) : [];
    if (!list.length) { semGenero++; continue; }
    for (const key of list) genreCounts.set(key, (genreCounts.get(key) || 0) + 1);
  }
  const genreBox = $('#nav-genres');
  genreBox.innerHTML = '';
  const genreSorted = [...genreCounts.entries()].sort((a, b) => b[1] - a[1] || genreLabel(a[0]).localeCompare(genreLabel(b[0])));
  for (const [key, n] of genreSorted.slice(0, 12)) {
    const info = genreInfo(key);
    const b = el('button', ui.genre === key ? 'on' : '');
    const ic = el('span', 'gi', info.icon);
    b.appendChild(ic);
    b.appendChild(el('span', null, info.label));
    b.appendChild(el('em', null, String(n)));
    b.onclick = () => { ui.genre = ui.genre === key ? null : key; ui.view = 'all'; render(); fecharMenu(); };
    genreBox.appendChild(b);
  }
  if (semGenero) {
    const b = el('button', ui.genre === '__none' ? 'on' : '');
    b.appendChild(el('span', 'gi', '❔'));
    b.appendChild(el('span', null, 'Sem gênero'));
    b.appendChild(el('em', null, String(semGenero)));
    b.onclick = () => { ui.genre = ui.genre === '__none' ? null : '__none'; ui.view = 'all'; render(); };
    genreBox.appendChild(b);
  }
  if (!genreBox.children.length) genreBox.appendChild(el('span', 'muted small', '—'));

  // plataformas
  const counts = new Map();
  for (const g of s.games) {
    const key = g.platformKey || g.platform;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(b[0]));
  const box = $('#nav-platforms');
  box.innerHTML = '';
  for (const [key, n] of sorted.slice(0, 14)) {
    const label = (s.games.find(g => (g.platformKey || g.platform) === key) || {}).platform || key;
    const b = el('button', 'chip' + (ui.platform === key ? ' on' : ''));
    b.textContent = `${label} ${n}`;
    b.onclick = () => { ui.platform = ui.platform === key ? null : key; ui.view = 'all'; render(); fecharMenu(); };
    box.appendChild(b);
  }
  if (!sorted.length) box.appendChild(el('span', 'muted small', '—'));

  // origens
  const srcCount = new Map();
  for (const g of s.games) srcCount.set(g.source, (srcCount.get(g.source) || 0) + 1);
  const srcBox = $('#nav-sources');
  srcBox.innerHTML = '';
  for (const [src, n] of [...srcCount.entries()].sort((a, b) => b[1] - a[1])) {
    const meta = SOURCE_META[src] || { label: src, color: '#8792a8' };
    const b = el('button', ui.source === src ? 'on' : '');
    const dot = el('i', 'dot');
    dot.style.background = meta.color;
    b.appendChild(dot);
    b.appendChild(el('span', null, meta.label));
    b.appendChild(el('em', null, String(n)));
    b.onclick = () => { ui.source = ui.source === src ? null : src; ui.view = 'all'; render(); fecharMenu(); };
    srcBox.appendChild(b);
  }
  if (!srcCount.size) srcBox.appendChild(el('span', 'muted small', '—'));

  $('#last-scan').textContent = s.lastScan
    ? `Última varredura ${fmtDate(s.lastScan)}`
    : 'Nunca escaneado';
}

function renderHero(games) {
  const hero = $('#hero');
  const source = ui.view === 'all' && !ui.query ? games.filter(g => g.playedAt).sort((a, b) => b.playedAt - a.playedAt)[0] : null;
  if (!source) { hero.hidden = true; return; }
  hero.hidden = false;
  hero.innerHTML = '';
  if (source.art) {
    const img = el('img', 'hero-img');
    img.src = source.art;
    hero.appendChild(img);
  }
  hero.appendChild(el('div', 'hero-fade'));
  const inner = el('div', 'hero-inner');
  inner.appendChild(el('span', 'eyebrow', 'continue jogando'));
  inner.appendChild(el('h2', null, source.title));
  const row = el('div', 'row');
  const play = elHtml('button', 'primary-btn', '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg> Jogar');
  play.onclick = ev => cliqueComShift(source, ev);
  const det = el('button', 'ghost-btn', 'Detalhes');
  det.onclick = () => openDetail(source);
  const meta = el('span', 'muted small', `${source.platform} · jogado ${fmtDate(source.playedAt)}`);
  row.append(play, det, meta);
  inner.appendChild(row);
  hero.appendChild(inner);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/**
 * Preenche um container com a capa do jogo, AJUSTANDO ao espaço disponível.
 *
 * O card é 3:4 (retrato). Uma arte quadrada, widescreen ou "header" da Steam
 * ficaria mutilada com object-fit:cover (cortava o título do jogo no meio).
 * Aqui a imagem é medida e classificada:
 *   retrato  → preenche o card (cover), é o formato certo
 *   quadrada → preenche, perda pequena nas laterais
 *   paisagem → aparece INTEIRA (contain), com desfoque da própria arte no fundo
 *              para não ficar faixa vazia
 * Regra mantida: havendo capa, nenhuma abreviação por baixo.
 */
function paintArt(box, game, opts) {
  const opcoes = opts || {};
  box.innerHTML = '';
  box.classList.remove('art-carregando', 'art-contain');
  if (game && game.art) {
    if (opcoes.loading !== false) box.classList.add('art-carregando');
    const img = el('img');
    img.alt = game.title || '';
    img.decoding = 'async';
    img.loading = 'lazy';                  // só decodifica as capas que aparecem na tela
    img.onload = () => {
      box.classList.remove('art-carregando');
      const w = img.naturalWidth || 1, h = img.naturalHeight || 1;
      const r = w / h;                       // > 1 = paisagem, < 1 = retrato
      const alvo = 3 / 4;                    // proporção do card
      if (r > 1.15) {
        // paisagem: mostra inteira + fundo desfocado da mesma arte
        box.classList.remove('art-contain');
        box.classList.add('art-contain');
        if (!box.querySelector('.art-blur')) {
          const bg = el('div', 'art-blur');
          bg.style.backgroundImage = `url("${String(game.art).replace(/"/g, '\\"')}")`;
          box.insertBefore(bg, box.firstChild);
        }
      } else if (r > alvo * 1.02) {
        box.classList.remove('art-contain');
        box.classList.add('art-suave');      // quadrada: cobre, sem esticar
      }
      // retrato: nada a fazer, cover já é o encaixe correto
    };
    img.onerror = () => {                       // capa quebrada volta para a abreviação
      box.classList.remove('art-carregando', 'art-contain');
      img.remove();
      addFallback(box, game);
    };
    img.src = game.art;
    box.appendChild(img);
    return;
  }
  addFallback(box, game);
}

/* ---------- "capa que caiba": refazer a busca priorizando retrato ---------- */
async function ajustarCapa(game) {
  if (!game) return;
  const alvo = game;
  toast('Procurando uma capa melhor (retrato)…', 'ok');
  const r = await api.searchCovers({ id: alvo.id, title: alvo.title });
  if (!r.ok) { toast(r.error || 'Não consegui buscar capas', 'err'); return; }
  const lista = (r.data && r.data.candidates) || [];
  // 1º retrato, 2º quadrada, 3º qualquer — nunca uma horizontal se houver retrato
  const ordenadas = [...lista].sort((a, b) => pesoFormato(b) - pesoFormato(a));
  const melhor = ordenadas[0];
  if (!melhor) { toast('Nenhuma capa encontrada para este jogo', 'err'); return; }
  const aplic = await api.applyCover({ id: alvo.id, candidate: melhor });
  if (!aplic.ok) { toast(aplic.error || 'Falha ao aplicar', 'err'); return; }
  alvo.art = aplic.data && aplic.data.art ? aplic.data.art : alvo.art;
  alvo.customArt = alvo.art;
  if (aplic.data && aplic.data.state) ui.state = aplic.data.state;
  render();
  toast('Capa ajustada ao formato do card', 'ok');
}
const pesoFormato = c => (c.kind === 'vertical' ? 3 : c.kind === 'square' ? 2 : c.kind === 'horizontal' ? 0 : 1);

function addFallback(box, game) {
  box.classList.remove('art-carregando');
  if (box.querySelector('.card-fallback')) return;
  const fb = el('div', 'card-fallback');
  fb.appendChild(el('div', 'glyph', initialsOf((game && game.title) || '?')));
  if (opcoesPlat(game)) fb.appendChild(el('div', 'plat', opcoesPlat(game)));
  box.appendChild(fb);
}
const opcoesPlat = g => (g && g.platform) || '';

function initialsOf(title) {
  const words = String(title).replace(/[^\p{L}\p{N} ]/gu, ' ').split(/\s+/).filter(Boolean);
  if (!words.length) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

function renderGrid(games, favs) {
  const grid = $('#grid');
  grid.innerHTML = '';
  renderCardsInto(grid, games, favs);
}

function renderCardsInto(grid, games, favs) {
  const frag = document.createDocumentFragment();
  games.forEach((g, i) => {
    const card = el('div', 'card' + (g.installed === false ? ' not-installed' : '') + (g.problem ? ' has-problem' : ''));
    card.tabIndex = 0;                                  // navegável por teclado
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', `${g.title}${g.problem ? ' — ' + g.problem : ''}`);
    card.style.animationDelay = Math.min(i * 12, 240) + 'ms';
    card.dataset.id = g.id;

    const art = el('div', 'card-art');
    const meta = SOURCE_META[g.source] || { label: g.source, color: '#8792a8' };

    // Capa presente = zero abreviação (antes o "HK" ficava atrás da imagem).
    paintArt(art, g);

    const src = el('div', 'card-src');
    src.textContent = meta.label;
    src.style.color = meta.color;
    art.appendChild(src);

    const fav = el('button', 'card-fav' + (favs.has(g.id) ? ' on' : ''));
    fav.type = 'button';
    fav.title = favs.has(g.id) ? 'Remover dos favoritos' : 'Adicionar aos favoritos';
    fav.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24"><path d="M12 4.5l2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.6-4.8 2.6.9-5.4L4.2 10.2l5.4-.8z" fill="' + (favs.has(g.id) ? 'currentColor' : 'none') + '" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>';
    fav.onclick = async e => {
      e.stopPropagation();
      const r = await api.toggleFavorite(g.id);
      if (r.ok) { ui.state.favorites = r.data; render(); }
    };

    const play = el('button', 'card-play');
    play.type = 'button';
    play.title = `Ver informações · Shift+clique para iniciar ${g.title} direto`;
    play.appendChild(el('span', null, '▶ Jogar'));
    play.appendChild(el('em', 'shift-tag', 'shift'));
    // Shift+clique = iniciar direto; clique normal = abrir a ficha
    play.onclick = e => { e.stopPropagation(); cliqueComShift(g, e); };

    art.append(fav, play, el('div', 'card-hint', 'clique para ver · Shift+clique para jogar'));
    const badge = scoreBadge(g);
    if (badge) art.appendChild(badge);
    if (g.problem) {
      const prob = el('div', 'card-problem');
      prob.textContent = '⚠ ' + g.problem;
      prob.title = g.problem;
      art.appendChild(prob);
    }
    const pt = g.playtime && g.playtime.totalMs;
    if (ui.jogando.has(g.id)) art.appendChild(el('div', 'card-jogando', 'jogando agora'));
    else if (pt) art.appendChild(el('div', 'card-playtime', fmtPlaytime(pt)));

    // atalho discreto: refazer capa/informações sem abrir nada
    const refresh = el('button', 'card-refresh');
    refresh.type = 'button';
    refresh.title = 'Baixar capa e informações de novo';
    refresh.setAttribute('aria-label', `Atualizar capa e informações de ${g.title}`);
    refresh.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M20 11a8 8 0 10-2.3 5.7"/><path d="M20 4.5V11h-6.5"/></svg>';
    refresh.onclick = async e => {
      e.stopPropagation();
      refresh.classList.add('girando');
      g.art = null; g.customArt = null;
      try {
        await api.updateGame({ id: g.id, patch: { art: null, customArt: null, coverSource: null } });
        g.meta = null;
        await enriquecerAutomatico({ forcar: true });
      } finally { refresh.classList.remove('girando'); }
    };
    art.appendChild(refresh);

    // "capa que caiba": busca uma capa retrato (o formato do card) e aplica
    const encaixar = el('button', 'card-refresh card-fit');
    encaixar.type = 'button';
    encaixar.title = 'Buscar uma capa que caiba no card (retrato)';
    encaixar.setAttribute('aria-label', `Ajustar capa de ${g.title}`);
    encaixar.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 4H5a1 1 0 00-1 1v3M16 4h3a1 1 0 011 1v3M8 20H5a1 1 0 01-1-1v-3M16 20h3a1 1 0 001-1v-3"/></svg>';
    encaixar.onclick = async e => {
      e.stopPropagation();
      encaixar.classList.add('girando');
      try { await ajustarCapa(g); } finally { encaixar.classList.remove('girando'); }
    };
    art.appendChild(encaixar);
    card.appendChild(art);
    card.appendChild(el('div', 'card-title', g.title));
    card.appendChild(el('div', 'card-sub', `${g.kind === 'rom' ? 'Emulador' : meta.label}${g.sizeOnDisk ? ' · ' + fmtSize(g.sizeOnDisk) : ''}`));
    if (g.alsoOn && g.alsoOn.length) {
      const also = g.alsoOn.map(x => (SOURCE_META[x] ? SOURCE_META[x].label : x)).join(', ');
      card.appendChild(el('div', 'card-also', 'também em ' + also));
    }
    card.onclick = ev => cliqueComShift(g, ev);
    card.onkeydown = e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (e.shiftKey) launch(g); else openDetail(g);
      }
    };
    frag.appendChild(card);
  });
  grid.appendChild(frag);
}


/* ---------- agrupamento: gênero / plataforma-console / origem ---------- */

function groupGames(games) {
  const mode = ui.groupBy;
  if (mode === 'none') return [{ key: null, title: null, games }];

  const buckets = new Map();
  const push = (key, title, meta, game) => {
    if (!buckets.has(key)) buckets.set(key, { key, title, meta: meta || {}, games: [] });
    buckets.get(key).games.push(game);
  };

  if (mode === 'genre') {
    for (const g of games) {
      const list = Array.isArray(g.genres) && g.genres.length ? g.genres : ['sem-genero'];
      // um jogo pode aparecer em mais de um gênero
      for (const key of list) {
        const info = key === 'sem-genero'
          ? { label: 'Sem gênero', icon: '❔', color: '#5d687e' }
          : genreInfo(key);
        push(key, `${info.icon} ${info.label}`, { color: info.color }, g);
      }
    }
    // ordena: COM gênero (por quantidade) e "sem gênero" no fim
    return [...buckets.values()].sort((a, b) => {
      if (a.key === 'sem-genero') return 1;
      if (b.key === 'sem-genero') return -1;
      return b.games.length - a.games.length || a.title.localeCompare(b.title, 'pt-BR');
    });
  }

  if (mode === 'platform') {
    for (const g of games) {
      const key = (g.platformKey || g.platform || 'outros');
      push(key, g.platform || key, {}, g);
    }
    return [...buckets.values()].sort((a, b) => b.games.length - a.games.length || String(a.title).localeCompare(String(b.title)));
  }

  if (mode === 'source') {
    for (const g of games) {
      const meta = SOURCE_META[g.source] || { label: g.source, color: '#8792a8' };
      push(g.source, meta.label, { color: meta.color }, g);
    }
    return [...buckets.values()].sort((a, b) => b.games.length - a.games.length);
  }

  return [{ key: null, title: null, games }];
}

function renderGrouped(games, favs) {
  const grid = $('#grid');
  grid.innerHTML = '';
  const groups = groupGames(games);
  if (ui.groupBy === 'none') { renderGrid(games, favs); return; }

  const wrap = document.createDocumentFragment();
  for (const group of groups) {
    const section = el('section', 'group');
    const head = el('div', 'group-head');
    if (group.meta && group.meta.color) {
      const dot = el('i', 'dot-lg');
      dot.style.background = group.meta.color;
      head.appendChild(dot);
    }
    head.appendChild(el('h3', null, group.title));
    head.appendChild(el('span', 'count', String(group.games.length)));
    head.appendChild(el('span', 'gbar'));
    const col = el('button', 'collapser', 'recolher');
    head.appendChild(col);
    section.appendChild(head);

    const inner = el('div', 'grid');
    section.appendChild(inner);
    wrap.appendChild(section);

    col.onclick = () => {
      section.classList.toggle('collapsed');
      col.textContent = section.classList.contains('collapsed') ? 'expandir' : 'recolher';
    };

    // reaproveita o renderizador de cards
    const saved = $('#grid');
    inner.id = 'grid-' + group.key;
    renderCardsInto(inner, group.games, favs);
    void saved;
  }
  grid.appendChild(wrap);
}

/* ---------- abrir jogo ---------- */
/**
 * Regra de clique em QUALQUER lugar que represente um jogo:
 *   clique normal  → abre a ficha (informações) do jogo
 *   Shift + clique → inicia o jogo na hora
 * Aceita teclado também: Shift+Enter faz o mesmo que Shift+clique.
 */
function cliqueComShift(game, ev) {
  const comShift = !!(ev && ev.shiftKey);
  if (comShift) launch(game);
  else openDetail(game);
}

async function launch(game) {
  if (game.kind === 'rom' && !hasEmulator(game)) {
    openDetail(game);
    toast(`Configure o emulador de ${game.platform} em Ajustes › Emuladores`, 'err');
    return;
  }
  const r = await api.launch(game.id);
  if (!r.ok) {
    toast(r.error || 'Não consegui abrir esse jogo', 'err');
    return;
  }
  toast(r.data && r.data.timed === 'pasta'
    ? `Abrindo ${game.title}… o tempo começa a contar quando o jogo abrir`
    : `Abrindo ${game.title}…`, 'ok');
  // atualiza "última vez jogado"
  game.playedAt = Date.now();
  render();
}

/* ---------- corrigir caminho de um jogo cujo arquivo sumiu ---------- */
const EXT_ROMS = ['nes', 'sfc', 'smc', 'n64', 'z64', 'v64', 'gb', 'gbc', 'gba', 'nds', '3ds', 'cia', 'iso', 'cue', 'bin', 'chd', 'pbp', 'm3u', 'gdi', 'cdi', 'cso',
  'md', 'gen', 'smd', 'sms', 'gg', 'pce', 'zip', '7z', 'rvz', 'wbfs', 'gcm', 'gcz', 'wud', 'wux', 'rpx', 'nsp', 'xci', 'a26', 'a78', 'd64', 'ws', 'wsc', 'ngp', 'vb'];

async function corrigirCaminho(game) {
  const launchInfo = game.launch || {};
  const rom = game.kind === 'rom' || launchInfo.type === 'rom';
  const r = await api.pickFile({
    title: rom ? `Onde está a ROM de ${game.title}?` : `Onde está o executável de ${game.title}?`,
    filters: rom ? [{ name: 'ROMs', extensions: EXT_ROMS }] : [{ name: 'Executáveis', extensions: ['exe', 'bat', 'cmd', 'lnk'] }]
  });
  if (!r.ok || !r.data || !r.data[0]) return false;
  const novo = r.data[0];
  const launch = rom ? { ...launchInfo, type: 'rom', rom: novo }
    : launchInfo.type === 'gog' ? { ...launchInfo, exe: novo }
      : { ...launchInfo, type: 'exe', exe: novo };
  const pasta = novo.replace(/[\\/][^\\/]+$/, '');
  const up = await api.updateGame({ id: game.id, patch: { launch, installDir: pasta } });
  if (!up.ok) { toast(up.error || 'Não consegui salvar o caminho', 'err'); return false; }
  const st = await api.getState();
  if (st.ok) ui.state = st.data;
  render();
  toast(`${game.title}: caminho corrigido`, 'ok');
  return true;
}
const problemaDeArquivo = g => !!(g && g.problem && /não encontrad/i.test(g.problem) && !/emulador/i.test(g.problem));

function hasEmulator(game) {
  const s = ui.state.settings;
  if (!game.platformKey) return game.launch.type !== 'rom';
  const emu = (s.emulators || {})[game.platformKey];
  if (emu && emu.exe) return true;
  if (s.retroarch && s.retroarch.exe) return true;
  // no modo demo não bloqueia
  return !window.arcadeAPI;
}

/* ---------- modal detalhes ---------- */
function openDetail(game) {
  ui.jogoNaFicha = game;          // usado pelo controle (X inicia direto)
  const s = ui.state;
  const fav = (s.favorites || []).includes(game.id);
  paintArt($('#d-art'), game);

  const badge = scoreBadge(game);
  if (badge) $('#d-art').appendChild(badge);

  const meta = SOURCE_META[game.source] || { label: game.source };
  const launchInfo = game.launch || {};            // jogo malformado não pode quebrar o painel
  $('#d-source').textContent = meta.label;
  $('#d-platform').textContent = game.platform || 'PC';
  $('#d-size').textContent = fmtSize(game.sizeOnDisk) || '';
  $('#d-title').textContent = game.title;
  $('#d-path').textContent = launchInfo.type === 'rom'
    ? (launchInfo.rom || '— arquivo não definido')
    : (launchInfo.exe || launchInfo.url || game.installDir || launchInfo.type || '— sem origem definida');
  $('#d-last').textContent = fmtDate(game.playedAt);
  const ptMs = (game.playtime && game.playtime.totalMs) || 0;
  const sess = (game.playtime && game.playtime.sessions) || 0;
  $('#d-playtime').textContent = ptMs ? `${fmtPlaytime(ptMs)}${sess ? ` (${sess} ${sess === 1 ? 'sessão' : 'sessões'})` : ''}` : 'nunca contado';
  $('#d-added').textContent = fmtDate(game.addedAt);
  $('#d-how').textContent = {
    steam: 'via Steam', epic: 'via Epic Games', gog: 'via GOG', exe: 'executável direto',
    rom: 'emulador', url: 'no navegador'
  }[launchInfo.type] || '— origem desconhecida';
  $('#d-fav').textContent = fav ? '★ Remover dos favoritos' : '☆ Favoritar';

  const warn = $('#d-warn');
  if (!game.launch || (!launchInfo.exe && !launchInfo.rom && !launchInfo.url && !launchInfo.appId && !launchInfo.appName)) {
    warn.hidden = false;
    warn.textContent = 'Este jogo está incompleto (sem executável, ROM ou link). Use Editar para apontar o arquivo.';
  } else if (game.kind === 'rom' && !hasEmulator(game)) {
    warn.hidden = false;
    warn.textContent = `Nenhum emulador configurado para ${game.platform}. Abra Ajustes › Emuladores e aponte o executável (ou o RetroArch).`;
  } else if (problemaDeArquivo(game)) {
    warn.hidden = false;
    warn.textContent = game.kind === 'rom'
      ? 'O arquivo desta ROM não está mais no caminho salvo (foi movido ou apagado?).'
      : 'O executável deste jogo não está mais no caminho salvo (foi movido ou desinstalado?).';
    const fix = el('button', 'ghost-btn detail-warn-acao', 'Apontar o arquivo');
    fix.onclick = async () => {
      if (await corrigirCaminho(game)) {
        const novo = ui.state.games.find(g => g.id === game.id);
        if (novo) openDetail(novo);
      }
    };
    warn.appendChild(fix);
  } else {
    warn.hidden = true;
  }

  // clicar na capa grande também inicia o jogo
  const artBox = $('#d-art');
  artBox.style.cursor = 'pointer';
  artBox.title = `Clique na capa para iniciar ${game.title}`;
  // dentro da ficha, clicar na capa inicia (o usuário já está na tela do jogo)
  artBox.onclick = () => { closeModal($('#modal-game')); launch(game); };

  $('#d-play').onclick = () => { closeModal($('#modal-game')); launch(game); };
  // ficha (Metacritic/Wikidata/Steam)
  if (game.meta) renderFicha(game.meta, game);
  else renderFicha(null, game);
  loadMeta(game);

  $('#d-refresh-meta').onclick = () => { $('#d-links').innerHTML = '<span class="ficha-loading"><i></i>Atualizando…</span>'; loadMeta(game, { refresh: true }); };
  $('#d-cover').onclick = () => openCovers(game);
  $('#d-fav').onclick = async () => {
    const r = await api.toggleFavorite(game.id);
    if (r.ok) { ui.state.favorites = r.data; render(); openDetail(game); }
  };
  $('#d-folder').onclick = () => {
    const p = game.installDir || (game.launch && (game.launch.exe || game.launch.rom));
    if (!game.launch || launchInfo.type === 'url') return toast('Esse item não tem pasta local', 'err');
    if (!p) return toast('Esse jogo não tem pasta local', 'err');
    api.openPath(p).then(r => { if (!r.ok) toast(r.error, 'err'); });
  };
  $('#d-edit').onclick = () => { closeModal($('#modal-game')); openEditor(game); };
  $('#d-remove').onclick = async () => {
    if (!confirm(`Remover "${game.title}" do Arcade Hub?\n\nO jogo continua instalado no PC — isso só tira ele do launcher.`)) return;
    const r = await api.removeGame(game.id);
    if (r.ok) {
      ui.state.games = ui.state.games.filter(g => g.id !== game.id);
      closeModal($('#modal-game'));
      render();
      toast('Jogo removido do launcher', 'ok');
    } else toast(r.error, 'err');
  };

  showModal($('#modal-game'));
}

/* ---------- modal edição / adicionar ---------- */
function setType(type) {
  ui.type = type;
  $$('#e-type button').forEach(b => b.classList.toggle('active', b.dataset.type === type));
  $$('#modal-edit .field[data-for]').forEach(f => {
    f.hidden = !f.dataset.for.split(' ').includes(type);
  });
  $('#e-file-label').textContent = type === 'rom' ? 'Arquivo da ROM' : 'Executável (.exe)';
}

function renderGenrePicker(selected) {
  const box = $('#e-genres');
  box.innerHTML = '';
  const chosen = new Set(selected || []);
  for (const g of GENRES) {
    const b = el('button', chosen.has(g.key) ? 'on' : '');
    b.type = 'button';
    b.textContent = `${g.icon} ${g.label}`;
    b.dataset.key = g.key;
    b.onclick = () => {
      if (chosen.has(g.key)) { chosen.delete(g.key); b.classList.remove('on'); }
      else { chosen.add(g.key); b.classList.add('on'); }
    };
    box.appendChild(b);
  }
}

function selectedGenres() {
  return [...$$('#e-genres button.on')].map(b => b.dataset.key);
}

function fillPlatformSelect(selected) {
  const sel = $('#e-platform');
  sel.innerHTML = '';
  const map = emulatorMap();
  for (const k of Object.keys(map)) {
    const o = el('option');
    o.value = k;
    o.textContent = map[k].label || k;
    if (selected === k) o.selected = true;
    sel.appendChild(o);
  }
}

function openEditor(game) {
  ui.editingId = game ? game.id : null;
  ui.pickPaths = { exe: '', rom: '', art: '' };
  $('#e-heading').textContent = game ? 'Editar jogo' : 'Adicionar jogo';
  $('#e-title').value = game ? game.title : '';
  $('#e-args').value = game && game.launch.args ? game.launch.args : '';
  $('#e-url').value = game && (game.launch.type === 'url' || game.launch.type === 'steam') ? (game.launch.url || '') : '';
  $('#e-path').value = game ? (game.launch.exe || game.launch.rom || '') : '';
  $('#e-art').value = game && (game.customArt || game.art) ? (game.customArt || game.art) : '';
  ui.pickPaths.art = $('#e-art').value;

  const type = !game ? 'exe' : (game.kind === 'rom' ? 'rom' : (game.launch.type === 'exe' ? 'exe' : 'url'));
  setType(type);
  fillPlatformSelect(game && game.platformKey);

  $('#e-browse').onclick = async () => {
    const rom = ui.type === 'rom';
    const r = await api.pickFile({
      title: rom ? 'Escolha a ROM' : 'Escolha o executável',
      filters: rom
        ? [{ name: 'ROMs', extensions: ['nes', 'sfc', 'smc', 'n64', 'z64', 'gb', 'gbc', 'gba', 'nds', 'iso', 'cue', 'chd', 'md', 'bin', 'zip', '7z', 'rvz', 'wbfs', 'cia', 'nsp', 'xci'] }]
        : [{ name: 'Executáveis', extensions: ['exe', 'bat', 'cmd', 'lnk'] }]
    });
    if (r.ok && r.data && r.data[0]) {
      const p = r.data[0];
      if (rom) ui.pickPaths.rom = p; else ui.pickPaths.exe = p;
      $('#e-path').value = p;
      if (!$('#e-title').value.trim()) {
        const base = p.split(/[\\/]/).pop().replace(/\.[^.]+$/, '').replace(/[-_.]+/g, ' ').trim();
        $('#e-title').value = base;
      }
    }
  };

  $('#e-art-browse').onclick = async () => {
    const r = await api.pickFile({ title: 'Escolha a capa', filters: [{ name: 'Imagens', extensions: ['jpg', 'jpeg', 'png', 'webp'] }] });
    if (r.ok && r.data && r.data[0]) {
      const p = r.data[0];
      ui.pickPaths.art = p;
      $('#e-art').value = p;
    }
  };

  $('#e-art-web').onclick = () => {
    if (ui.editingId) {
      const g = ui.state.games.find(x => x.id === ui.editingId);
      if (g) { closeModal($('#modal-edit')); openCovers(g); return; }
    }
    // jogo novo: salva primeiro e depois abre o seletor de capa
    toast('Salve o jogo primeiro — depois é só clicar em "Trocar capa"', 'err');
  };
  renderGenrePicker(game ? game.genres : []);
  $('#e-save').onclick = saveGame;
  showModal($('#modal-edit'));
}

async function saveGame() {
  const title = $('#e-title').value.trim();
  if (!title) { toast('Dá um nome pro jogo', 'err'); return; }

  let launch, kind = 'game', platform = 'PC', platformKey;
  if (ui.type === 'exe') {
    const exe = $('#e-path').value.trim();
    if (!exe) { toast('Escolha o executável do jogo', 'err'); return; }
    launch = { type: 'exe', exe, args: $('#e-args').value.trim() };
  } else if (ui.type === 'rom') {
    const rom = $('#e-path').value.trim();
    if (!rom) { toast('Escolha o arquivo da ROM', 'err'); return; }
    platformKey = $('#e-platform').value;
    platform = (emulatorMap()[platformKey] || {}).label || platformKey.toUpperCase();
    kind = 'rom';
    launch = { type: 'rom', rom, platform: platformKey };
  } else {
    const url = $('#e-url').value.trim();
    if (!url) { toast('Cole um link (ex.: steam://rungameid/12345)', 'err'); return; }
    if (/^steam:\/\/rungameid\/(\d+)/.test(url)) {
      launch = { type: 'steam', appId: RegExp.$1 };
    } else if (/^com\.epicgames\.launcher:\/\//.test(url)) {
      launch = { type: 'epic', appName: url.split('/').pop().split('?')[0] };
    } else if (/^https?:\/\//.test(url)) {
      launch = { type: 'url', url };          // abre no navegador padrão
    }
    launch = launch || { type: 'url', url };
  }

  const payload = {
    title,
    genres: selectedGenres(),
    genresSource: selectedGenres().length ? 'manual' : null,
    platform,
    platformKey,
    kind,
    launch,
    art: ui.pickPaths.art || null,
    customArt: ui.pickPaths.art || null,
    installDir: (launch.exe || launch.rom || '').replace(/[\\/][^\\/]+$/, '')
  };

  if (ui.editingId) {
    const r = await api.updateGame({ id: ui.editingId, patch: payload });
    if (!r.ok) { toast(r.error, 'err'); return; }
    ui.state.games = ui.state.games.map(g => (g.id === ui.editingId ? { ...g, ...payload } : g));
  } else {
    const r = await api.addGame(payload);
    if (!r.ok) { toast(r.error, 'err'); return; }
    const saved = { ...payload, id: (r.data && r.data.id) || 'tmp' + Date.now(), addedAt: Date.now() };
    ui.state.games = [...ui.state.games, saved];
  }
  closeModal($('#modal-edit'));
  render();
  toast(ui.editingId ? 'Jogo atualizado' : 'Jogo adicionado', 'ok');
  const eraEdicao = !!ui.editingId;
  ui.editingId = null;
  // jogo recém-adicionado: busca capa + ficha sem o usuário pedir
  if (!eraEdicao) enriquecerAutomatico();
}



/* ---------- menu de agrupamento ---------- */
function openGroupMenu(anchor) {
  closeGroupMenu();
  const menu = el('div', 'group-menu');
  const opts = [
    ['none', 'Sem agrupar'],
    ['genre', 'Agrupar por gênero'],
    ['platform', 'Agrupar por console / plataforma'],
    ['source', 'Agrupar por loja / origem']
  ];
  for (const [key, label] of opts) {
    const b = el('button', ui.groupBy === key ? 'on' : '');
    b.textContent = (ui.groupBy === key ? '✓ ' : '') + label;
    b.onclick = () => { ui.groupBy = key; ui.state.settings.groupBy = key; api.saveSettings({ groupBy: key }); closeGroupMenu(); render(); };
    menu.appendChild(b);
  }
  // atalho para classificar gêneros
  menu.appendChild(el('div', 'sep'));
  const falta = ui.state.games.filter(g => !Array.isArray(g.genres) || !g.genres.length).length;
  const auto = el('button', 'danger', `Classificar gêneros${falta ? ' (' + falta + ')' : ''}`);
  auto.style.color = 'var(--accent)';
  auto.onclick = () => { closeGroupMenu(); autoGenres(); };
  menu.appendChild(auto);

  const semNota = ui.state.games.filter(g => !g.meta || g.meta.score == null).length;
  const notasBtn = el('button', null, `Buscar notas do Metacritic${semNota ? ' (' + semNota + ')' : ''}`);
  notasBtn.style.color = '#4ade80';
  notasBtn.onclick = () => { closeGroupMenu(); primeScores(); };
  menu.appendChild(notasBtn);

  document.body.appendChild(menu);
  const r = anchor.getBoundingClientRect();
  menu.style.top = Math.round(r.bottom + 6) + 'px';
  menu.style.left = Math.round(Math.min(r.left, window.innerWidth - 220)) + 'px';
  setTimeout(() => document.addEventListener('mousedown', outside), 0);
  function outside(e) {
    if (!menu.contains(e.target)) closeGroupMenu();
  }
  menu._outside = outside;
}

function closeGroupMenu() {
  const m = document.querySelector('.group-menu');
  if (!m) return;
  if (m._outside) document.removeEventListener('mousedown', m._outside);
  m.remove();
}

/* ---------- classificar gêneros em lote ---------- */
async function autoGenres() {
  const faltando = ui.state.games.filter(g => !Array.isArray(g.genres) || !g.genres.length);
  if (!faltando.length) {
    toast('Todos os jogos já estão classificados', 'ok');
    return;
  }
  batchShow(`Gêneros: 0/${faltando.length}`);
  const off = api.onGenreProgress && api.onGenreProgress(({ done, total }) => batchUpdate(done, total));
  const r = await api.autoGenres({});
  if (typeof off === 'function') off();
  batchHide();
  if (!r.ok) { toast(r.error || 'Falha ao consultar gêneros', 'err'); return; }
  const { updated, failed = [], state } = r.data;
  if (state) ui.state = state;
  // se está agrupado por gênero, faz sentido ligar o agrupamento
  if (ui.groupBy === 'none' && updated) { ui.groupBy = 'genre'; }
  render();
  toast(`${updated} jogo(s) classificado(s)${failed.length ? ` · ${failed.length} sem resultado` : ''}`, 'ok');
}


/* ---------- ficha do jogo (Metacritic / Wikidata / Steam) ---------- */
const SOURCE_LABEL = { steam: 'Steam', metacritic: 'Metacritic', wikidata: 'Wikidata', heurística: 'heurística' };

/** Nota do Metacritic no canto da capa (null = ainda buscando). */
function scoreBadge(game) {
  const meta = game && game.meta;
  const pending = !meta;
  const raw = meta && meta.score;
  const score = Number.isFinite(Number(raw)) && raw !== '' && raw !== null ? Number(raw) : null;
  const b = el('div', 'card-score');
  if (pending) {
    b.classList.add('none');
    b.textContent = '…';
    b.title = 'Buscando nota no Metacritic…';
    return b;
  }
  if (score == null) {
    // jogos sem nota no Metacritic: badge discreto "SN" (sem nota)
    const sn = el('div', 'card-score none final');
    sn.textContent = 'SN';
    sn.title = `Sem nota no Metacritic${meta.sources && meta.sources.length ? ' (consultado: ' + meta.sources.join(' + ') + ')' : ''}`;
    return sn;
  }
  b.textContent = String(Math.round(score));
  b.classList.add(score >= 75 ? 'good' : score >= 50 ? 'mid' : 'bad');
  b.title = `Metacritic ${score}${meta.platformScore ? ` · ${meta.platformScore.platform} ${meta.platformScore.score}` : ''}` +
            `${meta.sources ? ' — fontes: ' + meta.sources.join(' + ') : ''}`;
  return b;
}

function scoreClass(n) {
  if (n == null) return '';
  if (n >= 75) return 'good';
  if (n >= 50) return 'mid';
  return 'bad';
}

function renderFicha(meta, jogo) {
  const box = $('#d-ficha');
  const scores = $('#d-scores');
  const facts = $('#d-facts');
  const desc = $('#d-desc');
  const links = $('#d-links');
  scores.innerHTML = ''; facts.innerHTML = ''; links.innerHTML = '';
  desc.textContent = '';

  if (!meta) { box.hidden = true; return; }
  box.hidden = false;

  // notas
  const addScore = (value, label, cls) => {
    if (value == null) return;
    const b = el('div', 'score-badge ' + (cls || scoreClass(value)));
    b.appendChild(el('b', null, String(value)));
    b.appendChild(el('span', null, label));
    scores.appendChild(b);
  };
  addScore(meta.score, 'Metacritic');
  if (meta.platformScore) addScore(meta.platformScore.score, String(meta.platformScore.platform).slice(0, 9));
  if (meta.score == null && meta.platformScore == null) {
    const b = el('div', 'score-badge src');
    b.appendChild(el('b', null, 'sem nota'));
    b.appendChild(el('span', null, 'fonte'));
    scores.appendChild(b);
  }

  // fatos
  const fact = (label, value) => {
    if (!value) return;
    const f = el('span', 'fact');
    f.innerHTML = `<b>${escapeHtml(label)}</b>${escapeHtml(String(value))}`;
    facts.appendChild(f);
  };
  // de onde veio o nome (identificação lida do .exe) — para você poder conferir
  if (jogo && jogo.ident) {
    const i = jogo.ident;
    const fonte = { productName: 'nome do produto', fileDescription: 'descrição do arquivo', pasta: 'nome da pasta', arquivo: 'nome do arquivo', originalFilename: 'nome interno' }[i.origem] || i.origem;
    fact('identificado', `${i.exe || 'exe'} · ${fonte}${i.empresa ? ' · ' + i.empresa : ''}`);
    if (i.versao) fact('versão', i.versao);
  }
  fact('ano', meta.year);
  fact('dev', (meta.developers || []).join(', '));
  fact('pub', (meta.publishers || []).join(', '));
  fact('faixa', meta.rating);
  const genres = Array.isArray(meta.genres) && meta.genres.length
    ? meta.genres.map(genreLabel).join(' · ')
    : (meta.genresRaw || []).slice(0, 5).join(' · ');
  fact('gêneros', genres);

  desc.textContent = meta.description || '';

  // links
  const link = (label, url) => {
    if (!url) return;
    const a = el('a', null, label);
    a.onclick = () => api.openPath ? window.open(url, '_blank') : null;
    if (window.arcadeAPI) {
      // no Electron abre no navegador padrão via shell (window.open é bloqueado)
      a.onclick = () => {
        const w = window.open(url, '_blank');
        if (!w) navigator.clipboard && navigator.clipboard.writeText(url);
      };
    }
    links.appendChild(a);
  };
  link('Metacritic ↗', meta.mcUrl);
  link('Wikidata ↗', meta.wikidataUrl);
  if (meta.steamAppId) link('Steam ↗', `https://store.steampowered.com/app/${meta.steamAppId}`);
  if ((meta.sources || []).length) {
    const src = el('span', 'muted small');
    src.style.marginLeft = 'auto';
    src.textContent = 'fontes: ' + meta.sources.map(x => SOURCE_LABEL[x] || x).join(' + ');
    links.appendChild(src);
  }
}

async function loadMeta(game, opts) {
  const box = $('#d-ficha');
  if (typeof api.lookupMeta !== 'function') { box.hidden = true; return; }   // build antigo/sem suporte
  if (!game.meta) {
    box.hidden = false;
    $('#d-scores').innerHTML = '';
    $('#d-facts').innerHTML = '';
    $('#d-desc').textContent = '';
    $('#d-links').innerHTML = '<span class="ficha-loading"><i></i>Procurando no Metacritic, Wikidata e Steam…</span>';
  }
  const r = await api.lookupMeta({ id: game.id, refresh: !!(opts && opts.refresh) });
  if (!r.ok) {
    $('#d-links').innerHTML = `<span class="muted small">Não consegui buscar a ficha (${escapeHtml(r.error || 'sem internet')}).</span>`;
    return;
  }
  const meta = r.data && r.data.meta;
  game.meta = meta;
  if (r.data && r.data.state) ui.state = r.data.state;
  renderFicha(meta, game);
  // atualiza a nota/capa na capa grande e nos cards, sem piscar a tela
  const artBox = $('#d-art');
  const old = artBox.querySelector('.card-score');
  if (old) old.remove();
  const fresh = scoreBadge(game);
  if (fresh) artBox.appendChild(fresh);
  if (meta && meta.art) game.art = meta.art;
  if (meta && meta.genres && meta.genres.length) {
    // o main pode ter definido os gêneros automaticamente
    game.genres = meta.genres;
  }
  render();
}



/* ---------- skins dos consoles ---------- */
const skinBrandOf = skin => {
  const c = (skin.console || '') + ' ' + skin.id;
  if (/Nintendo|NES|SNES|Game Boy|GameCube|Wii|Switch|3DS|DS/i.test(c)) return 'Nintendo';
  if (/PlayStation|PSP|Vita|PS\b/i.test(c)) return 'PlayStation';
  if (/Xbox/i.test(c)) return 'Xbox';
  return 'outros';
};

function currentSkinId() {
  return (ui.state && ui.state.settings && ui.state.settings.skin) || 'neon';
}

function applySkinId(id, opts) {
  if (typeof applySkin !== 'function') return;
  const skin = applySkin(id);
  // branding no topo (o "nome do console" vira o nome do launcher)
  const brand = document.querySelector('.brand-name');
  if (brand) {
    brand.innerHTML = `${escapeHtml(skin.brand)}<span>HUB</span>`;
    brand.title = `${skin.console} (${skin.year}) — skin do Arcade Hub`;
  }
  if (!opts || !opts.previewOnly) {
    document.querySelectorAll('.skin-card').forEach(c => c.classList.toggle('on', c.dataset.skin === skin.id));
  }
}

function skinPreviewNode(skin) {
  const wrap = el('div', 'skin-preview');
  wrap.style.background = skin.vars['--bg'] || '#111';
  // temas de dashboard: mostra o papel de parede e o tipo de layout
  if (skin.art) {
    wrap.style.backgroundImage = `url("${skin.art}")`;
    wrap.style.backgroundSize = 'cover';
    wrap.style.backgroundPosition = 'center';
    const tag = el('span', 'skin-tag', (DASHBOARD_TIPOS[skin.dashboard] || {}).nome || skin.dashboard);
    wrap.appendChild(tag);
  }
  const side = el('div', 'side');
  side.style.background = skin.vars['--panel'] || '#1b1b1b';
  const main = el('div', 'main');
  const l1 = el('div', 'line');
  l1.style.background = skin.vars['--accent'] || '#888';
  l1.style.width = '62%';
  const l2 = el('div', 'line');
  l2.style.background = skin.vars['--muted'] || '#888';
  l2.style.width = '40%';
  l2.style.opacity = '.5';
  const cards = el('div', 'cards');
  for (let i = 0; i < 3; i++) {
    const c = el('i');
    c.style.background = skin.vars['--panel-2'] || '#2a2a2a';
    c.style.boxShadow = `inset 0 -3px 0 ${i === 0 ? (skin.vars['--accent'] || '#888') : (skin.vars['--accent-2'] || '#555')}`;
    cards.appendChild(c);
  }
  main.append(l1, l2, cards);
  wrap.append(side, main);
  const dots = el('div', 'skin-dots');
  (skin.swatch || []).forEach(col => {
    const i = el('i');
    i.style.background = col;
    dots.appendChild(i);
  });
  wrap.appendChild(dots);
  if (skin.scanline) {
    const sb = el('span', 'skin-badge', 'CRT');
    wrap.appendChild(sb);
  }
  return wrap;
}

/* ==================================================================
 * LAYOUTS: grade | rondel
 * O layout é independente da skin de cor — dá para ter "SNES + rondel".
 * ================================================================== */

/* ==================================================================
 * TEMAS DE DASHBOARD
 * Um tema com `dashboard` (PS3, Xbox 360, Aurora…) troca a interface toda:
 * o palco #dashboard desenha o layout daquele console e as setas navegam.
 * ================================================================== */

function temaAtual() {
  // usa a skin REALMENTE aplicada na tela (o estado pode estar um passo atrás)
  const id = (typeof window !== 'undefined' && window.__skinAplicada) || currentSkinId();
  if (typeof SKINS === 'undefined') return null;
  return SKINS.find(s => s.id === id && s.dashboard) || null;
}

function montarDashboard(games) {
  Dashboards.montar(games, {
    onAbrir: jogo => openDetail(jogo),
    onJogar: jogo => launch(jogo),
    onContexto: (ev, jogo, alvo) => { if (menuDoJogo) menuDoJogo(ev, jogo, alvo); }
  });
}

/** Ao trocar de tema, redesenha (o dashboard muda junto). */
window.addEventListener('tema:change', (e) => {
  if (!ui.state) return;
  const id = e && e.detail && e.detail.skin ? e.detail.skin.id : null;
  // mantém o estado em sincronia: sem isso, trocar de tema salvava um e
  // desenhava o anterior, e o dashboard "voltava" sozinho
  if (id && ui.state.settings) ui.state.settings.skin = id;
  render();
});

/** No tema de dashboard o contador/legendas usam a cor do tema; nada a fazer aqui. */
function currentLayout() {
  const v = (ui.state && ui.state.settings && ui.state.settings.layout) || 'grade';
  return v === 'rondel' ? 'rondel' : 'grade';
}

function syncLayoutCards() {
  const atual = currentLayout();
  $$('#layout-grid .layout-card').forEach(c => c.classList.toggle('on', c.dataset.layout === atual));
}

async function aplicarLayout(layout) {
  const alvo = layout === 'rondel' ? 'rondel' : 'grade';
  if (ui.state) ui.state.settings = { ...(ui.state.settings || {}), layout: alvo };
  document.body.dataset.layout = alvo;
  syncLayoutCards();
  render();
  const r = await api.saveSettings({ layout: alvo });
  if (r && r.ok) { ui.state = r.data; syncLayoutCards(); render(); }
  return alvo;
}

/** Monta a roda com os jogos que passaram pelos filtros/busca. */
function montarRondel(games) {
  Rondel.ligarControles();
  Rondel.montar(games, {
    manterSelecionado: true,
    onAbrir: jogo => openDetail(jogo),
    onJogar: jogo => launch(jogo),        // Shift+clique no card central
    onContexto: (ev, jogo, card) => { if (menuDoJogo) menuDoJogo(ev, jogo, card); }
  });
  const jogar = $('#rondel-play');
  const det = $('#rondel-detalhes');
  const atual = () => Rondel.jogoAtual;
  if (jogar && !jogar.dataset.ligado) {
    jogar.dataset.ligado = '1';
    jogar.onclick = () => { const g = atual(); if (g) launch(g); };
    det.onclick = () => { const g = atual(); if (g) openDetail(g); };
    $('#rondel-esq').onclick = () => Rondel.anterior();
    $('#rondel-dir').onclick = () => Rondel.proximo();
  }
}

function renderSkinGrid(brand) {
  const box = $('#skin-grid');
  box.innerHTML = '';
  // 'dashboard' e 'rgh' são categorias novas; o resto continua filtrando por marca
  const RGH = new Set(['tema-aurora', 'tema-fsd', 'tema-xexmenu', 'tema-industrial']);
  const list = SKINS.filter(s => {
    if (!brand || brand === 'todos') return true;
    if (brand === 'dashboard') return !!s.dashboard && !RGH.has(s.id);
    if (brand === 'rgh') return RGH.has(s.id);
    if (brand === 'cor') return !s.dashboard;
    return skinBrandOf(s) === brand;
  });
  if (!list.length) { box.appendChild(el('div', 'covers-empty', 'Nenhuma skin nesse filtro')); return; }
  for (const skin of list) {
    const card = el('button', 'skin-card' + (skin.id === currentSkinId() ? ' on' : ''));
    card.type = 'button';
    card.dataset.skin = skin.id;
    card.appendChild(skinPreviewNode(skin));
    const meta = el('div', 'skin-meta');
    meta.appendChild(el('b', null, skin.name));
    meta.appendChild(el('span', null, skin.descricao
      ? skin.descricao
      : `${skin.console} · ${skin.year}`));
    card.appendChild(meta);
    // prévia ao vivo
    card.onmouseenter = () => applySkinId(skin.id, { previewOnly: true });
    card.onmouseleave = () => applySkinId(currentSkinId(), { previewOnly: true });
    card.onclick = async () => {
      applySkinId(skin.id);
      const r = await api.saveSettings({ skin: skin.id });
      if (r.ok) { ui.state = r.data; applySkinId(skin.id); }
      syncSkinSelect();
      toast(`Skin aplicada: ${skin.name}`, 'ok');
    };
    box.appendChild(card);
  }
}

function ligarSeletorLayout() {
  $$('#layout-grid .layout-card').forEach(c => {
    if (c.dataset.ligado) return;
    c.dataset.ligado = '1';
    c.onclick = async () => {
      const l = await aplicarLayout(c.dataset.layout);
      toast(l === 'rondel' ? 'Layout rondel ativado' : 'Layout grade ativado', 'ok');
    };
  });
}

function openSkins() {
  ligarSeletorLayout();
  renderSkinGrid('todos');
  syncLayoutCards();
  $$('#skin-filters button').forEach(b => b.classList.toggle('on', b.dataset.brand === 'todos'));
  showModal($('#modal-skins'));
}

function syncSkinSelect() {
  const sel = $('#opt-skin');
  if (!sel || typeof SKINS === 'undefined') return;
  sel.innerHTML = '';
  for (const skin of SKINS) {
    const o = el('option');
    o.value = skin.id;
    o.textContent = `${skin.name} — ${skin.console}`;
    if (skin.id === currentSkinId()) o.selected = true;
    sel.appendChild(o);
  }
}

/* ---------- jogar aleatório ---------- */
function playRandom() {
  const pool = visibleGames().filter(g => g.installed !== false);
  if (!pool.length) { toast('Nenhum jogo disponível para sortear', 'err'); return; }
  // sorteio com "ânimo": prioriza o que você não joga há mais tempo
  const pesos = pool.map(g => {
    const dias = g.playedAt ? (Date.now() - g.playedAt) / 864e5 : 60;
    return Math.min(60, Math.max(1, dias));
  });
  const total = pesos.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  let escolhido = pool[0];
  for (let i = 0; i < pool.length; i++) { r -= pesos[i]; if (r <= 0) { escolhido = pool[i]; break; } }
  toast(`Sorteado: ${escolhido.title}`, 'ok');
  openDetail(escolhido);
  const card = document.querySelector(`.card[data-id="${escolhido.id}"]`);
  if (card && typeof card.scrollIntoView === 'function') card.scrollIntoView({ block: 'center', behavior: 'smooth' });
}


/* ---------- detecção automática de emuladores ---------- */
async function detectEmulatorsUI() {
  const box = $('#detect-result');
  box.hidden = false;
  box.innerHTML = '<p class="detect-empty">Procurando emuladores nas pastas comuns…</p>';
  if (typeof api.detectEmulators !== 'function') {
    box.innerHTML = '<p class="detect-empty">Indisponível nesta versão.</p>';
    return;
  }
  const r = await api.detectEmulators({});
  if (!r.ok) { box.innerHTML = `<p class="detect-empty">Falhou: ${escapeHtml(r.error)}</p>`; return; }
  const { found = [], scanned = [] } = r.data;
  box.innerHTML = '';
  if (!found.length) {
    box.appendChild(el('p', 'detect-empty',
      `Nenhum emulador encontrado em ${scanned.length} pasta(s) verificada(s). Configure manualmente abaixo.`));
    return;
  }
  const cabeçalho = el('p', 'muted small');
  cabeçalho.textContent = `${found.length} emulador(es) encontrado(s) em ${scanned.length} pasta(s). Desmarque o que não quiser usar.`;
  box.appendChild(cabeçalho);

  for (const item of found) {
    const row = el('label', 'detect-row');
    const check = el('input');
    check.type = 'checkbox';
    check.checked = !item.alreadySet;
    check.dataset.exe = item.exe;
    row.appendChild(check);
    const info = el('div', 'info');
    info.appendChild(el('b', null, item.label));
    const plat = item.platforms.includes('*') ? 'todas as plataformas (RetroArch)' : item.platforms.join(', ');
    info.appendChild(el('span', null, `${item.exe} · ${plat}`));
    row.appendChild(info);
    if (item.cores) row.appendChild(el('span', 'tag', 'cores ok'));
    if (item.alreadySet) row.appendChild(el('span', 'tag', 'já configurado'));
    box.appendChild(row);
  }

  const acoes = el('div', 'row');
  acoes.style.marginTop = '8px';
  const aplicar = el('button', 'primary-btn', 'Aplicar selecionados');
  aplicar.onclick = async () => {
    const picks = [];
    for (const check of box.querySelectorAll('input[type=checkbox]:checked')) {
      const item = found.find(f => f.exe === check.dataset.exe);
      if (item) picks.push(item);
    }
    if (!picks.length) { toast('Nada selecionado', 'err'); return; }
    const res = await api.applyEmulators({ picks });
    if (!res.ok) { toast(res.error, 'err'); return; }
    if (res.data.state) ui.state = res.data.state;
    toast(`${res.data.applied} emulador(es) configurado(s)`, 'ok');
    closeAll();
    openSettings();
    $('#s-tabs button[data-tab="emulators"]')?.click();
  };
  acoes.appendChild(aplicar);
  box.appendChild(acoes);
}

/* ---------- diagnóstico ---------- */
async function renderDiagnostics() {
  const box = $('#diag-body');
  box.innerHTML = '<p class="muted small">Verificando…</p>';
  if (typeof api.diagnostics !== 'function') { box.innerHTML = '<p class="muted small">Indisponível nesta versão.</p>'; return; }
  const r = await api.diagnostics();
  if (!r.ok) { box.innerHTML = `<p class="diag-warn">Falhou: ${escapeHtml(r.error)}</p>`; return; }
  const d = r.data;
  box.innerHTML = '';

  // números
  const cards = el('div', 'diag-cards');
  const stat = (n, label) => {
    const c = el('div', 'diag-card');
    c.appendChild(el('b', null, String(n)));
    c.appendChild(el('span', null, label));
    cards.appendChild(c);
  };
  stat(d.counts.games, 'jogos');
  stat(d.counts.installed, 'instalados');
  stat(d.counts.roms, 'roms');
  stat(d.counts.withArt, 'com capa');
  stat(d.counts.withScore, 'com nota');
  stat(d.counts.withGenres, 'com gênero');
  box.appendChild(cards);

  // fontes da última varredura
  const rep = d.lastScanReport;
  if (rep && rep.sources) {
    const src = el('div', 'diag-sources');
    for (const [name, info] of Object.entries(rep.sources)) {
      const chip = el('span', 'diag-chip');
      const NOMES = { steam: 'Steam', epic: 'Epic', gog: 'GOG', pastas: 'pastas', roms: 'ROMs' };
      chip.innerHTML = `${escapeHtml(NOMES[name] || name)}: <b>${info.found}</b>${info.error ? ' ⚠' : ''} <em class="muted">${info.ms}ms</em>`;
      // detalhes da GOG (o que foi consultado e por que não achou)
      const dica = [info.registrosConsultados ? `${info.registrosConsultados} chaves do registro` : '',
        info.pastasProcuradas ? `${info.pastasProcuradas} pastas` : '', info.dica || ''].filter(Boolean);
      chip.title = info.error || dica.join(' · ') || '';
      src.appendChild(chip);
    }
    if (rep.duplicates) {
      const chip = el('span', 'diag-chip');
      chip.innerHTML = `duplicatas removidas: <b>${rep.duplicates}</b>`;
      src.appendChild(chip);
    }
    box.appendChild(src);
  }

  // problemas
  const linhas = (d.checks || []).map(c => {
    const line = el('div', 'diag-line');
    line.innerHTML = `<b class="${c.ok ? 'ok' : 'bad'}">${c.ok ? '✓' : '✕'}</b>
      <span>${escapeHtml(c.label)}</span><span class="path mono">${escapeHtml(c.detail || '')}</span>`;
    return line;
  });
  linhas.forEach(l => box.appendChild(l));

  // arquivos que sumiram: cada jogo com o caminho antigo e um botão para apontar o novo
  const faltando = [...(d.missing || []), ...(d.missingRoms || [])];
  if (faltando.length) {
    const w = el('div', 'diag-warn');
    const nExe = (d.missing || []).length, nRom = (d.missingRoms || []).length;
    w.textContent = [
      nExe ? `${nExe} jogo(s) apontam para um .exe que não existe mais no disco` : '',
      nRom ? `${nRom} ROM(s) não estão mais no caminho salvo` : ''
    ].filter(Boolean).join(' · ') + '. Aponte o arquivo novo ou remova da biblioteca:';
    box.appendChild(w);
    const lista = el('div', 'diag-fix');
    for (const item of faltando) {
      const game = ui.state.games.find(g => g.id === item.id);
      if (!game) continue;
      const linha = el('div', 'diag-fix-item');
      linha.appendChild(el('b', null, item.title));
      const caminho = el('span', 'path mono', item.path);
      caminho.title = item.path;
      linha.appendChild(caminho);
      const apontar = el('button', 'ghost-btn', 'Apontar arquivo');
      apontar.onclick = async () => { if (await corrigirCaminho(game)) renderDiagnostics(); };
      const remover = el('button', 'ghost-btn', 'Remover');
      remover.onclick = async () => {
        if (!confirm(`Remover "${game.title}" do Arcade Hub?\n\nIsso só tira o jogo do launcher.`)) return;
        const rr = await api.removeGame(game.id);
        if (!rr.ok) return toast(rr.error, 'err');
        ui.state.games = ui.state.games.filter(g => g.id !== game.id);
        render();
        renderDiagnostics();
      };
      linha.append(apontar, remover);
      lista.appendChild(linha);
    }
    box.appendChild(lista);
  }
  if (d.noEmulator && d.noEmulator.length) {
    const w = el('div', 'diag-warn');
    w.textContent = `Sem emulador configurado para: ${d.noEmulator.join(', ')}. ROMs dessas plataformas não abrem.`;
    box.appendChild(w);
  }
  if (!linhas.length && !(d.missing || []).length) {
    box.appendChild(el('p', 'muted small', 'Nenhuma pasta ou emulador configurado ainda.'));
  }

  const dir = el('p', 'muted small mono');
  dir.textContent = `dados: ${d.dataDir} · ${d.versions.os} · Electron ${d.versions.electron}`;
  box.appendChild(dir);
}

/* ---------- backup ---------- */
async function exportLibrary() {
  if (typeof api.exportLibrary !== 'function') return toast('Indisponível nesta versão', 'err');
  const r = await api.exportLibrary();
  if (!r.ok) return toast(r.error || 'Falha ao exportar', 'err');
  if (r.data && r.data.canceled) return;
  const tam = r.data.bytes > 1024 * 1024 ? `${(r.data.bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.round(r.data.bytes / 1024)} KB`;
  toast(`Backup salvo: ${r.data.games} jogos${r.data.capas ? ` e ${r.data.capas} capas` : ''} (${tam})`, 'ok');
}

async function importLibrary() {
  if (typeof api.importLibrary !== 'function') return toast('Indisponível nesta versão', 'err');
  const r = await api.importLibrary('merge');
  if (!r.ok) return toast(r.error || 'Falha ao importar', 'err');
  if (r.data && r.data.canceled) return;
  if (r.data.state) ui.state = r.data.state;
  render();
  toast(`Importado: ${r.data.added} novo(s), ${r.data.updated} atualizado(s)${r.data.capas ? `, ${r.data.capas} capas` : ''}`, 'ok');
}

/* ---------- modal de capas ---------- */
function openCovers(game) {
  ui.coverGame = game;
  paintArt($('#cv-preview'), game);
  $('#cv-title').textContent = game.title;
  $('#cv-sub').textContent = game.kind === 'rom'
    ? `Boxarts oficiais do acervo Libretro para ${game.platform}.`
    : 'Capas oficiais da Steam (e do SteamGridDB, se você configurou a chave em Ajustes).';
  $('#cv-query').value = game.title;
  $('#cv-results').innerHTML = '';
  $('#cv-status').textContent = '';
  showModal($('#modal-covers'));
  doCoverSearch();
}

async function doCoverSearch() {
  const game = ui.coverGame;
  if (!game) return;
  const query = ($('#cv-query').value || game.title).trim();
  const box = $('#cv-results');
  const status = $('#cv-status');
  box.innerHTML = '<div class="covers-empty">Buscando capas…</div>';
  status.textContent = '';

  const r = await api.searchCovers({ id: game.id, title: query });
  if (!r.ok) {
    box.innerHTML = `<div class="covers-empty">Não consegui buscar: ${escapeHtml(r.error)}</div>`;
    return;
  }
  const { candidates = [], warnings = [] } = r.data || {};
  if (warnings.length) status.textContent = warnings.join(' · ');
  if (!candidates.length) {
    box.innerHTML = '<div class="covers-empty">Nada encontrado com esse nome. Tente encurtar (ex.: só "Metroid") ou use uma imagem do seu PC.</div>';
    return;
  }
  box.innerHTML = '';
  candidates.forEach((c, i) => {
    const btn = el('button', 'cover-opt' + (c.kind === 'vertical' ? ' vertical-badge' : ''));
    btn.type = 'button';
    const img = el('img');
    img.loading = 'lazy';
    img.alt = c.label || 'capa';
    img.src = c._dataUri || c.thumbUrl || c.url;
    img.onerror = () => {
      // segunda tentativa na URL original; se falhar, o quadro avisa
      if (img.dataset.tentou !== '1') {
        img.dataset.tentou = '1';
        img.src = c.url;
      } else {
        btn.classList.add('capa-quebrada');
        btn.appendChild(el('span', 'capa-erro', 'imagem indisponível'));
      }
    };
    btn.appendChild(img);
    // rótulo único e legível: "PlayStation · capa" ou "Wikipedia · capa"
    const FONTE = { libretro: 'retrô', steamgriddb: 'comunidade', steam: 'steam', wikipedia: 'wikipedia' };
    const TIPO = { Named_Boxarts: 'capa', Named_Snaps: 'screenshot', Named_Titles: 'título' };
    const console_ = c.system ? c.system.split(' - ').pop() : '';
    const tag = el('span', 'tagline');
    const partes = [console_ || FONTE[c.source] || c.source];
    if (c.folder && TIPO[c.folder]) partes.push(TIPO[c.folder]);
    else if (c.kind !== 'vertical') partes.push(c.kind === 'horizontal' ? 'horizontal' : 'quadrada');
    tag.textContent = partes.join(' · ');
    tag.title = c.label || '';
    btn.appendChild(tag);
    btn.title = c.label || c.url;
    btn.onclick = () => pickCover(c);
    if (i === 0) btn.classList.add('picked');
    box.appendChild(btn);
  });
}

async function pickCover(candidate) {
  const game = ui.coverGame;
  if (!game) return;
  const status = $('#cv-status');
  status.textContent = 'Baixando capa…';
  const r = await api.applyCover({ id: game.id, candidate });
  if (!r.ok) { status.textContent = 'Falhou: ' + r.error; return; }
  const art = (r.data && r.data.art) || candidate.url;
  game.art = art;
  game.customArt = art;
  if (r.data && r.data.state) ui.state = r.data.state;
  status.textContent = 'Capa aplicada ✓';
  paintArt($('#cv-preview'), game);
  $$('#cv-results .cover-opt').forEach((b, i) => b.classList.toggle('picked', i === 0));
  render();
  toast('Capa atualizada', 'ok');
}

async function pickLocalCover() {
  const game = ui.coverGame;
  if (!game) return;
  const r = await api.pickFile({ title: 'Escolha a imagem da capa', filters: [{ name: 'Imagens', extensions: ['jpg', 'jpeg', 'png', 'webp'] }] });
  if (!r.ok || !r.data || !r.data[0]) return;
  const status = $('#cv-status');
  status.textContent = 'Processando imagem…';
  const res = await api.applyLocalCover({ id: game.id, filePath: r.data[0] });
  if (!res.ok) { status.textContent = 'Falhou: ' + res.error; return; }
  game.art = res.data.art;
  game.customArt = res.data.art;
  if (res.data.state) ui.state = res.data.state;
  paintArt($('#cv-preview'), game);
  status.textContent = 'Imagem aplicada ✓';
  render();
  toast('Capa atualizada', 'ok');
}

async function clearCover() {
  const game = ui.coverGame;
  if (!game) return;
  const r = await api.updateGame({ id: game.id, patch: { art: null, customArt: null, coverSource: null } });
  if (r.ok) {
    game.art = null;
    game.customArt = null;
    paintArt($('#cv-preview'), game);
    $('#cv-status').textContent = 'Capa removida';
    render();
  }
}



/* ---------- busca em lote: barra de progresso + cancelar ---------- */
function batchShow(label) {
  const bar = $('#batch-bar');
  bar.hidden = false;
  $('#batch-label').textContent = label;
  $('#batch-progress').style.width = '0%';
  $('#batch-cancel').onclick = async () => {
    if (typeof api.cancelBatch === 'function') await api.cancelBatch('all');
    $('#batch-label').textContent = 'Cancelando…';
  };
}
function batchUpdate(done, total) {
  if ($('#batch-bar').hidden) return;
  $('#batch-progress').style.width = Math.round((done / Math.max(total, 1)) * 100) + '%';
  $('#batch-label').textContent = `Buscando ${done}/${total}`;
}
function batchHide() { $('#batch-bar').hidden = true; }


/* ---------- enriquecimento automático (sem clicar em nada) ---------- */
/**
 * Fila única: capa primeiro (é o que se vê), depois ficha/nota/gêneros.
 * Roda sozinha em 4 momentos: ao abrir o app, após uma varredura, ao adicionar
 * um jogo na mão e quando o jogador salva/configura algo que muda a biblioteca.
 * Nunca repete o que já foi baixado e respeita o botão Cancelar.
 */
let enriquecendo = null;

function precisaDeArte(g) { return !g.art; }
function precisaDeInfo(g) { return !g.meta || g.meta.score == null; }

async function enriquecerAutomatico(opts) {
  const forcar = !!(opts && opts.forcar);
  if (enriquecendo) return enriquecendo;          // uma fila por vez
  const semArte = ui.state.games.filter(precisaDeArte);
  const semInfo = ui.state.games.filter(precisaDeInfo);
  if (!semArte.length && !semInfo.length && !forcar) return null;

  enriquecendo = (async () => {
    try {
      // 1) CAPAS — o que o usuário vê primeiro
      if (semArte.length && typeof api.autoCovers === 'function') {
        batchShow(`Baixando capas: 0/${semArte.length}`);
        const offArt = api.onCoverProgress && api.onCoverProgress(({ done, total }) => batchUpdate(done, total));
        try {
          // ids explícitos evita reprocessar a biblioteca inteira a cada abertura
          const r = await api.autoCovers({ ids: semArte.map(g => g.id) });
          if (r.ok && r.data && r.data.state) { ui.state = r.data.state; render(); }
        } catch { /* sem internet: a fila de info ainda tenta */ }
        finally { if (typeof offArt === 'function') offArt(); }
      }
      // 2) INFORMAÇÕES (nota, gênero, ficha, descrição)
      const aindaSemInfo = ui.state.games.filter(precisaDeInfo);
      if ((aindaSemInfo.length || forcar) && typeof api.primeMeta === 'function') {
        batchShow(`Baixando informações: 0/${aindaSemInfo.length}`);
        const offMeta = api.onMetaProgress && api.onMetaProgress(({ done, total }) => batchUpdate(done, total));
        try {
          const r = await api.primeMeta({ ids: aindaSemInfo.map(g => g.id), limit: 400 });
          if (r.ok && r.data && r.data.state) { ui.state = r.data.state; render(); }
        } catch { /* silencioso: o selo do card continua mostrando "…" */ }
        finally { if (typeof offMeta === 'function') offMeta(); }
      }
    } finally {
      batchHide();
      enriquecendo = null;
      render();
    }
  })();
  return enriquecendo;
}

/* ---------- notas do Metacritic em segundo plano (para os cards) ---------- */
let priming = false;

async function primeScores() {
  if (priming) return;
  if (typeof api.primeMeta !== 'function') return;
  const pendentes = ui.state.games.filter(g => !g.meta);
  if (!pendentes.length) return;
  priming = true;
  batchShow(`Notas: 0/${pendentes.length}`);
  const off = api.onMetaProgress && api.onMetaProgress(({ done, total }) => batchUpdate(done, total));
  try {
    const r = await api.primeMeta({ limit: 120 });
    if (r.ok) {
      if (r.data.state) ui.state = r.data.state;
      render();
      const comNota = ui.state.games.filter(g => g.meta && g.meta.score != null).length;
      toast(r.data.cancelled
        ? `Busca cancelada — ${comNota} jogos com nota`
        : `Notas prontas: ${comNota} de ${ui.state.games.length} jogos`, 'ok');
    }
  } catch (e) {
    toast('Não consegui buscar as notas agora', 'err');
  } finally {
    if (typeof off === 'function') off();
    batchHide();
    priming = false;
  }
}

/* ---------- capas em lote ---------- */
async function autoCovers() {
  const faltandoCapa = ui.state.games.filter(g => !g.art).length;
  batchShow(`Capas: 0/${faltandoCapa}`);
  const off = api.onCoverProgress && api.onCoverProgress(({ done, total }) => batchUpdate(done, total));
  const r = await api.autoCovers({});
  if (typeof off === 'function') off();
  batchHide();
  if (!r.ok) { toast(r.error || 'Falha ao buscar capas', 'err'); return; }
  const { updated, failed = [], state } = r.data;
  if (state) ui.state = state;
  render();
  toast(`${updated} capa(s) adicionada(s)${failed.length ? ` · ${failed.length} sem resultado` : ''}`, 'ok');
  if (failed.length) console.warn('Sem capa:', failed);
}

/* ---------- ajustes ---------- */
function openSettings() {
  const s = ui.state.settings;

  const renderList = (listId, folders, key) => {
    const ul = $(listId);
    ul.innerHTML = '';
    if (!folders.length) {
      ul.appendChild(el('li', 'none', 'Nenhuma pasta adicionada'));
    }
    folders.forEach((f, i) => {
      const li = el('li');
      li.appendChild(el('span', 'mono', f));
      const rm = el('button', null, 'remover');
      rm.onclick = async () => {
        const patch = { [key]: folders.filter((_, j) => j !== i) };
        const r = await api.saveSettings(patch);
        if (r.ok) { ui.state = r.data; openSettings(); }
      };
      li.appendChild(rm);
      ul.appendChild(li);
    });
  };

  renderList('#list-folders', s.folders || [], 'folders');
  renderList('#list-romfolders', s.romFolders || [], 'romFolders');

  $('#add-folder').onclick = async () => {
    const r = await api.pickFolders();
    if (r.ok && r.data.length) {
      const rr = await api.saveSettings({ folders: [...new Set([...(s.folders || []), ...r.data])] });
      if (rr.ok) { ui.state = rr.data; openSettings(); }
    }
  };
  $('#add-romfolder').onclick = async () => {
    const r = await api.pickFolders();
    if (r.ok && r.data.length) {
      const rr = await api.saveSettings({ romFolders: [...new Set([...(s.romFolders || []), ...r.data])] });
      if (rr.ok) { ui.state = rr.data; openSettings(); }
    }
  };

  // pasta de vídeos (trailers do rondel)
  // a pasta de vídeos é UMA só: a lista recebe um item ou nenhum
  if (s.videoFolder) {
    const ul = $('#list-videofolder');
    ul.innerHTML = '';
    const li = el('li');
    li.appendChild(el('span', 'mono', s.videoFolder));
    const rm = el('button', null, 'remover');
    rm.onclick = async () => {
      const rr = await api.saveSettings({ videoFolder: '' });
      if (rr.ok) { ui.state = rr.data; openSettings(); }
    };
    li.appendChild(rm);
    ul.appendChild(li);
  } else {
    const ul = $('#list-videofolder');
    ul.innerHTML = '';
    ul.appendChild(el('li', 'none', 'Nenhuma pasta (o rondel baixa trailers do Steam quando precisar)'));
  }
  const btnVideo = $('#add-videofolder');
  if (btnVideo) {
    btnVideo.onclick = async () => {
      const r = await api.pickFolders();
      if (r.ok && r.data.length) {
        const rr = await api.saveSettings({ videoFolder: r.data[0] });
        if (rr.ok) { ui.state = rr.data; openSettings(); toast('Pasta de vídeos salva', 'ok'); }
      }
    };
  }

  // tabela de emuladores
  const emuMap = emulatorMap();
  if (!Object.keys(s.emulators || {}).length) s.emulators = emuMap;
  const tbody = $('#emu-rows');
  tbody.innerHTML = '';
  for (const key of Object.keys(emuMap)) {
    const emu = emuMap[key];
    const tr = el('tr');
    tr.appendChild(elHtml('td', null, `${escapeHtml(emu.label || key)}<span class="hint">${escapeHtml(emu.hint || '')}</span>`));

    const tdExe = el('td');
    const wrap = el('div', 'row');
    const inp = el('input');
    inp.type = 'text';
    inp.value = emu.exe || '';
    inp.placeholder = 'C:\\Emuladores\\app.exe';
    inp.onchange = () => { emu.exe = inp.value.trim(); };
    const pick = el('button', 'pick', '…');
    pick.title = 'Procurar executável';
    pick.onclick = async () => {
      const r = await api.pickFile({ title: `Executável do emulador de ${emu.label}`, filters: [{ name: 'Executáveis', extensions: ['exe'] }] });
      if (r.ok && r.data[0]) { inp.value = r.data[0]; emu.exe = r.data[0]; }
    };
    wrap.append(inp, pick);
    tdExe.appendChild(wrap);

    const tdArgs = el('td');
    const ainp = el('input');
    ainp.type = 'text';
    ainp.value = emu.args || '"{rom}"';
    ainp.placeholder = '"{rom}"';
    ainp.onchange = () => { emu.args = ainp.value; };
    tdArgs.appendChild(ainp);

    tr.append(tdExe, tdArgs);
    tbody.appendChild(tr);
  }

  const updateRetro = () => {
    const ra = ui.state.settings.retroarch || {};
    $('#retroarch-info').textContent = ra.exe ? `${ra.exe}${ra.cores ? ' · cores: ' + ra.cores : ' (sem pasta de cores: use -L com o nome do core)'}` : 'Não configurado';
  };
  updateRetro();

  $('#pick-retroarch').onclick = async () => {
    const r = await api.pickFile({ title: 'Escolha o retroarch.exe', filters: [{ name: 'Executáveis', extensions: ['exe'] }] });
    if (r.ok && r.data[0]) {
      ui.state.settings.retroarch = { ...(ui.state.settings.retroarch || {}), exe: r.data[0] };
      updateRetro();
    }
  };
  $('#pick-cores').onclick = async () => {
    const r = await api.pickFolders();
    if (r.ok && r.data[0]) {
      ui.state.settings.retroarch = { ...(ui.state.settings.retroarch || {}), cores: r.data[0] };
      updateRetro();
    }
  };

  syncSkinSelect();
  $('#opt-skin').onchange = async e => {
    const r = await api.saveSettings({ skin: e.target.value });
    if (r.ok) ui.state = r.data;
    applySkinId(e.target.value);
    toast('Skin aplicada', 'ok');
  };
  $('#opt-sgdb').value = s.sgdbKey || '';
  $('#opt-launchers').checked = s.includeStoreLaunchers !== false;
  $('#opt-autoscan').checked = s.autoScan !== false;
  $('#opt-tray').checked = s.minimizarAoJogar !== false;
  $('#opt-tv').checked = !!s.abrirNoModoTV;
  $('#opt-tv').onchange = async e => {
    const r = await api.saveSettings({ abrirNoModoTV: e.target.checked });
    if (r.ok) { ui.state = r.data; toast(e.target.checked ? 'O Arcade Hub vai abrir no Modo TV' : 'O Arcade Hub vai abrir na tela normal', 'ok'); }
  };
  const salvarInterruptor = (chave, msgLiga, msgDesliga) => async e => {
    const r = await api.saveSettings({ [chave]: e.target.checked });
    if (r.ok) { ui.state = r.data; toast(e.target.checked ? msgLiga : msgDesliga, 'ok'); }
  };
  $('#opt-autoscan').onchange = salvarInterruptor('autoScan', 'Jogos novos vão aparecer sozinhos', 'Varredura automática desligada');
  $('#opt-tray').onchange = salvarInterruptor('minimizarAoJogar', 'O launcher sai da frente enquanto você joga', 'O launcher fica aberto durante o jogo');
  $('#update-about').textContent = textoAtualizacao(ui.atualizacao);
  $('#btn-check-update').onclick = async () => {
    if (!api.checkUpdates) return;
    $('#update-about').textContent = 'Procurando…';
    const r = await api.checkUpdates();
    if (!r.ok) { $('#update-about').textContent = r.error || 'Não consegui procurar agora'; return; }
    mostrarAtualizacao(r.data);
  };
  $('#opt-depth').value = s.scanDepth || 4;
  $('#depth-val').textContent = s.scanDepth || 4;
  $('#opt-depth').oninput = e => { $('#depth-val').textContent = e.target.value; };
  $('#data-dir').textContent = ui.state.dataDir || '—';
  $('#ver-app').textContent = 'v' + (ui.state.versions.app || '1.0.0');
  $('#ver-env').textContent = `${ui.state.versions.os} · Electron ${ui.state.versions.electron}`;

  $('#s-scan').onclick = async () => {
    const r = await api.saveSettings({
      folders: s.folders || [],
      romFolders: s.romFolders || [],
      emulators: s.emulators,
      retroarch: s.retroarch,
      includeStoreLaunchers: $('#opt-launchers').checked,
      sgdbKey: $('#opt-sgdb').value.trim(),
      scanDepth: Number($('#opt-depth').value)
    });
    if (!r.ok) { toast(r.error, 'err'); return; }
    ui.state = r.data;
    closeModal($('#modal-settings'));
    runScan();
  };

  showModal($('#modal-settings'));
}

/* ---------- varredura ---------- */
async function runScan() {
  const btn = $('#btn-scan');
  const rotulo = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Escaneando…';
  const r = await api.scan();
  btn.disabled = false;
  btn.textContent = rotulo;
  if (!r.ok) { toast(r.error || 'Falha na varredura', 'err'); return; }
  ui.state = r.data.state;
  render();
  toast(`${ui.state.games.length} jogos na biblioteca`, 'ok');
  // jogos novos (ou que perderam a capa) são enriquecidos na hora
  enriquecerAutomatico();
}

/* ---------- modais ---------- */
function showModal(node) {
  node.hidden = false;
  const focusable = node.querySelector('input[type=text]:not([readonly])');
  if (focusable) setTimeout(() => focusable.focus(), 40);
}
function closeModal(node) { node.hidden = true; }
function closeAll() { $$('.modal-layer').forEach(m => (m.hidden = true)); ui.editingId = null; }

/* ---------- eventos ---------- */
/**
 * "O usuário está digitando?" — cobre input, textarea, select, contenteditable
 * e elementos dentro deles. Antes era só /^(INPUT|TEXTAREA|SELECT)$/ no próprio
 * elemento ativo, o que deixava passar: input dentro de label, campo readonly,
 * e qualquer contenteditable.
 */
function estaDigitando(el) {
  const alvo = el || document.activeElement;
  if (!alvo) return false;
  const tag = (alvo.tagName || '').toUpperCase();
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (alvo.isContentEditable) return true;
  if (alvo.closest && alvo.closest('input, textarea, select, [contenteditable="true"]')) return true;
  return false;
}

/* ==================================================================
 * CASCA LIMPA: menu único e busca flutuante
 * A barra lateral e a barra de topo não existem mais; os mesmos controles
 * (vistas, filtros, ordem, ferramentas) moram no menu.
 * ================================================================== */

function menuAberto() { return !$('#menu-layer').hidden; }

function abrirMenu() {
  const l = $('#menu-layer');
  if (!l.hidden) return;
  l.hidden = false;
  $('#btn-menu').classList.add('on');
  $('#btn-menu').setAttribute('aria-expanded', 'true');
  renderNav();                      // filtros sempre frescos ao abrir
}

function fecharMenu() {
  const l = $('#menu-layer');
  if (l.hidden) return;
  l.hidden = true;
  $('#btn-menu').classList.remove('on');
  $('#btn-menu').setAttribute('aria-expanded', 'false');
}

const alternarMenu = () => (menuAberto() ? fecharMenu() : abrirMenu());

function buscaAberta() { return !$('#busca-flutuante').hidden; }

function abrirBusca() {
  const box = $('#busca-flutuante');
  box.hidden = false;
  $('#btn-busca').classList.add('on');
  const input = $('#search');
  input.focus();
  input.select();
}

function fecharBusca(limpar) {
  const box = $('#busca-flutuante');
  if (box.hidden) return;
  box.hidden = true;
  $('#btn-busca').classList.remove('on');
  if (limpar) { $('#search').value = ''; ui.query = ''; render(); }
}

const alternarBusca = () => (buscaAberta() ? fecharBusca(true) : abrirBusca());

/** Fecha menu/busca quando o usuário clica fora. */
function ligarCasca() {
  const l = $('#menu-layer');
  const box = $('#busca-flutuante');

  $('#btn-menu').onclick = e => { e.stopPropagation(); alternarMenu(); };
  $('#btn-tv').onclick = e => { e.stopPropagation(); fecharMenu(); ModoTV.abrir(); };
  $('#btn-busca').onclick = e => { e.stopPropagation(); fecharMenu(); alternarBusca(); };

  // clique no fundo escuro fecha; clique dentro do painel não
  l.onclick = e => { if (e.target === l) fecharMenu(); };
  $('#menu-painel').onclick = e => e.stopPropagation();

  // clicar em qualquer lugar fora da busca fecha a busca (mantendo o texto)
  document.addEventListener('pointerdown', e => {
    if (!buscaAberta()) return;
    if (box.contains(e.target) || e.target.closest('#btn-busca')) return;
    fecharBusca(false);
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (menuAberto()) { fecharMenu(); return; }
      if (buscaAberta()) { fecharBusca(true); return; }
    }
  });
}

function wire() {
  $$('.nav-item').forEach(b => {
    b.onclick = () => {
      ui.view = b.dataset.view;
      ui.platform = null; ui.genre = null; ui.source = null;
      ui.query = ''; $('#search').value = '';
      render();
      fecharMenu();                 // escolheu a vista: o menu já cumpriu o papel
    };
  });
  $$('#sort button').forEach(b => {
    b.onclick = () => {
      ui.sort = b.dataset.sort;
      $$('#sort button').forEach(x => x.classList.toggle('active', x === b));
      render();
    };
  });
  $('#search').oninput = e => { ui.query = e.target.value; render(); };
  $('#btn-scan').onclick = () => { fecharMenu(); runScan(); };
  $('#btn-settings').onclick = openSettings;
  $('#btn-add').onclick = () => openEditor(null);
  $('#btn-group').onclick = e => { e.stopPropagation(); openGroupMenu(e.currentTarget); };
  $('#btn-random').onclick = playRandom;
  $('#btn-skins').onclick = openSkins;
  $('#btn-open-skins').onclick = () => { closeAll(); openSkins(); };
  $('#skin-reset').onclick = async () => {
    const r = await api.saveSettings({ skin: 'neon' });
    if (r.ok) ui.state = r.data;
    applySkinId('neon');
    renderSkinGrid('todos');
    syncSkinSelect();
    toast('Visual padrão restaurado', 'ok');
  };
  $$('#skin-filters button').forEach(b => {
    b.onclick = () => {
      $$('#skin-filters button').forEach(x => x.classList.toggle('on', x === b));
      renderSkinGrid(b.dataset.brand);
    };
  });
  $('#btn-score-min').onclick = () => {
    const ciclo = [0, 75, 85, 90];
    const i = ciclo.indexOf(ui.minScore);
    ui.minScore = ciclo[(i + 1) % ciclo.length];
    const b = $('#btn-score-min');
    b.classList.toggle('on', ui.minScore > 0);
    const lbl = $('#score-min-label');
    if (lbl) lbl.textContent = ui.minScore > 0 ? `${ui.minScore}+` : 'Nota mín.';
    toast(ui.minScore > 0 ? `Só jogos com nota ${ui.minScore} ou mais` : 'Filtro de nota removido', 'ok');
    render();
  };
  $('#btn-installed').onclick = () => {
    ui.installedOnly = !ui.installedOnly;
    $('#btn-installed').classList.toggle('on', ui.installedOnly);
    toast(ui.installedOnly ? 'Mostrando só os instalados' : 'Mostrando todos os jogos', 'ok');
    render();
  };
  $('#diag-refresh').onclick = renderDiagnostics;
  $('#detect-emu').onclick = detectEmulatorsUI;
  $('#btn-export').onclick = exportLibrary;
  $('#btn-import').onclick = importLibrary;
  $('#btn-auto-genres').onclick = () => { closeAll(); autoGenres(); };
  $('#btn-covers').onclick = () => {
    // se a biblioteca tem jogos sem capa, oferece o download em lote
    const faltando = ui.state.games.filter(g => !g.art);
    if (faltando.length > 3) {
      if (confirm(`Buscar capas automaticamente para ${faltando.length} jogos sem capa?\n\nOK = baixar para todos · Cancelar = escolher um jogo`)) {
        autoCovers();
        return;
      }
      const alvo = visibleGames().find(g => !g.art) || faltando[0];
      openCovers(alvo);
      return;
    }
    const alvo = visibleGames()[0] || ui.state.games[0];
    if (!alvo) { toast('Adicione um jogo primeiro', 'err'); return; }
    openCovers(alvo);
  };
  $('#cv-search').onclick = doCoverSearch;
  $('#cv-query').onkeydown = e => { if (e.key === 'Enter') doCoverSearch(); };
  $('#cv-local').onclick = pickLocalCover;
  $('#cv-clear').onclick = clearCover;
  $('#btn-empty-scan').onclick = runScan;
  $('#btn-empty-settings').onclick = openSettings;
  $$('#e-type button').forEach(b => (b.onclick = () => setType(b.dataset.type)));
  $$('#s-tabs button').forEach(b => {
    b.onclick = () => {
      $$('#s-tabs button').forEach(x => x.classList.toggle('active', x === b));
      $$('.tab-panel').forEach(p => (p.hidden = p.dataset.panel !== b.dataset.tab));
      if (b.dataset.tab === 'diag') renderDiagnostics();
    };
  });
  $$('[data-close]').forEach(b => { b.onclick = () => closeAll(); });
  $$('[data-win]').forEach(b => {
    b.onclick = () => {
      const act = b.dataset.win;
      if (api.win && api.win[act]) api.win[act]();
      else if (window.arcadeAPI) { /* fallback */ }
    };
  });

  // teclado
  document.addEventListener('keydown', e => {
    const digitando = estaDigitando();
    const modalAberto = $$('.modal-layer:not([hidden])').length > 0;

    // REGRA DE OURO: com o cursor num campo de texto, o app não intercepta nada
    // além do Escape. Era isto que impedia de escrever no nome do jogo.
    if (digitando) {
      if (e.key === 'Escape') {
        const alvo = document.activeElement;
        if (alvo && alvo.blur) alvo.blur();
        if (modalAberto) closeAll();
        e.preventDefault();
      }
      return;                      // teclas imprimíveis seguem para o campo
    }

    // tema de dashboard ativo? as setas/Enter são dele
    if (Dashboards.ativo && Dashboards.tecla(e)) { e.preventDefault(); return; }

    if (e.key === '/' || (e.key === 'f' && (e.ctrlKey || e.metaKey))) { e.preventDefault(); abrirBusca(); return; }
    if (e.key === 'Escape') {
      if (modalAberto) closeAll();
      else if (document.activeElement === $('#search')) { fecharBusca(true); }
      return;
    }
    if (e.key === 'Enter' && document.activeElement === $('#search')) {
      const first = visibleGames()[0];
      if (first) launch(first);
      return;
    }
    if ((e.key === 'Enter' || e.key === ' ') && document.activeElement && document.activeElement.classList.contains('card')) {
      e.preventDefault();
      const id = document.activeElement.dataset.id;
      const game = ui.state.games.find(g => g.id === id);
      if (game) openDetail(game);
      return;
    }
    // nada de atalhos globais com um modal aberto (F5 no meio da edição perdia tudo)
    if (modalAberto) return;

    if (e.key === 'F5') { e.preventDefault(); runScan(); return; }
    if (e.key === 'r' || e.key === 'R') { e.preventDefault(); playRandom(); return; }

    // navegação na grade com as setas
    if (['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(e.key)) {
      const cards = gridCards();
      if (!cards.length) return;
      e.preventDefault();
      let cols = 0;
      const first = cards[0].getBoundingClientRect();
      for (let i = 1; i < cards.length; i++) {
        const r = cards[i].getBoundingClientRect();
        if (Math.abs(r.top - first.top) < 4) cols++; else break;
      }
      if (!cols) cols = 5;
      const ativo = document.activeElement && document.activeElement.classList.contains('card')
        ? document.activeElement
        : null;
      let idx = ativo ? cards.indexOf(ativo) : -1;
      const passo = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols }[e.key];
      idx = idx < 0 ? 0 : Math.max(0, Math.min(cards.length - 1, idx + passo));
      cards[idx].focus();
      if (typeof cards[idx].scrollIntoView === 'function') {
        cards[idx].scrollIntoView({ block: 'nearest' });
      }
    }
  });

  // campos de texto: garante que digitar SEMPRE entra (nem que o foco tenha
  // ficado num elemento "morto" por algum re-render)
  document.addEventListener('mousedown', e => {
    const campo = e.target.closest && e.target.closest('input[type=text], input[type=search], textarea');
    if (campo && document.activeElement !== campo) setTimeout(() => campo.focus(), 0);
  }, true);

  wireContextMenu();
}


/* ------------------------------------------------------------------ */
/* Menu de contexto (botão direito)                                    */
/* ------------------------------------------------------------------ */

let menuCtx = null;
function fecharMenuCtx() {
  if (menuCtx) { menuCtx.remove(); menuCtx = null; }
}

/**
 * Abre um menu no ponto do clique.
 * @param {MouseEvent|{x,y}} e
 * @param {Array<{label, icon?, danger?, sep?, onClick?, disabled?}>} itens
 */
function abrirMenuCtx(e, itens) {
  fecharMenuCtx();
  const menu = el('div', 'ctx-menu');
  menu.setAttribute('role', 'menu');
  itens.filter(Boolean).forEach(item => {
    if (item.sep) { menu.appendChild(el('div', 'ctx-sep')); return; }
    const b = el('button', 'ctx-item' + (item.danger ? ' danger' : ''));
    b.type = 'button';
    b.setAttribute('role', 'menuitem');
    if (item.disabled) b.disabled = true;
    if (item.icon) {
      const ic = el('span', 'ctx-icon');
      ic.innerHTML = item.icon;
      b.appendChild(ic);
    }
    b.appendChild(el('span', 'ctx-label', item.label));
    if (item.hint) b.appendChild(el('span', 'ctx-hint', item.hint));
    b.onclick = ev => { ev.stopPropagation(); fecharMenuCtx(); if (item.onClick) item.onClick(); };
    menu.appendChild(b);
  });
  document.body.appendChild(menu);

  // posiciona dentro da janela (nunca corta na borda)
  const r = menu.getBoundingClientRect();
  const x = Math.min((e.clientX || e.x || 0) + 2, window.innerWidth - r.width - 8);
  const y = Math.min((e.clientY || e.y || 0) + 2, window.innerHeight - r.height - 8);
  menu.style.left = Math.max(8, x) + 'px';
  menu.style.top = Math.max(8, y) + 'px';
  menuCtx = menu;
  return menu;
}

const ICO = {
  jogar: '<svg viewBox="0 0 24 24" width="14" height="14"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg>',
  editar: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4l10-10-4-4L4 16z"/><path d="M13.5 6.5l4 4"/></svg>',
  capa: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><circle cx="9" cy="10" r="1.6" fill="currentColor" stroke="none"/><path d="M4 17l5-4.5 4 3.5 3-2.5 4 3.5"/></svg>',
  encaixar: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M8 4H5a1 1 0 00-1 1v3M16 4h3a1 1 0 011 1v3M8 20H5a1 1 0 01-1-1v-3M16 20h3a1 1 0 001-1v-3"/></svg>',
  favorito: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M12 4.5l2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.6-4.8 2.6.9-5.4L4.2 10.2l5.4-.8z"/></svg>',
  pasta: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M3.5 7.5A2 2 0 015.5 5.5h3.6l2 2h7.4a2 2 0 012 2v7a2 2 0 01-2 2h-13a2 2 0 01-2-2z"/></svg>',
  info: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.8v.2" stroke-linecap="round"/></svg>',
  lixo: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 7h15M9.5 7V5.2A1.2 1.2 0 0110.7 4h2.6a1.2 1.2 0 011.2 1.2V7"/><path d="M6.5 7l.8 11.2A2 2 0 009.3 20h5.4a2 2 0 002-1.8L17.5 7"/></svg>'
};

async function confirmarRemocao(game) {
  const ok = await pedirConfirmacao({
    titulo: 'Remover da biblioteca?',
    texto: `"${game.title}" sai da lista do Arcade Hub. O jogo NÃO é apagado do seu PC — só some do launcher.`,
    acao: 'Remover'
  });
  if (!ok) return;
  const r = await api.removeGame(game.id);
  if (r.ok) {
    // o processo principal devolve a lista de jogos restante
    if (Array.isArray(r.data)) ui.state.games = r.data;
    else if (r.data && Array.isArray(r.data.games)) ui.state = r.data;
    else ui.state.games = ui.state.games.filter(g => g.id !== game.id);
    ui.state.favorites = (ui.state.favorites || []).filter(id => id !== game.id);
    render();
    toast(`"${game.title}" removido da biblioteca`, 'ok');
  } else {
    toast(r.error || 'Não consegui remover', 'err');
  }
}

/** Diálogo de confirmação (o window.confirm nativo destoa do visual). */
function pedirConfirmacao({ titulo, texto, acao }) {
  return new Promise(resolve => {
    const layer = el('div', 'modal-layer');
    layer.innerHTML = `
      <div class="modal-backdrop"></div>
      <div class="sheet narrow" role="alertdialog" aria-modal="true">
        <h2>${escapeHtml(titulo)}</h2>
        <p class="muted small">${escapeHtml(texto)}</p>
        <div class="row end">
          <button class="ghost-btn" data-nao>Cancelar</button>
          <button class="primary-btn danger" data-sim>${escapeHtml(acao || 'Confirmar')}</button>
        </div>
      </div>`;
    const fechar = v => { layer.remove(); document.removeEventListener('keydown', tecla, true); resolve(v); };
    const tecla = ev => {
      if (ev.key === 'Escape') { ev.stopPropagation(); fechar(false); }
      if (ev.key === 'Enter') { ev.stopPropagation(); fechar(true); }
    };
    layer.querySelector('[data-nao]').onclick = () => fechar(false);
    layer.querySelector('[data-sim]').onclick = () => fechar(true);
    layer.querySelector('.modal-backdrop').onclick = () => fechar(false);
    document.addEventListener('keydown', tecla, true);
    document.body.appendChild(layer);
    setTimeout(() => layer.querySelector('[data-sim]').focus(), 30);
  });
}

/** Itens de menu de um jogo. */
function menuDoJogo(game) {
  const favorito = (ui.state.favorites || []).includes(game.id);
  const temPasta = !!(game.installDir || (game.launch && game.launch.exe));
  return [
    { label: 'Jogar', icon: ICO.jogar, onClick: () => launch(game), disabled: game.installed === false },
    { sep: true },
    { label: 'Editar (nome, capa, caminho)…', icon: ICO.editar, onClick: () => { closeAll(); openEditor(game); } },
    { label: 'Trocar capa…', icon: ICO.capa, onClick: () => openCovers(game) },
    { label: 'Buscar capa que caiba', icon: ICO.encaixar, onClick: () => ajustarCapa(game) },
    { label: 'Atualizar capa e informações', icon: ICO.info, onClick: async () => { game.meta = null; await enriquecerAutomatico({ forcar: true }); } },
    { sep: true },
    {
      label: favorito ? 'Tirar dos favoritos' : 'Adicionar aos favoritos',
      icon: ICO.favorito,
      hint: 'F',
      onClick: async () => {
        const r = await api.toggleFavorite(game.id);
        if (r.ok) { ui.state.favorites = r.data; render(); }
      }
    },
    temPasta ? {
      label: 'Abrir a pasta do jogo',
      icon: ICO.pasta,
      onClick: () => { api.openPath ? api.openPath(game.installDir || game.launch.exe) : toast('Indisponível nesta versão', 'err'); }
    } : null,
    { sep: true },
    { label: 'Remover da biblioteca', icon: ICO.lixo, danger: true, onClick: () => confirmarRemocao(game) }
  ];
}

/** Instala os listeners de botão direito (cards, grade e campos de texto). */
function wireContextMenu() {
  document.addEventListener('click', fecharMenuCtx);
  window.addEventListener('blur', fecharMenuCtx);
  window.addEventListener('resize', fecharMenuCtx);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') fecharMenuCtx(); }, true);

  // menu nativo do Chromium: liberado em campos de texto (copiar/colar),
  // bloqueado no resto — quem manda no resto é o nosso menu.
  document.addEventListener('contextmenu', e => {
    const editavel = e.target.closest && e.target.closest('input, textarea, [contenteditable="true"]');
    if (editavel) return;                       // deixa o menu nativo (colar!)

    e.preventDefault();

    const card = e.target.closest && e.target.closest('.card');
    const game = card ? ui.state.games.find(g => g.id === card.dataset.id) : null;
    const alvoJogo = game || ui.ctxGame || null;

    // sobre um card: menu do jogo
    if (game) { ui.ctxGame = game; abrirMenuCtx(e, menuDoJogo(game)); return; }

    // em qualquer outro lugar: ações gerais da biblioteca
    abrirMenuCtx(e, [
      { label: 'Adicionar jogo…', icon: ICO.editar, onClick: () => openEditor(null) },
      { label: 'Escanear biblioteca de novo', icon: ICO.info, hint: 'F5', onClick: runScan },
      { label: 'Buscar capas e informações', icon: ICO.capa, onClick: () => enriquecerAutomatico({ forcar: false }) },
      { sep: true },
      { label: 'Ajustes…', onClick: openSettings },
      { label: 'Escolher skins…', onClick: () => openSkins() },
      { sep: true },
      { label: 'Jogar um aleatório', hint: 'R', onClick: playRandom },
      alvoJogo ? { label: `Editar "${alvoJogo.title}"…`, icon: ICO.editar, onClick: () => openEditor(alvoJogo) } : null
    ]);
  });
}

/* ---------- suporte a controle (gamepad) ---------- */
const pad = { index: -1, last: 0, cols: 1, focused: null, repeat: null };

function padCards() {
  return [...document.querySelectorAll('#grid .card, #grid .group .card')].filter(c => c.offsetParent !== null);
}

function padFocus(card) {
  if (!card) return;
  const prev = document.querySelector('.card.pad-focus');
  if (prev) prev.classList.remove('pad-focus');
  card.classList.add('pad-focus');
  if (typeof card.scrollIntoView === 'function') card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  pad.focused = card;
}

/**
 * Move o foco do controle no layout ATIVO.
 * Grade: anda de card em card. Rondel e dashboards: delega para o módulo.
 */
function padMove(dx, dy) {
  if (typeof Dashboards !== 'undefined' && Dashboards.ativo) {
    Dashboards.mover(dx, dy);
    return;
  }
  if (document.body.dataset.layout === 'rondel' && typeof Rondel !== 'undefined') {
    // no rondel: ← → e ↑ ↓ giram a roda (o card do centro é o mesmo que as setas do teclado)
    if (dx > 0 || dy > 0) Rondel.proximo();
    else if (dx < 0 || dy < 0) Rondel.anterior();
    return;
  }
  const cards = padCards();
  if (!cards.length) return;
  const cur = pad.focused && pad.focused.isConnected ? pad.focused : cards[0];
  let idx = cards.indexOf(cur);
  if (idx < 0) idx = 0;
  if (!pad.cols || pad.cols < 1) {
    const first = cards[0].getBoundingClientRect();
    const second = cards[1] ? cards[1].getBoundingClientRect() : null;
    pad.cols = second && Math.abs(second.top - first.top) < 4 ? 2 : 1;
    // descobre colunas reais contando cards na mesma linha
    let count = 1;
    for (let i = 1; i < cards.length; i++) {
      const r = cards[i].getBoundingClientRect();
      if (Math.abs(r.top - first.top) < 4) count++; else break;
    }
    pad.cols = count || 1;
  }
  let next = idx;
  if (dx) next = idx + dx;
  if (dy) next = idx + dy * pad.cols;
  next = Math.max(0, Math.min(cards.length - 1, next));
  padFocus(cards[next]);
}

/** Jogo que o controle está apontando, no layout ativo. */
function jogoFocado() {
  if (typeof Dashboards !== 'undefined' && Dashboards.ativo) return Dashboards.jogoAtual || null;
  if (document.body.dataset.layout === 'rondel' && typeof Rondel !== 'undefined') return Rondel.jogoAtual || null;
  const alvo = pad.focused && pad.focused.isConnected ? pad.focused : padCards()[0];
  if (!alvo) return null;
  const id = alvo.dataset.id;
  return (ui.state && ui.state.games.find(g => g.id === id)) || null;
}

function pollGamepad() {
  if (!navigator.getGamepads) return;
  if (typeof ModoTV !== 'undefined' && ModoTV.ativo) return;   // o Modo TV lê o controle sozinho
  // com um jogo aberto por cima, o controle é do jogo: o launcher não reage
  if (!document.hasFocus() || document.hidden) return;
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  const gp = [...pads].find(p => p && p.connected);
  if (!gp) return;
  const now = performance.now();
  const [ax = 0, ay = 0] = gp.axes;
  const pressed = i => gp.buttons[i] && gp.buttons[i].pressed;
  const openModal = !!document.querySelector('.modal-layer:not([hidden])');

  // navegação (d-pad ou analógico esquerdo) com repetição
  // No Gamepad API: 12=cima 13=baixo 14=esquerda 15=direita.
  // (Antes o 14/15 estava somado no eixo VERTICAL — o direcional horizontal do
  //  controle não fazia nada e o rondel/dashboard não giravam.)
  const dx = (ax < -0.6 || pressed(14) ? -1 : 0) || (ax > 0.6 || pressed(15) ? 1 : 0);
  const dy = (ay < -0.6 || pressed(12) ? -1 : 0) || (ay > 0.6 || pressed(13) ? 1 : 0);
  if (now - pad.last > 190) {
    if (dx || dy) {
      pad.last = now;
      if (openModal) {
        if (dy) closeAll();          // B/baixo fecha
      } else {
        padMove(dx, dy);
      }
    } else if (now - pad.last > 400) {
      pad.cols = 0;                  // recalcula colunas quando a janela muda
    }
  }

  /* Botões, no padrão do Xbox (e equivalentes):
   *   A (0)  = abrir as INFORMAÇÕES do jogo (dentro da ficha: iniciar)
   *   X (2)  = INICIAR o jogo direto, sem passar pela ficha
   *   B (1)  = voltar/fechar
   *   Start (9) = escanear · Select/Back (8) = jogo aleatório
   * X é o "quadrado" do PlayStation, o X do Xbox e o Y do Switch — o índice 2
   * do Gamepad API, que é o mesmo em qualquer controle moderno.
   */
  const edge = (i, key) => {
    const on = pressed(i);
    const was = pad[key] || false;
    pad[key] = on;
    return on && !was;
  };

  if (edge(0, 'a')) {
    if (openModal) {
      // dentro da ficha, A continua sendo "jogar"
      const play = document.querySelector('#modal-game:not([hidden]) #d-play');
      if (play) play.click();
    } else {
      const j = jogoFocado();
      if (j) openDetail(j);
    }
  }

  if (edge(2, 'x')) {
    const j = jogoFocado();
    if (openModal) {                       // X dentro da ficha também inicia
      const jogoDaFicha = ui.jogoNaFicha || null;
      closeAll();
      if (jogoDaFicha) launch(jogoDaFicha);
      else if (j) launch(j);
    } else if (j) {
      launch(j);
    }
  }

  if (edge(1, 'b') && openModal) closeAll();
  if (edge(16, 'guia') && typeof ModoTV !== 'undefined') { closeAll(); ModoTV.abrir(); }
  if (edge(9, 'start')) runScan();
  if (edge(8, 'select') && !openModal) playRandom();
}

function startGamepadLoop() {
  if (!navigator.getGamepads) return;
  setInterval(pollGamepad, 90);
  window.addEventListener('gamepadconnected', () => {
    toast('Controle conectado — direcional navega, A abre as informações, X inicia o jogo, B volta', 'ok');
  });
}

/* ---------- tamanho dos cards ---------- */
function aplicarTamanhoCards(px) {
  const v = Math.max(120, Math.min(280, Number(px) || 158));
  document.documentElement.style.setProperty('--card-min', v + 'px');
  const r = $('#card-size');
  if (r && Number(r.value) !== v) r.value = v;
  return v;
}
let salvarTamanhoTimer = null;
function ligarTamanhoCards() {
  const r = $('#card-size');
  if (!r) return;
  r.oninput = () => aplicarTamanhoCards(r.value);
  r.onchange = () => {
    clearTimeout(salvarTamanhoTimer);
    salvarTamanhoTimer = setTimeout(async () => {
      const rr = await api.saveSettings({ cardSize: Number(r.value) });
      if (rr.ok) ui.state.settings = rr.data.settings;
    }, 250);
  };
}

/* ---------- atualização do app ---------- */
function textoAtualizacao(st) {
  if (!st) return '';
  if (st.suportado === false && st.estado === 'parado') return 'A atualização automática funciona na versão instalada pelo instalador.';
  return ({
    parado: '', procurando: 'Procurando…', atualizado: 'Você está na versão mais recente.',
    baixando: `Baixando a versão ${st.versao || 'nova'}… ${st.progresso || 0}%`,
    pronto: `Versão ${st.versao || 'nova'} pronta — reinicie para instalar.`,
    erro: 'Não consegui procurar atualizações agora (sem internet?).'
  })[st.estado] || '';
}
function mostrarAtualizacao(st) {
  if (!st) return;
  const anterior = ui.atualizacao;
  ui.atualizacao = { ...(anterior || {}), ...st };
  const bar = $('#update-bar');
  const about = $('#update-about');
  if (about) about.textContent = textoAtualizacao(ui.atualizacao);
  if (st.estado === 'pronto') {
    $('#update-text').textContent = `Versão ${st.versao || 'nova'} do Arcade Hub pronta`;
    $('#update-go').hidden = false;
    bar.hidden = ui.avisoAtualizacaoFechado;
  } else if (st.estado === 'baixando') {
    $('#update-text').textContent = `Baixando a versão ${st.versao || 'nova'}… ${st.progresso || 0}%`;
    $('#update-go').hidden = true;
    bar.hidden = ui.avisoAtualizacaoFechado;
  } else {
    bar.hidden = true;
  }
}
function ligarAtualizacao() {
  $('#update-go').onclick = async () => {
    const r = await api.installUpdate();
    if (!r.ok) toast(r.error || 'Não consegui instalar agora', 'err');
    else toast('Reiniciando para instalar…', 'ok');
  };
  $('#update-x').onclick = () => {
    ui.avisoAtualizacaoFechado = true;
    $('#update-bar').hidden = true;
    if (ui.atualizacao && ui.atualizacao.estado === 'pronto') toast('Tudo bem: a atualização instala quando você fechar o Arcade Hub', 'ok');
  };
  if (api.onUpdateStatus) api.onUpdateStatus(mostrarAtualizacao);
  if (api.updateStatus) api.updateStatus().then(r => { if (r && r.ok) mostrarAtualizacao(r.data); });
}

/* ---------- estatísticas ---------- */
const horasTexto = ms => {
  const h = (ms || 0) / 36e5;
  if (h >= 10) return `${Math.round(h)} h`;
  if (h >= 1) return `${h.toFixed(1).replace('.', ',')} h`;
  if ((ms || 0) > 0 && ms < 6e4) return '< 1 min';
  return `${Math.max(0, Math.round((ms || 0) / 6e4))} min`;
};

function barras(itens, opts) {
  const o = opts || {};
  const box = el('div', 'barras');
  const max = Math.max(1, ...itens.map(i => i.valor));
  for (const it of itens) {
    const linha = el(it.onclick ? 'button' : 'div', 'barra');
    if (it.onclick) { linha.type = 'button'; linha.onclick = it.onclick; }
    linha.appendChild(el('span', 'barra-nome', it.nome));
    linha.appendChild(el('span', 'barra-valor', o.formato ? o.formato(it.valor) : String(it.valor)));
    const trilho = el('span', 'barra-trilho');
    const i = el('i');
    i.style.width = Math.max(2, Math.round((it.valor / max) * 100)) + '%';
    trilho.appendChild(i);
    linha.appendChild(trilho);
    box.appendChild(linha);
  }
  return box;
}

function cartao(titulo, conteudo) {
  const c = el('div', 'stats-card');
  c.appendChild(el('h3', null, titulo));
  c.appendChild(conteudo);
  return c;
}

function renderStats() {
  const box = $('#stats');
  box.innerHTML = '';
  const hidden = new Set(ui.state.hidden || []);
  const jogos = ui.state.games.filter(g => !hidden.has(g.id));
  const ms = g => (g.playtime && g.playtime.totalMs) || 0;
  const jogados = jogos.filter(g => ms(g) > 0);
  const total = jogados.reduce((a, g) => a + ms(g), 0);
  const sessoes = jogados.reduce((a, g) => a + ((g.playtime && g.playtime.sessions) || 0), 0);

  const head = el('div', 'stats-head');
  head.appendChild(el('h2', null, 'Estatísticas'));
  head.appendChild(el('p', 'muted small', 'Tempo contado pelo Arcade Hub. Jogos da Steam, Epic e GOG passaram a ser contados a partir da versão 1.0.2.'));
  box.appendChild(head);

  const tiles = el('div', 'stats-totais');
  const tile = (valor, rotulo) => { const t = el('div', 'stats-tile'); t.append(el('b', null, valor), el('span', null, rotulo)); tiles.appendChild(t); };
  tile(horasTexto(total), 'tempo total');
  tile(String(sessoes), sessoes === 1 ? 'sessão' : 'sessões');
  tile(`${jogados.length} de ${jogos.length}`, 'jogos com tempo');
  tile(sessoes ? horasTexto(total / sessoes) : '—', 'média por sessão');
  box.appendChild(tiles);

  const cols = el('div', 'stats-cols');

  // mais jogados
  const top = [...jogados].sort((a, b) => ms(b) - ms(a)).slice(0, 10);
  cols.appendChild(cartao('Mais jogados', top.length
    ? barras(top.map(g => ({ nome: g.title, valor: ms(g), onclick: () => openDetail(g) })), { formato: horasTexto })
    : el('p', 'stats-vazio', 'Ainda não há tempo de jogo contado. Abra um jogo pelo Arcade Hub e ele aparece aqui.')));

  // por mês (últimos 12)
  const agora = new Date();
  const meses = [];
  for (let k = 11; k >= 0; k--) {
    const d = new Date(agora.getFullYear(), agora.getMonth() - k, 1);
    meses.push({ chave: `${d.getFullYear()}-${d.getMonth()}`, rotulo: d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', ''), ms: 0 });
  }
  const porChave = new Map(meses.map(m => [m.chave, m]));
  let temHistorico = false;
  for (const g of jogos) {
    for (const h of (g.playtime && Array.isArray(g.playtime.history) ? g.playtime.history : [])) {
      const d = new Date(h.at);
      const m = porChave.get(`${d.getFullYear()}-${d.getMonth()}`);
      if (m) { m.ms += h.ms || 0; temHistorico = true; }
    }
  }
  const grafico = el('div');
  if (temHistorico) {
    const maxMes = Math.max(1, ...meses.map(m => m.ms));
    const linha = el('div', 'meses');
    for (const m of meses) {
      const col = el('div', 'mes');
      col.title = `${m.rotulo}: ${horasTexto(m.ms)}`;
      const barra = el('i', m.ms ? '' : 'zero');
      barra.style.height = m.ms ? Math.max(4, Math.round((m.ms / maxMes) * 120)) + 'px' : '2px';
      col.append(barra, el('span', null, m.rotulo));
      linha.appendChild(col);
    }
    grafico.appendChild(linha);
  } else {
    grafico.appendChild(el('p', 'stats-vazio', 'O histórico por mês começa a ser registrado a partir desta versão: cada sessão nova entra aqui.'));
  }
  cols.appendChild(cartao('Por mês (últimos 12)', grafico));

  // por plataforma e por origem
  const somar = chaveDe => {
    const m = new Map();
    for (const g of jogados) { const k = chaveDe(g); m.set(k, (m.get(k) || 0) + ms(g)); }
    return [...m].sort((a, b) => b[1] - a[1]);
  };
  const plat = somar(g => g.platform || 'PC');
  cols.appendChild(cartao('Por plataforma', plat.length
    ? barras(plat.map(([nome, valor]) => ({ nome, valor })), { formato: horasTexto })
    : el('p', 'stats-vazio', '—')));
  const orig = somar(g => (SOURCE_META[g.source] || { label: g.source }).label);
  cols.appendChild(cartao('Por origem', orig.length
    ? barras(orig.map(([nome, valor]) => ({ nome, valor })), { formato: horasTexto })
    : el('p', 'stats-vazio', '—')));
  box.appendChild(cols);

  // instalados e ainda sem tempo
  const parados = jogos.filter(g => g.installed !== false && !ms(g)).sort((a, b) => a.title.localeCompare(b.title, 'pt-BR'));
  const chips = el('div', 'stats-chips');
  for (const g of parados.slice(0, 60)) {
    const b = el('button', null, g.title);
    b.type = 'button';
    b.onclick = () => openDetail(g);
    chips.appendChild(b);
  }
  if (parados.length > 60) chips.appendChild(el('span', 'muted small', `… e mais ${parados.length - 60}`));
  box.appendChild(cartao(`Instalados e ainda sem tempo de jogo (${parados.length})`, parados.length ? chips : el('p', 'stats-vazio', 'Você já jogou tudo o que está instalado. 🎉')));
}

/* ---------- boot ---------- */
(async function boot() {
  wire();
  ligarCasca();
  startGamepadLoop();
  const r = await api.getState();
  if (r.ok) {
    ui.state = r.data;
    applySkinId(currentSkinId());
  } else {
    toast('Não consegui carregar a biblioteca', 'err');
    ui.state = { games: [], favorites: [], hidden: [], settings: { emulators: {} } };
  }
  ui.sort = (ui.state.settings && ui.state.settings.sort) || 'recent';
  ui.groupBy = (ui.state.settings && ui.state.settings.groupBy) || 'none';
  ui.jogando = new Set((ui.state.sessoes || []).map(x => x.id));
  aplicarTamanhoCards(ui.state.settings && ui.state.settings.cardSize);
  if (ui.state.settings && ui.state.settings.abrirNoModoTV && typeof ModoTV !== 'undefined') {
    setTimeout(() => ModoTV.abrir(), 0);
  }
  ligarTamanhoCards();
  ligarAtualizacao();
  // o jogo abriu de verdade (processo detectado): marca o card
  if (api.onSessionStart) {
    api.onSessionStart(({ id, title }) => {
      ui.jogando.add(id);
      toast(`${title} aberto — contando o tempo de jogo`, 'ok');
      render();
      if (typeof ModoTV !== 'undefined') ModoTV.atualizar();
    });
  }
  // quando o jogo fecha, o processo principal avisa e atualizamos o tempo
  if (api.onSessionEnd) {
    api.onSessionEnd(({ id, title, session, playtime }) => {
      ui.jogando.delete(id);
      const g = ui.state.games.find(x => x.id === id);
      if (g && playtime) g.playtime = playtime;
      if (g && session) {
        g.playedAt = Date.now();
        toast(`${title}: ${fmtPlaytime(session.elapsed)} nesta sessão · total ${fmtPlaytime(session.total)}`, 'ok');
      }
      render();
      if (typeof ModoTV !== 'undefined') ModoTV.atualizar();
    });
  }
  // varredura automática achou algo: atualiza a tela sem perguntar
  if (api.onLibraryChanged) {
    api.onLibraryChanged(({ novos, removidos, state }) => {
      if (!state) return;
      ui.state = state;
      ui.jogando = new Set((state.sessoes || []).map(x => x.id));
      render();
      if (typeof ModoTV !== 'undefined') ModoTV.atualizar();
      if (novos && novos.length) {
        toast(novos.length === 1 ? `Jogo novo na biblioteca: ${novos[0]}`
          : `${novos.length} jogos novos: ${novos.slice(0, 3).join(', ')}${novos.length > 3 ? '…' : ''}`, 'ok');
        enriquecerAutomatico();
      } else if (removidos) {
        toast(`${removidos} jogo(s) saíram da biblioteca (desinstalados)`, 'ok');
      }
    });
  }
  $$('#sort button').forEach(b => b.classList.toggle('active', b.dataset.sort === ui.sort));
  render();
  // baixa capas e informações sozinho, sempre que houver algo faltando
  if (window.arcadeAPI) setTimeout(() => enriquecerAutomatico(), 700);
  if (!ui.state.games.length && window.arcadeAPI) {
    // primeira execução: já procura Steam/Epic/GOG automaticamente
    setTimeout(runScan, 400);
  }
})();
