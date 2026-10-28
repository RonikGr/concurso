// Squid Games en la sala (core/squid.js): una sección con varios juegos seguidos en la que la gente se va eliminando.
// Al entrar en el primer juego, juegan los conectados (cada uno con su número); quien llega después, mira. Cada juego
// elimina al acabar (cada eliminado mete los puntos de la sección en la hucha) y la última «pregunta» de la sección
// es el reparto de la hucha entre los supervivientes. R reinicia el juego en curso (vuelven los que cayeron en él).
import { COUNTDOWN_MS, MARBLE_ALL_IN_MS, MARBLE_MOVE_MS, MARBLE_REVEAL_MS, spareToFloor, squidCap, squidFloor, SPHASE, SQUID_GAMES, SquidState, createSquidRound } from '../../core/squid.js';
import { DALGONA_SHAPES } from '../../core/dalgona.js';

const LIVE_MS = 250; // repintar como mucho cada 250 ms con los informes de los móviles (avance, toques…)
const SETTLE_MS = { canicas: 3400, cuerda: 600 }; // al acabar antes de tiempo, un respiro para ver lo último (canicas: su revelado)
const SETTLE_DEFAULT_MS = 1800;
const HUCHA_GAP_MS = (n) => Math.max(160, Math.min(320, 4200 / Math.max(1, n))); // como en la tele (squidStage)
const SIDE = ['L', 'R'];

export class SquidGame {
  type = 'squid';
  round = null; // juego en curso (null en el reparto de la hucha)
  state = null; // SquidState de la sección
  #ctx;
  #sections; // sectionId → {state, before: {playKey: estado antes del juego}, results: {playKey: vista final}, awards: {playKey: {id: pts}}}
  #timer = 0;
  #live = 0;
  #closing = false; // el juego ya ha acabado antes de tiempo y se está viendo lo último
  #tick = 0;
  #awardTimer = 0;

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
    return this.#room.runner.section?.points?.[0] ?? 5;
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
      this.#award(key, true);
      return;
    }
    if (rec.results[key]) {
      this.round = null; // ya jugado: se enseña cómo acabó
      return;
    }
    rec.before[key] ??= this.state.toJSON();
    this.round = this.#newRound(this.#ctx.roundId(key));
    // Estaba a medias cuando se recargó la tele: vuelve a empezar (y se avisa)
    if (rec.started?.[key]) this.round.restarted = true;
  }

  /**
   * La ronda del juego que toca, con su tope de eliminados: lo que sobra hasta el suelo, repartido entre los juegos
   * que quedan antes del puente (así todos tienen consecuencias y llega gente al final).
   */
  #newRound(roundId) {
    const r = this.#room.runner;
    const game = this.#item.game;
    const gamesLeft = r.section.items.slice(r.itemIndex).filter((x) => x.game !== 'hucha' && x.game !== 'puente').length;
    const cap = squidCap(game, { alive: this.state.alive.length, started: Object.keys(this.state.numbers).length, gamesLeft });
    return createSquidRound(game, { roundId, players: this.state.alive, item: this.#item, cap });
  }

  stop() {
    clearTimeout(this.#timer);
    clearTimeout(this.#live);
    clearTimeout(this.#awardTimer);
    clearInterval(this.#tick);
    this.#tick = 0;
    this.#timer = 0;
    this.#live = 0;
    this.#awardTimer = 0;
    this.#closing = false;
  }

  /**
   * Si queda uno (o nadie), los juegos que faltan no se pueden jugar: «siguiente» va directo a la hucha. @returns el
   * índice de la hucha o null
   */
  skipTo() {
    if (!this.inPlay || this.#item?.game === 'hucha' || this.state.alive.length > 1 || this.round?.phase === SPHASE.RUNNING) return null;
    const items = this.#room.runner.section.items;
    const i = items.findIndex((x) => x.game === 'hucha');
    return i > this.#room.runner.itemIndex ? i : null;
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
    (this.#record.started ??= {})[this.#room.runner.playKey] = true;
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
      // Lo siguiente que pasa: se ve cómo acaba el salto (los móviles lo saben entonces), termina el salto, se acaba el
      // tiempo de quien está delante (le empujan) o termina el último salto (fin del juego).
      const m = r.moves.at(-1);
      const next = [m && m.at + m.reveal, m && m.ends, r.closesAt ?? r.turnEndsAt].filter((t) => t != null && t > now - 1).sort((a, b) => a - b)[0];
      if (next == null) return;
      this.#timer = setTimeout(
        () => {
          if (this.round !== r) return;
          const t = this.#ctx.now();
          if (r.closesAt != null && t >= r.closesAt) this.#finish();
          else {
            r.push(t);
            if (r.phase === SPHASE.DONE) this.#finish();
            else this.#arm();
          }
          this.#ctx.changed();
        },
        Math.max(0, next - now) + 30,
      );
      return;
    }
    this.#timer = setTimeout(() => this.round === r && this.#finish() && this.#ctx.changed(), Math.max(0, r.endsAt - now) + 700);
    // Canicas: quien se duerme, juega la suerte por él (que ningún duelo se pare)
    if (this.#item.game === 'canicas' && !this.#tick) {
      this.#tick = setInterval(() => {
        if (this.round !== r || r.phase !== SPHASE.RUNNING) return;
        if (!r.autoPlay(this.#ctx.now())) return;
        if (this.#earlyEnd(r)) this.#settle(r);
        this.#ctx.changed({ persist: false });
      }, 1000);
    }
  }

  /** Fin del juego: quedan fuera los que diga la ronda (y cada uno mete su parte en la hucha). */
  #finish() {
    const r = this.round;
    if (!r) return false;
    if (r.phase === SPHASE.RUNNING) r.finish(this.#ctx.now());
    if (r.phase !== SPHASE.DONE) return false;
    this.stop();
    // Red de seguridad (el tope de cada juego ya lo evita): si cayeran demasiados, se salvan por los pelos los mejores
    let out = r.out;
    if (this.#item.game !== 'puente' && !r.skipped) {
      const res = spareToFloor(this.state.alive, out, squidFloor(Object.keys(this.state.numbers).length), (id) => r.score?.(id) ?? 0);
      out = res.out;
      r.floorSpared = res.spared;
    }
    this.state.eliminate(out, this.#item.game, this.#perHead);
    const rec = this.#record;
    rec.state = this.state.toJSON();
    rec.results[this.#room.runner.playKey] = this.#gameView(true);
    delete rec.started?.[this.#room.runner.playKey];
    this.round = null;
    return true;
  }

  /**
   * Reparto de la hucha (una vez): cada superviviente se lleva su parte. Con `later`, cuando la tele termina de
   * contarla (si no, los móviles y el marcador se adelantarían a la animación).
   */
  #award(key, later = false) {
    const rec = this.#record;
    if (rec.awards[key]) return;
    if (later) {
      const n = this.state.out.length;
      const ms = 2600 + n * HUCHA_GAP_MS(n) + 2100;
      this.awardAt = this.#ctx.now() + ms;
      clearTimeout(this.#awardTimer);
      this.#awardTimer = setTimeout(() => {
        if (this.#room.runner.playKey !== key) return;
        this.#award(key);
        this.#ctx.changed();
      }, ms);
      return;
    }
    rec.awards[key] = this.state.shares();
    for (const [id, pts] of Object.entries(rec.awards[key])) if (pts) this.#room.roster.adjustScore(id, pts);
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
    if (this.#item.game !== 'hucha') this.#forgetAfter(); // lo jugado después (y su reparto) ya no vale
    rec.state = this.state.toJSON();
    const key = this.#room.runner.playKey;
    if (this.round?.phase === SPHASE.READY) {
      this.round = this.#newRound(this.round.roundId);
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
    this.#forgetAfter(); // lo jugado después de esta prueba ya no vale (se ha vuelto atrás)
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
    delete rec.started?.[key]; // no es que se recargara la tele: se ha reiniciado
    this.sync();
    if (this.round) this.round.restarted = 'manual';
    return true;
  }

  /** Quita lo guardado de las pruebas posteriores a la actual (resultados, estados y repartos de la hucha). */
  #forgetAfter() {
    const rec = this.#record;
    const r = this.#room.runner;
    const later = (k) => {
      const [s, i] = String(k).split(':').map(Number);
      return s === r.sectionIndex && i > r.itemIndex;
    };
    for (const k of Object.keys(rec.awards)) if (later(k)) this.#undoAward(k);
    for (const bag of [rec.results, rec.before, rec.started ?? {}]) for (const k of Object.keys(bag)) if (later(k)) delete bag[k];
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
      case 'puente:bet':
        ok = r.bet(playerId, SIDE[v], now);
        live = true;
        break;
      case 'cuerda:taps':
        ok = r.report(playerId, Number(v), now);
        live = true;
        break;
      case 'canicas:hide':
        ok = r.hide(playerId, Number(v), now);
        break;
      case 'canicas:guess':
        ok = Array.isArray(v) && r.guess(playerId, v[0], v[1], now);
        // cuando se abre la mano, los móviles ya pueden saber quién gana
        if (ok) setTimeout(() => this.round === r && this.#ctx.changed({ persist: false }), MARBLE_REVEAL_MS + 50);
        break;
    }
    ack(ok ? 'ok' : 'closed');
    // ¿Se acabó antes de tiempo? (también aunque este mensaje no cambie nada: p. ej. ya han cruzado todos)
    if (!ok && !this.#closing && this.#earlyEnd(r)) {
      this.#settle(r);
      return this.#ctx.changed({ persist: false });
    }
    if (!ok) return;
    // ¿Se acabó antes de tiempo? (todos a salvo o fuera, un bando gana, todos los duelos decididos…)
    if (this.#earlyEnd(r)) {
      this.#settle(r);
      return this.#ctx.changed({ persist: false });
    }
    if (!live) return this.#ctx.changed({ persist: false });
    if (!this.#live) {
      this.#live = setTimeout(() => {
        this.#live = 0;
        this.#ctx.changed({ persist: false });
      }, LIVE_MS);
    }
  }

  /** Se ha acabado antes de tiempo: un momento para que se vea lo último (el último revelado de canicas…) y fin. */
  #settle(r) {
    if (this.#closing) return;
    this.#closing = true;
    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => {
      if (this.round === r && this.#finish()) this.#ctx.changed();
    }, SETTLE_MS[this.#item.game] ?? SETTLE_DEFAULT_MS);
  }

  /** Canicas: quién ha perdido ya a la vista (su última jugada ya se ha revelado). */
  #marblesOut(r, now) {
    return r.duels.filter((d) => d.loser && (d.timeUp || !d.last?.at || now >= d.last.at + MARBLE_REVEAL_MS)).map((d) => d.loser);
  }

  #earlyEnd(r) {
    switch (this.#item.game) {
      case 'luzroja':
        return r.players.every((id) => id in r.crossed || id in r.fallen);
      case 'panal':
        return r.allSettled;
      case 'cuerda':
        return r.decided(this.#ctx.now());
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
    // En el puente, quien cae no está fuera hasta que se ve su salto
    const spared = new Set([...(r.spared ?? []), ...(r.floorSpared ?? [])]);
    const out = new Set((game === 'puente' && r.phase === SPHASE.RUNNING ? r.fellBy(now) : game === 'canicas' && r.phase === SPHASE.RUNNING ? this.#marblesOut(r, now) : r.out).filter((id) => !spared.has(id)));
    const base = {
      roundId: r.roundId,
      phase: r.phase,
      tOpen: r.tOpen ?? null,
      endsAt: r.endsAt ?? null,
      skipped: !!r.skipped, // no había gente suficiente para este juego
      restarted: r.restarted ?? false, // vuelve a empezar: 'manual' (R) o true (la tele se recargó a mitad)
      spared: [...spared], // se salvan por los pelos (ya había caído el tope del juego), en cuanto se sabe
      cap: r.cap ?? null,
      players: r.players.map((id) => ({ ...this.#person(id), out: out.has(id) })),
    };
    switch (game) {
      case 'luzroja':
        return { ...base, cues: r.cues, speed: r.speed, progress: r.progress, crossed: Object.keys(r.crossed), fallen: Object.fromEntries(Object.entries(r.fallen).filter(([id]) => !spared.has(id))), saved: r.saved };
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
          moves: r.moves, // la tele los ve con su resultado (lo enseña con suspense); los móviles, solo los ya vistos
          jumping: !!r.jumping?.(now),
          jumpMs: r.jumpMs,
          crossed: r.crossed,
          turnEndsAt: r.turnEndsAt,
          turnEndsInMs: r.turnEndsAt == null ? null : r.turnEndsAt - now,
          safe: secret ? r.safe : null, // el camino bueno: solo el mando
          tally: r.tally?.() ?? { L: 0, R: 0 }, // lo que dicen los que esperan del tramo que viene
          bets: secret ? (r.bets?.[r.pos] ?? {}) : null,
          hits: r.hits ?? {},
        };
      case 'cuerda':
        return {
          ...base,
          sides: r.sides,
          rope: r.rope,
          totals: { A: r.sides.A.reduce((s, id) => s + (r.taps[id] ?? 0), 0), B: r.sides.B.reduce((s, id) => s + (r.taps[id] ?? 0), 0) },
          averages: r.averages, // lo que cuenta: toques por cabeza
          winner: r.winner,
        };
      case 'canicas':
        return {
          ...base,
          bye: r.bye,
          allInAt: r.endsAt != null ? r.endsAt - MARBLE_ALL_IN_MS : null, // desde aquí, todo o nada
          duels: r.duels.map((d) => ({ a: d.a, b: d.b, since: d.since, marbles: d.marbles, hider: d.hider, hasHidden: d.hidden != null, hidden: secret ? d.hidden : null, last: d.last, loser: d.loser, spared: !!d.spared, timeUp: !!d.timeUp, coin: !!d.coin, turns: d.turns })),
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
      min: info?.min ?? 1, // gente que hace falta para jugarlo
      lastGame: room.runner.itemIndex >= room.runner.itemCount - 2 || this.state.alive.length <= 1, // luego solo queda la hucha
      now, // hora de la tele al hacer la vista (los móviles sin sincronizar cuentan desde aquí)
      phase: gameView?.phase ?? (game === 'hucha' ? 'done' : SPHASE.READY),
      g: gameView,
      pot: this.state.pot,
      perHead: this.#perHead,
      share: this.state.share,
      shares: this.state.shares(), // lo de cada superviviente (sin inventar puntos)
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
    const outNow = !!g?.players?.find((p) => p.id === id)?.out; // ya ha caído en este juego (aún no ha acabado)
    const status = outNow || v.fallen.some((p) => p.id === id) ? 'out' : v.alive.some((p) => p.id === id) ? 'alive' : 'watching';
    const mine = {
      game: v.game,
      label: v.label,
      icon: v.icon,
      rule: v.rule,
      step: v.step,
      steps: v.steps,
      now: v.now,
      phase: v.phase,
      restarted: !!g?.restarted,
      roundId: g?.roundId ?? null,
      tOpen: g?.tOpen ?? null,
      endsAt: g?.endsAt ?? null,
      number: this.state.numbers[id] ?? null,
      status,
      playing, // juega este juego (estaba vivo al empezar)
      out: !!g?.players?.find((p) => p.id === id)?.out,
      pot: v.pot,
      perHead: v.perHead,
      share: v.share,
      myShare: v.shares?.[id] ?? null,
      aliveCount: v.alive.length - (g?.players?.filter((p) => p.out).length ?? 0),
      awarded: v.awarded?.[id] ?? null,
      huchaDone: !!v.awarded, // la tele ya ha contado la hucha (antes, ni cifras: que no se destripe)
      lastGame: v.lastGame, // después solo queda la hucha
      spared: !!g?.spared?.includes(id), // se salva por los pelos
    };
    if (!g || !playing) return mine;
    const r = this.round;
    switch (v.game) {
      case 'luzroja':
        return { ...mine, cues: g.cues, speed: g.speed, progress: g.progress[id] ?? 0, crossed: g.crossed.includes(id), fallen: g.fallen[id]?.why ?? null, saved: g.saved?.[id]?.why ?? null };
      case 'panal':
        return { ...mine, envelopes: g.envelopes, shape: r ? r.shapeOf(id) : (g.shapes[id] ?? null), progress: g.progress[id] ?? 0, cracks: g.cracks[id] ?? 0, state: g.state[id] ?? null };
      case 'puente': {
        // Mientras se ve un salto, el resultado es secreto (los móviles lo saben a la vez que la tele)
        const m = g.moves.at(-1) ?? null;
        const seen = !m || !r || r.revealed(m, v.now);
        const last = m && { ...m, ok: seen ? m.ok : null, held: seen ? m.held : null, jumper: this.#person(m.id) };
        return {
          ...mine,
          tiles: g.steps,
          pos: g.pos,
          turn: g.current === id && !g.jumping,
          place: g.queue.indexOf(id),
          current: g.current ? this.#person(g.current) : null,
          turnEndsAt: g.turnEndsAt,
          last,
          jumping: g.jumping,
          known: g.moves.filter((x) => !r || r.revealed(x, v.now)).map((x) => ({ step: x.step, side: x.side, ok: x.ok })),
          myJumps: g.moves.filter((x) => x.id === id && (x.ok || x.held) && (!r || r.revealed(x, v.now))).length, // tramos que ya ha superado
          crossed: seen && g.crossed.includes(id),
          tally: g.tally, // lo que dicen los que esperan (también lo ve quien salta)
          myBet: r?.bets?.[g.pos]?.[id] ?? null,
          // apuestas acertadas (solo de los saltos ya vistos)
          hits: g.moves.filter((x) => (!r || r.revealed(x, v.now)) && r?.bets?.[x.step]?.[id] === (x.ok ? x.side : x.side === 'L' ? 'R' : 'L')).length,
          jumped: g.moves.some((x) => x.id === id),
        };
      }
      case 'cuerda': {
        const side = g.sides.A.includes(id) ? 'A' : 'B';
        const other = side === 'A' ? 'B' : 'A';
        return { ...mine, side, rope: g.rope, mates: g.sides[side].length, rivals: g.sides[other].length, winner: g.winner, force: g.averages?.[side] ?? 0, rivalForce: g.averages?.[other] ?? 0 };
      }
      case 'canicas': {
        const d = g.duels.find((x) => x.a === id || x.b === id);
        // sin pareja: ve los duelos en directo
        if (!d) return { ...mine, bye: true, duels: g.duels.map((x) => ({ a: this.#person(x.a), b: this.#person(x.b), marbles: x.marbles, loser: x.loser && (x.timeUp || !x.last?.at || v.now >= x.last.at + MARBLE_REVEAL_MS) ? x.loser : null, spared: x.spared })), allInAt: g.allInAt };
        const rival = d.a === id ? d.b : d.a;
        const decided = d.timeUp || !d.last?.at || v.now >= d.last.at + MARBLE_REVEAL_MS;
        return {
          ...mine,
          rival: this.#person(rival),
          mine: d.marbles[id],
          theirs: d.marbles[rival],
          role: d.loser ? 'done' : d.hider === id ? (d.hasHidden ? 'wait' : 'hide') : d.hasHidden ? 'guess' : 'wait',
          moveEndsAt: d.since != null ? d.since + MARBLE_MOVE_MS : null, // si no juega antes, juega la suerte
          turns: d.turns,
          last: d.last,
          // quién gana se sabe cuando se abre la mano (no antes: que el móvil no lo destripe)
          lost: d.loser === id && decided,
          won: !!d.loser && d.loser !== id && decided,
          duelSpared: !!d.spared && decided, // quien pierde se salva por los pelos
          allInAt: g.allInAt,
          timeUp: !!d.timeUp,
          coin: !!d.coin,
        };
      }
    }
    return mine;
  }
}

export { COUNTDOWN_MS };
