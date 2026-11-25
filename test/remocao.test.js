'use strict';
/** Jogos que saíram do PC somem da biblioteca (e voltam com tudo se reinstalados). */
const fs = require('fs'), path = require('path'), assert = require('assert');
const { ROOT, tmp, t, fim } = require('./_base');
const lib = require(path.join(ROOT, 'src', 'lib.js'));

const relatorio = fontes => ({ startedAt: Date.now(), sources: fontes, problems: [], duplicates: 0, total: 0 });

(async () => {
  const T = tmp('remocao');
  const pastaSteam = path.join(T, 'steamapps', 'common', 'Jogo A');
  fs.mkdirSync(pastaSteam, { recursive: true });                  // a Steam deixou a pasta para trás
  fs.mkdirSync(path.join(T, 'steamapps', 'common', 'C'), { recursive: true });
  const exeB = path.join(T, 'Jogos', 'B', 'b.exe'); fs.mkdirSync(path.dirname(exeB), { recursive: true }); fs.writeFileSync(exeB, 'MZ');
  const st = new lib.Store(path.join(T, 'data'));
  const A = { id: 'steam-1', title: 'Jogo A', source: 'steam', installDir: pastaSteam, launch: { type: 'steam', appId: '1' } };
  const C = { id: 'steam-2', title: 'Jogo C', source: 'steam', installDir: path.join(T, 'steamapps', 'common', 'C'), launch: { type: 'steam', appId: '2' } };
  const B = { id: 'pasta-b', title: 'Jogo B', source: 'folder', installDir: path.dirname(exeB), launch: { type: 'exe', exe: exeB } };
  const M = { id: 'manual-1', title: 'Meu atalho', source: 'manual', launch: { type: 'url', url: 'https://x.y' } };
  lib.finishScan(st, [A, C, B], relatorio({ steam: { found: 2 } }));
  st.addGame(M);
  st.updateGame('steam-1', { customArt: 'file:///capa.png', playtime: { totalMs: 3600000, sessions: 2, history: [{ at: 1, ms: 3600000, perfil: 'p1' }] } });

  // desinstalou o Jogo A (a pasta ficou) e apagou o executável do Jogo B
  fs.unlinkSync(exeB);
  lib.finishScan(st, [C], relatorio({ steam: { found: 1 } }));
  const ids = () => st.games.map(g => g.id).sort();
  await t('desinstalado da Steam sai, mesmo com a pasta ainda no disco', () => assert.ok(!ids().includes('steam-1')));
  await t('jogo de pasta sem o executável sai, mesmo com a pasta lá', () => assert.ok(!ids().includes('pasta-b')));
  await t('o que ainda está instalado e o adicionado à mão ficam', () => assert.deepStrictEqual(ids(), ['manual-1', 'steam-2']));
  await t('a varredura conta quem saiu', () => assert.deepStrictEqual(st.load().lastScanReport.removidos.sort(), ['Jogo A', 'Jogo B']));

  lib.finishScan(st, [A, C], relatorio({ steam: { found: 2 } }));
  const volta = st.games.find(g => g.id === 'steam-1');
  await t('reinstalou: volta com tempo de jogo, histórico e capa', () => {
    assert.ok(volta);
    assert.strictEqual(volta.playtime.totalMs, 3600000);
    assert.strictEqual(volta.playtime.history.length, 1);
    assert.strictEqual(volta.art, 'file:///capa.png');
    assert.ok(!st.load().arquivados['steam-1']);
  });

  lib.finishScan(st, [], relatorio({ steam: { found: 0 } }));
  await t('Steam de repente não acha nada: desconfia e não apaga', () => assert.ok(ids().includes('steam-1') && ids().includes('steam-2')));
  lib.finishScan(st, [], relatorio({ steam: { found: 0, error: 'registro ilegível' } }));
  await t('erro lendo a Steam: não apaga', () => assert.ok(ids().includes('steam-1')));
  lib.finishScan(st, [], relatorio({}));
  await t('varredura das lojas desligada: não apaga os jogos delas', () => assert.ok(ids().includes('steam-1')));

  // limpeza manual pelo IPC
  const romSumida = { id: 'rom-x', title: 'ROM X', source: 'emulator', kind: 'rom', platformKey: 'snes', launch: { type: 'rom', rom: path.join(T, 'nao-existe.sfc') } };
  st.addGame(romSumida);
  const h = {};
  lib.register({ handle: (k, f) => (h[k] = f) }, { shell: {}, dialog: {}, BrowserWindow: { getAllWindows: () => [] }, app: { getVersion: () => 'x', once: () => {} }, store: st, varrerAoAbrir: false, atrasoVigias: 1e9, atrasoConquistas: 1e9, atrasoDiscord: 1e9 });
  const lista = await h['library:sumidos']({});
  await t('lista o que não está mais no PC', () => assert.deepStrictEqual(lista.data.map(x => x.id), ['rom-x']));
  const r = await h['library:limparSumidos']({});
  await t('remove de uma vez e guarda para voltar', () => {
    assert.deepStrictEqual(r.data.removidos, ['ROM X']);
    assert.ok(!ids().includes('rom-x'));
    assert.ok(st.load().arquivados['rom-x']);
  });
  fim();
})();
