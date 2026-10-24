// Sección Libre ("Fit o Fat"): pruebas fuera del móvil que arbitra el presentador. Lógica pura.
//
//   setup ──start──▶ running ──stop──▶ stopped ──award──▶ awarded
//     └───────────────(sin herramienta: award directo)──────────┘
//
// Herramientas: cronómetro (el presentador marca "eliminado" a quien cae; gana quien más aguanta),
// contador (+1/−1 por participante; gana quien más hace), contrarreloj (salen de uno en uno; gana quien menos tarda;
// cada intento puede apuntar cuántas piezas tiene bien, p. ej. «3 de 5 botellas») o ninguna (el presentador elige
// ganador). Participan jugadores o equipos según la fila de la hoja. Con canción (p. ej. la bachata), «¡Empezar!» la
// hace sonar aunque no haya herramienta.

export const FPHASE = { SETUP: 'setup', RUNNING: 'running', STOPPED: 'stopped', AWARDED: 'awarded' };
export const TOOL = { NONE: 'none', STOPWATCH: 'stopwatch', COUNTER: 'counter', TRIAL: 'trial' };

export class FreeRound {
  /** @param item fila de la hoja: {title, description, tool, teams, points} */
  constructor(item, { roundId }) {
    this.item = item;
    this.roundId = roundId;
    this.phase = FPHASE.SETUP;
    this.participants = []; // ids de jugador o de equipo
    this.tStart = null;
    this.tStop = null;
    this.out = {}; // cronómetro: id → ms aguantados al caer
    this.counts = {}; // contador: id → número
    this.counters = {}; // contador desde el móvil, con equipos: equipo → playerId que lleva su cuenta (lo elige el presentador)
    this.trials = {}; // contrarreloj: id → {tStart, time, gaveUp, attempts: [{n, t}]}
    this.current = null; // contrarreloj: a quién le toca (puede no haber empezado aún)
    this.winners = [];
    this.points = {}; // id → puntos dados
  }

  get tool() {
    return this.item.tool;
  }

  get byTeams() {
    return !!this.item.teams;
  }

  /** Solo antes de empezar. */
  setParticipants(ids) {
    if (this.phase !== FPHASE.SETUP) return false;
    this.participants = [...new Set(ids)];
    return true;
  }

  /** ¿Tiene «¡Empezar!»? (sin herramienta, solo si hay canción) */
  get startable() {
    return this.tool !== TOOL.NONE || !!this.item.song;
  }

  start(now) {
    if (this.phase !== FPHASE.SETUP || !this.startable || !this.participants.length) return false;
    this.phase = FPHASE.RUNNING;
    this.tStart = now;
    this.counts = Object.fromEntries(this.participants.map((id) => [id, 0]));
    if (this.tool === TOOL.TRIAL) {
      this.current = this.participants[0];
      this.trials = { [this.current]: { tStart: now, time: null, gaveUp: false, attempts: [] } };
    }
    return true;
  }

  // ---------- contrarreloj

  /** El turno de quien está ahora (o null si aún no ha empezado). */
  get trial() {
    return this.current == null ? null : (this.trials[this.current] ?? null);
  }

  /** ¿Corre el reloj de alguien? */
  get trialRunning() {
    const t = this.trial;
    return this.phase === FPHASE.RUNNING && !!t && t.time == null && !t.gaveUp;
  }

  /** Un intento: cuántas piezas tiene bien. Con todas bien, se para su reloj. */
  attempt(n, now) {
    if (this.tool !== TOOL.TRIAL || !this.trialRunning) return false;
    const max = this.item.pieces ?? Infinity;
    if (!Number.isInteger(n) || n < 0 || n > max) return false;
    const t = this.trial;
    t.attempts.push({ n, t: now - t.tStart });
    if (n === max) this.trialDone(now);
    return true;
  }

  /** Quitar el último intento (por si se apuntó mal). */
  undoAttempt() {
    if (this.tool !== TOOL.TRIAL || !this.trialRunning || !this.trial.attempts.length) return false;
    this.trial.attempts.pop();
    return true;
  }

  /** ¡Lo tiene! (o se rinde): su tiempo queda apuntado y pasa el siguiente (que empieza con «trialNext»). */
  trialDone(now, gaveUp = false) {
    if (this.tool !== TOOL.TRIAL || !this.trialRunning) return false;
    const t = this.trial;
    t.time = now - t.tStart;
    t.gaveUp = gaveUp;
    const next = this.participants.find((id) => !(id in this.trials));
    if (next) this.current = next;
    else this.stop(now);
    return true;
  }

  /** Empieza el reloj del siguiente. */
  trialNext(now) {
    if (this.tool !== TOOL.TRIAL || this.phase !== FPHASE.RUNNING || this.trial) return false;
    this.trials[this.current] = { tStart: now, time: null, gaveUp: false, attempts: [] };
    return true;
  }

  /** Cronómetro: alguien cae. Si solo queda uno en pie, la prueba se para sola. */
  eliminate(id, now) {
    if (this.phase !== FPHASE.RUNNING || this.tool !== TOOL.STOPWATCH) return false;
    if (!this.participants.includes(id) || id in this.out) return false;
    this.out[id] = now - this.tStart;
    if (this.standing().length === 0) this.stop(now);
    return true;
  }

  /** Deshacer un "eliminado" por error (mientras corre el cronómetro). */
  revive(id) {
    if (this.phase !== FPHASE.RUNNING || !(id in this.out)) return false;
    delete this.out[id];
    return true;
  }

  /** Quienes siguen en pie (cronómetro). */
  standing() {
    return this.participants.filter((id) => !(id in this.out));
  }

  count(id, delta) {
    if (this.phase !== FPHASE.RUNNING || this.tool !== TOOL.COUNTER || !this.participants.includes(id)) return false;
    this.counts[id] = Math.max(0, (this.counts[id] ?? 0) + delta);
    return true;
  }

  /** Con equipos: qué jugador cuenta desde su móvil por su equipo (null = nadie: cuenta el presentador). */
  setCounter(teamId, playerId) {
    if (!this.byTeams || this.phase === FPHASE.AWARDED) return false;
    if (playerId) this.counters[teamId] = playerId;
    else delete this.counters[teamId];
    return true;
  }

  /** ¿Puede contar este móvil por este participante? Sin equipos, cada uno lo suyo; con equipos, el elegido. */
  canCount(playerId, participantId) {
    if (this.tool !== TOOL.COUNTER || !this.participants.includes(participantId)) return false;
    return this.byTeams ? this.counters[participantId] === playerId : participantId === playerId;
  }

  /**
   * +1/−1 desde el móvil de un concursante.
   * @returns 'ok' | 'not-counter' (este móvil no lleva la cuenta) | 'closed'
   */
  countFrom(playerId, participantId, delta) {
    if (this.phase !== FPHASE.RUNNING || this.tool !== TOOL.COUNTER || !this.participants.includes(participantId)) return 'closed';
    if (!this.canCount(playerId, participantId)) return 'not-counter';
    this.count(participantId, delta);
    return 'ok';
  }

  stop(now) {
    if (this.phase !== FPHASE.RUNNING) return false;
    // Contrarreloj parado a mitad: quien estaba en marcha no termina
    if (this.trialRunning) Object.assign(this.trial, { time: now - this.trial.tStart, gaveUp: true });
    this.phase = FPHASE.STOPPED;
    this.tStop = now;
    return true;
  }

  /** Tiempo aguantado por cada uno (los que siguen en pie, hasta ahora o hasta que se paró). */
  timeOf(id, now) {
    if (id in this.out) return this.out[id];
    if (this.tStart == null) return 0;
    return (this.tStop ?? now) - this.tStart;
  }

  /** Clasificación según la herramienta: [{id, value, place}] (mejor primero; empates comparten puesto). */
  ranking(now) {
    if (this.tool === TOOL.NONE) return this.participants.map((id) => ({ id, value: null, place: null }));
    if (this.tool === TOOL.TRIAL) {
      // Menos tiempo, mejor; quien no lo consiguió (o no salió), al final y sin puesto
      const time = (id) => (this.trials[id] && !this.trials[id].gaveUp ? this.trials[id].time : null);
      const rows = this.participants.map((id) => ({ id, value: time(id) })).sort((a, b) => (a.value ?? Infinity) - (b.value ?? Infinity));
      let place = 0;
      let last = null;
      for (const r of rows) {
        if (r.value == null) {
          r.place = null;
          continue;
        }
        if (r.value !== last) {
          place++;
          last = r.value;
        }
        r.place = place;
      }
      return rows;
    }
    const value = (id) => (this.tool === TOOL.STOPWATCH ? this.timeOf(id, now) : (this.counts[id] ?? 0));
    const rows = this.participants.map((id) => ({ id, value: value(id) })).sort((a, b) => b.value - a.value);
    let place = 0;
    let last = null;
    for (const r of rows) {
      if (r.value !== last) {
        place++;
        last = r.value;
      }
      r.place = place;
    }
    return rows;
  }

  /** Ganadores que propone la herramienta (el presentador puede cambiarlos). */
  suggestion(now) {
    if (this.tool === TOOL.NONE) return [];
    const rows = this.ranking(now);
    if (!rows.length || (this.tool === TOOL.COUNTER && rows[0].value === 0)) return [];
    return rows.filter((r) => r.place === 1).map((r) => r.id);
  }

  /**
   * Da los puntos de la prueba a los ganadores.
   * @returns {id: puntos} o null si no procede
   */
  award(winnerIds, now) {
    if (this.phase === FPHASE.AWARDED) return null;
    const winners = winnerIds.filter((id) => this.participants.includes(id));
    if (!winners.length) return null;
    if (this.phase === FPHASE.RUNNING) this.stop(now);
    this.winners = winners;
    this.points = Object.fromEntries(winners.map((id) => [id, this.item.points]));
    this.phase = FPHASE.AWARDED;
    return this.points;
  }

  toJSON() {
    const { roundId, phase, participants, tStart, tStop, out, counts, counters, trials, current, winners, points } = this;
    return { roundId, phase, participants, tStart, tStop, out, counts, counters, trials, current, winners, points };
  }

  static fromJSON(item, data) {
    const r = new FreeRound(item, { roundId: data.roundId });
    Object.assign(r, { ...data });
    return r;
  }
}
