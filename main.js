'use strict';
/**
 * Arcade Hub — processo principal do Electron
 */
const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
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
  const state = lib.register(ipcMain, { shell, dialog, BrowserWindow, app, store });

  // atalhos de janela vindos do renderer
  ipcMain.handle('win:action', (e, action) => {
    const w = BrowserWindow.fromWebContents(e.sender);
    if (!w) return { ok: false };
    if (action === 'min') w.minimize();
    if (action === 'max') w.isMaximized() ? w.unmaximize() : w.maximize();
    if (action === 'close') w.close();
    return { ok: true };
  });

  createWindow();
  iniciarAtualizacoes();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  // A primeira varredura (quando não existe lastScan) é feita pelo renderer, que já
  // mostra o botão girando e atualiza a tela sozinho — nada de escanear aqui em paralelo.
  void state;
});

/**
 * Atualização automática pelo GitHub Releases (alphagunsmith/Arcade-Hub).
 * Só roda no app instalado: em desenvolvimento e na versão portátil não há
 * o que atualizar. Baixa em segundo plano, avisa e instala ao fechar o app.
 */
function iniciarAtualizacoes() {
  if (!app.isPackaged || process.env.PORTABLE_EXECUTABLE_DIR) return;
  let autoUpdater;
  try { ({ autoUpdater } = require('electron-updater')); } catch (e) {
    console.warn('[arcade-hub] atualizador indisponível:', e && e.message);
    return;
  }
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('error', err => console.warn('[arcade-hub] falha ao procurar atualização:', err && err.message));
  autoUpdater.checkForUpdatesAndNotify().catch(() => { /* sem internet: tenta na próxima vez */ });
  // app aberto o dia todo: confere de novo a cada 6 horas
  setInterval(() => autoUpdater.checkForUpdatesAndNotify().catch(() => {}), 6 * 60 * 60 * 1000).unref();
}

process.on('uncaughtException', err => {
  console.error('[arcade-hub] exceção não tratada:', err);
});
process.on('unhandledRejection', err => {
  console.error('[arcade-hub] promise rejeitada:', err);
});

// grava o que ainda estiver pendente (o store junta gravações em lote)
app.on('will-quit', () => { try { store.flush(); } catch (e) { console.error('[arcade-hub] falha ao gravar a biblioteca:', e); } });

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
