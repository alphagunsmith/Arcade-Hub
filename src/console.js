'use strict';
/**
 * Arcade Hub — Modo Console: o PC funcionando como um videogame.
 *
 *  - energia: desligar, reiniciar e suspender o PC pelo controle;
 *  - iniciar com o Windows já no Modo Console;
 *  - emuladores: quais estão configurados, achar os que já estão instalados
 *    nos lugares de costume e o site oficial de cada um;
 *  - BIOS: confere os arquivos que cada console precisa. O app NÃO baixa BIOS
 *    (são arquivos com direitos autorais: cada um usa a do próprio console).
 *    Ele só diz se estão lá e se o arquivo é uma versão conhecida (MD5).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');

/* ------------------------------------------------------------------ */
/* energia                                                             */
/* ------------------------------------------------------------------ */

const COMANDOS_ENERGIA = {
  win32: {
    desligar: ['shutdown.exe', ['/s', '/t', '0']],
    reiniciar: ['shutdown.exe', ['/r', '/t', '0']],
    // SetSuspendState pelo .NET: suspende de verdade (o "rundll32 powrprof"
    // hiberna quando a hibernação está ligada)
    suspender: ['powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      'Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Application]::SetSuspendState([System.Windows.Forms.PowerState]::Suspend, $false, $false) | Out-Null']]
  },
  linux: {
    desligar: ['systemctl', ['poweroff']],
    reiniciar: ['systemctl', ['reboot']],
    suspender: ['systemctl', ['suspend']]
  }
};

/**
 * Executa uma ação de energia. `executar` é trocável nos testes.
 * @returns {Promise<{ok: boolean, erro?: string}>}
 */
function energia(acao, executar) {
  const tabela = COMANDOS_ENERGIA[process.platform];
  const cmd = tabela && tabela[acao];
  if (!cmd) return Promise.resolve({ ok: false, erro: tabela ? 'ação desconhecida' : 'disponível só no Windows' });
  const run = executar || ((exe, args, cb) => execFile(exe, args, { windowsHide: true, timeout: 20000 }, cb));
  return new Promise(resolve => {
    run(cmd[0], cmd[1], err => resolve(err ? { ok: false, erro: String(err.message || err) } : { ok: true }));
  });
}

/* ------------------------------------------------------------------ */
/* iniciar com o Windows                                               */
/* ------------------------------------------------------------------ */

const ARG_CONSOLE = '--modo-console';

function iniciarComWindows(app, ligar) {
  if (!app || typeof app.setLoginItemSettings !== 'function' || process.platform === 'linux') {
    return { ok: false, erro: 'disponível só no Windows' };
  }
  app.setLoginItemSettings({ openAtLogin: !!ligar, args: ligar ? [ARG_CONSOLE] : [] });
  return { ok: true, ligado: estadoInicio(app) };
}

function estadoInicio(app) {
  try { return !!(app && app.getLoginItemSettings && app.getLoginItemSettings({ args: [ARG_CONSOLE] }).openAtLogin); } catch { return false; }
}

/* ------------------------------------------------------------------ */
/* emuladores                                                          */
/* ------------------------------------------------------------------ */

/**
 * Emuladores recomendados por console: nome, site oficial e onde costumam
 * ficar no Windows (para achar sozinho). {LOCAL}, {ROAMING}, {PF}, {PF86}, {HOME}.
 */
const EMULADORES = {
  retroarch: { nome: 'RetroArch', site: 'https://www.retroarch.com/?page=platforms',
    caminhos: ['C:/RetroArch-Win64/retroarch.exe', 'C:/RetroArch/retroarch.exe', '{ROAMING}/RetroArch/retroarch.exe', '{PF}/RetroArch/retroarch.exe', '{HOME}/RetroArch-Win64/retroarch.exe'] },
  duckstation: { nome: 'DuckStation', site: 'https://www.duckstation.org/',
    caminhos: ['{LOCAL}/Programs/DuckStation/duckstation-qt-x64-ReleaseLTCG.exe', '{PF}/DuckStation/duckstation-qt-x64-ReleaseLTCG.exe', 'C:/DuckStation/duckstation-qt-x64-ReleaseLTCG.exe'] },
  pcsx2: { nome: 'PCSX2', site: 'https://pcsx2.net/downloads',
    caminhos: ['{PF}/PCSX2/pcsx2-qt.exe', '{LOCAL}/Programs/PCSX2/pcsx2-qt.exe', 'C:/PCSX2/pcsx2-qt.exe'] },
  ppsspp: { nome: 'PPSSPP', site: 'https://www.ppsspp.org/download/',
    caminhos: ['{PF}/PPSSPP/PPSSPPWindows64.exe', '{PF86}/PPSSPP/PPSSPPWindows64.exe', 'C:/PPSSPP/PPSSPPWindows64.exe'] },
  dolphin: { nome: 'Dolphin', site: 'https://dolphin-emu.org/download/',
    caminhos: ['{PF}/Dolphin/Dolphin.exe', '{PF}/Dolphin-x64/Dolphin.exe', 'C:/Dolphin-x64/Dolphin.exe'] },
  mgba: { nome: 'mGBA', site: 'https://mgba.io/downloads.html',
    caminhos: ['{PF}/mGBA/mGBA.exe', '{PF86}/mGBA/mGBA.exe', 'C:/mGBA/mGBA.exe'] },
  melonds: { nome: 'melonDS', site: 'https://melonds.kuribo64.net/downloads.php',
    caminhos: ['C:/melonDS/melonDS.exe', '{PF}/melonDS/melonDS.exe'] },
  flycast: { nome: 'Flycast', site: 'https://github.com/flyinghead/flycast/releases',
    caminhos: ['C:/Flycast/flycast.exe', '{PF}/Flycast/flycast.exe'] },
  cemu: { nome: 'Cemu', site: 'https://cemu.info/',
    caminhos: ['C:/Cemu/Cemu.exe', '{PF}/Cemu/Cemu.exe'] },
  azahar: { nome: 'Azahar', site: 'https://azahar-emu.org/',
    caminhos: ['{LOCAL}/Azahar/azahar.exe', '{PF}/Azahar/azahar.exe'] },
  snes9x: { nome: 'Snes9x', site: 'https://www.snes9x.com/',
    caminhos: ['C:/snes9x/snes9x-x64.exe', '{PF}/Snes9x/snes9x-x64.exe'] },
  project64: { nome: 'Project64', site: 'https://www.pj64-emu.com/',
    caminhos: ['{PF86}/Project64 3.0/Project64.exe', '{PF}/Project64 3.0/Project64.exe'] },
  mesen: { nome: 'Mesen', site: 'https://www.mesen.ca/',
    caminhos: ['C:/Mesen/Mesen.exe', '{PF}/Mesen/Mesen.exe'] },
  ares: { nome: 'ares', site: 'https://ares-emu.net/download',
    caminhos: ['C:/ares/ares.exe', '{PF}/ares/ares.exe'] },
  stella: { nome: 'Stella', site: 'https://stella-emu.github.io/downloads.html',
    caminhos: ['{PF}/Stella/Stella.exe', '{PF86}/Stella/Stella.exe'] },
  mame: { nome: 'MAME', site: 'https://www.mamedev.org/release.html',
    caminhos: ['C:/MAME/mame.exe', '{PF}/MAME/mame.exe'] }
};

/** Console → emuladores (o primeiro é o recomendado). RetroArch serve de reserva para quase todos. */
const RECOMENDADOS = {
  nes: ['mesen', 'retroarch'], snes: ['snes9x', 'retroarch'], n64: ['project64', 'retroarch'],
  gb: ['mgba', 'retroarch'], gbc: ['mgba', 'retroarch'], gba: ['mgba', 'retroarch'],
  nds: ['melonds', 'retroarch'], '3ds': ['azahar'], gc: ['dolphin'], wii: ['dolphin'], wiiu: ['cemu'],
  ps1: ['duckstation', 'retroarch'], ps2: ['pcsx2'], psp: ['ppsspp', 'retroarch'],
  genesis: ['ares', 'retroarch'], sms: ['ares', 'retroarch'], gg: ['ares', 'retroarch'],
  pce: ['ares', 'retroarch'], saturn: ['retroarch'], dreamcast: ['flycast', 'retroarch'],
  arcade: ['mame', 'retroarch'], atari2600: ['stella', 'retroarch'], neogeo: ['retroarch'],
  wonderswan: ['retroarch'], virtualboy: ['retroarch'], atari7800: ['retroarch'], c64: ['retroarch']
};

function expandir(modelo) {
  const env = process.env;
  return modelo
    .replace('{LOCAL}', env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'))
    .replace('{ROAMING}', env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'))
    .replace('{PF86}', env['ProgramFiles(x86)'] || 'C:/Program Files (x86)')
    .replace('{PF}', env.ProgramFiles || 'C:/Program Files')
    .replace('{HOME}', os.homedir());
}

/** Procura os emuladores instalados nos lugares de costume. { chave: caminho } */
function acharInstalados(existe) {
  const tem = existe || (p => { try { return fs.statSync(p).isFile(); } catch { return false; } });
  const achados = {};
  for (const [k, e] of Object.entries(EMULADORES)) {
    for (const modelo of e.caminhos) {
      const p = path.normalize(expandir(modelo));
      if (tem(p)) { achados[k] = p; break; }
    }
  }
  return achados;
}

/* ------------------------------------------------------------------ */
/* BIOS                                                                */
/* ------------------------------------------------------------------ */

/**
 * BIOS por console. `algum: true` = basta um dos arquivos. `opcional` = o
 * console roda sem, mas fica melhor com. MD5 das versões conhecidas (as mesmas
 * que a documentação do libretro lista).
 */
const BIOS = {
  ps1: { algum: true, dica: 'Na pasta "bios" do DuckStation ou na "system" do RetroArch.', arquivos: {
    'scph5501.bin': '490f666e1afb15b7362b406ed1cea246', 'scph5500.bin': '8dd7d5296a650fac7319bce665a6a53c',
    'scph5502.bin': '32736f17079d0b2b7024407c39bd3050', 'scph1001.bin': '924e392ed05558ffdb115408c263dccf' } },
  ps2: { algum: true, qualquerExt: '.bin', dica: 'Qualquer BIOS do PS2 (.bin) na pasta "bios" do PCSX2.', arquivos: {} },
  gba: { opcional: true, dica: 'Opcional: a maioria dos jogos roda sem.', arquivos: { 'gba_bios.bin': 'a860e8c0b6d573d191e4ec7db1b1e4f6' } },
  nds: { opcional: true, dica: 'Opcional no melonDS (ele tem uma BIOS livre embutida).', arquivos: {
    'bios7.bin': 'df692a80a5b1bc90728bc3dfc76cd948', 'bios9.bin': 'a392174eb3e572fed6447e956bde4b25', 'firmware.bin': null } },
  saturn: { algum: true, dica: 'Na pasta "system" do RetroArch.', arquivos: {
    'sega_101.bin': '85ec9ca47d8f6807718151cbcca8b964', 'mpr-17933.bin': '3240872c70984b6cbfda1586cab68dbe' } },
  dreamcast: { dica: 'Na pasta "system/dc" do RetroArch ou "data" do Flycast.', subpastas: ['dc'], arquivos: {
    'dc_boot.bin': 'e10c53c2f8b90bab96ead2d368858623', 'dc_flash.bin': null } },
  genesis: { opcional: true, nome: 'Sega CD / Mega CD', algum: true, dica: 'Só para jogos de Sega CD.', arquivos: {
    'bios_CD_U.bin': '2efd74e3232ff260e371b99f84024f7f', 'bios_CD_E.bin': 'e66fa1dc5820d254611fdcdba0662372', 'bios_CD_J.bin': '278a9397d192149e84e820ac621a8edd' } },
  pce: { opcional: true, nome: 'PC Engine CD', dica: 'Só para jogos de CD.', arquivos: { 'syscard3.pce': '38179df8f4ac870017db21ebcbf53114' } }
};

function md5(arquivo) {
  try {
    const st = fs.statSync(arquivo);
    if (!st.isFile() || st.size > 64 * 1024 * 1024) return null;
    return crypto.createHash('md5').update(fs.readFileSync(arquivo)).digest('hex');
  } catch { return null; }
}

/** Acha um arquivo sem ligar para maiúsculas (o Windows não liga; o Linux sim). */
function acharArquivo(pastas, nome, subpastas) {
  const alvo = nome.toLowerCase();
  for (const base of pastas) {
    for (const sub of ['', ...(subpastas || [])]) {
      const dir = sub ? path.join(base, sub) : base;
      let itens;
      try { itens = fs.readdirSync(dir); } catch { continue; }
      const achado = itens.find(n => n.toLowerCase() === alvo);
      if (achado) return path.join(dir, achado);
    }
  }
  return null;
}

/** Pastas onde os emuladores procuram BIOS, a partir do que está configurado. */
function pastasDeBios(settings) {
  const s = settings || {};
  const pastas = new Set();
  const add = p => { if (p) pastas.add(path.normalize(p)); };
  if (s.biosFolder) add(s.biosFolder);
  const ra = s.retroarch && s.retroarch.exe;
  if (ra) { add(path.join(path.dirname(ra), 'system')); }
  for (const emu of Object.values(s.emulators || {})) {
    if (!emu || !emu.exe) continue;
    const dir = path.dirname(emu.exe);
    add(dir); add(path.join(dir, 'bios')); add(path.join(dir, 'data')); add(path.join(dir, 'BIOS'));
  }
  // lugares padrão do DuckStation e do PCSX2 (Documentos)
  const docs = path.join(os.homedir(), 'Documents');
  add(path.join(docs, 'DuckStation', 'bios'));
  add(path.join(docs, 'PCSX2', 'bios'));
  add(path.join(os.homedir(), 'Documentos', 'DuckStation', 'bios'));
  add(path.join(os.homedir(), 'Documentos', 'PCSX2', 'bios'));
  return [...pastas];
}

/**
 * Situação da BIOS de um console.
 * @returns {null | { ok: boolean, opcional: boolean, dica: string, arquivos: {nome, estado, caminho}[] }}
 *   estado: 'valida' | 'desconhecida' (presente, versão que não está na lista) | 'faltando'
 */
function conferirBios(platformKey, pastas) {
  const def = BIOS[platformKey];
  if (!def) return null;
  const arquivos = [];
  for (const [nome, hash] of Object.entries(def.arquivos)) {
    const caminho = acharArquivo(pastas, nome, def.subpastas);
    let estado = 'faltando';
    if (caminho) estado = !hash || md5(caminho) === hash ? 'valida' : 'desconhecida';
    arquivos.push({ nome, estado, caminho });
  }
  if (def.qualquerExt) {
    for (const base of pastas) {
      let itens = [];
      try { itens = fs.readdirSync(base); } catch { continue; }
      for (const n of itens) {
        if (!n.toLowerCase().endsWith(def.qualquerExt)) continue;
        const caminho = path.join(base, n);
        try { if (fs.statSync(caminho).size < 1024 * 1024) continue; } catch { continue; }   // BIOS do PS2 tem ~4 MB
        arquivos.push({ nome: n, estado: 'valida', caminho });
      }
    }
  }
  const presentes = arquivos.filter(a => a.estado !== 'faltando');
  const ok = def.algum || def.qualquerExt ? presentes.length > 0 : arquivos.every(a => a.estado !== 'faltando');
  return { ok, opcional: !!def.opcional, dica: def.dica, nome: def.nome || null, arquivos };
}

/**
 * Situação de cada console que aparece na biblioteca (ou todos, com `todos`).
 * @returns {object[]} [{ platformKey, label, jogos, emulador: {exe, configurado, existe, viaRetroArch}, recomendados, bios }]
 */
function statusEmuladores(settings, jogos, labels, opts) {
  const s = settings || {};
  const o = opts || {};
  const contagem = {};
  for (const g of jogos || []) if (g.kind === 'rom' && g.platformKey) contagem[g.platformKey] = (contagem[g.platformKey] || 0) + 1;
  const chaves = o.todos ? Object.keys(RECOMENDADOS) : Object.keys(contagem);
  const pastas = pastasDeBios(s);
  const existe = p => { try { return fs.statSync(p).isFile(); } catch { return false; } };
  const instalados = o.instalados || {};
  const ra = s.retroarch && s.retroarch.exe;
  return chaves.sort((a, b) => (contagem[b] || 0) - (contagem[a] || 0) || String(labels[a] || a).localeCompare(labels[b] || b)).map(k => {
    const emu = (s.emulators || {})[k] || {};
    const viaRetroArch = !emu.exe && !!ra;
    const exe = emu.exe || (ra || '');
    return {
      platformKey: k,
      label: labels[k] || k,
      jogos: contagem[k] || 0,
      emulador: { exe, configurado: !!exe, existe: !!exe && existe(exe), viaRetroArch },
      recomendados: (RECOMENDADOS[k] || []).map(id => ({ id, nome: EMULADORES[id].nome, site: EMULADORES[id].site, instalado: instalados[id] || null })),
      bios: conferirBios(k, pastas)
    };
  });
}

module.exports = {
  energia, iniciarComWindows, estadoInicio, ARG_CONSOLE,
  EMULADORES, RECOMENDADOS, BIOS, acharInstalados, conferirBios, pastasDeBios, statusEmuladores, md5
};
