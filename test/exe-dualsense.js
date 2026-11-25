'use strict';
/**
 * Confere o DualSenseAuto.exe gerado (só no CI do Windows, antes de publicar):
 * o auto-teste roda dentro do .exe e o modo embutido abre, responde e fecha com calma.
 *   node test/exe-dualsense.js build/dualsense/DualSenseAuto/DualSenseAuto.exe
 */
const path = require('path'), fs = require('fs'), os = require('os');
const { spawnSync } = require('child_process');
const D = require('../src/dualsense.js');

(async () => {
  const exe = path.resolve(process.argv[2]);
  const dados = fs.mkdtempSync(path.join(os.tmpdir(), 'ds-exe-'));
  const t = spawnSync(exe, ['--teste'], { env: { ...process.env, DUALSENSE_AUTO_DADOS: dados }, timeout: 240000 });
  if (t.status !== 0) {
    let log = ''; try { log = fs.readFileSync(path.join(dados, 'erro.log'), 'utf8'); } catch { /* sem log */ }
    throw new Error(`auto-teste do .exe falhou (código ${t.status}, ${t.error || ''})\n${log}`);
  }
  console.log('auto-teste dentro do .exe: ok');
  const ds = new D.DualSenseAuto({ comando: { cmd: exe, args: [] }, dados, ignorar: ['Arcade Hub.exe'] });
  ds.iniciar();
  for (let i = 0; i < 300 && ds.estado !== 'ligado' && ds.estado !== 'erro' && ds.estado !== 'ja-aberto'; i++) await new Promise(r => setTimeout(r, 100));
  if (ds.estado !== 'ligado') throw new Error('modo embutido não abriu: ' + ds.estado + ' ' + ds.msg);
  const r = await ds.resumo();
  if (!r) throw new Error('o painel do .exe não respondeu');
  console.log('modo embutido: ok', JSON.stringify(r));
  const filho = ds.filho;
  await ds.parar();
  if (filho.exitCode !== 0) throw new Error('não fechou com calma (código ' + filho.exitCode + ')');
  console.log('fechou com calma: ok');
})().catch(e => { console.error(e && e.stack || e); process.exit(1); });
