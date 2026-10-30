// La plantilla publicada (public/plantilla-concurso.xlsx, generada con `npm run plantilla`) debe leerse sin errores.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import readXlsxFile from 'read-excel-file/node';
import { SECTION_TYPES, parseShowWorkbook } from '../src/core/show.js';

const FILE = resolve(import.meta.dirname, '../public/plantilla-concurso.xlsx');

describe('plantilla del concurso', () => {
  it('se lee sin errores ni avisos y trae todos los tipos de sección', async () => {
    const sheets = await readXlsxFile(readFileSync(FILE));
    const { show, errors, warnings } = parseShowWorkbook(sheets);
    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
    expect(new Set(show.sections.map((s) => s.type))).toEqual(new Set(Object.keys(SECTION_TYPES)));
    // Las pruebas que pidió el presentador
    for (const name of ['Guerra de globos', 'Twerking de pimpón', 'La galleta', 'Botellas en orden', 'Marca el golpe', '¿Qué canción es?']) {
      expect(show.sections.map((s) => s.name)).toContain(name);
    }
    // Los que quitamos siguen en la hoja, pero empiezan sin marcar («Se juega: No»)
    expect(show.sections.filter((s) => !s.play).map((s) => s.name)).toEqual(['Calentamiento', '¿Verdad o mentira?', 'Calcula']);
    // Lobos contra vampiros: el primer equipo son los lobos y el segundo, los vampiros
    expect(show.teams.map((t) => [t.name, t.color])).toEqual([
      ['Hombres lobo', 'azul'],
      ['Vampiros', 'rojo'],
    ]);
    expect(show.sections.find((s) => s.type === 'panuelo')).toMatchObject({ name: 'Lobos contra vampiros', points: [10], env: 'lunallena', presenterPlays: true });
    // Ya no hay silla invisible, ni canicas en Squid; el twerking va en la discoteca
    expect(show.sections.find((s) => s.name === 'Fit o Fat').items.map((i) => i.title)).not.toContain('La silla invisible');
    expect(show.sections.find((s) => s.type === 'squid').items.map((i) => i.game)).toEqual(['luzroja', 'panal', 'cuerda', 'puente', 'hucha']);
    expect(show.sections.find((s) => s.name === 'Twerking de pimpón').env).toBe('discoteca');
    // Temáticas: la sandía en verano, la galleta en el obrador, las botellas entre refrescos (y se elige quién sale)
    expect(show.sections.find((s) => s.name === 'Watermelon Sugar')).toMatchObject({ type: 'libre', env: 'verano' });
    expect(show.sections.find((s) => s.name === 'La galleta').env).toBe('chocolate');
    const bottles = show.sections.find((s) => s.name === 'Botellas en orden');
    expect(bottles.env).toBe('refrescos');
    expect(bottles.items[0].teams).toBeFalsy();
    for (const s of show.sections) expect(s.items.length, s.name).toBeGreaterThan(0);
  });
});
