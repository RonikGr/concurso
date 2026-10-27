import { describe, expect, it } from 'vitest';
import { DalgonaRound, GlassBridgeRound, MARBLES, MarblesRound, RedLightRound, SPHASE, SquidState, TugRound } from '../src/core/squid.js';
import { DALGONA_SHAPES, MAX_CRACKS, createTrace, isBroken, isDone, shapePoints, traceLift, traceMove, traceProgress } from '../src/core/dalgona.js';

/** Azar predecible */
function seeded(seed = 1) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

describe('Squid Games: la sección', () => {
  it('números (alguien lleva el 456), eliminados, hucha y revivir', () => {
    const s = new SquidState();
    s.begin(['a', 'b', 'c', 'd'], seeded(3));
    expect(Object.values(s.numbers)).toContain(456);
    expect(new Set(Object.values(s.numbers)).size).toBe(4);
    expect(s.eliminate(['a', 'x', 'b'], 'luzroja', 2)).toEqual(['a', 'b']);
    expect([s.alive, s.pot, s.share]).toEqual([['c', 'd'], 4, 2]);
    expect(s.revive('a')).toBe(true);
    expect([s.alive.length, s.pot]).toEqual([3, 2]);
    expect(new SquidState(JSON.parse(JSON.stringify(s.toJSON()))).toJSON()).toEqual(s.toJSON());
  });
});

describe('Luz roja, luz verde', () => {
  it('alterna verde y rojo; moverse en rojo (pasado el respiro) deja fuera', () => {
    const r = new RedLightRound({ roundId: 'r', players: ['a', 'b', 'c'], seconds: 30, rng: seeded(5) });
    r.start(0);
    expect(r.cues[0]).toEqual({ t: 3000, light: 'green' });
    const red = r.cues.find((c) => c.light === 'red');
    expect(r.fault('a', red.t - 10, red.t)).toBe(false); // aún verde
    expect(r.fault('a', red.t + 100, red.t + 100)).toBe(false); // respiro para soltar
    expect(r.fault('a', red.t + 600, red.t + 600)).toBe(true);
    expect(r.report('b', 100, red.t + 700)).toBe(true); // cruza
    expect(r.fault('b', red.t + 800, red.t + 800)).toBe(false); // ya está a salvo
    expect(r.finish(40_000).sort()).toEqual(['a', 'c']); // Cris no llegó
  });

  it('si no llega nadie, se salva quien más avanzó', () => {
    const r = new RedLightRound({ roundId: 'r', players: ['a', 'b'], seconds: 10, rng: seeded(2) });
    r.start(0);
    r.report('a', 40, 5000);
    r.report('b', 70, 5000);
    expect(r.finish(20_000)).toEqual(['a']);
  });
});

describe('El panal', () => {
  it('sobres, terminar, romper y no dejar a nadie sin salvar', () => {
    const r = new DalgonaRound({ roundId: 'p', players: ['a', 'b', 'c'], rng: seeded(7) });
    expect(r.pick('a', 2)).toBe(true);
    expect(r.pick('a', 1)).toBe(false); // ya eligió
    r.start(0);
    expect(r.shapeOf('b')).not.toBeNull(); // al empezar, sobre al azar a quien no eligió
    r.report('a', [100, 0, 1], 5000);
    r.report('b', [60, 3, 2], 5000);
    expect(r.state).toEqual({ a: 'done', b: 'broken' });
    expect(r.finish().sort()).toEqual(['b', 'c']);
  });

  it('formas: repasar entera la termina; salirse tres veces la rompe', () => {
    for (const id of Object.keys(DALGONA_SHAPES)) expect(shapePoints(id).length, id).toBeGreaterThan(60);
    const t = createTrace('circulo');
    for (const [x, y] of shapePoints('circulo')) traceMove(t, x, y);
    expect(traceProgress(t)).toBeGreaterThan(0.95); // al llegar al 96 %, terminada
    expect(isDone(t)).toBe(true);
    const b = createTrace('estrella');
    for (let k = 0; k < MAX_CRACKS; k++) {
      traceMove(b, 0.5, 0.5); // el centro, lejos de la línea: grieta
      traceLift(b);
    }
    expect(isBroken(b)).toBe(true);
  });
});

describe('El puente de cristal', () => {
  it('quien falla cae y el siguiente ya conoce ese tramo; al llegar, cruzan todos los que quedan', () => {
    const r = new GlassBridgeRound({ roundId: 'g', players: ['a', 'b', 'c', 'd'], steps: 3, rng: seeded(11) });
    r.start(0);
    const [p1, p2] = r.queue;
    const wrong = (s) => (r.safe[s] === 'L' ? 'R' : 'L');
    expect(r.choose(p2, 'L', 5000)).toBeNull(); // no le toca
    expect(r.choose(p1, wrong(0), 5000)).toEqual({ ok: false, step: 0 });
    expect(r.current).toBe(p2);
    expect(r.choose(p2, r.safe[1], 6000)).toEqual({ ok: true, step: 1 });
    r.choose(p2, r.safe[2], 7000);
    expect(r.phase).toBe(SPHASE.DONE);
    expect(r.out).toEqual([p1]);
    expect(r.crossed.length).toBe(3);
  });

  it('si no elige a tiempo, le empujan; si caen todos, se salva el que llegó más lejos', () => {
    const r = new GlassBridgeRound({ roundId: 'g', players: ['a', 'b'], steps: 4, seconds: 10, rng: seeded(4) });
    r.start(0);
    expect(r.push(5000)).toBeNull(); // aún tiene tiempo
    const [p1, p2] = r.queue;
    r.choose(p1, r.safe[0], 4000); // acierta el 1.º
    r.choose(p1, r.safe[1] === 'L' ? 'R' : 'L', 5000); // cae en el 2.º
    const m = r.push(30_000); // a p2 le empujan (en el 3.º)
    expect(r.moves.at(-1)).toMatchObject({ id: p2, pushed: true, step: 2 });
    if (!m.ok) {
      r.choose(p2, r.safe[3] === 'L' ? 'R' : 'L', 31_000);
    }
    expect(r.out.length).toBeLessThan(2);
  });
});

describe('Tira y afloja', () => {
  it('dos bandos; gana el de más toques por cabeza y el otro queda fuera', () => {
    const r = new TugRound({ roundId: 't', players: ['a', 'b', 'c', 'd', 'e'], rng: seeded(9) });
    expect(r.sides.A.length + r.sides.B.length).toBe(5);
    r.start(0);
    for (const id of r.sides.A) r.report(id, 50, 5000);
    for (const id of r.sides.B) r.report(id, 30, 5000);
    expect(r.rope).toBeLessThan(0);
    expect(r.finish().sort()).toEqual([...r.sides.B].sort());
  });
});

describe('Canicas', () => {
  it('pares o nones: acertar se lleva lo apostado; sin canicas, fuera; al acabar el tiempo, pierde quien tenga menos', () => {
    const r = new MarblesRound({ roundId: 'm', players: ['a', 'b', 'c'], rng: seeded(13) });
    expect(r.bye).not.toBeNull(); // impares: uno se salva sin jugar
    r.start(0);
    const d = r.duels[0];
    const [h, g] = [d.hider, d.hider === d.a ? d.b : d.a];
    expect(r.guess(g, 0, 3, 5000)).toBe(false); // aún no ha escondido
    expect(r.hide(h, 4, 5000)).toBe(true);
    expect(r.guess(g, 0, 3, 6000)).toBe(true); // 4 es par: acierta
    expect(d.marbles).toEqual({ [h]: MARBLES - 3, [g]: MARBLES + 3 });
    expect(d.hider).toBe(g); // ahora esconde el otro
    r.hide(g, 1, 7000);
    r.guess(h, 0, MARBLES - 3, 8000); // dice pares y era nones: lo paga todo
    expect(d.loser).toBe(h);
    expect(r.allDecided).toBe(true);
    expect(r.finish()).toEqual([h]);
  });
});
