// Lista de jugadores de la sala. Lógica pura: la usa el presentador y la prueban los tests.
//
// Sin equipos: cada jugador elige color + icono y la pareja es única en la sala.
// Con equipos: el color es el del equipo y el icono es único dentro del equipo (la pareja sigue siendo única).
import { COLORS, ICONS, NO_TEAM_COLOR, appearanceKey, isKnownColor, isKnownIcon } from '../shared/appearance.js';

export const MAX_PLAYERS = 20;
export const MIN_PLAYERS = 2;
export const MAX_NAME_LENGTH = 16;
export const DEFAULT_NAME = 'Jugador';

export function sanitizeName(raw) {
  const clean = String(raw ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  // Por puntos de código para no partir emojis.
  return [...clean].slice(0, MAX_NAME_LENGTH).join('').trim() || DEFAULT_NAME;
}

const nameKey = (name) => name.toLocaleLowerCase('es');

/** "Ana" → "Ana (2)", "Ana (3)"… si ya existe (sin distinguir mayúsculas). */
export function uniqueName(name, takenNames) {
  const taken = new Set([...takenNames].map(nameKey));
  if (!taken.has(nameKey(name))) return name;
  for (let n = 2; ; n++) {
    const candidate = `${name} (${n})`;
    if (!taken.has(nameKey(candidate))) return candidate;
  }
}

/**
 * Devuelve una pareja color+icono libre lo más parecida posible a la pedida:
 * la misma si está libre; si no, mismo color con otro icono; si no, mismo icono con otro color; si no, cualquiera.
 */
export function pickFreeAppearance(color, icon, takenKeys) {
  const taken = new Set(takenKeys);
  const wantedColor = isKnownColor(color) ? color : COLORS[0].id;
  const wantedIcon = isKnownIcon(icon) ? icon : ICONS[0].id;
  const free = (c, i) => !taken.has(appearanceKey(c, i));

  if (free(wantedColor, wantedIcon)) return { color: wantedColor, icon: wantedIcon };
  for (const i of ICONS) if (free(wantedColor, i.id)) return { color: wantedColor, icon: i.id };
  for (const c of COLORS) if (free(c.id, wantedIcon)) return { color: c.id, icon: wantedIcon };
  for (const c of COLORS) for (const i of ICONS) if (free(c.id, i.id)) return { color: c.id, icon: i.id };
  return { color: wantedColor, icon: wantedIcon }; // imposible con MAX_PLAYERS < colores × iconos
}

export class Roster {
  /**
   * @param {Array} saved lista de `toJSON()` (p. ej. tras recargar el presentador)
   * @param {object} options.teams [{id, name, color}] — vacío = sin equipos
   */
  constructor(saved = [], { teams = [], teamsLocked = false, teamBonus = {} } = {}) {
    this.players = new Map();
    this.nextSeq = 1;
    this.teams = [];
    this.teamsLocked = teamsLocked;
    this.teamBonus = new Map(Object.entries(teamBonus)); // teamId → puntos dados al equipo entero
    for (const p of saved) {
      if (!p?.id) continue;
      this.players.set(p.id, {
        id: p.id,
        name: sanitizeName(p.name),
        color: p.color,
        icon: p.icon,
        teamId: p.teamId ?? null,
        score: Number.isFinite(p.score) ? p.score : 0,
        joinSeq: p.joinSeq ?? this.nextSeq,
        connected: false,
      });
      this.nextSeq = Math.max(this.nextSeq, (p.joinSeq ?? 0) + 1);
    }
    this.setTeams(teams);
  }

  get size() {
    return this.players.size;
  }

  get connectedCount() {
    let n = 0;
    for (const p of this.players.values()) if (p.connected) n++;
    return n;
  }

  get hasTeams() {
    return this.teams.length > 0;
  }

  get(id) {
    return this.players.get(id);
  }

  /** En orden de llegada a la sala. */
  list() {
    return [...this.players.values()].sort((a, b) => a.joinSeq - b.joinSeq);
  }

  team(teamId) {
    return this.teams.find((t) => t.id === teamId) ?? null;
  }

  /**
   * Cambia los equipos (al cargar un concurso). Quien estuviera en un equipo que ya no existe queda sin equipo;
   * a todos se les recalcula color e icono.
   */
  setTeams(teams) {
    this.teams = teams.map((t) => ({ id: t.id, name: t.name, color: isKnownColor(t.color) ? t.color : COLORS[0].id }));
    if (!this.hasTeams) this.teamsLocked = false;
    for (const id of [...this.teamBonus.keys()]) if (!this.team(id)) this.teamBonus.delete(id);
    for (const p of this.list()) {
      if (p.teamId && !this.team(p.teamId)) p.teamId = null;
      Object.assign(p, this.#resolveProfile(p.id, p).profile);
    }
  }

  takenAppearances(exceptId = null) {
    return this.list()
      .filter((p) => p.id !== exceptId)
      .map((p) => appearanceKey(p.color, p.icon));
  }

  /**
   * Alta o reconexión. Si `playerId` ya existe, conserva los puntos (y el equipo si están cerrados).
   * @returns {{ok: true, player, isNew, renamed, appearanceChanged} | {ok: false, reason: 'full'}}
   */
  join({ playerId, name, color, icon, teamId = null }) {
    const existing = this.players.get(playerId);
    if (!existing && this.players.size >= MAX_PLAYERS) return { ok: false, reason: 'full' };

    const wanted = { name, color, icon, teamId: this.#allowedTeam(existing, teamId) };
    const resolved = this.#resolveProfile(playerId, wanted);
    let player = existing;
    if (player) {
      Object.assign(player, resolved.profile, { connected: true });
    } else {
      player = { id: playerId, ...resolved.profile, score: 0, joinSeq: this.nextSeq++, connected: true };
      this.players.set(playerId, player);
    }
    return { ok: true, player, isNew: !existing, renamed: resolved.renamed, appearanceChanged: resolved.appearanceChanged };
  }

  /**
   * Alguien que vuelve con otro móvil, o con el mismo pero sin sus datos (Safari los borra a los 7 días sin entrar en
   * la web): el jugador desconectado que tenía ese nombre, para que siga con sus puntos y su equipo. Solo si no hay
   * duda: primero el nombre exacto; si no, el mismo sin el «(2)» que le puso la sala. Si no, null.
   */
  returningByName(name) {
    const key = nameKey(sanitizeName(name));
    const offline = this.list().filter((p) => !p.connected);
    const exact = offline.filter((p) => nameKey(p.name) === key);
    if (exact.length) return exact.length === 1 ? exact[0] : null;
    const base = offline.filter((p) => nameKey(p.name.replace(/ \(\d+\)$/, '')) === key);
    return base.length === 1 ? base[0] : null;
  }

  /** Cambio de nombre/icono/color/equipo desde el móvil. */
  updateProfile(playerId, wanted) {
    const player = this.players.get(playerId);
    if (!player) return null;
    const resolved = this.#resolveProfile(playerId, { ...wanted, teamId: this.#allowedTeam(player, wanted.teamId) });
    Object.assign(player, resolved.profile);
    return { player, renamed: resolved.renamed, appearanceChanged: resolved.appearanceChanged };
  }

  /** El presentador mueve a alguien de equipo (también con los equipos cerrados). */
  moveToTeam(playerId, teamId) {
    const player = this.players.get(playerId);
    if (!player || !this.team(teamId)) return null;
    Object.assign(player, this.#resolveProfile(playerId, { ...player, teamId }).profile);
    return player;
  }

  lockTeams(locked = true) {
    this.teamsLocked = this.hasTeams && locked;
  }

  setConnected(playerId, connected) {
    const p = this.players.get(playerId);
    if (p) p.connected = connected;
    return p;
  }

  adjustScore(playerId, delta) {
    const p = this.players.get(playerId);
    if (!p) return null;
    p.score += delta;
    return p.score;
  }

  /** Puntos para el equipo entero (no se reparten entre sus miembros). */
  adjustTeamBonus(teamId, delta) {
    if (!this.team(teamId)) return null;
    const value = (this.teamBonus.get(teamId) ?? 0) + delta;
    this.teamBonus.set(teamId, value);
    return value;
  }

  resetScores() {
    for (const p of this.players.values()) p.score = 0;
    this.teamBonus.clear();
  }

  /** [{team, score, members}] ordenados de más a menos puntos. Puntos = suma de miembros + bonus de equipo. */
  teamStandings() {
    return this.teams
      .map((team) => {
        const members = this.list().filter((p) => p.teamId === team.id);
        const score = members.reduce((sum, p) => sum + p.score, 0) + (this.teamBonus.get(team.id) ?? 0);
        return { team, score, members };
      })
      .sort((a, b) => b.score - a.score);
  }

  remove(playerId) {
    return this.players.delete(playerId);
  }

  toJSON() {
    return this.list().map(({ id, name, color, icon, teamId, score, joinSeq }) => ({ id, name, color, icon, teamId, score, joinSeq }));
  }

  /** Con equipos cerrados, quien ya tiene equipo no puede cambiarlo él mismo. */
  #allowedTeam(player, requested) {
    if (this.teamsLocked && player?.teamId) return player.teamId;
    return requested ?? player?.teamId ?? null;
  }

  #resolveProfile(selfId, { name, color, icon, teamId }) {
    const others = this.list().filter((p) => p.id !== selfId);
    const wantedName = sanitizeName(name);
    const finalName = uniqueName(
      wantedName,
      others.map((p) => p.name),
    );

    let finalTeamId = null;
    let wantedColor = color;
    if (this.hasTeams) {
      const team = this.team(teamId);
      finalTeamId = team?.id ?? null;
      wantedColor = team?.color ?? NO_TEAM_COLOR; // el color lo pone el equipo
    }
    const appearance = pickFreeAppearance(
      wantedColor,
      icon,
      others.map((p) => appearanceKey(p.color, p.icon)),
    );
    return {
      profile: { name: finalName, ...appearance, teamId: finalTeamId },
      renamed: finalName !== wantedName,
      // Con equipos, que el color cambie al del equipo es lo esperado: solo cuenta el icono.
      appearanceChanged: appearance.icon !== icon || (!this.hasTeams && appearance.color !== color),
    };
  }
}
