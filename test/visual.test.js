'use strict';
/** Visual: fundos animados de cada console, skins personalizadas (criador, exportar/importar) e personagem/logo do Modo TV. */
const fs = require('fs'), path = require('path'), assert = require('assert');
const { tmp, t, fim, ROOT } = require('./_base');
const V = require(path.join(ROOT, 'src', 'skins-personalizadas.js'));

/** Contexto 2D de mentira: aceita tudo e confere que nenhum número saiu NaN/Infinity. */
function ctxFalso() {
  const ruins = [];
  const grad = { addColorStop() {} };
  const alvo = {};
  const ctx = new Proxy(alvo, {
    get(o, k) {
      if (k in o) return o[k];
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return (...a) => { if (a.some(n => !Number.isFinite(n))) ruins.push(k + ' ' + a); return grad; };
      return (...a) => { if (a.some(n => typeof n === 'number' && !Number.isFinite(n))) ruins.push(k + ' ' + a); };
    },
    set(o, k, v) { o[k] = v; return true; }
  });
  return { ctx, ruins };
}

(async () => {
  global.window = undefined;
  const { Fundos } = require(path.join(ROOT, 'renderer', 'fundos.js'));
  const { SKINS } = require(path.join(ROOT, 'renderer', 'skins.js'));

  await t('cada fundo animado desenha sem erro, em várias telas e momentos', () => {
    const cores = [{ '--bg': '#05070a', '--accent': '#8fd6ff', '--accent-2': '#3a6ea8', '--txt': '#f2f7ff' }, { '--bg': '#e8f1e8', '--accent': '#5aa832', '--txt': '#16221a' }];
    for (const [id, def] of Object.entries(Fundos.TIPOS)) {
      for (const vars of cores) {
        for (const [w, h] of [[960, 540], [320, 180], [2, 2]]) {
          const { ctx, ruins } = ctxFalso();
          const mem = {};
          for (const tempo of [0, 1.5, 33.3, 600]) def.desenhar(ctx, w, h, tempo, Fundos.coresDaSkin(vars), mem, {});
          assert.deepStrictEqual(ruins, [], `${id} ${w}x${h}`);
        }
      }
    }
  });
  await t('toda skin de console tem um fundo animado que existe', () => {
    const consoles = SKINS.filter(s => /^tema-/.test(s.id) || ['ps2', 'ps3', 'xbox360', 'gamecube', 'nes', 'neon'].includes(s.id));
    assert.ok(consoles.length >= 20);
    for (const s of consoles) assert.ok(Fundos.TIPOS[Fundos.tipoDaSkin(s)], s.id);
    // a lista do processo principal conhece todos os tipos do renderer (senão o criador perde o fundo ao salvar)
    assert.deepStrictEqual([...V.TIPOS_FUNDO].sort(), Object.keys(Fundos.TIPOS).sort());
  });

  const dados = tmp('visual');
  await t('skin personalizada: só cores, números e nomes conhecidos passam', () => {
    const s = V.limparSkin({
      id: 'meu-abc', name: '<b>Minha</b> skin super legal com um nome grande demais para caber', fundo: 'xmb', dashboard: 'blades', fonteId: 'impact',
      vars: { '--bg': '#101010', '--accent': 'rgb(255, 0, 80)', '--txt': '#fff', '--panel': 'url(https://x.y/a.png)', '--muted': 'red; background: url(x)', '--radius-card': '12px', '--evil': '#000' },
      midia: { tipo: 'imagem', url: 'file:///C:/Windows/System32/x.png' }, fundoVelocidade: 99, fundoEscurecer: -3
    }, dados);
    assert.strictEqual(s.id, 'meu-abc');
    assert.ok(!/[<>]/.test(s.name) && s.name.length <= 40);
    assert.deepStrictEqual(Object.keys(s.vars).sort(), ['--accent', '--bg', '--radius-card', '--txt']);
    assert.strictEqual(s.fundo, 'xmb');
    assert.strictEqual(s.dashboard, 'blades');
    assert.ok(/Impact/.test(s.fonte));
    assert.strictEqual(s.midia, undefined, 'fundo fora da pasta do app é recusado');
    assert.strictEqual(s.fundoVelocidade, 3);
    assert.strictEqual(s.fundoEscurecer, 0);
    assert.strictEqual(V.limparSkin({ vars: { '--bg': '#000' } }, dados), null, 'sem destaque e texto não vale');
    assert.ok(/^meu-[0-9a-f]{10}$/.test(V.limparSkin({ id: '../x', vars: { '--bg': '#000', '--accent': '#fff', '--txt': '#fff' } }, dados).id));
    const lista = V.limparLista(Array.from({ length: 80 }, () => ({ vars: { '--bg': '#000', '--accent': '#fff', '--txt': '#fff' } })), dados);
    assert.strictEqual(lista.length, V.MAX_SKINS);
  });

  await t('fundo do PC é copiado para a pasta do app; exportar e importar levam o fundo junto', () => {
    const fora = tmp('fora');
    const gif = path.join(fora, 'meu fundo.gif');
    fs.writeFileSync(gif, Buffer.from('GIF89a-teste-' + 'x'.repeat(100)));
    const g = V.guardarArquivo(dados, 'fundos', gif);
    assert.strictEqual(g.tipo, 'imagem');
    assert.ok(V.dentroDe(dados, 'fundos', g.url));
    assert.deepStrictEqual(V.guardarArquivo(dados, 'fundos', gif), g, 'mesmo arquivo: mesmo nome (sem duplicar)');
    const exe = path.join(fora, 'virus.exe'); fs.writeFileSync(exe, 'MZ');
    assert.throws(() => V.guardarArquivo(dados, 'fundos', exe), /Formato/);
    const mp4 = path.join(fora, 'v.mp4'); fs.writeFileSync(mp4, 'video');
    assert.strictEqual(V.guardarArquivo(dados, 'fundos', mp4).tipo, 'video');
    assert.throws(() => V.guardarArquivo(dados, 'personagens', mp4), /Formato/, 'personagem é só imagem');
    assert.throws(() => V.guardarArquivo(dados, '../x', gif), /pasta/);

    const skin = V.limparSkin({ id: 'meu-gif', name: 'Com GIF', vars: { '--bg': '#000', '--accent': '#f0f', '--txt': '#fff' }, midia: { tipo: 'imagem', url: g.url } }, dados);
    assert.ok(skin.midia);
    const pacote = V.exportarSkin(skin, dados);
    assert.strictEqual(pacote.tipo, 'skin');
    assert.ok(pacote.midia && pacote.midia.dados);
    // outra pessoa, outro PC
    const outro = tmp('outro');
    const imp = V.importarSkin(JSON.stringify(pacote), outro);
    assert.notStrictEqual(imp.id, 'meu-gif', 'importar nunca sobrescreve uma skin sua');
    assert.ok(V.dentroDe(outro, 'fundos', imp.midia.url));
    assert.deepStrictEqual(fs.readFileSync(V.limparSkin(imp, outro).midia.url.replace(/^file:\/\//, '').replace(/^\/([A-Za-z]:)/, '$1')), fs.readFileSync(gif));
    assert.throws(() => V.importarSkin('{"tipo":"biblioteca"}', outro), /não é uma skin/);
    assert.throws(() => V.importarSkin('isso não é json', outro), /não é uma skin/);
    const ruim = { ...pacote, midia: { tipo: 'imagem', ext: '.exe', dados: Buffer.from('MZ').toString('base64') } };
    assert.strictEqual(V.importarSkin(JSON.stringify(ruim), outro).midia, undefined, 'extensão perigosa não vira arquivo');
  });

  await t('personagem e logo do Modo TV: só imagens guardadas pelo app', () => {
    const fora = tmp('png');
    const png = path.join(fora, 'heroi.png'); fs.writeFileSync(png, 'png');
    const p = V.guardarArquivo(dados, 'personagens', png);
    assert.strictEqual(V.limparImagemDoJogo(p.url, dados, 'personagens'), p.url);
    assert.strictEqual(V.limparImagemDoJogo(p.url, dados, 'logos'), null);
    assert.strictEqual(V.limparImagemDoJogo('https://exemplo.com/a.png', dados, 'personagens'), null);
    assert.strictEqual(V.limparImagemDoJogo('file://' + png.replace(/\\/g, '/'), dados, 'personagens'), null);
  });

  await t('ajustes: skins personalizadas e skin do Modo TV entram limpas', () => {
    const lib = require(path.join(ROOT, 'src', 'lib.js'));
    assert.deepStrictEqual(lib.DEFAULT_SETTINGS.skinsPersonalizadas, []);
    assert.strictEqual(lib.DEFAULT_SETTINGS.tvSkin, 'padrao');
    assert.strictEqual(lib.DEFAULT_SETTINGS.fundoAnimado, true);
  });
  fim();
})();
