import { describe, expect, it } from 'vitest';
import { MPHASE, MillionaireRound } from '../src/core/millionaire.js';
import { seatFor } from '../src/core/turns.js';

const Q = { kind: 'test', text: '¿Capital más alta?', options: ['Cuenca', 'Badajoz', 'Jaén', 'Ávila'], correct: 3, points: [2] };
const round = () => new MillionaireRound(Q, { roundId: 'm1', seat: { playerId: 'ana', teamId: 'rojos' } });

describe('millonario', () => {
  it('el presentador enseña las respuestas, el concursante elige y el presentador marca y revela', () => {
    const r = round();
    expect(r.phase).toBe(MPHASE.READY);
    expect(r.choose('ana', 0)).toBe('closed');
    r.show();
    expect(r.choose('ana', 1)).toBe('invalid'); // la B aún no se ve
    expect(r.choose('ana', 0)).toBe('ok');
    r.show(true);
    expect(r.choose('bea', 3)).toBe('not-yours');
    expect(r.choose('ana', 3)).toBe('ok'); // puede cambiar hasta que se marque
    expect(r.mark()).toBe(true);
    expect([r.phase, r.marked]).toEqual([MPHASE.MARKED, 3]);
    expect(r.choose('ana', 0)).toBe('closed');
    expect(r.reveal()).toBe(true);
    expect(r.results).toEqual({ correct: true, points: { ana: 2 } });
  });

  it('si la marcada no es la buena no suma; si salió de la app, tampoco aunque acierte', () => {
    const r = round();
    r.show(true);
    r.mark(1);
    r.reveal();
    expect(r.results).toEqual({ correct: false, points: {} });
    const c = round();
    c.show(true);
    c.cheated = true;
    c.mark(3);
    c.reveal();
    expect(c.results).toEqual({ correct: true, points: {} });
  });

  it('50:50 quita dos incorrectas (y la elegida si era una de ellas)', () => {
    const r = round();
    r.show(true);
    r.choose('ana', 0);
    expect(r.jokerBlocker('fifty')).toBeNull();
    expect(r.fifty(() => 0)).toEqual([0, 1]);
    expect(r.choice).toBeNull();
    expect(r.choose('ana', 0)).toBe('invalid');
    expect(r.jokerBlocker('fifty')).toMatch(/Ya lo has usado/);
  });

  it('los comodines, solo con todas las respuestas a la vista', () => {
    const r = round();
    r.show();
    expect(r.jokerBlocker('call')).toMatch(/todas las respuestas/);
  });

  it('público: votan sus compañeros 15 s; porcentajes que suman 100', () => {
    const r = round();
    r.show(true);
    r.startAudience(['bea', 'cris', 'dani'], 1000);
    expect(r.vote('ana', 0, 1100)).toBe('not-voter');
    expect(r.vote('bea', 3, 1100)).toBe('ok');
    expect(r.vote('bea', 2, 1200)).toBe('duplicate');
    expect(r.vote('cris', 3, 1300)).toBe('ok');
    expect(r.vote('dani', 0, 20_000)).toBe('late');
    expect(r.jokerBlocker('call')).toMatch(/otro comodín/);
    r.finishAudience();
    expect(r.audiencePercentages()).toEqual([0, 0, 0, 100]);
    r.audience.votes = { a: 0, b: 1, c: 2 };
    expect(r.audiencePercentages().reduce((s, n) => s + n, 0)).toBe(100);
  });

  it('público anulado si hablan; llamada: espera, 30 s y fin', () => {
    const r = round();
    r.show(true);
    r.startAudience(['bea'], 0);
    expect(r.cancelAudience()).toBe(true);
    expect(r.audience.state).toBe('cancelled');
    r.startCall('cris');
    expect(r.onCall('cris')).toBe(true);
    expect(r.onCall('ana')).toBe(true);
    expect(r.onCall('bea')).toBe(false);
    expect(r.runCall(5000)).toBe(true);
    expect(r.call.endsAt).toBe(35_000);
    r.mark(3); // marcar cierra lo que siga en marcha al revelar
    r.reveal();
    expect(r.call.state).toBe('done');
    expect(r.onCall('cris')).toBe(false);
  });

  it('se guarda y se recupera', () => {
    const r = round();
    r.show(true);
    r.mark(2);
    const back = MillionaireRound.fromJSON(Q, JSON.parse(JSON.stringify(r)));
    expect([back.phase, back.marked, back.shown]).toEqual([MPHASE.MARKED, 2, 4]);
  });

  it('a medias (la tele se recarga): sigue con el 50:50 y los comodines gastados; Público y Llamada, terminados', () => {
    const r = round();
    r.show(true);
    r.fifty(() => 0);
    r.startAudience(['bea', 'cris'], 1000);
    r.vote('bea', 3, 2000);
    const saved = JSON.parse(JSON.stringify(r.toJSON()));
    const back = MillionaireRound.fromJSON(Q, saved, { settle: true });
    expect([back.phase, back.removed, back.used, back.audience.state]).toEqual([MPHASE.PLAYING, r.removed, ['fifty', 'audience'], 'done']);
    expect(back.audiencePercentages()[3]).toBe(100);
    back.removed.push(9);
    expect(saved.removed).toEqual(r.removed); // copia, no la misma lista
    // llamada esperando o en marcha → terminada
    const c = round();
    c.show(true);
    c.startCall('cris');
    c.runCall(5000);
    const backCall = MillionaireRound.fromJSON(Q, JSON.parse(JSON.stringify(c.toJSON())), { settle: true });
    expect([backCall.call.state, backCall.onCall('cris'), backCall.jokerBlocker('fifty')]).toEqual(['done', false, null]);
  });
});

describe('asiento del millonario', () => {
  const groups = [
    { teamId: 'rojos', order: ['ana', 'cris'] },
    { teamId: 'azules', order: ['bea', 'dani', 'eva'] },
  ];
  it('alterna equipos y sigue el orden de cada portavoz', () => {
    expect([0, 1, 2, 3, 4, 5].map((k) => seatFor(groups, k).playerId)).toEqual(['ana', 'bea', 'cris', 'dani', 'ana', 'eva']);
    expect(seatFor(groups, 1)).toEqual({ playerId: 'bea', teamId: 'azules' });
  });
  it('si en un equipo no hay nadie, le toca al siguiente', () => {
    const online = (id) => !['bea', 'dani', 'eva'].includes(id);
    expect(seatFor(groups, 1, online)).toEqual({ playerId: 'ana', teamId: 'rojos' });
    expect(seatFor([], 0)).toBeNull();
  });
});
