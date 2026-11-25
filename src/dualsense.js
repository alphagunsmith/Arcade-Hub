'use strict';
/**
 * DualSense Auto dentro do Arcade Hub.
 *
 * O DualSense Auto (vibração e gatilhos adaptáveis inteligentes, controle de Xbox
 * virtual, mods) vem junto no instalador como um .exe próprio (feito em Python).
 * Aqui o Arcade Hub:
 *   - abre o programa em segundo plano ("--embutido": sem janela própria);
 *   - passa a pasta de dados (fora da pasta do app, que é trocada a cada atualização),
 *     o token do painel e o nome do .exe do Arcade Hub (a janela dele não é um jogo);
 *   - descobre a porta do painel pelo .painel.json que o programa grava;
 *   - religa se ele cair, e desliga com calma ao fechar (o programa devolve os
 *     gatilhos ao normal; matar à força deixaria o gatilho duro até tirar o cabo).
 * O programa também vigia o PID do Arcade Hub: se o Arcade Hub travar ou for
 * encerrado, ele fecha sozinho em até 2 segundos.
 */
const { EventEmitter } = require('events');
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');

const ESPERA_PRONTO_MS = 25000;
const MAX_RELIGAR = 3;          // quedas seguidas antes de desistir
const JANELA_QUEDAS_MS = 10 * 60 * 1000;
const MSG_JA_ABERTO = 'Já existe um DualSense Auto aberto fora do Arcade Hub. Feche ele (botão "Desligar o app" no painel dele) e ligue aqui de novo.';

/** Como abrir o DualSense Auto: o .exe empacotado, ou o código-fonte em desenvolvimento. */
function comandoPadrao({ app, raiz }) {
  if (app && app.isPackaged) {
    if (process.platform !== 'win32') return null;
    const exe = path.join(process.resourcesPath, 'dualsense', 'DualSenseAuto.exe');
    return fs.existsSync(exe) ? { cmd: exe, args: [] } : null;
  }
  const script = path.join(raiz, 'dualsense', 'dualsense_auto.py');
  if (!fs.existsSync(script)) return null;
  const py = process.env.ARCADE_PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
  return { cmd: py, args: ['-I', script] };
}

function pedir(porta, token, metodo, caminho, corpo, timeout = 2500) {
  return new Promise(resolve => {
    const dados = corpo ? Buffer.from(JSON.stringify(corpo)) : null;
    const req = http.request({
      host: '127.0.0.1', port: porta, path: caminho, method: metodo, timeout,
      headers: { 'X-Token': token, ...(dados ? { 'Content-Type': 'application/json', 'Content-Length': dados.length } : {}) }
    }, res => {
      const partes = [];
      res.on('data', c => partes.push(c));
      res.on('end', () => {
        if (res.statusCode !== 200) return resolve(null);
        try { resolve(JSON.parse(Buffer.concat(partes).toString('utf8'))); } catch { resolve(null); }
      });
    });
    req.on('timeout', () => req.destroy());
    req.on('error', () => resolve(null));
    if (dados) req.write(dados);
    req.end();
  });
}

class DualSenseAuto extends EventEmitter {
  /**
   * @param {object} o
   * @param {{cmd:string,args:string[]}|null} o.comando  como abrir o programa
   * @param {string} o.dados       pasta de dados do DualSense Auto
   * @param {string[]} [o.ignorar] .exe que não são jogos (o próprio Arcade Hub)
   * @param {Function} [o.spawn]   para os testes
   */
  constructor(o) {
    super();
    this.comando = o.comando;
    this.dados = o.dados;
    this.ignorar = o.ignorar || [];
    this._spawn = o.spawn || spawn;
    this.esperaReligar = o.esperaReligar != null ? o.esperaReligar : 4000;
    this.estado = this.comando ? 'desligado' : 'ausente';
    this.msg = '';
    this.porta = 0;
    this.token = '';
    this.filho = null;
    this.quedas = [];
    this._parando = false;
    this._timer = null;
  }

  get rodando() { return !!this.filho; }
  get url() { return this.estado === 'ligado' && this.porta ? `http://127.0.0.1:${this.porta}/?t=${this.token}` : ''; }
  get origem() { return this.porta ? `http://127.0.0.1:${this.porta}` : ''; }

  _mudar(estado, msg = '') {
    if (estado === this.estado && msg === this.msg) return;
    this.estado = estado;
    this.msg = msg;
    this.emit('estado', this.publico());
  }

  publico() { return { estado: this.estado, msg: this.msg }; }

  iniciar() {
    if (!this.comando) { this._mudar('ausente', 'O DualSense Auto não veio nesta instalação'); return; }
    if (this.filho) return;
    clearTimeout(this._timer);
    this._parando = false;
    this.token = crypto.randomBytes(18).toString('base64url');
    const sessao = crypto.randomBytes(8).toString('hex');
    try { fs.mkdirSync(this.dados, { recursive: true }); } catch { /* o programa tenta de novo */ }
    const info = path.join(this.dados, '.painel.json');
    this.porta = 0;
    this._mudar('iniciando', 'Abrindo o DualSense Auto…');
    let filho;
    try {
      filho = this._spawn(this.comando.cmd, [...this.comando.args, '--embutido', '--sessao', sessao, '--pai', String(process.pid)], {
        env: {
          ...process.env,
          DUALSENSE_AUTO_DADOS: this.dados,
          DSA_TOKEN: this.token,
          DSA_IGNORAR: this.ignorar.join('|'),
          PYTHONIOENCODING: 'utf-8'
        },
        stdio: 'ignore',
        windowsHide: true
      });
    } catch (e) {
      this._mudar('erro', 'Não consegui abrir o DualSense Auto: ' + (e && e.message));
      return;
    }
    this.filho = filho;
    const inicio = Date.now();
    const lerInfo = () => { try { return JSON.parse(fs.readFileSync(info, 'utf8')); } catch { return null; } };
    filho.on('error', e => {
      if (this.filho !== filho) return;
      this.filho = null;
      this._mudar('erro', 'Não consegui abrir o DualSense Auto: ' + (e && e.message));
    });
    filho.on('exit', codigo => {
      if (this.filho !== filho) return;
      this.filho = null;
      this.porta = 0;
      if (this._parando) { if (this.estado !== 'erro') this._mudar('desligado'); return; }
      const d = lerInfo();
      if (this.estado === 'ja-aberto' || (d && d.sessao === sessao && d.erro === 'ja-aberto')) { this._mudar('ja-aberto', MSG_JA_ABERTO); return; }
      if (codigo === 0) { this._mudar('desligado', 'Desligado pelo painel'); return; }
      // caiu: tenta de novo algumas vezes
      const agora = Date.now();
      this.quedas = this.quedas.filter(t => agora - t < JANELA_QUEDAS_MS).concat(agora);
      const log = this._lerErro();
      if (this.quedas.length > MAX_RELIGAR) {
        this._mudar('erro', 'O DualSense Auto fechou com erro várias vezes' + (log ? ': ' + log : ''));
        return;
      }
      this._mudar('iniciando', 'O DualSense Auto fechou; abrindo de novo…');
      this._timer = setTimeout(() => this.iniciar(), this.esperaReligar);
      if (this._timer.unref) this._timer.unref();
    });
    // espera o programa contar a porta
    const conferir = () => {
      if (this.filho !== filho) return;
      const d = lerInfo();
      if (d && d.sessao === sessao) {
        if (d.erro === 'ja-aberto') {
          this._mudar('ja-aberto', MSG_JA_ABERTO);
          return;
        }
        if (d.pronto && Number(d.porta) > 0) {
          this.porta = Number(d.porta);
          this.quedas = [];
          this._mudar('ligado');
          return;
        }
      }
      if (Date.now() - inicio > ESPERA_PRONTO_MS) { this._mudar('erro', 'O DualSense Auto não respondeu'); this.parar(); return; }
      setTimeout(conferir, 200).unref?.();
    };
    setTimeout(conferir, 150).unref?.();
  }

  _lerErro() {
    try {
      const t = fs.readFileSync(path.join(this.dados, 'erro.log'), 'utf8').trim().split(/\r?\n/).filter(Boolean);
      return (t[t.length - 1] || '').slice(0, 200);
    } catch { return ''; }
  }

  /** Desliga com calma (devolve os gatilhos ao normal). Resolve quando o programa fechou. */
  parar(esperaMs = 4000) {
    clearTimeout(this._timer);
    const filho = this.filho;
    if (!filho) { if (this.estado !== 'ausente' && this.estado !== 'erro') this._mudar('desligado'); return Promise.resolve(); }
    this._parando = true;
    return new Promise(resolve => {
      const fim = setTimeout(() => { try { filho.kill(); } catch { /* já fechou */ } resolve(); }, esperaMs);
      filho.once('exit', () => { clearTimeout(fim); resolve(); });
      if (this.porta) pedir(this.porta, this.token, 'POST', '/api/desligar', {});
      else { try { filho.kill(); } catch { /* já fechou */ } }
    });
  }

  /** Resumo do que o programa está fazendo agora (para os Ajustes e o Modo TV). */
  async resumo() {
    if (this.estado !== 'ligado') return null;
    const e = await pedir(this.porta, this.token, 'GET', '/api/estado');
    if (!e) return null;
    const c = e.controle || {};
    const i = e.info || {};
    return {
      controle: !!c.conectado,
      nome: c.nome || '',
      via: c.via || '',
      xbox: e.xbox ? { ligado: !!e.xbox.ligado, ativo: !!e.xbox.ativo, status: e.xbox.status || '' } : null,
      ia: e.ia ? { tem_chave: !!e.ia.tem_chave, status: e.ia.status || '' } : null,
      jogo: (e.jogo && e.jogo.exe) || '',
      fonte: i.fonte_dados || '',
      arma: i.arma || ''
    };
  }
}

module.exports = { DualSenseAuto, comandoPadrao, pedir };
