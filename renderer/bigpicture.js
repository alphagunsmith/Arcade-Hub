'use strict';
/**
 * Arcade Hub — Modo TV (no estilo do Big Picture da Steam).
 *
 * Tela cheia, pensado para jogar do sofá com controle:
 *   Início       destaque do jogo em foco + fileiras (continue jogando, favoritos…)
 *   Biblioteca   todos os jogos em grade, A–Z
 *   Conquistas   pontos e conquistas do perfil que está jogando
 *   Estatísticas resumo do tempo de jogo
 *   Emuladores   cada console da biblioteca: emulador e BIOS
 *   Sistema      perfil, sons, iniciar com o Windows, suspender/reiniciar/desligar
 *
 * Controle (padrão Xbox; no PlayStation: A=✕ B=○ X=□ Y=△):
 *   direcional/analógico  navegar          A  abrir o jogo / confirmar
 *   X  jogar direto                        Y  favoritar
 *   B  voltar                              LB/RB  trocar de seção
 *   Start  menu                            Select  jogo aleatório
 *   Guia (botão central)  sair do Modo TV
 * Teclado: setas, Enter (A), Esc (B), Espaço (X), F (Y), Q/E (LB/RB), M (menu).
 *
 * Depende de app.js (ui, api, launch, fmtPlaytime, horasTexto, SOURCE_META),
 * intro.js (Intro) e som.js (Som). Só chama essas coisas depois do boot.
 */
const ModoTV = (() => {
  let raiz = null;
  let ativo = false;
  let secao = 'inicio';                 // ver SECOES
  let camada = null;                    // null | 'pagina' | 'menu' | 'confirmar'
  const focoSec = { conquistas: 0, emuladores: 0, sistema: 0 };   // seções de itens soltos
  let confirmacao = null;               // { texto, acao, foco }
  let comoConsole = false;
  let fileiras = [];                    // [{ titulo, jogos: [] }]
  let foco = { linha: 0, col: 0 };      // início
  let focoBib = 0;                      // biblioteca
  let focoPagina = 0;                   // botões da página do jogo
  let focoMenu = 0;
  let jogoDaPagina = null;
  let listaBib = [];
  let fundoAtivo = 0;
  let timerRelogio = null;
  let rafPad = 0;
  const pad = { botoes: {}, ultimoMov: 0, repetindo: false };

  const $t = sel => raiz.querySelector(sel);
  const el = (tag, cls, txt) => { const n = document.createElement(tag); if (cls) n.className = cls; if (txt != null) n.textContent = txt; return n; };
  const arte = g => (g && (g.customArt || g.art)) || null;
  const msJogado = g => (g && g.playtime && g.playtime.totalMs) || 0;
  const favs = () => new Set(ui.state.favorites || []);
  const visiveis = () => {
    const ocultos = new Set(ui.state.hidden || []);
    return ui.state.games.filter(g => !ocultos.has(g.id));
  };
  const somar = (nome, ...a) => { try { if (typeof Som !== 'undefined') Som[nome](...a); } catch { /* sem áudio */ } };

  /* ------------------------------------------------------------------ */
  /* montagem                                                            */
  /* ------------------------------------------------------------------ */
  const LOGO_MINI = `<svg viewBox="0 0 1024 1024" aria-hidden="true"><rect width="1024" height="1024" rx="200" fill="#12223a"/>
    <g fill="#22d3ee"><rect x="209" y="320" width="606" height="340" rx="160"/><ellipse cx="295" cy="625" rx="116" ry="145"/><ellipse cx="729" cy="625" rx="116" ry="145"/></g>
    <g fill="#0a0f1a"><rect x="288" y="396" width="64" height="192" rx="14"/><rect x="224" y="460" width="192" height="64" rx="14"/><circle cx="694" cy="418" r="34"/><circle cx="620" cy="492" r="34"/><circle cx="694" cy="566" r="34"/></g>
    <circle cx="768" cy="492" r="34" fill="#e879f9"/></svg>`;

  function montar() {
    if (raiz) return;
    raiz = el('div', 'tv');
    raiz.id = 'modo-tv';
    raiz.hidden = true;
    raiz.innerHTML = `
      <div class="tv-fundo"><div class="tv-fundo-img"></div><div class="tv-fundo-img"></div><div class="tv-vinheta"></div></div>
      <header class="tv-topo">
        <div class="tv-marca">${LOGO_MINI}<span>ARCADE <b>HUB</b></span></div>
        <nav class="tv-abas">
          <span class="tv-gatilho">LB</span>
          <button data-secao="inicio">Início</button>
          <button data-secao="biblioteca">Biblioteca</button>
          <button data-secao="conquistas">Conquistas</button>
          <button data-secao="stats">Estatísticas</button>
          <button data-secao="emuladores">Emuladores</button>
          <button data-secao="sistema">Sistema</button>
          <span class="tv-gatilho">RB</span>
        </nav>
        <div class="tv-status"><button class="tv-perfil" title="Trocar de perfil"></button><span class="tv-pad" title="Controle"></span><span class="tv-relogio"></span></div>
      </header>
      <main class="tv-corpo">
        <section class="tv-secao tv-inicio" data-secao="inicio">
          <div class="tv-destaque">
            <div class="tv-dest-origem"></div>
            <h1 class="tv-dest-titulo"></h1>
            <div class="tv-dest-meta"></div>
            <p class="tv-dest-desc"></p>
          </div>
          <div class="tv-fileiras"><div class="tv-fileiras-pista"></div></div>
        </section>
        <section class="tv-secao tv-biblioteca" data-secao="biblioteca" hidden>
          <div class="tv-bib-topo"><h2>Biblioteca</h2><span class="tv-bib-conta"></span></div>
          <div class="tv-bib-grade"></div>
        </section>
        <section class="tv-secao tv-stats" data-secao="stats" hidden></section>
        <section class="tv-secao tv-conquistas tv-lista-sec" data-secao="conquistas" hidden></section>
        <section class="tv-secao tv-emuladores tv-lista-sec" data-secao="emuladores" hidden></section>
        <section class="tv-secao tv-sistema tv-lista-sec" data-secao="sistema" hidden></section>
      </main>
      <footer class="tv-dicas"></footer>
      <div class="tv-pagina" hidden></div>
      <div class="tv-menu" hidden><div class="tv-menu-caixa"></div></div>
      <div class="tv-confirmar" hidden><div class="tv-menu-caixa"></div></div>
      <div class="tv-avisos"></div>`;
    document.body.appendChild(raiz);

    raiz.querySelectorAll('.tv-abas button').forEach(b => { b.onclick = () => irPara(b.dataset.secao); });
    $t('.tv-perfil').onclick = () => trocarPerfil();
    raiz.addEventListener('wheel', e => {
      if (camada || secao !== 'inicio') return;
      e.preventDefault();
      mover(0, e.deltaY > 0 ? 1 : -1);
    }, { passive: false });
  }

  /* ------------------------------------------------------------------ */
  /* dados                                                               */
  /* ------------------------------------------------------------------ */
  function montarFileiras() {
    const todos = visiveis();
    const instalados = todos.filter(g => g.installed !== false);
    const f = favs();
    const ord = (arr, chave) => [...arr].sort((a, b) => (chave(b) || 0) - (chave(a) || 0));
    const out = [];
    const add = (titulo, jogos) => { if (jogos.length) out.push({ titulo, jogos: jogos.slice(0, 30) }); };
    add('Continue jogando', ord(instalados.filter(g => g.playedAt), g => g.playedAt));
    add('Favoritos', todos.filter(g => f.has(g.id)));
    add('Mais jogados', ord(todos.filter(g => msJogado(g) > 0), msJogado));
    add('Adicionados recentemente', ord(instalados, g => g.addedAt));
    // uma fileira por loja (PC) e por console (emuladores)
    const grupos = new Map();
    for (const g of instalados) {
      const chave = g.kind === 'rom' ? (g.platform || 'Emulador') : ((SOURCE_META[g.source] || {}).label || 'PC');
      if (!grupos.has(chave)) grupos.set(chave, []);
      grupos.get(chave).push(g);
    }
    [...grupos].sort((a, b) => b[1].length - a[1].length).forEach(([nome, jogos]) => {
      add(nome, [...jogos].sort((a, b) => a.title.localeCompare(b.title, 'pt-BR')));
    });
    const naoInst = todos.filter(g => g.installed === false);
    add('Não instalados', naoInst);
    return out.length ? out : [{ titulo: 'Sua biblioteca', jogos: [] }];
  }

  /* ------------------------------------------------------------------ */
  /* blocos de interface                                                 */
  /* ------------------------------------------------------------------ */
  function bloco(g, idx) {
    const b = el('button', 'tv-bloco');
    b.type = 'button';
    b.dataset.id = g.id;
    if (idx != null) b.dataset.idx = idx;
    const capa = el('div', 'tv-bloco-capa');
    const src = arte(g);
    if (src) {
      const img = el('img');
      img.src = src;
      img.alt = '';
      img.decoding = 'async';
      img.loading = 'lazy';
      img.onerror = () => { img.remove(); capa.appendChild(reserva(g)); };
      capa.appendChild(img);
    } else {
      capa.appendChild(reserva(g));
    }
    if (ui.jogando && ui.jogando.has(g.id)) capa.appendChild(el('span', 'tv-selo tv-selo-jogando', 'jogando'));
    else if (favs().has(g.id)) capa.appendChild(el('span', 'tv-selo tv-selo-fav', '★'));
    if (g.installed === false) b.classList.add('desinstalado');
    b.appendChild(capa);
    b.appendChild(el('span', 'tv-bloco-nome', g.title));
    return b;
  }

  function reserva(g) {
    const r = el('div', 'tv-bloco-reserva');
    r.textContent = (g.title || '?').split(/\s+/).map(p => p[0]).join('').slice(0, 2).toUpperCase();
    return r;
  }

  function renderInicio() {
    fileiras = montarFileiras();
    const pista = $t('.tv-fileiras-pista');
    pista.innerHTML = '';
    fileiras.forEach((f, i) => {
      const linha = el('div', 'tv-fileira');
      linha.dataset.linha = i;
      linha.appendChild(el('h2', null, f.titulo));
      const trilho = el('div', 'tv-trilho');
      const faixa = el('div', 'tv-trilho-faixa');
      f.jogos.forEach((g, j) => {
        const b = bloco(g, j);
        b.onclick = () => { foco = { linha: i, col: j }; aplicarFoco(); abrirPagina(g); };
        faixa.appendChild(b);
      });
      if (!f.jogos.length) faixa.appendChild(el('div', 'tv-vazio', 'Nenhum jogo ainda — escaneie pelo menu (Start).'));
      trilho.appendChild(faixa);
      linha.appendChild(trilho);
      pista.appendChild(linha);
    });
    foco.linha = Math.min(foco.linha, fileiras.length - 1);
    foco.col = Math.min(foco.col, Math.max(0, fileiras[foco.linha].jogos.length - 1));
    aplicarFoco(true);
  }

  function jogoEmFoco() {
    if (secao === 'inicio') { const f = fileiras[foco.linha]; return f && f.jogos[foco.col]; }
    if (secao === 'biblioteca') return listaBib[focoBib];
    return null;
  }

  function aplicarFoco(semSom) {
    if (secao === 'inicio') {
      const linhas = raiz.querySelectorAll('.tv-fileira');
      linhas.forEach((ln, i) => {
        ln.classList.toggle('ativa', i === foco.linha);
        const blocos = ln.querySelectorAll('.tv-bloco');
        blocos.forEach((b, j) => b.classList.toggle('foco', i === foco.linha && j === foco.col));
        // a faixa anda para manter o foco como 2º da esquerda
        const ref = blocos[0];
        if (ref) {
          const passo = ref.offsetWidth + parseFloat(getComputedStyle(ln.querySelector('.tv-trilho-faixa')).columnGap || 0);
          const col = i === foco.linha ? foco.col : (ln._col || 0);
          if (i === foco.linha) ln._col = foco.col;
          const visiveisNaTela = Math.max(1, Math.floor((ln.clientWidth - 40) / passo));
          const max = Math.max(0, blocos.length - visiveisNaTela);
          const desloc = Math.min(max, Math.max(0, col - 1));
          ln._desloc = desloc;
          ln.querySelector('.tv-trilho-faixa').style.transform = `translateX(${-desloc * passo}px)`;
        }
      });
      // a pista sobe para a fileira em foco ficar no topo
      const alvo = linhas[foco.linha];
      if (alvo) $t('.tv-fileiras-pista').style.transform = `translateY(${-alvo.offsetTop}px)`;
    } else if (secao === 'biblioteca') {
      const blocos = raiz.querySelectorAll('.tv-bib-grade .tv-bloco');
      blocos.forEach((b, i) => b.classList.toggle('foco', i === focoBib));
      const b = blocos[focoBib];
      if (b) b.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
    mostrarDestaque(jogoEmFoco());
    if (!semSom) somar('mover');
  }

  function mostrarDestaque(g) {
    // fundo: duas camadas que se alternam (troca suave)
    const camadas = raiz.querySelectorAll('.tv-fundo-img');
    const src = arte(g);
    const atual = camadas[fundoAtivo];
    if (atual.dataset.src !== (src || '')) {
      fundoAtivo = 1 - fundoAtivo;
      const prox = camadas[fundoAtivo];
      prox.dataset.src = src || '';
      prox.style.backgroundImage = src ? `url("${String(src).replace(/"/g, '\\"')}")` : 'none';
      prox.classList.add('on');
      atual.classList.remove('on');
    }
    if (secao !== 'inicio') return;
    $t('.tv-dest-titulo').textContent = g ? g.title : 'Arcade Hub';
    const origem = g ? [(SOURCE_META[g.source] || {}).label, g.kind === 'rom' ? g.platform : null].filter(Boolean).join(' · ') : '';
    $t('.tv-dest-origem').textContent = origem;
    const meta = $t('.tv-dest-meta');
    meta.innerHTML = '';
    if (g) {
      const item = (txt, cls) => meta.appendChild(el('span', cls || null, txt));
      if (ui.jogando && ui.jogando.has(g.id)) item('● jogando agora', 'tv-ao-vivo');
      if (msJogado(g)) item(`${fmtPlaytime(msJogado(g))} jogadas`);
      if (g.playedAt) item(`jogado ${tempoRelativo(g.playedAt)}`);
      if (g.meta && g.meta.score != null) item(`nota ${g.meta.score}`, 'tv-nota');
      if (g.installed === false) item('não instalado', 'tv-aviso');
      else if (g.problem) item(g.problem, 'tv-aviso');
    }
    $t('.tv-dest-desc').textContent = (g && g.meta && g.meta.description) || '';
  }

  function tempoRelativo(ts) {
    const d = (Date.now() - ts) / 1000;
    if (d < 3600) return 'agora há pouco';
    if (d < 86400) return `há ${Math.round(d / 3600)} h`;
    if (d < 86400 * 30) return `há ${Math.round(d / 86400)} dia(s)`;
    return new Date(ts).toLocaleDateString('pt-BR');
  }

  function renderBiblioteca() {
    listaBib = [...visiveis()].sort((a, b) => a.title.localeCompare(b.title, 'pt-BR'));
    const grade = $t('.tv-bib-grade');
    grade.innerHTML = '';
    listaBib.forEach((g, i) => {
      const b = bloco(g, i);
      b.onclick = () => { focoBib = i; aplicarFoco(); abrirPagina(g); };
      grade.appendChild(b);
    });
    $t('.tv-bib-conta').textContent = `${listaBib.length} jogos`;
    focoBib = Math.min(focoBib, Math.max(0, listaBib.length - 1));
    aplicarFoco(true);
  }

  function renderStatsTV() {
    const box = $t('.tv-stats');
    box.innerHTML = '';
    const jogos = visiveis();
    const jogados = jogos.filter(g => msJogado(g) > 0).sort((a, b) => msJogado(b) - msJogado(a));
    const total = jogados.reduce((a, g) => a + msJogado(g), 0);
    const sessoes = jogados.reduce((a, g) => a + ((g.playtime && g.playtime.sessions) || 0), 0);
    const tiles = el('div', 'tv-stats-numeros');
    for (const [v, r] of [[horasTexto(total), 'tempo total'], [String(sessoes), 'sessões'], [`${jogados.length}`, 'jogos com tempo'], [String(jogos.length), 'na biblioteca']]) {
      const t = el('div', 'tv-stats-num');
      t.append(el('b', null, v), el('span', null, r));
      tiles.appendChild(t);
    }
    box.appendChild(tiles);
    const top = el('div', 'tv-stats-top');
    top.appendChild(el('h2', null, 'Mais jogados'));
    if (!jogados.length) top.appendChild(el('p', 'tv-vazio', 'Ainda não há tempo de jogo contado. Jogue algo pelo Arcade Hub e ele aparece aqui.'));
    const max = msJogado(jogados[0]) || 1;
    jogados.slice(0, 8).forEach(g => {
      const linha = el('div', 'tv-stats-linha');
      const mini = el('div', 'tv-stats-capa');
      if (arte(g)) mini.style.backgroundImage = `url("${String(arte(g)).replace(/"/g, '\\"')}")`;
      const info = el('div', 'tv-stats-info');
      info.append(el('span', 'tv-stats-nome', g.title), el('span', 'tv-stats-horas', fmtPlaytime(msJogado(g))));
      const barra = el('div', 'tv-stats-barra');
      const i = el('i');
      i.style.width = Math.max(3, Math.round((msJogado(g) / max) * 100)) + '%';
      barra.appendChild(i);
      info.appendChild(barra);
      linha.append(mini, info);
      top.appendChild(linha);
    });
    box.appendChild(top);
    mostrarDestaque(jogados[0] || null);
  }

  /* ------------------------------------------------------------------ */
  /* dicas de botões (muda com o contexto e com o controle conectado)    */
  /* ------------------------------------------------------------------ */
  function temControle() {
    try { return [...(navigator.getGamepads ? navigator.getGamepads() : [])].some(p => p && p.connected); } catch { return false; }
  }
  function dica(botoes, texto) {
    const d = el('span', 'tv-dica');
    for (const botao of [].concat(botoes)) {
      d.appendChild(el('span', `tv-botao tv-botao-${botao.toLowerCase().replace(/[^a-z]/g, '') || 'menu'}`, botao));
    }
    d.appendChild(document.createTextNode(texto));
    return d;
  }
  function renderDicas() {
    const box = $t('.tv-dicas');
    box.innerHTML = '';
    const pad = temControle();
    const k = (padTxt, tecla) => (pad ? padTxt : tecla);
    const lista = [];
    if (camada === 'menu') lista.push([k('A', 'Enter'), 'Escolher'], [k('B', 'Esc'), 'Fechar menu']);
    else if (camada === 'pagina') lista.push([k('A', 'Enter'), 'Confirmar'], [k('Y', 'F'), 'Favorito'], [k('B', 'Esc'), 'Voltar']);
    else if (camada === 'confirmar') lista.push([k('A', 'Enter'), 'Escolher'], [k('B', 'Esc'), 'Cancelar']);
    else if (secao === 'stats' || secao === 'conquistas') lista.push([[k('LB', 'Q'), k('RB', 'E')], 'Seções'], [k('B', 'Esc'), 'Início'], [k('☰', 'M'), 'Menu']);
    else if (secao === 'emuladores' || secao === 'sistema') lista.push([k('A', 'Enter'), 'Escolher'], [[k('LB', 'Q'), k('RB', 'E')], 'Seções'], [k('B', 'Esc'), 'Início']);
    else lista.push([k('A', 'Enter'), 'Ver jogo'], [k('X', 'Espaço'), 'Jogar'], [k('Y', 'F'), 'Favorito'], [[k('LB', 'Q'), k('RB', 'E')], 'Seções'], [k('☰', 'M'), 'Menu']);
    for (const [b, t] of lista) box.appendChild(dica(b, t));
    $t('.tv-pad').textContent = pad ? '🎮' : '⌨';
    $t('.tv-pad').title = pad ? 'Controle conectado' : 'Sem controle — usando teclado';
  }

  /* ------------------------------------------------------------------ */
  /* seções, página do jogo e menu                                       */
  /* ------------------------------------------------------------------ */
  const SECOES = ['inicio', 'biblioteca', 'conquistas', 'stats', 'emuladores', 'sistema'];
  function irPara(s, comSom) {
    secao = s;
    camada = null;
    raiz.querySelectorAll('.tv-abas button').forEach(b => b.classList.toggle('on', b.dataset.secao === s));
    raiz.querySelectorAll('.tv-secao').forEach(x => { x.hidden = x.dataset.secao !== s; });
    raiz.dataset.secao = s;
    if (s === 'inicio') renderInicio();
    else if (s === 'biblioteca') renderBiblioteca();
    else if (s === 'conquistas') renderConquistasTV();
    else if (s === 'emuladores') renderEmuladoresTV();
    else if (s === 'sistema') renderSistemaTV();
    else renderStatsTV();
    renderDicas();
    if (comSom !== false) somar('aba');
  }

  /* ---------------- perfil ---------------- */
  function renderPerfilTopo() {
    const b = $t('.tv-perfil');
    if (!b || typeof Ecossistema === 'undefined') return;
    const p = Ecossistema.perfilAtual();
    b.innerHTML = '';
    if (!p) return;
    b.append(Ecossistema.avatar(p, 34), el('span', null, p.nome));
  }
  async function trocarPerfil(opts) {
    if (typeof Ecossistema === 'undefined') return;
    await Ecossistema.escolherPerfil(opts);
    renderPerfilTopo();
    atualizar();
  }

  /* ---------------- seções de itens (conquistas, emuladores, sistema) ---------------- */
  /** Itens focáveis da seção atual (marcados com .tv-f). */
  const itensSec = () => [...raiz.querySelectorAll(`.tv-secao[data-secao="${secao}"] .tv-f`)];
  function focarSec(semSom) {
    const itens = itensSec();
    if (!itens.length) return;
    focoSec[secao] = Math.max(0, Math.min(itens.length - 1, focoSec[secao] || 0));
    itens.forEach((n, i) => n.classList.toggle('foco', i === focoSec[secao]));
    const atual = itens[focoSec[secao]];
    atual.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: semSom ? 'auto' : 'smooth' });
    if (!semSom) somar('mover');
  }
  /** Próximo item na direção, pela posição na tela (serve para grade e lista). */
  function moverSec(dx, dy) {
    const itens = itensSec();
    const atual = itens[focoSec[secao]];
    if (!atual) return;
    const r = atual.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    let melhor = -1, nota = Infinity;
    itens.forEach((n, i) => {
      if (n === atual) return;
      const q = n.getBoundingClientRect();
      const ddx = q.left + q.width / 2 - cx, ddy = q.top + q.height / 2 - cy;
      if (dx && (Math.sign(ddx) !== dx || Math.abs(ddx) < 6)) return;
      if (dy && (Math.sign(ddy) !== dy || Math.abs(ddy) < 6)) return;
      const v = dx ? Math.abs(ddx) + Math.abs(ddy) * 3 : Math.abs(ddy) + Math.abs(ddx) * 0.5;
      if (v < nota) { nota = v; melhor = i; }
    });
    if (melhor < 0) return;
    focoSec[secao] = melhor;
    focarSec();
  }

  async function renderConquistasTV() {
    const box = $t('.tv-conquistas');
    if (!box.firstChild) box.appendChild(el('p', 'tv-vazio', 'Carregando conquistas…'));
    const r = await api.conquistas(ui.state.perfilAtivo).catch(() => null);
    if (secao !== 'conquistas') return;
    Ecossistema.desenharConquistas(box, r && r.ok ? r.data : null, { tv: true });
    focarSec(true);
    mostrarDestaque(null);
  }

  const ESTADO_BIOS = { valida: 'ok', desconhecida: 'versão não reconhecida', faltando: 'faltando' };
  async function renderEmuladoresTV() {
    const box = $t('.tv-emuladores');
    box.innerHTML = '';
    box.appendChild(el('p', 'tv-vazio', 'Conferindo emuladores e BIOS…'));
    const r = await api.emuladores().catch(() => null);
    if (secao !== 'emuladores') return;
    box.innerHTML = '';
    const topo = el('div', 'tv-sec-topo');
    topo.append(el('h2', null, 'Emuladores'), el('span', null, 'Cada console da sua biblioteca, o emulador que abre os jogos e a BIOS que ele precisa. O Arcade Hub não baixa BIOS: use a do seu próprio console.'));
    box.appendChild(topo);
    const lista = r && r.ok ? r.data.lista : [];
    if (!lista.length) box.appendChild(el('p', 'tv-vazio', 'Nenhuma ROM na biblioteca ainda. Adicione uma pasta de ROMs em Ajustes › Pastas.'));
    for (const c of lista) {
      const linha = el('div', 'tv-emu');
      const info = el('div', 'tv-emu-info');
      info.append(el('b', null, c.label), el('span', null, `${c.jogos} ${c.jogos === 1 ? 'jogo' : 'jogos'}`));
      const estado = el('div', 'tv-emu-estado');
      const nomeExe = c.emulador.exe ? c.emulador.exe.split(/[\\/]/).pop() : '';
      const pill = (txt, tipo) => estado.appendChild(el('span', `tv-pill ${tipo}`, txt));
      if (c.emulador.configurado && c.emulador.existe) pill(`✓ ${c.emulador.viaRetroArch ? 'RetroArch' : nomeExe}`, 'ok');
      else if (c.emulador.configurado) pill('✗ emulador sumiu da pasta', 'erro');
      else pill('✗ sem emulador', 'erro');
      if (c.bios) {
        const falta = c.bios.arquivos.filter(a => a.estado === 'faltando').map(a => a.nome);
        const estranhas = c.bios.arquivos.filter(a => a.estado === 'desconhecida');
        if (c.bios.ok && !estranhas.length) pill(`✓ BIOS${c.bios.nome ? ' (' + c.bios.nome + ')' : ''}`, 'ok');
        else if (c.bios.ok) pill('BIOS presente, versão não reconhecida', 'aviso');
        else pill(`${c.bios.opcional ? 'BIOS opcional' : 'Falta BIOS'}: ${falta.join(', ')}`, c.bios.opcional ? 'aviso' : 'erro');
      }
      const acoes = el('div', 'tv-emu-acoes');
      if (!(c.emulador.configurado && c.emulador.existe)) {
        const achado = c.recomendados.find(x => x.instalado);
        if (achado) {
          const b = el('button', 'tv-btn tv-f', `Usar ${achado.nome} (já está no PC)`);
          b.onclick = async () => {
            const x = await api.usarEmulador(c.platformKey, achado.id);
            aviso(x.ok ? `${c.label} agora abre com o ${achado.nome}` : (x.error || 'Não consegui configurar'));
            somar(x.ok ? 'selecionar' : 'erro');
            if (x.ok) { const st = await api.getState(); if (st.ok) ui.state = st.data; renderEmuladoresTV(); }
          };
          acoes.appendChild(b);
        }
      }
      for (const rec of c.recomendados.slice(0, 2)) {
        if (rec.instalado && c.emulador.configurado) continue;
        const b = el('button', 'tv-btn tv-btn-leve tv-f', `Site do ${rec.nome}`);
        b.onclick = async () => { await api.abrirSiteEmulador(rec.id); aviso(`Abrindo o site do ${rec.nome} no navegador`); };
        acoes.appendChild(b);
      }
      if (c.bios && c.bios.dica && !c.bios.ok) info.appendChild(el('small', null, c.bios.dica));
      linha.append(info, estado, acoes);
      box.appendChild(linha);
    }
    focarSec(true);
    mostrarDestaque(null);
  }

  function itensSistema() {
    const mc = ui.state.modoConsole || {};
    const p = typeof Ecossistema !== 'undefined' ? Ecossistema.perfilAtual() : null;
    return [
      ['perfil', `Trocar de perfil${p ? ' (agora: ' + p.nome + ')' : ''}`, 'Quem está jogando conta o tempo e as conquistas'],
      ['escanear', 'Procurar jogos novos', 'Varre as pastas e as lojas de novo'],
      ['limpar', 'Remover jogos que não estão mais no PC', 'Desinstalados ou com o arquivo apagado'],
      ['sons', `Sons do menu: ${typeof Som !== 'undefined' && Som.ligado ? 'ligados' : 'desligados'}`, ''],
      ['abertura', `Animação de abertura: ${aberturaLigada() ? 'ligada' : 'desligada'}`, ''],
      ['console', `Abrir com o Windows: ${mc.iniciarComWindows ? 'ligado' : 'desligado'}`, 'O PC liga direto no Arcade Hub, como um console'],
      ['suspender', 'Suspender o PC', 'Desliga a tela e economiza energia; volta de onde parou'],
      ['reiniciar', 'Reiniciar o PC', ''],
      ['desligar', 'Desligar o PC', ''],
      ['sair', 'Ir para a área de trabalho', 'Sai do Modo TV (o Arcade Hub continua aberto)'],
      ['fechar', 'Fechar o Arcade Hub', '']
    ];
  }
  function renderSistemaTV() {
    const box = $t('.tv-sistema');
    box.innerHTML = '';
    const topo = el('div', 'tv-sec-topo');
    topo.append(el('h2', null, 'Sistema'), el('span', null, 'Ajustes rápidos e energia, tudo pelo controle.'));
    box.appendChild(topo);
    const lista = el('div', 'tv-sis-lista');
    const mc = ui.state.modoConsole || {};
    for (const [acao, txt, desc] of itensSistema()) {
      if (['suspender', 'reiniciar', 'desligar', 'console'].includes(acao) && !mc.energiaDisponivel) continue;
      const b = el('button', 'tv-sis-item tv-f' + (['desligar', 'reiniciar'].includes(acao) ? ' perigo' : ''));
      b.append(el('b', null, txt));
      if (desc) b.append(el('span', null, desc));
      b.onclick = () => executarSistema(acao);
      lista.appendChild(b);
    }
    box.appendChild(lista);
    focarSec(true);
    mostrarDestaque(null);
  }
  async function executarSistema(acao) {
    if (acao === 'perfil') return trocarPerfil();
    if (acao === 'escanear' || acao === 'sons' || acao === 'abertura' || acao === 'sair' || acao === 'fechar') {
      await executarMenu(acao);
      if (secao === 'sistema' && ativo) renderSistemaTV();
      return;
    }
    if (acao === 'limpar') {
      const r = await api.jogosSumidos();
      if (!r.ok) { aviso(r.error || 'Não consegui conferir'); return; }
      if (!r.data.length) { aviso('Nenhum jogo sumido: tudo está no PC'); somar('selecionar'); return; }
      return pedirConfirmacaoTV(`Remover ${r.data.length} ${r.data.length === 1 ? 'jogo' : 'jogos'} que não estão mais no PC? (${r.data.slice(0, 3).map(g => g.title).join(', ')}${r.data.length > 3 ? '…' : ''})`, 'Remover', async () => {
        const x = await api.limparSumidos();
        if (!x.ok) { aviso(x.error || 'Não consegui remover'); return; }
        ui.state = x.data.state;
        aviso(`${x.data.removidos.length} saíram da biblioteca`);
        renderSistemaTV();
      });
    }
    if (acao === 'console') {
      const mc = ui.state.modoConsole || {};
      const r = await api.iniciarComWindows(!mc.iniciarComWindows);
      if (r.ok) { ui.state.modoConsole = { ...mc, iniciarComWindows: r.data }; aviso(r.data ? 'O Arcade Hub vai abrir junto com o Windows' : 'O Arcade Hub não abre mais com o Windows'); somar('selecionar'); }
      else { aviso(r.error || 'Não consegui mudar'); somar('erro'); }
      return renderSistemaTV();
    }
    const textos = {
      suspender: ['Suspender o PC?', 'Suspender'],
      reiniciar: ['Reiniciar o PC agora?', 'Reiniciar'],
      desligar: ['Desligar o PC agora?', 'Desligar']
    };
    if (textos[acao]) pedirConfirmacaoTV(textos[acao][0], textos[acao][1], async () => {
      aviso(acao === 'suspender' ? 'Suspendendo…' : 'Até logo!');
      const r = await api.energia(acao);
      if (!r.ok) { aviso(r.error || 'O Windows não deixou'); somar('erro'); }
    });
  }

  /** Confirmação no estilo da TV (o foco começa em "Cancelar"). */
  function pedirConfirmacaoTV(texto, rotulo, fazer) {
    confirmacao = { texto, rotulo, fazer, foco: 0 };
    camada = 'confirmar';
    renderConfirmacao();
    $t('.tv-confirmar').hidden = false;
    renderDicas();
    somar('selecionar');
  }
  function renderConfirmacao() {
    const caixa = $t('.tv-confirmar .tv-menu-caixa');
    caixa.innerHTML = '';
    caixa.appendChild(el('div', 'tv-menu-titulo', confirmacao.texto));
    [['nao', 'Cancelar'], ['sim', confirmacao.rotulo]].forEach(([v, txt], i) => {
      const b = el('button', 'tv-menu-item' + (i === confirmacao.foco ? ' foco' : '') + (v === 'sim' ? ' perigo' : ''), txt);
      b.onclick = () => { confirmacao.foco = i; responderConfirmacao(); };
      caixa.appendChild(b);
    });
  }
  function fecharConfirmacao() { camada = null; confirmacao = null; $t('.tv-confirmar').hidden = true; renderDicas(); }
  function responderConfirmacao() {
    const c = confirmacao;
    fecharConfirmacao();
    if (c && c.foco === 1) c.fazer(); else somar('voltar');
  }

  function abrirPagina(g) {
    if (!g) return;
    jogoDaPagina = g;
    camada = 'pagina';
    focoPagina = 0;
    const pag = $t('.tv-pagina');
    pag.innerHTML = '';
    const capa = el('div', 'tv-pag-capa');
    const src = arte(g);
    if (src) { const img = el('img'); img.src = src; img.alt = ''; capa.appendChild(img); } else capa.appendChild(reserva(g));
    const info = el('div', 'tv-pag-info');
    info.appendChild(el('div', 'tv-dest-origem', [(SOURCE_META[g.source] || {}).label, g.platform].filter(Boolean).join(' · ')));
    info.appendChild(el('h1', 'tv-pag-titulo', g.title));
    const fatos = el('div', 'tv-pag-fatos');
    const fato = (v, r) => { if (!v) return; const f = el('div'); f.append(el('b', null, v), el('span', null, r)); fatos.appendChild(f); };
    fato(msJogado(g) ? fmtPlaytime(msJogado(g)) : '—', 'tempo de jogo');
    fato(g.playtime && g.playtime.sessions ? String(g.playtime.sessions) : '—', 'sessões');
    fato(g.playedAt ? tempoRelativo(g.playedAt) : 'nunca', 'última vez');
    if (g.meta && g.meta.score != null) fato(String(g.meta.score), 'nota');
    info.appendChild(fatos);
    if (g.meta && g.meta.description) info.appendChild(el('p', 'tv-pag-desc', g.meta.description));
    if (g.problem || g.installed === false) info.appendChild(el('p', 'tv-pag-aviso', g.installed === false ? 'Este jogo não está instalado.' : `Atenção: ${g.problem}`));
    const botoes = el('div', 'tv-pag-botoes');
    const fav = favs().has(g.id);
    const acoes = [
      ['jogar', ui.jogando && ui.jogando.has(g.id) ? 'Jogando agora' : '▶  Jogar', 'tv-btn-principal'],
      ...(g.kind === 'rom' ? [['online', '🌐  Jogar online']] : []),
      ['fav', fav ? '★  Nos favoritos' : '☆  Favoritar'],
      ['remover', 'Remover da biblioteca'],
      ['voltar', 'Voltar']
    ];
    acoes.forEach(([acao, txt, cls], i) => {
      const b = el('button', 'tv-btn' + (cls ? ' ' + cls : ''), txt);
      b.dataset.acao = acao;
      b.onclick = () => { focoPagina = i; executarPagina(acao); };
      botoes.appendChild(b);
    });
    info.appendChild(botoes);
    pag.append(capa, info);
    pag.hidden = false;
    raiz.classList.add('com-pagina');
    focarPagina();
    renderDicas();
    somar('selecionar');
  }
  function focarPagina() {
    raiz.querySelectorAll('.tv-pag-botoes .tv-btn').forEach((b, i) => b.classList.toggle('foco', i === focoPagina));
  }
  function fecharPagina() {
    camada = null;
    jogoDaPagina = null;
    $t('.tv-pagina').hidden = true;
    raiz.classList.remove('com-pagina');
    renderDicas();
    somar('voltar');
  }
  async function executarPagina(acao) {
    const g = jogoDaPagina;
    if (acao === 'voltar') return fecharPagina();
    if (acao === 'fav') return favoritar(g, true);
    if (acao === 'jogar') return jogar(g);
    if (acao === 'remover') {
      return pedirConfirmacaoTV(`Remover ${g.title} da biblioteca? (o jogo não é apagado do PC)`, 'Remover', async () => {
        const r = await api.removeGame(g.id);
        if (!r.ok) { aviso(r.error || 'Não consegui remover'); somar('erro'); return; }
        if (Array.isArray(r.data)) ui.state.games = r.data;
        else ui.state.games = ui.state.games.filter(x => x.id !== g.id);
        ui.state.favorites = (ui.state.favorites || []).filter(id => id !== g.id);
        fecharPagina();
        aviso(`${g.title} saiu da biblioteca`);
        atualizar();
      });
    }
    if (acao === 'online') {
      aviso(`Abrindo ${g.title} online…`);
      const r = await api.launch(g.id, { online: true });
      if (!r.ok) { aviso(r.error || 'Não consegui abrir online'); somar('erro'); }
      else aviso(ui.discordEstado === 'conectado' ? 'Pronto: seus amigos entram pelo "Participar" do Discord' : 'Aberto online (o Discord não está aberto para mandar o convite)');
    }
  }

  async function jogar(g) {
    if (!g) return;
    if (g.installed === false) { aviso('Este jogo não está instalado'); somar('erro'); return; }
    somar('selecionar');
    aviso(`Abrindo ${g.title}…`);
    await launch(g);
  }

  async function favoritar(g, naPagina) {
    if (!g) return;
    const r = await api.toggleFavorite(g.id);
    if (!r.ok) { aviso(r.error || 'Não consegui favoritar'); return; }
    ui.state.favorites = r.data;
    const agora = favs().has(g.id);
    aviso(agora ? `${g.title} nos favoritos` : `${g.title} saiu dos favoritos`);
    somar('selecionar');
    if (naPagina) abrirPagina(g);
    else if (secao === 'inicio') { renderInicio(); }
    else if (secao === 'biblioteca') renderBiblioteca();
  }

  function itensMenu() {
    return [
      ['continuar', 'Continuar'],
      ['perfil', 'Trocar de perfil'],
      ['aleatorio', 'Jogo aleatório'],
      ['escanear', 'Procurar jogos novos'],
      ['sons', `Sons: ${typeof Som !== 'undefined' && Som.ligado ? 'ligados' : 'desligados'}`],
      ['abertura', `Animação de abertura: ${aberturaLigada() ? 'ligada' : 'desligada'}`],
      ['sair', 'Sair do Modo TV'],
      ['fechar', 'Fechar o Arcade Hub']
    ];
  }
  function abrirMenu() {
    camada = 'menu';
    focoMenu = 0;
    renderMenu();
    $t('.tv-menu').hidden = false;
    renderDicas();
    somar('selecionar');
  }
  function renderMenu() {
    const caixa = $t('.tv-menu-caixa');
    caixa.innerHTML = '';
    caixa.appendChild(el('div', 'tv-menu-titulo', 'Menu'));
    itensMenu().forEach(([acao, txt], i) => {
      const b = el('button', 'tv-menu-item' + (i === focoMenu ? ' foco' : ''), txt);
      b.onclick = () => { focoMenu = i; executarMenu(acao); };
      caixa.appendChild(b);
    });
  }
  function fecharMenu() { camada = null; $t('.tv-menu').hidden = true; renderDicas(); somar('voltar'); }
  async function executarMenu(acao) {
    if (acao === 'continuar') return fecharMenu();
    if (acao === 'perfil') { fecharMenu(); return trocarPerfil(); }
    if (acao === 'sons') { if (typeof Som !== 'undefined') Som.alternar(); return renderMenu(); }
    if (acao === 'abertura') { definirAbertura(!aberturaLigada()); somar('selecionar'); return renderMenu(); }
    if (acao === 'aleatorio') {
      fecharMenu();
      const jogaveis = visiveis().filter(g => g.installed !== false && !g.problem);
      if (jogaveis.length) abrirPagina(jogaveis[Math.floor(Math.random() * jogaveis.length)]);
      return;
    }
    if (acao === 'escanear') {
      fecharMenu();
      aviso('Procurando jogos novos…');
      await runScan();
      atualizar();
      return;
    }
    if (acao === 'sair') return fechar();
    if (acao === 'fechar') { try { api.win.close(); } catch { window.close(); } }
  }

  function aberturaLigada() { try { return localStorage.getItem('arcadehub.abertura') !== '0'; } catch { return true; } }
  function definirAbertura(v) { try { localStorage.setItem('arcadehub.abertura', v ? '1' : '0'); } catch { /* sem storage */ } }

  let avisoTimer = null;
  function aviso(msg) {
    const box = $t('.tv-avisos');
    box.textContent = msg;
    box.classList.add('on');
    clearTimeout(avisoTimer);
    avisoTimer = setTimeout(() => box.classList.remove('on'), 2600);
  }

  /* ------------------------------------------------------------------ */
  /* navegação                                                           */
  /* ------------------------------------------------------------------ */
  function colunasBib() {
    const blocos = raiz.querySelectorAll('.tv-bib-grade .tv-bloco');
    if (blocos.length < 2) return 1;
    const topo = blocos[0].offsetTop;
    let n = 0;
    for (const b of blocos) { if (b.offsetTop !== topo) break; n++; }
    return Math.max(1, n);
  }

  function mover(dx, dy) {
    if (camada === 'confirmar') {
      const d = dx || dy;
      if (!d) return;
      confirmacao.foco = d > 0 ? 1 : 0;
      renderConfirmacao();
      somar('mover');
      return;
    }
    if (!camada && (secao === 'conquistas' || secao === 'emuladores' || secao === 'sistema')) return moverSec(dx, dy);
    if (camada === 'menu') {
      if (!dy) return;
      focoMenu = (focoMenu + dy + itensMenu().length) % itensMenu().length;
      renderMenu();
      somar('mover');
      return;
    }
    if (camada === 'pagina') {
      const n = raiz.querySelectorAll('.tv-pag-botoes .tv-btn').length;
      const d = dx || dy;
      if (!d) return;
      focoPagina = Math.max(0, Math.min(n - 1, focoPagina + d));
      focarPagina();
      somar('mover');
      return;
    }
    if (secao === 'inicio') {
      if (dy) {
        const nova = Math.max(0, Math.min(fileiras.length - 1, foco.linha + dy));
        if (nova === foco.linha) return;
        // mantém a posição NA TELA ao trocar de fileira (como no Big Picture)
        const linhas = raiz.querySelectorAll('.tv-fileira');
        const naTela = foco.col - (linhas[foco.linha]._desloc || 0);
        foco.linha = nova;
        const alvoCol = (linhas[nova]._desloc || 0) + Math.max(0, naTela);
        foco.col = Math.min(Math.max(0, fileiras[nova].jogos.length - 1), alvoCol);
      } else if (dx) {
        const n = fileiras[foco.linha].jogos.length;
        const c = Math.max(0, Math.min(n - 1, foco.col + dx));
        if (c === foco.col) return;
        foco.col = c;
      }
      aplicarFoco();
    } else if (secao === 'biblioteca') {
      const cols = colunasBib();
      const n = listaBib.length;
      let i = focoBib + dx + dy * cols;
      i = Math.max(0, Math.min(n - 1, i));
      if (i === focoBib) return;
      focoBib = i;
      aplicarFoco();
    }
  }

  function botaoA() {
    if (camada === 'confirmar') return responderConfirmacao();
    if (!camada && (secao === 'emuladores' || secao === 'sistema')) { const n = itensSec()[focoSec[secao]]; if (n) n.click(); return; }
    if (!camada && secao === 'conquistas') return;
    if (camada === 'menu') return executarMenu(itensMenu()[focoMenu][0]);
    if (camada === 'pagina') {
      const b = raiz.querySelectorAll('.tv-pag-botoes .tv-btn')[focoPagina];
      return b && executarPagina(b.dataset.acao);
    }
    abrirPagina(jogoEmFoco());
  }
  function botaoB() {
    if (camada === 'confirmar') { fecharConfirmacao(); somar('voltar'); return; }
    if (camada === 'menu') return fecharMenu();
    if (camada === 'pagina') return fecharPagina();
    if (secao !== 'inicio') return irPara('inicio');
    abrirMenu();
  }
  function botaoX() {
    if (camada === 'menu' || camada === 'confirmar' || ['conquistas', 'emuladores', 'sistema', 'stats'].includes(secao) && !camada) return;
    jogar(camada === 'pagina' ? jogoDaPagina : jogoEmFoco());
  }
  function botaoY() {
    if (camada === 'menu' || camada === 'confirmar' || ['conquistas', 'emuladores', 'sistema', 'stats'].includes(secao) && !camada) return;
    favoritar(camada === 'pagina' ? jogoDaPagina : jogoEmFoco(), camada === 'pagina');
  }
  function trocarSecao(d) {
    if (camada) return;
    const i = (SECOES.indexOf(secao) + d + SECOES.length) % SECOES.length;
    irPara(SECOES[i]);
  }
  function botaoStart() { if (camada === 'menu') fecharMenu(); else abrirMenu(); }
  function botaoSelect() { executarMenu('aleatorio'); }

  /* teclado (captura: o resto do app não reage enquanto o Modo TV está aberto) */
  function onTecla(e) {
    if (!ativo || document.querySelector('.intro')) return;
    if (typeof Ecossistema !== 'undefined' && Ecossistema.camada) return;   // ela mesma cuida das teclas
    const mapa = {
      ArrowLeft: () => mover(-1, 0), ArrowRight: () => mover(1, 0), ArrowUp: () => mover(0, -1), ArrowDown: () => mover(0, 1),
      Enter: botaoA, Escape: botaoB, Backspace: botaoB, ' ': botaoX, f: botaoY, F: botaoY,
      q: () => trocarSecao(-1), Q: () => trocarSecao(-1), e: () => trocarSecao(1), E: () => trocarSecao(1),
      PageUp: () => trocarSecao(-1), PageDown: () => trocarSecao(1), m: botaoStart, M: botaoStart,
      F10: () => fechar()
    };
    const fn = mapa[e.key];
    if (!fn) return;
    e.preventDefault();
    e.stopPropagation();
    fn();
  }

  /* controle: laço próprio com repetição ao segurar o direcional */
  function lerControle() {
    rafPad = requestAnimationFrame(lerControle);
    if (!ativo || document.hidden || !document.hasFocus() || document.querySelector('.intro')) return;
    let gp = null;
    try { gp = [...(navigator.getGamepads ? navigator.getGamepads() : [])].find(p => p && p.connected); } catch { /* noop */ }
    if (!gp) return;
    const ap = i => !!(gp.buttons[i] && gp.buttons[i].pressed);
    const borda = i => { const on = ap(i); const antes = pad.botoes[i]; pad.botoes[i] = on; return on && !antes; };
    const eco = typeof Ecossistema !== 'undefined' && Ecossistema.camada;
    const [ax = 0, ay = 0] = gp.axes;
    const dx = ap(14) || ax < -0.55 ? -1 : ap(15) || ax > 0.55 ? 1 : 0;
    const dy = ap(12) || ay < -0.55 ? -1 : ap(13) || ay > 0.55 ? 1 : 0;
    const agora = performance.now();
    const andar = eco ? (x, y) => eco.mover(x, y) : mover;
    if (dx || dy) {
      const espera = pad.repetindo ? 105 : 360;      // segura: repete rápido depois de uma pausa
      if (!pad.direcao || pad.direcao !== `${dx},${dy}`) { pad.direcao = `${dx},${dy}`; pad.repetindo = false; pad.ultimoMov = agora; andar(dx, dy); }
      else if (agora - pad.ultimoMov > espera) { pad.repetindo = true; pad.ultimoMov = agora; andar(dx, dy); }
    } else {
      pad.direcao = null;
      pad.repetindo = false;
    }
    if (eco) {
      if (borda(0)) eco.confirmar();
      if (borda(1)) eco.cancelar();
      return;
    }
    if (borda(0)) botaoA();
    if (borda(1)) botaoB();
    if (borda(2)) botaoX();
    if (borda(3)) botaoY();
    if (borda(4)) trocarSecao(-1);
    if (borda(5)) trocarSecao(1);
    if (borda(9)) botaoStart();
    if (borda(8)) botaoSelect();
    if (borda(16)) fechar();
  }

  /* ------------------------------------------------------------------ */
  /* abrir / fechar                                                      */
  /* ------------------------------------------------------------------ */
  /**
   * Capas da abertura: sorteadas a cada vez, da biblioteca inteira (então jogo
   * novo entra no sorteio sozinho). Os jogos que chegaram desde a última
   * abertura têm lugar garantido, para você ver os novos aparecendo.
   */
  const MAX_CAPAS = 18;
  const CHAVE_VISTOS = 'arcadehub.abertura.vistos';
  function embaralhar(lista) {
    const a = [...lista];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  function capasParaAbertura() {
    const com = visiveis().filter(g => arte(g));
    let vistos = null;
    try { vistos = new Set(JSON.parse(localStorage.getItem(CHAVE_VISTOS) || 'null') || []); } catch { vistos = null; }
    // primeira abertura: ninguém é "novo", senão todos seriam
    const novos = vistos && vistos.size ? embaralhar(com.filter(g => !vistos.has(g.id))) : [];
    const resto = embaralhar(com.filter(g => !novos.includes(g)));
    const escolhidos = embaralhar([...novos.slice(0, MAX_CAPAS), ...resto].slice(0, MAX_CAPAS));
    try { localStorage.setItem(CHAVE_VISTOS, JSON.stringify(visiveis().map(g => g.id))); } catch { /* sem storage */ }
    return escolhidos.map(g => ({ src: arte(g), titulo: g.title }));
  }

  function relogio() {
    const r = $t('.tv-relogio');
    if (r) r.textContent = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }

  async function abrir(opts) {
    const o = opts || {};
    montar();
    if (ativo) return;
    ativo = true;
    document.body.classList.add('modo-tv');
    try { await api.setFullscreen(true); } catch { /* prévia */ }
    raiz.hidden = false;
    irPara('inicio', false);
    relogio();
    timerRelogio = setInterval(relogio, 15000);
    window.addEventListener('keydown', onTecla, true);
    window.addEventListener('gamepadconnected', renderDicas);
    window.addEventListener('gamepaddisconnected', renderDicas);
    window.addEventListener('resize', aplicarFocoSilencioso);
    cancelAnimationFrame(rafPad);
    pad.botoes = {};
    // botões já apertados (ex.: o Guia que abriu o modo) não disparam de novo
    try { const gp = [...navigator.getGamepads()].find(p => p && p.connected); if (gp) gp.buttons.forEach((b, i) => { pad.botoes[i] = b.pressed; }); } catch { /* noop */ }
    rafPad = requestAnimationFrame(lerControle);
    comoConsole = !!o.console;
    renderPerfilTopo();
    if (o.intro !== false && aberturaLigada() && typeof Intro !== 'undefined') {
      await Intro.tocar({ capas: capasParaAbertura() });
    }
    // mais de uma pessoa em casa: pergunta quem vai jogar (como nos consoles)
    if (ativo && (ui.state.perfis || []).length > 1) await trocarPerfil({ semCancelar: comoConsole });
  }
  const aplicarFocoSilencioso = () => { if (ativo) aplicarFoco(true); };

  async function fechar() {
    if (!ativo) return;
    ativo = false;
    somar('voltar');
    cancelAnimationFrame(rafPad);
    clearInterval(timerRelogio);
    window.removeEventListener('keydown', onTecla, true);
    window.removeEventListener('gamepadconnected', renderDicas);
    window.removeEventListener('gamepaddisconnected', renderDicas);
    window.removeEventListener('resize', aplicarFocoSilencioso);
    raiz.hidden = true;
    camada = null;
    $t('.tv-pagina').hidden = true;
    $t('.tv-menu').hidden = true;
    $t('.tv-confirmar').hidden = true;
    confirmacao = null;
    document.body.classList.remove('modo-tv');
    try { await api.setFullscreen(false); } catch { /* prévia */ }
    if (typeof render === 'function') render();
  }

  /** Dados mudaram (sessão, varredura, favorito): redesenha mantendo o foco. */
  function atualizar() {
    if (!ativo) return;
    if (camada === 'pagina' && jogoDaPagina) {
      const novo = ui.state.games.find(g => g.id === jogoDaPagina.id);
      if (novo) abrirPagina(novo);
    }
    renderPerfilTopo();
    if (secao === 'inicio') renderInicio();
    else if (secao === 'biblioteca') renderBiblioteca();
    else if (secao === 'conquistas') renderConquistasTV();
    else if (secao === 'emuladores') { /* não refaz no meio do uso (perderia o foco) */ }
    else if (secao === 'sistema') renderSistemaTV();
    else renderStatsTV();
  }

  return {
    abrir, fechar, atualizar, aviso: msg => { if (ativo) aviso(msg); },
    get ativo() { return ativo; },
    alternar() { return ativo ? fechar() : abrir(); }
  };
})();
