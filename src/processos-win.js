'use strict';
/**
 * Arcade Hub — lista de programas abertos no Windows, para o tempo de jogo.
 *
 * Antes: um PowerShell novo a cada 15 s (Get-Process). Cada um leva perto de
 * meio segundo de CPU para abrir — enquanto você joga — e o Get-Process não
 * enxerga o caminho de programas abertos como administrador, então esses jogos
 * nunca tinham o tempo contado.
 *
 * Agora: UM PowerShell fica aberto enquanto há jogo sendo vigiado. A cada
 * pedido ("L"), ele responde os caminhos de todos os programas e uma linha
 * "##FIM##". O caminho vem do QueryFullProcessImageName com o acesso mínimo
 * (PROCESS_QUERY_LIMITED_INFORMATION), que funciona também para programas
 * abertos como administrador. Depois de 1 minuto sem pedidos, ele fecha.
 */
const { spawn } = require('child_process');

const FIM = '##FIM##';

const SCRIPT = String.raw`
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
Add-Type -TypeDefinition @"
using System;
using System.Text;
using System.Diagnostics;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public static class ArcadeHubProcessos {
  [DllImport("kernel32.dll", SetLastError = true)]
  static extern IntPtr OpenProcess(uint acesso, bool herdar, int pid);
  [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
  static extern bool QueryFullProcessImageName(IntPtr h, uint flags, StringBuilder nome, ref uint tamanho);
  [DllImport("kernel32.dll")]
  static extern bool CloseHandle(IntPtr h);
  public static string[] Listar() {
    var saida = new List<string>();
    foreach (var p in Process.GetProcesses()) {
      try {
        IntPtr h = OpenProcess(0x1000, false, p.Id);
        if (h == IntPtr.Zero) continue;
        try {
          var sb = new StringBuilder(1024);
          uint n = 1024;
          if (QueryFullProcessImageName(h, 0, sb, ref n)) saida.Add(sb.ToString());
        } finally { CloseHandle(h); }
      } catch { }
      finally { p.Dispose(); }
    }
    return saida.ToArray();
  }
}
"@
[Console]::Out.WriteLine('##PRONTO##')
[Console]::Out.Flush()
while ($true) {
  $linha = [Console]::In.ReadLine()
  if ($linha -eq $null -or $linha -eq 'Q') { break }
  foreach ($c in [ArcadeHubProcessos]::Listar()) { [Console]::Out.WriteLine($c) }
  [Console]::Out.WriteLine('${FIM}')
  [Console]::Out.Flush()
}
`;

class ListadorPersistente {
  /**
   * @param {object} [o]
   * @param {Function} [o.abrir]    () => ChildProcess (testes trocam por um falso)
   * @param {number} [o.ocioso]    ms sem pedidos até fechar o PowerShell
   * @param {number} [o.limite]    ms máximo esperando uma resposta
   */
  constructor(o) {
    const opts = o || {};
    this.abrir = opts.abrir || (() => spawn('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
      '-EncodedCommand', Buffer.from(SCRIPT, 'utf16le').toString('base64')
    ], { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] }));
    this.ocioso = opts.ocioso || 60000;
    this.limite = opts.limite || 15000;
    this.proc = null;
    this.buffer = '';
    this.linhas = [];
    this.pronto = null;          // Promise: o Add-Type terminou
    this.pedido = null;          // { resolve, timer }
    this.falhas = 0;
    this.timerOcioso = null;
  }

  _iniciar() {
    if (this.proc) return this.pronto;
    const p = this.abrir();
    this.proc = p;
    this.buffer = ''; this.linhas = [];
    let marcarPronto;
    this.pronto = new Promise(r => { marcarPronto = r; });
    p.stdout.setEncoding('utf8');
    p.stdout.on('data', txt => {
      if (this.proc !== p) return;             // resposta atrasada de um PowerShell já descartado
      this.buffer += txt;
      let i;
      while ((i = this.buffer.indexOf('\n')) >= 0) {
        const linha = this.buffer.slice(0, i).replace(/\r$/, '');
        this.buffer = this.buffer.slice(i + 1);
        if (linha === '##PRONTO##') { marcarPronto(true); continue; }
        if (linha === FIM) { this._responder(this.linhas); this.linhas = []; continue; }
        if (linha) this.linhas.push(linha);
      }
    });
    const morreu = () => {
      if (this.proc !== p) return;
      this.proc = null;
      marcarPronto(false);
      this._responder(null);
    };
    p.on('exit', morreu);
    p.on('error', morreu);
    if (p.stdin && p.stdin.on) p.stdin.on('error', () => { /* o processo já saiu */ });
    return this.pronto;
  }

  _responder(lista) {
    const pd = this.pedido;
    if (!pd) return;
    this.pedido = null;
    clearTimeout(pd.timer);
    pd.resolve(lista);
  }

  /** Caminhos dos programas abertos, ou null se não deu para saber. */
  async listar() {
    if (this.pedido) return null;              // um pedido por vez (o vigia não sobrepõe)
    clearTimeout(this.timerOcioso);
    const ok = await this._iniciar();
    if (!ok || !this.proc) { this.falhas++; return null; }
    const lista = await new Promise(resolve => {
      const timer = setTimeout(() => { this.pedido = null; resolve(null); this.encerrar(); }, this.limite);
      this.pedido = { resolve, timer };
      try { this.proc.stdin.write('L\n'); } catch { this._responder(null); }
    });
    if (lista === null) this.falhas++; else this.falhas = 0;
    this.timerOcioso = setTimeout(() => this.encerrar(), this.ocioso);
    if (this.timerOcioso.unref) this.timerOcioso.unref();
    return lista;
  }

  /** Funciona nesta máquina? Depois de 3 falhas seguidas, o vigia usa o plano B. */
  get confiavel() { return this.falhas < 3; }

  encerrar() {
    clearTimeout(this.timerOcioso);
    const p = this.proc;
    this.proc = null;
    if (!p) return;
    try { p.stdin.write('Q\n'); p.stdin.end(); } catch { /* já fechou */ }
    setTimeout(() => { try { p.kill(); } catch { /* já fechou */ } }, 2000).unref?.();
  }
}

module.exports = { ListadorPersistente, SCRIPT, FIM };
