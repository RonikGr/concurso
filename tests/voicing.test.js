import { describe, expect, it } from 'vitest';
import { splitSong } from '../src/core/voicing.js';

/** Silencio, una «voz» (tono de 300 Hz con armónicos), ruido de motor y silencio. */
function recording({ sr = 44100, lead = 0.4, sing = 3, noise = 2 } = {}) {
  const n = Math.round((lead + sing + noise + 0.3) * sr);
  const d = new Float32Array(n);
  let seed = 3;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    if (t >= lead && t < lead + sing) d[i] = 0.3 * Math.sin(2 * Math.PI * 300 * t) + 0.1 * Math.sin(2 * Math.PI * 600 * t);
    else if (t >= lead + sing && t < lead + sing + noise) d[i] = 0.2 * rnd();
  }
  return { d, sr };
}

describe('Dónde canta una grabación (la muñeca)', () => {
  it('separa la canción del ruido que viene detrás (el giro de la cabeza)', () => {
    const { d, sr } = recording();
    const r = splitSong(d, sr);
    expect(r.song[0]).toBeGreaterThan(0.25);
    expect(r.song[0]).toBeLessThan(0.5);
    expect(r.song[1]).toBeGreaterThan(3.3);
    expect(r.song[1]).toBeLessThan(3.55);
    expect(r.turn[0]).toBe(r.song[1]);
    expect(r.turn[1]).toBeGreaterThan(5.2);
  });

  it('sin nada detrás, no hay giro; sin voz, null', () => {
    const { d, sr } = recording({ noise: 0 });
    expect(splitSong(d, sr).turn).toBeNull();
    expect(splitSong(new Float32Array(44100), 44100)).toBeNull();
  });
});
