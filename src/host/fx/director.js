// "Realizador": compara cada vista de la sala con la anterior y lanza lo que no es pantalla en sí: el entorno del
// fondo, la música de cada sección y los efectos de sonido y confeti de cada momento (abrir turno, pulsar, acertar…).
// Los revelados con suspense programan sus propios sonidos (answerStage, screens).
import { sound } from './audio.js';
import { burst, celebrate } from './confetti.js';
import { HOME_ENV, sectionEnv } from '../../shared/environments.js';
import { SCREEN } from '../../core/runner.js';
import { PHASE } from '../../core/game.js';
import { APHASE, isChoice } from '../../core/answers.js';
import { FPHASE } from '../../core/free.js';
import { millionaireCue } from '../../core/millionaireMusic.js';
import { songFor, songToPrepare } from '../../core/songs.js';
import { getCues } from './cueSettings.js';

/** Entorno de una vista: el de la sección en juego; preparación, portada y final, la noche de luna. */
export function envFor(view) {
  if (!view.section || view.screen === SCREEN.SETUP || view.screen === SCREEN.COVER || view.screen === SCREEN.FINAL) return HOME_ENV;
  return sectionEnv(view.section, view.sectionIndex);
}

/** Clave de "pantalla": si cambia, la pantalla entra con transición. */
export function screenKey(view) {
  const sub =
    view.screen === SCREEN.PLAY
      ? view.itemIndex
      : view.screen === SCREEN.SETUP
        ? view.setupStep
        : view.introRules
          ? 'reglas'
          : view.versus
            ? 'equipos'
            : view.punish?.step === 'vote'
              ? 'castigos'
              : view.punish?.step === 'roulette'
                ? 'ruleta'
                : '';
  if (view.paused) return 'pausa'; // «Continuará…» encima de todo
  return [view.peekScoreboard ? 'peek' : view.screen, view.sectionIndex, sub].join('|');
}

function snapshot(view) {
  const t = performance.now();
  const g = view.game;
  const a = view.answer;
  const f = view.free;
  return {
    key: screenKey(view),
    screen: view.peekScoreboard ? 'peek' : view.screen,
    item: `${view.sectionIndex}|${view.itemIndex}`,
    game: g && { phase: g.phase, started: g.phase === PHASE.OPEN && t >= g.tOpen, judged: g.judged, winner: g.winner?.id ?? null },
    answer: a && {
      round: a.roundId,
      kind: a.kind,
      phase: a.phase,
      started: a.phase === APHASE.OPEN && a.tOpen != null && t >= a.tOpen,
      green: a.tGreen != null && t >= a.tGreen,
      variant: a.reflex?.variant ?? null,
      answered: a.answeredIds?.length ?? 0,
    },
    rules: !!view.introRules,
    step: view.screen === SCREEN.SETUP ? view.setupStep : view.versus ? 'versus' : null,
    squid: view.squid && { game: view.squid.game, phase: view.squid.phase },
    words: view.words && { round: view.words.roundId, phase: view.words.phase, n: view.words.results.length, last: view.words.results.at(-1)?.result ?? null, score: view.words.score },
    shake: view.shake && { round: view.shake.roundId, phase: view.shake.phase },
    hanky: view.hanky && { step: view.hanky.finished ? 'final' : (view.hanky.current?.step ?? 'wait') },
    bet: view.bet && { round: view.bet.roundId, phase: view.bet.phase, win: view.bet.owners.some((o) => o.result > 0) },
    punish: view.punish && { step: view.punish.step, closed: view.punish.closed, votes: view.punish.tally.reduce((s, x) => s + x, 0), spin: view.punish.spin?.at ?? null },
    millionaire: view.millionaire && {
      round: view.millionaire.roundId,
      phase: view.millionaire.phase,
      shown: view.millionaire.shown,
      used: view.millionaire.used,
      correct: view.millionaire.result?.correct ?? null,
      audience: view.millionaire.audience?.state ?? null,
      call: view.millionaire.call?.state ?? null,
    },
    free: f && {
      round: f.roundId,
      phase: f.phase,
      tool: f.tool,
      out: f.participants?.filter((p) => p.out != null).length ?? 0,
      count: f.participants?.reduce((s, p) => s + (p.count ?? 0), 0) ?? 0,
    },
  };
}

/** Estilo de música de cada momento (ver music.js). */
function musicScene(n) {
  if (n.key === 'pausa') return 'lobby';
  // la canción del título sigue sonando mientras se conecta la gente (sin cortarse al cambiar de pantalla)
  if (n.screen === SCREEN.SETUP) return n.step === 'title' || n.step === 'join' ? 'title' : 'lobby';
  if (n.screen === SCREEN.COVER && n.step === 'versus') return 'versus';
  if (n.screen === SCREEN.COVER || n.screen === SCREEN.INTRO) return 'organ';
  if (n.screen === SCREEN.SCOREBOARD || n.screen === 'peek') return 'march';
  if (n.screen === SCREEN.FINAL) return 'waltz';
  const { game: g, answer: a, free: f, millionaire: m } = n;
  // Juegos nuevos: tensión mientras corre el tiempo; revelado al acabar
  // Squid Games (con su propia música: ver MOODS.squid): en Luz roja y el puente, silencio (la muñeca, la respiración)
  if (n.squid) {
    const { game, phase } = n.squid;
    if (game === 'hucha') return 'reveal';
    if (phase === 'running') return game === 'luzroja' || game === 'puente' ? 'hush' : 'tension';
    return 'explore';
  }
  // El pañuelo: suspense en el sillón, tensión en la carrera, revelado con el ganador (sus sonidos, en hankyStage)
  if (n.hanky) return { called: 'suspense', running: 'tension', done: 'reveal', final: 'reveal' }[n.hanky.step] ?? 'explore';
  if (n.words) return n.words.phase === 'running' ? 'tension' : n.words.phase === 'done' ? 'reveal' : 'explore';
  if (n.shake) return n.shake.phase === 'running' ? 'tension' : n.shake.phase === 'done' ? 'reveal' : 'explore';
  if (n.bet) return n.bet.phase === 'revealed' ? 'reveal' : n.bet.phase === 'question' ? 'tension' : 'suspense';
  // Millonario: la llamada y el público tienen su música; luego, pregunta → respuesta marcada → verde
  if (m) {
    if (m.call === 'running') return 'call';
    if (m.audience === 'voting') return 'audienceVote';
    if (m.phase === 'marked') return 'suspense';
    if (m.phase === 'revealed') return 'reveal';
    return 'tension';
  }
  if (g?.phase === PHASE.OPEN || a?.phase === APHASE.OPEN || f?.phase === FPHASE.RUNNING) return 'tension';
  // esperando veredicto → suspense; resuelto → revelado
  if ((g?.phase === PHASE.RESULT && g.judged === 'correct') || a?.phase === APHASE.REVEALED || f?.phase === FPHASE.AWARDED) return 'reveal';
  if (g?.phase === PHASE.RESULT || a?.phase === APHASE.CLOSED || f?.phase === FPHASE.STOPPED) return 'suspense';
  return 'explore';
}

export function createDirector({ backdrop }) {
  let prev = null;
  // lo programado para más tarde (la megafonía, destellos): se anula al cambiar de pantalla (si no, se pisaba con la siguiente)
  let timers = [];
  const later = (fn, ms) => timers.push(setTimeout(fn, ms));

  return function direct(view) {
    const env = envFor(view);
    backdrop?.setEnv(env);
    sound.setMood(env);

    const n = snapshot(view);
    const p = prev;
    prev = n;

    // Las canciones de una sección valen en su presentación, su juego y su marcador final (no al consultar el marcador)
    const inSection = view.section && [SCREEN.INTRO, SCREEN.PLAY, SCREEN.SCOREBOARD].includes(view.screen) && !view.peekScoreboard;
    sound.setScene(musicScene(n), inSection ? view.section.name : null, view.screen === SCREEN.PLAY ? view.itemIndex : null);
    // Millonario con sus canciones: mandan sobre la música de siempre
    sound.setCue(
      millionaireCue(
        {
          screen: view.peekScoreboard ? 'peek' : view.screen,
          sectionType: view.section?.type,
          sectionIndex: view.sectionIndex,
          introRules: view.introRules,
          itemIndex: view.itemIndex,
          itemCount: view.itemCount,
          millionaire: view.millionaire,
        },
        performance.now(),
        getCues(),
      ),
    );
    // Canciones de las pruebas (carpeta «Canciones»)
    sound.prepareSong(songToPrepare(view));
    sound.setSong(songFor(view));
    const own = sound.cueActive; // las canciones ya traen sus golpes

    if (!p) return;
    if (n.key !== p.key) {
      timers.forEach(clearTimeout);
      timers = [];
      if (n.screen === SCREEN.INTRO && view.section?.type === 'squid') {
        // Squid Games: megafonía y bienvenida
        sound.sq('pa');
        later(() => sound.say('Bienvenidos a los juegos.'), 1900);
      } else if (n.screen === SCREEN.INTRO) {
        sound.play('whoosh');
        if (!own) sound.play('gong', 250);
        backdrop?.flash(0.35);
      } else if (n.screen === SCREEN.COVER && n.step === 'versus') {
        // Un golpe por equipo según van entrando (screens.versusScreen) y la fanfarria con el «VS»
        sound.play('whoosh');
        sound.play('hit', 500);
        sound.play('hit', 1300);
        sound.play('fanfare', 2100);
        later(() => backdrop?.flash(0.5), 2100);
      } else if (n.screen === SCREEN.COVER) {
        sound.play('hit');
        sound.play('fanfare', 200);
      } else if (n.screen === SCREEN.SETUP && n.step === 'title') {
        sound.play('gong', 300);
        backdrop?.flash(0.4);
      } else if (n.screen === SCREEN.SCOREBOARD || n.screen === 'peek') {
        sound.play('whoosh');
        sound.play('roll', 300);
      } else if (n.screen !== SCREEN.FINAL) {
        sound.play('whoosh');
      }
    }

    // Pulsador
    const g = n.game;
    const pg = p.item === n.item ? p.game : null;
    if (g) {
      if (g.started && !pg?.started) sound.play('go');
      if (g.phase === PHASE.RESULT && pg?.phase !== PHASE.RESULT) {
        sound.play('buzz');
        backdrop?.flash(0.4);
      }
      if (g.judged === 'correct' && pg?.judged !== 'correct') {
        sound.play('correct');
        burst({ y: 0.45, count: 70 });
      }
      // Fallo: vuelve a abrirse para el resto, o se cierra si no queda nadie.
      if (pg?.phase === PHASE.RESULT && (g.phase === PHASE.OPEN || g.phase === PHASE.CLOSED) && !g.judged) sound.play('wrong');
    }

    // Respuestas (Test, Verdad o mentira, Votación, Estimación, Contador, Reflejos)
    const a = n.answer;
    const pa = p.answer?.round === a?.round ? p.answer : null;
    if (a) {
      if (a.started && !pa?.started) sound.play(a.kind === 'reflejos' ? 'count' : 'go');
      // Reflejos con despistes: sin sonido en la señal buena (si no, bastaría con escuchar)
      if (a.kind === 'reflejos' && a.variant === 'green' && a.started && a.green && !pa?.green && a.phase === APHASE.OPEN) {
        sound.play('go');
        backdrop?.flash(0.5);
      }
      if (pa && a.answered > pa.answered && a.phase === APHASE.OPEN) sound.play('blip');
      if (a.phase === APHASE.CLOSED && pa?.phase === APHASE.OPEN) sound.play('bell');
      // El revelado (redoble, golpe, aciertos) lo programa answerStage, que sabe cuándo sale cada cosa: aquí, el destello.
      if (a.phase === APHASE.REVEALED && pa && pa.phase !== APHASE.REVEALED) later(() => backdrop?.flash(0.45), isChoice(a.kind) ? 2800 : 0);
    }

    // Millonario
    const m = n.millionaire;
    const pm = p.millionaire?.round === m?.round ? p.millionaire : null;
    if (m && pm) {
      if (m.shown > pm.shown) sound.play('pop'); // aparece una respuesta
      for (const k of m.used) if (!pm.used.includes(k)) sound.play(k); // comodín usado
      if (m.phase === 'marked' && pm.phase !== 'marked' && !own) sound.play('bell'); // «¿respuesta definitiva?»
      if (m.phase === 'revealed' && pm.phase !== 'revealed') {
        if (!m.correct || !own) sound.play(m.correct ? 'correct' : 'wrong');
        backdrop?.flash(0.4);
        if (m.correct) burst({ y: 0.45, count: 60 });
      }
      if (m.call === 'done' && pm.call === 'running' && !own) sound.play('hit'); // se acabó el tiempo de la llamada
      if (m.audience === 'done' && pm.audience === 'voting') sound.play('pop');
    }

    // Palabras secretas: cada tarjeta suena (acertada, pasada o falta); al acabar el tiempo, campana
    const w = n.words;
    const pw = p.words?.round === w?.round ? p.words : null;
    if (w && pw) {
      if (w.phase === 'running' && pw.phase !== 'running') sound.play('go');
      if (w.n > pw.n) sound.play(w.last === 'ok' ? 'correct' : w.last === 'foul' ? 'wrong' : 'pop');
      if (w.phase === 'done' && pw.phase === 'running') {
        sound.play('bell');
        if (w.score) {
          sound.play('fanfare', 500);
          burst({ y: 0.4, count: 50 });
        }
      }
    }

    // Agita el móvil: al acabar, campana y confeti para el ganador
    const s = n.shake;
    const ps = p.shake?.round === s?.round ? p.shake : null;
    if (s && ps && s.phase === 'done' && ps.phase !== 'done') {
      sound.play('bell');
      sound.play('fanfare', 400);
      celebrate(2200);
    }

    // La gran apuesta
    const b = n.bet;
    const pb = p.bet?.round === b?.round ? p.bet : null;
    if (b && pb && b.phase !== pb.phase) {
      if (b.phase === 'question') sound.play('whoosh');
      if (b.phase === 'revealed') {
        sound.play('roll');
        sound.play(b.win ? 'correct' : 'wrong', 1200);
        if (b.win) later(() => burst({ y: 0.45, count: 60 }), 1200);
      }
    }

    // Castigos: cada voto, el cierre de la votación y la ruleta (redoble mientras gira y fanfarria al pararse)
    const pu = n.punish;
    const ppu = p.punish;
    if (pu && ppu && pu.step === ppu.step) {
      if (pu.votes !== ppu.votes) sound.play('blip');
      if (pu.closed && !ppu.closed) {
        sound.play('gong');
        backdrop?.flash(0.4);
      }
      if (pu.spin && pu.spin !== ppu.spin) {
        sound.play('roll');
        sound.play('fanfare', 6000);
      }
    }

    // Libre
    const f = n.free;
    const pf = p.free?.round === f?.round ? p.free : null;
    if (f && pf) {
      // (con Nota hay cuenta atrás: el «¡ya!» lo pone freeStage al acabarla)
      if (f.phase === FPHASE.RUNNING && pf.phase !== FPHASE.RUNNING && f.tool !== 'score') sound.play('go');
      if (f.out > pf.out) sound.play('out');
      if (f.count !== pf.count) sound.play(f.count > pf.count ? 'blip' : 'pop');
      if (f.phase === FPHASE.STOPPED && pf.phase === FPHASE.RUNNING) sound.play('bell');
      if (f.phase === FPHASE.AWARDED && pf.phase !== FPHASE.AWARDED) {
        sound.play('fanfare');
        celebrate(2200);
      }
    }
  };
}
