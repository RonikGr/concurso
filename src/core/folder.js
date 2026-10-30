// Carpeta del concurso: una carpeta del portátil con todo lo que no va en el repositorio (que es público). La tele la
// lee de una vez y reparte cada archivo por su sitio y su nombre:
//
//   Carpeta del concurso/
//     concurso.xlsx                     la hoja (si hay varias, la más reciente)
//     Millonario/   las 7 canciones del programa, reconocidas por el nombre («Música pregunta fácil.mp3»…)
//     Caras/        una foto por persona, con sus nombres en el del archivo («Rodri, Rodrigo.jpg»)
//     Música/<Momento>/…mp3             canciones para todo el concurso («Música/Marcador/…»)
//     Música/<Sección>/<Momento>/…mp3   solo para una sección (su nombre en la hoja)
//     Música/<Sección>/…mp3             suelta: suena en toda la sección (salvo en los momentos que tengan la suya)
//     Música/<Sección>/<Juego>/…mp3     la de un juego de una prueba Libre («Fit o Fat/Flexiones»): suena desde el
//                                       «¡ya!» hasta que se para, como la columna «Canción» (una por juego)
//     Canciones/…mp3    las de las pruebas (también en subcarpetas: «Adivina la canción», «Marcar el golpe»);
//                       la hoja las nombra por su archivo
//     Squid/…mp3        sonidos de Squid Games, reconocidos por el nombre (latido, respiración, cristal…: ver
//                       SQUID_SOUNDS); también valen sueltos en Música/
//     Vídeos/<Sección>.mp4  (o Vídeos/<Sección>/…mp4) un vídeo que la tele pone en esa sección (su presentación y
//                       sus pruebas); con fondo negro, el negro se vuelve transparente
//     Vídeos/<Sección>/Presentación/…mkv  el vídeo de presentación de la sección: grande y con su sonido, una vez
//     Música/Squid Games/<Juego>/…mp3     la de un juego de Squid («Tira y afloja», «Luz roja»…: SQUID_GAME_FOLDERS)
//
// Los momentos se escriben como en la ventana de música («Preparación», «Jugando», «Respuesta definitiva»…).
import { millionaireTrackFor } from './millionaireMusic.js';

export const FOLDER_NAMES = { millionaire: 'Millonario', faces: 'Caras', music: 'Música', songs: 'Canciones', squid: 'Squid', videos: 'Vídeos' };

/**
 * Sonidos de Squid Games y las palabras de su nombre de archivo que los reconocen (en este orden: si canta, es la
 * canción aunque traiga detrás el giro, «Doll singing and head turning»; «muñeca gira», sin cantar, es el giro). Sin
 * ellos, la tele los genera.
 */
export const SQUID_SOUNDS = [
  ['doll', ['canta', 'singing', 'sings', 'mugunghwa', 'younghee']],
  ['turn', ['gira', 'giro', 'turn', 'cabeza', 'head']],
  ['doll', ['muneca', 'doll']],
  ['heart', ['latido', 'corazon', 'heart']],
  ['breath', ['respira', 'breath', 'jadeo']],
  ['glass', ['cristal', 'glass', 'vidrio']],
  ['coins', ['moneda', 'coin', 'dinero', 'money', 'hucha']],
  ['bell', ['campana', 'bell', 'megafon', 'chime', 'timbre', 'aviso']],
  ['rope', ['cuerda', 'rope', 'soga']],
  ['out', ['eliminad', 'disparo', 'shot', 'gun']],
  ['theme', ['tema', 'theme', 'wayback']],
  ['tension', ['tension', 'pinksoldier', 'soldado']],
  ['waltz', ['vals', 'danubio', 'waltz', 'danube']],
];

/** Qué sonido de Squid Games es un archivo, por su nombre (o null). */
export function squidSoundFor(name) {
  const key = folderKey(String(name).replace(/\.[^.]+$/, ''));
  return SQUID_SOUNDS.find(([, words]) => words.some((w) => key.includes(w)))?.[0] ?? null;
}

/** Hueco de la canción de toda una sección (`Música/<Sección>/cancion.mp3`): suena en todos sus momentos. */
export const sectionWideSlot = (section) => `${section}|all`;

/**
 * Clave de la canción de un juego (`Música/<Sección>/<Juego>/`): va con las de las pruebas («song:…») y suena como
 * la columna «Canción» de ese juego.
 */
export const itemSongKey = (section, title) => `juego-${folderKey(section)}-${folderKey(title)}`;

/** Para comparar nombres de carpeta: sin tildes, mayúsculas, espacios ni signos. */
export const folderKey = (s) =>
  String(s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');

const AUDIO = /\.(mp3|m4a|ogg|wav|aac)$/i;

/** Clave de una canción de las pruebas: su nombre de archivo (sin extensión, tildes ni mayúsculas). */
export const songKey = (name) => folderKey(String(name ?? '').replace(AUDIO, ''));
const IMAGE = /\.(jpe?g|png|webp|gif|heic|avif)$/i;
export const VIDEO = /\.(mp4|webm|mov|m4v|mkv)$/i;
/** Subcarpeta de `Vídeos/<Sección>/` con el vídeo de presentación (con sonido). */
const INTRO_FOLDERS = ['presentacion', 'intro'];

/**
 * Carpetas de los juegos de Squid Games dentro de la de su sección (`Música/Squid Games/<Juego>/`) y los nombres que
 * valen para cada uno. Su canción suena mientras corre ese juego (como la de cada prueba de Libre).
 */
export const SQUID_GAME_FOLDERS = {
  luzroja: ['Luz roja', 'Luz roja, luz verde', 'Luz verde'],
  panal: ['Panal', 'El panal', 'Galleta', 'Galletas', 'Dalgona'],
  puente: ['Puente', 'Puente de cristal', 'El puente de cristal', 'Cristales'],
  cuerda: ['Tira y afloja', 'Cuerda', 'Soga'],
  canicas: ['Canicas'],
};

/** Qué juego de Squid es el nombre de una carpeta (o null). */
export function squidGameFor(name) {
  const key = folderKey(name);
  return Object.entries(SQUID_GAME_FOLDERS).find(([id, names]) => id === key || names.some((n) => folderKey(n) === key))?.[0] ?? null;
}
const JUNK = /^(\.|~\$|desktop\.ini$|thumbs\.db$)/i;

/**
 * @param entries [{path: ['Millonario', 'x.mp3'], lastModified}] (rutas dentro de la carpeta, sin ella)
 * @param slots huecos de la ventana de música [{id, label}] (generales y efectos)
 * @param sectionSlots ids de los huecos que puede tener una sección
 * @param sections secciones del concurso cargado: nombres, o {name, items: [nombre de cada juego]} (para las carpetas
 *   de cada juego)
 * @returns {sheet, millionaire: {track: entry}, faces: [entry], music: [{slot, entry}], songs: [entry], squid: {kind: entry},
 *   videos: [{key, entry, intro}] (key = folderKey de la sección; intro = el de su presentación, con sonido),
 *   ignored: [ruta]}
 */
export function classifyFolder(entries, { slots = [], sectionSlots = [], sections = [] } = {}) {
  const out = { sheet: null, millionaire: {}, faces: [], music: [], songs: [], squid: {}, videos: [], ignored: [] };
  // (por su nombre en la ventana de música, su clave u otros nombres que se entienden mejor en algunos juegos)
  const slotOf = (name) => slots.find((s) => [s.label, s.id, ...(s.aliases ?? [])].some((n) => folderKey(n) === folderKey(name)));
  const secs = sections.map((s) => (typeof s === 'string' ? { name: s, items: [] } : { name: s.name, items: s.items ?? [], type: s.type ?? null }));
  const sectionOf = (name) => secs.find((s) => folderKey(s.name) === folderKey(name))?.name;
  const itemOf = (section, name) => secs.find((s) => s.name === section)?.items.find((t) => folderKey(t) === folderKey(name));
  // juego de Squid (sin saber el tipo de la sección, vale en cualquiera: sus nombres no chocan con las pruebas)
  const squidOf = (section, name) => {
    const type = secs.find((s) => s.name === section)?.type;
    return !type || type === 'squid' ? squidGameFor(name) : null;
  };
  for (const e of entries) {
    const name = e.path.at(-1);
    if (e.path.some((p) => JUNK.test(p))) continue;
    const top = folderKey(e.path[0]);
    const rest = e.path.slice(1);
    let used = false;
    if (e.path.length === 1 && /\.xlsx$/i.test(name)) {
      if (!out.sheet || (e.lastModified ?? 0) > (out.sheet.lastModified ?? 0)) out.sheet = e;
      used = true;
    } else if (top === folderKey(FOLDER_NAMES.millionaire) && AUDIO.test(name)) {
      const track = millionaireTrackFor(name);
      if (track && !out.millionaire[track]) {
        out.millionaire[track] = e;
        used = true;
      }
    } else if (top === folderKey(FOLDER_NAMES.songs) && AUDIO.test(name)) {
      out.songs.push(e);
      used = true;
    } else if (top === folderKey(FOLDER_NAMES.videos) && VIDEO.test(name) && (rest.length <= 2 || (rest.length === 3 && INTRO_FOLDERS.includes(folderKey(rest[1]))))) {
      // el de la sección: por el nombre del archivo o por su subcarpeta; en «<Sección>/Presentación/», el de su presentación
      const intro = rest.length === 3;
      const key = folderKey(rest.length >= 2 ? rest[0] : name.replace(VIDEO, ''));
      if (!out.videos.some((v) => v.key === key && v.intro === intro)) {
        out.videos.push({ key, entry: e, intro });
        used = true;
      }
    } else if (top === folderKey(FOLDER_NAMES.faces) && IMAGE.test(name)) {
      out.faces.push(e);
      used = true;
    } else if ((top === folderKey(FOLDER_NAMES.squid) || (top === folderKey(FOLDER_NAMES.music) && rest.length === 1)) && AUDIO.test(name)) {
      // Squid Games (en su carpeta, o suelto en Música/)
      const kind = squidSoundFor(name);
      if (kind && !out.squid[kind]) {
        out.squid[kind] = e;
        used = true;
      }
    } else if (top === folderKey(FOLDER_NAMES.music) && AUDIO.test(name)) {
      if (rest.length === 2) {
        const slot = slotOf(rest[0]);
        const section = slot ? null : sectionOf(rest[0]);
        if (slot) {
          out.music.push({ slot: slot.id, entry: e });
          used = true;
        } else if (section) {
          // suelta en la carpeta de una sección: suena en toda ella (presentación, jugando, revelado…)
          out.music.push({ slot: sectionWideSlot(section), entry: e });
          used = true;
        }
      } else if (rest.length === 3) {
        const section = sectionOf(rest[0]);
        const slot = slotOf(rest[1]);
        const item = section && !slot ? (itemOf(section, rest[1]) ?? squidOf(section, rest[1])) : null;
        if (section && slot && sectionSlots.includes(slot.id)) {
          out.music.push({ slot: `${section}|${slot.id}`, entry: e });
          used = true;
        } else if (item) {
          // la de un juego: una sola (si hay más, sobran)
          const songSlot = `song:${itemSongKey(section, item)}`;
          if (!out.music.some((m) => m.slot === songSlot)) {
            out.music.push({ slot: songSlot, entry: e });
            used = true;
          }
        }
      }
    }
    if (!used) out.ignored.push(e.path.join('/'));
  }
  return out;
}
