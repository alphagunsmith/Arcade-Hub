'use strict';
/**
 * Arcade Hub — sons da interface (Modo TV e abertura).
 * Tudo sintetizado na hora com Web Audio: nenhum arquivo de áudio no app.
 * Volume baixo de propósito; dá para desligar no menu do Modo TV.
 */
const Som = (() => {
  let ctx = null;
  let master = null;
  let ligado = true;

  try { ligado = localStorage.getItem('arcadehub.sons') !== '0'; } catch { /* sem storage */ }

  function audio() {
    if (!ligado) return null;
    try {
      if (!ctx) {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        master = ctx.createGain();
        master.gain.value = 0.22;
        master.connect(ctx.destination);
      }
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    } catch { return null; }
  }

  /** Um tom simples com envelope. */
  function tom({ freq = 440, fim = null, dur = 0.12, tipo = 'sine', vol = 0.5, atraso = 0, ataque = 0.005 }) {
    const a = audio();
    if (!a) return;
    const t = a.currentTime + atraso;
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = tipo;
    o.frequency.setValueAtTime(freq, t);
    if (fim) o.frequency.exponentialRampToValueAtTime(fim, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + ataque);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  /** Ruído filtrado (vento, impacto). */
  function ruido({ dur = 0.4, de = 400, ate = 2400, vol = 0.25, atraso = 0, q = 0.8 }) {
    const a = audio();
    if (!a) return;
    const t = a.currentTime + atraso;
    const buf = a.createBuffer(1, Math.ceil(a.sampleRate * dur), a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = a.createBufferSource();
    src.buffer = buf;
    const f = a.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = q;
    f.frequency.setValueAtTime(de, t);
    f.frequency.exponentialRampToValueAtTime(ate, t + dur);
    const g = a.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(master);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  return {
    get ligado() { return ligado; },
    alternar() {
      ligado = !ligado;
      try { localStorage.setItem('arcadehub.sons', ligado ? '1' : '0'); } catch { /* sem storage */ }
      if (ligado) Som.selecionar();
      return ligado;
    },
    // navegação
    mover() { tom({ freq: 1320, dur: 0.045, tipo: 'triangle', vol: 0.18 }); },
    selecionar() { tom({ freq: 880, fim: 1320, dur: 0.09, tipo: 'triangle', vol: 0.3 }); },
    voltar() { tom({ freq: 660, fim: 440, dur: 0.1, tipo: 'triangle', vol: 0.25 }); },
    aba() { tom({ freq: 990, dur: 0.06, tipo: 'square', vol: 0.08 }); },
    erro() { tom({ freq: 220, fim: 180, dur: 0.18, tipo: 'sawtooth', vol: 0.12 }); },
    // abertura
    queda() { ruido({ dur: 0.75, de: 300, ate: 3200, vol: 0.16 }); },
    encaixe() {
      tom({ freq: 140, fim: 55, dur: 0.32, tipo: 'sine', vol: 0.9 });
      ruido({ dur: 0.08, de: 2500, ate: 900, vol: 0.35, q: 1.5 });
      tom({ freq: 2200, dur: 0.05, tipo: 'square', vol: 0.06, atraso: 0.01 });
    },
    pulso() {
      tom({ freq: 70, fim: 38, dur: 1.1, tipo: 'sine', vol: 0.55 });
      ruido({ dur: 1.2, de: 1800, ate: 220, vol: 0.12, q: 0.6 });
    },
    conectar(i) {
      const notas = [523.25, 587.33, 659.25, 783.99, 880, 987.77, 1046.5, 1174.66, 1318.5, 1567.98, 1760, 2093];
      tom({ freq: notas[i % notas.length], dur: 0.22, tipo: 'sine', vol: 0.16, ataque: 0.01 });
    },
    acorde() {
      for (const [f, at] of [[261.63, 0], [329.63, 0.04], [392, 0.08], [523.25, 0.12]]) {
        tom({ freq: f, dur: 1.4, tipo: 'triangle', vol: 0.12, atraso: at, ataque: 0.05 });
      }
    }
  };
})();
