'use strict';
/**
 * Tradução da interface (português → inglês, espanhol, japonês e chinês simplificado).
 *
 * O app é escrito em português. Em vez de trocar cada texto do código por uma chave,
 * esta camada traduz o que aparece na tela: todo texto (e title/placeholder/aria-label)
 * que entra na página é procurado no dicionário do idioma (renderer/i18n/<idioma>.js),
 * pelo texto em português. Textos com partes variáveis ("12 jogos na biblioteca") usam
 * modelos com {0}, {1}… Parágrafos com negrito/links são traduzidos inteiros.
 * Trocar de idioma recarrega a janela.
 *
 * Também roda no painel do DualSense Auto (servido pelo Python), com o mesmo código.
 */
(function (raiz) {
  const IDIOMAS = [
    { id: 'pt-BR', nome: 'Português (Brasil)', locale: 'pt-BR' },
    { id: 'en', nome: 'English', locale: 'en-US' },
    { id: 'es', nome: 'Español', locale: 'es-ES' },
    { id: 'ja', nome: '日本語', locale: 'ja-JP' },
    { id: 'zh-CN', nome: '简体中文', locale: 'zh-CN' }
  ];
  const CHAVE_LOCAL = 'arcade-idioma';

  function doSistema(lang) {
    const l = String(lang || '').toLowerCase();
    if (l.startsWith('pt')) return 'pt-BR';
    if (l.startsWith('es')) return 'es';
    if (l.startsWith('ja')) return 'ja';
    if (l.startsWith('zh')) return 'zh-CN';
    return 'en';
  }
  function resolver(escolha, sistema) {
    return IDIOMAS.some(i => i.id === escolha) ? escolha : doSistema(sistema);
  }

  let idioma = 'pt-BR';
  let exatos = null;           // Map texto → tradução
  let modelos = [];            // [{ re, saida, literal }]
  let porInicio = new Map();   // 3 primeiras letras do começo fixo → modelos
  let porFim = new Map();      // modelos que começam com {0}: 3 últimas letras do fim fixo
  const soltos = [];           // modelos sem parte fixa útil

  const norm = s => s.replace(/\s+/g, ' ').trim();
  const escapar = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  function carregar(dic) {
    exatos = new Map();
    modelos = []; porInicio = new Map(); porFim = new Map(); soltos.length = 0;
    for (const [pt, tr] of Object.entries(dic || {})) {
      if (!tr) continue;
      const k = norm(pt);
      if (!/\{\d+\}/.test(k)) { if (tr !== pt) exatos.set(k, tr); continue; }   // modelos iguais ficam: as partes variáveis traduzem
      const partes = k.split(/(\{\d+\})/);
      const ordem = [];
      let re = '^';
      for (const p of partes) {
        const m = /^\{(\d+)\}$/.exec(p);
        if (m) { ordem.push(Number(m[1])); re += '(.+?)'; } else re += escapar(p);
      }
      const fixo = k.replace(/\{\d+\}/g, '').replace(/\s+/g, '').length;
      // modelo com pouco texto fixo ("{0} jogos") só vale para números: senão "Ver jogo" viraria "{0} jogo"
      const modelo = { re: new RegExp(re + '$', 's'), ordem, saida: tr, fixo, curto: /^\s*[\p{L}]+\s*$/u.test(k.replace(/\{\d+\}/g, ' ')), html: /</.test(k) };
      modelos.push(modelo);
      const inicio = partes[0];
      const fim = partes[partes.length - 1];
      if (inicio.length >= 3) { const c = inicio.slice(0, 3); if (!porInicio.has(c)) porInicio.set(c, []); porInicio.get(c).push(modelo); }
      else if (fim.length >= 3) { const c = fim.slice(-3); if (!porFim.has(c)) porFim.set(c, []); porFim.get(c).push(modelo); }
      else soltos.push(modelo);
    }
    // os mais específicos (mais texto fixo) primeiro
    const ord = l => l.sort((a, b) => b.fixo - a.fixo);
    porInicio.forEach(ord); porFim.forEach(ord); ord(soltos);
  }

  /** Traduz um texto (devolve o próprio texto se não houver tradução). */
  function tr(texto, nivel, soHtml) {
    if (!exatos || texto == null) return texto;
    nivel = nivel || 0;
    const s = String(texto);
    const k = norm(s);
    if (!k || k.length > 2000) return s;
    const direto = exatos.get(k);
    if (direto != null) return manterEspacos(s, direto);
    const cands = [...(porInicio.get(k.slice(0, 3)) || []), ...(porFim.get(k.slice(-3)) || []), ...soltos];
    for (const m of cands) {
      if (soHtml && !m.html) continue;     // HTML de parágrafo: só modelos feitos para HTML
      const r = m.re.exec(k);
      if (!r) continue;
      if (m.curto && r.slice(1).some(v => !/^[\d.,\s/%+-]+$/.test(v))) continue;
      const vals = m.ordem.map((n, i) => ({ n, v: r[i + 1] }));
      let out = m.saida;
      // as partes variáveis também podem ser texto do app ("ligado", "(agora: Ana)")
      for (const { n, v } of vals) out = out.split('{' + n + '}').join(nivel < 2 ? tr(v, nivel + 1) : (exatos.get(norm(v)) || v));
      return manterEspacos(s, out);
    }
    if (nivel < 2) {
      // "🗡 Ação", "★ Favorito": símbolo na frente + texto conhecido
      const pre = /^([^\p{L}\p{N}"'(]+)(\p{L}.*)$/u.exec(k);
      if (pre) { const resto = tr(pre[2], nivel + 1, soHtml); if (resto !== pre[2]) return manterEspacos(s, pre[1] + resto); }
      // listas curtas: "PC (Windows) · nunca jogado", "Casual, Indie, Ação"
      for (const sep of [' · ', ', ']) {
        if (!k.includes(sep)) continue;
        const partes = k.split(sep);
        if (sep === ', ' && partes.some(p => p.length > 24)) continue;
        const trad = partes.map(p => tr(p, nivel + 1, soHtml));
        if (trad.some((t, i) => t !== partes[i])) return manterEspacos(s, trad.join(sep));
      }
    }
    return s;
  }
  function manterEspacos(orig, novo) {
    const a = /^\s*/.exec(orig)[0], b = /\s*$/.exec(orig)[0];
    return a + novo + b;
  }

  /* ---------------- a página ---------------- */
  const PULAR = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'CODE', 'PRE', 'svg', 'SVG', 'NOSCRIPT']);
  const INLINE = new Set(['B', 'I', 'EM', 'STRONG', 'SPAN', 'KBD', 'A', 'BR', 'SMALL', 'U', 'CODE', 'MARK', 'SUP', 'SUB']);
  const ATRIBUTOS = ['title', 'placeholder', 'aria-label', 'alt', 'data-dica'];
  const feitos = new WeakMap();   // nó → último texto que esta camada escreveu

  function ignorado(el) {
    for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
      if (PULAR.has(e.tagName) || e.isContentEditable || (e.hasAttribute && e.hasAttribute('data-sem-traducao'))) return true;
    }
    return false;
  }

  /** Parágrafo com negrito/links: traduz o HTML inteiro (a ordem das palavras muda entre idiomas). */
  function traduzirMisto(el) {
    if (feitos.get(el) === el.innerHTML) return true;
    let temTexto = false, temInline = false;
    for (const n of el.childNodes) {
      if (n.nodeType === 3 && n.data.trim()) temTexto = true;
      else if (n.nodeType === 1) { if (!INLINE.has(n.tagName)) return false; temInline = true; }
    }
    if (!temTexto || !temInline) return false;
    if (el.querySelector('[id],input,button,select,img,svg')) return false;   // o app mexe nesses filhos: não recria
    const html = el.innerHTML;
    const novo = tr(html, 0, true);
    if (novo === html) return false;
    el.innerHTML = novo;
    feitos.set(el, el.innerHTML);
    return true;
  }

  function traduzirTexto(n) {
    if (feitos.get(n) === n.data) return;
    const novo = tr(n.data);
    if (novo !== n.data) { n.data = novo; }
    feitos.set(n, n.data);
  }

  function traduzirAtributos(el) {
    for (const a of ATRIBUTOS) {
      const v = el.getAttribute && el.getAttribute(a);
      if (!v) continue;
      const marca = 'i18n:' + a;
      if (el[marca] === v) continue;
      const novo = tr(v);
      if (novo !== v) el.setAttribute(a, novo);
      el[marca] = novo;
    }
    if ((el.tagName === 'INPUT') && (el.type === 'button' || el.type === 'submit') && el.value) {
      const novo = tr(el.value);
      if (novo !== el.value) el.value = novo;
    }
  }

  function traduzirArvore(raizNo) {
    if (!exatos || !raizNo) return;
    if (raizNo.nodeType === 3) { if (raizNo.parentElement && !ignorado(raizNo.parentElement)) traduzirTexto(raizNo); return; }
    if (raizNo.nodeType !== 1 && raizNo.nodeType !== 9 && raizNo.nodeType !== 11) return;
    if (raizNo.nodeType === 1 && ignorado(raizNo)) return;
    const pilha = [raizNo];
    while (pilha.length) {
      const el = pilha.pop();
      if (el.nodeType === 1) {
        if (PULAR.has(el.tagName) || (el.hasAttribute('data-sem-traducao'))) {
          if (/^svg$/i.test(el.tagName)) traduzirAtributos(el);   // o ícone tem aria-label/title
          continue;
        }
        traduzirAtributos(el);
        if (traduzirMisto(el)) continue;
      }
      for (let c = el.lastChild; c; c = c.previousSibling) {
        if (c.nodeType === 3) traduzirTexto(c);
        else if (c.nodeType === 1) pilha.push(c);
      }
    }
  }

  let observador = null;
  function observar(doc) {
    if (observador || !exatos) return;
    observador = new MutationObserver(lista => {
      for (const m of lista) {
        if (m.type === 'characterData') {
          if (m.target.parentElement && !ignorado(m.target.parentElement)) {
            const pai = m.target.parentElement;
            if (!traduzirMisto(pai)) traduzirTexto(m.target);
          }
        } else if (m.type === 'attributes') {
          if (!ignorado(m.target)) traduzirAtributos(m.target);
        } else {
          for (const n of m.addedNodes) traduzirArvore(n);
          if (m.target.nodeType === 1 && !ignorado(m.target)) traduzirMisto(m.target);
        }
      }
    });
    observador.observe(doc.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATRIBUTOS });
  }

  function aplicar(doc) {
    doc = doc || document;
    const info = IDIOMAS.find(i => i.id === idioma) || IDIOMAS[0];
    doc.documentElement.lang = info.id;
    if (!exatos) return;
    // textos que vêm do CSS (content:)
    try { doc.documentElement.style.setProperty('--txt-nao-instalado', JSON.stringify(tr('não instalado'))); } catch { /* sem CSS */ }
    if (doc.title) doc.title = tr(doc.title);
    traduzirArvore(doc.body || doc.documentElement);
    observar(doc);
  }

  function iniciar(escolha, opts) {
    const o = opts || {};
    idioma = resolver(escolha, o.sistema || (typeof navigator !== 'undefined' ? navigator.language : 'pt-BR'));
    const dic = idioma === 'pt-BR' ? null : (o.dicionario || ((raiz.I18N_DICIONARIOS || {})[idioma]) || null);
    if (dic) carregar(dic); else exatos = null;
    return idioma;
  }

  // sem escolha salva, o app abre em inglês (o padrão)
  function lembrado() { try { return raiz.localStorage ? raiz.localStorage.getItem(CHAVE_LOCAL) || 'en' : 'en'; } catch { return 'en'; } }
  function lembrar(v) { try { raiz.localStorage.setItem(CHAVE_LOCAL, v || 'en'); } catch { /* sem armazenamento */ } }

  const api = {
    IDIOMAS, resolver, doSistema, iniciar, carregar, tr, aplicar, traduzirArvore, lembrado, lembrar,
    get idioma() { return idioma; },
    get locale() { return (IDIOMAS.find(i => i.id === idioma) || IDIOMAS[0]).locale; },
    get ativo() { return !!exatos; }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.I18N = api;
})(typeof window !== 'undefined' ? window : globalThis);
