// Pantalla de la tele en las secciones de Test: «¿Quién quiere ser millonario?». Quien concursa, sus comodines, la
// pregunta y las respuestas en fichas alargadas (A: B: C: D:) que van apareciendo; amarilla la marcada, verde la buena.
// Encima, cuando toca, el resultado del público o la llamada con su reloj de 30 s.
import { fill, h } from '../shared/dom.js';
import { avatarOf, getColor } from '../shared/appearance.js';
import { LETTERS, MPHASE } from '../core/millionaire.js';
import { sound } from './fx/audio.js';
import { jokerIcon } from '../shared/jokerIcons.js';
import { LEVEL_LABELS } from '../core/millionaireMusic.js';

/** Reloj redondo con el número (como el de la llamada del programa). */
function timerRing() {
  const el = h('div', { class: 'mill-timer' });
  el.innerHTML = '<svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="44" class="track"/><circle cx="50" cy="50" r="44" class="bar" pathLength="100"/></svg><span></span>';
  return el;
}

export function createMillionaireStage() {
  const root = h('section', { class: 'mill-stage' });
  let tick = 0;
  let seen = { roundId: null, shown: 0, revealed: false }; // lo que ya se pintó de esta pregunta

  function stop() {
    clearInterval(tick);
    tick = 0;
  }

  /** Cuenta atrás en el reloj hasta `endsAt` (de `total` ms), con tictac en los últimos 5 s. */
  function runTimer(el, endsAt, total) {
    let last = null;
    const step = () => {
      const left = Math.max(0, endsAt - performance.now());
      const n = Math.ceil(left / 1000);
      el.querySelector('span').textContent = String(n);
      el.querySelector('.bar').style.strokeDashoffset = String(100 - (left / total) * 100);
      el.classList.toggle('hurry', left < 5000);
      if (n !== last && last != null && n > 0 && n <= 5) sound.play('tick');
      last = n;
      if (!left) stop();
    };
    step();
    tick = setInterval(step, 100);
  }

  function render(view) {
    stop();
    const m = view.millionaire;
    if (!m) return;
    const revealed = m.phase === MPHASE.REVEALED;
    const team = m.team;

    // Arriba: quién concursa y sus comodines
    const top = h(
      'header',
      { class: 'mill-top' },
      m.seat
        ? h(
            'div',
            { class: 'mill-seat', style: { '--tc': getColor(team?.color ?? m.seat.color).bg } },
            h('span', { class: 'mini-avatar emoji', style: { '--pc': getColor(m.seat.color).bg } }, avatarOf(m.seat)),
            h('div', {}, h('strong', {}, m.seat.name), h('small', {}, [team?.name, `Pregunta ${view.itemIndex + 1} de ${view.itemCount}`, LEVEL_LABELS[m.level], `${m.points} ${m.points === 1 ? 'punto' : 'puntos'}`].filter(Boolean).join(' · '))),
          )
        : h('div', { class: 'mill-seat' }, h('strong', {}, 'Elige quién concursa (mando)')),
      m.jokers
        ? h(
            'div',
            { class: 'mill-jokers' },
            ['fifty', 'audience', 'call'].map((k) => jokerIcon(k, { used: m.jokers[k] <= 0 })),
          )
        : null,
    );

    // En medio: la llamada en curso o, si no, el público (votando o su resultado)
    let middle = null;
    const calling = m.call && m.call.state !== 'done' && !revealed;
    if (!calling && m.audience && m.audience.state !== 'cancelled' && !revealed) {
      const voting = m.audience.state === 'voting';
      const timer = voting ? timerRing() : null;
      middle = h(
        'div',
        { class: 'mill-panel' },
        h('p', { class: 'mill-panel-title' }, voting ? `El público de ${team?.name ?? 'la sala'} vota… ¡sin hablar!` : 'El público ha votado'),
        voting
          ? h('div', { class: 'mill-panel-row' }, timer, h('p', {}, `${m.audience.voted} de ${m.audience.voters} han votado`))
          : h(
              'div',
              { class: 'mill-audience' },
              m.audience.percentages.map((pct, i) =>
                h(
                  'div',
                  { class: `aud-col ${m.removed.includes(i) ? 'removed' : ''}`, style: { '--h': `${pct}%` } },
                  h('span', { class: 'aud-pct' }, `${pct}%`),
                  h('span', { class: 'aud-bar' }),
                  h('span', { class: 'aud-letter' }, LETTERS[i]),
                ),
              ),
            ),
      );
      if (timer) runTimer(timer, m.audience.endsAt, 15_000);
    } else if (calling) {
      const running = m.call.state === 'running';
      const timer = running ? timerRing() : null;
      middle = h(
        'div',
        { class: 'mill-panel call' },
        h('p', { class: 'mill-panel-title' }, `📞 Llamada a ${m.call.friend?.name ?? '¿?'}`),
        running
          ? h('div', { class: 'mill-panel-row' }, timer)
          : h('p', {}, `${m.call.friend?.name ?? '¿?'} sale de la sala y llama a ${m.seat?.name ?? '¿?'}. Cuando el presentador diga «ya», tendréis 30 segundos.`),
      );
      if (timer) runTimer(timer, m.call.endsAt, 30_000);
    } else if (m.image) {
      middle = h('img', { class: 'answer-image', src: m.image, alt: '' });
    }

    // Abajo: la pregunta y las respuestas, en las fichas del programa. Al repintar (un voto, los puntos tras el
    // revelado), las que ya estaban no vuelven a aparecer ni la buena a parpadear
    const before = seen.roundId === m.roundId ? seen : { shown: 0, revealed: false };
    seen = { roundId: m.roundId, shown: m.shown, revealed };
    const options = h(
      'ol',
      { class: `mill-options n${m.count} ${before.revealed ? 'settled' : ''}` },
      Array.from({ length: m.count }, (_, i) => {
        const visible = i < m.shown && !m.removed.includes(i);
        const marked = m.marked === i && (m.phase === MPHASE.MARKED || revealed);
        const correct = revealed && m.correct === i;
        const state = correct ? 'correct' : marked ? 'marked' : visible ? 'shown' : 'hidden';
        return h(
          'li',
          { class: `mill-opt ${state} ${i < m.shown && i >= before.shown ? 'appeared' : ''}` },
          h('span', { class: 'mill-opt-in' }, h('span', { class: 'mill-letter' }, h('span', { class: 'diamond' }, '◆'), `${LETTERS[i]}:`), h('span', { class: 'mill-text' }, visible ? m.options[i] : '')),
        );
      }),
    );

    fill(
      root,
      top,
      middle,
      h('div', { class: 'mill-question' }, h('span', { class: 'mill-opt-in' }, m.text)),
      options,
      m.cheated && !revealed ? h('p', { class: 'mill-note' }, '🚨 Ha salido de la app: aunque acierte, no puntúa') : null,
      revealed ? h('p', { class: `mill-note ${m.result.correct ? 'ok' : 'ko'}` }, m.result.correct ? (m.cheated ? '¡Correcta! (sin puntos: salió de la app)' : `¡Correcta! +${m.points}`) : '¡Oh! No era esa') : null,
    );
  }

  return { root, render, stop };
}
