'use strict';
/**
 * Arcade Hub — conquistas (por perfil).
 *
 * Tudo sai do que o app já guarda: o histórico de sessões de cada jogo
 * ({ at: fim, ms: duração, perfil }), a biblioteca e os favoritos. Nada é
 * inventado ou mandado para fora. A data de desbloqueio é a da sessão que
 * completou a meta; uma vez desbloqueada, a conquista fica guardada (mesmo que
 * o histórico antigo seja podado).
 *
 * Níveis como os troféus: bronze (10), prata (25), ouro (50) e platina (100
 * pontos). A soma dá a "pontuação" do perfil.
 */

const NIVEIS = { bronze: 10, prata: 25, ouro: 50, platina: 100 };
const HORA = 3600000;
const DIA = 86400000;

/** Dia local (AAAA-MM-DD) de um instante. */
function diaDe(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Sessões de um perfil, em ordem. Sessões antigas (de antes dos perfis) não
 * têm "perfil": contam para o perfil principal.
 */
function sessoesDo(jogos, perfil, principal) {
  const lista = [];
  for (const g of jogos) {
    const h = (g.playtime && Array.isArray(g.playtime.history)) ? g.playtime.history : [];
    for (const s of h) {
      const dono = s.perfil || principal;
      if (dono !== perfil || !(s.ms > 0) || !s.at) continue;
      lista.push({ at: s.at, ms: s.ms, inicio: s.at - s.ms, jogo: g });
    }
  }
  return lista.sort((a, b) => a.at - b.at);
}

/** Primeiro instante em que uma contagem acumulada chega à meta (ou null). */
function quandoChega(sessoes, meta, valor) {
  let acc = 0;
  for (const s of sessoes) {
    acc += valor(s);
    if (acc >= meta) return s.at;
  }
  return null;
}

/** Primeiro instante em que N itens distintos (por chave) foram vistos. */
function quandoDistintos(sessoes, meta, chave) {
  const vistos = new Set();
  for (const s of sessoes) {
    const k = chave(s);
    if (k == null) continue;
    vistos.add(k);
    if (vistos.size >= meta) return s.at;
  }
  return null;
}

function contaDistintos(sessoes, chave) {
  return new Set(sessoes.map(chave).filter(k => k != null)).size;
}

/** Maior sequência de dias seguidos com sessão (e quando ela chegou a N). */
function sequenciaDeDias(sessoes, meta) {
  const dias = [...new Set(sessoes.map(s => diaDe(s.at)))].sort();
  let melhor = 0, atual = 0, anterior = null, quando = null;
  const fimDoDia = new Map();
  for (const s of sessoes) fimDoDia.set(diaDe(s.at), s.at);
  for (const d of dias) {
    const t = new Date(d + 'T12:00:00').getTime();
    atual = anterior != null && Math.round((t - anterior) / DIA) === 1 ? atual + 1 : 1;
    anterior = t;
    if (atual > melhor) melhor = atual;
    if (quando == null && atual >= meta) quando = fimDoDia.get(d);
  }
  return { melhor, quando };
}

/** Mesmo jogo em N dias diferentes. */
function jogoFiel(sessoes, meta) {
  const porJogo = new Map();
  let melhor = 0;
  for (const s of sessoes) {
    if (!porJogo.has(s.jogo.id)) porJogo.set(s.jogo.id, new Set());
    const dias = porJogo.get(s.jogo.id);
    dias.add(diaDe(s.at));
    if (dias.size > melhor) melhor = dias.size;
    if (dias.size >= meta) return { melhor: dias.size, quando: s.at };
  }
  return { melhor, quando: null };
}

/** Sessão que passou pela madrugada (entre 2h e 5h). */
function madrugada(sessoes) {
  for (const s of sessoes) {
    for (let t = s.inicio; t <= s.at; t += 15 * 60000) {
      const h = new Date(t).getHours();
      if (h >= 2 && h < 5) return s.at;
    }
  }
  return null;
}

/** Jogou no sábado e no domingo do mesmo fim de semana. */
function fimDeSemana(sessoes) {
  const sabados = new Set();
  for (const s of sessoes) {
    const d = new Date(s.at);
    if (d.getDay() === 6) sabados.add(diaDe(s.at));
    if (d.getDay() === 0) {
      const ontem = diaDe(s.at - DIA);
      if (sabados.has(ontem)) return s.at;
    }
  }
  return null;
}

const plataformaRom = s => (s.jogo.kind === 'rom' ? (s.jogo.platformKey || s.jogo.platform || null) : null);
const loja = s => (s.jogo.kind !== 'rom' && ['steam', 'epic', 'gog', 'xbox', 'ea', 'ubisoft', 'battlenet', 'amazon', 'itch'].includes(s.jogo.source) ? s.jogo.source : null);

/**
 * Lista de conquistas. Cada uma devolve { quando, atual, meta }:
 * quando = instante em que foi completada (ou null); atual/meta = progresso.
 */
const CONQUISTAS = [
  { id: 'primeira', nome: 'Aperte Start', desc: 'Jogue sua primeira partida pelo Arcade Hub.', nivel: 'bronze', icone: '▶',
    calc: c => ({ quando: c.sessoes[0] ? c.sessoes[0].at : null, atual: Math.min(1, c.sessoes.length), meta: 1 }) },
  { id: 'sessoes10', nome: 'Pegando o jeito', desc: 'Jogue 10 partidas.', nivel: 'bronze', icone: '🎮',
    calc: c => ({ quando: c.sessoes[9] ? c.sessoes[9].at : null, atual: c.sessoes.length, meta: 10 }) },
  { id: 'sessoes100', nome: 'Sem desligar', desc: 'Jogue 100 partidas.', nivel: 'ouro', icone: '🔁',
    calc: c => ({ quando: c.sessoes[99] ? c.sessoes[99].at : null, atual: c.sessoes.length, meta: 100 }) },
  { id: 'horas1', nome: 'Aquecimento', desc: 'Some 1 hora de jogo.', nivel: 'bronze', icone: '⏱',
    calc: c => ({ quando: quandoChega(c.sessoes, HORA, s => s.ms), atual: c.totalMs / HORA, meta: 1 }) },
  { id: 'horas10', nome: 'Dedicação', desc: 'Some 10 horas de jogo.', nivel: 'prata', icone: '⏳',
    calc: c => ({ quando: quandoChega(c.sessoes, 10 * HORA, s => s.ms), atual: c.totalMs / HORA, meta: 10 }) },
  { id: 'horas100', nome: 'Centenário', desc: 'Some 100 horas de jogo.', nivel: 'ouro', icone: '💯',
    calc: c => ({ quando: quandoChega(c.sessoes, 100 * HORA, s => s.ms), atual: c.totalMs / HORA, meta: 100 }) },
  { id: 'horas500', nome: 'Lenda do sofá', desc: 'Some 500 horas de jogo.', nivel: 'platina', icone: '👑',
    calc: c => ({ quando: quandoChega(c.sessoes, 500 * HORA, s => s.ms), atual: c.totalMs / HORA, meta: 500 }) },
  { id: 'maratona', nome: 'Maratona', desc: 'Jogue 3 horas seguidas numa partida.', nivel: 'prata', icone: '🏃',
    calc: c => { const s = c.sessoes.find(x => x.ms >= 3 * HORA); return { quando: s ? s.at : null, atual: c.maiorMs / HORA, meta: 3 }; } },
  { id: 'ultramaratona', nome: 'Ultramaratona', desc: 'Jogue 6 horas seguidas numa partida.', nivel: 'ouro', icone: '🔥',
    calc: c => { const s = c.sessoes.find(x => x.ms >= 6 * HORA); return { quando: s ? s.at : null, atual: c.maiorMs / HORA, meta: 6 }; } },
  { id: 'coruja', nome: 'Coruja', desc: 'Esteja jogando entre 2h e 5h da manhã.', nivel: 'bronze', icone: '🦉',
    calc: c => { const q = madrugada(c.sessoes); return { quando: q, atual: q ? 1 : 0, meta: 1 }; } },
  { id: 'fds', nome: 'Fim de semana gamer', desc: 'Jogue no sábado e no domingo do mesmo fim de semana.', nivel: 'bronze', icone: '📅',
    calc: c => { const q = fimDeSemana(c.sessoes); return { quando: q, atual: q ? 1 : 0, meta: 1 }; } },
  { id: 'sequencia7', nome: 'Sequência', desc: 'Jogue 7 dias seguidos.', nivel: 'prata', icone: '📆',
    calc: c => { const r = sequenciaDeDias(c.sessoes, 7); return { quando: r.quando, atual: r.melhor, meta: 7 }; } },
  { id: 'sequencia30', nome: 'Rotina de campeão', desc: 'Jogue 30 dias seguidos.', nivel: 'platina', icone: '🏆',
    calc: c => { const r = sequenciaDeDias(c.sessoes, 30); return { quando: r.quando, atual: r.melhor, meta: 30 }; } },
  { id: 'fiel', nome: 'Fiel', desc: 'Jogue o mesmo jogo em 7 dias diferentes.', nivel: 'prata', icone: '💙',
    calc: c => { const r = jogoFiel(c.sessoes, 7); return { quando: r.quando, atual: r.melhor, meta: 7 }; } },
  { id: 'variado5', nome: 'Variado', desc: 'Jogue 5 jogos diferentes.', nivel: 'bronze', icone: '🎲',
    calc: c => ({ quando: quandoDistintos(c.sessoes, 5, s => s.jogo.id), atual: contaDistintos(c.sessoes, s => s.jogo.id), meta: 5 }) },
  { id: 'explorador', nome: 'Explorador', desc: 'Jogue 25 jogos diferentes.', nivel: 'ouro', icone: '🧭',
    calc: c => ({ quando: quandoDistintos(c.sessoes, 25, s => s.jogo.id), atual: contaDistintos(c.sessoes, s => s.jogo.id), meta: 25 }) },
  { id: 'raiz', nome: 'Raiz', desc: 'Jogue ROMs de 3 consoles diferentes.', nivel: 'prata', icone: '🕹',
    calc: c => ({ quando: quandoDistintos(c.sessoes, 3, plataformaRom), atual: contaDistintos(c.sessoes, plataformaRom), meta: 3 }) },
  { id: 'museu', nome: 'Museu vivo', desc: 'Jogue ROMs de 6 consoles diferentes.', nivel: 'ouro', icone: '🏛',
    calc: c => ({ quando: quandoDistintos(c.sessoes, 6, plataformaRom), atual: contaDistintos(c.sessoes, plataformaRom), meta: 6 }) },
  { id: 'sem-fronteiras', nome: 'Sem fronteiras', desc: 'Jogue jogos de 3 lojas diferentes (Steam, Epic, GOG…).', nivel: 'prata', icone: '🌐',
    calc: c => ({ quando: quandoDistintos(c.sessoes, 3, loja), atual: contaDistintos(c.sessoes, loja), meta: 3 }) },
  { id: 'colecao50', nome: 'Colecionador', desc: 'Tenha 50 jogos na biblioteca.', nivel: 'bronze', icone: '📚',
    calc: c => ({ quando: c.jogos.length >= 50 ? c.agora : null, atual: c.jogos.length, meta: 50 }) },
  { id: 'colecao200', nome: 'Acervo', desc: 'Tenha 200 jogos na biblioteca.', nivel: 'prata', icone: '🗄',
    calc: c => ({ quando: c.jogos.length >= 200 ? c.agora : null, atual: c.jogos.length, meta: 200 }) },
  { id: 'escolhidos', nome: 'Os escolhidos', desc: 'Marque 10 jogos como favoritos.', nivel: 'bronze', icone: '★',
    calc: c => ({ quando: c.favoritos >= 10 ? c.agora : null, atual: c.favoritos, meta: 10 }) }
];

/**
 * Avalia as conquistas de um perfil.
 * @param {object} p
 * @param {object[]} p.jogos       biblioteca (com playtime.history)
 * @param {string}   p.perfil      id do perfil
 * @param {string}   p.principal   id do perfil que herda as sessões sem dono
 * @param {number}   [p.favoritos] quantos favoritos
 * @param {object}   [p.guardadas] { id: timestamp } já desbloqueadas antes
 * @param {number}   [p.agora]
 * @returns {{ lista: object[], pontos: number, total: number, novas: object[], guardadas: object }}
 */
function avaliar(p) {
  const agora = p.agora || Date.now();
  const sessoes = sessoesDo(p.jogos || [], p.perfil, p.principal);
  const ctx = {
    sessoes, agora, jogos: p.jogos || [],
    favoritos: p.favoritos || 0,
    totalMs: sessoes.reduce((a, s) => a + s.ms, 0),
    maiorMs: sessoes.reduce((a, s) => Math.max(a, s.ms), 0)
  };
  const guardadas = { ...(p.guardadas || {}) };
  const novas = [];
  let pontos = 0;
  const lista = CONQUISTAS.map(c => {
    let r;
    try { r = c.calc(ctx); } catch { r = { quando: null, atual: 0, meta: 1 }; }
    let quando = guardadas[c.id] || null;
    if (!quando && r.quando) {
      quando = r.quando;
      guardadas[c.id] = quando;
      novas.push(c.id);
    }
    const valor = NIVEIS[c.nivel];
    if (quando) pontos += valor;
    const meta = r.meta || 1;
    const atual = quando ? meta : Math.min(meta, Math.floor((r.atual || 0) * 10) / 10);
    return { id: c.id, nome: c.nome, desc: c.desc, nivel: c.nivel, icone: c.icone, pontos: valor, quando, atual, meta };
  });
  const total = CONQUISTAS.reduce((a, c) => a + NIVEIS[c.nivel], 0);
  return { lista, pontos, total, novas: lista.filter(x => novas.includes(x.id)), guardadas };
}

module.exports = { avaliar, CONQUISTAS, NIVEIS, diaDe, sessoesDo };
