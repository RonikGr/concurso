// Máquina de estados de una pregunta. Lógica pura: el tiempo siempre entra como parámetro.
//
//   idle ──open──▶ open ──(1ª pulsación + ventana)──▶ result ──correct──▶ result (judged)
//    ▲                ▲                                  │
//    │                └──────────── wrong (rebote) ◀─────┤
//    │                                                   └─ wrong sin nadie más ─▶ closed
//    └──────── next / restart (desde cualquier fase)
//
// `unjudge` deshace el último juicio de la pregunta (solo uno): un acierto vuelve a `result` sin juzgar; un fallo
// desbloquea al que falló, tira el rebote que se abrió (y sus pulsaciones) y vuelve a `result` con él.
//
// `epoch` crece con cada apertura, reinicio o pregunta nueva. El móvil manda la época que conocía al pulsar:
// así una pulsación de una ronda anterior que llega tarde no bloquea ni gana nada por error.
import { rankBuzzes } from './ranking.js';

export const PHASE = { IDLE: 'idle', OPEN: 'open', RESULT: 'result', CLOSED: 'closed' };
export const BUZZ = { OK: 'ok', EARLY: 'early', LOCKED: 'locked', DUPLICATE: 'duplicate', CLOSED: 'closed', STALE: 'stale' };
export const LOCK = { EARLY: 'early', WRONG: 'wrong', CHEAT: 'cheat' };

export class QuestionEngine {
  #undo = null; // el último juicio, para deshacerlo: {kind: 'correct'|'wrong', playerId, round?: {…}}

  /** @param settings objeto vivo: {scheduledOpenMs, countdownSec, decisionWindowMs, nearTieMs, lockEarlyBuzz} */
  constructor(settings, { qid = 1 } = {}) {
    this.settings = settings;
    this.qid = qid;
    this.epoch = 0;
    this.#reset();
  }

  #reset() {
    this.epoch++;
    this.phase = PHASE.IDLE;
    this.tOpen = null;
    this.lockouts = new Map(); // playerId → LOCK.*
    this.#undo = null;
    this.#clearRound();
  }

  #clearRound() {
    this.buzzes = [];
    this.windowEndsAt = null;
    this.winnerId = null;
    this.judged = null; // null | 'correct' | 'wrong'
  }

  #openRound(now, delayMs) {
    this.epoch++;
    this.#clearRound();
    this.phase = PHASE.OPEN;
    this.tOpen = now + delayMs;
  }

  /** "Abrir turno". El turno empieza de verdad en `tOpen` (apertura programada). */
  open(now) {
    if (this.phase !== PHASE.IDLE) return false;
    // Primera apertura: con la cuenta atrás 3-2-1 (si está activada); el rebote tras un fallo, enseguida.
    this.#openRound(now, Math.max(this.settings.scheduledOpenMs, (this.settings.countdownSec ?? 0) * 1000));
    return true;
  }

  /**
   * @returns {{result: string, locked?: boolean, windowEndsAt?: number}}
   * Si `windowEndsAt` viene, el presentador debe llamar a `closeWindow` en ese instante.
   */
  buzz({ playerId, tPress, tArrival, epoch, meta = null }) {
    if (this.lockouts.has(playerId)) return { result: BUZZ.LOCKED };

    // Pulsación hecha con una época vieja: solo vale si cae dentro del turno abierto ahora
    // (p. ej. el jugador miró la tele y pulsó antes de que su móvil recibiera la apertura).
    const opened = this.phase === PHASE.OPEN && tPress >= this.tOpen;
    if (epoch !== this.epoch && !(epoch < this.epoch && opened)) return { result: BUZZ.STALE };

    if (this.phase === PHASE.IDLE || (this.phase === PHASE.OPEN && !opened)) {
      if (!this.settings.lockEarlyBuzz) return { result: BUZZ.EARLY, locked: false };
      this.lockouts.set(playerId, LOCK.EARLY);
      return { result: BUZZ.EARLY, locked: true };
    }

    const accepting = this.phase === PHASE.OPEN || (this.phase === PHASE.RESULT && !this.judged);
    if (!accepting) return { result: BUZZ.CLOSED };
    if (this.buzzes.some((b) => b.playerId === playerId)) return { result: BUZZ.DUPLICATE };

    this.buzzes.push({ playerId, tPress, tArrival, meta }); // meta: datos para el modo depuración
    // La ventana arranca con la primera LLEGADA válida: da tiempo a que entren pulsaciones anteriores más lentas.
    if (this.phase === PHASE.OPEN && this.windowEndsAt == null) {
      this.windowEndsAt = tArrival + this.settings.decisionWindowMs;
    }
    return { result: BUZZ.OK, windowEndsAt: this.windowEndsAt ?? undefined };
  }

  /** Cierra la ventana y declara ganador. Devuelve true si cambió algo. */
  closeWindow(now) {
    if (this.phase !== PHASE.OPEN || this.windowEndsAt == null || now < this.windowEndsAt) return false;
    this.winnerId = this.ranking()[0].playerId;
    this.phase = PHASE.RESULT;
    return true;
  }

  ranking() {
    return rankBuzzes(this.buzzes, { winnerId: this.winnerId, tOpen: this.tOpen, nearTieMs: this.settings.nearTieMs });
  }

  /** "Acierto". Devuelve el playerId del ganador, o null si no procede. */
  correct() {
    if (this.phase !== PHASE.RESULT || this.judged) return null;
    this.judged = 'correct';
    this.#undo = { kind: 'correct', playerId: this.winnerId };
    return this.winnerId;
  }

  /**
   * "Fallo: rebote al resto". Bloquea al que falló y reabre para los que queden.
   * @param activeIds jugadores conectados ahora mismo
   * @returns {{loserId, reopened}} o null si no procede
   */
  wrong(now, activeIds) {
    if (this.phase !== PHASE.RESULT || this.judged) return null;
    const loserId = this.winnerId;
    // lo que había antes del juicio (el rebote lo borra): para deshacerlo
    const round = { tOpen: this.tOpen, buzzes: this.buzzes, windowEndsAt: this.windowEndsAt, winnerId: this.winnerId };
    this.#undo = { kind: 'wrong', playerId: loserId, round };
    this.lockouts.set(loserId, LOCK.WRONG);
    if (activeIds.some((id) => !this.lockouts.has(id))) {
      this.#openRound(now, this.settings.scheduledOpenMs);
      return { loserId, reopened: true };
    }
    this.judged = 'wrong';
    this.phase = PHASE.CLOSED;
    return { loserId, reopened: false };
  }

  /** ¿Se puede deshacer el último juicio de esta pregunta? */
  get canUndo() {
    return !!this.#undo;
  }

  /**
   * Deshace el último juicio (solo uno). Acierto → vuelve a `result` con el mismo ganador sin juzgar. Fallo → el que
   * falló deja de estar bloqueado y vuelve a ser el ganador sin juzgar; el rebote que se abrió se cierra y sus
   * pulsaciones se tiran. La época sube: lo que llegue tarde del rebote ya no cuenta.
   * @returns {{kind: 'correct'|'wrong', playerId}} o null si no hay nada que deshacer
   */
  unjudge() {
    const u = this.#undo;
    if (!u) return null;
    this.#undo = null;
    if (u.kind === 'correct') {
      if (this.phase !== PHASE.RESULT || this.judged !== 'correct') return null;
      this.judged = null;
      return { kind: u.kind, playerId: u.playerId };
    }
    if (this.lockouts.get(u.playerId) === LOCK.WRONG) this.lockouts.delete(u.playerId);
    this.epoch++;
    Object.assign(this, u.round);
    this.phase = PHASE.RESULT;
    this.judged = null;
    return { kind: u.kind, playerId: u.playerId };
  }

  /** "R": la misma pregunta desde cero (también quita los bloqueos). */
  restart() {
    this.#reset();
  }

  /** "Siguiente pregunta". */
  next() {
    this.qid++;
    this.#reset();
  }

  unlock(playerId) {
    return this.lockouts.delete(playerId);
  }

  /** Bloquea a un jugador en esta pregunta (antitrampas: salió de la app con el turno abierto). */
  lock(playerId, reason) {
    if (this.lockouts.has(playerId)) return false;
    this.lockouts.set(playerId, reason);
    return true;
  }
}

/**
 * Lo que ve un jugador en su móvil. `status`:
 * wait · go · pressed · first · placed · missed · blocked · closed
 */
export function playerView(game, playerId, now) {
  const base = { qid: game.qid, epoch: game.epoch, phase: game.phase };
  const lock = game.lockouts.get(playerId);
  if (lock) return { ...base, status: 'blocked', reason: lock };

  switch (game.phase) {
    case PHASE.IDLE:
      return { ...base, status: 'wait' };
    case PHASE.OPEN: {
      if (game.buzzes.some((b) => b.playerId === playerId)) return { ...base, status: 'pressed' };
      // tOpen (reloj del presentador) para móviles sincronizados; opensInMs como respaldo.
      return { ...base, status: 'go', tOpen: game.tOpen, opensInMs: Math.max(0, game.tOpen - now) };
    }
    case PHASE.RESULT: {
      const entry = game.ranking().find((r) => r.playerId === playerId);
      const judged = game.judged;
      if (entry?.place === 1) return { ...base, status: 'first', reactionMs: entry.reactionMs, judged };
      if (entry) return { ...base, status: 'placed', place: entry.place, deltaMs: entry.deltaMs, nearTie: entry.nearTie, judged };
      return { ...base, status: 'missed', judged };
    }
    default:
      return { ...base, status: 'closed' };
  }
}
