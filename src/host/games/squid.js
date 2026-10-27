// Squid Games en la sala (core/squid.js): una sección con varios juegos seguidos en la que la gente se va eliminando.
// Al entrar en el primer juego, juegan los conectados (cada uno con su número); quien llega después, mira. Cada juego
// elimina al acabar (cada eliminado mete los puntos de la sección en la hucha) y la última «pregunta» de la sección
// es el reparto de la hucha entre los supervivientes. R reinicia el juego en curso (vuelven los que cayeron en él).
import { COUNTDOWN_MS, SPHASE, SQUID_GAMES, SquidState, createSquidRound } from '../../core/squid.js';
import { DALGONA_SHAPES } from '../../core/dalgona.js';

const LIVE_MS = 250; // repintar como mucho cada 250 ms con los informes de los móviles (avance, toques…)
const SIDE = ['L', 'R'];

export class SquidGame {
  type = 'squid';
  round = null; // juego en curso (null en el reparto de la hucha)
  state = null; // SquidState de la sección
  #ctx;
  #sections; // sectionId → {state, before: {playKey: estado antes del juego}, results: {playKey: vista final}, awards: {playKey: {id: pts}}}
  #timer = 0;
  #live = 0;

  constructor(ctx, saved = null) {
    this.#ctx = ctx;
    this.#sections = saved?.sections ?? {};
  }

  get #room() {
    return this.#ctx.room;
  }

  get #record() {
    const id = this.#room.runner.section?.id;
    this.#sections[id] ??= { state: null, before: {}, results: {}, awards: {} };
    return this.#sections[id];
  }

  get #item() {
    return this.#room.runner.item;
  }

  get inPlay() {
    const r = this.#room.runner;
    return r.screen === 'play' && r.section?.type === this.type && !r.peekScoreboard && !!this.state;
  }

  get #perHead() {
    return this.#room.runner.section?.points?.[0] ?? 1;
  }

  /** Concurso nuevo: nada de lo anterior. */
  reset() {
    this.stop();
    this.#sections = {};
    this.state = null;
    this.round = null;
  }

  toJSON() {
    if (this.state) this.#record.state = this.state.toJSON();
    return { sections: this.#sections };
  }

  /** Al cambiar de pregunta: el estado de la sección y la ronda del juego que toca. */
  sync() {
    this.stop();
    const room = this.#room;
    const r = room.runner;
    if (r.screen !== 'play' || r.section?.type !== this.type || !this.#item) {
      this.round = null;
      this.state = null;
      return;
    }
    const rec = this.#record;
    this.state = new SquidState(rec.state);
    if (!this.state.started) {
      // Juegan los que están ahora (conectados y que no presentan)
      const ids = room.roster.list().filter((p) => p.connected && !room.benched(p.id)).map((p) => p.id);
      this.state.begin(ids);
      rec.state = this.state.toJSON();
    }
    const key = r.playKey;
    const game = this.#item.game;
    if (game === 'hucha') {
      this.round = null;
      this.#award(key);
      return;
    }
    if (rec.results[key]) {
      this.round = null; // ya jugado: se enseña cómo acabó
      return;
    }
    rec.before[key] ??= this.state.toJSON();
    this.round = createSquidRound(game, { roundId: this.#ctx.roundId(key), players: this.state.alive, item: this.#item });
  }

  stop() {
    clearTimeout(this.#timer);
    clearTimeout(this.#live);
    this.#timer = 0;
    this.#live = 0;
  }

  actions() {
    return {
      squidStart: () => this.inPlay && this.#start(),
      squidStop: () => this.inPlay && !!this.round && this.#finish(),
      // El presentador corrige: devolver a alguien al juego o dejarle fuera (entre juegos o en la hucha)
      squidRevive: ({ id }) => this.inPlay && !this.round?.phase?.startsWith('run') && this.#revive(String(id)),
      squidEliminate: ({ id }) => this.inPlay && !this.round?.phase?.startsWith('run') && this.#eliminate(String(id)),
      // Puente: si el móvil de quien está delante falla, elige el presentador
      squidChoose: ({ side }) => this.inPlay && this.round?.choose && this.#choose(this.round.current, side),
    };
  }

  // ------------------------------------------------------------------ marcha del juego

  #start() {
    const r = this.round;
    if (!r || !r.start(this.#ctx.now())) return false;
    if (r.players.length < SQUID_GAMES[this.#item.game].min) {
      // p. ej. tira y afloja con uno solo: este juego se salta (nadie queda fuera)
      r.phase = SPHASE.DONE;
      r.skipped = true;
      return this.#finish();
    }
    this.#arm();
    return true;
  }

  /** Temporizador del final (o del turno del puente). */
  #arm() {
    clearTimeout(this.#timer);
    const r = this.round;
    if (!r || r.phase !== SPHASE.RUNNING) return;
    const now = this.#ctx.now();
    if (this.#item.game === 'puente') {
      this.#timer = setTimeout(() => {
        if (this.round !== r) return;
        r.push(this.#ctx.now());
        if (r.phase === SPHASE.DONE) this.#finish();
        else this.#arm();
        this.#ctx.changed();
      }, Math.max(0, r.turnEndsAt - now) + 50);
      return;
    }
    this.#timer = setTimeout(() => this.round === r && this.#finish() && this.#ctx.changed(), Math.max(0, r.endsAt - now) + 700);
  }

  /** Fin del juego: quedan fuera los que diga la ronda (y cada uno mete su parte en la hucha). */
  #finish() {
    const r = this.round;
    if (!r) return false;
    if (r.phase === SPHASE.RUNNING) r.finish(this.#ctx.now());
    if (r.phase !== SPHASE.DONE) return false;
    this.stop();
    this.state.eliminate(r.out, this.#item.game, this.#perHead);
    const rec = this.#record;
    rec.state = this.state.toJSON();
    rec.results[this.#room.runner.playKey] = this.#gameView(true);
    this.round = null;
    return true;
  }

  /** Reparto de la hucha (una vez): cada superviviente se lleva su parte. */
  #award(key) {
    const rec = this.#record;
    if (rec.awards[key]) return;
    const share = this.state.share;
    rec.awards[key] = Object.fromEntries(this.state.alive.map((id) => [id, share]));
    for (const id of this.state.alive) if (share) this.#room.roster.adjustScore(id, share);
  }

  #revive(id) {
    if (!this.state.revive(id)) return false;
    this.#afterManual();
    return true;
  }

  #eliminate(id) {
    if (!this.state.alive.includes(id)) return false;
    this.state.eliminate([id], 'presentador', this.#perHead);
    this.#afterManual();
    return true;
  }

  /** Tras corregir a mano: el juego que aún no ha empezado cuenta con quien toca; en la hucha, se reparte otra vez. */
  #afterManual() {
    const rec = this.#record;
    rec.state = this.state.toJSON();
    const key = this.#room.runner.playKey;
    if (this.round?.phase === SPHASE.READY) {
      this.round = createSquidRound(this.#item.game, { roundId: this.round.roundId, players: this.state.alive, item: this.#item });
      rec.before[key] = this.state.toJSON();
    }
    if (this.#item.game === 'hucha') {
      this.#undoAward(key);
      this.#award(key);
    }
  }

  #undoAward(key) {
    const rec = this.#record;
    for (const [id, pts] of Object.entries(rec.awards[key] ?? {})) this.#room.roster.adjustScore(id, -pts);
    delete rec.awards[key];
  }

  /** R: el juego en curso vuelve a empezar (vuelven los que cayeron en él); en la hucha, se quita el reparto. */
  restart() {
    const rec = this.#record;
    const key = this.#room.runner.playKey;
    if (this.#item?.game === 'hucha') {
      this.#undoAward(key);
      this.sync();
      return true;
    }
    if (rec.before[key]) {
      rec.state = rec.before[key];
      delete rec.before[key];
    }
    delete rec.results[key];
    this.sync();
    return true;
  }

  // ------------------------------------------------------------------ móviles

  onMessage(playerId, msg, ack) {
    const r = this.round;
    if (!this.inPlay || !r || msg.roundId !== r.roundId) return ack('closed');
    const now = this.#ctx.now();
    const v = msg.value;
    let ok = false;
    let live = false; // informe continuo (repintar sin prisa) o algo que se ve enseguida
    switch (`${this.#item.game}:${msg.action}`) {
      case 'luzroja:p':
        ok = r.report(playerId, Number(v), now);
        live = true;
        break;
      case 'luzroja:fault':
        ok = r.fault(playerId, Number(v), now);
        break;
      case 'panal:pick':
        ok = r.pick(playerId, Number(v));
        break;
      case 'panal:trace':
        ok = Array.isArray(v) && r.report(playerId, v, now);
        live = !(Array.isArray(v) && v[2]); // terminar o romper se ve enseguida
        break;
      case 'puente:choose':
        return ack(this.#choose(playerId, SIDE[v]) ? 'ok' : 'closed');
      case 'cuerda:taps':
        ok = r.report(playerId, Number(v), now);
        live = true;
        break;
      case 'canicas:hide':
        ok = r.hide(playerId, Number(v), now);
        break;
      case 'canicas:guess':
        ok = Array.isArray(v) && r.guess(playerId, v[0], v[1], now);
        break;
    }
    ack(ok ? 'ok' : 'closed');
    if (!ok) return;
    // ¿Se acabó antes de tiempo? (todos a salvo o fuera, un bando gana, todos los duelos decididos…)
    if (this.#earlyEnd(r)) {
      this.#finish();
      return this.#ctx.changed();
    }
    if (!live) return this.#ctx.changed({ persist: false });
    if (!this.#live) {
      this.#live = setTimeout(() => {
        this.#live = 0;
        this.#ctx.changed({ persist: false });
      }, LIVE_MS);
    }
  }

  #earlyEnd(r) {
    switch (this.#item.game) {
      case 'luzroja':
        return r.players.every((id) => id in r.crossed || id in r.fallen);
      case 'panal':
        return r.allSettled;
      case 'cuerda':
        return r.decided;
      case 'canicas':
        return r.allDecided;
    }
    return false;
  }

  #choose(playerId, side) {
    const r = this.round;
    if (!r || !side || !r.choose(playerId, side, this.#ctx.now())) return false;
    if (r.phase === SPHASE.DONE) this.#finish();
    else this.#arm();
    this.#ctx.changed();
    return true;
  }

  // ------------------------------------------------------------------ vistas

  #person(id) {
    const p = this.#room.roster.get(id);
    const base = p ? this.#ctx.pub(p) : { id, name: '¿?', color: 'gris', icon: null, face: null, teamId: null };
    return { ...base, number: this.state.numbers[id] ?? null };
  }

  /** Vista del juego (tele y mando; `secret` = lo que solo ve el mando). Al acabar se guarda tal cual. */
  #gameView(secret = false) {
    const r = this.round;
    const game = this.#item.game;
    const now = this.#ctx.now();
    const out = new Set(r.out);
    const base = {
      roundId: r.roundId,
      phase: r.phase,
      tOpen: r.tOpen ?? null,
      endsAt: r.endsAt ?? null,
      skipped: !!r.skipped, // no había gente suficiente para este juego
      players: r.players.map((id) => ({ ...this.#person(id), out: out.has(id) })),
    };
    switch (game) {
      case 'luzroja':
        return { ...base, cues: r.cues, speed: r.speed, progress: r.progress, crossed: Object.keys(r.crossed), fallen: r.fallen };
      case 'panal':
        return {
          ...base,
          envelopes: r.envelopes.length,
          shapes: Object.fromEntries(r.players.map((id) => [id, r.phase === SPHASE.READY && !secret ? null : r.shapeOf(id)])),
          picked: Object.keys(r.picks),
          progress: r.progress,
          cracks: r.cracks,
          state: r.state,
        };
      case 'puente':
        return {
          ...base,
          steps: r.steps,
          pos: r.pos,
          queue: r.queue,
          current: r.current,
          moves: r.moves,
          crossed: r.crossed,
          turnEndsAt: r.turnEndsAt,
          turnEndsInMs: r.turnEndsAt == null ? null : r.turnEndsAt - now,
          safe: secret ? r.safe : null, // el camino bueno: solo el mando
        };
      case 'cuerda':
        return {
          ...base,
          sides: r.sides,
          rope: r.rope,
          totals: { A: r.sides.A.reduce((s, id) => s + (r.taps[id] ?? 0), 0), B: r.sides.B.reduce((s, id) => s + (r.taps[id] ?? 0), 0) },
          winner: r.winner,
        };
      case 'canicas':
        return {
          ...base,
          bye: r.bye,
          duels: r.duels.map((d) => ({ a: d.a, b: d.b, marbles: d.marbles, hider: d.hider, hasHidden: d.hidden != null, hidden: secret ? d.hidden : null, last: d.last, loser: d.loser, timeUp: !!d.timeUp })),
        };
    }
    return base;
  }

  /** Para la tele (y el mando con `forControl`). */
  view({ forControl = false } = {}) {
    const room = this.#room;
    const key = room.runner.playKey;
    const game = this.#item.game;
    const rec = this.#record;
    const now = this.#ctx.now();
    const info = SQUID_GAMES[game];
    const gameView = this.round ? this.#gameView(forControl) : (rec.results[key] ?? null);
    return {
      game,
      label: game === 'hucha' ? 'La hucha' : info.label,
      icon: game === 'hucha' ? '🐷' : info.icon,
      rule: game === 'hucha' ? 'Los supervivientes se reparten la hucha.' : info.rule,
      step: room.runner.itemIndex + 1,
      steps: room.runner.itemCount,
      seconds: this.#item.seconds ?? null,
      now, // hora de la tele al hacer la vista (los móviles sin sincronizar cuentan desde aquí)
      phase: gameView?.phase ?? (game === 'hucha' ? 'done' : SPHASE.READY),
      g: gameView,
      pot: this.state.pot,
      perHead: this.#perHead,
      share: this.state.share,
      alive: this.state.alive.map((id) => this.#person(id)),
      fallen: this.state.out.map((x) => ({ ...this.#person(x.id), game: x.game })),
      awarded: game === 'hucha' ? (rec.awards[key] ?? null) : null,
      shapes: game === 'panal' && forControl ? Object.fromEntries(Object.entries(DALGONA_SHAPES).map(([id, s]) => [id, s.label])) : null,
    };
  }

  /** Para el móvil de cada uno: lo suyo (número, si sigue vivo) y lo que necesita su juego. */
  viewFor(player) {
    const v = this.view();
    const id = player.id;
    const g = v.g;
    const playing = !!g?.players?.some((p) => p.id === id);
    const status = v.alive.some((p) => p.id === id) ? 'alive' : v.fallen.some((p) => p.id === id) ? 'out' : 'watching';
    const mine = {
      game: v.game,
      label: v.label,
      icon: v.icon,
      rule: v.rule,
      step: v.step,
      steps: v.steps,
      now: v.now,
      phase: v.phase,
      roundId: g?.roundId ?? null,
      tOpen: g?.tOpen ?? null,
      endsAt: g?.endsAt ?? null,
      number: this.state.numbers[id] ?? null,
      status,
      playing, // juega este juego (estaba vivo al empezar)
      out: !!g?.players?.find((p) => p.id === id)?.out,
      pot: v.pot,
      share: v.share,
      aliveCount: v.alive.length,
      awarded: v.awarded?.[id] ?? null,
    };
    if (!g || !playing) return mine;
    const r = this.round;
    switch (v.game) {
      case 'luzroja':
        return { ...mine, cues: g.cues, speed: g.speed, progress: g.progress[id] ?? 0, crossed: g.crossed.includes(id), fallen: g.fallen[id]?.why ?? null };
      case 'panal':
        return { ...mine, envelopes: g.envelopes, shape: r ? r.shapeOf(id) : (g.shapes[id] ?? null), progress: g.progress[id] ?? 0, state: g.state[id] ?? null };
      case 'puente': {
        const turn = g.current === id;
        return { ...mine, steps: g.steps, pos: g.pos, turn, place: g.queue.indexOf(id), current: g.current ? this.#person(g.current) : null, turnEndsAt: g.turnEndsAt, last: g.moves.at(-1) ?? null, crossed: g.crossed.includes(id) };
      }
      case 'cuerda': {
        const side = g.sides.A.includes(id) ? 'A' : 'B';
        return { ...mine, side, rope: g.rope, mates: g.sides[side].length, rivals: g.sides[side === 'A' ? 'B' : 'A'].length, winner: g.winner };
      }
      case 'canicas': {
        const d = g.duels.find((x) => x.a === id || x.b === id);
        if (!d) return { ...mine, bye: true };
        const rival = d.a === id ? d.b : d.a;
        return {
          ...mine,
          rival: this.#person(rival),
          mine: d.marbles[id],
          theirs: d.marbles[rival],
          role: d.loser ? 'done' : d.hider === id ? (d.hasHidden ? 'wait' : 'hide') : d.hasHidden ? 'guess' : 'wait',
          last: d.last,
          lost: d.loser === id,
          won: !!d.loser && d.loser !== id,
        };
      }
    }
    return mine;
  }
}

export { COUNTDOWN_MS };
