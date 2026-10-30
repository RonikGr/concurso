import { describe, expect, it } from 'vitest';
import { songFor, songToPrepare } from '../src/core/songs.js';

const buzzer = (game, extra = {}) => ({
  screen: 'play',
  section: { id: 's6' },
  itemIndex: 2,
  item: { question: '¿Qué canción es?', song: 'Propuesta Indecente.mp3', songStart: 12 },
  shown: { question: true, answer: false },
  game,
  ...extra,
});

describe('canciones de las pruebas', () => {
  it('pulsador: suena al abrir, se para al pulsar, sigue en el rebote y al acertar', () => {
    expect(songFor(buzzer({ phase: 'idle' }))).toBeNull();
    expect(songToPrepare(buzzer({ phase: 'idle' }))).toBe('propuestaindecente');
    expect(songFor(buzzer({ phase: 'open', tOpen: 5000 }))).toEqual({ key: 's6:2', track: 'propuestaindecente', from: 12, playing: true, startAt: 5000 });
    expect(songFor(buzzer({ phase: 'result', judged: null })).playing).toBe(false);
    expect(songFor(buzzer({ phase: 'result', judged: 'correct' })).playing).toBe(true);
    expect(songFor(buzzer({ phase: 'closed' })).playing).toBe(true);
    expect(songFor(buzzer({ phase: 'result', judged: null }, { shown: { answer: true } })).playing).toBe(true);
    expect(songFor(buzzer({ phase: 'open' }, { item: { question: 'Sin canción' } }))).toBeNull();
    expect(songFor(buzzer({ phase: 'open' }, { screen: 'intro' }))).toBeNull();
  });

  it('libre con canción (bachata): suena al empezar y calla antes del golpe', () => {
    const free = (phase) => ({ screen: 'play', free: { roundId: '9:0#1', phase, song: 'bachata 1', songStart: 30, beat: 52.5, silence: 3, tStart: 100 } });
    expect(songFor(free('setup'))).toBeNull();
    expect(songToPrepare(free('setup'))).toBe('bachata1');
    expect(songFor(free('running'))).toEqual({ key: '9:0#1', track: 'bachata1', from: 30, playing: true, startAt: 100, silence: [49.5, 52.5], until: 56.5, fadeIn: 0 });
    expect(songFor(free('stopped')).playing).toBe(false);
  });
});
