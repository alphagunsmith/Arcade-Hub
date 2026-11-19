'use strict';
/**
 * ZIP mínimo (sem dependências) para o backup com capas.
 * Escreve: arquivos "store" (imagens já são comprimidas) ou "deflate" (JSON).
 * Lê: só o que este app gera e zips comuns — sem ZIP64, sem criptografia.
 */
const zlib = require('zlib');

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dosTime(d) {
  const t = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  const dt = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { t, dt };
}

/** @param {{name: string, data: Buffer, compress?: boolean}[]} entries */
function criarZip(entries) {
  const partes = [];
  const central = [];
  let offset = 0;
  const { t, dt } = dosTime(new Date());
  for (const e of entries) {
    const nome = Buffer.from(e.name, 'utf8');
    const crc = crc32(e.data);
    const comprimir = e.compress !== false && e.data.length > 64;
    const corpo = comprimir ? zlib.deflateRawSync(e.data, { level: 6 }) : e.data;
    const metodo = comprimir ? 8 : 0;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);              // nomes em UTF-8
    local.writeUInt16LE(metodo, 8);
    local.writeUInt16LE(t, 10);
    local.writeUInt16LE(dt, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(corpo.length, 18);
    local.writeUInt32LE(e.data.length, 22);
    local.writeUInt16LE(nome.length, 26);
    local.writeUInt16LE(0, 28);
    partes.push(local, nome, corpo);

    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0);
    c.writeUInt16LE(20, 4);
    c.writeUInt16LE(20, 6);
    c.writeUInt16LE(0x0800, 8);
    c.writeUInt16LE(metodo, 10);
    c.writeUInt16LE(t, 12);
    c.writeUInt16LE(dt, 14);
    c.writeUInt32LE(crc, 16);
    c.writeUInt32LE(corpo.length, 20);
    c.writeUInt32LE(e.data.length, 24);
    c.writeUInt16LE(nome.length, 28);
    c.writeUInt32LE(offset, 42);
    central.push(c, nome);
    offset += 30 + nome.length + corpo.length;
    if (offset > 0xfffffff0) throw new Error('backup grande demais (mais de 4 GB)');
  }
  const centralBuf = Buffer.concat(central);
  const fim = Buffer.alloc(22);
  fim.writeUInt32LE(0x06054b50, 0);
  fim.writeUInt16LE(entries.length, 8);
  fim.writeUInt16LE(entries.length, 10);
  fim.writeUInt32LE(centralBuf.length, 12);
  fim.writeUInt32LE(offset, 16);
  return Buffer.concat([...partes, centralBuf, fim]);
}

/**
 * Lê as entradas de um zip.
 * @returns {Map<string, () => Buffer>} nome -> função que descompacta (sob demanda)
 */
function lerZip(buf, limites) {
  const lim = { maxEntrada: 64 * 1024 * 1024, maxEntradas: 20000, ...(limites || {}) };
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('arquivo não é um .zip válido');
  const total = buf.readUInt16LE(eocd + 10);
  const cdTam = buf.readUInt32LE(eocd + 12);
  const cdOff = buf.readUInt32LE(eocd + 16);
  if (total > lim.maxEntradas) throw new Error('zip com arquivos demais');
  if (cdOff + cdTam > buf.length) throw new Error('zip corrompido');
  const out = new Map();
  let p = cdOff;
  for (let i = 0; i < total; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('zip corrompido');
    const flags = buf.readUInt16LE(p + 8);
    const metodo = buf.readUInt16LE(p + 10);
    const compTam = buf.readUInt32LE(p + 20);
    const tam = buf.readUInt32LE(p + 24);
    const nLen = buf.readUInt16LE(p + 28);
    const xLen = buf.readUInt16LE(p + 30);
    const cLen = buf.readUInt16LE(p + 32);
    const localOff = buf.readUInt32LE(p + 42);
    const nome = buf.toString(flags & 0x0800 ? 'utf8' : 'latin1', p + 46, p + 46 + nLen);
    p += 46 + nLen + xLen + cLen;
    if (flags & 1) throw new Error('zip protegido por senha não é suportado');
    if (nome.endsWith('/')) continue;
    out.set(nome, () => {
      if (tam > lim.maxEntrada) throw new Error(`arquivo grande demais no zip: ${nome}`);
      if (buf.readUInt32LE(localOff) !== 0x04034b50) throw new Error('zip corrompido');
      const ini = localOff + 30 + buf.readUInt16LE(localOff + 26) + buf.readUInt16LE(localOff + 28);
      const dados = buf.subarray(ini, ini + compTam);
      if (metodo === 0) return Buffer.from(dados);
      if (metodo === 8) return zlib.inflateRawSync(dados, { maxOutputLength: Math.max(tam, 1) });
      throw new Error(`método de compressão não suportado (${metodo})`);
    });
  }
  return out;
}

module.exports = { criarZip, lerZip, crc32 };
