// La sala guardada en el portátil: caduca a las 12 h, salvo si el concurso está en pausa (para seguir otro día).
import { beforeEach, describe, expect, it } from 'vitest';
import { loadSavedRoom, roomFromFile, roomToFile, saveRoom } from '../src/host/persistence.js';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

const HOUR = 60 * 60 * 1000;
const room = (extra = {}) => ({ code: 'ACDE', players: [{ id: 'a', name: 'Ana', score: 3 }], ...extra });

describe('sala guardada', () => {
  beforeEach(() => store.clear());

  it('sin pausa caduca a las 12 h; en pausa sigue ahí días después', () => {
    saveRoom(room());
    expect(loadSavedRoom(Date.now() + 11 * HOUR)?.code).toBe('ACDE');
    expect(loadSavedRoom(Date.now() + 13 * HOUR)).toBeNull();
    saveRoom(room({ paused: { at: Date.now() } }));
    expect(loadSavedRoom(Date.now() + 30 * 24 * HOUR)?.code).toBe('ACDE');
  });

  it('copia en archivo: ida y vuelta, y rechaza lo que no es una partida', async () => {
    const back = roomFromFile(await roomToFile(room({ paused: { at: 1 } })).text());
    expect(back).toEqual(room({ paused: { at: 1 } }));
    expect(roomFromFile('{"kind":"otra cosa"}')).toBeNull();
    expect(roomFromFile('no es json')).toBeNull();
  });

  it('guarda los pasos de la portada y la ruleta, y las caras puestas a mano', () => {
    const steps = { rulesFor: 3, versus: false, punish: true, roulette: false };
    saveRoom(room({ steps, faceOverrides: { a: 'f1', b: null } }));
    const back = loadSavedRoom();
    expect(back.steps).toEqual(steps);
    expect(back.faceOverrides).toEqual({ a: 'f1', b: null });
  });
});
