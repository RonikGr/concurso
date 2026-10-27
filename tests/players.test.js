import { describe, expect, it } from 'vitest';
import { COLORS, ICONS, NO_TEAM_COLOR, appearanceKey } from '../src/shared/appearance.js';
import { MAX_PLAYERS, Roster, pickFreeAppearance, sanitizeName, uniqueName } from '../src/core/players.js';

const [C1, C2] = COLORS.map((c) => c.id);
const [I1, I2] = ICONS.map((i) => i.id);
const TEAMS = [
  { id: 'rojos', name: 'Los Rojos', color: 'rojo' },
  { id: 'azules', name: 'Los Azules', color: 'azul' },
];

function joinMany(roster, n) {
  for (let i = 0; i < n; i++) {
    roster.join({ playerId: `p${i}`, name: `J${i}`, color: C1, icon: I1 });
  }
}

describe('nombres', () => {
  it('limpia espacios, caracteres de control y longitud', () => {
    expect(sanitizeName('  Ana   María  ')).toBe('Ana María');
    expect(sanitizeName('a\u0000b')).toBe('ab');
    expect(sanitizeName('')).toBe('Jugador');
    expect(sanitizeName('x'.repeat(40))).toHaveLength(16);
  });

  it('no parte un emoji al recortar', () => {
    const name = sanitizeName('a'.repeat(15) + '🦊🦊');
    expect([...name]).toHaveLength(16);
    expect(name.endsWith('🦊')).toBe(true);
  });

  it('añade sufijo a nombres repetidos sin distinguir mayúsculas', () => {
    expect(uniqueName('Ana', [])).toBe('Ana');
    expect(uniqueName('Ana', ['ana'])).toBe('Ana (2)');
    expect(uniqueName('Ana', ['Ana', 'Ana (2)'])).toBe('Ana (3)');
  });
});

describe('apariencia color + icono', () => {
  it('respeta la pareja pedida si está libre', () => {
    expect(pickFreeAppearance(C1, I1, [])).toEqual({ color: C1, icon: I1 });
  });

  it('si está cogida, mantiene el color y cambia el icono', () => {
    expect(pickFreeAppearance(C1, I1, [appearanceKey(C1, I1)])).toEqual({ color: C1, icon: I2 });
  });

  it('si el color está agotado, mantiene el icono y cambia el color', () => {
    const taken = ICONS.map((i) => appearanceKey(C1, i.id));
    expect(pickFreeAppearance(C1, I1, taken)).toEqual({ color: C2, icon: I1 });
  });

  it('sustituye valores desconocidos por unos válidos', () => {
    expect(pickFreeAppearance('xx', 'yy', [])).toEqual({ color: C1, icon: I1 });
  });
});

describe('Roster', () => {
  it('da de alta jugadores y resuelve choques de nombre y apariencia', () => {
    const r = new Roster();
    const a = r.join({ playerId: 'a', name: 'Ana', color: C1, icon: I1 });
    const b = r.join({ playerId: 'b', name: 'ana', color: C1, icon: I1 });
    expect(a).toMatchObject({ ok: true, isNew: true, renamed: false, appearanceChanged: false });
    expect(b).toMatchObject({ ok: true, isNew: true, renamed: true, appearanceChanged: true });
    expect(b.player.name).toBe('ana (2)');
    expect(appearanceKey(b.player.color, b.player.icon)).not.toBe(appearanceKey(C1, I1));
  });

  it('al reconectar conserva puntos y no se renombra contra sí mismo', () => {
    const r = new Roster();
    r.join({ playerId: 'a', name: 'Ana', color: C1, icon: I1 });
    r.adjustScore('a', 3);
    r.setConnected('a', false);
    const again = r.join({ playerId: 'a', name: 'Ana', color: C1, icon: I1 });
    expect(again).toMatchObject({ ok: true, isNew: false, renamed: false, appearanceChanged: false });
    expect(again.player).toMatchObject({ score: 3, connected: true, name: 'Ana' });
    expect(r.size).toBe(1);
  });

  it(`admite como máximo ${MAX_PLAYERS} jugadores, pero deja reconectar a los que ya están`, () => {
    const r = new Roster();
    joinMany(r, MAX_PLAYERS);
    expect(r.size).toBe(MAX_PLAYERS);
    expect(r.join({ playerId: 'nuevo', name: 'X', color: C1, icon: I1 })).toEqual({ ok: false, reason: 'full' });
    r.setConnected('p0', false);
    expect(r.join({ playerId: 'p0', name: 'J0', color: C1, icon: I1 }).ok).toBe(true);
  });

  it('todas las parejas color+icono son distintas aunque todos pidan la misma', () => {
    const r = new Roster();
    joinMany(r, MAX_PLAYERS);
    const keys = r.list().map((p) => appearanceKey(p.color, p.icon));
    expect(new Set(keys).size).toBe(MAX_PLAYERS);
  });

  it('cambia el perfil respetando a los demás', () => {
    const r = new Roster();
    r.join({ playerId: 'a', name: 'Ana', color: C1, icon: I1 });
    r.join({ playerId: 'b', name: 'Bea', color: C2, icon: I1 });
    const res = r.updateProfile('b', { name: 'Ana', color: C1, icon: I1 });
    expect(res.player.name).toBe('Ana (2)');
    expect(res.appearanceChanged).toBe(true);
    expect(r.updateProfile('nadie', { name: 'x' })).toBeNull();
  });

  it('se guarda y se recupera (recarga del presentador) con todos desconectados', () => {
    const r = new Roster();
    r.join({ playerId: 'a', name: 'Ana', color: C1, icon: I1 });
    r.join({ playerId: 'b', name: 'Bea', color: C2, icon: I2 });
    r.adjustScore('b', 2);
    const restored = new Roster(JSON.parse(JSON.stringify(r.toJSON())));
    expect(restored.list().map((p) => [p.id, p.score, p.connected])).toEqual([
      ['a', 0, false],
      ['b', 2, false],
    ]);
    const c = restored.join({ playerId: 'c', name: 'Cris', color: C1, icon: I2 });
    expect(c.player.joinSeq).toBeGreaterThan(restored.get('b').joinSeq);
  });

  it('borra jugadores y reinicia marcadores (también los puntos de equipo)', () => {
    const t = new Roster([], { teams: TEAMS });
    t.adjustTeamBonus('rojos', 3);
    t.resetScores();
    expect(t.teamStandings().every((s) => s.score === 0)).toBe(true);
  });

  it('borra jugadores y reinicia marcadores', () => {
    const r = new Roster();
    r.join({ playerId: 'a', name: 'Ana', color: C1, icon: I1 });
    r.adjustScore('a', 5);
    r.resetScores();
    expect(r.get('a').score).toBe(0);
    expect(r.remove('a')).toBe(true);
    expect(r.size).toBe(0);
  });
});

describe('Roster con equipos', () => {
  const join = (r, playerId, teamId, icon = I1, name = playerId) => r.join({ playerId, name, color: C2, icon, teamId });

  it('el color es el del equipo y el icono es único dentro del equipo', () => {
    const r = new Roster([], { teams: TEAMS });
    const a = join(r, 'a', 'rojos');
    const b = join(r, 'b', 'rojos');
    const c = join(r, 'c', 'azules');
    expect(a.player).toMatchObject({ teamId: 'rojos', color: 'rojo', icon: I1 });
    expect(a.appearanceChanged).toBe(false); // pedir otro color no cuenta: lo pone el equipo
    expect(b.player).toMatchObject({ teamId: 'rojos', color: 'rojo' });
    expect(b.player.icon).not.toBe(I1);
    expect(b.appearanceChanged).toBe(true);
    expect(c.player).toMatchObject({ teamId: 'azules', color: 'azul', icon: I1 }); // otro equipo: mismo icono vale
  });

  it('sin equipo elegido (o inválido) queda sin equipo y en gris', () => {
    const r = new Roster([], { teams: TEAMS });
    expect(join(r, 'a', null).player).toMatchObject({ teamId: null, color: NO_TEAM_COLOR });
    expect(join(r, 'b', 'verdes').player.teamId).toBeNull();
  });

  it('con los equipos cerrados nadie se cambia solo, pero quien no tenía equipo puede elegir', () => {
    const r = new Roster([], { teams: TEAMS });
    join(r, 'a', 'rojos');
    join(r, 'b', null);
    r.lockTeams();
    expect(r.updateProfile('a', { name: 'a', icon: I1, teamId: 'azules' }).player.teamId).toBe('rojos');
    expect(join(r, 'a', 'azules').player.teamId).toBe('rojos'); // reconectar tampoco lo cambia
    expect(r.updateProfile('b', { name: 'b', icon: I1, teamId: 'azules' }).player.teamId).toBe('azules');
    expect(r.moveToTeam('a', 'azules')).toMatchObject({ teamId: 'azules', color: 'azul' }); // el presentador sí
    expect(r.moveToTeam('a', 'verdes')).toBeNull();
  });

  it('suma los puntos de cada equipo más los puntos de equipo, de mayor a menor', () => {
    const r = new Roster([], { teams: TEAMS });
    join(r, 'a', 'rojos');
    join(r, 'b', 'rojos', I2);
    join(r, 'c', 'azules');
    r.adjustScore('a', 2);
    r.adjustScore('b', 1);
    r.adjustScore('c', 2);
    r.adjustTeamBonus('azules', 5);
    expect(r.teamStandings().map((s) => [s.team.id, s.score, s.members.length])).toEqual([
      ['azules', 7, 1],
      ['rojos', 3, 2],
    ]);
    expect(r.adjustTeamBonus('verdes', 1)).toBeNull();
  });

  it('al cambiar los equipos se recolorea y quien estaba en uno que ya no existe queda sin equipo', () => {
    const r = new Roster([], { teams: TEAMS });
    join(r, 'a', 'rojos');
    join(r, 'b', 'azules');
    r.setTeams([{ id: 'azules', name: 'Azules', color: 'verde' }]);
    expect(r.get('a')).toMatchObject({ teamId: null, color: NO_TEAM_COLOR });
    expect(r.get('b')).toMatchObject({ teamId: 'azules', color: 'verde' });
    r.setTeams([]);
    expect(r.hasTeams).toBe(false);
    expect(r.get('b').teamId).toBeNull();
  });

  it('se guarda y se recupera con equipo, bloqueo y puntos de equipo', () => {
    const r = new Roster([], { teams: TEAMS });
    join(r, 'a', 'rojos');
    const restored = new Roster(JSON.parse(JSON.stringify(r.toJSON())), { teams: TEAMS, teamsLocked: true, teamBonus: { rojos: 4 } });
    expect(restored.get('a')).toMatchObject({ teamId: 'rojos', color: 'rojo', connected: false });
    expect(restored.teamsLocked).toBe(true);
    expect(restored.teamStandings()[0]).toMatchObject({ score: 4 });
  });
});
describe('vuelve con otro móvil', () => {
  it('reconoce al jugador desconectado por su nombre, si no hay duda', () => {
    const r = new Roster();
    r.join({ playerId: 'a', name: 'Ana', color: 'rojo', icon: 'zorro' });
    r.join({ playerId: 'b', name: 'ana', color: 'azul', icon: 'panda' }); // → «ana (2)»
    r.join({ playerId: 'c', name: 'Luis', color: 'verde', icon: 'rana' });
    expect(r.returningByName('Luis')).toBeNull(); // sigue conectado: no es él
    r.setConnected('c', false);
    expect(r.returningByName('  luis ')?.id).toBe('c');
    r.setConnected('a', false);
    expect(r.returningByName('ANA')?.id).toBe('a'); // el nombre exacto
    r.setConnected('a', true);
    r.setConnected('b', false);
    expect(r.returningByName('Ana')?.id).toBe('b'); // «ana (2)», sin el (2)
    expect(r.returningByName('Pepe')).toBeNull();
  });
});
