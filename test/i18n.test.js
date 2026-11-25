'use strict';
/** Tradução: dicionários em dia, camada de tradução, caixas do Electron e painel do DualSense Auto. */
const fs = require('fs'), path = require('path'), assert = require('assert');
const { spawnSync, spawn } = require('child_process');
const http = require('http');
const { ROOT, tmp, t, pular, fim, espera } = require('./_base');

const IDIOMAS = ['en', 'es', 'ja', 'zh-CN'];
const novoI18N = () => { delete require.cache[require.resolve(path.join(ROOT, 'renderer', 'i18n.js'))]; return require(path.join(ROOT, 'renderer', 'i18n.js')); };
const dic = id => require(path.join(ROOT, 'renderer', 'i18n', id + '.js'));

(async () => {
  await t('dicionários gerados estão em dia com i18n/textos (e válidos)', () => {
    const r = spawnSync(process.execPath, [path.join(ROOT, 'i18n', 'gerar.js'), '--conferir'], { encoding: 'utf8' });
    assert.strictEqual(r.status, 0, r.stderr + r.stdout);
  });
  await t('os quatro idiomas têm os mesmos textos', () => {
    const chaves = IDIOMAS.map(id => Object.keys(dic(id)).sort().join('\n'));
    for (const c of chaves) assert.strictEqual(c, chaves[0]);
    assert.ok(Object.keys(dic('en')).length > 1000);
  });

  const I = novoI18N();
  await t('idioma automático pelo sistema (português, espanhol, japonês, chinês; o resto em inglês)', () => {
    assert.strictEqual(I.resolver('auto', 'pt-PT'), 'pt-BR');
    assert.strictEqual(I.resolver('auto', 'es-MX'), 'es');
    assert.strictEqual(I.resolver('auto', 'ja'), 'ja');
    assert.strictEqual(I.resolver('auto', 'zh-TW'), 'zh-CN');
    assert.strictEqual(I.resolver('auto', 'de-DE'), 'en');
    assert.strictEqual(I.resolver('es', 'ja'), 'es');
  });
  await t('traduz textos fixos, com partes variáveis e com símbolo na frente', () => {
    I.iniciar('en', { dicionario: dic('en') });
    assert.strictEqual(I.tr('Remover da biblioteca'), 'Remove from library');
    assert.strictEqual(I.tr('  Jogar  '), '  Play  ');
    assert.strictEqual(I.tr('12 jogos na biblioteca'), '12 games in the library');
    assert.strictEqual(I.tr('há 3 dias'), '3 days ago');
    assert.strictEqual(I.tr('DualSense Auto: ligado'), 'DualSense Auto: on');
    assert.strictEqual(I.tr('🗡 Ação'), '🗡 Action');
    assert.strictEqual(I.tr('Casual, Indie, RPG, Ação'), 'Casual, Indie, RPG, Action');
  });
  await t('não mexe em nomes de jogos nem confunde "Ver jogo" com "{0} jogo"', () => {
    I.iniciar('zh-CN', { dicionario: dic('zh-CN') });
    for (const titulo of ['Hollow Knight', 'Celeste', 'The Witcher 3: Wild Hunt', 'Warhammer 40,000: Dawn of War']) assert.strictEqual(I.tr(titulo), titulo);
    assert.strictEqual(I.tr('Ver jogo'), '查看游戏');
    assert.strictEqual(I.tr('<kbd>Enter</kbd>Ver jogo', 0, true), '<kbd>Enter</kbd>Ver jogo');
    assert.strictEqual(I.tr('12 jogos'), '12 个游戏');
  });
  await t('português: nada é trocado', () => {
    I.iniciar('pt-BR');
    assert.strictEqual(I.tr('Remover da biblioteca'), 'Remover da biblioteca');
    assert.strictEqual(I.ativo, false);
  });

  // processo principal: caixas de diálogo traduzidas
  const lib = require(path.join(ROOT, 'src', 'lib.js'));
  await t('caixas de diálogo do Electron no idioma escolhido', async () => {
    lib.definirIdioma('es', 'pt-BR');
    let recebido = null;
    const d = lib.dialogoTraduzido({ showMessageBox: async o => { recebido = o; return { response: 0 }; } });
    await d.showMessageBox({ title: 'Importar biblioteca', message: 'Só importe se o backup é seu ou de alguém em quem você confia.', buttons: ['Importar', 'Cancelar'] });
    assert.deepStrictEqual(recebido.buttons, ['Importar', 'Cancelar']);
    assert.strictEqual(recebido.title, 'Importar biblioteca');
    assert.ok(/^Importa solo si/.test(recebido.message), recebido.message);
    lib.definirIdioma('ja', 'pt-BR');
    assert.strictEqual(lib.tr('Abrir o Arcade Hub'), 'Arcade Hub を開く');
    lib.definirIdioma('auto', 'pt-BR');
    assert.strictEqual(lib.tr('Abrir o Arcade Hub'), 'Abrir o Arcade Hub');
  });

  await t('padrão do app é inglês; quem tinha o "auto" antigo sem escolher passa para inglês', async () => {
    const d1 = tmp('i18n-padrao');
    assert.strictEqual(new lib.Store(d1).settings.idioma, 'en');
    const d2 = tmp('i18n-antigo');
    fs.writeFileSync(path.join(d2, 'library.json'), JSON.stringify({ games: [], favorites: [], hidden: [], settings: { idioma: 'auto' } }));
    assert.strictEqual(new lib.Store(d2).settings.idioma, 'en');
    // quem escolheu "Automático" de propósito continua no automático
    const st = new lib.Store(tmp('i18n-escolheu'));
    const h = {};
    lib.register({ handle: (k, f) => (h[k] = f) }, { shell: {}, dialog: {}, BrowserWindow: { getAllWindows: () => [] }, app: { getVersion: () => 'x', once: () => {}, getLocale: () => 'pt-BR' }, store: st, varrerAoAbrir: false, atrasoVigias: 1e9, atrasoConquistas: 1e9, atrasoDiscord: 1e9, semDualSense: true });
    assert.strictEqual(lib.tr('Abrir o Arcade Hub'), 'Open Arcade Hub');
    await h['settings:save']({}, { idioma: 'auto' });
    st.flush();
    const relido = new lib.Store(st.dir);
    assert.strictEqual(relido.settings.idioma, 'auto');
    assert.strictEqual(lib.tr('Abrir o Arcade Hub'), 'Abrir o Arcade Hub');   // Windows em português
  });

  // painel do DualSense Auto: o Python serve a tradução no idioma do Arcade Hub
  const nomes = [process.env.ARCADE_PYTHON, process.platform === 'win32' ? 'python' : 'python3', 'python'].filter(Boolean);
  const py = nomes.find(n => spawnSync(n, ['-c', 'import numpy, psutil'], { encoding: 'utf8' }).status === 0);
  if (!py) pular('painel do DualSense Auto traduzido', 'sem Python com numpy/psutil');
  else {
    const dados = tmp('i18n-ds');
    const filho = spawn(py, ['-I', path.join(ROOT, 'dualsense', 'dualsense_auto.py'), '--embutido', '--sessao', 'i18n', '--pai', String(process.pid)],
      { stdio: 'ignore', env: { ...process.env, DUALSENSE_AUTO_DADOS: dados, DSA_TOKEN: 'tk', DSA_IDIOMA: 'es', PYTHONDONTWRITEBYTECODE: '1' } });
    let porta = 0;
    for (let i = 0; i < 200 && !porta; i++) { await espera(100); try { porta = JSON.parse(fs.readFileSync(path.join(dados, '.painel.json'), 'utf8')).porta || 0; } catch { /* ainda não */ } }
    const pegar = caminho => new Promise(res => http.get({ host: '127.0.0.1', port: porta, path: caminho }, r => { let b = ''; r.on('data', c => (b += c)); r.on('end', () => res({ status: r.statusCode, corpo: b })); }).on('error', () => res({ status: 0, corpo: '' })));
    const js = await pegar('/i18n.js');
    const html = await pegar('/?t=tk');
    await t('painel do DualSense Auto: carrega a tradução no idioma do Arcade Hub', () => {
      assert.ok(porta > 0, 'o painel não abriu');
      assert.strictEqual(js.status, 200);
      assert.ok(js.corpo.includes('I18N.iniciar("es"'), js.corpo.slice(-300));
      assert.ok(js.corpo.includes('"Desligar o app":"Apagar la app"') || js.corpo.includes('"Desligar o app": "Apagar la app"'));
      assert.ok(html.corpo.includes('<script src="/i18n.js"></script>'));
    });
    filho.kill();
  }
  fim();
})();
