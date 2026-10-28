// Instrumentos sintetizados con Web Audio para la música y los efectos. Cada uno programa sus notas en el instante
// `t` (tiempo del AudioContext) y se apaga solo. `s` es el motor de sonido (contexto y ruido blanco compartido).

export const mtof = (m) => 440 * 2 ** ((m - 69) / 12);

/** Nota con ataque y caída exponencial (campanas, golpes, punteos). */
export function tone(s, dest, { type = 'sine', freq, t, attack = 0.005, peak = 0.2, decay = 0.5, slideTo = null, slideTime = 0.2, detune = 0 }) {
  const c = s.ctx;
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + slideTime);
  o.detune.value = detune;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  o.connect(g).connect(dest);
  o.start(t);
  o.stop(t + attack + decay + 0.05);
  return o;
}

/** Nota sostenida: sube, se mantiene `dur` segundos y se apaga (órgano, cuerdas, coros). */
export function held(s, dest, { type = 'sine', freq, t, dur, attack = 0.08, release = 0.3, peak = 0.1, detune = 0 }) {
  const c = s.ctx;
  const o = c.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  o.detune.value = detune;
  const g = c.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  g.gain.setValueAtTime(peak, t + Math.max(attack, dur));
  g.gain.linearRampToValueAtTime(0, t + Math.max(attack, dur) + release);
  o.connect(g).connect(dest);
  o.start(t);
  o.stop(t + Math.max(attack, dur) + release + 0.05);
}

/** Golpe de ruido filtrado (platos, escobillas, viento, chasquidos). */
export function noiseHit(s, dest, t, { type = 'bandpass', freq = 1000, q = 1, peak = 0.3, attack = 0.005, decay = 0.3, sweepTo = null }) {
  const c = s.ctx;
  const src = c.createBufferSource();
  src.buffer = s.noise();
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, t);
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + attack + decay);
  f.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  src.connect(f).connect(g).connect(dest);
  src.start(t, Math.random());
  src.stop(t + attack + decay + 0.05);
}

export const bell = (s, dest, f, t, { gain = 0.1, decay = 1.8 } = {}) => {
  tone(s, dest, { freq: f, t, peak: gain, decay });
  tone(s, dest, { freq: f * 2.01, t, peak: gain * 0.35, decay: decay * 0.5 });
  tone(s, dest, { freq: f * 3.98, t, peak: gain * 0.12, decay: decay * 0.25 });
};
export const pluck = (s, dest, f, t, { type = 'triangle', gain = 0.15, decay = 0.6 } = {}) => tone(s, dest, { type, freq: f, t, peak: gain, decay });
/** Pizzicato de cuerda: ataque seco y cola corta. */
export const pizz = (s, dest, f, t, gain = 0.12) => {
  tone(s, dest, { type: 'triangle', freq: f, t, peak: gain, decay: 0.22 });
  tone(s, dest, { freq: f * 2, t, peak: gain * 0.3, decay: 0.08 });
};
/** Vibráfono: campana suave con algo de trémolo. */
export const vibes = (s, dest, f, t, gain = 0.06) => {
  tone(s, dest, { freq: f, t, peak: gain, decay: 1.4 });
  tone(s, dest, { freq: f * 4, t, peak: gain * 0.15, decay: 0.3 });
};
export const thump = (s, dest, t, gain = 0.4) => tone(s, dest, { freq: 90, slideTo: 40, slideTime: 0.12, t, peak: gain, decay: 0.18 });
export const tom = (s, dest, t, gain, f = 95) => {
  tone(s, dest, { freq: f, slideTo: f * 0.55, slideTime: 0.25, t, peak: gain, decay: 0.35 });
  noiseHit(s, dest, t, { type: 'lowpass', freq: 600, peak: gain * 0.25, decay: 0.08 });
};
/** Timbal afinado (para redobles y finales). */
export const timpani = (s, dest, f, t, gain = 0.3) => {
  tone(s, dest, { freq: f, slideTo: f * 0.97, slideTime: 0.4, t, peak: gain, decay: 1.2 });
  noiseHit(s, dest, t, { type: 'lowpass', freq: 400, peak: gain * 0.4, decay: 0.15 });
};
export const hat = (s, dest, t, gain = 0.05) => noiseHit(s, dest, t, { type: 'highpass', freq: 7000, peak: gain, decay: 0.05 });
export const brush = (s, dest, t, gain = 0.05) => noiseHit(s, dest, t, { freq: 3500, q: 0.7, peak: gain, attack: 0.02, decay: 0.12 });
export const snare = (s, dest, t, gain = 0.12) => {
  noiseHit(s, dest, t, { freq: 2200, q: 0.6, peak: gain, decay: 0.14 });
  tone(s, dest, { type: 'triangle', freq: 190, t, peak: gain * 0.6, decay: 0.07 });
};
/** Acorde de órgano: varios armónicos por nota, sostenido. */
export function organ(s, dest, notes, t, dur, gain = 0.035) {
  for (const m of notes) {
    const f = mtof(m);
    for (const [mult, g] of [
      [1, 1],
      [2, 0.5],
      [3, 0.25],
      [4, 0.18],
      [0.5, 0.4],
    ]) {
      held(s, dest, { freq: f * mult, t, dur, attack: 0.06, release: 0.25, peak: gain * g });
    }
  }
}
/** Flauta dulce: casi una sinusoide, con soplo al empezar y vibrato que llega tarde. */
export function recorder(s, dest, f, t, dur, gain = 0.08) {
  const c = s.ctx;
  const o = c.createOscillator();
  o.frequency.value = f;
  const o2 = c.createOscillator();
  o2.frequency.value = f * 2;
  const lfo = c.createOscillator();
  lfo.frequency.value = 5.2;
  const depth = c.createGain();
  depth.gain.setValueAtTime(0, t);
  depth.gain.linearRampToValueAtTime(f * 0.006, t + Math.min(0.35, dur));
  lfo.connect(depth).connect(o.frequency);
  const g = c.createGain();
  const end = t + dur;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.04);
  g.gain.setValueAtTime(gain * 0.85, Math.max(t + 0.05, end - 0.06));
  g.gain.exponentialRampToValueAtTime(0.0001, end + 0.04);
  const g2 = c.createGain();
  g2.gain.value = 0.12;
  o.connect(g).connect(dest);
  o2.connect(g2).connect(g);
  for (const n of [o, o2, lfo]) {
    n.start(t);
    n.stop(end + 0.1);
  }
  noiseHit(s, dest, t, { freq: f * 2, q: 2, peak: gain * 0.35, decay: 0.05 }); // soplo
}

export const crackle = (s, dest, t) => noiseHit(s, dest, t, { freq: 1800 + Math.random() * 3000, q: 4, peak: 0.04 + Math.random() * 0.05, decay: 0.015 });
export const bubble = (s, dest, t) => tone(s, dest, { freq: 250 + Math.random() * 300, slideTo: 900 + Math.random() * 600, slideTime: 0.07, t, peak: 0.05, decay: 0.08 });
export function owl(s, dest, t) {
  for (const [dt, f] of [
    [0, 440],
    [0.45, 415],
    [0.75, 415],
  ]) {
    tone(s, dest, { freq: f, slideTo: f * 0.92, slideTime: 0.35, t: t + dt, attack: 0.08, peak: 0.035, decay: 0.32 });
  }
}
