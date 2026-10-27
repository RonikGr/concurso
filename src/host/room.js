// Controlador del portátil: une el concurso (show + runner), los jugadores (roster), el motor del pulsador,
// los mandos del presentador, las conexiones y la persistencia. La tele escucha 'change' (repintar) y
// 'decided' (hay ganador); el mando recibe `controlState` y manda órdenes que acaban en `run()`.
import { MAX_PLAYERS, MIN_PLAYERS, Roster } from '../core/players.js';
import { LOCK, PHASE, QuestionEngine, playerView } from '../core/game.js';
import { SCREEN, ShowRunner, isPlayable } from '../core/runner.js';
import { DEFAULT_SETTINGS as SHOW_DEFAULTS, SECTION_TYPES, defaultShow } from '../core/show.js';
import {
  ANSWER_RESULT,
  ANSWER_TYPES,
  APHASE,
  AnswerRound,
  GREEN_MIN_MS,
  JokerBank,
  buildQuestion,
  isChoice,
  isTiming,
  AWAY_MIN_MS,
  reflexDelayMs,
  reflexPlan,
  reflexVariant,
  revealHoldMs,
} from '../core/answers.js';
import { ERROR_CODE, MSG } from '../shared/protocol.js';
import { FPHASE, FreeRound } from '../core/free.js';
import { PeerSource } from './sources/peerSource.js';
import { BotPlayers } from './bots.js';
import { AwayLog } from '../core/awayLog.js';
import { WordsGame } from './games/words.js';
import { ShakeGame } from './games/shake.js';
import { BetGame } from './games/bet.js';
import { PunishmentVote } from '../core/punishments.js';
import { saveRoom } from './persistence.js';
import { matchFace } from '../core/faces.js';
import { TURN_TYPES, answererFor, normalizeOrder, seatFor } from '../core/turns.js';
import { MPHASE, MillionaireRound } from '../core/millionaire.js';
import { pointsForLevel, questionLevel } from '../core/millionaireMusic.js';
import { sectionEnv } from '../shared/environments.js';

/** Ajustes de tiempos del pulsador y del sonido de la tele (los puntos vienen del concurso). */
export const DEFAULT_SETTINGS = {
  lockEarlyBuzz: true,
  antiCheat: 'void', // salir de la app con una pregunta abierta: 'void' anula su respuesta, 'warn' solo avisa, 'off' nada
  scheduledOpenMs: 300,
  countdownSec: 3, // cuenta atrás 3-2-1 antes de cada pregunta (pulsador y respuestas)
  decisionWindowMs: 150,
  nearTieMs: 30,
  musicOn: true,
  sfxOn: true,
  volume: 70,
  quality: 'auto', // imagen de la tele: 'auto' se ajusta sola para ir fluida; 'high' / 'low' la fijan
};

const CONTROL_PUSH_MS = 150; // agrupar cambios antes de mandar el estado completo al mando
const SETUP_STEPS = ['prep', 'title', 'join']; // antes de empezar: archivos y mando → título → conexión
const ANSWER_GRACE_MS = 500; // tras el final, se espera un poco a respuestas dadas a tiempo que aún viajan
const now = () => performance.now();

export class HostRoom extends EventTarget {
  // Puntos de un revelado que se suman cuando la tele ya enseña quién ha ganado (no antes: chivarían el resultado).
  #pendingPoints = null; // {points: {playerId: pts}, timer}
  // Millonario (secciones de Test): la pregunta en juego, sus temporizadores y desde cuándo se ve
  millionaire = null;
  #mTimers = [];
  #mStartedAt = null;
  // Caras: fotos guardadas en este portátil, cada una con sus nombres. Quien entra con uno de ellos juega con su cara.
  faces = []; // [{id, names, img}]
  #sentFaces = ''; // caras que tienen ahora los móviles (ids), para no reenviarlas sin cambios
  // Antitrampas: quién está ahora fuera de la app (desde cuándo) y los avisos de la tele y el mando
  #away = new Map(); // playerId → instante en que salió
  #buzzerOpenedAt = null;
  #rulesFor = null; // sección (millonario) cuya presentación va ya por «Cómo se juega»
  #versusStep = false; // portada: antes, la presentación de los equipos («Rojos contra Azules»)
  #punishStep = false; // portada: tras los equipos, la votación de castigos
  #rouletteStep = false; // final: tras el podio, la ruleta del castigo
  cheatAlerts = []; // [{id, playerId, name, ms, voided, forgiven, at}] los últimos
  #alertSeq = 0;
  #windowTimer = null;
  #openTimer = null;
  #answerTimer = null;
  #greenTimer = null;
  #controlPush = null;
  #playKey = null;
  #roundSeq = 0;

  constructor({ code, saved = null }) {
    super();
    this.code = code;
    this.controlSecret = saved?.controlSecret ?? randomSecret();
    this.approvedControls = new Set(saved?.approvedControls ?? []);
    this.pendingControls = new Map(); // controlId → {deviceName}
    this.connectedControls = new Set();

    this.show = saved?.show ?? defaultShow();
    this.roster = new Roster(saved?.players ?? [], {
      teams: this.show.teams,
      teamsLocked: saved?.teamsLocked ?? false,
      teamBonus: saved?.teamBonus ?? {},
    });
    this.runner = new ShowRunner(this.show, saved?.runner);
    this.settings = { ...DEFAULT_SETTINGS, lockEarlyBuzz: this.show.settings?.lockEarlyBuzz ?? true, ...saved?.settings };
    this.game = new QuestionEngine(this.settings);
    this.jokers = new JokerBank(this.show.settings?.jokers ?? SHOW_DEFAULTS.jokers, saved?.jokersUsed ?? {});
    this.itemResults = saved?.itemResults ?? {}; // playKey → resultado ya puntuado de una pregunta de respuestas
    // Por turnos: portavoz de cada equipo (lo elige el presentador; si no, el primero que entró) y orden por sección
    this.spokespeople = new Map(Object.entries(saved?.spokespeople ?? {})); // teamId → playerId
    this.turnOrders = saved?.turnOrders ?? {}; // sectionId → teamId → [playerId…]
    // Antes de empezar: preparación (archivos y mando) → título del concurso → conexión de los jugadores
    this.setupStep = SETUP_STEPS.includes(saved?.setupStep) ? saved.setupStep : 'prep';
    // Jugadores que juegan desde el mando del presentador: en las secciones sin «El presentador juega», fuera
    this.presenterIds = new Set(saved?.presenterIds ?? []);
    // Quién sale de la app (en cualquier momento): avisos y recuento para el mando
    this.awayLog = new AwayLog(saved?.awayLog);
    // Concurso en pausa para seguir otro día: {at: fecha} (lo guardado no caduca mientras tanto)
    this.paused = saved?.paused ?? null;
    // Castigos para quien pierda: se votan tras presentar los equipos; en el final, la ruleta
    this.punish = new PunishmentVote(this.show.punishments ?? [], saved?.punish);
    this.answerRound = null;
    this.freeRound = null; // sección Libre: la prueba actual
    this.duelPick = []; // Duelo de reflejos: los dos que juegan (se mantiene entre rondas)
    // Juegos con su propio controlador (host/games/): Palabras secretas, Agita el móvil y La gran apuesta
    const ctx = {
      room: this,
      changed: (opts) => this.#afterChange(opts),
      turnOrder: (teamId) => this.#turnOrder(teamId),
      roundId: (key) => `${key}#${++this.#roundSeq}`,
      now,
      pub: (p) => publicPlayer(p),
    };
    this.games = { palabras: new WordsGame(ctx, saved?.games?.palabras), agitar: new ShakeGame(ctx), apuesta: new BetGame(ctx) };
    for (const g of Object.values(this.games)) Object.assign(this.#actions, g.actions());
    this.#playKey = this.runner.playKey;
    this.#syncAnswerRound();
    this.#syncFreeRound();
    this.#syncMillionaire();
    this.#syncGames();
    this.lastImport = null;

    this.network = { state: 'connecting', message: '' };
    this.rtt = new Map();
    this.sync = new Map(); // playerId → último syncReport del móvil
    this.lastRound = null; // última ronda con pulsaciones, para el modo depuración

    // Lo que entra de los jugadores y mandos: por la red (PeerSource) o de los concursantes de prueba (bots)
    const handlers = {
        onStatus: (s) => {
          this.network = s;
          this.#changed({ persist: false });
        },
        // Un móvil llega a la tele por el servidor de enlace pero no consigue la conexión directa
        onConnectFailed: () => {
          this.connectFailures = { count: (this.connectFailures?.count ?? 0) + 1, at: Date.now() };
          this.#changed({ persist: false });
        },
        onHello: (playerId, msg) => this.#onHello(playerId, msg),
        onProfile: (playerId, msg) => this.#onProfile(playerId, msg),
        onBuzz: (playerId, msg) => this.#onBuzz(playerId, msg),
        onAnswer: (playerId, msg) => this.#onAnswer(playerId, msg),
        onJoker: (playerId, msg) => this.#onJoker(playerId, msg),
        onFreeCount: (playerId, msg) => this.#onFreeCount(playerId, msg),
        onAway: (playerId, msg) => this.#onAway(playerId, msg),
        onTurnOrder: (playerId, msg) => this.#onTurnOrder(playerId, msg),
        onPlay: (playerId, msg) => this.#onPlay(playerId, msg),
        onSyncReport: (playerId, report) => {
          this.sync.set(playerId, report);
          this.#changed({ persist: false });
        },
        onLeave: (playerId) => this.#onLeave(playerId),
        onRtt: (playerId, ms) => {
          this.rtt.set(playerId, ms);
          this.#changed({ persist: false });
        },
        onControlHello: (controlId, msg) => this.#onControlHello(controlId, msg),
        onCommand: (controlId, msg) => this.run(msg.action, msg.args),
        onControlLeave: (controlId) => {
          this.connectedControls.delete(controlId);
          this.pendingControls.delete(controlId);
          this.#changed({ persist: false });
        },
    };
    this.source = new PeerSource({ roomCode: code, handlers });
    this.bots = new BotPlayers(this, handlers);
  }

  start() {
    this.source.start();
    this.bots.start();
    this.#persist();
  }

  destroy() {
    this.#clearTimers();
    clearTimeout(this.#controlPush);
    this.source.destroy();
    this.bots.stop();
    for (const g of Object.values(this.games)) g.stop();
  }

  get canStart() {
    return this.roster.connectedCount >= MIN_PLAYERS;
  }

  /** ¿Se está jugando una pregunta de pulsador ahora mismo? */
  get inBuzzerPlay() {
    return this.runner.screen === SCREEN.PLAY && this.runner.section?.type === 'pulsador' && !this.runner.peekScoreboard;
  }

  /** ¿Se está jugando una pregunta de una sección de respuestas (Test, votación…)? */
  get inAnswerPlay() {
    return this.runner.screen === SCREEN.PLAY && ANSWER_TYPES.has(this.runner.section?.type) && !this.runner.peekScoreboard && !!this.answerRound;
  }

  /** ¿Se está jugando una prueba de la sección Libre? */
  /** Sección por turnos (con equipos): cada pregunta la responde uno de cada equipo, en el orden de su portavoz. */
  get inTurns() {
    const s = this.runner.section;
    return this.roster.hasTeams && (s?.type === 'test' || (!!s?.turns && TURN_TYPES.has(s.type)));
  }

  /** ¿Se está jugando una pregunta del millonario (sección de Test)? */
  /** ¿Hay al menos dos equipos con gente? (entonces, antes de la portada, «Equipo A contra equipo B») */
  get hasVersus() {
    const players = this.roster.list();
    return this.roster.teams.filter((t) => players.some((p) => p.teamId === t.id)).length >= 2;
  }

  /** ¿Hay castigos en la hoja? (al menos dos, para que haya algo que votar) */
  get hasPunish() {
    return this.punish.options.length >= 2;
  }

  /** ¿En qué paso de los castigos estamos? 'vote' (portada) | 'roulette' (final) | null */
  get punishStep() {
    if (this.runner.screen === SCREEN.COVER && this.#punishStep) return 'vote';
    if (this.runner.screen === SCREEN.FINAL && this.#rouletteStep) return 'roulette';
    return null;
  }

  /** Quien pierde: el equipo con menos puntos (o, sin equipos, el jugador). */
  get loser() {
    const standings = this.roster.teamStandings();
    if (standings.length) {
      const last = standings.at(-1);
      return { name: last.team.name, color: last.team.color, isTeam: true };
    }
    const players = [...this.roster.list()].sort((a, b) => a.score - b.score);
    return players[0] ? { name: players[0].name, color: players[0].color, isTeam: false } : null;
  }

  /** Castigos para la tele, el mando y los móviles. */
  punishView(player = null) {
    const step = this.punishStep;
    if (!step && !(this.runner.screen === SCREEN.FINAL && this.punish.spin)) return null;
    const p = this.punish;
    return {
      step,
      options: p.options,
      tally: p.tally(),
      voters: Object.keys(p.votes).length,
      closed: p.closed,
      finalists: p.finalists?.map((i) => ({ index: i, text: p.options[i] })) ?? null,
      spin: p.spin && { index: p.spin.index, text: p.options[p.spin.index], at: p.spin.at, ago: now() - p.spin.at },
      loser: this.loser,
      mine: player ? (p.votes[player.id] ?? []) : null,
    };
  }

  /** ¿La portada va por la presentación de los equipos? */
  get versusStep() {
    return this.runner.screen === SCREEN.COVER && this.#versusStep;
  }

  /** ¿La presentación de un millonario va por «Cómo se juega»? */
  get introRules() {
    const r = this.runner;
    return r.screen === SCREEN.INTRO && r.section?.type === 'test' && this.#rulesFor === r.sectionIndex;
  }

  get inMillionairePlay() {
    return this.runner.screen === SCREEN.PLAY && this.runner.section?.type === 'test' && !this.runner.peekScoreboard && !!this.millionaire;
  }

  /** Millonario: grupos para el asiento (equipos con el orden de su portavoz; sin equipos, todos por orden de llegada). */
  #seatGroups() {
    if (!this.roster.hasTeams) return [{ teamId: null, order: this.roster.list().filter((p) => !this.benched(p.id)).map((p) => p.id) }];
    return this.roster.teams.map((t) => ({ teamId: t.id, order: this.#turnOrder(t.id) }));
  }

  /** Millonario: en qué pregunta (1, 2…) concursa este jugador en la sección actual (si todos estuvieran conectados). */
  #seatQuestionOf(playerId) {
    const groups = this.#seatGroups();
    for (let k = 0; k < Math.max(1, this.runner.itemCount); k++) if (seatFor(groups, k)?.playerId === playerId) return k + 1;
    return null;
  }

  #members(teamId) {
    return this.roster.list().filter((p) => p.teamId === teamId);
  }

  /**
   * ¿Este jugador es el presentador (juega desde el mando) y la sección actual no le deja jugar? Ve las preguntas con
   * sus respuestas en el mando, así que solo juega donde lo dice la columna «El presentador juega».
   */
  benched(playerId) {
    const s = this.runner.section;
    return this.presenterIds.has(playerId) && !!s && !s.presenterPlays;
  }

  /** Portavoz de un equipo: el elegido por el presentador o, si no hay, el primero que entró (mejor no el presentador). */
  spokespersonOf(teamId) {
    const members = this.#members(teamId);
    const chosen = this.spokespeople.get(teamId);
    return members.find((p) => p.id === chosen)?.id ?? members.find((p) => !this.presenterIds.has(p.id))?.id ?? members[0]?.id ?? null;
  }

  /** Orden del equipo en la sección actual (el del portavoz, completado; sin el presentador si no juega). */
  #turnOrder(teamId) {
    const ids = this.#members(teamId)
      .filter((p) => !this.benched(p.id))
      .map((p) => p.id);
    return normalizeOrder(this.turnOrders[this.runner.section?.id]?.[teamId], ids);
  }

  /** Quién responde la pregunta actual por cada equipo (saltando a los desconectados). */
  #answerers() {
    const connected = (id) => !!this.roster.get(id)?.connected;
    return this.roster.teams
      .map((team) => ({ team, playerId: answererFor(this.#turnOrder(team.id), this.runner.itemIndex, connected) }))
      .filter((a) => a.playerId);
  }

  /** Por turnos, para la tele y el mando: portavoces, si ya ordenaron, el orden y a quién le toca ahora. */
  #turnsView() {
    if (!this.inTurns || ![SCREEN.INTRO, SCREEN.PLAY].includes(this.runner.screen)) return null;
    const sec = this.runner.section.id;
    const pub = (id) => (id && this.roster.get(id) ? publicPlayer(this.roster.get(id)) : null);
    return {
      teams: this.roster.teams.map((team) => ({
        team,
        spokesperson: pub(this.spokespersonOf(team.id)),
        ready: !!this.turnOrders[sec]?.[team.id],
        order: this.#turnOrder(team.id).map(pub),
      })),
      answerers:
        this.runner.screen !== SCREEN.PLAY
          ? []
          : this.runner.section.type === 'test'
            ? this.millionaire?.seat.playerId
              ? [{ team: this.roster.team(this.millionaire.seat.teamId), player: pub(this.millionaire.seat.playerId) }]
              : []
            : this.#answerers().map(({ team, playerId }) => ({ team, player: pub(playerId) })),
    };
  }

  /** Por turnos: el portavoz manda desde su móvil el orden de su equipo (mientras se presenta la sección). */
  #onTurnOrder(playerId, msg) {
    const p = this.roster.get(playerId);
    if (!p?.teamId || !this.inTurns || this.runner.screen !== SCREEN.INTRO || this.spokespersonOf(p.teamId) !== playerId) return;
    const sec = this.runner.section.id;
    this.turnOrders[sec] = { ...this.turnOrders[sec], [p.teamId]: normalizeOrder(msg.order, this.#members(p.teamId).map((m) => m.id)) };
    this.#afterChange();
  }

  get inFreePlay() {
    return this.runner.screen === SCREEN.PLAY && this.runner.section?.type === 'libre' && !this.runner.peekScoreboard && !!this.freeRound;
  }

  /** Dueño de los comodines de un jugador: su equipo, o él mismo si no hay equipos (o aún no tiene). */
  ownerOf = (playerId) => (this.roster.hasTeams ? (this.roster.get(playerId)?.teamId ?? playerId) : playerId);

  get pointsForCorrect() {
    return this.runner.section?.points?.[0] ?? this.show.settings?.defaultPoints ?? 1;
  }

  get pointsForWrong() {
    return this.show.settings?.wrongPoints ?? 0;
  }

  /** URL del mando (la clave va tras '#': no viaja a ningún servidor). */
  controlUrl(base) {
    const url = new URL('./control.html', base);
    url.search = `?sala=${this.code}`;
    url.hash = `k=${this.controlSecret}`;
    return url;
  }

  // ------------------------------------------------------------------ Vistas

  /** Jugadores con datos para pintar en la tele. */
  players() {
    return this.roster.list().map((p) => ({
      ...p,
      rtt: p.connected ? (this.rtt.get(p.id) ?? null) : null,
      lock: this.inBuzzerPlay ? (this.game.lockouts.get(p.id) ?? null) : null,
      away: this.#away.has(p.id), // antitrampas: ahora mismo fuera de la app
      cheated: this.inAnswerPlay && this.answerRound.cheaters.has(p.id),
      presenter: this.presenterIds.has(p.id), // juega desde el mando
      benched: this.benched(p.id),
    }));
  }

  /** Estado del pulsador para la tele, con los datos de cada jugador ya resueltos. */
  gameView() {
    const g = this.game;
    const ranking = g.phase === PHASE.RESULT || g.phase === PHASE.OPEN ? g.ranking() : [];
    return {
      phase: g.phase,
      tOpen: g.tOpen,
      judged: g.judged,
      rebound: [...g.lockouts.values()].includes(LOCK.WRONG), // alguien ya falló: el turno es para los demás
      winner: g.winnerId ? this.roster.get(g.winnerId) : null,
      ranking: ranking.map((r) => ({ ...r, player: this.roster.get(r.playerId) })).filter((r) => r.player),
    };
  }

  /** Pregunta de respuestas para la tele (sin la solución hasta revelarla). */
  answerView({ forControl = false } = {}) {
    const r = this.answerRound;
    const q = r.question;
    const revealed = r.phase === APHASE.REVEALED;
    const pub = (id) => {
      const p = this.roster.get(id);
      return p ? publicPlayer(p) : { id, name: '¿?', color: 'gris', icon: 'zorro', score: 0, teamId: null };
    };
    const showCounts = revealed || forControl;
    return {
      roundId: r.roundId, // la tele lo usa para no repetir el suspense de un revelado ya visto
      kind: q.kind,
      label: SECTION_TYPES[q.kind].label,
      phase: r.phase,
      text: q.text,
      image: q.image,
      unit: q.unit,
      noOver: q.noOver,
      options: q.options,
      seconds: q.seconds ?? null,
      target: q.target ?? null,
      mode: q.mode ?? null,
      hideAfter: q.hideAfter ?? null,
      round: q.round ?? null,
      rounds: q.rounds ?? null,
      duel: !!q.duel,
      duelPick: q.duel ? this.duelPick.map(pub) : [],
      tGreen: r.tGreen,
      reflex: r.reflex ?? (q.kind === 'reflejos' ? { variant: reflexVariant(q.round), cues: [] } : null),
      candidates: r.candidates.map(pub),
      subject: q.subjectId ? pub(q.subjectId) : q.subjectName ? { name: q.subjectName } : null,
      tOpen: r.tOpen,
      deadline: r.deadline,
      answeredIds: [...r.answers.keys()],
      eligibleIds: [...r.eligible].filter((id) => !r.cheaters.has(id)), // los anulados ya no cuentan en «X de Y han respondido»
      counts: showCounts ? r.counts() : null,
      correct: revealed || forControl ? q.correct : null,
      points: q.points,
      results: revealed
        ? {
            points: r.results.points,
            fooled: r.results.fooled ?? null,
            winners: (r.results.winners ?? []).map(pub),
            entries: r.results.entries.map((e) => ({ ...e, player: pub(e.playerId) })),
          }
        : null,
      // Solo el mando ve qué ha respondido cada uno antes de revelar.
      answers: forControl ? [...r.answers].map(([id, a]) => ({ player: pub(id), value: a.value })) : null,
    };
  }

  /** Prueba de la sección Libre (para la tele y el mando). */
  freeView({ forControl = false } = {}) {
    const r = this.freeRound;
    const t = now();
    const who = (id) => {
      if (r.byTeams) {
        const team = this.roster.team(id);
        return { id, name: team?.name ?? '¿?', color: team?.color ?? 'gris', icon: null, isTeam: true };
      }
      const p = this.roster.get(id);
      return { id, name: p?.name ?? '¿?', color: p?.color ?? 'gris', icon: p?.icon ?? null, face: p?.face ?? null, isTeam: false };
    };
    const pool = r.byTeams ? this.roster.teams.map((tm) => tm.id) : this.roster.list().map((p) => p.id);
    return {
      roundId: r.roundId,
      title: r.item.title,
      description: r.item.description,
      tool: r.tool,
      byTeams: r.byTeams,
      points: r.item.points,
      phase: r.phase,
      tStart: r.tStart,
      tStop: r.tStop,
      participants: r.participants.map((id) => ({
        ...who(id),
        out: id in r.out ? r.out[id] : null,
        count: r.counts[id] ?? 0,
        // Con equipos: quién cuenta desde su móvil y entre quiénes se puede elegir (solo el mando)
        counter: r.byTeams ? (r.counters[id] ?? null) : null,
        members: forControl && r.byTeams ? this.roster.list().filter((p) => p.teamId === id).map((p) => ({ id: p.id, name: p.name })) : null,
      })),
      ranking: r.ranking(t).map((row) => ({ ...row, who: who(row.id) })),
      winners: r.winners.map(who),
      awarded: r.points,
      // Solo el mando: a quién se puede elegir y qué ganador propone la herramienta.
      pool: forControl ? pool.map(who) : null,
      suggestion: forControl ? r.suggestion(t) : null,
      // Con canción (la bachata): la tele la pone y enseña el silencio y el golpe
      song: r.item.song ?? null,
      songStart: r.item.songStart ?? 0,
      beat: r.item.beat ?? null,
      silence: r.item.silence ?? 0,
      startable: r.startable,
      // Contrarreloj: quién sale ahora, cuántas piezas y el turno de cada uno
      pieces: r.item.pieces ?? null,
      current: r.current,
      trialRunning: r.trialRunning,
      trialElapsed: forControl && r.trialRunning ? t - r.trial.tStart : null, // el mando cuenta desde aquí
      trials: r.tool === 'trial' ? Object.fromEntries(Object.entries(r.trials).map(([id, x]) => [id, { ...x, attempts: x.attempts.map((a) => ({ ...a })) }])) : null,
    };
  }

  /** Todo lo que necesita pintar la tele. */
  view() {
    const r = this.runner;
    return {
      code: this.code,
      title: this.show.title,
      screen: r.screen,
      peekScoreboard: r.peekScoreboard,
      sectionIndex: r.sectionIndex,
      sectionCount: r.playedSections.length, // las que se juegan esta noche
      sectionNumber: r.positionOf(r.sectionIndex), // «Sección 3 de 7»
      // Lista para la introducción del concurso en la tele (y la preparación: cuáles se juegan)
      sections: this.show.sections.map((s, i) => ({ id: s.id, name: s.name, label: SECTION_TYPES[s.type].label, env: sectionEnv(s, i), on: r.isOn(i) })),
      section: r.section,
      setupStep: this.setupStep,
      versus: this.versusStep,
      introRules: this.introRules,
      bots: { count: this.bots.ids.length, auto: this.bots.auto }, // concursantes de prueba
      paused: this.paused, // en pausa para seguir otro día: la tele enseña «Continuará…»
      sectionLabel: r.section ? SECTION_TYPES[r.section.type].label : '',
      playable: isPlayable(r.section),
      item: r.item,
      itemIndex: r.itemIndex,
      itemCount: r.itemCount,
      shown: r.shown,
      game: this.inBuzzerPlay ? this.gameView() : null,
      answer: this.inAnswerPlay ? this.answerView() : null,
      free: this.inFreePlay ? this.freeView() : null,
      millionaire: this.inMillionairePlay ? this.millionaireView() : null,
      words: this.games.palabras.inPlay ? this.games.palabras.view() : null,
      shake: this.games.agitar.inPlay ? this.games.agitar.view() : null,
      bet: this.games.apuesta.inPlay ? this.games.apuesta.view() : null,
      punish: this.punishView(),
      pointsForCorrect: this.pointsForCorrect,
      pointsForWrong: this.pointsForWrong,
      players: this.players(),
      teams: this.roster.teams,
      teamsLocked: this.roster.teamsLocked,
      standings: this.roster.teamStandings(),
      canStart: this.canStart,
      pendingControls: [...this.pendingControls].map(([id, info]) => ({ id, ...info })),
      controlsConnected: this.connectedControls.size,
      lastImport: this.lastImport,
      cheatAlerts: this.cheatAlerts.slice(-5),
      turns: this.#turnsView(),
      spokespeople: Object.fromEntries(this.roster.teams.map((t) => [t.id, this.spokespersonOf(t.id)])),
      settings: this.settings,
    };
  }

  /** Datos del modo depuración: relojes de cada jugador y tiempos de la última ronda. */
  debugView() {
    const players = this.roster.list().map((p) => ({ player: p, rtt: this.rtt.get(p.id) ?? null, sync: p.connected ? (this.sync.get(p.id) ?? null) : null }));
    const round = this.lastRound && {
      ...this.lastRound,
      ranking: this.lastRound.ranking.map((r) => ({ ...r, player: this.roster.get(r.playerId) })).filter((r) => r.player),
    };
    return { players, round, settings: this.settings };
  }

  /** Vista para el mando del presentador (incluye respuestas: solo se manda a mandos aprobados). */
  controlView() {
    const v = this.view();
    const pub = (p) => p && { id: p.id, name: p.name, icon: p.icon, face: p.face ?? null, color: p.color, teamId: p.teamId };
    return {
      code: v.code,
      paused: v.paused,
      network: this.network,
      connectFailures: this.connectFailures ?? null,
      title: v.title,
      screen: v.screen,
      peekScoreboard: v.peekScoreboard,
      sectionIndex: v.sectionIndex,
      sections: this.show.sections.map((s, index) => ({
        index,
        name: s.name,
        type: s.type,
        label: SECTION_TYPES[s.type].label,
        playable: isPlayable(s),
        items: s.items.length,
        on: this.runner.isOn(index),
      })),
      section: v.section && {
        name: v.section.name,
        type: v.section.type,
        description: v.section.description,
        points: v.section.points,
        env: sectionEnv(v.section, v.sectionIndex),
      },
      sectionLabel: v.sectionLabel,
      setupStep: v.setupStep,
      versus: v.versus,
      introRules: v.introRules,
      playable: v.playable,
      item: v.item,
      itemIndex: v.itemIndex,
      itemCount: v.itemCount,
      shown: v.shown,
      game: v.game && {
        phase: v.game.phase,
        judged: v.game.judged,
        winner: pub(v.game.winner),
        ranking: v.game.ranking.map((r) => ({ place: r.place, deltaMs: r.deltaMs, reactionMs: r.reactionMs, nearTie: r.nearTie, player: pub(r.player) })),
      },
      answer: this.inAnswerPlay ? this.answerView({ forControl: true }) : null,
      free: this.inFreePlay ? this.freeView({ forControl: true }) : null,
      millionaire: this.inMillionairePlay ? this.millionaireView({ forControl: true }) : null,
      words: this.games.palabras.inPlay ? this.games.palabras.view({ forControl: true }) : null,
      shake: this.games.agitar.inPlay ? this.games.agitar.view() : null,
      bet: this.games.apuesta.inPlay ? this.games.apuesta.view({ forControl: true }) : null,
      punish: this.punishView(),
      hasPunish: this.hasPunish,
      pointsForCorrect: v.pointsForCorrect,
      pointsForWrong: v.pointsForWrong,
      players: v.players.map((p) => ({ ...pub(p), score: p.score, connected: p.connected, rtt: p.rtt, lock: p.lock, away: p.away })),
      // Salidas de la app: los últimos avisos (el mando enseña los nuevos) y el recuento por concursante
      awayFeed: this.awayLog.recent(10),
      awaySummary: this.awayLog.summary(),
      teams: v.teams,
      teamsLocked: v.teamsLocked,
      standings: v.standings.map((s) => ({ team: s.team, score: s.score, members: s.members.map((m) => m.id) })),
      canStart: v.canStart,
      minPlayers: MIN_PLAYERS,
      pendingControls: v.pendingControls,
      lastImport: v.lastImport,
      cheatAlerts: v.cheatAlerts,
      turns: v.turns,
      spokespeople: v.spokespeople,
      settings: v.settings,
    };
  }

  // ------------------------------------------------------------------ Órdenes (teclado de la tele y mando)

  /** @returns {{ok: boolean, error?: string}} */
  run(action, args = {}) {
    const fn = this.#actions[action];
    if (!fn) return { ok: false, error: `Orden desconocida: ${action}` };
    // Cualquier orden (pasar de pregunta, reiniciar, corregir puntos…) da antes los puntos que estuvieran esperando.
    this.#applyPendingPoints();
    const res = fn(args ?? {});
    if (res === false) return { ok: false, error: 'No se puede hacer ahora.' };
    if (typeof res === 'string') return { ok: false, error: res };
    this.#afterChange();
    return { ok: true };
  }

  #actions = {
    next: () => {
      const r = this.runner;
      if (r.screen === SCREEN.SETUP) {
        // Preparación → título del concurso → conexión de los jugadores → empezar
        if (this.setupStep !== 'join') {
          this.setupStep = SETUP_STEPS[SETUP_STEPS.indexOf(this.setupStep) + 1];
          return true;
        }
        if (!this.canStart) return `Hacen falta al menos ${MIN_PLAYERS} jugadores conectados.`;
        this.roster.lockTeams(true); // al empezar, los equipos quedan cerrados
        const ok = r.next();
        const atCover = ok !== false && r.screen === SCREEN.COVER;
        this.#versusStep = atCover && this.hasVersus;
        this.#punishStep = atCover && !this.#versusStep && this.hasPunish && !this.punish.closed;
        return ok;
      }
      if (r.screen === SCREEN.COVER && this.#versusStep) {
        this.#versusStep = false;
        this.#punishStep = this.hasPunish && !this.punish.closed;
        return true;
      }
      if (r.screen === SCREEN.COVER && this.#punishStep) {
        // primero se cierra la votación (se ven los 3 que pasan); luego, la portada
        if (!this.punish.closed) return this.punish.close();
        this.#punishStep = false;
        return true;
      }
      if (r.screen === SCREEN.FINAL && this.hasPunish && this.punish.closed) {
        if (!this.#rouletteStep) {
          this.#rouletteStep = true;
          return true;
        }
        return this.punish.spin ? false : this.punish.spinWheel(now()) != null; // ¡a girar!
      }
      // Millonario: tras el título de la sección, «Cómo se juega» (con su música) y luego la primera pregunta
      if (r.screen === SCREEN.INTRO && r.section?.type === 'test' && isPlayable(r.section) && this.#rulesFor !== r.sectionIndex) {
        this.#rulesFor = r.sectionIndex;
        return true;
      }
      return this.runner.next();
    },
    prev: () => {
      if (this.introRules) {
        this.#rulesFor = null;
        return true;
      }
      const r = this.runner;
      if (r.screen === SCREEN.SETUP && this.setupStep !== 'prep') {
        this.setupStep = SETUP_STEPS[SETUP_STEPS.indexOf(this.setupStep) - 1];
        return true;
      }
      if (r.screen === SCREEN.FINAL && this.#rouletteStep) {
        this.#rouletteStep = false;
        return true;
      }
      if (r.screen === SCREEN.COVER) {
        // portada ← castigos ← equipos ← conexión
        if (!this.#versusStep && !this.#punishStep && this.hasPunish) {
          this.#punishStep = true;
          return true;
        }
        if (this.#punishStep) {
          this.#punishStep = false;
          if (this.hasVersus) {
            this.#versusStep = true;
            return true;
          }
        }
        this.#versusStep = false;
      }
      return r.prev();
    },
    nextItem: () => this.runner.nextItem(),
    gotoSection: ({ index }) => {
      this.#rulesFor = null;
      this.#versusStep = false;
      this.#punishStep = false;
      this.#rouletteStep = false;
      return this.runner.goToSection(Number(index));
    },
    endSection: () => this.runner.endSection(),
    scoreboard: () => this.runner.toggleScoreboard(),
    toSetup: () => this.runner.toSetup(),
    showQuestion: () => this.runner.showQuestion(),
    showAnswer: () => this.runner.showAnswer(),

    open: () => {
      if (!this.inBuzzerPlay) return false;
      if (!this.canStart) return `Hacen falta al menos ${MIN_PLAYERS} jugadores conectados.`;
      if (!this.game.open(now())) return false;
      this.#buzzerOpenedAt = now();
      if (this.runner.item?.showOnTv) this.runner.showQuestion(); // al abrir, la pregunta se ve en la tele
      this.#scheduleOpenRepaint();
      return true;
    },
    correct: () => {
      if (!this.inBuzzerPlay) return false;
      const winnerId = this.game.correct();
      if (!winnerId) return false;
      this.roster.adjustScore(winnerId, this.pointsForCorrect);
      return true;
    },
    wrong: () => {
      if (!this.inBuzzerPlay) return false;
      const activeIds = this.roster.list().filter((p) => p.connected).map((p) => p.id);
      const res = this.game.wrong(now(), activeIds);
      if (!res) return false;
      if (this.pointsForWrong) this.roster.adjustScore(res.loserId, this.pointsForWrong);
      if (res.reopened) this.#scheduleOpenRepaint();
      return true;
    },
    restart: () => {
      for (const g of Object.values(this.games)) if (g.inPlay) return g.restart();
      if (this.inMillionairePlay) return this.#restartMillionaire();
      if (this.inAnswerPlay) return this.#restartAnswerRound();
      if (this.inFreePlay) return this.#restartFreeRound();
      if (!this.inBuzzerPlay) return false;
      this.#clearTimers();
      this.game.restart();
      return true;
    },

    openAnswers: () => {
      if (!this.inAnswerPlay) return false;
      if (!this.canStart) return `Hacen falta al menos ${MIN_PLAYERS} jugadores conectados.`;
      const q = this.answerRound.question;
      let eligibleIds = this.roster
        .list()
        .filter((p) => p.connected && !this.benched(p.id))
        .map((p) => p.id);
      // Por turnos: solo el que le toca de cada equipo
      if (this.inTurns && !q.duel) eligibleIds = this.#answerers().map((a) => a.playerId).filter((id) => eligibleIds.includes(id));
      if (q.duel) {
        eligibleIds = this.duelPick.filter((id) => eligibleIds.includes(id));
        if (eligibleIds.length !== 2) return 'Elige a los dos jugadores del duelo (y que estén conectados).';
      }
      // Reflejos: la 1ª ronda, clásica; las demás, con despistes (colores que no valen, una araña…)
      const variant = q.kind === 'reflejos' ? reflexVariant(q.round) : null;
      const greenDelayMs = variant ? reflexDelayMs(variant) : GREEN_MIN_MS;
      if (!this.answerRound.open({ now: now(), eligibleIds, scheduledOpenMs: this.settings.scheduledOpenMs, greenDelayMs, countdownMs: this.settings.countdownSec * 1000 })) return false;
      if (!this.answerRound.eligible.size) return 'No hay nadie que pueda responder a esta pregunta.';
      const r = this.answerRound;
      if (variant) r.reflex = { variant, ...reflexPlan(variant, r.tOpen, r.tGreen) };
      // Reflejos: repintar la tele justo al ponerse verde (los móviles cambian solos con su reloj sincronizado).
      clearTimeout(this.#greenTimer);
      if (r.tGreen != null) this.#greenTimer = setTimeout(() => this.#changed({ persist: false }), Math.max(0, r.tGreen - now()));
      clearTimeout(this.#answerTimer);
      this.#answerTimer = setTimeout(() => this.#closeAnswers(r), r.deadline + ANSWER_GRACE_MS - now());
      // Repintar la tele al empezar (para que salgan las opciones a la vez que en los móviles).
      clearTimeout(this.#openTimer);
      this.#openTimer = setTimeout(() => this.#changed({ persist: false }), Math.max(0, r.tOpen - now()));
      return true;
    },
    freeParticipants: ({ ids = '' }) => this.inFreePlay && this.freeRound.setParticipants(String(ids).split(',').filter(Boolean)),
    freeStart: () => this.inFreePlay && this.freeRound.start(now()),
    freeOut: ({ id }) => this.inFreePlay && this.freeRound.eliminate(id, now()),
    freeRevive: ({ id }) => this.inFreePlay && this.freeRound.revive(id),
    freeCount: ({ id, delta }) => this.inFreePlay && this.freeRound.count(id, Number(delta) || 0),
    // Con equipos: el jugador que cuenta desde su móvil por su equipo ('' = nadie)
    freeCounter: ({ teamId, playerId = '' }) => {
      if (!this.inFreePlay) return false;
      if (playerId && this.roster.get(playerId)?.teamId !== teamId) return 'Ese jugador no es de ese equipo.';
      return this.freeRound.setCounter(teamId, playerId || null);
    },
    freeStop: () => this.inFreePlay && this.freeRound.stop(now()),
    // Contrarreloj: un intento con n piezas bien, quitar el último, ¡lo tiene! / se rinde, y que salga el siguiente
    freeAttempt: ({ n }) => this.inFreePlay && this.freeRound.attempt(Number(n), now()),
    freeUndoAttempt: () => this.inFreePlay && this.freeRound.undoAttempt(),
    freeDone: ({ gaveUp = false }) => this.inFreePlay && this.freeRound.trialDone(now(), gaveUp === true || gaveUp === 'true'),
    freeNext: () => this.inFreePlay && this.freeRound.trialNext(now()),
    freeAward: ({ ids = '' }) => {
      if (!this.inFreePlay) return false;
      const r = this.freeRound;
      const points = r.award(String(ids).split(',').filter(Boolean), now());
      if (!points) return 'Elige al menos un ganador.';
      for (const [id, pts] of Object.entries(points)) {
        if (r.byTeams) this.roster.adjustTeamBonus(id, pts);
        else this.roster.adjustScore(id, pts);
      }
      this.itemResults[this.runner.playKey] = { free: r.toJSON(), byTeams: r.byTeams };
      return true;
    },
    setDuel: ({ a, b }) => {
      if (!this.inAnswerPlay || !this.answerRound.question.duel) return false;
      if (!a || !b || a === b || !this.roster.get(a) || !this.roster.get(b)) return 'Elige a dos jugadores distintos.';
      this.duelPick = [a, b];
      return true;
    },
    closeAnswers: () => {
      if (!this.inAnswerPlay || !this.answerRound.close(now())) return false;
      clearTimeout(this.#answerTimer);
      return true;
    },
    reveal: () => {
      if (!this.inAnswerPlay) return false;
      const r = this.answerRound;
      if (!r.reveal()) return false;
      clearTimeout(this.#answerTimer);
      // Los puntos, cuando la tele ya enseña a los ganadores (tras el redoble y el suspense)
      const kind = r.question.kind;
      const rows = isChoice(kind) ? r.results.entries.filter((e) => e.correct).length : kind === 'votacion' ? r.candidates.length : r.results.entries.length;
      this.#holdPoints(r.results.points, revealHoldMs(kind, rows));
      this.itemResults[this.runner.playKey] = {
        answers: [...r.answers],
        candidates: r.candidates,
        eligible: [...r.eligible],
        results: r.results,
      };
      return true;
    },
    unlock: ({ playerId }) => this.game.unlock(playerId),
    // Millonario: enseñar respuestas, marcar (amarillo), revelar (verde), llamada y público
    mShow: ({ all = false }) => this.inMillionairePlay && this.millionaire.show(!!all),
    mSeat: ({ playerId }) => {
      if (!this.inMillionairePlay || this.millionaire.phase === MPHASE.REVEALED) return false;
      const p = this.roster.get(playerId);
      if (!p) return false;
      this.millionaire.seat = { playerId, teamId: p.teamId ?? null };
      this.millionaire.choice = null;
      return true;
    },
    mMark: ({ index }) => {
      if (!this.inMillionairePlay) return false;
      const r = this.millionaire;
      const i = index === undefined || index === '' ? r.choice : Number(index);
      if (i == null) return 'El concursante aún no ha elegido: marca tú una respuesta.';
      r.finishAudience();
      return r.mark(i);
    },
    mUnmark: () => this.inMillionairePlay && this.millionaire.unmark(),
    mReveal: () => {
      if (!this.inMillionairePlay) return false;
      const r = this.millionaire;
      if (!r.reveal()) return 'Marca antes la respuesta del concursante.';
      this.#holdPoints(r.results.points, 2200); // tras el verde
      this.itemResults[this.runner.playKey] = { millionaire: r.toJSON() };
      return true;
    },
    mCallStart: () => {
      if (!this.inMillionairePlay || !this.millionaire.runCall(now())) return false;
      const round = this.millionaire;
      this.#mTimer(round.call.endsAt, () => {
        if (round === this.millionaire && round.endCall()) this.#afterChange({ persist: false });
      });
      return true;
    },
    mCallEnd: () => this.inMillionairePlay && this.millionaire.endCall(),
    mAudienceCancel: () => this.inMillionairePlay && this.millionaire.cancelAudience(),
    mAudienceEnd: () => this.inMillionairePlay && this.millionaire.finishAudience(),
    // Por turnos: portavoz de un equipo y, si hace falta, el orden desde el mando ('id,id,…')
    setSpokesperson: ({ teamId, playerId }) => {
      if (this.roster.get(playerId)?.teamId !== teamId) return 'Ese jugador no es de ese equipo.';
      this.spokespeople.set(teamId, playerId);
      return true;
    },
    setTurnOrder: ({ teamId, order = '' }) => {
      if (!this.inTurns) return 'Esta sección no se juega por turnos.';
      const sec = this.runner.section.id;
      this.turnOrders[sec] = { ...this.turnOrders[sec], [teamId]: normalizeOrder(String(order).split(','), this.#members(teamId).map((m) => m.id)) };
      return true;
    },
    // Parar el concurso (para seguir otro día) y seguir. Todo está ya guardado: esto solo cambia lo que se ve y que
    // lo guardado no caduque.
    pause: () => {
      if (this.paused) return false;
      this.paused = { at: Date.now() };
      return true;
    },
    resume: () => {
      if (!this.paused) return false;
      this.paused = null;
      return true;
    },
    // ¿Qué juegos jugamos? (en la preparación): quitar o poner una sección
    toggleSection: ({ id, on }) => {
      if (this.runner.screen !== SCREEN.SETUP) return 'Los juegos se eligen en la preparación.';
      if (!on && this.runner.playedSections.length <= 1 && this.runner.playedSections[0]?.id === id) return 'Tiene que quedar al menos un juego.';
      return this.runner.setSkipped(String(id), !on);
    },

    // Castigos: cerrar la votación (pasan los 3 más votados), volver a votar y girar la ruleta
    punishClose: () => this.punishStep === 'vote' && this.punish.close(),
    punishReopen: () => {
      this.punish.reset();
      return true;
    },
    punishSpin: () => this.punishStep === 'roulette' && this.punish.spinWheel(now()) != null,

    awayReset: () => {
      this.awayLog.reset();
      return true;
    },

    // Antitrampas: el presentador perdona a quien salió de la app (vuelve a poder responder o pulsar)
    forgive: ({ playerId }) => {
      let ok = false;
      if (this.inAnswerPlay) ok = this.answerRound.forgive(playerId);
      if (this.inBuzzerPlay && this.game.lockouts.get(playerId) === LOCK.CHEAT) ok = this.game.unlock(playerId);
      if (this.inMillionairePlay && this.millionaire.seat.playerId === playerId && this.millionaire.cheated && this.millionaire.phase !== MPHASE.REVEALED) {
        this.millionaire.cheated = false;
        ok = true;
      }
      if (!ok) return 'Ya no se puede perdonar en esta pregunta.';
      for (const a of this.cheatAlerts) if (a.playerId === playerId && a.voided) a.forgiven = true;
      return true;
    },

    lockTeams: ({ locked = true }) => {
      if (!this.roster.hasTeams) return 'Este concurso no tiene equipos.';
      this.roster.lockTeams(!!locked);
      return true;
    },
    moveTeam: ({ playerId, teamId }) => !!this.roster.moveToTeam(playerId, teamId),
    adjustScore: ({ playerId, delta }) => this.roster.adjustScore(playerId, Number(delta) || 0) != null,
    adjustTeamBonus: ({ teamId, delta }) => this.roster.adjustTeamBonus(teamId, Number(delta) || 0) != null,
    resetScores: () => {
      // Partida nueva: marcadores, comodines y preguntas ya puntuadas.
      this.roster.resetScores();
      this.jokers.reset();
      this.itemResults = {};
      this.#syncAnswerRound();
      this.#syncFreeRound();
      this.#syncMillionaire();
      this.#syncGames();
      return true;
    },
    // Concursantes de prueba (🤖 Pruebas): añadir, quitar, que respondan solos o ya
    botsAdd: ({ count = MAX_PLAYERS }) => this.bots.add(Number(count)) > 0 || 'La sala ya está llena.',
    botsRemove: () => this.bots.removeAll() > 0 || 'No hay concursantes de prueba.',
    botsAuto: ({ on }) => {
      this.bots.auto = !!on;
      return true;
    },
    botsAct: () => {
      this.bots.actNow();
      return true;
    },

    removePlayer: ({ playerId }) => {
      if (!this.roster.get(playerId)) return false;
      this.source.kick(playerId, { code: ERROR_CODE.REMOVED, message: 'El presentador te ha quitado de la sala.' });
      this.roster.remove(playerId);
      this.rtt.delete(playerId);
      this.sync.delete(playerId);
      this.game.unlock(playerId);
      return true;
    },

    approveControl: ({ controlId }) => {
      if (!this.pendingControls.delete(controlId)) return false;
      this.approvedControls.add(controlId);
      this.connectedControls.add(controlId);
      this.source.sendToControl(controlId, { t: MSG.FACES, images: this.#faceImages() });
      this.source.sendToControl(controlId, { t: MSG.CONTROL_STATUS, status: 'approved' });
      return true;
    },
    denyControl: ({ controlId }) => {
      if (!this.pendingControls.delete(controlId)) return false;
      this.source.kickControl(controlId, { code: ERROR_CODE.CONTROL_DENIED, message: 'El portátil ha rechazado este mando.' });
      return true;
    },

    updateSettings: (patch) => {
      for (const key of Object.keys(DEFAULT_SETTINGS)) if (key in patch) this.settings[key] = patch[key]; // el motor comparte el objeto
      return true;
    },
  };

  /**
   * Carga un concurso leído de la hoja. Solo en preparación: cambia equipos y empieza desde la portada.
   * @param report {fileName, errors, warnings}
   */
  loadShow(show, report) {
    if (this.runner.screen !== SCREEN.SETUP) return 'Solo se puede cargar un concurso desde la pantalla de preparación.';
    this.show = show;
    this.roster.setTeams(show.teams);
    this.roster.lockTeams(false);
    this.runner = new ShowRunner(show);
    this.settings.lockEarlyBuzz = show.settings.lockEarlyBuzz;
    this.jokers = new JokerBank(show.settings.jokers, {});
    this.itemResults = {};
    this.punish = new PunishmentVote(show.punishments ?? []);
    this.games.palabras.resetDecks();
    this.lastImport = { ...report, title: show.title, sections: show.sections.length, teams: show.teams.length };
    this.#afterChange();
    return true;
  }

  /** Informe de una importación fallida (no cambia el concurso). */
  reportImportFailure(report) {
    this.lastImport = { ...report, failed: true };
    this.#changed({ persist: false });
  }

  // ------------------------------------------------------------------ Mensajes de los jugadores

  #onHello(playerId, msg) {
    // Ya empezado, alguien nuevo con el nombre de un jugador desconectado: es él con otro móvil (o con el suyo
    // borrado). Recupera su identidad de antes (puntos, equipo…) y vuelve a entrar con ella.
    if (!this.roster.get(playerId) && !msg.presenter && this.runner.screen !== SCREEN.SETUP) {
      const back = this.roster.returningByName(msg.name);
      if (back) {
        const { id, name, color, icon, teamId } = back; // vuelve tal como era (no con el aspecto del móvil nuevo)
        return { ok: false, error: { code: ERROR_CODE.ADOPT, playerId: id, name, color, icon, teamId, message: `¡Hola de nuevo, ${name}! Sigues con tus puntos.` } };
      }
    }
    const res = this.roster.join({ playerId, name: msg.name, color: msg.color, icon: msg.icon, teamId: msg.teamId });
    if (!res.ok) {
      return { ok: false, error: { code: ERROR_CODE.ROOM_FULL, message: `La sala está llena (máximo ${MAX_PLAYERS} jugadores).` } };
    }
    if (msg.presenter) this.presenterIds.add(playerId);
    else this.presenterIds.delete(playerId); // la misma persona, ahora desde la página normal de jugador
    this.#assignFaces();
    this.source.sendTo(playerId, { t: MSG.FACES, images: this.#faceImages() }); // antes del welcome: que ya se vea su cara
    this.#broadcastFaces();
    this.#sendWelcome(res);
    this.#afterChange(); // cambian el número de jugadores y los iconos ocupados para todos
    return { ok: true };
  }

  #onProfile(playerId, msg) {
    // El nombre solo se cambia antes de empezar el concurso (el icono, el color y el equipo siguen sus reglas).
    const current = this.roster.get(playerId);
    const started = this.runner.screen !== SCREEN.SETUP;
    const res = this.roster.updateProfile(playerId, started && current ? { ...msg, name: current.name } : msg);
    if (!res) return;
    this.#assignFaces();
    this.#broadcastFaces();
    this.#sendWelcome(res);
    this.#afterChange();
  }

  #sendWelcome(res) {
    this.source.sendTo(res.player.id, {
      t: MSG.WELCOME,
      you: publicPlayer(res.player),
      adjusted: { renamed: res.renamed, appearanceChanged: res.appearanceChanged },
    });
  }

  #onBuzz(playerId, msg) {
    if (!this.inBuzzerPlay || this.benched(playerId)) {
      // Fuera de una pregunta de pulsador no cuenta (ni bloquea a quien toque el botón en la portada).
      this.source.sendTo(playerId, { t: MSG.BUZZ_ACK, seq: msg.seq, result: 'closed' });
      return;
    }
    const res = this.game.buzz({ playerId, tPress: msg.tPress, tArrival: msg.tArrival, epoch: msg.epoch, meta: msg.meta });
    this.source.sendTo(playerId, { t: MSG.BUZZ_ACK, seq: msg.seq, result: res.result });
    if (res.windowEndsAt != null && !this.#windowTimer) {
      this.#windowTimer = setTimeout(() => this.#closeWindow(), Math.max(0, res.windowEndsAt - now()));
    }
    if (res.result === 'ok' || res.locked) this.#afterChange({ persist: false });
  }

  #onAnswer(playerId, msg) {
    if (this.inMillionairePlay && msg.roundId === this.millionaire.roundId) return this.#onMillionaireAnswer(playerId, msg);
    const r = this.answerRound;
    const ack = (result) => this.source.sendTo(playerId, { t: MSG.ANSWER_ACK, seq: msg.seq, result });
    if (!this.inAnswerPlay || msg.roundId !== r.roundId) return ack(ANSWER_RESULT.CLOSED);
    const result = r.answer(playerId, msg.value, { tPress: msg.tPress });
    ack(result);
    // En Reflejos, pulsar en rojo queda registrado (eliminado); en el Contador, pulsar en la cuenta atrás no.
    if (!r.answers.has(playerId) || (result !== ANSWER_RESULT.OK && result !== ANSWER_RESULT.EARLY)) return;
    // En cuanto han respondido todos, se cierra (no hace falta esperar al reloj).
    const connected = new Set(this.roster.list().filter((p) => p.connected).map((p) => p.id));
    if (r.allAnswered(connected)) this.#closeAnswers(r);
    else this.#afterChange({ persist: false });
  }

  /** Comodines: solo en el millonario. */
  #onJoker(playerId, msg) {
    if (this.inMillionairePlay && msg.roundId === this.millionaire.roundId) return this.#onMillionaireJoker(playerId, msg);
    this.source.sendTo(playerId, { t: MSG.ANSWER_ACK, seq: msg.seq, result: 'closed', message: 'Ahora no se pueden usar comodines.' });
  }

  /**
   * Antitrampas: el móvil avisa al salir de la app ('out') y al volver ('back' con cuánto estuvo fuera). Si estuvo
   * fuera mientras tenía una pregunta abierta y sin responder (buscando la respuesta en Google…), según el ajuste se
   * anula su respuesta en esa pregunta o solo se avisa. La tele y el mando lo enseñan.
   */
  /** Dónde va el concurso (para el registro de salidas): «Cultura general · pregunta 3», «Marcador»… */
  #whereNow() {
    const r = this.runner;
    const s = r.section?.name;
    switch (r.screen) {
      case SCREEN.SETUP:
        return 'Preparación';
      case SCREEN.COVER:
        return 'Portada';
      case SCREEN.INTRO:
        return `${s} · presentación`;
      case SCREEN.PLAY:
        return r.itemCount ? `${s} · pregunta ${r.itemIndex + 1}` : s;
      case SCREEN.SCOREBOARD:
        return 'Marcador';
      default:
        return 'Final';
    }
  }

  /** ¿Tiene este jugador una pregunta en juego ahora mismo? (salir así es lo sospechoso) */
  #inQuestion(playerId) {
    if (this.benched(playerId)) return false;
    if (this.inBuzzerPlay) return this.game.phase === PHASE.OPEN && !this.game.lockouts.has(playerId);
    if (this.inAnswerPlay) {
      const r = this.answerRound;
      return r.phase === APHASE.OPEN && r.eligible.has(playerId) && !r.answers.has(playerId);
    }
    if (this.inMillionairePlay) {
      const m = this.millionaire;
      const seated = m.seat.playerId === playerId && (m.phase === MPHASE.READY || m.phase === MPHASE.PLAYING);
      return seated || (m.audience?.state === 'voting' && m.audience.voters.includes(playerId));
    }
    return false;
  }

  #awayQuestion = new Map(); // playerId → ¿salió con la pregunta en juego?

  #onAway(playerId, msg) {
    const t = now();
    const player = this.roster.get(playerId);
    // El presentador que juega desde el mando no cuenta (es él quien lleva el concurso)
    const logged = !!player && !this.presenterIds.has(playerId) && !(this.inMillionairePlay && this.millionaire.onCall(playerId));
    if (msg.state === 'out') {
      this.#away.set(playerId, t);
      if (logged) {
        const inQuestion = this.#inQuestion(playerId);
        this.#awayQuestion.set(playerId, inQuestion);
        this.awayLog.out(playerId, player.name, { at: Date.now(), where: this.#whereNow(), inQuestion });
      }
      return this.#afterChange({ persist: false });
    }
    const leftAt = t - msg.ms;
    this.#away.delete(playerId);
    const wasInQuestion = this.#awayQuestion.get(playerId) ?? false;
    this.#awayQuestion.delete(playerId);
    const mode = this.settings.antiCheat;
    let ms = 0;
    let voided = false;
    const logBack = () => logged && this.awayLog.back(playerId, player.name, { at: Date.now(), ms: msg.ms ?? 0, where: this.#whereNow(), inQuestion: wasInQuestion || ms >= AWAY_MIN_MS, voided });
    if (mode !== 'off' && this.inMillionairePlay) {
      const r = this.millionaire;
      if (r.onCall(playerId)) return this.#afterChange({ persist: false }); // en la llamada se puede salir: es el comodín
      if (playerId === r.seat.playerId && (r.phase === MPHASE.READY || r.phase === MPHASE.PLAYING)) {
        ms = t - Math.max(leftAt, this.#mStartedAt ?? leftAt);
        if (ms >= AWAY_MIN_MS && mode === 'void' && !r.cheated) voided = r.cheated = true;
      } else if (r.audience?.state === 'voting' && r.audience.voters.includes(playerId)) {
        ms = t - leftAt;
        if (ms >= AWAY_MIN_MS && mode === 'void') {
          delete r.audience.votes[playerId];
          r.audience.voters = r.audience.voters.filter((id) => id !== playerId);
          voided = true;
        }
      }
    } else if (mode !== 'off' && this.inAnswerPlay) {
      const r = this.answerRound;
      ms = r.awayWhileOpen(playerId, leftAt, t);
      if (ms >= AWAY_MIN_MS && mode === 'void') voided = r.disqualify(playerId);
      // si era el último que faltaba, se cierra ya
      const connected = new Set(this.roster.list().filter((p) => p.connected).map((p) => p.id));
      if (voided && r.phase === APHASE.OPEN && r.allAnswered(connected)) this.#closeAnswers(r);
    } else if (mode !== 'off' && this.inBuzzerPlay && this.game.phase === PHASE.OPEN && this.#buzzerOpenedAt != null) {
      ms = t - Math.max(leftAt, this.#buzzerOpenedAt);
      if (ms >= AWAY_MIN_MS && mode === 'void') voided = this.game.lock(playerId, LOCK.CHEAT);
    }
    if (ms >= AWAY_MIN_MS) {
      const name = this.roster.get(playerId)?.name ?? '¿?';
      this.cheatAlerts.push({ id: ++this.#alertSeq, playerId, name, ms: Math.round(ms), voided, forgiven: false, at: Date.now() });
      this.cheatAlerts = this.cheatAlerts.slice(-20);
    }
    logBack();
    this.#afterChange();
  }

  #syncGames() {
    for (const g of Object.values(this.games ?? {})) g.sync();
  }

  /** Mensaje de un móvil para uno de los juegos nuevos (o el voto de castigos). */
  #onPlay(playerId, msg) {
    const ack = (result, message = null) => this.source.sendTo(playerId, { t: MSG.ANSWER_ACK, seq: msg.seq, result, message });
    if (msg.game === 'castigo') return this.#onPunishVote(playerId, msg, ack);
    const game = Object.values(this.games).find((g) => g.type === msg.game);
    if (!game) return ack('closed');
    game.onMessage(playerId, msg, ack);
  }

  /** Voto de castigos desde el móvil (marcar o desmarcar uno; hasta 3). */
  #onPunishVote(playerId, msg, ack) {
    if (this.punishStep !== 'vote') return ack('closed');
    const res = this.punish.toggle(playerId, Number(msg.value));
    ack(res === 'ok' ? 'ok' : res, res === 'full' ? 'Ya has votado 3: quita uno para cambiarlo.' : null);
    if (res === 'ok') this.#afterChange({ persist: false });
  }

  /** Libre con contador: el móvil del concursante (uno por equipo) suma o resta. */
  #onFreeCount(playerId, msg) {
    const r = this.freeRound;
    const ack = (result, message) => this.source.sendTo(playerId, { t: MSG.ANSWER_ACK, seq: msg.seq, result, message });
    if (!this.inFreePlay || msg.roundId !== r.roundId) return ack('closed', 'Ahora no se puede contar.');
    const player = this.roster.get(playerId);
    const result = r.countFrom(playerId, r.byTeams ? player?.teamId : playerId, msg.delta);
    if (result === 'not-counter') return ack(result, 'La cuenta de tu equipo la lleva otro móvil.');
    ack(result);
    if (result === 'ok') this.#afterChange({ persist: false });
  }

  #closeAnswers(round) {
    if (round !== this.answerRound || !round.close(now())) return;
    clearTimeout(this.#answerTimer);
    this.#afterChange({ persist: false });
  }

  /** Crea la ronda de la pregunta actual (o la recupera ya revelada si ya se puntuó). */
  #syncAnswerRound() {
    const key = this.runner.playKey;
    const section = this.runner.section;
    if (!key || !ANSWER_TYPES.has(section?.type) || !this.runner.item) {
      this.answerRound = null;
      return;
    }
    const question = buildQuestion(section, this.runner.item, { players: this.roster.list(), settings: this.show.settings });
    const round = new AnswerRound(question, { roundId: `${key}#${++this.#roundSeq}` });
    const stored = this.itemResults[key];
    if (stored) {
      round.answers = new Map(stored.answers);
      round.candidates = stored.candidates;
      round.eligible = new Set(stored.eligible);
      round.results = stored.results;
      round.phase = APHASE.REVEALED;
    }
    this.answerRound = round;
  }

  // ------------------------------------------------------------------------------------------ millonario

  /** Crea la pregunta del millonario (o la recupera revelada); el asiento sale del orden de los portavoces. */
  #syncMillionaire() {
    this.#mTimers.forEach(clearTimeout);
    this.#mTimers = [];
    const key = this.runner.playKey;
    const section = this.runner.section;
    if (!key || section?.type !== 'test' || !this.runner.item) {
      this.millionaire = null;
      return;
    }
    const question = buildQuestion(section, this.runner.item, { players: this.roster.list(), settings: this.show.settings });
    question.level = questionLevel(this.runner.item, this.runner.itemIndex, this.runner.itemCount);
    question.points = [pointsForLevel(section.points, question.level)];
    const stored = this.itemResults[key]?.millionaire;
    if (stored) {
      this.millionaire = MillionaireRound.fromJSON(question, stored);
      return;
    }
    const connected = (id) => !!this.roster.get(id)?.connected;
    const seat = seatFor(this.#seatGroups(), this.runner.itemIndex, connected) ?? { playerId: null, teamId: null };
    this.millionaire = new MillionaireRound(question, { roundId: `${key}#${++this.#roundSeq}`, seat });
    this.#mStartedAt = now();
  }

  /** "R" en el millonario: quita los puntos, devuelve los comodines de esta pregunta y empieza de cero. */
  #restartMillionaire() {
    const key = this.runner.playKey;
    const r = this.millionaire;
    const owner = r.seat.playerId ? this.ownerOf(r.seat.playerId) : null;
    if (owner) for (const kind of r.used) this.jokers.refund(owner, kind);
    const stored = this.itemResults[key]?.millionaire;
    if (stored) for (const [id, pts] of Object.entries(stored.results?.points ?? {})) this.roster.adjustScore(id, -pts);
    delete this.itemResults[key];
    this.#syncMillionaire();
    return true;
  }

  /** Dueño de los comodines del asiento: su equipo (o él sin equipos). */
  #mOwner() {
    const id = this.millionaire?.seat.playerId;
    return id ? this.ownerOf(id) : null;
  }

  /** Quiénes votan en el público: los de su equipo (o todos los demás sin equipos), conectados. */
  #audienceVoters() {
    const seat = this.millionaire.seat;
    return this.roster
      .list()
      .filter((p) => p.connected && p.id !== seat.playerId && !this.benched(p.id) && (!seat.teamId || p.teamId === seat.teamId))
      .map((p) => p.id);
  }

  /** A quién se puede llamar: compañeros de equipo (o cualquiera sin equipos) que no concursan ahora. */
  #callable() {
    const seat = this.millionaire.seat;
    return this.roster.list().filter((p) => p.id !== seat.playerId && !this.benched(p.id) && (!seat.teamId || p.teamId === seat.teamId));
  }

  #mTimer(at, fn) {
    this.#mTimers.push(setTimeout(fn, Math.max(0, at - now())));
  }

  /** Comodín del millonario pedido desde el móvil del concursante. */
  #onMillionaireJoker(playerId, msg) {
    const r = this.millionaire;
    const ack = (result, message) => this.source.sendTo(playerId, { t: MSG.ANSWER_ACK, seq: msg.seq, result, message });
    if (playerId !== r.seat.playerId) return ack('denied', 'Solo puede usar comodines quien concursa.');
    const blocker = r.jokerBlocker(msg.kind);
    if (blocker) return ack('denied', blocker);
    const owner = this.#mOwner();
    if (!(this.jokers.remaining(owner)[msg.kind] > 0)) return ack('denied', this.roster.hasTeams ? 'A tu equipo no le queda ese comodín.' : 'No te queda ese comodín.');
    if (msg.kind === 'audience' && !this.#audienceVoters().length) return ack('denied', 'No hay nadie de tu equipo para votar.');
    if (msg.kind === 'call' && !this.#callable().some((p) => p.id === msg.target)) return ack('denied', 'Elige a un compañero para llamar.');
    this.jokers.use(owner, msg.kind);
    if (msg.kind === 'fifty') r.fifty();
    if (msg.kind === 'audience') {
      r.startAudience(this.#audienceVoters(), now());
      const round = r;
      this.#mTimer(r.audience.endsAt + 300, () => {
        if (round === this.millionaire && round.finishAudience()) this.#afterChange({ persist: false });
      });
    }
    if (msg.kind === 'call') r.startCall(msg.target);
    ack('ok');
    this.#afterChange();
  }

  /** Respuesta en el millonario: la elección del concursante o un voto del público. */
  #onMillionaireAnswer(playerId, msg) {
    const r = this.millionaire;
    const ack = (result) => this.source.sendTo(playerId, { t: MSG.ANSWER_ACK, seq: msg.seq, result });
    if (playerId === r.seat.playerId) {
      const res = r.choose(playerId, msg.value);
      ack(res === 'ok' ? 'ok' : res === 'closed' ? 'closed' : 'invalid');
      if (res === 'ok') this.#afterChange({ persist: false });
      return;
    }
    const res = r.vote(playerId, msg.value, now());
    ack(res === 'ok' ? 'ok' : res === 'late' ? 'late' : res === 'duplicate' ? 'duplicate' : 'not-eligible');
    if (res !== 'ok') return;
    // en cuanto han votado todos, se acaba el comodín
    if (r.audience.voters.every((id) => id in r.audience.votes)) r.finishAudience();
    this.#afterChange({ persist: false });
  }

  /** Para la tele (y, con forControl, el mando: con lo que ha elegido el concursante y la buena). */
  millionaireView({ forControl = false } = {}) {
    const r = this.millionaire;
    const q = r.question;
    const revealed = r.phase === MPHASE.REVEALED;
    const pub = (id) => (id && this.roster.get(id) ? publicPlayer(this.roster.get(id)) : null);
    const owner = this.#mOwner();
    const a = r.audience;
    return {
      roundId: r.roundId,
      phase: r.phase,
      text: q.text,
      image: q.image,
      points: q.points?.[0] ?? 1,
      level: q.level,
      options: q.options.map((o, i) => (i < r.shown || forControl ? o : null)),
      count: q.options.length,
      shown: r.shown,
      removed: r.removed,
      marked: r.marked,
      choice: forControl ? r.choice : null,
      correct: forControl || revealed ? q.correct : null,
      result: r.results,
      seat: pub(r.seat.playerId),
      team: r.seat.teamId ? this.roster.team(r.seat.teamId) : null,
      jokers: owner ? this.jokers.remaining(owner) : null,
      used: r.used,
      audience: a && {
        state: a.state,
        endsAt: a.endsAt,
        voters: a.voters.length,
        voted: Object.keys(a.votes).length,
        percentages: a.state === 'done' || forControl ? r.audiencePercentages() : null,
      },
      call: r.call && { state: r.call.state, friend: pub(r.call.friendId), endsAt: r.call.endsAt },
      callable: forControl ? this.#callable().map((p) => ({ id: p.id, name: p.name })) : null,
      cheated: r.cheated,
    };
  }

  /** Lo que ve cada móvil: quien concursa, quien vota en el público, quien recibe la llamada o quien mira. */
  #millionaireFor(player) {
    const r = this.millionaire;
    const t = now();
    const tv = this.millionaireView();
    const isSeat = player.id === r.seat.playerId;
    const voter = r.audience?.state === 'voting' && r.audience.voters.includes(player.id);
    const friend = r.call && r.call.state !== 'done' && r.call.friendId === player.id;
    return {
      ...tv,
      role: isSeat ? 'seat' : voter ? 'voter' : friend ? 'friend' : 'watcher',
      choice: isSeat ? r.choice : null,
      myVote: r.audience?.votes[player.id] ?? null,
      audience: tv.audience && { ...tv.audience, inMs: tv.audience.endsAt - t },
      call: tv.call && { ...tv.call, inMs: tv.call.endsAt != null ? tv.call.endsAt - t : null },
      // para la llamada: a quién puede llamar quien concursa
      callable: isSeat && r.phase === MPHASE.PLAYING ? this.#callable().filter((p) => p.connected).map((p) => publicPlayer(p)) : null,
      jokers: isSeat ? tv.jokers : null,
    };
  }

  #leaveAnswerRound() {
    clearTimeout(this.#answerTimer);
    clearTimeout(this.#greenTimer);
  }

  /** Crea la prueba Libre actual (o la recupera si ya dio sus puntos). */
  #syncFreeRound() {
    const key = this.runner.playKey;
    const section = this.runner.section;
    if (!key || section?.type !== 'libre' || !this.runner.item) {
      this.freeRound = null;
      return;
    }
    const stored = this.itemResults[key]?.free;
    this.freeRound = stored ? FreeRound.fromJSON(this.runner.item, stored) : new FreeRound(this.runner.item, { roundId: `${key}#${++this.#roundSeq}` });
  }

  /** "R" en una prueba Libre: quita los puntos que dio y empieza de cero. */
  #restartFreeRound() {
    const key = this.runner.playKey;
    const stored = this.itemResults[key];
    if (stored?.free) {
      for (const [id, pts] of Object.entries(stored.free.points)) {
        if (stored.byTeams) this.roster.adjustTeamBonus(id, -pts);
        else this.roster.adjustScore(id, -pts);
      }
      delete this.itemResults[key];
    }
    this.freeRound = null;
    this.#syncFreeRound();
    return true;
  }

  /** "R" en una pregunta de respuestas: deshace sus puntos y empieza de cero. */
  #restartAnswerRound() {
    const key = this.runner.playKey;
    const stored = this.itemResults[key];
    if (stored) {
      for (const [id, pts] of Object.entries(stored.results.points)) this.roster.adjustScore(id, -pts);
      delete this.itemResults[key];
    } else {
      this.#leaveAnswerRound();
    }
    clearTimeout(this.#answerTimer);
    this.#syncAnswerRound();
    return true;
  }

  #closeWindow() {
    this.#windowTimer = null;
    if (!this.game.closeWindow(now())) return;
    this.#afterChange({ persist: false });
    this.dispatchEvent(new Event('decided'));
  }

  #onLeave(playerId) {
    this.roster.setConnected(playerId, false);
    this.rtt.delete(playerId);
    this.sync.delete(playerId);
    this.#afterChange();
  }

  // ------------------------------------------------------------------ Mandos

  #onControlHello(controlId, msg) {
    if (msg.token !== this.controlSecret) {
      return {
        ok: false,
        error: { code: ERROR_CODE.CONTROL_DENIED, message: 'Este enlace de mando no vale para esta sala. Escanea el QR de mando que muestra la tele.' },
      };
    }
    if (this.approvedControls.has(controlId)) {
      this.connectedControls.add(controlId);
      this.source.sendToControl(controlId, { t: MSG.FACES, images: this.#faceImages() });
      this.source.sendToControl(controlId, { t: MSG.CONTROL_STATUS, status: 'approved' });
      this.#pushControlsNow();
      this.#changed({ persist: false });
      return { ok: true };
    }
    // Alguien del sofá podría escanear el QR: hay que confirmarlo en el portátil.
    this.pendingControls.set(controlId, { deviceName: msg.deviceName || 'Móvil' });
    this.source.sendToControl(controlId, { t: MSG.CONTROL_STATUS, status: 'pending' });
    this.#changed({ persist: false });
    return { pending: true };
  }

  #pushControlsNow() {
    clearTimeout(this.#controlPush);
    this.#controlPush = null;
    if (!this.connectedControls.size) return;
    const msg = { t: MSG.CONTROL_STATE, view: this.controlView() };
    for (const id of this.connectedControls) this.source.sendToControl(id, msg);
  }

  #scheduleControlPush() {
    if (this.#controlPush || !this.connectedControls.size) return;
    this.#controlPush = setTimeout(() => this.#pushControlsNow(), CONTROL_PUSH_MS);
  }

  // ------------------------------------------------------------------ Estado hacia los jugadores

  #stateFor(player) {
    const r = this.runner;
    const g = this.game;
    const play = this.inBuzzerPlay;
    const winner = play && g.winnerId && g.phase === PHASE.RESULT ? this.roster.get(g.winnerId) : null;
    const showSection = r.section && [SCREEN.INTRO, SCREEN.PLAY, SCREEN.SCOREBOARD].includes(r.screen);
    const benched = this.benched(player.id);
    return {
      t: MSG.STATE,
      room: this.code,
      title: this.show.title,
      playerCount: this.roster.connectedCount,
      minPlayers: MIN_PLAYERS,
      taken: this.roster.takenAppearances(player.id),
      teams: this.roster.teams,
      teamsLocked: this.roster.teamsLocked,
      you: publicPlayer(player),
      screen: r.peekScoreboard ? SCREEN.SCOREBOARD : r.screen,
      section: showSection
        ? {
            name: r.section.name,
            label: SECTION_TYPES[r.section.type].label,
            description: r.section.description,
            points: r.section.points,
            index: r.positionOf(r.sectionIndex) - 1, // entre las que se juegan
            count: r.playedSections.length,
            env: sectionEnv(r.section, r.sectionIndex), // entorno de Halloween: el fondo del móvil
            // En juego: qué pregunta / prueba / ronda va (0 = sin lista).
            itemIndex: r.screen === SCREEN.PLAY ? r.itemIndex : null,
            itemCount: r.itemCount,
          }
        : null,
      // Marcador para consultarlo sin salir del juego.
      standings: {
        teams: this.roster.teamStandings().map((s) => ({ id: s.team.id, name: s.team.name, color: s.team.color, score: s.score })),
        players: this.roster
          .list()
          .map(publicPlayer)
          .sort((a, b) => b.score - a.score),
      },
      game: play && !benched ? playerView(g, player.id, now()) : null,
      winner: winner ? publicPlayer(winner) : null,
      answer: this.inAnswerPlay && !benched ? this.#answerViewFor(player) : null,
      free: this.inFreePlay ? this.#freeViewFor(player) : null,
      millionaire: this.inMillionairePlay && !benched ? this.#millionaireFor(player) : null,
      words: this.games.palabras.inPlay && !benched ? this.games.palabras.viewFor(player) : null,
      shake: this.games.agitar.inPlay && !benched ? this.games.agitar.viewFor(player) : null,
      bet: this.games.apuesta.inPlay && !benched ? this.games.apuesta.viewFor(player) : null,
      punish: this.punishView(player),
      turns: benched ? null : this.#turnsFor(player),
      benched, // el presentador, en una sección donde no juega
      paused: !!this.paused,
    };
  }

  /** Por turnos, en el móvil: si es el portavoz (y puede ordenar), el orden de su equipo y a quién le toca ahora. */
  #turnsFor(player) {
    const tv = this.#turnsView();
    const mine = tv?.teams.find((t) => t.team.id === player.teamId);
    if (!mine) return null;
    const isSpokesperson = mine.spokesperson?.id === player.id;
    return {
      spokesperson: isSpokesperson,
      spokespersonName: mine.spokesperson?.name ?? null,
      canOrder: isSpokesperson && this.runner.screen === SCREEN.INTRO,
      ready: mine.ready,
      order: mine.order,
      // nº de pregunta que le toca (1 = la más fácil); en el millonario, alternando equipos
      position: this.runner.section.type === 'test' ? this.#seatQuestionOf(player.id) : mine.order.findIndex((p) => p?.id === player.id) + 1,
      answerer: tv.answerers.find((a) => a.team.id === player.teamId)?.player ?? null,
    };
  }

  /** Sección Libre en el móvil: solo saber si le toca y cómo va. */
  #freeViewFor(player) {
    const r = this.freeRound;
    const me = r.byTeams ? player.teamId : player.id;
    const participating = r.participants.includes(me);
    return {
      title: r.item.title,
      tool: r.tool,
      phase: r.phase,
      byTeams: r.byTeams,
      participating,
      out: participating && me in r.out,
      won: r.phase === FPHASE.AWARDED && r.winners.includes(me),
      points: r.item.points,
      roundId: r.roundId,
      // Contador: lleva la cuenta este móvil (o nadie aún) → botones +1/−1; si la lleva otro, su nombre.
      count: participating && r.tool === 'counter' ? (r.counts[me] ?? 0) : null,
      counter:
        participating && r.tool === 'counter'
          ? { mine: r.canCount(player.id, me), by: r.byTeams ? (this.roster.get(r.counters[me])?.name ?? null) : null }
          : null,
    };
  }

  /** Lo que ve un jugador en su móvil en una pregunta de respuestas. */
  #answerViewFor(player) {
    const r = this.answerRound;
    const q = r.question;
    const t = now();
    const own = r.answers.get(player.id);
    const revealed = r.phase === APHASE.REVEALED;
    const opened = r.phase !== APHASE.READY;

    let result = null;
    // Mientras la tele hace el suspense, el móvil tampoco lo chiva: "Mira la tele".
    if (revealed && !this.#pendingPoints) {
      const entry = r.results.entries.find((e) => e.playerId === player.id) ?? null;
      const name = (id) => this.roster.get(id)?.name ?? '¿?';
      result = {
        points: r.results.points[player.id] ?? 0,
        correct: entry ? !!entry.correct : null,
        place: entry?.place ?? null,
        diff: entry?.diff ?? null,
        over: !!entry?.over,
        correctLabel: isChoice(q.kind)
          ? q.options[q.correct]
          : q.kind === 'estimacion' || q.kind === 'contador'
            ? `${String(q.correct).replace('.', ',')}${q.unit ? ` ${q.unit}` : ''}`
            : null,
        value: own?.value ?? null,
        early: !!entry?.early,
        winners: (r.results.winners ?? []).map(name),
        fooled: q.subjectId === player.id ? (r.results.fooled ?? 0) : null,
      };
    }

    return {
      kind: q.kind,
      label: SECTION_TYPES[q.kind].label,
      phase: r.phase,
      roundId: r.roundId,
      text: q.text,
      unit: q.unit,
      noOver: q.noOver,
      options: q.options,
      seconds: q.seconds ?? null,
      target: q.target ?? null,
      mode: q.mode ?? null,
      hideAfter: q.hideAfter ?? null,
      round: q.round ?? null,
      rounds: q.rounds ?? null,
      tGreen: r.tGreen,
      greenInMs: r.tGreen != null ? Math.max(0, r.tGreen - t) : null,
      // Reflejos: qué se ve en cada momento (con cuánto falta, para los móviles aún sin sincronizar)
      reflex: r.reflex
        ? { ...r.reflex, cues: r.reflex.cues.map((c) => ({ ...c, inMs: c.t - t })) }
        : q.kind === 'reflejos'
          ? { variant: reflexVariant(q.round), cues: [] }
          : null,
      candidates: r.candidates.filter((id) => id !== player.id).map((id) => publicPlayer(this.roster.get(id) ?? { id, name: '¿?' })),
      tOpen: r.tOpen,
      opensInMs: r.tOpen != null ? Math.max(0, r.tOpen - t) : null,
      deadline: r.deadline,
      remainingMs: r.deadline != null ? Math.max(0, r.deadline - t) : null,
      canAnswer: opened && r.eligible.has(player.id),
      isSubject: q.subjectId === player.id,
      // En las de tiempo, el tiempo propio no se enseña hasta revelar (suspense).
      you: { answered: !!own, early: !!own?.early, cheated: r.cheaters.has(player.id), value: own && (!isTiming(q.kind) || revealed) ? own.value : null },
      result,
    };
  }

  #broadcastState() {
    for (const p of this.roster.list()) if (p.connected) this.source.sendTo(p.id, this.#stateFor(p));
  }

  /** Tras cualquier cambio de juego: si cambió la pregunta, el motor empieza de cero; luego avisar a todos. */
  #afterChange({ persist = true } = {}) {
    const key = this.runner.playKey;
    if (key !== this.#playKey) {
      this.#playKey = key;
      this.#clearTimers();
      this.#leaveAnswerRound();
      this.game.next();
      this.#syncAnswerRound();
      this.#syncFreeRound();
      this.#syncMillionaire();
      this.#syncGames();
    }
    // Millonario sin nadie en el asiento (p. ej. la tele se recargó y aún no habían vuelto los móviles): en cuanto
    // haya alguien conectado, se sienta quien toca
    const m = this.millionaire;
    if (m && !m.seat.playerId && m.phase === MPHASE.READY) {
      const seat = seatFor(this.#seatGroups(), this.runner.itemIndex, (id) => !!this.roster.get(id)?.connected);
      if (seat) m.seat = seat;
    }
    const ranking = this.game.ranking();
    if (ranking.length) this.lastRound = { qid: this.runner.itemIndex + 1, tOpen: this.game.tOpen, decided: !!this.game.winnerId, ranking };
    this.#broadcastState();
    this.#changed({ persist });
  }

  #scheduleOpenRepaint() {
    // Repintar la tele justo cuando empieza el turno ("Preparados…" → "¡Pulsad!").
    clearTimeout(this.#openTimer);
    this.#openTimer = setTimeout(() => this.#changed({ persist: false }), Math.max(0, this.game.tOpen - now()));
  }

  #clearTimers() {
    clearTimeout(this.#windowTimer);
    clearTimeout(this.#openTimer);
    clearTimeout(this.#answerTimer);
    this.#windowTimer = null;
    this.#openTimer = null;
  }

  /** Caras guardadas en el portátil: [{id, names, img}]. Se reconocen al momento los jugadores que ya están. */
  setFaces(list) {
    this.faces = list;
    this.#assignFaces();
    this.#broadcastFaces(true);
    this.#changed({ persist: false });
  }

  #assignFaces() {
    for (const p of this.roster.list()) p.face = matchFace(p.name, this.faces);
  }

  /** Imágenes de las caras que se usan ahora: id → imagen. */
  #faceImages() {
    const used = new Set(this.roster.list().map((p) => p.face).filter(Boolean));
    return Object.fromEntries(this.faces.filter((f) => used.has(f.id)).map((f) => [f.id, f.img]));
  }

  /** Manda las caras a todos los móviles (jugadores y mandos) si cambiaron. */
  #broadcastFaces(force = false) {
    const images = this.#faceImages();
    const key = Object.keys(images).sort().join();
    if (!force && key === this.#sentFaces) return;
    this.#sentFaces = key;
    const msg = { t: MSG.FACES, images };
    for (const p of this.roster.list()) this.source.sendTo(p.id, msg);
    for (const id of this.connectedControls) this.source.sendToControl(id, msg);
  }

  #holdPoints(points, ms) {
    this.#applyPendingPoints();
    const timer = setTimeout(() => {
      this.#applyPendingPoints();
      this.#afterChange();
    }, ms);
    this.#pendingPoints = { points, timer };
  }

  #applyPendingPoints() {
    const p = this.#pendingPoints;
    if (!p) return;
    clearTimeout(p.timer);
    this.#pendingPoints = null;
    for (const [id, pts] of Object.entries(p.points)) this.roster.adjustScore(id, pts);
  }

  #persist() {
    // Lo guardado ya incluye los puntos en espera: si la tele se recarga a mitad del suspense, no se pierden.
    const pending = this.#pendingPoints?.points ?? {};
    saveRoom({
      code: this.code,
      controlSecret: this.controlSecret,
      approvedControls: [...this.approvedControls],
      show: this.show,
      runner: this.runner.toJSON(),
      players: this.roster.toJSON().map((p) => ({ ...p, score: p.score + (pending[p.id] ?? 0) })),
      teamsLocked: this.roster.teamsLocked,
      teamBonus: Object.fromEntries(this.roster.teamBonus),
      settings: this.settings,
      jokersUsed: this.jokers.toJSON(),
      itemResults: this.itemResults,
      games: { palabras: this.games.palabras.toJSON() },
      punish: this.punish.toJSON(),
      spokespeople: Object.fromEntries(this.spokespeople),
      turnOrders: this.turnOrders,
      setupStep: this.setupStep,
      presenterIds: [...this.presenterIds],
      awayLog: this.awayLog.toJSON(),
      paused: this.paused,
    });
  }

  #changed({ persist = true } = {}) {
    if (persist) this.#persist();
    this.#scheduleControlPush();
    this.dispatchEvent(new Event('change'));
  }
}

const publicPlayer = ({ id, name, color, icon, face = null, score, teamId }) => ({ id, name, color, icon, face, score, teamId });

function randomSecret() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
