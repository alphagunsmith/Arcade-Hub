/* ================= Arcade Hub — skins (consoles clássicos) =================
 * Cada skin define as cores da interface. As variáveis usadas pelo CSS estão
 * documentadas no topo de styles.css. Skins retrô também podem ligar scanlines,
 * trocar a fonte e o raio dos cantos.
 */
'use strict';

const SKINS = [
  /* ==================================================================
   * TEMAS DE DASHBOARD — a interface do console, não só a cor
   *
   * Cada tema diz qual DASHBOARD (renderer/dashboards.js) usar e agrupa os
   * consoles que compartilham aquele visual (`systems`). Quando a biblioteca
   * tem jogos de mais de um console, o dashboard MUDA na hora em que você
   * escolhe a coluna/aba daquele console — trocar de aba = trocar de console,
   * a mágica que o usuário pediu.
   * ================================================================== */

  /* ---------------- PlayStation ---------------- */
  {
    id: 'tema-ps3',
    name: 'PS3 — XMB',
    console: 'PlayStation 3',
    year: 2006,
    brand: 'PlayStation',
    swatch: ['#0b0f14', '#8fd6ff', '#3a6ea8'],
    dashboard: 'xmb',
    art: 'art/xmb.jpg',
    systems: ['ps3', 'psp', 'ps1', 'ps2', 'vita'],
    vars: {
      '--bg': '#05070a', '--bg-2': '#080c12', '--panel': 'rgba(12,18,26,.72)', '--panel-2': 'rgba(20,30,42,.8)',
      '--input-bg': '#0a1018', '--txt': '#f2f7ff', '--muted': '#8ea6bf',
      '--accent': '#8fd6ff', '--accent-2': '#3a6ea8', '--accent-3': '#e8f4ff',
      '--on-accent': '#04121c', '--line': 'rgba(160,200,240,.14)', '--line-strong': 'rgba(160,200,240,.28)',
      '--radius-card': '6px', '--radius-sheet': '10px',
      '--brand-font': '"Segoe UI Variable", "Segoe UI", system-ui, sans-serif'
    }
  },
  {
    id: 'tema-ps4',
    name: 'PS4 — XMB',
    console: 'PlayStation 4',
    year: 2013,
    brand: 'PlayStation',
    swatch: ['#101720', '#2f6fd0', '#7fc4ff'],
    dashboard: 'xmb',
    art: 'art/xmb.jpg',
    systems: ['ps4', 'ps5', 'vita', 'ps3', 'psp'],
    vars: {
      '--bg': '#070b12', '--bg-2': '#0b1220', '--panel': 'rgba(16,26,42,.74)', '--panel-2': 'rgba(24,38,60,.82)',
      '--input-bg': '#0a1220', '--txt': '#eef4ff', '--muted': '#8fa2c0',
      '--accent': '#7fc4ff', '--accent-2': '#2f6fd0', '--accent-3': '#b9dcff',
      '--on-accent': '#04101c', '--line': 'rgba(150,190,240,.14)', '--line-strong': 'rgba(150,190,240,.26)',
      '--radius-card': '8px'
    }
  },
  {
    id: 'tema-psp',
    name: 'PSP — XMB',
    console: 'PlayStation Portable',
    year: 2004,
    brand: 'PlayStation',
    swatch: ['#0a0f14', '#a8d8f0', '#5b8fb0'],
    dashboard: 'xmb',
    art: 'art/xmb.jpg',
    systems: ['psp', 'ps1', 'ps2', 'ps3'],
    vars: {
      '--bg': '#04070a', '--bg-2': '#070d13', '--panel': 'rgba(10,16,22,.78)', '--panel-2': 'rgba(18,28,38,.85)',
      '--input-bg': '#081018', '--txt': '#eaf6ff', '--muted': '#87a2b8',
      '--accent': '#a8d8f0', '--accent-2': '#5b8fb0', '--accent-3': '#ffffff',
      '--on-accent': '#04121a', '--line': 'rgba(160,205,235,.13)', '--line-strong': 'rgba(160,205,235,.24)',
      '--radius-card': '4px', '--radius-sheet': '8px'
    }
  },
  {
    id: 'tema-ps2',
    name: 'PS2 — utilitário',
    console: 'PlayStation 2',
    year: 2000,
    brand: 'PlayStation',
    swatch: ['#0b1420', '#3a7bd5', '#9bc7ff'],
    dashboard: 'canais',
    art: 'art/tiles.jpg',
    systems: ['ps2', 'ps1'],
    vars: {
      '--bg': '#060b12', '--bg-2': '#0a1420', '--panel': 'rgba(14,24,38,.8)', '--panel-2': 'rgba(22,36,56,.85)',
      '--input-bg': '#0a1220', '--txt': '#e8f2ff', '--muted': '#8b9cb5',
      '--accent': '#3a7bd5', '--accent-2': '#9bc7ff', '--accent-3': '#ffffff',
      '--on-accent': '#ffffff', '--line': 'rgba(120,170,230,.16)', '--line-strong': 'rgba(120,170,230,.3)',
      '--radius-card': '3px', '--radius-sheet': '6px'
    }
  },

  /* ---------------- Xbox ---------------- */
  {
    id: 'tema-xbox360',
    name: 'Xbox 360 — NXE (blades)',
    console: 'Xbox 360',
    year: 2008,
    brand: 'Xbox',
    swatch: ['#e9f3ea', '#8ec63f', '#5aa832'],
    dashboard: 'blades',
    art: 'art/blades.jpg',
    systems: ['xbox360', 'xboxone', 'xbox'],
    vars: {
      '--bg': '#e8f1e8', '--bg-2': '#f4f8f2', '--panel': 'rgba(255,255,255,.72)', '--panel-2': 'rgba(244,250,240,.9)',
      '--input-bg': '#ffffff', '--txt': '#16221a', '--muted': '#5a6b5c',
      '--accent': '#5aa832', '--accent-2': '#8ec63f', '--accent-3': '#0d7a3e',
      '--on-accent': '#ffffff', '--line': 'rgba(22,34,26,.14)', '--line-strong': 'rgba(22,34,26,.26)',
      '--radius-card': '10px', '--radius-sheet': '14px',
      '--shadow': '0 20px 44px -22px rgba(20,40,25,.4)'
    }
  },
  {
    id: 'tema-xbox',
    name: 'Xbox original — blades',
    console: 'Xbox',
    year: 2002,
    brand: 'Xbox',
    swatch: ['#0f2a1a', '#7ddc3a', '#0a6b2d'],
    dashboard: 'blades',
    art: 'art/blades.jpg',
    systems: ['xbox', 'xbox360'],
    vars: {
      '--bg': '#0a1c12', '--bg-2': '#0e2618', '--panel': 'rgba(16,42,28,.82)', '--panel-2': 'rgba(22,56,36,.88)',
      '--input-bg': '#0c2216', '--txt': '#eafff0', '--muted': '#8fb8a0',
      '--accent': '#7ddc3a', '--accent-2': '#0a6b2d', '--accent-3': '#d6ff9e',
      '--on-accent': '#04140a', '--line': 'rgba(120,220,150,.16)', '--line-strong': 'rgba(120,220,150,.3)',
      '--radius-card': '8px'
    }
  },
  {
    id: 'tema-xboxone',
    name: 'Xbox One — tiles',
    console: 'Xbox One',
    year: 2013,
    brand: 'Xbox',
    swatch: ['#16181c', '#3ea34a', '#0f6b2b'],
    dashboard: 'tiles',
    art: 'art/tiles.jpg',
    systems: ['xboxone', 'xbox360', 'xbox'],
    vars: {
      '--bg': '#101215', '--bg-2': '#16191d', '--panel': '#1b1f24', '--panel-2': '#22272d',
      '--input-bg': '#131619', '--txt': '#f1f4f7', '--muted': '#98a1ab',
      '--accent': '#3ea34a', '--accent-2': '#7ad07f', '--accent-3': '#ffffff',
      '--on-accent': '#04120a', '--line': 'rgba(255,255,255,.09)', '--line-strong': 'rgba(255,255,255,.18)',
      '--radius-card': '2px', '--radius-sheet': '4px'
    }
  },

  /* ---------------- Nintendo ---------------- */
  {
    id: 'tema-wii',
    name: 'Wii — canais',
    console: 'Wii',
    year: 2006,
    brand: 'Nintendo',
    swatch: ['#eaf4fb', '#22a8dc', '#0d7cae'],
    dashboard: 'canais',
    art: 'art/canais.jpg',
    systems: ['wii', 'wiiu', 'gc'],
    vars: {
      '--bg': '#e9f3fa', '--bg-2': '#f6fbfe', '--panel': 'rgba(255,255,255,.86)', '--panel-2': 'rgba(240,249,255,.95)',
      '--input-bg': '#ffffff', '--txt': '#12212b', '--muted': '#5c7280',
      '--accent': '#22a8dc', '--accent-2': '#0d7cae', '--accent-3': '#7fd4f2',
      '--on-accent': '#ffffff', '--line': 'rgba(18,33,43,.12)', '--line-strong': 'rgba(18,33,43,.22)',
      '--radius-card': '12px', '--radius-sheet': '16px',
      '--shadow': '0 16px 34px -18px rgba(18,45,60,.35)'
    }
  },
  {
    id: 'tema-wiiu',
    name: 'Wii U — canais',
    console: 'Wii U',
    year: 2012,
    brand: 'Nintendo',
    swatch: ['#0d1b26', '#22c3e6', '#0a7f9c'],
    dashboard: 'canais',
    art: 'art/canais.jpg',
    systems: ['wiiu', 'wii', 'switch'],
    vars: {
      '--bg': '#0a151d', '--bg-2': '#0e1d28', '--panel': 'rgba(16,32,44,.84)', '--panel-2': 'rgba(22,44,58,.9)',
      '--input-bg': '#0c1a24', '--txt': '#e6f7fd', '--muted': '#88a8b8',
      '--accent': '#22c3e6', '--accent-2': '#0a7f9c', '--accent-3': '#9beaf8',
      '--on-accent': '#04161c', '--line': 'rgba(120,210,235,.16)', '--line-strong': 'rgba(120,210,235,.3)',
      '--radius-card': '10px'
    }
  },
  {
    id: 'tema-switch',
    name: 'Switch — fileira',
    console: 'Nintendo Switch',
    year: 2017,
    brand: 'Nintendo',
    swatch: ['#1a1c20', '#e60012', '#00c3e3'],
    dashboard: 'tiles',
    art: 'art/tiles.jpg',
    systems: ['switch', 'wiiu', 'n3ds'],
    vars: {
      '--bg': '#141619', '--bg-2': '#1a1d21', '--panel': '#1f2226', '--panel-2': '#26292e',
      '--input-bg': '#17191c', '--txt': '#f4f6f8', '--muted': '#9aa2ab',
      '--accent': '#e60012', '--accent-2': '#00c3e3', '--accent-3': '#ffffff',
      '--on-accent': '#ffffff', '--line': 'rgba(255,255,255,.08)', '--line-strong': 'rgba(255,255,255,.18)',
      '--radius-card': '14px', '--radius-sheet': '18px'
    }
  },
  {
    id: 'tema-gamecube',
    name: 'GameCube — carrossel',
    console: 'Nintendo GameCube',
    year: 2001,
    brand: 'Nintendo',
    swatch: ['#1b1f3a', '#6f4bd8', '#b39dff'],
    dashboard: 'carrossel',
    art: 'art/tiles.jpg',
    systems: ['gc', 'gba', 'gb', 'gbc', 'nds'],
    vars: {
      '--bg': '#0e1124', '--bg-2': '#141834', '--panel': 'rgba(24,28,58,.86)', '--panel-2': 'rgba(32,38,76,.9)',
      '--input-bg': '#101430', '--txt': '#eef0ff', '--muted': '#9aa0c8',
      '--accent': '#6f4bd8', '--accent-2': '#b39dff', '--accent-3': '#55e0c0',
      '--on-accent': '#ffffff', '--line': 'rgba(150,140,255,.16)', '--line-strong': 'rgba(150,140,255,.3)',
      '--radius-card': '12px'
    }
  },
  {
    id: 'tema-3ds',
    name: '3DS — carrossel',
    console: 'Nintendo 3DS',
    year: 2011,
    brand: 'Nintendo',
    swatch: ['#12161f', '#e0e6ef', '#c62828'],
    dashboard: 'carrossel',
    art: 'art/tiles.jpg',
    systems: ['n3ds', 'nds', 'switch'],
    vars: {
      '--bg': '#0c0f16', '--bg-2': '#12161f', '--panel': 'rgba(20,25,36,.86)', '--panel-2': 'rgba(28,34,48,.9)',
      '--input-bg': '#0f131c', '--txt': '#eaf0f8', '--muted': '#8b95a6',
      '--accent': '#e0e6ef', '--accent-2': '#c62828', '--accent-3': '#7fb2ff',
      '--on-accent': '#10141c', '--line': 'rgba(200,215,235,.13)', '--line-strong': 'rgba(200,215,235,.26)',
      '--radius-card': '12px'
    }
  },

  /* ==================================================================
   * DASHBOARDS PERSONALIZADOS (RGH / desbloqueados)
   * Aurora, FSD e XeXMenu são os dashboards alternativos mais usados em
   * Xbox 360 com RGH/JTAG. Não têm nada de oficial: são feitos pela cena.
   * ================================================================== */
  {
    id: 'tema-aurora',
    name: 'Aurora (RGH)',
    console: 'Xbox 360 RGH',
    year: 2014,
    brand: 'outros',
    descricao: 'Dashboard alternativo de RGH: coverflow escuro com capas grandes e vídeo de fundo.',
    swatch: ['#07090f', '#ff8a1f', '#ffc46b'],
    dashboard: 'coverflow',
    art: 'art/aurora.jpg',
    systems: ['xbox360', 'xbox', 'xboxone'],
    vars: {
      '--bg': '#05070c', '--bg-2': '#0a0e16', '--panel': 'rgba(12,16,26,.82)', '--panel-2': 'rgba(18,24,38,.9)',
      '--input-bg': '#080c14', '--txt': '#f6f8ff', '--muted': '#93a0b8',
      '--accent': '#ff8a1f', '--accent-2': '#ffc46b', '--accent-3': '#37d7ff',
      '--on-accent': '#120a02', '--line': 'rgba(255,180,110,.16)', '--line-strong': 'rgba(255,180,110,.3)',
      '--radius-card': '6px', '--radius-sheet': '10px'
    }
  },
  {
    id: 'tema-fsd',
    name: 'FSD / Freestyle (RGH)',
    console: 'Xbox 360 RGH',
    year: 2011,
    brand: 'outros',
    descricao: 'FreeStyle Dash: coverflow clássico dos tempos do RGH, verde-limão sobre grafite.',
    swatch: ['#0b0f12', '#9ddc2f', '#d8f57a'],
    dashboard: 'coverflow',
    art: 'art/aurora.jpg',
    systems: ['xbox360', 'xbox'],
    vars: {
      '--bg': '#080b0e', '--bg-2': '#0d1216', '--panel': 'rgba(16,20,24,.84)', '--panel-2': 'rgba(22,28,34,.9)',
      '--input-bg': '#0a0e12', '--txt': '#f2f7ea', '--muted': '#93a08c',
      '--accent': '#9ddc2f', '--accent-2': '#d8f57a', '--accent-3': '#5fd0ff',
      '--on-accent': '#0a1402', '--line': 'rgba(180,230,120,.16)', '--line-strong': 'rgba(180,230,120,.3)',
      '--radius-card': '4px'
    }
  },
  {
    id: 'tema-xexmenu',
    name: 'XeXMenu (RGH)',
    console: 'Xbox 360 RGH',
    year: 2010,
    brand: 'outros',
    descricao: 'File row técnico do XeXMenu, o "explorer" do RGH. Verde terminal sobre grafite.',
    swatch: ['#0a0d0a', '#35d84a', '#8ef0a0'],
    dashboard: 'tiles',
    art: 'art/industrial.jpg',
    systems: ['xbox360', 'xbox'],
    vars: {
      '--bg': '#070a07', '--bg-2': '#0b100b', '--panel': 'rgba(14,20,14,.86)', '--panel-2': 'rgba(20,30,20,.92)',
      '--input-bg': '#090e09', '--txt': '#e8f7ea', '--muted': '#8aa88f',
      '--accent': '#35d84a', '--accent-2': '#8ef0a0', '--accent-3': '#ffd24a',
      '--on-accent': '#04140a', '--line': 'rgba(120,230,140,.16)', '--line-strong': 'rgba(120,230,140,.3)',
      '--radius-card': '0px', '--radius-sheet': '2px',
      '--brand-font': '"Cascadia Mono", "Consolas", ui-monospace, monospace'
    }
  },
  {
    id: 'tema-industrial',
    name: 'Industrial (RGH)',
    console: 'Xbox 360 RGH',
    year: 2016,
    brand: 'outros',
    descricao: 'Tema escuro técnico dos dashboards da cena: metal, verde e circuitos.',
    swatch: ['#0b0d0e', '#7ae04a', '#c8ff9e'],
    dashboard: 'blades',
    art: 'art/industrial.jpg',
    systems: ['xbox360', 'ps3', 'wii'],
    vars: {
      '--bg': '#080a0b', '--bg-2': '#0d1011', '--panel': 'rgba(16,20,21,.88)', '--panel-2': 'rgba(22,27,29,.92)',
      '--input-bg': '#0a0d0e', '--txt': '#eef4ee', '--muted': '#8fa093',
      '--accent': '#7ae04a', '--accent-2': '#c8ff9e', '--accent-3': '#40c4ff',
      '--on-accent': '#06130a', '--line': 'rgba(150,220,150,.14)', '--line-strong': 'rgba(150,220,150,.28)',
      '--radius-card': '0px', '--radius-sheet': '3px',
      '--brand-font': '"Cascadia Mono", "Consolas", ui-monospace, monospace'
    }
  },
  /* ==================================================================
   * ESTILO LAUNCHBOX / BIG BOX (renderer/launchbox.js)
   * Interfaces de frontend de PC: a área de trabalho (capas ou lista, com
   * plataformas à esquerda) e o modo TV (parede, roda vertical, lista).
   * Cada interface tem variantes de cor; o Colorido pinta por plataforma.
   * ================================================================== */
  {
    id: 'lb-classico',
    name: 'LaunchBox — Clássico',
    console: 'LaunchBox',
    year: 2016,
    brand: 'Arcade',
    descricao: 'Área de trabalho: plataformas à esquerda, capas por letra e detalhes com vídeo à direita.',
    swatch: ['#1c1f26', '#3d9bff', '#e7ecf3'],
    dashboard: 'lb-caixas',
    vars: {
      '--bg': '#16181d', '--bg-2': '#1c1f26', '--panel': '#20242c', '--panel-2': '#2a2f39',
      '--input-bg': '#14171c', '--txt': '#e7ecf3', '--muted': '#8d97a7',
      '--accent': '#3d9bff', '--accent-2': '#2a6fd1', '--accent-3': '#9fd0ff',
      '--on-accent': '#04101f', '--line': 'rgba(200,215,235,.08)', '--line-strong': 'rgba(200,215,235,.16)',
      '--radius-card': '4px', '--radius-sheet': '8px',
      '--brand-font': '"Segoe UI Variable", "Segoe UI", system-ui, sans-serif'
    }
  },
  {
    id: 'lb-lista',
    name: 'LaunchBox — Lista',
    console: 'LaunchBox',
    year: 2016,
    brand: 'Arcade',
    descricao: 'Área de trabalho em tabela: ordene por título, plataforma, tempo jogado, última vez ou nota.',
    swatch: ['#1a1d22', '#4cc38a', '#e7ecf3'],
    dashboard: 'lb-lista',
    vars: {
      '--bg': '#15171b', '--bg-2': '#1a1d22', '--panel': '#1f2329', '--panel-2': '#282d35',
      '--input-bg': '#13161a', '--txt': '#e6ebf1', '--muted': '#8b95a3',
      '--accent': '#4cc38a', '--accent-2': '#2f8f62', '--accent-3': '#a6ecc8',
      '--on-accent': '#04170d', '--line': 'rgba(200,215,235,.08)', '--line-strong': 'rgba(200,215,235,.16)',
      '--radius-card': '4px', '--radius-sheet': '8px',
      '--brand-font': '"Segoe UI Variable", "Segoe UI", system-ui, sans-serif'
    }
  },
  {
    id: 'lb-claro',
    name: 'LaunchBox — Claro',
    console: 'LaunchBox',
    year: 2016,
    brand: 'Arcade',
    descricao: 'A área de trabalho em tema claro, para usar de dia.',
    swatch: ['#eef1f5', '#1f6fd6', '#1a1f29'],
    dashboard: 'lb-caixas',
    vars: {
      '--bg': '#e9edf2', '--bg-2': '#f3f5f8', '--panel': '#ffffff', '--panel-2': '#f0f3f7',
      '--input-bg': '#ffffff', '--txt': '#1a1f29', '--muted': '#5d6878',
      '--accent': '#1f6fd6', '--accent-2': '#5aa0f2', '--accent-3': '#0b3d82',
      '--on-accent': '#ffffff', '--line': 'rgba(20,40,70,.1)', '--line-strong': 'rgba(20,40,70,.2)',
      '--radius-card': '4px', '--radius-sheet': '8px',
      '--brand-font': '"Segoe UI Variable", "Segoe UI", system-ui, sans-serif'
    }
  },
  {
    id: 'lb-meianoite',
    name: 'LaunchBox — Meia-noite',
    console: 'LaunchBox',
    year: 2016,
    brand: 'Arcade',
    descricao: 'Preto total (bom em tela OLED) com destaque verde-água.',
    swatch: ['#000000', '#19d3c5', '#d9fffb'],
    dashboard: 'lb-caixas',
    vars: {
      '--bg': '#000000', '--bg-2': '#050607', '--panel': '#0a0c0d', '--panel-2': '#121517',
      '--input-bg': '#050607', '--txt': '#eef6f5', '--muted': '#7f8f8e',
      '--accent': '#19d3c5', '--accent-2': '#0f8f86', '--accent-3': '#9ff3ec',
      '--on-accent': '#001413', '--line': 'rgba(160,240,230,.08)', '--line-strong': 'rgba(160,240,230,.16)',
      '--radius-card': '3px', '--radius-sheet': '6px'
    }
  },
  {
    id: 'bb-parede',
    name: 'Big Box — Parede',
    console: 'Big Box',
    year: 2016,
    brand: 'Arcade',
    descricao: 'Modo TV: mural de capas em três fileiras sobre o vídeo do jogo selecionado.',
    swatch: ['#070b16', '#4fb3ff', '#ffffff'],
    dashboard: 'bb-parede',
    vars: {
      '--bg': '#060912', '--bg-2': '#0a0f1c', '--panel': 'rgba(12,18,32,.78)', '--panel-2': 'rgba(20,28,48,.86)',
      '--input-bg': '#0a0f1c', '--txt': '#f3f7ff', '--muted': '#93a3c2',
      '--accent': '#4fb3ff', '--accent-2': '#2a6fd1', '--accent-3': '#c9e7ff',
      '--on-accent': '#03101e', '--line': 'rgba(150,190,255,.12)', '--line-strong': 'rgba(150,190,255,.24)',
      '--radius-card': '6px', '--radius-sheet': '10px'
    }
  },
  {
    id: 'bb-roda',
    name: 'Big Box — Roda vertical',
    console: 'Big Box',
    year: 2016,
    brand: 'Arcade',
    descricao: 'Modo TV: roda de títulos à direita, vídeo grande e ficha à esquerda.',
    swatch: ['#0b0b10', '#ffb400', '#fff6dc'],
    dashboard: 'bb-roda',
    vars: {
      '--bg': '#09090d', '--bg-2': '#0f0f15', '--panel': 'rgba(18,18,26,.8)', '--panel-2': 'rgba(28,28,40,.88)',
      '--input-bg': '#0f0f15', '--txt': '#f7f5ee', '--muted': '#a39e8f',
      '--accent': '#ffb400', '--accent-2': '#ff7a00', '--accent-3': '#fff0c2',
      '--on-accent': '#1a1000', '--line': 'rgba(255,220,150,.12)', '--line-strong': 'rgba(255,220,150,.24)',
      '--radius-card': '6px', '--radius-sheet': '10px'
    }
  },
  {
    id: 'bb-texto',
    name: 'Big Box — Lista com detalhes',
    console: 'Big Box',
    year: 2016,
    brand: 'Arcade',
    descricao: 'Modo TV: lista de títulos à esquerda, vídeo e ficha completa à direita.',
    swatch: ['#0e1216', '#ff5a5f', '#ffe3e4'],
    dashboard: 'bb-texto',
    vars: {
      '--bg': '#0c0f13', '--bg-2': '#11161b', '--panel': 'rgba(18,24,30,.82)', '--panel-2': 'rgba(26,34,42,.9)',
      '--input-bg': '#11161b', '--txt': '#f2f5f8', '--muted': '#98a3ad',
      '--accent': '#ff5a5f', '--accent-2': '#c9363b', '--accent-3': '#ffd0d2',
      '--on-accent': '#1c0304', '--line': 'rgba(255,190,190,.1)', '--line-strong': 'rgba(255,190,190,.2)',
      '--radius-card': '4px', '--radius-sheet': '8px'
    }
  },
  {
    id: 'bb-colorido',
    name: 'Big Box — Colorido',
    console: 'Big Box',
    year: 2016,
    brand: 'Arcade',
    descricao: 'Modo TV em parede, com cor própria para cada plataforma: a tela muda de cor ao trocar.',
    swatch: ['#1a0f2e', '#ff4fa3', '#4fd1ff'],
    dashboard: 'bb-parede',
    colorido: true,
    vars: {
      '--bg': '#0d0a18', '--bg-2': '#140f24', '--panel': 'rgba(22,16,40,.78)', '--panel-2': 'rgba(32,24,58,.86)',
      '--input-bg': '#140f24', '--txt': '#fbf8ff', '--muted': '#a99fc4',
      '--accent': '#ff4fa3', '--accent-2': '#4fd1ff', '--accent-3': '#ffe0f0',
      '--on-accent': '#1d0212', '--line': 'rgba(230,200,255,.12)', '--line-strong': 'rgba(230,200,255,.24)',
      '--radius-card': '8px', '--radius-sheet': '12px'
    }
  },
  /* ---------------- padrão ---------------- */
  {
    id: 'neon',
    name: 'Neon (padrão)',
    console: 'Arcade Hub',
    year: 2024,
    brand: 'ARCADE',
    swatch: ['#0a0c11', '#22d3ee', '#6366f1'],
    vars: {
      '--bg': '#0a0c11', '--bg-2': '#0e1118', '--panel': '#12161f', '--panel-2': '#171c27',
      '--input-bg': '#0c1017', '--txt': '#e9edf6', '--muted': '#8792a8',
      '--accent': '#22d3ee', '--accent-2': '#6366f1', '--accent-3': '#f472b6',
      '--on-accent': '#051018'
    }
  },

  /* ================= NINTENDO ================= */
  {
    id: 'nes',
    name: 'NES',
    console: 'Nintendo Entertainment System',
    year: 1985,
    brand: 'NES',
    swatch: ['#1a1a1a', '#e60012', '#8b8b8b'],
    scanline: true,
    vars: {
      '--bg': '#101010', '--bg-2': '#161616', '--panel': '#1c1c1c', '--panel-2': '#242424',
      '--input-bg': '#121212', '--txt': '#f2f2f2', '--muted': '#a8a8a8',
      '--accent': '#e60012', '--accent-2': '#8b8b8b', '--accent-3': '#f5c518',
      '--on-accent': '#ffffff', '--line': 'rgba(255,255,255,.09)', '--line-strong': 'rgba(255,255,255,.18)',
      '--radius-card': '4px', '--radius-sheet': '6px'
    }
  },
  {
    id: 'snes',
    name: 'Super Nintendo',
    console: 'Super NES',
    year: 1990,
    brand: 'SNES',
    swatch: ['#d6d3cd', '#4b3f9e', '#e4032e'],
    vars: {
      '--bg': '#e4e1da', '--bg-2': '#d8d4cc', '--panel': '#f4f2ee', '--panel-2': '#e9e5dd',
      '--input-bg': '#fbfaf8', '--txt': '#2b2733', '--muted': '#6b6577',
      '--accent': '#4b3f9e', '--accent-2': '#e4032e', '--accent-3': '#f2a900',
      '--on-accent': '#ffffff',
      '--line': 'rgba(43,39,51,.12)', '--line-strong': 'rgba(43,39,51,.22)',
      '--radius-card': '8px',
      '--shadow': '0 18px 34px -20px rgba(43,39,51,.45)'
    }
  },
  {
    id: 'n64',
    name: 'Nintendo 64',
    console: 'Nintendo 64',
    year: 1996,
    brand: 'N64',
    swatch: ['#1c1c1c', '#0a6cc4', '#f7c600'],
    vars: {
      '--bg': '#141414', '--bg-2': '#1b1b1b', '--panel': '#222222', '--panel-2': '#2b2b2b',
      '--input-bg': '#171717', '--txt': '#f6f6f6', '--muted': '#a0a0a0',
      '--accent': '#0a6cc4', '--accent-2': '#f7c600', '--accent-3': '#48c78e',
      '--on-accent': '#ffffff',
      '--radius-card': '10px'
    }
  },
  {
    id: 'gamecube',
    name: 'GameCube',
    console: 'Nintendo GameCube',
    year: 2001,
    brand: 'GAMECUBE',
    swatch: ['#2c2f7a', '#a97fe0', '#c9a227'],
    vars: {
      '--bg': '#1d1f4d', '--bg-2': '#23265c', '--panel': '#2b2f70', '--panel-2': '#343879',
      '--input-bg': '#1f2255', '--txt': '#f4f1ff', '--muted': '#b6b0e0',
      '--accent': '#a97fe0', '--accent-2': '#c9a227', '--accent-3': '#6fd3ff',
      '--on-accent': '#1d1f4d',
      '--line': 'rgba(255,255,255,.12)', '--line-strong': 'rgba(255,255,255,.22)',
      '--radius-card': '16px', '--radius-sheet': '20px'
    }
  },
  {
    id: 'gba',
    name: 'Game Boy Advance',
    console: 'Game Boy Advance',
    year: 2001,
    brand: 'GBA',
    swatch: ['#2b2b6b', '#7b68ee', '#c8c8e8'],
    vars: {
      '--bg': '#242158', '--bg-2': '#2a2765', '--panel': '#332f77', '--panel-2': '#3c3885',
      '--input-bg': '#282560', '--txt': '#f1f0ff', '--muted': '#b3aee6',
      '--accent': '#7b68ee', '--accent-2': '#c8c8e8', '--accent-3': '#62d0ff',
      '--on-accent': '#211e4d',
      '--radius-card': '14px'
    }
  },
  {
    id: 'gbc',
    name: 'Game Boy Color',
    console: 'Game Boy Color',
    year: 1998,
    brand: 'GBC',
    swatch: ['#8a2be2', '#ffd700', '#00c2a8'],
    vars: {
      '--bg': '#2b0f4a', '--bg-2': '#361359', '--panel': '#431a6b', '--panel-2': '#4f2079',
      '--input-bg': '#31125a', '--txt': '#fff8e7', '--muted': '#c4a9de',
      '--accent': '#ffd700', '--accent-2': '#00c2a8', '--accent-3': '#ff6ec7',
      '--on-accent': '#2b0f4a',
      '--radius-card': '12px'
    }
  },
  {
    id: 'gameboy',
    name: 'Game Boy (DMG)',
    console: 'Game Boy',
    year: 1989,
    brand: 'GAME BOY',
    swatch: ['#8bac0f', '#306230', '#9bbc0f'],
    scanline: true,
    mono: true,
    vars: {
      '--bg': '#0f380f', '--bg-2': '#134413', '--panel': '#1b4d1b', '--panel-2': '#226122',
      '--input-bg': '#123c12', '--txt': '#d7f5a1', '--muted': '#9bbc6f',
      '--accent': '#9bbc0f', '--accent-2': '#8bac0f', '--accent-3': '#c4d94a',
      '--on-accent': '#0f380f',
      '--line': 'rgba(155,188,15,.18)', '--line-strong': 'rgba(155,188,15,.34)',
      '--radius-card': '6px', '--radius-sheet': '8px'
    }
  },
  {
    id: 'ds',
    name: 'Nintendo DS',
    console: 'Nintendo DS',
    year: 2004,
    brand: 'NDS',
    swatch: ['#d9dde3', '#ff2d55', '#0b7fd4'],
    vars: {
      '--bg': '#cfd5dd', '--bg-2': '#c3cad3', '--panel': '#e8ecf1', '--panel-2': '#dbe1e8',
      '--input-bg': '#f6f8fa', '--txt': '#20242b', '--muted': '#5f6772',
      '--accent': '#0b7fd4', '--accent-2': '#ff2d55', '--accent-3': '#22c55e',
      '--on-accent': '#ffffff',
      '--line': 'rgba(32,36,43,.12)', '--line-strong': 'rgba(32,36,43,.22)',
      '--radius-card': '10px'
    }
  },
  {
    id: '3ds',
    name: 'Nintendo 3DS',
    console: 'Nintendo 3DS',
    year: 2011,
    brand: '3DS',
    swatch: ['#0d1b2a', '#e4000f', '#00a2e8'],
    vars: {
      '--bg': '#0d1b2a', '--bg-2': '#12263a', '--panel': '#172d44', '--panel-2': '#1e3a56',
      '--input-bg': '#11243a', '--txt': '#eef4fb', '--muted': '#96b0c9',
      '--accent': '#e4000f', '--accent-2': '#00a2e8', '--accent-3': '#ffd166',
      '--on-accent': '#ffffff',
      '--radius-card': '12px'
    }
  },
  {
    id: 'switch',
    name: 'Nintendo Switch',
    console: 'Nintendo Switch',
    year: 2017,
    brand: 'SWITCH',
    swatch: ['#1a1a1a', '#e60012', '#00c3e3'],
    vars: {
      '--bg': '#1c1c1c', '--bg-2': '#232323', '--panel': '#2a2a2a', '--panel-2': '#333333',
      '--input-bg': '#202020', '--txt': '#f5f5f5', '--muted': '#a3a3a3',
      '--accent': '#e60012', '--accent-2': '#00c3e3', '--accent-3': '#ff7a00',
      '--on-accent': '#ffffff',
      '--radius-card': '14px'
    }
  },
  {
    id: 'wii',
    name: 'Wii',
    console: 'Nintendo Wii',
    year: 2006,
    brand: 'WII',
    swatch: ['#e9eef2', '#00a0e9', '#7fc9f2'],
    vars: {
      '--bg': '#dfe7ee', '--bg-2': '#d3dde6', '--panel': '#f1f6fa', '--panel-2': '#e3ebf2',
      '--input-bg': '#fbfdfe', '--txt': '#1d2b38', '--muted': '#5b6b7a',
      '--accent': '#00a0e9', '--accent-2': '#8fd6f7', '--accent-3': '#7ed321',
      '--on-accent': '#ffffff',
      '--line': 'rgba(29,43,56,.12)', '--line-strong': 'rgba(29,43,56,.2)',
      '--radius-card': '20px', '--radius-sheet': '22px'
    }
  },
  {
    id: 'wiiu',
    name: 'Wii U',
    console: 'Nintendo Wii U',
    year: 2012,
    brand: 'WII U',
    swatch: ['#1b2a38', '#00b2e3', '#f5a623'],
    vars: {
      '--bg': '#16232f', '--bg-2': '#1c2d3c', '--panel': '#22384a', '--panel-2': '#2a4459',
      '--input-bg': '#1a2a39', '--txt': '#eaf6fc', '--muted': '#93b2c7',
      '--accent': '#00b2e3', '--accent-2': '#f5a623', '--accent-3': '#8bd450',
      '--on-accent': '#08222e',
      '--radius-card': '14px'
    }
  },

  /* ================= PLAYSTATION ================= */
  {
    id: 'ps1',
    name: 'PlayStation',
    console: 'PlayStation (PSone)',
    year: 1994,
    brand: 'PS',
    swatch: ['#2b2b2b', '#d8d8d8', '#0f4bd8'],
    vars: {
      '--bg': '#232323', '--bg-2': '#2b2b2b', '--panel': '#343434', '--panel-2': '#3d3d3d',
      '--input-bg': '#282828', '--txt': '#f0f0f0', '--muted': '#a6a6a6',
      '--accent': '#d8d8d8', '--accent-2': '#0f4bd8', '--accent-3': '#e8352e',
      '--on-accent': '#1a1a1a',
      '--radius-card': '3px', '--radius-sheet': '4px'
    }
  },
  {
    id: 'ps2',
    name: 'PlayStation 2',
    console: 'PlayStation 2',
    year: 2000,
    brand: 'PS2',
    swatch: ['#0b1f5c', '#1a3a9e', '#4fc3f7'],
    vars: {
      '--bg': '#0b1230', '--bg-2': '#101a45', '--panel': '#15224f', '--panel-2': '#1b2c62',
      '--input-bg': '#0f1838', '--txt': '#eaf0ff', '--muted': '#9aabcf',
      '--accent': '#4fc3f7', '--accent-2': '#1a3a9e', '--accent-3': '#00d0c0',
      '--on-accent': '#06122e',
      '--radius-card': '8px'
    }
  },
  {
    id: 'ps3',
    name: 'PlayStation 3',
    console: 'PlayStation 3',
    year: 2006,
    brand: 'PS3',
    swatch: ['#0d0d0d', '#c8c8c8', '#f5b301'],
    vars: {
      '--bg': '#0d0d0d', '--bg-2': '#141414', '--panel': '#1b1b1b', '--panel-2': '#242424',
      '--input-bg': '#111111', '--txt': '#f2f2f2', '--muted': '#a0a0a0',
      '--accent': '#c8c8c8', '--accent-2': '#f5b301', '--accent-3': '#6f7fa0',
      '--on-accent': '#101010',
      '--radius-card': '9px'
    }
  },
  {
    id: 'ps4',
    name: 'PlayStation 4',
    console: 'PlayStation 4',
    year: 2013,
    brand: 'PS4',
    swatch: ['#0b1a3a', '#1f6feb', '#2ecc71'],
    vars: {
      '--bg': '#0b1a3a', '--bg-2': '#122650', '--panel': '#16305f', '--panel-2': '#1d3b74',
      '--input-bg': '#0f2449', '--txt': '#eaf1fb', '--muted': '#9bb0cf',
      '--accent': '#1f6feb', '--accent-2': '#2ecc71', '--accent-3': '#ff2d55',
      '--on-accent': '#ffffff',
      '--radius-card': '12px'
    }
  },
  {
    id: 'ps5',
    name: 'PlayStation 5',
    console: 'PlayStation 5',
    year: 2020,
    brand: 'PS5',
    swatch: ['#f2f4f7', '#0b3d91', '#00a8e8'],
    vars: {
      '--bg': '#e9ecf2', '--bg-2': '#dfe4ec', '--panel': '#f7f9fc', '--panel-2': '#eaeef5',
      '--input-bg': '#ffffff', '--txt': '#111827', '--muted': '#5b6577',
      '--accent': '#0b3d91', '--accent-2': '#00a8e8', '--accent-3': '#4b5563',
      '--on-accent': '#ffffff',
      '--line': 'rgba(17,24,39,.11)', '--line-strong': 'rgba(17,24,39,.2)',
      '--radius-card': '16px', '--radius-sheet': '18px',
      '--shadow': '0 18px 34px -22px rgba(17,24,39,.35)'
    }
  },
  {
    id: 'psp',
    name: 'PlayStation Portable',
    console: 'PSP',
    year: 2005,
    brand: 'PSP',
    swatch: ['#101010', '#8e8e8e', '#7cc6ff'],
    vars: {
      '--bg': '#101010', '--bg-2': '#171717', '--panel': '#1e1e1e', '--panel-2': '#272727',
      '--input-bg': '#141414', '--txt': '#f0f0f0', '--muted': '#9d9d9d',
      '--accent': '#7cc6ff', '--accent-2': '#8e8e8e', '--accent-3': '#2b2b2b',
      '--on-accent': '#08151f',
      '--radius-card': '10px'
    }
  },
  {
    id: 'vita',
    name: 'PS Vita',
    console: 'PlayStation Vita',
    year: 2011,
    brand: 'VITA',
    swatch: ['#14142b', '#3b82f6', '#f43f5e'],
    vars: {
      '--bg': '#14142b', '--bg-2': '#1a1a38', '--panel': '#212147', '--panel-2': '#292958',
      '--input-bg': '#171733', '--txt': '#f1f1ff', '--muted': '#a3a3cc',
      '--accent': '#3b82f6', '--accent-2': '#f43f5e', '--accent-3': '#22d3ee',
      '--on-accent': '#ffffff',
      '--radius-card': '13px'
    }
  },

  /* ================= XBOX ================= */
  {
    id: 'xbox',
    name: 'Xbox (clássico)',
    console: 'Xbox',
    year: 2001,
    brand: 'XBOX',
    swatch: ['#0b0f0d', '#6cbb3c', '#1d6d2e'],
    vars: {
      '--bg': '#0b0f0d', '--bg-2': '#111713', '--panel': '#16201a', '--panel-2': '#1d2a22',
      '--input-bg': '#10171400', '--txt': '#eaf7ec', '--muted': '#9bb3a3',
      '--accent': '#6cbb3c', '--accent-2': '#1d6d2e', '--accent-3': '#b6ff5c',
      '--on-accent': '#06140a'
    }
  },
  {
    id: 'xbox360',
    name: 'Xbox 360',
    console: 'Xbox 360',
    year: 2005,
    brand: 'XBOX 360',
    swatch: ['#f0f3f0', '#7cbb00', '#4a4a4a'],
    vars: {
      '--bg': '#e4e9e4', '--bg-2': '#d9e0d9', '--panel': '#f3f6f3', '--panel-2': '#e6ebe6',
      '--input-bg': '#fbfdfb', '--txt': '#1e2620', '--muted': '#5f6b62',
      '--accent': '#7cbb00', '--accent-2': '#2f7d32', '--accent-3': '#f2b70a',
      '--on-accent': '#ffffff',
      '--line': 'rgba(30,38,32,.12)', '--line-strong': 'rgba(30,38,32,.22)',
      '--radius-card': '11px'
    }
  },
  {
    id: 'xboxone',
    name: 'Xbox One / Series',
    console: 'Xbox One & Series X|S',
    year: 2013,
    brand: 'XBOX',
    swatch: ['#101214', '#107c10', '#52b043'],
    vars: {
      '--bg': '#101214', '--bg-2': '#16191c', '--panel': '#1c2024', '--panel-2': '#242a2f',
      '--input-bg': '#141719', '--txt': '#f0f3f5', '--muted': '#9aa5ad',
      '--accent': '#107c10', '--accent-2': '#52b043', '--accent-3': '#00b7c3',
      '--on-accent': '#ffffff',
      '--radius-card': '12px'
    }
  },

  /* ================= BÔNUS: outros clássicos ================= */
  {
    id: 'mastersystem',
    name: 'Master System / Mega Drive',
    console: 'Sega',
    year: 1987,
    brand: 'SEGA',
    swatch: ['#0b0b0b', '#0f52ba', '#e8232a'],
    vars: {
      '--bg': '#0b0b0b', '--bg-2': '#121212', '--panel': '#181818', '--panel-2': '#202020',
      '--input-bg': '#0f0f0f', '--txt': '#f2f2f2', '--muted': '#a1a1a1',
      '--accent': '#0f52ba', '--accent-2': '#e8232a', '--accent-3': '#f7c600',
      '--on-accent': '#ffffff',
      '--radius-card': '6px'
    }
  },
  {
    id: 'dreamcast',
    name: 'Dreamcast',
    console: 'Sega Dreamcast',
    year: 1998,
    brand: 'DREAMCAST',
    swatch: ['#f4f1ea', '#ff6a13', '#1b1b1b'],
    vars: {
      '--bg': '#eae6dd', '--bg-2': '#e0dbd0', '--panel': '#f7f4ee', '--panel-2': '#ebe6dc',
      '--input-bg': '#fdfbf7', '--txt': '#1b1b1b', '--muted': '#6b6459',
      '--accent': '#ff6a13', '--accent-2': '#1b1b1b', '--accent-3': '#00a3ad',
      '--on-accent': '#ffffff',
      '--line': 'rgba(27,27,27,.12)', '--line-strong': 'rgba(27,27,27,.22)',
      '--radius-card': '14px'
    }
  },
  {
    id: 'atari',
    name: 'Atari 2600',
    console: 'Atari 2600',
    year: 1977,
    brand: 'ATARI',
    swatch: ['#1b1207', '#e8a317', '#8b3a0f'],
    scanline: true,
    vars: {
      '--bg': '#1b1207', '--bg-2': '#241a0c', '--panel': '#2e2211', '--panel-2': '#392b17',
      '--input-bg': '#221808', '--txt': '#f7e9c9', '--muted': '#c0a979',
      '--accent': '#e8a317', '--accent-2': '#8b3a0f', '--accent-3': '#c8d94a',
      '--on-accent': '#1b1207',
      '--radius-card': '4px'
    }
  },
  {
    id: 'arcade',
    name: 'Fliperama (CRT)',
    console: 'Arcade',
    year: 1980,
    brand: 'ARCADE',
    swatch: ['#050505', '#ff2d95', '#00e5ff'],
    scanline: true,
    vars: {
      '--bg': '#050505', '--bg-2': '#0b0b0b', '--panel': '#121212', '--panel-2': '#1a1a1a',
      '--input-bg': '#0a0a0a', '--txt': '#f4f4f4', '--muted': '#9b9b9b',
      '--accent': '#ff2d95', '--accent-2': '#00e5ff', '--accent-3': '#f7ff00',
      '--on-accent': '#0a0010'
    }
  }
];

/** Aplica um skin na interface (variáveis CSS + scanlines). */
function applySkin(id) {
  const skin = SKINS.find(s => s.id === id) || SKINS[0];
  const root = document.documentElement;
  // limpa variáveis de skins anteriores
  const prev = root.dataset.skinVars ? root.dataset.skinVars.split(',') : [];
  prev.forEach(v => v && root.style.removeProperty(v));
  const vars = Object.keys(skin.vars || {});
  vars.forEach(v => root.style.setProperty(v, skin.vars[v]));
  root.dataset.skinVars = vars.join(',');
  root.dataset.skin = skin.id;
  window.__skinAplicada = skin.id;      // fonte da verdade do que está na tela
  // scanlines de CRT
  root.style.setProperty('--scanline', skin.scanline
    ? 'repeating-linear-gradient(0deg, rgba(0,0,0,.22) 0px, rgba(0,0,0,.22) 1px, transparent 1px, transparent 3px)'
    : 'transparent');
  document.body.classList.toggle('skin-mono', !!skin.mono);
  document.body.classList.toggle('skin-retro', !!skin.scanline);

  // papel de parede do tema (arte original, sem depender de rede)
  root.style.setProperty('--tema-art', skin.art ? `url("${skin.art}")` : 'none');
  document.body.dataset.dashboard = skin.dashboard || '';
  // avisa quem cuida do layout (app.js) que o tema mudou
  window.dispatchEvent(new CustomEvent('tema:change', { detail: { skin } }));
  return skin;
}

/* expõe para o app.js e para os testes */
if (typeof window !== 'undefined') {
  window.SKINS = SKINS;
  window.applySkin = applySkin;
}
if (typeof module !== 'undefined' && module.exports) module.exports = { SKINS, applySkin };
