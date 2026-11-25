'use strict';
/** Jogo online P2P sem Discord: código de convite, .cfg do RetroArch, retransmissão, rede de casa e o fluxo completo. */
const fs = require('fs'), path = require('path'), assert = require('assert');
const { EventEmitter } = require('events');
const { tmp, t, fim, espera, ROOT } = require('./_base');
const P = require(path.join(ROOT, 'src', 'p2p.js'));
const lib = require(path.join(ROOT, 'src', 'lib.js'));
const esperar = async (cond, ms = 4000) => { for (let i = 0; i < ms / 25 && !cond(); i++) await espera(25); return cond(); };

(async () => {
  const base = { crc: 'A1B2C3D4', plataforma: 'snes', core: 'snes9x_libretro.dll', porta: 55435, senha: 'Senha_Forte-123', titulo: 'Super Metroid' };

  await t('código de convite: ida e volta (direto e pela retransmissão)', () => {
    const c = P.criarCodigo({ ...base, enderecos: ['26.10.20.30', '192.168.0.10', '189.40.1.2'] });
    assert.ok(/^AH2\.[A-Za-z0-9_-]+$/.test(c));
    const l = P.lerCodigo(c);
    assert.deepStrictEqual(l.enderecos, ['26.10.20.30', '192.168.0.10', '189.40.1.2']);
    assert.strictEqual(l.senha, base.senha);
    assert.strictEqual(l.titulo, 'Super Metroid');
    assert.strictEqual(l.relay, null);
    const r = P.lerCodigo(P.criarCodigo({ ...base, enderecos: [], relay: { ip: '45.79.112.203', porta: 55435, sessao: 'q3Hx9P0aZr1mN8sT4uVwYb==' } }));
    assert.deepStrictEqual(r.relay, { ip: '45.79.112.203', porta: 55435, sessao: 'q3Hx9P0aZr1mN8sT4uVwYb==' });
  });
  await t('aceita o código no meio de uma mensagem ou como link arcadehub://', () => {
    const c = P.criarCodigo({ ...base, enderecos: ['189.40.1.2'] });
    assert.ok(P.lerCodigo(`Bora jogar! Código: ${c} valeu`));
    assert.ok(P.lerCodigo(P.linkDoCodigo(c)));
    assert.strictEqual(P.extrairCodigo(P.linkDoCodigo(c)), c);
  });
  await t('código adulterado é recusado (core com caminho, IP inválido, senha com aspas, sem endereço)', () => {
    const mexido = campos => 'AH2.' + Buffer.from(campos.join('|')).toString('base64url');
    const ok = ['AH2', 'A1B2C3D4', 'snes', 'snes9x_libretro.dll', '55435', '1.2.3.4', 'Senha_Forte-123', '', '', 'Jogo'];
    assert.ok(P.lerCodigo(mexido(ok)));
    const troca = (i, v) => { const c = [...ok]; c[i] = v; return mexido(c); };
    assert.strictEqual(P.lerCodigo(troca(3, '../../evil.dll')), null);
    assert.strictEqual(P.lerCodigo(troca(5, '1.2.3.4 & calc')), null);
    assert.strictEqual(P.lerCodigo(troca(5, '')), null);
    assert.strictEqual(P.lerCodigo(troca(6, 'x" \nnetplay_x = "1')), null);
    assert.strictEqual(P.lerCodigo(troca(4, '99999')), null);
    assert.strictEqual(P.lerCodigo(troca(7, '1.2.3.4:55435')), null);       // retransmissão sem sessão
    assert.strictEqual(P.lerCodigo('AH2.!!!!!!!!!!!!!!!!!!!!'), null);
    assert.strictEqual(P.lerCodigo(troca(9, '<img src=x onerror=1>')).titulo.includes('<'), false);
  });
  await t('.cfg do RetroArch: senha, UPnP, sem lista pública e sem gravar no retroarch.cfg', () => {
    const d = P.configNetplay({ hospedar: true, senha: 'abcDEF123', upnp: true, apelido: 'Ana-1a2b3c' });
    assert.ok(d.includes('config_save_on_exit = "false"'));
    assert.ok(d.includes('netplay_password = "abcDEF123"'));
    assert.ok(d.includes('netplay_nat_traversal = "true"'));
    assert.ok(d.includes('netplay_public_announce = "false"'));
    const r = P.configNetplay({ hospedar: true, senha: 'abcDEF123', relay: 'saopaulo' });
    assert.ok(r.includes('netplay_use_mitm_server = "true"') && r.includes('netplay_mitm_server = "saopaulo"') && r.includes('netplay_public_announce = "true"'));
    assert.ok(!P.configNetplay({ hospedar: true, relay: 'evil' }).includes('evil'));
    assert.ok(!/\n.*injet/.test(P.configNetplay({ senha: 'x"\ninjet = "1' }).split('\n').slice(1).join('\n')));
  });
  await t('retransmissão: acha a sessão da partida na lista do RetroArch pelo apelido', async () => {
    const sala = { username: 'Ana-1a2b3c', mitm_ip: '45.79.112.203', mitm_port: 55435, mitm_session: 'q3Hx9P0aZr1mN8sT4uVwYb==' };
    assert.deepStrictEqual(P.acharNaLista([{ fields: { username: 'outro' } }, { fields: sala }], 'Ana-1a2b3c'), { ip: '45.79.112.203', porta: 55435, sessao: 'q3Hx9P0aZr1mN8sT4uVwYb==' });
    assert.ok(P.acharNaLista([sala], 'Ana-1a2b3c'));
    assert.strictEqual(P.acharNaLista([{ ...sala, mitm_ip: 'evil host' }], 'Ana-1a2b3c'), null);
    let n = 0;
    const r = await P.sessaoDaRetransmissao('Ana-1a2b3c', { intervalo: 5, fetch: async url => { n++; assert.ok(url.startsWith('http://lobby.libretro.com/list')); return { ok: true, json: async () => (n < 3 ? [] : [{ fields: sala }]) }; } });
    assert.strictEqual(n, 3);
    assert.strictEqual(r.sessao, sala.mitm_session);
  });
  await t('partidas na mesma rede: quem hospeda responde, quem procura acha', async () => {
    const porta = 47000 + Math.floor(Math.random() * 900);
    const a = new P.AnuncioLan({ porta });
    const codigo = P.criarCodigo({ ...base, enderecos: ['192.168.0.10'] });
    a.iniciar({ codigo, nome: 'Ana' });
    await espera(150);
    const achadas = await P.procurarNaRede({ porta, alvos: ['127.0.0.1'], espera: 600 });
    a.parar();
    assert.strictEqual(achadas.length, 1);
    assert.strictEqual(achadas[0].titulo, 'Super Metroid');
    assert.strictEqual(achadas[0].nome, 'Ana');
    assert.deepStrictEqual(await P.procurarNaRede({ porta, alvos: ['127.0.0.1'], espera: 300 }), []);
  });

  /* ---------------- fluxo completo: hospedar, convite, entrar ---------------- */
  const T = tmp('p2p');
  const ra = path.join(T, 'RetroArch', 'retroarch.exe');
  fs.mkdirSync(path.join(T, 'RetroArch', 'cores'), { recursive: true });
  fs.writeFileSync(ra, 'MZ');
  fs.writeFileSync(path.join(T, 'RetroArch', 'cores', 'snes9x_libretro.dll'), 'x');
  const rom = path.join(T, 'Super Metroid.sfc'); fs.writeFileSync(rom, Buffer.alloc(4096, 7));
  const jogo = { id: 'r1', title: 'Super Metroid', kind: 'rom', platformKey: 'snes', launch: { type: 'rom', rom, platform: 'snes' } };
  const lobby = { salas: [] };
  const falsoFetch = async url => {
    if (/ipify/.test(url)) return { ok: true, text: async () => '189.40.1.2' };
    if (/lobby\.libretro\.com\/list/.test(url)) return { ok: true, json: async () => lobby.salas };
    throw new Error('sem rede no teste');
  };
  const montar = (nome, extra) => {
    const st = new lib.Store(path.join(T, nome));
    st.saveSettings({ retroarch: { exe: ra, cores: path.join(T, 'RetroArch', 'cores') }, ...(extra || {}) });
    st.addGame({ ...jogo });
    const h = {}, enviados = [], abertos = [];
    const BW = { getAllWindows: () => [{ isDestroyed: () => false, webContents: { send: (c, d) => enviados.push([c, d]) } }] };
    const portaLan = 46000 + Math.floor(Math.random() * 900);
    lib.register({ handle: (k, f) => (h[k] = f), on: () => {} }, {
      shell: { openExternal: async () => {} }, dialog: {}, BrowserWindow: BW, app: { getVersion: () => 'x', once: () => {} }, store: st,
      varrerAoAbrir: false, atrasoVigias: 1e9, atrasoConquistas: 1e9, atrasoDiscord: 1e9, semDualSense: true, semProtocolo: true,
      fetch: falsoFetch, intervaloLobby: 10, tentativasLobby: 20, portaLan, alvosLan: ['127.0.0.1'],
      iniciarProcesso: async plan => { const c = new EventEmitter(); c.unref = () => {}; c.plan = plan; abertos.push(c); return c; }
    });
    return { st, h, enviados, abertos, portaLan };
  };

  const anf = montar('anfitriao');
  const r = await anf.h['game:launch']({}, 'r1', { online: true });
  await t('hospedar: RetroArch com --appendconfig (senha e UPnP) e o convite fica pronto', async () => {
    assert.ok(r.ok, r.error);
    const args = anf.abertos[0].plan.args;
    const cfg = args.find(a => a.startsWith('--appendconfig=')).slice('--appendconfig='.length);
    assert.ok(args.includes('--host') && args[args.length - 1] === rom);
    const txt = fs.readFileSync(cfg, 'utf8');
    assert.ok(/netplay_password = "[A-Za-z0-9_-]{8,}"/.test(txt) && txt.includes('netplay_nat_traversal = "true"'));
    assert.ok(await esperar(() => anf.enviados.some(([c, d]) => c === 'online:convite' && d.estado === 'pronto')));
    const c = anf.enviados.find(([c, d]) => c === 'online:convite' && d.estado === 'pronto')[1];
    const l = P.lerCodigo(c.codigo);
    assert.ok(l.enderecos.includes('189.40.1.2'));
    assert.strictEqual(l.senha, /netplay_password = "([^"]+)"/.exec(txt)[1]);
    assert.ok(c.link.startsWith('arcadehub://entrar/AH2.'));
  });
  const codigo = anf.enviados.find(([c, d]) => c === 'online:convite' && d.estado === 'pronto')[1].codigo;
  await t('a partida aparece para quem está na mesma rede', async () => {
    const achadas = await P.procurarNaRede({ porta: anf.portaLan, alvos: ['127.0.0.1'], espera: 500 });
    assert.strictEqual(achadas.length, 1);
    assert.strictEqual(achadas[0].codigo, codigo);
  });

  const conv = montar('convidado');
  await t('entrar com o código: confere a ROM e conecta com a senha da partida', async () => {
    const previa = await conv.h['online:ler']({}, `olha o código: ${codigo}`);
    assert.ok(previa.ok && previa.data.temRom && previa.data.jogo === 'Super Metroid');
    const e = await conv.h['online:entrar']({}, P.linkDoCodigo(codigo));
    assert.ok(e.ok, e.error);
    const args = conv.abertos[0].plan.args;
    assert.ok(args.some(a => /^--connect=\d/.test(a)) && args.includes('--port=55435') && !args.includes('--host'));
    const cfg = fs.readFileSync(args.find(a => a.startsWith('--appendconfig=')).slice(15), 'utf8');
    assert.ok(cfg.includes(`netplay_password = "${P.lerCodigo(codigo).senha}"`));
    assert.ok(cfg.includes('config_save_on_exit = "false"'));
  });
  await t('código inválido ou sem a mesma ROM: explica', async () => {
    assert.ok(/não é válido/.test((await conv.h['online:entrar']({}, 'AH2.xxxxxxxxxxxxxxxxxxxx')).error));
    const outra = P.criarCodigo({ ...base, crc: 'DEADBEEF', enderecos: ['1.2.3.4'] });
    assert.ok(/mesma ROM/.test((await conv.h['online:entrar']({}, outra)).error));
  });
  await t('fim da partida: apaga o .cfg com a senha e para de anunciar na rede', async () => {
    const cfg = anf.abertos[0].plan.args.find(a => a.startsWith('--appendconfig=')).slice(15);
    anf.abertos[0].emit('exit', 0);
    assert.ok(await esperar(() => !fs.existsSync(cfg)), 'o .cfg ficou');
    assert.ok(anf.enviados.some(([c, d]) => c === 'online:convite' && d.estado === 'encerrada'));
    assert.deepStrictEqual(await P.procurarNaRede({ porta: anf.portaLan, alvos: ['127.0.0.1'], espera: 300 }), []);
  });

  const rel = montar('retransmissao', { online: { upnp: true, lan: true, relay: 'saopaulo' } });
  await rel.h['game:launch']({}, 'r1', { online: true });
  await t('pela retransmissão: acha a sessão na lista do RetroArch e o convidado usa --mitm-session', async () => {
    const cfg = fs.readFileSync(rel.abertos[0].plan.args.find(a => a.startsWith('--appendconfig=')).slice(15), 'utf8');
    assert.ok(cfg.includes('netplay_mitm_server = "saopaulo"'));
    const apelido = /netplay_nickname = "([^"]+)"/.exec(cfg)[1];
    assert.ok(/-[0-9a-f]{6}$/.test(apelido));
    lobby.salas = [{ fields: { username: apelido, mitm_ip: '45.79.112.203', mitm_port: 55435, mitm_session: 'q3Hx9P0aZr1mN8sT4uVwYb==' } }];
    assert.ok(await esperar(() => rel.enviados.some(([c, d]) => c === 'online:convite' && d.estado === 'pronto'), 3000));
    const c = rel.enviados.find(([c, d]) => c === 'online:convite' && d.estado === 'pronto')[1];
    assert.strictEqual(c.relay, 'São Paulo');
    const conv2 = montar('convidado2');
    const e = await conv2.h['online:entrar']({}, c.codigo);
    assert.ok(e.ok && e.data.relay, e.error);
    const args = conv2.abertos[0].plan.args;
    assert.ok(args.includes('--connect=45.79.112.203') && args.includes('--mitm-session=q3Hx9P0aZr1mN8sT4uVwYb=='));
    rel.abertos[0].emit('exit', 0);
  });
  await t('ajustes online: valida o servidor de retransmissão', async () => {
    assert.ok(!(await anf.h['online:salvar']({}, { relay: 'evil' })).ok);
    const s = await anf.h['online:salvar']({}, { relay: 'nyc', upnp: false });
    assert.ok(s.ok && s.data.relay === 'nyc' && s.data.upnp === false);
  });
  fim();
})();
