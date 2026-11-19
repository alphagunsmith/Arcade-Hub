'use strict';
/**
 * Arcade Hub — ficha do jogo (metadados) de várias fontes
 *
 * Para jogos que NÃO são da Steam, procura em:
 *   1. Steam       — se o título existir lá (gêneros oficiais + appid)
 *   2. Metacritic  — nota da crítica, nota dos usuários, ano, dev, publicadora,
 *                    classificação etária, gêneros e descrição
 *   3. Wikidata    — gêneros, desenvolvedora, publicadora e data (para o que
 *                    o Metacritic não tiver, principalmente jogos antigos/ROMs)
 *
 * Nada disso quebra o app se estiver sem internet: cada fonte falha em
 * silêncio e o resultado é cacheado no library.json.
 */

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 ArcadeHub/1.0';
const TIMEOUT = 12000;

async function getJson(url, headers) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': UA, Accept: 'application/json', ...(headers || {}) }
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  } finally {
    clearTimeout(timer);
  }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

/* Fila global: o Wikidata bloqueia quem faz muitas requisições seguidas.
   Serializamos e espaçamos as chamadas (~1,1s) com retry em caso de 429. */
let wdChain = Promise.resolve();
let wdLast = 0;
const WD_GAP = 1100;

function wikidataQueue(fn) {
  const run = async () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      const wait = Math.max(0, wdLast + WD_GAP - Date.now());
      if (wait) await sleep(wait);
      wdLast = Date.now();
      try {
        return await fn();
      } catch (e) {
        const msg = String(e && e.message || e);
        if (!/429|too many|HTTP 5\d\d/i.test(msg)) throw e;
        await sleep(1500 * (attempt + 1));   // backoff
      }
    }
    return null;
  };
  const p = wdChain.then(run, run);
  wdChain = p.catch(() => {});
  return p;
}

// resposta em texto (o Wikidata às vezes devolve mensagem pura, não JSON)
async function getJsonLoose(url, headers) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': UA, Accept: 'application/json', ...(headers || {}) } });
    const text = await res.text();
    if (/too many requests/i.test(text)) throw new Error('429 too many requests');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    try { return JSON.parse(text); } catch { throw new Error('resposta inválida'); }
  } finally {
    clearTimeout(timer);
  }
}

// abreviações comuns → nome oficial (ajuda Steam/Metacritic a achar o jogo)
const ALIASES = [
  [/^gta\s*(v|5)$/i, 'Grand Theft Auto V'],
  [/^gta\s*(iv|4)$/i, 'Grand Theft Auto IV'],
  [/^gta\s*(iii|3)$/i, 'Grand Theft Auto III'],
  [/^gta\s*(sa|san andreas)$/i, 'Grand Theft Auto San Andreas'],
  [/^gta\s*(vc|vice city)$/i, 'Grand Theft Auto Vice City'],
  [/^(rdr\s*2|rdr2)$/i, 'Red Dead Redemption 2'],
  [/^(tw3|witcher\s*3)$/i, 'The Witcher 3'],
  [/^sotn$/i, 'Castlevania Symphony of the Night'],
  [/^(re|resident evil)\s*4$/i, 'Resident Evil 4'],
  [/^(ff|final fantasy)\s*(vii|7)$/i, 'Final Fantasy VII'],
  [/^(ff|final fantasy)\s*(vi|6)$/i, 'Final Fantasy VI'],
  [/^sf\s*(ii|2)$/i, 'Street Fighter II'],
  [/^mk\s*8$/i, 'Mario Kart 8'],
  [/^sm64$/i, 'Super Mario 64'],
  [/^(oot|zelda oot)$/i, 'Ocarina of Time'],
  [/^(mgs|metal gear solid)\s*(v|5)$/i, 'Metal Gear Solid V'],
  [/^(ds|dark souls)\s*(iii|3)$/i, 'Dark Souls III']
];

function expandTitle(title) {
  const t = String(title || '').trim();
  for (const [re, full] of ALIASES) if (re.test(t)) return full;
  return t;
}

const ROMAN = { ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10, xi: 11, xii: 12 };

function normalize(str) {
  return String(str || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u2122\u00ae]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\b(the|a|an|of|and|edition|definitive|remastered|complete|goty)\b/g, ' ')
    // "Dark Souls III" == "Dark Souls 3", "Final Fantasy VII" == "Final Fantasy 7"
    .replace(/\b(xii|xi|ix|viii|vii|vi|iv|iii|ii|v|x)\b/g, m => String(ROMAN[m]))
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function similarity(a, b) {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const A = new Set(na.split(' ').filter(Boolean));
  const B = new Set(nb.split(' ').filter(Boolean));
  if (!A.size || !B.size) return 0;
  let hit = 0;
  for (const w of A) if (B.has(w)) hit++;
  const overlap = hit / Math.max(A.size, B.size);
  // "The Witcher 3" ⊂ "The Witcher 3: Wild Hunt" — o nome procurado estar
  // contido no candidato também vale muito (evita pegar DLC/ferramenta errada,
  // mas aceita o subtítulo oficial do jogo)
  const containment = (na.includes(nb) || nb.includes(na)) ? 0.85 : 0;
  // bônus quando o candidato COMEÇA com o nome procurado
  const startsWith = nb.startsWith(na) || na.startsWith(nb) ? 0.1 : 0;
  return Math.min(1, Math.max(overlap, containment) + startsWith);
}

/* ------------------------------------------------------------------ */
/* 1. Steam (appid + gêneros)                                          */
/* ------------------------------------------------------------------ */

async function steamMeta(game) {
  const out = { source: 'steam' };
  try {
    let appId = game.launch && game.launch.type === 'steam' ? String(game.launch.appId) : null;
    if (!appId) {
      const query = expandTitle(game.title);
      const s = await getJson(`https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(query)}&cc=br&l=portuguese`);
      const items = (s && s.items) || [];
      let best = null; let bestScore = 0;
      for (const it of items) {
        const sc = similarity(it.name, expandTitle(game.title));
        if (sc > bestScore) { bestScore = sc; best = it; }
      }
      if (best && bestScore >= 0.6) appId = String(best.id);
    }
    if (!appId) return null;
    out.appId = appId;

    const d = await getJson(`https://store.steampowered.com/api/appdetails?appids=${appId}&l=portuguese&filters=genres`);
    const entry = d && d[appId];
    out.genresRaw = ((entry && entry.data && entry.data.genres) || []).map(g => g.description);

    // tags do SteamSpy ajudam a refinar gêneros
    try {
      await sleep(100);
      const spy = await getJson(`https://steamspy.com/api.php?request=appdetails&appid=${appId}`);
      const tags = spy && spy.tags ? Object.keys(spy.tags) : [];
      const genre = spy && spy.genre ? String(spy.genre).split(',').map(s => s.trim()) : [];
      out.genresRaw = [...(out.genresRaw || []), ...genre, ...tags];
    } catch { /* opcional */ }

    return out.genresRaw && out.genresRaw.length ? out : null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* 2. Metacritic                                                       */
/* ------------------------------------------------------------------ */

const MC_SEARCH = q => `https://backend.metacritic.com/finder/metacritic/search/${encodeURIComponent(q)}/web?offset=0&limit=8&mcoTypeId=13`;
const MC_GAME = slug => `https://backend.metacritic.com/games/metacritic/${slug}/web`;

async function metacriticMeta(game) {
  try {
    const search = await getJson(MC_SEARCH(expandTitle(game.title)));
    const items = (search && search.data && search.data.items) || [];
    if (!items.length) return null;

    // melhor candidato pelo nome (e tipo "game-title")
    let bestScore = 0;
    const scored = [];
    for (const it of items) {
      if (it.type && it.type !== 'game-title') continue;
      const sc = similarity(it.title, expandTitle(game.title));
      if (sc > bestScore) bestScore = sc;
      scored.push({ it, sc });
    }
    if (bestScore < 0.55) return null;
    // entre os candidatos igualmente parecidos, fica com o lançamento ORIGINAL
    // (evita pegar remaster/relançamento de 2026 quando você tem o de 1998)
    // 1º: nome mais parecido (exato vence "sem o número do título");
    // 2º: entre nomes empatados, o lançamento mais antigo (original, não remaster)
    const near = scored.filter(x => x.sc >= bestScore - 0.02);
    near.sort((a, b) => {
      if (Math.abs(b.sc - a.sc) > 0.001) return b.sc - a.sc;
      const ya = a.it.premiereYear || 9999;
      const yb = b.it.premiereYear || 9999;
      return ya - yb;
    });
    const best = near[0].it;

    const out = {
      source: 'metacritic',
      slug: best.slug,
      url: 'https://www.metacritic.com/game/' + best.slug + '/',
      title: best.title,
      score: best.criticScoreSummary && best.criticScoreSummary.score != null ? best.criticScoreSummary.score : null,
      genresRaw: (best.genres || []).map(g => g.name),
      year: best.premiereYear || (best.releaseDate ? Number(String(best.releaseDate).slice(0, 4)) : null),
      releaseDate: best.releaseDate || null,
      rating: best.rating || null,
      description: best.description || null,
      cover: null,
      platforms: (best.platforms || []).map(p => p.name)
    };

    // detalhe: devs, publicadoras, nota por plataforma, capa
    await sleep(120);
    let detail = null;
    try { detail = await getJson(MC_GAME(best.slug)); } catch { /* sem detalhe */ }
    const item = detail && detail.data && detail.data.item;
    if (item) {
      const companies = (item.production && item.production.companies) || [];
      out.developers = companies.filter(c => /developer/i.test(c.typeName)).map(c => c.name);
      out.publishers = companies.filter(c => /publisher/i.test(c.typeName)).map(c => c.name);
      out.genresRaw = (item.genres && item.genres.length ? item.genres : []).map(g => g.name).concat(out.genresRaw || []);
      out.year = out.year || item.premiereYear || null;
      out.rating = out.rating || item.rating || null;
      out.description = out.description || item.description || null;
      if (item.criticScoreSummary && item.criticScoreSummary.score != null) out.score = item.criticScoreSummary.score;

      // nota específica da plataforma do jogo (PC / console), quando existir
      const platList = item.platforms || [];
      const wanted = /pc|rom|game|exe|manual|folder/.test(String(game.platform || '').toLowerCase()) || !game.platformKey
        ? /^pc$/i
        : new RegExp(String(game.platform).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      const p = platList.find(x => wanted.test(x.name)) || platList.find(x => x.isLeadPlatform) || platList[0];
      if (p && p.criticScoreSummary && p.criticScoreSummary.score != null) {
        out.platformScore = { platform: p.name, score: p.criticScoreSummary.score };
      }

      // capa vertical (o bucket "catalog" é o que responde 200)
      const imgs = (item.images || []).concat((best.images || []));
      const card = imgs.find(i => i.bucketType === 'catalog') || imgs[0];
      if (card && card.bucketPath) out.cover = 'https://www.metacritic.com/a/img/catalog' + card.bucketPath;
    }

    return out;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* 3. Wikidata                                                         */
/* ------------------------------------------------------------------ */

const WD_API = 'https://www.wikidata.org/w/api.php';

async function wikidataMeta(game) {
  try {
    const s = await wikidataQueue(() => getJsonLoose(`${WD_API}?action=wbsearchentities&search=${encodeURIComponent(expandTitle(game.title))}&language=en&uselang=en&format=json&type=item&limit=5`));
    const hits = (s && s.search) || [];
    if (!hits.length) return null;
    // prefere itens descritos como "video game"
    const cand = hits.find(h => /video game/i.test(h.description || '')) || hits[0];

    const d = await wikidataQueue(() => getJsonLoose(`${WD_API}?action=wbgetentities&ids=${cand.id}&props=claims|labels&languages=en|pt&format=json`));
    const ent = d && d.entities && d.entities[cand.id];
    if (!ent || !ent.claims) return null;
    const claims = ent.claims;
    const ids = prop => (claims[prop] || []).map(c => c.mainsnak && c.mainsnak.datavalue && c.mainsnak.datavalue.value && c.mainsnak.datavalue.value.id).filter(Boolean);

    const genreIds = ids('P136');
    const devIds = ids('P178');
    const pubIds = ids('P123');
    const seriesIds = ids('P179');
    const time = (claims.P577 || []).map(c => c.mainsnak && c.mainsnak.datavalue && c.mainsnak.datavalue.value && c.mainsnak.datavalue.value.time)[0];

    const labelFor = async list => {
      if (!list.length) return [];
      const r = await wikidataQueue(() => getJsonLoose(`${WD_API}?action=wbgetentities&ids=${list.slice(0, 20).join('|')}&props=labels&languages=en|pt&format=json`));
      if (!r) return [];
      return list.map(id => {
        const e = r.entities && r.entities[id];
        return e && ((e.labels && e.labels.en && e.labels.en.value) || (e.labels && e.labels.pt && e.labels.pt.value)) || null;
      }).filter(Boolean);
    };

    const [genres, devs, pubs] = await Promise.all([labelFor(genreIds), labelFor(devIds), labelFor(pubIds)]);
    if (!genres.length && !devs.length && !time) return null;

    return {
      source: 'wikidata',
      qid: cand.id,
      url: 'https://www.wikidata.org/wiki/' + cand.id,
      genresRaw: genres,
      developers: devs,
      publishers: pubs,
      year: time ? Number(String(time).replace(/^\+/, '').slice(0, 4)) : null,
      seriesIds
    };
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Combinação                                                          */
/* ------------------------------------------------------------------ */

/**
 * Reúne tudo o que encontrar sobre o jogo.
 * @returns {Promise<object>} metadados normalizados (nunca lança)
 */
async function lookup(game, opts) {
  opts = opts || {};
  const sources = [];
  const result = {
    title: game.title,
    genresRaw: [],
    score: null, platformScore: null, year: null, developers: [], publishers: [],
    rating: null, description: null, cover: null, mcUrl: null, steamAppId: null,
    platforms: [], sources, at: Date.now()
  };

  // ordem importa: Steam define appid; Metacritic traz nota e ficha; Wikidata completa
  const tasks = [steamMeta(game), metacriticMeta(game)];
  const [steam, mc] = await Promise.all(tasks);

  if (steam) {
    sources.push('steam');
    result.steamAppId = steam.appId;
    result.genresRaw.push(...(steam.genresRaw || []));
  }
  if (mc) {
    sources.push('metacritic');
    result.genresRaw.push(...(mc.genresRaw || []));
    result.score = mc.score;
    result.platformScore = mc.platformScore || null;
    result.year = result.year || mc.year;
    result.developers.push(...(mc.developers || []));
    result.publishers.push(...(mc.publishers || []));
    result.rating = mc.rating;
    result.description = mc.description;
    result.mcUrl = mc.url;
    result.platforms = mc.platforms || [];
    if (mc.cover) result.cover = { url: mc.cover, source: 'metacritic' };
  }

  // Wikidata só se faltar coisa importante
  const missing = !result.genresRaw.length || !result.year || (!result.developers.length && !result.publishers.length);
  if (missing && opts.wikidata !== false) {
    const wd = await wikidataMeta(game);
    if (wd) {
      sources.push('wikidata');
      result.genresRaw.push(...(wd.genresRaw || []));
      if (!result.developers.length) result.developers.push(...(wd.developers || []));
      if (!result.publishers.length) result.publishers.push(...(wd.publishers || []));
      result.year = result.year || wd.year;
      result.wikidataUrl = wd.url;
    }
  }

  // limpeza
  result.genresRaw = [...new Set(result.genresRaw.filter(Boolean))];
  result.developers = [...new Set(result.developers.filter(Boolean))].slice(0, 3);
  result.publishers = [...new Set(result.publishers.filter(Boolean))].slice(0, 3);
  if (result.description) result.description = String(result.description).replace(/\s+/g, ' ').trim().slice(0, 700);
  if (!result.genresRaw.length) delete result.genresRaw;

  return result;
}

module.exports = { lookup, steamMeta, metacriticMeta, wikidataMeta, normalize, similarity, expandTitle };
