// Móvil en los juegos nuevos: Palabras secretas, Agita el móvil, La gran apuesta y el voto y la ruleta de castigos.
// Todo lo que manda va en un mensaje `play {game, roundId, action, value}` (send).
import { fill, h } from '../shared/dom.js';

const LETTERS = ['A', 'B', 'C', 'D'];
const FOUL_LABEL = { tabu: '¡TABÚ!', mimica: '¡Ha hablado!', describe: '¡Ha dicho la palabra!', tararea: '¡Ha cantado letra!' };
const SPIN_MS = 6000;

/** @param send (game, roundId, action, value?) */
export function createGamesPad({ send, vibrate = () => {} }) {
  const root = h('section', { class: 'games-pad', hidden: true });
  let ticker = 0;
  let signature = null;

  // ---------- Agita el móvil: el acelerómetro (o, sin él, toques en la pantalla)
  const shake = { roundId: null, total: 0, last: null, listening: false, granted: !('DeviceMotionEvent' in window && typeof DeviceMotionEvent.requestPermission === 'function'), timer: 0, until: 0, from: 0 };
  const onMotion = (e) => {
    const a = e.accelerationIncludingGravity ?? e.acceleration;
    if (!a || performance.now() < shake.from || performance.now() > shake.until) return;
    const v = [a.x ?? 0, a.y ?? 0, a.z ?? 0];
    if (shake.last) {
      const d = Math.hypot(v[0] - shake.last[0], v[1] - shake.last[1], v[2] - shake.last[2]);
      if (d > 1.2) shake.total += d / 10; // unidades «sacudidas»: un meneo fuerte ≈ 2–4
    }
    shake.last = v;
  };
  async function askMotion() {
    try {
      shake.granted = (await DeviceMotionEvent.requestPermission()) === 'granted';
    } catch {
      shake.granted = false;
    }
    signature = null;
    if (current) render(current, receivedAt);
  }
  function listen(on) {
    if (on === shake.listening) return;
    shake.listening = on;
    if (on) addEventListener('devicemotion', onMotion);
    else removeEventListener('devicemotion', onMotion);
  }

  let current = null;
  let receivedAt = 0;

  function render(state, stateReceivedAt) {
    current = state;
    receivedAt = stateReceivedAt;
    // (en Agitar, el total y el puesto llegan a cada momento: el móvil ya lleva su cuenta, no hace falta repintar)
    const sh = state.shake && { roundId: state.shake.roundId, phase: state.shake.phase, place: state.shake.phase === 'done' ? state.shake.place : null, points: state.shake.points };
    // (en el pañuelo, lo que falta para el «¡YA!» cambia en cada estado: basta con saber si hay salida)
    const hk = state.hanky && { ...state.hanky, current: state.hanky.current && { ...state.hanky.current, goInMs: state.hanky.current.goInMs != null } };
    const sig = JSON.stringify([state.words, sh, state.bet, hk, state.punish && { ...state.punish, spin: state.punish.spin?.index ?? null }, shake.granted]);
    if (sig === signature) return;
    signature = sig;
    clearInterval(ticker);
    if (state.hanky) return fill(root, hanky(state.hanky));
    if (state.words) return fill(root, words(state.words));
    if (state.shake) return fill(root, shakeView(state.shake));
    if (state.bet) return fill(root, bet(state.bet));
    if (state.punish) return fill(root, punish(state.punish));
    fill(root);
  }

  /** Cuenta atrás de un reloj de la tele (lo que quedaba cuando llegó el estado). */
  function countdown(msLeft, el, format = (s) => String(s)) {
    const end = receivedAt + msLeft;
    const step = () => (el.textContent = format(Math.max(0, Math.ceil((end - performance.now()) / 1000))));
    step();
    ticker = setInterval(step, 200);
    return el;
  }

  // ---------- Palabras secretas
  function words(w) {
    const head = h('p', { class: 'ap-label' }, `Turno ${w.turn} de ${w.turns} · ${w.team ? w.team.name : 'Palabras secretas'}`);
    const card = w.card;
    if (w.phase === 'ready') {
      if (w.role === 'actor')
        return [head, h('p', { class: 'ap-big' }, '¡Te toca!'), h('p', { class: 'ap-sub' }, `Tienes ${w.seconds} s para que ${w.team ? 'tu equipo adivine' : 'los demás adivinen'} todas las palabras que puedas. Cada tarjeta dice cómo: mímica, tabú, descríbelo o tararéalo.`), h('button', { class: 'btn primary big gp-go', type: 'button', onclick: () => act('start') }, '¡Empezar!')];
      return [head, h('p', { class: 'ap-big' }, w.role === 'rival' ? '👀 Vigila' : '🤔 Prepárate'), h('p', { class: 'ap-sub' }, `Le toca a ${w.actor?.name ?? '¿?'}. ${w.role === 'rival' ? 'Verás sus tarjetas: si hace trampa, ¡pita!' : 'Adivina en voz alta las palabras.'}`)];
    }
    if (w.phase === 'done') {
      return [head, h('p', { class: 'ap-big' }, '¡Tiempo!'), h('p', { class: 'ap-sub' }, `${w.score} ${w.score === 1 ? 'palabra' : 'palabras'}${w.score ? ` · +${w.score * w.points}` : ''}`), h('ul', { class: 'gp-words' }, w.results.map((r) => h('li', { class: r.result }, r.word)))];
    }
    const clock = countdown(w.endsInMs ?? 0, h('p', { class: 'ap-count gp-clock' }));
    const top = h('div', { class: 'gp-top' }, clock, h('p', { class: 'gp-score' }, `✓ ${w.score}`));
    if (w.role === 'actor' || w.role === 'rival') {
      const cardEl = card && h('div', { class: `gp-card mode-${card.mode}` }, h('p', { class: 'gp-mode' }, `${card.icon} ${card.label}`), h('p', { class: 'gp-word' }, card.word), card.banned?.length ? h('ul', { class: 'gp-banned' }, card.banned.map((b) => h('li', {}, b))) : null, h('p', { class: 'gp-rule' }, card.rule));
      if (w.role === 'actor')
        return [top, cardEl, h('div', { class: 'gp-actions' }, h('button', { class: 'btn gp-pass', type: 'button', onclick: () => act('pass') }, 'Pasar'), h('button', { class: 'btn primary gp-ok', type: 'button', onclick: () => act('ok') }, '✓ ¡Acertada!'))];
      return [top, h('p', { class: 'ap-sub' }, `Lo hace ${w.actor?.name ?? '¿?'}: si hace trampa, ¡pita!`), cardEl, h('button', { class: 'btn gp-foul', type: 'button', onclick: () => act('foul') }, card ? FOUL_LABEL[card.mode] : '¡Falta!')];
    }
    return [top, h('p', { class: 'ap-big' }, '¡Adivina!'), h('p', { class: 'ap-sub' }, `Lo hace ${w.actor?.name ?? '¿?'}`), card ? h('p', { class: 'gp-mode big' }, `${card.icon} ${card.label}`) : null, card ? h('p', { class: 'gp-rule' }, card.rule) : null];

    function act(action) {
      vibrate(action === 'ok' ? 40 : 20);
      send('palabras', w.roundId, action, action === 'start' ? undefined : w.cardNo);
      // hasta que llegue la tarjeta siguiente, los botones quietos (el doble toque no cuenta)
      for (const b of root.querySelectorAll('.gp-actions button, .gp-foul')) b.disabled = true;
    }
  }

  // ---------- Agita el móvil
  function shakeView(s) {
    if (shake.roundId !== s.roundId) Object.assign(shake, { roundId: s.roundId, total: 0, last: null });
    const head = h('p', { class: 'ap-label' }, 'Agita el móvil');
    const needsPermission = !shake.granted && 'DeviceMotionEvent' in window;
    const permit = needsPermission ? h('button', { class: 'btn primary big', type: 'button', onclick: askMotion }, '📱 Activar el sensor') : null;
    if (s.phase === 'ready') {
      listen(false);
      return [head, h('p', { class: 'ap-big' }, '¡Prepárate!'), h('p', { class: 'ap-sub' }, `Cuando empiece, agítalo con fuerza durante ${s.seconds} s. ¡Sujétalo bien! Sin sensor, toca la pantalla muy rápido.`), permit];
    }
    if (s.phase === 'done') {
      listen(false);
      clearInterval(shake.timer);
      return [head, h('p', { class: 'ap-big' }, s.place ? `${s.place}º de ${s.of}` : '¡Tiempo!'), h('p', { class: 'ap-sub' }, `${s.total} sacudidas${s.points ? ` · +${s.points}` : ''}`)];
    }
    // En marcha: medir desde que empieza hasta que acaba, mandar el total cada 250 ms
    shake.from = receivedAt + (s.opensInMs ?? 0);
    shake.until = receivedAt + (s.endsInMs ?? 0);
    listen(true);
    clearInterval(shake.timer);
    const num = h('p', { class: 'gp-shake-num' }, String(Math.round(shake.total)));
    shake.timer = setInterval(() => {
      const t = performance.now();
      num.textContent = String(Math.round(shake.total));
      if (t >= shake.from && t <= shake.until + 400) send('agitar', s.roundId, 'total', Math.round(shake.total));
      if (t > shake.until + 400) clearInterval(shake.timer);
    }, 250);
    const big = countdown(Math.max(0, s.opensInMs ?? 0), h('p', { class: 'ap-count' }), (n) => (n > 0 ? String(n) : '¡AGITA!'));
    // sin sensor (o en un ordenador): cada toque cuenta
    const tapZone = h(
      'button',
      {
        class: 'gp-tap',
        type: 'button',
        onpointerdown: () => {
          const t = performance.now();
          if (t >= shake.from && t <= shake.until) shake.total += 3;
        },
      },
      big,
      num,
      h('small', {}, 'sacudidas'),
    );
    return [head, permit, tapZone];
  }

  // ---------- El pañuelo (lobos contra vampiros): el móvil solo avisa; lo que cuenta es correr
  let hankyBuzzed = null; // a qué llamada ya se ha vibrado
  function hanky(k) {
    const ICON = { wolf: '🐺', vampire: '🧛' };
    const head = h('p', { class: 'ap-label' }, k.side ? `${ICON[k.side]} Juegas con ${k.teams[k.side]}` : 'Lobos contra vampiros');
    const score = h('p', { class: 'gp-hk-score' }, `${ICON.wolf} ${k.score.wolf} – ${k.score.vampire} ${ICON.vampire}`);
    if (k.finished) {
      const won = k.champion === k.side;
      const text = k.champion === 'tie' ? '¡Empate!' : won ? '¡Habéis ganado! 🎉' : `${ICON[k.champion]} ${k.teams[k.champion]}, campeones`;
      return [head, h('p', { class: `ap-big ${won ? 'win' : ''}` }, text), score];
    }
    const c = k.current;
    if (!c) return [head, h('p', { class: 'ap-big' }, '¿Quién saldrá?'), h('p', { class: 'ap-sub' }, 'Atento a la tele: puede tocarte a ti. Uno de cada equipo, al sillón; a la señal, a por el pañuelo y de vuelta.'), score];
    const pair = h('p', { class: 'gp-hk-pair' }, `${ICON.wolf} ${c.wolf}  contra  ${c.vampire} ${ICON.vampire}`);
    if (c.mine && c.step !== 'done' && hankyBuzzed !== c.calledAt) {
      hankyBuzzed = c.calledAt;
      vibrate([200, 100, 200, 100, 400]);
    }
    if (c.step === 'done') {
      const won = c.winner === c.mine;
      const winnerName = c[c.winner];
      return [head, pair, h('p', { class: `ap-big ${c.mine ? (won ? 'win' : 'lose') : ''}` }, c.mine ? (won ? `🏆 ¡Has ganado! +${k.points}` : `¡Casi! Gana ${winnerName}`) : `Gana ${winnerName} ${ICON[c.winner]}`), score];
    }
    if (c.step === 'running') {
      // Cuenta atrás hasta el «¡YA!» (con lo que faltaba cuando llegó el estado)
      const big = h('p', { class: 'ap-count' });
      const end = receivedAt + (c.goInMs ?? 0);
      let went = false;
      const step = () => {
        const left = Math.ceil((end - performance.now()) / 1000);
        // (mientras la ruleta de la tele busca a quién, sin números: en cuanto se sabe, ¡ya!)
        big.textContent = left > 0 ? '👀 Mira la tele…' : c.mine ? '¡CORRE!' : '¡YA!';
        if (left <= 0 && !went) {
          went = true;
          if (c.mine) vibrate(600);
        }
      };
      step();
      ticker = setInterval(step, 100);
      return [head, pair, big, h('p', { class: 'ap-sub' }, c.mine ? 'Coge el pañuelo y vuelve al sillón antes que tu rival.' : '¡Anima a los tuyos!'), score];
    }
    return [head, c.mine ? h('p', { class: 'ap-big win' }, '¡TE TOCA!') : null, pair, h('p', { class: 'ap-sub' }, c.mine ? 'Siéntate en el sillón y espera la señal de la tele.' : 'Al sillón… ¡atentos a la señal!'), score];
  }

  // ---------- La gran apuesta
  let betSeen = null; // `${roundId}:${apuesta}` ya avisada (o `:sent` si acaba de mandarla)
  function bet(b) {
    const head = h('p', { class: 'ap-label' }, `La gran apuesta${b.ownerName ? ` · ${b.ownerName}` : ''}`);
    if (b.phase === 'betting') {
      if (!b.acts) return [head, h('p', { class: 'ap-big' }, '💰 Apostando…'), h('p', { class: 'ap-sub' }, `Apuesta ${b.spokesperson ?? 'tu portavoz'} por el equipo: ¡decidlo juntos!`)];
      const input = h('input', { type: 'range', min: '0', max: String(b.max), step: '1', value: String(b.bet ?? Math.ceil(b.max / 2)), class: 'gp-range' });
      const label = h('p', { class: 'gp-bet' }, `${input.value} puntos`);
      input.addEventListener('input', () => (label.textContent = `${input.value} puntos`));
      const quick = (v) => {
        input.value = String(v);
        label.textContent = `${v} puntos`;
      };
      // la tele ya tiene la apuesta: se dice (y vibra) para que no haya dudas de si llegó
      if (b.bet != null && betSeen !== `${b.roundId}:${b.bet}`) {
        if (betSeen === `${b.roundId}:sent`) vibrate(60); // (la acaba de mandar este móvil)
        betSeen = `${b.roundId}:${b.bet}`;
      }
      return [
        head,
        h('p', { class: 'ap-sub' }, `¿Cuánto os jugáis? Hasta ${b.max}. Si acertáis la pregunta lo ganáis; si no, lo perdéis.`),
        b.bet != null ? h('p', { class: 'gp-bet-ok' }, `✓ Apuesta guardada: ${b.bet} ${b.bet === 1 ? 'punto' : 'puntos'}`) : null,
        label,
        input,
        h('div', { class: 'gp-quick' }, [0, Math.round(b.max / 4), Math.round(b.max / 2), b.max].map((v) => h('button', { class: 'btn small', type: 'button', onclick: () => quick(v) }, v === b.max ? `Todo (${v})` : String(v)))),
        h(
          'button',
          {
            class: 'btn primary big',
            type: 'button',
            onclick: () => {
              betSeen = `${b.roundId}:sent`;
              send('apuesta', b.roundId, 'bet', Number(input.value));
            },
          },
          b.bet != null ? `Cambiar apuesta (ahora ${b.bet})` : 'Apostar',
        ),
      ];
    }
    const options = h(
      'div',
      { class: 'gp-options' },
      b.options.map((o, i) =>
        h(
          'button',
          {
            class: `mill-pad-opt ${b.answer === i ? 'chosen' : ''} ${b.correct === i ? 'correct' : ''}`,
            type: 'button',
            disabled: !b.acts || b.phase !== 'question',
            onclick: () => send('apuesta', b.roundId, 'answer', i),
          },
          h('span', { class: 'mill-letter' }, `${LETTERS[i]}:`),
          h('span', { class: 'mill-text' }, o),
        ),
      ),
    );
    if (b.phase === 'revealed') {
      const r = b.result ?? 0;
      return [head, h('p', { class: `ap-big ${r > 0 ? 'win' : r < 0 ? 'lose' : ''}` }, r > 0 ? `¡+${r}! 🎉` : r < 0 ? `${r} 😬` : 'Sin cambios'), h('p', { class: 'mill-q' }, b.question), options];
    }
    return [head, h('p', { class: 'ap-sub' }, `Apostado: ${b.bet ?? 0}. ${b.acts ? 'Elige la respuesta (puedes cambiarla hasta que se revele).' : `Responde ${b.spokesperson ?? 'tu portavoz'}.`}`), h('p', { class: 'mill-q' }, b.question), options];
  }

  // ---------- Castigos
  function punish(p) {
    if (p.step === 'vote') {
      const mine = new Set(p.mine ?? []);
      if (p.closed) {
        return [h('p', { class: 'ap-label' }, 'Castigos'), h('p', { class: 'ap-big' }, '¡A la ruleta!'), h('ul', { class: 'gp-punish' }, p.finalists.map((f) => h('li', { class: 'chosen' }, f.text)))];
      }
      return [
        h('p', { class: 'ap-label' }, `Castigos · has elegido ${mine.size} de 3`),
        h('p', { class: 'ap-sub' }, 'Elige 3 castigos para el equipo que pierda. Al final, una ruleta decide cuál.'),
        h(
          'div',
          { class: 'gp-punish' },
          p.options.map((text, i) =>
            h(
              'button',
              {
                class: `btn gp-punish-opt ${mine.has(i) ? 'chosen' : ''}`,
                type: 'button',
                onclick: () => {
                  vibrate(15);
                  send('castigo', null, 'toggle', i);
                },
              },
              mine.has(i) ? '✓ ' : '',
              text,
            ),
          ),
        ),
      ];
    }
    // Ruleta (al final)
    const landed = p.spin && p.spin.ago >= SPIN_MS;
    if (p.spin && !landed) setTimeout(() => (signature = null) || (current && render(current, receivedAt)), SPIN_MS - p.spin.ago + 100);
    return [
      h('p', { class: 'ap-label' }, 'La ruleta del castigo'),
      h('p', { class: 'ap-big' }, landed ? '🎡 ¡Ya está!' : p.spin ? '🎡 Girando…' : '🎡 Mira la tele'),
      p.loser ? h('p', { class: 'ap-sub' }, `Pierde${p.loser.isTeam ? 'n' : ''}: ${p.loser.name}`) : null,
      landed ? h('p', { class: 'gp-punish-result' }, p.spin.text) : null,
    ];
  }

  return {
    root,
    render,
    show() {
      root.hidden = false;
    },
    hide() {
      root.hidden = true;
      clearInterval(ticker);
      clearInterval(shake.timer);
      listen(false);
      signature = null;
    },
  };
}
