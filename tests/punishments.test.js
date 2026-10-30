import { describe, expect, it } from 'vitest';
import { PunishmentVote } from '../src/core/punishments.js';

const OPTIONS = ['Cantar', 'Bailar', 'Fregar', 'Disfraz', 'Flexiones'];

describe('castigos', () => {
  it('hasta 3 votos por persona; pasan los 3 más votados', () => {
    const v = new PunishmentVote(OPTIONS);
    for (const i of [0, 1, 2]) v.toggle('ana', i);
    expect(v.toggle('ana', 3)).toBe('full');
    v.toggle('ana', 2); // desmarca
    v.toggle('ana', 3);
    v.toggle('bea', 3);
    v.toggle('bea', 4);
    v.toggle('cris', 3);
    v.toggle('cris', 4);
    v.toggle('cris', 1);
    expect(v.tally()).toEqual([1, 2, 0, 3, 2]);
    v.close(() => 0.5);
    expect(v.finalists[0]).toBe(3);
    expect(v.finalists.slice(1).sort()).toEqual([1, 4]);
    expect(v.toggle('dani', 0)).toBe('closed');
  });

  it('la ruleta elige uno de los finalistas y se puede guardar', () => {
    const v = new PunishmentVote(OPTIONS);
    expect(v.spinWheel(0)).toBe(null); // sin cerrar la votación, no hay ruleta
    v.toggle('ana', 0);
    v.close(() => 0);
    const got = v.spinWheel(123, () => 0.99);
    expect(v.finalists).toContain(got);
    const back = new PunishmentVote(OPTIONS, JSON.parse(JSON.stringify(v.toJSON())));
    expect(back.spin).toEqual({ index: got, at: -1e9 }); // al recargar: girada hace mucho (no vuelve a girar)
    back.reset();
    expect([back.closed, back.finalists, back.spin]).toEqual([false, null, null]);
  });
});

describe('castigos sin votar', () => {
  it('cerrar sin votos (la tele se recargó o se saltó la votación) elige 3 distintos al azar', () => {
    const v = new PunishmentVote(OPTIONS);
    expect(v.close()).toBe(true);
    expect(new Set(v.finalists).size).toBe(3);
    expect(v.close()).toBe(false); // ya cerrada
    expect(v.finalists).toContain(v.spinWheel(1));
  });
});
