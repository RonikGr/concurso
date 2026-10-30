// Por dónde va el concurso: qué pantalla se ve en la tele y qué sección / pregunta toca. Lógica pura.
//
//   setup ─▶ cover ─▶ [ intro ─▶ play (pregunta 1…N) ─▶ scoreboard ] × secciones ─▶ final
//
// Una sección sin lista de preguntas (pulsador improvisado) sigue en "play" hasta que el presentador la termina.
// Las secciones que el presentador quita en la preparación («¿Qué juegos jugamos?», `skipped`) se saltan al avanzar
// y al retroceder (ir a una a propósito sí se puede).
// Las secciones de tipos aún no disponibles (o sin filas) muestran su intro y se saltan al avanzar.
import { PLAYABLE_TYPES, SECTION_TYPES } from './show.js';

export const SCREEN = {
  SETUP: 'setup',
  COVER: 'cover',
  INTRO: 'intro',
  PLAY: 'play',
  SCOREBOARD: 'scoreboard',
  FINAL: 'final',
};

export function isPlayable(section) {
  if (!section || !PLAYABLE_TYPES.has(section.type)) return false;
  return !SECTION_TYPES[section.type].needsItems || section.items.length > 0;
}

export class ShowRunner {
  constructor(show, saved = null) {
    this.show = show;
    this.screen = SCREEN.SETUP;
    this.sectionIndex = 0;
    this.itemIndex = 0;
    this.shown = { question: false, answer: false }; // qué se ha enseñado en la tele de la pregunta actual
    this.peekScoreboard = false; // marcador "por encima" sin perder el sitio (tecla M)
    const ids = new Set(show.sections.map((s) => s.id));
    // Secciones que esta noche no se juegan: las que quitó el presentador o, al cargar la hoja, las de «Se juega: No»
    // (si fueran todas, se juegan todas)
    const off = show.sections.filter((s) => s.play === false).map((s) => s.id);
    const initial = saved?.skipped ?? (off.length < show.sections.length ? off : []);
    this.skipped = new Set(initial.filter((id) => ids.has(id)));
    if (saved && Object.values(SCREEN).includes(saved.screen)) {
      this.screen = saved.screen;
      this.sectionIndex = Math.min(Math.max(0, saved.sectionIndex | 0), Math.max(0, show.sections.length - 1));
      this.itemIndex = Math.max(0, saved.itemIndex | 0);
      this.shown = { question: !!saved.shown?.question, answer: !!saved.shown?.answer };
      if (this.itemCount && this.itemIndex >= this.itemCount) this.itemIndex = this.itemCount - 1;
      if (!show.sections.length && this.screen !== SCREEN.SETUP && this.screen !== SCREEN.COVER) this.screen = SCREEN.FINAL;
    }
  }

  /** ¿Se juega esta sección esta noche? */
  isOn(index) {
    const s = this.show.sections[index];
    return !!s && !this.skipped.has(s.id);
  }

  /** Quitar o poner una sección (en la preparación). */
  setSkipped(sectionId, skip) {
    if (!this.show.sections.some((s) => s.id === sectionId)) return false;
    if (skip) this.skipped.add(sectionId);
    else this.skipped.delete(sectionId);
    return true;
  }

  /**
   * Cambiar el orden (en la preparación): sube (−1) o baja (+1) una sección, saltando por encima de las que no se
   * juegan esta noche (así cada toque se nota en lo que se va a jugar).
   */
  moveSection(sectionId, delta) {
    if (this.screen !== SCREEN.SETUP) return false;
    const list = this.show.sections;
    const from = list.findIndex((s) => s.id === sectionId);
    const step = Math.sign(Number(delta) || 0);
    if (from < 0 || !step) return false;
    let to = from + step;
    while (to >= 0 && to < list.length && this.skipped.has(list[to].id) && !this.skipped.has(sectionId)) to += step;
    if (to < 0 || to >= list.length) return false;
    const [moved] = list.splice(from, 1);
    list.splice(to, 0, moved);
    return true;
  }

  /** Las secciones que se juegan, en orden. */
  get playedSections() {
    return this.show.sections.filter((s) => !this.skipped.has(s.id));
  }

  /** Puesto (1, 2…) de esta sección entre las que se juegan. */
  positionOf(index) {
    return this.show.sections.slice(0, index + 1).filter((s) => !this.skipped.has(s.id)).length;
  }

  #nextOn(from) {
    for (let i = Math.max(0, from); i < this.show.sections.length; i++) if (this.isOn(i)) return i;
    return -1;
  }

  #prevOn(from) {
    for (let i = Math.min(from, this.show.sections.length - 1); i >= 0; i--) if (this.isOn(i)) return i;
    return -1;
  }

  get section() {
    return this.show.sections[this.sectionIndex] ?? null;
  }

  /** 0 = sección sin lista (preguntas improvisadas). */
  get itemCount() {
    return this.section?.items.length ?? 0;
  }

  get item() {
    return this.section?.items[this.itemIndex] ?? null;
  }

  /** Clave de "qué pregunta se está jugando": si cambia, el motor de la pregunta empieza de cero. */
  get playKey() {
    return this.screen === SCREEN.PLAY ? `${this.sectionIndex}:${this.itemIndex}` : null;
  }

  next() {
    this.peekScoreboard = false;
    switch (this.screen) {
      case SCREEN.SETUP:
        return this.#go(SCREEN.COVER);
      case SCREEN.COVER: {
        const first = this.#nextOn(0);
        return first >= 0 ? this.#go(SCREEN.INTRO, first) : this.#go(SCREEN.FINAL);
      }
      case SCREEN.INTRO:
        return isPlayable(this.section) ? this.#go(SCREEN.PLAY, this.sectionIndex, 0) : this.#afterSection();
      case SCREEN.PLAY:
        return this.nextItem();
      case SCREEN.SCOREBOARD:
        return this.#afterSection();
      default:
        return false;
    }
  }

  /** Saltar a una pregunta de la sección en juego (Squid Games: a la hucha si ya no queda gente). */
  goToItem(index) {
    if (this.screen !== SCREEN.PLAY || !(index >= 0 && index < this.itemCount)) return false;
    return this.#go(SCREEN.PLAY, this.sectionIndex, index);
  }

  /** Siguiente pregunta; tras la última, el marcador. */
  nextItem() {
    if (this.screen !== SCREEN.PLAY) return false;
    this.peekScoreboard = false;
    if (this.itemCount && this.itemIndex + 1 >= this.itemCount) return this.#go(SCREEN.SCOREBOARD);
    return this.#go(SCREEN.PLAY, this.sectionIndex, this.itemIndex + 1);
  }

  prev() {
    this.peekScoreboard = false;
    switch (this.screen) {
      case SCREEN.COVER:
        return this.#go(SCREEN.SETUP);
      case SCREEN.INTRO: {
        const before = this.#prevOn(this.sectionIndex - 1);
        return before >= 0 ? this.#go(SCREEN.SCOREBOARD, before) : this.#go(SCREEN.COVER);
      }
      case SCREEN.PLAY:
        return this.itemIndex > 0 ? this.#go(SCREEN.PLAY, this.sectionIndex, this.itemIndex - 1) : this.#go(SCREEN.INTRO);
      case SCREEN.SCOREBOARD:
        if (!isPlayable(this.section)) return this.#go(SCREEN.INTRO);
        return this.#go(SCREEN.PLAY, this.sectionIndex, this.itemCount ? this.itemCount - 1 : this.itemIndex);
      case SCREEN.FINAL: {
        const last = this.#prevOn(this.show.sections.length - 1);
        return last >= 0 ? this.#go(SCREEN.SCOREBOARD, last) : this.#go(SCREEN.COVER);
      }
      default:
        return false;
    }
  }

  goToSection(index) {
    if (!(index >= 0 && index < this.show.sections.length)) return false;
    this.peekScoreboard = false;
    return this.#go(SCREEN.INTRO, index, 0);
  }

  /** "Terminar sección": al marcador (útil en secciones sin lista de preguntas). */
  endSection() {
    if (this.screen !== SCREEN.PLAY) return false;
    return this.#go(SCREEN.SCOREBOARD);
  }

  /** Volver a preparación (p. ej. para cargar otro concurso). */
  toSetup() {
    this.peekScoreboard = false;
    return this.#go(SCREEN.SETUP, 0, 0);
  }

  toggleScoreboard() {
    if (this.screen === SCREEN.SETUP) return false;
    this.peekScoreboard = !this.peekScoreboard;
    return true;
  }

  showQuestion() {
    if (this.screen !== SCREEN.PLAY || this.shown.question) return false;
    this.shown.question = true;
    return true;
  }

  showAnswer() {
    if (this.screen !== SCREEN.PLAY || this.shown.answer) return false;
    this.shown = { question: true, answer: true };
    return true;
  }

  toJSON() {
    return { screen: this.screen, sectionIndex: this.sectionIndex, itemIndex: this.itemIndex, shown: { ...this.shown }, skipped: [...this.skipped] };
  }

  #afterSection() {
    const nextIndex = this.#nextOn(this.sectionIndex + 1);
    return nextIndex >= 0 ? this.#go(SCREEN.INTRO, nextIndex, 0) : this.#go(SCREEN.FINAL);
  }

  #go(screen, sectionIndex = this.sectionIndex, itemIndex = screen === SCREEN.PLAY ? this.itemIndex : 0) {
    const itemChanged = sectionIndex !== this.sectionIndex || itemIndex !== this.itemIndex || screen !== this.screen;
    this.screen = screen;
    this.sectionIndex = sectionIndex;
    this.itemIndex = itemIndex;
    if (itemChanged) this.shown = { question: false, answer: false };
    return true;
  }
}
