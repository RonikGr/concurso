// Pantalla de la tele en Squid Games: cada juego con su escena (la pista de Luz roja, las galletas del panal, el puente,
// la cuerda, los duelos de canicas), quién va cayendo y la hucha. Los informes continuos (avance, toques) se pintan en
// su sitio, sin volver a montar la escena: así las barras se mueven suaves.
import { fill, h } from '../shared/dom.js';
import { avatarOf, getColor } from '../shared/appearance.js';
import { SPHASE } from '../core/squid.js';
import { DALGONA_SHAPES } from '../core/dalgona.js';
import { sound } from './fx/audio.js';
import { celebrate } from './fx/confetti.js';
import { kinetic } from './fx/motion.js';
import { runRing, timerRing } from './wordsStage.js';

const num = (n) => (n == null ? '' : String(n).padStart(3, '0'));
const GAME_NAMES = { luzroja: 'Luz roja', panal: 'El panal', puente: 'El puente', cuerda: 'Tira y afloja', canicas: 'Canicas', presentador: 'el presentador' };

/** Ficha de un jugador: avatar, número y nombre. */
function badge(p, extra = null) {
  return h(
    'span',
    { class: `sq-badge ${p.out ? 'out' : ''}`, style: { '--pc': getColor(p.color).bg } },
    h('span', { class: 'sq-ava emoji' }, p.out ? '💀' : avatarOf(p)),
    h('span', { class: 'sq-num' }, num(p.number)),
    h('span', { class: 'sq-name' }, p.name),
    extra,
  );
}

/** Hablar (la voz del navegador, en local): «¡Luz roja!». Si no hay voz, no pasa nada. */
function say(text) {
  try {
    if (!('speechSynthesis' in window)) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'es-ES';
    u.rate = 1.05;
    speechSynthesis.speak(u);
  } catch {
    // sin voz
  }
}

export function createSquidStage() {
  const root = h('section', { class: 'squid-stage' });
  let timers = [];
  let ticks = [];
  let key = null; // escena montada: si no cambia, solo se actualiza lo que se mueve
  let update = null; // (vista) → actualizar en su sitio
  let saidFor = null; // ronda ya anunciada (las luces)

  function stop() {
    timers.forEach(clearTimeout);
    ticks.forEach(clearInterval);
    timers = [];
    ticks = [];
    key = null;
    update = null;
  }

  function later(ms, fn) {
    timers.push(setTimeout(fn, Math.max(0, ms)));
  }

  function clock(endsAt, total, cls = '') {
    const el = timerRing(`sq-clock ${cls}`);
    ticks.push(runRing(el, endsAt, total));
    return el;
  }

  /** Cuenta atrás 3-2-1 hasta `tOpen` en un elemento. */
  function countdown(el, tOpen, then) {
    const step = () => {
      const left = tOpen - performance.now();
      if (left <= 0) {
        el.textContent = '';
        el.hidden = true;
        then?.();
        return;
      }
      el.hidden = false;
      el.textContent = String(Math.ceil(left / 1000));
      timers.push(setTimeout(step, Math.min(250, left)));
    };
    step();
  }

  function header(v) {
    return h(
      'div',
      { class: 'sq-head' },
      h('span', { class: 'sq-shapes', 'aria-hidden': 'true' }, '○ △ □'),
      h('span', { class: 'sq-kicker' }, v.game === 'hucha' ? 'Squid Games · Final' : `Squid Games · Juego ${v.step} de ${v.steps - 1}`),
      h('span', { class: 'sq-pot' }, `🐷 ${v.pot} pts · ${v.alive.length} ${v.alive.length === 1 ? 'vivo' : 'vivos'}`),
    );
  }

  function render(view) {
    const v = view.squid;
    const g = v.g;
    const k = JSON.stringify([v.game, g?.roundId, v.phase, v.step, structure(v)]);
    if (k === key && update) return update(v);
    stop();
    key = k;
    if (v.game === 'hucha') return fill(root, header(v), hucha(v));
    if (!g || v.phase === SPHASE.READY) return fill(root, header(v), intro(v));
    if (v.phase === SPHASE.DONE) return fill(root, header(v), done(v));
    const scene = { luzroja, panal, puente, cuerda, canicas }[v.game](v);
    fill(root, header(v), scene);
  }

  /** Lo que obliga a montar la escena otra vez (lo demás se actualiza en su sitio). */
  function structure(v) {
    const g = v.g;
    if (!g) return null;
    switch (v.game) {
      case 'puente':
        return [g.pos, g.moves.length, g.current];
      case 'canicas':
        return g.duels.map((d) => [d.hider, d.hasHidden, d.loser, d.last?.amount ?? null, d.marbles[d.a]]);
      case 'panal':
        return [Object.keys(g.state).length];
    }
    return null;
  }

  // ------------------------------------------------------------------ antes y después de cada juego

  function intro(v) {
    const g = v.g;
    const players = v.alive;
    return h(
      'div',
      { class: 'sq-intro anim-in' },
      h('p', { class: 'sq-icon' }, v.icon),
      kinetic('h1', 'sq-title display', v.label),
      h('p', { class: 'sq-rule' }, v.rule),
      v.game === 'panal' && g ? h('p', { class: 'muted' }, `${g.picked.length} de ${g.players.length} han elegido sobre`) : null,
      h('div', { class: 'sq-roster' }, players.map((p) => badge(p))),
      h('p', { class: 'stage-hint' }, 'Empieza desde el mando (o Espacio)'),
    );
  }

  function done(v) {
    const g = v.g;
    const gone = g.players.filter((p) => p.out);
    const safe = g.players.filter((p) => !p.out);
    sound.play(gone.length ? 'wrong' : 'correct');
    return h(
      'div',
      { class: 'sq-done anim-in' },
      kinetic('h1', 'sq-title display', g.skipped ? 'Este juego se salta' : gone.length ? `${gone.length} ${gone.length === 1 ? 'eliminado' : 'eliminados'}` : '¡Nadie cae!'),
      g.skipped ? h('p', { class: 'sq-rule' }, 'No queda gente suficiente para jugarlo.') : null,
      gone.length ? h('div', { class: 'sq-roster out' }, gone.map((p) => badge(p))) : null,
      h('p', { class: 'sq-rule' }, `Siguen vivos ${safe.length} · la hucha sube a ${v.pot} puntos (${v.perHead} por eliminado)`),
      h('div', { class: 'sq-roster' }, safe.map((p) => badge(p))),
    );
  }

  function hucha(v) {
    later(400, () => {
      sound.play('fanfare');
      celebrate(3500);
    });
    return h(
      'div',
      { class: 'sq-hucha anim-in' },
      h('p', { class: 'sq-pig' }, '🐷'),
      kinetic('h1', 'sq-title display', `${v.pot} puntos`),
      h('p', { class: 'sq-rule' }, v.alive.length ? `${v.alive.length === 1 ? 'El superviviente se lo lleva todo' : `Se reparten entre ${v.alive.length}`}: +${v.share} ${v.alive.length === 1 ? '' : 'cada uno'}` : 'No ha sobrevivido nadie'),
      h('div', { class: 'sq-roster winners' }, v.alive.map((p) => badge(p, h('strong', { class: 'sq-plus' }, `+${v.share}`)))),
      v.fallen.length ? h('p', { class: 'muted' }, `Cayeron: ${v.fallen.map((p) => `${num(p.number)} ${p.name} (${GAME_NAMES[p.game] ?? p.game})`).join(' · ')}`) : null,
    );
  }

  // ------------------------------------------------------------------ 1. Luz roja, luz verde

  function luzroja(v) {
    const g = v.g;
    const light = h('div', { class: 'sq-light' }, h('span', { class: 'sq-doll', 'aria-hidden': 'true' }, '🎎'), h('strong', {}, ''));
    const cd = h('p', { class: 'sq-count display', hidden: true });
    const rows = new Map();
    const lanes = h(
      'ol',
      { class: 'sq-lanes' },
      g.players.map((p) => {
        const bar = h('span', { class: 'sq-runner', style: { '--pc': getColor(p.color).bg } }, h('span', { class: 'emoji' }, avatarOf(p)));
        const li = h('li', { class: '' }, h('span', { class: 'sq-num' }, num(p.number)), h('span', { class: 'sq-lane' }, bar, h('span', { class: 'sq-goal' }, '🏁')));
        rows.set(p.id, { li, bar });
        return li;
      }),
    );
    const paint = (vv) => {
      const gg = vv.g;
      for (const [id, { li, bar }] of rows) {
        const p = gg.progress[id] ?? 0;
        bar.style.setProperty('--p', `${Math.min(100, p)}%`);
        li.className = id in gg.fallen ? 'out' : gg.crossed.includes(id) ? 'safe' : '';
        const fallen = id in gg.fallen;
        if (bar.dataset.fallen !== String(fallen)) {
          if (fallen && bar.dataset.fallen === 'false') sound.play('wrong'); // acaba de caer (no al montar la escena)
          bar.dataset.fallen = String(fallen);
          bar.querySelector('.emoji').replaceChildren(fallen ? '💀' : avatarOf(gg.players.find((x) => x.id === id)));
        }
      }
    };
    paint(v);
    update = paint;
    // Las luces cambian a su hora (temporizadores, no rAF: el navegador lo frena si la ventana no se ve)
    const setLight = (c, speak) => {
      light.dataset.light = c.light;
      light.querySelector('strong').textContent = c.light === 'green' ? '¡LUZ VERDE!' : '¡LUZ ROJA!';
      if (speak) {
        sound.play(c.light === 'green' ? 'go' : 'hit');
        say(c.light === 'green' ? 'Luz verde' : 'Luz roja');
      }
    };
    const now = performance.now();
    const fresh = saidFor !== g.roundId;
    saidFor = g.roundId;
    let current = null;
    for (const c of g.cues) {
      if (c.t <= now) current = c;
      else later(c.t - now, () => setLight(c, true));
    }
    if (current) setLight(current, false);
    else light.dataset.light = 'wait';
    countdown(cd, g.tOpen, null);
    if (fresh && now < g.tOpen) sound.play('count');
    return h('div', { class: 'sq-scene sq-redlight' }, h('div', { class: 'sq-top' }, light, cd, clock(g.endsAt, g.endsAt - g.tOpen)), lanes);
  }

  // ------------------------------------------------------------------ 2. El panal

  function panal(v) {
    const g = v.g;
    const cd = h('p', { class: 'sq-count display', hidden: true });
    countdown(cd, g.tOpen, null);
    const cards = new Map();
    const grid = h(
      'div',
      { class: 'sq-cookies' },
      g.players.map((p) => {
        const shape = DALGONA_SHAPES[g.shapes[p.id]];
        const pct = h('strong', { class: 'sq-pct' });
        const cracks = h('span', { class: 'sq-cracks' });
        const card = h('div', { class: 'sq-cookie', style: { '--pc': getColor(p.color).bg } }, h('span', { class: 'sq-shape' }, shape?.icon ?? '🍪'), badge(p), h('span', { class: 'sq-meter' }, pct, cracks));
        cards.set(p.id, { card, pct, cracks });
        return card;
      }),
    );
    const paint = (vv) => {
      const gg = vv.g;
      for (const [id, c] of cards) {
        const st = gg.state[id];
        c.card.dataset.state = st ?? '';
        c.pct.textContent = st === 'done' ? '✅' : st === 'broken' ? '💀 ¡Rota!' : `${Math.round(gg.progress[id] ?? 0)} %`;
        c.cracks.textContent = '💔'.repeat(Math.min(3, gg.cracks[id] ?? 0));
      }
    };
    paint(v);
    update = paint;
    return h('div', { class: 'sq-scene' }, h('div', { class: 'sq-top' }, cd, clock(g.endsAt, g.endsAt - g.tOpen)), grid);
  }

  // ------------------------------------------------------------------ 3. El puente de cristal

  function puente(v) {
    const g = v.g;
    const byId = new Map(g.players.map((p) => [p.id, p]));
    const last = g.moves.at(-1);
    const known = (step) => g.moves.filter((m) => m.step === step);
    const tiles = Array.from({ length: g.steps }, (_, step) => {
      const ms = known(step);
      const solved = ms.length > 0;
      const safeSide = ms.find((m) => m.ok)?.side ?? (ms[0] ? (ms[0].side === 'L' ? 'R' : 'L') : null);
      const panel = (side) => {
        const broke = ms.some((m) => m.side === side && !m.ok);
        const cls = broke ? 'broken' : solved && safeSide === side ? 'solid' : 'glass';
        return h('span', { class: `sq-panel ${cls} ${last?.step === step && last.side === side ? 'last' : ''}` }, broke ? '💥' : '');
      };
      const here = step === g.pos && g.current;
      return h('div', { class: `sq-step ${here ? 'here' : ''}` }, panel('L'), panel('R'), h('small', {}, String(step + 1)));
    });
    const cur = g.current ? byId.get(g.current) : null;
    if (last && last.id && v.phase === SPHASE.RUNNING) sound.play(last.ok ? 'correct' : 'wrong');
    const cd = h('p', { class: 'sq-count display', hidden: true });
    countdown(cd, g.tOpen, null);
    update = () => {};
    return h(
      'div',
      { class: 'sq-scene sq-bridge' },
      h(
        'div',
        { class: 'sq-top' },
        cur ? h('p', { class: 'sq-turn' }, 'Elige: ', badge(cur)) : null,
        cd,
        g.turnEndsAt ? clock(g.turnEndsAt, v.seconds * 1000, 'small') : null,
      ),
      last ? h('p', { class: `sq-last ${last.ok ? 'ok' : 'ko'}` }, `${num(byId.get(last.id)?.number)} ${byId.get(last.id)?.name}${last.pushed ? ' (empujado)' : ''}: ${last.side === 'L' ? 'izquierda' : 'derecha'} → ${last.ok ? '¡aguanta!' : '¡CRASH! 💀'}`) : null,
      h('div', { class: 'sq-bridge-row' }, h('span', { class: 'sq-shore' }, '🚶'), ...tiles, h('span', { class: 'sq-shore' }, '🏁')),
      h('div', { class: 'sq-roster small' }, g.queue.map((id) => badge({ ...byId.get(id), out: g.moves.some((m) => m.id === id && !m.ok) }))),
    );
  }

  // ------------------------------------------------------------------ 4. Tira y afloja

  function cuerda(v) {
    const g = v.g;
    const byId = new Map(g.players.map((p) => [p.id, p]));
    const marker = h('span', { class: 'sq-knot' }, '🎀');
    const totals = { A: h('strong'), B: h('strong') };
    const cd = h('p', { class: 'sq-count display', hidden: true });
    countdown(cd, g.tOpen, () => sound.play('go'));
    const paint = (vv) => {
      marker.style.setProperty('--x', `${50 + vv.g.rope * 45}%`);
      totals.A.textContent = `${vv.g.totals.A} toques`;
      totals.B.textContent = `${vv.g.totals.B} toques`;
    };
    paint(v);
    update = paint;
    const side = (s) => h('div', { class: `sq-side ${s}` }, h('p', { class: 'sq-side-name' }, s === 'A' ? 'Bando ○' : 'Bando △', ' · ', totals[s]), h('div', { class: 'sq-roster small' }, g.sides[s].map((id) => badge(byId.get(id)))));
    return h(
      'div',
      { class: 'sq-scene sq-tug' },
      h('div', { class: 'sq-top' }, cd, clock(g.endsAt, g.endsAt - g.tOpen)),
      h('div', { class: 'sq-rope' }, h('span', { class: 'sq-pit' }, '🕳️'), marker),
      h('div', { class: 'sq-sides' }, side('A'), side('B')),
    );
  }

  // ------------------------------------------------------------------ 5. Canicas

  function canicas(v) {
    const g = v.g;
    const byId = new Map(g.players.map((p) => [p.id, p]));
    const cd = h('p', { class: 'sq-count display', hidden: true });
    countdown(cd, g.tOpen, null);
    update = () => {};
    const marbles = (n) => h('span', { class: 'sq-marbles' }, '●'.repeat(Math.max(0, n)), h('b', {}, ` ${n}`));
    return h(
      'div',
      { class: 'sq-scene' },
      h('div', { class: 'sq-top' }, cd, clock(g.endsAt, g.endsAt - g.tOpen)),
      h(
        'div',
        { class: 'sq-duels' },
        g.duels.map((d) => {
          const [a, b] = [byId.get(d.a), byId.get(d.b)];
          const l = d.last;
          return h(
            'div',
            { class: `sq-duel ${d.loser ? 'over' : ''}` },
            h('div', { class: 'sq-duel-row' }, badge({ ...a, out: d.loser === d.a }), marbles(d.marbles[d.a])),
            h('div', { class: 'sq-duel-row' }, badge({ ...b, out: d.loser === d.b }), marbles(d.marbles[d.b])),
            h(
              'p',
              { class: 'muted small' },
              d.loser
                ? `💀 ${byId.get(d.loser)?.name}${d.timeUp ? ' (se acabó el tiempo)' : ''}`
                : l
                  ? `${byId.get(l.guesser)?.name} dijo ${l.parity ? 'nones' : 'pares'} (${l.bet}) y eran ${l.hidden}: ${l.right ? '¡acierta!' : 'falla'}`
                  : `Esconde ${byId.get(d.hider)?.name}${d.hasHidden ? ' ✓' : '…'}`,
            ),
          );
        }),
      ),
      g.bye ? h('p', { class: 'muted' }, `${byId.get(g.bye)?.name} no tiene pareja: se salva sin jugar`) : null,
    );
  }

  return { root, render, stop };
}
