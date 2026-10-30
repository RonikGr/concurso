import { describe, expect, it } from 'vitest';
import { assignFaces, matchFace, namesFromFileName, setFaceOverride } from '../src/core/faces.js';

describe('caras de los jugadores', () => {
  it('saca los nombres del nombre del archivo', () => {
    expect(namesFromFileName('Rodri, Rodrigo.jpg')).toEqual(['Rodri', 'Rodrigo']);
    expect(namesFromFileName('mamá_mama;Mami.PNG')).toEqual(['mamá', 'mama', 'Mami']);
    expect(namesFromFileName('Ana María - Anita.jpeg')).toEqual(['Ana María', 'Anita']);
  });
  it('reconoce el nombre sin importar mayúsculas, tildes ni espacios', () => {
    const faces = [
      { id: 'f1', names: ['Rodri', 'Rodrigo'] },
      { id: 'f2', names: ['Mamá'] },
    ];
    expect(matchFace('RODRIGO', faces)).toBe('f1');
    expect(matchFace('  mama ', faces)).toBe('f2');
    expect(matchFace('Rodri (2)', faces)).toBeNull(); // un repetido no se lleva la cara
    expect(matchFace('', faces)).toBeNull();
  });
});

describe('caras puestas a mano', () => {
  const faces = [
    { id: 'f1', names: ['Sergio F'] },
    { id: 'f2', names: ['Sergio P'] },
    { id: 'f3', names: ['Paula'] },
  ];
  const players = [
    { id: 'a', name: 'Sergio' },
    { id: 'b', name: 'Paula' },
    { id: 'c', name: 'Sergio P' },
  ];

  it('sin nada a mano, por el nombre', () => {
    expect(Object.fromEntries(assignFaces(players, faces))).toEqual({ a: null, b: 'f3', c: 'f2' });
  });

  it('la de a mano manda, y esa cara ya no se reparte por nombre a otro', () => {
    let o = setFaceOverride(new Map(), 'a', 'f2');
    expect(Object.fromEntries(assignFaces(players, faces, o))).toEqual({ a: 'f2', b: 'f3', c: null });
    o = setFaceOverride(o, 'b', null); // quitarla aunque el nombre case
    expect(assignFaces(players, faces, o).get('b')).toBeNull();
    // una cara que no está cargada no vale: vuelve la del nombre
    expect(assignFaces(players, faces, new Map([['b', 'f9']])).get('b')).toBe('f3');
    // la de alguien que ya no está en la sala no aparta la cara
    expect(assignFaces(players, faces, new Map([['zz', 'f3']])).get('b')).toBe('f3');
  });

  it('una cara es de uno: ponérsela a otro se la quita al primero', () => {
    let o = setFaceOverride(new Map(), 'a', 'f2');
    o = setFaceOverride(o, 'c', 'f2');
    expect(o.has('a')).toBe(false);
    expect(Object.fromEntries(assignFaces(players, faces, o))).toEqual({ a: null, b: 'f3', c: 'f2' });
  });
});
