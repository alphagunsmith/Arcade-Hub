'use strict';
/** Discord sem servidor: protocolo IPC (com um Discord falso), convites e jogo online. */
const fs = require('fs'), path = require('path'), net = require('net'), os = require('os'), assert = require('assert');
const { ROOT, tmp, t, fim, espera } = require('./_base');
const D = require(path.join(ROOT, 'src', 'discord.js'));
const lib = require(path.join(ROOT, 'src', 'lib.js'));

const ID = '123456789012345678';

/** Discord falso: guarda o que recebeu e deixa o teste mandar eventos. */
function discordFalso(caminho) {
  const recebidas = [];
  let conexao = null;
  const srv = net.createServer(c => {
    conexao = c;
    let buf = Buffer.alloc(0);
    c.on('data', d => {
      buf = Buffer.concat([buf, d]);
      while (buf.length >= 8) {
        const op = buf.readInt32LE(0), n = buf.readInt32LE(4);
        if (buf.length < 8 + n) break;
        const msg = JSON.parse(buf.slice(8, 8 + n).toString());
        buf = buf.slice(8 + n);
        recebidas.push({ op, msg });
        if (op === 0) {
          if (msg.client_id === '999999999999999999') { c.write(D.empacotar(2, { code: 4000, message: 'Invalid Client ID' })); c.end(); continue; }
          c.write(D.empacotar(1, { cmd: 'DISPATCH', evt: 'READY', data: { user: { id: '42', username: 'eu' } } }));
        }
      }
    });
    c.on('error', () => {});
  });
  return new Promise(res => srv.listen(caminho, () => res({
    srv, recebidas,
    mandar: (op, msg) => conexao.write(D.empacotar(op, msg)),
    fechar: () => new Promise(r => { try { conexao && conexao.destroy(); } catch {} srv.close(() => r()); })
  })));
}
const nomeCanal = n => (process.platform === 'win32' ? `\\\\?\\pipe\\arcadehub-teste-${process.pid}-${n}` : path.join(tmp('discord-' + n), 'discord-ipc-0'));
const esperar = async (cond, ms = 3000) => { for (let i = 0; i < ms / 25 && !cond(); i++) await espera(25); return cond(); };

(async () => {
  // ---- protocolo ----
  const canal = nomeCanal('a');
  const f = await discordFalso(canal);
  const c = new D.ClienteDiscord({ clientId: ID, caminhos: () => [canal + '-nao-existe', canal], religar: 200 });
  const estados = [], entradas = [], pedidos = [];
  c.on('estado', e => estados.push(e));
  c.on('entrar', s => entradas.push(s));
  c.on('pedido', u => pedidos.push(u));
  c.definirAtividade({ details: 'Antes de conectar' });
  c.iniciar();
  await esperar(() => estados.includes('conectado'));
  await esperar(() => f.recebidas.filter(r => r.msg.cmd === 'SET_ACTIVITY').length >= 1);
  await t('handshake com o ID do app, pulando o canal que não existe', () => {
    assert.deepStrictEqual(f.recebidas[0], { op: 0, msg: { v: 1, client_id: ID } });
    assert.ok(estados.includes('conectado'));
  });
  await t('assina "Participar" e "pedido para participar"', () => {
    const subs = f.recebidas.filter(r => r.msg.cmd === 'SUBSCRIBE').map(r => r.msg.evt).sort();
    assert.deepStrictEqual(subs, ['ACTIVITY_JOIN', 'ACTIVITY_JOIN_REQUEST']);
  });
  await t('o status pedido antes de conectar é enviado ao conectar', () => {
    const sa = f.recebidas.find(r => r.msg.cmd === 'SET_ACTIVITY');
    assert.strictEqual(sa.msg.args.activity.details, 'Antes de conectar');
    assert.strictEqual(sa.msg.args.pid, process.pid);
  });
  f.mandar(3, { x: 1 });
  await esperar(() => f.recebidas.some(r => r.op === 4));
  await t('responde o ping do Discord', () => assert.ok(f.recebidas.some(r => r.op === 4 && r.msg.x === 1)));
  f.mandar(1, { cmd: 'DISPATCH', evt: 'ACTIVITY_JOIN', data: { secret: '1s|570' } });
  f.mandar(1, { cmd: 'DISPATCH', evt: 'ACTIVITY_JOIN_REQUEST', data: { user: { id: '77', username: 'amigo' } } });
  await esperar(() => entradas.length && pedidos.length);
  await t('repassa o convite (Participar) e o pedido do amigo', () => {
    assert.deepStrictEqual(entradas, ['1s|570']);
    assert.strictEqual(pedidos[0].id, '77');
  });
  c.aceitarPedido('77');
  await esperar(() => f.recebidas.some(r => r.msg.cmd === 'SEND_ACTIVITY_JOIN_INVITE'));
  await t('aceitar pedido manda SEND_ACTIVITY_JOIN_INVITE', () => assert.strictEqual(f.recebidas.find(r => r.msg.cmd === 'SEND_ACTIVITY_JOIN_INVITE').msg.args.user_id, '77'));
  await f.fechar();
  await esperar(() => estados.includes('desconectado'));
  await t('Discord fechou: avisa e tenta de novo sozinho', () => assert.ok(estados.includes('desconectado')));
  const f2 = await discordFalso(canal);
  await esperar(() => estados.filter(e => e === 'conectado').length >= 2, 4000);
  await t('Discord abriu de novo: reconecta', () => assert.strictEqual(estados.filter(e => e === 'conectado').length, 2));
  c.parar(); await f2.fechar();

  const canalB = nomeCanal('b');
  const fb = await discordFalso(canalB);
  const ruim = new D.ClienteDiscord({ clientId: '999999999999999999', caminhos: () => [canalB], religar: 100 });
  const eb = [];
  ruim.on('estado', e => eb.push(e));
  ruim.iniciar();
  await esperar(() => eb.includes('id-invalido'));
  await espera(400);
  await t('ID recusado pelo Discord: avisa e para de insistir', () => {
    assert.ok(eb.includes('id-invalido'));
    assert.strictEqual(fb.recebidas.filter(r => r.op === 0).length, 1);
  });
  await fb.fechar();
  await t('sem ID: nem tenta conectar', () => { const x = new D.ClienteDiscord({ clientId: '' }); const e = []; x.on('estado', v => e.push(v)); x.iniciar(); assert.deepStrictEqual(e, ['sem-id']); });

  // ---- convite (segredo) ----
  await t('convite de jogo online: ida e volta, até 128 caracteres', () => {
    const s = D.criarSegredo({ tipo: 'netplay', crc: 'A1B2C3D4', enderecos: ['26.10.20.30', '192.168.0.10', '189.40.1.2'], porta: 55435, core: 'snes9x_libretro.dll', plataforma: 'snes' });
    assert.ok(s.length <= 128);
    assert.deepStrictEqual(D.lerSegredo(s), { tipo: 'netplay', crc: 'A1B2C3D4', enderecos: ['26.10.20.30', '192.168.0.10', '189.40.1.2'], porta: 55435, core: 'snes9x_libretro.dll', plataforma: 'snes', senha: '' });
  });
  await t('convite com senha da partida e pela retransmissão do RetroArch', () => {
    const base = { tipo: 'netplay', crc: 'A1B2C3D4', porta: 55435, core: 'mupen64plus_next_libretro.dll', plataforma: 'n64', senha: 'Senha_Forte-123' };
    const d = D.criarSegredo({ ...base, enderecos: ['26.10.20.30', '192.168.0.10', '189.40.1.2'] });
    assert.ok(d.length <= 128 && d.startsWith('2n|'));
    assert.strictEqual(D.lerSegredo(d).senha, 'Senha_Forte-123');
    const r = D.criarSegredo({ ...base, relay: { ip: '45.79.112.203', porta: 55435, sessao: 'q3Hx9P0aZr1mN8sT4uVwYb==' } });
    assert.ok(r.length <= 128 && r.startsWith('2r|'));
    assert.deepStrictEqual(D.lerSegredo(r).relay, { ip: '45.79.112.203', porta: 55435, sessao: 'q3Hx9P0aZr1mN8sT4uVwYb==' });
    assert.strictEqual(D.lerSegredo('2r|A1B2C3D4|45.79.1.2:55435|ses sao;rm|x.dll|n64|Senha_Forte-123'), null);
    assert.strictEqual(D.lerSegredo('2n|A1B2C3D4|1.2.3.4|55435|x.dll|snes|"; rm'), null);
  });
  await t('convite mal-intencionado é recusado (core com caminho, endereço com espaço, porta absurda)', () => {
    assert.strictEqual(D.lerSegredo('1n|A1B2C3D4|1.2.3.4|55435|../../evil.dll|snes'), null);
    assert.strictEqual(D.lerSegredo('1n|A1B2C3D4|1.2.3.4 & calc|55435|x.dll|snes'), null);
    assert.strictEqual(D.lerSegredo('1n|A1B2C3D4|1.2.3.4|99999|x.dll|snes'), null);
    assert.strictEqual(D.lerSegredo('1s|abc'), null);
    assert.strictEqual(D.lerSegredo('lixo'), null);
  });
  await t('título com "|" não quebra o convite', () => assert.deepStrictEqual(D.lerSegredo(D.criarSegredo({ tipo: 'titulo', plataforma: 'snes', titulo: 'A | B' })), { tipo: 'titulo', plataforma: 'snes', titulo: 'A   B' }));
  await t('quem entra usa a mesma VPN > mesma rede > internet', () => {
    const host = ['26.10.20.30', '192.168.0.10', '189.40.1.2'];
    assert.strictEqual(D.escolherEndereco(host, [{ ip: '26.99.1.1', tipo: 'vpn' }, { ip: '192.168.0.55', tipo: 'lan' }]), '26.10.20.30');
    assert.strictEqual(D.escolherEndereco(host, [{ ip: '192.168.0.55', tipo: 'lan' }]), '192.168.0.10');
    assert.strictEqual(D.escolherEndereco(host, [{ ip: '192.168.1.55', tipo: 'lan' }]), '189.40.1.2');
  });

  // ---- jogo online pelo RetroArch ----
  const T = tmp('netplay');
  const ra = path.join(T, 'RetroArch', 'retroarch.exe');
  fs.mkdirSync(path.join(T, 'RetroArch', 'cores'), { recursive: true });
  fs.writeFileSync(ra, 'MZ');
  fs.writeFileSync(path.join(T, 'RetroArch', 'cores', 'snes9x_libretro.dll'), 'x');
  const rom = path.join(T, 'Super Metroid.sfc'); fs.writeFileSync(rom, Buffer.alloc(4096, 3));
  const jogo = { id: 'r1', title: 'Super Metroid', kind: 'rom', platformKey: 'snes', launch: { type: 'rom', rom, platform: 'snes' } };
  const cfg = { retroarch: { exe: ra, cores: path.join(T, 'RetroArch', 'cores') } };
  await t('hospedar: RetroArch com o core, --host, porta e apelido', () => {
    const p = lib.planoNetplay(jogo, cfg, { hospedar: true, porta: 55435, nick: 'Davi <x>' });
    assert.strictEqual(p.kind, 'exe');
    assert.deepStrictEqual(p.args, ['-L', path.join(T, 'RetroArch', 'cores', 'snes9x_libretro.dll'), '--host', '--port=55435', '--nick=Davi x', rom]);
  });
  await t('entrar: --connect no endereço do amigo', () => {
    const p = lib.planoNetplay(jogo, cfg, { conectar: '26.10.20.30', porta: 55435, core: 'snes9x_libretro.dll' });
    assert.ok(p.args.includes('--connect=26.10.20.30'));
  });
  await t('sem RetroArch ou sem o core: explica o que falta', () => {
    assert.ok(/RetroArch/.test(lib.planoNetplay(jogo, {}, { hospedar: true }).reason));
    assert.ok(/falta o core/.test(lib.planoNetplay({ ...jogo, platformKey: 'gba', launch: { ...jogo.launch, platform: 'gba' } }, cfg, { hospedar: true }).reason));
  });
  await t('a mesma ROM tem a mesma chave dos dois lados', () => {
    const copia = path.join(T, 'copia.sfc'); fs.copyFileSync(rom, copia);
    assert.ok(/^[0-9A-F]{8}$/.test(lib.chaveDaRom(rom)));
    assert.strictEqual(lib.chaveDaRom(rom), lib.chaveDaRom(copia));
  });

  // ---- tudo junto: Discord falso + núcleo do app ----
  const canalC = nomeCanal('c');
  const fc = await discordFalso(canalC);
  const st = new lib.Store(path.join(T, 'data'));
  st.saveSettings({ discord: { appId: ID, ligado: true, convites: true, aceitarPedidos: true } });
  st.addGame({ id: 'jx', title: 'Jogo X', launch: { type: 'steam', appId: '570' } });
  const h = {}, abertos = [], enviados = [];
  const BW = { getAllWindows: () => [{ isDestroyed: () => false, webContents: { send: (canal, d) => enviados.push([canal, d]) } }] };
  lib.register({ handle: (k, fn) => (h[k] = fn) }, {
    shell: { openExternal: async u => abertos.push(u) }, dialog: {}, BrowserWindow: BW, app: { getVersion: () => 'x', once: () => {} },
    store: st, varrerAoAbrir: false, atrasoVigias: 1e9, atrasoConquistas: 1e9, atrasoDiscord: 0, caminhosDiscord: () => [canalC],
    vigia: { vigiar: () => true, parar: () => {}, itens: new Map() }
  });
  await esperar(() => fc.recebidas.some(r => r.op === 0));
  await esperar(() => enviados.some(([k, d]) => k === 'discord:estado' && d === 'conectado'));
  await t('o app conecta no Discord com o ID dos ajustes', () => assert.strictEqual(fc.recebidas[0].msg.client_id, ID));
  // amigo clicou em "Participar" num jogo da Steam
  fc.mandar(1, { cmd: 'DISPATCH', evt: 'ACTIVITY_JOIN', data: { secret: '1s|570' } });
  await esperar(() => abertos.length);
  await t('convite da Steam: abre o mesmo jogo da biblioteca', () => assert.deepStrictEqual(abertos, ['steam://rungameid/570']));
  await t('aparece um aviso na tela', () => assert.ok(enviados.some(([k, d]) => k === 'discord:aviso' && /Jogo X/.test(d.texto))));
  // abrir um jogo da Steam: o status mostra o jogo e o convite
  await h['game:launch']({}, 'jx');
  fc.recebidas.length = 0;
  // (o vigia de pasta é falso aqui; marca o início pelo caminho de sessão do app)
  lib.registrarSessao;  // noop
  fc.mandar(1, { cmd: 'DISPATCH', evt: 'ACTIVITY_JOIN', data: { secret: '1t||Jogo que não tenho' } });
  await esperar(() => enviados.some(([k, d]) => k === 'discord:aviso' && /não está na sua biblioteca/.test(d.texto)));
  await t('convite de jogo que você não tem: avisa, não abre nada', () => assert.strictEqual(abertos.length, 2));
  fc.mandar(1, { cmd: 'DISPATCH', evt: 'ACTIVITY_JOIN_REQUEST', data: { user: { id: '88', global_name: 'Ana' } } });
  await esperar(() => fc.recebidas.some(r => r.msg.cmd === 'SEND_ACTIVITY_JOIN_INVITE'));
  await t('pedido para participar: aceito sozinho (padrão) e avisa quem é', () => {
    assert.strictEqual(fc.recebidas.find(r => r.msg.cmd === 'SEND_ACTIVITY_JOIN_INVITE').msg.args.user_id, '88');
    assert.ok(enviados.some(([k, d]) => k === 'discord:aviso' && /Ana/.test(d.texto)));
  });
  // jogo de verdade aberto (uma cópia do Node faz o papel do emulador)
  const emu = path.join(T, process.platform === 'win32' ? 'emu.exe' : 'emu.exe');
  fs.copyFileSync(process.execPath, emu); fs.chmodSync(emu, 0o755);
  const romY = path.join(T, 'Jogo Y.sfc'); fs.writeFileSync(romY, 'x');
  st.saveSettings({ emulators: { ...st.settings.emulators, snes: { ...st.settings.emulators.snes, exe: emu, args: '-e "setTimeout(() => {}, 4000)"' } } });
  const gy = st.addGame({ id: 'jy', title: 'Jogo Y', kind: 'rom', platformKey: 'snes', platform: 'SNES', launch: { type: 'rom', rom: romY, platform: 'snes' } });
  const idY = (gy && gy.id) || st.games.find(x => x.title === 'Jogo Y').id;
  fc.recebidas.length = 0;
  const lan = await h['game:launch']({}, idY);
  await esperar(() => fc.recebidas.some(r => r.msg.cmd === 'SET_ACTIVITY' && r.msg.args.activity && r.msg.args.activity.details === 'Jogo Y'));
  const st1 = fc.recebidas.filter(r => r.msg.cmd === 'SET_ACTIVITY').pop();
  await t('jogo aberto: o Discord mostra o jogo, o console, o tempo e o "Participar"', () => {
    assert.ok(lan.ok, lan.error);
    const a = st1.msg.args.activity;
    assert.strictEqual(a.details, 'Jogo Y');
    assert.strictEqual(a.state, 'SNES');
    assert.ok(a.timestamps.start > Date.now() - 60000);
    assert.ok(a.party && a.party.size[1] >= 2);
    assert.ok(a.secrets.join.startsWith('1t|snes|Jogo Y'));
  });
  await esperar(() => fc.recebidas.some(r => r.msg.cmd === 'SET_ACTIVITY' && r.msg.args.activity === null), 9000);
  await t('jogo fechou: o status some do Discord', () => assert.ok(fc.recebidas.some(r => r.msg.cmd === 'SET_ACTIVITY' && r.msg.args.activity === null)));

  const salvo = await h['discord:salvar']({}, { appId: 'abc' });
  await t('ajustes: ID inválido é recusado com explicação', () => { assert.strictEqual(salvo.ok, false); assert.ok(/números/.test(salvo.error)); });
  await fc.fechar();
  fim();
})();
