// El pañuelo en la sala (core/hanky.js): Hombres lobo (el primer equipo) contra Vampiros (el segundo). El presentador
// sortea cada duelo (o elige la pareja en secreto), da la salida y dice quién ha cogido el pañuelo; los puntos de la
// sección (10 por defecto) son para el ganador del duelo (y suman a su equipo). Los móviles solo avisan: es una prueba
// física. Todo se guarda en itemResults (así R y «Partida nueva» lo borran como lo demás).
import { HANKY_REVEAL_MS, HankyDuels, SIDES } from '../../core/hanky.js';

const COUNTDOWN_MS = 3000;

export class HankyGame {
  type = 'panuelo';
  duels = null;
  #ctx;

  constructor(ctx) {
    this.#ctx = ctx;
  }

  get #room() {
    return this.#ctx.room;
  }

  get inPlay() {
    const r = this.#room.runner;
    return r.screen === 'play' && r.section?.type === this.type && !r.peekScoreboard && !!this.duels;
  }

  toJSON() {
    return null; // va en itemResults
  }

  /** Los dos equipos que se enfrentan: el primero son los lobos y el segundo los vampiros. */
  #teams() {
    const [wolf = null, vampire = null] = this.#room.roster.teams;
    return { wolf, vampire };
  }

  /** La gente de cada equipo que juega (el presentador, solo si la sección le deja). */
  #lineup() {
    const room = this.#room;
    const { wolf, vampire } = this.#teams();
    const of = (team) => (team ? room.roster.list().filter((p) => p.teamId === team.id && !room.benched(p.id)).map((p) => p.id) : []);
    return { wolves: of(wolf), vampires: of(vampire) };
  }

  sync() {
    const r = this.#room.runner;
    const key = r.playKey;
    if (!key || r.section?.type !== this.type || !r.item) {
      this.duels = null;
      return;
    }
    const stored = this.#room.itemResults[key]?.hanky;
    this.duels = stored ? HankyDuels.fromJSON(stored) : new HankyDuels(this.#lineup());
    // Las horas guardadas son del reloj de la tele de antes (si se recargó, empieza de 0): el duelo a medias vuelve
    // al sillón, sin ruleta ni cuenta atrás
    const c = this.duels.current;
    if (stored && c && c.step !== 'done' && (c.calledAt > this.#ctx.now() || c.goAt != null)) Object.assign(c, { step: 'called', calledAt: -1e9, goAt: null });
  }

  /** ¿Puede salir en un sorteo? (sigue en la sala, conectado y en su equipo) */
  #available(id, side) {
    const p = this.#room.roster.get(id);
    const team = this.#teams()[side];
    return !!p && p.connected && p.teamId === team?.id && !this.#room.benched(id);
  }

  stop() {}

  /** Se sabe quién sale justo cuando la ruleta de la tele se para: en ese momento, ¡ya! */
  #goOnReveal() {
    this.duels.go(this.#ctx.now(), HANKY_REVEAL_MS);
    return this.#save();
  }

  #save() {
    const room = this.#room;
    room.itemResults[room.runner.playKey] = { hanky: this.duels.toJSON() };
    return true;
  }

  get #points() {
    return this.#room.runner.section?.points?.[0] ?? 10;
  }

  actions() {
    const now = () => this.#ctx.now();
    const ready = () => {
      if (!this.inPlay) return false;
      this.duels.join(this.#lineup()); // quien haya entrado tarde
      if (!this.duels.wolves.length || !this.duels.vampires.length) return 'Hace falta gente en los dos primeros equipos (lobos y vampiros).';
      return true;
    };
    return {
      // Sorteo entre los que menos han salido de cada equipo
      hankyDraw: () => {
        const ok = ready();
        if (ok !== true) return ok;
        if (this.duels.finished) return 'Ya se han jugado todos los duelos.';
        if (!this.duels.draw(now(), Math.random, (id, side) => this.#available(id, side))) return 'No hay nadie conectado para salir en algún equipo.';
        return this.#goOnReveal();
      },
      // En secreto: la pareja que elige el presentador
      hankyChoose: ({ wolf, vampire }) => {
        const ok = ready();
        if (ok !== true) return ok;
        if (!this.duels.choose(String(wolf), String(vampire), now())) return 'Elige uno de cada equipo.';
        return this.#goOnReveal();
      },
      hankyGo: () => this.inPlay && this.duels.go(now(), COUNTDOWN_MS) && this.#save(),
      hankyFalse: () => this.inPlay && this.duels.falseStart() && this.#save(),
      hankyCancel: () => this.inPlay && this.duels.cancel() && this.#save(),
      hankyWin: ({ side }) => {
        if (!this.inPlay || !SIDES.includes(side)) return false;
        const points = this.#points;
        const winner = this.duels.win(side, now(), points);
        if (!winner) return false;
        this.#room.roster.adjustScore(winner, points);
        return this.#save();
      },
      hankyUndo: () => {
        if (!this.inPlay) return false;
        const d = this.duels.undo();
        if (!d) return false;
        this.#room.roster.adjustScore(d.winner === 'wolf' ? d.wolf : d.vampire, -(d.points ?? 0));
        return this.#save();
      },
    };
  }

  onMessage(playerId, msg, ack) {
    ack('closed'); // los móviles solo miran
  }

  /** R: se quitan los puntos de todos los duelos y se empieza de cero. */
  restart() {
    const room = this.#room;
    for (const d of this.duels?.duels ?? []) room.roster.adjustScore(d.winner === 'wolf' ? d.wolf : d.vampire, -(d.points ?? 0));
    delete room.itemResults[room.runner.playKey];
    this.duels = new HankyDuels(this.#lineup());
    return true;
  }

  #pub(id) {
    const p = this.#room.roster.get(id);
    return p ? { ...this.#ctx.pub(p), fought: this.duels.count(id) } : { id, name: '¿?', fought: 0 };
  }

  /** Tele y mando (el mando, además, quién puede salir en el próximo sorteo). Horas en el reloj de la tele. */
  view({ forControl = false } = {}) {
    const d = this.duels;
    const c = d.current;
    const { wolf, vampire } = this.#teams();
    const team = (t) => t && { id: t.id, name: t.name, color: t.color };
    const nameOf = (id) => this.#room.roster.get(id)?.name ?? '¿?';
    return {
      key: this.#room.runner.playKey,
      teams: { wolf: team(wolf), vampire: team(vampire) },
      wolves: d.wolves.map((id) => this.#pub(id)),
      vampires: d.vampires.map((id) => this.#pub(id)),
      current: c && { wolf: this.#pub(c.wolf), vampire: this.#pub(c.vampire), step: c.step, mode: c.mode, calledAt: c.calledAt, goAt: c.goAt, winner: c.winner },
      duels: d.duels.map((x) => ({ wolf: nameOf(x.wolf), vampire: nameOf(x.vampire), winner: x.winner, ms: x.ms, points: x.points })),
      score: d.score(),
      total: d.total,
      number: Math.min(d.total, d.duels.length + (d.busy ? 1 : 0)),
      finished: d.finished,
      champion: d.champion,
      points: this.#points,
      candidates: forControl ? { wolf: d.candidates('wolf', (id, s) => this.#available(id, s)), vampire: d.candidates('vampire', (id, s) => this.#available(id, s)) } : null,
    };
  }

  /** Móvil: de qué lado está, si le toca y cuánto falta para el «¡YA!» (relativo: el móvil tiene otro reloj). */
  viewFor(player) {
    const v = this.view();
    const now = this.#ctx.now();
    const side = v.wolves.some((p) => p.id === player.id) ? 'wolf' : v.vampires.some((p) => p.id === player.id) ? 'vampire' : player.teamId === v.teams.vampire?.id ? 'vampire' : player.teamId === v.teams.wolf?.id ? 'wolf' : null;
    const c = v.current;
    return {
      key: v.key,
      side,
      teams: { wolf: v.teams.wolf?.name ?? 'Hombres lobo', vampire: v.teams.vampire?.name ?? 'Vampiros' },
      current: c && {
        wolf: c.wolf.name,
        vampire: c.vampire.name,
        step: c.step,
        calledAt: c.calledAt,
        goInMs: c.goAt != null ? c.goAt - now : null,
        winner: c.winner,
        mine: c.wolf.id === player.id ? 'wolf' : c.vampire.id === player.id ? 'vampire' : null,
      },
      score: v.score,
      number: v.number,
      total: v.total,
      finished: v.finished,
      champion: v.champion,
      points: v.points,
    };
  }
}
