/* ================= Arcade Hub — interfaces estilo LaunchBox / Big Box =================
 *
 * Cinco interfaces inspiradas no LaunchBox (área de trabalho) e no Big Box
 * (modo TV dele). Todas usam a mesma biblioteca e as cores do tema, então as
 * variantes (Clássico, Claro, Meia-noite, Colorido…) saem das skins.
 *
 *   lb-caixas  plataformas à esquerda · grade de capas por letra · detalhes à direita
 *   lb-lista   igual, mas com uma tabela que dá para ordenar por coluna
 *   bb-parede  mural de capas em 3 fileiras sobre o vídeo do jogo
 *   bb-roda    roda vertical de títulos à direita, vídeo grande à esquerda
 *   bb-texto   lista de títulos à esquerda, vídeo e ficha à direita
 *
 * Os "grupos" são as plataformas/categorias da barra lateral do LaunchBox:
 * Todos, Favoritos, Recentes, Nunca jogados, cada plataforma e cada loja.
 * Q / E, PageUp / PageDown ou LB / RB trocam de grupo.
 */
'use strict';

(() => {
  if (typeof Dashboards === 'undefined') return;

  /* ---------------- utilidades ---------------- */

  const el = (tag, cls, txt) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (txt != null) n.textContent = txt;
    return n;
  };
  const guardado = {
    get(k, padrao) { try { const v = localStorage.getItem('arcadehub.lb.' + k); return v == null ? padrao : v; } catch { return padrao; } },
    set(k, v) { try { localStorage.setItem('arcadehub.lb.' + k, String(v)); } catch { /* sem storage: só não lembra */ } }
  };
  const tempo = ms => (typeof fmtPlaytime === 'function' ? fmtPlaytime(ms) : Math.round((ms || 0) / 36e5) + 'h');
  const quando = ts => (typeof fmtDate === 'function' ? fmtDate(ts) : (ts ? new Date(ts).toLocaleDateString(LOCALE()) : 'Nunca'));
  const tamanho = b => (typeof fmtSize === 'function' ? fmtSize(b) : Math.round((b || 0) / 1048576) + ' MB');
  const genero = k => (typeof genreLabel === 'function' ? genreLabel(k) : k);
  const urlCss = u => 'url(' + JSON.stringify(String(u)) + ')';

  const ORIGENS = {
    steam: 'Steam', epic: 'Epic Games', gog: 'GOG', folder: 'Pasta', emulator: 'Emulador',
    exe: 'Executável', ea: 'EA App', ubisoft: 'Ubisoft Connect', xbox: 'Xbox', battlenet: 'Battle.net',
    itch: 'itch.io', amazon: 'Amazon Games', manual: 'Adicionado à mão'
  };
  const origemDe = g => ORIGENS[g.source] || (g.source ? g.source[0].toUpperCase() + g.source.slice(1) : '—');
  const plataformaDe = g => (g.kind === 'rom' ? (g.platform || 'Emulador') : 'PC (Windows)');
  const minutos = g => (g.playtime && g.playtime.totalMs) || 0;
  const ultimaVez = g => g.playedAt || (g.playtime && g.playtime.lastAt) || 0;
  const nota = g => (g.meta && g.meta.score) || 0;
  const iniciais = t => String(t || '?').replace(/[^\p{L}\p{N} ]/gu, '').split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase() || '?';
  const letra = t => {
    const c = String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().charAt(0).toUpperCase();
    return /[A-Z]/.test(c) ? c : '#';
  };
  const porTitulo = (a, b) => a.title.localeCompare(b.title, 'pt', { sensitivity: 'base', numeric: true });

  /** Cor de cada plataforma (variante Colorido): a mesma plataforma sempre tem a mesma cor. */
  const CORES_FIXAS = {
    todos: 205, favoritos: 45, recentes: 170, nunca: 265,
    'PC (Windows)': 210, SNES: 280, 'Super Nintendo': 280, 'Nintendo 64': 140, NES: 0,
    'Game Boy Advance': 255, 'Game Boy': 95, 'Game Boy Color': 320, GameCube: 265, Wii: 195,
    PlayStation: 220, 'PlayStation 2': 235, PSP: 200, 'Mega Drive': 230, Genesis: 230, Arcade: 15,
    Steam: 210, 'Epic Games': 0, GOG: 290
  };
  function matiz(chave) {
    if (CORES_FIXAS[chave] != null) return CORES_FIXAS[chave];
    let h = 0;
    for (const c of String(chave)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return h % 360;
  }
  function aplicarCor(box, ctx) {
    const g = ctx.grupos[ctx.coluna];
    const ligado = !!(ctx.skin && ctx.skin.colorido && g);
    box.classList.toggle('colorido', ligado);
    if (!ligado) {
      ['--accent', '--accent-2', '--bb-tinta', '--on-accent'].forEach(v => box.style.removeProperty(v));
      return;
    }
    const h = matiz(g.chave || g.id);
    box.style.setProperty('--accent', `hsl(${h} 85% 62%)`);
    box.style.setProperty('--accent-2', `hsl(${(h + 40) % 360} 80% 52%)`);
    box.style.setProperty('--bb-tinta', `hsl(${h} 55% 13%)`);
    box.style.setProperty('--on-accent', `hsl(${h} 70% 8%)`);
  }

  /* ---------------- grupos (a barra lateral) ---------------- */

  const COLUNAS_LISTA = [
    { campo: 'fav', rotulo: '★', titulo: 'Favorito' },
    { campo: 'titulo', rotulo: 'Título' },
    { campo: 'plataforma', rotulo: 'Plataforma' },
    { campo: 'origem', rotulo: 'Origem' },
    { campo: 'generos', rotulo: 'Gêneros', semOrdem: true },
    { campo: 'tempo', rotulo: 'Tempo jogado' },
    { campo: 'ultima', rotulo: 'Última vez' },
    { campo: 'nota', rotulo: 'Nota' }
  ];

  function ordemLista() {
    const [campo, sentido] = String(guardado.get('ordem', 'titulo:asc')).split(':');
    return { campo: COLUNAS_LISTA.some(c => c.campo === campo) ? campo : 'titulo', desc: sentido === 'desc' };
  }

  function ordenar(lista, ordem, favs) {
    const cmp = {
      titulo: porTitulo,
      plataforma: (a, b) => plataformaDe(a).localeCompare(plataformaDe(b), 'pt') || porTitulo(a, b),
      origem: (a, b) => origemDe(a).localeCompare(origemDe(b), 'pt') || porTitulo(a, b),
      tempo: (a, b) => minutos(b) - minutos(a) || porTitulo(a, b),
      ultima: (a, b) => ultimaVez(b) - ultimaVez(a) || porTitulo(a, b),
      nota: (a, b) => nota(b) - nota(a) || porTitulo(a, b),
      fav: (a, b) => (favs.has(b.id) ? 1 : 0) - (favs.has(a.id) ? 1 : 0) || porTitulo(a, b)
    }[ordem.campo] || porTitulo;
    const r = [...lista].sort(cmp);
    return ordem.desc ? r.reverse() : r;
  }

  function modoDe(ctx) {
    const padrao = ctx.tipo === 'lb-lista' ? 'lista' : 'caixas';
    if (!ctx.tipo || !ctx.tipo.startsWith('lb-')) return padrao;
    const id = ctx.skin ? ctx.skin.id : ctx.tipo;
    const v = guardado.get('visao.' + id, padrao);
    return v === 'lista' ? 'lista' : 'caixas';
  }

  function grupos(jogos, favs, ctx) {
    const lista = modoDe(ctx) === 'lista' && ctx.tipo.startsWith('lb-');
    const ordem = lista ? ordemLista() : { campo: 'titulo', desc: false };
    const arrumar = arr => ordenar(arr, ordem, favs);
    const out = [];
    const add = (id, nome, secao, arr, extra) => out.push({ id, nome, secao, jogos: arr, ...(extra || {}) });

    add('todos', 'Todos os jogos', 'Biblioteca', arrumar(jogos), { icone: 'todos' });
    const f = jogos.filter(g => favs.has(g.id) || g.favorito);
    if (f.length) add('favoritos', 'Favoritos', 'Biblioteca', arrumar(f), { icone: 'fav' });
    const rec = jogos.filter(ultimaVez).sort((a, b) => ultimaVez(b) - ultimaVez(a)).slice(0, 30);
    if (rec.length) add('recentes', 'Recentes', 'Biblioteca', lista ? arrumar(rec) : rec, { icone: 'recentes', semLetras: true });
    const nunca = jogos.filter(g => !ultimaVez(g) && !minutos(g));
    if (nunca.length) add('nunca', 'Nunca jogados', 'Biblioteca', arrumar(nunca), { icone: 'nunca' });

    const plats = new Map();
    for (const g of jogos) { const p = plataformaDe(g); if (!plats.has(p)) plats.set(p, []); plats.get(p).push(g); }
    const nomes = [...plats.keys()].sort((a, b) => (a === 'PC (Windows)' ? -1 : b === 'PC (Windows)' ? 1 : a.localeCompare(b, 'pt')));
    for (const p of nomes) add('plat:' + p, p, 'Plataformas', arrumar(plats.get(p)), { chave: p });

    const lojas = new Map();
    for (const g of jogos) if (g.kind !== 'rom') { const o = origemDe(g); if (!lojas.has(o)) lojas.set(o, []); lojas.get(o).push(g); }
    if (lojas.size > 1) {
      for (const o of [...lojas.keys()].sort((a, b) => a.localeCompare(b, 'pt'))) add('loja:' + o, o, 'Lojas', arrumar(lojas.get(o)), { chave: o });
    }
    return out;
  }

  /* ---------------- navegação pela posição na tela ---------------- */

  /**
   * Acha o vizinho na direção (dx, dy) pela posição real dos itens na tela.
   * Serve para qualquer grade (por letra, em colunas, mural horizontal…).
   */
  function vizinho(box, seletor, atual, dx, dy) {
    const itens = [...box.querySelectorAll(seletor)];
    const cur = itens.find(n => Number(n.dataset.i) === atual);
    if (!cur) return itens.length ? Number(itens[0].dataset.i) : 0;
    const r = cur.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    let melhor = null, nota_ = Infinity;
    for (const n of itens) {
      if (n === cur) continue;
      const q = n.getBoundingClientRect();
      const qx = q.left + q.width / 2, qy = q.top + q.height / 2;
      const ddx = qx - cx, ddy = qy - cy;
      let s;
      if (dx) {
        if (Math.sign(ddx) !== dx || Math.abs(ddx) < r.width * 0.4) continue;
        s = Math.abs(ddy) * 1000 + Math.abs(ddx);
      } else {
        if (Math.sign(ddy) !== dy || Math.abs(ddy) < r.height * 0.4) continue;
        s = Math.abs(ddy) * 1000 + Math.abs(ddx);
      }
      if (s < nota_) { nota_ = s; melhor = n; }
    }
    if (melhor) {
      // ← → no fim da fileira não pulam para outra linha lá longe
      if (dx && Math.abs(melhor.getBoundingClientRect().top - r.top) > r.height * 0.5) {
        return Math.max(0, Math.min(itens.length - 1, atual + dx));
      }
      return Number(melhor.dataset.i);
    }
    if (dx) return Math.max(0, Math.min(itens.length - 1, atual + dx));
    return atual;
  }

  function selecionar(ctx, i) {
    const g = ctx.grupos[ctx.coluna];
    if (!g || !g.jogos.length) return;
    ctx.linha = Math.max(0, Math.min(g.jogos.length - 1, i));
    ctx.desenhar();
    if (typeof Som !== 'undefined' && Som.mover) try { Som.mover(); } catch { /* sem som */ }
  }

  function trocarGrupo(ctx, d) {
    if (typeof Dashboards !== 'undefined') Dashboards.trocarGrupo(d);
  }

  function marcarSelecionado(box, seletor, ctx, bloco) {
    box.querySelectorAll(seletor + '.on').forEach(n => n.classList.remove('on'));
    const alvo = box.querySelector(`${seletor}[data-i="${ctx.linha}"]`);
    if (alvo) {
      alvo.classList.add('on');
      if (alvo.scrollIntoView) alvo.scrollIntoView({ block: bloco || 'nearest', inline: 'nearest', behavior: 'smooth' });
    }
    return alvo;
  }

  /* ---------------- pedaços comuns ---------------- */

  const ICONES = {
    todos: '<svg viewBox="0 0 24 24"><path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" fill="none" stroke="currentColor" stroke-width="1.7"/></svg>',
    fav: '<svg viewBox="0 0 24 24"><path d="M12 4.5l2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.6-4.8 2.6.9-5.4L4.2 10.2l5.4-.8z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>',
    recentes: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M12 7.5V12l3 2" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
    nunca: '<svg viewBox="0 0 24 24"><path d="M8 5.5v13l10-6.5z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>',
    caixas: '<svg viewBox="0 0 24 24"><path d="M4 4h6v8H4zM14 4h6v8h-6zM4 15h6v5H4zM14 15h6v5h-6z" fill="none" stroke="currentColor" stroke-width="1.7"/></svg>',
    lista: '<svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    seta: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  };
  const icone = nome => { const s = el('span', 'lb-ic'); s.innerHTML = ICONES[nome] || ''; return s; };

  function contagem(g) {
    const n = g ? g.jogos.length : 0;
    return `${n} ${n === 1 ? 'jogo' : 'jogos'}`;
  }

  /** Capa com fallback de iniciais (igual em todas as interfaces). */
  function capa(j, cls) {
    const d = el('div', cls);
    if (j.art) {
      const img = el('img');
      img.src = j.art; img.alt = ''; img.loading = 'lazy'; img.decoding = 'async';
      img.onerror = () => { img.remove(); d.classList.add('sem-capa'); d.appendChild(el('span', 'lb-iniciais', iniciais(j.title))); };
      d.appendChild(img);
    } else {
      d.classList.add('sem-capa');
      d.appendChild(el('span', 'lb-iniciais', iniciais(j.title)));
      d.appendChild(el('span', 'lb-nome-capa', j.title));
    }
    return d;
  }

  /** Quadro do vídeo: capa desfocada de fundo, a capa por cima e o vídeo quando chega. */
  function midia(j, cls) {
    const m = el('div', cls);
    m.dataset.id = j ? j.id : '';
    if (!j) return m;
    if (j.art) {
      const fundo = el('div', 'lb-midia-fundo');
      fundo.style.backgroundImage = urlCss(j.art);
      const img = el('img', 'lb-midia-capa');
      img.src = j.art; img.alt = '';
      m.append(fundo, img);
    } else {
      m.appendChild(el('span', 'lb-midia-iniciais', iniciais(j.title)));
    }
    return m;
  }

  /** Campos da ficha (como o painel de detalhes do LaunchBox). */
  function campos(j, favs) {
    const dl = el('dl', 'lb-campos');
    const linha = (rot, val) => { if (val == null || val === '') return; dl.append(el('dt', null, rot), el('dd', null, val)); };
    linha('Plataforma', plataformaDe(j));
    linha('Origem', origemDe(j));
    if (Array.isArray(j.genres) && j.genres.length) linha('Gêneros', j.genres.map(genero).join(', '));
    if (nota(j)) linha('Nota', String(nota(j)));
    linha('Tempo jogado', minutos(j) ? tempo(minutos(j)) : (ultimaVez(j) ? 'sem registro' : 'Nunca jogado'));
    if (j.playtime && j.playtime.sessions) linha('Sessões', String(j.playtime.sessions));
    linha('Última vez', ultimaVez(j) ? quando(ultimaVez(j)) : 'Nunca');
    if (j.addedAt) linha('Adicionado', new Date(j.addedAt).toLocaleDateString(LOCALE()));
    if (j.sizeOnDisk) linha('Tamanho', tamanho(j.sizeOnDisk));
    linha('Situação', j.problem ? j.problem : (j.installed === false ? 'Não instalado' : 'Pronto para jogar'));
    if (favs.has(j.id)) linha('Favorito', 'Sim');
    return dl;
  }

  function botoes(j, ctx, compacto) {
    const r = el('div', 'lb-acoes');
    const jogar = el('button', 'lb-jogar', 'Jogar');
    jogar.type = 'button';
    jogar.onclick = () => ctx.jogar(j);
    const ficha = el('button', 'lb-botao', compacto ? 'Ficha' : 'Ver ficha');
    ficha.type = 'button';
    ficha.onclick = () => ctx.ficha(j);
    const fav = el('button', 'lb-botao lb-fav' + (ctx.favoritos.has(j.id) ? ' on' : ''));
    fav.type = 'button';
    fav.title = ctx.favoritos.has(j.id) ? 'Tirar dos favoritos' : 'Favoritar';
    fav.innerHTML = ICONES.fav;
    fav.onclick = () => ctx.favoritar(j);
    r.append(jogar, ficha, fav);
    return r;
  }

  /* ==================================================================
   * LAUNCHBOX — área de trabalho (caixas / lista)
   * ================================================================== */

  function lateral(ctx) {
    const nav = el('nav', 'lb-lateral');
    let secao = '';
    ctx.grupos.forEach((g, i) => {
      if (g.secao !== secao) { secao = g.secao; nav.appendChild(el('h4', 'lb-secao', secao)); }
      const b = el('button', 'lb-plat' + (i === ctx.coluna ? ' on' : ''));
      b.type = 'button';
      b.dataset.g = String(i);
      if (g.icone) b.appendChild(icone(g.icone));
      else {
        const chip = el('span', 'lb-chip', iniciais(g.nome));
        chip.style.setProperty('--h', String(matiz(g.chave || g.nome)));
        b.appendChild(chip);
      }
      b.appendChild(el('span', 'lb-plat-nome', g.nome));
      b.appendChild(el('span', 'lb-plat-qtd', String(g.jogos.length)));
      b.onclick = () => { ctx.coluna = i; ctx.linha = 0; ctx.desenhar(); };
      nav.appendChild(b);
    });
    return nav;
  }

  function barraLB(ctx, modo) {
    const g = ctx.grupos[ctx.coluna];
    const barra = el('header', 'lb-barra');
    const tit = el('div', 'lb-barra-titulo');
    tit.append(el('b', null, g ? g.nome : '—'), el('span', 'lb-qtd', contagem(g)));
    const ferr = el('div', 'lb-ferramentas');
    if (modo === 'caixas') {
      const zoom = el('label', 'lb-zoom');
      zoom.title = 'Tamanho das capas';
      const r = el('input');
      r.type = 'range'; r.min = '96'; r.max = '240'; r.step = '4';
      r.value = guardado.get('zoom', '150');
      r.oninput = () => {
        guardado.set('zoom', r.value);
        const box = barra.closest('.dashboard');
        if (box) box.style.setProperty('--lb-caixa', r.value + 'px');
      };
      r.onkeydown = e => e.stopPropagation();       // as setas mexem no zoom, não na grade
      zoom.append(icone('caixas'), r);
      ferr.appendChild(zoom);
    }
    const visoes = el('div', 'lb-visoes');
    for (const v of ['caixas', 'lista']) {
      const b = el('button', 'lb-visao' + (v === modo ? ' on' : ''));
      b.type = 'button';
      b.title = v === 'caixas' ? 'Capas' : 'Lista';
      b.appendChild(icone(v));
      b.onclick = () => {
        guardado.set('visao.' + (ctx.skin ? ctx.skin.id : ctx.tipo), v);
        ctx.remontar();                  // a ordem dos grupos muda com a visão
        ctx.desenhar({ tudo: true });
      };
      visoes.appendChild(b);
    }
    ferr.appendChild(visoes);
    barra.append(tit, ferr);
    return barra;
  }

  function centroCaixas(ctx) {
    const g = ctx.grupos[ctx.coluna];
    const centro = el('div', 'lb-centro');
    if (!g || !g.jogos.length) { centro.appendChild(el('p', 'lb-vazio', 'Nenhum jogo aqui.')); return centro; }
    let letraAtual = null, grade = null;
    g.jogos.forEach((j, i) => {
      if (!g.semLetras) {
        const L = letra(j.title);
        if (L !== letraAtual) {
          letraAtual = L;
          centro.appendChild(el('h3', 'lb-letra', L));
          grade = el('div', 'lb-grade');
          centro.appendChild(grade);
        }
      } else if (!grade) { grade = el('div', 'lb-grade'); centro.appendChild(grade); }
      const b = el('button', 'lb-caixa' + (i === ctx.linha ? ' on' : ''));
      b.type = 'button';
      b.dataset.i = String(i);
      b.appendChild(capa(j, 'lb-capa'));
      if (ctx.favoritos.has(j.id)) b.appendChild(el('span', 'lb-estrela', '★'));
      b.appendChild(el('span', 'lb-legenda', j.title));
      b.onclick = ev => { if (i === ctx.linha) ctx.abrir(j, ev); else selecionar(ctx, i); };
      b.ondblclick = () => ctx.jogar(j);
      b.oncontextmenu = ev => { ev.preventDefault(); ctx.contexto(ev, j); };
      grade.appendChild(b);
    });
    return centro;
  }

  function celula(j, campo, favs) {
    switch (campo) {
      case 'fav': return favs.has(j.id) ? '★' : '';
      case 'titulo': return j.title;
      case 'plataforma': return plataformaDe(j);
      case 'origem': return origemDe(j);
      case 'generos': return (j.genres || []).slice(0, 3).map(genero).join(', ');
      case 'tempo': return minutos(j) ? tempo(minutos(j)) : '—';
      case 'ultima': return ultimaVez(j) ? quando(ultimaVez(j)) : 'Nunca';
      case 'nota': return nota(j) ? String(nota(j)) : '—';
      default: return '';
    }
  }

  function centroLista(ctx) {
    const g = ctx.grupos[ctx.coluna];
    const centro = el('div', 'lb-centro lb-centro-lista');
    const tabela = el('div', 'lb-tabela');
    tabela.setAttribute('role', 'grid');
    const ordem = ordemLista();
    const cab = el('div', 'lb-linha lb-cab');
    for (const c of COLUNAS_LISTA) {
      const b = el('button', 'lb-cel lb-col-' + c.campo + (ordem.campo === c.campo ? ' ordem ' + (ordem.desc ? 'desc' : 'asc') : ''), c.rotulo);
      b.type = 'button';
      if (c.titulo) b.title = c.titulo;
      if (c.semOrdem) b.disabled = true;
      else b.onclick = () => {
        const nova = ordem.campo === c.campo ? (ordem.desc ? 'asc' : 'desc') : (['tempo', 'ultima', 'nota', 'fav'].includes(c.campo) ? 'asc' : 'asc');
        guardado.set('ordem', c.campo + ':' + nova);
        ctx.remontar();
        ctx.desenhar({ tudo: true });
      };
      cab.appendChild(b);
    }
    tabela.appendChild(cab);
    (g ? g.jogos : []).forEach((j, i) => {
      const linha = el('div', 'lb-linha' + (i === ctx.linha ? ' on' : '') + (j.installed === false || j.problem ? ' apagado' : ''));
      linha.dataset.i = String(i);
      linha.setAttribute('role', 'row');
      for (const c of COLUNAS_LISTA) linha.appendChild(el('span', 'lb-cel lb-col-' + c.campo, celula(j, c.campo, ctx.favoritos)));
      linha.onclick = ev => { if (i === ctx.linha) ctx.abrir(j, ev); else selecionar(ctx, i); };
      linha.ondblclick = () => ctx.jogar(j);
      linha.oncontextmenu = ev => { ev.preventDefault(); ctx.contexto(ev, j); };
      tabela.appendChild(linha);
    });
    if (!g || !g.jogos.length) tabela.appendChild(el('p', 'lb-vazio', 'Nenhum jogo aqui.'));
    centro.appendChild(tabela);
    return centro;
  }

  function detalhesLB(ctx) {
    const j = ctx.jogoAtual();
    const d = el('aside', 'lb-detalhes');
    d.dataset.id = j ? j.id : '';
    if (!j) { d.appendChild(el('p', 'lb-vazio', 'Selecione um jogo')); return d; }
    d.appendChild(midia(j, 'lb-midia'));
    const corpo = el('div', 'lb-det-corpo');
    corpo.appendChild(el('h2', 'lb-det-titulo', j.title));
    corpo.appendChild(el('p', 'lb-det-sub', `${plataformaDe(j)} · ${origemDe(j)}`));
    corpo.appendChild(botoes(j, ctx));
    corpo.appendChild(campos(j, ctx.favoritos));
    d.appendChild(corpo);
    return d;
  }

  function desenharLB(box, ctx) {
    const modo = modoDe(ctx);
    box.classList.add('lb', 'lb-modo-' + modo);
    box.style.setProperty('--lb-caixa', guardado.get('zoom', '150') + 'px');
    aplicarCor(box, ctx);
    const corpo = el('div', 'lb-corpo');
    corpo.append(lateral(ctx), modo === 'lista' ? centroLista(ctx) : centroCaixas(ctx), detalhesLB(ctx));
    box.append(barraLB(ctx, modo), corpo);
    requestAnimationFrame(() => marcarSelecionado(box, modo === 'lista' ? '.lb-linha[data-i]' : '.lb-caixa', ctx, 'center'));
  }

  function atualizarLB(box, ctx) {
    const modo = modoDe(ctx);
    marcarSelecionado(box, modo === 'lista' ? '.lb-linha[data-i]' : '.lb-caixa', ctx);
    const j = ctx.jogoAtual();
    const velho = box.querySelector('.lb-detalhes');
    if (velho && velho.dataset.id !== (j ? j.id : '')) velho.replaceWith(detalhesLB(ctx));
  }

  function moverLB(dc, dl, ctx) {
    const box = document.getElementById('dashboard');
    if (!box) return;
    if (modoDe(ctx) === 'lista') {
      if (dl) selecionar(ctx, ctx.linha + dl);
      else if (dc) trocarGrupo(ctx, dc);
      return;
    }
    selecionar(ctx, vizinho(box, '.lb-caixa', ctx.linha, dc, dl));
  }

  function teclaLB(e, ctx) {
    const g = ctx.grupos[ctx.coluna];
    if (!g) return false;
    if (e.key === 'Home') { selecionar(ctx, 0); return true; }
    if (e.key === 'End') { selecionar(ctx, g.jogos.length - 1); return true; }
    return false;
  }

  /* ==================================================================
   * BIG BOX — modo TV (parede / roda vertical / lista com detalhes)
   * ================================================================== */

  function topoBB(ctx) {
    const g = ctx.grupos[ctx.coluna];
    const t = el('header', 'bb-topo');
    const ant = el('button', 'bb-seta');
    ant.type = 'button'; ant.title = 'Plataforma anterior (Q / LB)'; ant.innerHTML = ICONES.seta;
    ant.onclick = () => trocarGrupo(ctx, -1);
    const prox = el('button', 'bb-seta dir');
    prox.type = 'button'; prox.title = 'Próxima plataforma (E / RB)'; prox.innerHTML = ICONES.seta;
    prox.onclick = () => trocarGrupo(ctx, 1);
    const nome = el('div', 'bb-grupo');
    nome.append(el('b', null, g ? g.nome : '—'), el('span', null, g ? `${ctx.linha + 1} de ${g.jogos.length}` : ''));
    t.append(ant, nome, prox);
    return t;
  }

  function rodapeBB(ctx, comTitulo) {
    const j = ctx.jogoAtual();
    const r = el('footer', 'bb-rodape');
    if (comTitulo && j) {
      const info = el('div', 'bb-rodape-info');
      info.appendChild(el('b', 'bb-rodape-titulo', j.title));
      const meta = [plataformaDe(j), minutos(j) ? tempo(minutos(j)) + ' jogadas' : (ultimaVez(j) ? '' : 'nunca jogado'), ultimaVez(j) ? 'última vez ' + quando(ultimaVez(j)) : ''].filter(Boolean);
      info.appendChild(el('span', 'bb-rodape-meta', meta.join('  ·  ')));
      r.appendChild(info);
    }
    const dicas = el('div', 'bb-dicas');
    for (const [k, t] of [['Enter', 'Ficha'], ['Shift+Enter', 'Jogar'], ['Q / E', 'Plataforma']]) {
      const s = el('span');
      s.append(el('kbd', null, k), document.createTextNode(' ' + t));
      dicas.appendChild(s);
    }
    r.appendChild(dicas);
    return r;
  }

  function fundoBB(ctx) {
    const j = ctx.jogoAtual();
    const f = el('div', 'bb-fundo');
    f.dataset.id = j ? j.id : '';
    if (j && j.art) f.style.setProperty('--bb-arte', urlCss(j.art));
    return f;
  }

  function trocarFundo(box, ctx) {
    const j = ctx.jogoAtual();
    const f = box.querySelector('.bb-fundo');
    if (!f || f.dataset.id === (j ? j.id : '')) return;
    f.dataset.id = j ? j.id : '';
    if (j && j.art) f.style.setProperty('--bb-arte', urlCss(j.art)); else f.style.removeProperty('--bb-arte');
  }

  function atualizarTopo(box, ctx) {
    const g = ctx.grupos[ctx.coluna];
    const s = box.querySelector('.bb-grupo span');
    if (s && g) s.textContent = `${ctx.linha + 1} de ${g.jogos.length}`;
  }

  /* ----- parede ----- */
  function desenharParede(box, ctx) {
    box.classList.add('bb', 'bb-parede');
    aplicarCor(box, ctx);
    const g = ctx.grupos[ctx.coluna];
    const mural = el('div', 'bb-mural');
    (g ? g.jogos : []).forEach((j, i) => {
      const b = el('button', 'bb-tile' + (i === ctx.linha ? ' on' : ''));
      b.type = 'button';
      b.dataset.i = String(i);
      b.appendChild(capa(j, 'bb-capa'));
      b.onclick = ev => { if (i === ctx.linha) ctx.abrir(j, ev); else selecionar(ctx, i); };
      b.ondblclick = () => ctx.jogar(j);
      b.oncontextmenu = ev => { ev.preventDefault(); ctx.contexto(ev, j); };
      mural.appendChild(b);
    });
    box.append(fundoBB(ctx), topoBB(ctx), mural, rodapeBB(ctx, true));
    requestAnimationFrame(() => marcarSelecionado(box, '.bb-tile', ctx, 'center'));
  }
  function atualizarParede(box, ctx) {
    marcarSelecionado(box, '.bb-tile', ctx);
    trocarFundo(box, ctx);
    atualizarTopo(box, ctx);
    const r = box.querySelector('.bb-rodape');
    if (r) r.replaceWith(rodapeBB(ctx, true));
  }

  /* ----- roda vertical ----- */
  function rodaVertical(ctx) {
    const g = ctx.grupos[ctx.coluna];
    const roda = el('div', 'bb-roda-v');
    if (!g || !g.jogos.length) return roda;
    const n = g.jogos.length;
    const circular = n > 9;
    for (let d = -5; d <= 5; d++) {
      let i = ctx.linha + d;
      if (circular) i = (i + n) % n; else if (i < 0 || i >= n) continue;
      const j = g.jogos[i];
      const b = el('button', 'bb-roda-item' + (d === 0 ? ' on' : ''));
      b.type = 'button';
      b.dataset.i = String(i);
      b.style.setProperty('--d', String(d));
      b.style.setProperty('--ad', String(Math.abs(d)));
      b.appendChild(el('span', 'bb-logo', j.title));
      b.onclick = ev => { if (d === 0) ctx.abrir(j, ev); else selecionar(ctx, i); };
      b.oncontextmenu = ev => { ev.preventDefault(); ctx.contexto(ev, j); };
      roda.appendChild(b);
    }
    return roda;
  }
  function infoRoda(ctx) {
    const j = ctx.jogoAtual();
    const info = el('div', 'bb-info');
    info.dataset.id = j ? j.id : '';
    if (!j) return info;
    info.appendChild(capa(j, 'bb-info-capa'));
    const txt = el('div', 'bb-info-txt');
    txt.appendChild(el('h2', null, j.title));
    const chips = el('div', 'bb-chips');
    const add = t => { if (t) chips.appendChild(el('span', 'bb-chip', t)); };
    add(plataformaDe(j)); add(origemDe(j));
    (j.genres || []).slice(0, 2).forEach(k => add(genero(k)));
    if (nota(j)) add('Nota ' + nota(j));
    txt.appendChild(chips);
    txt.appendChild(el('p', 'bb-info-meta', [
      minutos(j) ? `${tempo(minutos(j))} jogadas` : (ultimaVez(j) ? '' : 'Nunca jogado'),
      ultimaVez(j) ? `última vez ${quando(ultimaVez(j))}` : ''
    ].filter(Boolean).join(' · ')));
    txt.appendChild(botoes(j, ctx, true));
    info.appendChild(txt);
    return info;
  }
  function desenharRoda(box, ctx) {
    box.classList.add('bb', 'bb-roda');
    aplicarCor(box, ctx);
    const esq = el('section', 'bb-esq');
    esq.append(midia(ctx.jogoAtual(), 'bb-tela'), infoRoda(ctx));
    box.append(fundoBB(ctx), topoBB(ctx), esq, rodaVertical(ctx), rodapeBB(ctx, false));
  }
  function atualizarRoda(box, ctx) {
    const j = ctx.jogoAtual();
    const roda = box.querySelector('.bb-roda-v');
    if (roda) roda.replaceWith(rodaVertical(ctx));
    const tela = box.querySelector('.bb-tela');
    if (tela && tela.dataset.id !== (j ? j.id : '')) tela.replaceWith(midia(j, 'bb-tela'));
    const info = box.querySelector('.bb-info');
    if (info && info.dataset.id !== (j ? j.id : '')) info.replaceWith(infoRoda(ctx));
    trocarFundo(box, ctx);
    atualizarTopo(box, ctx);
  }

  /* ----- lista com detalhes ----- */
  function listaTexto(ctx) {
    const g = ctx.grupos[ctx.coluna];
    const l = el('div', 'bb-lista');
    (g ? g.jogos : []).forEach((j, i) => {
      const b = el('button', 'bb-lista-item' + (i === ctx.linha ? ' on' : ''));
      b.type = 'button';
      b.dataset.i = String(i);
      b.appendChild(el('span', 'bb-lista-nome', j.title));
      b.appendChild(el('span', 'bb-lista-plat', ctx.favoritos.has(j.id) ? '★ ' + plataformaDe(j) : plataformaDe(j)));
      b.onclick = ev => { if (i === ctx.linha) ctx.abrir(j, ev); else selecionar(ctx, i); };
      b.ondblclick = () => ctx.jogar(j);
      b.oncontextmenu = ev => { ev.preventDefault(); ctx.contexto(ev, j); };
      l.appendChild(b);
    });
    return l;
  }
  function fichaTexto(ctx) {
    const j = ctx.jogoAtual();
    const f = el('div', 'bb-ficha');
    f.dataset.id = j ? j.id : '';
    if (!j) return f;
    f.appendChild(capa(j, 'bb-ficha-capa'));
    const txt = el('div', 'bb-ficha-txt');
    txt.appendChild(el('h2', null, j.title));
    txt.appendChild(botoes(j, ctx, true));
    txt.appendChild(campos(j, ctx.favoritos));
    f.appendChild(txt);
    return f;
  }
  function desenharTexto(box, ctx) {
    box.classList.add('bb', 'bb-texto');
    aplicarCor(box, ctx);
    const dir = el('section', 'bb-dir');
    dir.append(midia(ctx.jogoAtual(), 'bb-tela'), fichaTexto(ctx));
    box.append(fundoBB(ctx), topoBB(ctx), listaTexto(ctx), dir, rodapeBB(ctx, false));
    requestAnimationFrame(() => marcarSelecionado(box, '.bb-lista-item', ctx, 'center'));
  }
  function atualizarTexto(box, ctx) {
    const j = ctx.jogoAtual();
    marcarSelecionado(box, '.bb-lista-item', ctx, 'center');
    const tela = box.querySelector('.bb-tela');
    if (tela && tela.dataset.id !== (j ? j.id : '')) tela.replaceWith(midia(j, 'bb-tela'));
    const ficha = box.querySelector('.bb-ficha');
    if (ficha && ficha.dataset.id !== (j ? j.id : '')) ficha.replaceWith(fichaTexto(ctx));
    trocarFundo(box, ctx);
    atualizarTopo(box, ctx);
  }

  /** Roda e lista: ↑ ↓ andam (dão a volta), ← → trocam de plataforma. */
  function moverVertical(dc, dl, ctx) {
    const g = ctx.grupos[ctx.coluna];
    if (!g || !g.jogos.length) return;
    if (dc) { trocarGrupo(ctx, dc); return; }
    const n = g.jogos.length;
    selecionar(ctx, (ctx.linha + dl + n) % n);
  }

  /* ---------------- registro ---------------- */

  const comum = { grupos, tecla: teclaLB };
  Dashboards.registrarTipo('lb-caixas', {
    ...comum, nome: 'LaunchBox (capas)', som: 'clique',
    desc: 'Plataformas à esquerda, capas por letra no meio e detalhes com vídeo à direita.',
    desenhar: desenharLB, atualizar: atualizarLB, mover: moverLB,
    videoAlvo: box => box.querySelector('.lb-midia')
  });
  Dashboards.registrarTipo('lb-lista', {
    ...comum, nome: 'LaunchBox (lista)', som: 'clique',
    desc: 'Tabela com colunas que ordenam (clique no título da coluna) e detalhes ao lado.',
    desenhar: desenharLB, atualizar: atualizarLB, mover: moverLB,
    videoAlvo: box => box.querySelector('.lb-midia')
  });
  Dashboards.registrarTipo('bb-parede', {
    ...comum, nome: 'Big Box (parede)', som: 'deslizar',
    desc: 'Mural de capas em três fileiras sobre o vídeo do jogo. Setas andam pelo mural.',
    desenhar: desenharParede, atualizar: atualizarParede,
    mover: (dc, dl, ctx) => { const box = document.getElementById('dashboard'); if (box) selecionar(ctx, vizinho(box, '.bb-tile', ctx.linha, dc, dl)); },
    videoAlvo: box => box.querySelector('.bb-fundo')
  });
  Dashboards.registrarTipo('bb-roda', {
    ...comum, nome: 'Big Box (roda vertical)', som: 'deslizar',
    desc: 'Roda de títulos à direita, vídeo grande e ficha à esquerda. ↑ ↓ giram, ← → trocam a plataforma.',
    desenhar: desenharRoda, atualizar: atualizarRoda, mover: moverVertical,
    videoAlvo: box => box.querySelector('.bb-tela')
  });
  Dashboards.registrarTipo('bb-texto', {
    ...comum, nome: 'Big Box (lista com detalhes)', som: 'clique',
    desc: 'Lista de títulos à esquerda, vídeo e ficha à direita. ↑ ↓ andam, ← → trocam a plataforma.',
    desenhar: desenharTexto, atualizar: atualizarTexto, mover: moverVertical,
    videoAlvo: box => box.querySelector('.bb-tela')
  });

  // para testes e para a prévia no seletor de skins
  window.LaunchBox = { grupos, plataformaDe, origemDe, matiz, vizinho };
})();
