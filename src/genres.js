'use strict';
/**
 * Arcade Hub — classificação por gênero
 *
 * O PC não guarda o gênero dos jogos, então:
 *   1. jogos da Steam: gêneros oficiais via appdetails (+ tags do SteamSpy);
 *   2. jogos de outras lojas / portáteis: procura o appid pelo nome na Steam;
 *   3. ROMs: procura o equivalente na Steam e, se não achar, usa uma tabela de
 *      palavras-chave por série (Mario Kart → Corrida, Street Fighter → Luta…).
 * Tudo é cacheado no library.json — depois funciona offline.
 */

const UA = 'ArcadeHub/1.0 (+launcher local)';
const TIMEOUT = 12000;

/* ------------------------------------------------------------------ */
/* Catálogo de gêneros (canônico, com ícone e cor)                     */
/* ------------------------------------------------------------------ */

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

const GENRE_BY_LABEL = new Map(GENRES.map(g => [g.label.toLowerCase(), g]));

function genreInfo(key) {
  return GENRES.find(g => g.key === key) || { key, label: key, icon: '🎮', color: '#8792a8' };
}

/* ------------------------------------------------------------------ */
/* Tradução de rótulos das lojas → gêneros canônicos                   */
/* ------------------------------------------------------------------ */

// chave: rótulo normalizado; valor: lista de gêneros
const LABEL_MAP = {
  // Steam (pt-BR e en)
  'acao': ['acao'], 'action': ['acao'],
  'aventura': ['aventura'], 'adventure': ['aventura'],
  'rpg': ['rpg'], 'role-playing': ['rpg'],
  'estrategia': ['estrategia'], 'strategy': ['estrategia'],
  'simulacao': ['simulacao'], 'simulation': ['simulacao'],
  'corrida': ['corrida'], 'racing': ['corrida'],
  'esporte': ['esporte'], 'sports': ['esporte'],
  'casual': ['casual'],
  'indie': ['indie'],
  'massively multiplayer': ['mmo'], 'multiplayer massivo': ['mmo'],
  'gratuito': ['casual'], 'free to play': ['casual'],
  'acesso antecipado': [], 'early access': [],

  // tags do SteamSpy / rótulos finos
  'fps': ['fps'], 'first-person shooter': ['fps'], 'shooter': ['fps'], 'third person': [],
  'platformer': ['plataforma'], '2d platformer': ['plataforma'], '3d platformer': ['plataforma'],
  'metroidvania': ['metroidvania', 'plataforma'],
  'roguelike': ['roguelike'], 'roguelite': ['roguelike'], 'rogue-like': ['roguelike'],
  'open world': ['mundo-aberto'], 'sandbox': ['mundo-aberto'],
  'survival': ['sobrevivencia'], 'sobrevivencia': ['sobrevivencia'],
  'horror': ['terror'], 'psychological horror': ['terror'], 'terror': ['terror'], 'survival horror': ['terror', 'sobrevivencia'],
  'fighting': ['luta'], 'luta': ['luta'], '2d fighter': ['luta'],
  'puzzle': ['puzzle'], 'puzzle-platformer': ['puzzle', 'plataforma'],
  'rhythm': ['ritmo'], 'music': ['ritmo'],
  'card game': ['cartas'], 'cards': ['cartas'],
  'arcade': ['arcade'],
  'hack and slash': ['hack-slash'], 'hack & slash': ['hack-slash'], 'souls-like': ['hack-slash', 'rpg'],
  'sports': ['esporte'], 'football': ['esporte'], 'soccer': ['esporte'],
  'vehicular combat': ['corrida'],
  'collectathon': ['plataforma-3d', 'plataforma'],
  'stealth': ['acao'], 'beat em up': ['acao'], 'bullet hell': ['arcade'],
  'turn-based': ['estrategia'], 'turn-based strategy': ['estrategia'],
  'tower defense': ['estrategia'], 'moba': ['estrategia', 'mmo'],
  'city builder': ['simulacao', 'estrategia'], 'battle royale': ['fps'],
  'visual novel': ['aventura'],
  'action rpg': ['acao', 'rpg'], 'jrpg': ['rpg'], 'crpg': ['rpg'],
  'action-adventure': ['acao', 'aventura'], 'action adventure': ['acao', 'aventura'],
  'party game': ['casual'], 'trivia': ['casual'],
  'mmorpg': ['mmo', 'rpg'],

  // rótulos do Wikidata (costumam terminar em "game"/"video game")
  'shooter game': ['acao'], 'shooter video game': ['acao'],
  'action adventure game': ['acao', 'aventura'], 'action-adventure game': ['acao', 'aventura'],
  'action game': ['acao'], 'action role-playing game': ['acao', 'rpg'],
  'role-playing video game': ['rpg'], 'role-playing game': ['rpg'],
  'platform game': ['plataforma'], '2d platform game': ['plataforma'], 'platform video game': ['plataforma'],
  'racing video game': ['corrida'], 'racing game': ['corrida'], 'kart racing game': ['corrida'],
  'fighting game': ['luta'], 'sports video game': ['esporte'], 'sports game': ['esporte'],
  'puzzle video game': ['puzzle'], 'puzzle game': ['puzzle'],
  'strategy video game': ['estrategia'], 'strategy game': ['estrategia'],
  'simulation video game': ['simulacao'], 'simulation game': ['simulacao'],
  'survival horror': ['terror', 'sobrevivencia'], 'horror video game': ['terror'],
  'music video game': ['ritmo'], 'rhythm game': ['ritmo'],
  'massively multiplayer online role-playing game': ['mmo', 'rpg'],
  'beat em up': ['acao'], 'shoot em up': ['arcade'],
  'open world': ['mundo-aberto'], 'open-world action': ['acao', 'mundo-aberto'],
  'metroidvania': ['metroidvania'], 'soulsvania': ['metroidvania', 'hack-slash'],

  // rótulos do Metacritic
  'precision platformer': ['plataforma'],
  'cyberpunk': [], 'fantasy': [], 'sci fi': [], 'nudity': [], 'singleplayer': [], 'story rich': [],
  'great soundtrack': [], 'time travel': [], 'classic': [],
  'open world action': ['acao', 'mundo-aberto'], 'open-world action': ['acao', 'mundo-aberto'],
  'action adventure': ['acao', 'aventura'],
  'retro': []
};

function normalizeLabel(str) {
  return String(str || '')
    .toLowerCase()
    .replace(/\s*&\s*/g, ' and ')
    .replace(/[^a-z0-9 ]+/g, '')
    .trim();
}

/** Converte uma lista de rótulos crus em chaves de gênero únicas. */
function toGenreKeys(labels) {
  const out = new Set();
  for (const raw of labels || []) {
    const n = normalizeLabel(raw);
    const mapped = LABEL_MAP[n];
    if (mapped) mapped.forEach(k => out.add(k));
    // também aceita já vir como chave canônica
    else if (GENRES.some(g => g.key === n)) out.add(n);
  }
  return [...out];
}

/* ------------------------------------------------------------------ */
/* HTTP                                                                */
/* ------------------------------------------------------------------ */

async function getJson(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': UA, Accept: 'application/json' }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  } finally {
    clearTimeout(timer);
  }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ------------------------------------------------------------------ */
/* Heurística para ROMs (quando a loja não conhece o título)           */
/* ------------------------------------------------------------------ */

// [regex, gêneros, é_regra_genérica]  — regras específicas vencem as genéricas
const SERIES_RULES = [
  [/mario kart|f-?zero|top gear|rock n.? roll racing|micro machines|crash team racing/i, ['corrida'], false],
  [/street fighter|mortal kombat|tekken|king of fighters|soulcalibur|killer instinct|super smash|smash bros|virtua fighter|guilty gear/i, ['luta'], false],
  [/pokemon|dragon quest|final fantasy|chrono|earthbound|breath of fire|phantasy star|lufia|suikoden|secret of mana|golden sun|fire emblem|xenogears/i, ['rpg'], false],
  [/metroid|castlevania|hollow|axiom verge|bloodstained/i, ['metroidvania', 'plataforma'], false],
  [/mario|sonic|donkey kong country|kirby|rayman|crash bandicoot|spyro|yoshi|celeste|super meat boy|mega man|shantae/i, ['plataforma'], true],
  [/zelda|okami|ico|shadow of the colossus|star fox/i, ['aventura', 'acao'], false],
  [/contra|metal slug|gunstar|cuphead|mega man x|gradius|1942|doom|duke nukem/i, ['acao', 'arcade'], false],
  [/resident evil|silent hill|alone in the dark|fatal frame|splatterhouse|house of the dead/i, ['terror'], false],
  [/tetris|columns|puyo|dr mario|bust a move|puzzle bobble/i, ['puzzle'], false],
  [/sim city|simcity|theme park|the sims|harvest moon|story of seasons|animal crossing|stardew|age of empires|warcraft|command & conquer|advance wars|fire emblem/i, ['estrategia', 'simulacao'], false],
  [/fifa|nba|madden|nhl|pes 20|winning eleven|tony hawk|ssx|wii sports|mario tennis|mario golf/i, ['esporte'], false],
  [/beatmania|guitar hero|rock band|ddr|dance dance|taiko|parappa|amplitude/i, ['ritmo'], false],
  [/pac-man|space invaders|galaga|dig dug|bubble bobble|frogger|centipede|defender/i, ['arcade'], false],
  [/sonic the hedgehog/i, ['plataforma'], true]
];

/* ------------------------------------------------------------------ */
/* Busca de appid                                                      */
/* ------------------------------------------------------------------ */

const searchCache = new Map();

async function steamAppIdFor(title) {
  const key = normalizeLabel(title);
  if (searchCache.has(key)) return searchCache.get(key);
  const url = `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(title)}&cc=br&l=portuguese`;
  let appId = null;
  try {
    const data = await getJson(url);
    const items = (data && data.items) || [];
    if (items.length) {
      const target = normalizeLabel(title);
      // escolhe o nome mais parecido (evita pegar "Silksong" quando pedimos "Hollow Knight")
      let best = null; let bestScore = 0;
      for (const it of items) {
        const cand = normalizeLabel(it.name);
        let sc = 0;
        if (cand === target) sc = 100;
        else if (cand.startsWith(target) || target.startsWith(cand)) sc = 80;
        else if (cand.includes(target)) sc = 65;
        else {
          const tw = target.split(' ').filter(Boolean);
          const cw = new Set(cand.split(' '));
          const hits = tw.filter(w => cw.has(w)).length;
          if (tw.length) sc = (hits / tw.length) * 50;
        }
        if (sc > bestScore) { bestScore = sc; best = it; }
      }
      if (best && bestScore >= 50) appId = String(best.id);
    }
  } catch { /* sem internet / busca falhou */ }
  searchCache.set(key, appId);
  return appId;
}

/* ------------------------------------------------------------------ */
/* Gêneros de um jogo                                                  */
/* ------------------------------------------------------------------ */

async function steamGenres(appId) {
  const url = `https://store.steampowered.com/api/appdetails?appids=${appId}&l=portuguese&filters=genres`;
  try {
    const data = await getJson(url);
    const entry = data && data[appId];
    const genres = (entry && entry.data && entry.data.genres) || [];
    return genres.map(g => g.description);
  } catch { return []; }
}

async function steamSpyTags(appId) {
  try {
    const data = await getJson(`https://steamspy.com/api.php?request=appdetails&appid=${appId}`);
    const tags = data && data.tags ? Object.keys(data.tags) : [];
    const genre = data && data.genre ? String(data.genre).split(',').map(s => s.trim()) : [];
    return [...genre, ...tags];
  } catch { return []; }
}

function heuristicGenres(game) {
  const hay = `${game.title} ${game.launch && game.launch.rom ? game.launch.rom : ''}`;
  const keys = new Set();
  let matchedSpecific = false;
  for (const [re, gs, generic] of SERIES_RULES) {
    if (!re.test(hay)) continue;
    if (generic && matchedSpecific) continue;      // "Mario Kart" não vira plataforma
    gs.forEach(g => keys.add(g));
    if (!generic) matchedSpecific = true;
  }
  // plataformas com vocação clara
  if (game.platformKey === 'arcade') keys.add('arcade');
  if (['gb', 'gbc', 'gba'].includes(game.platformKey) && !keys.size) keys.add('plataforma');
  return [...keys];
}

/**
 * Descobre os gêneros de um jogo (com cache).
 * @returns {Promise<{genres: string[], raw: string[], source: string}>}
 */
async function fetchGenres(game, cache) {
  const cacheKey = normalizeLabel(game.title);
  if (cache && cache[cacheKey] && cache[cacheKey].genres && cache[cacheKey].genres.length) {
    return { ...cache[cacheKey], cached: true };
  }

  let appId = null;
  if (game.launch && game.launch.type === 'steam' && game.launch.appId) appId = String(game.launch.appId);
  if (!appId) appId = await steamAppIdFor(game.title);

  let raw = [];
  let source = 'heurística';

  if (appId) {
    raw = await steamGenres(appId);
    if (!raw.length) raw = await steamSpyTags(appId);
    else {
      await sleep(120);
      const tags = await steamSpyTags(appId);       // tags trazem gêneros mais finos
      raw = [...raw, ...tags];
    }
    if (raw.length) source = 'steam';
  }

  let genres = toGenreKeys(raw);
  if (!genres.length) {
    genres = heuristicGenres(game);
    raw = genres.map(g => genreInfo(g).label);
    if (genres.length) source = source === 'steam' ? 'steam+heurística' : 'heurística';
  }

  const result = { genres, raw: raw.slice(0, 40), source, at: Date.now() };
  if (cache) cache[cacheKey] = result;
  return result;
}

/** Classifica vários jogos, avisando o progresso. */
async function fetchGenresMany(games, cache, onProgress) {
  const done = [];
  const failed = [];
  for (let i = 0; i < games.length; i++) {
    const game = games[i];
    try {
      const r = await fetchGenres(game, cache);
      if (r.genres && r.genres.length) done.push({ id: game.id, title: game.title, genres: r.genres, source: r.source });
      else failed.push({ id: game.id, title: game.title, reason: 'sem gênero identificado' });
    } catch (e) {
      failed.push({ id: game.id, title: game.title, reason: e.message });
    }
    if (onProgress) onProgress(i + 1, games.length, game.title);
    await sleep(220); // educado com a API da Steam
  }
  return { done, failed };
}

module.exports = {
  GENRES, genreInfo, toGenreKeys, fetchGenres, fetchGenresMany,
  heuristicGenres, steamAppIdFor, steamGenres, steamSpyTags, normalizeLabel
};
