'use strict';
/**
 * Arcade Hub — Discord sem servidor.
 *
 * Conversa com o Discord instalado no PC pelo canal local dele (IPC: um "pipe"
 * no Windows, um socket no Linux/Mac). Nada passa por servidor nosso.
 *
 *  - Rich Presence: "Jogando <jogo> no Arcade Hub", com tempo e capa;
 *  - convite: um "segredo" no status faz o Discord mostrar "Participar" para
 *    os amigos. Quando um amigo clica, o Discord abre o Arcade Hub DELE
 *    (protocolo discord-<id>://) e manda o segredo (evento ACTIVITY_JOIN);
 *  - pedido para participar (ACTIVITY_JOIN_REQUEST): aceito sozinho se o
 *    usuário deixou, senão recusado.
 *
 * Protocolo: cada mensagem = opcode (int32 LE) + tamanho (int32 LE) + JSON.
 * Opcodes: 0 handshake, 1 frame, 2 fechar, 3 ping, 4 pong.
 */
const net = require('net');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { EventEmitter } = require('events');

const OP = { HANDSHAKE: 0, FRAME: 1, CLOSE: 2, PING: 3, PONG: 4 };

function empacotar(op, dados) {
  const json = Buffer.from(JSON.stringify(dados), 'utf8');
  const cab = Buffer.alloc(8);
  cab.writeInt32LE(op, 0);
  cab.writeInt32LE(json.length, 4);
  return Buffer.concat([cab, json]);
}

/** Onde o Discord escuta. No Linux também procura as versões Flatpak e Snap. */
function caminhosIpc() {
  const lista = [];
  if (process.platform === 'win32') {
    for (let i = 0; i < 10; i++) lista.push(`\\\\?\\pipe\\discord-ipc-${i}`);
    return lista;
  }
  const base = process.env.XDG_RUNTIME_DIR || process.env.TMPDIR || process.env.TMP || process.env.TEMP || '/tmp';
  for (const sub of ['', 'app/com.discordapp.Discord', 'snap.discord', '.flatpak/dev.vencord.Vesktop/xdg-run']) {
    for (let i = 0; i < 10; i++) lista.push(path.join(base, sub, `discord-ipc-${i}`));
  }
  return lista;
}

class ClienteDiscord extends EventEmitter {
  /**
   * @param {object} o
   * @param {string} o.clientId    ID do aplicativo do Discord
   * @param {Function} [o.caminhos] () => string[] (os testes usam um Discord falso)
   * @param {number} [o.religar]    ms entre tentativas quando o Discord está fechado
   */
  constructor(o) {
    super();
    this.clientId = String(o.clientId || '');
    this.caminhos = o.caminhos || caminhosIpc;
    this.religar = o.religar || 15000;
    this.sock = null;
    this.pronto = false;
    this.usuario = null;
    this.buffer = Buffer.alloc(0);
    this.atividade = undefined;       // a última pedida (enviada quando conectar)
    this.parado = true;
    this.timer = null;
  }

  iniciar() {
    if (!/^\d{15,22}$/.test(this.clientId)) { this.emit('estado', 'sem-id'); return; }
    this.parado = false;
    this._conectar(0);
  }

  parar() {
    this.parado = true;
    clearTimeout(this.timer);
    if (this.sock) {
      try { if (this.pronto) this.sock.write(empacotar(OP.FRAME, { cmd: 'SET_ACTIVITY', args: { pid: process.pid, activity: null }, nonce: crypto.randomUUID() })); } catch { /* fechando */ }
      try { this.sock.end(); } catch { /* fechando */ }
    }
    this.sock = null;
    this.pronto = false;
  }

  _agendar() {
    if (this.parado) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this._conectar(0), this.religar);
    if (this.timer.unref) this.timer.unref();
  }

  _conectar(i) {
    if (this.parado) return;
    const lista = this.caminhos();
    if (i >= lista.length) { this.emit('estado', 'sem-discord'); this._agendar(); return; }
    const sock = net.createConnection(lista[i]);
    let abriu = false;
    sock.once('connect', () => {
      abriu = true;
      this.sock = sock;
      this.buffer = Buffer.alloc(0);
      sock.write(empacotar(OP.HANDSHAKE, { v: 1, client_id: this.clientId }));
    });
    sock.on('data', d => this._receber(d));
    sock.on('error', () => { if (!abriu) { sock.destroy(); this._conectar(i + 1); } });
    sock.on('close', () => {
      if (!abriu) return;
      const estava = this.pronto;
      this.sock = null;
      this.pronto = false;
      if (estava) this.emit('estado', 'desconectado');
      this._agendar();
    });
  }

  _receber(d) {
    this.buffer = Buffer.concat([this.buffer, d]);
    while (this.buffer.length >= 8) {
      const op = this.buffer.readInt32LE(0);
      const tam = this.buffer.readInt32LE(4);
      if (tam < 0 || tam > 1024 * 1024) { this.sock.destroy(); return; }
      if (this.buffer.length < 8 + tam) return;
      let msg = null;
      try { msg = JSON.parse(this.buffer.slice(8, 8 + tam).toString('utf8')); } catch { /* lixo: ignora */ }
      this.buffer = this.buffer.slice(8 + tam);
      if (op === OP.PING) { try { this.sock.write(empacotar(OP.PONG, msg)); } catch { /* fechando */ } continue; }
      if (op === OP.CLOSE) {
        this.emit('estado', msg && msg.code === 4000 ? 'id-invalido' : 'recusado');
        if (msg && msg.code === 4000) this.parado = true;      // ID errado: não adianta insistir
        try { this.sock.destroy(); } catch { /* noop */ }
        return;
      }
      if (op === OP.FRAME && msg) this._mensagem(msg);
    }
  }

  _mensagem(msg) {
    if (msg.cmd === 'DISPATCH' && msg.evt === 'READY') {
      this.pronto = true;
      this.usuario = (msg.data && msg.data.user) || null;
      this.emit('estado', 'conectado');
      for (const evt of ['ACTIVITY_JOIN', 'ACTIVITY_JOIN_REQUEST']) this._enviar('SUBSCRIBE', {}, evt);
      if (this.atividade !== undefined) this._enviar('SET_ACTIVITY', { pid: process.pid, activity: this.atividade });
      return;
    }
    if (msg.cmd === 'DISPATCH' && msg.evt === 'ACTIVITY_JOIN') { this.emit('entrar', msg.data && msg.data.secret); return; }
    if (msg.cmd === 'DISPATCH' && msg.evt === 'ACTIVITY_JOIN_REQUEST') { this.emit('pedido', msg.data && msg.data.user); return; }
    if (msg.evt === 'ERROR') this.emit('erro', (msg.data && msg.data.message) || 'erro do Discord');
  }

  _enviar(cmd, args, evt) {
    if (!this.sock || !this.pronto) return false;
    const m = { cmd, args, nonce: crypto.randomUUID() };
    if (evt) m.evt = evt;
    try { this.sock.write(empacotar(OP.FRAME, m)); return true; } catch { return false; }
  }

  /** Define o status (ou null para limpar). Guarda e manda quando conectar. */
  definirAtividade(atividade) {
    this.atividade = atividade || null;
    return this._enviar('SET_ACTIVITY', { pid: process.pid, activity: this.atividade });
  }

  aceitarPedido(userId) { return this._enviar('SEND_ACTIVITY_JOIN_INVITE', { user_id: String(userId) }); }
  recusarPedido(userId) { return this._enviar('CLOSE_ACTIVITY_REQUEST', { user_id: String(userId) }); }
}

/* ------------------------------------------------------------------ */
/* convite: o "segredo" que vai no status (máx. 128 caracteres)        */
/* ------------------------------------------------------------------ */
/*
 *  2n|CRC|end1,end2|porta|core|plataforma|senha  jogo retrô online (RetroArch netplay, conexão direta)
 *  2r|CRC|ip:porta|sessão|core|plataforma|senha  idem, pela retransmissão do RetroArch
 *  1n|CRC|end1,end2|porta|core|plataforma        versão antiga (sem senha)
 *  1s|appId                                jogo da Steam: abre o mesmo jogo
 *  1t|plataforma|título                    outro jogo: procura pelo nome
 */
const RE_END = /^(\d{1,3}(\.\d{1,3}){3}|[0-9a-f:]{2,39}|[a-z0-9.-]{1,63})$/i;

function criarSegredo(c) {
  let s = '';
  if (c.tipo === 'netplay' && c.relay) {
    s = ['2r', c.crc, `${c.relay.ip}:${c.relay.porta}`, c.relay.sessao, c.core, c.plataforma || '', c.senha || ''].join('|');
  } else if (c.tipo === 'netplay') {
    s = [c.senha ? '2n' : '1n', c.crc, (c.enderecos || []).slice(0, 3).join(','), c.porta, c.core, c.plataforma || ''].concat(c.senha ? [c.senha] : []).join('|');
  } else if (c.tipo === 'steam') {
    s = `1s|${c.appId}`;
  } else {
    s = `1t|${c.plataforma || ''}|${String(c.titulo || '').replace(/\|/g, ' ')}`;
  }
  return s.slice(0, 128);
}

/** Lê e valida o segredo que chegou de outra pessoa (nada daqui vira comando sem checar). */
function lerSegredo(s) {
  const p = String(s || '').split('|');
  const senhaOk = x => /^[A-Za-z0-9_-]{6,32}$/.test(x || '');
  const crcOk = x => /^([0-9A-F]{8}|S[0-9A-F]{1,12})$/.test(x || '');
  const plat = x => (/^[\w-]{0,20}$/.test(x || '') ? (x || '') : '');
  if ((p[0] === '1n' || p[0] === '2n') && p.length >= 5) {
    const enderecos = p[2].split(',').filter(e => RE_END.test(e)).slice(0, 3);
    const porta = Number(p[3]);
    if (!crcOk(p[1]) || !enderecos.length || !(porta > 0 && porta < 65536) || !/^[\w.-]{1,60}$/.test(p[4])) return null;
    if (p[0] === '2n' && !senhaOk(p[6])) return null;
    return { tipo: 'netplay', crc: p[1], enderecos, porta, core: p[4], plataforma: plat(p[5]), senha: p[0] === '2n' ? p[6] : '' };
  }
  if (p[0] === '2r' && p.length >= 7) {
    const [ip, pr] = String(p[2]).split(':');
    const porta = Number(pr);
    if (!crcOk(p[1]) || !/^\d{1,3}(\.\d{1,3}){3}$/.test(ip || '') || !(porta > 0 && porta < 65536) ||
      !/^[A-Za-z0-9+/=_-]{8,64}$/.test(p[3]) || !/^[\w.-]{1,60}$/.test(p[4]) || !senhaOk(p[6])) return null;
    return { tipo: 'netplay', crc: p[1], enderecos: [], porta, core: p[4], plataforma: plat(p[5]), senha: p[6], relay: { ip, porta, sessao: p[3] } };
  }
  if (p[0] === '1s' && /^\d{1,12}$/.test(p[1] || '')) return { tipo: 'steam', appId: p[1] };
  if (p[0] === '1t' && p.length >= 3) {
    const titulo = p.slice(2).join('|').trim().slice(0, 100);
    if (!titulo) return null;
    return { tipo: 'titulo', plataforma: /^[\w-]{0,20}$/.test(p[1]) ? p[1] : '', titulo };
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* endereços para o netplay                                            */
/* ------------------------------------------------------------------ */

/** Faixas de VPN de jogo comuns: Radmin (26.x), ZeroTier (comum em 10.147/172.2x), Tailscale (100.64/10), Hamachi (25.x). */
function tipoDeEndereco(ip) {
  const [a, b] = ip.split('.').map(Number);
  if (a === 26 || a === 25) return 'vpn';
  if (a === 100 && b >= 64 && b <= 127) return 'vpn';
  if (a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) return 'lan';
  if (a === 127 || a === 169) return 'ignorar';
  return 'publico';
}

/** IPv4 das placas de rede deste PC (rede de casa e VPN). */
function enderecosLocais(interfaces) {
  const out = [];
  for (const lista of Object.values(interfaces || os.networkInterfaces())) {
    for (const i of lista || []) {
      if (i.family !== 'IPv4' && i.family !== 4) continue;
      if (i.internal) continue;
      const t = tipoDeEndereco(i.address);
      if (t !== 'ignorar') out.push({ ip: i.address, tipo: t });
    }
  }
  return out;
}

/**
 * Do lado de quem entra: qual endereço do anfitrião usar. Mesma VPN (mesma
 * faixa) > mesma rede de casa (/24) > endereço público.
 */
function escolherEndereco(doAnfitriao, meus) {
  const mesmos = (a, b, n) => a.split('.').slice(0, n).join('.') === b.split('.').slice(0, n).join('.');
  for (const e of doAnfitriao) {
    if (tipoDeEndereco(e) === 'vpn' && meus.some(m => m.tipo === 'vpn' && mesmos(m.ip, e, 1))) return e;
  }
  for (const e of doAnfitriao) {
    if (tipoDeEndereco(e) === 'lan' && meus.some(m => m.tipo === 'lan' && mesmos(m.ip, e, 3))) return e;
  }
  return doAnfitriao.find(e => tipoDeEndereco(e) === 'publico') || doAnfitriao[0] || null;
}

module.exports = {
  ClienteDiscord, empacotar, caminhosIpc, OP,
  criarSegredo, lerSegredo, enderecosLocais, escolherEndereco, tipoDeEndereco
};
