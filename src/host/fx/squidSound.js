// Sonidos de Squid Games. Si en la carpeta del concurso hay un archivo para ese sonido (Squid/ o suelto en Música/:
// latido, respiración, cristal, monedas, campana, cuerda, la muñeca…), suena él; si no, se genera aquí.
// Cada función recibe el motor `s` (audio.js), el instante `t` (tiempo del AudioContext) y sus opciones; las que duran
// (respiración, latidos) devuelven {stop()}.
import { CHANT, chantTimes } from '../../core/squid.js';
import { bell, mtof, noiseHit, thump, tone } from './synth.js';

// Trozos de los archivos que dejó el presentador (medidos: ver la biblia de diseño). Con otros archivos también
// valen: si el trozo no cabe, se toma desde el principio.
const CUTS = {
  heartBeat: [2.15, 0.78], // un «pum-pum»
  glassCrack: [0.15, 1.5], // crujidos
  glassShatter: [2.42, null], // el estallido (hasta el final)
  breathLoop: [0.2, 4.4],
  inhale: [0.15, 1.3],
  exhale: [2.6, 1.6],
  ropeSnap: [2.85, null], // tensa… ¡chas! (el chasquido, a los 0,29 s)
  coins: [0.1, null],
};

// ------------------------------------------------------------------ la muñeca

// Formantes de voz de niña (Hz) para cada vocal del canto
const VOWEL = { u: [380, 950, 2700], a: [950, 1500, 3200], o: [580, 1000, 2900], i: [380, 2700, 3600], eo: [680, 1250, 2950], eu: [440, 1550, 2850] };
const SYLLABLES = [
  ['m', 'u'],
  ['g', 'u', 'ng'],
  ['h', 'a'],
  ['k', 'o'],
  ['ch', 'i'],
  ['p', 'i'],
  ['', 'eo'],
  ['s', 'eu', 'm'],
  ['n', 'i'],
  ['d', 'a'],
];
const NOTES = [67, 67, 69, 67, 64, 67, 67, 69, 67, 64]; // sol sol la sol mi…: canturreo de patio de colegio

/** Una sílaba cantada: consonante (ruido o zumbido), vocal con formantes y vibrato. */
function syllable(s, dest, [cons, vowel, coda], midi, t, len, last) {
  const c = s.ctx;
  const f0 = mtof(midi);
  let v0 = t;
  if (['k', 'p', 'd', 'g', 'ch'].includes(cons)) {
    noiseHit(s, dest, t, { freq: cons === 'ch' ? 3800 : cons === 'k' ? 2400 : 1600, q: 1.5, peak: 0.18, decay: cons === 'ch' ? 0.05 : 0.025 });
    v0 = t + 0.03;
  } else if (cons === 's' || cons === 'h') {
    noiseHit(s, dest, t, { type: cons === 's' ? 'highpass' : 'bandpass', freq: cons === 's' ? 4500 : 1400, peak: 0.12, attack: 0.02, decay: 0.07 });
    v0 = t + 0.07;
  } else if (cons === 'm' || cons === 'n') {
    tone(s, dest, { freq: f0, t, peak: 0.06, decay: 0.06 });
    v0 = t + 0.04;
  }
  const end = t + len;
  const src = c.createOscillator();
  src.type = 'sawtooth';
  src.frequency.setValueAtTime(f0, v0);
  if (last) src.frequency.setTargetAtTime(f0 * 0.84, v0 + (end - v0) * 0.55, 0.12); // la última cae
  const lfo = c.createOscillator();
  lfo.frequency.value = 6;
  const vib = c.createGain();
  vib.gain.setValueAtTime(0, v0);
  vib.gain.linearRampToValueAtTime(f0 * 0.012, v0 + 0.15);
  lfo.connect(vib).connect(src.frequency);
  const env = c.createGain();
  env.gain.setValueAtTime(0.0001, v0);
  env.gain.exponentialRampToValueAtTime(1, v0 + 0.025);
  env.gain.setValueAtTime(0.9, Math.max(v0 + 0.03, end - 0.05));
  env.gain.exponentialRampToValueAtTime(0.0001, end);
  src.connect(env);
  VOWEL[vowel].forEach((f, i) => {
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = f;
    bp.Q.value = [7, 9, 11][i];
    const g = c.createGain();
    g.gain.value = [0.5, 0.28, 0.12][i];
    env.connect(bp).connect(g).connect(dest);
  });
  for (const n of [src, lfo]) {
    n.start(v0);
    n.stop(end + 0.05);
  }
  if (coda === 'ng' || coda === 'm') tone(s, dest, { freq: f0, t: end - 0.05, peak: 0.05, decay: 0.08 });
}

/** La muñeca canta la frase entera en `dur` s (acaba justo cuando se pone en rojo). */
export function chant(s, t, { dur, rush = 0 }) {
  const sample = s.sampleInfo('doll');
  if (sample) {
    // Solo la canción de su grabación (sin el giro, si lo trae), estirada o encogida para que acabe justo al ponerse
    // en rojo (más deprisa = más aguda, como en la serie). Si ni a 2,5× cabe, canta solo el final de la frase.
    const rate = Math.max(0.5, Math.min(2.5, sample.length / dur));
    const played = Math.min(sample.length, dur * rate);
    return s.sample('doll', { t, offset: sample.start + sample.length - played, duration: played, rate, gain: 1, fadeOut: 0.08 });
  }
  const out = s.ctx.createGain();
  out.gain.value = 0.55;
  // un poco de eco de altavoz de patio
  const delay = s.ctx.createDelay(0.5);
  delay.delayTime.value = 0.11;
  const fb = s.ctx.createGain();
  fb.gain.value = 0.18;
  out.connect(s.sfxBus);
  out.connect(delay).connect(fb).connect(s.sfxBus);
  const times = chantTimes(dur * 1000, rush).map((ms) => ms / 1000);
  CHANT.forEach((_, i) => {
    const len = (i + 1 < times.length ? times[i + 1] : dur) - times[i];
    syllable(s, out, SYLLABLES[i], NOTES[i], t + times[i], Math.max(0.09, len - 0.02), i === CHANT.length - 1);
  });
  setTimeout(() => out.disconnect(), (dur + 2) * 1000);
  return null;
}

/**
 * Gira la cabeza (al ponerse en rojo): el archivo del giro, o el final del de la muñeca si lo trae detrás de la
 * canción, o un motorcito generado. Como mucho `dur` s (lo que dura el rojo). @returns {length} lo que suena (s)
 */
export function headTurn(s, t, { dur = null } = {}) {
  const cap = (len) => (dur ? Math.min(len, dur) : len);
  const own = s.sampleInfo('turn');
  if (own && s.sample('turn', { t, offset: own.start, duration: cap(own.length), fadeOut: 0.25 })) return { length: cap(own.length) };
  const tail = s.sampleInfo('doll')?.turn;
  if (tail) {
    const len = cap(tail[1] - tail[0]);
    if (s.sample('doll', { t, offset: tail[0], duration: len, fadeOut: 0.3 })) return { length: len };
  }
  tone(s, s.sfxBus, { type: 'sawtooth', freq: 140, slideTo: 260, slideTime: 0.4, t, attack: 0.03, peak: 0.05, decay: 0.42 });
  noiseHit(s, s.sfxBus, t, { freq: 900, q: 3, peak: 0.08, attack: 0.05, decay: 0.38, sweepTo: 1600 });
  thump(s, s.sfxBus, t + 0.44, 0.25);
  return { length: 0.45 };
}

/** Ojos que escanean: pitidos suaves durante `dur` s. */
export function scan(s, t, { dur = 2 }) {
  for (let k = 0.5; k < dur - 0.2; k += 0.5) tone(s, s.sfxBus, { freq: 1760, t: t + k, peak: 0.035, decay: 0.12 });
  tone(s, s.sfxBus, { type: 'triangle', freq: 55, t: t + 0.3, attack: 0.3, peak: 0.08, decay: Math.max(0.5, dur - 0.6) });
}

// ------------------------------------------------------------------ megafonía y eliminados

/** «Din-don-din-don» de megafonía antes de cada anuncio. */
export function pa(s, t) {
  if (s.sample('bell', { t, gain: 0.8 })) return;
  [76, 72, 74, 67].forEach((m, i) => bell(s, s.sfxBus, mtof(m), t + i * 0.45, { gain: 0.12, decay: 1.6 }));
}

/** Alguien cae: zumbido seco y golpe (sin disparos: es una fiesta familiar). */
export function eliminated(s, t) {
  if (s.sample('out', { t, gain: 0.8 })) return;
  tone(s, s.sfxBus, { type: 'square', freq: 220, slideTo: 55, slideTime: 0.35, t, peak: 0.07, decay: 0.4 });
  noiseHit(s, s.sfxBus, t, { type: 'lowpass', freq: 1200, sweepTo: 200, peak: 0.25, decay: 0.35 });
  thump(s, s.sfxBus, t + 0.02, 0.55);
}

/** Sello del aspa roja sobre un número. */
export function stamp(s, t) {
  thump(s, s.sfxBus, t, 0.4);
  noiseHit(s, s.sfxBus, t, { freq: 1800, q: 0.8, peak: 0.12, decay: 0.06 });
}

// ------------------------------------------------------------------ el puente

/** Respiración nerviosa en bucle hasta stop(). */
export function breathLoop(s, t, { gain = 0.55 } = {}) {
  const [from, len] = CUTS.breathLoop;
  const h = s.sample('breath', { t, loop: [from, from + len], gain });
  if (h) return h;
  // generada: ruido filtrado que entra y sale (dentro-fuera cada 1,6 s)
  const c = s.ctx;
  const src = c.createBufferSource();
  src.buffer = s.noise();
  src.loop = true;
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = 900;
  f.Q.value = 0.8;
  const g = c.createGain();
  g.gain.value = 0;
  const lfo = c.createOscillator();
  lfo.frequency.value = 0.62;
  const depth = c.createGain();
  depth.gain.value = 0.05;
  const bias = c.createConstantSource();
  bias.offset.value = 0.05;
  lfo.connect(depth).connect(g.gain);
  bias.connect(g.gain);
  src.connect(f).connect(g).connect(s.sfxBus);
  for (const n of [src, lfo, bias]) n.start(t);
  return {
    stop() {
      const now = c.currentTime;
      g.gain.cancelScheduledValues(now);
      bias.offset.setTargetAtTime(0, now, 0.15);
      depth.gain.setTargetAtTime(0, now, 0.15);
      for (const n of [src, lfo, bias]) n.stop(now + 0.8);
    },
  };
}

/** Coger aire antes de saltar. */
export function inhale(s, t) {
  const [from, len] = CUTS.inhale;
  if (s.sample('breath', { t, offset: from, duration: len, gain: 1 })) return;
  noiseHit(s, s.sfxBus, t, { freq: 1200, q: 0.7, peak: 0.16, attack: 0.45, decay: 0.15, sweepTo: 2400 });
}

/** Soltar el aire (ha aguantado). */
export function exhale(s, t) {
  const [from, len] = CUTS.exhale;
  if (s.sample('breath', { t, offset: from, duration: len, gain: 1 })) return;
  noiseHit(s, s.sfxBus, t, { freq: 800, q: 0.7, peak: 0.14, attack: 0.05, decay: 0.9, sweepTo: 400 });
}

/** Salto: aire que sube. */
export function jump(s, t) {
  noiseHit(s, s.sfxBus, t, { freq: 400, sweepTo: 2200, q: 1, peak: 0.2, attack: 0.25, decay: 0.35 });
}

/** Caer sobre el cristal: golpe seco y un tintineo. */
export function land(s, t) {
  thump(s, s.sfxBus, t, 0.7);
  tone(s, s.sfxBus, { freq: 2900, t, peak: 0.05, decay: 0.5 });
  tone(s, s.sfxBus, { freq: 4300, t: t + 0.01, peak: 0.03, decay: 0.35 });
}

/**
 * Latidos que se aceleran de `from` a `to` pulsaciones por minuto durante `dur` s (y paran solos). stop() calla los
 * que falten.
 */
export function heartbeats(s, t, { dur, from = 70, to = 150, gain = 1 }) {
  const handles = [];
  let at = 0;
  while (at < dur) {
    const k = at / dur;
    const bpm = from + (to - from) * k * k;
    const [off, len] = CUTS.heartBeat;
    const h = s.sample('heart', { t: t + at, offset: off, duration: len, gain: gain * (0.7 + 0.3 * k) });
    if (h) handles.push(h);
    else {
      thump(s, s.sfxBus, t + at, 0.5 * gain);
      thump(s, s.sfxBus, t + at + 0.16, 0.32 * gain);
    }
    at += 60 / bpm;
  }
  return { stop: () => handles.forEach((h) => h.stop()) };
}

/** Crujido del cristal (o de la galleta, más seco). */
export function crack(s, t, { cookie = false, gain = 1 } = {}) {
  const [from, len] = CUTS.glassCrack;
  if (!cookie && s.sample('glass', { t, offset: from + Math.random() * (len - 0.4), duration: 0.35, gain: 0.7 * gain })) return;
  for (let i = 0; i < 5; i++) noiseHit(s, s.sfxBus, t + i * 0.025 * Math.random() * 3, { freq: cookie ? 2200 : 4200, q: 6, peak: 0.08 * gain, decay: 0.02 });
  if (cookie) thump(s, s.sfxBus, t, 0.2 * gain);
}

/** El cristal (o la galleta) se rompe. */
export function shatter(s, t, { cookie = false } = {}) {
  if (!cookie && s.sample('glass', { t, offset: CUTS.glassShatter[0], gain: 1 })) return;
  if (cookie) {
    noiseHit(s, s.sfxBus, t, { freq: 1500, q: 1, peak: 0.3, decay: 0.12 });
    thump(s, s.sfxBus, t, 0.45);
    return;
  }
  noiseHit(s, s.sfxBus, t, { type: 'highpass', freq: 2500, peak: 0.4, decay: 1.4 });
  for (let i = 0; i < 14; i++) tone(s, s.sfxBus, { freq: 2500 + Math.random() * 4000, t: t + 0.05 + Math.random() * 0.9, peak: 0.03, decay: 0.25 });
  thump(s, s.sfxBus, t, 0.6);
}

/** Caer al vacío: aire que baja y, lejos, el golpe. */
export function fall(s, t) {
  noiseHit(s, s.sfxBus, t, { freq: 2400, sweepTo: 250, q: 1, peak: 0.22, attack: 0.1, decay: 1.4 });
  thump(s, s.sfxBus, t + 1.6, 0.18);
}

/** Ha aguantado: acorde que se resuelve. */
export function hold(s, t) {
  [62, 66, 69, 74].forEach((m, i) => bell(s, s.sfxBus, mtof(m), t + i * 0.05, { gain: 0.07, decay: 1.6 }));
}

// ------------------------------------------------------------------ cuerda, canicas y hucha

/** Tambor grave (taiko) de la cuerda. */
export function drum(s, t, { gain = 0.5 } = {}) {
  tone(s, s.sfxBus, { freq: 70, slideTo: 42, slideTime: 0.25, t, peak: gain, decay: 0.45 });
  noiseHit(s, s.sfxBus, t, { type: 'lowpass', freq: 500, peak: gain * 0.3, decay: 0.1 });
}

/** La cuerda se tensa y chasca (el chasquido, a los 0,29 s). */
export function ropeSnap(s, t) {
  if (s.sample('rope', { t, offset: CUTS.ropeSnap[0], gain: 1 })) return;
  noiseHit(s, s.sfxBus, t, { freq: 600, sweepTo: 3000, q: 3, peak: 0.12, attack: 0.25, decay: 0.05 });
  noiseHit(s, s.sfxBus, t + 0.29, { type: 'highpass', freq: 2000, peak: 0.45, decay: 0.18 });
  thump(s, s.sfxBus, t + 0.29, 0.5);
}

/** Canicas que chocan (n golpecitos). */
export function marbles(s, t, { n = 3 } = {}) {
  for (let i = 0; i < n; i++) {
    const at = t + i * (0.06 + Math.random() * 0.08);
    tone(s, s.sfxBus, { freq: 3200 + Math.random() * 1800, t: at, peak: 0.06, decay: 0.05 });
    noiseHit(s, s.sfxBus, at, { freq: 5000, q: 4, peak: 0.04, decay: 0.015 });
  }
}

/** Monedas que caen en la hucha (`dur` s). */
export function coins(s, t, { dur = 1.5, gain = 0.8 } = {}) {
  if (s.sample('coins', { t, offset: CUTS.coins[0], duration: dur, gain, fadeOut: 0.4 })) return;
  for (let k = 0; k < dur * 14; k++) bell(s, s.sfxBus, 2000 + Math.random() * 2500, t + Math.random() * dur, { gain: 0.025, decay: 0.3 });
}

export const SQUID_SFX = { chant, headTurn, scan, pa, eliminated, stamp, breathLoop, inhale, exhale, jump, land, heartbeats, crack, shatter, fall, hold, drum, ropeSnap, marbles, coins };
