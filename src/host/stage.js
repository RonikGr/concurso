// Pantalla de juego del Pulsador en la tele: pregunta en grande, estado del turno y ganador a pantalla completa.
// La tele es solo espectáculo: no tiene botones. Se maneja desde el mando del presentador (o el teclado).
import { fill, h } from '../shared/dom.js';
import { avatarOf, getColor } from '../shared/appearance.js';
import { formatDeltaMs, formatSeconds, ordinal } from '../shared/format.js';
import { PHASE } from '../core/game.js';
import { MIN_PLAYERS } from '../core/players.js';
import { kinetic } from './fx/motion.js';
import { countingFor, startCountdown } from './fx/countdown.js';

export function createStage() {
  const root = h('section', { class: 'stage', 'aria-live': 'polite' });
  const overlay = h('div', { class: 'result-overlay', hidden: true, role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Resultado' });
  let timerEl = null;
  let raf = 0;
  let stopCountdown = () => {};

  function stopTimer() {
    cancelAnimationFrame(raf);
    stopCountdown();
    timerEl = null;
  }

  function tickTimer(tOpen) {
    if (!timerEl) return;
    timerEl.textContent = formatSeconds(performance.now() - tOpen, 1);
    raf = requestAnimationFrame(() => tickTimer(tOpen));
  }

  function questionBlock(view, big) {
    const item = view.item;
    const progress = view.itemCount ? `Pregunta ${view.itemIndex + 1} de ${view.itemCount}` : `Pregunta ${view.itemIndex + 1}`;
    const showText = item?.showOnTv && view.shown.question && item.question;
    return [
      h('p', { class: 'stage-q' }, `${view.section.name} · ${progress}`),
      showText ? h('p', { class: `stage-question ${big ? 'big' : ''}` }, item.question) : null,
      item?.song && !showText ? h('p', { class: 'stage-question song' }, '🎵 ¿Qué canción es?') : null,
      view.shown.answer && item?.answer ? (item.song ? songAnswer(item.answer) : h('p', { class: 'stage-answer' }, item.answer)) : null,
    ];
  }

  function render(view) {
    const game = view.game;
    stopTimer();
    overlay.hidden = !game || game.phase !== PHASE.RESULT || view.peekScoreboard;
    if (!game) return;

    switch (game.phase) {
      case PHASE.IDLE:
        root.dataset.phase = 'idle';
        fill(
          root,
          questionBlock(view, true),
          view.shown.question ? null : h('p', { class: 'stage-title display' }, 'Pregunta en el aire'),
          h('p', { class: 'how' }, 'Tras la cuenta atrás, el primero en pulsar responde. ¡Si pulsas antes, quedas bloqueado!'),
          view.canStart ? null : h('p', { class: 'stage-hint' }, `Hacen falta al menos ${MIN_PLAYERS} jugadores conectados.`),
        );
        break;

      case PHASE.OPEN: {
        const started = performance.now() >= game.tOpen;
        root.dataset.phase = started ? 'open' : 'ready';
        timerEl = started ? h('p', { class: 'stage-timer' }) : null;
        // Antes de abrir, cuenta atrás 3-2-1 en grande (en un rebote es tan corta que solo se ve "Preparados…").
        const counting = !started && (game.tOpen - performance.now() > 900 || countingFor(game.tOpen));
        const big = counting ? h('p', { class: 'countdown-big display' }) : h('p', { class: 'stage-title display' }, started ? '¡Pulsad!' : 'Preparados…');
        fill(
          root,
          questionBlock(view, false),
          game.rebound ? h('p', { class: 'stage-rebound' }, '¡Rebote! Pueden pulsar los demás') : null,
          big,
          counting ? h('p', { class: 'how' }, '¡No pulséis todavía!') : null,
          timerEl,
        );
        if (counting) stopCountdown = startCountdown(big, game.tOpen);
        if (timerEl) tickTimer(game.tOpen);
        break;
      }

      case PHASE.RESULT:
        // La tele la ocupa el overlay; debajo se deja la pregunta.
        root.dataset.phase = 'result';
        fill(root, questionBlock(view, true));
        renderResult(view);
        break;

      case PHASE.CLOSED:
        root.dataset.phase = 'closed';
        fill(root, questionBlock(view, false), h('p', { class: 'stage-title' }, 'Nadie más puede responder'));
        break;
    }
  }

  function renderResult(view) {
    const game = view.game;
    const winner = game.winner;
    if (!winner) return;
    const color = getColor(winner.color);
    overlay.style.setProperty('--win', color.bg);
    overlay.style.setProperty('--win-fg', color.fg);

    const first = game.ranking[0];
    const followers = game.ranking.slice(1);
    const judgedCorrect = game.judged === 'correct';
    const team = view.teams.find((t) => t.id === winner.teamId);

    fill(
      overlay,
      h('p', { class: 'result-q' }, `${view.section.name} · Pregunta ${view.itemIndex + 1}`),
      h('div', { class: 'result-avatar emoji', 'aria-hidden': 'true' }, avatarOf(winner)),
      kinetic('h2', 'result-name', winner.name, { step: 45 }),
      team ? h('p', { class: 'result-team' }, team.name) : null,
      h('p', { class: 'result-time' }, first ? formatSeconds(first.reactionMs) : ''),
      judgedCorrect ? h('p', { class: 'result-verdict' }, `¡Correcto! +${view.pointsForCorrect}`) : null,
      view.shown.answer && view.item?.answer ? (view.item.song ? songAnswer(view.item.answer) : h('p', { class: 'result-answer' }, view.item.answer)) : null,
      // Antes de decidir: el orden de los demás. Tras el acierto: cómo va el marcador.
      judgedCorrect ? miniStandings(view, winner) : followersList(followers),
    );
  }

  /** Al salir de esta pantalla: quitar el ganador a pantalla completa y parar el cronómetro. */
  function stop() {
    stopTimer();
    overlay.hidden = true;
  }

  return { root, overlay, render, stop };
}

/** «¿Qué canción es?»: el título de la canción en grande, como un disco que se ilumina (que no se confunda con lo demás). */
function songAnswer(answer) {
  return h('div', { class: 'song-answer' }, h('span', { class: 'song-answer-kicker' }, '🎵 La canción era…'), kinetic('strong', 'song-answer-title', answer, { step: 40 }));
}

function followersList(all) {
  if (!all.length) return null;
  // con mucha gente, los 5 primeros (si no, el nombre del ganador se salía por arriba)
  const followers = all.slice(0, 5);
  return h(
    'ol',
    { class: 'followers' },
    followers.map((r) =>
      h(
        'li',
        { class: r.nearTie ? 'near-tie' : '', style: { '--fc': getColor(r.player.color).bg } },
        h('span', { class: 'f-place' }, ordinal(r.place)),
        h('span', { class: 'f-icon emoji' }, avatarOf(r.player)),
        h('span', { class: 'f-name' }, r.player.name),
        h('span', { class: 'f-delta' }, formatDeltaMs(r.deltaMs)),
        r.nearTie ? h('span', { class: 'f-tie' }, 'casi empate') : null,
      ),
    ),
    all.length > followers.length ? h('li', { class: 'f-more' }, `y ${all.length - followers.length} más`) : null,
  );
}

/** Marcador general tras un acierto: equipos si los hay; si no, los jugadores. Se resalta al que acaba de puntuar. */
function miniStandings(view, winner) {
  const rows = view.standings.length
    ? view.standings.map((s) => ({ key: s.team.id, name: s.team.name, color: s.team.color, score: s.score, mine: s.team.id === winner.teamId }))
    : [...view.players]
        .sort((a, b) => b.score - a.score)
        .slice(0, 8)
        .map((p) => ({ key: p.id, name: p.name, color: p.color, icon: p.icon, face: p.face, score: p.score, mine: p.id === winner.id }));
  return h(
    'ol',
    { class: 'mini-standings' },
    rows.map((r, i) =>
      h(
        'li',
        { class: r.mine ? 'mine' : '', style: { '--fc': getColor(r.color).bg } },
        h('span', { class: 'f-place' }, ordinal(i + 1)),
        r.icon ? h('span', { class: 'f-icon emoji' }, avatarOf(r)) : null,
        h('span', { class: 'f-name' }, r.name),
        h('span', { class: 'f-score' }, `${r.score} pts`),
      ),
    ),
  );
}
