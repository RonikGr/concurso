// Móvil en Squid Games: tu número de chándal arriba y, en cada juego, lo tuyo (mantener el botón mientras la muñeca
// canta, repasar la galleta con el dedo, saltar en el puente, tirar de la cuerda, esconder y apostar canicas). Si
// caes, «Eliminado». Lo que manda va en `play {game: 'squid', roundId, action, value}` (send).
import './squidPad.css';
import { fill, h } from '../shared/dom.js';
import { BRIDGE_REVEAL_MS, CHANT, chantTimes } from '../core/squid.js';
import { DALGONA_SHAPES, createTrace, isBroken, isDone, shapePoints, traceLift, traceMove, traceProgress } from '../core/dalgona.js';
import { cookie, logo, numText, shape } from '../shared/squidArt.js';

const RED_GRACE_MS = 450; // como en core/squid.js: al ponerse en rojo, un momento para soltar
const MOVE_JERK = 3.2; // sacudida (m/s²) que cuenta como moverse en rojo (quieto en la mano no llega)
const REPORT_MS = 300;
const COUNT_SHAPE = { 3: 'square', 2: 'triangle', 1: 'circle' };
const SIDE_NAME = { L: 'izquierda', R: 'derecha' };
// Lo que hay que hacer en cada juego, en una frase (la regla entera va debajo, en pequeño)
const DO = {
  luzroja: 'Mantén el botón mientras canta. En rojo, ¡quieto!',
  panal: 'Repasa la forma con el dedo sin romperla',
  cuerda: '¡Toca lo más rápido que puedas!',
  canicas: 'Esconde canicas o adivina: ¿pares o nones?',
  puente: '¿Izquierda o derecha? Un cristal aguanta',
};

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
  let live = null; // (estado) → actualizar en su sitio lo continuo (la cuerda…)
  let cleanup = []; // temporizadores y escuchas de la escena montada

  const local = (tHost) => (tHost == null ? null : (toLocal(tHost) ?? receivedAt + (tHost - state.now)));
  const hostNow = (tLocal) => toHost(tLocal) ?? -1; // -1: la tele cuenta cuando llega

  function clear() {
    for (const fn of cleanup) fn();
    cleanup = [];
    live = null;
  }
  function every(ms, fn) {
    const t = setInterval(fn, ms);
    cleanup.push(() => clearInterval(t));
  }
  function after(ms, fn) {
    const t = setTimeout(fn, Math.max(0, ms));
    cleanup.push(() => clearTimeout(t));
  }
  function listen(target, type, fn, opts) {
    target.addEventListener(type, fn, opts);
    cleanup.push(() => target.removeEventListener(type, fn, opts));
  }

  // Sensor de movimiento (Luz roja): en iPhone hay que pedir permiso con un toque
  const needsPermission = 'DeviceMotionEvent' in window && typeof DeviceMotionEvent.requestPermission === 'function';
  let motionGranted = !needsPermission && 'DeviceMotionEvent' in window;
  let motionAsked = false;
  async function askMotion() {
    motionAsked = true;
    try {
      motionGranted = (await DeviceMotionEvent.requestPermission()) === 'granted';
    } catch {
      motionGranted = false;
    }
    signature = null;
    render(state, receivedAt);
  }

  // Lo que el móvil lleva por su cuenta en cada ronda (avance, repaso, toques), para no perderlo al repintar
  const mine = { roundId: null, progress: 0, faulted: false, trace: null, crackAt: [], taps: 0, guess: null, bet: 1, sent: null, side: null, seenLast: null };
  function freshRound(s) {
    if (mine.roundId === s.roundId) return;
    Object.assign(mine, { roundId: s.roundId, progress: s.progress ?? 0, faulted: false, trace: null, crackAt: [], taps: 0, guess: null, bet: 1, sent: null, side: null, seenLast: null });
  }

  function render(s, stateReceivedAt) {
    state = s;
    receivedAt = stateReceivedAt;
    freshRound(s);
    // quien mira o ya cayó ve cuántos quedan (a quien juega no se le repinta por eso: perdería lo que está haciendo)
    const watching = !s.playing || s.status !== 'alive';
    const sig = JSON.stringify([s.game, s.roundId, s.phase, s.status, s.playing, s.out, discrete(s), motionGranted, motionAsked, watching ? s.aliveCount : null]);
    root.dataset.game = s.game;
    if (sig === signature) return live?.(s);
    signature = sig;
    clear();
    fill(root, me(s), body(s));
  }

  /** Lo que obliga a repintar (lo continuo, como el avance o la cuerda, se pinta solo). */
  function discrete(s) {
    switch (s.game) {
      case 'luzroja':
        return [s.crossed, s.fallen, s.saved];
      case 'panal':
        return [s.shape, s.state];
      case 'puente':
        return [s.turn, s.pos, s.current?.id, s.last?.step, s.last?.ok, s.last?.held, s.jumping, s.crossed, s.turn ? s.tally : null, s.myBet, s.hits];
      case 'cuerda':
        return [s.winner];
      case 'canicas':
        return [s.role, s.mine, s.theirs, s.last?.amount ?? null, s.last?.hidden ?? null, s.lost, s.won, s.duelSpared, s.bye, s.bye ? s.duels : null];
      case 'hucha':
        return [s.awarded, s.aliveCount, s.huchaDone];
    }
    return null;
  }

  /** Arriba: tu número del chándal y cómo vas. */
  function me(s) {
    const tag = s.status === 'out' ? ['out', 'Eliminado'] : s.status === 'watching' ? ['watch', 'Miras'] : ['alive', 'Vivo'];
    return h(
      'header',
      { class: 'sq-me' },
      logo('sq-me-logo'),
      h('span', { class: 'sq-patch' }, h('small', {}, 'Jugador'), h('b', {}, numText(s.number) || '—')),
      h('span', { class: `sq-status ${tag[0]}` }, tag[1]),
    );
  }

  function body(s) {
    if (s.game === 'hucha') {
      if (s.awarded != null) return msg('🐷', '¡Has sobrevivido!', `Te llevas ${s.awarded} ${s.awarded === 1 ? 'punto' : 'puntos'} de la hucha.`, 'win');
      if (!s.huchaDone) return msg('🐷', 'Contando la hucha…', '¡Mira la tele!');
      if (s.status === 'out') return msg('🐷', `La hucha: ${s.pot} puntos`, `${s.aliveCount === 1 ? 'Se la lleva el superviviente' : `Se la reparten ${s.aliveCount} supervivientes`}. Por ti entraron ${s.perHead}.`);
      return msg('🐷', 'Contando la hucha…', `${s.aliveCount === 1 ? 'Se la lleva el superviviente' : `Se la reparten los ${s.aliveCount} supervivientes`}. ¡Mira la tele!`);
    }
    const left = `Quedan ${s.aliveCount} ${s.aliveCount === 1 ? 'vivo' : 'vivos'}.`;
    if (s.status === 'watching') return msg('👀', 'Miras desde fuera', `${s.label}: ¡mira la tele! ${left}`);
    if (!s.playing) return outScreen(s, `Ahora: ${s.label}. ${left} Mira en la tele cómo sigue.`);
    if (s.phase === 'ready') return ready(s);
    if (s.phase === 'done') {
      if (s.spared) return msg('😮‍💨', '¡Por los pelos!', 'Ibas a caer, pero te salvas: tiene que llegar gente al final. ¡Sigues vivo!', 'win');
      if (s.out) return outScreen(s, `${outReason(s)} Quedas fuera de Squid Games. Por ti van ${s.perHead} ${s.perHead === 1 ? 'punto' : 'puntos'} a la hucha (los puntos que llevas en el concurso no se tocan).`);
      return msg('✔', '¡Sigues vivo!', s.lastGame ? 'Has sobrevivido a los juegos. Ahora, ¡la hucha!' : 'Pasas al siguiente juego.', 'win');
    }
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
    return msg('○', s.label, s.rule);
  }

  /** Por qué has caído en este juego (en una frase). */
  function outReason(s) {
    if (s.game === 'cuerda' && s.force != null) return `Tu bando ha perdido (fuerza ${s.force} contra ${s.rivalForce}).`;
    if (s.game === 'canicas' && s.rival) return s.timeUp ? `Se acabó el tiempo con menos canicas que ${s.rival.name}.` : `${s.rival.name} te ha dejado sin canicas.`;
    if (s.game === 'luzroja') return s.fallen === 'time' ? 'No llegaste a la meta a tiempo.' : 'Te pilló la luz roja.';
    if (s.game === 'panal') return s.state === 'broken' ? 'Se rompió tu galleta.' : 'No terminaste la galleta a tiempo.';
    if (s.game === 'puente') return 'Se rompió tu cristal.';
    return '';
  }

  /** Eliminado: negro, tu número en grande y «Eliminado» en rojo (como en la tele). */
  function outScreen(s, text) {
    return h('div', { class: 'sq-out' }, h('p', { class: 'sq-out-num' }, numText(s.number)), h('p', { class: 'sq-out-word' }, 'Eliminado'), h('p', { class: 'sq-msg-text' }, text));
  }

  function msg(icon, title, text, cls = '') {
    return h('div', { class: `sq-msg ${cls}` }, h('p', { class: 'sq-big' }, icon), h('p', { class: 'sq-msg-title' }, title), h('p', { class: 'sq-msg-text' }, text));
  }

  /** Cuenta atrás 3 □ · 2 △ · 1 ○ hasta que empieza (encima de todo); luego `then`. */
  function countdown(then) {
    const el = h('div', { class: 'sq-count', hidden: true });
    const start = local(state.tOpen);
    let last = null;
    const step = () => {
      const left = start - performance.now();
      if (left <= 0) {
        el.hidden = true;
        return then?.();
      }
      const n = Math.ceil(left / 1000);
      if (n !== last) {
        last = n;
        el.hidden = false;
        fill(el, shape(COUNT_SHAPE[n] ?? 'circle', 'sq-count-shape'), h('b', {}, String(n)));
        vibrate(30);
      }
      after(Math.min(100, left), step);
    };
    step();
    return el;
  }

  function timeLeft(el, endsAtHost) {
    const end = local(endsAtHost);
    const step = () => (el.textContent = `${Math.max(0, Math.ceil((end - performance.now()) / 1000))} s`);
    step();
    every(250, step);
  }

  // ------------------------------------------------------------------ antes de empezar

  function ready(s) {
    const parts = [h('p', { class: 'sq-game-no' }, `Juego ${s.step}`), h('h2', { class: 'sq-game-title' }, s.label), h('p', { class: 'sq-do' }, DO[s.game] ?? ''), h('p', { class: 'sq-msg-text small' }, s.rule)];
    if (s.game === 'luzroja' && needsPermission && !motionGranted) {
      parts.push(
        h('button', { class: 'sq-btn primary', type: 'button', onclick: askMotion }, motionAsked ? '📳 Volver a intentarlo' : '📳 Activar el sensor'),
        h('p', { class: 'sq-msg-text small' }, motionAsked ? 'No se ha podido activar: juega solo con el botón (suéltalo en rojo).' : 'Así el móvil nota si te mueves en rojo.'),
      );
    } else if (s.game === 'luzroja' && motionGranted) parts.push(h('p', { class: 'sq-msg-text small' }, '📳 Sensor activado: en rojo, ni te muevas.'));
    if (s.game === 'panal') {
      if (s.shape) {
        // la lata se abre (la primera vez) y aparece la forma
        const sh = DALGONA_SHAPES[s.shape];
        const opening = mine.opened !== s.roundId;
        mine.opened = s.roundId;
        parts.push(h('div', { class: `sq-open-tin ${opening ? 'opening' : ''}` }, h('span', { class: 'sq-lid' }), h('div', { class: 'sq-tin-cookie' }, cookie(s.shape, 5))), h('p', { class: 'sq-msg-title' }, `${mine.picked === s.roundId ? 'Te ha tocado' : 'Te ha tocado al azar'}: ${sh.label}`));
        if (opening) vibrate([30, 60, 30]);
      } else {
        parts.push(
          h('p', { class: 'sq-msg-title' }, 'Elige una lata'),
          h(
            'div',
            { class: 'sq-tins' },
            Array.from({ length: s.envelopes ?? 4 }, (_, i) =>
              h(
                'button',
                {
                  class: 'sq-tin',
                  type: 'button',
                  'aria-label': `Lata ${i + 1}`,
                  onclick: (e) => {
                    e.currentTarget.classList.add('picked');
                    mine.picked = s.roundId;
                    vibrate(30);
                    send('pick', s.roundId, i);
                  },
                },
                h('b', {}, String(i + 1)),
              ),
            ),
          ),
          h('p', { class: 'sq-msg-text small' }, 'Dentro hay una forma: unas son más fáciles que otras.'),
        );
      }
    }
    parts.push(h('p', { class: 'sq-wait' }, 'Espera a que empiece…'));
    return h('div', { class: 'sq-msg sq-ready' }, ...parts);
  }

  // ------------------------------------------------------------------ 1. Luz roja, luz verde

  function redLight(s) {
    if (s.crossed) return msg('🏁', '¡A salvo!', 'Has cruzado la meta. Ahora, quieto y a mirar.', 'win');
    if (s.saved) return msg('😮‍💨', '¡Por los pelos!', 'La muñeca te ha pillado… pero en este juego ya ha caído el máximo: te salvas. Quieto hasta el final, que ya no avanzas.', 'win');
    if (s.fallen) return msg('✖', s.fallen === 'time' ? '¡Se acabó el tiempo!' : mine.faultBy === 'sensor' ? '¡Te has movido!' : mine.faultBy === 'press' ? '¡Has tocado en rojo!' : '¡No soltaste a tiempo!', s.fallen === 'time' ? 'No llegaste a la meta.' : mine.faultBy === 'sensor' ? 'Era luz roja: el móvil notó que te movías.' : mine.faultBy === 'press' ? 'Era luz roja: no se toca hasta que vuelva a cantar.' : 'Era luz roja y seguías pulsando: la muñeca te ha visto.', 'out');
    const cues = s.cues.map((c) => ({ ...c, at: local(c.t) }));
    const lightAt = (t) => {
      let cur = { light: 'red', at: -Infinity };
      for (const c of cues) if (c.at <= t) cur = c;
      return cur;
    };
    const lamp = h('div', { class: 'sq-lamp', dataset: { light: 'wait' } }, h('p', { class: 'sq-lamp-text' }, 'Preparados…'), h('p', { class: 'sq-lamp-sub' }));
    const lyrics = h('p', { class: 'sq-lyrics' }, CHANT.map((x) => h('span', {}, x)));
    const left = h('span', { class: 'sq-left' });
    const runner = h('span', { class: 'sq-runner' }, numText(s.number));
    const track = h('div', { class: 'sq-track' }, runner, h('span', { class: 'sq-flag' }, '🏁'));
    const holdLabel = h('span', {}, 'Espera…'); // nunca «Mantén» antes de que cante (empieza en rojo)
    const holdSub = h('small', {}, 'aún no');
    const button = h('button', { class: 'sq-hold', type: 'button' }, holdLabel, holdSub);
    let holding = false;
    let last = performance.now();
    let lastCue = null;
    const fault = (t, by) => {
      if (mine.faulted) return;
      mine.faulted = true;
      mine.faultBy = by;
      vibrate([200, 80, 200]);
      send('fault', s.roundId, hostNow(t));
    };
    const redFault = (t, by = 'hold') => {
      const c = lightAt(t);
      if (c.light === 'red' && t >= cues[0]?.at && t - c.at >= RED_GRACE_MS) fault(t, by);
    };
    listen(button, 'pointerdown', (e) => {
      e.preventDefault();
      holding = true;
      button.classList.add('down');
      redFault(Math.abs(e.timeStamp - performance.now()) < 1000 ? e.timeStamp : performance.now(), 'press');
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
        if (prev && Math.hypot(v[0] - prev[0], v[1] - prev[1], v[2] - prev[2]) > MOVE_JERK) redFault(performance.now(), 'sensor');
        prev = v;
      });
    }
    every(50, () => {
      const now = performance.now();
      const dt = now - last;
      last = now;
      const c = lightAt(now);
      if (c !== lastCue) {
        lastCue = c;
        const light = c.at === -Infinity ? 'wait' : c.light;
        if (light === 'green') mine.faulted = false; // un aviso por cada luz roja (la tele decide)
        lamp.dataset.light = light;
        root.dataset.light = light;
        lamp.querySelector('.sq-lamp-text').textContent = light === 'wait' ? 'Preparados…' : light === 'green' ? '¡Avanza!' : '¡Quieto!';
        lamp.querySelector('.sq-lamp-sub').textContent = light === 'green' ? 'La muñeca canta de espaldas' : light === 'red' ? 'Te está mirando' : '';
        lyrics.classList.toggle('red', light === 'red');
        if (light === 'red') vibrate(80);
      }
      // la letra de la canción, sílaba a sílaba (se pone en rojo al acabar)
      if (c.light === 'green' && c.at !== -Infinity && c.len) {
        const times = chantTimes(c.len, c.rush);
        const k = times.filter((t) => t <= now - c.at).length;
        [...lyrics.children].forEach((sp, i) => sp.classList.toggle('on', i < k));
      } else if (c.light === 'red') [...lyrics.children].forEach((sp) => sp.classList.remove('on'));
      if (holding && c.light === 'green' && c.at !== -Infinity && !mine.faulted) mine.progress = Math.min(100, mine.progress + dt * s.speed);
      if (holding) redFault(now);
      // el botón dice lo que está pasando
      const say = c.at === -Infinity ? ['Espera…', 'aún no'] : c.light === 'red' ? (holding ? ['¡Suelta!', 'es luz roja'] : ['Quieto', 'ni lo toques']) : holding ? ['¡Avanza!', `${Math.floor(mine.progress)} %`] : ['Mantén', 'para avanzar'];
      if (holdLabel.textContent !== say[0]) holdLabel.textContent = say[0];
      if (holdSub.textContent !== say[1]) holdSub.textContent = say[1];
      runner.style.setProperty('--p', String(mine.progress / 100));
    });
    every(REPORT_MS, () => {
      if (mine.sent !== mine.progress) {
        mine.sent = mine.progress;
        send('p', s.roundId, Math.round(mine.progress * 10) / 10);
      }
    });
    timeLeft(left, s.endsAt);
    cleanup.push(() => delete root.dataset.light);
    return h(
      'div',
      { class: 'sq-play sq-redlight' },
      h('div', { class: 'sq-row' }, h('span', { class: 'sq-game-no' }, s.label), left),
      lamp,
      lyrics,
      track,
      button,
      h('p', { class: 'sq-msg-text small' }, motionGranted ? '📳 En rojo, ni te muevas: el móvil lo nota.' : 'En rojo, suelta el botón.'),
      countdown(),
    );
  }

  // ------------------------------------------------------------------ 2. El panal

  function dalgona(s) {
    if (s.state === 'done') {
      // la forma entera, brillando
      const c = h('div', { class: 'sq-done-cookie', style: { '--carved': '100' } }, cookie(s.shape, 5));
      return h('div', { class: 'sq-msg win' }, c, h('p', { class: 'sq-msg-title' }, '¡Galleta perfecta!'), h('p', { class: 'sq-msg-text' }, 'Has sacado la forma entera. Sigues vivo.'));
    }
    if (s.state === 'spared') return h('div', { class: 'sq-msg win' }, h('div', { class: 'sq-broken-cookie' }, cookie(s.shape ?? 'circulo', 5)), h('p', { class: 'sq-msg-title' }, '¡Por los pelos!'), h('p', { class: 'sq-msg-text' }, 'Se ha roto… pero en este juego ya ha caído el máximo: te salvas.'));
    if (s.state === 'broken') return h('div', { class: 'sq-msg out' }, h('div', { class: 'sq-broken-cookie' }, cookie(s.shape ?? 'circulo', 5)), h('p', { class: 'sq-msg-title' }, '¡Se ha roto!'), h('p', { class: 'sq-msg-text' }, 'Te has salido demasiado de la línea.'));
    if (!s.shape) return msg('🍪', 'Sin galleta', 'Mira la tele.');
    if (!mine.trace) {
      // si se recargó el móvil a mitad, sigue por donde iba (lo que dice la tele: más o menos, el trozo ya repasado)
      mine.trace = createTrace(s.shape);
      const k = Math.floor((mine.trace.points.length * (s.progress ?? 0)) / 100);
      for (let i = 0; i < k; i++) mine.trace.done[i] = true;
      mine.trace.count = k;
      mine.trace.cracks = s.cracks ?? 0;
    }
    const t = mine.trace;
    const sh = DALGONA_SHAPES[s.shape];
    const canvas = h('canvas', { class: 'sq-canvas' });
    const pct = h('strong', { class: 'sq-pct' });
    const hearts = h('span', { class: 'sq-hearts' });
    const left = h('span', { class: 'sq-left' });
    const size = Math.round(Math.min(innerWidth - 24, innerHeight * 0.56, 520));
    const dpr = Math.min(2, devicePixelRatio || 1);
    canvas.width = canvas.height = size * dpr;
    canvas.style.width = canvas.style.height = `${size}px`;
    const ctx = canvas.getContext('2d');
    // La galleta (fija): caramelo con azúcar y la forma marcada; se pinta una vez
    const base = document.createElement('canvas');
    base.width = base.height = size * dpr;
    const b = base.getContext('2d');
    b.scale(dpr, dpr);
    const grad = b.createRadialGradient(size * 0.4, size * 0.35, size * 0.05, size / 2, size / 2, size * 0.5);
    grad.addColorStop(0, '#f2c46b');
    grad.addColorStop(0.75, '#d89a3c');
    grad.addColorStop(1, '#a8691f');
    b.fillStyle = grad;
    b.beginPath();
    b.arc(size / 2, size / 2, size * 0.48, 0, Math.PI * 2);
    b.fill();
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 260; i++) {
      const a = rnd() * Math.PI * 2;
      const r = Math.sqrt(rnd()) * size * 0.46;
      b.fillStyle = rnd() < 0.5 ? 'rgb(255 236 190 / 0.35)' : 'rgb(120 70 20 / 0.25)';
      b.fillRect(size / 2 + Math.cos(a) * r, size / 2 + Math.sin(a) * r, 1.6, 1.6);
    }
    b.strokeStyle = '#8f5412';
    b.lineWidth = Math.max(3, size * 0.012);
    b.lineJoin = b.lineCap = 'round';
    for (const path of sh.paths) {
      b.beginPath();
      path.forEach(([x, y], i) => (i ? b.lineTo(x * size, y * size) : b.moveTo(x * size, y * size)));
      b.stroke();
    }
    const points = shapePoints(s.shape);
    let open = false;
    let finger = null;
    const draw = () => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(base, 0, 0);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // lo tallado: más claro y hundido
      ctx.fillStyle = '#fff3cf';
      points.forEach(([x, y], i) => {
        if (!t.done[i]) return;
        ctx.beginPath();
        ctx.arc(x * size, y * size, size * 0.012, 0, Math.PI * 2);
        ctx.fill();
      });
      // grietas desde donde te saliste
      ctx.strokeStyle = '#3a1d05';
      ctx.lineWidth = 2;
      for (const [cx, cy, k] of mine.crackAt) {
        let x = cx * size;
        let y = cy * size;
        let sd = k * 97 + 3;
        const r2 = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
        ctx.beginPath();
        ctx.moveTo(x, y);
        for (let i = 0; i < 5; i++) {
          x += (r2() - 0.5) * size * 0.12;
          y += (r2() - 0.5) * size * 0.12;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      // la aguja
      if (finger) {
        ctx.strokeStyle = '#d9dde3';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(finger[0] * size, finger[1] * size);
        ctx.lineTo(finger[0] * size + size * 0.09, finger[1] * size - size * 0.16);
        ctx.stroke();
      }
      pct.textContent = `${Math.floor(traceProgress(t) * 100)} %`;
      fill(hearts, ...Array.from({ length: 3 }, (_, i) => h('i', { class: i < t.cracks ? 'cracked' : '' })));
    };
    const report = () => send('trace', s.roundId, [Math.floor(traceProgress(t) * 100), t.cracks, isDone(t) ? 1 : isBroken(t) ? 2 : 0]);
    let lastSent = 0;
    const at = (e) => {
      const r = canvas.getBoundingClientRect();
      return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height];
    };
    const move = (list) => {
      const before = t.cracks;
      for (const ev of list) {
        finger = at(ev);
        traceMove(t, ...finger);
      }
      if (t.cracks > before) {
        mine.crackAt.push([...finger, t.cracks]);
        vibrate(140);
        canvas.animate([{ transform: 'translateX(-5px)' }, { transform: 'translateX(5px)' }, { transform: 'none' }], { duration: 200 });
      }
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
    };
    listen(canvas, 'pointerdown', (e) => {
      if (!open) return;
      e.preventDefault();
      try {
        canvas.setPointerCapture?.(e.pointerId);
      } catch {
        // el dedo ya no está (algunos navegadores lo avisan así): da igual
      }
      move([e]);
    });
    listen(canvas, 'pointermove', (e) => {
      if (!open || !(e.buttons || e.pressure)) return;
      const list = e.getCoalescedEvents?.() ?? []; // todos los puntos del movimiento (algunos navegadores no los dan)
      move(list.length ? list : [e]);
    });
    for (const type of ['pointerup', 'pointercancel'])
      listen(canvas, type, () => {
        traceLift(t);
        finger = null;
        draw();
      });
    draw();
    timeLeft(left, s.endsAt);
    return h(
      'div',
      { class: 'sq-play sq-panal' },
      h('div', { class: 'sq-row' }, h('span', { class: 'sq-game-no' }, `${sh.icon} ${sh.label}`), left),
      canvas,
      h('div', { class: 'sq-row' }, pct, hearts),
      h('p', { class: 'sq-msg-text small' }, 'Repasa la línea con el dedo, despacio. Cada vez que te sales, la galleta se agrieta: a la tercera, se rompe.'),
      countdown(() => (open = true)),
    );
  }

  // ------------------------------------------------------------------ 3. El puente de cristal

  /** El camino que ya se sabe (lo que han visto caer o aguantar). */
  function pathMap(s, highlight) {
    const known = new Map(s.known.map((k) => [k.step, k]));
    return h(
      'div',
      { class: 'sq-path' },
      Array.from({ length: s.tiles }, (_, step) => {
        const k = known.get(step);
        const safe = k ? (k.ok ? k.side : k.side === 'L' ? 'R' : 'L') : null;
        const cell = (side) => h('i', { class: k ? (side === safe ? 'safe' : 'broken') : '' });
        return h('span', { class: `sq-path-step ${step === highlight ? 'here' : ''}` }, cell('L'), cell('R'));
      }).reverse(),
    );
  }

  function bridge(s) {
    const last = s.last;
    // Alguien está saltando: el resultado llega a la vez que en la tele (y se ve entero, aunque sea el último salto)
    if (s.jumping && last) return jumpView(s, last, last.jumper?.number === s.number);
    if (s.crossed) {
      const mine = last?.ok && last.jumper?.number === s.number;
      return msg('🏁', mine ? '¡Has llegado al final!' : '¡Habéis cruzado!', mine ? 'Has acertado el último cristal: estás a salvo.' : 'Ya se sabe el camino entero: estás a salvo.', 'win');
    }
    if (s.out) return msg('✖', '¡Se ha roto!', 'Has caído del puente.', 'out');
    const left = h('span', { class: 'sq-left' });
    if (!s.turn) {
      const ahead = s.current ? `Le toca a ${numText(s.current.number)} · ${s.current.name}` : 'Esperando…';
      // ¿Qué cristal aguanta? Se apuesta (y se puede cambiar) hasta que salta; quien salta ve lo que dice la gente
      const bets = s.current
        ? ['L', 'R'].map((side) =>
            h(
              'button',
              {
                class: `sq-pane-btn small ${s.myBet === side ? 'chosen' : ''}`,
                type: 'button',
                dataset: { side },
                onclick: () => {
                  vibrate(15);
                  send('bet', s.roundId, side === 'L' ? 0 : 1);
                  bets.forEach((b) => b.classList.toggle('chosen', b.dataset.side === side));
                },
              },
              h('span', {}, side === 'L' ? '◀' : '▶'),
              h('small', {}, `${SIDE_NAME[side]} · ${s.tally?.[side] ?? 0}`),
            ),
          )
        : [];
      return h(
        'div',
        { class: 'sq-msg sq-bridge-wait' },
        h('p', { class: 'sq-game-no' }, `Tramo ${Math.min(s.pos + 1, s.tiles)} de ${s.tiles}`),
        h('p', { class: 'sq-msg-title' }, ahead),
        s.current ? h('p', { class: 'sq-msg-text' }, '¿Qué cristal aguanta? Apuesta: lo verá antes de saltar.') : null,
        s.current ? h('div', { class: 'sq-panes small' }, bets) : null,
        pathMap(s, s.pos),
        h('p', { class: 'sq-msg-text small' }, [s.jumped ? '¡Ya has saltado tu tramo! Si el relevo vuelve a ti, saltarás otra vez.' : s.place >= 0 ? `En el relevo saltas el ${s.place + 1}º: todos saltan.` : '', s.hits ? `Apuestas acertadas: ${s.hits}.` : ''].filter(Boolean).join(' ')),
      );
    }
    // Te toca: dos cristales; toca uno y otra vez para saltar (si se acaba el tiempo con uno elegido, saltas a ese)
    if (mine.turnPos !== s.pos) Object.assign(mine, { turnPos: s.pos, side: null, sent: false }); // cada tramo, de cero
    const jump = (side) => {
      if (mine.sent) return;
      mine.sent = true;
      vibrate(60);
      send('choose', s.roundId, side === 'L' ? 0 : 1);
      hint.textContent = '¡Saltas!';
    };
    const panes = ['L', 'R'].map((side) => {
      const b = h('button', { class: 'sq-pane-btn', type: 'button', 'aria-label': `Cristal de la ${SIDE_NAME[side]}`, dataset: { side } }, h('span', {}, side === 'L' ? '◀' : '▶'), h('small', {}, SIDE_NAME[side]));
      // pointerdown (no click): un doble toque rápido también cuenta
      listen(b, 'pointerdown', (e) => {
        e.preventDefault();
        if (mine.sent) return;
        if (mine.side !== side) {
          mine.side = side;
          vibrate(20);
          panes.forEach((p) => p.classList.toggle('chosen', p.dataset.side === side));
          hint.textContent = `Toca otra vez para saltar a la ${SIDE_NAME[side]}`;
          return;
        }
        jump(side);
      });
      return b;
    });
    if (mine.side) panes.forEach((p) => p.classList.toggle('chosen', p.dataset.side === mine.side));
    const hint = h('p', { class: 'sq-msg-text sq-hint-big' }, mine.side ? `Toca otra vez para saltar a la ${SIDE_NAME[mine.side]}` : 'Toca un cristal y otra vez para saltar. Uno aguanta; el otro, no.');
    timeLeft(left, s.turnEndsAt);
    const end = local(s.turnEndsAt);
    after(end - performance.now() - 900, () => mine.side && jump(mine.side));
    return h(
      'div',
      { class: 'sq-play sq-bridge-turn' },
      h('div', { class: 'sq-row' }, h('span', { class: 'sq-game-no' }, '¡Te toca saltar!'), left),
      h('p', { class: 'sq-msg-text' }, `Tramo ${s.pos + 1} de ${s.tiles}`),
      h('div', { class: 'sq-panes' }, panes),
      s.tally && s.tally.L + s.tally.R ? h('p', { class: 'sq-msg-text sq-crowd' }, `Tus compañeros dicen: ◀ ${s.tally.L} · ${s.tally.R} ▶`) : null,
      hint,
      pathMap(s, s.pos),
      h('p', { class: 'sq-msg-text small' }, 'Si no eliges a tiempo, te empujan.'),
    );
  }

  /** Un salto: el que salta lo vive (agacharse, saltar, latidos); los demás, con el corazón en un puño. */
  function jumpView(s, m, own) {
    const start = local(m.at) ?? performance.now();
    const revealed = m.ok !== null && m.ok !== undefined;
    const name = own ? 'Saltas' : `${numText(m.jumper?.number)} ${m.jumper?.name ?? ''} salta`;
    const heart = h('div', { class: 'sq-heart' }, '♥');
    const view = h(
      'div',
      { class: `sq-jump ${own ? 'own' : ''} ${revealed ? (m.ok || m.held ? 'held' : 'broke') : ''}` },
      h('p', { class: 'sq-game-no' }, `Tramo ${m.step + 1} de ${s.tiles}`),
      h('div', { class: 'sq-jump-panes', dataset: { side: m.side } }, h('i', { class: m.side === 'L' ? 'pick' : '' }), h('i', { class: m.side === 'R' ? 'pick' : '' })),
      h('p', { class: 'sq-msg-title' }, `${name} a la ${SIDE_NAME[m.side]}${m.pushed ? ' (empujón)' : ''}…`),
      revealed ? h('p', { class: `sq-jump-result ${m.ok || m.held ? 'ok' : 'ko'}` }, m.ok ? '¡Aguanta!' : m.held ? '¡Cruje… pero aguanta! Por los pelos' : '¡Crac! Se rompe') : heart,
    );
    if (!revealed) {
      // latidos (los mismos que suenan en la tele): el corazón late y el móvil vibra
      const reveal = m.reveal ?? BRIDGE_REVEAL_MS;
      let beat = 0;
      while (beat < reveal - 1450) {
        const k = beat / (reveal - 1450);
        const at = 1450 + beat;
        after(start + at - performance.now(), () => {
          heart.animate([{ transform: 'scale(1.35)' }, { transform: 'scale(1)' }], { duration: 300, easing: 'ease-out' });
          if (own) vibrate(50);
        });
        beat += 60000 / (78 + (160 - 78) * k * k);
      }
      if (own) {
        view.classList.add('crouch');
        after(start + 600 - performance.now(), () => view.classList.replace('crouch', 'leap'));
        after(start + 1300 - performance.now(), () => {
          view.classList.replace('leap', 'landed');
          vibrate(120);
        });
      }
    } else if (own) vibrate(m.ok || m.held ? [40, 60, 40] : [300, 100, 300]);
    return view;
  }

  // ------------------------------------------------------------------ 4. Tira y afloja

  function tug(s) {
    if (s.winner) {
      const forces = `Vuestra fuerza: ${s.force} · la suya: ${s.rivalForce} (toques por cabeza).`;
      return s.winner === s.side ? msg('💪', '¡Habéis ganado!', `El otro bando ha caído. ${forces}`, 'win') : msg('✖', '¡Habéis caído!', `El otro bando tiraba más fuerte. ${forces}`, 'out');
    }
    const count = h('strong', { class: 'sq-taps' }, String(mine.taps));
    const left = h('span', { class: 'sq-left' });
    const knot = h('span', { class: 'sq-knot' });
    const meter = h('div', { class: 'sq-ropemeter' }, h('span', { class: 'sq-edge a' }, '○'), h('span', { class: 'sq-ropebar' }, knot), h('span', { class: 'sq-edge b' }, '△'));
    let open = false;
    const mark = s.side === 'A' ? '○' : '△';
    const pad = h('button', { class: `sq-tap side-${s.side}`, type: 'button' }, h('span', {}, '¡Tira!'), count);
    listen(pad, 'pointerdown', (e) => {
      e.preventDefault();
      if (!open) return;
      mine.taps++;
      count.textContent = String(mine.taps);
      pad.animate([{ transform: 'scale(0.95)' }, { transform: 'scale(1)' }], { duration: 90 });
    });
    every(250, () => {
      if (open && mine.sent !== mine.taps) {
        mine.sent = mine.taps;
        send('taps', s.roundId, mine.taps);
      }
    });
    const status = h('p', { class: 'sq-tug-status' });
    const paint = (st) => {
      const r = st.rope ?? 0;
      knot.style.setProperty('--x', `${50 + r * 45}%`);
      const mineWins = s.side === 'A' ? r < -0.05 : r > 0.05;
      const losing = s.side === 'A' ? r > 0.05 : r < -0.05;
      status.textContent = mineWins ? '¡Vais ganando!' : losing ? '¡Os arrastran! ¡Más rápido!' : 'Igualados…';
      status.dataset.state = mineWins ? 'win' : losing ? 'lose' : '';
    };
    paint(s);
    live = paint;
    timeLeft(left, s.endsAt);
    return h(
      'div',
      { class: 'sq-play sq-tug' },
      h('div', { class: 'sq-row' }, h('span', { class: 'sq-game-no' }, `Bando ${mark} · ${s.mates} contra ${s.rivals}`), left),
      meter,
      status,
      pad,
      h('p', { class: 'sq-msg-text small' }, `Toca lo más rápido que puedas: ¡arrastradlos hasta la línea! Si nadie llega, gana el que más tire de media. Tú tiras hacia ${s.side === 'A' ? 'la izquierda' : 'la derecha'}.`),
      countdown(() => (open = true)),
    );
  }

  // ------------------------------------------------------------------ 5. Canicas

  const marbleChips = (n, max = 10) => h('span', { class: 'sq-chips' }, ...Array.from({ length: Math.min(n, max) }, (_, i) => h('i', { style: { '--h': `${(i * 47) % 360}deg` } })), n > max ? h('em', {}, `+${n - max}`) : null);

  /** La última jugada del duelo: {el, fresh (se ve por primera vez: con suspense), before: [mías, suyas] antes} */
  function lastPlay(s) {
    const l = s.last;
    if (!l) return null;
    const iGuessed = l.guesser !== s.rival.id;
    const iWon = l.right === iGuessed;
    const key = `${l.hider}|${l.hidden}|${l.amount}|${s.mine}|${s.turns}`;
    const fresh = mine.seenLast !== key;
    mine.seenLast = key;
    const hand = h('p', { class: 'sq-reveal-hand' }, h('span', { class: 'emoji' }, '🖐'), marbleChips(l.hidden), h('b', {}, `eran ${l.hidden}`));
    const res = h('p', { class: 'sq-reveal-res' }, iWon ? `¡Ganas ${l.amount}!` : `Pierdes ${l.amount}`);
    const el = h('div', { class: `sq-reveal ${iWon ? 'ok' : 'ko'}` }, h('p', {}, `${iGuessed ? `Dijiste ${l.parity ? 'nones' : 'pares'} y apostaste` : `${s.rival.name} dijo ${l.parity ? 'nones' : 'pares'} y apostó`} ${l.bet}${l.allIn ? ' (todo o nada)' : ''}`), hand, res);
    if (fresh) {
      // suspense: la mano tarda en abrirse (a la vez que en la tele)
      el.classList.add('waiting');
      hand.replaceChildren(h('span', { class: 'emoji sq-shake' }, '✊'), h('b', {}, 'Abre la mano…'));
      after(1400, () => {
        el.classList.remove('waiting');
        el.classList.add('fresh');
        hand.replaceChildren(h('span', { class: 'emoji' }, '🖐'), marbleChips(l.hidden), h('b', {}, `eran ${l.hidden}`));
        vibrate(iWon ? 40 : [150, 60, 150]);
      });
    }
    const d = iWon ? l.amount : -l.amount;
    return { el, fresh, before: [s.mine - d, s.theirs + d] };
  }

  /** Sin pareja: se salva y mira los duelos en directo. */
  function byeView(s) {
    const rows = (s.duels ?? []).map((d) =>
      h(
        'div',
        { class: 'sq-bye-duel' },
        h('span', { class: d.loser === d.a.id ? 'lost' : '' }, `${numText(d.a.number)} ${d.a.name}`),
        h('b', {}, `${d.marbles[d.a.id]} – ${d.marbles[d.b.id]}`),
        h('span', { class: d.loser === d.b.id ? 'lost' : '' }, `${d.b.name} ${numText(d.b.number)}`),
        d.loser ? h('small', {}, d.spared ? 'pierde, pero se salva por los pelos' : 'eliminado') : null,
      ),
    );
    const left = h('span', { class: 'sq-left' });
    timeLeft(left, s.endsAt);
    return h('div', { class: 'sq-msg win sq-bye' }, h('p', { class: 'sq-big' }, '🍀'), h('p', { class: 'sq-msg-title' }, 'Sin pareja: te salvas'), h('p', { class: 'sq-msg-text' }, 'Mira cómo van los duelos:'), ...rows, h('p', { class: 'sq-msg-text small' }, left));
  }

  function marbles(s) {
    if (s.bye) return byeView(s);
    if (s.lost && s.duelSpared) {
      const last = lastPlay(s);
      const end = msg('😮‍💨', '¡Por los pelos!', `${s.rival.name} te ha ganado el duelo… pero en este juego ya ha caído el máximo: te salvas.`, 'win');
      if (!last?.fresh) return end;
      end.hidden = true;
      after(1600, () => (end.hidden = false));
      return h('div', { class: 'sq-play' }, last.el, end);
    }
    if (s.lost && s.timeUp) return msg('✖', 'Se acabó el tiempo', s.coin ? `Empate a ${s.mine} con ${s.rival.name}: lo ha decidido la suerte.` : `Tenías menos canicas que ${s.rival.name} (${s.mine} contra ${s.theirs}).`, 'out');
    if (s.won && s.timeUp) return msg('✔', '¡Ganas por tiempo!', s.coin ? `Empate a ${s.mine} con ${s.rival.name}: la suerte te salva.` : `Tenías más canicas que ${s.rival.name} (${s.mine} contra ${s.theirs}).`, 'win');
    if (s.lost || s.won) {
      // la última jugada (la que lo decide) y luego el resultado
      const end = s.lost ? msg('✖', 'Sin canicas', `${s.rival.name} te ha ganado el duelo.`, 'out') : msg('✔', '¡Has ganado el duelo!', `${s.rival.name} se ha quedado sin canicas.`, 'win');
      const last = lastPlay(s);
      if (!last?.fresh) return end;
      end.hidden = true;
      after(1600, () => (end.hidden = false));
      return h('div', { class: 'sq-play' }, last.el, end);
    }
    const left = h('span', { class: 'sq-left' });
    timeLeft(left, s.endsAt);
    // La última apuesta, con su revelado (el puño que se abre) la primera vez que se ve; mientras, las canicas de antes
    const last = lastPlay(s);
    const counts = last?.fresh ? last.before : [s.mine, s.theirs];
    const scoreOf = ([a, b]) => [h('div', {}, h('small', {}, 'Tú'), h('b', {}, String(a)), marbleChips(a)), h('span', { class: 'sq-vs' }, 'vs'), h('div', {}, h('small', {}, s.rival.name), h('b', {}, String(b)), marbleChips(b))];
    const score = h('div', { class: 'sq-score' }, ...scoreOf(counts));
    const reveal = last?.el ?? null;
    if (last?.fresh) after(1600, () => fill(score, ...scoreOf([s.mine, s.theirs])));
    // nueva jugada: nada elegido de antes
    if (mine.turn !== s.turns) Object.assign(mine, { turn: s.turns, guess: null, bet: 1 });
    // los últimos 10 s: todo o nada
    const allInAt = s.allInAt != null ? local(s.allInAt) : Infinity;
    const allInNow = () => performance.now() >= allInAt;
    const allInBanner = h('p', { class: 'sq-allin', hidden: !allInNow() }, '¡Últimos 10 s: todo o nada!');
    if (!allInNow() && allInAt !== Infinity) after(allInAt - performance.now(), () => (allInBanner.hidden = false));
    // si no juega a tiempo, juega la suerte por él
    const moveLeft = h('p', { class: 'sq-msg-text small sq-move-left' });
    if (s.moveEndsAt != null && (s.role === 'hide' || s.role === 'guess')) {
      const end = local(s.moveEndsAt);
      const tick = () => {
        const n = Math.max(0, Math.ceil((end - performance.now()) / 1000));
        moveLeft.textContent = `Te quedan ${n} s; si no, elige la suerte por ti.`;
        moveLeft.classList.toggle('hurry', n <= 5);
      };
      tick();
      every(250, tick);
    }
    let action;
    if (s.role === 'hide') {
      // un toque elige cuántas; el botón grande (arriba, siempre a la vista) las esconde
      mine.hide = null;
      const done = () => mine.hid === s.roundId + ':' + s.mine + ':' + s.theirs;
      const confirm = h('button', { class: 'sq-btn primary sq-confirm', type: 'button', disabled: true }, 'Elige cuántas');
      const nums = Array.from({ length: s.mine }, (_, i) =>
        h(
          'button',
          {
            class: 'sq-num-btn',
            type: 'button',
            'aria-label': `Esconder ${i + 1}`,
            onclick: () => {
              if (done()) return;
              mine.hide = i + 1;
              nums.forEach((b, k) => b.classList.toggle('chosen', k === i));
              confirm.disabled = false;
              confirm.textContent = `✊ Esconder ${i + 1}`;
              vibrate(15);
            },
          },
          String(i + 1),
        ),
      );
      listen(confirm, 'click', () => {
        if (done() || !mine.hide) return;
        mine.hid = s.roundId + ':' + s.mine + ':' + s.theirs;
        vibrate(30);
        send('hide', s.roundId, mine.hide);
        confirm.disabled = true;
        confirm.textContent = `Escondidas: ${mine.hide}`;
      });
      action = [h('p', { class: 'sq-msg-title' }, '¿Cuántas escondes en la mano?'), h('div', { class: 'sq-numbers' }, nums), confirm, h('p', { class: 'sq-msg-text small' }, `${s.rival.name} tendrá que adivinar si son pares o nones.`)];
    } else if (s.role === 'guess') {
      const maxBet = Math.max(1, Math.min(s.mine, s.theirs)); // más no se puede ganar
      mine.bet = Math.min(Math.max(1, mine.bet), maxBet);
      const betEl = h('strong', { class: 'sq-bet' }, String(mine.bet));
      const go = h('button', { class: 'sq-btn primary', type: 'button', disabled: mine.guess == null }, '¡Apostar!');
      const parity = ['Pares', 'Nones'].map((label, i) =>
        h(
          'button',
          {
            class: `sq-btn ${mine.guess === i ? 'on' : ''}`,
            type: 'button',
            onclick: () => {
              mine.guess = i;
              parity.forEach((x, k) => x.classList.toggle('on', k === i));
              go.disabled = false;
            },
          },
          label,
        ),
      );
      const setBet = (d) => {
        mine.bet = Math.min(maxBet, Math.max(1, mine.bet + d));
        betEl.textContent = String(mine.bet);
      };
      const betRow = h('div', { class: 'sq-row center' }, h('button', { class: 'sq-btn small', type: 'button', onclick: () => setBet(-1) }, '−'), h('span', {}, 'Apuestas'), betEl, h('button', { class: 'sq-btn small', type: 'button', onclick: () => setBet(1) }, '+'), h('button', { class: 'sq-btn small', type: 'button', onclick: () => setBet(99) }, 'Todo'));
      const forced = h('p', { class: 'sq-msg-text sq-allin-bet' }, `Todo o nada: apuestas tus ${s.mine} canicas`);
      const lockAll = () => {
        mine.bet = s.mine;
        betRow.hidden = true;
        forced.hidden = false;
      };
      forced.hidden = true;
      if (allInNow()) lockAll();
      else if (allInAt !== Infinity) after(allInAt - performance.now(), lockAll);
      listen(go, 'click', () => {
        if (mine.guess == null) return;
        vibrate(40);
        go.disabled = true;
        send('guess', s.roundId, [mine.guess, mine.bet]);
      });
      action = [
        h('p', { class: 'sq-msg-title' }, `${s.rival.name} ya ha escondido. ¿Pares o nones?`),
        h('div', { class: 'sq-two' }, parity),
        betRow,
        forced,
        go,
      ];
    } else {
      action = [h('p', { class: 'sq-msg-title' }, s.role === 'wait' ? `Esperando a ${s.rival.name}…` : '…')];
    }
    const actionBox = h('div', { class: 'sq-action' }, ...action, moveLeft);
    if (last?.fresh) {
      actionBox.hidden = true;
      after(1700, () => (actionBox.hidden = false));
    }
    return h('div', { class: 'sq-play sq-marbles' }, h('div', { class: 'sq-row' }, h('span', { class: 'sq-game-no' }, `Duelo contra ${numText(s.rival.number)}`), left), allInBanner, score, reveal, actionBox, countdown());
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
