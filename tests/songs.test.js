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
    expect(songFor(free('stopped'))).toBeNull(); // parada: vuelve la música de la sección
    expect(songFor(free('awarded'))).toBeNull();
  });

  it('libre con la canción de la carpeta del juego: suena desde el «¡ya!» si la fila no nombra otra', () => {
    const free = (phase, song = null) => ({ screen: 'play', free: { roundId: '17:1#1', phase, song, songStart: 0, beat: null, silence: 0, tStart: 200, tool: 'counter' } });
    const itemTrack = 'juego-fitofat-flexiones';
    expect(songToPrepare(free('setup'), { itemTrack })).toBe(itemTrack);
    expect(songFor(free('setup'), { itemTrack })).toBeNull();
    expect(songFor(free('running'), { itemTrack })).toEqual({ key: '17:1#1', track: itemTrack, from: 0, playing: true, startAt: 200, silence: null, until: null, fadeIn: 0 });
    expect(songFor(free('stopped'), { itemTrack })).toBeNull();
    expect(songFor(free('awarded'), { itemTrack })).toBeNull();
    expect(songFor(free('running'))).toBeNull(); // sin carpeta: la música de siempre
    expect(songFor(free('running', 'bachata 1'), { itemTrack }).track).toBe('bachata1'); // manda la columna «Canción»
    expect(songToPrepare({ screen: 'play', game: { phase: 'idle' }, item: {} }, { itemTrack })).toBeNull(); // solo en Libre
    // con el marcador encima o en pausa no suena (la tele guarda dónde iba)
    expect(songFor({ ...free('running'), peekScoreboard: true }, { itemTrack })).toBeNull();
    expect(songFor({ ...free('running'), paused: { at: 1 } }, { itemTrack })).toBeNull();
  });

  it('Squid Games: la canción de la carpeta del juego suena mientras corre', () => {
    const squid = (phase) => ({ screen: 'play', squid: { game: 'cuerda', phase, g: { roundId: 'x#3:2', phase, tOpen: 900 } } });
    const itemTrack = 'juego-squidgames-cuerda';
    expect(songToPrepare(squid('ready'), { itemTrack })).toBe(itemTrack);
    expect(songFor(squid('ready'), { itemTrack })).toBeNull();
    expect(songFor(squid('running'), { itemTrack })).toEqual({ key: 'x#3:2', track: itemTrack, from: 0, playing: true, startAt: 900 });
    expect(songFor(squid('done'), { itemTrack })).toBeNull(); // al acabar, la de la sección
    expect(songFor(squid('running'))).toBeNull(); // sin canción del juego: la música de siempre
  });
});
