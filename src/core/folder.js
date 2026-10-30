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
//     Canciones/…mp3    las de las pruebas (también en subcarpetas: «Adivina la canción», «Marcar el golpe»);
//                       la hoja las nombra por su archivo
//     Squid/…mp3        sonidos de Squid Games, reconocidos por el nombre (latido, respiración, cristal…: ver
//                       SQUID_SOUNDS); también valen sueltos en Música/
//     Vídeos/<Sección>.mp4  (o Vídeos/<Sección>/…mp4) un vídeo que la tele pone en esa sección (su presentación y
//                       sus pruebas); con fondo negro, el negro se vuelve transparente
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
export const VIDEO = /\.(mp4|webm|mov|m4v)$/i;
const JUNK = /^(\.|~\$|desktop\.ini$|thumbs\.db$)/i;

/**
 * @param entries [{path: ['Millonario', 'x.mp3'], lastModified}] (rutas dentro de la carpeta, sin ella)
 * @param slots huecos de la ventana de música [{id, label}] (generales y efectos)
 * @param sectionSlots ids de los huecos que puede tener una sección
 * @param sections nombres de las secciones del concurso cargado
 * @returns {sheet, millionaire: {track: entry}, faces: [entry], music: [{slot, entry}], songs: [entry], squid: {kind: entry},
 *   videos: [{key, entry}] (key = folderKey de la sección), ignored: [ruta]}
 */
export function classifyFolder(entries, { slots = [], sectionSlots = [], sections = [] } = {}) {
  const out = { sheet: null, millionaire: {}, faces: [], music: [], songs: [], squid: {}, videos: [], ignored: [] };
  const slotOf = (name) => slots.find((s) => folderKey(s.label) === folderKey(name) || folderKey(s.id) === folderKey(name));
  const sectionOf = (name) => sections.find((s) => folderKey(s) === folderKey(name));
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
    } else if (top === folderKey(FOLDER_NAMES.videos) && VIDEO.test(name) && rest.length <= 2) {
      // el de la sección: por el nombre del archivo, o por su subcarpeta
      const key = folderKey(rest.length === 2 ? rest[0] : name.replace(VIDEO, ''));
      if (!out.videos.some((v) => v.key === key)) {
        out.videos.push({ key, entry: e });
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
        if (section && slot && sectionSlots.includes(slot.id)) {
          out.music.push({ slot: `${section}|${slot.id}`, entry: e });
          used = true;
        }
      }
    }
    if (!used) out.ignored.push(e.path.join('/'));
  }
  return out;
}
