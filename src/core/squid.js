// Squid Games: una sección con varios juegos seguidos desde el móvil (Luz roja, El panal, El puente de cristal, Tira y
// afloja, Canicas) en la que la gente se va eliminando. Cada eliminado mete puntos en la hucha y, al final, los
// supervivientes se la reparten. Lógica pura: la tele (host/games/squid.js) la usa y la prueban los tests.
//
// Cada juego es una ronda: ready ──start──▶ running ──finish──▶ done (devuelve quién queda fuera). Si un juego fuera a
// dejar fuera a todos, se salvan los que mejor lo han hecho (nunca se queda la sección sin nadie).
import { DALGONA_SHAPES } from './dalgona.js';

export const SQUID_GAMES = {
  luzroja: { label: 'Luz roja, luz verde', icon: '🚦', seconds: 60, min: 1, rule: 'Mantén el botón para avanzar en verde. En rojo, ¡ni un dedo! Si te mueves, fuera.' },
  panal: { label: 'El panal', icon: '🍪', seconds: 60, min: 1, rule: 'Elige una lata y repasa con el dedo la forma de tu galleta tres veces, despacio y sin salirte. Si vas deprisa, se agrieta; si se rompe o no acabas a tiempo, fuera.' },
  puente: { label: 'El puente de cristal', icon: '🌉', seconds: 20, min: 1, rule: 'Por relevos, un tramo cada uno (todos saltan): ¿izquierda o derecha? Un cristal aguanta; el otro, no. Quien no salta, apuesta por dónde lo hará el que está delante.' },
  cuerda: { label: 'Tira y afloja', icon: '🪢', seconds: 20, min: 2, rule: 'Dos bandos al azar: toca el móvil lo más rápido que puedas. Gana el bando que arrastre al otro hasta la línea (o el que más tire de media al acabar el tiempo). El que pierde, fuera.' },
  canicas: { label: 'Canicas', icon: '🟢', seconds: 90, min: 2, rule: 'Duelos por parejas con 10 canicas cada uno: uno esconde unas cuantas en la mano y el otro apuesta las suyas a pares o nones. Quien se queda sin canicas, fuera. En los últimos 10 s, ¡todo o nada!; si se acaba el tiempo, cae quien tenga menos.' },
};
// Recorrido sin filas en la hoja: como en la serie, el puente al final. Las canicas no van (se pueden poner con una fila).
export const SQUID_ORDER = ['luzroja', 'panal', 'cuerda', 'puente'];
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

/**
 * Cuántos tienen que llegar vivos al final (al puente): ningún juego deja menos. Un cuarto de los que empezaron, y al
 * menos 2 (o los que haya).
 */
export function squidFloor(started) {
  return Math.min(started, Math.max(2, Math.ceil(started * 0.25)));
}

const RED_LIGHT_SHARE = 0.35; // en Luz roja cae como mucho un tercio largo: que queden juegos con consecuencias

/**
 * Cuántos pueden caer como mucho en este juego. Lo que sobra hasta el suelo (`squidFloor`) se reparte entre los juegos
 * que quedan antes del puente (`gamesLeft`, este incluido), así cada uno elimina a alguien; en el puente, la mitad.
 * Quien caería pasado el tope se salva en el momento («¡por los pelos!»): nunca se anuncia un eliminado que luego no lo es.
 */
export function squidCap(game, { alive, started, gamesLeft = 1 }) {
  if (alive <= 1) return 0;
  if (game === 'puente') return Math.min(alive - 1, Math.max(1, Math.floor(alive / 2)));
  const spare = Math.max(0, alive - squidFloor(started));
  let cap = Math.min(spare, Math.round(spare / Math.max(1, gamesLeft)));
  if (game === 'luzroja') cap = Math.min(cap, Math.max(1, Math.round(alive * RED_LIGHT_SHARE)));
  return cap;
}

/**
 * Quedarían menos de `floor` vivos: se salvan («por los pelos») los mejores de los que caen hasta llegar a él.
 * @returns {out, spared}
 */
export function spareToFloor(alive, out, floor, score) {
  const missing = floor - (alive.length - out.length);
  if (missing <= 0) return { out, spared: [] };
  const spared = [...out].sort((a, b) => score(b) - score(a)).slice(0, missing);
  return { out: out.filter((id) => !spared.includes(id)), spared };
}

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
    this.numbers = { ...(saved?.numbers ?? {}) }; // playerId → número (1…456)
    this.alive = [...(saved?.alive ?? [])];
    this.out = (saved?.out ?? []).map((x) => ({ ...x })); // [{id, game, pot}] en orden de caída
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
  /**
   * Lo que se lleva cada superviviente: la hucha entre todos, sin inventar puntos; lo que sobra, uno más para los
   * primeros (por número). @returns {id: puntos}
   */
  shares() {
    const n = this.alive.length;
    if (!n) return {};
    const base = Math.floor(this.pot / n);
    const rest = this.pot - base * n;
    const order = [...this.alive].sort((a, b) => (this.numbers[a] ?? 0) - (this.numbers[b] ?? 0));
    return Object.fromEntries(order.map((id, i) => [id, base + (i < rest ? 1 : 0)]));
  }

  get share() {
    return this.alive.length ? Math.floor(this.pot / this.alive.length) : 0; // lo mínimo de cada uno (ver shares)
  }

  /** Copia (no comparte listas con el estado vivo: lo guardado antes de un juego no debe cambiar con él). */
  toJSON() {
    const { numbers, alive, out, pot, started } = this;
    return structuredClone({ numbers, alive, out, pot, started });
  }
}

// ------------------------------------------------------------------------------------------ 1. Luz roja, luz verde

const RED_GRACE_MS = 450; // al ponerse en rojo, un momento para soltar (reflejos humanos; lo que tarda en girarse)
const HOLD_SHARE = 0.42; // hay que mantener el botón algo más de un tercio del tiempo en verde para llegar
const MAX_OUT_SHARE = 0.4; // sin tope (squidCap), cae como mucho el 40 %
const defaultCap = (n) => Math.max(1, Math.round(n * MAX_OUT_SHARE));
const GREEN_FIRST_MS = 5800; // la muñeca canta despacio al principio…
const GREEN_LAST_MS = 1800; // …y cada vez más deprisa

/** Lo que canta la muñeca en cada luz verde: «el hibisco ha florecido». La luz se pone roja al acabar la frase. */
export const CHANT = ['Mu', 'gung', 'hwa', 'kko', 'chi', 'pi', 'eot', 'seum', 'ni', 'da'];
const CHANT_WEIGHTS = [1, 1, 1.5, 1, 1.4, 1, 1, 0.9, 0.9, 1.8];

/**
 * Cuándo empieza cada sílaba (ms desde que empieza a cantar) en una frase de `dur` ms. Con `rush` (0–1) empieza lenta
 * y acaba atropellada, como la de la serie. La tele canta con estas horas y los móviles iluminan la letra igual.
 */
export function chantTimes(dur, rush = 0) {
  const w = CHANT_WEIGHTS.map((x, i) => x * (i < 5 ? 1 + rush : 1 / (1 + rush)));
  const total = w.reduce((a, b) => a + b, 0);
  let acc = 0;
  return w.map((x) => {
    const t = Math.round((acc / total) * dur);
    acc += x;
    return t;
  });
}

/**
 * El presentador da la salida; tras 3-2-1 se alternan verde y rojo. En verde la muñeca canta (de 5,8 s al principio a
 * 2,4 s al final, con algo de azar y alguna muy rápida) y la luz se pone roja justo al acabar la frase; el rojo dura
 * 2–3,4 s. En verde, mantener el botón avanza (el móvil lleva la cuenta y la manda); en rojo, tocar o moverse (sensor)
 * deja fuera. Quien llega al 100 % se salva; al acabar el tiempo, quien no ha llegado, fuera.
 */
export class RedLightRound {
  constructor({ roundId, players, seconds = 60, cap = null, rng = Math.random }) {
    Object.assign(this, { roundId, players: [...players], seconds, phase: SPHASE.READY });
    this.cap = cap ?? defaultCap(this.players.length); // como mucho caen tantos; los demás se salvan por los pelos
    this.saved = {}; // id → {t, why}: le pilló (o no llegó), pero ya había caído el tope
    this.rng = rng;
    this.cues = []; // [{t, light, len?, rush?}] en hora del presentador (los verdes: lo que dura la frase y si se acelera)
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
    const span = this.endsAt - this.tOpen;
    while (t < this.endsAt) {
      if (light === 'green') {
        const k = (t - this.tOpen) / span;
        let len = (GREEN_FIRST_MS + (GREEN_LAST_MS - GREEN_FIRST_MS) * k) * (0.92 + this.rng() * 0.16);
        if (k > 0.15 && this.rng() < 0.12) len *= 0.6; // de vez en cuando, una de golpe
        len = Math.min(Math.round(Math.max(1500, len)), this.endsAt - t);
        const rush = this.rng() < 0.4 ? Math.round((0.3 + this.rng() * 0.5) * 100) / 100 : 0;
        this.cues.push({ t, light, len, rush });
        green += len;
        t += len;
      } else {
        this.cues.push({ t, light });
        t += randInt(this.rng, 2000, 3400);
      }
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
    return this.phase === SPHASE.RUNNING && this.players.includes(id) && !(id in this.crossed) && !(id in this.fallen) && !(id in this.saved);
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
    if (Object.keys(this.fallen).length >= this.cap) this.saved[id] = { t, why: 'moved' }; // ya cayó el tope: se salva
    else this.fallen[id] = { t, why: 'moved' };
    return true;
  }

  /** Lo bien que lo ha hecho (para salvar a los mejores si caen demasiados). */
  score(id) {
    return (id in this.crossed ? 1000 : 0) + (this.progress[id] ?? 0) - (this.fallen[id]?.why === 'moved' ? 50 : 0);
  }

  /** Se acabó el tiempo: quien no ha cruzado, fuera. @returns ids fuera */
  finish(now) {
    if (this.phase !== SPHASE.RUNNING) return null;
    this.phase = SPHASE.DONE;
    // Quien no ha llegado cae, pero solo hasta el tope (se salvan los que más avanzaron)
    const late = this.players.filter((id) => !(id in this.crossed) && !(id in this.fallen) && !(id in this.saved)).sort((a, b) => (this.progress[b] ?? 0) - (this.progress[a] ?? 0));
    const room = Math.max(0, this.cap - Object.keys(this.fallen).length);
    for (const id of late.slice(late.length - Math.min(room, late.length))) this.fallen[id] = { t: now, why: 'time' };
    for (const id of late) if (!(id in this.fallen)) this.saved[id] = { t: now, why: 'time' }; // se salvan por los pelos
    const out = spareBest(this.players, Object.keys(this.fallen), (id) => this.progress[id] ?? 0);
    for (const id of Object.keys(this.fallen)) {
      if (out.includes(id)) continue;
      this.saved[id] = this.fallen[id];
      delete this.fallen[id];
    }
    return out;
  }

  get out() {
    return Object.keys(this.fallen);
  }

  get spared() {
    return Object.keys(this.saved);
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
  constructor({ roundId, players, seconds = 90, cap = null, rng = Math.random }) {
    Object.assign(this, { roundId, players: [...players], seconds, phase: SPHASE.READY });
    this.cap = cap ?? defaultCap(this.players.length);
    this.rng = rng;
    this.envelopes = shuffle(Object.keys(DALGONA_SHAPES), rng); // sobre i → forma (la misma para todos)
    this.picks = {}; // id → nº de sobre
    this.progress = {}; // id → 0–100
    this.cracks = {};
    this.state = {}; // id → 'done' | 'broken' | 'spared' (se rompió, pero ya había caído el tope)
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
    else if (state === PANAL_BROKEN) this.state[id] = this.#broken() >= this.cap ? 'spared' : 'broken';
    return true;
  }

  #broken() {
    return this.players.filter((id) => this.state[id] === 'broken').length;
  }

  get allSettled() {
    return this.players.every((id) => id in this.state);
  }

  score(id) {
    return this.state[id] === 'done' ? 1000 : (this.progress[id] ?? 0) - (this.state[id] === 'broken' ? 30 : 0);
  }

  finish() {
    if (this.phase !== SPHASE.RUNNING) return null;
    this.phase = SPHASE.DONE;
    // Las rotas caen siempre; de las que no se terminaron, como mucho hasta el tope (se salvan las más avanzadas)
    const broken = this.players.filter((id) => this.state[id] === 'broken');
    const unfinished = this.players.filter((id) => !this.state[id]).sort((a, b) => (this.progress[b] ?? 0) - (this.progress[a] ?? 0));
    const room = Math.max(0, this.cap - broken.length);
    const out = [...broken, ...unfinished.slice(unfinished.length - Math.min(room, unfinished.length))];
    this.saved = unfinished.filter((id) => !out.includes(id)); // se salvan sin terminar
    this.outIds = spareBest(this.players, out, (id) => (this.state[id] === 'done' ? 200 : (this.progress[id] ?? 0)));
    return this.outIds;
  }

  get out() {
    return this.outIds ?? this.players.filter((id) => this.state[id] === 'broken');
  }

  get spared() {
    const out = this.out; // rota pasado el tope, sin terminar a tiempo (o rota, si no quedaba nadie)
    return this.players.filter((id) => this.state[id] !== 'done' && !out.includes(id) && (this.phase === SPHASE.DONE || this.state[id] === 'spared'));
  }
}

// ------------------------------------------------------------------------------------------ 3. El puente de cristal

/**
 * Cada salto del puente se ve con suspense: el resultado sale a los 3,5–5,7 s (cada salto distinto, para que no se
 * aprenda el ritmo; de media, `BRIDGE_REVEAL_MS`) y el siguiente sale un poco después (más si ha caído: se ve caer).
 */
export const BRIDGE_REVEAL_MS = 4600;
export const BRIDGE_JUMP_MS = 6800;
const AFTER_OK_MS = 1900;
const AFTER_FALL_MS = 3300;

/**
 * Salen por turnos (orden al azar), un tramo cada uno: quien está delante elige izquierda o derecha en el siguiente
 * tramo; acierte o falle, salta el siguiente. Hay un tramo más que gente, así que todos saltan al menos una vez. Quien
 * falla cae (fuera) y ese tramo ya se sabe; pasado el tope (`cap`, la mitad), el cristal malo cruje pero aguanta
 * (`held`: se salva por los pelos). Al completar el camino cruzan todos los que quedan. Si no elige a tiempo, «le
 * empujan» (al azar). Mientras, los que esperan apuestan qué cristal aguanta (`bet`; quien salta ve el recuento). Con
 * `jumpMs`, cada salto se ve con suspense: mientras, nadie elige, y el juego no acaba hasta que termina el último
 * (`closesAt`).
 */
export class GlassBridgeRound {
  constructor({ roundId, players, steps = null, seconds = 15, jumpMs = 0, cap = null, rng = Math.random }) {
    const n = players.length;
    Object.assign(this, { roundId, seconds, jumpMs, phase: SPHASE.READY });
    this.cap = cap ?? squidCap('puente', { alive: n, started: n });
    this.bets = {}; // tramo → {id: 'L' | 'R'}: lo que dicen los que esperan
    this.hits = {}; // id → apuestas acertadas
    this.closesAt = null; // camino completo (o han caído todos): acaba cuando termina el último salto
    this.rng = rng;
    this.queue = shuffle(players, rng);
    this.players = [...this.queue];
    this.steps = steps ?? Math.max(4, Math.min(21, n + 1)); // uno por cabeza (y uno más): todos saltan alguna vez
    this.safe = Array.from({ length: this.steps }, () => (rng() < 0.5 ? 'L' : 'R'));
    this.pos = 0; // primer tramo sin resolver
    this.turn = 0; // índice en la cola de quien juega
    this.fell = []; // ids, en orden
    this.crossed = [];
    this.moves = []; // [{id, step, side, ok, pushed, at, reveal, ends}]
    this.turnEndsAt = null;
  }

  get current() {
    return this.phase === SPHASE.RUNNING && this.closesAt == null && this.turn >= 0 ? (this.queue[this.turn] ?? null) : null;
  }

  /** El salto que aún se está viendo (nadie puede elegir hasta que acaba), o null. */
  jumping(now) {
    const m = this.moves.at(-1);
    return m && now < (m.ends ?? m.at) ? m : null;
  }

  /** ¿Ya se sabe cómo acabó este salto? (antes de su `reveal`, solo la tele lo sabe, para el suspense) */
  revealed(move, now) {
    return now >= move.at + (move.reveal ?? 0);
  }

  /** Los que han caído, contando solo los saltos que ya se han visto. */
  fellBy(now) {
    return this.moves.filter((m) => !m.ok && this.revealed(m, now)).map((m) => m.id);
  }

  /** El siguiente en la cola (en círculo) que no ha caído, o -1 si no queda nadie. */
  #nextTurn(from) {
    for (let k = 1; k <= this.queue.length; k++) {
      const i = (from + k) % this.queue.length;
      if (!this.fell.includes(this.queue[i])) return i;
    }
    return -1;
  }

  start(now) {
    if (this.phase !== SPHASE.READY) return false;
    this.phase = SPHASE.RUNNING;
    this.tOpen = now + COUNTDOWN_MS;
    this.turnEndsAt = this.tOpen + this.seconds * 1000;
    return true;
  }

  /** Uno que espera apuesta qué cristal del tramo que viene aguanta (puede cambiar hasta que salte). */
  bet(id, side, now) {
    const cur = this.current;
    if (!cur || cur === id || !this.players.includes(id) || this.fell.includes(id) || !['L', 'R'].includes(side) || this.jumping(now)) return false;
    (this.bets[this.pos] ??= {})[id] = side;
    return true;
  }

  /** Lo que dicen los que esperan del tramo `step`: {L, R}. */
  tally(step = this.pos) {
    const t = { L: 0, R: 0 };
    for (const side of Object.values(this.bets[step] ?? {})) t[side]++;
    return t;
  }

  /** Quien está delante elige 'L' o 'R'. @returns {ok, step} o null si no le toca */
  choose(id, side, now, { pushed = false } = {}) {
    if (this.current !== id || !['L', 'R'].includes(side) || now < this.tOpen || this.jumping(now)) return null;
    const step = this.pos;
    const ok = this.safe[step] === side;
    const held = !ok && this.fell.length >= this.cap; // ya ha caído el tope: cruje, pero aguanta
    const reveal = this.jumpMs ? Math.round(BRIDGE_REVEAL_MS - 1100 + this.rng() * 2200) : 0;
    const ends = this.jumpMs ? now + reveal + (ok ? AFTER_OK_MS : AFTER_FALL_MS) : now;
    this.moves.push({ id, step, side, ok, held, pushed, at: now, reveal, ends, tally: this.tally(step) });
    for (const [pid, b] of Object.entries(this.bets[step] ?? {})) if (b === this.safe[step]) this.hits[pid] = (this.hits[pid] ?? 0) + 1;
    this.pos++; // acierte o caiga, ese tramo ya se sabe
    if (!ok && !held) this.fell.push(id);
    this.turn = this.#nextTurn(this.turn); // relevo: salta el siguiente
    const complete = this.pos >= this.steps;
    if (complete) this.crossed = this.queue.filter((x) => !this.fell.includes(x)); // cruzan todos los que quedan
    if (complete || this.turn < 0) {
      if (this.jumpMs) this.closesAt = ends;
      else this.finish(now);
    } else {
      this.turnEndsAt = ends + this.seconds * 1000;
    }
    return { ok, step };
  }

  /** Se le acabó el tiempo a quien está delante: le empujan (al azar). */
  push(now) {
    if (this.phase !== SPHASE.RUNNING || this.closesAt != null || now < this.turnEndsAt) return null;
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

  get spared() {
    return [...new Set(this.moves.filter((m) => m.held).map((m) => m.id))];
  }
}

// ------------------------------------------------------------------------------------------ 4. Tira y afloja

const TUG_WIN = 18; // toques de ventaja por cabeza para arrastrar al otro bando hasta la línea
const TUG_MIN_MS = 7000; // antes de esto no se gana (que a nadie le pille arrancando)

/** Dos bandos al azar (con los vivos). Cada móvil manda sus toques; gana el bando con más toques por cabeza. */
export class TugRound {
  constructor({ roundId, players, seconds = 20, cap = null, rng = Math.random }) {
    Object.assign(this, { roundId, players: [...players], seconds, phase: SPHASE.READY });
    this.cap = cap; // como mucho caen tantos del bando que pierde (los que menos tiraron); null = todos
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

  /** ¿Ya hay ganador antes de tiempo? (nunca en los primeros 7 s) */
  decided(now) {
    return now >= this.tOpen + TUG_MIN_MS && Math.abs(this.rope) >= 1;
  }

  score(id) {
    return this.taps[id] ?? 0;
  }

  /** Media de toques por cabeza de cada bando (lo que cuenta). */
  get averages() {
    return { A: Math.round(this.#avg('A')), B: Math.round(this.#avg('B')) };
  }

  finish() {
    if (this.phase !== SPHASE.RUNNING) return null;
    this.phase = SPHASE.DONE;
    const r = this.rope;
    this.winner = r < 0 ? 'A' : r > 0 ? 'B' : this.rng() < 0.5 ? 'A' : 'B';
    const losers = [...this.sides[this.winner === 'A' ? 'B' : 'A']].sort((a, b) => (this.taps[a] ?? 0) - (this.taps[b] ?? 0));
    const n = this.cap == null ? losers.length : Math.min(this.cap, losers.length);
    this.outIds = losers.slice(0, n);
    this.saved = losers.slice(n); // pierden, pero ya cae el tope: se salvan los que más tiraron
    return this.out;
  }

  get out() {
    return this.outIds ?? [];
  }

  get spared() {
    return this.saved ?? [];
  }
}

// ------------------------------------------------------------------------------------------ 5. Canicas: pares o nones

export const MARBLES = 10;
export const MARBLE_MOVE_MS = 15_000; // quien no esconde o no apuesta en este tiempo, lo hace la suerte por él
export const MARBLE_REVEAL_MS = 1800; // la mano se abre: hasta entonces no se sabe quién gana (tele y móviles)
export const MARBLE_ALL_IN_MS = 10_000; // en los últimos 10 s, todo o nada: se apuestan todas las canicas
const ONE_DUEL_SECONDS = 45; // con un solo duelo, menos reloj (si no, se hace eterno)

/**
 * Duelos por parejas al azar (si sobra uno, se salva sin jugar). Por turnos, uno esconde canicas (1…las suyas) y el
 * otro dice pares o nones y apuesta: si acierta, se lleva lo apostado; si no, lo paga (nunca más de lo que hay). En los
 * últimos 10 s, la apuesta es todo. Quien se queda sin canicas, fuera. Al acabar el tiempo (ya no se empieza otra
 * jugada), pierde quien tenga menos (empate: a suertes). Pasado el tope (`cap`), quien pierde se salva por los pelos.
 */
export class MarblesRound {
  constructor({ roundId, players, seconds = 150, cap = null, rng = Math.random }) {
    Object.assign(this, { roundId, players: [...players], seconds, phase: SPHASE.READY });
    this.rng = rng;
    const order = shuffle(players, rng);
    this.bye = order.length % 2 ? order.pop() : null;
    this.duels = [];
    for (let i = 0; i < order.length; i += 2) {
      const [a, b] = [order[i], order[i + 1]];
      this.duels.push({ a, b, marbles: { [a]: MARBLES, [b]: MARBLES }, hider: a, hidden: null, last: null, loser: null, spared: false, turns: 0, since: null });
    }
    if (this.duels.length === 1) this.seconds = Math.min(this.seconds, ONE_DUEL_SECONDS);
    this.cap = cap ?? this.duels.length;
  }

  /** ¿Ya es todo o nada? */
  allIn(now) {
    return this.endsAt != null && now >= this.endsAt - MARBLE_ALL_IN_MS;
  }

  #lose(d, id) {
    d.loser = id;
    d.spared = this.duels.filter((x) => x.loser && !x.spared).length > this.cap; // ya cayó el tope: se salva
  }

  duelOf(id) {
    return this.duels.find((d) => d.a === id || d.b === id) ?? null;
  }

  start(now) {
    if (this.phase !== SPHASE.READY) return false;
    this.phase = SPHASE.RUNNING;
    this.tOpen = now + COUNTDOWN_MS;
    this.endsAt = this.tOpen + this.seconds * 1000;
    for (const d of this.duels) d.since = this.tOpen;
    return true;
  }

  /** El que esconde elige cuántas (1…las suyas). */
  hide(id, n, now) {
    const d = this.duelOf(id);
    if (this.phase !== SPHASE.RUNNING || now < this.tOpen || now > this.endsAt || !d || d.loser || d.hider !== id || d.hidden != null) return false;
    if (!Number.isInteger(n) || n < 1 || n > d.marbles[id]) return false;
    d.hidden = n;
    d.since = now;
    return true;
  }

  /** El otro dice pares (0) o nones (1) y apuesta. */
  guess(id, parity, bet, now) {
    const d = this.duelOf(id);
    if (this.phase !== SPHASE.RUNNING || now < this.tOpen || now > this.endsAt + 600 || !d || d.loser || d.hider === id || d.hidden == null) return false;
    if (![0, 1].includes(parity) || !Number.isInteger(bet) || bet < 1 || bet > d.marbles[id]) return false;
    const allIn = this.allIn(now);
    if (allIn) bet = d.marbles[id]; // todo o nada
    const hider = d.hider;
    const right = d.hidden % 2 === parity; // 0 = pares, 1 = nones
    const amount = Math.min(bet, right ? d.marbles[hider] : d.marbles[id]);
    d.marbles[id] += right ? amount : -amount;
    d.marbles[hider] += right ? -amount : amount;
    d.last = { hider, guesser: id, hidden: d.hidden, parity, bet, right, amount, allIn, at: now };
    d.hidden = null;
    d.hider = id; // ahora esconde el otro
    d.turns++;
    d.since = now;
    if (d.marbles[hider] === 0) this.#lose(d, hider);
    else if (d.marbles[id] === 0) this.#lose(d, id);
    return true;
  }

  get allDecided() {
    return this.duels.every((d) => d.loser);
  }

  score(id) {
    const d = this.duelOf(id);
    return d ? d.marbles[id] : 99;
  }

  /**
   * Quien lleva más de `MARBLE_MOVE_MS` sin esconder o sin apostar: lo hace la suerte por él (1–3 canicas; pares o
   * nones y 1). Así un móvil dormido no para el duelo. @returns cuántas jugadas se han hecho solas
   */
  autoPlay(now) {
    if (this.phase !== SPHASE.RUNNING || now < this.tOpen || now > this.endsAt) return 0;
    let n = 0;
    for (const d of this.duels) {
      if (d.loser || now - d.since < MARBLE_MOVE_MS) continue;
      if (d.hidden == null) this.hide(d.hider, 1 + Math.floor(this.rng() * Math.min(3, d.marbles[d.hider])), now);
      else this.guess(d.hider === d.a ? d.b : d.a, this.rng() < 0.5 ? 0 : 1, 1, now);
      d.auto = true;
      n++;
    }
    return n;
  }

  finish() {
    if (this.phase !== SPHASE.RUNNING) return null;
    this.phase = SPHASE.DONE;
    for (const d of this.duels) {
      if (d.loser) continue;
      const diff = d.marbles[d.a] - d.marbles[d.b];
      this.#lose(d, diff < 0 ? d.a : diff > 0 ? d.b : this.rng() < 0.5 ? d.a : d.b);
      d.timeUp = true;
      d.coin = diff === 0; // empate: a suertes
    }
    return this.out;
  }

  get out() {
    return this.duels.filter((d) => d.loser && !d.spared).map((d) => d.loser);
  }

  get spared() {
    return this.duels.filter((d) => d.loser && d.spared).map((d) => d.loser);
  }
}

/** Crea la ronda del juego que toca. */
export function createSquidRound(game, { roundId, players, item, cap = null, rng = Math.random }) {
  const opts = { roundId, players, seconds: item?.seconds ?? SQUID_GAMES[game].seconds, cap, rng };
  switch (game) {
    case 'luzroja':
      return new RedLightRound(opts);
    case 'panal':
      return new DalgonaRound(opts);
    case 'puente':
      return new GlassBridgeRound({ ...opts, steps: item?.steps ?? null, jumpMs: BRIDGE_JUMP_MS });
    case 'cuerda':
      return new TugRound(opts);
    case 'canicas':
      return new MarblesRound(opts);
  }
  return null;
}
