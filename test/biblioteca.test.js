'use strict';
/** O library.json danificado não apaga a biblioteca; chaves de API não ficam em texto. */
const fs = require('fs'), path = require('path'), assert = require('assert');
const { ROOT, tmp, t, fim } = require('./_base');
const lib = require(path.join(ROOT, 'src', 'lib.js'));

(async () => {
  const D = tmp('biblioteca');
  const arq = path.join(D, 'library.json');
  let s = new lib.Store(D);
  s.load().games.push({ id: 'a', title: 'Jogo 1' }, { id: 'b', title: 'Jogo 2' });
  s.saveSettings({ youtubeKey: 'AIzaSEGREDO', sgdbKey: 'sgdb-segredo' });
  s.flush();
  s.load().games.push({ id: 'c', title: 'Jogo 3' });
  s.save(); s.flush();
  const disco = fs.readFileSync(arq, 'utf8');

  await t('chaves de API não ficam em texto no disco', () => {
    assert.ok(!disco.includes('AIzaSEGREDO') && !disco.includes('sgdb-segredo'));
  });
  await t('na memória, as chaves voltam em texto', () => {
    const s2 = new lib.Store(D);
    assert.strictEqual(s2.settings.youtubeKey, 'AIzaSEGREDO');
    assert.strictEqual(s2.settings.sgdbKey, 'sgdb-segredo');
  });
  await t('cada gravação guarda a anterior em .bak', () => assert.ok(fs.existsSync(arq + '.bak')));

  fs.writeFileSync(arq, disco.slice(0, disco.length - 7));     // queda de energia no meio da gravação
  s = new lib.Store(D);
  await t('arquivo danificado: recupera da gravação anterior', () => {
    assert.strictEqual(s.games.length, 2);
    assert.strictEqual(s.recuperado.de, 'library.json.bak');
    assert.ok(fs.existsSync(path.join(D, s.recuperado.danificado)), 'guardou o danificado');
  });
  s.saveSettings({ x: 1 }); s.flush(); s.saveSettings({ y: 1 }); s.flush();
  await t('depois de recuperar, as gravações seguintes não estragam a cópia', () => {
    assert.strictEqual(new lib.Store(D).games.length, 2);
    assert.strictEqual(JSON.parse(fs.readFileSync(arq + '.bak', 'utf8')).games.length, 2);
  });

  fs.unlinkSync(arq);                                          // sumiu entre as duas trocas de arquivo
  await t('arquivo sumido com .bak: recupera', () => assert.strictEqual(new lib.Store(D).games.length, 2));

  fs.writeFileSync(arq, 'lixo'); fs.writeFileSync(arq + '.bak', 'lixo');
  s = new lib.Store(D);
  await t('sem cópia boa: começa vazio, mas avisa e guarda o danificado', () => {
    assert.strictEqual(s.games.length, 0);
    assert.strictEqual(s.recuperado.de, null);
    assert.ok(fs.existsSync(path.join(D, s.recuperado.danificado)));
  });

  const novo = tmp('biblioteca-nova');
  await t('primeira execução: sem aviso', () => { const n = new lib.Store(novo); assert.strictEqual(n.games.length, 0); assert.strictEqual(n.recuperado, null); });

  await t('biblioteca antiga com chave em texto continua funcionando', () => {
    const velho = tmp('biblioteca-velha');
    fs.writeFileSync(path.join(velho, 'library.json'), JSON.stringify({ games: [], settings: { youtubeKey: 'AIzaVELHA' } }));
    const v = new lib.Store(velho);
    assert.strictEqual(v.settings.youtubeKey, 'AIzaVELHA');
    v.save(); v.flush();
    assert.ok(!fs.readFileSync(path.join(velho, 'library.json'), 'utf8').includes('AIzaVELHA'));
  });
  fim();
})();
