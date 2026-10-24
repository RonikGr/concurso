import { describe, expect, it } from 'vitest';
import {
  defaultShow,
  norm,
  parseNumber,
  parsePointsList,
  parseSectionType,
  parseShowWorkbook,
  parseSpotifyTrack,
  parseYesNo,
} from '../src/core/show.js';

const TRACK = '4uLU6hMCjMI75M1A2tKUQC';

/** Libro mínimo válido; cada test cambia lo que necesita. */
function workbook(overrides = {}) {
  return Object.entries({
    Ajustes: [
      ['Ajuste', 'Valor'],
      ['Título del concurso', 'La gran final'],
      ['Comodín 50 %', 2],
      ['Puntos por fallo', '-1'],
    ],
    Equipos: [
      ['Equipo', 'Color'],
      ['Los Rojos', 'Rojo'],
      ['Las Lima', ''],
    ],
    Concurso: [
      ['Orden', 'Sección', 'Tipo', 'Descripción', 'Puntos', 'El presentador juega', 'Música de entrada', 'Entorno'],
      [2, 'Cultura', 'Test', 'Preguntas de todo', 2, null, null, null],
      [1, 'Rápido', 'Pulsador', '', null, 'no', `https://open.spotify.com/intl-es/track/${TRACK}?si=abc`, 'Cripta helada'],
      [3, 'Tiempo', 'Parar el contador', '', '5, 3, 1', null, null, 'tormenta'],
    ],
    Pulsador: [
      ['Sección', 'Pregunta', 'Respuesta', 'Mostrar en tele', 'Canción', 'Desde segundo', 'Notas'],
      ['Rápido', '¿Capital de Francia?', 'París', 'sí', null, null, 'fácil'],
      ['rapido', '', '', 'no', `spotify:track:${TRACK}`, '1,5', null],
    ],
    Test: [
      ['Sección', 'Pregunta', 'A', 'B', 'C', 'D', 'Correcta', 'Segundos', 'Imagen'],
      ['Cultura', '¿2+2?', '3', '4', '5', null, 'b', null, null],
    ],
    Contador: [
      ['Sección', 'Objetivo (s)', 'Modo', 'Desaparece a los (s)'],
      ['Tiempo', 10, 'Desaparece', 3],
      ['Tiempo', '7,5', 'A ciegas', null],
    ],
    ...overrides,
  })
    .filter(([, data]) => data)
    .map(([sheet, data]) => ({ sheet, data }));
}

describe('valores de celda', () => {
  it('normaliza textos', () => {
    expect(norm('  Sección  Ñ ')).toBe('seccion n');
    expect(norm('Comodín 50 %')).toBe('comodin 50 %');
  });

  it('sí / no', () => {
    expect(parseYesNo('Sí')).toBe(true);
    expect(parseYesNo('NO')).toBe(false);
    expect(parseYesNo(true)).toBe(true);
    expect(parseYesNo('', 'x')).toBe('x');
    expect(parseYesNo('quizá', true)).toBeUndefined();
  });

  it('números a la española', () => {
    expect(parseNumber(3)).toBe(3);
    expect(parseNumber('1,5')).toBe(1.5);
    expect(parseNumber('1.234,5')).toBe(1234.5);
    expect(parseNumber('12.000')).toBe(12000);
    expect(parseNumber('1.5')).toBe(1.5);
    expect(parseNumber('-2')).toBe(-2);
    expect(parseNumber('abc')).toBeNull();
    expect(parseNumber('')).toBeNull();
  });

  it('listas de puntos', () => {
    expect(parsePointsList('3,2,1')).toEqual([3, 2, 1]);
    expect(parsePointsList('5; 3; 1')).toEqual([5, 3, 1]);
    expect(parsePointsList(4)).toEqual([4]);
    expect(parsePointsList('mucho')).toBeNull();
  });

  it('enlaces de Spotify', () => {
    expect(parseSpotifyTrack(`https://open.spotify.com/track/${TRACK}`)).toBe(`spotify:track:${TRACK}`);
    expect(parseSpotifyTrack(`https://open.spotify.com/intl-es/track/${TRACK}?si=x`)).toBe(`spotify:track:${TRACK}`);
    expect(parseSpotifyTrack(`spotify:track:${TRACK}`)).toBe(`spotify:track:${TRACK}`);
    expect(parseSpotifyTrack('https://open.spotify.com/album/123')).toBeNull();
    expect(parseSpotifyTrack('')).toBeNull();
  });

  it('tipos de sección por nombre o alias', () => {
    expect(parseSectionType('Pulsador')).toBe('pulsador');
    expect(parseSectionType('¿Quién es más probable que…?')).toBe('votacion');
    expect(parseSectionType('dos verdades y una mentira')).toBe('dosVerdades');
    expect(parseSectionType('Duelo de reflejos')).toBe('reflejos');
    expect(parseSectionType('Bingo')).toBeNull();
  });
});

describe('lectura del libro', () => {
  it('lee un concurso correcto', () => {
    const { show, errors, warnings } = parseShowWorkbook(workbook());
    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
    expect(show.title).toBe('La gran final');
    expect(show.settings).toMatchObject({ wrongPoints: -1, jokers: { fifty: 2, audience: 1, call: 1 } });
    expect(show.teams).toEqual([
      { id: 'los-rojos', name: 'Los Rojos', color: 'rojo' },
      { id: 'las-lima', name: 'Las Lima', color: 'naranja' }, // sin color: el primero libre
    ]);
    // Ordenadas por la columna Orden, no por la fila.
    expect(show.sections.map((s) => [s.id, s.name, s.type, s.points])).toEqual([
      ['s1', 'Rápido', 'pulsador', [1]],
      ['s2', 'Cultura', 'test', [2]],
      ['s3', 'Tiempo', 'contador', [5, 3, 1]],
    ]);
    const [rapido, cultura, tiempo] = show.sections;
    expect(rapido).toMatchObject({ presenterPlays: false, music: `spotify:track:${TRACK}` });
    // Entorno por nombre o por id; vacío = automático
    expect(show.sections.map((s) => s.env)).toEqual(['cripta', null, 'tormenta']);
    expect(show.sections.map((s) => s.turns)).toEqual([false, false, false]);
    expect(rapido.items).toEqual([
      { question: '¿Capital de Francia?', answer: 'París', showOnTv: true, song: null, songStart: 0, notes: 'fácil' },
      { question: '', answer: '', showOnTv: false, song: `spotify:track:${TRACK}`, songStart: 1.5, notes: '' },
    ]);
    expect(cultura.items).toEqual([{ question: '¿2+2?', options: ['3', '4', '5'], correct: 1, seconds: 20, image: null, level: null }]);
    expect(tiempo.presenterPlays).toBe(true); // por defecto en Contador
    expect(tiempo.items).toEqual([
      { target: 10, mode: 'hide', hideAfter: 3 },
      { target: 7.5, mode: 'blind', hideAfter: null },
    ]);
  });

  it('las columnas pueden ir en cualquier orden', () => {
    const { show, errors } = parseShowWorkbook(
      workbook({
        Test: [
          ['Correcta', 'D', 'C', 'B', 'A', 'Pregunta', 'Sección'],
          ['a', null, null, 'no', 'sí', '¿Llueve?', 'Cultura'],
        ],
      }),
    );
    expect(errors).toEqual([]);
    expect(show.sections[1].items[0]).toMatchObject({ options: ['sí', 'no'], correct: 0 });
  });

  it('informa de los errores con hoja y fila', () => {
    const { errors } = parseShowWorkbook(
      workbook({
        Equipos: [
          ['Equipo', 'Color'],
          ['A', 'Fucsia'],
          ['B', 'Rojo'],
          ['C', 'rojo'],
          ['B', null],
        ],
        Test: [
          ['Sección', 'Pregunta', 'A', 'B', 'C', 'D', 'Correcta'],
          ['Cultura', '¿?', 'x', null, 'z', null, 'A'],
          ['Cultura', '¿?', 'x', 'y', null, null, 'C'],
          ['Inventada', '¿?', 'x', 'y', null, null, 'A'],
          ['Rápido', '¿?', 'x', 'y', null, null, 'A'],
        ],
      }),
    );
    expect(errors).toEqual([
      { sheet: 'Equipos', row: 2, message: 'Color desconocido: "Fucsia". Usa uno de la lista.' },
      { sheet: 'Equipos', row: 4, message: 'El color rojo ya lo usa otro equipo.' },
      { sheet: 'Equipos', row: 5, message: 'Equipo repetido: "B".' },
      { sheet: 'Test', row: 2, message: 'Las respuestas tienen que ir seguidas: no dejes A, B o C vacías.' },
      { sheet: 'Test', row: 3, message: '"Correcta" debe ser la letra de una de las respuestas (A, B, C o D).' },
      { sheet: 'Test', row: 4, message: 'No hay ninguna sección "Inventada" en la pestaña Concurso.' },
      { sheet: 'Test', row: 5, message: 'La sección "Rápido" es de tipo Pulsador, no Test.' },
    ]);
  });

  it('errores en la lista de secciones', () => {
    const { errors } = parseShowWorkbook(
      workbook({
        Concurso: [
          ['Sección', 'Tipo', 'Puntos', 'Música de entrada'],
          ['Uno', 'Bingo', null, null],
          ['Dos', 'Pulsador', 'muchos', null],
          ['Dos', 'Pulsador', null, null],
          ['Tres', 'Libre', null, 'https://youtube.com/x'],
          [null, 'Test', null, null],
        ],
        Pulsador: null,
        Test: null,
        Contador: null,
      }),
    );
    expect(errors.map((e) => [e.row, e.message.split(':')[0]])).toEqual([
      [2, 'Tipo desconocido'],
      [3, 'Puntos no válidos'],
      [4, 'Sección repetida'],
      [5, 'La música debe ser un enlace a una canción de Spotify (open.spotify.com/track/…).'],
      [6, 'Falta el nombre de la sección.'],
    ]);
  });

  it('por turnos: solo en los tipos que lo admiten', () => {
    const { show, errors, warnings } = parseShowWorkbook(
      workbook({
        Concurso: [
          ['Sección', 'Tipo', 'Por turnos'],
          ['Cultura', 'Test', 'sí'],
          ['Rápido', 'Pulsador', 'sí'],
        ],
        Contador: null,
      }),
    );
    expect(errors).toEqual([]);
    expect(show.sections.map((s) => [s.name, s.turns])).toEqual([
      ['Cultura', true],
      ['Rápido', false],
    ]);
    expect(warnings).toContainEqual(expect.objectContaining({ sheet: 'Concurso', row: 3, message: expect.stringContaining('no se puede jugar por turnos') }));
  });

  it('millonario: dificultad de cada pregunta y puntos 1, 3, 5 por defecto', () => {
    const { show, errors } = parseShowWorkbook(
      workbook({
        Concurso: [
          ['Sección', 'Tipo', 'Puntos'],
          ['Cultura', 'Test', null],
        ],
        Test: [
          ['Sección', 'Pregunta', 'A', 'B', 'Correcta', 'Dificultad'],
          ['Cultura', '¿1?', 'x', 'y', 'A', 'Fácil'],
          ['Cultura', '¿2?', 'x', 'y', 'A', 'media'],
          ['Cultura', '¿3?', 'x', 'y', 'A', '3'],
          ['Cultura', '¿4?', 'x', 'y', 'A', null],
          ['Cultura', '¿5?', 'x', 'y', 'A', 'Imposible'],
        ],
        Pulsador: null,
        Contador: null,
      }),
    );
    expect(errors).toEqual([{ sheet: 'Test', row: 6, message: '"Dificultad" debe ser Fácil, Media o Difícil.' }]);
    const cultura = show.sections.find((s) => s.name === 'Cultura');
    expect(cultura.points).toEqual([1, 3, 5]);
    expect(cultura.items.map((q) => q.level)).toEqual(['easy', 'medium', 'hard', null]);
  });

  it('la fila de ayuda de la plantilla no cuenta y la sección vacía es la única de su tipo', () => {
    const { show, errors } = parseShowWorkbook(
      workbook({
        Concurso: [
          ['Sección', 'Tipo'],
          ['↳ Nombre que se verá en la tele', '↳ Elige el tipo'],
          ['Cultura', 'Test'],
          ['Votos 1', 'Votación'],
          ['Votos 2', 'Votación'],
        ],
        Test: [
          ['Pregunta', 'A', 'B', 'Correcta', 'Sección'],
          ['↳ La pregunta tal cual', '↳ Respuestas', null, '↳ Letra', '↳ Vacía = la única sección de este tipo'],
          ['¿1?', 'x', 'y', 'A', null],
        ],
        Votación: [
          ['Pregunta', 'Sección'],
          ['¿Quién…?', null],
          ['¿Quién más…?', 'Votos 2'],
        ],
        Pulsador: null,
        Contador: null,
      }),
    );
    expect(show.sections.map((x) => x.name)).toEqual(['Cultura', 'Votos 1', 'Votos 2']);
    expect(show.sections[0].items).toHaveLength(1);
    expect(show.sections[2].items).toHaveLength(1);
    expect(errors).toEqual([
      { sheet: 'Votación', row: 2, message: 'Escribe en la columna "Sección" a cuál pertenece: hay 2 secciones de tipo ¿Quién es más probable…? (Votos 1, Votos 2).' },
    ]);
  });

  it('un entorno desconocido solo avisa', () => {
    const { show, errors, warnings } = parseShowWorkbook(
      workbook({
        Concurso: [
          ['Sección', 'Tipo', 'Entorno'],
          ['Rápido', 'Pulsador', 'Playa'],
        ],
        Test: null,
        Contador: null,
      }),
    );
    expect(errors).toEqual([]);
    expect(show.sections[0].env).toBeNull();
    expect(warnings).toContainEqual({ sheet: 'Concurso', row: 2, message: 'Entorno desconocido: "Playa". Se usará uno automático.' });
  });

  it('sin pestaña Concurso no hay concurso', () => {
    const { errors } = parseShowWorkbook([{ sheet: 'Pulsador', data: [['Sección', 'Pregunta']] }]);
    expect(errors[0]).toMatchObject({ sheet: 'Concurso', message: expect.stringContaining('Falta la pestaña') });
  });

  it('avisa de secciones vacías y de un solo equipo', () => {
    const { show, warnings } = parseShowWorkbook(
      workbook({
        Equipos: [['Equipo'], ['Solos']],
        Test: [['Sección', 'Pregunta']],
      }),
    );
    expect(show.teams).toEqual([]);
    expect(warnings.map((w) => w.message)).toEqual([
      'Solo hay un equipo: el concurso se jugará sin equipos.',
      'La sección "Cultura" no tiene ninguna fila: se saltará.',
    ]);
  });

  it('lee el resto de tipos', () => {
    const { show, errors } = parseShowWorkbook([
      {
        sheet: 'Concurso',
        data: [
          ['Sección', 'Tipo', 'Puntos'],
          ['VM', 'Verdad o mentira', null],
          ['DV', 'Dos verdades y una mentira', null],
          ['Vot', 'Votación', null],
          ['Est', 'Estimación', null],
          ['Ref', 'Reflejos', null],
          ['Fit', 'Libre', 2],
        ],
      },
      { sheet: 'Verdad o mentira', data: [['Sección', 'Afirmación', 'Respuesta'], ['VM', 'El agua moja', 'Verdad'], ['VM', 'x', 'Quizá']] },
      { sheet: 'Dos verdades', data: [['Sección', 'Sobre quién', 'Frase 1', 'Frase 2', 'Frase 3', 'Mentira'], ['DV', 'Ana', 'a', 'b', 'c', 2]] },
      { sheet: 'Votación', data: [['Sección', 'Pregunta'], ['Vot', '¿Quién llega tarde?']] },
      { sheet: 'Estimación', data: [['Sección', 'Pregunta', 'Respuesta', 'Unidad', 'Gana'], ['Est', '¿Km del Ebro?', '910', 'km', 'Sin pasarse']] },
      { sheet: 'Libre', data: [['Sección', 'Prueba', 'Herramienta', 'Participan', 'Puntos'], ['Fit', 'Plancha', 'Cronómetro', 'Equipos', null]] },
    ]);
    expect(errors).toEqual([{ sheet: 'Verdad o mentira', row: 3, message: '"Respuesta" debe ser Verdad o Mentira.' }]);
    const items = Object.fromEntries(show.sections.map((s) => [s.name, s.items]));
    expect(items.VM).toEqual([{ statement: 'El agua moja', isTrue: true }]);
    expect(items.DV).toEqual([{ about: 'Ana', statements: ['a', 'b', 'c'], lie: 1 }]);
    expect(items.Vot).toEqual([{ question: '¿Quién llega tarde?' }]);
    expect(items.Est).toEqual([{ question: '¿Km del Ebro?', answer: 910, unit: 'km', noOver: true }]);
    // Sin filas: 3 rondas para todos; cada ronda es una pregunta.
    expect(items.Ref).toEqual([1, 2, 3].map((round) => ({ round, rounds: 3, duel: false })));
    expect(items.Fit).toEqual([{ title: 'Plancha', description: '', tool: 'stopwatch', teams: true, points: 2, pieces: null, song: null, songStart: 0, beat: null, silence: 0 }]);
    expect(show.sections.find((s) => s.name === 'Est').points).toEqual([3, 2, 1]); // clasificatoria por defecto
  });

  it('concurso por defecto: un pulsador libre', () => {
    const show = defaultShow();
    expect(show.sections).toHaveLength(1);
    expect(show.sections[0]).toMatchObject({ type: 'pulsador', items: [] });
    expect(show.teams).toEqual([]);
  });
});
