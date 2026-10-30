// Sección de Test al estilo «¿Quién quiere ser millonario?»: en cada pregunta concursa una sola persona (el asiento),
// por turnos alternando equipos. Lo lleva el presentador, sin reloj:
//   ready    → la pregunta en la tele; las respuestas, ocultas
//   playing  → el presentador va enseñando las respuestas (una a una o todas); el concursante elige en su móvil
//   marked   → el presentador marca la elegida: se pone en amarillo («respuesta definitiva»)
//   revealed → la buena se pone en verde (si era la marcada, verde; si no, la marcada sigue amarilla)
// Comodines, uno de cada por equipo: 50:50 (quita dos incorrectas), Público (los de su equipo votan 15 s sin hablar)
// y Llamada (un compañero sale de la sala y le llama: 30 s cuando lo diga el presentador).

export const MPHASE = { READY: 'ready', PLAYING: 'playing', MARKED: 'marked', REVEALED: 'revealed' };
export const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
export const AUDIENCE_MS = 15_000;
export const CALL_MS = 30_000;

export class MillionaireRound {
  /**
   * @param question {text, options, correct, image, points} (buildQuestion de un Test)
   * @param seat {playerId, teamId} quién concursa
   */
  constructor(question, { roundId, seat }) {
    this.question = question;
    this.roundId = roundId;
    this.seat = seat; // {playerId, teamId}
    this.phase = MPHASE.READY;
    this.shown = 0; // cuántas respuestas se ven (en orden: A, B, C…)
    this.choice = null; // la que ha elegido el concursante en su móvil
    this.marked = null; // la que ha marcado el presentador (amarillo)
    this.removed = []; // quitadas por el 50:50
    this.used = []; // comodines usados en esta pregunta
    this.audience = null; // {state: voting|done|cancelled, voters, votes: {playerId: índice}, endsAt}
    this.call = null; // {state: waiting|running|done, friendId, endsAt}
    this.cheated = false; // el concursante salió de la app: aunque acierte, no puntúa
    this.results = null;
  }

  get options() {
    return this.question.options;
  }

  /** ¿Se ve ya esta respuesta (y no la ha quitado el 50:50)? */
  available(index) {
    return Number.isInteger(index) && index >= 0 && index < this.shown && !this.removed.includes(index);
  }

  /** Enseña la siguiente respuesta (o todas). */
  show(all = false) {
    if (this.phase === MPHASE.REVEALED || this.shown >= this.options.length) return false;
    this.shown = all ? this.options.length : this.shown + 1;
    if (this.phase === MPHASE.READY) this.phase = MPHASE.PLAYING;
    return true;
  }

  /** El concursante elige (puede cambiar hasta que el presentador la marque). */
  choose(playerId, index) {
    if (playerId !== this.seat.playerId) return 'not-yours';
    if (this.phase !== MPHASE.PLAYING) return 'closed';
    if (!this.available(index)) return 'invalid';
    this.choice = index;
    return 'ok';
  }

  /** El presentador marca la respuesta (amarillo): la elegida por el concursante u otra si la dijo en voz alta. */
  mark(index = this.choice) {
    if (this.phase !== MPHASE.PLAYING && this.phase !== MPHASE.MARKED) return false;
    if (!Number.isInteger(index) || index < 0 || index >= this.options.length || this.removed.includes(index)) return false;
    this.marked = index;
    this.phase = MPHASE.MARKED;
    return true;
  }

  unmark() {
    if (this.phase !== MPHASE.MARKED) return false;
    this.marked = null;
    this.phase = MPHASE.PLAYING;
    return true;
  }

  /** La buena, en verde. Suma los puntos si la marcada era la buena (y no salió de la app). */
  reveal() {
    if (this.phase !== MPHASE.MARKED) return false;
    this.endJokers();
    const correct = this.marked === this.question.correct;
    const pts = this.question.points?.[0] ?? 1;
    this.results = { correct, points: correct && !this.cheated ? { [this.seat.playerId]: pts } : {} };
    this.phase = MPHASE.REVEALED;
    this.shown = this.options.length;
    return true;
  }

  // ---------- Comodines

  /** ¿Se puede usar este comodín ahora? null si sí; si no, el motivo (lo que queda por equipo lo lleva JokerBank). */
  jokerBlocker(kind) {
    if (this.phase !== MPHASE.PLAYING) return 'Ahora no se pueden usar comodines.';
    if (this.used.includes(kind)) return 'Ya lo has usado en esta pregunta.';
    if (this.audience?.state === 'voting' || this.call?.state === 'running') return 'Espera a que acabe el otro comodín.';
    if (this.shown < this.options.length) return 'Espera a que se vean todas las respuestas.';
    if (kind === 'fifty' && this.options.length - this.removed.length < 3) return 'Ya quedan solo dos respuestas.';
    return null;
  }

  /** 50:50: quita la mitad de las incorrectas (que no sean la elegida). @param random () => [0,1) */
  fifty(random = Math.random) {
    this.used.push('fifty');
    const wrong = this.options.map((_, i) => i).filter((i) => i !== this.question.correct && !this.removed.includes(i));
    const n = Math.floor(this.options.length / 2);
    while (this.removed.length < n && wrong.length) this.removed.push(wrong.splice(Math.floor(random() * wrong.length), 1)[0]);
    this.removed.sort((a, b) => a - b);
    if (this.removed.includes(this.choice)) this.choice = null;
    return this.removed;
  }

  /** Público: votan sus compañeros de equipo (sin hablar) durante 15 s. */
  startAudience(voterIds, now, ms = AUDIENCE_MS) {
    this.used.push('audience');
    this.audience = { state: 'voting', voters: [...voterIds], votes: {}, endsAt: now + ms };
  }

  vote(playerId, index, now) {
    const a = this.audience;
    if (a?.state !== 'voting' || !a.voters.includes(playerId)) return 'not-voter';
    if (now > a.endsAt) return 'late';
    if (!this.available(index)) return 'invalid';
    if (playerId in a.votes) return 'duplicate';
    a.votes[playerId] = index;
    return 'ok';
  }

  /** Votación terminada (por tiempo o porque han votado todos). */
  finishAudience() {
    if (this.audience?.state !== 'voting') return false;
    this.audience.state = 'done';
    return true;
  }

  /** Si hablan entre ellos, el presentador anula el comodín (y no se le devuelve). */
  cancelAudience() {
    if (this.audience?.state !== 'voting') return false;
    this.audience.state = 'cancelled';
    return true;
  }

  /** Porcentaje de votos de cada respuesta (enteros que suman 100 si hay votos). */
  audiencePercentages() {
    const counts = this.options.map(() => 0);
    for (const i of Object.values(this.audience?.votes ?? {})) counts[i]++;
    const total = counts.reduce((s, n) => s + n, 0);
    if (!total) return counts;
    const raw = counts.map((n) => (n * 100) / total);
    const out = raw.map(Math.floor);
    // reparte lo que falta hasta 100 a los de mayor resto
    const order = raw.map((r, i) => [r - Math.floor(r), i]).sort((x, y) => y[0] - x[0]);
    const missing = 100 - out.reduce((s, n) => s + n, 0);
    for (let k = 0; k < missing; k++) out[order[k][1]]++;
    return out;
  }

  /** Llamada: un compañero (que no concursa) sale de la sala y le llama. */
  startCall(friendId) {
    this.used.push('call');
    this.call = { state: 'waiting', friendId, endsAt: null };
  }

  /** Cuando el presentador lo dice, empiezan los 30 s. */
  runCall(now, ms = CALL_MS) {
    if (this.call?.state !== 'waiting') return false;
    this.call.state = 'running';
    this.call.endsAt = now + ms;
    return true;
  }

  endCall() {
    if (!this.call || this.call.state === 'done') return false;
    this.call.state = 'done';
    return true;
  }

  /** Cierra los comodines que estuvieran en marcha (al marcar o revelar). */
  endJokers() {
    this.finishAudience();
    this.endCall();
  }

  /** En plena llamada el concursante y el amigo usan el teléfono: el antitrampas no cuenta para ellos. */
  onCall(playerId) {
    return !!this.call && this.call.state !== 'done' && (playerId === this.call.friendId || playerId === this.seat.playerId);
  }

  toJSON() {
    const { roundId, seat, phase, shown, choice, marked, removed, used, audience, call, cheated, results } = this;
    return { roundId, seat, phase, shown, choice, marked, removed, used, audience, call, cheated, results };
  }

  /**
   * Recupera una pregunta guardada (revelada o a medias: la tele se recargó). Con `settle`, el Público o la Llamada
   * que estuvieran en marcha quedan terminados: sus relojes eran de la página anterior y no hay temporizador que los
   * acabe. Lo usado (50:50, comodines gastados) se queda como estaba.
   */
  static fromJSON(question, data, { settle = false } = {}) {
    const r = new MillionaireRound(question, { roundId: data.roundId, seat: data.seat });
    Object.assign(r, structuredClone(data)); // copia: lo guardado no cambia con la ronda
    if (settle) r.endJokers();
    return r;
  }
}
