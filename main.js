'use strict';
/**
 * Arcade Hub — processo principal do Electron
 */
const { app, BrowserWindow, ipcMain, shell, dialog, Tray, Menu, nativeImage, session } = require('electron');
const path = require('path');
const lib = require('./src/lib');

// um único processo por instância (evita dois launchers brigando pelo library.json)
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
  });
}

if (process.platform === 'win32') app.setAppUserModelId('com.arcadehub.launcher');

let win = null;
let hub = null;                 // o que o lib.register devolve (estado, sessões, varredura)
const store = new lib.Store(app.getPath('userData'));

// lembra tamanho/posição da janela entre execuções (e não abre fora da tela)
function savedBounds() {
  const { screen } = require('electron');
  const b = (store.load().settings || {}).windowBounds;
  if (!b || !b.width || !b.height) return {};
  const area = screen.getPrimaryDisplay().workArea;
  const dentro = b.x !== undefined &&
    b.x + 100 > area.x && b.y + 40 > area.y &&
    b.x < area.x + area.width - 100 && b.y < area.y + area.height - 60;
  return dentro ? b : { width: b.width, height: b.height };
}

function trackBounds(w) {
  let t = null;
  const grava = () => {
    clearTimeout(t);
    t = setTimeout(() => {
      if (w.isDestroyed() || w.isMinimized() || w.isFullScreen()) return;
      const { width, height, x, y } = w.getNormalBounds ? w.getNormalBounds() : w.getBounds();
      try { store.saveSettings({ windowBounds: { width, height, x, y } }); } catch { /* ignora */ }
    }, 600);
  };
  w.on('resize', grava);
  w.on('move', grava);
}

function createWindow() {
  const b = savedBounds();
  win = new BrowserWindow({
    width: b.width || 1280,
    height: b.height || 820,
    ...(b.x !== undefined ? { x: b.x, y: b.y } : {}),
    minWidth: 940,
    minHeight: 600,
    show: false,
    icon: path.join(__dirname, 'assets', 'icon.png'),
    backgroundColor: '#0a0c11',
    frame: false,
    titleBarStyle: 'hidden',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,           // o preload só usa contextBridge/ipcRenderer: funciona no sandbox
      spellcheck: false
    }
  });

  trackBounds(win);
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.once('ready-to-show', () => win.show());

  // links externos abrem no navegador; nada de navegar fora do app
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file://')) { e.preventDefault(); if (/^https?:/i.test(url)) shell.openExternal(url); }
  });
  // se a interface travar, avisa em vez de mostrar uma janela morta em silêncio
  win.on('unresponsive', () => console.warn('[arcade-hub] janela não está respondendo'));

  if (process.argv.includes('--dev')) win.webContents.openDevTools({ mode: 'detach' });
}

app.whenReady().then(() => {
  // O player embutido do YouTube exige saber de onde vem (sem isso: "Erro 153").
  // A página do app é file://, que não manda origem; aqui ela se identifica.
  session.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: ['https://www.youtube-nocookie.com/*', 'https://www.youtube.com/*'] },
    (d, cb) => {
      if (!d.requestHeaders.Referer) d.requestHeaders.Referer = 'https://github.com/alphagunsmith/Arcade-Hub';
      cb({ requestHeaders: d.requestHeaders });
    }
  );

  hub = lib.register(ipcMain, { shell, dialog, BrowserWindow, app, store });
  ligarBandejaDuranteOJogo();
  registrarIpcDeAtualizacao();

  // atalhos de janela vindos do renderer
  ipcMain.handle('win:action', (e, action) => {
    const w = BrowserWindow.fromWebContents(e.sender);
    if (!w) return { ok: false };
    if (action === 'min') w.minimize();
    if (action === 'max') w.isMaximized() ? w.unmaximize() : w.maximize();
    if (action === 'close') w.close();
    if (action === 'fullscreen-on') w.setFullScreen(true);
    if (action === 'fullscreen-off') w.setFullScreen(false);
    return { ok: true };
  });

  createWindow();
  iniciarAtualizacoes();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  // A primeira varredura (quando não existe lastScan) é feita pelo renderer, que já
  // mostra o botão girando e atualiza a tela sozinho. Com a biblioteca já montada,
  // o lib.register confere sozinho em segundo plano alguns segundos depois de abrir.
});

/* ------------------------------------------------------------------ */
/* Bandeja: o launcher sai da frente enquanto o jogo roda              */
/* ------------------------------------------------------------------ */
let tray = null;
let escondidoPeloJogo = false;

function mostrarJanela() {
  if (!win || win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function criarBandeja(titulo) {
  if (!tray) {
    const icone = nativeImage.createFromPath(path.join(__dirname, 'assets', 'icon.png')).resize({ width: 16, height: 16 });
    tray = new Tray(icone);
    tray.on('click', mostrarJanela);
    tray.on('double-click', mostrarJanela);
  }
  tray.setToolTip(`Arcade Hub — jogando ${titulo}`);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: `Jogando: ${titulo}`, enabled: false },
    { type: 'separator' },
    { label: 'Abrir o Arcade Hub', click: mostrarJanela },
    { label: 'Sair', click: () => app.quit() }
  ]));
}

function ligarBandejaDuranteOJogo() {
  lib.eventos.on('sessao:inicio', ({ title }) => {
    if (store.settings.minimizarAoJogar === false || !win || win.isDestroyed()) return;
    try {
      criarBandeja(title);
      escondidoPeloJogo = true;
      win.hide();
    } catch (e) { console.warn('[arcade-hub] bandeja indisponível:', e && e.message); }
  });
  lib.eventos.on('sessao:fim', ({ ativas }) => {
    if (ativas > 0) return;                       // ainda tem outro jogo aberto
    if (escondidoPeloJogo) { escondidoPeloJogo = false; mostrarJanela(); }
    if (tray) { tray.destroy(); tray = null; }
  });
}

/* ------------------------------------------------------------------ */
/* Atualização: estado vai para a interface (faixa "Reiniciar agora")  */
/* ------------------------------------------------------------------ */
let autoUpdater = null;
let estadoAtualizacao = { estado: 'parado' };

function avisarAtualizacao(e) {
  estadoAtualizacao = { ...e, at: Date.now() };
  for (const w of BrowserWindow.getAllWindows()) {
    try { if (!w.isDestroyed()) w.webContents.send('update:status', estadoAtualizacao); } catch { /* fechando */ }
  }
}

function registrarIpcDeAtualizacao() {
  ipcMain.handle('update:get', () => ({
    ok: true,
    data: { ...estadoAtualizacao, suportado: !!autoUpdater, versaoAtual: app.getVersion() }
  }));
  ipcMain.handle('update:check', async () => {
    if (!autoUpdater) return { ok: false, error: 'A atualização automática só funciona na versão instalada pelo instalador.' };
    try { await autoUpdater.checkForUpdates(); } catch (e) { return { ok: false, error: String((e && e.message) || e) }; }
    return { ok: true, data: estadoAtualizacao };
  });
  ipcMain.handle('update:install', () => {
    if (!autoUpdater || estadoAtualizacao.estado !== 'pronto') return { ok: false, error: 'Nenhuma atualização pronta para instalar.' };
    try { if (hub) hub.fecharSessoes(); store.flush(); } catch { /* segue */ }
    setImmediate(() => autoUpdater.quitAndInstall(false, true));
    return { ok: true };
  });
}

/**
 * Atualização automática pelo GitHub Releases (alphagunsmith/Arcade-Hub).
 * Só roda no app instalado: em desenvolvimento e na versão portátil não há
 * o que atualizar. Baixa em segundo plano, avisa e instala ao fechar o app.
 */
function iniciarAtualizacoes() {
  if (!app.isPackaged || process.env.PORTABLE_EXECUTABLE_DIR) return;
  try { ({ autoUpdater } = require('electron-updater')); } catch (e) {
    console.warn('[arcade-hub] atualizador indisponível:', e && e.message);
    autoUpdater = null;
    return;
  }
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;      // se o usuário não clicar em "Reiniciar", instala ao fechar
  let ultimoPct = -1;
  autoUpdater.on('checking-for-update', () => avisarAtualizacao({ estado: 'procurando' }));
  autoUpdater.on('update-not-available', () => avisarAtualizacao({ estado: 'atualizado' }));
  autoUpdater.on('update-available', info => avisarAtualizacao({ estado: 'baixando', versao: info && info.version, progresso: 0 }));
  autoUpdater.on('download-progress', p => {
    const pct = Math.floor((p && p.percent) || 0);
    if (pct === ultimoPct) return;
    ultimoPct = pct;
    avisarAtualizacao({ ...estadoAtualizacao, estado: 'baixando', progresso: pct });
  });
  autoUpdater.on('update-downloaded', info => avisarAtualizacao({ estado: 'pronto', versao: info && info.version }));
  autoUpdater.on('error', err => {
    console.warn('[arcade-hub] falha ao procurar atualização:', err && err.message);
    avisarAtualizacao({ estado: 'erro', mensagem: String((err && err.message) || err) });
  });
  autoUpdater.checkForUpdates().catch(() => { /* sem internet: tenta na próxima vez */ });
  // app aberto o dia todo: confere de novo a cada 6 horas
  setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 6 * 60 * 60 * 1000).unref();
}

process.on('uncaughtException', err => {
  console.error('[arcade-hub] exceção não tratada:', err);
});
process.on('unhandledRejection', err => {
  console.error('[arcade-hub] promise rejeitada:', err);
});

// sessões ainda abertas (jogo rodando quando o launcher fecha) entram no tempo de jogo
app.on('before-quit', () => { try { if (hub) hub.fecharSessoes(); } catch (e) { console.error('[arcade-hub] falha ao gravar sessões:', e); } });

// grava o que ainda estiver pendente (o store junta gravações em lote)
app.on('will-quit', () => { try { store.flush(); } catch (e) { console.error('[arcade-hub] falha ao gravar a biblioteca:', e); } });

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
