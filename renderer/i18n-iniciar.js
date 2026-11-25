'use strict';
/* Liga a tradução assim que a página carrega (antes do app desenhar a biblioteca). */
// "Automático": usa o idioma do Windows que o Arcade Hub informa (no navegador, o do navegador)
I18N.iniciar(I18N.lembrado(), { sistema: (window.arcadeAPI && window.arcadeAPI.idiomaSistema) || navigator.language });
I18N.aplicar(document);

/** Locale para datas e ordenação ("pt-BR", "en-US"…). */
function LOCALE() { return I18N.locale; }

// caixas nativas (confirmar/avisar/perguntar) também passam pela tradução, linha a linha
(function () {
  const porLinha = t => String(t == null ? '' : t).split('\n').map(l => I18N.tr(l)).join('\n');
  const traduzir = t => { const inteiro = I18N.tr(t); return inteiro !== t ? inteiro : porLinha(t); };
  const c = window.confirm.bind(window), a = window.alert.bind(window), p = window.prompt.bind(window);
  window.confirm = m => c(traduzir(m));
  window.alert = m => a(traduzir(m));
  window.prompt = (m, d) => p(traduzir(m), d);
})();
