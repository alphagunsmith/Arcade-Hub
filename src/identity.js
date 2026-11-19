'use strict';
/**
 * Arcade Hub — identificação de jogo pelo conteúdo do .exe
 *
 * O nome do arquivo mente muito: "game.exe", "Launcher.exe", "bin64\start.exe".
 * Quem sabe o nome real do jogo é o bloco de versão (VERSIONINFO) que a maioria
 * dos executáveis de jogos carrega:
 *
 *   ProductName     "Hollow Knight"        ← o que queremos
 *   FileDescription "Hollow Knight"        ← idem (às vezes mais completo)
 *   CompanyName     "Team Cherry"          ← estúdio (útil como desempate)
 *   LegalCopyright  "© Team Cherry"        ← ano/estúdio
 *   OriginalFilename "hollow_knight.exe"
 *
 * Lemos isso direto do binário (PE → resource table → RT_VERSION), sem depender
 * de nada externo e sem abrir o jogo. Quando o .exe não tem versão (jogo antigo,
 * emulador, Unity "cru"), a identificação cai para sinais de pasta e arquivos.
 *
 * Tudo aqui é tolerante a falha: qualquer erro retorna null e a varredura segue.
 */

const fs = require('fs');
const path = require('path');

/* ------------------------------------------------------------------ */
/* Leitura do PE                                                        */
/* ------------------------------------------------------------------ */

const RT_VERSION = 16;

/** Alinha em 4 bytes. (Laço `while (p % 4) p += 2` travava com offset ímpar.) */
const alinhar4 = n => (n + 3) & ~3;

/**
 * Lê uma string UTF-16LE terminada em NUL.
 * `next` aponta para logo depois do terminador (o que já está alinhado em
 * múltiplos de 4 nos blocos de versão); `str` NÃO inclui o terminador.
 */
function readWStr(buf, off) {
  let end = off;
  while (end + 1 < buf.length && !(buf[end] === 0 && buf[end + 1] === 0)) end += 2;
  return { str: buf.toString('utf16le', off, end), next: end + 2 };
}

/** Percorre a árvore de recursos da seção .rsrc e devolve o offset do RT_VERSION. */
function findVersionData(buf, rsrcOff, rsrcSize) {
  function entries(dirRel, depth) {
    if (depth > 3) return [];
    const dirOff = rsrcOff + dirRel;
    if (dirOff + 16 > buf.length) return [];
    const named = buf.readUInt16LE(dirOff + 12);
    const ids = buf.readUInt16LE(dirOff + 14);
    const total = named + ids;
    const out = [];
    for (let i = 0; i < total; i++) {
      const e = dirOff + 16 + i * 8;
      if (e + 8 > buf.length) break;
      const nameId = buf.readUInt16LE(e);
      const target = buf.readUInt32LE(e + 4);
      const isDir = (target & 0x80000000) !== 0;
      const rel = target & 0x7fffffff;
      out.push({ nameId, isDir, rel, depth });
    }
    return out;
  }

  // nível 1: tipos (queremos nameId === 16)
  for (const t of entries(0, 0)) {
    if (t.nameId !== RT_VERSION || !t.isDir) continue;
    // nível 2: nomes; nível 3: idiomas → folha com offset de dados
    const walkLevel = (entry, level) => {
      if (level === 2) return entry.isDir ? entries(entry.rel, 2).flatMap(e => walkLevel(e, 3)) : [];
      if (level === 3) {
        for (const leaf of entries(entry.rel, 3)) {
          // folha: IMAGE_RESOURCE_DATA_ENTRY (RVA do dado)
          const off = rsrcOff + leaf.rel;
          if (off + 16 > buf.length) continue;
          return [{ dataRva: buf.readUInt32LE(off), size: buf.readUInt32LE(off + 4) }];
        }
        return [];
      }
      return [];
    };
    const found = walkLevel(t, 2);
    if (found.length) return found[0];
  }
  return null;
}

/** Lê a seção .rsrc do PE (offset no arquivo + tamanho). */
function rsrcSection(buf) {
  if (buf.length < 0x40 || buf[0] !== 0x4d || buf[1] !== 0x5a) return null;   // "MZ"
  const peOff = buf.readUInt32LE(0x3c);
  if (buf.toString('ascii', peOff, peOff + 4) !== 'PE\u0000\u0000') return null;
  const coff = peOff + 4;
  const numSections = buf.readUInt16LE(coff + 2);
  const optSize = buf.readUInt16LE(coff + 16);
  const optOff = coff + 20;
  const magic = buf.readUInt16LE(optOff);
  const ddOff = optOff + (magic === 0x20b ? 112 : 96);       // PE32+ vs PE32
  const numDirs = buf.readUInt32LE(ddOff - 4);
  if (numDirs < 3) return null;
  const resRva = buf.readUInt32LE(ddOff + 2 * 8);
  const resSize = buf.readUInt32LE(ddOff + 2 * 8 + 4);
  if (!resRva) return null;

  // tabela de seções → RVA para offset no arquivo
  const secOff = optOff + optSize;
  for (let i = 0; i < numSections; i++) {
    const s = secOff + i * 40;
    if (s + 40 > buf.length) break;
    const vSize = buf.readUInt32LE(s + 8);
    const vAddr = buf.readUInt32LE(s + 12);
    const rawSize = buf.readUInt32LE(s + 16);
    const rawPtr = buf.readUInt32LE(s + 20);
    if (resRva >= vAddr && resRva < vAddr + Math.max(vSize, rawSize)) {
      return { off: rawPtr + (resRva - vAddr), size: resSize || rawSize };
    }
  }
  return null;
}

/** Converte RVA → offset de arquivo percorrendo as seções. */
function rvaToOffset(buf, rva, secBase) {
  const peOff = buf.readUInt32LE(0x3c);
  const coff = peOff + 4;
  const numSections = buf.readUInt16LE(coff + 2);
  const optSize = buf.readUInt16LE(coff + 16);
  const secOff = coff + 20 + optSize;
  for (let i = 0; i < numSections; i++) {
    const s = secOff + i * 40;
    if (s + 40 > buf.length) break;
    const vSize = buf.readUInt32LE(s + 8);
    const vAddr = buf.readUInt32LE(s + 12);
    const rawPtr = buf.readUInt32LE(s + 20);
    if (rva >= vAddr && rva < vAddr + Math.max(vSize, 0x1000)) {
      return rawPtr + (rva - vAddr);
    }
  }
  return rva - secBase;                                           // fallback
}

/**
 * Extrai os campos do bloco VS_VERSIONINFO.
 * Formatos: chave + padding até 4 bytes, WORD wType, WCHAR szKey[], padding, valor.
 */
function parseVersionBlock(buf, off, end) {
  const out = {};
  // `o` é onde COMEÇA o nó (wLength), então a chave está em o+6.
  // readWStr já consome o NUL final; o valor começa no próximo limite de 4 bytes.
  // (O bug anterior somava +2 aqui e deslocava tudo em 2 bytes.)
  const readKey = o => {
    const { str, next } = readWStr(buf, o + 6);
    return { key: str, valOff: alinhar4(next) };
  };
  // raiz: wLength, wValueLength, wType, szKey "VS_VERSION_INFO"
  let p = off;
  const root = readKey(p);
  p = alinhar4(root.valOff + rootKeyValueLen(buf, off));

  // percorre as crianças do nó raiz
  while (p + 6 <= end) {
    const len = buf.readUInt16LE(p);
    const valLen = buf.readUInt16LE(p + 2);
    if (!len) break;
    const nodeEnd = Math.min(p + len, end);
    if (nodeEnd <= p) break;                       // proteção: sem progresso, para
    const child = readKey(p);
    let q = alinhar4(child.valOff + valLen * (buf.readUInt16LE(p + 4) === 1 ? 2 : 1));
    if (child.key === 'StringFileInfo') {
      // dentro: uma ou mais tabelas de idioma ("040904B0")
      while (q + 6 <= nodeEnd) {
        const tLen = buf.readUInt16LE(q);
        if (!tLen) break;
        const tEnd = Math.min(q + tLen, nodeEnd);
        if (tEnd <= q) break;
        const table = readKey(q);
        let r = table.valOff;   // tabelas de idioma não têm valor, só filhos
        while (r + 6 <= tEnd) {
          const sLen = buf.readUInt16LE(r);
          if (!sLen) break;
          const sEnd = Math.min(r + sLen, tEnd);
          if (sEnd <= r) break;
          const item = readKey(r);
          const isWide = buf.readUInt16LE(r + 4) === 1;
          // wValueLength = nº de caracteres (wide) ou bytes; usar isso evita
          // perder o último caractere ao cortar terminadores.
          const want = buf.readUInt16LE(r + 2);
          let e = item.valOff + (isWide ? want * 2 : want);
          if (e > sEnd || e <= item.valOff) e = sEnd;
          out[item.key] = isWide
            ? buf.toString('utf16le', item.valOff, e).replace(/\u0000+$/, '')
            : buf.toString('latin1', item.valOff, e).replace(/\u0000+$/, '');
          r = alinhar4(sEnd);
        }
        q = alinhar4(tEnd);
      }
    }
    p = alinhar4(nodeEnd);
  }
  return out;
}

function rootKeyValueLen(buf, off) {
  // wValueLength do nó raiz é o tamanho da VS_FIXEDFILEINFO (52 bytes)
  return buf.readUInt16LE(off + 2) || 52;
}

/**
 * Lê só o necessário do .exe: os cabeçalhos e a seção .rsrc.
 *
 * Antes lia os primeiros 3 MB e torcia para o bloco de versão estar ali. Em
 * executáveis grandes (Unreal, jogos AAA de 100+ MB) a .rsrc fica no FIM do
 * arquivo, então o nome nunca era achado. Agora a seção é lida de onde estiver
 * e colada logo depois dos cabeçalhos (ajustando o ponteiro da seção), o que
 * deixa o resto do parser igual.
 */
function lerCabecalhoERecursos(file) {
  let fd = null;
  try {
    const st = fs.statSync(file);
    if (!st.isFile() || st.size < 512) return null;
    fd = fs.openSync(file, 'r');
    const ler = (pos, len) => {
      const b = Buffer.alloc(len);
      const n = fs.readSync(fd, b, 0, len, pos);
      return n < len ? b.subarray(0, n) : b;
    };
    if (st.size <= 3 * 1024 * 1024) return ler(0, st.size);   // pequeno: lê tudo

    const head = ler(0, 64 * 1024);
    if (head[0] !== 0x4d || head[1] !== 0x5a) return null;
    const peOff = head.readUInt32LE(0x3c);
    if (peOff + 24 > head.length || head.toString('ascii', peOff, peOff + 4) !== 'PE\u0000\u0000') return null;
    const coff = peOff + 4;
    const numSections = head.readUInt16LE(coff + 2);
    const optSize = head.readUInt16LE(coff + 16);
    const optOff = coff + 20;
    const magic = head.readUInt16LE(optOff);
    const ddOff = optOff + (magic === 0x20b ? 112 : 96);
    if (ddOff + 24 > head.length) return null;
    const resRva = head.readUInt32LE(ddOff + 16);
    if (!resRva) return null;
    const secOff = optOff + optSize;
    for (let i = 0; i < numSections; i++) {
      const sh = secOff + i * 40;
      if (sh + 40 > head.length) break;
      const vSize = head.readUInt32LE(sh + 8);
      const vAddr = head.readUInt32LE(sh + 12);
      const rawSize = head.readUInt32LE(sh + 16);
      const rawPtr = head.readUInt32LE(sh + 20);
      if (resRva < vAddr || resRva >= vAddr + Math.max(vSize, rawSize)) continue;
      if (rawPtr + rawSize <= head.length) return head;           // já está no começo
      const rsrc = ler(rawPtr, Math.min(rawSize, 32 * 1024 * 1024));
      const junto = Buffer.concat([head, rsrc]);
      junto.writeUInt32LE(head.length, sh + 20);                  // a seção agora começa aqui
      return junto;
    }
    return null;
  } catch {
    return null;
  } finally {
    if (fd !== null) { try { fs.closeSync(fd); } catch { /* noop */ } }
  }
}

/**
 * Identifica o jogo pelo bloco de versão do executável.
 * @returns {{productName,fileDescription,companyName,originalFilename,fileVersion,copyright}|null}
 */
function exeInfo(file) {
  const buf = lerCabecalhoERecursos(file);
  if (!buf) return null;

  try {
    const rsrc = rsrcSection(buf);
    if (!rsrc) return null;
    const entry = findVersionData(buf, rsrc.off, rsrc.size);
    if (!entry) return null;
    const dataOff = rvaToOffset(buf, entry.dataRva, rsrc.off);
    if (dataOff < 0 || dataOff >= buf.length) return null;
    const end = Math.min(dataOff + Math.min(entry.size, 4096), buf.length);
    const v = parseVersionBlock(buf, dataOff, end);
    if (!v || !Object.keys(v).length) return null;
    return {
      productName: v.ProductName || '',
      fileDescription: v.FileDescription || '',
      companyName: v.CompanyName || '',
      originalFilename: v.OriginalFilename || '',
      fileVersion: v.FileVersion || '',
      copyright: v.LegalCopyright || ''
    };
  } catch { return null; }
}

/* ------------------------------------------------------------------ */
/* Decisão: qual é o jogo                                             */
/* ------------------------------------------------------------------ */

// executáveis que NUNCA são o jogo
const NAO_E_JOGO = new RegExp([
  '^unins', '^setup', '^install', '^vc_?redist', '^dxsetup', '^dxwebsetup', '^dotnet',
  '^crash', '^unitycrashhandler', '^ue4prereq', '^ue5prereq', '^python', '^node',
  '^ffmpeg', '^eula', '^readme', '^updater', '^update', '^patcher', '^config', '^settings',
  '^launcher$', '^launch$', '^start$', '^play$', '^autorun', '^register', '^activate',
  '^redist', '^prereq', '^benchmark', '^editor$', '^server$', '^dedicated', '^report',
  '^bugreport', '^diagnostic', '^uninstall'
].join('|'), 'i');

// pastas que indicam "não é a raiz do jogo"
const PASTA_AUXILIAR = /^(bin|bin32|bin64|win32|win64|x86|x64|_?retail|_?shipping|engine|support|redist|_commonredist|directx|dotnet|vcredist|tools|docs?|manual|extras|sound|music|data|assets|content|plugins?|mods?|saves?|config|cache|logs?|crash|temp|installer?)$/i;

// nomes genéricos que não identificam nada
const NOME_GENERICO = /^(game|main|app|application|client|start|play|run|launch|launcher|startgame|gameclient|project|program|executable|default|bin|build|test|sample|new ?project|unity|unreal|godot|index)$/i;

/** Tira ruído do nome vindo do arquivo. */
function limparNome(nome) {
  return String(nome || '')
    .replace(/\.exe$/i, '')
    .replace(/\s*[\[(].*?[\])]\s*/g, ' ')                     // [GOG], (2016), (x64)
    .replace(/(?:^|[^a-z])\s*(?:v|ver|version)\.?\s*\d+(?:\.\d+)+/gi, ' ')   // v1.5.78
    .replace(/(?:^|[^a-z0-9])\d+(?:\.\d+){1,}/g, ' ')             // 1.5.78 solto
    .replace(/(?:^|[^a-z0-9])(win(?:32|64)|x86|x64|dx1[01]|vulkan|steam|gog|epic|portable|release|retail|final|shipping|debug|gold|goty)(?![a-z0-9])/gi, ' ')
    .replace(/[_]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[-–—\s]+|[-–—\s]+$/g, '')
    .trim();
}

/** O nome tem cara de nome de jogo? (não é "Game", "Launcher", "start") */
function pareceNomeDeJogo(nome) {
  const n = limparNome(nome);
  if (!n || n.length < 3) return false;
  if (NOME_GENERICO.test(n)) return false;
  if (/^[\d.\-_\s]+$/.test(n)) return false;
  // "Visual C++ Redistributable", "DirectX", "GOG Galaxy" não são jogos
  if (/\b(redistributable|redist|directx|galaxy|steamworks|launcher|runtime|framework|driver|update|service|helper|agent|webview|runtime|sdk)\b/i.test(n)) return false;
  return true;
}

/**
 * Escolhe o melhor nome de jogo entre várias pistas, com pontuação.
 * @param {{exe:string, productName?:string, fileDescription?:string,
 *          companyName?:string, originalFilename?:string,
 *          pastaPrincipal?:string, exeSize?:number, ehPrincipal?:boolean}} pistas
 */
function decidirNome(pistas) {
  const p = pistas || {};
  const candidatos = [];

  const push = (valor, origem, peso) => {
    const nome = limparNome(valor);
    if (!pareceNomeDeJogo(nome)) return;
    candidatos.push({ nome, origem, peso: peso + Math.min(nome.length, 40) / 100 });
  };

  // 1. ProductName é o campo feito para isto
  push(p.productName, 'productName', 100);
  // 2. FileDescription costuma repetir o título (às vezes com subtítulo)
  push(p.fileDescription, 'fileDescription', 90);
  // 3. pasta do jogo (evita "Binaries/Win64")
  if (p.pastaPrincipal && !PASTA_AUXILIAR.test(path.basename(p.pastaPrincipal))) {
    push(path.basename(p.pastaPrincipal), 'pasta', 70);
  }
  // 4. nome do arquivo, se não for genérico
  if (p.exe) push(path.basename(p.exe).replace(/\.exe$/i, ''), 'arquivo', 50);
  // 5. OriginalFilename é o menos confiável (nomes internos de build)
  if (p.originalFilename && !NOME_GENERICO.test(limparNome(p.originalFilename))) {
    push(p.originalFilename, 'originalFilename', 30);
  }

  if (!candidatos.length) return null;
  candidatos.sort((a, b) => b.peso - a.peso);

  // bônus: o executável principal (maior / na raiz) confirma o palpite
  const melhor = candidatos[0];
  const confirmado = p.ehPrincipal !== false;
  return {
    nome: melhor.nome,
    origem: melhor.origem,
    confianca: confirmado ? 'alta' : 'media',
    empresa: limparNome(p.companyName) || '',
    alternativas: candidatos.slice(1, 4).map(c => c.nome)
  };
}

/**
 * Analisa todos os .exe de uma pasta de jogo e devolve a identidade do jogo.
 * Esta é a função que a varredura usa.
 */
function identificarPasta(dirJogo, exes, opts) {
  const lista = (exes || []).slice().sort((a, b) => {
    const sa = tamanho(a), sb = tamanho(b);
    return sb - sa;                                  // maior primeiro: quase sempre é o jogo
  });
  if (!lista.length) return null;

  const avaliados = lista.slice(0, 8).map(exe => {
    const info = exeInfo(exe) || {};
    const pastaPai = path.dirname(exe);
    const pistas = {
      exe,
      productName: info.productName,
      fileDescription: info.fileDescription,
      companyName: info.companyName,
      originalFilename: info.originalFilename,
      pastaPrincipal: dirJogo || pastaPai,
      exeSize: tamanho(exe),
      ehPrincipal: true
    };
    const escolha = decidirNome(pistas);
    if (!escolha) return null;
    // penaliza quem está em pasta auxiliar (bin64, engine…)
    const auxiliar = PASTA_AUXILIAR.test(path.basename(pastaPai));
    const pesoArquivo = Math.min(tamanho(exe) / 50e6, 3);        // até 3 pontos por tamanho
    return {
      exe,
      ...escolha,
      score: escolha.peso + (auxiliar ? -25 : 0) + pesoArquivo +
             (escolha.confianca === 'alta' ? 5 : 0),
      info
    };
  }).filter(Boolean);

  if (!avaliados.length) return null;
  avaliados.sort((a, b) => b.score - a.score);
  const vencedor = avaliados[0];

  return {
    title: vencedor.nome,
    exe: vencedor.exe,
    origem: vencedor.origem,
    confianca: vencedor.confianca,
    empresa: vencedor.empresa,
    versao: vencedor.info.fileVersion || '',
    chaves: chaveDeBusca(vencedor.nome, vencedor.empresa),
    diagnosticos: avaliados.slice(0, 4).map(a => ({
      exe: path.basename(a.exe), nome: a.nome, origem: a.origem, score: Math.round(a.score)
    }))
  };
}

/**
 * Chave de busca limpa para consultar Steam/Metacritic/SteamGridDB.
 * "Hollow Knight" → ["hollow knight"]; "Hollow Knight - Voidheart Edition"
 * → ["hollow knight", "hollow knight voidheart edition"]
 */
function chaveDeBusca(nome, empresa) {
  const base = limparNome(nome);
  if (!base) return [];
  const chaves = [];
  const semSubtitulo = base.split(/\s*[:–—]\s*|\s+-\s+/)[0].trim();   // antes dos dois-pontos
  // o título base vem PRIMEIRO: é o que mais acerta nas lojas
  if (semSubtitulo && semSubtitulo.length >= 4) chaves.push(semSubtitulo);
  if (base !== semSubtitulo) chaves.push(base);
  if (empresa && !/^(unknown|desconhecid)/i.test(empresa)) {
    chaves.push(`${semSubtitulo || base} ${limparNome(empresa)}`.trim());
  }
  return [...new Set(chaves)].slice(0, 3);
}

/* ------------------------------------------------------------------ */
/* Assinatura por arquivos (quando não há .exe com versão)             */
/* ------------------------------------------------------------------ */

/** Arquivos que revelam o motor/nome do jogo mesmo sem version info. */
function identidadePorArquivos(dirJogo) {
  const chaves = {
    unreal: /-Win(32|64)-(Shipping|Debug)\.exe$/i,
    unity: /UnityPlayer\.dll$/i,
    godot: /\.pck$/i,
    rpgmaker: /nw\.dll|Game\.ini$/i,
    gamemaker: /data\.win$/i,
    source: /hl2\.exe|bin[\\/]engine\.dll$/i,
    skyrim: /TESV\.exe|SkyrimSE\.exe/i,
    gtav: /GTA5\.exe/i
  };
  const achados = [];
  let nomes;
  try { nomes = fs.readdirSync(dirJogo); } catch { return achados; }
  for (const n of nomes) {
    for (const [k, re] of Object.entries(chaves)) if (re.test(n)) achados.push(k);
    // pasta "data/<jogo>/..." do Unreal revela o nome do projeto
    if (/^(data|content)$/i.test(n)) {
      try {
        const dentro = fs.readdirSync(path.join(dirJogo, n)).slice(0, 6);
        achados.push(...dentro.filter(d => pareceNomeDeJogo(d)).slice(0, 3));
      } catch { /* ignora */ }
    }
  }
  return [...new Set(achados)];
}

/* ------------------------------------------------------------------ */
/* Veredito final para a varredura                                      */
/* ------------------------------------------------------------------ */

/**
 * Decide se um .exe é um jogo e qual jogo é.
 * @returns {{ok:boolean, motivo?:string, title?:string, ...}}
 */
function analisarExecutavel(exe, opts) {
  const o = opts || {};
  let st;
  try { st = fs.statSync(exe); } catch { return { ok: false, motivo: 'arquivo sumiu' }; }
  const base = path.basename(exe);

  if (NAO_E_JOGO.test(base)) return { ok: false, motivo: `"${base}" é instalador/utilitário` };
  // < 200 KB não é jogo (é stub, launcher de loja, crash handler)
  if (st.size < 200 * 1024) return { ok: false, motivo: `"${base}" é pequeno demais (${Math.round(st.size / 1024)} KB)` };

  const info = exeInfo(exe) || {};
  const dirJogo = o.dirJogo || path.dirname(exe);
  const escolha = decidirNome({
    exe,
    productName: info.productName,
    fileDescription: info.fileDescription,
    companyName: info.companyName,
    originalFilename: info.originalFilename,
    pastaPrincipal: dirJogo,
    exeSize: st.size
  });

  if (!escolha) {
    return { ok: false, motivo: `"${base}" sem nome identificável (genérico)`, info };
  }
  // nome genérico + nenhum metadado = provavelmente não é o jogo
  if (escolha.origem === 'arquivo' && NOME_GENERICO.test(limparNome(base))) {
    return { ok: false, motivo: `"${base}" tem nome genérico`, info };
  }

  return {
    ok: true,
    title: escolha.nome,
    origem: escolha.origem,
    confianca: escolha.confianca,
    empresa: escolha.empresa,
    versao: info.fileVersion || '',
    chaves: chaveDeBusca(escolha.nome, escolha.empresa),
    info
  };
}

/* ------------------------------------------------------------------ */

function tamanho(f) {
  try { return fs.statSync(f).size; } catch { return 0; }
}

module.exports = {
  _debug: { rsrcSection, findVersionData, parseVersionBlock, rvaToOffset },
  exeInfo,
  decidirNome,
  identificarPasta,
  identidadePorArquivos,
  analisarExecutavel,
  chaveDeBusca,
  limparNome,
  pareceNomeDeJogo,
  NOME_GENERICO,
  NAO_E_JOGO
};
