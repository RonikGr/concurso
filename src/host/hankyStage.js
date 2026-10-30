// Pantalla de la tele en El pañuelo (Hombres lobo contra Vampiros): el marcador de duelos arriba; en el centro, el
// pañuelo; a cada lado, quién sale de cada equipo. Al llamar a una pareja, una ruleta de caras en cada lado se para en
// el elegido; luego cuenta atrás, «¡YA!» con silbato y reloj; al decir el presentador quién gana, el ganador brilla. Al
// acabar todos los duelos, el equipo campeón. Cada animación se ve una vez (no se repite al repintar).
import { fill, h } from '../shared/dom.js';
import { avatarOf, getColor } from '../shared/appearance.js';
import { kinetic } from './fx/motion.js';
import { sound } from './fx/audio.js';
import { burst, celebrate } from './fx/confetti.js';
import { formatClock } from './freeStage.js';
import { HANKY_REVEAL_MS } from '../core/hanky.js';

const ICON = { wolf: '🐺', vampire: '🧛' };
const ROULETTE_MS = HANKY_REVEAL_MS; // la ruleta de caras hasta pararse en el elegido (y ¡ya!)

export function createHankyStage() {
  const root = h('section', { class: 'hanky-stage' });
  const seen = new Set(); // animaciones ya vistas (por clave)
  let timers = [];
  let raf = 0;

  function stop() {
    timers.forEach(clearTimeout);
    timers = [];
    clearTimeout(raf);
  }
  const later = (ms, fn) => timers.push(setTimeout(fn, ms));
  /** ¿Primera vez que se ve esto? (y queda apuntado) */
  const first = (key) => !seen.has(key) && !!seen.add(key);

  function render(view) {
    stop();
    const v = view.hanky;
    if (!v) return;
    const c = v.current;
    root.dataset.step = v.finished ? 'final' : (c?.step ?? 'wait');
    const teamName = (side) => v.teams[side]?.name ?? (side === 'wolf' ? 'Hombres lobo' : 'Vampiros');
    const teamColor = (side) => getColor(v.teams[side]?.color ?? (side === 'wolf' ? 'azul' : 'rojo')).bg;

    const scoreboard = h(
      'header',
      { class: 'hk-score' },
      h('div', { class: 'hk-team wolf', style: { '--tc': teamColor('wolf') } }, h('span', { class: 'hk-team-icon' }, ICON.wolf), h('span', { class: 'hk-team-name' }, teamName('wolf')), h('strong', {}, String(v.score.wolf))),
      h('p', { class: 'hk-count' }, v.finished ? 'Final' : v.number ? `Duelo ${v.number} de ${v.total}` : `${v.total} duelos`),
      h('div', { class: 'hk-team vampire', style: { '--tc': teamColor('vampire') } }, h('strong', {}, String(v.score.vampire)), h('span', { class: 'hk-team-name' }, teamName('vampire')), h('span', { class: 'hk-team-icon' }, ICON.vampire)),
    );

    if (v.finished) return renderFinal(v, scoreboard, teamName);

    const center = h('div', { class: 'hk-center' }, hankySvg());
    const status = h('p', { class: 'hk-status display' });
    const clock = h('p', { class: 'hk-clock' });
    center.append(status, clock);
    const side = (s) => h('div', { class: `hk-side ${s}`, style: { '--tc': teamColor(s) } });
    const wolfSide = side('wolf');
    const vampSide = side('vampire');

    fill(root, scoreboard, h('div', { class: 'hk-arena' }, wolfSide, center, vampSide), rosters(v));

    if (!c) {
      wolfSide.append(mystery('wolf'));
      vampSide.append(mystery('vampire'));
      status.textContent = '¿Quién saldrá?';
      clock.textContent = `${v.points} puntos para quien coja el pañuelo`;
      return;
    }

    // La pareja: en la llamada, ruleta de caras (una vez); luego, sus fichas
    const pool = (s) => (s === 'wolf' ? v.wolves : v.vampires);
    const card = (s) => fighter(c[s], s, c.winner);
    // (la ruleta va con el reloj de la tele: si se repinta a mitad, sigue donde iba)
    const rouletteKey = `ruleta|${v.key}|${c.calledAt}`;
    const spinLeft = c.calledAt + ROULETTE_MS - performance.now();
    // (con el sorteo ya está en marcha: al pararse la ruleta es el «¡YA!»; se vuelve a pintar entonces)
    if (c.step !== 'done' && spinLeft > 0) {
      spin(wolfSide, pool('wolf'), 'wolf', spinLeft);
      spin(vampSide, pool('vampire'), 'vampire', spinLeft);
      if (first(`${rouletteKey}|redoble`)) sound.play('drumroll');
      later(spinLeft, () => {
        if (first(`${rouletteKey}|golpe`)) {
          sound.play('howl', 300);
          sound.play('hiss', 1100);
        }
        render(view);
      });
      status.textContent = c.mode === 'secret' ? 'El presentador ha elegido…' : '¿Quién sale?';
      return;
    }
    wolfSide.append(card('wolf'));
    vampSide.append(card('vampire'));

    if (c.step === 'called') {
      status.textContent = '¡Al sillón!';
      clock.textContent = 'Sentados… y atentos a la señal';
      return;
    }
    if (c.step === 'running') {
      // Cuenta atrás hasta goAt; luego «¡YA!» (silbato una vez) y el reloj
      const goKey = `ya|${v.key}|${c.goAt}`;
      let lastN = null;
      const tick = () => {
        const left = c.goAt - performance.now();
        if (left > 0) {
          const n = Math.ceil(left / 1000);
          if (n !== lastN) {
            lastN = n;
            status.textContent = String(n);
            status.dataset.mode = 'count';
            if (!seen.has(`${goKey}|${n}`)) {
              seen.add(`${goKey}|${n}`);
              sound.play('count');
            }
          }
        } else {
          if (status.dataset.mode !== 'go') {
            status.textContent = '¡YA!';
            status.dataset.mode = 'go';
            if (first(goKey)) {
              sound.play('whistle');
              root.animate([{ filter: 'brightness(1.8)' }, { filter: 'none' }], { duration: 500 });
            }
          }
          clock.textContent = formatClock(-left);
        }
        raf = setTimeout(tick, 50); // no rAF: el navegador lo frena si la ventana no se ve
      };
      tick();
      return;
    }
    // Resultado del duelo
    const winner = c.winner;
    status.textContent = `¡Gana ${c[winner].name}!`;
    status.dataset.mode = 'win';
    clock.textContent = `+${v.points} ${ICON[winner]}`;
    if (first(`gana|${v.key}|${c.calledAt}|${v.duels.length}`)) {
      sound.play('fanfare');
      sound.play(winner === 'wolf' ? 'howl' : 'hiss', 300);
      burst({ x: winner === 'wolf' ? 0.25 : 0.75, y: 0.5, count: 80 });
    }
  }

  /** Al acabar todos los duelos: el equipo campeón y cómo fue cada duelo. */
  function renderFinal(v, scoreboard, teamName) {
    const champ = v.champion;
    // (el nombre tal cual: «¡Ganan los Equipo rojo!» no se puede decir)
    const title = champ === 'tie' ? '¡Empate entre lobos y vampiros!' : `🏆 ${teamName(champ)}, campeones`;
    fill(
      root,
      scoreboard,
      h('div', { class: `hk-final ${champ}` }, h('p', { class: 'hk-final-icon' }, champ === 'tie' ? `${ICON.wolf} ${ICON.vampire}` : ICON[champ]), kinetic('h2', 'hk-final-title display', title), h('p', { class: 'hk-final-score' }, `${v.score.wolf} – ${v.score.vampire}`)),
      h(
        'ol',
        { class: 'hk-history' },
        v.duels.map((d) => h('li', {}, h('span', { class: d.winner === 'wolf' ? 'won' : '' }, `${ICON.wolf} ${d.wolf}`), h('small', {}, d.ms != null ? formatClock(d.ms) : 'vs'), h('span', { class: d.winner === 'vampire' ? 'won' : '' }, `${d.vampire} ${ICON.vampire}`))),
      ),
    );
    if (first(`final|${v.key}|${v.duels.length}`)) {
      sound.play('roll');
      sound.play('fanfare', 900);
      if (champ !== 'tie') sound.play(champ === 'wolf' ? 'howl' : 'hiss', 1800);
      later(900, () => celebrate(3500));
    }
  }

  /** Ruleta de caras de un lado durante `ms`: va pasando su gente cada vez más despacio (luego sale el elegido). */
  function spin(el, list, side, ms) {
    const slot = h('div', { class: `hk-fighter spinning ${side}` });
    el.append(slot);
    let t = 0;
    let i = Math.floor(Math.random() * list.length);
    for (let step = Math.round((1 - ms / ROULETTE_MS) * 15); t < ms - 120 && list.length; step++) {
      const p = list[i++ % list.length];
      later(t, () => {
        fill(slot, h('div', { class: 'hk-face emoji' }, avatarOf(p)), h('p', { class: 'hk-name' }, p.name));
        if (side === 'wolf') sound.play('blip');
      });
      t += 60 + step * step * 1.6; // cada vez más despacio
    }
  }

  return { root, render, stop };
}

/** Sin pareja todavía: la silueta del equipo con interrogación. */
function mystery(side) {
  return h('div', { class: `hk-fighter mystery ${side}` }, h('div', { class: 'hk-face emoji' }, ICON[side]), h('p', { class: 'hk-name' }, '?'));
}

/** Ficha de quien sale (grande, con su cara o icono); el ganador brilla y el que pierde se apaga. */
function fighter(p, side, winner) {
  const state = winner ? (winner === side ? 'won' : 'lost') : '';
  return h(
    'div',
    { class: `hk-fighter ${side} ${state}` },
    h('div', { class: 'hk-face emoji' }, avatarOf(p)),
    kinetic('p', 'hk-name', p.name, { step: 40 }),
    p.fought > (winner ? 1 : 0) ? h('p', { class: 'hk-again' }, '¡Repite!') : null,
    state === 'won' ? h('p', { class: 'hk-trophy' }, '🏆') : null,
  );
}

/** Quién falta por salir de cada equipo (los que ya han salido, apagados). */
function rosters(v) {
  const list = (people, side) =>
    h(
      'ul',
      { class: `hk-roster ${side}` },
      people.map((p) => h('li', { class: p.fought ? 'done' : '', title: p.name, style: { '--pc': getColor(p.color).bg } }, h('span', { class: 'emoji' }, avatarOf(p)), h('span', {}, p.name))),
    );
  return h('div', { class: 'hk-rosters' }, list(v.wolves, 'wolf'), list(v.vampires, 'vampire'));
}

/** El pañuelo blanco colgando de una mano, en el centro. */
function hankySvg() {
  const el = h('div', { class: 'hk-hanky', 'aria-hidden': 'true' });
  el.innerHTML = `<svg viewBox="0 0 120 170" xmlns="http://www.w3.org/2000/svg">
      <path d="M48 8 q12 -8 24 0 l4 22 q-16 6 -32 0 z" fill="#e9c9a8" stroke="#8a5a3c" stroke-width="2"/>
      <path d="M44 30 q16 6 32 0 l18 108 q-8 18 -20 6 q-6 14 -14 2 q-8 14 -16 0 q-12 12 -18 -6 z" fill="#f7f4ee" stroke="#c9c2b6" stroke-width="2"/>
      <path d="M58 34 l-6 104 M66 34 l8 104" stroke="#d8d1c4" stroke-width="2" fill="none"/>
      <path d="M44 30 q16 6 32 0" stroke="#b5ad9f" stroke-width="3" fill="none"/>
    </svg>`;
  return el;
}
