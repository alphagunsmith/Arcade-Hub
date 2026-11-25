'use strict';
/**
 * Jogo online P2P, sem Discord e sem servidor do Arcade Hub.
 *
 * A partida é do RetroArch (netplay): um PC hospeda e o outro conecta direto nele.
 * Aqui ficam as peças para isso funcionar sem o Discord:
 *   - código de convite: tudo que o amigo precisa (qual ROM, core, endereços, porta,
 *     senha da partida e, se for o caso, a retransmissão) num texto para mandar por
 *     qualquer mensageiro, e o link arcadehub://entrar/<código>;
 *   - arquivo de configuração extra do RetroArch (--appendconfig): senha da partida,
 *     UPnP (o RetroArch abre a porta no roteador), retransmissão e sem gravar nada
 *     disso no retroarch.cfg do usuário;
 *   - retransmissão: os servidores públicos do próprio RetroArch (libretro). O
 *     anfitrião conecta para fora, então funciona mesmo sem abrir porta. O número
 *     da sessão é lido na lista pública do RetroArch, pelo apelido único da partida;
 *   - partidas na mesma rede: o Arcade Hub que está hospedando responde a uma
 *     pergunta por UDP na rede de casa.
 */
const crypto = require('crypto');
const dgram = require('dgram');
const os = require('os');

const VERSAO = 'AH2';
const PORTA_LAN = 47700;
const PERGUNTA_LAN = 'ARCADEHUB-PARTIDAS?1';
const LOBBY = 'http://lobby.libretro.com/';
const RELAYS = { saopaulo: 'São Paulo', nyc: 'Nova York', madrid: 'Madri' };

const RE_IP = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
const RE_CRC = /^([0-9A-F]{8}|S[0-9A-F]{1,12})$/;
const RE_CORE = /^[\w.-]{1,60}$/;
const RE_PLAT = /^[\w-]{0,20}$/;
const RE_SENHA = /^[A-Za-z0-9_-]{6,32}$/;
const RE_SESSAO = /^[A-Za-z0-9+/=_-]{8,64}$/;

const b64url = s => Buffer.from(s, 'utf8').toString('base64url');
const deB64url = s => Buffer.from(s, 'base64url').toString('utf8');
const portaOk = n => Number.isInteger(n) && n > 0 && n < 65536;

/** Senha da partida (só quem tem o convite entra). */
function novaSenha() { return crypto.randomBytes(9).toString('base64url'); }
/** Apelido único da partida: é por ele que o anfitrião se acha na lista do RetroArch. */
function apelidoUnico(nome) {
  const base = String(nome || 'Jogador').replace(/[^\p{L}\p{N} _-]/gu, '').trim().slice(0, 14) || 'Jogador';
  return `${base}-${crypto.randomBytes(3).toString('hex')}`;
}

/**
 * Código de convite. Campos separados por "|", em base64url (vai bem em qualquer
 * mensageiro): versão, CRC da ROM, plataforma, core, porta, endereços, senha,
 * retransmissão (ip:porta), sessão da retransmissão e o nome do jogo (só para mostrar).
 */
function criarCodigo(c) {
  const campos = [
    VERSAO, c.crc || '', c.plataforma || '', c.core || '', String(c.porta || ''),
    (c.enderecos || []).slice(0, 4).join(','), c.senha || '',
    c.relay ? `${c.relay.ip}:${c.relay.porta}` : '', c.relay ? c.relay.sessao : '',
    String(c.titulo || '').replace(/[|\r\n]/g, ' ').trim().slice(0, 48)
  ];
  return VERSAO + '.' + b64url(campos.join('|'));
}

/** Aceita o código puro, o link arcadehub://entrar/<código> ou um texto com o código no meio. */
function extrairCodigo(texto) {
  const m = /AH2\.[A-Za-z0-9_-]{16,700}/.exec(String(texto || ''));
  return m ? m[0] : null;
}

/** Lê e valida um código vindo de outra pessoa (nada dele vira comando sem passar por aqui). */
function lerCodigo(texto) {
  const codigo = extrairCodigo(texto);
  if (!codigo) return null;
  let p;
  try { p = deB64url(codigo.slice(VERSAO.length + 1)).split('|'); } catch { return null; }
  if (p.length < 10 || p[0] !== VERSAO) return null;
  const [, crc, plataforma, core, portaTxt, ends, senha, relayTxt, sessao] = p;
  const titulo = p.slice(9).join(' ').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 48);
  const porta = Number(portaTxt);
  const enderecos = (ends || '').split(',').filter(e => RE_IP.test(e)).slice(0, 4);
  if (!RE_CRC.test(crc) || !RE_CORE.test(core) || !RE_PLAT.test(plataforma) || !RE_SENHA.test(senha)) return null;
  let relay = null;
  if (relayTxt) {
    const [ip, pr] = relayTxt.split(':');
    const prN = Number(pr);
    if (!RE_IP.test(ip) || !portaOk(prN) || !RE_SESSAO.test(sessao || '')) return null;
    relay = { ip, porta: prN, sessao };
  }
  if (!relay && (!enderecos.length || !portaOk(porta))) return null;
  return { codigo, crc, plataforma, core, porta: portaOk(porta) ? porta : 55435, enderecos, senha, relay, titulo };
}

function linkDoCodigo(codigo) { return `arcadehub://entrar/${codigo}`; }

/**
 * Linhas extras para o RetroArch (--appendconfig). config_save_on_exit=false: nada
 * disto (senha, retransmissão) vai parar no retroarch.cfg do usuário.
 */
function configNetplay(o) {
  const linhas = { config_save_on_exit: 'false' };
  if (o.senha) linhas.netplay_password = o.senha;
  if (o.apelido) linhas.netplay_nickname = o.apelido;
  if (o.hospedar) {
    linhas.netplay_nat_traversal = o.upnp === false ? 'false' : 'true';
    if (o.relay && RELAYS[o.relay]) {
      linhas.netplay_use_mitm_server = 'true';
      linhas.netplay_mitm_server = o.relay;
      linhas.netplay_public_announce = 'true';     // é pela lista que o anfitrião descobre a sessão
    } else {
      linhas.netplay_use_mitm_server = 'false';
      linhas.netplay_public_announce = 'false';    // partida direta: não aparece na lista pública
    }
  }
  return Object.entries(linhas).map(([k, v]) => `${k} = "${String(v).replace(/["\r\n\\]/g, '')}"`).join('\n') + '\n';
}

/** Lista pública de partidas do RetroArch → a nossa (pelo apelido único), com a sessão da retransmissão. */
function acharNaLista(lista, apelido) {
  const salas = (Array.isArray(lista) ? lista : []).map(x => (x && x.fields) || x).filter(Boolean);
  const s = salas.find(x => x.username === apelido && x.mitm_session);
  if (!s) return null;
  const porta = Number(s.mitm_port);
  if (!RE_IP.test(String(s.mitm_ip || '')) || !portaOk(porta) || !RE_SESSAO.test(String(s.mitm_session))) return null;
  return { ip: String(s.mitm_ip), porta, sessao: String(s.mitm_session) };
}

/** Espera a partida aparecer na lista do RetroArch (ela anuncia alguns segundos depois de abrir). */
async function sessaoDaRetransmissao(apelido, o) {
  const op = o || {};
  const buscar = op.fetch || fetch;
  const tentativas = op.tentativas || 15;
  const intervalo = op.intervalo != null ? op.intervalo : 3000;
  for (let i = 0; i < tentativas; i++) {
    if (op.cancelado && op.cancelado()) return null;
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 6000);
      const r = await buscar(LOBBY + 'list', { signal: ctrl.signal }).finally(() => clearTimeout(t));
      if (r.ok) {
        const achado = acharNaLista(await r.json(), apelido);
        if (achado) return achado;
      }
    } catch { /* lista fora do ar: tenta de novo */ }
    await new Promise(res => setTimeout(res, intervalo));
  }
  return null;
}

/* ---------------- partidas na mesma rede ---------------- */

/** Endereços de broadcast das placas de rede (rede de casa e VPN). */
function enderecosBroadcast() {
  const out = new Set(['255.255.255.255']);
  for (const lista of Object.values(os.networkInterfaces())) {
    for (const i of lista || []) {
      if ((i.family !== 'IPv4' && i.family !== 4) || i.internal || !i.netmask) continue;
      const ip = i.address.split('.').map(Number), m = i.netmask.split('.').map(Number);
      out.add(ip.map((b, k) => (b & m[k]) | (~m[k] & 255)).join('.'));
    }
  }
  return [...out];
}

/** Enquanto hospeda: responde a quem perguntar na rede de casa. */
class AnuncioLan {
  constructor(o) { this.porta = (o && o.porta) || PORTA_LAN; this.sock = null; this.partida = null; }
  iniciar(partida) {
    this.partida = partida;
    if (this.sock) return;
    const s = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    s.on('error', () => { try { s.close(); } catch { /* já fechado */ } if (this.sock === s) this.sock = null; });
    s.on('message', (msg, de) => {
      if (!this.partida || msg.toString('utf8') !== PERGUNTA_LAN) return;
      const resp = Buffer.from(JSON.stringify(this.partida));
      if (resp.length < 1200) s.send(resp, de.port, de.address);
    });
    s.bind(this.porta);
    this.sock = s;
  }
  parar() {
    this.partida = null;
    if (this.sock) { try { this.sock.close(); } catch { /* já fechado */ } this.sock = null; }
  }
}

/** Pergunta na rede quem está hospedando. Devolve [{ codigo, titulo, nome, de }]. */
function procurarNaRede(o) {
  const op = o || {};
  const espera = op.espera || 1500;
  const alvos = op.alvos || enderecosBroadcast();
  const porta = op.porta || PORTA_LAN;
  return new Promise(resolve => {
    const achadas = new Map();
    const s = dgram.createSocket('udp4');
    const fim = () => { try { s.close(); } catch { /* já fechado */ } resolve([...achadas.values()]); };
    s.on('error', fim);
    s.on('message', (msg, de) => {
      try {
        const d = JSON.parse(msg.toString('utf8'));
        const c = lerCodigo(d.codigo);
        if (c && !achadas.has(c.codigo)) achadas.set(c.codigo, { codigo: c.codigo, titulo: c.titulo, nome: String(d.nome || '').slice(0, 30), de: de.address });
      } catch { /* resposta estranha: ignora */ }
    });
    s.bind(0, () => {
      try { s.setBroadcast(true); } catch { /* sem broadcast */ }
      const pergunta = Buffer.from(PERGUNTA_LAN);
      for (const a of alvos) s.send(pergunta, porta, a, () => {});
      setTimeout(fim, espera);
    });
  });
}

module.exports = {
  VERSAO, RELAYS, PORTA_LAN, novaSenha, apelidoUnico, criarCodigo, lerCodigo, extrairCodigo, linkDoCodigo,
  configNetplay, acharNaLista, sessaoDaRetransmissao, AnuncioLan, procurarNaRede, enderecosBroadcast
};
