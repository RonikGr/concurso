// Modelo del concurso y lectura de la hoja de cálculo. Lógica pura: recibe las hojas ya leídas
// ([{sheet, data: filas[][]}], el formato de read-excel-file) y devuelve el concurso más los errores por fila.
//
// Las cabeceras se reconocen sin distinguir mayúsculas, tildes ni el orden de las columnas.
import { COLORS } from '../shared/appearance.js';
import { ENVIRONMENTS } from '../shared/environments.js';
import { TURN_TYPES } from './turns.js';
import { MILLIONAIRE_POINTS } from './millionaireMusic.js';

export const SECTION_TYPES = {
  pulsador: { label: 'Pulsador', sheet: 'Pulsador', ranked: false, presenterPlays: false, needsItems: false },
  test: { label: 'Test', sheet: 'Test', ranked: false, presenterPlays: false, needsItems: true },
  verdad: { label: 'Verdad o mentira', sheet: 'Verdad o mentira', ranked: false, presenterPlays: false, needsItems: true },
  dosVerdades: { label: 'Dos verdades y una mentira', sheet: 'Dos verdades', ranked: false, presenterPlays: false, needsItems: true },
  votacion: { label: '¿Quién es más probable…?', sheet: 'Votación', ranked: false, presenterPlays: true, needsItems: true },
  estimacion: { label: 'Estimación', sheet: 'Estimación', ranked: true, presenterPlays: false, needsItems: true },
  contador: { label: 'Parar el contador', sheet: 'Contador', ranked: true, presenterPlays: true, needsItems: true },
  reflejos: { label: 'Duelo de reflejos', sheet: 'Reflejos', ranked: true, presenterPlays: true, needsItems: false },
  libre: { label: 'Libre', sheet: 'Libre', ranked: false, presenterPlays: true, needsItems: true },
  palabras: { label: 'Palabras secretas', sheet: 'Palabras', ranked: false, presenterPlays: false, needsItems: true },
  agitar: { label: 'Agita el móvil', sheet: 'Agitar', ranked: true, presenterPlays: true, needsItems: false },
  apuesta: { label: 'La gran apuesta', sheet: 'Apuesta', ranked: false, presenterPlays: false, needsItems: true },
};

/** Palabras secretas: cómo se hace adivinar cada palabra. */
export const WORD_MODES = {
  mimica: { label: 'Mímica', icon: '🎭', rule: 'Sin hablar ni hacer ruidos' },
  tabu: { label: 'Tabú', icon: '🤐', rule: 'Explícala sin decir las palabras prohibidas' },
  describe: { label: 'Descríbelo', icon: '🗣️', rule: 'Explícala sin decir la palabra' },
  tararea: { label: 'Tararéalo', icon: '🎵', rule: 'Solo tarareando: sin letra' },
};

/** Tipos que ya se pueden jugar (el resto se muestra como "próximamente"). */
export const PLAYABLE_TYPES = new Set(Object.keys(SECTION_TYPES)); // todas las secciones ya se pueden jugar

export const DEFAULT_SETTINGS = {
  title: 'Concurso del año',
  defaultPoints: 1,
  wrongPoints: 0,
  lockEarlyBuzz: true,
  testSeconds: 20,
  jokers: { fifty: 1, audience: 1, call: 1 },
  wordSeconds: 60, // Palabras secretas: segundos por turno
  wordRounds: 3, // Palabras secretas: turnos por equipo
};

const RANKED_DEFAULT_POINTS = [3, 2, 1];

/** Concurso por defecto si no se carga ninguna hoja: una sección de pulsador para improvisar. */
export function defaultShow() {
  return {
    title: DEFAULT_SETTINGS.title,
    settings: structuredClone(DEFAULT_SETTINGS),
    teams: [],
    sections: [
      {
        id: 's1',
        name: 'Pulsador',
        type: 'pulsador',
        description: 'El primero que pulse, responde.',
        points: [1],
        presenterPlays: false,
        music: null,
        items: [],
      },
    ],
    punishments: [],
  };
}

// ---------------------------------------------------------------------------------------------
// Utilidades de texto y valores

/** Entorno por nombre ("Cripta helada") o id ("cripta"); null si no existe. */
export function parseEnv(value) {
  const key = norm(text(value));
  if (!key) return null;
  return ENVIRONMENTS.find((e) => norm(e.name) === key || e.id === key)?.id ?? null;
}

/** "Sección" → "seccion": minúsculas, sin tildes ni signos. */
export function norm(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9%]+/g, ' ')
    .trim();
}

const isEmpty = (v) => v == null || (typeof v === 'string' && v.trim() === '');
const text = (v) => (isEmpty(v) ? '' : String(v).trim());

/** Sí/no en cualquier forma razonable; `undefined` si no se entiende. */
export function parseYesNo(value, fallback) {
  if (isEmpty(value)) return fallback;
  if (typeof value === 'boolean') return value;
  const v = norm(value);
  if (['si', 's', 'x', 'yes', 'y', 'true', 'verdadero', '1'].includes(v)) return true;
  if (['no', 'n', 'false', 'falso', '0'].includes(v)) return false;
  return undefined;
}

/** Números con coma decimal o puntos de millar: "1,5" → 1.5, "1.234,5" → 1234.5, "12.000" → 12000. */
export function parseNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (isEmpty(value)) return null;
  let s = String(value).trim().replace(/\s/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** "3,2,1" / "3; 2; 1" / 5 → [3,2,1] / [5]. */
export function parsePointsList(value) {
  if (isEmpty(value)) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? [value] : null;
  const parts = String(value)
    .split(/[;/|\s]+|,(?=\s*-?\d)/)
    .map((p) => p.trim())
    .filter(Boolean);
  const nums = parts.map(parseNumber);
  return nums.length && nums.every((n) => n != null) ? nums : null;
}

/** Enlace o URI de canción de Spotify → "spotify:track:ID"; null si no lo es. */
export function parseSpotifyTrack(value) {
  const s = text(value);
  if (!s) return null;
  const uri = s.match(/^spotify:track:([A-Za-z0-9]{22})$/);
  if (uri) return `spotify:track:${uri[1]}`;
  const url = s.match(/^https?:\/\/open\.spotify\.com\/(?:intl-[a-z-]+\/)?track\/([A-Za-z0-9]{22})/);
  return url ? `spotify:track:${url[1]}` : null;
}

function slug(name, taken) {
  const base = norm(name).replace(/ /g, '-') || 'equipo';
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  taken.add(id);
  return id;
}

function colorByName(value) {
  const v = norm(value);
  return COLORS.find((c) => c.id === v || norm(c.name) === v)?.id ?? null;
}

// ---------------------------------------------------------------------------------------------
// Lectura de hojas genérica: cabecera → objetos con claves conocidas

/**
 * @param columns {clave: [alias normalizados]}
 * @returns {rows: [{row, values: {clave: celda}}], missing: [clave]}
 */
/** Fila de ayuda de la plantilla (explica cada columna): su primera celda con texto empieza por «↳». */
export const HELP_MARK = '↳';
const isHelpRow = (cells) => {
  const first = cells.find((c) => !isEmpty(c));
  return typeof first === 'string' && first.trim().startsWith(HELP_MARK);
};

function readTable(data, columns) {
  const headerIndex = data.findIndex((r) => r?.some((c) => !isEmpty(c)));
  if (headerIndex < 0) return { rows: [], missing: Object.keys(columns) };
  const header = data[headerIndex].map(norm);
  const colOf = {};
  for (const [key, aliases] of Object.entries(columns)) {
    // Primero coincidencia exacta; "empieza por" solo con alias largos (si no, "c" casaría con "correcta").
    let i = header.findIndex((h) => aliases.includes(h));
    if (i < 0) i = header.findIndex((h) => aliases.some((a) => a.length >= 3 && h.startsWith(a)));
    if (i >= 0) colOf[key] = i;
  }
  const rows = [];
  for (let r = headerIndex + 1; r < data.length; r++) {
    const cells = data[r] ?? [];
    if (!cells.some((c) => !isEmpty(c))) continue;
    if (isHelpRow(cells)) continue; // la fila de ayuda de la plantilla, debajo de los títulos
    const values = {};
    for (const [key, i] of Object.entries(colOf)) values[key] = cells[i] ?? null;
    rows.push({ row: r + 1, values }); // fila tal como la numera Excel
  }
  return { rows, missing: Object.keys(columns).filter((k) => !(k in colOf)) };
}

const COLUMNS = {
  ajustes: { key: ['ajuste'], value: ['valor'] },
  equipos: { name: ['equipo', 'nombre'], color: ['color'] },
  concurso: {
    order: ['orden'],
    name: ['seccion'],
    type: ['tipo'],
    description: ['descripcion'],
    points: ['puntos'],
    presenterPlays: ['el presentador juega', 'presentador juega', 'presentador'],
    turns: ['por turnos', 'turnos'],
    music: ['musica'],
    env: ['entorno'],
  },
  pulsador: {
    section: ['seccion'],
    question: ['pregunta'],
    answer: ['respuesta'],
    showOnTv: ['mostrar en tele', 'mostrar'],
    song: ['cancion'],
    songStart: ['desde segundo', 'desde'],
    notes: ['notas'],
  },
  test: { section: ['seccion'], question: ['pregunta'], a: ['a'], b: ['b'], c: ['c'], d: ['d'], correct: ['correcta'], level: ['dificultad', 'nivel'], seconds: ['segundos'], image: ['imagen'] },
  verdad: { section: ['seccion'], statement: ['afirmacion', 'frase'], answer: ['respuesta', 'es'] },
  dosVerdades: { section: ['seccion'], about: ['sobre'], s1: ['frase 1'], s2: ['frase 2'], s3: ['frase 3'], lie: ['mentira'] },
  votacion: { section: ['seccion'], question: ['pregunta'] },
  estimacion: { section: ['seccion'], question: ['pregunta'], answer: ['respuesta'], unit: ['unidad'], mode: ['gana'] },
  contador: { section: ['seccion'], target: ['objetivo'], mode: ['modo'], hideAfter: ['desaparece a los', 'desaparece'] },
  reflejos: { section: ['seccion'], rounds: ['rondas'], mode: ['participan'] },
  libre: {
    section: ['seccion'],
    title: ['prueba'],
    description: ['descripcion'],
    tool: ['herramienta'],
    who: ['participan'],
    points: ['puntos'],
    pieces: ['piezas', 'aciertos de'],
    song: ['cancion'],
    songStart: ['desde segundo', 'desde'],
    beat: ['golpe'],
    silence: ['silencio'],
  },
  palabras: { section: ['seccion'], word: ['palabra'], banned: ['prohibidas', 'palabras prohibidas'], mode: ['modo'] },
  agitar: { section: ['seccion'], seconds: ['segundos'] },
  apuesta: { section: ['seccion'], question: ['pregunta'], a: ['a'], b: ['b'], c: ['c'], d: ['d'], correct: ['correcta'] },
  castigos: { text: ['castigo'] },
};

const TYPE_ALIASES = [
  ['pulsador', ['pulsador']],
  ['test', ['test', '4 respuestas', 'cuatro respuestas']],
  ['dosVerdades', ['dos verdades y una mentira', 'dos verdades']],
  ['verdad', ['verdad o mentira', 'verdad']],
  ['votacion', ['votacion', 'quien es mas probable', 'quien es mas probable que']],
  ['estimacion', ['estimacion', 'el precio justo']],
  ['contador', ['contador', 'parar el contador']],
  ['reflejos', ['reflejos', 'duelo de reflejos', 'semaforo']],
  ['libre', ['libre']],
  ['palabras', ['palabras secretas', 'palabras', 'mimica', 'tabu']],
  ['agitar', ['agita el movil', 'agitar', 'agita']],
  ['apuesta', ['la gran apuesta', 'apuesta']],
];

export function parseSectionType(value) {
  const v = norm(value);
  return TYPE_ALIASES.find(([, aliases]) => aliases.includes(v))?.[0] ?? null;
}

function findSheet(sheets, name) {
  const n = norm(name);
  return sheets.find((s) => norm(s.sheet) === n) ?? null;
}

// ---------------------------------------------------------------------------------------------

/**
 * @param sheets [{sheet: 'Concurso', data: [[...], ...]}, ...]
 * @returns {{show, errors: [{sheet, row, message}], warnings: [{sheet, row, message}]}}
 */
export function parseShowWorkbook(sheets) {
  const errors = [];
  const warnings = [];
  const err = (sheet, row, message) => errors.push({ sheet, row, message });
  const warn = (sheet, row, message) => warnings.push({ sheet, row, message });

  // --- Ajustes
  const settings = structuredClone(DEFAULT_SETTINGS);
  const ajustes = findSheet(sheets, 'Ajustes');
  if (ajustes) {
    for (const { row, values } of readTable(ajustes.data, COLUMNS.ajustes).rows) {
      const key = norm(values.key);
      const value = values.value;
      if (!key) continue;
      const number = (min = 0) => {
        const n = parseNumber(value);
        if (n == null || n < min) err('Ajustes', row, `"${text(values.key)}" debe ser un número${min ? ` mayor o igual que ${min}` : ''}.`);
        return n;
      };
      if (key.startsWith('titulo')) settings.title = text(value) || settings.title;
      else if (key.includes('turno') && key.includes('segundo')) settings.wordSeconds = number(10) ?? settings.wordSeconds;
      else if (key.includes('turnos por equipo')) settings.wordRounds = number(1) ?? settings.wordRounds;
      else if (key.includes('50')) settings.jokers.fifty = number() ?? settings.jokers.fifty;
      else if (key.includes('llamada')) settings.jokers.call = number() ?? settings.jokers.call;
      else if (key.includes('publico')) settings.jokers.audience = number() ?? settings.jokers.audience;
      else if (key.includes('puntos por defecto')) settings.defaultPoints = number() ?? settings.defaultPoints;
      else if (key.includes('puntos por fallo')) {
        const n = parseNumber(value);
        if (n == null) err('Ajustes', row, '"Puntos por fallo" debe ser un número (puede ser negativo).');
        else settings.wrongPoints = n;
      } else if (key.includes('bloquear')) {
        const b = parseYesNo(value, settings.lockEarlyBuzz);
        if (b === undefined) err('Ajustes', row, `"${text(values.key)}" debe ser sí o no.`);
        else settings.lockEarlyBuzz = b;
      } else if (key.includes('segundos')) settings.testSeconds = number(5) ?? settings.testSeconds;
      else warn('Ajustes', row, `Ajuste desconocido: "${text(values.key)}" (se ignora).`);
    }
  }

  // --- Equipos
  const teams = [];
  const equipos = findSheet(sheets, 'Equipos');
  if (equipos) {
    const ids = new Set();
    const names = new Set();
    const usedColors = new Set();
    const pending = [];
    for (const { row, values } of readTable(equipos.data, COLUMNS.equipos).rows) {
      const name = text(values.name);
      if (!name) {
        err('Equipos', row, 'Falta el nombre del equipo.');
        continue;
      }
      if (names.has(norm(name))) {
        err('Equipos', row, `Equipo repetido: "${name}".`);
        continue;
      }
      names.add(norm(name));
      let color = null;
      if (!isEmpty(values.color)) {
        color = colorByName(values.color);
        if (!color) err('Equipos', row, `Color desconocido: "${text(values.color)}". Usa uno de la lista.`);
        else if (usedColors.has(color)) err('Equipos', row, `El color ${text(values.color)} ya lo usa otro equipo.`);
      }
      const team = { id: slug(name, ids), name, color };
      if (color) usedColors.add(color);
      else pending.push(team);
      teams.push(team);
    }
    // Sin color: el primero libre (dejando el gris para "sin equipo").
    for (const team of pending) {
      team.color = COLORS.find((c) => c.id !== 'gris' && !usedColors.has(c.id))?.id ?? COLORS[0].id;
      usedColors.add(team.color);
    }
    if (teams.length === 1) warn('Equipos', null, 'Solo hay un equipo: el concurso se jugará sin equipos.');
    if (teams.length > COLORS.length - 1) err('Equipos', null, `Como mucho ${COLORS.length - 1} equipos (uno por color).`);
  }

  // --- Concurso (lista de secciones)
  const sections = [];
  const concurso = findSheet(sheets, 'Concurso');
  if (!concurso) {
    err('Concurso', null, 'Falta la pestaña "Concurso" con la lista de secciones.');
  } else {
    const table = readTable(concurso.data, COLUMNS.concurso);
    for (const k of ['name', 'type']) if (table.missing.includes(k)) err('Concurso', 1, `Falta la columna "${k === 'name' ? 'Sección' : 'Tipo'}".`);
    const seen = new Set();
    for (const { row, values } of table.rows) {
      const name = text(values.name);
      if (!name) {
        err('Concurso', row, 'Falta el nombre de la sección.');
        continue;
      }
      if (seen.has(norm(name))) {
        err('Concurso', row, `Sección repetida: "${name}". Cada sección necesita un nombre distinto.`);
        continue;
      }
      seen.add(norm(name));
      const type = parseSectionType(values.type);
      if (!type) {
        err('Concurso', row, `Tipo desconocido: "${text(values.type)}". Usa uno de la lista desplegable.`);
        continue;
      }
      const info = SECTION_TYPES[type];
      let points = parsePointsList(values.points);
      if (!isEmpty(values.points) && !points) err('Concurso', row, `Puntos no válidos: "${text(values.points)}". Usa un número o una lista como 3,2,1.`);
      points ??= info.ranked ? [...RANKED_DEFAULT_POINTS] : type === 'test' ? [...MILLIONAIRE_POINTS] : [settings.defaultPoints];
      const presenterPlays = parseYesNo(values.presenterPlays, info.presenterPlays);
      if (presenterPlays === undefined) err('Concurso', row, '"El presentador juega" debe ser sí o no.');
      // Por turnos: cada pregunta la responde uno de cada equipo, en el orden que elige su portavoz
      let turns = parseYesNo(values.turns, false);
      if (turns === undefined) err('Concurso', row, '"Por turnos" debe ser sí o no.');
      if (turns && !TURN_TYPES.has(type)) {
        warn('Concurso', row, `"${info.label}" no se puede jugar por turnos (solo Test, Verdad o mentira, Estimación y Parar el contador): se juega normal.`);
        turns = false;
      }
      const music = parseSpotifyTrack(values.music);
      if (!isEmpty(values.music) && !music) err('Concurso', row, 'La música debe ser un enlace a una canción de Spotify (open.spotify.com/track/…).');
      // Entorno de Halloween (opcional): si no se pone o no existe, se reparte uno distinto por sección.
      const env = parseEnv(values.env);
      if (!isEmpty(values.env) && !env) warn('Concurso', row, `Entorno desconocido: "${text(values.env)}". Se usará uno automático.`);
      const order = parseNumber(values.order);
      sections.push({
        id: `s${sections.length + 1}`,
        name,
        type,
        description: text(values.description),
        points,
        presenterPlays: presenterPlays ?? info.presenterPlays,
        turns: !!turns,
        music,
        env,
        items: [],
        _order: order ?? Infinity,
        _row: row,
      });
    }
    sections.sort((a, b) => a._order - b._order || a._row - b._row);
    sections.forEach((s, i) => {
      s.id = `s${i + 1}`;
      delete s._order;
      delete s._row;
    });
  }

  // --- Contenido de cada sección
  const sectionByName = new Map(sections.map((s) => [norm(s.name), s]));
  for (const [type, info] of Object.entries(SECTION_TYPES)) {
    const sheet = findSheet(sheets, info.sheet);
    if (!sheet) continue;
    const { rows } = readTable(sheet.data, COLUMNS[type]);
    // Sección vacía: la única de ese tipo (lo normal: así no hay que escribirla en cada fila)
    const ofType = sections.filter((s) => s.type === type);
    for (const { row, values } of rows) {
      let section = sectionByName.get(norm(values.section));
      if (isEmpty(values.section)) {
        if (ofType.length === 1) section = ofType[0];
        else if (!ofType.length) continue; // ningún juego de este tipo esta vez: sus filas quedan de reserva
        else {
          err(info.sheet, row, `Escribe en la columna "Sección" a cuál pertenece: hay ${ofType.length} secciones de tipo ${info.label} (${ofType.map((s) => s.name).join(', ')}).`);
          continue;
        }
      }
      if (!section) {
        err(info.sheet, row, `No hay ninguna sección "${text(values.section)}" en la pestaña Concurso.`);
        continue;
      }
      if (section.type !== type) {
        err(info.sheet, row, `La sección "${section.name}" es de tipo ${SECTION_TYPES[section.type].label}, no ${info.label}.`);
        continue;
      }
      // Los parsers hacen `return fail(...)`: tiene que devolver null para que la fila no se añada.
      const fail = (message) => {
        err(info.sheet, row, message);
        return null;
      };
      const item = ITEM_PARSERS[type](values, fail, settings, section);
      if (item) section.items.push(item);
    }
  }
  for (const s of sections) {
    if (SECTION_TYPES[s.type].needsItems && !s.items.length) {
      warn(SECTION_TYPES[s.type].sheet, null, `La sección "${s.name}" no tiene ninguna fila: se saltará.`);
    }
    if (s.type === 'reflejos') {
      // Cada fila (N rondas) se convierte en N preguntas: así el recorrido avanza ronda a ronda.
      const rows = s.items.length ? s.items : [{ rounds: 3, duel: false }];
      s.items = rows.flatMap((row) => Array.from({ length: row.rounds }, (_, i) => ({ round: i + 1, rounds: row.rounds, duel: row.duel })));
    }
    if (s.type === 'agitar' && !s.items.length) s.items = [{ seconds: 10 }]; // sin filas: una ronda de 10 s
    if (s.type === 'palabras' && s.items.length) {
      // Las filas son las tarjetas; los «puntos» del recorrido, los turnos: cada equipo N veces, alternando
      // (sin equipos, 6 turnos que van rotando entre la gente).
      s.cards = s.items;
      const nTeams = teams.length > 1 ? teams.length : 0;
      const turns = nTeams ? settings.wordRounds * nTeams : 6;
      s.items = Array.from({ length: turns }, (_, k) => ({ turn: k, teamIndex: nTeams ? k % nTeams : null, seconds: settings.wordSeconds }));
    }
  }

  // --- Castigos (para quien pierda): se votan al empezar y al final una ruleta elige uno
  const punishments = [];
  const castigos = findSheet(sheets, 'Castigos');
  if (castigos) {
    for (const { values } of readTable(castigos.data, COLUMNS.castigos).rows) {
      const t = text(values.text);
      if (t && !punishments.some((p) => norm(p) === norm(t))) punishments.push(t);
    }
  }

  const show = { title: settings.title, settings, teams: teams.length > 1 ? teams : [], sections, punishments };
  return { show, errors, warnings };
}

const ITEM_PARSERS = {
  pulsador(v, err) {
    const question = text(v.question);
    // Canción: el nombre de su archivo en la carpeta Canciones del concurso (la tele la pone al abrir el turno)
    const song = text(v.song) || null;
    if (!question && !song) return err('Falta la pregunta (o una canción).');
    const showOnTv = parseYesNo(v.showOnTv, true);
    if (showOnTv === undefined) return err('"Mostrar en tele" debe ser sí o no.');
    const songStart = isEmpty(v.songStart) ? 0 : parseNumber(v.songStart);
    if (songStart == null || songStart < 0) return err('"Desde (s)" debe ser un número de segundos.');
    return { question, answer: text(v.answer), showOnTv, song, songStart, notes: text(v.notes) };
  },

  test(v, err, settings) {
    const question = text(v.question);
    if (!question) return err('Falta la pregunta.');
    const options = ['a', 'b', 'c', 'd'].map((k) => text(v[k]));
    const lastFilled = options.findLastIndex(Boolean);
    if (lastFilled < 1) return err('Hacen falta al menos dos respuestas (A y B).');
    if (options.slice(0, lastFilled + 1).some((o) => !o)) return err('Las respuestas tienen que ir seguidas: no dejes A, B o C vacías.');
    const letter = norm(v.correct).toUpperCase();
    const correct = 'ABCD'.indexOf(letter);
    if (letter.length !== 1 || correct < 0 || correct > lastFilled) return err('"Correcta" debe ser la letra de una de las respuestas (A, B, C o D).');
    const seconds = isEmpty(v.seconds) ? settings.testSeconds : parseNumber(v.seconds);
    if (seconds == null || seconds < 5) return err('"Segundos" debe ser un número de al menos 5.');
    const image = text(v.image);
    if (image && !/^https?:\/\//i.test(image)) return err('"Imagen" debe ser una dirección web (https://…).');
    // Dificultad (millonario: música y puntos); vacía = por tercios
    const lv = norm(v.level);
    const level = !lv ? null : /^(facil|1)$/.test(lv) ? 'easy' : /^(media|medio|intermedia|2)$/.test(lv) ? 'medium' : /^(dificil|3)$/.test(lv) ? 'hard' : undefined;
    if (level === undefined) return err('"Dificultad" debe ser Fácil, Media o Difícil.');
    return { question, options: options.slice(0, lastFilled + 1), correct, seconds, image: image || null, level };
  },

  verdad(v, err) {
    const statement = text(v.statement);
    if (!statement) return err('Falta la afirmación.');
    const a = norm(v.answer);
    const isTrue = ['verdad', 'v', 'verdadero', 'si', 'true', 'cierto'].includes(a) ? true : ['mentira', 'm', 'f', 'falso', 'no', 'false'].includes(a) ? false : null;
    if (isTrue == null) return err('"Respuesta" debe ser Verdad o Mentira.');
    return { statement, isTrue };
  },

  dosVerdades(v, err) {
    const about = text(v.about);
    if (!about) return err('Falta "Sobre quién".');
    const statements = [text(v.s1), text(v.s2), text(v.s3)];
    if (statements.some((s) => !s)) return err('Faltan frases: hacen falta las tres.');
    const lie = parseNumber(v.lie);
    if (![1, 2, 3].includes(lie)) return err('"Mentira" debe ser 1, 2 o 3 (el número de la frase falsa).');
    return { about, statements, lie: lie - 1 };
  },

  votacion(v, err) {
    const question = text(v.question);
    if (!question) return err('Falta la pregunta.');
    return { question };
  },

  estimacion(v, err) {
    const question = text(v.question);
    if (!question) return err('Falta la pregunta.');
    const answer = parseNumber(v.answer);
    if (answer == null) return err('"Respuesta" debe ser un número.');
    const mode = norm(v.mode);
    const noOver = mode.includes('pasar');
    if (mode && !noOver && !mode.includes('cercano')) return err('"Gana" debe ser "Más cercano" o "Sin pasarse".');
    return { question, answer, unit: text(v.unit), noOver };
  },

  contador(v, err) {
    const target = parseNumber(v.target);
    if (target == null || target <= 0) return err('"Objetivo" debe ser un número de segundos mayor que 0.');
    const m = norm(v.mode);
    const mode = !m || m.startsWith('visible') ? 'visible' : m.includes('ciega') ? 'blind' : m.startsWith('desaparece') ? 'hide' : null;
    if (!mode) return err('"Modo" debe ser Visible, A ciegas o Desaparece.');
    let hideAfter = null;
    if (mode === 'hide') {
      hideAfter = parseNumber(v.hideAfter);
      if (hideAfter == null || hideAfter <= 0 || hideAfter >= target) return err('"Desaparece a los" debe ser un número de segundos menor que el objetivo.');
    }
    return { target, mode, hideAfter };
  },

  reflejos(v, err) {
    const rounds = isEmpty(v.rounds) ? 3 : parseNumber(v.rounds);
    if (!Number.isInteger(rounds) || rounds < 1) return err('"Rondas" debe ser un número entero (1 o más).');
    const m = norm(v.mode);
    if (m && !['todos', 'duelo'].includes(m)) return err('"Participan" debe ser Todos o Duelo.');
    return { rounds, duel: m === 'duelo' };
  },

  /** Palabras secretas: una tarjeta (palabra, prohibidas y modo; sin modo: Tabú si tiene prohibidas, si no Mímica). */
  palabras(v, err) {
    const word = text(v.word);
    if (!word) return err('Falta la palabra.');
    const banned = text(v.banned)
      .split(/[,;\n]/)
      .map((w) => w.trim())
      .filter(Boolean);
    const m = norm(v.mode);
    const mode = !m ? (banned.length ? 'tabu' : 'mimica') : m.startsWith('mim') ? 'mimica' : m.startsWith('tab') ? 'tabu' : m.startsWith('desc') ? 'describe' : m.startsWith('tara') ? 'tararea' : null;
    if (!mode) return err('"Modo" debe ser Mímica, Tabú, Descríbelo o Tararéalo.');
    if (mode === 'tabu' && !banned.length) return err('En Tabú hacen falta palabras prohibidas (separadas por comas).');
    return { word, banned, mode };
  },

  agitar(v, err) {
    const seconds = isEmpty(v.seconds) ? 10 : parseNumber(v.seconds);
    if (seconds == null || seconds < 3 || seconds > 60) return err('"Segundos" debe ser un número entre 3 y 60.');
    return { seconds };
  },

  /** La gran apuesta: una pregunta de opciones por fila (como el Test). */
  apuesta(v, err) {
    const question = text(v.question);
    if (!question) return err('Falta la pregunta.');
    const options = ['a', 'b', 'c', 'd'].map((k) => text(v[k]));
    const lastFilled = options.findLastIndex(Boolean);
    if (lastFilled < 1) return err('Hacen falta al menos dos respuestas (A y B).');
    if (options.slice(0, lastFilled + 1).some((o) => !o)) return err('Las respuestas tienen que ir seguidas: no dejes A, B o C vacías.');
    const letter = norm(v.correct).toUpperCase();
    const correct = 'ABCD'.indexOf(letter);
    if (letter.length !== 1 || correct < 0 || correct > lastFilled) return err('"Correcta" debe ser la letra de una de las respuestas (A, B, C o D).');
    return { question, options: options.slice(0, lastFilled + 1), correct };
  },

  libre(v, err, settings, section) {
    const title = text(v.title);
    if (!title) return err('Falta el nombre de la prueba.');
    const t = norm(v.tool);
    const tool = !t || t === 'ninguna' ? 'none' : t.startsWith('crono') ? 'stopwatch' : t.startsWith('contador') ? 'counter' : t.startsWith('contrarreloj') ? 'trial' : null;
    if (!tool) return err('"Herramienta" debe ser Ninguna, Cronómetro, Contador o Contrarreloj.');
    const w = norm(v.who);
    if (w && !['jugadores', 'equipos'].includes(w)) return err('"Participan" debe ser Jugadores o Equipos.');
    const points = isEmpty(v.points) ? section.points[0] : parseNumber(v.points);
    if (points == null) return err('"Puntos" debe ser un número.');
    const pieces = isEmpty(v.pieces) ? null : parseNumber(v.pieces);
    if (pieces != null && (!Number.isInteger(pieces) || pieces < 1 || pieces > 12)) return err('"Piezas" debe ser un número entero de 1 a 12.');
    // Con canción (p. ej. la bachata): suena desde «Desde»; si hay «Golpe», calla «Silencio» segundos antes y vuelve
    // justo en el golpe (así se ve quién lo marca a tiempo).
    const song = text(v.song) || null;
    const songStart = isEmpty(v.songStart) ? 0 : parseNumber(v.songStart);
    if (songStart == null || songStart < 0) return err('"Desde (s)" debe ser un número de segundos.');
    const beat = isEmpty(v.beat) ? null : parseNumber(v.beat);
    if (beat != null && (beat <= songStart || !song)) return err('"Golpe (s)" tiene que ir después de «Desde» y con canción.');
    const silence = isEmpty(v.silence) ? (beat != null ? 3 : 0) : parseNumber(v.silence);
    if (silence == null || silence < 0 || (beat != null && silence > beat - songStart)) return err('"Silencio (s)" debe ser un número de segundos (antes del golpe).');
    return {
      title,
      description: text(v.description),
      tool,
      teams: w === 'equipos',
      points,
      pieces: tool === 'trial' ? pieces : null,
      song,
      songStart,
      beat,
      silence: beat != null ? silence : 0,
    };
  },
};
