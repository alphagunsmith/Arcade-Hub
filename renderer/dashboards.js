/* ================= Arcade Hub — temas de DASHBOARD =================
 *
 * Além das skins de cor (skins.js), existem os TEMAS DE DASHBOARD: cada um
 * imita a interface de um console de verdade — e muda também o jeito de
 * navegar, não só as cores.
 *
 * Tipos de layout implementados aqui:
 *
 *   xmb        colunas verticais (PSP, PS3, PS4, PS Vita, PS2)
 *              ← → troca de coluna, ↑ ↓ anda dentro da coluna, cada coluna vira
 *              um filtro real da biblioteca (Jogos / Emuladores / Favoritos…)
 *   blades     painéis horizontais em perspectiva (Xbox 360, Xbox original)
 *   canais     grade de canais (Wii, Wii U)
 *   coverflow  capas deitadas com a selecionada no meio e as outras em
 *              perspectiva (Aurora, FSD/Freestyle — os dashboards de RGH)
 *   tiles      fileira horizontal de tiles (Switch, Xbox One — XeXMenu)
 *   carrossel  roda de capas grandes com reflexo (GameCube, DS, 3DS)
 *
 * A ideia é sempre a mesma: as SETAS navegam, Enter abre o jogo e o menu
 * (Editar/Remover/Capa) abre com o botão direito. A biblioteca continua sendo a
 * mesma — o tema só muda a roupa e o caminho do teclado até o jogo.
 */
'use strict';

/**
 * Grupo de sistema -> tipo de dashboard usado por padrão.
 * A chave é o `systemGroup` calculado em systemGroupOf() (src/dashboards.js).
 */
const DASHBOARD_BY_GROUP = {
  ps1: 'xmb', ps2: 'xmb', psp: 'xmb', ps3: 'xmb', vita: 'xmb', ps4: 'xmb', ps5: 'xmb',
  xbox: 'blades', xbox360: 'blades', xboxone: 'blades',
  gb: 'carrossel', gbc: 'carrossel', gba: 'carrossel', nds: 'carrossel', n3ds: 'carrossel', gc: 'carrossel',
  wii: 'canais', wiiu: 'canais',
  switch: 'tiles',
  rgh: 'coverflow'
};

const DASHBOARD_TIPOS = {
  xmb: {
    nome: 'XMB (colunas)',
    desc: 'Colunas verticais com a onda de fundo. ← → troca de coluna, ↑ ↓ anda nos itens.',
    som: 'deslizar'
  },
  blades: {
    nome: 'Blades (painéis)',
    desc: 'Painéis horizontais em perspectiva. Q / E ou ← → giram as abas.',
    som: 'whoosh'
  },
  canais: {
    nome: 'Canais (grade)',
    desc: 'Grade de canais quadrados. ← → ↑ ↓ andam de canal em canal.',
    som: 'clique'
  },
  coverflow: {
    nome: 'Coverflow',
    desc: 'Capas deitadas em perspectiva, com a selecionada no centro. ← → deslizam.',
    som: 'deslizar'
  },
  tiles: {
    nome: 'Tiles (fileira)',
    desc: 'Fileira horizontal de tiles grandes. ← → percorrem a fileira.',
    som: 'clique'
  },
  carrossel: {
    nome: 'Carrossel (roda)',
    desc: 'Roda de capas grandes com reflexo. ← → giram a roda.',
    som: 'deslizar'
  }
};

const Dashboards = (() => {
  let tipo = null;             // tipo de dashboard ativo (ou null = grade/rondel)
  let itens = [];              // jogos do dashboard
  let grupos = [];             // [{ id, nome, jogos }] — as "colunas" do XMB / abas
  let coluna = 0;              // índice do grupo atual
  let linha = 0;               // índice do jogo dentro do grupo
  let montado = false;
  let callbacks = {};          // { onAbrir, onContexto, onJogar }
  let timerVideo = null;
  let videoAtual = null;
  let favoritos = new Set();   // ids favoritos (vêm do estado do app)
  const extras = {};           // tipos registrados de fora (launchbox.js)
  let ultimaAssinatura = '';

  const q = (sel) => document.querySelector(sel);
  const raiz = () => q('#dashboard');

  /* ---------------- helpers ---------------- */

  /** Luminância percebida de "#rrggbb" (0 = preto, 1 = branco). */
  function luminancia(cor) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(cor || '').trim());
    if (!m) return 0;
    const n = parseInt(m[1], 16);
    const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  function gruposDe(jogos) {
    if (extras[tipo] && extras[tipo].grupos) return extras[tipo].grupos(jogos, favoritos, contexto_());
    // colunas do XMB / abas das blades: cada coluna é um filtro real
    const emuladores = jogos.filter(g => g.kind === 'rom');
    const pc = jogos.filter(g => g.kind !== 'rom');
    const favs = jogos.filter(g => g.favorito || favoritos.has(g.id));
    const recentes = jogos.filter(g => g.playedAt)
      .sort((a, b) => b.playedAt - a.playedAt).slice(0, 12);
    const out = [
      { id: 'jogos', nome: 'Jogos', jogos: pc },
      { id: 'emuladores', nome: 'Emuladores', jogos: emuladores },
      { id: 'favoritos', nome: 'Favoritos', jogos: favs },
      { id: 'recentes', nome: 'Recentes', jogos: recentes },
      { id: 'todos', nome: 'Todos', jogos }
    ];
    return out.filter(g => g.jogos.length);
  }

  function jogoAtual() {
    const g = grupos[coluna];
    return g ? g.jogos[linha] || null : null;
  }

  function capa(jogo, classe) {
    const d = document.createElement('div');
    d.className = classe || 'dash-capa';
    if (jogo && jogo.art) {
      const img = document.createElement('img');
      img.src = jogo.art;
      img.alt = '';
      img.loading = 'lazy';
      d.appendChild(img);
    } else {
      const s = document.createElement('span');
      s.className = 'dash-iniciais';
      s.textContent = String((jogo && jogo.title) || '?').slice(0, 2).toUpperCase();
      d.appendChild(s);
    }
    return d;
  }

  /* ---------------- desenho por tipo ---------------- */

  function desenharXMB(box) {
    // trilha superior: nomes das colunas
    const trilha = document.createElement('div');
    trilha.className = 'xmb-trilha';
    grupos.forEach((g, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'xmb-coluna-nome' + (i === coluna ? ' on' : '');
      b.textContent = g.nome;
      b.onclick = () => { coluna = i; linha = 0; desenhar(); };
      trilha.appendChild(b);
    });

    const palco = document.createElement('div');
    palco.className = 'xmb-palco';

    // coluna ativa: lista vertical de ícones + capa grande à direita
    const ativos = grupos[coluna] ? grupos[coluna].jogos : [];
    const lista = document.createElement('div');
    lista.className = 'xmb-lista';
    ativos.slice(0, 14).forEach((j, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'xmb-item' + (i === linha ? ' on' : '');
      const ic = document.createElement('span');
      ic.className = 'xmb-icone';
      ic.textContent = String(j.title).slice(0, 2).toUpperCase();
      b.appendChild(ic);
      b.appendChild(document.createTextNode(j.title));
      b.onclick = ev => { if (i === linha) abrir(j, ev); else { linha = i; desenhar(); } };
      b.oncontextmenu = ev => { ev.preventDefault(); contexto(ev, j); };
      lista.appendChild(b);
    });
    palco.appendChild(lista);

    // painel da direita: jogo selecionado
    const sel = ativos[linha];
    const info = document.createElement('div');
    info.className = 'xmb-info';
    if (sel) {
      info.appendChild(capa(sel, 'xmb-capa'));
      const h = document.createElement('h3');
      h.textContent = sel.title;
      info.appendChild(h);
      const meta = document.createElement('p');
      meta.className = 'muted small';
      meta.textContent = [sel.platform, sel.meta && sel.meta.score ? 'nota ' + sel.meta.score : '']
        .filter(Boolean).join(' · ');
      info.appendChild(meta);
      const jogar = document.createElement('button');
      jogar.className = 'xmb-jogar';
      jogar.textContent = 'Jogar';
      jogar.onclick = () => abrir(sel);
      info.appendChild(jogar);
    }
    palco.appendChild(info);
    box.append(trilha, palco);
  }

  function desenharBlades(box) {
    const abas = document.createElement('div');
    abas.className = 'blades-abas';
    grupos.forEach((g, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'blade-aba' + (i === coluna ? ' on' : '');
      b.textContent = g.nome;
      b.onclick = () => { coluna = i; linha = 0; desenhar(); };
      abas.appendChild(b);
    });
    box.appendChild(abas);

    const palco = document.createElement('div');
    palco.className = 'blades-palco';
    // as blades de trás aparecem espiando à esquerda, em perspectiva
    const ativos = grupos[coluna] ? grupos[coluna].jogos : [];
    ativos.slice(0, 12).forEach((j, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'blade-card' + (i === linha ? ' on' : '');
      b.style.setProperty('--i', String(i - linha));
      b.appendChild(capa(j, 'blade-capa'));
      const nome = document.createElement('span');
      nome.className = 'blade-nome';
      nome.textContent = j.title;
      b.appendChild(nome);
      b.onclick = ev => { if (i === linha) abrir(j, ev); else { linha = i; desenhar(); } };
      b.oncontextmenu = ev => { ev.preventDefault(); contexto(ev, j); };
      palco.appendChild(b);
    });
    box.appendChild(palco);
  }

  function desenharCanais(box) {
    const abas = document.createElement('div');
    abas.className = 'ch-abas';
    grupos.forEach((g, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ch-aba' + (i === coluna ? ' on' : '');
      b.textContent = g.nome;
      b.onclick = () => { coluna = i; linha = 0; desenhar(); };
      abas.appendChild(b);
    });
    box.appendChild(abas);

    const grade = document.createElement('div');
    grade.className = 'ch-grade';
    const ativos = grupos[coluna] ? grupos[coluna].jogos : [];
    ativos.slice(0, 20).forEach((j, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ch-canal' + (i === linha ? ' on' : '');
      b.appendChild(capa(j, 'ch-capa'));
      const nome = document.createElement('span');
      nome.className = 'ch-nome';
      nome.textContent = j.title;
      b.appendChild(nome);
      b.onclick = ev => { if (i === linha) abrir(j, ev); else { linha = i; desenhar(); } };
      b.oncontextmenu = ev => { ev.preventDefault(); contexto(ev, j); };
      grade.appendChild(b);
    });
    box.appendChild(grade);
    box.appendChild(barraInfo('canal'));
  }

  function desenharCoverflow(box) {
    const abas = document.createElement('div');
    abas.className = 'cf-abas';
    grupos.forEach((g, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'cf-aba' + (i === coluna ? ' on' : '');
      b.textContent = g.nome;
      b.onclick = () => { coluna = i; linha = 0; desenhar(); };
      abas.appendChild(b);
    });
    box.appendChild(abas);

    const palco = document.createElement('div');
    palco.className = 'cf-palco';
    const ativos = grupos[coluna] ? grupos[coluna].jogos : [];
    ativos.forEach((j, i) => {
      const d = Math.max(-6, Math.min(6, i - linha));
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'cf-card' + (d === 0 ? ' on' : '');
      if (Math.abs(d) > 5) b.style.visibility = 'hidden';
      b.style.setProperty('--d', String(d));
      b.style.setProperty('--ad', String(Math.abs(d)));
      b.appendChild(capa(j, 'cf-capa'));
      b.onclick = ev => { if (d === 0) abrir(j, ev); else { linha = i; desenhar(); } };
      b.oncontextmenu = ev => { ev.preventDefault(); contexto(ev, j); };
      palco.appendChild(b);
    });
    box.appendChild(palco);
    box.appendChild(barraInfo('coverflow'));
  }

  function desenharTiles(box) {
    const abas = document.createElement('div');
    abas.className = 'tl-abas';
    grupos.forEach((g, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tl-aba' + (i === coluna ? ' on' : '');
      b.textContent = g.nome;
      b.onclick = () => { coluna = i; linha = 0; desenhar(); };
      abas.appendChild(b);
    });
    box.appendChild(abas);

    const fileira = document.createElement('div');
    fileira.className = 'tl-fileira';
    const ativos = grupos[coluna] ? grupos[coluna].jogos : [];
    ativos.slice(0, 16).forEach((j, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tl-tile' + (i === linha ? ' on' : '');
      b.style.setProperty('--i', String(i - linha));
      b.appendChild(capa(j, 'tl-capa'));
      const nome = document.createElement('span');
      nome.className = 'tl-nome';
      nome.textContent = j.title;
      b.appendChild(nome);
      b.onclick = ev => { if (i === linha) abrir(j, ev); else { linha = i; desenhar(); } };
      b.oncontextmenu = ev => { ev.preventDefault(); contexto(ev, j); };
      fileira.appendChild(b);
    });
    box.appendChild(fileira);
    box.appendChild(barraInfo('tiles'));
    // rola a fileira até o tile selecionado (sem isso, navegar para a direita
    // deixava o foco fora da tela)
    requestAnimationFrame(() => {
      const sel = fileira.querySelector('.tl-tile.on');
      if (sel) sel.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
    });
  }

  function desenharCarrossel(box) {
    const abas = document.createElement('div');
    abas.className = 'cr-abas';
    grupos.forEach((g, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'cr-aba' + (i === coluna ? ' on' : '');
      b.textContent = g.nome;
      b.onclick = () => { coluna = i; linha = 0; desenhar(); };
      abas.appendChild(b);
    });
    box.appendChild(abas);

    const palco = document.createElement('div');
    palco.className = 'cr-palco';
    const ativos = grupos[coluna] ? grupos[coluna].jogos : [];
    ativos.forEach((j, i) => {
      let d = i - linha;
      // roda fechada, como no rondel
      const n = ativos.length;
      if (n > 2) {
        if (d > n / 2) d -= n;
        if (d < -n / 2) d += n;
      }
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'cr-card' + (d === 0 ? ' on' : '');
      if (Math.abs(d) > 4) b.style.visibility = 'hidden';
      b.style.setProperty('--d', String(d));
      b.style.setProperty('--ad', String(Math.abs(d)));
      b.appendChild(capa(j, 'cr-capa'));
      b.onclick = ev => { if (d === 0) abrir(j, ev); else { linha = i; desenhar(); } };
      b.oncontextmenu = ev => { ev.preventDefault(); contexto(ev, j); };
      palco.appendChild(b);
    });
    box.appendChild(palco);
    box.appendChild(barraInfo('carrossel'));
  }

  function barraInfo(estilo) {
    const j = jogoAtual();
    const barra = document.createElement('div');
    barra.className = 'dash-info dash-info-' + estilo;
    const nome = document.createElement('b');
    nome.textContent = j ? j.title : '—';
    const meta = document.createElement('span');
    meta.className = 'muted small';
    meta.textContent = j
      ? [j.platform, grupos[coluna] ? `${linha + 1} de ${grupos[coluna].jogos.length}` : ''].filter(Boolean).join(' · ')
      : '';
    barra.append(nome, meta);
    if (j) {
      const jogar = document.createElement('button');
      jogar.className = 'dash-jogar';
      jogar.textContent = 'Jogar';
      jogar.onclick = () => abrir(j);
      barra.appendChild(jogar);
    }
    return barra;
  }

  /* ---------------- ações ---------------- */

  /**
   * Clique num jogo (card/canal/tile). Regra do app:
   *   clique normal → ficha do jogo
   *   Shift + clique → inicia na hora
   */
  function abrir(jogo, ev) {
    if (ev && ev.shiftKey) {
      if (callbacks.onJogar) callbacks.onJogar(jogo);
      return;
    }
    if (callbacks.onAbrir) callbacks.onAbrir(jogo);
    else if (callbacks.onJogar) callbacks.onJogar(jogo);
  }

  function contexto(ev, jogo) {
    if (callbacks.onContexto) callbacks.onContexto(ev, jogo, ev.currentTarget);
  }

  /** O que um tipo externo enxerga do dashboard. */
  function contexto_() {
    return {
      get tipo() { return tipo; },
      get grupos() { return grupos; },
      get coluna() { return coluna; }, set coluna(v) { coluna = v; },
      get linha() { return linha; }, set linha(v) { linha = v; },
      get favoritos() { return favoritos; },
      get skin() { return (window.SKINS || []).find(s => s.id === (window.__skinAplicada || '')) || null; },
      jogoAtual, abrir, capa, desenhar,
      jogar: j => { if (callbacks.onJogar) callbacks.onJogar(j); },
      ficha: j => { if (callbacks.onAbrir) callbacks.onAbrir(j); },
      favoritar: j => { if (callbacks.onFavoritar) callbacks.onFavoritar(j); },
      contexto: (ev, j) => { if (callbacks.onContexto) callbacks.onContexto(ev, j, ev.currentTarget); },
      remontar,
      video: tocarVideoEm,
      pararVideo
    };
  }

  function desenhar(opcoes) {
    const box = raiz();
    if (!box) return;
    const ext = extras[tipo];
    // tipo externo com atualização parcial: só troca o selecionado, sem refazer a tela
    const g = grupos[coluna];
    const chave = tipo + '|' + (g ? g.id : '') + '|' + (g ? g.jogos.length : 0);
    if (ext && ext.atualizar && !(opcoes && opcoes.tudo) && box.dataset.chave === chave && box.firstChild) {
      ext.atualizar(box, contexto_());
      agendarVideo();
      return;
    }
    pararVideo();
    box.innerHTML = '';
    box.style.cssText = '';           // cores por plataforma (variante Colorido) não vazam para outro tema
    box.className = 'dashboard dash-' + (tipo || 'nenhum');
    box.dataset.chave = chave;
    // tema claro? o texto solto precisa de cor escura (legendas, contador)
    const skin = (window.SKINS || []).find(s => s.id === (window.__skinAplicada || ''));
    const bg = skin && skin.vars && skin.vars['--bg'] ? skin.vars['--bg'] : '#111';
    const claro = luminancia(bg) > 0.55;
    box.classList.toggle('dash-claro', claro);
    const fn = {
      xmb: desenharXMB, blades: desenharBlades, canais: desenharCanais,
      coverflow: desenharCoverflow, tiles: desenharTiles, carrossel: desenharCarrossel
    }[tipo] || (ext && (b => ext.desenhar(b, contexto_())));
    if (!fn) return;
    fn(box);
    if (ext) { agendarVideo(); return; }     // tipos externos têm contador próprio

    const contador = document.createElement('div');
    contador.className = 'dash-contador';
    contador.textContent = `${coluna + 1}/${grupos.length} · ${linha + 1}/${(grupos[coluna] || {}).jogos ? grupos[coluna].jogos.length : 0}`;
    box.appendChild(contador);
    agendarVideo();
  }

  /* ---------------- vídeo de fundo (como nos dashboards de verdade) ------- */

  function agendarVideo() {
    clearTimeout(timerVideo);
    timerVideo = null;
    const j = jogoAtual();
    const box = raiz();
    if (!j || !box) return;
    // tipo externo diz onde o vídeo entra (painel de detalhes, fundo…)
    const ext = extras[tipo];
    if (ext) {
      const alvo = ext.videoAlvo ? ext.videoAlvo(box) : null;
      if (!alvo) return;
      if (videoAtual === j.id && alvo.querySelector('.dash-video, .dash-yt')) return;
      pararVideo();
      timerVideo = setTimeout(() => tocarVideoEm(alvo, j), 150);
      return;
    }
    // só em temas "de console de verdade" o vídeo do jogo vira plano de fundo
    const comVideo = ['blades', 'coverflow', 'tiles'].includes(tipo);
    if (!comVideo) return;
    timerVideo = setTimeout(() => tocarVideoEm(box, j, { fundo: true }), 150);
  }

  /** Toca o vídeo do jogo dentro de `alvo` (streaming do app ou YouTube). */
  async function tocarVideoEm(alvo, jogo, opts) {
    if (!alvo || !jogo) return;
    videoAtual = jogo.id;
    const api = window.arcadeAPI;
    if (!api || !api.videoFor) { prepararVizinhos(); return; }
    let info = null;
    try {
      const resp = await api.videoFor({ id: jogo.id, title: jogo.title, steamAppId: jogo.steamAppId });
      info = resp && resp.data ? resp.data : resp;
    } catch { info = null; }
    const atual = jogoAtual();
    if (!atual || atual.id !== jogo.id || !alvo.isConnected) return;
    if (!info || !info.ok) { alvo.classList.remove('com-video'); prepararVizinhos(); return; }
    alvo.querySelectorAll('.dash-video, .dash-yt').forEach(n => n.remove());
    let no;
    if (info.tipo === 'youtube' && info.url) {
      no = document.createElement('iframe');
      no.className = 'dash-yt';
      no.allow = 'autoplay; encrypted-media';
      no.referrerPolicy = 'strict-origin-when-cross-origin';
      no.src = info.url;
      no.onload = () => setTimeout(() => { alvo.classList.add('com-video'); prepararVizinhos(); }, 700);
    } else {
      no = document.createElement('video');
      no.className = 'dash-video';
      no.muted = true; no.loop = true; no.playsInline = true; no.autoplay = true;
      no.onplaying = () => { alvo.classList.add('com-video'); prepararVizinhos(); };
      no.onerror = () => { no.remove(); alvo.classList.remove('com-video'); };
      no.src = info.localUrl || info.url;
    }
    if (opts && opts.fundo) alvo.insertBefore(no, alvo.firstChild); else alvo.appendChild(no);
    if (no.play) no.play().catch(() => {});
  }

  // deixa engatilhados os trailers dos jogos ao lado (o streaming começa na hora)
  function prepararVizinhos() {
    const api = window.arcadeAPI;
    const g = grupos[coluna];
    if (!api || !api.prepararVideos || !g || g.jogos.length < 2) return;
    const n = g.jogos.length, ids = [];
    for (const d of [1, -1, 2, -2]) {
      const j = g.jogos[(linha + d + n) % n];
      if (j && !ids.includes(j.id)) ids.push(j.id);
    }
    api.prepararVideos(ids).catch(() => {});
  }

  function pararVideo() {
    const box = raiz();
    if (box) {
      box.querySelectorAll('video.dash-video').forEach(v => {
        try { v.pause(); v.removeAttribute('src'); v.load(); } catch { /* noop */ }
        v.remove();
      });
      box.querySelectorAll('iframe.dash-yt').forEach(f => f.remove());
      box.querySelectorAll('.com-video').forEach(n => n.classList.remove('com-video'));
    }
    videoAtual = null;
    clearTimeout(timerVideo);
  }

  /* ---------------- navegação ---------------- */

  /** LB / RB do controle, Q / E e PageUp / PageDown: grupo anterior/próximo. */
  function trocarGrupo(d) {
    if (!grupos.length) return;
    const atual = jogoAtual();
    coluna = (coluna + d + grupos.length) % grupos.length;
    linha = 0;
    // no grupo novo, continua no mesmo jogo se ele estiver lá
    if (atual) { const i = grupos[coluna].jogos.findIndex(j => j.id === atual.id); if (i >= 0) linha = i; }
    desenhar();
  }

  function mover(dc, dl) {
    if (!grupos.length) return;
    if (extras[tipo] && extras[tipo].mover) { extras[tipo].mover(dc, dl, contexto_()); return; }
    if (dc) {
      coluna = (coluna + dc + grupos.length) % grupos.length;
      linha = 0;
      desenhar();
      return;
    }
    const ativos = grupos[coluna].jogos;
    if (!ativos.length) return;
    if (tipo === 'canais') {
      // grade: 5 colunas por linha, como o grid de canais do Wii
      const porLinha = 5;
      linha = Math.max(0, Math.min(ativos.length - 1, linha + dl * porLinha));
    } else {
      linha = (linha + dl + ativos.length) % ativos.length;
    }
    desenhar();
  }

  /** Setas horizontais vs. verticais mudam de significado por tipo. */
  function tecla(e) {
    if (!tipo) return false;
    const k = e.key;
    if (extras[tipo]) {
      if (extras[tipo].tecla && extras[tipo].tecla(e, contexto_())) return true;
      if (k === 'PageDown' || k === 'e' || k === 'E') { trocarGrupo(1); return true; }
      if (k === 'PageUp' || k === 'q' || k === 'Q') { trocarGrupo(-1); return true; }
      const mapa = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] };
      if (mapa[k]) { mover(mapa[k][0], mapa[k][1]); return true; }
      if (k === 'Enter') { const j = jogoAtual(); if (j) { abrir(j, e); return true; } }
      return false;
    }
    const horizontal = (dc, dl) => {
      if (tipo === 'canais') { if (dc) linha = Math.max(0, Math.min(grupos[coluna].jogos.length - 1, linha + dc)); else if (dl) mover(0, dl); desenhar(); }
      else mover(dc, dl);
    };
    if (k === 'ArrowRight') { horizontal(1, 0); return true; }
    if (k === 'ArrowLeft') { horizontal(-1, 0); return true; }
    if (k === 'ArrowDown') { if (tipo === 'canais') mover(0, 1); else mover(0, 1); return true; }
    if (k === 'ArrowUp') { mover(0, -1); return true; }
    if (k === 'PageDown' || k === 'q' || k === 'Q') { mover(-1, 0); return true; }
    if (k === 'PageUp' || k === 'e' || k === 'E') { mover(1, 0); return true; }
    if (k === 'Enter' || k === ' ') {
      const j = jogoAtual();
      if (j) { abrir(j, e); return true; }
    }
    return false;
  }

  /* ---------------- API ---------------- */

  function montar(jogos, opts) {
    callbacks = opts || {};
    if (callbacks.favoritos) favoritos = new Set(callbacks.favoritos);
    itens = Array.isArray(jogos) ? jogos : [];
    const antes = jogoAtual();
    const grupoAntes = grupos[coluna] && grupos[coluna].id;
    grupos = gruposDe(itens);
    // mesmo grupo e mesmo jogo de antes (re-render não pode "pular" a seleção)
    const gi = grupos.findIndex(g => g.id === grupoAntes);
    if (gi >= 0) {
      coluna = gi;
      const li = antes ? grupos[gi].jogos.findIndex(j => j.id === antes.id) : -1;
      if (li >= 0) linha = li;
    }
    coluna = Math.min(coluna, Math.max(0, grupos.length - 1));
    const ativos = grupos[coluna] ? grupos[coluna].jogos : [];
    linha = Math.min(linha, Math.max(0, ativos.length - 1));
    montado = true;
    // biblioteca mudou de verdade (capa nova, favorito, nome)? refaz a tela toda;
    // senão (re-render comum do app) só atualiza a seleção, sem piscar o vídeo
    const assinatura = itens.map(j => j.id + (j.art ? '*' : '') + (favoritos.has(j.id) ? 'f' : '') + j.title + (j.playedAt || '')).join('|');
    const mudou = assinatura !== ultimaAssinatura;
    ultimaAssinatura = assinatura;
    desenhar({ tudo: mudou });
  }

  /** Recalcula os grupos (ordem mudou, favorito mudou) mantendo a seleção. */
  function remontar() {
    montar(itens, callbacks);
  }

  /** launchbox.js e afins registram tipos novos aqui. */
  function registrarTipo(id, def) {
    extras[id] = def;
    DASHBOARD_TIPOS[id] = { nome: def.nome, desc: def.desc, som: def.som || 'clique' };
  }

  function ativar(t) {
    const mudou = tipo !== (DASHBOARD_TIPOS[t] ? t : null);
    tipo = DASHBOARD_TIPOS[t] ? t : null;
    if (mudou) { coluna = 0; linha = 0; const b = raiz(); if (b) b.dataset.chave = ''; }
    pararVideo();
    if (!tipo) {
      const box = raiz();
      if (box) { box.innerHTML = ''; box.hidden = true; }
      return;
    }
    const box = raiz();
    if (box) box.hidden = false;
  }

  function parar() { pararVideo(); clearTimeout(timerVideo); }

  return {
    montar, ativar, parar, tecla, mover, trocarGrupo, registrarTipo, remontar,
    get tipo() { return tipo; },
    get ativo() { return !!tipo; },
    get jogoAtual() { return jogoAtual(); },
    get grupos() { return grupos; },
    get coluna() { return coluna; },
    get linha() { return linha; },
    DASHBOARD_TIPOS
  };
})();

if (typeof window !== 'undefined') window.Dashboards = Dashboards;
