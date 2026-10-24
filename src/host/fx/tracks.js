// Tus canciones (.mp3) para cada momento del concurso. Se guardan en el propio portátil (IndexedDB): no se suben a
// ningún sitio, así que no hace falta meterlas en el repositorio (que es público) y siguen ahí al volver a abrir la tele.
// Un momento sin canciones usa la música generada (music.js).
import { MILLIONAIRE_TRACKS } from '../../core/millionaireMusic.js';

/** Momentos del concurso → estilos de music.js (mismas claves). Valen para todo el concurso. */
export const MUSIC_SLOTS = [
  { id: 'title', label: 'Título del concurso', help: 'Suena al presentar el concurso (el título en grande), antes de que se conecte la gente' },
  { id: 'lobby', label: 'Preparación', help: 'Suena en la preparación y mientras se conecta la gente' },
  { id: 'versus', label: 'Presentación de equipos', help: 'Suena al presentar los equipos («Rojos contra Azules»), antes de la portada' },
  { id: 'organ', label: 'Presentación', help: 'Suena en la portada y al presentar cada sección' },
  { id: 'explore', label: 'Jugando', help: 'Suena entre preguntas, antes de abrirlas' },
  { id: 'tension', label: 'Pregunta abierta', help: 'Suena durante la cuenta atrás y mientras se puede pulsar o responder' },
  { id: 'suspense', label: 'Suspense', help: 'Suena al cerrar la pregunta, esperando el resultado' },
  { id: 'reveal', label: 'Revelado', help: 'Suena al desvelar la respuesta y los puntos' },
  { id: 'march', label: 'Marcador', help: 'Suena en el marcador al acabar cada sección' },
  { id: 'waltz', label: 'Final', help: 'Suena en el podio final' },
];

/**
 * Momentos que se pueden cambiar en una sección concreta (p. ej. la música de «¿Quién quiere ser millonario?» en el
 * Test). Si una sección no tiene canción para un momento, suena la general de ese momento.
 */
export const SECTION_SLOTS = ['organ', 'explore', 'tension', 'suspense', 'reveal', 'march'];

/**
 * Las 7 canciones del millonario (todas las secciones de Test): una por hueco, con sus puntos de sincronía
 * (core/millionaireMusic.js). Mandan sobre la música de esos momentos.
 */
export const MILLIONAIRE_SLOTS = MILLIONAIRE_TRACKS.map((t) => ({ ...t, id: `mill:${t.id}`, track: t.id }));

/** Clave de un momento de una sección (la sección se reconoce por su nombre en la hoja). */
export const sectionSlot = (sectionName, scene) => `${sectionName}|${scene}`;

/**
 * Efectos con tus canciones: suenan una vez, en vez del efecto generado (p. ej. los golpes del millonario). También
 * por sección. La música de fondo baja mientras suenan.
 */
export const EFFECT_SLOTS = [
  { id: 'sfx:lock', label: 'Respuesta definitiva', help: 'Suena una vez al cerrar la pregunta (como «¿es su respuesta definitiva?»)' },
  { id: 'sfx:correct', label: 'Acierto', help: 'Suena una vez al iluminar la respuesta buena o al marcar un acierto' },
  { id: 'sfx:wrong', label: 'Fallo', help: 'Suena una vez si nadie acierta o al marcar un fallo' },
  { id: 'sfx:fifty', label: 'Comodín 50 %', help: 'Suena una vez cuando alguien usa el 50 %' },
  { id: 'sfx:audience', label: 'Comodín del público', help: 'Suena una vez cuando alguien usa el público' },
  { id: 'sfx:call', label: 'Comodín de la llamada', help: 'Suena una vez cuando alguien usa la llamada' },
];

/** Efecto generado → su hueco de canción (audio.js). */
export const SFX_SLOT = { bell: 'sfx:lock', correct: 'sfx:correct', wrong: 'sfx:wrong', fifty: 'sfx:fifty', audience: 'sfx:audience', call: 'sfx:call' };

/**
 * Escalera (como el millonario): en una sección, si «Jugando», «Pregunta abierta» o «Suspense» tienen varias canciones,
 * la 1ª suena en la 1ª pregunta, la 2ª en la 2ª… (por orden de nombre: «1 - …», «2 - …»); la última sigue para el resto.
 */
export const LADDER_SCENES = new Set(['explore', 'tension', 'suspense']);

export const slotInfo = (scene) => MUSIC_SLOTS.find((s) => s.id === scene) ?? EFFECT_SLOTS.find((s) => s.id === scene) ?? MILLIONAIRE_SLOTS.find((s) => s.id === scene);

const DB = 'concurso-musica';
const STORE = 'tracks';

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const result = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(result?.result ?? result);
    t.onerror = () => reject(t.error);
  });
}

export const isAudio = (f) => f.type?.startsWith('audio/') || /\.(mp3|m4a|ogg|wav|aac)$/i.test(f.name);

export class TrackStore extends EventTarget {
  /** slot → [{id, name, url}] */
  tracks = new Map();

  async load() {
    try {
      const all = await tx('readonly', (s) => s.getAll());
      for (const t of this.tracks.values()) t.forEach((x) => URL.revokeObjectURL(x.url));
      this.tracks.clear();
      // por nombre (con números en orden: «2 - …» antes que «10 - …»): así se controla el orden de la escalera
      for (const rec of all.sort((a, b) => a.name.localeCompare(b.name, 'es', { numeric: true }))) {
        if (!this.tracks.has(rec.slot)) this.tracks.set(rec.slot, []);
        this.tracks.get(rec.slot).push({ id: rec.id, name: rec.name, source: rec.source ?? null, blob: rec.blob, url: URL.createObjectURL(rec.blob) });
      }
    } catch (e) {
      console.warn('[música] no se pudieron leer las canciones guardadas', e);
    }
    this.dispatchEvent(new Event('change'));
  }

  /**
   * Añade canciones a un hueco. Los del millonario y las canciones de las pruebas («song:…») tienen una sola: la nueva sustituye a la que hubiera.
   * @param source 'carpeta' si vienen de la carpeta del concurso (al volver a leerla se sustituyen)
   */
  async add(slot, files, { source = null, reload = true } = {}) {
    const audio = [...files].filter(isAudio);
    if (!audio.length) return 0;
    const single = slot.startsWith('mill:') || slot.startsWith('song:'); // una canción por hueco
    const old = single ? (this.tracks.get(slot) ?? []).map((t) => t.id) : [];
    await tx('readwrite', (s) => {
      old.forEach((id) => s.delete(id));
      for (const f of single ? audio.slice(0, 1) : audio) s.put({ id: crypto.randomUUID(), slot, name: f.name.replace(/\.[^.]+$/, ''), blob: f, source, added: Date.now() });
    });
    if (reload) await this.load();
    return single ? 1 : audio.length;
  }

  /** Quita las canciones que vinieron de un sitio (la carpeta, antes de volver a leerla). */
  async removeSource(source, { reload = true } = {}) {
    const ids = [...this.tracks.values()].flat().filter((t) => t.source === source).map((t) => t.id);
    if (ids.length) await tx('readwrite', (s) => ids.forEach((id) => s.delete(id)));
    if (reload) await this.load();
  }

  async remove(id) {
    await tx('readwrite', (s) => s.delete(id));
    await this.load();
  }

  /** Resumen para pintar: slot → nombres */
  summary() {
    return Object.fromEntries([...this.tracks].map(([slot, list]) => [slot, list.map((t) => ({ id: t.id, name: t.name }))]));
  }
}
