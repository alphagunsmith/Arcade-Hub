/* ================= Arcade Hub — fundos animados =================
 *
 * Cada skin de console tem um fundo animado no estilo da interface daquele
 * console: a onda do XMB no PS3, as torres do PS2, os orbes do Xbox 360, o
 * cubo do GameCube... Tudo desenhado aqui, em código (arte original, sem copiar
 * vídeo nem logo de ninguém), nas cores da skin. Por ser desenhado na hora, o
 * fundo fica nítido em qualquer resolução e pesa quase nada (é mais leve que um GIF).
 *
 * Também toca fundo do usuário: imagem, GIF ou vídeo (criador de skin).
 *
 * Economia: 30 quadros por segundo, para sozinho com a janela escondida (jogando)
 * e mostra um quadro parado se o Windows pede "menos animação".
 */
'use strict';

const Fundos = (() => {
  /* ---------------- cores ---------------- */
  function rgb(cor, padrao) {
    const s = String(cor || '').trim();
    let m = /^#([0-9a-f]{3})$/i.exec(s);
    if (m) return m[1].split('').map(h => parseInt(h + h, 16));
    m = /^#([0-9a-f]{6})/i.exec(s);
    if (m) return [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16));
    m = /rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(s);
    if (m) return [+m[1], +m[2], +m[3]];
    return padrao || [20, 24, 32];
  }
  const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
  const mistura = (x, y, k) => [0, 1, 2].map(i => x[i] + (y[i] - x[i]) * k);
  const claro = c => (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) > 150;

  function coresDaSkin(vars) {
    const v = vars || {};
    const bg = rgb(v['--bg'], [10, 12, 17]);
    return {
      bg, bg2: rgb(v['--bg-2'], bg), a: rgb(v['--accent'], [34, 211, 238]), b: rgb(v['--accent-2'], [99, 102, 241]),
      d: rgb(v['--accent-3'], [244, 114, 182]), txt: rgb(v['--txt'], [233, 237, 246]), claro: claro(bg)
    };
  }

  /* ---------------- utilidades de desenho ---------------- */
  function semente(n) { let x = n * 9301 + 49297; return () => { x = (x * 9301 + 49297) % 233280; return x / 233280; }; }
  function particulas(s, qtd, w, h, gerar) {
    if (!s.p || s.p.length !== qtd || s.w !== w || s.h !== h) {
      const r = semente(qtd + w);
      s.p = Array.from({ length: qtd }, (_, i) => gerar(r, i));
      s.w = w; s.h = h;
    }
    return s.p;
  }
  function gradienteVertical(ctx, w, h, cima, baixo) {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, cima); g.addColorStop(1, baixo);
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  }
  function brilho(ctx, x, y, r, cor, a) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgba(cor, a)); g.addColorStop(1, rgba(cor, 0));
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  /* ---------------- os fundos ----------------
   * desenhar(ctx, w, h, t, c, s): t em segundos, c = cores, s = memória do fundo */
  const TIPOS = {
    /* PS3: a onda — várias fitas finas de luz ondulando juntas, com brilho no meio */
    xmb: {
      nome: 'Onda (PS3)',
      desenhar(ctx, w, h, t, c, s, o) {
        gradienteVertical(ctx, w, h, rgba(mistura(c.bg, c.b, .35), 1), rgba(c.bg, 1));
        brilho(ctx, w * .5, h * .62, w * .55, c.a, .12);
        ctx.globalCompositeOperation = 'lighter';
        const fitas = o.fitas || 2, linhas = o.linhas || 26;
        for (let f = 0; f < fitas; f++) {
          for (let i = 0; i < linhas; i++) {
            const k = i / linhas;
            ctx.beginPath();
            for (let x = -20; x <= w + 20; x += 14) {
              const u = x / w;
              const y = h * (.56 + f * .05) +
                Math.sin(u * 3.1 + t * .32 + f * 1.7 + k * .9) * h * (.13 - f * .03) +
                Math.sin(u * 7.3 - t * .21 + k * 2.4) * h * .025 * (1 + k) +
                (k - .5) * h * .16 * (.6 + .4 * Math.sin(u * 2 + t * .15));
              x <= -20 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
            }
            const meio = 1 - Math.abs(k - .5) * 2;
            ctx.strokeStyle = rgba(mistura(c.a, c.txt, .5), .035 + meio * .15);
            ctx.lineWidth = 1 + meio * 1.8;
            ctx.stroke();
          }
        }
        // poeira de luz
        const p = particulas(s, o.poeira || 50, w, h, r => ({ x: r() * w, y: r() * h, v: .2 + r() * .8, z: r() }));
        for (const q of p) {
          const x = (q.x + t * 8 * q.v) % w, y = q.y + Math.sin(t * .5 + q.x) * 6;
          ctx.fillStyle = rgba(c.txt, .15 + .35 * q.z * (.5 + .5 * Math.sin(t * 2 + q.y)));
          ctx.fillRect(x, y, 1.4 + q.z, 1.4 + q.z);
        }
        ctx.globalCompositeOperation = 'source-over';
      }
    },

    /* PS4: luz suave com formas flutuando em desfoque e uma fita de onda discreta */
    ps4: {
      nome: 'Luz e partículas (PS4/PS5)',
      desenhar(ctx, w, h, t, c, s) {
        gradienteVertical(ctx, w, h, rgba(mistura(c.bg, c.b, .5), 1), rgba(c.bg, 1));
        brilho(ctx, w * (.3 + .1 * Math.sin(t * .05)), h * .2, w * .6, c.b, .35);
        ctx.globalCompositeOperation = 'lighter';
        const p = particulas(s, 34, w, h, r => ({ x: r() * w, y: r() * h, r: 10 + r() * 60, v: .1 + r() * .5, f: r() * 6, q: r() < .45 }));
        for (const q of p) {
          const y = (q.y - t * 10 * q.v + h * 2) % (h + 120) - 60;
          const x = q.x + Math.sin(t * .2 + q.f) * 30;
          const a = .05 + .06 * Math.sin(t * .6 + q.f) ** 2;
          ctx.strokeStyle = rgba(c.a, a * 2.2); ctx.fillStyle = rgba(c.a, a * .6); ctx.lineWidth = 1.2;
          ctx.save(); ctx.translate(x, y); ctx.rotate(t * .1 * q.v + q.f);
          if (q.q) { ctx.strokeRect(-q.r / 2, -q.r / 2, q.r, q.r); ctx.fillRect(-q.r / 2, -q.r / 2, q.r, q.r); }
          else { ctx.beginPath(); ctx.arc(0, 0, q.r / 2, 0, 7); ctx.fill(); ctx.stroke(); }
          ctx.restore();
        }
        for (let i = 0; i < 10; i++) {
          ctx.beginPath();
          for (let x = 0; x <= w; x += 16) {
            const y = h * .72 + Math.sin(x / w * 4 + t * .4 + i * .15) * h * .06 + i * 3;
            x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
          }
          ctx.strokeStyle = rgba(c.txt, .05); ctx.lineWidth = 1; ctx.stroke();
        }
        ctx.globalCompositeOperation = 'source-over';
      }
    },

    /* PSP: ondas finas e mais rápidas, do jeito do menu portátil */
    psp: {
      nome: 'Ondas finas (PSP/Vita)',
      desenhar(ctx, w, h, t, c, s) { TIPOS.xmb.desenhar(ctx, w, h, t * 1.3, c, s, { fitas: 3, linhas: 12, poeira: 26 }); }
    },

    /* PS2: neblina azul com torres de luz subindo e descendo, vistas em perspectiva */
    ps2: {
      nome: 'Torres na neblina (PS2/PS1)',
      desenhar(ctx, w, h, t, c, s) {
        gradienteVertical(ctx, w, h, rgba(c.bg, 1), rgba(mistura(c.bg, c.a, .22), 1));
        const cx = w * .5, horiz = h * .46, giro = t * .06;
        const torres = particulas(s, 90, w, h, (r, i) => ({ ang: (i / 90) * Math.PI * 2 + r() * .1, dist: .25 + r() * .75, alt: .2 + r() * .8, f: r() * 6 }));
        const lista = torres.map(q => {
          const ang = q.ang + giro;
          const z = Math.cos(ang) * q.dist, x = Math.sin(ang) * q.dist;
          return { q, z, x };
        }).sort((m, n) => n.z - m.z);
        ctx.globalCompositeOperation = 'lighter';
        for (const { q, z, x } of lista) {
          const prof = 1.6 / (2.2 + z);                 // perto = maior
          const px = cx + x * w * .55 * prof, base = horiz + h * .38 * prof;
          const alt = h * .42 * prof * q.alt * (.75 + .25 * Math.sin(t * .7 + q.f));
          const larg = 9 * prof;
          const g = ctx.createLinearGradient(0, base - alt, 0, base);
          g.addColorStop(0, rgba(c.txt, .0)); g.addColorStop(.25, rgba(mistura(c.a, c.txt, .4), .16 * prof));
          g.addColorStop(1, rgba(c.a, .32 * prof));
          ctx.fillStyle = g; ctx.fillRect(px - larg / 2, base - alt, larg, alt);
          ctx.fillStyle = rgba(c.txt, .35 * prof); ctx.fillRect(px - larg / 2, base - alt - 2, larg, 2);
        }
        ctx.globalCompositeOperation = 'source-over';
        const n = ctx.createLinearGradient(0, horiz - h * .2, 0, h);
        n.addColorStop(0, rgba(c.bg, 0)); n.addColorStop(.6, rgba(mistura(c.bg, c.a, .15), .35)); n.addColorStop(1, rgba(c.bg, .7));
        ctx.fillStyle = n; ctx.fillRect(0, 0, w, h);
      }
    },

    /* Xbox 360: fundo claro com orbes de luz macios flutuando e uma faixa de brilho */
    orbes: {
      nome: 'Orbes de luz (Xbox 360)',
      desenhar(ctx, w, h, t, c, s) {
        const base = c.claro ? c.bg : mistura(c.bg, [235, 240, 232], .12);
        gradienteVertical(ctx, w, h, rgba(mistura(base, [255, 255, 255], .5), 1), rgba(base, 1));
        const p = particulas(s, 16, w, h, r => ({ x: r(), y: r(), r: .08 + r() * .22, v: .3 + r(), f: r() * 6, cor: r() }));
        for (const q of p) {
          const x = (q.x + Math.sin(t * .05 * q.v + q.f) * .12) * w, y = (q.y + Math.cos(t * .04 * q.v + q.f) * .1) * h;
          brilho(ctx, x, y, q.r * w, q.cor > .5 ? c.a : c.b, c.claro ? .28 : .2);
        }
        // faixa de luz que atravessa na diagonal
        const k = ((t * .07) % 1.6) - .3;
        ctx.save(); ctx.translate(w * k, 0); ctx.rotate(-.35);
        const g = ctx.createLinearGradient(-w * .12, 0, w * .12, 0);
        g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(.5, `rgba(255,255,255,${c.claro ? .32 : .08})`); g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g; ctx.fillRect(-w * .12, -h, w * .24, h * 3);
        ctx.restore();
        ctx.strokeStyle = rgba(c.a, .18); ctx.lineWidth = 2;
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          for (let x = 0; x <= w; x += 20) { const y = h * (.18 + i * .05) + Math.sin(x / w * 3 + t * .25 + i) * h * .05; x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
          ctx.stroke();
        }
      }
    },

    /* Xbox original: núcleo verde brilhando, com filamentos girando em volta */
    nucleo: {
      nome: 'Núcleo verde (Xbox)',
      desenhar(ctx, w, h, t, c, s) {
        ctx.fillStyle = rgba(c.bg, 1); ctx.fillRect(0, 0, w, h);
        const cx = w * .62, cy = h * .5, R = Math.min(w, h) * .3;
        brilho(ctx, cx, cy, R * 2.4, c.b, .5);
        brilho(ctx, cx, cy, R * (1 + .06 * Math.sin(t * 1.4)), c.a, .42);
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 9; i++) {
          ctx.beginPath();
          const fase = t * (.18 + i * .02) + i * .7;
          for (let a = 0; a <= Math.PI * 2.02; a += .05) {
            const r = R * (.75 + .35 * Math.sin(a * 3 + fase) + .1 * Math.sin(a * 7 - fase * 2));
            const x = cx + Math.cos(a + fase * .3) * r * 1.25, y = cy + Math.sin(a + fase * .3) * r * .8;
            a === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
          }
          ctx.strokeStyle = rgba(c.a, .07); ctx.lineWidth = 2; ctx.stroke();
        }
        const p = particulas(s, 40, w, h, r => ({ a: r() * 7, d: .5 + r() * 1.6, v: .1 + r() * .3 }));
        for (const q of p) {
          const a = q.a + t * q.v, d = R * q.d;
          ctx.fillStyle = rgba(c.d, .5);
          ctx.fillRect(cx + Math.cos(a) * d * 1.3, cy + Math.sin(a) * d * .8, 2, 2);
        }
        ctx.globalCompositeOperation = 'source-over';
      }
    },

    /* Xbox One / Switch: chapado e limpo, com uma luz varrendo e quadrados sutis */
    blocos: {
      nome: 'Blocos limpos (Xbox One/Switch)',
      desenhar(ctx, w, h, t, c, s) {
        gradienteVertical(ctx, w, h, rgba(c.bg2, 1), rgba(c.bg, 1));
        const tam = Math.max(48, w / 18);
        const p = particulas(s, 22, w, h, r => ({ x: Math.floor(r() * 20), y: Math.floor(r() * 12), f: r() * 6, v: .3 + r() }));
        for (const q of p) {
          const a = .03 + .05 * Math.max(0, Math.sin(t * .4 * q.v + q.f));
          ctx.fillStyle = rgba(c.a, a);
          ctx.fillRect(q.x * tam + 3, q.y * tam + 3, tam - 6, tam - 6);
        }
        const k = ((t * .05) % 1.4) - .2;
        const g = ctx.createLinearGradient(w * (k - .2), 0, w * (k + .2), h * .4);
        g.addColorStop(0, rgba(c.txt, 0)); g.addColorStop(.5, rgba(c.txt, c.claro ? .1 : .05)); g.addColorStop(1, rgba(c.txt, 0));
        ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      }
    },

    /* Wii: claro, com listras finas correndo e bolhas suaves */
    listras: {
      nome: 'Listras e bolhas (Wii)',
      desenhar(ctx, w, h, t, c, s) {
        const base = c.claro ? c.bg : [236, 238, 240];
        ctx.fillStyle = rgba(c.claro ? base : c.bg, 1); ctx.fillRect(0, 0, w, h);
        const tom = c.claro ? [0, 0, 0] : [255, 255, 255];
        for (let y = (t * 6) % 6; y < h; y += 6) { ctx.fillStyle = rgba(tom, .035); ctx.fillRect(0, y, w, 2); }
        const p = particulas(s, 18, w, h, r => ({ x: r() * w, y: r() * h, r: 20 + r() * 70, v: .2 + r() * .5, f: r() * 6 }));
        for (const q of p) {
          const y = (q.y - t * 9 * q.v + h + 200) % (h + 200) - 100;
          ctx.beginPath(); ctx.arc(q.x + Math.sin(t * .3 + q.f) * 20, y, q.r, 0, 7);
          ctx.fillStyle = rgba(c.a, .05); ctx.fill();
          ctx.strokeStyle = rgba(c.a, .12); ctx.lineWidth = 1.5; ctx.stroke();
        }
      }
    },

    /* Wii U: grade de pontos ondulando */
    pontos: {
      nome: 'Grade de pontos (Wii U)',
      desenhar(ctx, w, h, t, c) {
        gradienteVertical(ctx, w, h, rgba(c.bg2, 1), rgba(c.bg, 1));
        const passo = Math.max(22, w / 48);
        for (let y = passo / 2; y < h; y += passo) {
          for (let x = passo / 2; x < w; x += passo) {
            const o = Math.sin(x / w * 6 + t * .8) * Math.cos(y / h * 5 - t * .5);
            const r = 1.2 + 2.2 * (o * .5 + .5);
            ctx.fillStyle = rgba(c.a, .1 + .25 * (o * .5 + .5));
            ctx.fillRect(x - r / 2, y - r / 2, r, r);
          }
        }
      }
    },

    /* GameCube: cubo de vidro girando em 3D, com cubos pequenos em volta */
    cubo: {
      nome: 'Cubo girando (GameCube)',
      desenhar(ctx, w, h, t, c, s) {
        gradienteVertical(ctx, w, h, rgba(mistura(c.bg, c.a, .25), 1), rgba(c.bg, 1));
        brilho(ctx, w * .68, h * .5, Math.min(w, h) * .6, c.a, .25);
        const V = [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]];
        const A = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
        const F = [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [2, 3, 7, 6], [1, 2, 6, 5], [0, 3, 7, 4]];
        function cubo(cx, cy, tam, ax, ay, alfa) {
          const p = V.map(([x, y, z]) => {
            let X = x * Math.cos(ay) - z * Math.sin(ay), Z = x * Math.sin(ay) + z * Math.cos(ay);
            const Y = y * Math.cos(ax) - Z * Math.sin(ax); Z = y * Math.sin(ax) + Z * Math.cos(ax);
            const k = 3.2 / (4.5 + Z);
            return [cx + X * tam * k, cy + Y * tam * k, Z];
          });
          F.forEach(f => {
            ctx.beginPath(); f.forEach((i, n) => n ? ctx.lineTo(p[i][0], p[i][1]) : ctx.moveTo(p[i][0], p[i][1])); ctx.closePath();
            ctx.fillStyle = rgba(c.a, .045 * alfa); ctx.fill();
          });
          ctx.strokeStyle = rgba(mistura(c.a, c.txt, .5), .5 * alfa); ctx.lineWidth = 1.5;
          A.forEach(([i, j]) => { ctx.beginPath(); ctx.moveTo(p[i][0], p[i][1]); ctx.lineTo(p[j][0], p[j][1]); ctx.stroke(); });
        }
        const m = Math.min(w, h);
        cubo(w * .68, h * .5, m * .2, t * .35, t * .5, 1);
        const p = particulas(s, 12, w, h, r => ({ x: r(), y: r(), z: .3 + r() * .6, f: r() * 6 }));
        for (const q of p) cubo(((q.x + t * .01 * q.z) % 1.1 - .05) * w, q.y * h + Math.sin(t * .4 + q.f) * 12, m * .025 * q.z, t * q.z + q.f, t * .7 * q.z, .5 * q.z);
      }
    },

    /* DS/3DS: claro, com bolhas e brilhos subindo */
    bolhas: {
      nome: 'Bolhas e brilhos (DS/3DS)',
      desenhar(ctx, w, h, t, c, s) {
        gradienteVertical(ctx, w, h, rgba(c.bg2, 1), rgba(c.bg, 1));
        const p = particulas(s, 46, w, h, r => ({ x: r() * w, y: r() * h, r: 3 + r() * 16, v: .3 + r(), f: r() * 6, e: r() < .3 }));
        for (const q of p) {
          const y = (q.y - t * 16 * q.v + h + 60) % (h + 60) - 30, x = q.x + Math.sin(t + q.f) * 10;
          if (q.e) {
            const a = .25 + .5 * Math.max(0, Math.sin(t * 2 + q.f));
            ctx.strokeStyle = rgba(c.a, a); ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.moveTo(x - q.r / 2, y); ctx.lineTo(x + q.r / 2, y); ctx.moveTo(x, y - q.r / 2); ctx.lineTo(x, y + q.r / 2); ctx.stroke();
          } else {
            ctx.beginPath(); ctx.arc(x, y, q.r, 0, 7);
            ctx.strokeStyle = rgba(c.a, .22); ctx.lineWidth = 1.2; ctx.stroke();
            ctx.fillStyle = rgba(c.claro ? [255, 255, 255] : c.a, .08); ctx.fill();
          }
        }
      }
    },

    /* Aurora/FSD: aurora boreal escura com estrelas */
    aurora: {
      nome: 'Aurora (RGH)',
      desenhar(ctx, w, h, t, c, s) {
        ctx.fillStyle = rgba(c.bg, 1); ctx.fillRect(0, 0, w, h);
        const est = particulas(s, 80, w, h, r => ({ x: r() * w, y: r() * h * .7, f: r() * 6 }));
        for (const q of est) { ctx.fillStyle = rgba(c.txt, .2 + .5 * Math.abs(Math.sin(t * .8 + q.f))); ctx.fillRect(q.x, q.y, 1.5, 1.5); }
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 4; i++) {
          const cor = [c.a, c.b, c.d, c.a][i];
          ctx.beginPath();
          for (let x = 0; x <= w; x += 12) {
            const y = h * (.35 + i * .06) + Math.sin(x / w * 2.5 + t * (.15 + i * .04) + i) * h * .1;
            x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
          }
          ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath();
          const g = ctx.createLinearGradient(0, h * .2, 0, h * .9);
          g.addColorStop(0, rgba(cor, .14)); g.addColorStop(.5, rgba(cor, .03)); g.addColorStop(1, rgba(cor, 0));
          ctx.fillStyle = g; ctx.fill();
        }
        ctx.globalCompositeOperation = 'source-over';
      }
    },

    /* Industrial/XeXMenu: grade metálica com uma barra de luz varrendo */
    grade: {
      nome: 'Grade com varredura (industrial)',
      desenhar(ctx, w, h, t, c) {
        gradienteVertical(ctx, w, h, rgba(c.bg2, 1), rgba(c.bg, 1));
        ctx.strokeStyle = rgba(c.txt, .05); ctx.lineWidth = 1;
        const p = Math.max(30, w / 36), off = (t * 8) % p;
        for (let x = -off; x < w; x += p) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
        for (let y = -off; y < h; y += p) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
        const y = ((t * .12) % 1.3 - .15) * h;
        const g = ctx.createLinearGradient(0, y - 60, 0, y + 60);
        g.addColorStop(0, rgba(c.a, 0)); g.addColorStop(.5, rgba(c.a, .16)); g.addColorStop(1, rgba(c.a, 0));
        ctx.fillStyle = g; ctx.fillRect(0, y - 60, w, 120);
      }
    },

    /* 8 e 16 bits: pixels grandes flutuando, como numa tela de CRT */
    pixels: {
      nome: 'Pixels (retrô)',
      desenhar(ctx, w, h, t, c, s) {
        ctx.fillStyle = rgba(c.bg, 1); ctx.fillRect(0, 0, w, h);
        const tam = Math.max(8, Math.round(w / 110));
        const p = particulas(s, 70, w, h, r => ({ x: r() * w, y: r() * h, v: .2 + r() * .8, cor: Math.floor(r() * 3), n: 1 + Math.floor(r() * 3) }));
        for (const q of p) {
          const x = Math.round(((q.x + t * 12 * q.v) % (w + 40) - 20) / tam) * tam;
          const y = Math.round((q.y + Math.sin(t * .6 + q.x) * 10) / tam) * tam;
          ctx.fillStyle = rgba([c.a, c.b, c.d][q.cor], .16);
          ctx.fillRect(x, y, tam * q.n, tam);
        }
      }
    },

    /* Dreamcast: espiral de pontos girando devagar */
    espiral: {
      nome: 'Espiral',
      desenhar(ctx, w, h, t, c) {
        gradienteVertical(ctx, w, h, rgba(c.bg2, 1), rgba(c.bg, 1));
        const cx = w * .66, cy = h * .5;
        for (let i = 0; i < 260; i++) {
          const a = i * .21 + t * .25, r = i * Math.min(w, h) * .0016;
          ctx.fillStyle = rgba(c.a, .08 + .3 * (i / 260));
          ctx.beginPath(); ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 1 + i / 90, 0, 7); ctx.fill();
        }
      }
    },

    /* Fliperama: campo de estrelas vindo na sua direção */
    estrelas: {
      nome: 'Estrelas (fliperama)',
      desenhar(ctx, w, h, t, c, s) {
        ctx.fillStyle = rgba(c.bg, 1); ctx.fillRect(0, 0, w, h);
        const p = particulas(s, 160, w, h, r => ({ x: r() - .5, y: r() - .5, z: r() }));
        for (const q of p) {
          const z = 1 - ((q.z + t * .08) % 1);
          const x = w / 2 + q.x / z * w * .25, y = h / 2 + q.y / z * h * .25;
          const tam = (1 - z) * 3;
          ctx.fillStyle = rgba(q.z > .7 ? c.a : c.txt, (1 - z) * .8);
          ctx.fillRect(x, y, tam, tam);
        }
      }
    },

    /* Neon (padrão do Arcade Hub): chão quadriculado andando até o horizonte */
    neon: {
      nome: 'Grade neon',
      desenhar(ctx, w, h, t, c) {
        gradienteVertical(ctx, w, h, rgba(c.bg, 1), rgba(mistura(c.bg, c.b, .18), 1));
        const horiz = h * .58;
        brilho(ctx, w / 2, horiz, w * .45, c.d, .14);
        ctx.strokeStyle = rgba(c.a, .14); ctx.lineWidth = 1;
        for (let i = -14; i <= 14; i++) { ctx.beginPath(); ctx.moveTo(w / 2 + i * 6, horiz); ctx.lineTo(w / 2 + i * w * .16, h); ctx.stroke(); }
        const k = (t * .25) % 1;
        for (let i = 0; i < 14; i++) {
          const z = (i + k) / 14, y = horiz + (h - horiz) * z * z;
          ctx.strokeStyle = rgba(c.a, .05 + .15 * z); ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
        }
      }
    }
  };

  /** Fundo de cada skin de console (as que não estão aqui ficam com o papel de parede). */
  const DA_SKIN = {
    'tema-ps3': 'xmb', 'tema-ps4': 'ps4', 'tema-psp': 'psp', 'tema-ps2': 'ps2',
    'tema-xbox360': 'orbes', 'tema-xbox': 'nucleo', 'tema-xboxone': 'blocos',
    'tema-wii': 'listras', 'tema-wiiu': 'pontos', 'tema-switch': 'blocos', 'tema-gamecube': 'cubo', 'tema-3ds': 'bolhas',
    'tema-aurora': 'aurora', 'tema-fsd': 'aurora', 'tema-xexmenu': 'grade', 'tema-industrial': 'grade',
    neon: 'neon', nes: 'pixels', snes: 'pixels', n64: 'cubo', gamecube: 'cubo', gba: 'pixels', gbc: 'pixels', gameboy: 'pixels',
    ds: 'bolhas', '3ds': 'bolhas', switch: 'blocos', wii: 'listras', wiiu: 'pontos',
    ps1: 'ps2', ps2: 'ps2', ps3: 'xmb', ps4: 'ps4', ps5: 'ps4', psp: 'psp', vita: 'psp',
    xbox: 'nucleo', xbox360: 'orbes', xboxone: 'blocos', mastersystem: 'pixels', dreamcast: 'espiral', atari: 'pixels', arcade: 'estrelas'
  };

  /* ---------------- motor ---------------- */
  let camada = null, cv = null, ctx = null, raf = 0, ultimo = 0, t0 = 0;
  let atual = { tipo: null, cores: null, velocidade: 1, intensidade: 1 };
  let memoria = {};
  let ligado = true;
  let midia = null;
  const menosAnimacao = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };

  function garantirCamada() {
    if (camada) return camada;
    camada = document.createElement('div');
    camada.className = 'fundo-vivo';
    camada.setAttribute('aria-hidden', 'true');
    cv = document.createElement('canvas');
    camada.appendChild(cv);
    ctx = cv.getContext('2d', { alpha: false });
    document.body.insertBefore(camada, document.body.firstChild);
    addEventListener('resize', medir);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) pedirQuadro(); });
    medir();
    return camada;
  }

  function medir() {
    if (!cv) return;
    const r = camada.getBoundingClientRect();
    const esc = Math.min(1, 1600 / Math.max(1, r.width)) * .75;      // fundo suave: não precisa de resolução total
    const w = Math.max(2, Math.round(r.width * esc)), h = Math.max(2, Math.round(r.height * esc));
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; memoria = {}; }
    if (atual.tipo) quadro(performance.now(), true);
  }

  function quadro(agora, forcar) {
    raf = 0;
    if (!atual.tipo || !ctx || (!forcar && document.hidden)) return;
    if (!forcar && agora - ultimo < 32) { pedirQuadro(); return; }   // ~30 quadros/s
    ultimo = agora;
    const def = TIPOS[atual.tipo];
    const t = menosAnimacao() ? 12 : ((agora - t0) / 1000) * atual.velocidade;
    try {
      ctx.save();
      def.desenhar(ctx, cv.width, cv.height, t, atual.cores, memoria[atual.tipo] || (memoria[atual.tipo] = {}), {});
      ctx.restore();
    } catch (e) { console.warn('[fundos]', e); atual.tipo = null; return; }
    if (!menosAnimacao()) pedirQuadro();
  }
  function pedirQuadro() { if (!raf && atual.tipo && ligado) raf = requestAnimationFrame(quadro); }

  function limparMidia() {
    if (midia) { if (midia.tagName === 'VIDEO') { try { midia.pause(); } catch { /* ok */ } midia.removeAttribute('src'); midia.load(); } midia.remove(); midia = null; }
  }

  /**
   * Liga o fundo.
   *   cfg.tipo        id de TIPOS ('xmb'…), ou null
   *   cfg.vars        variáveis da skin (para as cores)
   *   cfg.midia       { tipo: 'imagem'|'video', url }  — fundo do usuário (vence o tipo)
   *   cfg.velocidade  0.2…3   cfg.escurecer 0…0.9   cfg.desfoque px
   */
  function aplicar(cfg) {
    cfg = cfg || {};
    garantirCamada();
    const tipo = ligado && TIPOS[cfg.tipo] ? cfg.tipo : null;
    atual = { tipo: cfg.midia && cfg.midia.url ? null : tipo, cores: coresDaSkin(cfg.vars), velocidade: Math.max(.1, Math.min(3, +cfg.velocidade || 1)) };
    if (!t0) t0 = performance.now();
    limparMidia();
    if (cfg.midia && cfg.midia.url && ligado) {
      const ehVideo = cfg.midia.tipo === 'video';
      midia = document.createElement(ehVideo ? 'video' : 'img');
      midia.className = 'fundo-midia';
      if (ehVideo) {
        Object.assign(midia, { muted: true, loop: true, autoplay: true, playsInline: true });
        midia.onerror = async () => {
          // o Chromium às vezes recusa file:// no <video>: o processo principal dá uma URL local
          const api = window.arcadeAPI;
          if (!api || !api.videoUrlHttp || !/^file:/.test(cfg.midia.url)) return;
          const r = await api.videoUrlHttp({ arquivo: decodeURI(cfg.midia.url.replace(/^file:\/\/(\/(?=[A-Za-z]:))?/, '')) });
          const alt = r && r.data ? r.data : r;
          if (alt && alt.ok && midia) { midia.src = alt.url; midia.play().catch(() => {}); }
        };
      } else midia.alt = '';
      midia.src = cfg.midia.url;
      camada.appendChild(midia);
      if (ehVideo) midia.play().catch(() => {});
    }
    camada.style.setProperty('--fundo-escuro', String(Math.max(0, Math.min(.9, +cfg.escurecer || 0))));
    camada.style.setProperty('--fundo-desfoque', `${Math.max(0, Math.min(40, +cfg.desfoque || 0))}px`);
    const tem = !!(atual.tipo || midia);
    camada.hidden = !tem;
    document.body.classList.toggle('com-fundo-vivo', tem);
    memoria = {};
    if (atual.tipo) { medir(); pedirQuadro(); }
    return tem;
  }

  /** Para outra tela (Modo TV) mostrar o mesmo fundo, o canvas muda de lugar. */
  function anexar(destino) {
    garantirCamada();
    const alvo = destino || document.body;
    if (camada.parentNode !== alvo) alvo.insertBefore(camada, alvo.firstChild);
    camada.classList.toggle('no-modo-tv', !!destino);
    medir();
  }

  function definirLigado(v) {
    ligado = v !== false;
    if (!ligado) { atual.tipo = null; limparMidia(); if (camada) camada.hidden = true; document.body.classList.remove('com-fundo-vivo'); }
  }

  /** Miniatura parada de um tipo (prévia nos cartões de skin e no criador). */
  function miniatura(canvas, tipo, vars, t) {
    const def = TIPOS[tipo];
    if (!def || !canvas) return false;
    const c2 = canvas.getContext('2d');
    try { def.desenhar(c2, canvas.width, canvas.height, t == null ? 9 : t, coresDaSkin(vars), {}, {}); } catch { return false; }
    return true;
  }

  /** Anima um fundo num canvas qualquer (prévia do criador e do Modo TV). Devolve a função de parar. */
  function animarEm(canvas, lerCfg) {
    let id = 0, mem = {}, tipoAntes = null, ult = 0;
    const ini = performance.now();
    const passo = agora => {
      id = requestAnimationFrame(passo);
      if (!canvas.isConnected) { cancelAnimationFrame(id); return; }
      if (agora - ult < 32 || !canvas.offsetParent) return;     // escondido: não desenha
      ult = agora;
      const cfg = lerCfg() || {};
      const def = TIPOS[cfg.tipo];
      const c2 = canvas.getContext('2d');
      if (!def) { c2.clearRect(0, 0, canvas.width, canvas.height); return; }
      if (cfg.tipo !== tipoAntes) { mem = {}; tipoAntes = cfg.tipo; }
      const r = canvas.getBoundingClientRect();
      const w = Math.max(2, Math.round(r.width * .75)), h = Math.max(2, Math.round(r.height * .75));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; mem = {}; }
      try { def.desenhar(c2, w, h, (agora - ini) / 1000 * (+cfg.velocidade || 1), coresDaSkin(cfg.vars), mem, {}); } catch { /* prévia */ }
    };
    id = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(id);
  }

  return {
    TIPOS, DA_SKIN, aplicar, anexar, miniatura, animarEm, definirLigado, coresDaSkin,
    tipoDaSkin: skin => skin ? (skin.fundo || DA_SKIN[skin.id] || null) : null,
    get ligado() { return ligado; }
  };
})();

if (typeof window !== 'undefined') window.Fundos = Fundos;
if (typeof module !== 'undefined' && module.exports) module.exports = { Fundos };
