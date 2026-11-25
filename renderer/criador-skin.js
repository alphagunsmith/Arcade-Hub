/* ================= Arcade Hub — criador de skin =================
 *
 * Monta uma skin sem precisar saber de cor ou CSS:
 *   - "Gerar a partir de uma cor": escolhe UMA cor e o resto da paleta sai combinando
 *   - "Tirar as cores de uma imagem": usa as cores de uma foto, capa ou do seu fundo
 *   - "Surpreenda-me": paleta aleatória que combina
 *   - fundo animado (os mesmos dos consoles), imagem, GIF ou vídeo seu
 *   - fonte, cantos, efeito de TV antiga e o layout de console
 *   - prévia ao vivo, aviso de contraste com correção automática
 *   - exportar e importar (.arcadeskin) para trocar skins com outras pessoas
 *
 * Depende de app.js (api, ui, toast, el, $, applySkinId, renderSkinGrid, syncSkinSelect,
 * pedirConfirmacao) e de skins.js / fundos.js.
 */
'use strict';

const CriadorSkin = (() => {
  let modal = null;
  let rascunho = null;          // a skin sendo editada
  let editando = null;          // id da skin personalizada (null = nova)
  let pararPrevia = null;

  /* ---------------- cor ---------------- */
  const hex2rgb = h => { const m = /^#?([0-9a-f]{6})/i.exec(h || '') || /^#?([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(h || ''); if (!m) return [0, 0, 0]; if (m.length === 4) return [m[1], m[2], m[3]].map(c => parseInt(c + c, 16)); return [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16)); };
  const rgb2hex = c => '#' + c.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  function rgb2hsl([r, g, b]) {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
    if (mx === mn) return [0, 0, l];
    const d = mx - mn, s = l > .5 ? d / (2 - mx - mn) : d / (mx + mn);
    const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [h * 60, s, l];
  }
  function hsl(h, s, l) {
    h = ((h % 360) + 360) % 360 / 360; s = Math.max(0, Math.min(1, s)); l = Math.max(0, Math.min(1, l));
    const f = n => { const k = (n + h * 12) % 12; return l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
    return rgb2hex([f(0) * 255, f(8) * 255, f(4) * 255]);
  }
  const lum = hex => { const [r, g, b] = hex2rgb(hex).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }); return .2126 * r + .7152 * g + .0722 * b; };
  const contraste = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
  const rgbaDe = (hex, a) => { const [r, g, b] = hex2rgb(hex); return `rgba(${r},${g},${b},${a})`; };
  const corHex = v => /^#[0-9a-f]{6}$/i.test(v || '') ? v : /^#[0-9a-f]{3}$/i.test(v || '') ? rgb2hex(hex2rgb(v)) : (() => {
    const m = /rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(v || ''); return m ? rgb2hex([+m[1], +m[2], +m[3]]) : '#000000';
  })();

  /** A paleta inteira a partir de UMA cor. */
  function gerarPaleta(base, modo, combinacao) {
    const [h, s0] = rgb2hsl(hex2rgb(base));
    const s = Math.max(.35, s0);
    const giro = combinacao === 'contraste' ? [180, 150] : combinacao === 'tres' ? [120, 240] : [35, -50];
    const escuro = modo !== 'claro';
    const ac = escuro ? hsl(h, s, Math.max(.52, Math.min(.68, rgb2hsl(hex2rgb(base))[2]))) : hsl(h, s, Math.max(.36, Math.min(.48, rgb2hsl(hex2rgb(base))[2])));
    const v = escuro ? {
      '--bg': hsl(h, s * .35, .055), '--bg-2': hsl(h, s * .33, .08), '--panel': hsl(h, s * .28, .11), '--panel-2': hsl(h, s * .26, .15),
      '--input-bg': hsl(h, s * .3, .075), '--txt': hsl(h, .25, .94), '--muted': hsl(h, .14, .64),
      '--accent': ac, '--accent-2': hsl(h + giro[0], s, .6), '--accent-3': hsl(h + giro[1], s, .7)
    } : {
      '--bg': hsl(h, .28, .95), '--bg-2': hsl(h, .24, .91), '--panel': hsl(h, .3, .995), '--panel-2': hsl(h, .25, .965),
      '--input-bg': '#ffffff', '--txt': hsl(h, .3, .12), '--muted': hsl(h, .12, .36),
      '--accent': ac, '--accent-2': hsl(h + giro[0], s * .9, .45), '--accent-3': hsl(h + giro[1], s * .9, .42)
    };
    completar(v);
    return v;
  }
  /** Linhas e cor do texto em cima do destaque saem das outras cores. */
  function completar(v) {
    v['--on-accent'] = contraste(v['--accent'], '#ffffff') >= contraste(v['--accent'], '#0b0d12') ? '#ffffff' : '#0b0d12';
    v['--line'] = rgbaDe(v['--txt'], .1);
    v['--line-strong'] = rgbaDe(v['--txt'], .2);
    return v;
  }

  /** Cores marcantes de uma imagem (amostra pequena, agrupada). */
  function coresDaImagem(src) {
    return new Promise(res => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas'); c.width = c.height = 64;
        const g = c.getContext('2d'); g.drawImage(img, 0, 0, 64, 64);
        let px;
        try { px = g.getImageData(0, 0, 64, 64).data; } catch { res(null); return; }
        const baldes = new Map();
        for (let i = 0; i < px.length; i += 4) {
          if (px[i + 3] < 128) continue;
          const k = (px[i] >> 4) << 8 | (px[i + 1] >> 4) << 4 | (px[i + 2] >> 4);
          const b = baldes.get(k) || { n: 0, r: 0, g: 0, b: 0 };
          b.n++; b.r += px[i]; b.g += px[i + 1]; b.b += px[i + 2];
          baldes.set(k, b);
        }
        const cores = [...baldes.values()].map(b => { const rgb = [b.r / b.n, b.g / b.n, b.b / b.n]; const [h, s, l] = rgb2hsl(rgb); return { hex: rgb2hex(rgb), n: b.n, h, s, l }; });
        if (!cores.length) { res(null); return; }
        const vivas = cores.filter(c => c.l > .25 && c.l < .82).sort((a, b) => (b.s * Math.sqrt(b.n)) - (a.s * Math.sqrt(a.n)));
        const principal = vivas[0] || cores.sort((a, b) => b.n - a.n)[0];
        const segunda = vivas.find(c => Math.min(Math.abs(c.h - principal.h), 360 - Math.abs(c.h - principal.h)) > 35) || null;
        const media = cores.reduce((m, c) => ({ l: m.l + c.l * c.n, n: m.n + c.n }), { l: 0, n: 0 });
        res({ principal: principal.hex, segunda: segunda && segunda.hex, clara: media.l / media.n > .6 });
      };
      img.onerror = () => res(null);
      img.src = src;
    });
  }

  /* ---------------- dados ---------------- */
  const FONTES = [['padrao', 'Do sistema (Segoe UI)'], ['bahnschrift', 'Bahnschrift (moderna)'], ['trebuchet', 'Trebuchet'], ['verdana', 'Verdana (larga)'],
    ['georgia', 'Georgia (com serifa)'], ['consolas', 'Consolas (terminal)'], ['impact', 'Impact (forte)'], ['arialblack', 'Arial Black'], ['pixel', 'Pixel (retrô)']];
  const FONTE_CSS = {
    bahnschrift: 'Bahnschrift, "Segoe UI", sans-serif', trebuchet: '"Trebuchet MS", "Segoe UI", sans-serif', verdana: 'Verdana, "Segoe UI", sans-serif',
    georgia: 'Georgia, serif', consolas: 'Consolas, "Cascadia Mono", monospace', impact: 'Impact, "Arial Black", sans-serif',
    arialblack: '"Arial Black", Arial, sans-serif', pixel: '"Press Start 2P", "Lucida Console", Consolas, monospace'
  };
  const CAMPOS_COR = [['--bg', 'Fundo'], ['--panel', 'Painéis e cartões'], ['--txt', 'Texto'], ['--muted', 'Texto secundário'],
    ['--accent', 'Destaque'], ['--accent-2', 'Destaque 2'], ['--accent-3', 'Destaque 3']];

  function daSkin(skin) {
    const v = { ...(skin.vars || {}) };
    for (const [k] of CAMPOS_COR) v[k] = corHex(v[k] || (k === '--panel' ? v['--bg'] : '#888888'));
    v['--bg-2'] = v['--bg-2'] ? corHex(v['--bg-2']) : v['--bg'];
    v['--panel-2'] = v['--panel-2'] ? corHex(v['--panel-2']) : v['--panel'];
    v['--input-bg'] = v['--input-bg'] ? corHex(v['--input-bg']) : v['--bg'];
    v['--radius-card'] = v['--radius-card'] || '12px';
    v['--radius-sheet'] = v['--radius-sheet'] || '16px';
    completar(v);
    return {
      id: skin.personalizada ? skin.id : null,
      name: skin.personalizada ? skin.name : `${skin.name} 2`,
      base: skin.personalizada ? skin.base : skin.id,
      vars: v,
      fundo: skin.fundo || (typeof Fundos !== 'undefined' ? Fundos.tipoDaSkin(skin) : null) || 'nenhum',
      midia: skin.midia || null,
      fundoVelocidade: skin.fundoVelocidade || 1, fundoEscurecer: skin.fundoEscurecer || 0, fundoDesfoque: skin.fundoDesfoque || 0,
      dashboard: skin.dashboard || '', fonteId: skin.fonteId || 'padrao', scanline: !!skin.scanline
    };
  }
  /** Painel 2, entrada e fundo 2 acompanham as cores escolhidas. */
  function derivar(v) {
    const [h, s, l] = rgb2hsl(hex2rgb(v['--bg']));
    const escuro = l < .5;
    v['--bg-2'] = hsl(h, s, escuro ? l + .025 : l - .035);
    const [ph, ps, pl] = rgb2hsl(hex2rgb(v['--panel']));
    v['--panel-2'] = hsl(ph, ps, escuro ? pl + .04 : pl - .03);
    v['--input-bg'] = escuro ? hsl(h, s, Math.max(0, l + .015)) : '#ffffff';
    completar(v);
  }
  function paraSalvar() {
    const r = rascunho;
    return {
      id: editando, name: r.name, base: r.base, vars: { ...r.vars },
      fundo: r.midia ? 'nenhum' : r.fundo, midia: r.midia, fundoVelocidade: r.fundoVelocidade, fundoEscurecer: r.fundoEscurecer, fundoDesfoque: r.fundoDesfoque,
      dashboard: r.dashboard || undefined, fonteId: r.fonteId, scanline: r.scanline
    };
  }

  /* ---------------- tela ---------------- */
  function montar() {
    if (modal) return;
    modal = el('div', 'modal-layer');
    modal.id = 'modal-criador';
    modal.hidden = true;
    const tiposFundo = typeof Fundos !== 'undefined' ? Object.entries(Fundos.TIPOS) : [];
    const dash = typeof DASHBOARD_TIPOS !== 'undefined' ? Object.entries(DASHBOARD_TIPOS) : [];
    modal.innerHTML = `
      <div class="modal-backdrop" data-cs="fechar"></div>
      <div class="sheet wide cs-sheet" role="dialog" aria-modal="true" aria-labelledby="cs-titulo">
        <button class="close-x" data-cs="fechar" aria-label="Fechar">✕</button>
        <h2 id="cs-titulo">Criar skin</h2>
        <div class="cs-corpo">
          <div class="cs-controles">
            <div class="field"><label for="cs-nome">Nome da skin</label><input type="text" id="cs-nome" maxlength="40"></div>
            <div class="field"><label for="cs-base">Começar de</label><select id="cs-base"></select></div>

            <h3 class="skins-sub">Cores</h3>
            <div class="cs-ferramenta">
              <div class="row">
                <input type="color" id="cs-semente" aria-label="Cor para gerar a paleta" value="#22d3ee">
                <select id="cs-modo" aria-label="Claro ou escuro"><option value="escuro">Escuro</option><option value="claro">Claro</option></select>
                <select id="cs-comb" aria-label="Combinação"><option value="vizinhas">Cores vizinhas</option><option value="contraste">Cores opostas</option><option value="tres">Três cores</option></select>
              </div>
              <div class="row cs-botoes">
                <button class="primary-btn" id="cs-gerar" type="button">Gerar a partir desta cor</button>
                <button class="ghost-btn" id="cs-imagem" type="button">Tirar as cores de uma imagem</button>
                <button class="ghost-btn" id="cs-sorte" type="button">Surpreenda-me</button>
              </div>
            </div>
            <div class="cs-cores" id="cs-cores"></div>
            <p class="muted small" id="cs-contraste"></p>

            <h3 class="skins-sub">Fundo</h3>
            <div class="cs-fundos" id="cs-fundos">
              <button type="button" class="cs-fundo" data-fundo="nenhum"><span class="cs-fundo-mini cs-sem"></span><em>Sem fundo</em></button>
              ${tiposFundo.map(([id, d]) => `<button type="button" class="cs-fundo" data-fundo="${id}"><canvas class="cs-fundo-mini" width="120" height="68"></canvas><em>${escapeHtml(d.nome)}</em></button>`).join('')}
            </div>
            <div class="row cs-botoes">
              <button class="ghost-btn" id="cs-midia" type="button">Usar imagem, GIF ou vídeo do PC…</button>
              <button class="ghost-btn" id="cs-midia-tirar" type="button" hidden>Tirar meu fundo</button>
            </div>
            <p class="muted small" id="cs-midia-nome"></p>
            <div class="cs-deslizes">
              <label>Velocidade da animação <input type="range" id="cs-vel" min="0.2" max="3" step="0.1"></label>
              <label>Escurecer o fundo <input type="range" id="cs-escuro" min="0" max="0.85" step="0.05"></label>
              <label>Desfoque <input type="range" id="cs-desfoque" min="0" max="30" step="1"></label>
            </div>

            <h3 class="skins-sub">Formato</h3>
            <div class="field"><label for="cs-dash">Interface</label><select id="cs-dash"><option value="">Normal (grade ou rondel)</option>${dash.map(([id, d]) => `<option value="${id}">${escapeHtml(d.nome)}</option>`).join('')}</select></div>
            <div class="field"><label for="cs-fonte">Fonte</label><select id="cs-fonte">${FONTES.map(([id, n]) => `<option value="${id}">${escapeHtml(n)}</option>`).join('')}</select></div>
            <div class="cs-deslizes"><label>Cantos arredondados <input type="range" id="cs-raio" min="0" max="24" step="1"></label></div>
            <label class="cs-check"><input type="checkbox" id="cs-crt"> Efeito de TV antiga (scanlines)</label>
          </div>

          <div class="cs-lado">
            <div class="cs-previa" id="cs-previa">
              <canvas class="cs-previa-fundo"></canvas>
              <div class="cs-previa-midia"></div>
              <div class="cs-p-lateral"><b class="cs-p-marca">MEU<span>HUB</span></b><i></i><i class="on"></i><i></i><i></i></div>
              <div class="cs-p-corpo">
                <div class="cs-p-topo"><span class="cs-p-titulo">Biblioteca</span><span class="cs-p-sub">12 jogos</span></div>
                <div class="cs-p-cards"><i class="on"></i><i></i><i></i><i></i><i></i><i></i></div>
                <div class="cs-p-acoes"><span class="cs-p-botao">Jogar</span><span class="cs-p-botao b2">Detalhes</span><span class="cs-p-chip">Favorito</span></div>
              </div>
            </div>
            <button class="ghost-btn" id="cs-espiar" type="button">Ver no app inteiro</button>
            <p class="muted small">Dica: comece pela cor de que você mais gosta e aperte "Gerar". Depois ajuste uma cor de cada vez.</p>
          </div>
        </div>
        <div class="sheet-actions">
          <button class="ghost-btn danger-txt" id="cs-apagar" type="button" hidden>Apagar skin</button>
          <button class="ghost-btn" id="cs-exportar" type="button">Exportar…</button>
          <span class="cs-espaco"></span>
          <button class="ghost-btn" data-cs="fechar" type="button">Cancelar</button>
          <button class="primary-btn" id="cs-salvar" type="button">Salvar e usar</button>
        </div>
      </div>
      <button class="cs-voltar" id="cs-voltar" type="button" hidden>Voltar ao criador</button>`;
    document.body.appendChild(modal);

    modal.querySelectorAll('[data-cs="fechar"]').forEach(b => { b.onclick = fechar; });
    modal.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); if (document.body.classList.contains('cs-espiando')) pararEspiar(); else fechar(); } });
    const q = s => modal.querySelector(s);
    q('#cs-nome').oninput = e => { rascunho.name = e.target.value; };
    q('#cs-base').onchange = e => {
      const s = SKINS.find(x => x.id === e.target.value);
      if (!s) return;
      const nome = rascunho.name;
      rascunho = { ...daSkin(s), name: nome, id: editando };
      preencher();
    };
    q('#cs-gerar').onclick = () => {
      rascunho.vars = { ...rascunho.vars, ...gerarPaleta(q('#cs-semente').value, q('#cs-modo').value, q('#cs-comb').value) };
      preencher();
    };
    q('#cs-sorte').onclick = () => {
      const h = Math.floor(Math.random() * 360);
      q('#cs-semente').value = hsl(h, .55 + Math.random() * .35, .55);
      q('#cs-modo').value = Math.random() < .75 ? 'escuro' : 'claro';
      q('#cs-comb').value = ['vizinhas', 'contraste', 'tres'][Math.floor(Math.random() * 3)];
      q('#cs-gerar').onclick();
    };
    q('#cs-imagem').onclick = async () => {
      let url = rascunho.midia && rascunho.midia.tipo === 'imagem' ? rascunho.midia.url : null;
      if (!url) {
        const r = await api.pickFile({ title: 'Escolha uma imagem', filters: [{ name: 'Imagens', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'] }] });
        const p = r && r.ok && r.data && r.data[0];
        if (!p) return;
        url = 'file://' + p.replace(/\\/g, '/');
      }
      const c = await coresDaImagem(url);
      if (!c) { toast('Não consegui ler as cores dessa imagem', 'err'); return; }
      const modo = c.clara ? 'claro' : 'escuro';
      q('#cs-modo').value = modo;
      q('#cs-semente').value = c.principal;
      const v = gerarPaleta(c.principal, modo, 'vizinhas');
      if (c.segunda) v['--accent-2'] = hsl(rgb2hsl(hex2rgb(c.segunda))[0], Math.max(.4, rgb2hsl(hex2rgb(c.segunda))[1]), modo === 'claro' ? .45 : .62);
      rascunho.vars = { ...rascunho.vars, ...v };
      preencher();
      toast('Cores tiradas da imagem', 'ok');
    };
    q('#cs-cores').addEventListener('input', e => {
      const k = e.target.dataset.var;
      if (!k) return;
      rascunho.vars[k] = e.target.value;
      derivar(rascunho.vars);
      atualizarPrevia();
      mostrarContraste();
    });
    q('#cs-contraste').addEventListener('click', e => {
      if (e.target.id !== 'cs-corrigir') return;
      const v = rascunho.vars;
      const [h, s, l] = rgb2hsl(hex2rgb(v['--bg']));
      const escuro = l < .5;
      let tl = rgb2hsl(hex2rgb(v['--txt']))[2];
      for (let i = 0; i < 40 && contraste(v['--txt'], v['--bg']) < 7; i++) { tl = escuro ? Math.min(1, tl + .03) : Math.max(0, tl - .03); v['--txt'] = hsl(h, Math.min(s, .25), tl); }
      let ml = rgb2hsl(hex2rgb(v['--muted']))[2];
      for (let i = 0; i < 40 && contraste(v['--muted'], v['--bg']) < 4.5; i++) { ml = escuro ? Math.min(1, ml + .03) : Math.max(0, ml - .03); v['--muted'] = hsl(h, Math.min(s, .18), ml); }
      completar(v);
      preencher();
    });
    q('#cs-fundos').addEventListener('click', e => {
      const b = e.target.closest('.cs-fundo');
      if (!b) return;
      rascunho.fundo = b.dataset.fundo;
      rascunho.midia = null;
      preencher();
    });
    q('#cs-midia').onclick = async () => {
      const r = await api.guardarVisual('fundos');
      if (!r || !r.ok) { if (r && r.error) toast(r.error, 'err'); return; }
      if (!r.data) return;
      rascunho.midia = r.data;
      preencher();
    };
    q('#cs-midia-tirar').onclick = () => { rascunho.midia = null; preencher(); };
    const deslize = (id, k) => { q(id).oninput = e => { rascunho[k] = +e.target.value; atualizarPrevia(); }; };
    deslize('#cs-vel', 'fundoVelocidade'); deslize('#cs-escuro', 'fundoEscurecer'); deslize('#cs-desfoque', 'fundoDesfoque');
    q('#cs-raio').oninput = e => { rascunho.vars['--radius-card'] = e.target.value + 'px'; rascunho.vars['--radius-sheet'] = Math.min(24, +e.target.value + 4) + 'px'; atualizarPrevia(); };
    q('#cs-dash').onchange = e => { rascunho.dashboard = e.target.value; };
    q('#cs-fonte').onchange = e => { rascunho.fonteId = e.target.value; atualizarPrevia(); };
    q('#cs-crt').onchange = e => { rascunho.scanline = e.target.checked; atualizarPrevia(); };
    q('#cs-salvar').onclick = salvar;
    q('#cs-apagar').onclick = apagar;
    q('#cs-exportar').onclick = exportar;
    q('#cs-espiar').onclick = espiar;
    q('#cs-voltar').onclick = pararEspiar;
  }

  function preencher() {
    const q = s => modal.querySelector(s);
    const r = rascunho;
    q('#cs-titulo').textContent = editando ? 'Editar skin' : 'Criar skin';
    q('#cs-nome').value = r.name || '';
    const base = q('#cs-base');
    base.innerHTML = SKINS.map(s => `<option value="${escapeHtml(s.id)}"${s.id === r.base ? ' selected' : ''}>${escapeHtml(s.name)}</option>`).join('');
    if (!SKINS.some(s => s.id === r.base)) base.selectedIndex = -1;
    q('#cs-cores').innerHTML = CAMPOS_COR.map(([k, nome]) =>
      `<label class="cs-cor"><input type="color" data-var="${k}" value="${corHex(r.vars[k])}"><span>${escapeHtml(nome)}</span></label>`).join('');
    q('#cs-semente').value = corHex(r.vars['--accent']);
    q('#cs-modo').value = rgb2hsl(hex2rgb(r.vars['--bg']))[2] < .5 ? 'escuro' : 'claro';
    modal.querySelectorAll('.cs-fundo').forEach(b => {
      b.classList.toggle('on', !r.midia && b.dataset.fundo === (r.fundo || 'nenhum'));
      const cv = b.querySelector('canvas');
      if (cv && typeof Fundos !== 'undefined') Fundos.miniatura(cv, b.dataset.fundo, r.vars, 7);
    });
    q('#cs-midia-tirar').hidden = !r.midia;
    q('#cs-midia-nome').textContent = r.midia ? (r.midia.tipo === 'video' ? 'Fundo: seu vídeo' : 'Fundo: sua imagem') : '';
    q('#cs-vel').value = r.fundoVelocidade || 1;
    q('#cs-escuro').value = r.fundoEscurecer || 0;
    q('#cs-desfoque').value = r.fundoDesfoque || 0;
    q('#cs-dash').value = r.dashboard || '';
    q('#cs-fonte').value = r.fonteId || 'padrao';
    q('#cs-raio').value = parseInt(r.vars['--radius-card'], 10) || 12;
    q('#cs-crt').checked = !!r.scanline;
    q('#cs-apagar').hidden = !editando;
    atualizarPrevia();
    mostrarContraste();
  }

  function mostrarContraste() {
    const v = rascunho.vars;
    const t = contraste(v['--txt'], v['--bg']), m = contraste(v['--muted'], v['--bg']);
    const box = modal.querySelector('#cs-contraste');
    if (t >= 7 && m >= 4.5) box.innerHTML = `<span class="cs-ok">✓ Texto fácil de ler</span>`;
    else box.innerHTML = `<span class="cs-ruim">Texto difícil de ler nesse fundo</span> <button class="ghost-btn" id="cs-corrigir" type="button">Corrigir sozinho</button>`;
  }

  let midiaPrevia = '';
  function atualizarPrevia() {
    const p = modal.querySelector('#cs-previa');
    const r = rascunho;
    for (const [k, v] of Object.entries(r.vars)) p.style.setProperty(k, v);
    p.style.fontFamily = FONTE_CSS[r.fonteId] || '';
    p.classList.toggle('crt', !!r.scanline);
    p.style.setProperty('--fundo-escuro', r.fundoEscurecer || 0);
    p.style.setProperty('--fundo-desfoque', (r.fundoDesfoque || 0) / 3 + 'px');
    const caixa = p.querySelector('.cs-previa-midia');
    const url = r.midia ? r.midia.url : '';
    if (url !== midiaPrevia) {
      midiaPrevia = url;
      caixa.innerHTML = '';
      if (r.midia) {
        const n = document.createElement(r.midia.tipo === 'video' ? 'video' : 'img');
        if (r.midia.tipo === 'video') Object.assign(n, { muted: true, loop: true, autoplay: true, playsInline: true });
        n.src = url;
        caixa.appendChild(n);
        if (n.play) n.play().catch(() => {});
      }
    }
    if (!pararPrevia && typeof Fundos !== 'undefined') {
      pararPrevia = Fundos.animarEm(p.querySelector('.cs-previa-fundo'),
        () => ({ tipo: rascunho && !rascunho.midia ? rascunho.fundo : null, vars: rascunho && rascunho.vars, velocidade: rascunho && rascunho.fundoVelocidade }));
    }
  }

  /* ---------------- ações ---------------- */
  function abrir(skinId) {
    montar();
    const lista = SKINS;
    const s = lista.find(x => x.id === skinId) || lista.find(x => x.id === currentSkinId()) || lista[0];
    editando = s.personalizada && skinId ? s.id : null;
    rascunho = daSkin(s);
    if (!editando) rascunho.id = null;
    midiaPrevia = null;
    preencher();
    modal.hidden = false;
    setTimeout(() => modal.querySelector('#cs-nome').focus(), 40);
  }
  function fechar() {
    pararEspiar(true);
    if (pararPrevia) { pararPrevia(); pararPrevia = null; }
    modal.hidden = true;
    const v = modal.querySelector('.cs-previa-midia video');
    if (v) v.pause();
  }

  async function salvar() {
    const nova = paraSalvar();
    if (!String(nova.name || '').trim()) nova.name = 'Minha skin';
    const atuais = (ui.state.settings.skinsPersonalizadas || []).filter(s => s.id !== editando);
    const r = await api.saveSettings({ skinsPersonalizadas: [...atuais, nova] });
    if (!r.ok) { toast(r.error || 'Não consegui salvar a skin', 'err'); return; }
    // o processo principal dá o id (nas novas) e confere tudo: a última da lista é esta
    const lista = r.data.settings.skinsPersonalizadas || [];
    const salva = editando ? lista.find(s => s.id === editando) : lista[lista.length - 1];
    if (!salva) { toast('A skin ficou incompleta: confira as cores', 'err'); return; }
    const r2 = await api.saveSettings({ skin: salva.id });
    ui.state = r2.ok ? r2.data : r.data;
    registrarPersonalizadas(ui.state.settings.skinsPersonalizadas);
    applySkinId(salva.id);
    if (typeof renderSkinGrid === 'function' && !document.getElementById('modal-skins').hidden) renderSkinGrid('minhas');
    if (typeof syncSkinSelect === 'function') syncSkinSelect();
    fechar();
    toast(`Skin "${salva.name}" salva`, 'ok');
  }

  async function apagar() {
    if (!editando) return;
    const okk = await pedirConfirmacao({ titulo: 'Apagar esta skin?', texto: `"${rascunho.name}" some da sua lista. As skins prontas não mudam.`, acao: 'Apagar' });
    if (!okk) return;
    const lista = (ui.state.settings.skinsPersonalizadas || []).filter(s => s.id !== editando);
    const patch = { skinsPersonalizadas: lista };
    if (currentSkinId() === editando) patch.skin = rascunho.base && SKINS.some(s => s.id === rascunho.base && !s.personalizada) ? rascunho.base : 'neon';
    const r = await api.saveSettings(patch);
    if (!r.ok) { toast(r.error || 'Não consegui apagar', 'err'); return; }
    ui.state = r.data;
    registrarPersonalizadas(lista);
    applySkinId(currentSkinId());
    if (typeof renderSkinGrid === 'function') renderSkinGrid('minhas');
    if (typeof syncSkinSelect === 'function') syncSkinSelect();
    fechar();
    toast('Skin apagada', 'ok');
  }

  async function exportar() {
    const r = await api.exportarSkin({ ...paraSalvar(), id: editando || undefined });
    if (!r || !r.ok) { toast((r && r.error) || 'Não consegui exportar', 'err'); return; }
    if (r.data) toast(r.data.aviso ? 'Skin exportada (o fundo era grande demais e ficou de fora)' : 'Skin exportada', 'ok');
  }

  async function importar() {
    const r = await api.importarSkin();
    if (!r || !r.ok) { toast((r && r.error) || 'Não consegui importar', 'err'); return; }
    if (!r.data) return;
    const atuais = ui.state.settings.skinsPersonalizadas || [];
    const s = await api.saveSettings({ skinsPersonalizadas: [...atuais, r.data], skin: r.data.id });
    if (!s.ok) { toast(s.error || 'Não consegui importar', 'err'); return; }
    ui.state = s.data;
    registrarPersonalizadas(ui.state.settings.skinsPersonalizadas);
    applySkinId(r.data.id);
    if (typeof renderSkinGrid === 'function') renderSkinGrid('minhas');
    if (typeof syncSkinSelect === 'function') syncSkinSelect();
    toast(`Skin "${r.data.name}" importada`, 'ok');
  }

  /** Mostra o rascunho no app inteiro, sem salvar. */
  function espiar() {
    const temp = { ...paraSalvar(), id: 'meu-previa', name: rascunho.name, personalizada: true };
    temp.fonte = FONTE_CSS[temp.fonteId] || '';
    registrarPersonalizadas([...(ui.state.settings.skinsPersonalizadas || []), temp]);
    applySkin('meu-previa');
    document.body.classList.add('cs-espiando');
    document.addEventListener('keydown', escEspiando, true);
    modal.querySelector('#cs-voltar').hidden = false;
    modal.querySelector('#cs-voltar').focus();
  }
  function escEspiando(e) {
    if (e.key !== 'Escape') return;
    e.stopPropagation(); e.preventDefault();
    pararEspiar();
  }
  function pararEspiar(silencioso) {
    document.removeEventListener('keydown', escEspiando, true);
    if (!document.body.classList.contains('cs-espiando')) return;
    document.body.classList.remove('cs-espiando');
    if (modal) modal.querySelector('#cs-voltar').hidden = true;
    registrarPersonalizadas(ui.state.settings.skinsPersonalizadas || []);
    applySkinId(currentSkinId(), { previewOnly: !!silencioso });
    if (!silencioso && modal) { modal.hidden = false; modal.querySelector('#cs-espiar').focus(); }
  }

  return { abrir, importar, gerarPaleta, contraste, coresDaImagem };
})();

if (typeof window !== 'undefined') window.CriadorSkin = CriadorSkin;
