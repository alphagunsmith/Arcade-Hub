/* ================= Arcade Hub — Rondel =================
 *
 * Layout em que os jogos giram em roda: o selecionado fica no CENTRO, os
 * vizinhos abrem para os lados e encolhem conforme se afastam. Ficar 2 s com um
 * jogo no centro dispara o vídeo dele na imagem grande do topo.
 *
 * Como o desenho funciona (sem canvas, só CSS transform):
 *
 *   - cada card recebe `translateX(dx) scale(s)`, onde `dx` vem do deslocamento
 *     CIRCULAR em relação ao índice central, então os cards de trás passam para
 *     os lados e reaparecem do outro lado (roda infinita);
 *   - `dx = R * sin(angulo)` e `s = 0.55 + 0.45 * cos(angulo)` dão a ilusão de
 *     tambor girando: card no centro = 100%, card a 90° = some na borda;
 *   - `rotateY(-angulo * 0.45)` inclina os cards laterais para dentro, como um
 *     carrossel de verdade.
 *
 * Nada disso depende de mouse: setas ← →, PageUp/PageDown, roda do mouse,
 * arrastar e clique nos cards laterais movem o centro.
 */
'use strict';

const Rondel = (() => {
  const VISIVEIS = 3;              // quantos cards de cada lado aparecem (o 3º já desbota)
  let itens = [];                  // jogos na roda (ordem atual)
  let centro = 0;                  // índice do jogo no centro
  let timerVideo = null;           // conta os 2 s
  let videoAtual = null;           // chave do vídeo já pedido
  let abortar = false;             // evita resolver vídeo de jogo que saiu do centro
  let ultimoAgendado = null;       // jogo que já está contando os 2 s
  let assinatura = '';             // "impressão digital" da lista montada

  /* ---------------- desenho ---------------- */

  /**
   * Deslocamento circular de um card em relação ao centro.
   * Sem isso o card "à esquerda" do primeiro jogo apareceria como +7 (fora da
   * tela) em vez de -1: a roda não fechava.
   */
  function deltaDe(i) {
    const n = itens.length || 1;
    let d = i - centro;
    const metade = n / 2;
    if (d > metade) d -= n;
    if (d < -metade) d += n;
    return d;
  }

  function anguloDe(i) {
    return deltaDe(i) * (Math.PI / (VISIVEIS + 1.35));
  }

  function aplicar() {
    const roda = document.getElementById('rondel-roda');
    if (!roda) return;
    // O raio tem de deixar o card de ±1 bem visível e o de ±2/±3 morrendo na
    // borda — se passar disso, os cards vazam para fora da janela.
    const raio = Math.min(340, Math.max(150, roda.clientWidth * 0.24));
    const cards = [...roda.querySelectorAll('.rondel-card')];

    for (const card of cards) {
      const i = Number(card.dataset.idx);
      const delta = deltaDe(i);
      const abs = Math.abs(delta);
      const ang = delta * (Math.PI / (VISIVEIS + 1.35));
      const dx = Math.sin(ang) * raio;
      const s = 0.55 + 0.45 * Math.cos(ang);
      // queda suave: 1.0 no centro, ~.72 em ±1, ~.45 em ±2, ~.22 em ±3
      const opacidade = abs > VISIVEIS ? 0 : Math.max(0.22, 1 - abs * 0.26);
      const visivel = abs <= VISIVEIS;

      card.style.transform =
        `translate3d(calc(-50% + ${dx.toFixed(1)}px), -50%, 0) scale(${s.toFixed(3)}) rotateY(${(-ang * 0.45).toFixed(3)}rad)`;
      card.style.opacity = visivel ? opacidade.toFixed(3) : '0';
      card.style.zIndex = String(100 - abs);
      card.style.pointerEvents = visivel ? 'auto' : 'none';
      card.classList.toggle('centro', abs === 0);
      card.classList.toggle('lado', abs > 0);
      card.setAttribute('aria-hidden', visivel ? 'false' : 'true');
      card.tabIndex = abs === 0 ? 0 : -1;
    }

    const contador = document.getElementById('rondel-contador');
    if (contador) contador.textContent = itens.length ? `${centro + 1} / ${itens.length}` : '0 / 0';
  }

  /* ---------------- topo: imagem grande + vídeo ---------------- */

  function pintarTopo() {
    const jogo = itens[centro];
    const arte = document.getElementById('rondel-arte');
    const titulo = document.getElementById('rondel-titulo');
    const meta = document.getElementById('rondel-meta');
    if (!arte) return;
    arte.innerHTML = '';
    arte.classList.remove('tocando');
    if (titulo) titulo.textContent = jogo ? jogo.title : '';
    if (meta) {
      const partes = [];
      if (jogo) {
        if (jogo.platform) partes.push(jogo.platform);
        if (jogo.meta && jogo.meta.score) partes.push(`nota ${jogo.meta.score}`);
        if (jogo.playtime) partes.push(`${Math.round(jogo.playtime / 3600)}h jogadas`);
      }
      meta.textContent = partes.join(' · ');
    }
    if (!jogo) return;
    if (jogo.art) {
      const img = document.createElement('img');
      img.src = jogo.art;
      img.alt = jogo.title;
      arte.appendChild(img);
    } else {
      const vazio = document.createElement('div');
      vazio.className = 'rondel-arte-vazia';
      vazio.textContent = jogo.title.slice(0, 2).toUpperCase();
      arte.appendChild(vazio);
    }
  }

  /** Marca "sem vídeo" de forma discreta (decisão do usuário: fica na imagem). */
  function seloVideo(texto) {
    const arte = document.getElementById('rondel-arte');
    if (!arte) return;
    const antigo = arte.querySelector('.rondel-selo');
    if (antigo) antigo.remove();
    if (!texto) return;
    const s = document.createElement('span');
    s.className = 'rondel-selo';
    s.textContent = texto;
    arte.appendChild(s);
  }

  async function tocarVideo(jogo) {
    const arte = document.getElementById('rondel-arte');
    if (!arte || !jogo) return;
    const chave = jogo.id;
    // já está tocando esse E o elemento ainda está lá (se sumiu do DOM — troca de
    // skin, redesenho — precisa tocar de novo, senão o vídeo morre para sempre)
    if (videoAtual === chave && arte.querySelector('video')) return;
    videoAtual = chave;
    abortar = false;
    seloVideo('');

    const api = window.arcadeAPI;
    // o IPC responde { ok, data } — o resultado do vídeo é o `data`
    let info = { ok: false };
    if (api && api.videoFor) {
      const resp = await api.videoFor({ id: jogo.id, title: jogo.title, steamAppId: jogo.steamAppId });
      info = resp && resp.data ? resp.data : (resp || { ok: false });
    }

    // o jogo saiu do centro enquanto baixava? não toca
    const atual = itens[centro];
    if (abortar || !atual || atual.id !== jogo.id) return;

    if (!info || !info.ok) {
      seloVideo('sem vídeo');
      return;
    }

    const v = document.createElement('video');
    v.className = 'rondel-video';
    v.muted = true;              // sem susto: o trailer entra em silêncio
    v.loop = true;
    v.playsInline = true;
    v.autoplay = true;
    v.preload = 'auto';
    // file:// direto; se o Chromium recusar, o processo principal dá uma URL http local
    v.src = info.localUrl || info.url;
    v.onerror = async () => {
      if (!api || !api.videoUrlHttp) return seloVideo('sem vídeo');
      const respAlt = await api.videoUrlHttp({ arquivo: info.arquivo });
      const alt = respAlt && respAlt.data ? respAlt.data : respAlt;
      if (alt && alt.ok && itens[centro] && itens[centro].id === jogo.id) {
        v.src = alt.url;
        v.play().catch(() => seloVideo('sem vídeo'));
      } else {
        seloVideo('sem vídeo');
      }
    };
    v.onplaying = () => {
      arte.classList.add('tocando');
      seloVideo('');
      const velho = arte.querySelector('img');
      if (velho) velho.classList.add('sumindo');   // imagem desbota: vídeo aparece
    };
    v.play().catch(() => { /* autoplay bloqueado: fica a imagem */ });
    // vídeo entra ABAIXO da imagem (o CSS põe a imagem por cima e ela desbota)
    arte.insertBefore(v, arte.firstChild);
    const img = arte.querySelector('img');
    if (img) img.classList.add('com-video', 'sumindo');
  }

  function pararVideo() {
    const arte = document.getElementById('rondel-arte');
    if (arte) {
      const v = arte.querySelector('video');
      if (v) { try { v.pause(); } catch { /* noop */ } v.remove(); }
      const img = arte.querySelector('img');
      if (img) img.classList.remove('com-video', 'sumindo');
      arte.classList.remove('tocando');
    }
    videoAtual = null;
  }

  /**
   * (Re)inicia a contagem de 2 s.
   *
   * `forcar` = true quando o usuário girou a roda. Quando é só um re-render
   * (nota que chegou, capa que baixou), NÃO reinicia: senão um jogo que fica no
   * centro nunca chega aos 2 s porque a interface se redesenha no meio.
   */
  function agendarVideo(forcar) {
    const alvo = itens[centro];
    const idAlvo = alvo ? alvo.id : null;
    const arte = document.getElementById('rondel-arte');
    const temVideoNoDom = !!(arte && arte.querySelector('video'));

    // já está tocando este jogo? não reinicia nada
    if (!forcar && idAlvo && idAlvo === videoAtual && temVideoNoDom) return;
    // a contagem dos 2 s está correndo para este mesmo jogo? deixa correr
    if (!forcar && idAlvo && idAlvo === ultimoAgendado && timerVideo) return;
    ultimoAgendado = idAlvo;
    clearTimeout(timerVideo);
    timerVideo = null;
    abortar = true;                       // cancela resolução em andamento
    pararVideo();
    seloVideo('');
    const jogo = itens[centro];
    if (!jogo) return;
    const box = document.getElementById('rondel-arte');
    if (box) box.classList.add('aguardando');     // barra de progresso de 2 s
    timerVideo = setTimeout(() => {
      if (box) box.classList.remove('aguardando');
      const ainda = itens[centro];
      if (ainda && ainda.id === jogo.id) tocarVideo(jogo);
    }, 2000);
  }

  /* ---------------- navegação ---------------- */

  function irPara(novo, opts) {
    if (!itens.length) return;
    const o = opts || {};
    const antigo = centro;
    centro = ((novo % itens.length) + itens.length) % itens.length;
    if (centro === antigo && !o.forcar) return;
    aplicar();
    pintarTopo();
    agendarVideo(true);
    if (o.focar !== false) {
      const card = document.querySelector(`.rondel-card[data-idx="${centro}"]`);
      if (card) card.focus({ preventScroll: true });
    }
  }

  const proximo = () => irPara(centro + 1);
  const anterior = () => irPara(centro - 1);

  function selecionarId(id) {
    const i = itens.findIndex(g => g.id === id);
    if (i >= 0 && i !== centro) irPara(i);
  }

  /* ---------------- montagem ---------------- */

  function montar(jogos, opts) {
    const o = opts || {};
    const lista = Array.isArray(jogos) ? jogos.slice() : [];
    const novaAssinatura = lista.map(g => g.id + ':' + String(g.art || '').length).join('|');
    const rodaAtual = document.getElementById('rondel-roda');

    // mesma lista e mesma arte? só reposiciona (mantém o vídeo rodando)
    if (novaAssinatura === assinatura && rodaAtual && rodaAtual.children.length) {
      itens = lista;
      aplicar();
      return;
    }
    assinatura = novaAssinatura;
    itens = lista;
    const manterId = o.manterSelecionado && itens[centro] ? itens[centro].id : null;
    centro = manterId ? Math.max(0, itens.findIndex(g => g.id === manterId)) : Math.min(centro, Math.max(0, itens.length - 1));

    const roda = document.getElementById('rondel-roda');
    if (!roda) return;
    roda.innerHTML = '';
    itens.forEach((jogo, i) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'rondel-card';
      card.dataset.idx = String(i);
      card.dataset.id = jogo.id;

      const capa = document.createElement('div');
      capa.className = 'rondel-capa';
      if (jogo.art) {
        const img = document.createElement('img');
        img.src = jogo.art;
        img.alt = '';
        img.loading = 'lazy';
        capa.appendChild(img);
      } else {
        capa.textContent = String(jogo.title || '?').slice(0, 2).toUpperCase();
      }
      card.appendChild(capa);

      const rot = document.createElement('span');
      rot.className = 'rondel-nome';
      rot.textContent = jogo.title;
      card.appendChild(rot);

      card.addEventListener('click', (ev) => {
        if (Number(card.dataset.idx) !== centro) {
          selecionarId(jogo.id);       // vizinho: só vai para o centro
          return;
        }
        // centro: clique abre a ficha, Shift+clique inicia na hora
        if (ev.shiftKey) { if (o.onJogar) o.onJogar(jogo); }
        else if (o.onAbrir) o.onAbrir(jogo);
      });
      card.addEventListener('contextmenu', (ev) => {
        if (o.onContexto) o.onContexto(ev, jogo, card);
      });

      roda.appendChild(card);
    });

    aplicar();
    pintarTopo();
    agendarVideo(true);      // lista nova: começa a contar do zero
  }

  /* ---------------- gestos ---------------- */

  let arrasto = null;

  function ligarControles() {
    const palco = document.getElementById('rondel-palco');
    if (!palco || palco.dataset.ligado) return;
    palco.dataset.ligado = '1';

    // roda do mouse / trackpad: um passo por gesto
    let ultimoWheel = 0;
    palco.addEventListener('wheel', (e) => {
      const agora = Date.now();
      if (agora - ultimoWheel < 140) return;
      if (Math.abs(e.deltaY) < 4 && Math.abs(e.deltaX) < 4) return;
      ultimoWheel = agora;
      e.preventDefault();
      if (e.deltaY > 0 || e.deltaX > 0) proximo(); else anterior();
    }, { passive: false });

    // arrastar para o lado
    palco.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.rondel-card') && e.button === 2) return;
      arrasto = { x: e.clientX, movido: 0 };
    });
    palco.addEventListener('pointermove', (e) => {
      if (!arrasto) return;
      const dx = e.clientX - arrasto.x;
      arrasto.movido = dx;
      // prévia do giro (sensação de roda de verdade)
      const roda = document.getElementById('rondel-roda');
      if (roda && Math.abs(dx) > 6) roda.style.transform = `translateX(${dx * 0.28}px)`;
    });
    const soltar = () => {
      const roda = document.getElementById('rondel-roda');
      if (roda) roda.style.transform = '';
      if (!arrasto) return;
      const d = arrasto.movido;
      arrasto = null;
      if (d <= -60) proximo();
      else if (d >= 60) anterior();
    };
    palco.addEventListener('pointerup', soltar);
    palco.addEventListener('pointercancel', soltar);
    palco.addEventListener('pointerleave', () => { if (arrasto) { arrasto = null; const r = document.getElementById('rondel-roda'); if (r) r.style.transform = ''; } });

    // teclado
    document.addEventListener('keydown', (e) => {
      if (document.body.dataset.layout !== 'rondel') return;
      const digitando = document.activeElement && /input|textarea|select/i.test(document.activeElement.tagName);
      if (digitando) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'PageDown') { e.preventDefault(); proximo(); }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'PageUp') { e.preventDefault(); anterior(); }
      else if (e.key === 'Enter') {
        const jogo = itens[centro];
        if (jogo) document.dispatchEvent(new CustomEvent('rondel:abrir', { detail: jogo }));
      }
    });

    window.addEventListener('resize', () => aplicar());
  }

  /* ---------------- ciclo de vida ---------------- */

  function pausar() { clearTimeout(timerVideo); abortar = true; pararVideo(); }
  function retomar() { aplicar(); pintarTopo(); agendarVideo(false); }

  return {
    montar, irPara, proximo, anterior, selecionarId, pausar, retomar,
    ligarControles, aplicar, pararVideo,
    get itens() { return itens; },
    get centro() { return centro; },
    get jogoAtual() { return itens[centro] || null; }
  };
})();

if (typeof window !== 'undefined') window.Rondel = Rondel;
