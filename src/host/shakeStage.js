// Pantalla de la tele en Agita el móvil: cuenta atrás, la carrera en directo (una barra por jugador, y por equipo) y
// la clasificación con los puntos. Las filas se conservan entre repintados (la carrera se repinta cada 300 ms): así las
// barras crecen suaves en vez de volver a entrar.
import { fill, h } from '../shared/dom.js';
import { avatarOf, getColor } from '../shared/appearance.js';
import { SPHASE } from '../core/shake.js';
import { sound } from './fx/audio.js';
import { kinetic } from './fx/motion.js';
import { runRing, timerRing } from './wordsStage.js';

export function createShakeStage() {
  const root = h('section', { class: 'shake-stage' });
  let tick = 0;
  let countdown = 0;
  let lastKey = null; // fase + ronda: si no cambia, solo se actualizan las barras
  const rows = new Map(); // playerId → {li, bar, num}

  function stop() {
    clearInterval(tick);
    clearInterval(countdown);
    tick = countdown = 0;
    lastKey = null;
  }

  function bars(players, max) {
    // Con más de 8: dos columnas (7 + 7 con dos equipos de 7), para que se vean todos en la tele
    const list = h('ol', { class: `shake-race ${players.length > 8 ? 'many' : ''}`, style: { '--rows': Math.ceil(players.length / 2) } });
    rows.clear();
    for (const p of players) {
      const bar = h('span', { class: 'sr-bar' });
      const num = h('span', { class: 'sr-num' });
      const li = h(
        'li',
        { style: { '--pc': getColor(p.color).bg } },
        h('span', { class: 'mini-avatar emoji', style: { '--pc': getColor(p.color).bg } }, avatarOf(p)),
        h('span', { class: 'sr-name' }, p.name),
        h('span', { class: 'sr-track' }, bar),
        num,
      );
      rows.set(p.id, { li, bar, num });
      list.append(li);
    }
    update(players, max);
    return list;
  }

  /** Solo cambian las barras y las cifras (y el orden, si alguien adelanta). */
  function update(players, max) {
    const list = root.querySelector('.shake-race');
    players.forEach((p, i) => {
      const r = rows.get(p.id);
      if (!r) return;
      r.bar.style.width = `${Math.max(2, (p.total / max) * 100)}%`;
      r.num.textContent = String(p.total);
      r.li.classList.toggle('leader', i === 0 && p.total > 0);
      if (list && list.children[i] !== r.li) list.insertBefore(r.li, list.children[i] ?? null);
    });
  }

  function render(view) {
    const s = view.shake;
    if (!s) return;
    const key = `${s.roundId}|${s.phase}|${s.players.map((p) => p.id).sort().join(',')}`;
    if (key === lastKey && s.phase === SPHASE.RUNNING) {
      update(s.players, s.max);
      renderTeams(s);
      return;
    }
    stop();
    lastKey = key;
    root.dataset.phase = s.phase;
    const header = h('p', { class: 'stage-q' }, [view.section.name, s.rounds > 1 ? `Ronda ${s.round} de ${s.rounds}` : ''].filter(Boolean).join(' · '));

    if (s.phase === SPHASE.READY) {
      return fill(
        root,
        header,
        kinetic('h2', 'shake-title display', '¡Agita el móvil!'),
        h('p', { class: 'answer-prompt' }, `${s.seconds} segundos: gana quien más lo agite. ¡Sujetadlo bien fuerte! 📱💥`),
        h('p', { class: 'muted' }, 'En iPhone, cada uno tiene que tocar «Activar el sensor» en su móvil antes de empezar.'),
      );
    }

    if (s.phase === SPHASE.DONE) {
      const pts = s.points ?? {};
      return fill(
        root,
        header,
        kinetic('h2', 'shake-title display', '¡Tiempo!'),
        h(
          'ol',
          { class: `shake-final ${s.players.length > 8 ? 'many' : ''}`, style: { '--rows': Math.ceil(s.players.length / 2) } },
          s.players.map((p) =>
            h(
              'li',
              { class: p.place === 1 ? 'first' : '' },
              h('span', { class: 'sf-place' }, p.place ? `${p.place}º` : '—'),
              h('span', { class: 'mini-avatar emoji', style: { '--pc': getColor(p.color).bg } }, avatarOf(p)),
              h('span', { class: 'sr-name' }, p.name),
              h('span', { class: 'sr-num' }, String(p.total)),
              pts[p.id] ? h('span', { class: 'sf-pts' }, `+${pts[p.id]}`) : null,
            ),
          ),
        ),
        teamsBlock(s),
      );
    }

    // En marcha: cuenta atrás y luego la carrera
    const ring = timerRing('shake-ring');
    const big = h('p', { class: 'shake-count display' });
    fill(root, header, h('div', { class: 'shake-top' }, ring, big), bars(s.players, s.max), teamsBlock(s));
    const opensAt = s.tOpen;
    let lastN = null;
    const step = () => {
      const left = opensAt - performance.now();
      if (left > 0) {
        const n = Math.ceil(left / 1000);
        big.textContent = String(n);
        if (n !== lastN) sound.play('count');
        lastN = n;
        return;
      }
      big.textContent = '¡YA!';
      clearInterval(countdown);
      if (!tick) {
        sound.play('go');
        tick = runRing(ring, s.endsAt, s.seconds * 1000);
        setTimeout(() => (big.textContent = ''), 900);
      }
    };
    step();
    countdown = setInterval(step, 100);
  }

  function teamsBlock(s) {
    if (!s.teams) return null;
    return h('div', { class: 'shake-teams' }, ...s.teams.map((t) => teamBar(t, s)));
  }

  function teamBar(t, s) {
    const max = Math.max(1, ...s.teams.map((x) => x.total));
    return h(
      'div',
      { class: 'st-team', 'data-team': t.team.id, style: { '--tc': getColor(t.team.color).bg } },
      h('strong', {}, t.team.name),
      h('span', { class: 'sr-track' }, h('span', { class: 'sr-bar', style: { width: `${Math.max(2, (t.total / max) * 100)}%` } })),
      h('span', { class: 'sr-num' }, String(t.total)),
    );
  }

  function renderTeams(s) {
    if (!s.teams) return;
    const max = Math.max(1, ...s.teams.map((x) => x.total));
    for (const t of s.teams) {
      const el = root.querySelector(`.st-team[data-team="${CSS.escape(t.team.id)}"]`);
      if (!el) continue;
      el.querySelector('.sr-bar').style.width = `${Math.max(2, (t.total / max) * 100)}%`;
      el.querySelector('.sr-num').textContent = String(t.total);
    }
  }

  return { root, render, stop };
}
