// El pañuelo: Hombres lobo contra Vampiros, el colofón del concurso. Sale uno de cada equipo (al azar o el que elija el
// presentador en secreto), los dos esperan en el sillón y, al «¡YA!», corren a por el pañuelo del centro y vuelven. El
// presentador dice quién gana cada duelo (es una prueba física: el móvil solo avisa). Lógica pura, con tests.
//
// Cada uno sale una vez; si un equipo tiene menos gente, alguno de ese equipo repite (los que menos han salido). Duelos
// = la gente del equipo más grande.
//
// Duelo actual: called (llamados al sillón) ──go──▶ running (cuenta atrás y «¡YA!») ──win──▶ done.

export const SIDES = ['wolf', 'vampire'];
/** La ruleta de caras de la tele: al pararse en los dos, ¡ya! (sin más espera ni cuenta atrás) */
export const HANKY_REVEAL_MS = 2600;
export const HSTEP = { CALLED: 'called', RUNNING: 'running', DONE: 'done' };

export class HankyDuels {
  /**
   * @param wolves   ids del equipo de los hombres lobo (el primero)
   * @param vampires ids del de los vampiros (el segundo)
   */
  constructor({ wolves = [], vampires = [] } = {}) {
    this.wolves = [...wolves];
    this.vampires = [...vampires];
    this.duels = []; // {wolf, vampire, winner: 'wolf'|'vampire', ms, points}
    this.current = null; // {wolf, vampire, step, mode: 'random'|'secret', calledAt, goAt, winner}
  }

  static fromJSON(data) {
    const d = new HankyDuels(data);
    d.duels = data.duels ?? [];
    d.current = data.current ?? null;
    return d;
  }

  toJSON() {
    const { wolves, vampires, duels, current } = this;
    return structuredClone({ wolves, vampires, duels, current });
  }

  /**
   * La gente de cada equipo ahora: quien entra tarde se añade al final de su equipo; quien se ha ido (o cambiado de
   * equipo) sin haber salido aún, se quita (así no cuenta para el número de duelos). Quien ya ha salido se queda.
   */
  join({ wolves = [], vampires = [] }) {
    const keep = (list, now) => list.filter((id) => now.includes(id) || this.count(id) > 0);
    this.wolves = keep(this.wolves, wolves);
    this.vampires = keep(this.vampires, vampires);
    for (const id of wolves) if (!this.wolves.includes(id) && !this.vampires.includes(id)) this.wolves.push(id);
    for (const id of vampires) if (!this.vampires.includes(id) && !this.wolves.includes(id)) this.vampires.push(id);
  }

  get total() {
    return Math.max(this.wolves.length, this.vampires.length);
  }

  /** ¿Se han jugado todos los duelos? (con el último ya cerrado) */
  get finished() {
    return this.total > 0 && this.duels.length >= this.total && (!this.current || this.current.step === HSTEP.DONE);
  }

  /** Duelos que lleva alguien. */
  count(id) {
    return this.duels.filter((d) => d.wolf === id || d.vampire === id).length;
  }

  /** De un equipo, los que menos han salido (los que pueden salir ahora); `ok` = quién está para salir (conectado…). */
  candidates(side, ok = () => true) {
    const list = (side === 'wolf' ? this.wolves : this.vampires).filter((id) => ok(id, side));
    if (!list.length) return [];
    const min = Math.min(...list.map((id) => this.count(id)));
    return list.filter((id) => this.count(id) === min);
  }

  get busy() {
    return !!this.current && this.current.step !== HSTEP.DONE;
  }

  /** Sorteo: uno de cada equipo entre los que menos han salido (y están para salir: `ok`). */
  draw(now, rng = Math.random, ok = () => true) {
    if (this.busy || this.finished) return false;
    const pick = (list) => list[Math.floor(rng() * list.length)];
    const wolf = pick(this.candidates('wolf', ok));
    const vampire = pick(this.candidates('vampire', ok));
    if (!wolf || !vampire) return false;
    this.current = { wolf, vampire, step: HSTEP.CALLED, mode: 'random', calledAt: now, goAt: null, winner: null };
    return true;
  }

  /** El presentador elige la pareja en secreto (cualquiera de cada equipo, aunque ya haya salido). */
  choose(wolf, vampire, now) {
    if (this.busy || this.finished) return false;
    if (!this.wolves.includes(wolf) || !this.vampires.includes(vampire)) return false;
    this.current = { wolf, vampire, step: HSTEP.CALLED, mode: 'secret', calledAt: now, goAt: null, winner: null };
    return true;
  }

  /** «¡Preparados!»: cuenta atrás y salida en `now + countdownMs`. */
  go(now, countdownMs = 3000) {
    if (this.current?.step !== HSTEP.CALLED) return false;
    Object.assign(this.current, { step: HSTEP.RUNNING, goAt: now + countdownMs });
    return true;
  }

  /** Salida nula: vuelven al sillón (mismo duelo). */
  falseStart() {
    if (this.current?.step !== HSTEP.RUNNING) return false;
    Object.assign(this.current, { step: HSTEP.CALLED, goAt: null });
    return true;
  }

  /** Cambiar la pareja llamada antes de salir (p. ej. alguien no está). */
  cancel() {
    if (this.current?.step !== HSTEP.CALLED) return false;
    this.current = null;
    return true;
  }

  /**
   * Gana un lado: se apunta el duelo con sus puntos para el ganador.
   * @returns el id del ganador (o null si no se puede)
   */
  win(side, now, points) {
    const c = this.current;
    if (!c || c.step === HSTEP.DONE || !SIDES.includes(side)) return null;
    const winner = side === 'wolf' ? c.wolf : c.vampire;
    this.duels.push({ wolf: c.wolf, vampire: c.vampire, winner: side, ms: c.goAt != null ? Math.max(0, now - c.goAt) : null, points });
    Object.assign(c, { step: HSTEP.DONE, winner: side });
    return winner;
  }

  /** Deshacer el último resultado (el duelo vuelve a estar en el sillón). @returns el duelo quitado o null */
  undo() {
    const c = this.current;
    if (c?.step !== HSTEP.DONE) return null;
    const d = this.duels.pop();
    Object.assign(c, { step: HSTEP.CALLED, goAt: null, winner: null });
    return d;
  }

  /** Duelos ganados por cada lado. */
  score() {
    return { wolf: this.duels.filter((d) => d.winner === 'wolf').length, vampire: this.duels.filter((d) => d.winner === 'vampire').length };
  }

  /** Equipo que gana la serie ('wolf', 'vampire' o 'tie'), o null si no ha acabado. */
  get champion() {
    if (!this.finished) return null;
    const s = this.score();
    return s.wolf > s.vampire ? 'wolf' : s.vampire > s.wolf ? 'vampire' : 'tie';
  }
}
