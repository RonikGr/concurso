// Móvil en Squid Games: cada juego con lo suyo (mantener el botón en Luz roja, repasar la galleta del panal con el dedo,
// izquierda o derecha en el puente, tocar rápido en la cuerda, esconder y apostar canicas) y, si te eliminan, «💀».
// Lo que manda va en `play {game: 'squid', roundId, action, value}` (send).
import { fill, h } from '../shared/dom.js';
import { DALGONA_SHAPES, createTrace, isBroken, isDone, traceLift, traceMove, traceProgress } from '../core/dalgona.js';

const RED_GRACE_MS = 450; // como en core/squid.js: al ponerse en rojo, un momento para soltar
const MOVE_JERK = 3.2; // sacudida (m/s²) que cuenta como moverse en rojo (quieto en la mano no llega)
const REPORT_MS = 300;
const num = (n) => (n == null ? '' : `Nº ${String(n).padStart(3, '0')}`);

/**
 * @param send (action, roundId, value?)
 * @param toLocal (tHost) → reloj local, o null sin sincronizar
 * @param toHost (tLocal) → reloj de la tele, o null sin sincronizar
 */
export function createSquidPad({ send, toLocal, toHost, vibrate = () => {} }) {
  const root = h('section', { class: 'squid-pad', hidden: true });
  let state = null;
  let receivedAt = 0;
  let signature = null;
  let cleanup = []; // temporizadores y escuchas de la escena montada

  const local = (tHost) => (tHost == null ? null : (toLocal(tHost) ?? receivedAt + (tHost - state.now)));
  const hostNow = (tLocal) => toHost(tLocal) ?? -1; // -1: la tele cuenta cuando llega

  function clear() {
    for (const fn of cleanup) fn();
    cleanup = [];
  }
  function every(ms, fn) {
    const t = setInterval(fn, ms);
    cleanup.push(() => clearInterval(t));
  }
  function listen(target, type, fn, opts) {
    target.addEventListener(type, fn, opts);
    cleanup.push(() => target.removeEventListener(type, fn, opts));
  }

  // Sensor de movimiento (Luz roja): en iPhone hay que pedir permiso con un toque
  const needsPermission = 'DeviceMotionEvent' in window && typeof DeviceMotionEvent.requestPermission === 'function';
  let motionGranted = !needsPermission && 'DeviceMotionEvent' in window;
  async function askMotion() {
    try {
      motionGranted = (await DeviceMotionEvent.requestPermission()) === 'granted';
    } catch {
      motionGranted = false;
    }
    signature = null;
    render(state, receivedAt);
  }

  // Lo que el móvil lleva por su cuenta en cada ronda (avance, repaso, toques), para no perderlo al repintar
  const mine = { roundId: null, progress: 0, faulted: false, trace: null, taps: 0, guess: 0, bet: 1, sent: null };
  function freshRound(s) {
    if (mine.roundId === s.roundId) return;
    Object.assign(mine, { roundId: s.roundId, progress: s.progress ?? 0, faulted: false, trace: null, taps: 0, guess: 0, bet: 1, sent: null });
  }

  function render(s, stateReceivedAt) {
    state = s;
    receivedAt = stateReceivedAt;
    freshRound(s);
    const sig = JSON.stringify([s.game, s.roundId, s.phase, s.status, s.playing, s.out, discrete(s), motionGranted]);
    if (sig === signature) return;
    signature = sig;
    clear();
    fill(root, h('p', { class: 'sq-me' }, h('span', { class: 'sq-shapes' }, '○ △ □'), ' ', num(s.number), s.status === 'out' ? ' · 💀' : ''), body(s));
  }

  /** Lo que obliga a repintar (lo continuo, como el avance o la cuerda, se pinta solo). */
  function discrete(s) {
    switch (s.game) {
      case 'luzroja':
        return [s.crossed, s.fallen];
      case 'panal':
        return [s.shape, s.state];
      case 'puente':
        return [s.turn, s.pos, s.current?.id, s.last?.step, s.crossed];
      case 'cuerda':
        return [s.winner];
      case 'canicas':
        return [s.role, s.mine, s.theirs, s.last?.amount ?? null, s.lost, s.won, s.bye];
      case 'hucha':
        return [s.awarded, s.aliveCount];
    }
    return null;
  }

  function body(s) {
    if (s.game === 'hucha') {
      if (s.awarded != null) return msg('🐷', '¡Has sobrevivido!', `Te llevas ${s.awarded} ${s.awarded === 1 ? 'punto' : 'puntos'} de la hucha.`);
      return msg('🐷', `La hucha: ${s.pot} puntos`, `Se la reparten los ${s.aliveCount} supervivientes. ¡Mira la tele!`);
    }
    if (s.status === 'watching') return msg('👀', 'Miras desde fuera', `${s.icon} ${s.label}: ¡mira la tele!`);
    if (!s.playing) return msg('💀', 'Eliminado', `Ahora: ${s.icon} ${s.label}. Mira cómo caen los demás en la tele.`);
    if (s.phase === 'ready') return ready(s);
    if (s.phase === 'done') return s.out ? msg('💀', '¡Eliminado!', 'Tu juego acaba aquí. La hucha sube…') : msg('✅', '¡Sigues vivo!', 'Pasas al siguiente juego.');
    switch (s.game) {
      case 'luzroja':
        return redLight(s);
      case 'panal':
        return dalgona(s);
      case 'puente':
        return bridge(s);
      case 'cuerda':
        return tug(s);
      case 'canicas':
        return marbles(s);
    }
    return msg(s.icon, s.label, s.rule);
  }

  function msg(icon, title, text) {
    return h('div', { class: 'sq-msg' }, h('p', { class: 'sq-big' }, icon), h('p', { class: 'ap-label' }, title), h('p', { class: 'ap-sub' }, text));
  }

  /** Cuenta atrás 3-2-1 hasta que empieza (en un elemento); luego `then`. */
  function countdown(el, then) {
    const start = local(state.tOpen);
    const step = () => {
      const left = start - performance.now();
      if (left <= 0) {
        el.hidden = true;
        return then?.();
      }
      el.hidden = false;
      el.textContent = String(Math.ceil(left / 1000));
      const t = setTimeout(step, Math.min(200, left));
      cleanup.push(() => clearTimeout(t));
    };
    step();
  }

  function timeLeft(el, endsAtHost) {
    const end = local(endsAtHost);
    const step = () => (el.textContent = `${Math.max(0, Math.ceil((end - performance.now()) / 1000))} s`);
    step();
    every(250, step);
  }

  // ------------------------------------------------------------------ antes de empezar

  function ready(s) {
    const head = [h('p', { class: 'sq-big' }, s.icon), h('p', { class: 'ap-label' }, s.label), h('p', { class: 'ap-sub' }, s.rule)];
    if (s.game === 'luzroja' && needsPermission && !motionGranted) {
      head.push(h('button', { class: 'btn primary big', type: 'button', onclick: askMotion }, '📳 Activar el sensor'), h('p', { class: 'ap-sub' }, 'Así el móvil sabe si te mueves en rojo.'));
    }
    if (s.game === 'panal') {
      if (s.shape) {
        const shape = DALGONA_SHAPES[s.shape];
        head.push(h('p', { class: 'sq-shape-big' }, shape.icon), h('p', { class: 'ap-label' }, `Te ha tocado: ${shape.label}`));
      } else {
        head.push(
          h('p', { class: 'ap-label' }, 'Elige un sobre'),
          h(
            'div',
            { class: 'sq-envelopes' },
            Array.from({ length: s.envelopes ?? 4 }, (_, i) => h('button', { class: 'btn big', type: 'button', onclick: () => send('pick', s.roundId, i) }, `✉️ ${i + 1}`)),
          ),
        );
      }
    }
    head.push(h('p', { class: 'ap-sub' }, 'Espera a que empiece…'));
    return h('div', { class: 'sq-msg' }, ...head);
  }

  // ------------------------------------------------------------------ 1. Luz roja, luz verde

  function redLight(s) {
    if (s.crossed) return msg('🏁', '¡A salvo!', 'Has cruzado la meta. Ahora, quieto y a mirar.');
    if (s.fallen) return msg('💀', '¡Te has movido!', s.fallen === 'time' ? 'Se acabó el tiempo antes de llegar.' : 'Era luz roja.');
    const cues = s.cues.map((c) => ({ at: local(c.t), light: c.light }));
    const lightAt = (t) => {
      let cur = { light: 'red', at: -Infinity };
      for (const c of cues) if (c.at <= t) cur = c;
      return cur;
    };
    const lamp = h('p', { class: 'sq-lamp' }, '…');
    const cd = h('p', { class: 'sq-count', hidden: true });
    const left = h('span', { class: 'sq-left' });
    const bar = h('span', { class: 'sq-progress-bar' });
    const pct = h('span', {});
    const button = h('button', { class: 'sq-hold', type: 'button' }, h('span', {}, 'MANTÉN'), h('small', {}, 'para avanzar'));
    let holding = false;
    let last = performance.now();
    let lastLight = null;
    const fault = (t) => {
      if (mine.faulted) return;
      mine.faulted = true;
      vibrate([200, 80, 200]);
      send('fault', s.roundId, hostNow(t));
    };
    const redFault = (t) => {
      const c = lightAt(t);
      if (c.light === 'red' && t >= cues[0]?.at && t - c.at >= RED_GRACE_MS) fault(t);
    };
    listen(button, 'pointerdown', (e) => {
      e.preventDefault();
      holding = true;
      button.classList.add('down');
      redFault(Math.abs(e.timeStamp - performance.now()) < 1000 ? e.timeStamp : performance.now());
    });
    for (const type of ['pointerup', 'pointercancel', 'pointerleave']) {
      listen(button, type, () => {
        holding = false;
        button.classList.remove('down');
      });
    }
    listen(button, 'contextmenu', (e) => e.preventDefault());
    // Moverse con la luz roja (si hay sensor)
    let prev = null;
    if (motionGranted) {
      listen(window, 'devicemotion', (e) => {
        const a = e.accelerationIncludingGravity ?? e.acceleration;
        if (!a) return;
        const v = [a.x ?? 0, a.y ?? 0, a.z ?? 0];
        if (prev && Math.hypot(v[0] - prev[0], v[1] - prev[1], v[2] - prev[2]) > MOVE_JERK) redFault(performance.now());
        prev = v;
      });
    }
    every(50, () => {
      const now = performance.now();
      const dt = now - last;
      last = now;
      const c = lightAt(now);
      if (c.light !== lastLight) {
        lastLight = c.light;
        if (c.light === 'green') mine.faulted = false; // un aviso por cada luz roja (la tele decide)
        lamp.dataset.light = c.at === -Infinity ? 'wait' : c.light;
        lamp.textContent = c.at === -Infinity ? 'Preparados…' : c.light === 'green' ? '🟢 ¡LUZ VERDE!' : '🔴 ¡LUZ ROJA!';
        if (c.light === 'red' && c.at !== -Infinity) vibrate(60);
      }
      if (holding && c.light === 'green' && c.at !== -Infinity && !mine.faulted) mine.progress = Math.min(100, mine.progress + dt * s.speed);
      if (holding) redFault(now);
      bar.style.width = `${mine.progress}%`;
      pct.textContent = `${Math.floor(mine.progress)} %`;
    });
    every(REPORT_MS, () => {
      if (mine.sent !== mine.progress) {
        mine.sent = mine.progress;
        send('p', s.roundId, Math.round(mine.progress * 10) / 10);
      }
    });
    countdown(cd);
    timeLeft(left, s.endsAt);
    return h(
      'div',
      { class: 'sq-play' },
      h('div', { class: 'sq-row' }, lamp, left),
      cd,
      h('div', { class: 'sq-progress' }, bar, pct),
      button,
      h('p', { class: 'ap-sub' }, motionGranted ? '📳 En rojo: ¡ni te muevas! El móvil lo nota.' : 'En rojo, suelta el botón.'),
    );
  }

  // ------------------------------------------------------------------ 2. El panal

  function dalgona(s) {
    if (s.state === 'done') return msg('✅', '¡Galleta perfecta!', 'Has sacado la forma entera.');
    if (s.state === 'broken') return msg('💔', '¡Se ha roto!', 'Te has salido demasiado.');
    if (!s.shape) return msg('🍪', 'Sin galleta', 'Mira la tele.');
    mine.trace ??= createTrace(s.shape);
    const t = mine.trace;
    const shape = DALGONA_SHAPES[s.shape];
    const canvas = h('canvas', { class: 'sq-canvas' });
    const info = h('p', { class: 'ap-label' });
    const cd = h('p', { class: 'sq-count', hidden: true });
    const left = h('span', { class: 'sq-left' });
    const size = Math.round(Math.min(innerWidth - 32, innerHeight * 0.55, 520));
    const dpr = devicePixelRatio || 1;
    canvas.width = canvas.height = size * dpr;
    canvas.style.width = canvas.style.height = `${size}px`;
    const ctx = canvas.getContext('2d');
    let open = false;
    const draw = () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size, size);
      // la galleta
      ctx.fillStyle = '#d29a3a';
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, size * 0.48, 0, Math.PI * 2);
      ctx.fill();
      // la forma (pendiente) y lo repasado
      t.points.forEach(([x, y], i) => {
        ctx.fillStyle = t.done[i] ? '#fff7d6' : '#7a4a10';
        ctx.beginPath();
        ctx.arc(x * size, y * size, t.done[i] ? size * 0.012 : size * 0.007, 0, Math.PI * 2);
        ctx.fill();
      });
      info.textContent = `${shape.icon} ${Math.floor(traceProgress(t) * 100)} % · ${'💔'.repeat(t.cracks)}${'🤍'.repeat(Math.max(0, 3 - t.cracks))}`;
    };
    const report = () => send('trace', s.roundId, [Math.floor(traceProgress(t) * 100), t.cracks, isDone(t) ? 1 : isBroken(t) ? 2 : 0]);
    let lastSent = 0;
    const at = (e) => {
      const r = canvas.getBoundingClientRect();
      return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height];
    };
    listen(canvas, 'pointerdown', (e) => {
      if (!open) return;
      e.preventDefault();
      canvas.setPointerCapture?.(e.pointerId);
      const before = t.cracks;
      traceMove(t, ...at(e));
      if (t.cracks > before) vibrate(120);
      draw();
    });
    listen(canvas, 'pointermove', (e) => {
      if (!open || !(e.buttons || e.pressure)) return;
      const before = t.cracks;
      const moves = e.getCoalescedEvents?.() ?? []; // todos los puntos del movimiento (algunos navegadores no los dan)
      for (const ev of moves.length ? moves : [e]) traceMove(t, ...at(ev));
      if (t.cracks > before) vibrate(120);
      draw();
      if (isDone(t) || isBroken(t)) {
        report();
        open = false;
        return;
      }
      if (performance.now() - lastSent > REPORT_MS) {
        lastSent = performance.now();
        report();
      }
    });
    for (const type of ['pointerup', 'pointercancel']) listen(canvas, type, () => traceLift(t));
    draw();
    countdown(cd, () => (open = true));
    timeLeft(left, s.endsAt);
    return h('div', { class: 'sq-play' }, h('div', { class: 'sq-row' }, info, left), cd, canvas, h('p', { class: 'ap-sub' }, 'Repasa la línea con el dedo, despacio. Si te sales, la galleta se agrieta (3 grietas = rota).'));
  }

  // ------------------------------------------------------------------ 3. El puente de cristal

  function bridge(s) {
    if (s.crossed) return msg('🏁', '¡Has cruzado!', 'Ya conocéis el camino.');
    const steps = h('p', { class: 'ap-sub' }, `Tramo ${Math.min(s.pos + 1, s.steps)} de ${s.steps}`);
    const last = s.last ? h('p', { class: `sq-last ${s.last.ok ? 'ok' : 'ko'}` }, s.last.ok ? '¡Ese aguantó!' : '💥 ¡Crash!') : null;
    if (!s.turn) {
      const ahead = s.current ? `Le toca a ${num(s.current.number)} ${s.current.name}` : 'Esperando…';
      return h('div', { class: 'sq-msg' }, h('p', { class: 'sq-big' }, '🌉'), h('p', { class: 'ap-label' }, ahead), steps, last, h('p', { class: 'ap-sub' }, s.place >= 0 ? `Tú sales el ${s.place + 1}º. ¡Mira bien qué cristales aguantan!` : ''));
    }
    const left = h('span', { class: 'sq-left' });
    const cd = h('p', { class: 'sq-count', hidden: true });
    let sent = false;
    const pick = (i) => {
      if (sent) return;
      sent = true;
      vibrate(40);
      send('choose', s.roundId, i);
    };
    countdown(cd);
    timeLeft(left, s.turnEndsAt);
    return h(
      'div',
      { class: 'sq-play' },
      h('div', { class: 'sq-row' }, h('p', { class: 'ap-label' }, '¡Te toca!'), left),
      cd,
      steps,
      last,
      h('div', { class: 'sq-sides2' }, h('button', { class: 'btn big sq-glass', type: 'button', onclick: () => pick(0) }, '⬅️', h('small', {}, 'Izquierda')), h('button', { class: 'btn big sq-glass', type: 'button', onclick: () => pick(1) }, '➡️', h('small', {}, 'Derecha'))),
      h('p', { class: 'ap-sub' }, 'Si no eliges a tiempo, te empujan.'),
    );
  }

  // ------------------------------------------------------------------ 4. Tira y afloja

  function tug(s) {
    if (s.winner) return s.winner === s.side ? msg('💪', '¡Habéis ganado!', 'Seguís vivos.') : msg('🕳️', '¡Habéis caído!', 'El otro bando tiraba más.');
    const cd = h('p', { class: 'sq-count', hidden: true });
    const count = h('strong', { class: 'sq-taps' }, String(mine.taps));
    const left = h('span', { class: 'sq-left' });
    let open = false;
    const pad = h('button', { class: 'sq-tap', type: 'button' }, h('span', {}, '¡TIRA!'), count);
    listen(pad, 'pointerdown', (e) => {
      e.preventDefault();
      if (!open) return;
      mine.taps++;
      count.textContent = String(mine.taps);
    });
    every(250, () => {
      if (open && mine.sent !== mine.taps) {
        mine.sent = mine.taps;
        send('taps', s.roundId, mine.taps);
      }
    });
    countdown(cd, () => (open = true));
    timeLeft(left, s.endsAt);
    return h('div', { class: 'sq-play' }, h('div', { class: 'sq-row' }, h('p', { class: 'ap-label' }, `Bando ${s.side === 'A' ? '○' : '△'} · ${s.mates} contra ${s.rivals}`), left), cd, pad, h('p', { class: 'ap-sub' }, 'Toca lo más rápido que puedas: cuenta la media de tu bando.'));
  }

  // ------------------------------------------------------------------ 5. Canicas

  function marbles(s) {
    if (s.bye) return msg('🍀', 'Sin pareja', 'Te salvas sin jugar esta vez.');
    if (s.lost) return msg('💀', 'Sin canicas', `${s.rival.name} te ha ganado.`);
    if (s.won) return msg('🔮', '¡Has ganado el duelo!', `${s.rival.name} se ha quedado sin canicas.`);
    const left = h('span', { class: 'sq-left' });
    timeLeft(left, s.endsAt);
    const score = h('p', { class: 'sq-score' }, h('span', {}, `Tú ${s.mine}`), ' 🔮 ', h('span', {}, `${s.theirs} ${s.rival.name}`));
    const l = s.last;
    const lastLine = l ? h('p', { class: `sq-last ${l.right === (l.guesser !== s.rival.id) ? 'ok' : 'ko'}` }, `Escondió ${l.hidden} · dijo ${l.parity ? 'nones' : 'pares'} y apostó ${l.bet}: ${l.right ? 'acertó' : 'falló'}`) : null;
    let action;
    if (s.role === 'hide') {
      action = [
        h('p', { class: 'ap-label' }, '¿Cuántas escondes en la mano?'),
        h(
          'div',
          { class: 'sq-numbers' },
          Array.from({ length: s.mine }, (_, i) => h('button', { class: 'btn', type: 'button', onclick: () => send('hide', s.roundId, i + 1) }, String(i + 1))),
        ),
      ];
    } else if (s.role === 'guess') {
      mine.bet = Math.min(Math.max(1, mine.bet), s.mine);
      const betEl = h('strong', { class: 'sq-bet' }, String(mine.bet));
      const parity = [h('button', { class: `btn big ${mine.guess === 0 ? 'primary' : ''}`, type: 'button' }, 'Pares'), h('button', { class: `btn big ${mine.guess === 1 ? 'primary' : ''}`, type: 'button' }, 'Nones')];
      parity.forEach((b, i) =>
        b.addEventListener('click', () => {
          mine.guess = i;
          parity.forEach((x, k) => x.classList.toggle('primary', k === i));
        }),
      );
      const setBet = (d) => {
        mine.bet = Math.min(s.mine, Math.max(1, mine.bet + d));
        betEl.textContent = String(mine.bet);
      };
      action = [
        h('p', { class: 'ap-label' }, `${s.rival.name} ya ha escondido. ¿Pares o nones?`),
        h('div', { class: 'sq-sides2' }, parity),
        h('div', { class: 'sq-row center' }, h('button', { class: 'btn', type: 'button', onclick: () => setBet(-1) }, '−'), h('span', {}, 'Apuestas '), betEl, h('button', { class: 'btn', type: 'button', onclick: () => setBet(1) }, '+')),
        h('button', { class: 'btn primary big', type: 'button', onclick: () => send('guess', s.roundId, [mine.guess, mine.bet]) }, '¡Apostar!'),
      ];
    } else {
      action = [h('p', { class: 'ap-label' }, `Esperando a ${s.rival.name}…`)];
    }
    return h('div', { class: 'sq-play' }, h('div', { class: 'sq-row' }, h('p', { class: 'ap-label' }, `Contra ${num(s.rival.number)}`), left), score, lastLine, ...action);
  }

  return {
    root,
    render,
    show() {
      root.hidden = false;
    },
    hide() {
      if (root.hidden) return;
      root.hidden = true;
      clear();
      signature = null;
    },
  };
}
