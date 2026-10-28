// Pantalla de la tele en Squid Games: cada juego con su decorado y su ritmo (ver la cabecera de cada uno). Lo continuo
// (avances, toques, grietas, la cuerda) se pinta en su sitio, sin volver a montar la escena: así nada salta ni se
// repiten los sonidos. Los sonidos van por sound.sq (fx/squidSound.js): con los archivos de la carpeta si los hay.
import { fill, h } from '../shared/dom.js';
import { avatarOf, getColor } from '../shared/appearance.js';
import { CHANT, MARBLE_MOVE_MS, SPHASE, chantTimes } from '../core/squid.js';
import { cookie, doll, guard, logo, numText, piggy, shape, svg, tree } from '../shared/squidArt.js';
import { sound } from './fx/audio.js';
import { burst, celebrate } from './fx/confetti.js';
import { runRing, timerRing } from './wordsStage.js';

const GAME_NAMES = { luzroja: 'Luz roja', panal: 'El panal', puente: 'El puente', cuerda: 'Tira y afloja', canicas: 'Canicas', presentador: 'el presentador' };
const ORDINAL = ['uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho'];
const COUNT_SHAPE = { 3: 'square', 2: 'triangle', 1: 'circle' };

// Puente (px del mundo 3D): separación entre tramos, ancho de cada cristal, hueco entre los dos y altura de los ojos
const D = 300;
const W = 230;
const GAP = 80;
const EYE = 190;
const sideX = (side) => (side === 'L' ? -1 : 1) * (W + GAP) / 2;
const ease = (u) => (u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2);
const clamp01 = (u) => Math.max(0, Math.min(1, u));
const lerp = (a, b, u) => a + (b - a) * u;

/** Ficha del jugador como el parche del chándal: número grande, avatar y nombre. */
function badge(p, extra = null, cls = '') {
  return h(
    'span',
    { class: `sq-badge ${p.out ? 'out' : ''} ${cls}`, style: { '--pc': getColor(p.color).bg }, dataset: { id: p.id } },
    h('span', { class: 'sq-ava emoji' }, avatarOf(p)),
    h('span', { class: 'sq-num' }, numText(p.number)),
    h('span', { class: 'sq-name' }, p.name),
    extra,
  );
}

const hash = (s) => [...String(s)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 2147483646, 7) + 1;

export function createSquidStage() {
  const root = h('section', { class: 'squid-stage' });
  let timers = [];
  let ticks = [];
  let loops = []; // sonidos que duran (respiración, viento…): {stop()}
  let raf = 0;
  let key = null; // escena montada: si no cambia, solo se actualiza lo que se mueve
  let update = null; // (vista) → actualizar en su sitio
  const done = new Set(); // efectos que solo pasan una vez (anuncios, revelados), aunque la escena se vuelva a montar
  const once = (k, fn) => {
    if (done.has(k)) return false;
    done.add(k);
    fn();
    return true;
  };

  // Megafonía: «Jugador 47, eliminado». Los que caen a la vez, en un solo anuncio.
  let outQueue = [];
  let outTimer = 0;
  let talkingUntil = 0; // hasta cuándo habla (más o menos) la megafonía: lo siguiente espera a que acabe
  let lastScene = null; // juego en pantalla (para callar la megafonía al cambiar)
  function speak(text) {
    sound.say(text);
    talkingUntil = Math.max(talkingUntil, performance.now()) + 900 + text.length * 80;
  }
  function announceOut(players) {
    outQueue.push(...players.map((p) => numText(p.number)));
    talkingUntil = Math.max(talkingUntil, performance.now() + 2500); // va a hablar
    clearTimeout(outTimer);
    outTimer = setTimeout(() => {
      const ns = outQueue.splice(0);
      if (!ns.length) return;
      if (ns.length === 1) return speak(`Jugador ${ns[0]}, eliminado.`);
      if (ns.length > 5) return speak(`${ns.length} jugadores eliminados.`);
      speak(`Jugadores ${ns.slice(0, -1).join(', ')} y ${ns.at(-1)}, eliminados.`);
    }, 650);
  }
  /** «Jugador 47… ¡se salva por los pelos!» (pasado el tope del juego: nunca se ha dicho «eliminado» antes). */
  function announceSpared(players) {
    const ns = players.map((p) => numText(p.number));
    if (!ns.length) return;
    later(Math.max(700, quiet()), () => speak(ns.length === 1 ? `Jugador ${ns[0]}… se salva por los pelos.` : `Jugadores ${ns.slice(0, -1).join(', ')} y ${ns.at(-1)}… se salvan por los pelos.`));
  }
  /** Espera (ms) hasta que acabe de hablar la megafonía. */
  const quiet = () => Math.max(0, talkingUntil - performance.now());

  function stop() {
    timers.forEach(clearTimeout);
    ticks.forEach(clearInterval);
    loops.forEach((l) => l?.stop());
    cancelAnimationFrame(raf);
    timers = [];
    ticks = [];
    loops = [];
    raf = 0;
    key = null;
    update = null;
    holdPot = false;
  }

  function later(ms, fn) {
    timers.push(setTimeout(fn, Math.max(0, ms)));
  }

  function clock(endsAt, total, cls = '') {
    const el = timerRing(`sq-clock ${cls}`);
    ticks.push(runRing(el, endsAt, total));
    return el;
  }

  /** Cuenta atrás 3 □ · 2 △ · 1 ○ hasta `tOpen`. */
  function countdown(tOpen) {
    const el = h('div', { class: 'sq-count', hidden: true });
    let last = null;
    const step = () => {
      const left = tOpen - performance.now();
      if (left <= 0) {
        el.hidden = true;
        return;
      }
      const n = Math.ceil(left / 1000);
      if (n !== last) {
        last = n;
        el.hidden = false;
        fill(el, shape(COUNT_SHAPE[n] ?? 'circle', 'sq-count-shape'), h('b', {}, String(n)));
        el.classList.remove('pop');
        void el.offsetWidth;
        el.classList.add('pop');
        sound.play('count');
      }
      timers.push(setTimeout(step, Math.min(100, left)));
    };
    step();
    return el;
  }

  /** Cifra que sube de `from` a `to` en `ms` (sin ceros delante, a diferencia del cuentakilómetros). */
  function countUp(el, from, to, ms) {
    const t0 = performance.now();
    const step = () => {
      const k = Math.min(1, (performance.now() - t0) / ms);
      el.textContent = String(Math.round(from + (to - from) * (1 - (1 - k) ** 3)));
      if (k < 1) timers.push(setTimeout(step, 40));
    };
    step();
  }

  // Cabecera: la hucha y cuántos siguen vivos (en directo: quien cae en el juego en marcha ya no cuenta)
  const headPot = h('strong');
  const headAlive = h('strong');
  const headAliveWord = h('span');
  const headKicker = h('span', { class: 'sq-kicker' });
  const headCode = h('b');
  let holdPot = false;
  const head = h(
    'header',
    { class: 'sq-head' },
    h('span', { class: 'sq-brand' }, logo(), h('span', {}, 'SQUID GAMES'), h('span', { class: 'sq-code' }, 'Sala ', headCode)),
    headKicker,
    h('span', { class: 'sq-pot' }, h('span', { class: 'sq-pot-pig emoji' }, '🐷'), headPot, ' pts', h('span', { class: 'sq-dot' }, '·'), headAlive, headAliveWord),
  );
  function header(v) {
    const fallenNow = v.phase === SPHASE.RUNNING ? (v.g?.players?.filter((p) => p.out).length ?? 0) : 0;
    const alive = v.alive.length - fallenNow;
    headKicker.textContent = v.game === 'hucha' ? 'El reparto' : `Juego ${v.step} de ${v.steps - 1} · ${v.label}`;
    if (!holdPot) headPot.textContent = String(v.pot); // en la hucha, no se destripa el total antes de contarlo
    headAlive.textContent = String(alive);
    headAliveWord.textContent = alive === 1 ? ' vivo' : ' vivos';
    return head;
  }

  function render(view) {
    const v = view.squid;
    const g = v.g;
    headCode.textContent = view.code ?? ''; // quien llegue tarde sabe a qué sala entrar
    // Otro juego (o se repite con R): la megafonía de antes se calla, que no se pisen dos voces
    const sceneId = `${v.step}|${g?.roundId ?? ''}`;
    if (lastScene != null && sceneId !== lastScene) {
      sound.hush();
      outQueue = [];
      clearTimeout(outTimer);
      talkingUntil = 0;
    }
    lastScene = sceneId;
    root.dataset.game = v.game;
    root.dataset.phase = v.phase;
    const k = JSON.stringify([v.game, g?.roundId, v.phase, v.step, structure(v)]);
    if (k === key && update) {
      header(v);
      return update(v);
    }
    stop();
    key = k;
    // Las pantallas fijas no se vuelven a montar con cada vista (cortaría sus animaciones): solo lo que cambia
    update = () => {};
    if (v.game === 'hucha') return fill(root, header(v), hucha(v));
    if (!g || v.phase === SPHASE.READY) return fill(root, header(v), intro(v));
    if (v.phase === SPHASE.DONE) return fill(root, header(v), finale(v));
    const scene = { luzroja, panal, puente, cuerda, canicas }[v.game](v);
    fill(root, header(v), scene);
  }

  /** Lo que obliga a montar la escena otra vez (lo demás se actualiza en su sitio). */
  function structure(v) {
    const g = v.g;
    if (!g || v.phase !== SPHASE.RUNNING) return null;
    if (v.game === 'puente') return [g.pos, g.moves.length, g.current, g.jumping];
    return null;
  }

  // ------------------------------------------------------------------ antes de cada juego

  const GAME_ART = {
    luzroja: () => {
      const d = doll();
      d.dataset.face = 'front';
      return d;
    },
    panal: () => cookie('paraguas', 3),
    puente: () => svg('<svg viewBox="0 0 200 120" class="sq-art-bridge"><g fill="#bfe9ff33" stroke="#bfe9ff" stroke-width="2"><path d="M20 110 L70 40 L95 40 L60 110 Z"/><path d="M180 110 L130 40 L105 40 L140 110 Z"/><path d="M78 30 L92 10 L100 10 L90 30 Z"/><path d="M122 30 L108 10 L100 10 L110 30 Z"/></g></svg>'),
    cuerda: () => svg('<svg viewBox="0 0 220 80" class="sq-art-rope"><path d="M5 40 Q55 30 110 40 T215 40" stroke="#c8a165" stroke-width="10" fill="none" stroke-linecap="round"/><path d="M5 40 Q55 30 110 40 T215 40" stroke="#8a6a3a" stroke-width="10" fill="none" stroke-dasharray="4 8"/><path d="M100 28 L110 40 L120 28 M100 52 L110 40 L120 52" stroke="#ff2e88" stroke-width="6" fill="none"/></svg>'),
    canicas: () => h('span', { class: 'sq-art-marbles' }, ...Array.from({ length: 5 }, (_, i) => h('i', { style: { '--h': `${i * 70}deg` } }))),
  };

  function intro(v) {
    const g = v.g;
    // Con poca gente este juego no se juega: se dice ya (y Espacio pasa)
    const lone = v.alive.length <= 1;
    const short = !lone && v.alive.length < (v.min ?? 1);
    once(`intro|${g?.roundId ?? v.step}`, () => {
      sound.sq('pa');
      later(1900, () => speak(lone ? 'Solo queda un jugador. Vamos a la hucha.' : short ? `${v.label}: no queda gente suficiente. Este juego se salta.` : `Juego número ${ORDINAL[v.step - 1] ?? v.step}: ${v.label}.`));
    });
    // Lo que cambia mientras se espera: quién ha elegido lata y quién juega (si el presentador revive a alguien)
    const picks = h('p', { class: 'sq-sub' });
    const roster = h('div', { class: 'sq-roster' });
    const paint = (vv) => {
      const gg = vv.g;
      picks.hidden = !(vv.game === 'panal' && gg);
      if (vv.game === 'panal' && gg) picks.textContent = `${gg.picked.length} de ${gg.players.length} han elegido lata`;
      roster.dataset.n = vv.alive.length > 14 ? 'many' : vv.alive.length > 8 ? 'some' : 'few';
      fill(roster, vv.alive.map((p) => badge(p)));
    };
    paint(v);
    update = paint;
    return h(
      'div',
      { class: 'sq-intro' },
      guard('circle'),
      h(
        'div',
        { class: 'sq-card anim-in' },
        h('p', { class: 'sq-game-no' }, `Juego ${v.step}`),
        h('div', { class: 'sq-art' }, GAME_ART[v.game]?.()),
        h('h1', { class: 'sq-title' }, v.label),
        g?.restarted ? h('p', { class: 'sq-restarted' }, g.restarted === 'manual' ? 'Prueba reiniciada: vuelve a empezar' : 'La tele se ha recargado: esta prueba vuelve a empezar') : null,
        h('p', { class: 'sq-rule' }, lone ? 'Solo queda un jugador: ¡Squid Games ha terminado! Vamos a la hucha.' : short ? 'No queda gente suficiente para este juego: se salta.' : v.rule),
        picks,
        roster,
        h('p', { class: 'sq-hint' }, lone ? 'Espacio: a la hucha' : short ? 'Espacio: siguiente' : 'Empieza desde el mando (o Espacio)'),
      ),
      guard('square'),
    );
  }

  // ------------------------------------------------------------------ al acabar cada juego

  /** Fin de un juego: en la cuerda, primero se ve cómo cae el bando que pierde; luego los eliminados, uno a uno. */
  function finale(v) {
    const g = v.g;
    // Cuerda: primero se ve cómo cae el bando que pierde
    if (v.game === 'cuerda' && !g.skipped && g.winner && !done.has(`end|${g.roundId}`)) {
      done.add(`end|${g.roundId}`);
      const wrap = h('div', { class: 'sq-finale' }, tugScene(v, { final: true }));
      later(4200, () => fill(wrap, results(v)));
      return wrap;
    }
    // Luz roja por tiempo: la muñeca se gira por última vez y caen los que no llegaron
    const late = v.game === 'luzroja' ? g.players.filter((p) => g.fallen[p.id]?.why === 'time') : [];
    if (late.length && !done.has(`end|${g.roundId}`)) {
      done.add(`end|${g.roundId}`);
      const wrap = h('div', { class: 'sq-finale' }, luzroja(v, { final: late }));
      later(2300 + late.length * 160, () => fill(wrap, results(v)));
      return wrap;
    }
    return results(v);
  }

  /** Resumen de un juego: los dorsales de los eliminados se tachan uno a uno y sus monedas caen en la hucha. */
  function results(v) {
    const g = v.g;
    const gone = g.players.filter((p) => p.out);
    const safe = g.players.filter((p) => !p.out);
    const before = v.pot - gone.length * v.perHead;
    const fresh = once(`done|${g.roundId}`, () => {});
    // Primero la megafonía dice qué ha pasado (cuando acabe de hablar, si estaba hablando); luego, redoble y un sello
    // por eliminado; al final, las monedas caen en la hucha (la cabecera no se adelanta)
    const talk = fresh ? quiet() : 0;
    const wait = 500;
    const step = Math.max(140, Math.min(300, 3000 / Math.max(1, gone.length)));
    const lone = safe.length <= 1 && !g.skipped && v.lastGame;
    const crossedAll = v.game === 'puente' && !gone.length;
    // se salvan por los pelos (si no, no llegaba nadie al final)
    const sparedIds = new Set(g.spared ?? []);
    const sparedList = g.players.filter((p) => sparedIds.has(p.id));
    const title = g.skipped ? 'Este juego se salta' : crossedAll ? '¡Todos cruzan!' : gone.length ? `${gone.length} ${gone.length === 1 ? 'eliminado' : 'eliminados'}` : sparedList.length ? '¡Por los pelos!' : '¡Nadie cae!';
    const potEl = h('strong', { class: 'sq-done-pot' }, String(fresh && gone.length ? before : v.pot));
    const pig = piggy();
    // lleno = lo que habría si cayeran casi todos (que no parezca llena con cuatro monedas)
    const full = Math.max(1, (v.alive.length + v.fallen.length) * v.perHead * 0.75);
    pig.style.setProperty('--fill', String(Math.min(1, (fresh ? before : v.pot) / full)));
    if (fresh) {
      if (gone.length) {
        holdPot = true;
        headPot.textContent = String(before);
      }
      const last = v.lastGame;
      later(talk, () => speak(g.skipped ? 'Este juego se salta.' : lone ? (safe.length ? 'Solo queda un jugador. Squid Games ha terminado.' : 'No queda nadie. Squid Games ha terminado.') : `${last ? 'Último juego terminado' : 'Juego terminado'}. ${gone.length === 0 ? 'Nadie ha sido eliminado' : gone.length === 1 ? 'Un eliminado' : `${gone.length} eliminados`}.${sparedList.length ? ` ${sparedList.length === 1 ? 'Uno se salva' : `${sparedList.length} se salvan`} por los pelos.` : ''}`));
      if (gone.length) later(wait - 600, () => sound.play('roll'));
      gone.forEach((_, i) => later(wait + i * step, () => sound.sq('stamp')));
      const filled = wait + gone.length * step;
      if (gone.length)
        later(filled, () => {
          sound.sq('coins', { dur: 1.4 });
          pig.style.setProperty('--fill', String(Math.min(1, v.pot / full)));
          countUp(potEl, before, v.pot, 1200);
          later(1200, () => {
            holdPot = false;
            headPot.textContent = String(v.pot);
          });
        });
    }
    const dorsal = (p, i) =>
      h(
        'span',
        { class: 'sq-dorsal', style: { '--d': `${wait + i * step}ms`, '--pc': getColor(p.color).bg } },
        h('span', { class: 'sq-ava emoji' }, avatarOf(p)),
        h('b', {}, numText(p.number)),
        h('small', {}, p.name),
        h('i', { class: 'sq-x' }),
      );
    return h(
      'div',
      { class: `sq-results ${fresh ? 'fresh' : ''}` },
      h(
        'div',
        { class: 'sq-results-main' },
        h('p', { class: 'sq-game-no' }, `Juego ${v.step} · ${v.label}`),
        h('h1', { class: 'sq-title' }, title),
        g.skipped ? h('p', { class: 'sq-rule' }, 'No queda gente suficiente para jugarlo.') : null,
        gone.length ? h('div', { class: `sq-dorsals ${gone.length > 8 ? 'many' : ''}` }, gone.map(dorsal)) : null,
        sparedList.length ? h('p', { class: 'sq-spared' }, h('span', {}, '¡Por los pelos! Se salvan: '), ...sparedList.map((p) => badge(p))) : null,
        h('p', { class: 'sq-alive-line' }, v.game === 'puente' && safe.length && !lone ? `¡Han cruzado ${safe.length}! Pasan a la hucha` : lone ? (safe.length ? '¡Solo queda uno! Squid Games ha terminado' : 'No queda nadie: Squid Games ha terminado') : `Siguen vivos: ${safe.length}`),
        h('div', { class: 'sq-roster alive', dataset: { n: safe.length > 14 ? 'many' : safe.length > 8 ? 'some' : 'few' } }, safe.map((p) => badge(p))),
      ),
      h('div', { class: 'sq-results-pig' }, pig, h('p', { class: 'sq-pot-line' }, potEl, h('small', {}, ` puntos en la hucha · ${v.perHead} por eliminado`))),
    );
  }

  // ------------------------------------------------------------------ la hucha

  function hucha(v) {
    const fresh = once(`hucha|${v.step}|${v.fallen.length}|${v.alive.length}`, () => {});
    const pig = piggy();
    const total = h('strong', { class: 'sq-hucha-total' }, '0');
    const list = h('div', { class: `sq-hucha-fallen ${v.fallen.length > 10 ? 'many' : ''}` });
    const share = h('div', { class: 'sq-hucha-share', hidden: true });
    const fallen = v.fallen;
    const gap = Math.max(160, Math.min(320, 4200 / Math.max(1, fallen.length)));
    const fillTo = (k) => pig.style.setProperty('--fill', String(fallen.length ? k / fallen.length : 0));
    const showShare = () => {
      share.hidden = false;
      fill(
        share,
        h('p', { class: 'sq-rule' }, v.alive.length ? (v.alive.length === 1 ? 'El superviviente se lo lleva todo' : `Se reparten ${v.pot} entre ${v.alive.length}`) : 'No ha sobrevivido nadie: la hucha se queda llena'),
        // pocos ganadores: cada uno en grande, con su cara
        h(
          'div',
          { class: `sq-winners ${v.alive.length <= 3 ? 'big' : v.alive.length > 8 ? 'many' : ''}` },
          v.alive.map((p) => h('span', { class: 'sq-winner', style: { '--pc': getColor(p.color).bg } }, h('span', { class: 'sq-ava emoji' }, avatarOf(p)), h('b', {}, numText(p.number)), h('small', {}, p.name), h('strong', { class: 'sq-plus' }, `+${v.awarded?.[p.id] ?? v.shares?.[p.id] ?? v.share}`))),
        ),
      );
    };
    const perHead = fallen.length ? Math.round(v.pot / fallen.length) : 0;
    if (fresh) {
      holdPot = true;
      headPot.textContent = '¿?';
      sound.sq('pa');
      later(1800, () => speak(fallen.length ? 'Que comience el recuento.' : 'Nadie ha sido eliminado.'));
      fallen.forEach((p, i) => {
        later(2600 + i * gap, () => {
          list.append(h('span', { class: 'sq-hucha-num' }, h('b', {}, numText(p.number)), h('small', {}, GAME_NAMES[p.game] ?? p.game)));
          fill(total, String(Math.min(v.pot, perHead * (i + 1))));
          fillTo(i + 1);
          sound.sq('coins', { dur: 0.6, gain: 0.55 });
        });
      });
      const end = 2600 + fallen.length * gap + 500;
      later(end, () => {
        total.textContent = String(v.pot);
        holdPot = false;
        headPot.textContent = String(v.pot);
        sound.play('hit');
        later(500, () => speak(v.alive.length === 1 ? `Hay un superviviente. Se lleva los ${v.pot} puntos.` : v.alive.length ? `Hay ${v.alive.length} supervivientes. ${v.pot} puntos para repartir.` : 'No hay supervivientes.'));
      });
      later(end + 1600, () => {
        showShare();
        if (v.alive.length) {
          sound.play('fanfare');
          celebrate(4000, { theme: 'money' });
          burst({ y: 0.35, count: 80, theme: 'money' });
        }
      });
    } else {
      for (const p of fallen) list.append(h('span', { class: 'sq-hucha-num' }, h('b', {}, numText(p.number)), h('small', {}, GAME_NAMES[p.game] ?? p.game)));
      fill(total, String(v.pot));
      fillTo(fallen.length);
      showShare();
    }
    if (!fresh) pig.style.setProperty('--fill', fallen.length ? '1' : '0');
    return h('div', { class: 'sq-hucha' }, h('div', { class: 'sq-hucha-hang' }, pig), h('div', { class: 'sq-hucha-side' }, h('p', { class: 'sq-game-no' }, 'La hucha'), h('p', { class: 'sq-hucha-amount' }, total, h('small', {}, ' puntos')), list, share));
  }

  // ------------------------------------------------------------------ 1. Luz roja, luz verde
  // La muñeca canta de espaldas mientras está verde; la luz se pone roja justo al acabar la frase (la hora de cada
  // cambio viene en los `cues`). En rojo gira la cabeza, le brillan los ojos y un haz barre el campo.

  /** final = los que no llegaron a tiempo: la escena congelada en rojo y caen uno a uno (fin por tiempo). */
  function luzroja(v, { final = null } = {}) {
    const g = v.g;
    const dollEl = doll();
    const lyrics = h('p', { class: 'sq-lyrics' }, CHANT.map((s) => h('span', {}, s)), h('small', {}, 'Cuando acaba la canción, se gira'));
    const flash = h('p', { class: 'sq-light-flash', hidden: true });
    const pill = h('p', { class: 'sq-light-pill', dataset: { light: 'wait' } }, 'Preparados…');
    const beam = h('div', { class: 'sq-beam' });
    const field = h('div', { class: 'sq-field' }, h('span', { class: 'sq-line finish' }), h('span', { class: 'sq-line start' }));
    const tokens = new Map();
    const n = g.players.length;
    g.players.forEach((p, i) => {
      const lane = (i + 0.5) / n;
      const el = h('span', { class: 'sq-token', style: { '--pc': getColor(p.color).bg, '--lane': String(lane) } }, h('span', { class: 'sq-ava emoji' }, avatarOf(p)), h('b', {}, numText(p.number)));
      tokens.set(p.id, { el, p, state: null });
      field.append(el);
    });
    const place = (el, prog) => {
      const pr = Math.min(100, prog) / 100;
      el.style.setProperty('--p', pr.toFixed(3));
    };
    const lateIds = new Set((final ?? []).map((p) => p.id));
    const paint = (vv) => {
      const gg = vv.g;
      const fresh = [];
      for (const [id, t] of tokens) {
        place(t.el, gg.progress[id] ?? 0);
        const st = id in gg.fallen && !lateIds.has(id) ? 'out' : gg.crossed.includes(id) ? 'safe' : gg.saved?.[id] ? 'spared' : '';
        if (st !== t.state) {
          if (t.state !== null && st === 'out') fresh.push(t.p);
          if (t.state !== null && st === 'safe') sound.sq('hold');
          if (t.state !== null && st === 'spared') {
            sound.sq('scan', { dur: 0.6 });
            t.el.append(h('small', { class: 'sq-token-tag' }, '¡Por los pelos!'));
          }
          t.state = st;
          t.el.dataset.state = st;
        }
      }
      if (fresh.length) sound.sq('eliminated'); // sin voz aquí: se pisaría con el canto siguiente (se dice al acabar)
    };
    paint(v);
    if (final) {
      // Se acabó el tiempo: luz roja, la muñeca mira… y caen los que no han llegado
      for (const t of tokens.values()) t.state = t.state ?? '';
      pill.dataset.light = 'red';
      pill.textContent = '¡Tiempo!';
      root.dataset.light = 'red';
      dollEl.dataset.face = 'front';
      lyrics.classList.add('red');
      const lastCue = g.cues.filter((c) => c.t <= g.endsAt).at(-1);
      const turned = lastCue?.light !== 'red' ? (sound.sq('headTurn', { dur: 2.5 })?.length ?? 0) : 0; // si ya miraba, no se gira otra vez
      sound.sq('scan', { at: performance.now() + turned * 1000, dur: 2 });
      final.forEach((p, i) =>
        later(1100 + i * 160, () => {
          const t = tokens.get(p.id);
          if (t) t.el.dataset.state = 'out';
          if (i === 0) sound.sq('eliminated');
        }),
      );
      later(1300, () => announceOut(final));
      return h('div', { class: 'sq-scene sq-redlight' }, h('div', { class: 'sq-yard' }, h('div', { class: 'sq-mural' }), tree(), dollEl, beam), field, lyrics, h('div', { class: 'sq-hud' }, pill));
    }
    update = paint;

    // Las luces, el canto y la letra van a la hora de cada cambio (temporizadores, no rAF: el navegador lo frena si
    // la ventana no se ve; el sonido se programa en el reloj de audio, exacto)
    const setLight = (c, live) => {
      pill.dataset.light = c.light;
      pill.textContent = c.light === 'green' ? 'Luz verde' : 'Luz roja';
      root.dataset.light = c.light;
      dollEl.dataset.face = c.light === 'green' ? 'back' : 'front';
      for (const s of lyrics.querySelectorAll('span')) s.classList.remove('on');
      if (live) {
        // el cambio, en grande en el centro un momento (se lee desde el sofá)
        flash.hidden = false;
        flash.textContent = c.light === 'green' ? '¡Luz verde!' : '¡Luz roja!';
        flash.dataset.light = c.light;
        flash.getAnimations().forEach((a) => a.cancel());
        flash.animate([{ opacity: 0, transform: 'translate(-50%, -50%) scale(1.4)' }, { opacity: 1, transform: 'translate(-50%, -50%) scale(1)', offset: 0.15 }, { opacity: 1, offset: 0.7 }, { opacity: 0 }], { duration: 1100, fill: 'forwards' });
      }
      lyrics.classList.toggle('red', c.light === 'red');
      if (c.light === 'green' && live) {
        const times = chantTimes(c.len, c.rush);
        times.forEach((ms, i) => later(c.t + ms - performance.now(), () => lyrics.querySelectorAll('span')[i]?.classList.add('on')));
      }
    };
    const now = performance.now();
    let current = null;
    g.cues.forEach((c, i) => {
      if (c.t <= now) {
        current = c;
        return;
      }
      later(c.t - now, () => setLight(c, true));
      // el sonido se programa un poco antes, en su hora exacta
      later(c.t - now - 300, () => {
        if (c.light === 'green') sound.sq('chant', { at: c.t, dur: c.len / 1000, rush: c.rush });
        else {
          // se gira (el sonido del giro) y, cuando acaba de girarse, escanea lo que queda de rojo
          const red = ((g.cues[i + 1]?.t ?? g.endsAt) - c.t) / 1000;
          const turned = sound.sq('headTurn', { at: c.t, dur: red })?.length ?? 0;
          if (red - turned > 0.6) sound.sq('scan', { at: c.t + turned * 1000, dur: red - turned });
        }
      });
    });
    if (current) setLight(current, false);
    else root.dataset.light = 'wait';

    return h(
      'div',
      { class: 'sq-scene sq-redlight' },
      h('div', { class: 'sq-yard' }, h('div', { class: 'sq-mural' }), tree(), dollEl, beam),
      field,
      lyrics,
      flash,
      h('div', { class: 'sq-hud' }, pill, clock(g.endsAt, g.endsAt - g.tOpen)),
      countdown(g.tOpen),
    );
  }

  // ------------------------------------------------------------------ 2. El panal
  // Una galleta por jugador: la forma se va tallando con lo que lleva; cada grieta se dibuja y cruje; rota = partida.

  function panal(v) {
    const g = v.g;
    const cards = new Map();
    const grid = h(
      'div',
      {
        class: 'sq-cookies',
        dataset: { n: String(g.players.length > 12 ? 'many' : g.players.length > 6 ? 'some' : 'few') },
        // tamaño según las filas que salen: que quepan siempre (con el pie de cada galleta debajo)
        style: (() => {
          const n = g.players.length;
          const cols = n <= 4 ? n : n <= 8 ? Math.ceil(n / 2) : n <= 15 ? Math.ceil(n / 3) : Math.ceil(n / 4);
          const rows = Math.ceil(n / Math.max(1, cols));
          return { '--size': `min(${Math.round(74 / rows - 9)}vh, ${Math.round(90 / Math.max(1, cols) - 3)}vw)` };
        })(),
      },
      g.players.map((p) => {
        const c = cookie(g.shapes[p.id] ?? 'circulo', hash(p.id));
        const halves = h('div', { class: 'sq-halves' }, h('div', { class: 'sq-half l' }, c), h('div', { class: 'sq-half r' }, c.cloneNode(true)));
        const pct = h('strong', { class: 'sq-pct' });
        const card = h('div', { class: 'sq-cookie', style: { '--pc': getColor(p.color).bg } }, halves, h('div', { class: 'sq-cookie-foot' }, badge(p), pct));
        cards.set(p.id, { card, pct, halves, p, state: undefined, cracks: 0 });
        return card;
      }),
    );
    const paint = (vv) => {
      const gg = vv.g;
      const fresh = [];
      const spared = [];
      for (const [id, c] of cards) {
        const st = gg.state[id] ?? '';
        const cracks = Math.min(3, gg.cracks[id] ?? 0);
        const prog = Math.round(gg.progress[id] ?? 0);
        c.halves.style.setProperty('--carved', String(st === 'done' ? 100 : prog));
        c.card.dataset.cracks = String(cracks);
        if (c.state !== undefined && cracks > c.cracks && st !== 'broken' && st !== 'spared') sound.sq('crack', { cookie: true });
        c.cracks = cracks;
        if (st !== c.state) {
          if (c.state !== undefined && st === 'broken') {
            fresh.push(c.p);
            sound.sq('shatter', { cookie: true });
          }
          if (c.state !== undefined && st === 'done') sound.sq('hold');
          if (c.state !== undefined && st === 'spared') {
            sound.sq('shatter', { cookie: true });
            spared.push(c.p);
          }
          c.state = st;
          c.card.dataset.state = st;
        }
        c.pct.textContent = st === 'done' ? '¡Entera!' : st === 'broken' ? 'Rota' : st === 'spared' ? 'Rota… ¡se salva!' : `${prog} %`;
      }
      if (fresh.length) announceOut(fresh);
      if (spared.length) announceSpared(spared);
      // cuántos siguen repasando; los últimos, con foco
      const left = [...cards.values()].filter((c) => !c.state);
      status.textContent = left.length ? (left.length === 1 ? `Solo queda ${left[0].p.name}…` : `Quedan ${left.length} repasando`) : '¡Todos han terminado!';
      for (const c of cards.values()) c.card.classList.toggle('spot', !c.state && left.length <= 2 && cards.size > 2);
    };
    const status = h('p', { class: 'sq-status-line' });
    paint(v);
    update = paint;
    return h('div', { class: 'sq-scene sq-panal' }, h('div', { class: 'sq-spot' }), h('div', { class: 'sq-hud' }, status, clock(g.endsAt, g.endsAt - g.tOpen)), grid, countdown(g.tOpen));
  }

  // ------------------------------------------------------------------ 3. El puente de cristal
  // En primera persona: se ve el puente desde los ojos de quien salta. Al elegir: agacharse y coger aire, salto,
  // golpe al caer, latidos que se aceleran con grietas bajo los pies… y a los 4,6 s, aguanta o se rompe y cae.

  function puente(v) {
    const g = v.g;
    const byId = new Map(g.players.map((p) => [p.id, p]));
    const known = new Map(); // tramo → {safe, broken}
    for (const m of g.moves) {
      const k = known.get(m.step) ?? {};
      if (m.ok || m.held) k.safe = m.side; // el que aguanta por los pelos también se pisa
      else {
        k.broken = m.side;
        k.safe ??= m.side === 'L' ? 'R' : 'L';
      }
      known.set(m.step, k);
    }
    const last = g.moves.at(-1);
    const now = performance.now();
    const jump = g.jumping && last ? last : null;
    const elapsed = jump ? now - jump.at : 0;
    // Dónde está la cámara antes del salto (o ahora): sobre el cristal bueno del tramo anterior, o en la plataforma
    const standStep = jump ? jump.step : g.pos; // tramos ya pisados
    const standAt = (step) => (step === 0 ? { x: 0, z: 70 } : { x: sideX(known.get(step - 1)?.safe ?? 'L'), z: -step * D });

    // El mundo: los cristales, las barandillas y las plataformas
    const world = h('div', { class: 'sq-world' });
    const panes = new Map();
    for (let step = 0; step < g.steps; step++) {
      for (const side of ['L', 'R']) {
        const k = known.get(step);
        // el que se está viendo saltar aún no se sabe: se pinta entero
        const hidden = jump && jump.step === step;
        const st = !k || hidden ? 'glass' : k.broken === side ? 'broken' : k.safe === side ? 'solid' : 'glass';
        const pane = h('div', { class: `sq-pane ${st}`, style: { transform: `translate3d(${sideX(side) - W / 2}px, 0, ${-(step + 1) * D - W / 2}px) rotateX(90deg)` } });
        world.append(pane);
        panes.set(`${step}${side}`, pane);
      }
    }
    // barandillas a los lados (de la plataforma de salida a la de llegada) y las dos plataformas
    const far = -g.steps * D - W / 2 - 560;
    for (const x of [-(W + GAP / 2 + 34), W + GAP / 2 + 14]) {
      world.append(h('div', { class: 'sq-rail', style: { transform: `translate3d(${x}px, 0, ${far}px) rotateX(90deg)`, height: `${-far + 400}px` } }));
    }
    world.append(h('div', { class: 'sq-deck', style: { transform: 'translate3d(-300px, 0, -150px) rotateX(90deg)', height: '550px' } }));
    world.append(h('div', { class: 'sq-deck end', style: { transform: `translate3d(-300px, 0, ${far}px) rotateX(90deg)`, height: '500px' } }));

    // Lo que hay encima: el cristal bajo los pies (para la tensión), el viñeteado que late, el resultado y el negro
    const floor = h('div', { class: 'sq-floorglass' }, svg('<svg viewBox="0 0 400 200" class="sq-floor-cracks" fill="none" stroke="#e8fbff" stroke-width="2.4" stroke-linecap="round"><path class="k1" pathLength="100" d="M200 120 L170 90 L150 95 L120 60 M200 120 L235 95 L260 100 L290 70"/><path class="k2" pathLength="100" d="M200 120 L195 160 L160 185 M200 120 L240 150 L250 190 M170 90 L175 50 M260 100 L300 120"/><path class="k3" pathLength="100" d="M120 60 L80 70 L40 50 M290 70 L330 60 L370 80 M160 185 L110 170 L60 190 M250 190 L300 175 L350 195 M175 50 L210 20"/></svg>'));
    const shards = h('div', { class: 'sq-shards' }, ...Array.from({ length: 12 }, (_, i) => h('i', { style: { '--i': String(i) } })));
    floor.append(shards);
    const vignette = h('div', { class: 'sq-vignette' });
    const stampEl = h('p', { class: 'sq-jump-stamp', hidden: true });
    const black = h('div', { class: 'sq-black', hidden: true });
    const cam = h('div', { class: 'sq-cam' }, world);

    // Encima del todo: quién salta y el reloj (o qué ha pasado)
    const cur = g.current ? byId.get(g.current) : null;
    const jumper = jump ? byId.get(jump.id) : null;
    const hudTop = h(
      'div',
      { class: 'sq-bridge-hud' },
      jump
        ? h('p', { class: 'sq-turn' }, badge(jumper), h('span', {}, jump.pushed ? '¡Se acabó el tiempo! Le empujan…' : `salta a la ${jump.side === 'L' ? 'izquierda' : 'derecha'}…`))
        : cur
          ? h('p', { class: 'sq-turn' }, badge(cur), h('span', {}, '¿Izquierda o derecha?'))
          : null,
      h('p', { class: 'sq-step-no' }, `Tramo ${Math.min((jump ? jump.step : g.pos) + 1, g.steps)} de ${g.steps}`),
      !jump && g.turnEndsAt ? clock(g.turnEndsAt, v.seconds * 1000, 'small') : null,
    );
    // Lo que apuestan los que esperan (quien salta lo ve en su móvil); en el salto, lo que decían
    const crowd = h('p', { class: 'sq-crowd', hidden: true });
    const paintCrowd = (vv) => {
      const t = (jump ? jump.tally : vv.g.tally) ?? { L: 0, R: 0 };
      crowd.hidden = !(jump || cur) || !(t.L + t.R);
      crowd.textContent = `${jump ? 'El público decía' : 'El público dice'}: ◀ ${t.L} · ${t.R} ▶`;
    };
    paintCrowd(v);
    hudTop.append(crowd);
    update = paintCrowd;
    const queue = h(
      'div',
      { class: 'sq-queue' },
      g.queue.map((id) => {
        const p = byId.get(id);
        const fellSeen = g.moves.some((m) => m.id === id && !m.ok && !m.held && !(jump && m === jump));
        return badge({ ...p, out: fellSeen }, null, id === (jump?.id ?? g.current) ? 'now' : '');
      }),
    );

    // La cámara: posición y mirada en cada instante
    let camState = null;
    const setCam = ({ x, y, z, pitch = -16, roll = 0, yaw = 0 }) => {
      world.style.transform = `translateZ(800px) rotateX(${pitch}deg) rotateZ(${roll}deg) rotateY(${yaw}deg) translate3d(${-x}px, ${-y}px, ${-z}px)`;
      // los cristales lejanos se pierden en la niebla
      for (const [k2, pane] of panes) {
        const step = Number(k2.slice(0, -1));
        const dist = -(step + 1) * D - z;
        pane.style.opacity = String(Math.max(0, Math.min(1, 1 - (-dist - 400) / 1500)));
      }
    };
    const start = standAt(standStep);
    camState = { x: start.x, y: -EYE, z: start.z };

    if (!jump) {
      // Esperando a que elija: respira, y la cámara se mece un poco
      setCam(camState);
      if (cur) loops.push(sound.sq('breathLoop'));
      const t0 = performance.now();
      const bob = (t) => {
        const s = (t - t0) / 1000;
        setCam({ ...camState, y: -EYE + Math.sin(s * 1.7) * 5, pitch: -16 + Math.sin(s * 0.8) * 1.5, roll: Math.sin(s * 0.6) * 0.6 });
        raf = requestAnimationFrame(bob);
      };
      raf = requestAnimationFrame(bob);
    } else {
      const target = { x: sideX(jump.side), z: -(jump.step + 1) * D };
      const revealAt = jump.reveal ?? 4600; // cada salto, su suspense
      // Grietas de este salto: de 1 a 4, a su aire (si no, a la tercera vez el público se las sabe). Al azar, pero las
      // mismas si la escena se vuelve a montar (salen de la hora del salto).
      let seed = Math.floor(jump.at) % 2147483646 || 1;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      const crackCount = jump.held ? 4 : 1 + Math.floor(rnd() * 4); // el cristal malo que aguanta: cruje entero
      const bpmFrom = 70 + Math.round(rnd() * 25); // el corazón, también distinto cada vez
      const bpmTo = 140 + Math.round(rnd() * 45);
      const cracks = Array.from({ length: crackCount }, () => Math.round(1800 + rnd() * (revealAt - 2300)))
        .sort((a, b) => a - b)
        .map((ms, i) => [ms, ['k1', 'k2', 'k3', 'k3'][i], 0.45 + (0.55 * (i + 1)) / crackCount]);
      // Sonidos (solo la primera vez que se monta este salto; si la tele se recarga a mitad, los que falten)
      once(`jump|${g.roundId}|${jump.step}|${jump.id}`, () => {
        const at = jump.at;
        if (elapsed < 300) sound.sq('inhale', { at });
        if (elapsed < 700) sound.sq('jump', { at: at + 600 });
        if (elapsed < 1400) sound.sq('land', { at: at + 1300 });
        if (elapsed < 1500) loops.push(sound.sq('heartbeats', { at: at + 1450, dur: (revealAt - 1450) / 1000, from: bpmFrom, to: bpmTo }));
        for (const [ms, , gain] of cracks) if (elapsed < ms) sound.sq('crack', { at: at + ms, gain });
        if (elapsed < revealAt + 100) {
          if (jump.ok || jump.held) {
            sound.sq('exhale', { at: at + revealAt + 150 });
            sound.sq('hold', { at: at + revealAt });
            if (jump.held) later(revealAt + 900 - elapsed, () => announceSpared([jumper]));
          } else {
            sound.sq('shatter', { at: at + revealAt });
            sound.sq('fall', { at: at + revealAt + 200 });
            later(revealAt + 1250 - elapsed, () => {
              sound.sq('eliminated');
              announceOut([jumper]);
            });
          }
        }
      });
      // Viñeta que late con el corazón (los mismos latidos que suenan)
      let beat = 0;
      while (beat < revealAt - 1450) {
        const k = beat / (revealAt - 1450);
        const at = 1450 + beat;
        if (at > elapsed) later(at - elapsed, () => vignette.animate([{ opacity: 0.85 }, { opacity: 0.35 }], { duration: 380, easing: 'ease-out' }));
        beat += 60000 / (bpmFrom + (bpmTo - bpmFrom) * k * k);
      }
      // Grietas bajo los pies
      for (const [ms, cls] of cracks) {
        if (elapsed > ms) floor.classList.add(cls);
        else
          later(ms - elapsed, () => {
            floor.classList.add(cls);
            floor.animate([{ transform: 'translateY(4px)' }, { transform: 'none' }], { duration: 160 });
          });
      }
      // El resultado
      const reveal = () => {
        stampEl.hidden = false;
        if (jump.ok || jump.held) {
          stampEl.textContent = jump.held ? '¡CRUJE… PERO AGUANTA!' : '¡AGUANTA!';
          stampEl.className = 'sq-jump-stamp ok';
          floor.classList.add('held');
          panes.get(`${jump.step}${jump.side}`)?.classList.add('solid');
        } else {
          stampEl.textContent = '¡CRAC!';
          stampEl.className = 'sq-jump-stamp ko';
          floor.classList.add('shattered');
          panes.get(`${jump.step}${jump.side}`)?.classList.add('broken');
        }
      };
      later(revealAt - elapsed, reveal);
      if (!jump.ok && !jump.held) {
        later(revealAt + 1150 - elapsed, () => {
          black.hidden = false;
          fill(black, h('p', { class: 'sq-black-num' }, numText(jumper?.number)), h('p', { class: 'sq-black-name' }, jumper?.name ?? ''), h('p', { class: 'sq-black-out' }, 'Eliminado'));
        });
      }
      const frame = (t) => {
        const e = t - jump.at;
        const shake = (amp) => (Math.random() - 0.5) * amp;
        let s = { ...camState };
        if (e < 600) {
          // agacharse y mirar el cristal elegido
          const u = ease(clamp01(e / 600));
          s = { x: lerp(start.x, start.x + (target.x - start.x) * 0.15, u), y: -EYE + 45 * u, z: start.z, pitch: lerp(-16, -26, u), yaw: (jump.side === 'L' ? 6 : -6) * u };
        } else if (e < 1300) {
          // el salto
          const u = clamp01((e - 600) / 700);
          const uu = ease(u);
          s = { x: lerp(start.x, target.x, uu), y: -EYE + 45 * (1 - u) - Math.sin(Math.PI * u) * 130, z: lerp(start.z, target.z, uu), pitch: lerp(-26, -12, u), yaw: (jump.side === 'L' ? 6 : -6) * (1 - u) };
        } else if (e < revealAt || jump.ok || jump.held) {
          // ha caído: golpe, y luego mirar abajo, temblando cada vez más
          const land = Math.max(0, 1 - (e - 1300) / 350);
          const k = clamp01((e - 1300) / (revealAt - 1300));
          const after = jump.ok || jump.held ? clamp01((e - revealAt) / 700) : 0;
          const look = lerp(-14, -48, ease(Math.min(1, k * 1.4)));
          s = {
            x: target.x + shake(k * 3 * (1 - after)),
            y: -EYE + 26 * land + shake(k * 4 * (1 - after)) + 18 * k * (1 - after),
            z: target.z,
            pitch: lerp(look, -16, ease(after)),
            roll: shake(1.2 * land) + Math.sin(e / 160) * 0.5 * k * (1 - after),
          };
          floor.style.setProperty('--look', String(Math.min(1, k * 1.6) * (1 - after)));
        } else {
          // se rompe: caer mirando arriba
          const u = clamp01((e - revealAt) / 1400);
          s = { x: target.x, y: -EYE + 1600 * u * u, z: target.z + 40 * u, pitch: lerp(-48, 38, ease(clamp01(u * 1.3))), roll: 14 * u };
          floor.style.setProperty('--look', String(Math.max(0, 1 - u * 3)));
        }
        setCam(s);
        if (e < (jump.ends ?? jump.at + 6800) - jump.at + 200) raf = requestAnimationFrame(frame);
      };
      setCam(camState);
      raf = requestAnimationFrame(frame);
    }
    loops.push(sound.sq('wind'));
    return h('div', { class: `sq-scene sq-bridge ${jump ? 'jumping' : ''}` }, h('div', { class: 'sq-abyss' }), cam, floor, vignette, hudTop, stampEl, queue, black, countdown(g.tOpen));
  }

  // ------------------------------------------------------------------ 4. Tira y afloja
  // Dos torres y un foso en medio; la cuerda (y los dos bandos) se mueven hacia quien gana. Tambores que aceleran
  // con la ventaja. Al acabar (finale): chasquido de la cuerda y el bando que pierde cae al foso.

  function tugScene(v, { final = false } = {}) {
    const g = v.g;
    const byId = new Map(g.players.map((p) => [p.id, p]));
    const rig = h('div', { class: 'sq-rig' });
    const totals = { A: h('strong'), B: h('strong') };
    // Cada jugador, una figura con su chándal y su número, tirando (se inclina hacia atrás con la cuerda)
    const puller = (p) =>
      h(
        'span',
        { class: 'sq-puller', style: { '--pc': getColor(p.color).bg } },
        h('span', { class: 'sq-ava emoji' }, avatarOf(p)),
        h('span', { class: 'sq-suit' }, h('b', {}, numText(p.number))),
        h('span', { class: 'sq-legs' }),
        h('small', {}, p.name),
      );
    const team = (s) =>
      h(
        'div',
        { class: `sq-team ${s}` },
        h('p', { class: 'sq-team-name' }, s === 'A' ? 'Bando ○' : 'Bando △', h('span', {}, ' · fuerza '), totals[s]),
        h('div', { class: 'sq-pullers' }, g.sides[s].map((id) => puller(byId.get(id)))),
      );
    rig.append(team('A'), h('div', { class: 'sq-rope' }, h('span', { class: 'sq-knot' })), team('B'));
    const scene = h('div', { class: 'sq-scene sq-tug' }, h('div', { class: 'sq-towers' }, h('div', { class: 'sq-tower l' }), h('div', { class: 'sq-pit' }, h('span', { class: 'sq-mid' })), h('div', { class: 'sq-tower r' })), rig);
    let rope = g.rope;
    const paint = (vv) => {
      rope = vv.g.rope;
      rig.style.setProperty('--rope', (Math.sign(rope) * Math.sqrt(Math.abs(rope))).toFixed(3)); // exagerado: se nota quién va ganando
      // cuenta la media por cabeza (si no, un bando con más gente parecería ganar aunque pierda)
      const avg = vv.g.averages ?? vv.g.totals;
      totals.A.textContent = String(avg.A);
      totals.B.textContent = String(avg.B);
      rig.dataset.lead = avg.A > avg.B ? 'A' : avg.B > avg.A ? 'B' : '';
    };
    paint(v);
    if (final) {
      const loser = g.winner === 'A' ? 'B' : 'A';
      rig.style.setProperty('--rope', String(g.winner === 'A' ? -1 : 1));
      sound.sq('ropeSnap');
      later(290, () => {
        scene.classList.add('snapped', `lose-${loser}`);
        sound.sq('fall');
        backdropFlash();
      });
      const gone = g.players.filter((p) => p.out);
      const kept = g.players.filter((p) => (g.spared ?? []).includes(p.id));
      later(1400, () => {
        if (gone.length) announceOut(gone);
        announceSpared(kept);
      });
      // quién ha ganado, en grande
      later(700, () => scene.append(h('p', { class: 'sq-jump-stamp ok sq-tug-win' }, `¡Gana el bando ${g.winner === 'A' ? '○' : '△'}!`)));
      return scene;
    }
    update = paint;
    // Tambores: más rápidos con la ventaja y según se acaba el tiempo
    const drum = () => {
      const k = Math.max(Math.abs(rope), clamp01((performance.now() - g.tOpen) / (g.endsAt - g.tOpen)));
      if (performance.now() >= g.tOpen) sound.sq('drum', { gain: 0.35 + 0.35 * k });
      later(620 - 330 * k, drum);
    };
    later(g.tOpen - performance.now(), () => {
      sound.play('go');
      drum();
    });
    scene.append(h('div', { class: 'sq-hud sq-tug-hud' }, clock(g.endsAt, g.endsAt - g.tOpen)), h('p', { class: 'sq-tug-call' }, '¡Tocad el móvil lo más rápido que podáis! Arrastrad al otro bando hasta la línea'), countdown(g.tOpen));
    return scene;
  }

  function cuerda(v) {
    return tugScene(v);
  }

  function backdropFlash() {
    root.animate([{ filter: 'brightness(2.2)' }, { filter: 'brightness(1)' }], { duration: 380, easing: 'ease-out' });
  }

  // ------------------------------------------------------------------ 5. Canicas
  // Un duelo por tarjeta. Cada apuesta se resuelve con el puño que se abre y las canicas que pasan de mano.

  function canicas(v) {
    const g = v.g;
    const byId = new Map(g.players.map((p) => [p.id, p]));
    const cards = new Map();
    const marbleRow = (n) => h('span', { class: 'sq-marble-row' }, ...Array.from({ length: Math.min(n, 20) }, (_, i) => h('i', { style: { '--h': `${(i * 47) % 360}deg` } })), h('b', {}, String(n)));
    const grid = h(
      'div',
      { class: 'sq-duels', dataset: { n: String(g.duels.length) } },
      g.duels.map((d, i) => {
        const sideA = h('div', { class: 'sq-duelist' });
        const sideB = h('div', { class: 'sq-duelist' });
        const hand = h('div', { class: 'sq-hand' });
        const line = h('p', { class: 'sq-duel-line' });
        const timer = h('span', { class: 'sq-duel-timer' });
        const card = h('div', { class: 'sq-duel' }, sideA, hand, sideB, line, timer);
        cards.set(i, { card, sideA, sideB, hand, line, timer, lastKey: undefined, loser: undefined });
        return card;
      }),
    );
    const REVEAL_MS = 1800; // redoble y el puño que se abre: hasta entonces no se ve quién gana (igual que en los móviles)
    let lastView = v;
    const subText = g.bye ? `${byId.get(g.bye)?.name} no tiene pareja: se salva sin jugar` : 'Pares o nones: quien se queda sin canicas, fuera';
    const sub = h('p', { class: 'sq-sub' }, subText);
    const paint = (vv) => {
      lastView = vv;
      const fresh = [];
      const spared = [];
      const now = performance.now();
      vv.g.duels.forEach((d, i) => {
        const c = cards.get(i);
        if (!c) return;
        const l = d.last;
        const lastKey = l ? `${l.hider}|${l.hidden}|${l.amount}|${d.marbles[d.a]}` : null;
        if (lastKey !== c.lastKey) {
          if (c.lastKey !== undefined && l) {
            // revelado: redoble, el puño tiembla… y se abre
            c.revealUntil = now + REVEAL_MS;
            c.hand.classList.remove('open');
            void c.hand.offsetWidth;
            fill(c.hand, h('span', { class: 'sq-fist emoji' }, '✊'), h('span', { class: 'sq-palm' }, marbleRow(l.hidden)));
            c.hand.classList.add('reveal');
            c.line.textContent = `${byId.get(l.hider)?.name} escondió · ${byId.get(l.guesser)?.name} dice ${l.parity ? 'NONES' : 'PARES'} y apuesta ${l.allIn ? `¡TODO! (${l.bet})` : l.bet}…`;
            sound.play('roll');
            later(REVEAL_MS - 300, () => {
              c.hand.classList.add('open');
              sound.sq('marbles', { n: Math.min(6, l.hidden) });
              sound.play(l.right ? 'correct' : 'out');
            });
            later(REVEAL_MS, () => paint(lastView));
            later(REVEAL_MS + 2600, () => {
              c.hand.classList.remove('reveal', 'open');
              paint(lastView);
            });
          }
          c.lastKey = lastKey;
        }
        if (now < (c.revealUntil ?? 0)) return; // aún no se sabe: ni canicas ni quién cae
        const [a, b] = [byId.get(d.a), byId.get(d.b)];
        fill(c.sideA, badge({ ...a, out: d.loser === d.a && !d.spared }), marbleRow(d.marbles[d.a]));
        fill(c.sideB, badge({ ...b, out: d.loser === d.b && !d.spared }), marbleRow(d.marbles[d.b]));
        if (!c.hand.classList.contains('reveal')) fill(c.hand, h('span', { class: 'sq-fist emoji' }, d.hasHidden ? '✊' : '🤲'));
        c.line.textContent = d.loser
          ? `${byId.get(d.loser)?.name} ${d.timeUp ? (d.coin ? 'pierde: empate al acabar el tiempo, lo ha decidido la suerte' : 'pierde: se acabó el tiempo y tenía menos canicas') : 'se queda sin canicas'}${d.spared ? '… ¡pero se salva por los pelos!' : ''}`
          : l
            ? `${byId.get(l.guesser)?.name} dijo ${l.parity ? 'nones' : 'pares'} y apostó ${l.bet} · eran ${l.hidden}: ${l.right ? `¡acierta! Gana ${l.amount}` : `falla. Pierde ${l.amount}`}`
            : `Esconde ${byId.get(d.hider)?.name} · adivina ${byId.get(d.hider === d.a ? d.b : d.a)?.name}${d.hasHidden ? ': ¿pares o nones?' : '…'}`;
        if (d.loser !== c.loser) {
          if (c.loser !== undefined && d.loser) {
            if (d.spared) spared.push(byId.get(d.loser));
            else {
              fresh.push(byId.get(d.loser));
              sound.sq('eliminated');
            }
          }
          c.loser = d.loser;
          c.card.classList.toggle('over', !!d.loser);
          // el que cae, sellado en grande sobre su lado del duelo (o «se salva», pasado el tope)
          if (d.loser) c.card.append(h('p', { class: `sq-duel-out ${d.loser === d.a ? 'a' : 'b'} ${d.spared ? 'spared' : ''}` }, h('b', {}, numText(byId.get(d.loser)?.number)), h('span', {}, d.spared ? '¡Se salva!' : 'Eliminado')));
        }
      });
      if (fresh.length) announceOut(fresh);
      if (spared.length) announceSpared(spared);
    };
    paint(v);
    update = paint;
    // el reloj de cada jugada (si no decide a tiempo, juega la suerte por él)
    ticks.push(
      setInterval(() => {
        // los últimos 10 s: todo o nada
        const allIn = g.allInAt != null && performance.now() >= g.allInAt && performance.now() < g.endsAt;
        if (allIn !== sub.classList.contains('allin')) {
          sub.classList.toggle('allin', allIn);
          sub.textContent = allIn ? '¡Últimos 10 s: todo o nada!' : subText;
          if (allIn) sound.sq('pa');
        }
        lastView.g.duels.forEach((d, i) => {
          const c = cards.get(i);
          if (!c) return;
          const left = d.loser || d.since == null ? null : Math.ceil((d.since + MARBLE_MOVE_MS - performance.now()) / 1000);
          c.timer.textContent = left == null || left > 10 || left < 0 ? '' : `⏱ ${left}`;
        });
      }, 400),
    );
    return h(
      'div',
      { class: 'sq-scene sq-marbles' },
      h('div', { class: 'sq-lanterns' }),
      h('div', { class: 'sq-hud' }, sub, clock(g.endsAt, g.endsAt - g.tOpen)),
      grid,
      countdown(g.tOpen),
    );
  }

  return {
    root,
    render,
    stop() {
      stop();
      delete root.dataset.light;
    },
  };
}

