// Carpeta del concurso (ver core/folder.js): se elige una vez y la tele recuerda dónde está (Chrome y Edge guardan el
// permiso para leerla; en otros navegadores hay que volver a elegirla). Al leerla, todo se copia a este portátil
// (IndexedDB), así que después funciona aunque la carpeta no esté; volver a leerla sustituye lo que vino de ella.
import { classifyFolder, songKey } from '../core/folder.js';
import { EFFECT_SLOTS, MUSIC_SLOTS, SECTION_SLOTS, videoSlot } from './fx/tracks.js';

const DB = 'concurso-carpeta';
const STORE = 'handles';
const SOURCE = 'carpeta';

function db() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function kv(mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(req?.result);
    t.onerror = () => reject(t.error);
  });
}

export const canRemember = typeof window !== 'undefined' && 'showDirectoryPicker' in window;

/** La carpeta recordada (o null). */
export async function savedFolder() {
  if (!canRemember) return null;
  try {
    return (await kv('readonly', (s) => s.get('carpeta'))) ?? null;
  } catch {
    return null;
  }
}

/** Todos los archivos de una carpeta (con sus subcarpetas): [{path, lastModified, file}] */
async function walk(dir, path = []) {
  const out = [];
  for await (const [name, handle] of dir.entries()) {
    if (handle.kind === 'directory') out.push(...(await walk(handle, [...path, name])));
    else {
      const file = await handle.getFile();
      out.push({ path: [...path, name], lastModified: file.lastModified, file });
    }
  }
  return out;
}

/** Elegir la carpeta (y recordarla). @returns {name, entries} o null si se cancela */
export async function chooseFolder() {
  if (canRemember) {
    let handle;
    try {
      handle = await window.showDirectoryPicker({ id: 'concurso', mode: 'read' });
    } catch {
      return null; // cancelado
    }
    await kv('readwrite', (s) => s.put(handle, 'carpeta'));
    return { name: handle.name, entries: await walk(handle) };
  }
  // Sin acceso a carpetas (Firefox, Safari): el selector clásico de carpeta, cada vez
  return new Promise((resolve) => {
    const input = Object.assign(document.createElement('input'), { type: 'file', webkitdirectory: true, multiple: true });
    input.addEventListener('change', () => {
      const files = [...input.files];
      if (!files.length) return resolve(null);
      const root = files[0].webkitRelativePath.split('/')[0];
      resolve({ name: root, entries: files.map((file) => ({ path: file.webkitRelativePath.split('/').slice(1), lastModified: file.lastModified, file })) });
    });
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });
}

/** Volver a leer la carpeta recordada (pide permiso si hace falta: tiene que ser tras un clic). */
export async function rereadFolder(handle) {
  let perm = await handle.queryPermission({ mode: 'read' });
  if (perm !== 'granted') perm = await handle.requestPermission({ mode: 'read' });
  if (perm !== 'granted') return null;
  return { name: handle.name, entries: await walk(handle) };
}

/**
 * Lo copia todo a su sitio. La hoja primero (así se conocen las secciones para su música).
 * @returns resumen {sheet, millionaire, faces, music, ignored}
 */
export async function importFolder({ entries }, { trackStore, faceStore, importSheet, sections }) {
  const classify = () => classifyFolder(entries, { slots: [...MUSIC_SLOTS, ...EFFECT_SLOTS], sectionSlots: [...SECTION_SLOTS, ...EFFECT_SLOTS.map((s) => s.id)], sections: sections() });
  let found = classify();
  if (found.sheet) {
    await importSheet(found.sheet.file);
    found = classify(); // ya con las secciones de la hoja
  }
  await trackStore.removeSource(SOURCE, { reload: false });
  for (const [track, e] of Object.entries(found.millionaire)) await trackStore.add(`mill:${track}`, [e.file], { source: SOURCE, reload: false });
  for (const { slot, entry } of found.music) await trackStore.add(slot, [entry.file], { source: SOURCE, reload: false });
  for (const e of found.songs) await trackStore.add(`song:${songKey(e.path.at(-1))}`, [e.file], { source: SOURCE, reload: false });
  for (const [kind, e] of Object.entries(found.squid)) await trackStore.add(`sq:${kind}`, [e.file], { source: SOURCE, reload: false });
  for (const { key, entry } of found.videos) await trackStore.add(videoSlot(key), [entry.file], { source: SOURCE, reload: false });
  await trackStore.load();
  await faceStore.removeSource(SOURCE);
  if (found.faces.length) await faceStore.add(found.faces.map((e) => e.file), { source: SOURCE });
  else await faceStore.load();
  return {
    sheet: found.sheet?.path.at(-1) ?? null,
    millionaire: Object.keys(found.millionaire).length,
    faces: found.faces.length,
    music: found.music.length,
    songs: found.songs.length,
    squid: Object.keys(found.squid).length,
    videos: found.videos.length,
    ignored: found.ignored,
  };
}
