// Canciones de las pruebas (carpeta «Canciones» del concurso): qué tiene que sonar en cada momento. Lógica pura: la
// tele (fx/director.js) se lo pasa a sound.setSong(), que la descodifica y la hace sonar.
import { SCREEN } from './runner.js';
import { PHASE } from './game.js';
import { FPHASE } from './free.js';
import { songKey } from './folder.js';

/**
 * Qué canción de las pruebas suena ahora (o null):
 * La tele la descodifica antes (songToPrepare) para que suene sin esperar.
 *  - Pulsador con canción: suena al «¡Pulsad!», se para cuando alguien pulsa, sigue si falla (rebote) y, al acertar,
 *    al no acertar nadie o al enseñar la respuesta, sigue sonando.
 *  - Libre con canción (marcar el golpe): suena desde «¡Empezar!» hasta el final; si la fila tiene golpe, calla antes
 *    y vuelve en el golpe, y acaba 4 s después.
 */
export function songFor(view) {
  if (view.screen !== SCREEN.PLAY || view.peekScoreboard || view.paused) return null;
  const f = view.free;
  if (f?.song) {
    const track = songKey(f.song);
    if (f.phase === FPHASE.SETUP) return null; // aún no: suena la música de siempre
    return {
      key: f.roundId,
      track,
      from: f.songStart,
      playing: f.phase === FPHASE.RUNNING,
      startAt: f.tStart,
      silence: f.beat != null && f.silence > 0 ? [f.beat - f.silence, f.beat] : null,
      until: f.beat != null ? f.beat + 4 : null,
      fadeIn: f.tool === 'score' ? 2 : 0, // marcar el golpe: entra poco a poco (s)
    };
  }
  const g = view.game;
  const item = view.item;
  if (g && item?.song && g.phase !== PHASE.IDLE) {
    const done = g.phase === PHASE.CLOSED || (g.phase === PHASE.RESULT && g.judged === 'correct') || view.shown?.answer;
    return {
      key: `${view.section.id}:${view.itemIndex}`,
      track: songKey(item.song),
      from: item.songStart ?? 0,
      playing: g.phase === PHASE.OPEN || !!done,
      startAt: g.phase === PHASE.OPEN ? g.tOpen : null,
    };
  }
  return null;
}

/** La canción de la pregunta en pantalla (para descodificarla antes de que haga falta), o null. */
export function songToPrepare(view) {
  if (view.screen !== SCREEN.PLAY) return null;
  const name = view.free?.song ?? (view.game ? view.item?.song : null);
  return name ? songKey(name) : null;
}
