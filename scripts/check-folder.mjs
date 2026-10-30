// Comprueba la carpeta del concurso con el mismo reparto que hace la tele al leerla (core/folder.js): qué hoja usa, qué
// canción va a cada momento (general o de una sección), Squid, vídeos, caras… y qué archivos se quedan sin usar. Al
// final, un resumen por sección: su canción, la de cada juego y el vídeo de presentación. Uso:
//   node scripts/check-folder.mjs "../Concurso del año - archivos"
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import readXlsxFile from 'read-excel-file/node';
import { parseShowWorkbook } from '../src/core/show.js';
import { SQUID_GAMES, SQUID_ORDER } from '../src/core/squid.js';
import { classifyFolder, folderKey, itemSongKey, sectionWideSlot, songKey } from '../src/core/folder.js';
import { EFFECT_SLOTS, MUSIC_SLOTS, SECTION_SLOTS } from '../src/host/fx/tracks.js';

const root = process.argv[2];
if (!root) {
  console.error('Uso: node scripts/check-folder.mjs <carpeta del concurso>');
  process.exit(1);
}
const entries = [];
const walk = (dir, path = []) => {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, [...path, name]);
    else entries.push({ path: [...path, name], lastModified: st.mtimeMs, full });
  }
};
walk(root);

const opts = (sections) => ({ slots: [...MUSIC_SLOTS, ...EFFECT_SLOTS], sectionSlots: [...SECTION_SLOTS, ...EFFECT_SLOTS.map((s) => s.id)], sections });
let found = classifyFolder(entries, opts([]));
let show = null;
let sections = [];
if (found.sheet) {
  show = parseShowWorkbook(await readXlsxFile(readFileSync(found.sheet.full))).show;
  sections = show.sections.map((s) => ({ name: s.name, type: s.type, items: s.items.map((it) => it.title).filter(Boolean) }));
  found = classifyFolder(entries, opts(sections)); // ya con las secciones (para su música)
}
console.log(`Hoja: ${found.sheet?.path.join('/') ?? '(ninguna)'} · ${sections.length} secciones`);
console.log(`Millonario: ${Object.keys(found.millionaire).join(', ') || '—'}`);
console.log(`Caras: ${found.faces.length} · Canciones de las pruebas: ${found.songs.length} · Vídeos: ${found.videos.map((v) => (v.intro ? `${v.key} (presentación)` : v.key)).join(', ') || '—'}`);
console.log(`Squid: ${Object.entries(found.squid).map(([k, e]) => `${k}=${e.path.at(-1)}`).join(' · ') || '—'}`);
console.log('Música:');
for (const m of found.music) console.log(`  ${m.slot.padEnd(34)} ${m.entry.path.join('/')}`);
console.log(`Sin usar (${found.ignored.length}):`);
for (const p of found.ignored) console.log(`  ${p}`);

// Resumen por sección (lo que pidió Rodri: una canción por sección y otra por juego)
if (show) {
  const slots = new Set(found.music.map((m) => m.slot));
  const songs = new Set(found.songs.map((e) => songKey(e.path.at(-1))));
  const videos = (key, intro) => found.videos.some((v) => v.key === key && v.intro === intro);
  console.log('Por sección (✓ = hay canción; juegos = con canción / juegos):');
  for (const s of show.sections) {
    const games = [];
    if (s.type === 'squid') for (const g of [...SQUID_ORDER, 'canicas']) games.push([SQUID_GAMES[g].label, slots.has(`song:${itemSongKey(s.name, g)}`)]);
    else
      for (const it of s.items) {
        if (it.song) games.push([it.title || it.song, songs.has(songKey(it.song))]);
        else if (s.type === 'libre' && it.title) games.push([it.title, slots.has(`song:${itemSongKey(s.name, it.title)}`)]);
      }
    const parts = [`sección ${slots.has(sectionWideSlot(s.name)) ? '✓' : '—'}`];
    if (games.length) parts.push(`juegos ${games.filter(([, ok]) => ok).length}/${games.length}`);
    if (videos(folderKey(s.name), true)) parts.push('vídeo de presentación ✓');
    if (videos(folderKey(s.name), false)) parts.push('vídeo a los lados ✓');
    const off = s.play === false ? ' (no se juega)' : '';
    console.log(`  ${s.name}${off}: ${parts.join(' · ')}`);
    const missing = games.filter(([, ok]) => !ok).map(([t]) => t);
    if (missing.length && missing.length < games.length) console.log(`      sin canción: ${missing.join(', ')}`);
  }
}
