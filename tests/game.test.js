import { beforeEach, describe, expect, it } from 'vitest';
import { BUZZ, LOCK, PHASE, QuestionEngine, playerView } from '../src/core/game.js';

const SETTINGS = { scheduledOpenMs: 300, decisionWindowMs: 150, nearTieMs: 30, lockEarlyBuzz: true };

let g;
beforeEach(() => {
  g = new QuestionEngine({ ...SETTINGS });
});

/** Pulsación con la época actual; tArrival = tPress salvo que se indique. */
const press = (playerId, tPress, tArrival = tPress, epoch = g.epoch) => g.buzz({ playerId, tPress, tArrival, epoch });

/** Abre en t=1000 → el turno empieza en 1300. */
function openAt1000() {
  g.open(1000);
  expect(g.tOpen).toBe(1300);
}

describe('flujo básico', () => {
  it('abre, recibe pulsaciones, espera la ventana y declara ganador', () => {
    openAt1000();
    expect(g.phase).toBe(PHASE.OPEN);
    expect(press('a', 1500)).toEqual({ result: BUZZ.OK, windowEndsAt: 1650 });
    expect(press('b', 1520).result).toBe(BUZZ.OK);
    expect(g.closeWindow(1600)).toBe(false); // aún no
    expect(g.closeWindow(1650)).toBe(true);
    expect(g.phase).toBe(PHASE.RESULT);
    expect(g.winnerId).toBe('a');
    expect(g.ranking().map((r) => [r.playerId, r.reactionMs, r.deltaMs])).toEqual([
      ['a', 200, 0],
      ['b', 220, 20],
    ]);
  });

  it('dentro de la ventana gana una pulsación anterior que llegó más tarde', () => {
    openAt1000();
    press('wifi', 1510, 1515);
    press('datos', 1500, 1600); // pulsó antes, llegó 85 ms después
    g.closeWindow(1665);
    expect(g.winnerId).toBe('datos');
  });

  it('una pulsación anterior que llega después de cerrar la ventana no quita el puesto, pero queda marcada', () => {
    openAt1000();
    press('wifi', 1510, 1515);
    g.closeWindow(1665);
    g.buzz({ playerId: 'lento', tPress: 1490, tArrival: 1700, epoch: g.epoch, meta: { source: 'synced' } });
    const [first, second] = g.ranking();
    expect(first.playerId).toBe('wifi');
    expect(second).toMatchObject({ playerId: 'lento', beatWinner: true, meta: { source: 'synced' } });
  });

  it('tras declarar ganador, las siguientes pulsaciones entran como seguidores', () => {
    openAt1000();
    press('a', 1500);
    g.closeWindow(1650);
    expect(press('c', 1700).result).toBe(BUZZ.OK);
    expect(press('c', 1710).result).toBe(BUZZ.DUPLICATE);
    expect(g.ranking().map((r) => r.playerId)).toEqual(['a', 'c']);
  });

  it('una sola pulsación por jugador y ronda', () => {
    openAt1000();
    press('a', 1500);
    expect(press('a', 1501).result).toBe(BUZZ.DUPLICATE);
  });

  it('acierto: cierra la pregunta a nuevas pulsaciones', () => {
    openAt1000();
    press('a', 1500);
    g.closeWindow(1650);
    expect(g.correct()).toBe('a');
    expect(g.correct()).toBeNull();
    expect(press('b', 1800).result).toBe(BUZZ.CLOSED);
    expect(g.wrong(1900, ['a', 'b'])).toBeNull();
  });

  it('siguiente pregunta: nueva época, sin bloqueos', () => {
    press('a', 500); // antes de abrir → bloqueado
    g.next();
    expect(g.qid).toBe(2);
    expect(g.phase).toBe(PHASE.IDLE);
    expect(g.lockouts.size).toBe(0);
  });
});

describe('pulsar antes de tiempo', () => {
  it('en "pregunta en el aire" bloquea durante esa pregunta', () => {
    expect(press('a', 500)).toEqual({ result: BUZZ.EARLY, locked: true });
    expect(g.lockouts.get('a')).toBe(LOCK.EARLY);
    openAt1000();
    expect(press('a', 1500).result).toBe(BUZZ.LOCKED);
  });

  it('entre "Abrir turno" y la apertura programada también es antes de tiempo', () => {
    openAt1000();
    expect(press('a', 1200).result).toBe(BUZZ.EARLY);
    expect(press('b', 1300).result).toBe(BUZZ.OK); // justo en tOpen vale
  });

  it('con la opción desactivada se ignora pero no bloquea', () => {
    g.settings.lockEarlyBuzz = false;
    expect(press('a', 500)).toEqual({ result: BUZZ.EARLY, locked: false });
    openAt1000();
    expect(press('a', 1500).result).toBe(BUZZ.OK);
  });

  it('reiniciar la pregunta (R) quita los bloqueos', () => {
    press('a', 500);
    g.restart();
    expect(g.lockouts.size).toBe(0);
    expect(g.qid).toBe(1);
  });
});

describe('épocas: pulsaciones de rondas anteriores', () => {
  it('una pulsación vieja que cae dentro del turno abierto vale (miró la tele)', () => {
    const before = g.epoch;
    openAt1000();
    expect(press('a', 1400, 1410, before).result).toBe(BUZZ.OK);
  });

  it('una pulsación vieja anterior a la apertura se descarta sin bloquear', () => {
    const before = g.epoch;
    openAt1000();
    expect(press('a', 1200, 1210, before).result).toBe(BUZZ.STALE);
    expect(g.lockouts.has('a')).toBe(false);
  });

  it('pulsación de la pregunta anterior que llega tras "Siguiente" se descarta', () => {
    const old = g.epoch;
    g.next();
    expect(press('a', 100, 100, old).result).toBe(BUZZ.STALE);
    expect(g.lockouts.size).toBe(0);
  });

  it('época del futuro: descartada', () => {
    expect(press('a', 100, 100, g.epoch + 1).result).toBe(BUZZ.STALE);
  });
});

describe('fallo y rebote', () => {
  function winnerA() {
    openAt1000();
    press('a', 1500);
    press('b', 1520);
    g.closeWindow(1650);
  }

  it('bloquea al que falló y reabre para los demás desde cero', () => {
    winnerA();
    expect(g.wrong(2000, ['a', 'b', 'c'])).toEqual({ loserId: 'a', reopened: true });
    expect(g.phase).toBe(PHASE.OPEN);
    expect(g.tOpen).toBe(2300);
    expect(g.buzzes).toEqual([]); // b tiene que volver a pulsar
    expect(g.lockouts.get('a')).toBe(LOCK.WRONG);
    expect(press('a', 2400).result).toBe(BUZZ.LOCKED);
    press('b', 2450);
    g.closeWindow(2600);
    expect(g.winnerId).toBe('b');
  });

  it('si no queda nadie, la pregunta se cierra', () => {
    winnerA();
    g.wrong(2000, ['a', 'b']); // reabre para b
    press('b', 2400);
    g.closeWindow(2550);
    expect(g.wrong(2600, ['a', 'b'])).toEqual({ loserId: 'b', reopened: false });
    expect(g.phase).toBe(PHASE.CLOSED);
  });

  it('los desconectados no cuentan para reabrir', () => {
    winnerA();
    expect(g.wrong(2000, ['a']).reopened).toBe(false);
  });
});

describe('vista del jugador', () => {
  it('recorre los estados de una pregunta', () => {
    expect(playerView(g, 'a', 0).status).toBe('wait');
    openAt1000();
    expect(playerView(g, 'a', 1100)).toMatchObject({ status: 'go', tOpen: 1300, opensInMs: 200 });
    press('a', 1500);
    press('b', 1520);
    expect(playerView(g, 'a', 1510).status).toBe('pressed');
    g.closeWindow(1650);
    expect(playerView(g, 'a', 1700)).toMatchObject({ status: 'first', reactionMs: 200, judged: null });
    expect(playerView(g, 'b', 1700)).toMatchObject({ status: 'placed', place: 2, deltaMs: 20, nearTie: true });
    expect(playerView(g, 'c', 1700).status).toBe('missed');
    g.wrong(2000, ['a', 'b', 'c']);
    expect(playerView(g, 'a', 2100)).toMatchObject({ status: 'blocked', reason: LOCK.WRONG });
    expect(playerView(g, 'b', 2100).status).toBe('go');
  });

  it('muestra el veredicto y la pregunta cerrada', () => {
    openAt1000();
    press('a', 1500);
    g.closeWindow(1650);
    g.correct();
    expect(playerView(g, 'a', 1700)).toMatchObject({ status: 'first', judged: 'correct' });
    g.restart();
    press('x', 10);
    expect(playerView(g, 'x', 20)).toMatchObject({ status: 'blocked', reason: LOCK.EARLY });
  });
});

describe('cuenta atrás', () => {
  it('la primera apertura espera la cuenta atrás; el rebote tras un fallo, no', () => {
    const g = new QuestionEngine({ ...SETTINGS, countdownSec: 3 });
    g.open(1000);
    expect(g.tOpen).toBe(4000);
    g.buzz({ playerId: 'a', tPress: 4100, tArrival: 4110, epoch: g.epoch });
    g.closeWindow(4300);
    g.wrong(5000, ['a', 'b']);
    expect(g.tOpen).toBe(5300);
  });
});

describe('deshacer el último juicio', () => {
  /** Abre, pulsa a (y b) y cierra la ventana: ganador a. */
  function winnerA() {
    openAt1000();
    press('a', 1500);
    press('b', 1520);
    g.closeWindow(1650);
    expect(g.winnerId).toBe('a');
  }

  it('sin juicio no hay nada que deshacer', () => {
    winnerA();
    expect(g.canUndo).toBe(false);
    expect(g.unjudge()).toBeNull();
  });

  it('acierto → vuelve a result con el mismo ganador sin juzgar (una sola vez)', () => {
    winnerA();
    g.correct();
    expect(g.canUndo).toBe(true);
    expect(g.unjudge()).toEqual({ kind: 'correct', playerId: 'a' });
    expect(g.phase).toBe(PHASE.RESULT);
    expect(g.judged).toBeNull();
    expect(g.winnerId).toBe('a');
    expect(g.canUndo).toBe(false);
    expect(g.unjudge()).toBeNull();
    // se puede juzgar otra vez (ahora, fallo)
    expect(g.wrong(2000, ['a', 'b'])).toEqual({ loserId: 'a', reopened: true });
  });

  it('fallo con rebote → desbloquea, tira el rebote y sus pulsaciones y vuelve a result con él', () => {
    winnerA();
    const epoch = g.epoch;
    g.wrong(2000, ['a', 'b', 'c']);
    expect(g.phase).toBe(PHASE.OPEN);
    const reboundEpoch = g.epoch;
    press('c', 2400); // pulsa en el rebote
    expect(g.unjudge()).toEqual({ kind: 'wrong', playerId: 'a' });
    expect(g.phase).toBe(PHASE.RESULT);
    expect(g.judged).toBeNull();
    expect(g.winnerId).toBe('a');
    expect(g.tOpen).toBe(1300);
    expect(g.lockouts.has('a')).toBe(false);
    expect(g.ranking().map((r) => r.playerId)).toEqual(['a', 'b']);
    expect(g.epoch).toBeGreaterThan(reboundEpoch);
    expect(epoch).toBeLessThan(reboundEpoch);
    // una pulsación tardía del rebote ya no cuenta
    expect(press('c', 2500, 2500, reboundEpoch).result).toBe(BUZZ.STALE);
    expect(playerView(g, 'a', 3000).status).toBe('first');
  });

  it('fallo sin nadie más (cerrada) → vuelve a result', () => {
    winnerA();
    expect(g.wrong(2000, ['a'])).toEqual({ loserId: 'a', reopened: false });
    expect(g.phase).toBe(PHASE.CLOSED);
    g.unjudge();
    expect(g.phase).toBe(PHASE.RESULT);
    expect(g.judged).toBeNull();
    expect(g.lockouts.size).toBe(0);
  });

  it('solo el último: tras fallo y acierto del rebote, deshace el acierto; R y la pregunta nueva lo olvidan', () => {
    winnerA();
    g.wrong(2000, ['a', 'b']);
    press('b', 2400);
    g.closeWindow(2600);
    g.correct();
    expect(g.unjudge()).toEqual({ kind: 'correct', playerId: 'b' });
    expect(g.lockouts.get('a')).toBe(LOCK.WRONG); // el fallo de a sigue
    expect(g.unjudge()).toBeNull();
    g.correct();
    g.restart();
    expect(g.canUndo).toBe(false);
    winnerAgain();
    g.correct();
    g.next();
    expect(g.canUndo).toBe(false);

    function winnerAgain() {
      g.open(5000);
      press('a', 5500);
      g.closeWindow(5700);
    }
  });
});
