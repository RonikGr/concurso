// Squid Games: una sección con varios juegos seguidos desde el móvil (Luz roja, El panal, El puente de cristal, Tira y
// afloja, Canicas) en la que la gente se va eliminando. Cada eliminado mete puntos en la hucha y, al final, los
// supervivientes se la reparten. Lógica pura: la tele (host/games/squid.js) la usa y la prueban los tests.
//
// Cada juego es una ronda: ready ──start──▶ running ──finish──▶ done (devuelve quién queda fuera). Si un juego fuera a
// dejar fuera a todos, se salvan los que mejor lo han hecho (nunca se queda la sección sin nadie).
import { DALGONA_SHAPES } from './dalgona.js';

export const SQUID_GAMES = {
  luzroja: { label: 'Luz roja, luz verde', icon: '🚦', seconds: 60, min: 1, rule: 'Mantén el botón para avanzar en verde. En rojo, ¡ni un dedo! Si te mueves, fuera.' },
  panal: { label: 'El panal', icon: '🍪', seconds: 90, min: 1, rule: 'Elige un sobre y repasa la forma sin salirte. Si se rompe, fuera.' },
  puente: { label: 'El puente de cristal', icon: '🌉', seconds: 15, min: 1, rule: 'Por turnos: ¿izquierda o derecha? Un cristal aguanta; el otro, no.' },
  cuerda: { label: 'Tira y afloja', icon: '🪢', seconds: 20, min: 2, rule: 'Dos bandos al azar: toca lo más rápido que puedas. El bando que pierde, fuera.' },
  canicas: { label: 'Canicas', icon: '🔮', seconds: 150, min: 2, rule: 'Duelos de pares o nones: quien se queda sin canicas, fuera.' },
};
export const SQUID_ORDER = ['luzroja', 'panal', 'puente', 'cuerda', 'canicas'];
export const SPHASE = { READY: 'ready', RUNNING: 'running', DONE: 'done' };
export const COUNTDOWN_MS = 3000;

const shuffle = (list, rng) => {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const randInt = (rng, min, max) => min + Math.floor(rng() * (max - min + 1));

/** Si todos quedarían fuera, se salvan los de mejor marca (score: mayor = mejor). */
function spareBest(players, out, score) {
  if (!players.length || out.length < players.length) return out;
  const best = Math.max(...players.map(score));
  return out.filter((id) => score(id) < best);
}

// ------------------------------------------------------------------------------------------ la sección

/** Lo que dura toda la sección: números, quién sigue vivo, quién cayó (y en qué juego) y la hucha. */
export class SquidState {
  constructor(saved = null) {
    this.numbers = saved?.numbers ?? {}; // playerId → número (1…456)
    this.alive = saved?.alive ?? [];
    this.out = saved?.out ?? []; // [{id, game, pot}] en orden de caída
    this.pot = saved?.pot ?? 0;
    this.started = saved?.started ?? false;
  }

  /** Empieza la sección con quienes juegan: a cada uno, un número al azar (alguien se lleva el 456). */
  begin(ids, rng = Math.random) {
    if (this.started) return false;
    const pool = shuffle(
      Array.from({ length: 455 }, (_, i) => i + 1),
      rng,
    );
    const order = shuffle(ids, rng);
    order.forEach((id, i) => (this.numbers[id] = i === 0 ? 456 : pool[i]));
    this.alive = [...ids];
    this.started = true;
    return true;
  }

  /** Quedan fuera: salen de los vivos y cada uno mete `perHead` en la hucha. */
  eliminate(ids, game, perHead) {
    const gone = ids.filter((id) => this.alive.includes(id));
    this.alive = this.alive.filter((id) => !gone.includes(id));
    for (const id of gone) this.out.push({ id, game, pot: perHead });
    this.pot += gone.length * perHead;
    return gone;
  }

  /** El presentador lo devuelve al juego (y la hucha devuelve lo suyo). */
  revive(id) {
    const i = this.out.findIndex((x) => x.id === id);
    if (i < 0) return false;
    this.pot -= this.out[i].pot;
    this.out.splice(i, 1);
    this.alive.push(id);
    return true;
  }

  /** Lo que se lleva cada superviviente al final. */
  get share() {
    return this.alive.length ? Math.floor(this.pot / this.alive.length) : 0;
  }

  toJSON() {
    const { numbers, alive, out, pot, started } = this;
    return { numbers, alive, out, pot, started };
  }
}

// ------------------------------------------------------------------------------------------ 1. Luz roja, luz verde

const RED_GRACE_MS = 450; // al ponerse en rojo, un momento para soltar (reflejos humanos)
const HOLD_SHARE = 0.5; // hay que mantener el botón la mitad del tiempo en verde para llegar

/**
 * El presentador da la salida; tras 3-2-1 se alternan verde (2–5,5 s) y rojo (2–3,5 s) al azar. En verde, mantener el
 * botón avanza (el móvil lleva la cuenta y la manda); en rojo, tocar o moverse (sensor) deja fuera. Quien llega al 100 %
 * se salva; al acabar el tiempo, quien no ha llegado, fuera.
 */
export class RedLightRound {
  constructor({ roundId, players, seconds = 60, rng = Math.random }) {
    Object.assign(this, { roundId, players: [...players], seconds, phase: SPHASE.READY });
    this.rng = rng;
    this.cues = []; // [{t, light}] en hora del presentador
    this.progress = {};
    this.crossed = {}; // id → instante
    this.fallen = {}; // id → {t, why}
    this.speed = 0; // % por ms con el botón pulsado
  }

  start(now) {
    if (this.phase !== SPHASE.READY) return false;
    this.phase = SPHASE.RUNNING;
    this.tOpen = now + COUNTDOWN_MS;
    this.endsAt = this.tOpen + this.seconds * 1000;
    let t = this.tOpen;
    let green = 0;
    let light = 'green';
    while (t < this.endsAt) {
      this.cues.push({ t, light });
      const len = light === 'green' ? randInt(this.rng, 2000, 5500) : randInt(this.rng, 2000, 3500);
      if (light === 'green') green += Math.min(len, this.endsAt - t);
      t += len;
      light = light === 'green' ? 'red' : 'green';
    }
    this.speed = 100 / (green * HOLD_SHARE);
    return true;
  }

  /** Luz en un instante (antes de empezar, roja: aún no se puede andar). */
  lightAt(t) {
    let light = 'red';
    let since = this.tOpen ?? 0;
    for (const c of this.cues) {
      if (c.t > t) break;
      light = c.light;
      since = c.t;
    }
    return { light, since };
  }

  #playing(id) {
    return this.phase === SPHASE.RUNNING && this.players.includes(id) && !(id in this.crossed) && !(id in this.fallen);
  }

  /** El móvil manda cuánto ha avanzado (0–100). */
  report(id, p, now) {
    if (!this.#playing(id) || !Number.isFinite(p) || now < this.tOpen) return false;
    this.progress[id] = Math.max(this.progress[id] ?? 0, Math.min(100, p));
    if (this.progress[id] >= 100) this.crossed[id] = now;
    return true;
  }

  /** Se ha movido (tocó el botón o el sensor saltó) en el instante t: si era rojo (pasado el respiro), fuera. */
  fault(id, t, now) {
    if (!this.#playing(id)) return false;
    if (!Number.isFinite(t) || t > now + 1000 || t < this.tOpen) t = now; // sin hora fiable: cuando llega
    const { light, since } = this.lightAt(t);
    if (light !== 'red' || t - since < RED_GRACE_MS) return false;
    this.fallen[id] = { t, why: 'moved' };
    return true;
  }

  /** Se acabó el tiempo: quien no ha cruzado, fuera. @returns ids fuera */
  finish(now) {
    if (this.phase !== SPHASE.RUNNING) return null;
    this.phase = SPHASE.DONE;
    for (const id of this.players) if (!(id in this.crossed) && !(id in this.fallen)) this.fallen[id] = { t: now, why: 'time' };
    const out = spareBest(this.players, Object.keys(this.fallen), (id) => this.progress[id] ?? 0);
    for (const id of Object.keys(this.fallen)) if (!out.includes(id)) delete this.fallen[id];
    return out;
  }

  get out() {
    return Object.keys(this.fallen);
  }
}

// ------------------------------------------------------------------------------------------ 2. El panal (dalgona)

const PANAL_DONE = 1;
const PANAL_BROKEN = 2;

/**
 * Cada uno elige un sobre (dentro, una forma: círculo, triángulo, estrella o paraguas) y la repasa con el dedo en el
 * móvil sin salirse (core/dalgona.js). El móvil manda cuánto lleva, las grietas y si la ha terminado o roto.
 */
export class DalgonaRound {
  constructor({ roundId, players, seconds = 90, rng = Math.random }) {
    Object.assign(this, { roundId, players: [...players], seconds, phase: SPHASE.READY });
    this.rng = rng;
    this.envelopes = shuffle(Object.keys(DALGONA_SHAPES), rng); // sobre i → forma (la misma para todos)
    this.picks = {}; // id → nº de sobre
    this.progress = {}; // id → 0–100
    this.cracks = {};
    this.state = {}; // id → 'done' | 'broken'
  }

  shapeOf(id) {
    return id in this.picks ? this.envelopes[this.picks[id]] : null;
  }

  /** Elegir sobre (antes de empezar o al principio). */
  pick(id, envelope) {
    if (this.phase === SPHASE.DONE || !this.players.includes(id) || id in this.picks) return false;
    if (!Number.isInteger(envelope) || envelope < 0 || envelope >= this.envelopes.length) return false;
    this.picks[id] = envelope;
    return true;
  }

  start(now) {
    if (this.phase !== SPHASE.READY) return false;
    for (const id of this.players) if (!(id in this.picks)) this.picks[id] = randInt(this.rng, 0, this.envelopes.length - 1);
    this.phase = SPHASE.RUNNING;
    this.tOpen = now + COUNTDOWN_MS;
    this.endsAt = this.tOpen + this.seconds * 1000;
    return true;
  }

  /** Lo que manda el móvil: [progreso 0–100, grietas, estado 0 repasando | 1 terminada | 2 rota]. */
  report(id, [p, cracks, state], now) {
    if (this.phase !== SPHASE.RUNNING || !this.players.includes(id) || id in this.state || now < this.tOpen) return false;
    this.progress[id] = Math.max(this.progress[id] ?? 0, Math.min(100, Number(p) || 0));
    this.cracks[id] = Math.max(0, Number(cracks) || 0);
    if (state === PANAL_DONE) this.state[id] = 'done';
    else if (state === PANAL_BROKEN) this.state[id] = 'broken';
    return true;
  }

  get allSettled() {
    return this.players.every((id) => id in this.state);
  }

  finish() {
    if (this.phase !== SPHASE.RUNNING) return null;
    this.phase = SPHASE.DONE;
    const out = this.players.filter((id) => this.state[id] !== 'done');
    this.outIds = spareBest(this.players, out, (id) => (this.state[id] === 'done' ? 200 : (this.progress[id] ?? 0)));
    return this.outIds;
  }

  get out() {
    return this.outIds ?? this.players.filter((id) => this.state[id] === 'broken');
  }
}

// ------------------------------------------------------------------------------------------ 3. El puente de cristal

/**
 * Salen de uno en uno (orden al azar). Quien está delante elige izquierda o derecha en el siguiente tramo: si acierta,
 * avanza y sigue; si falla, cae (fuera) y ese tramo ya se sabe. Quien llega al final cruza, y con él todos los que
 * esperaban (ya conocen el camino). Si no elige a tiempo, «le empujan» (al azar).
 */
export class GlassBridgeRound {
  constructor({ roundId, players, steps = null, seconds = 15, rng = Math.random }) {
    const n = players.length;
    Object.assign(this, { roundId, seconds, phase: SPHASE.READY });
    this.rng = rng;
    this.queue = shuffle(players, rng);
    this.players = [...this.queue];
    this.steps = steps ?? Math.max(3, Math.min(10, Math.ceil(n * 0.6)));
    this.safe = Array.from({ length: this.steps }, () => (rng() < 0.5 ? 'L' : 'R'));
    this.pos = 0; // primer tramo sin resolver
    this.turn = 0; // índice en la cola de quien juega
    this.fell = []; // ids, en orden
    this.crossed = [];
    this.moves = []; // [{id, step, side, ok, pushed}]
    this.turnEndsAt = null;
  }

  get current() {
    return this.phase === SPHASE.RUNNING ? (this.queue[this.turn] ?? null) : null;
  }

  start(now) {
    if (this.phase !== SPHASE.READY) return false;
    this.phase = SPHASE.RUNNING;
    this.tOpen = now + COUNTDOWN_MS;
    this.turnEndsAt = this.tOpen + this.seconds * 1000;
    return true;
  }

  /** Quien está delante elige 'L' o 'R'. @returns {ok, step} o null si no le toca */
  choose(id, side, now, { pushed = false } = {}) {
    if (this.current !== id || !['L', 'R'].includes(side) || now < this.tOpen) return null;
    const step = this.pos;
    const ok = this.safe[step] === side;
    this.moves.push({ id, step, side, ok, pushed });
    this.pos++; // acierte o caiga, ese tramo ya se sabe
    if (!ok) {
      this.fell.push(id);
      this.turn++;
    }
    if (this.pos >= this.steps) {
      // Camino completo: cruzan quien está delante (si no ha caído) y todos los que esperaban
      this.crossed = this.queue.slice(this.turn).filter((x) => !this.fell.includes(x));
      this.finish(now);
    } else if (this.turn >= this.queue.length) {
      this.finish(now); // han caído todos
    } else {
      this.turnEndsAt = now + this.seconds * 1000;
    }
    return { ok, step };
  }

  /** Se le acabó el tiempo a quien está delante: le empujan (al azar). */
  push(now) {
    if (this.phase !== SPHASE.RUNNING || now < this.turnEndsAt) return null;
    return this.choose(this.current, this.rng() < 0.5 ? 'L' : 'R', now, { pushed: true });
  }

  finish() {
    if (this.phase !== SPHASE.RUNNING) return null;
    this.phase = SPHASE.DONE;
    // Quien no llegó a salir (no debería pasar) también cruza; si cayeron todos, se salva quien llegó más lejos
    const reached = Object.fromEntries(this.moves.map((m) => [m.id, m.step + (m.ok ? 1 : 0)]));
    this.outIds = spareBest(this.players, [...this.fell], (id) => (this.fell.includes(id) ? (reached[id] ?? 0) : 999));
    return this.outIds;
  }

  get out() {
    return this.outIds ?? this.fell;
  }
}

// ------------------------------------------------------------------------------------------ 4. Tira y afloja

const TUG_WIN = 30; // toques de ventaja por cabeza para ganar antes de tiempo

/** Dos bandos al azar (con los vivos). Cada móvil manda sus toques; gana el bando con más toques por cabeza. */
export class TugRound {
  constructor({ roundId, players, seconds = 20, rng = Math.random }) {
    Object.assign(this, { roundId, players: [...players], seconds, phase: SPHASE.READY });
    const order = shuffle(players, rng);
    this.sides = { A: order.filter((_, i) => i % 2 === 0), B: order.filter((_, i) => i % 2 === 1) };
    this.taps = {};
    this.rng = rng;
    this.winner = null;
  }

  sideOf(id) {
    return this.sides.A.includes(id) ? 'A' : this.sides.B.includes(id) ? 'B' : null;
  }

  start(now) {
    if (this.phase !== SPHASE.READY) return false;
    this.phase = SPHASE.RUNNING;
    this.tOpen = now + COUNTDOWN_MS;
    this.endsAt = this.tOpen + this.seconds * 1000;
    return true;
  }

  report(id, taps, now) {
    if (this.phase !== SPHASE.RUNNING || !this.sideOf(id) || now < this.tOpen || now > this.endsAt + 600) return false;
    if (!Number.isFinite(taps)) return false;
    this.taps[id] = Math.max(this.taps[id] ?? 0, Math.min(Math.floor(taps), 400));
    return true;
  }

  #avg(side) {
    const list = this.sides[side];
    return list.length ? list.reduce((s, id) => s + (this.taps[id] ?? 0), 0) / list.length : 0;
  }

  /** −1 (gana A) … +1 (gana B): dónde está la cuerda. */
  get rope() {
    return Math.max(-1, Math.min(1, (this.#avg('B') - this.#avg('A')) / TUG_WIN));
  }

  /** ¿Ya hay ganador antes de tiempo? */
  get decided() {
    return Math.abs(this.rope) >= 1;
  }

  finish() {
    if (this.phase !== SPHASE.RUNNING) return null;
    this.phase = SPHASE.DONE;
    const r = this.rope;
    this.winner = r < 0 ? 'A' : r > 0 ? 'B' : this.rng() < 0.5 ? 'A' : 'B';
    return this.out;
  }

  get out() {
    return this.winner ? [...this.sides[this.winner === 'A' ? 'B' : 'A']] : [];
  }
}

// ------------------------------------------------------------------------------------------ 5. Canicas: pares o nones

export const MARBLES = 10;

/**
 * Duelos por parejas al azar (si sobra uno, se salva sin jugar). Por turnos, uno esconde canicas (1…las suyas) y el
 * otro dice pares o nones y apuesta: si acierta, se lleva lo apostado; si no, lo paga (nunca más de lo que hay). Quien
 * se queda sin canicas, fuera. Al acabar el tiempo, pierde quien tenga menos (empate: a suertes).
 */
export class MarblesRound {
  constructor({ roundId, players, seconds = 150, rng = Math.random }) {
    Object.assign(this, { roundId, players: [...players], seconds, phase: SPHASE.READY });
    this.rng = rng;
    const order = shuffle(players, rng);
    this.bye = order.length % 2 ? order.pop() : null;
    this.duels = [];
    for (let i = 0; i < order.length; i += 2) {
      const [a, b] = [order[i], order[i + 1]];
      this.duels.push({ a, b, marbles: { [a]: MARBLES, [b]: MARBLES }, hider: a, hidden: null, last: null, loser: null });
    }
  }

  duelOf(id) {
    return this.duels.find((d) => d.a === id || d.b === id) ?? null;
  }

  start(now) {
    if (this.phase !== SPHASE.READY) return false;
    this.phase = SPHASE.RUNNING;
    this.tOpen = now + COUNTDOWN_MS;
    this.endsAt = this.tOpen + this.seconds * 1000;
    return true;
  }

  /** El que esconde elige cuántas (1…las suyas). */
  hide(id, n, now) {
    const d = this.duelOf(id);
    if (this.phase !== SPHASE.RUNNING || now < this.tOpen || !d || d.loser || d.hider !== id || d.hidden != null) return false;
    if (!Number.isInteger(n) || n < 1 || n > d.marbles[id]) return false;
    d.hidden = n;
    return true;
  }

  /** El otro dice pares (0) o nones (1) y apuesta. */
  guess(id, parity, bet, now) {
    const d = this.duelOf(id);
    if (this.phase !== SPHASE.RUNNING || now < this.tOpen || !d || d.loser || d.hider === id || d.hidden == null) return false;
    if (![0, 1].includes(parity) || !Number.isInteger(bet) || bet < 1 || bet > d.marbles[id]) return false;
    const hider = d.hider;
    const right = d.hidden % 2 === parity; // 0 = pares, 1 = nones
    const amount = Math.min(bet, right ? d.marbles[hider] : d.marbles[id]);
    d.marbles[id] += right ? amount : -amount;
    d.marbles[hider] += right ? -amount : amount;
    d.last = { hider, guesser: id, hidden: d.hidden, parity, bet, right, amount };
    d.hidden = null;
    d.hider = id; // ahora esconde el otro
    if (d.marbles[hider] === 0) d.loser = hider;
    else if (d.marbles[id] === 0) d.loser = id;
    return true;
  }

  get allDecided() {
    return this.duels.every((d) => d.loser);
  }

  finish() {
    if (this.phase !== SPHASE.RUNNING) return null;
    this.phase = SPHASE.DONE;
    for (const d of this.duels) {
      if (d.loser) continue;
      const diff = d.marbles[d.a] - d.marbles[d.b];
      d.loser = diff < 0 ? d.a : diff > 0 ? d.b : this.rng() < 0.5 ? d.a : d.b;
      d.timeUp = true;
    }
    return this.out;
  }

  get out() {
    return this.duels.filter((d) => d.loser).map((d) => d.loser);
  }
}

/** Crea la ronda del juego que toca. */
export function createSquidRound(game, { roundId, players, item, rng = Math.random }) {
  const opts = { roundId, players, seconds: item?.seconds ?? SQUID_GAMES[game].seconds, rng };
  switch (game) {
    case 'luzroja':
      return new RedLightRound(opts);
    case 'panal':
      return new DalgonaRound(opts);
    case 'puente':
      return new GlassBridgeRound({ ...opts, steps: item?.steps ?? null });
    case 'cuerda':
      return new TugRound(opts);
    case 'canicas':
      return new MarblesRound(opts);
  }
  return null;
}
