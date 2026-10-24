// Modo depuración (tecla D): relojes de cada móvil y tiempos de la última ronda.
// Todos los tiempos de la ronda van en ms desde la apertura del turno, en el reloj del presentador.
import { fill, h } from '../shared/dom.js';
import { avatarOf } from '../shared/appearance.js';
import { PRESS_SOURCE } from '../core/plausibility.js';

const SOURCE_TEXT = {
  [PRESS_SOURCE.SYNCED]: 'marca del móvil',
  [PRESS_SOURCE.ARRIVAL]: 'llegada (sin sincronizar)',
  [PRESS_SOURCE.CLAMPED_FUTURE]: 'recortada: posterior a la llegada',
  [PRESS_SOURCE.CLAMPED_EARLY]: 'recortada: demasiado anterior',
};

const ms = (v, digits = 0) => (Number.isFinite(v) ? `${v.toFixed(digits).replace('.', ',')} ms` : '—');
const signed = (v) => (Number.isFinite(v) ? `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1).replace('.', ',')}` : '—');
const who = (p) => h('span', { class: 'dbg-who' }, h('span', { class: 'emoji' }, avatarOf(p)), ' ', p.name);

/** @param imageInfo () => texto de cómo va la imagen de la tele (fps y calidad del fondo) */
export function createDebugPanel({ imageInfo = () => '' } = {}) {
  const root = h('aside', { class: 'debug-panel', hidden: true, 'aria-label': 'Depuración' });

  function render(room) {
    if (root.hidden) return;
    const { players, round, settings } = room.debugView();
    const windowMs = settings.decisionWindowMs;

    const clocks = h(
      'table',
      {},
      h('thead', {}, h('tr', {}, ['Jugador', 'RTT latido', 'Offset reloj', 'Error sinc.', 'Muestras'].map((t) => h('th', {}, t)))),
      h(
        'tbody',
        {},
        players.map(({ player, rtt, sync }) => {
          const slow = Number.isFinite(rtt) && rtt / 2 > windowMs;
          return h(
            'tr',
            { class: player.connected ? '' : 'dim' },
            h('td', {}, who(player)),
            h('td', { class: slow ? 'warn' : '' }, ms(rtt), slow ? ' ⚠' : ''),
            h('td', {}, sync ? `${signed(sync.offset)} ms` : '—'),
            h('td', {}, sync ? `±${ms(sync.err, 1)}` : player.connected ? 'sincronizando…' : '—'),
            h('td', {}, sync?.samples ?? '—'),
          );
        }),
      ),
    );

    const roundTable = round?.ranking.length
      ? h(
          'table',
          {},
          h(
            'thead',
            {},
            h('tr', {}, ['#', 'Jugador', 'Pulsó', 'Llegó', 'Red', 'Origen del tiempo', 'Notas'].map((t) => h('th', {}, t))),
          ),
          h(
            'tbody',
            {},
            round.ranking.map((r) => {
              const meta = r.meta ?? {};
              const notes = [r.nearTie ? 'casi empate' : null, r.beatWinner ? 'pulsó antes que el ganador pero llegó tarde' : null]
                .filter(Boolean)
                .join(' · ');
              return h(
                'tr',
                { class: meta.source && meta.source !== PRESS_SOURCE.SYNCED ? 'warn' : '' },
                h('td', {}, `${r.place}º`),
                h('td', {}, who(r.player)),
                h('td', {}, ms(r.tPress - round.tOpen, 1)),
                h('td', {}, ms(r.tArrival - round.tOpen, 1)),
                h('td', {}, ms(r.tArrival - r.tPress, 1)),
                h('td', {}, SOURCE_TEXT[meta.source] ?? '—'),
                h('td', {}, notes),
              );
            }),
          ),
        )
      : h('p', { class: 'dbg-empty' }, 'Aún no hay pulsaciones.');

    fill(
      root,
      h('header', {}, h('h2', {}, 'Depuración'), h('span', { class: 'dbg-key' }, 'D para cerrar')),
      h('p', { class: 'dbg-help' }, imageInfo()),
      h('h3', {}, 'Relojes'),
      clocks,
      h(
        'p',
        { class: 'dbg-help' },
        'Offset = reloj del presentador − reloj del móvil. Error sinc. = cota del error del offset (RTT mínimo / 2). ',
        `⚠ = la mitad del RTT supera la ventana de decisión (${windowMs} ms).`,
      ),
      h('h3', {}, round ? `Última ronda · pregunta ${round.qid}${round.decided ? '' : ' (abierta)'}` : 'Última ronda'),
      roundTable,
      h(
        'p',
        { class: 'dbg-help' },
        'Pulsó / Llegó = ms desde que se abrió el turno. Red = llegó − pulsó. El orden lo decide "Pulsó"; ',
        `la ventana espera ${windowMs} ms tras la primera llegada; casi empate < ${settings.nearTieMs} ms.`,
      ),
    );
  }

  function toggle(room) {
    root.hidden = !root.hidden;
    render(room);
  }

  return { root, render, toggle };
}
