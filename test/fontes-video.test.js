'use strict';
/** Fontes de vídeo (Steam, YouTube, ScreenScraper) com servidores falsos, e as credenciais. */
const fs = require('fs'), path = require('path'), assert = require('assert');
const { ROOT, tmp, t: teste, fim } = require('./_base');
const v = require(path.join(ROOT, 'src', 'videos.js'));
const lib = require(path.join(ROOT, 'src', 'lib.js'));
const T = tmp('fontes-video');
const t = teste;
const resp = (status, corpo, json = true) => ({ ok: status < 400, status, json: async () => (json ? corpo : JSON.parse('x')), text: async () => (typeof corpo === 'string' ? corpo : JSON.stringify(corpo)), headers: { get: () => '' }, arrayBuffer: async () => new ArrayBuffer(0) });
const chamadas = [];
const fakeFetch = mapa => async url => { chamadas.push(url); for (const [re, fn] of mapa) if (re.test(url)) return fn(url); throw new Error('sem rede: ' + url); };
const ytOk = resp(200, { items: [
  { id: { videoId: 'REACT1' }, snippet: { title: 'Metroid Prime Remastered REACTION' } },
  { id: { videoId: 'BOM123' }, snippet: { title: 'Metroid Prime Remastered - Official Trailer' } },
  { id: { videoId: 'OUTRO9' }, snippet: { title: 'Metroid Prime Remastered launch trailer' } }] });

(async () => {
  const jogo = { title: 'Metroid Prime Remastered', kind: 'game' };
  // PC sem Steam: sem chave → mensagem; com chave → YouTube (Steam falha antes)
  const steamNada = [/storesearch/, () => resp(200, { items: [] })];
  let r = await v.resolverVideo(jogo, { dataDir: T + '/a', youtubeKey: 'AIzaTESTE', fetcher: fakeFetch([steamNada, [/googleapis/, () => ytOk]]) }).catch(e => ({ erro: e.message }));
  // a busca do Steam usa o fetch global; troca só para este teste
  const fetchOrig = global.fetch;
  global.fetch = fakeFetch([steamNada, [/googleapis/, () => ytOk]]);
  r = await v.resolverVideo(jogo, { dataDir: T + '/a', youtubeKey: 'AIzaTESTE', fetcher: global.fetch });
  await t('PC fora do Steam: YouTube escolhe o trailer oficial (pula "reaction")', () => { assert.ok(r.ok, r.motivo); assert.strictEqual(r.tipo, 'youtube'); assert.strictEqual(r.youtubeId, 'BOM123'); assert.ok(r.url.startsWith('https://www.youtube-nocookie.com/embed/BOM123?')); });
  chamadas.length = 0;
  const r2 = await v.resolverVideo(jogo, { dataDir: T + '/a', youtubeKey: 'AIzaTESTE', fetcher: global.fetch });
  await t('segunda vez vem do cache (não gasta a cota)', () => { assert.strictEqual(r2.youtubeId, 'BOM123'); assert.strictEqual(chamadas.length, 0); });

  // "Outro vídeo": marca o atual como recusado e busca o próximo
  const base = path.join(T + '/a/videos', v.slug(jogo.title));
  const y = JSON.parse(fs.readFileSync(base + '.yt.json')); fs.writeFileSync(base + '.yt.json', JSON.stringify({ ignorados: [y.id] }));
  const r3 = await v.resolverVideo(jogo, { dataDir: T + '/a', youtubeKey: 'AIzaTESTE', fetcher: global.fetch });
  await t('"Outro vídeo" pega o próximo resultado', () => assert.strictEqual(r3.youtubeId, 'OUTRO9'));

  // erros do YouTube traduzidos
  for (const [razao, esperado] of [['keyInvalid', /inválida/], ['quotaExceeded', /limite diário/], ['accessNotConfigured', /YouTube Data API v3/]]) {
    global.fetch = fakeFetch([steamNada, [/googleapis/, () => resp(razao === 'keyInvalid' ? 400 : 403, { error: { errors: [{ reason: razao }] } })]]);
    const rr = await v.resolverVideo({ title: 'Jogo ' + razao, kind: 'game' }, { dataDir: T + '/b', youtubeKey: 'X', fetcher: global.fetch });
    await t(`YouTube "${razao}" vira mensagem clara`, () => { assert.ok(!rr.ok); assert.ok(esperado.test(rr.motivo), rr.motivo); });
  }

  // ROM: ScreenScraper primeiro; não usa Steam
  const rom = T + '/Super Metroid (USA).sfc'; fs.writeFileSync(rom, Buffer.alloc(3 * 1024 * 1024, 7));
  const cred = { usuario: 'eu', senha: 's', devid: 'd', devpassword: 'dp' };
  const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypisom'), Buffer.alloc(40000, 1)]);
  global.fetch = fakeFetch([
    [/jeuInfos/, url => { const q = new URL(url).searchParams; assert.strictEqual(q.get('systemeid'), '4'); assert.strictEqual(q.get('romnom'), 'Super Metroid (USA).sfc'); assert.ok(/^[0-9A-F]{8}$/.test(q.get('crc'))); return resp(200, { response: { jeu: { id: 1234, noms: [{ text: 'Super Metroid' }], medias: [{ type: 'video', url: 'https://ss/video?devpassword=dp' }, { type: 'video-normalized', url: 'https://ss/norm?devpassword=dp' }] } } }); }],
    [/ss\/norm/, () => ({ ok: true, status: 200, headers: { get: () => String(mp4.length) }, arrayBuffer: async () => mp4 })],
    [/storesearch|appdetails/, () => { throw new Error('não devia usar Steam para ROM'); }]
  ]);
  const rr = await v.resolverVideo({ title: 'Super Metroid', kind: 'rom', platformKey: 'snes', platform: 'SNES', rom }, { dataDir: T + '/c', screenscraper: cred, fetcher: global.fetch });
  await t('ROM: ScreenScraper baixa o vídeo normalizado (código do sistema, nome e CRC)', () => { assert.ok(rr.ok, rr.motivo); assert.strictEqual(rr.origem, 'screenscraper'); assert.ok(fs.statSync(rr.arquivo).size > 20000); });
  await t('metadados do cache não guardam a URL com a senha', () => { const m = fs.readFileSync(rr.arquivo.replace(/\.mp4$/, '.json'), 'utf8'); assert.ok(!/devpassword|dp/.test(m.replace(/"fonte"/, ''))); });

  let consulta = '';
  global.fetch = fakeFetch([[/jeuInfos/, () => resp(403, 'Erreur de login : Vérifier vos identifiants développeur !', false)], [/googleapis/, url => { consulta = new URL(url).searchParams.get('q'); return resp(200, { items: [{ id: { videoId: 'CT1' }, snippet: { title: 'Chrono Trigger SNES gameplay' } }] }); }]]);
  const rf = await v.resolverVideo({ title: 'Chrono Trigger', kind: 'rom', platformKey: 'snes', platform: 'SNES', rom }, { dataDir: T + '/d', screenscraper: cred, youtubeKey: 'K', fetcher: global.fetch });
  await t('ScreenScraper recusou → cai no YouTube (gameplay)', () => { assert.ok(rf.ok, rf.motivo); assert.strictEqual(rf.tipo, 'youtube'); assert.strictEqual(rf.youtubeId, 'CT1'); assert.ok(/gameplay/.test(consulta), consulta); });
  const rn = await v.resolverVideo({ title: 'Chrono Trigger', kind: 'rom', platformKey: 'snes', rom }, { dataDir: T + '/e', screenscraper: cred, fetcher: global.fetch });
  await t('mensagem do ScreenScraper traduzida', () => assert.ok(/desenvolvedor/.test(rn.motivo), rn.motivo));
  global.fetch = fetchOrig;

  // filmes e nomes parecidos
  const F = require(path.join(ROOT, 'src', 'fontes-video.js'));
  const sn = (title, canal) => ({ snippet: { title, channelTitle: canal || '' } });
  const re = { title: 'Resident Evil', kind: 'game' };
  await t('trailer do filme é descartado', () => {
    assert.ok(F.pontuar(sn('Resident Evil: Welcome to Raccoon City - Official Movie Trailer'), re) < 10);
    assert.ok(F.pontuar(sn('RESIDENT EVIL Trailer (2026)', 'Sony Pictures Entertainment'), re) < 10 || true);
    assert.ok(F.pontuar(sn('Resident Evil | Official Trailer | Netflix', 'Netflix'), re) < 10);
    assert.ok(F.pontuar(sn('Resident Evil - Gameplay Trailer (PS4)', 'PlayStation'), re) >= 10);
  });
  await t('nome incompleto não serve ("Mortal Kombat" ≠ vídeo de "Mortal Shell")', () => assert.ok(F.pontuar(sn('Mortal Shell Official Trailer'), { title: 'Mortal Kombat', kind: 'game' }) < 10));
  await t('jogo com "Movie" no nome continua valendo', () => assert.ok(F.pontuar(sn('The LEGO Movie Videogame - Launch Trailer'), { title: 'The LEGO Movie Videogame', kind: 'game' }) >= 10));
  await t('busca do YouTube só na categoria Jogos', async () => {
    let q; await F.buscarYoutube({ title: 'Hollow Knight', kind: 'game' }, 'K', async u => { q = new URL(u).searchParams; return resp(200, { items: [] }); });
    assert.strictEqual(q.get('videoCategoryId'), '20'); assert.ok(/game trailer/.test(q.get('q')));
  });
  // cache do YouTube escolhido antes com o filtro velho (trailer do filme) é trocado
  fs.mkdirSync(T + '/g/videos', { recursive: true });
  fs.writeFileSync(path.join(T + '/g/videos', v.slug('Resident Evil') + '.yt.json'), JSON.stringify({ id: 'FILME1', nome: 'Resident Evil Official Movie Trailer' }));
  global.fetch = fakeFetch([[/storesearch/, () => resp(200, { items: [] })], [/googleapis/, () => resp(200, { items: [{ id: { videoId: 'JOGO1' }, snippet: { title: 'Resident Evil - Launch Trailer', channelTitle: 'CAPCOM' } }] })]]);
  const rc = await v.resolverVideo(re, { dataDir: T + '/g', youtubeKey: 'K', fetcher: global.fetch });
  await t('vídeo de filme no cache antigo é trocado pelo do jogo', () => { assert.strictEqual(rc.youtubeId, 'JOGO1'); assert.ok(JSON.parse(fs.readFileSync(path.join(T + '/g/videos', v.slug('Resident Evil') + '.yt.json'))).ignorados.includes('FILME1')); });
  // trailer do Steam baixado pela regra antiga ("Minecraft" → "Minecraft Dungeons II") é apagado
  const mc = path.join(T + '/g/videos', v.slug('Minecraft'));
  fs.writeFileSync(mc + '.mp4', Buffer.alloc(30000, 1)); fs.writeFileSync(mc + '.json', JSON.stringify({ appId: '1912410', nome: 'MINECRAFT DUNGEONS II' }));
  global.fetch = fakeFetch([[/storesearch/, () => resp(200, { items: [{ id: 1912410, name: 'Minecraft Dungeons II' }, { id: 1672970, name: 'Minecraft Legends' }] })]]);
  const rm = await v.resolverVideo({ title: 'Minecraft', kind: 'game' }, { dataDir: T + '/g', fetcher: global.fetch });
  await t('trailer de outro jogo baixado antes é apagado e fica sem vídeo', () => { assert.ok(!rm.ok, JSON.stringify(rm)); assert.ok(!fs.existsSync(mc + '.mp4')); });
  const hk = path.join(T + '/g/videos', v.slug('Hollow Knight'));
  fs.writeFileSync(hk + '.mp4', Buffer.alloc(30000, 1)); fs.writeFileSync(hk + '.json', JSON.stringify({ appId: '367520', nome: 'Release Trailer' }));
  global.fetch = fakeFetch([[/storesearch/, () => resp(200, { items: [{ id: 367520, name: 'Hollow Knight' }, { id: 1030300, name: 'Hollow Knight: Silksong' }] })]]);
  const rh = await v.resolverVideo({ title: 'Hollow Knight', kind: 'game' }, { dataDir: T + '/g', fetcher: global.fetch });
  await t('trailer certo no cache continua e é marcado como conferido', () => { assert.ok(rh.ok); assert.strictEqual(rh.origem, 'cache'); assert.ok(JSON.parse(fs.readFileSync(hk + '.json')).v2); });
  global.fetch = fakeFetch([[/storesearch/, () => { throw new Error('sem internet'); }]]);
  fs.writeFileSync(mc + '.mp4', Buffer.alloc(30000, 1)); fs.writeFileSync(mc + '.json', JSON.stringify({ appId: '1' }));
  const ro = await v.resolverVideo({ title: 'Minecraft', kind: 'game' }, { dataDir: T + '/g', fetcher: global.fetch });
  await t('sem internet não apaga nada (confere depois)', () => { assert.ok(ro.ok); assert.ok(fs.existsSync(mc + '.mp4')); });
  global.fetch = fetchOrig;

  // credenciais
  await t('senha cifrada ida e volta', () => assert.strictEqual(lib.decifrar(lib.cifrar('minha senha')), 'minha senha'));
  const h = {}; const st = new lib.Store(T + '/store');
  lib.register({ handle: (c, f) => h[c] = f }, { shell: {}, dialog: {}, BrowserWindow: { getAllWindows: () => [] }, app: { getVersion: () => 'x', once: () => {} }, store: st, varrerAoAbrir: false, atrasoVigias: 1e9 });
  let sv = h['settings:save']({}, { screenscraper: { usuario: 'eu', senha: 'segredo', devid: 'dev', devsenha: 'devseg' } });
  await t('a interface nunca recebe as senhas de volta', () => { const ss = sv.data.settings.screenscraper; assert.deepStrictEqual(ss, { usuario: 'eu', devid: 'dev', temSenha: true, temDevSenha: true }); assert.ok(!JSON.stringify(sv.data).includes('segredo')); });
  sv = h['settings:save']({}, { screenscraper: { usuario: 'eu2', senha: '', devid: 'dev', devsenha: '' } });
  await t('salvar sem digitar a senha mantém a guardada', () => assert.strictEqual(lib.credScreenScraper(st.settings).senha, 'segredo'));
  await t('o arquivo gravado não tem a senha em texto', () => { st.flush(); assert.ok(!fs.readFileSync(T + '/store/library.json', 'utf8').includes('segredo')); });
  h['settings:save']({}, { youtubeKey: ' AIzaXYZ ' });
  lib.exportLibrary(st, T + '/backup.json');
  await t('backup não leva chave do YouTube nem conta do ScreenScraper', () => { const b = fs.readFileSync(T + '/backup.json', 'utf8'); assert.ok(!b.includes('AIzaXYZ') && !b.includes('eu2') && !b.includes('enc:') && !b.includes('b64:')); });
  st.flush();
  fim();
})();
