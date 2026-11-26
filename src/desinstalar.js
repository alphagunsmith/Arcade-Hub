'use strict';
/**
 * Desinstalar um jogo pelo Arcade Hub, do jeito certo para cada origem:
 *   Steam            -> steam://uninstall/<appid> (a Steam pergunta e desinstala)
 *   Epic             -> abre o Epic Games Launcher (ele não aceita desinstalar por link)
 *   GOG e jogos .exe -> o desinstalador do próprio jogo, o mesmo de
 *                       "Configurações › Aplicativos" do Windows (unins000.exe, MSI…)
 *   .exe sem desinstalador -> a pasta do jogo vai para a Lixeira (dá para recuperar)
 *   ROM              -> o arquivo (e as faixas de um .cue/.m3u/.gdi) vai para a Lixeira
 *
 * A Lixeira nunca recebe uma pasta "grande demais": a raiz do disco, uma pasta da
 * biblioteca, a pasta do Windows/Program Files/usuário, ou uma pasta com outro jogo dentro.
 */
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const RAIZES_REGISTRO = [
  'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  'HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  'HKCU\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall'
];

const semAcento = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const nomeLimpo = s => semAcento(s).toLowerCase().replace(/[™®©]/g, '').replace(/[^a-z0-9]+/g, '');
/** Caminho comparável: barras normais, minúsculas (Windows), sem barra no fim. */
function chaveCaminho(p) {
  if (!p) return '';
  let s = String(p).trim().replace(/^"+|"+$/g, '').replace(/\\/g, '/').replace(/\/+$/, '');
  if (process.platform === 'win32' || /^[a-z]:\//i.test(s)) s = s.toLowerCase();
  return s;
}
const dentroDe = (filho, pai) => !!pai && (filho === pai || filho.startsWith(pai + '/'));

/** Saída do "reg query <raiz> /s" -> [{ chave, nome, local, desinstalar, icone }] */
function lerSaidaRegistro(texto) {
  const lista = [];
  for (const bloco of String(texto || '').split(/\r?\n(?=HKEY_)/)) {
    const get = k => {
      const m = new RegExp('^\\s+' + k + '\\s+REG_(?:EXPAND_)?SZ\\s+(.*)$', 'im').exec(bloco);
      return m ? m[1].trim() : '';
    };
    const nome = get('DisplayName');
    const desinstalar = get('UninstallString');
    if (!nome || !desinstalar) continue;
    if (/^\s+SystemComponent\s+REG_DWORD\s+0x1\b/im.test(bloco)) continue;        // componente escondido do Windows
    lista.push({ chave: bloco.split(/\r?\n/)[0].trim(), nome, local: get('InstallLocation'), desinstalar, icone: get('DisplayIcon') });
  }
  return lista;
}

/** Desinstaladores do Windows (todas as raízes). */
function desinstaladoresDoWindows() {
  if (process.platform !== 'win32') return Promise.resolve([]);
  return Promise.all(RAIZES_REGISTRO.map(r => new Promise(res => {
    execFile('reg', ['query', r, '/s'], { encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024 },
      (err, out) => res(err ? [] : lerSaidaRegistro(out)));
  }))).then(l => l.flat());
}

/**
 * O desinstalador do jogo na lista do Windows:
 * 1) a pasta de instalação bate (ou o ícone/desinstalador está dentro da pasta do jogo);
 * 2) sem pasta registrada, o nome bate exatamente.
 */
function acharNoRegistro(game, lista) {
  const pasta = chaveCaminho(game.installDir);
  const titulo = nomeLimpo(game.title);
  let porNome = null;
  for (const e of lista) {
    if (/steam app \d+/i.test(e.chave) && game.source !== 'steam') continue;
    const local = chaveCaminho(e.local);
    // a pasta do jogo é a registrada (ou fica dentro dela); nunca a pasta-mãe de outro programa
    if (pasta && local && local.split('/').length > 2 && dentroDe(pasta, local)) return e;
    const pai = p => p.replace(/\/[^/]*$/, '');
    const arquivo = chaveCaminho(separarComando(e.desinstalar).arquivo);
    const icone = chaveCaminho(String(e.icone || '').replace(/,\s*-?\d+$/, ''));
    if (pasta && pasta.split('/').length > 2 && ((arquivo && pai(arquivo) === pasta) || (icone && pai(icone) === pasta))) return e;
    if (!porNome && titulo && nomeLimpo(e.nome) === titulo) porNome = e;
  }
  return porNome;
}

/** "C:\x\unins000.exe" /SILENT  |  MsiExec.exe /X{GUID}  ->  { arquivo, args } */
function separarComando(cmd) {
  const s = String(cmd || '').trim();
  if (s.startsWith('"')) {
    const fim = s.indexOf('"', 1);
    if (fim > 0) return { arquivo: s.slice(1, fim), args: s.slice(fim + 1).trim() };
  }
  const m = /^(.+?\.exe)(?:\s+(.*))?$/i.exec(s);
  if (m) return { arquivo: m[1], args: (m[2] || '').trim() };
  const sp = s.indexOf(' ');
  return sp > 0 ? { arquivo: s.slice(0, sp), args: s.slice(sp + 1) } : { arquivo: s, args: '' };
}

/** Pastas que nunca vão para a Lixeira inteiras. */
function pastaSegura(pasta, { pastasBiblioteca = [], outrosJogos = [] } = {}) {
  const p = chaveCaminho(pasta);
  if (!p) return { ok: false, motivo: 'O jogo não tem pasta conhecida' };
  const partes = p.split('/').filter(Boolean);
  if (partes.length < 2 || /^[a-z]:$/i.test(p)) return { ok: false, motivo: 'A pasta é a raiz do disco' };
  const env = process.env;
  const protegidas = [env.SystemRoot, env.windir, env.ProgramFiles, env['ProgramFiles(x86)'], env.ProgramData,
    env.USERPROFILE, env.APPDATA, env.LOCALAPPDATA, env.PUBLIC,
    env.USERPROFILE && path.join(env.USERPROFILE, 'Desktop'), env.USERPROFILE && path.join(env.USERPROFILE, 'Downloads'),
    env.USERPROFILE && path.join(env.USERPROFILE, 'Documents'), env.HOME].filter(Boolean).map(chaveCaminho);
  if (protegidas.some(x => x === p || dentroDe(x, p))) return { ok: false, motivo: 'É uma pasta do sistema' };
  for (const b of pastasBiblioteca.map(chaveCaminho).filter(Boolean)) {
    if (b === p || dentroDe(b, p)) return { ok: false, motivo: 'É uma pasta da sua biblioteca, com outros jogos' };
  }
  for (const o of outrosJogos.map(chaveCaminho).filter(Boolean)) {
    if (o !== p && dentroDe(o, p)) return { ok: false, motivo: 'A pasta tem outro jogo dentro' };
  }
  return { ok: true };
}

/** ROM + as faixas que ela usa (.cue/.m3u/.gdi), todas na mesma pasta. */
function arquivosDaRom(rom) {
  const lista = [rom];
  const dir = path.dirname(rom);
  const ext = path.extname(rom).toLowerCase();
  let texto = '';
  if (['.cue', '.m3u', '.gdi'].includes(ext)) {
    try { texto = fs.readFileSync(rom, 'utf8'); } catch { /* sem leitura: só o arquivo */ }
  }
  const nomes = [];
  if (ext === '.cue') for (const m of texto.matchAll(/^\s*FILE\s+"?([^"\r\n]+?)"?\s+\w+\s*$/gim)) nomes.push(m[1]);
  if (ext === '.m3u') for (const l of texto.split(/\r?\n/)) if (l.trim() && !l.startsWith('#')) nomes.push(l.trim());
  if (ext === '.gdi') for (const l of texto.split(/\r?\n/).slice(1)) { const m = /\s(?:"([^"]+)"|(\S+\.(?:bin|raw|iso)))\s/i.exec(l + ' '); if (m) nomes.push(m[1] || m[2]); }
  for (const n of nomes) {
    const f = path.resolve(dir, n);
    if (path.dirname(f) !== path.resolve(dir) && !f.startsWith(path.resolve(dir) + path.sep)) continue;   // nada fora da pasta
    if (fs.existsSync(f) && !lista.includes(f)) lista.push(f);
    if (path.extname(f).toLowerCase() === '.cue') for (const x of arquivosDaRom(f)) if (!lista.includes(x)) lista.push(x);
  }
  return lista;
}

/**
 * O que vai acontecer, antes de perguntar ao usuário.
 * -> { metodo, texto, ...dados } ; metodo: steam | epic | desinstalador | lixeira | rom | nenhum
 */
async function planejar(game, ctx = {}) {
  const lt = (game.launch && game.launch.type) || '';
  if (game.source === 'steam' || lt === 'steam') {
    const appId = String(game.launch && game.launch.appId || game.steamAppId || '').replace(/\D/g, '');
    if (appId) return { metodo: 'steam', appId, texto: 'A Steam vai abrir e pedir para você confirmar a desinstalação.' };
  }
  if (game.source === 'epic' || lt === 'epic') {
    return { metodo: 'epic', texto: 'A Epic não deixa outros programas desinstalarem. Vou abrir o Epic Games Launcher: na Biblioteca, clique nos três pontinhos do jogo › Desinstalar.' };
  }
  if (lt === 'rom' && game.launch.rom) {
    const arquivos = arquivosDaRom(game.launch.rom).filter(f => fs.existsSync(f));
    if (!arquivos.length) return { metodo: 'nenhum', texto: 'O arquivo do jogo não está mais no PC.' };
    return { metodo: 'rom', arquivos, texto: arquivos.length > 1
      ? `${arquivos.length} arquivos do jogo vão para a Lixeira (dá para recuperar de lá).`
      : `O arquivo ${path.basename(arquivos[0])} vai para a Lixeira (dá para recuperar de lá).` };
  }
  // GOG e jogos de pasta: primeiro o desinstalador do próprio jogo
  const pasta = game.installDir || (game.launch && game.launch.exe ? path.dirname(game.launch.exe) : '');
  if (pasta) {
    for (const n of ['unins000.exe', 'unins001.exe', 'uninstall.exe', 'Uninstall.exe', 'uninst.exe']) {
      const f = path.join(pasta, n);
      if (fs.existsSync(f)) return { metodo: 'desinstalador', arquivo: f, args: '', pasta, texto: 'O desinstalador do jogo vai abrir.' };
    }
  }
  const lista = ctx.desinstaladores || await desinstaladoresDoWindows();
  const reg = acharNoRegistro({ ...game, installDir: pasta }, lista);
  if (reg) {
    const { arquivo, args } = separarComando(reg.desinstalar);
    return { metodo: 'desinstalador', arquivo, args, pasta, nome: reg.nome, texto: `O desinstalador de "${reg.nome}" vai abrir (o mesmo das Configurações do Windows).` };
  }
  if (pasta && fs.existsSync(pasta)) {
    const seg = pastaSegura(pasta, ctx);
    if (!seg.ok) return { metodo: 'nenhum', texto: `Não achei um desinstalador e não vou mandar a pasta para a Lixeira: ${seg.motivo.toLowerCase()} (${pasta}).` };
    return { metodo: 'lixeira', pasta, texto: `Este jogo não tem desinstalador. A pasta inteira vai para a Lixeira, com os saves que estiverem nela (dá para recuperar de lá): ${pasta}` };
  }
  return { metodo: 'nenhum', texto: 'O jogo não está mais no PC.' };
}

/** Roda o desinstalador pelo Windows (pede permissão de administrador quando ele precisa) e espera terminar. */
function rodarDesinstalador(arquivo, args) {
  return new Promise(res => {
    const q = s => "'" + String(s).replace(/'/g, "''") + "'";
    const cmd = `Start-Process -FilePath ${q(arquivo)}` + (args ? ` -ArgumentList ${q(args)}` : '') + ' -Wait';
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', cmd],
      { windowsHide: true }, err => res(err ? { ok: false, erro: (err.message || '').split('\n')[0] } : { ok: true }));
  });
}

module.exports = {
  planejar, rodarDesinstalador, desinstaladoresDoWindows, lerSaidaRegistro, acharNoRegistro,
  separarComando, pastaSegura, arquivosDaRom, chaveCaminho
};
