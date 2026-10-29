// Móvil en el millonario. Según el papel:
//  - quien concursa: la pregunta, las respuestas según las va enseñando el presentador (toca para elegir y otra vez para
//    confirmar; se puede cambiar hasta que el presentador la marque) y sus comodines
//  - el público (sus compañeros): 15 s para votar, sin hablar
//  - el amigo de la llamada: sale de la sala y llama; 30 s cuando lo diga el presentador
//  - los demás: miran (y no soplan)
import { fill, h } from '../shared/dom.js';
import { avatarOf } from '../shared/appearance.js';
import { JOKER_NAMES, jokerIcon } from '../shared/jokerIcons.js';
import { LETTERS, MPHASE } from '../core/millionaire.js';
import { LEVEL_LABELS } from '../core/millionaireMusic.js';

/**
 * @param onAnswer(roundId, index)          elegir (quien concursa) o votar (público)
 * @param onJoker(roundId, kind, target?)   usar un comodín (target: a quién se llama)
 */
export function createMillionairePad({ onAnswer, onJoker }) {
  const root = h('section', { class: 'mill-pad', hidden: true });
  let current = null;
  let selected = null; // {roundId, index}: primer toque (falta confirmar)
  let picking = false; // eligiendo a quién llamar
  let receivedAt = 0;
  let tick = 0;
  let signature = null;

  function render(m, { me, stateReceivedAt }) {
    current = m;
    receivedAt = stateReceivedAt;
    if (selected && (selected.roundId !== m.roundId || m.phase !== MPHASE.PLAYING)) selected = null;
    if (m.phase !== MPHASE.PLAYING || m.role !== 'seat') picking = false;
    // (sin lo que falta de los relojes del público y la llamada: cambia en cada estado y se rehacía todo, con toques perdidos)
    const sig = JSON.stringify([{ ...m, audience: m.audience && { ...m.audience, inMs: m.audience.inMs != null }, call: m.call && { ...m.call, inMs: m.call.inMs != null } }, selected, picking]);
    if (sig === signature) return;
    signature = sig;
    clearInterval(tick);

    const seatName = m.seat?.name ?? '¿?';
    const parts = [h('p', { class: 'ap-label' }, `${seatName}${m.team ? ` · ${m.team.name}` : ''} · ${LEVEL_LABELS[m.level] ?? ''} · ${m.points} ${m.points === 1 ? 'punto' : 'puntos'}`)];

    if (m.role === 'friend') {
      parts.push(
        h('p', { class: 'ap-big' }, '📞 ¡Te llaman!'),
        h('p', { class: 'ap-sub' }, `Sal de la sala con tu móvil y llama a ${seatName}. Puedes buscar la respuesta donde quieras.`),
        m.call?.state === 'running' ? countdown(m.call.inMs) : h('p', { class: 'ap-sub' }, 'Cuando el presentador diga «ya», tendréis 30 segundos.'),
      );
      return fill(root, parts);
    }

    parts.push(h('p', { class: 'mill-q' }, m.text));

    if (m.role === 'voter') {
      parts.push(
        h('p', { class: 'ap-big' }, m.myVote != null ? `Has votado la ${LETTERS[m.myVote]}` : '👥 ¡Vota!'),
        h('p', { class: 'ap-sub' }, `¿Qué debería contestar ${seatName}? ¡Sin hablar!`),
        countdown(m.audience.inMs),
        options(m, { onPick: m.myVote == null ? (i) => pick(i, true) : null, chosen: m.myVote }),
      );
      return fill(root, parts);
    }

    if (m.role === 'seat') {
      if (m.phase === MPHASE.READY) parts.push(h('p', { class: 'ap-big' }, '¡Te toca a ti!'), h('p', { class: 'ap-sub' }, 'Las respuestas van apareciendo aquí y en la tele.'));
      parts.push(options(m, { onPick: m.phase === MPHASE.PLAYING && !picking ? (i) => pick(i, false) : null, chosen: m.phase === MPHASE.PLAYING ? m.choice : m.marked }));
      if (m.phase === MPHASE.PLAYING) {
        parts.push(
          h(
            'p',
            { class: 'ap-sub' },
            selected ? 'Toca otra vez la misma para confirmar' : m.choice != null ? `Tu respuesta: la ${LETTERS[m.choice]}. Puedes cambiarla hasta que el presentador la marque.` : 'Toca una respuesta y otra vez para confirmar',
          ),
          jokerBar(m),
        );
        if (picking) parts.push(friendPicker(m));
        if (m.call && m.call.state !== 'done') {
          parts.push(
            h('p', { class: 'ap-sub' }, `📞 Llamada con ${m.call.friend?.name ?? '¿?'}`),
            m.call.state === 'running' ? countdown(m.call.inMs) : h('p', { class: 'ap-sub' }, 'Espera a que el presentador diga «ya».'),
          );
        }
      }
    } else {
      // Mirando
      const sameTeam = m.team && me?.teamId === m.team.id;
      parts.push(
        h('p', { class: 'ap-sub' }, sameTeam ? '¡Es de tu equipo! Pero sin soplar 🤐' : `Concursa ${seatName}`),
        options(m, { onPick: null, chosen: m.marked }),
      );
    }

    if (m.phase === MPHASE.MARKED) parts.push(h('p', { class: 'ap-big' }, `Respuesta marcada: ${LETTERS[m.marked]}`));
    if (m.phase === MPHASE.REVEALED && m.result) {
      const mine = m.role === 'seat';
      parts.push(
        h('p', { class: 'ap-big' }, m.result.correct ? '¡Correcta!' : `Era la ${LETTERS[m.correct]}`),
        mine && m.result.correct ? h('p', { class: `ap-points ${m.cheated ? '' : 'plus'}` }, m.cheated ? 'Sin puntos: saliste de la app' : `+${m.points}`) : null,
      );
    }
    fill(root, parts);
  }

  /** Respuestas: solo las que ya se ven (y no quitó el 50:50); con el público, sus porcentajes. */
  function options(m, { onPick, chosen }) {
    const pct = m.audience?.state === 'done' ? m.audience.percentages : null;
    return h(
      'div',
      { class: 'mill-pad-options' },
      Array.from({ length: m.count }, (_, i) => {
        const visible = m.options[i] != null && !m.removed.includes(i);
        const correct = m.phase === MPHASE.REVEALED && m.correct === i;
        return h(
          'button',
          {
            type: 'button',
            class: `mill-pad-opt ${chosen === i ? 'chosen' : ''} ${selected?.index === i ? 'selected' : ''} ${correct ? 'correct' : ''}`,
            disabled: !visible || !onPick,
            onclick: () => onPick?.(i),
          },
          h('span', { class: 'mill-letter' }, `${LETTERS[i]}:`),
          h('span', { class: 'mill-text' }, visible ? m.options[i] : ''),
          pct && visible ? h('span', { class: 'mill-pct' }, `${pct[i]}%`) : null,
        );
      }),
    );
  }

  /** Primer toque marca, segundo confirma. */
  function pick(i, isVote) {
    if (selected?.index === i && selected.roundId === current.roundId) {
      selected = null;
      onAnswer(current.roundId, i);
      navigator.vibrate?.(30);
      return;
    }
    selected = { roundId: current.roundId, index: i };
    signature = null;
    render(current, { me: null, stateReceivedAt: receivedAt });
  }

  function jokerBar(m) {
    const waiting = m.shown < m.count;
    return [
      h(
        'div',
        { class: 'mill-pad-jokers' },
        ['fifty', 'audience', 'call'].map((kind) => {
          const left = m.jokers?.[kind] ?? 0;
          const ready = isArmed(kind);
          const btn = h(
            'button',
            {
              type: 'button',
              class: `mill-joker-btn ${ready ? 'armed' : ''}`,
              disabled: left <= 0 || waiting,
              'aria-label': `Comodín ${JOKER_NAMES[kind]}`,
              onclick: () => {
                if (kind === 'call') {
                  picking = !picking;
                  signature = null;
                  return render(current, { me: null, stateReceivedAt: receivedAt });
                }
                // dos toques: el primero pregunta («¿Seguro?»), el segundo lo usa
                if (!confirmTap(kind)) return;
                onJoker(m.roundId, kind);
              },
            },
            jokerIcon(kind, { used: left <= 0 }),
            h('small', {}, ready ? '¿Seguro? Toca otra vez' : JOKER_NAMES[kind]),
          );
          return btn;
        }),
      ),
      waiting && Object.values(m.jokers ?? {}).some((n) => n > 0) ? h('p', { class: 'ap-sub small' }, 'Los comodines se pueden usar cuando estén todas las respuestas a la vista.') : null,
    ];
  }

  /** Confirmar con un segundo toque (en vez de confirm(), que congela la página y la conexión). */
  let armed = null; // {key, until}
  const isArmed = (key) => armed?.key === key && performance.now() < armed.until;
  function confirmTap(key) {
    if (isArmed(key)) {
      armed = null;
      return true;
    }
    armed = { key, until: performance.now() + 4000 };
    signature = null;
    render(current, { me: null, stateReceivedAt: receivedAt });
    setTimeout(() => {
      if (armed?.key !== key) return;
      armed = null;
      signature = null;
      if (current) render(current, { me: null, stateReceivedAt: receivedAt });
    }, 4100);
    return false;
  }

  function friendPicker(m) {
    const list = m.callable ?? [];
    return h(
      'div',
      { class: 'mill-friends' },
      h('p', { class: 'ap-sub' }, list.length ? '¿A quién llamas? Saldrá de la sala para buscar la respuesta.' : 'No hay nadie de tu equipo a quien llamar.'),
      list.map((p) =>
        h(
          'button',
          {
            type: 'button',
            class: `btn ${isArmed(`call:${p.id}`) ? 'primary' : ''}`,
            onclick: () => {
              if (!confirmTap(`call:${p.id}`)) return;
              picking = false;
              onJoker(m.roundId, 'call', p.id);
            },
          },
          h('span', { class: 'emoji' }, avatarOf(p)),
          isArmed(`call:${p.id}`) ? ` ¿Llamar a ${p.name}? Toca otra vez` : ` ${p.name}`,
        ),
      ),
    );
  }

  /** Reloj de la llamada o del público (con el tiempo que quedaba al llegar el estado). */
  function countdown(inMs) {
    const el = h('p', { class: 'ap-count mill-count' });
    const end = receivedAt + (inMs ?? 0);
    const step = () => {
      const left = Math.max(0, end - performance.now());
      el.textContent = String(Math.ceil(left / 1000));
    };
    step();
    clearInterval(tick);
    tick = setInterval(step, 200);
    return el;
  }

  return {
    root,
    render,
    show() {
      root.hidden = false;
    },
    hide() {
      root.hidden = true;
      clearInterval(tick);
      signature = null;
      current = null;
    },
  };
}
