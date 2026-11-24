'use strict';
/** Tempo de jogo (vigia de processos de verdade), zip e backup com capas. */
const fs = require('fs'), path = require('path'), assert = require('assert'), { spawn, spawnSync } = require('child_process');
const { ROOT, tmp, t, pular, fim, espera } = require('./_base');
const lib = require(path.join(ROOT, 'src', 'lib.js'));
const { VigiaDeSessoes, pastaVigiavel, listarProcessos } = require(path.join(ROOT, 'src', 'sessions.js'));
const { criarZip, lerZip } = require(path.join(ROOT, 'src', 'zip.js'));
const T = tmp('sessoes');
(async () => {
  await t('pasta vigiável: recusa raiz, steamapps/common e pasta de varredura', () => {
    assert.ok(!pastaVigiavel('C:/'));
    assert.ok(!pastaVigiavel('S:/SteamLibrary/steamapps/common'));
    assert.ok(!pastaVigiavel('D:/Pirata', ['D:\\Pirata']));
    assert.ok(pastaVigiavel('S:/SteamLibrary/steamapps/common/Dying Light The Beast'));
  });

  // vigia de verdade: o "jogo" é uma cópia do Node dentro de uma pasta de jogo.
  // No Windows isso testa o PowerShell que lista os programas (processos-win.js).
  const pasta = path.join(T, 'Jogos', 'Meu Jogo');
  fs.mkdirSync(pasta, { recursive: true });
  const exe = path.join(pasta, process.platform === 'win32' ? 'jogo.exe' : 'jogo');
  fs.copyFileSync(process.execPath, exe); fs.chmodSync(exe, 0o755);
  if (await listarProcessos() === null) {
    pular('vigia: detecta o jogo rodando e o fim da sessão', 'sem lista de processos neste sistema');
  } else {
    const eventos = [];
    const lento = process.platform === 'win32';             // o PowerShell leva uns segundos na 1ª vez
    const v = new VigiaDeSessoes({ intervalo: lento ? 1500 : 300, esperaInicio: 60000, onInicio: g => eventos.push(['inicio', g.id]), onFim: (g, ms, info) => eventos.push(['fim', g.id, ms, info]) });
    v.vigiar({ id: 'j1', installDir: pasta }, { primeiraChecagem: 100 });
    const p = spawn(exe, ['-e', `setTimeout(() => {}, ${lento ? 9000 : 2500})`], { stdio: 'ignore' });
    for (let i = 0; i < 120 && !eventos.some(e => e[0] === 'fim'); i++) await espera(250);
    try { p.kill(); } catch { /* já saiu */ }
    await t('vigia: detecta o jogo rodando e o fim da sessão', () => {
      assert.strictEqual(eventos[0] && eventos[0][0], 'inicio', JSON.stringify(eventos));
      assert.strictEqual(eventos[1] && eventos[1][0], 'fim', JSON.stringify(eventos));
      assert.ok(eventos[1][2] > 500, 'ms=' + eventos[1][2]);
    });
    const outro = path.join(T, 'Jogos', 'Outro');
    fs.mkdirSync(outro, { recursive: true });
    eventos.length = 0;
    v.vigiar({ id: 'j2', installDir: outro }, { primeiraChecagem: 50, espera: 600 });
    for (let i = 0; i < 60 && !eventos.length; i++) await espera(250);
    await t('vigia: jogo que nunca abriu encerra com nuncaAbriu', () => assert.ok(eventos.some(e => e[0] === 'fim' && e[3].nuncaAbriu), JSON.stringify(eventos)));
  }

  // sessão gravada com histórico
  const s = new lib.Store(path.join(T, 'data'));
  s.addGame({ id: 'g', title: 'G', source: 'manual', kind: 'game', launch: { type: 'exe', exe: '/x.exe' } });
  lib.registrarSessao(s, 'g', 60000); lib.registrarSessao(s, 'g', 5000); lib.registrarSessao(s, 'g', 120000);
  await t('sessões: soma e histórico (ignora < 20s)', () => {
    const pt = s.games[0].playtime;
    assert.strictEqual(pt.totalMs, 180000); assert.strictEqual(pt.sessions, 2); assert.strictEqual(pt.history.length, 2);
  });

  // zip ida e volta
  const png = fs.readFileSync(path.join(ROOT, 'assets', 'icon.png'));
  const z = criarZip([{ name: 'a.json', data: Buffer.from('{"x":1}'.repeat(50)) }, { name: 'capas/ícone.png', data: png, compress: false }]);
  const lido = lerZip(z);
  await t('zip: escreve e lê (deflate + store + nome UTF-8)', () => {
    assert.strictEqual(lido.get('a.json')().toString(), '{"x":1}'.repeat(50));
    assert.ok(lido.get('capas/ícone.png')().equals(png));
  });
  const zipArq = path.join(T, 'z.zip');
  fs.writeFileSync(zipArq, z);
  if (process.platform === 'win32') {
    // o leitor de zip do .NET é o mesmo do Windows Explorer e do Expand-Archive
    await t('zip: o Windows lê o arquivo (.NET ZipFile)', () => {
      const ps = `Add-Type -AssemblyName System.IO.Compression.FileSystem; $z = [IO.Compression.ZipFile]::OpenRead('${zipArq}'); $z.Entries | ForEach-Object { $_.FullName + '|' + $_.Length }; $z.Dispose()`;
      const r = spawnSync('powershell.exe', ['-NoProfile', '-Command', ps], { encoding: 'utf8' });
      assert.strictEqual(r.status, 0, 'saída: ' + r.stdout + ' erro: ' + r.stderr);
      assert.ok(/a\.json\|350/.test(r.stdout), 'entradas: ' + r.stdout + ' erro: ' + r.stderr);
    });
    await t('zip: o Windows extrai o arquivo com o conteúdo certo', () => {
      // (o Expand-Archive do PowerShell do servidor do GitHub tem um defeito
      //  próprio; o .NET é o que o Explorador de Arquivos usa)
      const destino = path.join(T, 'aberto');
      const ps = `Add-Type -AssemblyName System.IO.Compression.FileSystem; [IO.Compression.ZipFile]::ExtractToDirectory('${zipArq}', '${destino}')`;
      const r = spawnSync('powershell.exe', ['-NoProfile', '-Command', ps], { encoding: 'utf8' });
      const a = path.join(destino, 'a.json');
      assert.ok(fs.existsSync(a), 'status ' + r.status + ' erro: ' + r.stderr);
      assert.strictEqual(fs.readFileSync(a, 'utf8'), '{"x":1}'.repeat(50));
      assert.ok(fs.readFileSync(path.join(destino, 'capas', 'ícone.png')).equals(png));
    });
  } else if (spawnSync('unzip', ['-v']).status === 0) {
    await t('zip: unzip do sistema aceita o arquivo', () => {
      const out = spawnSync('unzip', ['-t', zipArq], { encoding: 'utf8' }).stdout;
      assert.ok(/No errors detected/.test(out), out);
    });
  } else pular('zip: unzip do sistema', 'sem unzip');

  // backup .zip com capa, importado em outra "máquina"
  const artDir = path.join(T, 'data', 'art'); fs.mkdirSync(artDir, { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'assets', 'icon.png'), path.join(artDir, 'cover-x.png'));
  const urlCapa = require('url').pathToFileURL(path.join(artDir, 'cover-x.png')).href;
  s.updateGame('g', { art: urlCapa, customArt: urlCapa });
  s.flush();
  const info = lib.exportLibrary(s, path.join(T, 'backup.zip'));
  await t('exportar .zip leva a capa', () => assert.strictEqual(info.capas, 1));
  const s2 = new lib.Store(path.join(T, 'outra-maquina'));
  const b = lib.lerBackup(path.join(T, 'backup.zip'));
  const r = lib.importLibrary(s2, path.join(T, 'backup.zip'), 'merge', b);
  const g2 = s2.games.find(x => x.id === 'g');
  await t('importar .zip recria a capa na pasta nova', () => {
    assert.strictEqual(r.capas, 1);
    assert.ok(path.resolve(lib.caminhoDeFileUrl(g2.art)).startsWith(path.join(T, 'outra-maquina', 'art')), g2.art);
    assert.ok(fs.readFileSync(lib.caminhoDeFileUrl(g2.art)).equals(png));
    assert.strictEqual(g2.playtime.history.length, 2);
  });
  // zip malicioso: capa com nome de caminho e conteúdo que não é imagem
  const mau = criarZip([
    { name: 'biblioteca.json', data: Buffer.from(JSON.stringify({ games: [
      { id: 'm1', title: 'M1', launch: { type: 'exe', exe: 'C:/x.exe' }, art: 'zip:capas/../../evil.png' },
      { id: 'm2', title: 'M2', launch: { type: 'exe', exe: 'C:/y.exe' }, art: 'zip:capas/falsa.png' }] })) },
    { name: 'capas/../../evil.png', data: png, compress: false },
    { name: 'capas/falsa.png', data: Buffer.from('MZ isto é um exe'.repeat(10)), compress: false }]);
  fs.writeFileSync(path.join(T, 'mau.zip'), mau);
  const s3 = new lib.Store(path.join(T, 'vitima'));
  lib.importLibrary(s3, path.join(T, 'mau.zip'), 'merge');
  await t('zip malicioso: não escreve fora da pasta nem aceita "imagem" falsa', () => {
    assert.ok(!fs.existsSync(path.join(T, 'evil.png')) && !fs.existsSync(path.join(path.dirname(T), 'evil.png')));
    const m2 = s3.games.find(x => x.id === 'm2');
    assert.strictEqual(m2.art, null);
    const m1 = s3.games.find(x => x.id === 'm1');
    assert.ok(m1.art === null || path.resolve(lib.caminhoDeFileUrl(m1.art)).startsWith(path.join(T, 'vitima', 'art')), m1.art);
  });
  s.flush(); s2.flush(); s3.flush();
  fim();
})();
