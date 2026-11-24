'use strict';
/**
 * Arcade Hub — vigia de sessões de jogo.
 *
 * Jogos abertos por loja (steam://, Epic, GOG) ou por um launcher que fecha logo
 * depois de abrir o jogo não deixam um processo-filho para acompanhar. Aqui o
 * app olha, de tempos em tempos, quais programas estão rodando e se algum deles
 * fica DENTRO da pasta do jogo. Enquanto houver, a sessão está aberta.
 *
 *  - lista processos só enquanto há jogo sendo vigiado (custo zero no resto do tempo)
 *  - Windows: um PowerShell aberto durante o jogo (processos-win.js), que também
 *    vê jogos abertos como administrador; plano B: Get-Process
 *  - Linux: /proc/<pid>/exe (usado nos testes)
 *  - uma sessão só termina depois de 2 checagens seguidas sem o jogo (evita
 *    cortar a sessão quando o jogo reinicia sozinho, ex.: depois de um patch)
 */
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { ListadorPersistente } = require('./processos-win');

const norm = p => String(p || '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();

let listador = null;   // PowerShell que fica aberto enquanto há jogo vigiado (só Windows)

/** Caminhos (normalizados) dos executáveis em execução agora. */
async function listarProcessos() {
  if (process.platform === 'win32') {
    if (!listador) listador = new ListadorPersistente();
    if (listador.confiavel) {
      const lista = await listador.listar();
      if (lista) return lista.map(norm);
      if (listador.confiavel) return null;      // falha passageira: o vigia tenta de novo
    }
    return listarViaGetProcess();               // plano B: o jeito antigo
  }
  if (process.platform === 'linux') {
    const out = [];
    let pids = [];
    try { pids = fs.readdirSync('/proc').filter(n => /^\d+$/.test(n)); } catch { return null; }
    for (const pid of pids) {
      try { out.push(norm(fs.readlinkSync(`/proc/${pid}/exe`))); } catch { /* processo sumiu ou sem permissão */ }
    }
    return out;
  }
  return null;
}

/** Plano B no Windows: Get-Process (não vê jogos abertos como administrador). */
function listarViaGetProcess() {
  return new Promise(resolve => {
    execFile('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command',
      '[Console]::OutputEncoding=[Text.Encoding]::UTF8; Get-Process | Where-Object { $_.Path } | ForEach-Object { $_.Path }'
    ], { windowsHide: true, timeout: 20000, maxBuffer: 16 * 1024 * 1024 }, (err, stdout) => {
      if (err && !stdout) return resolve(null);              // null = não deu para saber
      resolve(String(stdout || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean).map(norm));
    });
  });
}

/**
 * A pasta serve para vigiar? Pasta curta demais (raiz de disco), a pasta de
 * varredura inteira ou a "steamapps/common" pegariam outros jogos junto.
 */
function pastaVigiavel(pasta, proibidas) {
  const p = norm(pasta);
  if (!p) return false;
  const partes = p.split('/').filter(Boolean);
  if (partes.length < 2) return false;                                   // "c:" ou "/"
  if (/\/steamapps(\/common)?$/.test(p)) return false;
  if (/\/(program files( \(x86\))?|programdata|windows|users\/[^/]+)$/.test(p)) return false;
  for (const x of proibidas || []) if (norm(x) === p) return false;
  return true;
}

class VigiaDeSessoes {
  /**
   * @param {object} o
   * @param {() => Promise<string[]|null>} [o.listar]
   * @param {number} [o.intervalo]       ms entre checagens
   * @param {number} [o.esperaInicio]    quanto esperar o jogo aparecer
   * @param {(game) => void} o.onInicio
   * @param {(game, ms, info) => void} o.onFim
   */
  constructor(o) {
    this.listar = o.listar || listarProcessos;
    this.intervalo = o.intervalo || 15000;
    this.esperaInicio = o.esperaInicio || 3 * 60 * 1000;
    this.onInicio = o.onInicio || (() => {});
    this.onFim = o.onFim || (() => {});
    this.itens = new Map();          // gameId -> { game, pasta, criado, inicio, ultimo, faltas }
    this.timer = null;
    this.rodandoTick = false;
  }

  vigiando(id) { return this.itens.has(id); }

  /** Começa a vigiar a pasta do jogo. `inicio` > 0 = a sessão já começou (ex.: veio de um .exe). */
  vigiar(game, opts) {
    const o = opts || {};
    if (!game || this.itens.has(game.id)) return false;
    const pasta = norm(o.pasta || game.installDir);
    if (!pastaVigiavel(pasta, o.proibidas)) return false;
    this.itens.set(game.id, {
      game, pasta, criado: Date.now(),
      inicio: o.inicio || 0, ultimo: o.inicio || 0, faltas: 0,
      espera: o.espera || this.esperaInicio
    });
    this._agendar(o.primeiraChecagem != null ? o.primeiraChecagem : 4000);
    return true;
  }

  parar(id) { this.itens.delete(id); }

  _agendar(ms) {
    if (this.timer) return;
    this.timer = setTimeout(() => { this.timer = null; this.tick(); }, ms);
    if (this.timer.unref) this.timer.unref();
  }

  async tick() {
    if (this.rodandoTick || !this.itens.size) return;
    this.rodandoTick = true;
    try {
      const procs = await this.listar();
      const agora = Date.now();
      for (const [id, it] of [...this.itens]) {
        if (procs === null) {                                // não deu para listar: tenta de novo
          if (!it.inicio && agora - it.criado > it.espera) { this.itens.delete(id); this.onFim(it.game, 0, { nuncaAbriu: true }); }
          continue;
        }
        const rodando = procs.some(p => p.startsWith(it.pasta + '/'));
        if (rodando) {
          if (!it.inicio) { it.inicio = agora; this.onInicio(it.game); }
          it.ultimo = agora;
          it.faltas = 0;
        } else if (it.inicio) {
          it.faltas++;
          if (it.faltas >= 2) {
            this.itens.delete(id);
            // o jogo fechou em algum momento entre a última vez visto e agora: conta metade
            const ms = Math.max(0, it.ultimo - it.inicio + Math.round(this.intervalo / 2));
            this.onFim(it.game, ms, {});
          }
        } else if (agora - it.criado > it.espera) {
          this.itens.delete(id);
          this.onFim(it.game, 0, { nuncaAbriu: true });
        }
      }
    } finally {
      this.rodandoTick = false;
      if (this.itens.size) this._agendar(this.intervalo);
    }
  }
}

module.exports = { VigiaDeSessoes, listarProcessos, listarViaGetProcess, pastaVigiavel, norm };
