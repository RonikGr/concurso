// Música del espectáculo, compuesta al vuelo. Hay 8 estilos según el momento del concurso y la tonalidad, escala y
// ambiente cambian con el entorno de la sección, así que no suena siempre lo mismo:
//   lobby    preparación: swing tétrico (contrabajo andando, escobillas, vibráfono)
//   organ    portada e intros: órgano de iglesia con fanfarria de tocata
//   explore  jugando: colchón del entorno + caja de música que improvisa
//   tension  turno abierto / respondiendo: ostinato grave que sube, trémolo y latido
//   suspense esperando el veredicto: redoble de timbales sobre un acorde disonante
//   reveal   revelado: golpe y resolución en mayor, alegre
//   march    marcador: marcha macabra en pizzicato
//   waltz    final: vals de caja de música
// Las melodías son motivos que se repiten y varían cada 8 compases (como una canción), no notas sueltas al azar.
import { bell, brush, hat, held, mtof, organ, pizz, pluck, recorder, snare, thump, timpani, tom, tone, vibes } from './synth.js';

/** Tonalidad y ambiente de cada entorno. */
export const MOODS = {
  luna: { root: 45, scale: [0, 2, 3, 5, 7, 8, 10], tempo: 1, wave: 'sawtooth', cutoff: 700, amb: ['wind'] },
  cementerio: { root: 38, scale: [0, 1, 3, 5, 7, 8, 10], tempo: 0.9, wave: 'sawtooth', cutoff: 520, amb: ['wind', 'owl'] },
  bosque: { root: 40, scale: [0, 2, 3, 5, 7, 9, 10], tempo: 0.95, wave: 'triangle', cutoff: 900, amb: ['wind', 'owl'] },
  calabazas: { root: 43, scale: [0, 2, 3, 5, 7, 8, 11], tempo: 1.15, wave: 'sawtooth', cutoff: 800, amb: ['fire'] },
  laboratorio: { root: 36, scale: [0, 2, 4, 6, 8, 10], tempo: 1.05, wave: 'square', cutoff: 600, amb: ['bubbles'] },
  mansion: { root: 35, scale: [0, 2, 3, 5, 7, 8, 11], tempo: 0.9, wave: 'square', cutoff: 650, amb: ['rain'] },
  telarana: { root: 42, scale: [0, 1, 3, 6, 7, 9], tempo: 1, wave: 'triangle', cutoff: 750, amb: ['wind'] },
  aquelarre: { root: 38, scale: [0, 1, 4, 5, 7, 8, 10], tempo: 1.2, wave: 'sawtooth', cutoff: 900, amb: ['fire'], drums: true },
  cripta: { root: 37, scale: [0, 2, 3, 5, 7, 8, 10], tempo: 0.85, wave: 'sine', cutoff: 1200, amb: ['wind'] },
  millonario: { root: 40, scale: [0, 2, 3, 5, 7, 8, 10], tempo: 1, wave: 'sawtooth', cutoff: 1100, amb: [] },
  tormenta: { root: 33, scale: [0, 1, 3, 5, 7, 8, 10], tempo: 0.9, wave: 'sawtooth', cutoff: 480, amb: ['rain', 'wind'] },
  // Squid Games: su propia música (en vez de la de Halloween) para cada momento
  squid: {
    root: 50,
    scale: [0, 2, 3, 5, 7, 8, 10],
    tempo: 1,
    wave: 'triangle',
    cutoff: 900,
    amb: [],
    styles: { explore: 'sqTheme', organ: 'sqTheme', lobby: 'sqTheme', tension: 'sqTension', reveal: 'sqWaltz', waltz: 'sqWaltz' },
  },
};

// Melodías de Squid Games: [nota MIDI o null, pulsos]. La flauta es original; el vals es «El Danubio azul» (Strauss,
// 1866, dominio público).
const SQ_THEME = [
  [74, 1], [77, 1], [76, 0.5], [74, 0.5], [72, 1],
  [74, 2], [69, 2],
  [72, 1], [74, 0.5], [72, 0.5], [70, 1], [69, 1],
  [67, 3], [null, 1],
  [69, 1], [70, 1], [72, 1], [74, 1],
  [77, 1.5], [76, 0.5], [74, 2],
  [72, 1], [70, 1], [69, 1], [67, 1],
  [62, 3], [null, 1],
];
const DANUBE = [
  [62, 1], [62, 1], [66, 1], [69, 2], [81, 0.5], [81, 0.5], [null, 1], [78, 1], [78, 1],
  [62, 1], [62, 1], [66, 1], [69, 2], [83, 0.5], [83, 0.5], [null, 1], [79, 1], [79, 1],
  [61, 1], [61, 1], [64, 1], [71, 2], [83, 0.5], [83, 0.5], [null, 1], [79, 1], [79, 1],
  [61, 1], [61, 1], [64, 1], [71, 2], [81, 0.5], [81, 0.5], [null, 1], [78, 1], [78, 1],
];
const DANUBE_BASS = [38, 38, 38, 38, 38, 38, 33, 33, 33, 33, 33, 38]; // re · re · la · la (un compás cada uno)

/** Notas de una melodía que empiezan en el pulso `beat` (en bucle): [{m, at (fracción de pulso), len (pulsos)}] */
function notesAt(tune, beat) {
  const total = tune.reduce((s, [, d]) => s + d, 0);
  const b = beat % total;
  const out = [];
  let pos = 0;
  for (const [m, d] of tune) {
    if (pos >= b && pos < b + 1 && m != null) out.push({ m, at: pos - b, len: d });
    pos += d;
  }
  return out;
}

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const HARMONIC_MINOR = [0, 2, 3, 5, 7, 8, 11];

/** Grado de escala → nota MIDI (los grados pueden pasar de la octava o ser negativos). */
function degree(root, scale, d) {
  const n = scale.length;
  return root + scale[((d % n) + n) % n] + 12 * Math.floor(d / n);
}

/** Motivo melódico: `len` pasos de grados (o silencios), por saltos cortos como una melodía cantable. */
function motif(len, { rest = 0.3, start = 0, low = -2, high = 9 } = {}) {
  const out = [];
  let d = start;
  for (let i = 0; i < len; i++) {
    if (i > 0 && Math.random() < rest) {
      out.push(null);
      continue;
    }
    d = Math.max(low, Math.min(high, d + [-2, -1, -1, 0, 1, 1, 2, 3, -3][(Math.random() * 9) | 0]));
    out.push(d);
  }
  return out;
}

/** Acorde triada sobre un grado de la escala. */
const triad = (root, scale, d) => [degree(root, scale, d), degree(root, scale, d + 2), degree(root, scale, d + 4)];

// ------------------------------------------------------------------------------------------ estilos
// beat(p): p = {s, out, soft, t, beat, bar, inBar, spb, mood, st}; st = estado del estilo (motivos, etc.)

export const STYLES = {
  explore: {
    bpm: 62,
    meter: 4,
    pad: true,
    start(st) {
      st.melody = 0;
    },
    beat({ s, out, t, bar, inBar, spb, mood, st, layer }) {
      const PROG = [0, -4, -2, -5]; // i · VI · VII · v
      if (inBar === 0 && bar % 2 === 0) {
        const shift = PROG[(bar / 2) % PROG.length];
        for (const v of layer.voices) v.o.frequency.setTargetAtTime(mtof(mood.root + shift + v.interval), t, 0.5);
        pluck(s, out, mtof(mood.root + shift), t, { gain: 0.16, decay: 2.2 });
      }
      if (Math.random() < 0.45) {
        st.melody = Math.max(-3, Math.min(9, st.melody + [-2, -1, -1, 1, 1, 2, 3][(Math.random() * 7) | 0]));
        const m = degree(mood.root + 24, mood.scale, st.melody);
        bell(s, out, mtof(m), t, { gain: 0.07 });
        if (Math.random() < 0.3) bell(s, out, mtof(m + 12), t + spb / 2, { gain: 0.04 });
      }
      if (mood.drums && (inBar === 0 || inBar === 2)) tom(s, out, t, inBar === 0 ? 0.22 : 0.14);
    },
  },

  lobby: {
    bpm: 108,
    meter: 4,
    start(st, mood) {
      st.tune = motif(16, { rest: 0.45 });
      st.root = mood.root + 12;
    },
    beat({ s, out, t, bar, inBar, spb, mood, st }) {
      const scale = HARMONIC_MINOR;
      const PROG = [0, 3, 4, 0]; // i · iv · V · i
      const chord = PROG[bar % 4];
      const next = PROG[(bar + 1) % 4];
      // contrabajo andando: tónica, tercera, quinta y nota de paso hacia el acorde siguiente
      const walk = [degree(st.root - 12, scale, chord), degree(st.root - 12, scale, chord + 2), degree(st.root - 12, scale, chord + 4), degree(st.root - 12, scale, next) - 1];
      pluck(s, out, mtof(walk[inBar]), t, { gain: 0.2, decay: 0.35 });
      // escobillas con swing
      brush(s, out, t, inBar % 2 ? 0.06 : 0.035);
      hat(s, out, t + spb * 0.66, 0.03);
      if (inBar === 0) for (const m of triad(st.root + 12, scale, chord)) vibes(s, out, mtof(m), t + 0.01, 0.035);
      // melodía con swing (corcheas largas-cortas)
      if (bar % 8 === 0 && inBar === 0 && bar) st.tune = motif(16, { rest: 0.45 });
      for (const half of [0, 1]) {
        const step = (bar % 2) * 8 + inBar * 2 + half;
        const d = st.tune[step];
        if (d != null) vibes(s, out, mtof(degree(st.root + 24, scale, d)), t + (half ? spb * 0.66 : 0), 0.05);
      }
    },
  },

  organ: {
    bpm: 66,
    meter: 4,
    start(st, mood) {
      st.root = mood.root;
    },
    beat({ s, out, soft, t, bar, inBar, spb, st }) {
      const scale = HARMONIC_MINOR;
      const PROG = [0, 3, 4, 0, 5, 3, 4, 4]; // i iv V i VI iv V V
      const chord = PROG[bar % PROG.length];
      if (inBar === 0) {
        organ(s, out, triad(st.root + 12, scale, chord), t, spb * 4 - 0.1, 0.03);
        held(s, out, { freq: mtof(degree(st.root - 12, scale, chord)), t, dur: spb * 4, peak: 0.12 });
        // tocata: arpegio rápido que baja, cada dos compases
        if (bar % 2 === 0) {
          for (let i = 0; i < 8; i++) {
            const m = degree(st.root + 36, scale, chord + 4 - i);
            tone(s, soft, { type: 'square', freq: mtof(m), t: t + i * (spb / 4), peak: 0.03, decay: 0.18 });
          }
        }
      }
      if (inBar === 2) timpani(s, out, mtof(degree(st.root - 12, scale, chord)), t, 0.12);
    },
  },

  tension: {
    bpm: 126,
    meter: 4,
    start(st, mood) {
      st.root = mood.root - 12;
    },
    beat({ s, out, soft, t, bar, inBar, spb, st }) {
      // ostinato de semicorcheas que sube un semitono cada 4 compases (tipo Tiburón)
      const lift = Math.floor(bar / 4) % 4;
      for (let i = 0; i < 4; i++) {
        const m = st.root + lift + (i === 2 ? 1 : 0);
        tone(s, soft, { type: 'sawtooth', freq: mtof(m), t: t + (i * spb) / 4, peak: i === 0 ? 0.14 : 0.08, decay: 0.09 });
      }
      // trémolo agudo disonante (segunda menor)
      if (inBar === 0) {
        for (const iv of [24, 25]) {
          for (let k = 0; k < 16; k++) tone(s, soft, { type: 'sawtooth', freq: mtof(st.root + 24 + iv + lift), t: t + (k * spb) / 4, peak: 0.012, decay: 0.07 });
        }
      }
      // latido
      if (inBar === 0 || inBar === 2) {
        thump(s, out, t, 0.45);
        thump(s, out, t + 0.2, 0.3);
      }
      if (inBar === 3 && bar % 2) snare(s, out, t + spb / 2, 0.05);
    },
  },

  suspense: {
    bpm: 84,
    meter: 4,
    start(st, mood) {
      st.root = mood.root;
    },
    beat({ s, out, soft, t, bar, inBar, spb, st }) {
      // redoble de timbal que crece en ciclos de 2 compases sobre un acorde disonante; cada ciclo, medio tono más arriba
      const cycle = bar % 2;
      const lift = Math.floor(bar / 2) % 3;
      for (let i = 0; i < 4; i++) timpani(s, out, mtof(st.root - 12 + lift), t + (i * spb) / 4, 0.03 + 0.02 * (cycle * 4 + inBar) * 0.3);
      if (inBar === 0 && cycle === 0) {
        for (const iv of [0, 6, 11, 13]) held(s, soft, { type: 'sawtooth', freq: mtof(st.root + 12 + iv + lift), t, dur: spb * 7, attack: spb * 5, peak: 0.022 });
      }
      if (inBar === 3 && cycle === 1) tone(s, out, { type: 'triangle', freq: mtof(st.root + 31 + lift), t: t + spb / 2, peak: 0.05, decay: 0.5 });
    },
  },

  reveal: {
    bpm: 96,
    meter: 4,
    start(st, mood) {
      st.root = mood.root;
    },
    beat({ s, out, t, bar, inBar, spb, st }) {
      // resolución en mayor: golpe al empezar y luego arpegios brillantes con un ritmo ligero
      const PROG = [0, 5, 3, 4]; // I vi IV V
      const chord = PROG[bar % 4];
      if (inBar === 0) {
        if (bar === 0) {
          timpani(s, out, mtof(st.root - 12), t, 0.35);
          organ(s, out, triad(st.root + 12, MAJOR, 0), t, spb * 2, 0.03);
        }
        pluck(s, out, mtof(degree(st.root - 12, MAJOR, chord)), t, { gain: 0.2, decay: 1 });
      }
      const ch = triad(st.root + 24, MAJOR, chord);
      for (let i = 0; i < 2; i++) bell(s, out, mtof(ch[(inBar * 2 + i) % 3] + (i ? 12 : 0)), t + (i * spb) / 2, { gain: 0.045, decay: 0.8 });
      hat(s, out, t + spb / 2, 0.03);
    },
  },

  march: {
    bpm: 112,
    meter: 4,
    start(st, mood) {
      st.root = mood.root + 12;
      st.tune = motif(16, { rest: 0.25, start: 4 });
    },
    beat({ s, out, t, bar, inBar, spb, st }) {
      const scale = HARMONIC_MINOR;
      const PROG = [0, 4, 0, 4, 3, 0, 4, 0];
      const chord = PROG[bar % PROG.length];
      if (bar % 8 === 0 && inBar === 0 && bar) st.tune = motif(16, { rest: 0.25, start: 4 });
      // chunda-chunda: bajo en 1 y 3 (tónica y quinta), acorde en pizzicato en 2 y 4
      if (inBar % 2 === 0) pizz(s, out, mtof(degree(st.root - 24, scale, chord + (inBar === 2 ? 4 : 0))), t, 0.2);
      else for (const m of triad(st.root, scale, chord)) pizz(s, out, mtof(m), t, 0.05);
      for (const half of [0, 1]) {
        const d = st.tune[(bar % 2) * 8 + inBar * 2 + half];
        if (d != null) pizz(s, out, mtof(degree(st.root + 12, scale, d)), t + (half * spb) / 2, 0.1);
      }
      if (inBar === 3) snare(s, out, t, 0.06);
      if (inBar === 0 && bar % 4 === 0) tone(s, out, { freq: mtof(st.root + 36), t, peak: 0.02, decay: 0.6 }); // xilófono
    },
  },

  waltz: {
    bpm: 168,
    meter: 3,
    start(st, mood) {
      st.root = mood.root + 12;
      st.tune = motif(12, { rest: 0.2, start: 2 });
    },
    beat({ s, out, t, bar, inBar, st }) {
      const scale = HARMONIC_MINOR;
      const PROG = [0, 3, 4, 0, 5, 3, 4, 0];
      const chord = PROG[bar % PROG.length];
      if (bar % 8 === 0 && inBar === 0 && bar) st.tune = motif(12, { rest: 0.2, start: 2 });
      if (inBar === 0) pluck(s, out, mtof(degree(st.root - 24, scale, chord)), t, { gain: 0.22, decay: 0.9 });
      else for (const m of triad(st.root, scale, chord)) vibes(s, out, mtof(m), t, 0.025);
      const d = st.tune[(bar % 4) * 3 + inBar];
      if (d != null) bell(s, out, mtof(degree(st.root + 12, scale, d)), t, { gain: 0.07, decay: 1.2 });
    },
  },

  /** Llamada del millonario: un reloj que avanza sobre un pulso grave (30 s). */
  call: {
    bpm: 120,
    meter: 4,
    start(st, mood) {
      st.root = mood.root;
    },
    beat({ s, out, soft, t, bar, inBar, spb, st }) {
      tone(s, out, { freq: inBar % 2 ? 1700 : 1300, t, peak: 0.07, decay: 0.03 }); // tic-tac
      if (inBar === 0) {
        thump(s, out, t, 0.35);
        held(s, soft, { type: 'sawtooth', freq: mtof(st.root + 12 + (bar % 4 === 3 ? 1 : 0)), t, dur: spb * 3.5, attack: 0.05, peak: 0.02 });
      }
      if (inBar === 2) pluck(s, out, mtof(st.root - 12 + (bar % 2) * 7), t, { gain: 0.15, decay: 0.4 });
    },
  },

  /** Público votando (15 s): pizzicato nervioso. */
  audienceVote: {
    bpm: 132,
    meter: 4,
    start(st, mood) {
      st.root = mood.root + 12;
    },
    beat({ s, out, t, bar, inBar, spb, st }) {
      const scale = HARMONIC_MINOR;
      for (const half of [0, 1]) pizz(s, out, mtof(degree(st.root, scale, (bar * 4 + inBar * 2 + half) % 7)), t + (half * spb) / 2, 0.06);
      if (inBar % 2 === 0) thump(s, out, t, 0.2);
      hat(s, out, t + spb / 2, 0.025);
    },
  },
};

// ------------------------------------------------------------------------------------------ Squid Games

/** Tema: flauta dulce sobre caja de colegio y bajo en pizzicato (melancólico e inocente). */
STYLES.sqTheme = {
  bpm: 96,
  meter: 4,
  sample: 'theme', // si hay canción «tema» en la carpeta Squid, suena ella
  start() {},
  beat({ s, out, t, beat, inBar, spb }) {
    for (const n of notesAt(SQ_THEME, beat)) recorder(s, out, mtof(n.m), t + n.at * spb, n.len * spb * 0.92, 0.07);
    const bar = Math.floor(beat / 4) % 8;
    const bass = [50, 50, 46, 43, 45, 46, 48, 50][bar];
    if (inBar === 0 || inBar === 2) pizz(s, out, mtof(bass - 12 + (inBar === 2 ? 7 : 0)), t, 0.12);
    snare(s, out, t, inBar === 0 ? 0.035 : 0.018);
    if (inBar === 3) snare(s, out, t + spb / 2, 0.02);
  },
};

/** Tensión: ostinato seco que no para, timbal y un tictac (para jugar con el reloj corriendo). */
STYLES.sqTension = {
  bpm: 132,
  meter: 4,
  sample: 'tension',
  start() {},
  beat({ s, out, soft, t, beat, inBar, spb }) {
    const bar = Math.floor(beat / 4);
    const lift = Math.floor(bar / 4) % 3;
    const pat = [38, 38, 41, 38, 43, 38, 41, 40];
    for (const half of [0, 1]) pizz(s, out, mtof(pat[(inBar * 2 + half) % 8] + lift), t + (half * spb) / 2, 0.11);
    if (inBar === 0) timpani(s, out, mtof(26 + lift), t, 0.22);
    if (inBar === 0 && bar % 2 === 0) held(s, soft, { type: 'sawtooth', freq: mtof(62 + lift), t, dur: spb * 7, attack: spb * 4, peak: 0.018 });
    tone(s, out, { freq: inBar % 2 ? 1500 : 1200, t, peak: 0.04, decay: 0.03 });
    if (inBar === 3) snare(s, out, t + spb / 2, 0.04);
  },
};

/** El Danubio azul en caja de música: el reparto de la hucha. */
STYLES.sqWaltz = {
  bpm: 150,
  meter: 3,
  sample: 'waltz',
  start() {},
  beat({ s, out, t, beat, inBar, spb }) {
    for (const n of notesAt(DANUBE, beat)) bell(s, out, mtof(n.m + 12), t + n.at * spb, { gain: 0.06, decay: Math.max(0.6, n.len * spb * 1.6) });
    const bass = DANUBE_BASS[Math.floor(beat / 3) % DANUBE_BASS.length];
    if (inBar === 0) pluck(s, out, mtof(bass - 12), t, { gain: 0.2, decay: 0.8 });
    else for (const iv of [12, 16, 19]) vibes(s, out, mtof(bass + iv - (bass === 33 ? 1 : 0)), t, 0.018);
  },
};

/** Silencio: que se oigan la muñeca, la respiración y el corazón. */
STYLES.hush = { bpm: 60, meter: 4, start() {}, beat() {} };

// Título del concurso y presentación de los equipos: si no hay canción tuya, los de la portada y el marcador.
STYLES.title = STYLES.organ;
STYLES.versus = STYLES.march;
