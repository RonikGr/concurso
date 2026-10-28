import { describe, expect, it } from 'vitest';
import { FPHASE, FreeRound } from '../src/core/free.js';

const item = (tool, extra = {}) => ({ title: 'Prueba', description: '', tool, teams: false, points: 3, ...extra });

describe('sección Libre', () => {
  it('cronómetro: gana quien más aguanta; al caer el último se para solo', () => {
    const r = new FreeRound(item('stopwatch'), { roundId: 'f1' });
    expect(r.start(0)).toBe(false); // sin participantes
    r.setParticipants(['ana', 'bea', 'cris', 'ana']);
    expect(r.participants).toEqual(['ana', 'bea', 'cris']);
    expect(r.start(1000)).toBe(true);
    expect(r.setParticipants(['x'])).toBe(false); // ya ha empezado
    r.eliminate('bea', 21_000); // 20 s
    expect(r.eliminate('bea', 22_000)).toBe(false);
    expect(r.standing()).toEqual(['ana', 'cris']);
    expect(r.timeOf('ana', 31_000)).toBe(30_000); // sigue en pie
    r.eliminate('ana', 41_000); // 40 s
    expect(r.phase).toBe(FPHASE.RUNNING); // queda Cris
    r.eliminate('cris', 61_000); // 60 s: ya no queda nadie
    expect(r.phase).toBe(FPHASE.STOPPED);
    expect(r.ranking(99_000).map((x) => [x.id, x.value, x.place])).toEqual([
      ['cris', 60_000, 1],
      ['ana', 40_000, 2],
      ['bea', 20_000, 3],
    ]);
    expect(r.suggestion(99_000)).toEqual(['cris']);
  });

  it('cronómetro: deshacer un eliminado y parar a mano', () => {
    const r = new FreeRound(item('stopwatch'), { roundId: 'f1' });
    r.setParticipants(['ana', 'bea']);
    r.start(0);
    r.eliminate('ana', 5000);
    expect(r.revive('ana')).toBe(true);
    expect(r.standing()).toEqual(['ana', 'bea']);
    r.stop(9000);
    expect(r.timeOf('ana', 99_999)).toBe(9000); // parado: no sigue contando
    expect(r.suggestion(99_999)).toEqual(['ana', 'bea']); // empate
  });

  it('contador: ±1, nunca por debajo de 0; gana quien más hace', () => {
    const r = new FreeRound(item('counter'), { roundId: 'f2' });
    r.setParticipants(['ana', 'bea']);
    r.start(0);
    r.count('ana', 1);
    r.count('ana', 1);
    r.count('bea', -1);
    r.count('bea', 1);
    expect(r.count('cris', 1)).toBe(false);
    expect(r.counts).toEqual({ ana: 2, bea: 1 });
    expect(r.suggestion(0)).toEqual(['ana']);
  });

  it('contador a cero: no propone ganador', () => {
    const r = new FreeRound(item('counter'), { roundId: 'f2' });
    r.setParticipants(['ana']);
    r.start(0);
    expect(r.suggestion(0)).toEqual([]);
  });

  it('sin herramienta: se elige ganador directamente', () => {
    const r = new FreeRound(item('none', { points: 5 }), { roundId: 'f3' });
    r.setParticipants(['rojos', 'azules']);
    expect(r.start(0)).toBe(false);
    expect(r.award(['azules', 'verdes'], 0)).toEqual({ azules: 5 });
    expect(r.phase).toBe(FPHASE.AWARDED);
    expect(r.award(['rojos'], 0)).toBeNull(); // ya dados
  });

  it('dar puntos para el cronómetro si sigue corriendo; sin ganadores no hay puntos', () => {
    const r = new FreeRound(item('stopwatch'), { roundId: 'f4' });
    r.setParticipants(['ana']);
    r.start(0);
    expect(r.award([], 1000)).toBeNull();
    expect(r.phase).toBe(FPHASE.RUNNING); // sin ganadores no se toca nada
    expect(r.award(['ana'], 2000)).toEqual({ ana: 3 });
    expect(r.tStop).toBe(2000); // dar los puntos para el cronómetro
  });

  it('se guarda y se recupera', () => {
    const r = new FreeRound(item('counter'), { roundId: 'f5' });
    r.setParticipants(['ana', 'bea']);
    r.start(0);
    r.count('bea', 1);
    r.award(['bea'], 10);
    const back = FreeRound.fromJSON(item('counter'), JSON.parse(JSON.stringify(r.toJSON())));
    expect(back.phase).toBe(FPHASE.AWARDED);
    expect(back.points).toEqual({ bea: 3 });
    expect(back.counts).toEqual({ ana: 0, bea: 1 });
  });
});

describe('contador desde el móvil', () => {
  it('con equipos cuenta solo el jugador que elige el presentador', () => {
    const r = new FreeRound(item('counter', { teams: true }), { roundId: 'f9' });
    r.setParticipants(['rojos', 'azules']);
    r.setCounter('rojos', 'ana');
    r.setCounter('azules', 'dani');
    expect(r.countFrom('ana', 'rojos', 1)).toBe('closed'); // aún no ha empezado
    r.start(0);
    expect(r.countFrom('ana', 'rojos', 1)).toBe('ok');
    expect(r.countFrom('ana', 'rojos', 1)).toBe('ok');
    expect(r.countFrom('bea', 'rojos', 1)).toBe('not-counter'); // de los rojos, pero no es quien cuenta
    expect(r.countFrom('cris', 'verdes', 1)).toBe('closed'); // no participa
    expect(r.countFrom('dani', 'azules', -1)).toBe('ok'); // no baja de 0
    r.setCounter('azules', null); // ahora cuenta el presentador
    expect(r.countFrom('dani', 'azules', 1)).toBe('not-counter');
    expect(r.counts).toEqual({ rojos: 2, azules: 0 });
    expect(FreeRound.fromJSON(r.item, JSON.parse(JSON.stringify(r))).counters).toEqual({ rojos: 'ana' });
  });

  it('sin equipos, cada uno cuenta lo suyo', () => {
    const r = new FreeRound(item('counter'), { roundId: 'f10' });
    r.setParticipants(['ana', 'bea']);
    r.start(0);
    expect(r.countFrom('ana', 'ana', 1)).toBe('ok');
    expect(r.countFrom('ana', 'bea', 1)).toBe('not-counter');
    expect(r.setCounter('ana', 'bea')).toBe(false);
  });
});

describe('contrarreloj (p. ej. las botellas)', () => {
  it('salen de uno en uno; los intentos apuntan las piezas; gana quien menos tarda', () => {
    const r = new FreeRound(item('trial', { teams: true, pieces: 5 }), { roundId: 'f1' });
    r.setParticipants(['rojos', 'azules']);
    expect(r.start(1000)).toBe(true);
    expect(r.current).toBe('rojos');
    expect(r.attempt(6, 2000)).toBe(false); // más piezas de las que hay
    expect(r.attempt(2, 11_000)).toBe(true);
    expect(r.attempt(3, 21_000)).toBe(true);
    expect(r.undoAttempt()).toBe(true);
    r.attempt(5, 31_000); // todas bien: se para su reloj (30 s)
    expect(r.trials.rojos).toMatchObject({ time: 30_000, gaveUp: false, attempts: [{ n: 2, t: 10_000 }, { n: 5, t: 30_000 }] });
    // Le toca a los azules, pero su reloj no corre hasta «empezar»
    expect(r.current).toBe('azules');
    expect(r.trialRunning).toBe(false);
    expect(r.attempt(1, 40_000)).toBe(false);
    expect(r.trialNext(50_000)).toBe(true);
    expect(r.trialNext(50_000)).toBe(false);
    r.trialDone(70_000); // 20 s: el último → se para la prueba
    expect(r.phase).toBe(FPHASE.STOPPED);
    expect(r.ranking(99_000).map((x) => [x.id, x.value, x.place])).toEqual([
      ['azules', 20_000, 1],
      ['rojos', 30_000, 2],
    ]);
    expect(r.suggestion(99_000)).toEqual(['azules']);
  });

  it('quien se rinde (o se para a mitad) no tiene puesto', () => {
    const r = new FreeRound(item('trial'), { roundId: 'f1' });
    r.setParticipants(['ana', 'bea']);
    r.start(0);
    r.trialDone(5000, true); // Ana se rinde
    r.trialNext(6000);
    r.stop(9000); // Bea, parada a mitad
    expect(r.ranking(9000).map((x) => [x.id, x.place])).toEqual([
      ['ana', null],
      ['bea', null],
    ]);
    expect(r.suggestion(9000)).toEqual([]);
    const back = FreeRound.fromJSON(r.item, JSON.parse(JSON.stringify(r.toJSON())));
    expect(back.trials).toEqual(r.trials);
  });

  it('sin herramienta pero con canción: «¡Empezar!» la hace sonar', () => {
    const plain = new FreeRound(item('none'), { roundId: 'f1' });
    plain.setParticipants(['ana']);
    expect(plain.start(0)).toBe(false);
    const song = new FreeRound(item('none', { song: 'bachata' }), { roundId: 'f2' });
    song.setParticipants(['ana', 'bea']);
    expect(song.start(0)).toBe(true);
    expect(song.award(['bea'], 5000)).toEqual({ bea: 3 });
  });

  it('nota (marcar el golpe): el presentador da a cada uno del 1 al 10 y esos son sus puntos', () => {
    const r = new FreeRound(item('score', { song: 'Golpe Cancion n1' }), { roundId: 'f3' });
    r.setParticipants(['ana', 'bea', 'cris']);
    expect(r.setScore('ana', 8)).toBe(false); // aún no ha empezado
    expect(r.start(0)).toBe(true);
    expect(r.setScore('ana', 8)).toBe(true);
    expect(r.setScore('bea', 11)).toBe(false);
    expect(r.setScore('bea', 0)).toBe(false);
    expect(r.setScore('bea', 6)).toBe(true);
    expect(r.setScore('zoe', 5)).toBe(false); // no participa
    expect(r.setScore('bea', null)).toBe(true); // quitarla
    r.setScore('bea', 8);
    expect(r.ranking(1000).map((x) => [x.id, x.value, x.place])).toEqual([['ana', 8, 1], ['bea', 8, 1], ['cris', null, null]]);
    expect(r.suggestion(1000)).toEqual(['ana', 'bea']);
    r.stop(2000);
    expect(r.setScore('cris', 3)).toBe(true); // parada, aún se puede
    expect(r.award([], 3000)).toEqual({ ana: 8, bea: 8, cris: 3 });
    expect(r.winners).toEqual(['ana', 'bea']);
    expect(r.setScore('cris', 9)).toBe(false); // ya dados
    const back = FreeRound.fromJSON(r.item, JSON.parse(JSON.stringify(r.toJSON())));
    expect(back.scores).toEqual({ ana: 8, bea: 8, cris: 3 });
    const none = new FreeRound(item('score'), { roundId: 'f4' });
    none.setParticipants(['ana']);
    none.start(0);
    expect(none.award([], 100)).toBeNull(); // sin ninguna nota
  });
});
