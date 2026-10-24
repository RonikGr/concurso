// La plantilla publicada (public/plantilla-concurso.xlsx, generada con `npm run plantilla`) debe leerse sin errores.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import readXlsxFile from 'read-excel-file/node';
import { SECTION_TYPES, parseShowWorkbook } from '../src/core/show.js';

const FILE = resolve(import.meta.dirname, '../public/plantilla-concurso.xlsx');

describe('plantilla del concurso', () => {
  it('se lee sin errores ni avisos y trae una pestaña de cada tipo de sección', async () => {
    const sheets = await readXlsxFile(readFileSync(FILE));
    const { show, errors, warnings } = parseShowWorkbook(sheets);
    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
    // Cada tipo tiene su pestaña con ejemplos (aunque esta noche no se juegue: sus filas quedan de reserva)
    for (const t of Object.values(SECTION_TYPES)) expect(sheets.map((x) => x.sheet), t.label).toContain(t.sheet);
    // Las pruebas que pidió el presentador
    for (const name of ['Guerra de globos', 'Twerking de pimpón', 'La galleta', 'Botellas en orden', 'Bachata: marca el golpe', '¿Qué canción es?']) {
      expect(show.sections.map((s) => s.name)).toContain(name);
    }
    expect(show.sections.map((s) => s.name)).not.toContain('Calentamiento');
    expect(show.teams.map((t) => t.color)).toEqual(['rojo', 'azul']);
    for (const s of show.sections) expect(s.items.length, s.name).toBeGreaterThan(0);
  });
});
