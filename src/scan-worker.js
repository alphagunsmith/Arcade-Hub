'use strict';
/**
 * Processo separado da varredura (Electron utilityProcess).
 * Recebe os ajustes, lê disco/registro e devolve os jogos achados.
 * Assim o processo principal (e a janela) não travam durante o scan.
 */
const lib = require('./lib');

process.parentPort.once('message', e => {
  const { settings, opts } = e.data || {};
  try {
    const { collected, report } = lib.collectScan(settings || {}, opts || {});
    process.parentPort.postMessage({ ok: true, collected, report });
  } catch (err) {
    process.parentPort.postMessage({ ok: false, error: String((err && err.message) || err) });
  }
});
