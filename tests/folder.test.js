import { describe, expect, it } from 'vitest';
import { classifyFolder, folderKey, sectionWideSlot, songKey, squidSoundFor } from '../src/core/folder.js';

const slots = [
  { id: 'lobby', label: 'Preparación' },
  { id: 'march', label: 'Marcador' },
  { id: 'sfx:lock', label: 'Respuesta definitiva' },
];
const e = (path, lastModified = 0) => ({ path: path.split('/'), lastModified });

describe('carpeta del concurso', () => {
  it('compara nombres sin tildes, mayúsculas ni signos', () => {
    expect(folderKey('Música')).toBe('musica');
    expect(folderKey('Respuesta  definitiva!')).toBe('respuestadefinitiva');
  });

  it('reparte cada archivo por su sitio', () => {
    const r = classifyFolder(
      [
        e('concurso viejo.xlsx', 1),
        e('Concurso 2026.xlsx', 5),
        e('~$Concurso 2026.xlsx', 9),
        e('Millonario/Música pregunta fácil.mp3'),
        e('Millonario/Música  pregunta difícil.mp3'),
        e('Millonario/Llamar a alguien.mp3'),
        e('millonario/notas.txt'),
        e('Caras/Rodri, Rodrigo.jpg'),
        e('caras/Ana.PNG'),
        e('Caras/desktop.ini'),
        e('Música/Preparación/swing.mp3'),
        e('MUSICA/marcador/1 - marcha.mp3'),
        e('Música/Halloween total/Respuesta definitiva/golpe.mp3'),
        e('Música/Halloween total/Preparación/no vale aquí.mp3'),
        e('Música/Otra sección/Marcador/x.mp3'),
        e('Música/Nada/x.mp3'),
        e('Canciones/Propuesta Indecente.mp3'),
        e('canciones/letra.txt'),
      ],
      { slots, sectionSlots: ['march', 'sfx:lock'], sections: ['Halloween total'] },
    );
    expect(r.sheet.path).toEqual(['Concurso 2026.xlsx']);
    expect(Object.keys(r.millionaire).sort()).toEqual(['call', 'easy', 'hard']);
    expect(r.faces.map((f) => f.path.at(-1))).toEqual(['Rodri, Rodrigo.jpg', 'Ana.PNG']);
    expect(r.music.map((m) => m.slot)).toEqual(['lobby', 'march', 'Halloween total|sfx:lock']);
    expect(r.songs.map((x) => songKey(x.path.at(-1)))).toEqual(['propuestaindecente']);
    expect(songKey('propuesta indecente')).toBe('propuestaindecente'); // así se escribe en la hoja (sin .mp3, da igual)
    expect(r.ignored).toEqual(['millonario/notas.txt', 'Música/Halloween total/Preparación/no vale aquí.mp3', 'Música/Otra sección/Marcador/x.mp3', 'Música/Nada/x.mp3', 'canciones/letra.txt']);
  });

  it('una canción suelta en la carpeta de una sección suena en toda ella', () => {
    const e = (path) => ({ path: path.split('/'), lastModified: 1 });
    const r = classifyFolder([e('Música/Watermelon Sugar/sandia.mp3'), e('Música/Watermelon Sugar/Revelado/fin.mp3'), e('Música/Nadie/x.mp3')], {
      slots: [{ id: 'reveal', label: 'Revelado' }],
      sectionSlots: ['reveal'],
      sections: ['Watermelon Sugar'],
    });
    expect(r.music.map((m) => m.slot)).toEqual([sectionWideSlot('Watermelon Sugar'), 'Watermelon Sugar|reveal']);
    expect(r.ignored).toEqual(['Música/Nadie/x.mp3']);
  });

  it('las partes de una sección valen con otros nombres («En marcha», «Ganador»…)', () => {
    const e = (path) => ({ path: path.split('/'), lastModified: 1 });
    const slots = [
      { id: 'tension', label: 'Pregunta abierta', aliases: ['En marcha'] },
      { id: 'reveal', label: 'Revelado', aliases: ['Ganador'] },
    ];
    const r = classifyFolder([e('Música/La galleta/En marcha/a.mp3'), e('Música/La galleta/Ganador/b.mp3'), e('Música/En marcha/c.mp3')], { slots, sectionSlots: ['tension', 'reveal'], sections: ['La galleta'] });
    expect(r.music.map((m) => m.slot)).toEqual(['La galleta|tension', 'La galleta|reveal', 'tension']);
  });

  it('vídeos de una sección: por el nombre del archivo o de su subcarpeta', () => {
    const e = (path) => ({ path: path.split('/'), lastModified: 1 });
    const r = classifyFolder([e('Vídeos/Twerking de pimpón.mp4'), e('Vídeos/La galleta/esqueleto.webm'), e('Vídeos/notas.txt')]);
    expect(r.videos.map((v) => v.key)).toEqual(['twerkingdepimpon', 'lagalleta']);
    expect(r.ignored).toEqual(['Vídeos/notas.txt']);
  });

  it('sonidos de Squid Games: en su carpeta o sueltos en Música, por el nombre', () => {
    const e = (path) => ({ path: path.split('/'), lastModified: 1 });
    const r = classifyFolder([e('Música/Heart Beat.mp3'), e('Música/Glass Breeaking.m4a'), e('Squid/Muñeca gira.mp3'), e('Squid/muñeca canta.mp3'), e('Squid/Respiración.m4a'), e('Música/raro.mp3')]);
    expect(Object.keys(r.squid).sort()).toEqual(['breath', 'doll', 'glass', 'heart', 'turn']);
    expect(r.ignored).toEqual(['Música/raro.mp3']);
    expect([squidSoundFor('Coins Drop.mp3'), squidSoundFor('Electronic Bell.mp3'), squidSoundFor('Rope Snap Swish.mp3'), squidSoundFor('Breathing Sound Effect.m4a')]).toEqual(['coins', 'bell', 'rope', 'breath']);
    // si canta, es la canción aunque traiga detrás el giro de la cabeza
    expect([squidSoundFor('Girl Doll Singing And Head Turning.m4a'), squidSoundFor('Muñeca gira.mp3'), squidSoundFor('Adivina Canción n1.aac')]).toEqual(['doll', 'turn', null]);
  });
});
