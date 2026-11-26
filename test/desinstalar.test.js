'use strict';
/** Desinstalar pelo app: Steam, Epic, desinstalador do Windows, Lixeira (com travas) e ROMs. */
const fs = require('fs'), path = require('path'), assert = require('assert');
const { tmp, t, fim, ROOT } = require('./_base');
const D = require(path.join(ROOT, 'src', 'desinstalar.js'));

const REG = [
  'HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Steam App 570',
  '    DisplayName    REG_SZ    Dota 2',
  '    UninstallString    REG_SZ    "C:\\Program Files (x86)\\Steam\\steam.exe" steam://uninstall/570',
  '    InstallLocation    REG_SZ    D:\\SteamLibrary\\steamapps\\common\\dota 2 beta',
  '',
  'HKEY_LOCAL_MACHINE\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\1207658924_is1',
  '    DisplayName    REG_SZ    The Witcher 3: Wild Hunt',
  '    UninstallString    REG_SZ    "D:\\GOG Games\\The Witcher 3\\unins000.exe"',
  '    InstallLocation    REG_SZ    D:\\GOG Games\\The Witcher 3\\',
  '',
  'HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\{ABC-123}',
  '    DisplayName    REG_SZ    Hollow Knight™',
  '    UninstallString    REG_EXPAND_SZ    MsiExec.exe /X{ABC-123}',
  '',
  'HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Escondido',
  '    DisplayName    REG_SZ    Celeste',
  '    UninstallString    REG_SZ    C:\\x\\u.exe',
  '    SystemComponent    REG_DWORD    0x1',
  ''
].join('\r\n');

(async () => {
  await t('lê a lista de desinstaladores do Windows (sem os componentes escondidos)', () => {
    const l = D.lerSaidaRegistro(REG);
    assert.deepStrictEqual(l.map(e => e.nome), ['Dota 2', 'The Witcher 3: Wild Hunt', 'Hollow Knight™']);
    assert.strictEqual(l[1].local, 'D:\\GOG Games\\The Witcher 3\\');
  });

  await t('separa o desinstalador dos argumentos', () => {
    assert.deepStrictEqual(D.separarComando('"D:\\GOG Games\\W3\\unins000.exe" /SILENT'), { arquivo: 'D:\\GOG Games\\W3\\unins000.exe', args: '/SILENT' });
    assert.deepStrictEqual(D.separarComando('MsiExec.exe /X{ABC-123}'), { arquivo: 'MsiExec.exe', args: '/X{ABC-123}' });
    assert.deepStrictEqual(D.separarComando('C:\\Program Files\\Jogo\\uninstall.exe --modo x'), { arquivo: 'C:\\Program Files\\Jogo\\uninstall.exe', args: '--modo x' });
  });

  await t('acha o desinstalador do jogo pela pasta ou pelo nome (sem pegar o da Steam para outro jogo)', () => {
    const l = D.lerSaidaRegistro(REG);
    assert.strictEqual(D.acharNoRegistro({ title: 'Witcher 3', installDir: 'D:/GOG Games/The Witcher 3', source: 'gog' }, l).nome, 'The Witcher 3: Wild Hunt');
    assert.strictEqual(D.acharNoRegistro({ title: 'Hollow Knight', installDir: '', source: 'folder' }, l).nome, 'Hollow Knight™');
    assert.strictEqual(D.acharNoRegistro({ title: 'Dota 2', installDir: 'E:/outro', source: 'folder' }, l), null);
    assert.strictEqual(D.acharNoRegistro({ title: 'Jogo X', installDir: 'D:/GOG Games', source: 'folder' }, l), null, 'pasta-mãe não vale');
  });

  await t('Lixeira: nunca a raiz do disco, pasta da biblioteca, pasta do sistema ou com outro jogo dentro', () => {
    const lib = { pastasBiblioteca: ['D:/Jogos'], outrosJogos: ['D:/Jogos/Celeste', 'D:/Jogos/Pack/Jogo2'] };
    assert.ok(!D.pastaSegura('D:/', lib).ok);
    assert.ok(!D.pastaSegura('D:/Jogos', lib).ok);
    assert.ok(!D.pastaSegura('D:/Jogos/Pack', lib).ok);
    assert.ok(D.pastaSegura('D:/Jogos/Hades', lib).ok);
    const casa = process.env.USERPROFILE || process.env.HOME;
    if (casa) assert.ok(!D.pastaSegura(casa, lib).ok);
  });

  await t('ROM: o .cue leva as faixas junto, sem sair da pasta', () => {
    const d = tmp('roms');
    fs.writeFileSync(path.join(d, 'Jogo (Disc 1).cue'), 'FILE "Jogo (Track 1).bin" BINARY\r\n  TRACK 01 MODE2/2352\r\nFILE "Jogo (Track 2).bin" BINARY\r\nFILE "../fora.bin" BINARY\r\n');
    fs.writeFileSync(path.join(d, 'Jogo (Track 1).bin'), 'x');
    fs.writeFileSync(path.join(d, 'Jogo (Track 2).bin'), 'x');
    fs.writeFileSync(path.join(d, 'Outro.bin'), 'x');
    fs.writeFileSync(path.join(d, 'Jogo.m3u'), 'Jogo (Disc 1).cue\n');
    const a = D.arquivosDaRom(path.join(d, 'Jogo.m3u')).map(f => path.basename(f)).sort();
    assert.deepStrictEqual(a, ['Jogo (Disc 1).cue', 'Jogo (Track 1).bin', 'Jogo (Track 2).bin', 'Jogo.m3u']);
  });

  await t('planeja o jeito certo para cada origem', async () => {
    const ctx = { desinstaladores: D.lerSaidaRegistro(REG), pastasBiblioteca: [], outrosJogos: [] };
    const steam = await D.planejar({ title: 'Dota 2', source: 'steam', launch: { type: 'steam', appId: '570' } }, ctx);
    assert.strictEqual(steam.metodo, 'steam');
    assert.strictEqual(steam.appId, '570');
    assert.strictEqual((await D.planejar({ title: 'Fortnite', source: 'epic', launch: { type: 'epic' } }, ctx)).metodo, 'epic');
    const d = tmp('jogo');
    const pasta = path.join(d, 'Hades');
    fs.mkdirSync(pasta);
    fs.writeFileSync(path.join(pasta, 'Hades.exe'), 'MZ');
    const lix = await D.planejar({ title: 'Hades', source: 'folder', installDir: pasta, launch: { type: 'exe', exe: path.join(pasta, 'Hades.exe') } }, ctx);
    assert.strictEqual(lix.metodo, 'lixeira');
    fs.writeFileSync(path.join(pasta, 'unins000.exe'), 'MZ');
    const des = await D.planejar({ title: 'Hades', source: 'folder', installDir: pasta, launch: { type: 'exe' } }, ctx);
    assert.strictEqual(des.metodo, 'desinstalador');
    assert.strictEqual(path.basename(des.arquivo), 'unins000.exe');
    const nada = await D.planejar({ title: 'Raiz', source: 'folder', installDir: d, launch: { type: 'exe' } }, { ...ctx, outrosJogos: [pasta] });
    assert.strictEqual(nada.metodo, 'nenhum', 'pasta com outro jogo dentro');
    const rom = path.join(d, 'mario.sfc');
    fs.writeFileSync(rom, 'x');
    assert.strictEqual((await D.planejar({ title: 'Mario', source: 'emulator', launch: { type: 'rom', rom } }, ctx)).metodo, 'rom');
    assert.strictEqual((await D.planejar({ title: 'Sumiu', source: 'emulator', launch: { type: 'rom', rom: rom + 'x' } }, ctx)).metodo, 'nenhum');
  });
  fim();
})();
