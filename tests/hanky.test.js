import { describe, expect, it } from 'vitest';
import { HSTEP, HankyDuels } from '../src/core/hanky.js';

/** Azar predecible */
function seeded(seed = 1) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

describe('El pañuelo (lobos contra vampiros)', () => {
  it('cada uno sale una vez; del equipo pequeño repiten los que menos han salido', () => {
    const d = new HankyDuels({ wolves: ['w1', 'w2', 'w3'], vampires: ['v1', 'v2'] });
    expect(d.total).toBe(3);
    const rng = seeded(3);
    for (let k = 0; k < 3; k++) {
      expect(d.draw(k * 1000, rng)).toBe(true);
      expect(d.draw(k * 1000, rng)).toBe(false); // ya hay un duelo en marcha
      d.go(k * 1000 + 10);
      expect(d.win(k % 2 ? 'vampire' : 'wolf', k * 1000 + 5000, 10)).toBeTruthy();
    }
    expect(d.finished).toBe(true);
    expect(d.draw(9000, rng)).toBe(false);
    // los tres lobos, una vez cada uno; un vampiro repite (y solo uno)
    expect(['w1', 'w2', 'w3'].map((id) => d.count(id))).toEqual([1, 1, 1]);
    expect(['v1', 'v2'].map((id) => d.count(id)).sort()).toEqual([1, 2]);
    expect(d.score()).toEqual({ wolf: 2, vampire: 1 });
    expect(d.champion).toBe('wolf');
  });

  it('en secreto, salida nula, deshacer y cambiar la pareja', () => {
    const d = new HankyDuels({ wolves: ['w1', 'w2'], vampires: ['v1', 'v2'] });
    expect(d.choose('v1', 'w1', 0)).toBe(false); // cada uno de su equipo
    expect(d.choose('w2', 'v1', 0)).toBe(true);
    expect(d.current.mode).toBe('secret');
    expect(d.win('wolf', 100, 10)).toBe('w2'); // se puede dar el ganador aunque no se haya dado la salida
    expect(d.undo()).toMatchObject({ winner: 'wolf', points: 10 });
    expect(d.current.step).toBe(HSTEP.CALLED);
    expect(d.duels).toHaveLength(0);
    expect(d.go(200, 3000)).toBe(true);
    expect(d.current.goAt).toBe(3200);
    expect(d.falseStart()).toBe(true);
    expect(d.current.step).toBe(HSTEP.CALLED);
    expect(d.cancel()).toBe(true);
    expect(d.current).toBeNull();
    expect(d.draw(0, seeded(1))).toBe(true);
    d.go(0, 0);
    expect(d.win('vampire', 1500, 10)).toMatch(/^v/);
    expect(d.duels[0].ms).toBe(1500);
  });

  it('se guarda y se recupera; la gente que llega tarde se suma a su equipo', () => {
    const d = new HankyDuels({ wolves: ['w1'], vampires: ['v1'] });
    d.draw(0, seeded(2));
    d.join({ wolves: ['w1', 'w2'], vampires: ['v1'] });
    const back = HankyDuels.fromJSON(JSON.parse(JSON.stringify(d.toJSON())));
    expect(back.wolves).toEqual(['w1', 'w2']);
    expect(back.total).toBe(2);
    expect(back.current).toMatchObject({ wolf: 'w1', vampire: 'v1', step: HSTEP.CALLED });
  });
});
