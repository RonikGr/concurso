// Entornos de Halloween: cada sección del concurso tiene el suyo para que se distingan.
// La tele los pinta con WebGL (host/fx/backdrop.js); los móviles usan un degradado CSS con los mismos colores.
//
// Parámetros del shader:
//   sil  — silueta: 0 nada, 1 tumbas, 2 árboles, 3 castillo, 4 telaraña, 5 calabazas, 6 colinas, 7 cripta,
//          8 laboratorio (matraces), 9 caldero, 10 árbol solitario, 11 plató (focos y suelo de luz), 12 gimnasio,
//          13 relojería, 14 globos, 15 coctelería, 16 karaoke, 17 oeste, 18 noche latina, 19 interrogatorio, 20 casino
//   moon — luna con cráteres (0/1); sun — sol sin cráteres con halo cálido (0/1; temáticas de día)
//   part — partículas: 0 nada, 1 luciérnagas, 2 brasas, 3 burbujas, 4 lluvia, 5 chispas, 6 polvo/escarcha
//   colores RGB 0..1: top/bot (cielo), fog (niebla), glow (luna, ventanas, resplandor del horizonte), part (partículas)
//
// `ui` (solo las temáticas; los de Halloween no lo llevan y usan los valores de shared/base.css): la piel de la tele
//   accent, accent2 — color de los rótulos grandes y de los detalles; kicker — «Sección n de N · …»;
//   titleGlow — color del brillo de los títulos; display — 'outfit' (Outfit 900) o 'halloween' (Creepster);
//   veil — velo detrás del texto (entornos claros); confetti — 'money' o {glyphs, paper} (sin caras emoji).
//   applyEnvUi() lo pone como variables CSS.

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);

// Velos (`ui.veil`) para que el rótulo se lea sobre un cielo claro
const VEIL = 'radial-gradient(60% 55% at 50% 45%, rgb(24 8 20 / 0.5), transparent 75%)';
const VEIL_SOFT = 'radial-gradient(60% 55% at 50% 45%, rgb(10 6 14 / 0.32), transparent 75%)';

export const ENVIRONMENTS = [
  {
    id: 'luna',
    name: 'Noche de luna',
    top: rgb('#1a1036'),
    bot: rgb('#05030c'),
    fog: rgb('#6a5a9a'),
    glow: rgb('#ffe9b8'),
    part: rgb('#ffd27a'),
    fogAmt: 0.35,
    moon: 1,
    sil: 3,
    particles: 0,
    bats: 1,
    lightning: 0,
    horizon: 0.15,
  },
  {
    id: 'cementerio',
    name: 'Cementerio',
    top: rgb('#0d1b24'),
    bot: rgb('#020507'),
    fog: rgb('#7fa6a0'),
    glow: rgb('#d9f2ff'),
    part: rgb('#7fe0ff'),
    fogAmt: 0.75,
    moon: 1,
    sil: 1,
    particles: 1,
    bats: 0,
    lightning: 0,
    horizon: 0.05,
  },
  {
    id: 'bosque',
    name: 'Bosque encantado',
    top: rgb('#0b1d12'),
    bot: rgb('#020604'),
    fog: rgb('#4f8a5a'),
    glow: rgb('#c9ff9a'),
    part: rgb('#d6ff6b'),
    fogAmt: 0.6,
    moon: 0,
    sil: 2,
    particles: 1,
    bats: 1,
    lightning: 0,
    horizon: 0.1,
  },
  {
    id: 'calabazas',
    name: 'Huerto de calabazas',
    top: rgb('#2a0f06'),
    bot: rgb('#070201'),
    fog: rgb('#a1502a'),
    glow: rgb('#ff8a1f'),
    part: rgb('#ffb347'),
    fogAmt: 0.35,
    moon: 1,
    sil: 5,
    particles: 2,
    bats: 1,
    lightning: 0,
    horizon: 0.55,
  },
  {
    id: 'laboratorio',
    name: 'Laboratorio',
    top: rgb('#06210f'),
    bot: rgb('#010603'),
    fog: rgb('#39ff6a'),
    glow: rgb('#7dff6b'),
    part: rgb('#a6ff7a'),
    fogAmt: 0.55,
    moon: 0,
    sil: 8,
    particles: 3,
    bats: 0,
    lightning: 0,
    horizon: 0.45,
  },
  {
    id: 'mansion',
    name: 'Mansión encantada',
    top: rgb('#1b0f2e'),
    bot: rgb('#040209'),
    fog: rgb('#5d4d80'),
    glow: rgb('#ffcf6b'),
    part: rgb('#9fb4ff'),
    fogAmt: 0.45,
    moon: 0,
    sil: 3,
    particles: 4,
    bats: 1,
    lightning: 1,
    horizon: 0.1,
  },
  {
    id: 'telarana',
    name: 'Telaraña',
    top: rgb('#1e1a26'),
    bot: rgb('#050407'),
    fog: rgb('#8c8299'),
    glow: rgb('#e8e2f5'),
    part: rgb('#d9d2e8'),
    fogAmt: 0.4,
    moon: 1,
    sil: 4,
    particles: 6,
    bats: 0,
    lightning: 0,
    horizon: 0.05,
  },
  {
    id: 'aquelarre',
    name: 'Aquelarre',
    top: rgb('#2a0508'),
    bot: rgb('#060102'),
    fog: rgb('#a0202a'),
    glow: rgb('#ff4a1f'),
    part: rgb('#ffb12e'),
    fogAmt: 0.4,
    moon: 1,
    sil: 9,
    particles: 5,
    bats: 1,
    lightning: 0,
    horizon: 0.9,
  },
  {
    id: 'cripta',
    name: 'Cripta helada',
    top: rgb('#0a1a33'),
    bot: rgb('#02050c'),
    fog: rgb('#7ab4ff'),
    glow: rgb('#bfe3ff'),
    part: rgb('#e3f3ff'),
    fogAmt: 0.5,
    moon: 0,
    sil: 7,
    particles: 6,
    bats: 0,
    lightning: 0,
    horizon: 0.25,
  },
  {
    id: 'tormenta',
    name: 'Tormenta',
    top: rgb('#141a24'),
    bot: rgb('#030406'),
    fog: rgb('#6b7a8f'),
    glow: rgb('#dfe8ff'),
    part: rgb('#a9bcd8'),
    fogAmt: 0.85,
    moon: 0,
    sil: 10,
    particles: 4,
    bats: 0,
    lightning: 1,
    horizon: 0.05,
  },
  {
    // Para las secciones de Test: un plató como el de «¿Quién quiere ser millonario?»
    id: 'millonario',
    name: 'Plató millonario',
    top: rgb('#06063a'),
    bot: rgb('#000008'),
    fog: rgb('#2b3cff'),
    glow: rgb('#8fd0ff'),
    part: rgb('#ffd27a'),
    fogAmt: 0.3,
    moon: 0,
    sil: 11,
    particles: 0,
    bats: 0,
    lightning: 0,
    horizon: 0.35,
    ui: { confetti: { glyphs: ['💎', '⭐', '🏆', '💰'], paper: ['#ffd27a', '#8fd0ff', '#2b3cff', '#ffffff', '#ffe9a8'] } },
  },
  {
    // Squid Games: casi negro con resplandor rosa; cada juego pinta encima su decorado (squidStage). Fijo: el fondo
    // no se redibuja si no cambia, y la tele va más sobrada.
    id: 'squid',
    name: 'Squid Games',
    top: rgb('#14070f'),
    bot: rgb('#040306'),
    fog: rgb('#ff2e88'),
    glow: rgb('#2bb39b'),
    part: rgb('#ff2e88'),
    fogAmt: 0.12,
    moon: 0,
    sil: 0,
    particles: 0,
    bats: 0,
    lightning: 0,
    horizon: 0.3,
    still: 1,
    ui: { confetti: { glyphs: ['⭕', '🔺', '🟥'], paper: ['#ff2e88', '#2bb39b', '#f3f3f3', '#ff2e88'] } },
  },
  {
    // Discoteca (el twerking): neones rosa y turquesa, focos y suelo de luz del plató, chispas. Solo si la hoja lo
    // elige en «Entorno»; la tele le añade focos que barren (body.disco-on, show.css).
    id: 'discoteca',
    name: 'Discoteca',
    top: rgb('#2a0638'),
    bot: rgb('#05010a'),
    fog: rgb('#ff2fb4'),
    glow: rgb('#2ef2ff'),
    part: rgb('#ff6be0'),
    fogAmt: 0.35,
    moon: 0,
    sil: 11,
    particles: 5,
    bats: 0,
    lightning: 0,
    horizon: 0.4,
    ui: { accent: '#ff3fc0', accent2: '#2ef2ff', kicker: '#8ff8ff', titleGlow: 'rgb(255 63 192 / 0.6)', display: 'outfit', confetti: { glyphs: ['🪩', '✨', '⭐', '🎶'], paper: ['#ff3fc0', '#2ef2ff', '#ffe14a', '#b78cff', '#ffffff'] } },
  },
  {
    // El pañuelo (lobos contra vampiros): luna llena enorme y rojiza, bosque y murciélagos
    id: 'lunallena',
    name: 'Luna llena',
    top: rgb('#2a0710'),
    bot: rgb('#050104'),
    fog: rgb('#8a1f2e'),
    glow: rgb('#ffb48a'),
    part: rgb('#ff6a4a'),
    fogAmt: 0.5,
    moon: 1,
    sil: 2,
    particles: 2,
    bats: 1,
    lightning: 0,
    horizon: 0.2,
  },
  // Temáticas de pruebas (solo si la hoja las elige en «Entorno»). `decor`: lo que flota por la tele.
  {
    // Watermelon Sugar: atardecer de verano, sol grande y luciérnagas doradas
    id: 'verano',
    name: 'Verano',
    top: rgb('#ff8a5c'),
    bot: rgb('#3a1450'),
    fog: rgb('#ffb37a'),
    glow: rgb('#fff1a0'),
    part: rgb('#ffe08a'),
    fogAmt: 0.25,
    moon: 0,
    sun: 1,
    sil: 6,
    particles: 1,
    bats: 0,
    lightning: 0,
    horizon: 0.55,
    decor: ['🍉', '🍉', '🍹', '🍉', '🏖️', '🍉', '🕶️'], // sin 🌞 (cara emoji): el sol ya lo dibuja el fondo
    ui: { accent: '#ff5a7a', accent2: '#ffe066', kicker: '#4a1030', titleGlow: 'rgb(255 90 122 / 0.6)', display: 'outfit', veil: VEIL, confetti: { glyphs: ['🍉', '🍹', '🏖️', '🕶️', '🍉'], paper: ['#ff5a7a', '#7ed957', '#ffe066', '#ff9f5a', '#ffffff'] } },
  },
  {
    // La galleta: obrador de galletas de chocolate, cálido, con harina en el aire
    id: 'chocolate',
    name: 'Galletas',
    top: rgb('#4a2a17'),
    bot: rgb('#140904'),
    fog: rgb('#9a6a42'),
    glow: rgb('#ffd9a8'),
    part: rgb('#f6e3c6'),
    fogAmt: 0.3,
    moon: 0,
    sil: 0,
    particles: 6,
    bats: 0,
    lightning: 0,
    horizon: 0.5,
    decor: ['🍪', '🍪', '🍫', '🥛', '🍪', '🍪', '🍫'],
    ui: { accent: '#f0a860', accent2: '#ffd9a8', kicker: '#ffe9cc', titleGlow: 'rgb(240 168 96 / 0.5)', display: 'outfit', veil: VEIL_SOFT, confetti: { glyphs: ['🍪', '🍫', '🥛', '🍪'], paper: ['#7a4a2a', '#f0a860', '#ffd9a8', '#f6e3c6', '#3b2414'] } },
  },
  {
    // Botellas en orden: refrescos con burbujas (las siluetas de matraces parecen botellas)
    id: 'refrescos',
    name: 'Refrescos',
    top: rgb('#0b3a5e'),
    bot: rgb('#02101c'),
    fog: rgb('#2fd3ff'),
    glow: rgb('#b8ffef'),
    part: rgb('#d8fbff'),
    fogAmt: 0.35,
    moon: 0,
    sil: 8,
    particles: 3,
    bats: 0,
    lightning: 0,
    horizon: 0.45,
    decor: ['🥤', '🍾', '🧃', '🫧', '🥤', '🍋', '🧊', '🍾'],
    ui: { accent: '#2fd3ff', accent2: '#b8ffef', kicker: '#c8f6ff', titleGlow: 'rgb(47 211 255 / 0.55)', display: 'outfit', confetti: { glyphs: ['🥤', '🧊', '🍋', '🫧'], paper: ['#2fd3ff', '#b8ffef', '#ffe14a', '#ff6b6b', '#ffffff'] } },
  },
  {
    // Fit o Fat: gimnasio de noche, racks con barras, mancuernas y neones; magnesio en el aire
    id: 'gimnasio',
    name: 'Gimnasio',
    top: rgb('#1b2233'),
    bot: rgb('#06070b'),
    fog: rgb('#ff4a2e'),
    glow: rgb('#ffd23f'),
    part: rgb('#8f97ab'),
    fogAmt: 0.2,
    moon: 0,
    sil: 12,
    particles: 6,
    bats: 0,
    lightning: 0,
    horizon: 0.35,
    decor: ['💪', '🏋️', '🔥', '⏱️', '💪', '🏆', '🥇', '🏋️'], // sin caras emoji
    ui: { accent: '#ff5a3a', accent2: '#ffd23f', kicker: '#ffd23f', titleGlow: 'rgb(255 90 58 / 0.55)', display: 'outfit', veil: VEIL_SOFT, confetti: { glyphs: ['💪', '🏆', '🏋️', '🔥'], paper: ['#ff5a3a', '#ffd23f', '#8f97ab', '#ffffff'] } },
  },
  {
    // Reloj interno: relojería antigua, latón y madera, con polvo dorado en el aire
    id: 'relojeria',
    name: 'Relojería',
    top: rgb('#2b1d12'),
    bot: rgb('#0b0705'),
    fog: rgb('#c9a46a'),
    glow: rgb('#ffcf7a'),
    part: rgb('#c9a46a'),
    fogAmt: 0.22,
    moon: 0,
    sil: 13,
    particles: 6,
    bats: 0,
    lightning: 0,
    horizon: 0.3,
    decor: ['⏳', '🔑', '🔔', '⌛', '🔑', '⏳'], // los relojes y engranajes ya los dibuja la silueta
    ui: { accent: '#ffcf7a', accent2: '#e8c48a', kicker: '#f3dcae', titleGlow: 'rgb(255 190 90 / 0.5)', display: 'outfit', confetti: { glyphs: ['⏰', '⌛', '⚙️', '🕰️'], paper: ['#c9a46a', '#ffcf7a', '#8a5a2b', '#f3dcae'] } },
  },
  {
    // Guerra de globos: globos rojos y azules (los equipos) que suben y explotan, en una noche de feria
    id: 'globos',
    name: 'Globos',
    top: rgb('#35206a'),
    bot: rgb('#0c0720'),
    fog: rgb('#ff6fb5'),
    glow: rgb('#ffe38a'),
    part: rgb('#ffd23f'),
    fogAmt: 0.18,
    moon: 0,
    sil: 14,
    particles: 5,
    bats: 0,
    lightning: 0,
    horizon: 0.4,
    decor: ['💥', '📌', '🎉', '🎊', '📌', '💥'], // los globos ya los dibuja la silueta
    ui: { accent: '#ff6fb5', accent2: '#ffe38a', kicker: '#ffe38a', titleGlow: 'rgb(255 111 181 / 0.55)', display: 'outfit', veil: VEIL_SOFT, confetti: { glyphs: ['🎈', '🎉', '🎈', '✨'], paper: ['#ff6fb5', '#ffe38a', '#7ad7ff', '#b78cff', '#ffffff'] } },
  },
  // Seis temáticas más (Gauntlet, T2): una por sección que no tenía estética propia
  {
    // Agita el móvil: barra de coctelería de noche, estantes de botellas y una coctelera que se agita
    id: 'cocteleria',
    name: 'Coctelería',
    top: rgb('#0d2b33'),
    bot: rgb('#03090c'),
    fog: rgb('#1fb8b0'),
    glow: rgb('#3ff0e0'),
    part: rgb('#c8fffa'),
    fogAmt: 0.18,
    moon: 0,
    sil: 15,
    particles: 3,
    bats: 0,
    lightning: 0,
    horizon: 0.3,
    decor: ['🍸', '🍹', '🧊', '🍋', '🍸', '🧉', '🧊', '🍹'],
    ui: { accent: '#3ff0e0', accent2: '#c8fffa', kicker: '#a8fff6', titleGlow: 'rgb(63 240 224 / 0.55)', display: 'outfit', confetti: { glyphs: ['🍸', '🍹', '🧊', '🍋'], paper: ['#3ff0e0', '#c8fffa', '#ffe14a', '#ff7ab8', '#e8f0f2'] } },
  },
  {
    // ¿Qué canción es?: escenario de karaoke con micro de pie, bafles y ecualizador que baila
    id: 'karaoke',
    name: 'Karaoke',
    top: rgb('#2a0a3d'),
    bot: rgb('#08020f'),
    fog: rgb('#ff3fa4'),
    glow: rgb('#3ff0ff'),
    part: rgb('#ff8fd0'),
    fogAmt: 0.22,
    moon: 0,
    sil: 16,
    particles: 5,
    bats: 0,
    lightning: 0,
    horizon: 0.35,
    decor: ['🎵', '🎶', '🎧', '📻', '💿', '🎶', '🎵'],
    ui: { accent: '#ff3fa4', accent2: '#3ff0ff', kicker: '#a8f8ff', titleGlow: 'rgb(255 63 164 / 0.6)', display: 'outfit', confetti: { glyphs: ['🎵', '🎶', '🎤', '⭐'], paper: ['#ff3fa4', '#3ff0ff', '#ffe14a', '#b78cff', '#ffffff'] } },
  },
  {
    // Reflejos: duelo al sol en el Oeste, atardecer en el desierto, saloon y cactus. Nada verde ni semáforos: la
    // señal buena de Reflejos no puede confundirse con el fondo.
    id: 'oeste',
    name: 'Duelo al sol',
    top: rgb('#a44e2c'),
    bot: rgb('#2a1206'),
    fog: rgb('#c86a3a'),
    glow: rgb('#ffcf7a'),
    part: rgb('#e8b07a'),
    fogAmt: 0.2,
    moon: 0,
    sun: 1,
    sil: 17,
    particles: 6,
    bats: 0,
    lightning: 0,
    horizon: 0.5,
    decor: ['⭐', '🐎', '💥', '🎯', '🪶', '⭐'], // sin 🌵: nada verde (la señal de Reflejos)
    ui: { accent: '#ffcf7a', accent2: '#ffe7b0', kicker: '#fff1d0', titleGlow: 'rgb(255 140 60 / 0.6)', display: 'outfit', veil: VEIL, confetti: { glyphs: ['⭐', '💥', '🐎', '🎯'], paper: ['#ffcf7a', '#e8894a', '#8a4a22', '#fff1d0'] } },
  },
  {
    // Bachata: terraza de noche latina con palmeras y guirnalda de bombillas
    id: 'latina',
    name: 'Noche latina',
    top: rgb('#4a0d1e'),
    bot: rgb('#12030a'),
    fog: rgb('#ff3b5c'),
    glow: rgb('#ffc94a'),
    part: rgb('#ffd98a'),
    fogAmt: 0.22,
    moon: 0,
    sil: 18,
    particles: 1,
    bats: 0,
    lightning: 0,
    horizon: 0.45,
    decor: ['💃', '🌺', '🎺', '🕺', '🪇', '🌺', '🎺'],
    ui: { accent: '#ffc94a', accent2: '#ff7a95', kicker: '#ffd98a', titleGlow: 'rgb(255 80 110 / 0.55)', display: 'outfit', confetti: { glyphs: ['🌺', '🎺', '💃', '🪇'], paper: ['#ffc94a', '#ff7a95', '#ff3b5c', '#ffe9b0', '#ffffff'] } },
  },
  {
    // Dos verdades y una mentira: interrogatorio de cine negro, lámpara colgando sobre la mesa y persiana
    id: 'noir',
    name: 'Interrogatorio',
    top: rgb('#2b2620'),
    bot: rgb('#0a0806'),
    fog: rgb('#8a7a60'),
    glow: rgb('#ffb84a'),
    part: rgb('#d8c8a8'),
    fogAmt: 0.3,
    moon: 0,
    sil: 19,
    particles: 6,
    bats: 0,
    lightning: 0,
    horizon: 0.1,
    decor: ['🔍', '🗝️', '📜', '💼', '🔦', '🔍'],
    ui: { accent: '#ffb84a', accent2: '#e8d6b0', kicker: '#e8d6b0', titleGlow: 'rgb(255 184 74 / 0.5)', display: 'outfit', confetti: { glyphs: ['🔍', '🗝️', '📜', '💼'], paper: ['#ffb84a', '#e8d6b0', '#8a7a60', '#f3ead8'] } },
  },
  {
    // La gran apuesta: casino, tapete verde, lámparas sobre las mesas y una ruleta que gira
    id: 'casino',
    name: 'Casino',
    top: rgb('#0f3a24'),
    bot: rgb('#04110a'),
    fog: rgb('#1f7a4a'),
    glow: rgb('#ffd24a'),
    part: rgb('#ffe9a0'),
    fogAmt: 0.2,
    moon: 0,
    sil: 20,
    particles: 5,
    bats: 0,
    lightning: 0,
    horizon: 0.3,
    decor: ['🎰', '🃏', '🪙', '♠️', '♦️', '🎲'],
    ui: { accent: '#ffd24a', accent2: '#fff0b0', kicker: '#fff0b0', titleGlow: 'rgb(255 210 74 / 0.55)', display: 'outfit', confetti: 'money' },
  },
];

/** Discoteca: con sus focos en la tele (y su música con batería). */
export const DISCO_ENV = 'discoteca';

/** El pañuelo siempre bajo la luna llena (salvo que la hoja diga otro entorno). */
export const HANKY_ENV = 'lunallena';

/** Entorno de preparación, portada y final. */
export const HOME_ENV = 'luna';

/** El Test se juega en el plató millonario (salvo que la hoja diga otro entorno). */
export const TEST_ENV = 'millonario';

/** Squid Games siempre con el suyo. */
export const SQUID_ENV = 'squid';

/** Entornos que se reparten entre las secciones (en este orden). */
// (los de temática —discoteca, luna llena y todos los que llevan `decor`— solo si la hoja los elige)
const SECTION_ENVS = ENVIRONMENTS.filter((e) => ![HOME_ENV, TEST_ENV, SQUID_ENV, DISCO_ENV, HANKY_ENV].includes(e.id) && !e.decor);

const byId = new Map(ENVIRONMENTS.map((e) => [e.id, e]));
export const getEnv = (id) => byId.get(id) ?? byId.get(HOME_ENV);

/** Entorno de una sección: el elegido en la hoja o, si no, uno distinto por posición. */
export function sectionEnv(section, index) {
  if (section?.type === 'squid') return SQUID_ENV;
  if (section?.env && byId.has(section.env)) return section.env;
  if (section?.type === 'test') return TEST_ENV;
  if (section?.type === 'panuelo') return HANKY_ENV;
  return SECTION_ENVS[index % SECTION_ENVS.length].id;
}

/** Degradado CSS del entorno (móviles y mando, donde no compensa WebGL). */
export function envGradient(id) {
  const e = getEnv(id);
  const c = (v, a = 1) => `rgb(${v.map((x) => Math.round(x * 255)).join(' ')} / ${a})`;
  return `radial-gradient(120% 70% at 50% 110%, ${c(e.glow, 0.28)}, transparent 60%), linear-gradient(180deg, ${c(e.top)}, ${c(e.bot)})`;
}

// Variables CSS de la piel de cada temática (`ui`). Las que no ponga la temática quedan con las de shared/base.css.
const UI_VARS = { accent: '--accent', accent2: '--accent-2', kicker: '--kicker', titleGlow: '--title-glow', veil: '--env-veil' };
const OUTFIT_DISPLAY = "'Outfit Variable', system-ui, sans-serif";
const ALL_VARS = [...Object.values(UI_VARS), '--accent-glow', '--display', '--display-weight'];

/**
 * Pone en `el` (por defecto body) la piel del entorno: --accent, --accent-2, --accent-glow, --title-glow, --kicker,
 * --display, --display-weight, --env-veil y `el.dataset.env`. Sin `ui` (Halloween) o sin entorno, quita las
 * variables (vuelven las de base.css). No hace nada si el entorno no cambia.
 */
export function applyEnvUi(envId, el = globalThis.document?.body) {
  if (!el) return;
  const id = envId && byId.has(envId) ? envId : '';
  if (el.dataset.envUi === (id || '-')) return;
  const ui = id ? (byId.get(id).ui ?? {}) : {};
  for (const name of ALL_VARS) el.style.removeProperty(name);
  for (const [key, name] of Object.entries(UI_VARS)) if (ui[key]) el.style.setProperty(name, ui[key]);
  // El brillo se deriva del acento en el propio elemento (con var() se resuelve donde se declara)
  if (ui.accent) el.style.setProperty('--accent-glow', 'color-mix(in srgb, var(--accent) 55%, transparent)');
  if (ui.display === 'outfit') {
    el.style.setProperty('--display', OUTFIT_DISPLAY);
    el.style.setProperty('--display-weight', '900');
  }
  if (id) el.dataset.env = id;
  else delete el.dataset.env;
  el.dataset.envUi = id || '-';
}

/** Confeti del entorno: 'money', {glyphs, paper} o null (= el de Halloween). */
export const envConfetti = (id) => (id && byId.has(id) ? (byId.get(id).ui?.confetti ?? null) : null);
