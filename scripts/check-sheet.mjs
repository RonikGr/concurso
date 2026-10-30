// Comprueba una hoja del concurso con el mismo lector que la tele: errores, avisos, equipos y cada sección (tipo,
// puntos, entorno, cuántas filas y, en Libre y Squid, sus pruebas). Uso:
//   node scripts/check-sheet.mjs "../Concurso del año - archivos/plantilla-concurso Prueba 1.xlsx"
import { readFileSync } from 'node:fs';
import readXlsxFile from 'read-excel-file/node';
import { parseShowWorkbook } from '../src/core/show.js';

const file = process.argv[2];
if (!file) {
  console.error('Uso: node scripts/check-sheet.mjs <hoja.xlsx>');
  process.exit(1);
}
const { show, errors, warnings } = parseShowWorkbook(await readXlsxFile(readFileSync(file)));
for (const e of errors) console.log(`❌ ${e.sheet}${e.row ? ` fila ${e.row}` : ''}: ${e.message}`);
for (const w of warnings) console.log(`⚠️ ${w.sheet}${w.row ? ` fila ${w.row}` : ''}: ${w.message}`);
console.log(`${errors.length} errores · ${warnings.length} avisos`);
console.log(`Equipos: ${show.teams.map((t) => `${t.name} (${t.color})`).join(', ') || 'sin equipos'}`);
for (const s of show.sections) {
  const detail =
    s.type === 'squid'
      ? s.items.map((i) => `${i.game}${i.seconds ? `:${i.seconds}s` : ''}`).join(' ')
      : s.type === 'libre'
        ? s.items.map((i) => `${i.title} [${i.tool}${i.teams ? ', equipos' : ''}]`).join(' · ')
        : `${s.items.length} filas`;
  console.log(`${s.play === false ? '·' : '✓'} ${s.name} — ${s.type} · puntos ${s.points.join(',')}${s.env ? ` · ${s.env}` : ''} · ${detail}`);
}
