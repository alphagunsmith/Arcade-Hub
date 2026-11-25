'use strict';
/** Perfis, conquistas e Modo Console (energia, emuladores, BIOS). */
const fs = require('fs'), path = require('path'), assert = require('assert'), crypto = require('crypto');
const { ROOT, tmp, t, fim } = require('./_base');
const lib = require(path.join(ROOT, 'src', 'lib.js'));
const C = require(path.join(ROOT, 'src', 'conquistas.js'));
const M = require(path.join(ROOT, 'src', 'console.js'));

const H = 3600000, D = 86400000;
const em = (dia, hora) => new Date(2026, 0, dia, hora, 0, 0).getTime();     // jan/2026 (dia 3 = sábado)
const jogo = (id, extra, sessoes) => ({ id, title: id, ...extra, playtime: { history: sessoes } });

(async () => {
  await t('sem sessões: nada desbloqueado, progresso zerado', () => {
    const r = C.avaliar({ jogos: [jogo('a', {}, [])], perfil: 'p1', principal: 'p1' });
    assert.strictEqual(r.pontos, 0);
    assert.ok(r.lista.every(x => !x.quando));
  });

  const jogos = [
    jogo('a', { source: 'steam' }, [
      { at: em(3, 23), ms: 3.5 * H, perfil: 'p1' },          // sábado, maratona
      { at: em(4, 3), ms: 1 * H, perfil: 'p1' },             // domingo de madrugada
      { at: em(5, 20), ms: 0.5 * H }                          // sessão antiga, sem perfil → principal
    ]),
    jogo('b', { source: 'epic' }, [{ at: em(6, 20), ms: H, perfil: 'p2' }]),
    jogo('c', { kind: 'rom', platformKey: 'snes' }, [{ at: em(7, 20), ms: H, perfil: 'p1' }])
  ];
  const r1 = C.avaliar({ jogos, perfil: 'p1', principal: 'p1' });
  const tem = (r, id) => !!r.lista.find(x => x.id === id).quando;
  await t('maratona, coruja, fim de semana e 1 hora desbloqueiam com a data da sessão', () => {
    for (const id of ['primeira', 'horas1', 'maratona', 'coruja', 'fds']) assert.ok(tem(r1, id), id);
    assert.strictEqual(r1.lista.find(x => x.id === 'maratona').quando, em(3, 23));
    assert.ok(!tem(r1, 'ultramaratona'));
  });
  await t('sessões antigas (sem perfil) contam para o perfil principal', () => {
    assert.strictEqual(r1.lista.find(x => x.id === 'sessoes10').atual, 4);
  });
  await t('o tempo de outro perfil não entra', () => {
    const r2 = C.avaliar({ jogos, perfil: 'p2', principal: 'p1' });
    assert.ok(tem(r2, 'primeira') && !tem(r2, 'maratona'));
    assert.strictEqual(r2.lista.find(x => x.id === 'sessoes10').atual, 1);
  });
  await t('progresso parcial: 5 jogos diferentes', () => {
    const v = r1.lista.find(x => x.id === 'variado5');
    assert.strictEqual(v.atual, 2); assert.strictEqual(v.meta, 5); assert.ok(!v.quando);
  });
  await t('desbloqueada fica guardada mesmo se o histórico sumir', () => {
    const r = C.avaliar({ jogos: [], perfil: 'p1', principal: 'p1', guardadas: r1.guardadas });
    assert.ok(tem(r, 'maratona')); assert.strictEqual(r.novas.length, 0); assert.strictEqual(r.pontos, r1.pontos);
  });
  await t('sequência de 7 dias', () => {
    const seq = Array.from({ length: 7 }, (_, i) => ({ at: em(10 + i, 21), ms: 0.5 * H, perfil: 'p1' }));
    const r = C.avaliar({ jogos: [jogo('x', {}, seq)], perfil: 'p1', principal: 'p1' });
    assert.ok(tem(r, 'sequencia7')); assert.ok(tem(r, 'fiel'));
  });

  await t('perfis: lista padrão com o usuário do PC; validação do que vem da tela', () => {
    assert.strictEqual(lib.perfisDe({}).length, 1);
    const l = lib.limparPerfis([{ id: 'a', nome: '  Ana Beatriz da Silva Souza Lima  ', cor: 'red', avatar: '🦊🦊🦊' }, { id: 'a', nome: 'dup' }, { nome: '' }]);
    assert.strictEqual(l.length, 2);
    assert.strictEqual(l[0].nome.length <= 24, true);
    assert.ok(/^#[0-9a-f]{6}$/i.test(l[0].cor));
    assert.strictEqual([...l[0].avatar].length, 2);
    assert.throws(() => lib.limparPerfis([]));
  });

  // núcleo registrado com IPC falso: sessão marcada com o perfil ativo e aviso de conquista
  const D1 = tmp('console');
  const st = new lib.Store(path.join(D1, 'data'));
  st.addGame({ title: 'Jogo X', launch: { type: 'url', url: 'steam://rungameid/1' } });
  const h = {}; const enviados = [];
  const BW = { getAllWindows: () => [{ isDestroyed: () => false, webContents: { send: (c, d) => enviados.push([c, d]) } }] };
  lib.register({ handle: (c, f) => (h[c] = f) }, { shell: { openExternal: async () => {} }, dialog: {}, BrowserWindow: BW, app: { getVersion: () => 'x', once: () => {} }, store: st, varrerAoAbrir: false, atrasoVigias: 1e9, atrasoConquistas: 1e9, vigia: { vigiar: () => true, parar: () => {}, itens: new Map() } });
  await h['perfis:salvar']({}, [{ id: 'p1', nome: 'Davi' }, { id: 'p2', nome: 'Ana' }]);
  await h['perfis:ativar']({}, 'p2');
  const id = st.games[0].id;
  // sessão longa, terminada agora
  lib.registrarSessao(st, id, 3.2 * H);
  await t('a sessão fica marcada com o perfil que estava ativo', () => {
    assert.strictEqual(st.games[0].playtime.history.slice(-1)[0].perfil, 'p2');
  });
  const lista = await h['conquistas:listar']({}, 'p2');
  await t('conquistas do perfil ativo saem pelo IPC', () => {
    assert.ok(lista.ok);
    assert.ok(lista.data.lista.find(x => x.id === 'maratona').quando);
    assert.ok(lista.data.pontos > 0 && lista.data.total > lista.data.pontos);
  });
  await t('primeira partida de um perfil novo avisa na tela', async () => {
    await h['perfis:salvar']({}, [{ id: 'p1', nome: 'Davi' }, { id: 'p2', nome: 'Ana' }, { id: 'p3', nome: 'Bia' }]);
    await h['perfis:ativar']({}, 'p3');
    enviados.length = 0;
    lib.registrarSessao(st, id, 60000);
    // (o app chama checarConquistas depois de cada sessão; aqui pelo IPC)
    const r = await h['conquistas:listar']({}, 'p3');
    assert.ok(r.data.lista.find(x => x.id === 'primeira').quando);
    assert.ok(enviados.some(([c, d]) => c === 'conquista:nova' && d.conquistas.some(x => x.id === 'primeira')), JSON.stringify(enviados));
  });
  await t('estado traz perfis e Modo Console', async () => {
    const s = await h['state:get']({});
    const d = s.data || s;
    assert.strictEqual(d.perfilAtivo, 'p3');
    assert.strictEqual(d.perfis.length, 3);
    assert.ok(d.modoConsole && typeof d.modoConsole.iniciarComWindows === 'boolean');
  });
  await t('energia: só aceita as 3 ações', async () => {
    const r = await h['console:energia']({}, 'formatar');
    assert.strictEqual(r.ok, false);
  });
  await t('usar emulador: recusa um que o app não achou', async () => {
    assert.strictEqual((await h['console:usarEmulador']({}, 'ps1', 'duckstation')).ok, false);
  });

  // energia com o comando trocado (não desliga o PC de quem roda o teste)
  await t('energia: monta o comando certo e repassa o erro', async () => {
    let chamado = null;
    const r = await M.energia('reiniciar', (exe, args, cb) => { chamado = [exe, args]; cb(null); });
    if (process.platform === 'win32') assert.deepStrictEqual(chamado, ['shutdown.exe', ['/r', '/t', '0']]);
    else if (process.platform === 'linux') assert.deepStrictEqual(chamado, ['systemctl', ['reboot']]);
    assert.ok(r.ok || process.platform === 'darwin');
    const e = await M.energia('desligar', (x, a, cb) => cb(new Error('acesso negado')));
    assert.ok(!e.ok);
  });

  // BIOS
  const bios = path.join(D1, 'bios');
  fs.mkdirSync(path.join(bios, 'dc'), { recursive: true });
  fs.writeFileSync(path.join(bios, 'SCPH5501.BIN'), 'nao e a bios de verdade');
  fs.writeFileSync(path.join(bios, 'dc', 'dc_flash.bin'), 'x');
  await t('BIOS: acha o arquivo sem ligar para maiúsculas e avisa que a versão não é conhecida', () => {
    const r = M.conferirBios('ps1', [bios]);
    const a = r.arquivos.find(x => x.nome === 'scph5501.bin');
    assert.strictEqual(a.estado, 'desconhecida');
    assert.strictEqual(r.ok, true);                 // basta uma, mesmo desconhecida
  });
  await t('BIOS: Dreamcast precisa dos dois arquivos (na subpasta dc)', () => {
    const r = M.conferirBios('dreamcast', [bios]);
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.arquivos.find(x => x.nome === 'dc_flash.bin').estado, 'valida');
  });
  await t('BIOS: MD5 conhecido vira "válida"', () => {
    const gba = path.join(D1, 'gba'); fs.mkdirSync(gba);
    fs.writeFileSync(path.join(gba, 'gba_bios.bin'), 'teste');
    const orig = M.BIOS.gba.arquivos['gba_bios.bin'];
    M.BIOS.gba.arquivos['gba_bios.bin'] = crypto.createHash('md5').update('teste').digest('hex');
    try { assert.strictEqual(M.conferirBios('gba', [gba]).arquivos[0].estado, 'valida'); } finally { M.BIOS.gba.arquivos['gba_bios.bin'] = orig; }
  });
  await t('console sem BIOS na lista: null', () => assert.strictEqual(M.conferirBios('snes', [bios]), null));
  await t('emuladores: acha o instalado no lugar de costume', () => {
    const achados = M.acharInstalados(p => /retroarch\.exe$/i.test(p) && /RetroArch-Win64/.test(p));
    assert.ok(achados.retroarch && !achados.pcsx2);
  });
  await t('status por console: conta ROMs, mostra recomendados e BIOS', () => {
    const lista = M.statusEmuladores({ emulators: {}, retroarch: { exe: '' } }, [{ kind: 'rom', platformKey: 'ps1' }, { kind: 'rom', platformKey: 'ps1' }, { kind: 'rom', platformKey: 'snes' }], { ps1: 'PlayStation', snes: 'SNES' }, {});
    assert.deepStrictEqual(lista.map(x => x.platformKey), ['ps1', 'snes']);
    assert.strictEqual(lista[0].jogos, 2);
    assert.strictEqual(lista[0].recomendados[0].nome, 'DuckStation');
    assert.ok(lista[0].bios && !lista[0].emulador.configurado);
  });
  fim();
})();
