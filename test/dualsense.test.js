'use strict';
/** DualSense Auto dentro do Arcade Hub: auto-teste do programa, modo embutido, religar e chaves cifradas. */
const fs = require('fs'), path = require('path'), assert = require('assert');
const { EventEmitter } = require('events');
const { spawnSync, spawn } = require('child_process');
const { ROOT, tmp, t, pular, fim, espera } = require('./_base');
const D = require(path.join(ROOT, 'src', 'dualsense.js'));
const lib = require(path.join(ROOT, 'src', 'lib.js'));

const SCRIPT = path.join(ROOT, 'dualsense', 'dualsense_auto.py');
const esperar = async (cond, ms = 20000) => { for (let i = 0; i < ms / 50 && !cond(); i++) await espera(50); return cond(); };
const ENV_PY = { ...process.env, PYTHONDONTWRITEBYTECODE: '1', PYTHONIOENCODING: 'utf-8' };

/** Python com numpy e psutil (o que o DualSense Auto precisa para rodar). */
function acharPython() {
  const nomes = [process.env.ARCADE_PYTHON, process.platform === 'win32' ? 'python' : 'python3', 'python'].filter(Boolean);
  for (const n of nomes) {
    const r = spawnSync(n, ['-c', 'import numpy, psutil'], { encoding: 'utf8' });
    if (r.status === 0) return n;
  }
  return null;
}

/** Processo falso, para testar o religar sem Python. */
function filhoFalso() {
  const f = new EventEmitter();
  f.kill = () => setImmediate(() => f.emit('exit', null));
  return f;
}

(async () => {
  const py = acharPython();

  /* ---------------- o programa Python ---------------- */
  if (!py) {
    pular('auto-teste do DualSense Auto', 'sem Python com numpy/psutil');
  } else {
    const dados = tmp('ds-autoteste');
    const r = spawnSync(py, ['-I', SCRIPT, '--teste'], { encoding: 'utf8', env: { ...ENV_PY, DUALSENSE_AUTO_DADOS: dados }, timeout: 180000 });
    await t('auto-teste do DualSense Auto (gatilhos, armas, terreno, mods DSX/CoD, Nexus, leitor de mods)', () => {
      assert.ok((r.stdout || '').includes('AUTO-TESTE OK'), (r.stdout || '').slice(-800) + (r.stderr || '').slice(-1500));
    });
    await t('o auto-teste não grava nada na pasta do programa', () => {
      const sobra = fs.readdirSync(path.join(ROOT, 'dualsense')).filter(f => /\.json$/.test(f) && f !== 'perfis.json' || /^(downloads|backup_mods|erro\.log|\.painel)/.test(f));
      assert.deepStrictEqual(sobra, []);
    });

    // chaves no config.json: cifradas no Windows; nunca legíveis em outro PC
    const dc = tmp('ds-chaves');
    const c = spawnSync(py, ['-I', '-c', [
      'import sys, json; sys.path.insert(0, sys.argv[1])',
      'import cerebro, caminhos',
      'cfg = cerebro.load_config(); cfg["api_key"] = "sk-teste-123"; cfg["nexus_key"] = "nx-456"; cerebro.save_config(cfg)',
      'print(json.dumps({"disco": open(cerebro.CONFIG_FILE, encoding="utf-8").read(), "lido": cerebro.load_config()["api_key"],',
      '  "outro_pc": caminhos.decifrar("dpapi:AAAA"), "memoria": cfg["api_key"]}))'
    ].join('\n'), path.join(ROOT, 'dualsense')], { encoding: 'utf8', env: { ...ENV_PY, DUALSENSE_AUTO_DADOS: dc, ANTHROPIC_API_KEY: '' } });
    await t('chaves da IA e do Nexus: gravadas cifradas (Windows) e lidas de volta', () => {
      assert.strictEqual(c.status, 0, c.stderr);
      const o = JSON.parse(c.stdout.trim().split('\n').pop());
      assert.strictEqual(o.lido, 'sk-teste-123');
      assert.strictEqual(o.memoria, 'sk-teste-123');
      assert.strictEqual(o.outro_pc, '');
      if (process.platform === 'win32') {
        assert.ok(!o.disco.includes('sk-teste-123') && !o.disco.includes('nx-456'), o.disco);
        assert.ok(o.disco.includes('dpapi:'));
      }
    });

    /* ---------------- modo embutido de verdade ---------------- */
    const dadosE = tmp('ds-embutido');
    process.env.PYTHONDONTWRITEBYTECODE = '1';
    const ds = new D.DualSenseAuto({ comando: { cmd: py, args: ['-I', SCRIPT] }, dados: dadosE, ignorar: ['Arcade Hub.exe'] });
    const estados = [];
    ds.on('estado', e => estados.push(e.estado));
    ds.iniciar();
    await t('abre em segundo plano e conta a porta do painel', async () => {
      assert.ok(await esperar(() => ds.estado === 'ligado' || ds.estado === 'erro'), 'estado: ' + ds.estado);
      assert.strictEqual(ds.estado, 'ligado', ds.msg);
      assert.ok(ds.url.startsWith(`http://127.0.0.1:${ds.porta}/?t=`));
    });
    await t('o painel responde com o token e recusa sem ele', async () => {
      const r1 = await ds.resumo();
      assert.ok(r1 && r1.controle === false, JSON.stringify(r1));
      assert.strictEqual(await D.pedir(ds.porta, 'errado', 'GET', '/api/estado'), null);
    });
    await t('os dados ficam na pasta do Arcade Hub, não na pasta do programa', () => {
      assert.ok(fs.existsSync(path.join(dadosE, '.painel.json')));
      assert.ok(!fs.existsSync(path.join(ROOT, 'dualsense', '.painel.json')));
    });
    await t('desliga com calma pelo próprio painel', async () => {
      const filho = ds.filho;
      await ds.parar();
      assert.strictEqual(ds.estado, 'desligado');
      assert.ok(filho.exitCode === 0, 'código ' + filho.exitCode);
    });

    // outro DualSense Auto avulso aberto: o do Arcade Hub não briga pelo controle
    const pastaAvulso = tmp('ds-avulso');
    const falso = path.join(pastaAvulso, 'dualsense_auto.py');
    fs.writeFileSync(falso, 'import time\ntime.sleep(60)\n');
    const avulso = spawn(py, [falso], { stdio: 'ignore' });
    await espera(400);
    ds.iniciar();
    await t('com outro DualSense Auto aberto, avisa em vez de abrir um segundo', async () => {
      assert.ok(await esperar(() => ds.estado === 'ja-aberto' || ds.estado === 'ligado'), ds.estado);
      assert.strictEqual(ds.estado, 'ja-aberto');
      assert.ok(await esperar(() => !ds.rodando, 5000));
    });
    avulso.kill();

    // o Arcade Hub sumiu (travou/foi encerrado): o programa fecha sozinho
    const pai = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 1500)'], { stdio: 'ignore' });
    const dadosP = tmp('ds-pai');
    const orfao = spawn(py, ['-I', SCRIPT, '--embutido', '--sessao', 'x', '--pai', String(pai.pid)], { stdio: 'ignore', env: { ...ENV_PY, DUALSENSE_AUTO_DADOS: dadosP } });
    let saiu = false;
    orfao.on('exit', () => { saiu = true; });
    await t('fecha sozinho quando o Arcade Hub fecha sem avisar', async () => {
      assert.ok(await esperar(() => saiu, 12000), 'continuou aberto');
    });
    if (!saiu) orfao.kill();
  }

  /* ---------------- religar, erros e o que vai para o programa ---------------- */
  const dadosF = tmp('ds-falso');
  const chamadas = [];
  let comportamento = 'cai';
  const ds2 = new D.DualSenseAuto({
    comando: { cmd: 'DualSenseAuto.exe', args: [] }, dados: dadosF, ignorar: ['Arcade Hub.exe'], esperaReligar: 30,
    spawn: (cmd, args, o) => {
      chamadas.push({ cmd, args, env: o.env });
      const f = filhoFalso();
      const sessao = args[args.indexOf('--sessao') + 1];
      setTimeout(() => {
        if (comportamento === 'cai') f.emit('exit', 1);
        else if (comportamento === 'ja-aberto') { fs.writeFileSync(path.join(dadosF, '.painel.json'), JSON.stringify({ sessao, erro: 'ja-aberto' })); f.emit('exit', 0); }
        else if (comportamento === 'ok') fs.writeFileSync(path.join(dadosF, '.painel.json'), JSON.stringify({ sessao, pronto: true, porta: 1 }));
      }, 20);
      return f;
    }
  });
  ds2.iniciar();
  await t('passa a pasta de dados, o token e o .exe do Arcade Hub (que não é jogo)', () => {
    const c = chamadas[0];
    assert.strictEqual(c.env.DUALSENSE_AUTO_DADOS, dadosF);
    assert.strictEqual(c.env.DSA_IGNORAR, 'Arcade Hub.exe');
    assert.ok(c.env.DSA_TOKEN && c.env.DSA_TOKEN.length >= 20);
    assert.ok(c.args.includes('--embutido') && c.args[c.args.indexOf('--pai') + 1] === String(process.pid));
  });
  await t('caiu: abre de novo sozinho, e desiste depois de várias quedas', async () => {
    assert.ok(await esperar(() => ds2.estado === 'erro', 5000), ds2.estado);
    assert.strictEqual(chamadas.length, 4);
    assert.ok(/várias vezes/.test(ds2.msg));
  });
  comportamento = 'ja-aberto';
  ds2.quedas = [];
  ds2.iniciar();
  await t('outro aberto fora do Arcade Hub vira aviso (sem ficar religando)', async () => {
    assert.ok(await esperar(() => ds2.estado === 'ja-aberto', 3000), ds2.estado);
    await espera(150);
    assert.strictEqual(ds2.estado, 'ja-aberto');
  });
  comportamento = 'ok';
  ds2.iniciar();
  await t('pronto: estado "ligado" com a porta que o programa contou', async () => {
    assert.ok(await esperar(() => ds2.estado === 'ligado', 3000), ds2.estado);
    assert.strictEqual(ds2.porta, 1);
  });
  await ds2.parar(200);
  await t('sem o programa na instalação: "ausente", sem tentar abrir', () => {
    const ds3 = new D.DualSenseAuto({ comando: null, dados: dadosF });
    ds3.iniciar();
    assert.strictEqual(ds3.estado, 'ausente');
  });

  /* ---------------- Ajustes › DualSense (IPC) ---------------- */
  const st = new lib.Store(tmp('ds-store'));
  const h = {};
  const fake = Object.assign(new EventEmitter(), {
    estado: 'desligado', msg: '', rodando: false, url: '', inicios: 0, paradas: 0,
    publico() { return { estado: this.estado, msg: this.msg }; },
    iniciar() { this.inicios++; this.estado = 'ligado'; },
    parar() { this.paradas++; this.estado = 'desligado'; return Promise.resolve(); },
    resumo: async () => null
  });
  const hub = lib.register({ handle: (k, f) => (h[k] = f) }, { shell: {}, dialog: {}, BrowserWindow: { getAllWindows: () => [] }, app: { getVersion: () => 'x', once: () => {} }, store: st, varrerAoAbrir: false, atrasoVigias: 1e9, atrasoConquistas: 1e9, atrasoDiscord: 1e9, atrasoDualSense: 0, dualsense: fake });
  await espera(30);
  await t('liga junto com o Arcade Hub por padrão', () => assert.strictEqual(fake.inicios, 1));
  await t('desligar em Ajustes para o programa e fica salvo', async () => {
    const r = await h['dualsense:salvar']({}, { ligado: false });
    assert.ok(r.ok && r.data.ligado === false);
    assert.strictEqual(fake.paradas, 1);
    assert.strictEqual(st.settings.dualsense.ligado, false);
  });
  await t('abrir o painel desligado explica o que fazer', async () => {
    const r = await h['dualsense:abrir']();
    assert.ok(!r.ok && /Ligue/.test(r.error));
  });
  await t('o estado vai para a interface', async () => {
    assert.strictEqual(hub.state().dualsense.estado, 'desligado');
    const r = await h['dualsense:estado']();
    assert.ok(r.ok && r.data.ligado === false);
  });

  fim();
})();
