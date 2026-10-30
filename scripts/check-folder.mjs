// Comprueba la carpeta del concurso con el mismo reparto que hace la tele al leerla (core/folder.js): qué hoja usa, qué
// canción va a cada momento (general o de una sección), Squid, vídeos, caras… y qué archivos se quedan sin usar. Uso:
//   node scripts/check-folder.mjs "../Concurso del año - archivos"
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import readXlsxFile from 'read-excel-file/node';
import { parseShowWorkbook } from '../src/core/show.js';
import { classifyFolder } from '../src/core/folder.js';
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
let sections = [];
if (found.sheet) {
  sections = parseShowWorkbook(await readXlsxFile(readFileSync(found.sheet.full))).show.sections.map((s) => ({ name: s.name, items: s.items.map((it) => it.title).filter(Boolean) }));
  found = classifyFolder(entries, opts(sections)); // ya con las secciones (para su música)
}
console.log(`Hoja: ${found.sheet?.path.join('/') ?? '(ninguna)'} · ${sections.length} secciones`);
console.log(`Millonario: ${Object.keys(found.millionaire).join(', ') || '—'}`);
console.log(`Caras: ${found.faces.length} · Canciones de las pruebas: ${found.songs.length} · Vídeos: ${found.videos.map((v) => v.key).join(', ') || '—'}`);
console.log(`Squid: ${Object.entries(found.squid).map(([k, e]) => `${k}=${e.path.at(-1)}`).join(' · ') || '—'}`);
console.log('Música:');
for (const m of found.music) console.log(`  ${m.slot.padEnd(34)} ${m.entry.path.join('/')}`);
console.log(`Sin usar (${found.ignored.length}):`);
for (const p of found.ignored) console.log(`  ${p}`);
