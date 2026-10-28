import { describe, expect, it } from 'vitest';
import { BRIDGE_JUMP_MS, BRIDGE_REVEAL_MS, CHANT, MARBLE_ALL_IN_MS, spareToFloor, squidCap, squidFloor, DalgonaRound, GlassBridgeRound, MARBLES, MarblesRound, RedLightRound, SPHASE, SquidState, TugRound, chantTimes } from '../src/core/squid.js';
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
    expect(r.cues[0]).toMatchObject({ t: 3000, light: 'green' });
    const red = r.cues.find((c) => c.light === 'red');
    expect(red.t).toBe(r.cues[0].t + r.cues[0].len); // rojo justo al acabar la frase
    expect(r.fault('a', red.t - 10, red.t)).toBe(false); // aún verde
    expect(r.fault('a', red.t + 100, red.t + 100)).toBe(false); // respiro para soltar
    expect(r.fault('a', red.t + 600, red.t + 600)).toBe(true);
    expect(r.report('b', 100, red.t + 700)).toBe(true); // cruza
    expect(r.fault('b', red.t + 800, red.t + 800)).toBe(false); // ya está a salvo
    // Cris no llegó, pero con 3 cae como mucho 1 (Ana): Cris se salva por los pelos
    expect(r.finish(40_000)).toEqual(['a']);
    expect(r.spared).toEqual(['c']);
  });

  it('pasado el tope, a quien pilla la muñeca se salva en el momento (y ya no juega)', () => {
    const r = new RedLightRound({ roundId: 'r', players: ['a', 'b', 'c', 'd'], seconds: 30, cap: 1, rng: seeded(5) });
    r.start(0);
    const red = r.cues.find((c) => c.light === 'red');
    expect(r.fault('a', red.t + 600, red.t + 600)).toBe(true);
    expect(r.fault('b', red.t + 700, red.t + 700)).toBe(true);
    expect([r.out, r.spared]).toEqual([['a'], ['b']]);
    expect(r.report('b', 50, red.t + 800)).toBe(false); // ya no avanza
    r.report('c', 100, red.t + 900);
    expect(r.finish(40_000)).toEqual(['a']); // Dani no llegó, pero ya no cabe nadie más
    expect(r.spared.sort()).toEqual(['b', 'd']);
  });

  it('la muñeca canta cada vez más deprisa y la frase llena el verde entero', () => {
    const r = new RedLightRound({ roundId: 'r', players: ['a'], seconds: 120, rng: seeded(8) });
    r.start(0);
    const greens = r.cues.filter((c) => c.light === 'green');
    const avg = (list) => list.reduce((s, c) => s + c.len, 0) / list.length;
    expect(avg(greens.slice(0, 3))).toBeGreaterThan(avg(greens.slice(-4, -1)) * 1.4);
    r.cues.forEach((c, i) => {
      const next = r.cues[i + 1];
      if (c.light === 'green' && next) expect(next.t).toBe(c.t + c.len);
    });
    const times = chantTimes(4000, 0.5);
    expect(times).toHaveLength(CHANT.length);
    expect(times[0]).toBe(0);
    expect(times.every((t, i) => i === 0 || t > times[i - 1])).toBe(true);
    expect(times.at(-1)).toBeLessThan(4000);
    expect(times[5]).toBeGreaterThan(chantTimes(4000, 0)[5]); // con prisa: la primera mitad, más lenta
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
    expect(r.finish()).toEqual(['b']); // con 3 cae uno: Cris, sin terminar, se salva
    expect(r.spared).toEqual(['c']);
  });

  it('pasado el tope, la galleta que se rompe se salva en el momento', () => {
    const r = new DalgonaRound({ roundId: 'p', players: ['a', 'b', 'c'], cap: 1, rng: seeded(7) });
    r.start(0);
    r.report('a', [30, 3, 2], 5000);
    r.report('b', [40, 3, 2], 6000);
    expect(r.state).toEqual({ a: 'broken', b: 'spared' });
    expect(r.spared).toEqual(['b']);
    r.report('c', [100, 0, 1], 7000);
    expect(r.allSettled).toBe(true);
    expect(r.finish()).toEqual(['a']);
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
  it('por relevos: cada uno salta un tramo; quien falla cae y el tramo ya se sabe; al completarlo cruzan todos', () => {
    const r = new GlassBridgeRound({ roundId: 'g', players: ['a', 'b', 'c', 'd'], steps: 3, rng: seeded(11) });
    r.start(0);
    const [p1, p2, p3] = r.queue;
    const wrong = (s) => (r.safe[s] === 'L' ? 'R' : 'L');
    expect(r.choose(p2, 'L', 5000)).toBeNull(); // no le toca
    expect(r.choose(p1, wrong(0), 5000)).toEqual({ ok: false, step: 0 });
    expect(r.current).toBe(p2);
    expect(r.choose(p2, r.safe[1], 6000)).toEqual({ ok: true, step: 1 });
    expect(r.current).toBe(p3); // aunque acierte, salta el siguiente
    r.choose(p3, r.safe[2], 7000);
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
    r.push(30_000); // a p2 le empujan (en el 2.º)
    expect(r.moves.at(-1)).toMatchObject({ id: p2, pushed: true, step: 1 });
    while (r.phase === SPHASE.RUNNING) r.choose(r.current, r.safe[r.pos] === 'L' ? 'R' : 'L', 40_000);
    expect(r.out.length).toBeLessThan(2);
  });
});

describe('El puente de cristal con suspense', () => {
  it('mientras se ve un salto nadie elige; el resultado se sabe a su hora (3,5–5,7 s) y el juego acaba tras el último', () => {
    const r = new GlassBridgeRound({ roundId: 'g', players: ['a', 'b', 'c', 'd'], steps: 2, seconds: 10, jumpMs: BRIDGE_JUMP_MS, rng: seeded(6) });
    r.start(0);
    const [p1, p2] = r.queue;
    const wrong = (s) => (r.safe[s] === 'L' ? 'R' : 'L');
    r.choose(p1, wrong(0), 5000);
    const m = r.moves[0];
    expect(m.reveal).toBeGreaterThanOrEqual(BRIDGE_REVEAL_MS - 1100);
    expect(m.reveal).toBeLessThanOrEqual(BRIDGE_REVEAL_MS + 1100);
    expect(r.fellBy(5000 + m.reveal - 1)).toEqual([]); // aún no se ha visto
    expect(r.fellBy(5000 + m.reveal)).toEqual([p1]);
    expect(r.choose(p2, r.safe[1], 6000)).toBeNull(); // aún se ve el salto de p1
    expect(r.push(m.ends + 9000)).toBeNull(); // su tiempo cuenta tras el salto
    expect(r.choose(p2, r.safe[1], m.ends)).toEqual({ ok: true, step: 1 });
    expect(r.phase).toBe(SPHASE.RUNNING); // falta ver el último salto
    expect(r.closesAt).toBe(r.moves[1].ends);
    expect(r.current).toBeNull();
    expect(r.finish()).toEqual([p1]);
  });

  it('todos saltan; caída la mitad, el cristal malo cruje pero aguanta; los que esperan apuestan', () => {
    const ids = ['a', 'b', 'c', 'd'];
    const r = new GlassBridgeRound({ roundId: 'g', players: ids, rng: seeded(3) });
    expect([r.steps, r.cap]).toEqual([5, 2]);
    r.start(0);
    const wrong = (s) => (r.safe[s] === 'L' ? 'R' : 'L');
    const waiting = () => ids.filter((id) => id !== r.current && !r.fell.includes(id));
    expect(r.bet(r.current, 'L', 4000)).toBe(false); // quien salta no apuesta
    for (const id of waiting()) expect(r.bet(id, r.safe[r.pos], 4000)).toBe(true);
    expect(r.tally()[r.safe[r.pos]]).toBe(3);
    const jumpers = [];
    let t = 4000;
    while (r.phase === SPHASE.RUNNING && r.closesAt == null) {
      jumpers.push(r.current);
      r.choose(r.current, wrong(r.pos), t); // todos fallan
      t += 1000;
    }
    expect(new Set(jumpers)).toEqual(new Set(ids)); // el último del relevo también salta
    expect(r.fell.length).toBe(2); // la mitad
    expect(r.moves.filter((m) => m.held).length).toBe(r.steps - 2); // los demás, por los pelos
    expect(r.crossed.length).toBe(2);
    expect(r.spared.length).toBe(2);
    expect(Object.values(r.hits)).toEqual([1, 1, 1]); // acertaron el primer tramo
    expect(r.moves[0].tally).toBeDefined();
  });
});

describe('Squid Games: equilibrio y repetir', () => {
  it('lo guardado antes de un juego no cambia al eliminar (R vuelve de verdad atrás)', () => {
    const s = new SquidState();
    s.begin(['a', 'b', 'c'], seeded(2));
    const before = s.toJSON();
    s.eliminate(['a'], 'luzroja', 2);
    const back = new SquidState(before);
    expect([back.alive.length, back.out.length, back.pot]).toEqual([3, 0, 0]);
  });

  it('sin tope, cae como mucho el 40 % (los que se mueven primero; luego los que menos avanzaron)', () => {
    const ids = Array.from({ length: 10 }, (_, i) => `p${i}`);
    const r = new RedLightRound({ roundId: 'r', players: ids, seconds: 30, rng: seeded(3) });
    r.start(0);
    ids.forEach((id, i) => r.report(id, i * 5, 5000));
    const red = r.cues.find((c) => c.light === 'red');
    r.fault('p9', red.t + 600, red.t + 600);
    const out = r.finish(40_000).sort();
    expect(out).toEqual(['p0', 'p1', 'p2', 'p9']);
    expect(r.spared.length).toBe(6);
  });

  it('en la cuerda nadie gana en los primeros 7 s; el puente tiene tramos para todos', () => {
    const t = new TugRound({ roundId: 't', players: ['a', 'b'], rng: seeded(1) });
    t.start(0);
    t.report(t.sides.A[0], 200, 4000);
    expect(t.decided(4000)).toBe(false);
    expect(t.decided(10_000)).toBe(true);
    expect(new GlassBridgeRound({ roundId: 'g', players: ['a', 'b', 'c', 'd', 'e'] }).steps).toBe(6); // uno por cabeza y uno más
    expect(new GlassBridgeRound({ roundId: 'g', players: Array.from({ length: 20 }, (_, i) => `p${i}`) }).steps).toBe(21);
  });
});

describe('Squid Games: que llegue gente al final y la hucha exacta', () => {
  it('ningún juego deja menos vivos que el mínimo: se salvan los mejores de los que caen', () => {
    expect([squidFloor(20), squidFloor(9), squidFloor(2)]).toEqual([5, 3, 2]);
    const score = { a: 10, b: 50, c: 30 };
    expect(spareToFloor(['a', 'b', 'c', 'd'], ['a', 'b', 'c'], 3, (id) => score[id])).toEqual({ out: ['a'], spared: ['b', 'c'] });
    expect(spareToFloor(['a', 'b', 'c', 'd'], ['a'], 3, () => 0)).toEqual({ out: ['a'], spared: [] });
  });

  it('el tope de cada juego reparte las caídas: todos eliminan a alguien y llega gente al puente', () => {
    // 9 jugadores, suelo 3: sobran 6 para 4 juegos antes del puente
    const caps = [];
    let alive = 9;
    for (const [game, left] of [['luzroja', 4], ['panal', 3], ['cuerda', 2], ['canicas', 1]]) {
      const cap = squidCap(game, { alive, started: 9, gamesLeft: left });
      caps.push(cap);
      alive -= cap; // caen todos los que pueden
    }
    expect(caps).toEqual([2, 1, 2, 1]);
    expect(alive).toBe(squidFloor(9));
    expect(squidCap('puente', { alive: 3, started: 9 })).toBe(1);
    expect(squidCap('luzroja', { alive: 20, started: 20, gamesLeft: 4 })).toBe(4);
    expect(squidCap('luzroja', { alive: 4, started: 4, gamesLeft: 4 })).toBe(1); // con 4, suelo 2: uno aquí y otro luego
    expect(squidCap('cuerda', { alive: 2, started: 4, gamesLeft: 2 })).toBe(0);
    expect(squidCap('puente', { alive: 1, started: 4 })).toBe(0);
  });

  it('la hucha se reparte entera, sin inventar puntos (el resto, uno más a los primeros)', () => {
    const s = new SquidState();
    s.begin(['a', 'b', 'c'], seeded(4));
    s.pot = 11;
    const sh = s.shares();
    expect(Object.values(sh).reduce((x, y) => x + y, 0)).toBe(11);
    expect(Object.values(sh).sort()).toEqual([3, 4, 4]);
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

  it('con tope, del bando que pierde caen los que menos tiraron; el resto se salva', () => {
    const r = new TugRound({ roundId: 't', players: ['a', 'b', 'c', 'd', 'e', 'f'], cap: 1, rng: seeded(9) });
    r.start(0);
    r.sides.A.forEach((id) => r.report(id, 50, 5000));
    r.sides.B.forEach((id, i) => r.report(id, 10 + i * 5, 5000));
    expect(r.finish()).toEqual([r.sides.B[0]]);
    expect(r.spared).toEqual(r.sides.B.slice(1));
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

describe('Canicas: un solo duelo, todo o nada y tope', () => {
  it('con un duelo, 45 s; en los últimos 10 s se apuesta todo; con el reloj a cero no se empieza otra jugada', () => {
    const r = new MarblesRound({ roundId: 'c', players: ['a', 'b'], seconds: 90, rng: seeded(5) });
    expect(r.seconds).toBe(45);
    r.start(0);
    const d = r.duels[0];
    const [h, g] = [d.hider, d.hider === d.a ? d.b : d.a];
    const late = r.endsAt - MARBLE_ALL_IN_MS + 100;
    expect(r.allIn(late)).toBe(true);
    r.hide(h, 2, late);
    expect(r.guess(g, 1, 1, late + 100)).toBe(true); // dice nones y eran pares: apostaba 1… pero es todo o nada
    expect(d.last).toMatchObject({ allIn: true, bet: MARBLES, amount: MARBLES });
    expect(d.loser).toBe(g);
    const t = new MarblesRound({ roundId: 'c', players: ['a', 'b'], rng: seeded(2) });
    t.start(0);
    expect(t.hide(t.duels[0].hider, 1, t.endsAt + 10)).toBe(false);
    expect(t.autoPlay(t.endsAt + 20_000)).toBe(0);
  });

  it('pasado el tope, quien pierde el duelo se salva', () => {
    const r = new MarblesRound({ roundId: 'c', players: ['a', 'b', 'c', 'd'], cap: 1, rng: seeded(5) });
    r.start(0);
    for (const d of r.duels) {
      const g = d.hider === d.a ? d.b : d.a;
      r.hide(d.hider, 2, 5000);
      r.guess(g, 1, MARBLES, 6000); // falla y lo pierde todo
    }
    expect(r.out.length).toBe(1);
    expect(r.spared.length).toBe(1);
    expect(r.duels[1].spared).toBe(true);
  });
});

describe('Canicas: nadie se queda parado', () => {
  it('si alguien no esconde o no apuesta en 20 s, juega la suerte por él; el empate al final se marca', () => {
    const r = new MarblesRound({ roundId: 'c', players: ['a', 'b'], seconds: 120, rng: seeded(5) });
    r.start(0);
    const d = r.duels[0];
    expect(r.autoPlay(10_000)).toBe(0);
    expect(r.autoPlay(3000 + 20_000)).toBe(1); // escondió solo
    expect(d.hidden).not.toBeNull();
    expect(r.autoPlay(3000 + 40_000)).toBe(1); // y el otro apostó solo
    expect([d.hidden, d.turns]).toEqual([null, 1]);
    const t = new MarblesRound({ roundId: 'c', players: ['a', 'b'], rng: seeded(2) });
    t.start(0);
    t.finish();
    expect(t.duels[0].coin).toBe(true);
  });
});
