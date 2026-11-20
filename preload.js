'use strict';
/**
 * Ponte segura entre a interface e o sistema (contextIsolation).
 * Nada de node no renderer: só estes métodos.
 */
const { contextBridge, ipcRenderer } = require('electron');

const call = (channel, payload) => ipcRenderer.invoke(channel, payload);

contextBridge.exposeInMainWorld('arcadeAPI', {
  // estado
  getState: () => call('state:get'),
  scan: () => call('scan:run'),

  // jogos
  addGame: game => call('game:add', game),
  updateGame: payload => call('game:update', payload),
  removeGame: id => call('game:remove', id),
  toggleFavorite: id => call('game:favorite', id),
  toggleHidden: id => call('game:hide', id),
  launch: id => call('game:launch', id),

  // ajustes
  saveSettings: patch => call('settings:save', patch),
  pickFolders: () => call('dialog:pickFolders'),
  pickFile: opts => call('dialog:pickFile', opts),

  // capas
  searchCovers: payload => call('covers:search', payload),        // { id, title }
  applyCover: payload => call('covers:apply', payload),           // { id, candidate }
  applyLocalCover: payload => call('covers:local', payload),      // { id, filePath }
  autoCovers: payload => call('covers:auto', payload),            // { ids }
  onCoverProgress: cb => {
    const handler = (_e, p) => cb(p);
    ipcRenderer.on('covers:progress', handler);
    return () => ipcRenderer.removeListener('covers:progress', handler);
  },

  // vídeos (rondel)
  videoFor: payload => call('video:for', payload),                 // { id, title, steamAppId }
  videoUrlHttp: payload => call('video:http', payload),            // { arquivo } — reserva p/ <video>

  // gêneros
  listGenres: () => call('genres:list'),
  autoGenres: payload => call('genres:auto', payload),          // { ids }
  setGenres: payload => call('genres:set', payload),            // { id, genres }
  onGenreProgress: cb => {
    const handler = (_e, p) => cb(p);
    ipcRenderer.on('genres:progress', handler);
    return () => ipcRenderer.removeListener('genres:progress', handler);
  },

  // ficha do jogo (Metacritic / Wikidata / Steam)
  lookupMeta: payload => call('meta:lookup', payload),   // { id, refresh }
  primeMeta: payload => call('meta:prime', payload),     // { ids, limit }
  onMetaProgress: cb => {
    const handler = (_e, p) => cb(p);
    ipcRenderer.on('meta:progress', handler);
    return () => ipcRenderer.removeListener('meta:progress', handler);
  },

  // tempo de jogo
  addPlaytime: payload => call('playtime:tick', payload),      // { id, seconds }
  resetPlaytime: id => call('playtime:reset', id),
  onSessionEnd: cb => {
    const handler = (_e, p) => cb(p);
    ipcRenderer.on('game:sessionEnd', handler);
    return () => ipcRenderer.removeListener('game:sessionEnd', handler);
  },
  onSessionStart: cb => {
    const handler = (_e, p) => cb(p);
    ipcRenderer.on('game:sessionStart', handler);
    return () => ipcRenderer.removeListener('game:sessionStart', handler);
  },

  // biblioteca mudou sozinha (varredura automática)
  onLibraryChanged: cb => {
    const handler = (_e, p) => cb(p);
    ipcRenderer.on('library:changed', handler);
    return () => ipcRenderer.removeListener('library:changed', handler);
  },

  // atualização do app
  updateStatus: () => call('update:get'),
  checkUpdates: () => call('update:check'),
  installUpdate: () => call('update:install'),
  onUpdateStatus: cb => {
    const handler = (_e, p) => cb(p);
    ipcRenderer.on('update:status', handler);
    return () => ipcRenderer.removeListener('update:status', handler);
  },

  // backup
  exportLibrary: () => call('library:export'),
  importLibrary: mode => call('library:import', { mode }),

  // diagnóstico
  diagnostics: () => call('diag:get'),

  // cancelar buscas em lote
  cancelBatch: which => call('batch:cancel', which),

  // detecção automática
  detectEmulators: payload => call('detect:emulators', payload),   // { extraDirs }
  applyEmulators: payload => call('detect:apply', payload),        // { picks }
  detectLaunchers: () => call('detect:launchers'),

  // sistema
  openPath: p => call('app:openPath', p),
  reveal: p => call('app:reveal', p),

  // janela
  win: {
    min: () => ipcRenderer.invoke('win:action', 'min'),
    max: () => ipcRenderer.invoke('win:action', 'max'),
    close: () => ipcRenderer.invoke('win:action', 'close')
  },
  // Modo TV: tela cheia
  setFullscreen: on => ipcRenderer.invoke('win:action', on ? 'fullscreen-on' : 'fullscreen-off')
});
