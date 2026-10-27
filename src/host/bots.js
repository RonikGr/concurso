// Concursantes de prueba («🤖 Pruebas» en la tele): entran por la misma puerta que los móviles (los manejadores de la
// sala: hello, buzz, answer…) pero sin red, y juegan solos al azar. Sirven para probar el concurso con un solo
// ordenador. Lo que deciden está en core/bots.js.
import { MAX_PLAYERS } from '../core/players.js';
import { PHASE } from '../core/game.js';
import { APHASE, isTiming } from '../core/answers.js';
import { MPHASE } from '../core/millionaire.js';
import { FPHASE, TOOL } from '../core/free.js';
import { SCREEN } from '../core/runner.js';
import { WPHASE } from '../core/words.js';
import { SPHASE } from '../core/shake.js';
import { BPHASE } from '../core/bet.js';
import { SPHASE as SQ } from '../core/squid.js';
import { COLORS, ICONS } from '../shared/appearance.js';
import { BOT_PREFIX, botAnswer, botMillionaireChoice, botName, botPressAt, isBot, pick, randInt, shuffle, teamFor } from '../core/bots.js';

const TICK_MS = 250;
const now = () => performance.now();

export class BotPlayers {
  auto = true; // ¿responden solos? (si no, solo con «¡Responded ya!»)
  #room;
  #input; // los mismos manejadores que usa la red: onHello, onBuzz, onAnswer…
  #rng;
  #seq = 0;
  #done = new Set(); // decisiones ya tomadas («buzz:bot-1:7», «ans:bot-1:s2:0#3»…)
  #timers = new Set();
  #hurry = false; // «¡Responded ya!»: en el siguiente repaso, enseguida
  #tick = 0;

  constructor(room, input, rng = Math.random) {
    this.#room = room;
    this.#input = input;
    this.#rng = rng;
  }

  /** Los bots de la sala (también los guardados de antes). */
  get ids() {
    return this.#room.roster
      .list()
      .map((p) => p.id)
      .filter(isBot);
  }

  /** Arranca: vuelve a «conectar» a los bots guardados (tras recargar la tele) y empieza a jugar. */
  start() {
    for (const id of this.ids) this.#hello(id, this.#room.roster.get(id));
    this.#tick = setInterval(() => this.#think(), TICK_MS);
  }

  stop() {
    clearInterval(this.#tick);
    this.#timers.forEach(clearTimeout);
    this.#timers.clear();
  }

  /** Añade `count` bots (o hasta llenar la sala). @returns cuántos entraron */
  add(count = MAX_PLAYERS) {
    let added = 0;
    for (let k = 0; k < count && this.#room.roster.list().length < MAX_PLAYERS; k++) {
      const roster = this.#room.roster;
      const id = `${BOT_PREFIX}${crypto.randomUUID().slice(0, 8)}`;
      this.#hello(id, {
        name: botName(roster.list().map((p) => p.name)),
        color: pick(this.#rng, COLORS.filter((c) => c.id !== 'gris')).id,
        icon: pick(this.#rng, ICONS).id,
        teamId: teamFor(roster.teams, roster.list()),
      });
      added++;
    }
    return added;
  }

  /** Quita a todos los bots. */
  removeAll() {
    const ids = this.ids;
    for (const id of ids) this.#room.run('removePlayer', { playerId: id });
    return ids.length;
  }

  /** «¡Responded ya!»: los bots hacen ahora lo que toque (sin esperar). */
  actNow() {
    this.#hurry = true;
    this.#think();
  }

  #hello(id, p) {
    this.#input.onHello(id, { name: p.name, color: p.color, icon: p.icon, teamId: p.teamId ?? null, presenter: false });
  }

  /** Hace `fn` dentro de `ms` (poco si hay prisa). */
  #later(ms, fn) {
    const t = setTimeout(
      () => {
        this.#timers.delete(t);
        fn();
      },
      Math.max(0, this.#hurry ? Math.min(ms, randInt(this.#rng, 80, 500)) : ms),
    );
    this.#timers.add(t);
  }

  /** Una vez por decisión (para no pulsar dos veces en la misma ronda). */
  #once(key) {
    if (this.#done.has(key)) return false;
    this.#done.add(key);
    if (this.#done.size > 2000) this.#done.clear(); // que no crezca sin fin (las claves viejas ya no se repiten)
    return true;
  }

  #think() {
    const ids = this.ids;
    if (!ids.length || !(this.auto || this.#hurry)) return;
    const room = this.#room;
    for (const id of ids) {
      if (room.benched?.(id)) continue;
      this.#buzz(id);
      this.#answer(id);
      this.#millionaire(id);
      this.#turnOrder(id);
      this.#count(id);
      this.#words(id);
      this.#shake(id);
      this.#bet(id);
      this.#punish(id);
      this.#squid(id);
    }
    this.#hurry = false;
  }

  // ---------- Pulsador: 6 de cada 10 pulsan, entre 0,25 y 1,8 s después de abrirse el turno
  #buzz(id) {
    const room = this.#room;
    const g = room.game;
    if (!room.inBuzzerPlay || g.phase !== PHASE.OPEN || g.lockouts.has(id)) return;
    if (!this.#once(`buzz:${id}:${g.epoch}`)) return;
    if (!this.#hurry && this.#rng() > 0.6) return;
    const epoch = g.epoch;
    const wait = Math.max(0, g.tOpen - now()) + randInt(this.#rng, 250, 1800);
    this.#later(wait, () => {
      if (!room.inBuzzerPlay || g.epoch !== epoch || g.phase !== PHASE.OPEN) return;
      const t = now();
      this.#input.onBuzz(id, { seq: ++this.#seq, epoch, tPress: t, tArrival: t, meta: { source: 'bot' } });
    });
  }

  // ---------- Respuestas (Verdad, Dos verdades, Votación, Estimación) y tiempo (Contador, Reflejos)
  #answer(id) {
    const room = this.#room;
    const r = room.answerRound;
    if (!room.inAnswerPlay || r.phase !== APHASE.OPEN || !r.eligible.has(id) || r.answers.has(id)) return;
    if (!this.#once(`ans:${id}:${r.roundId}`)) return;
    const send = (value, tPress) => {
      if (room.answerRound !== r || r.phase !== APHASE.OPEN) return;
      this.#input.onAnswer(id, { seq: ++this.#seq, roundId: r.roundId, value, tPress, tArrival: now() });
    };
    if (isTiming(r.question.kind)) {
      const at = Math.min(botPressAt(r, this.#rng), r.deadline - 50);
      this.#later(at - now(), () => send(null, now()));
      return;
    }
    const value = botAnswer(r.question, { selfId: id, candidates: r.candidates ?? [] }, this.#rng);
    if (value == null) return;
    const start = Math.max(0, (r.tOpen ?? now()) - now());
    const window = Math.max(800, Math.min(r.deadline - Math.max(now(), r.tOpen ?? now()) - 600, 9000));
    this.#later(start + randInt(this.#rng, 600, window), () => send(value, now()));
  }

  // ---------- Millonario: el bot que concursa elige; los que votan en el Público, votan
  #millionaire(id) {
    const room = this.#room;
    const m = room.millionaire;
    if (!room.inMillionairePlay) return;
    const q = m.question;
    const send = (value) => {
      if (room.millionaire !== m) return;
      const t = now();
      this.#input.onAnswer(id, { seq: ++this.#seq, roundId: m.roundId, value, tPress: t, tArrival: t });
    };
    // concursa: elige cuando ya se ven todas (otra vez si el 50:50 le quitó la que tenía)
    if (m.seat.playerId === id && m.phase === MPHASE.PLAYING && m.shown >= q.options.length && (m.choice == null || m.removed.includes(m.choice))) {
      if (this.#once(`mill:${id}:${m.roundId}:${m.removed.length}`)) {
        const value = botMillionaireChoice({ correct: q.correct, count: q.options.length, removed: m.removed }, this.#rng);
        this.#later(randInt(this.#rng, 1500, 4000), () => m.phase === MPHASE.PLAYING && send(value));
      }
    }
    // Público: vota en los 15 s
    const a = m.audience;
    if (a?.state === 'voting' && a.voters.includes(id) && !(id in a.votes) && this.#once(`aud:${id}:${m.roundId}`)) {
      const value = botMillionaireChoice({ correct: q.correct, count: q.options.length, removed: m.removed }, this.#rng);
      this.#later(randInt(this.#rng, 1000, Math.max(1500, Math.min(8000, a.endsAt - now() - 1500))), () => a.state === 'voting' && send(value));
    }
  }

  // ---------- Por turnos: el bot portavoz ordena a su equipo (al azar) en la presentación de la sección
  #turnOrder(id) {
    const room = this.#room;
    const p = room.roster.get(id);
    if (!p?.teamId || !room.inTurns || room.runner.screen !== SCREEN.INTRO || room.spokespersonOf(p.teamId) !== id) return;
    const sec = room.runner.section.id;
    if (room.turnOrders[sec]?.[p.teamId] || !this.#once(`order:${id}:${sec}`)) return;
    const members = room.roster
      .list()
      .filter((m) => m.teamId === p.teamId)
      .map((m) => m.id);
    this.#later(randInt(this.#rng, 1500, 3500), () => this.#input.onTurnOrder(id, { order: shuffle(this.#rng, members) }));
  }

  #play(id, game, roundId, action, value = null) {
    this.#input.onPlay(id, { seq: ++this.#seq, game, roundId, action, value });
  }

  // ---------- Palabras secretas: si le toca, empieza y va acertando (o pasando); si es rival, a veces pita
  #words(id) {
    const g = this.#room.games.palabras;
    if (!g.inPlay) return;
    const r = g.round;
    const role = g.roleOf(id);
    if (role === 'actor' && r.phase === WPHASE.READY && this.#once(`wstart:${id}:${r.roundId}`)) {
      this.#later(randInt(this.#rng, 1500, 3000), () => this.#play(id, 'palabras', r.roundId, 'start'));
    }
    if (r.phase !== WPHASE.RUNNING || r.current == null) return;
    const card = `${r.roundId}:${r.results.length}`; // cada tarjeta, una decisión
    if (role === 'actor' && this.#once(`wcard:${id}:${card}`)) {
      this.#later(randInt(this.#rng, 3000, 7000), () => r.phase === WPHASE.RUNNING && `${r.roundId}:${r.results.length}` === card && this.#play(id, 'palabras', r.roundId, this.#rng() < 0.65 ? 'ok' : 'pass'));
    }
    if (role === 'rival' && this.#once(`wfoul:${id}:${card}`) && this.#rng() < 0.04) {
      this.#later(randInt(this.#rng, 1000, 4000), () => r.phase === WPHASE.RUNNING && `${r.roundId}:${r.results.length}` === card && this.#play(id, 'palabras', r.roundId, 'foul'));
    }
  }

  // ---------- Agita el móvil: cada bot agita a su ritmo y manda su total cada 300 ms
  #shake(id) {
    const g = this.#room.games.agitar;
    if (!g.inPlay || g.round.phase !== SPHASE.RUNNING) return;
    const r = g.round;
    if (!this.#once(`shake:${id}:${r.roundId}`)) return;
    const rate = randInt(this.#rng, 8, 25); // sacudidas por segundo
    let total = 0;
    const step = () => {
      if (g.round !== r || r.phase !== SPHASE.RUNNING) return;
      const t = now();
      if (t >= r.tOpen) {
        total += (rate * 0.3) * (0.6 + this.#rng() * 0.8);
        this.#play(id, 'agitar', r.roundId, 'total', Math.round(total));
      }
      if (t < r.endsAt) this.#later(300, step);
    };
    this.#later(300, step);
  }

  // ---------- La gran apuesta: si decide por su equipo (o por sí mismo), apuesta y luego responde
  #bet(id) {
    const g = this.#room.games.apuesta;
    if (!g.inPlay) return;
    const r = g.round;
    const mine = g.viewFor(this.#room.roster.get(id));
    if (!mine.acts) return;
    if (r.phase === BPHASE.BETTING && this.#once(`bet:${id}:${r.roundId}`)) {
      this.#later(randInt(this.#rng, 1000, 3500), () => this.#play(id, 'apuesta', r.roundId, 'bet', Math.round(mine.max * (0.2 + this.#rng() * 0.6))));
    }
    if (r.phase === BPHASE.QUESTION && this.#once(`betans:${id}:${r.roundId}`)) {
      const q = r.question;
      const value = botMillionaireChoice({ correct: q.correct, count: q.options.length, removed: [] }, this.#rng);
      this.#later(randInt(this.#rng, 2000, 5000), () => r.phase === BPHASE.QUESTION && this.#play(id, 'apuesta', r.roundId, 'answer', value));
    }
  }

  // ---------- Castigos: cada bot vota 3 al azar
  #punish(id) {
    const room = this.#room;
    if (room.punishStep !== 'vote' || room.punish.closed || !this.#once(`punish:${id}:${room.punish.options.length}`)) return;
    const picks = shuffle(
      this.#rng,
      room.punish.options.map((_, i) => i),
    ).slice(0, 3);
    picks.forEach((i, k) => this.#later(randInt(this.#rng, 800, 3000) + k * 400, () => this.#play(id, 'castigo', null, 'toggle', i)));
  }

  // ---------- Squid Games: cada bot juega a su manera (y a veces la pifia)
  #squid(id) {
    const g = this.#room.games.squid;
    const r = g.inPlay ? g.round : null;
    if (!r || !r.players.includes(id)) return;
    const game = this.#room.runner.item?.game;
    const send = (action, value = null) => this.#play(id, 'squid', r.roundId, action, value);
    const alive = () => g.round === r && r.phase === SQ.RUNNING;
    // El panal: elegir sobre antes de empezar
    if (game === 'panal' && r.phase === SQ.READY && this.#once(`sqpick:${id}:${r.roundId}`)) {
      this.#later(randInt(this.#rng, 500, 3000), () => g.round === r && send('pick', randInt(this.#rng, 0, 3)));
    }
    if (r.phase !== SQ.RUNNING) return;
    if (game === 'luzroja' && this.#once(`sqrl:${id}:${r.roundId}`)) {
      // Avanza en verde; en cada luz roja, de vez en cuando se le escapa el dedo
      let p = 0;
      const pace = 0.35 + this.#rng() * 0.6; // algunos no llegan a tiempo
      const clumsy = this.#rng() * 0.3;
      let lastRed = null;
      const step = () => {
        if (!alive()) return;
        const t = now();
        if (t >= r.tOpen) {
          const { light, since } = r.lightAt(t);
          if (light === 'green') p = Math.min(100, p + 300 * r.speed * pace);
          else if (since !== lastRed && t - since > 600) {
            lastRed = since;
            if (this.#rng() < clumsy) send('fault', t);
          }
          send('p', p);
        }
        setTimeout(step, 300);
      };
      step();
    }
    if (game === 'panal' && this.#once(`sqpanal:${id}:${r.roundId}`)) {
      let p = 0;
      let cracks = 0;
      const step = () => {
        if (!alive()) return;
        if (now() >= r.tOpen) {
          p = Math.min(100, p + randInt(this.#rng, 1, 5));
          if (this.#rng() < 0.03) cracks++;
          const state = cracks >= 3 ? 2 : p >= 100 ? 1 : 0;
          send('trace', [p, cracks, state]);
          if (state) return;
        }
        setTimeout(step, 400);
      };
      step();
    }
    if (game === 'puente' && r.current === id && this.#once(`sqbr:${id}:${r.roundId}:${r.pos}`)) {
      const wait = Math.max(0, r.tOpen - now()) + randInt(this.#rng, 1500, 4000);
      this.#later(wait, () => alive() && r.current === id && send('choose', randInt(this.#rng, 0, 1)));
    }
    if (game === 'cuerda' && this.#once(`sqtug:${id}:${r.roundId}`)) {
      let taps = 0;
      const rate = 4 + this.#rng() * 5; // toques por segundo
      const step = () => {
        if (!alive()) return;
        if (now() >= r.tOpen) {
          taps += rate * 0.3 * (0.7 + this.#rng() * 0.6);
          send('taps', Math.round(taps));
        }
        setTimeout(step, 300);
      };
      step();
    }
    if (game === 'canicas') {
      const d = r.duelOf(id);
      if (!d || d.loser) return;
      const turn = `${r.roundId}:${d.marbles[d.a]}:${d.marbles[d.b]}:${d.hider}:${d.hidden != null}`;
      if (d.hider === id && d.hidden == null && this.#once(`sqhide:${id}:${turn}`)) {
        this.#later(Math.max(0, r.tOpen - now()) + randInt(this.#rng, 800, 2500), () => alive() && send('hide', randInt(this.#rng, 1, Math.min(d.marbles[id], 5))));
      }
      if (d.hider !== id && d.hidden != null && this.#once(`sqguess:${id}:${turn}`)) {
        this.#later(randInt(this.#rng, 800, 2500), () => alive() && d.hidden != null && send('guess', [randInt(this.#rng, 0, 1), randInt(this.#rng, 1, Math.min(d.marbles[id], 4))]));
      }
    }
  }

  // ---------- Libre con contador: el bot que cuenta suma de vez en cuando
  #count(id) {
    const room = this.#room;
    const f = room.freeRound;
    if (!room.inFreePlay || f.phase !== FPHASE.RUNNING || f.tool !== TOOL.COUNTER) return;
    const p = room.roster.get(id);
    const counting = f.byTeams ? f.counters[p?.teamId] === id : f.participants.includes(id);
    if (!counting) return;
    // un toque cada 1–3 s (la clave cambia cada segundo: como mucho uno por segundo)
    if (!this.#once(`count:${id}:${f.roundId}:${Math.floor(now() / 1000)}`) || this.#rng() > 0.5) return;
    this.#later(randInt(this.#rng, 0, 900), () => {
      if (room.freeRound === f && f.phase === FPHASE.RUNNING) this.#input.onFreeCount(id, { seq: ++this.#seq, roundId: f.roundId, delta: 1 });
    });
  }
}
