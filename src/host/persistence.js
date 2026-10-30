// Estado del presentador en localStorage para sobrevivir a una recarga de la página.
import { loadJSON, removeKey, saveJSON } from '../shared/storage.js';
import { isValidRoomCode } from '../shared/roomCode.js';

const KEY = 'concurso.host.v2';
const MAX_AGE_MS = 12 * 60 * 60 * 1000;
const PAUSED_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000; // en pausa (para seguir otro día): un año
const FILE_KIND = 'concurso-del-ano/partida';

const isRoom = (saved) => !!saved && isValidRoomCode(saved.code) && Array.isArray(saved.players);

/** Sala guardada si existe y no ha caducado (12 h; en pausa, un año); si no, `null`. */
export function loadSavedRoom(nowMs = Date.now()) {
  const saved = loadJSON(KEY);
  if (!isRoom(saved)) return null;
  if (!(nowMs - saved.savedAt < (saved.paused ? PAUSED_MAX_AGE_MS : MAX_AGE_MS))) return null;
  return saved;
}

/** Copia de la partida en un archivo (para seguirla en otro ordenador o por si se borra el navegador). */
export function roomToFile(saved) {
  return new Blob([JSON.stringify({ kind: FILE_KIND, version: 1, room: saved })], { type: 'application/json' });
}

/** Lee una copia guardada con roomToFile: la sala, o null si el archivo no es una partida. */
export function roomFromFile(text) {
  try {
    const data = JSON.parse(text);
    return data?.kind === FILE_KIND && isRoom(data.room) ? data.room : null;
  } catch {
    return null;
  }
}

/** Lo guardado ahora (sin mirar si caducó), para la copia en archivo. */
export function currentSavedRoom() {
  const saved = loadJSON(KEY);
  return isRoom(saved) ? saved : null;
}

/**
 * @param data {code, controlSecret, approvedControls, show, runner, players, teamsLocked, teamBonus, settings,
 *   itemResults (lo jugado por pregunta; el millonario también a medias), steps {rulesFor, versus, punish, roulette}
 *   (pasos de la portada, «Cómo se juega» y la ruleta), faceOverrides {playerId: faceId|null} (caras puestas a mano)…}
 */
export function saveRoom(data) {
  saveJSON(KEY, { ...data, savedAt: Date.now() });
}

/** Pone como guardada una sala abierta desde un archivo (la tele la recupera como si fuera suya). */
export function adoptSavedRoom(saved) {
  saveJSON(KEY, { ...saved, savedAt: Date.now() });
}

export function clearSavedRoom() {
  removeKey(KEY);
}
