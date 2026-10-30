// Entornos de Halloween: cada sección del concurso tiene el suyo para que se distingan.
// La tele los pinta con WebGL (host/fx/backdrop.js); los móviles usan un degradado CSS con los mismos colores.
//
// Parámetros del shader:
//   sil  — silueta: 0 nada, 1 tumbas, 2 árboles, 3 castillo, 4 telaraña, 5 calabazas, 6 colinas, 7 cripta,
//          8 laboratorio (matraces), 9 caldero, 10 árbol solitario, 11 plató (focos y suelo de luz)
//   part — partículas: 0 nada, 1 luciérnagas, 2 brasas, 3 burbujas, 4 lluvia, 5 chispas, 6 polvo/escarcha
//   colores RGB 0..1: top/bot (cielo), fog (niebla), glow (luna, ventanas, resplandor del horizonte), part (partículas)

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);

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
    moon: 1,
    sil: 6,
    particles: 1,
    bats: 0,
    lightning: 0,
    horizon: 0.55,
    decor: ['🍉', '🍉', '🌞', '🍹', '🍉', '🏖️', '🍉', '🕶️'],
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
    decor: ['💪', '🏋️', '🔥', '⏱️', '💪', '🏆', '🥵', '🏋️'],
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
// (los de temática —discoteca, luna llena, verano, galletas, refrescos, gimnasio— solo si la hoja los elige)
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
