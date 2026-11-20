'use strict';
/**
 * Arcade Hub — abertura do Modo TV.
 *
 *  1. O logo aparece como um MOLDE: o quadrado do ícone com o encaixe vazio do controle.
 *  2. O controle cai do alto, gira, quica e encaixa no molde (brilho na borda).
 *  3. O encaixe solta um PULSO que se espalha pela tela. Cada capa de jogo que o
 *     pulso alcança acende e é ligada ao logo por um fio de energia; um ponto de
 *     luz corre pelo fio até o logo.
 *  4. Entra o nome "ARCADE HUB" e a cena se abre para o Modo TV.
 *
 * Qualquer tecla, clique ou botão do controle pula. Com "reduzir movimento"
 * ligado no Windows, mostra só o logo montado por um instante.
 *
 * Uso: await Intro.tocar({ capas: [{ src, titulo }] })
 */
const Intro = (() => {
  const NS = 'http://www.w3.org/2000/svg';

  // Geometria do ícone (assets/icon.png), num quadro de 1024×1024.
  const SILHUETA = `
    <rect x="209" y="320" width="606" height="340" rx="160" ry="160"/>
    <ellipse cx="295" cy="625" rx="116" ry="145"/>
    <ellipse cx="729" cy="625" rx="116" ry="145"/>`;
  const DETALHES = `
    <rect x="288" y="396" width="64" height="192" rx="14" fill="#0a0f1a"/>
    <rect x="224" y="460" width="192" height="64" rx="14" fill="#0a0f1a"/>
    <rect x="458" y="486" width="38" height="16" rx="8" fill="#0a0f1a"/>
    <rect x="516" y="486" width="38" height="16" rx="8" fill="#0a0f1a"/>
    <circle cx="694" cy="418" r="34" fill="#0a0f1a"/>
    <circle cx="620" cy="492" r="34" fill="#0a0f1a"/>
    <circle cx="694" cy="566" r="34" fill="#0a0f1a"/>
    <circle cx="768" cy="492" r="34" fill="#e879f9"/>`;

  /** O quadrado com o encaixe vazio (o molde). */
  function svgMolde() {
    return `
    <svg viewBox="0 0 1024 1024" class="intro-svg" aria-hidden="true">
      <defs>
        <linearGradient id="ih-tile" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#0b1120"/><stop offset="1" stop-color="#1b3346"/>
        </linearGradient>
        <linearGradient id="ih-cav" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#02050a"/><stop offset="1" stop-color="#0a1622"/>
        </linearGradient>
        <filter id="ih-borda" x="-20%" y="-20%" width="140%" height="140%">
          <feMorphology in="SourceAlpha" operator="dilate" radius="9" result="d"/>
          <feComposite in="d" in2="SourceAlpha" operator="out" result="anel"/>
          <feFlood flood-color="#22d3ee"/>
          <feComposite in2="anel" operator="in" result="cor"/>
          <feGaussianBlur in="cor" stdDeviation="6" result="brilho"/>
          <feMerge><feMergeNode in="brilho"/><feMergeNode in="cor"/></feMerge>
        </filter>
        <filter id="ih-sombra-int" x="-10%" y="-10%" width="120%" height="120%">
          <feOffset dy="14"/><feGaussianBlur stdDeviation="10" result="s"/>
          <feComposite in="SourceAlpha" in2="s" operator="out" result="borda"/>
          <feFlood flood-color="#000" flood-opacity=".85"/>
          <feComposite in2="borda" operator="in" result="sombra"/>
          <feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="sombra"/></feMerge>
        </filter>
      </defs>
      <rect width="1024" height="1024" rx="200" fill="url(#ih-tile)"/>
      <g class="intro-cavidade" fill="url(#ih-cav)" filter="url(#ih-sombra-int)">${SILHUETA}</g>
      <g class="intro-borda" fill="#000" filter="url(#ih-borda)">${SILHUETA}</g>
    </svg>`;
  }

  /** O controle solto (mesmo quadro, então encaixa pixel a pixel no molde). */
  function svgControle() {
    return `
    <svg viewBox="0 0 1024 1024" class="intro-svg" aria-hidden="true">
      <g fill="#22d3ee">${SILHUETA}</g>
      <g>${DETALHES}</g>
    </svg>`;
  }

  const el = (tag, cls) => { const n = document.createElement(tag); if (cls) n.className = cls; return n; };
  const espera = ms => new Promise(r => setTimeout(r, ms));

  /** Capa de reserva: iniciais num degradê (quando há poucos jogos com capa). */
  function capaReserva(titulo, i) {
    const d = el('div', 'intro-capa-reserva');
    const cores = [['#0ea5e9', '#6366f1'], ['#f472b6', '#8b5cf6'], ['#22c55e', '#0ea5e9'], ['#f59e0b', '#ef4444'], ['#14b8a6', '#3b82f6']][i % 5];
    d.style.background = `linear-gradient(150deg, ${cores[0]}, ${cores[1]})`;
    d.textContent = (titulo || '?').split(/\s+/).map(p => p[0]).join('').slice(0, 2).toUpperCase();
    return d;
  }

  /** Lugares das capas: dois anéis em volta do logo, fora da área do logo e do nome. */
  function lugares(W, H, C, L, n) {
    const out = [];
    const hBase = Math.min(H * 0.21, 210);
    const proibido = [
      { x: C.x - L * 0.75, y: C.y - L * 0.75, w: L * 1.5, h: L * 1.5 + 90 },     // logo + nome
    ];
    const cabe = r => r.x > 14 && r.y > 14 && r.x + r.w < W - 14 && r.y + r.h < H - 14
      && proibido.every(p => r.x + r.w < p.x || r.x > p.x + p.w || r.y + r.h < p.y || r.y > p.y + p.h)
      && out.every(o => r.x + r.w + 10 < o.x || r.x > o.x + o.w + 10 || r.y + r.h + 10 < o.y || r.y > o.y + o.h + 10);
    const aneis = [
      { qtd: 6, rx: W * 0.26, ry: H * 0.31, desloc: -60, esc: 1 },
      { qtd: 8, rx: W * 0.41, ry: H * 0.39, desloc: -78, esc: 0.82 },
      { qtd: 10, rx: W * 0.47, ry: H * 0.46, desloc: -70, esc: 0.66 }
    ];
    for (const a of aneis) {
      for (let k = 0; k < a.qtd && out.length < n; k++) {
        const ang = ((a.desloc + (360 / a.qtd) * k) * Math.PI) / 180;
        const h = hBase * a.esc;
        const w = h * (2 / 3);
        const cx = C.x + Math.cos(ang) * a.rx;
        const cy = C.y + Math.sin(ang) * a.ry;
        const r = { x: cx - w / 2, y: cy - h / 2, w, h, esc: a.esc };
        if (cabe(r)) out.push(r);
      }
    }
    return out;
  }

  /** Ponto onde a reta do centro do logo até (x,y) cruza a borda do quadrado do logo. */
  function bordaDoLogo(C, L, x, y) {
    const dx = x - C.x, dy = y - C.y;
    const t = (L * 0.5) / Math.max(Math.abs(dx), Math.abs(dy), 1);
    return { x: C.x + dx * t, y: C.y + dy * t };
  }
  /** Ponto onde a reta do centro da capa até o logo sai da capa. */
  function bordaDaCapa(r, C) {
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    const dx = C.x - cx, dy = C.y - cy;
    const t = Math.min((r.w / 2) / Math.max(Math.abs(dx), 1), (r.h / 2) / Math.max(Math.abs(dy), 1));
    return { x: cx + dx * t, y: cy + dy * t };
  }

  async function tocar(opts) {
    const o = opts || {};
    const som = typeof Som !== 'undefined' && o.som !== false ? Som : null;
    const reduzir = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const raiz = el('div', 'intro');
    raiz.setAttribute('role', 'presentation');
    document.body.appendChild(raiz);
    const W = raiz.clientWidth || innerWidth;
    const H = raiz.clientHeight || innerHeight;
    const L = Math.max(160, Math.min(330, Math.min(W, H) * 0.3));
    const C = { x: W / 2, y: H / 2 - H * 0.035 };

    // camada dos fios e do pulso
    const rede = document.createElementNS(NS, 'svg');
    rede.setAttribute('class', 'intro-rede');
    rede.setAttribute('viewBox', `0 0 ${W} ${H}`);
    rede.innerHTML = `<defs>
      <linearGradient id="ih-fio" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${W}" y2="0">
        <stop offset="0" stop-color="#e879f9"/><stop offset=".5" stop-color="#22d3ee"/><stop offset="1" stop-color="#e879f9"/>
      </linearGradient></defs>`;
    raiz.appendChild(rede);

    // capas
    const capas = (o.capas || []).slice(0, 18);
    const slots = lugares(W, H, C, L, Math.max(capas.length, 8));
    const itens = slots.map((r, i) => {
      const c = capas[i] || { titulo: ['Arcade', 'Hub', 'Play', 'Start', 'Retro', 'Pixel', 'Boss', 'Quest'][i % 8] };
      const box = el('div', 'intro-capa');
      Object.assign(box.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' });
      if (c.src) {
        const img = el('img');
        img.src = c.src;
        img.alt = '';
        img.decoding = 'async';
        img.onerror = () => { img.replaceWith(capaReserva(c.titulo, i)); };
        box.appendChild(img);
      } else {
        box.appendChild(capaReserva(c.titulo, i));
      }
      raiz.appendChild(box);
      const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
      return { box, r, dist: Math.hypot(cx - C.x, cy - C.y) - Math.min(r.w, r.h) * 0.4 };
    });

    // logo: molde + controle por cima
    const logo = el('div', 'intro-logo');
    Object.assign(logo.style, { width: L + 'px', height: L + 'px', left: (C.x - L / 2) + 'px', top: (C.y - L / 2) + 'px' });
    const molde = el('div', 'intro-molde');
    molde.innerHTML = svgMolde();
    const controle = el('div', 'intro-controle');
    controle.innerHTML = svgControle();
    logo.append(molde, controle);
    raiz.appendChild(logo);
    const borda = molde.querySelector('.intro-borda');

    // nome
    const nome = el('div', 'intro-nome');
    nome.innerHTML = 'ARCADE <b>HUB</b>';
    nome.style.top = (C.y + L / 2 + Math.max(22, L * 0.12)) + 'px';
    raiz.appendChild(nome);

    // ---------- pular ----------
    let pulou = false;
    let resolver;
    const fim = new Promise(r => { resolver = r; });
    const timers = [];
    const depois = (ms, fn) => timers.push(setTimeout(fn, ms));
    const encerrar = async rapido => {
      if (raiz.dataset.saindo) return;
      raiz.dataset.saindo = '1';
      timers.forEach(clearTimeout);
      removerOuvintes();
      const d = rapido ? 260 : 650;
      logo.animate([{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(1.14)', opacity: 0 }], { duration: d, easing: 'cubic-bezier(.5,0,.75,0)', fill: 'forwards' });
      nome.animate([{ opacity: getComputedStyle(nome).opacity }, { opacity: 0, transform: 'translate(-50%, 10px)' }], { duration: d * 0.8, fill: 'forwards' });
      for (const it of itens) it.box.animate([{ opacity: getComputedStyle(it.box).opacity }, { opacity: 0, transform: 'scale(.9)' }], { duration: d * 0.7, fill: 'forwards' });
      rede.animate([{ opacity: 1 }, { opacity: 0 }], { duration: d * 0.6, fill: 'forwards' });
      await raiz.animate([{ opacity: 1 }, { opacity: 0 }], { duration: d, delay: rapido ? 0 : 200, easing: 'ease-in', fill: 'forwards' }).finished.catch(() => {});
      raiz.remove();
      resolver();
    };
    const pular = () => { if (!pulou) { pulou = true; encerrar(true); } };
    const onKey = e => { e.preventDefault(); pular(); };
    window.addEventListener('keydown', onKey, true);
    raiz.addEventListener('pointerdown', pular);
    // controle: só conta botão apertado DEPOIS que a abertura começou
    const jaApertados = new Set();
    try { for (const p of navigator.getGamepads ? navigator.getGamepads() : []) if (p) p.buttons.forEach((b, i) => b.pressed && jaApertados.add(p.index + ':' + i)); } catch { /* sem gamepad */ }
    let raf = 0;
    const olharControle = () => {
      try {
        for (const p of navigator.getGamepads ? navigator.getGamepads() : []) {
          if (!p) continue;
          p.buttons.forEach((b, i) => {
            const k = p.index + ':' + i;
            if (b.pressed && !jaApertados.has(k)) pular();
            if (!b.pressed) jaApertados.delete(k);
          });
        }
      } catch { /* noop */ }
      raf = requestAnimationFrame(olharControle);
    };
    raf = requestAnimationFrame(olharControle);
    function removerOuvintes() {
      window.removeEventListener('keydown', onKey, true);
      cancelAnimationFrame(raf);
    }

    // ---------- movimento reduzido: só o logo montado ----------
    if (reduzir) {
      controle.style.opacity = 1;
      nome.style.opacity = 1;
      itens.forEach(it => { it.box.style.opacity = 0.9; });
      depois(900, () => encerrar(false));
      return fim;
    }

    // ---------- 1. o molde aparece ----------
    logo.animate([{ opacity: 0, transform: 'scale(.86)' }, { opacity: 1, transform: 'scale(1)' }],
      { duration: 520, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' });
    borda.animate([{ opacity: 0.15 }, { opacity: 0.55 }, { opacity: 0.25 }], { duration: 900, iterations: Infinity, easing: 'ease-in-out' });
    itens.forEach((it, i) => it.box.animate([{ opacity: 0 }, { opacity: 0.16 }], { duration: 700, delay: 150 + i * 30, fill: 'both' }));

    // ---------- 2. o controle cai e encaixa ----------
    const QUEDA = 420, DUR = 1000;
    depois(QUEDA, () => som && som.queda());
    controle.animate([
      { transform: `translateY(${-(C.y + L * 0.62)}px) rotate(-24deg) scale(1.04)`, opacity: 1, offset: 0 },
      { transform: 'translateY(0) rotate(4deg) scale(1.04)', offset: 0.72, easing: 'ease-out' },   // toca o molde
      { transform: `translateY(${-L * 0.07}px) rotate(-2deg) scale(1.02)`, offset: 0.85, easing: 'ease-in' }, // quique
      { transform: 'translateY(0) rotate(0deg) scale(1)', offset: 1 }
    ], { duration: DUR, delay: QUEDA, easing: 'cubic-bezier(.42,0,.78,.45)', fill: 'both' });
    // rastro de luz atrás do controle enquanto cai
    const rastro = el('div', 'intro-rastro');
    logo.appendChild(rastro);
    rastro.animate([
      { opacity: 0, transform: `translateY(${-(C.y + L * 0.62)}px) scaleY(.4)` },
      { opacity: 0.8, transform: `translateY(${-L * 0.6}px) scaleY(1)`, offset: 0.6 },
      { opacity: 0, transform: 'translateY(-10px) scaleY(.2)', offset: 0.75 },
      { opacity: 0, transform: 'translateY(0) scaleY(.2)' }
    ], { duration: DUR, delay: QUEDA, easing: 'cubic-bezier(.42,0,.78,.45)', fill: 'both' });

    const ENCAIXE = QUEDA + DUR;
    depois(QUEDA + DUR * 0.72, () => som && som.encaixe());
    depois(ENCAIXE, () => {
      if (pulou) return;
      // brilho do encaixe + tremidinha
      borda.getAnimations().forEach(a => a.cancel());
      borda.animate([{ opacity: 1 }, { opacity: 1, offset: 0.25 }, { opacity: 0.35 }], { duration: 900, fill: 'forwards' });
      logo.animate([
        { transform: 'translate(0,0)' }, { transform: 'translate(-3px,2px)' }, { transform: 'translate(3px,-1px)' },
        { transform: 'translate(-1px,1px)' }, { transform: 'translate(0,0)' }
      ], { duration: 220 });
      logo.classList.add('aceso');
      pulso();
    });

    // ---------- 3. o pulso liga os jogos ----------
    function pulso() {
      som && som.pulso();
      const R = Math.max(...[[0, 0], [W, 0], [0, H], [W, H]].map(([x, y]) => Math.hypot(x - C.x, y - C.y)));
      const P = 1500;                                       // tempo para o pulso atravessar a tela
      for (const [atraso, cls] of [[0, ''], [140, ' fino']]) {
        const anel = el('div', 'intro-pulso' + cls);
        Object.assign(anel.style, { width: 2 * R + 'px', height: 2 * R + 'px', left: (C.x - R) + 'px', top: (C.y - R) + 'px' });
        raiz.insertBefore(anel, logo);
        anel.animate([{ transform: 'scale(.04)', opacity: 0.95 }, { transform: 'scale(1)', opacity: 0 }],
          { duration: P, delay: atraso, easing: 'linear', fill: 'both' });
      }
      const ordem = [...itens].sort((a, b) => a.dist - b.dist);
      ordem.forEach((it, idx) => {
        const t = Math.max(0, (it.dist / R) * P);
        depois(t, () => conectar(it, idx));
      });
      const ultimo = ordem.length ? (ordem[ordem.length - 1].dist / R) * P : 0;
      depois(Math.min(ultimo + 520, P + 200), mostrarNome);
    }

    function conectar(it, idx) {
      if (pulou) return;
      const { box, r } = it;
      box.classList.add('ligada');
      box.getAnimations().forEach(a => a.cancel());
      box.animate([
        { opacity: 0.16, transform: 'scale(.94)', filter: 'grayscale(1) brightness(.6)' },
        { opacity: 1, transform: 'scale(1.08)', filter: 'grayscale(0) brightness(1.25)', offset: 0.45 },
        { opacity: 1, transform: 'scale(1)', filter: 'grayscale(0) brightness(1)' }
      ], { duration: 520, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' });
      som && som.conectar(idx);

      // fio de energia: da capa até a borda do logo, com uma leve curva
      const a = bordaDaCapa(r, C);
      const b = bordaDoLogo(C, L, r.x + r.w / 2, r.y + r.h / 2);
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const nx = -(b.y - a.y), ny = b.x - a.x;
      const k = 0.12 * (idx % 2 ? 1 : -1);
      const d = `M ${a.x} ${a.y} Q ${mx + nx * k} ${my + ny * k} ${b.x} ${b.y}`;
      const fio = document.createElementNS(NS, 'path');
      fio.setAttribute('d', d);
      fio.setAttribute('class', 'intro-fio');
      rede.appendChild(fio);
      const len = fio.getTotalLength();
      fio.style.strokeDasharray = len;
      fio.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }], { duration: 380, easing: 'ease-out', fill: 'forwards' });

      // ponto de luz correndo pelo fio até o logo
      const ponto = el('div', 'intro-ponto');
      ponto.style.offsetPath = `path('${d}')`;
      raiz.appendChild(ponto);
      ponto.animate([{ offsetDistance: '0%', opacity: 0 }, { opacity: 1, offset: 0.15 }, { offsetDistance: '100%', opacity: 1 }],
        { duration: 520, delay: 220, easing: 'cubic-bezier(.6,0,.9,.6)', fill: 'forwards' })
        .finished.then(() => {
          ponto.remove();
          if (pulou) return;
          logo.animate([{ filter: 'drop-shadow(0 0 0 rgba(34,211,238,0))' }, { filter: 'drop-shadow(0 0 26px rgba(34,211,238,.85))' }, { filter: 'drop-shadow(0 0 10px rgba(34,211,238,.35))' }],
            { duration: 420, easing: 'ease-out' });
        }).catch(() => {});
    }

    // ---------- 4. nome e saída ----------
    function mostrarNome() {
      if (pulou) return;
      som && som.acorde();
      nome.animate([
        { opacity: 0, letterSpacing: '0.9em', filter: 'blur(6px)' },
        { opacity: 1, letterSpacing: '0.34em', filter: 'blur(0)' }
      ], { duration: 700, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' });
      // os fios ficam "vivos": tracejado correndo em direção ao logo
      rede.querySelectorAll('.intro-fio').forEach(f => {
        f.getAnimations().forEach(x => x.cancel());
        f.style.strokeDasharray = '5 9';
        f.animate([{ strokeDashoffset: 0 }, { strokeDashoffset: -28 }], { duration: 520, iterations: Infinity });
      });
      depois(1350, () => encerrar(false));
    }

    // segurança: nunca prende a tela
    depois(9000, () => encerrar(true));
    return fim;
  }

  return { tocar };
})();
