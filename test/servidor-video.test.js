'use strict';
/** Servidor local de vídeos: só atende o próprio app e só arquivos das pastas de vídeo. */
const fs = require('fs'), path = require('path'), http = require('http'), assert = require('assert');
const { ROOT, tmp, t, fim } = require('./_base');
const videos = require(path.join(ROOT, 'src', 'videos.js'));

const pedir = (porta, caminho, host) => new Promise(res => {
  const r = http.request({ host: '127.0.0.1', port: porta, path: caminho, headers: host ? { Host: host } : {} }, x => { x.resume(); res(x.statusCode); });
  r.on('error', () => res(0)); r.end();
});

(async () => {
  const D = tmp('servidor-video');
  fs.mkdirSync(path.join(D, 'videos'));
  const mp4 = path.join(D, 'videos', 'jogo.mp4');
  fs.writeFileSync(mp4, Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypisom'), Buffer.alloc(30000, 1)]));
  const fora = path.join(D, 'segredo.txt'); fs.writeFileSync(fora, 'x');
  const srv = await videos.iniciarServidorVideos(D);
  const q = f => '/?f=' + encodeURIComponent(f);
  await t('serve um vídeo da pasta de vídeos', async () => assert.strictEqual(await pedir(srv.porta, q(mp4)), 200));
  await t('recusa arquivo fora das pastas de vídeo', async () => assert.strictEqual(await pedir(srv.porta, q(fora)), 404));
  await t('recusa "../" para sair da pasta', async () => assert.strictEqual(await pedir(srv.porta, q(path.join(D, 'videos', '..', 'segredo.txt'))), 404));
  await t('recusa pedido com outro Host (site tentando DNS rebinding)', async () => assert.strictEqual(await pedir(srv.porta, q(mp4), 'malicioso.example:' + srv.porta), 403));
  await t('recusa token de streaming inventado', async () => assert.strictEqual(await pedir(srv.porta, '/stream/' + 'a'.repeat(24)), 404));
  srv.server.close();
  fim();
})();
