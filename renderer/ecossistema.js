'use strict';
/**
 * Arcade Hub — ecossistema: perfis, conquistas e o aviso de conquista.
 *
 *  - "Quem vai jogar?": escolha do perfil (controle, teclado ou mouse);
 *  - aviso de conquista desbloqueada (como nos consoles), com som;
 *  - grade de conquistas (usada no Modo TV e no painel da tela normal);
 *  - painel "Perfis e conquistas" na tela normal: criar, renomear, trocar
 *    cor/avatar e apagar perfis.
 *
 * Depende de app.js (ui, api, el, escapeHtml, toast, render) e som.js (Som).
 */
const Ecossistema = (() => {
  const somar = n => { try { if (typeof Som !== 'undefined' && Som.ligado !== false) Som[n](); } catch { /* sem áudio */ } };
  const NIVEL_NOME = { bronze: 'Bronze', prata: 'Prata', ouro: 'Ouro', platina: 'Platina' };
  const AVATARES = ['🎮', '🕹', '👾', '🐉', '🦊', '🐱', '🐼', '🚀', '⚡', '🔥', '🌟', '🎧', '🏎', '⚽', '🧙', '🤖'];
  const CORES = ['#22d3ee', '#e879f9', '#facc15', '#4ade80', '#fb7185', '#a78bfa', '#fb923c', '#38bdf8'];

  const perfis = () => (ui.state && ui.state.perfis) || [];
  const perfilAtual = () => perfis().find(p => p.id === (ui.state && ui.state.perfilAtivo)) || perfis()[0] || null;

  /** Bolinha com o avatar e a cor do perfil. */
  function avatar(p, tamanho) {
    const d = document.createElement('span');
    d.className = 'eco-avatar';
    d.style.setProperty('--cor', (p && p.cor) || '#22d3ee');
    if (tamanho) d.style.setProperty('--tam', tamanho + 'px');
    d.textContent = (p && p.avatar) || '?';
    return d;
  }

  /* ------------------------------------------------------------------ */
  /* camada por cima de tudo (Quem vai jogar?)                           */
  /* ------------------------------------------------------------------ */
  let camada = null;     // { mover, confirmar, cancelar, fechar }

  /**
   * "Quem vai jogar?". Resolve com o id escolhido (ou null se cancelar).
   * Funciona com controle mesmo dentro do Modo TV (que repassa os botões).
   */
  function escolherPerfil(opts) {
    const o = opts || {};
    const lista = perfis();
    if (!lista.length) return Promise.resolve(null);
    return new Promise(resolve => {
      const box = document.createElement('div');
      box.className = 'eco-quem modal-layer';
      box.innerHTML = '<div class="eco-quem-fundo"></div><div class="eco-quem-caixa"><h1>Quem vai jogar?</h1><div class="eco-quem-lista"></div><p class="eco-quem-dica"></p></div>';
      const fila = box.querySelector('.eco-quem-lista');
      let i = Math.max(0, lista.findIndex(p => p.id === (ui.state && ui.state.perfilAtivo)));
      const botoes = lista.map((p, k) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'eco-quem-perfil';
        b.append(avatar(p, 112), Object.assign(document.createElement('b'), { textContent: p.nome }));
        b.onclick = () => { i = k; confirmar(); };
        b.onmouseenter = () => { i = k; marcar(false); };
        fila.appendChild(b);
        return b;
      });
      box.querySelector('.eco-quem-dica').textContent = o.semCancelar ? '← → escolher · A / Enter confirmar' : '← → escolher · A / Enter confirmar · B / Esc voltar';
      const marcar = som => {
        botoes.forEach((b, k) => b.classList.toggle('foco', k === i));
        if (som) somar('mover');
      };
      const fechar = v => {
        if (!camada) return;
        camada = null;
        window.removeEventListener('keydown', tecla, true);
        box.classList.add('saindo');
        setTimeout(() => box.remove(), 220);
        resolve(v);
      };
      async function confirmar() {
        const p = lista[i];
        somar('selecionar');
        if (p.id !== ui.state.perfilAtivo) {
          const r = await api.ativarPerfil(p.id);
          if (r.ok) ui.state.perfilAtivo = p.id;
        }
        fechar(p.id);
        if (typeof render === 'function') render();
      }
      const cancelar = () => { if (o.semCancelar) return; somar('voltar'); fechar(null); };
      const mover = (dx, dy) => { const d = dx || dy; if (!d) return; const n = Math.max(0, Math.min(lista.length - 1, i + d)); if (n !== i) { i = n; marcar(true); } };
      function tecla(e) {
        const m = { ArrowLeft: () => mover(-1), ArrowRight: () => mover(1), ArrowUp: () => mover(-1), ArrowDown: () => mover(1), Enter: confirmar, ' ': confirmar, Escape: cancelar, Backspace: cancelar };
        if (!m[e.key]) return;
        e.preventDefault(); e.stopPropagation();
        m[e.key]();
      }
      window.addEventListener('keydown', tecla, true);
      camada = { mover, confirmar, cancelar, fechar };
      document.body.appendChild(box);
      marcar(false);
      requestAnimationFrame(() => box.classList.add('on'));
    });
  }

  /* ------------------------------------------------------------------ */
  /* aviso de conquista                                                  */
  /* ------------------------------------------------------------------ */
  const fila = [];
  let mostrando = false;
  function avisarConquistas(payload) {
    const lista = (payload && payload.conquistas) || [];
    const p = perfis().find(x => x.id === payload.perfil);
    for (const c of lista) fila.push({ c, p });
    if (!mostrando) proxima();
  }
  function proxima() {
    const item = fila.shift();
    if (!item) { mostrando = false; return; }
    mostrando = true;
    const { c, p } = item;
    const box = document.createElement('div');
    box.className = `eco-trofeu nivel-${c.nivel}`;
    box.setAttribute('role', 'status');
    const ic = document.createElement('div');
    ic.className = 'eco-trofeu-icone';
    ic.textContent = c.icone || '🏆';
    const txt = document.createElement('div');
    txt.className = 'eco-trofeu-txt';
    const topo = document.createElement('small');
    topo.textContent = `Conquista desbloqueada · ${NIVEL_NOME[c.nivel] || ''} · ${c.pontos} pts${p && perfis().length > 1 ? ' · ' + p.nome : ''}`;
    const nome = document.createElement('b');
    nome.textContent = c.nome;
    const desc = document.createElement('span');
    desc.textContent = c.desc;
    txt.append(topo, nome, desc);
    box.append(ic, txt);
    document.body.appendChild(box);
    try {
      if (typeof Som !== 'undefined' && Som.ligado !== false) { Som.selecionar(); setTimeout(() => Som.acorde && Som.acorde(), 120); }
    } catch { /* sem áudio */ }
    requestAnimationFrame(() => box.classList.add('on'));
    setTimeout(() => { box.classList.remove('on'); setTimeout(() => { box.remove(); proxima(); }, 450); }, 5200);
  }

  /* ------------------------------------------------------------------ */
  /* grade de conquistas                                                 */
  /* ------------------------------------------------------------------ */
  function dataCurta(ts) {
    try { return new Date(ts).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }); } catch { return ''; }
  }
  function fmtProgresso(c) {
    const fmt = n => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ','));
    return `${fmt(c.atual)} / ${fmt(c.meta)}`;
  }

  /**
   * Desenha o resumo + grade de conquistas em `box`.
   * @param {object} dados resposta de api.conquistas()
   * @param {object} [o] { tv: true } usa a classe de foco do Modo TV
   */
  function desenharConquistas(box, dados, o) {
    const opts = o || {};
    box.innerHTML = '';
    if (!dados) { box.appendChild(Object.assign(document.createElement('p'), { className: 'eco-vazio', textContent: 'Não consegui carregar as conquistas.' })); return; }
    const feitas = dados.lista.filter(c => c.quando);
    const resumo = document.createElement('div');
    resumo.className = 'eco-resumo';
    const p = perfis().find(x => x.id === dados.perfil) || perfilAtual();
    const quem = document.createElement('div');
    quem.className = 'eco-resumo-quem';
    quem.append(avatar(p, 56), Object.assign(document.createElement('b'), { textContent: p ? p.nome : '' }));
    const nums = document.createElement('div');
    nums.className = 'eco-resumo-nums';
    for (const [v, r] of [[`${dados.pontos}`, `de ${dados.total} pontos`], [`${feitas.length}/${dados.lista.length}`, 'conquistas'],
      [String(feitas.filter(c => c.nivel === 'ouro' || c.nivel === 'platina').length), 'de ouro ou platina']]) {
      const n = document.createElement('div');
      n.append(Object.assign(document.createElement('b'), { textContent: v }), Object.assign(document.createElement('span'), { textContent: r }));
      nums.appendChild(n);
    }
    const barra = document.createElement('div');
    barra.className = 'eco-resumo-barra';
    const i = document.createElement('i');
    i.style.width = Math.round((dados.pontos / Math.max(1, dados.total)) * 100) + '%';
    barra.appendChild(i);
    resumo.append(quem, nums, barra);
    box.appendChild(resumo);

    const grade = document.createElement('div');
    grade.className = 'eco-grade';
    // desbloqueadas primeiro (mais recentes no topo), depois as mais perto de completar
    const ordem = [...dados.lista].sort((a, b) => (b.quando ? 1 : 0) - (a.quando ? 1 : 0) || (b.quando || 0) - (a.quando || 0) || (b.atual / b.meta) - (a.atual / a.meta));
    for (const c of ordem) {
      const card = document.createElement(opts.tv ? 'button' : 'div');
      card.className = `eco-conq nivel-${c.nivel}${c.quando ? ' feita' : ''}${opts.tv ? ' tv-f' : ''}`;
      if (opts.tv) card.type = 'button';
      const ic = document.createElement('div');
      ic.className = 'eco-conq-icone';
      ic.textContent = c.quando ? c.icone : '🔒';
      const txt = document.createElement('div');
      txt.className = 'eco-conq-txt';
      txt.append(Object.assign(document.createElement('b'), { textContent: c.nome }), Object.assign(document.createElement('span'), { textContent: c.desc }));
      const rod = document.createElement('div');
      rod.className = 'eco-conq-rodape';
      if (c.quando) rod.textContent = `${NIVEL_NOME[c.nivel]} · ${c.pontos} pts · ${dataCurta(c.quando)}`;
      else {
        const pb = document.createElement('div');
        pb.className = 'eco-conq-progresso';
        const pi = document.createElement('i');
        pi.style.width = Math.round((c.atual / c.meta) * 100) + '%';
        pb.appendChild(pi);
        rod.append(pb, Object.assign(document.createElement('span'), { textContent: `${fmtProgresso(c)} · ${c.pontos} pts` }));
      }
      txt.appendChild(rod);
      card.append(ic, txt);
      grade.appendChild(card);
    }
    box.appendChild(grade);
  }

  /* ------------------------------------------------------------------ */
  /* painel da tela normal: perfis + conquistas                          */
  /* ------------------------------------------------------------------ */
  async function abrirPainel(abaInicial) {
    const layer = document.createElement('div');
    layer.className = 'modal-layer eco-painel';
    layer.innerHTML = `
      <div class="modal-backdrop"></div>
      <div class="sheet wide" role="dialog" aria-modal="true" aria-label="Perfis e conquistas">
        <div class="sheet-head">
          <h2>Perfis e conquistas</h2>
          <button class="icon-btn" data-fechar title="Fechar">✕</button>
        </div>
        <div class="tabs eco-abas"><button data-aba="conquistas">Conquistas</button><button data-aba="perfis">Perfis</button></div>
        <div class="eco-corpo"></div>
      </div>`;
    const corpo = layer.querySelector('.eco-corpo');
    const fechar = () => { layer.remove(); document.removeEventListener('keydown', esc, true); };
    const esc = e => { if (e.key === 'Escape' && !document.querySelector('.eco-quem')) { e.stopPropagation(); fechar(); } };
    layer.querySelector('[data-fechar]').onclick = fechar;
    layer.querySelector('.modal-backdrop').onclick = fechar;
    document.addEventListener('keydown', esc, true);

    async function irPara(aba) {
      layer.querySelectorAll('.eco-abas button').forEach(b => b.classList.toggle('on', b.dataset.aba === aba));
      corpo.innerHTML = '';
      if (aba === 'conquistas') {
        const sel = document.createElement('div');
        sel.className = 'eco-quem-mini';
        for (const p of perfis()) {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'eco-chip' + (p.id === ui.state.perfilAtivo ? ' on' : '');
          b.append(avatar(p, 22), document.createTextNode(p.nome));
          b.onclick = async () => { const r = await api.conquistas(p.id); corpo.querySelectorAll('.eco-chip').forEach(x => x.classList.toggle('on', x === b)); desenharConquistas(alvo, r.ok ? r.data : null); };
          sel.appendChild(b);
        }
        const alvo = document.createElement('div');
        if (perfis().length > 1) corpo.appendChild(sel);
        corpo.appendChild(alvo);
        const r = await api.conquistas(ui.state.perfilAtivo);
        desenharConquistas(alvo, r.ok ? r.data : null);
      } else {
        desenharPerfis(corpo, () => irPara('perfis'));
      }
    }
    layer.querySelectorAll('.eco-abas button').forEach(b => { b.onclick = () => irPara(b.dataset.aba); });
    document.body.appendChild(layer);
    irPara(abaInicial || 'conquistas');
  }

  function desenharPerfis(box, recarregar) {
    box.innerHTML = '';
    const intro = document.createElement('p');
    intro.className = 'muted small';
    intro.textContent = 'Cada pessoa da casa tem o próprio tempo de jogo e as próprias conquistas. Com mais de um perfil, o Modo TV pergunta "Quem vai jogar?" ao abrir.';
    box.appendChild(intro);
    const lista = perfis().map(p => ({ ...p }));
    const salvar = async novo => {
      const r = await api.salvarPerfis(novo);
      if (!r.ok) { toast(r.error || 'Não consegui salvar', 'erro'); return false; }
      ui.state.perfis = r.data.perfis;
      ui.state.perfilAtivo = r.data.perfilAtivo;
      if (typeof render === 'function') render();
      return true;
    };
    for (const p of lista) {
      const linha = document.createElement('div');
      linha.className = 'eco-perfil-linha' + (p.id === ui.state.perfilAtivo ? ' ativo' : '');
      const av = avatar(p, 44);
      av.title = 'Trocar avatar';
      av.style.cursor = 'pointer';
      av.onclick = async () => { p.avatar = AVATARES[(AVATARES.indexOf(p.avatar) + 1) % AVATARES.length]; if (await salvar(lista)) recarregar(); };
      const nome = document.createElement('input');
      nome.value = p.nome;
      nome.maxLength = 24;
      nome.setAttribute('aria-label', 'Nome do perfil');
      nome.onchange = async () => { p.nome = nome.value; if (await salvar(lista)) recarregar(); };
      const cores = document.createElement('div');
      cores.className = 'eco-cores';
      for (const c of CORES) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'eco-cor' + (c === p.cor ? ' on' : '');
        b.style.background = c;
        b.title = 'Cor do perfil';
        b.onclick = async () => { p.cor = c; if (await salvar(lista)) recarregar(); };
        cores.appendChild(b);
      }
      const acoes = document.createElement('div');
      acoes.className = 'eco-perfil-acoes';
      if (p.id !== ui.state.perfilAtivo) {
        const usar = document.createElement('button');
        usar.className = 'ghost-btn';
        usar.textContent = 'Usar este';
        usar.onclick = async () => { const r = await api.ativarPerfil(p.id); if (r.ok) { ui.state.perfilAtivo = p.id; toast(`Agora jogando como ${p.nome}`, 'ok'); recarregar(); if (typeof render === 'function') render(); } };
        acoes.appendChild(usar);
      } else {
        acoes.appendChild(Object.assign(document.createElement('span'), { className: 'eco-tag', textContent: 'jogando agora' }));
      }
      if (lista.length > 1) {
        const apagar = document.createElement('button');
        apagar.className = 'ghost-btn';
        apagar.textContent = 'Apagar';
        apagar.onclick = async () => {
          const okApagar = await pedirConfirmacao({ titulo: `Apagar o perfil ${p.nome}?`, texto: 'As conquistas dele somem. O tempo de jogo continua contando no total de cada jogo.', acao: 'Apagar' });
          if (okApagar && await salvar(lista.filter(x => x.id !== p.id))) recarregar();
        };
        acoes.appendChild(apagar);
      }
      linha.append(av, nome, cores, acoes);
      box.appendChild(linha);
    }
    if (lista.length < 8) {
      const novo = document.createElement('button');
      novo.className = 'primary-btn';
      novo.textContent = '+ Novo perfil';
      novo.onclick = async () => {
        const n = lista.length;
        lista.push({ id: 'p' + Date.now().toString(36), nome: `Jogador ${n + 1}`, cor: CORES[n % CORES.length], avatar: AVATARES[(n * 3) % AVATARES.length] });
        if (await salvar(lista)) { recarregar(); setTimeout(() => { const ins = box.querySelectorAll('.eco-perfil-linha input'); const u = ins[ins.length - 1]; if (u) { u.focus(); u.select(); } }, 50); }
      };
      box.appendChild(novo);
    }
  }

  return {
    perfilAtual, avatar, escolherPerfil, avisarConquistas, desenharConquistas, abrirPainel,
    get camada() { return camada; }
  };
})();
