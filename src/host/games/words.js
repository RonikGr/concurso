// Palabras secretas en la sala (core/words.js): de quién es el turno, qué ve cada uno y los puntos.
// Le toca a uno de cada equipo por turnos (en el orden de su portavoz); su móvil enseña la tarjeta con «¡Acertada!» y
// «Pasar»; el equipo contrario la ve también, con «¡Falta!» (dijo una prohibida, habló en la mímica…). Sin equipos
// el turno rota entre todos y las faltas las pita el presentador.
import { answererFor } from '../../core/turns.js';
import { WORD_MODES } from '../../core/show.js';
import { WPHASE, WordDeck, WordsRound } from '../../core/words.js';

export class WordsGame {
  type = 'palabras';
  round = null;
  #ctx;
  #decks = new Map(); // sección → mazo (no se repiten palabras entre turnos)
  #savedDecks;
  #timer = 0;

  constructor(ctx, saved = null) {
    this.#ctx = ctx;
    this.#savedDecks = saved?.decks ?? {};
  }

  get #room() {
    return this.#ctx.room;
  }

  get inPlay() {
    const r = this.#room.runner;
    return r.screen === 'play' && r.section?.type === this.type && !r.peekScoreboard && !!this.round;
  }

  /** Lo que se guarda con la sala: por dónde va cada mazo. */
  toJSON() {
    return { decks: Object.fromEntries([...this.#decks].map(([id, d]) => [id, d.toJSON()])) };
  }

  #deck(section) {
    if (!this.#decks.has(section.id)) this.#decks.set(section.id, new WordDeck(section.cards ?? [], { saved: this.#savedDecks[section.id] }));
    return this.#decks.get(section.id);
  }

  /** Concurso nuevo: mazos de cero. */
  resetDecks() {
    this.#decks.clear();
    this.#savedDecks = {};
  }

  /** Al cambiar de pregunta: el turno nuevo (o el ya jugado, para verlo). */
  sync() {
    clearTimeout(this.#timer);
    const r = this.#room.runner;
    const key = r.playKey;
    if (!key || r.section?.type !== this.type || !r.item) {
      this.round = null;
      return;
    }
    const deck = this.#deck(r.section);
    const stored = this.#room.itemResults[key]?.words;
    this.round = stored ? WordsRound.fromJSON(deck, stored) : new WordsRound(deck, { roundId: this.#ctx.roundId(key), seconds: r.item.seconds ?? 60 });
  }

  stop() {
    clearTimeout(this.#timer);
  }

  // ---------- quién

  /** El equipo al que le toca (o null sin equipos). */
  get team() {
    const teams = this.#room.roster.teams;
    const item = this.#room.runner.item;
    return teams.length && item?.teamIndex != null ? teams[item.teamIndex % teams.length] : null;
  }

  /**
   * Quien hace adivinar: con equipos, el siguiente de su orden; sin equipos, rota entre todos. Una vez empezado el
   * turno queda fijo (si no, al conectarse o caerse alguien, la tarjeta y los puntos saltaban a otro).
   */
  get actorId() {
    if (this.#actor && this.#actor.roundId === this.round?.roundId) return this.#actor.id;
    return this.#liveActorId();
  }

  #actor = null; // {roundId, id}: quien empezó el turno

  #liveActorId() {
    const room = this.#room;
    const item = room.runner.item;
    if (item?.turn == null) return null; // no es un turno de Palabras
    const connected = (id) => !!room.roster.get(id)?.connected;
    const team = this.team;
    if (team) {
      const nTeams = room.roster.teams.length;
      return answererFor(this.#ctx.turnOrder(team.id), Math.floor(item.turn / nTeams), connected);
    }
    const list = room.roster.list().filter((p) => p.connected && !room.benched(p.id));
    return list.length ? list[item.turn % list.length].id : null;
  }

  /** actor | team (adivina) | rival (vigila) | guesser (sin equipos) */
  roleOf(playerId) {
    if (playerId === this.actorId) return 'actor';
    const team = this.team;
    if (!team) return 'guesser';
    return this.#room.roster.get(playerId)?.teamId === team.id ? 'team' : 'rival';
  }

  // ---------- órdenes (mando, teclado y móviles)

  actions() {
    return {
      wordsStart: () => this.inPlay && this.#start(),
      wordsOk: () => this.inPlay && this.#mark('ok'),
      wordsPass: () => this.inPlay && this.#mark('pass'),
      wordsFoul: () => this.inPlay && this.#mark('foul'),
      wordsUndo: () => this.inPlay && this.round.phase === WPHASE.RUNNING && this.round.undo(),
      wordsStop: () => this.inPlay && this.#finish(),
    };
  }

  /** Mensaje de un móvil: el que hace adivinar empieza y marca; un rival pita falta. */
  onMessage(playerId, msg, ack) {
    if (!this.inPlay || msg.roundId !== this.round.roundId) return ack('closed');
    const role = this.roleOf(playerId);
    const allowed = { start: role === 'actor', ok: role === 'actor', pass: role === 'actor', foul: role === 'rival' }[msg.action];
    if (!allowed) return ack('not-eligible');
    // la marca es de una tarjeta concreta: si ya se marcó (doble toque, dos rivales a la vez), no toca la siguiente
    if (msg.action !== 'start' && msg.value != null && Number(msg.value) !== this.round.results.length) return ack('closed');
    const ok = msg.action === 'start' ? this.#start() : this.#mark(msg.action);
    ack(ok ? 'ok' : 'closed');
    if (ok) this.#ctx.changed({ persist: false });
  }

  #start() {
    const actor = this.#liveActorId();
    if (!this.round.start(this.#ctx.now())) return false;
    this.#actor = { roundId: this.round.roundId, id: actor };
    clearTimeout(this.#timer);
    const round = this.round;
    this.#timer = setTimeout(() => {
      if (this.round === round && this.#finish()) this.#ctx.changed();
    }, this.round.seconds * 1000);
    return true;
  }

  #mark(result) {
    const r = this.round;
    if (!r.mark(result, this.#ctx.now())) return false;
    if (r.current == null) this.#finish(); // se acabó el tiempo justo
    return true;
  }

  /** Fin del turno: suma los puntos (al equipo o, sin equipos, a quien hizo adivinar) y lo guarda. */
  #finish() {
    const r = this.round;
    if (!r.finish()) return false;
    clearTimeout(this.#timer);
    const room = this.#room;
    const pts = r.score * (room.runner.section.points[0] ?? 1);
    const team = this.team;
    const to = team ? team.id : this.actorId;
    if (pts && to) {
      if (team) room.roster.adjustTeamBonus(to, pts);
      else room.roster.adjustScore(to, pts);
    }
    room.itemResults[room.runner.playKey] = { words: r.toJSON(), award: { to, pts, byTeams: !!team } };
    return true;
  }

  /** «R»: quita los puntos que dio el turno y vuelve a empezarlo (con tarjetas nuevas). */
  restart() {
    const room = this.#room;
    const key = room.runner.playKey;
    const a = room.itemResults[key]?.award;
    if (a?.to && a.pts) {
      if (a.byTeams) room.roster.adjustTeamBonus(a.to, -a.pts);
      else room.roster.adjustScore(a.to, -a.pts);
    }
    delete room.itemResults[key];
    this.round = null;
    this.sync();
    return true;
  }

  // ---------- vistas

  #card(index) {
    const c = this.round.deck.cards[index];
    return c && { word: c.word, banned: c.banned, mode: c.mode, ...WORD_MODES[c.mode] };
  }

  /** Para la tele (sin la palabra que se está haciendo) y el mando (con ella). */
  view({ forControl = false } = {}) {
    const r = this.round;
    const room = this.#room;
    const actor = room.roster.get(this.actorId);
    const card = r.current == null ? null : this.#card(r.current);
    return {
      roundId: r.roundId,
      phase: r.phase,
      seconds: r.seconds,
      endsAt: r.endsAt, // reloj de la tele
      endsInMs: r.endsAt == null ? null : Math.max(0, r.endsAt - this.#ctx.now()),
      turn: room.runner.itemIndex + 1,
      turns: room.runner.itemCount,
      team: this.team,
      actor: actor ? this.#ctx.pub(actor) : null,
      score: r.score,
      cardNo: r.results.length, // qué tarjeta es (el móvil la manda al marcar: un doble toque no marca la siguiente)
      card: card && (forControl ? card : { mode: card.mode, label: card.label, icon: card.icon, rule: card.rule }),
      results: r.results.map((x) => ({ ...this.#card(x.card), result: x.result })),
      points: room.runner.section.points[0] ?? 1,
    };
  }

  /** Para el móvil de cada uno: el que hace adivinar y los rivales ven la tarjeta; su equipo, solo el modo. */
  viewFor(player) {
    const v = this.view({ forControl: true });
    const role = this.roleOf(player.id);
    const sees = role === 'actor' || role === 'rival';
    return { ...v, role, card: v.card && (sees ? v.card : { mode: v.card.mode, label: v.card.label, icon: v.card.icon, rule: v.card.rule }) };
  }
}
