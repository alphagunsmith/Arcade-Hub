'use strict';
/** Varredura de ROMs, backup, links perigosos, abrir jogos e gravação da biblioteca. */
const fs = require('fs'), path = require('path'), assert = require('assert');
const { ROOT, tmp, t, pular, fim } = require('./_base');
const lib = require(path.join(ROOT, 'src', 'lib.js'));
const T = tmp('varredura');
const R = path.join(T, 'roms');
const mk = (f, c = 'x') => { fs.mkdirSync(path.dirname(path.join(R, f)), { recursive: true }); fs.writeFileSync(path.join(R, f), c); };
mk('PS1/Crash/Crash Bandicoot (USA).cue', 'FILE "Crash Bandicoot (USA) (Track 1).bin" BINARY\n  TRACK 01 MODE2/2352\nFILE "Crash Bandicoot (USA) (Track 2).bin" BINARY\n');
mk('PS1/Crash/Crash Bandicoot (USA) (Track 1).bin'); mk('PS1/Crash/Crash Bandicoot (USA) (Track 2).bin');
mk('PS1/FF7/Final Fantasy VII.m3u', 'FF7 (Disc 1).cue\nFF7 (Disc 2).cue\n');
mk('PS1/FF7/FF7 (Disc 1).cue', 'FILE "FF7 (Disc 1).bin" BINARY'); mk('PS1/FF7/FF7 (Disc 1).bin');
mk('PS1/FF7/FF7 (Disc 2).cue', 'FILE "FF7 (Disc 2).bin" BINARY'); mk('PS1/FF7/FF7 (Disc 2).bin');
mk('Mega Drive/Sonic.bin');
mk('PSP/Patapon.iso'); mk('Dreamcast/Shenmue.gdi', '1\n1 0 4 2352 track01.bin 0\n'); mk('Dreamcast/track01.bin');
const s = new lib.Store(path.join(T, 'data'));
s.saveSettings({ romFolders: [R], includeStoreLaunchers: false });

(async () => {
  let g = lib.runScan(s);
  const nomes = g.map(x => `${x.title} [${x.platformKey}]`).sort();
  await t('cue/bin, m3u e gdi viram 1 jogo cada', () => assert.deepStrictEqual(nomes,
    ['Crash Bandicoot [ps1]', 'Final Fantasy VII [ps1]', 'Shenmue [dreamcast]', 'Patapon [psp]', 'Sonic [genesis]'].sort()));
  await t('pasta "dcosta" não vira Dreamcast', () => assert.strictEqual(lib.refineDiscPlatform('C:/Users/dcosta/ROMs/FF7.cue'), 'ps1'));
  await t('"CD" no caminho não vira PC Engine', () => assert.strictEqual(lib.refineDiscPlatform('D:/Jogos/CD/Crash.cue'), 'ps1'));
  await t('PC Engine CD continua PC Engine', () => assert.strictEqual(lib.refineDiscPlatform('D:/ROMs/PC Engine CD/Ys.cue'), 'pce'));
  await t('Dreamcast/Saturn/PSP configuráveis', () => ['dreamcast', 'saturn', 'psp'].forEach(p => assert.ok(s.settings.emulators[p], p)));

  const crash = g.find(x => /Crash/.test(x.title));
  s.updateGame(crash.id, { playtime: { totalMs: 3600000, sessions: 3 }, meta: { score: 90, at: 1 }, genres: ['acao'] });
  g = lib.runScan(s);
  const c2 = g.find(x => x.id === crash.id);
  await t('reescanear mantém tempo de jogo, nota e gêneros', () => { assert.strictEqual(c2.playtime.totalMs, 3600000); assert.strictEqual(c2.meta.score, 90); assert.deepStrictEqual(c2.genres, ['acao']); });
  await t('launchersOk não é mais copiado para cada jogo', () => assert.ok(!('launchersOk' in c2)));

  // import replace
  const bk = path.join(T, 'bk.json');
  fs.writeFileSync(bk, JSON.stringify({ games: [
    { id: 'novo', title: 'Novo', launch: { type: 'url', url: 'https://example.com' } },
    { id: 'mau', title: 'Mau', launch: { type: 'url', url: 'ms-msdt:/id PCWDiagnostic' } },
    { id: 'exe', title: 'Exe', launch: { type: 'exe', exe: 'C:/x/virus.exe' } }],
    settings: { emulators: { nes: { exe: 'C:/evil.exe' } } } }));
  const b = lib.lerBackup(bk);
  await t('backup: link perigoso é descartado', () => { assert.strictEqual(b.games.length, 2); assert.strictEqual(b.ignorados, 1); });
  await t('backup: lista programas para confirmação', () => assert.deepStrictEqual(lib.programasDoBackup(b, 'replace').sort(), ['C:/evil.exe', 'C:/x/virus.exe']));
  const r = lib.importLibrary(s, bk, 'replace');
  await t('importar "substituir" substitui de verdade', () => assert.strictEqual(r.total, 2));

  await t('URLs: só esquemas permitidos', () => {
    assert.ok(lib.urlPermitida('steam://rungameid/10')); assert.ok(lib.urlPermitida('https://x.com'));
    assert.ok(!lib.urlPermitida('file:///C:/Windows/System32/calc.exe')); assert.ok(!lib.urlPermitida('search-ms:query=x'));
  });
  await t('plano de lançamento recusa link perigoso', () => assert.strictEqual(lib.buildLaunchPlan({ launch: { type: 'url', url: 'ms-msdt:x' } }, {}).kind, 'broken'));

  // IPC: launch / openPath
  const handlers = {}; const opened = [];
  const ipcMain = { handle: (c, f) => { handlers[c] = f; } };
  const shell = { openPath: async p => { opened.push(p); return ''; }, openExternal: async u => opened.push(u), showItemInFolder: () => {} };
  const app = { getVersion: () => '1.0.1', once: () => {} };
  const st2 = new lib.Store(path.join(T, 'data2'));
  lib.register(ipcMain, { shell, dialog: {}, BrowserWindow: { getAllWindows: () => [] }, app, store: st2 });
  const naoexec = path.join(T, 'naoexec.exe'), sumiu = path.join(T, 'sumiu.exe');
  fs.writeFileSync(naoexec, 'MZ');               // existe mas não é executável aqui
  st2.addGame({ id: 'x', title: 'X', source: 'manual', kind: 'game', launch: { type: 'exe', exe: naoexec, args: '-x' } });
  st2.addGame({ id: 'y', title: 'Y', source: 'manual', kind: 'game', launch: { type: 'exe', exe: naoexec } });
  st2.addGame({ id: 'z', title: 'Z', source: 'manual', kind: 'game', launch: { type: 'exe', exe: sumiu } });
  if (process.platform === 'linux') {
    // aqui, um arquivo sem permissão de execução imita o "precisa de admin" do Windows
    const res = await handlers['game:launch']({ sender: { isDestroyed: () => true } }, 'x');
    await t('lançar: erro do sistema chega ao usuário (não diz "ok")', () => { assert.strictEqual(res.ok, false); });
    const resY = await handlers['game:launch']({ sender: { isDestroyed: () => true } }, 'y');
    await t('lançar: exige admin e sem args → abre pelo shell (UAC)', () => { assert.ok(resY.ok && resY.data.elevated); assert.strictEqual(opened.pop(), naoexec); });
  } else pular('lançar .exe falso', 'só no Linux');
  const resZ = await handlers['game:launch']({ sender: { isDestroyed: () => true } }, 'z');
  await t('lançar: arquivo sumido dá erro claro', () => { assert.ok(!resZ.ok && /não encontrado/.test(resZ.error)); });
  const rp = await handlers['app:openPath']({}, naoexec);
  await t('"Abrir pasta" com um .exe abre a pasta, não executa', () => { assert.ok(rp.ok); assert.strictEqual(opened.pop(), T); });
  const ra = await handlers['game:add']({}, { title: 'Mau', launch: { type: 'url', url: 'file:///C:/Windows/System32/calc.exe' } });
  await t('adicionar jogo com link perigoso é recusado', () => assert.strictEqual(ra.ok, false));
  const ru = await handlers['game:update']({}, { id: 'x', patch: { launch: { type: 'exe', exe: naoexec, args: '-windowed' } } });
  await t('editar launch marca launchEdited', () => assert.ok(ru.ok && ru.data.launchEdited && ru.data.launch.args === '-windowed'));
  const sc = await handlers['scan:run']();
  await t('scan pelo IPC funciona (fallback síncrono fora do Electron)', () => assert.ok(sc.ok));

  // debounce + flush
  const st3 = new lib.Store(path.join(T, 'data3'));
  for (let i = 0; i < 50; i++) st3.saveSettings({ n: i });
  await t('gravação agrupada: nada escrito antes do flush', () => assert.ok(!fs.existsSync(path.join(T, 'data3', 'library.json'))));
  st3.flush();
  await t('flush grava o estado final', () => assert.strictEqual(JSON.parse(fs.readFileSync(path.join(T, 'data3', 'library.json'))).settings.n, 49));
  st2.flush(); s.flush();
  fim();
})();
