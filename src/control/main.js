// Mando del presentador (en su móvil): ve preguntas y respuestas en privado y controla el concurso.
// Se conecta como un móvil más, con rol "control" y la clave secreta que enseña el QR de mando de la tele.
import '@fontsource-variable/outfit';
import '@fontsource/creepster/latin.css';
import './control.css';
import '../shared/phone.css';
import { $, fill, h } from '../shared/dom.js';
import { avatarOf, getColor } from '../shared/appearance.js';
import { formatDeltaMs, formatSeconds } from '../shared/format.js';
import { optionStyle } from '../shared/options.js';
import { isValidRoomCode, normalizeRoomCode } from '../shared/roomCode.js';
import { loadJSON, newId, saveJSON } from '../shared/storage.js';
import { ERROR_CODE, MSG, PROTOCOL_VERSION, ROLE } from '../shared/protocol.js';
import { envGradient, HOME_ENV } from '../shared/environments.js';
import { keepScreenAwake } from '../shared/wakeLock.js';
import { PlayerConnection as Connection, connectionHelp } from '../player/network.js'; // la conexión con reconexión sirve igual

const STORE_KEY = 'concurso.control.v1';
const SCREEN_LABEL = { setup: 'Preparación', cover: 'Portada', intro: 'Presentación', play: 'Jugando', scoreboard: 'Marcador', final: 'Final' };

const app = $('#app');
const store = loadJSON(STORE_KEY, {}) ?? {};
store.controlId ??= newId();
store.keys ??= {}; // código de sala → clave
saveJSON(STORE_KEY, store);

let connection = null;
let view = null;
let tab = 'game';
let playFrame = null;
let lastAwayId = null; // último aviso de «ha salido de la app» ya enseñado (al conectar, los viejos no se avisan) // la página de jugador dentro del mando (pestaña «Jugar»): se crea la primera vez y no se quita
let cmdSeq = 0;
let lastSignature = null;
let status = 'connecting'; // connecting | pending | ready | reconnecting

// ------------------------------------------------------------------ Arranque

function init() {
  const params = new URLSearchParams(location.search);
  const code = normalizeRoomCode(params.get('sala'));
  const key = new URLSearchParams(location.hash.slice(1)).get('k');
  if (isValidRoomCode(code) && key) {
    store.keys[code] = key;
    saveJSON(STORE_KEY, store);
    history.replaceState(null, '', `?sala=${code}`); // que la clave no se quede a la vista en la barra
  }
  if (!isValidRoomCode(code) || !store.keys[code]) {
    return message('Escanea el QR de mando', 'Abre esta página escaneando el QR «Mando del presentador» que aparece en la tele, en la pantalla de preparación.');
  }
  connect(code, store.keys[code]);
}

function connect(code, key) {
  status = 'connecting';
  message('Conectando…', `Buscando la sala ${code}.`);
  connection = new Connection({
    roomCode: code,
    onOpen: () =>
      connection.send({ t: MSG.HELLO, v: PROTOCOL_VERSION, role: ROLE.CONTROL, controlId: store.controlId, token: key, deviceName: deviceName() }),
    onMessage: handleMessage,
    onStatus: ({ state, message: text, detail }) => {
      if (state === 'connected') return;
      if (state === 'connecting' && detail?.attempts >= 2 && !view) return message('Conectando…', connectionHelp(detail) ?? `Buscando la sala ${code}.`);
      if (state === 'not-found') {
        message('Esperando a la tele…', `No encuentro la sala ${code}: ¿está abierta en el portátil? Sigo intentándolo.`, 'Reintentar ya', () => location.reload());
        setTimeout(() => connection?.state === 'not-found' && connect(code, key), 4000);
        return;
      }
      if (state === 'fatal') return message('No se puede usar este navegador', text);
      if (state === 'reconnecting' || state === 'server-down') {
        status = 'reconnecting';
        document.body.classList.add('offline');
        renderBanner(detail?.attempts >= 2 ? connectionHelp(detail) : text || 'Reconectando…');
      }
    },
  });
  connection.start();
}

function handleMessage(msg) {
  switch (msg.t) {
    case MSG.CONTROL_STATUS:
      status = msg.status === 'approved' ? 'ready' : 'pending';
      if (status === 'pending') message('Confirma en el portátil', 'En la tele aparece «¿Permitir este mando?». Pulsa Enter en el portátil (o «Permitir»).');
      break;
    case MSG.CONTROL_STATE:
      status = 'ready';
      document.body.classList.remove('offline');
      // alguien ha pulsado: el mando vibra (así el presentador puede mirar a la gente y no al móvil)
      if (msg.view.game?.phase === 'result' && view?.game?.phase !== 'result') navigator.vibrate?.(80);
      view = msg.view;
      notifyAway(view.awayFeed ?? []);
      document.body.style.setProperty('--env-bg', envGradient(view.section?.env ?? HOME_ENV));
      render();
      break;
    case MSG.CMD_RESULT:
      if (!msg.ok && msg.error) toast(msg.error);
      break;
    case MSG.ERROR:
      connection?.stop();
      if (msg.code === ERROR_CODE.REPLACED) message('Mando abierto en otro sitio', msg.message, 'Usar aquí', () => location.reload());
      else if (msg.code === ERROR_CODE.VERSION) message('Versión distinta', msg.message, 'Recargar', () => location.reload());
      else message('Mando no permitido', msg.message);
      break;
  }
}

/**
 * Avisa en el mando de quién sale de la app (y de quién vuelve): un aviso arriba y una vibración, más fuerte si tenía
 * una pregunta en juego. Solo los nuevos: al conectar el mando, lo de antes no se avisa (está en Jugadores).
 */
function notifyAway(feed) {
  const newest = feed.at(-1)?.id ?? 0;
  if (lastAwayId == null) {
    lastAwayId = newest;
    return;
  }
  const fresh = feed.filter((e) => e.id > lastAwayId);
  lastAwayId = Math.max(lastAwayId, newest);
  if (!fresh.length) return;
  const serious = fresh.some((e) => e.inQuestion);
  const text = fresh
    .map((e) =>
      e.kind === 'out'
        ? `👀 ${e.name} ha salido de la app${e.inQuestion ? ' ¡con la pregunta en juego!' : ` (${e.where})`}`
        : `↩️ ${e.name} ha vuelto · ${formatAway(e.ms)} fuera${e.voided ? ' · respuesta anulada' : ''}`,
    )
    .join('\n');
  awayAlert(text, serious);
  navigator.vibrate?.(serious ? [220, 120, 220] : 90);
}

const formatAway = (ms) => (ms >= 60_000 ? `${Math.floor(ms / 60_000)} min ${Math.round((ms % 60_000) / 1000)} s` : `${Math.max(1, Math.round(ms / 1000))} s`);

/** Aviso de salidas: arriba, fuera del repintado (dura unos segundos; tocándolo se cierra). */
let awayTimer = 0;
function awayAlert(text, serious) {
  let el = document.getElementById('c-away');
  if (!el) {
    el = h('div', { id: 'c-away', class: 'c-away', role: 'alert', onclick: () => (el.hidden = true) });
    document.body.append(el);
  }
  el.textContent = text;
  el.classList.toggle('serious', serious);
  el.hidden = false;
  clearTimeout(awayTimer);
  awayTimer = setTimeout(() => (el.hidden = true), serious ? 9000 : 5000);
}

/**
 * Órdenes que hacen avanzar el concurso: tras una, las demás esperan un momento. El botón siguiente sale en el mismo
 * sitio y un doble toque se saltaba un paso (cerrar apuestas → revelar sin respuestas, marcar → enseñar la buena…).
 * Las de contar (+1, notas…) no esperan.
 */
const STEP_ACTIONS = new Set([
  'next', 'prev', 'nextItem', 'endSection', 'scoreboard', 'open', 'correct', 'wrong', 'openAnswers', 'closeAnswers', 'reveal',
  'mShow', 'mMark', 'mReveal', 'freeStart', 'freeStop', 'freeAward', 'freeDone', 'freeNext', 'wordsStart', 'wordsStop',
  'shakeStart', 'shakeStop', 'betClose', 'betReveal', 'squidStart', 'squidStop', 'hankyDraw', 'hankyChoose', 'hankyGo', 'hankyWin',
  'punishClose', 'punishSpin',
]);
const STEP_GAP_MS = 800;
let lastStepAt = 0;

/** Manda una orden al portátil. */
function cmd(action, args = {}) {
  if (STEP_ACTIONS.has(action)) {
    if (performance.now() - lastStepAt < STEP_GAP_MS) return;
    lastStepAt = performance.now();
  }
  if (!connection?.send({ t: MSG.CMD, id: ++cmdSeq, action, args })) toast('Sin conexión con el portátil.');
}

// ------------------------------------------------------------------ Pintado

function message(title, text, actionLabel, action) {
  lastSignature = null;
  fill(
    app,
    h(
      'main',
      { class: 'c-message' },
      h('div', { class: 'spinner', hidden: !!actionLabel || title.startsWith('Escanea') || title.startsWith('Mando') }),
      h('h1', {}, title),
      h('p', {}, text),
      actionLabel ? h('button', { class: 'btn primary big', onclick: action }, actionLabel) : null,
    ),
  );
}

function render() {
  if (!view) return;
  // Repintar solo si cambió algo visible (no con cada latencia), para no "robar" toques a medio pulsar.
  // (sin lo que cambia con el reloj —lo que falta, lo que lleva—: si no, el mando se redibujaba varias veces por
  // segundo en los juegos con reloj y se perdían toques; los relojes de la pantalla ya cuentan solos)
  const v = view;
  const signature = JSON.stringify([
    tab,
    {
      ...v,
      players: v.players.map(({ rtt, ...p }) => p),
      network: null,
      squid: v.squid && { ...v.squid, now: null, g: v.squid.g && { ...v.squid.g, turnEndsInMs: null } },
      shake: v.shake && { ...v.shake, opensInMs: null, endsInMs: null },
      words: v.words && { ...v.words, endsInMs: null },
      free: v.free && { ...v.free, trialElapsed: null, ranking: v.free.phase === 'running' ? null : v.free.ranking },
      millionaire: v.millionaire && { ...v.millionaire, audience: v.millionaire.audience && { ...v.millionaire.audience, inMs: null }, call: v.millionaire.call && { ...v.millionaire.call, inMs: null } },
    },
  ]);
  if (signature === lastSignature) return;
  lastSignature = signature;
  // los relojes de la pantalla anterior (los vuelve a poner el panel que los use)
  clearInterval(liveClockTimer);
  clearInterval(trialClockTimer);

  fill(
    app,
    h(
      'header',
      { class: 'c-top' },
      h('div', {}, h('strong', {}, view.title), h('span', {}, `Sala ${view.code} · ${view.peekScoreboard ? 'Marcador' : SCREEN_LABEL[view.screen]}`)),
      h('span', { class: 'c-net', title: 'Conexión' }),
    ),
    h('div', { id: 'c-banner', class: 'c-banner', hidden: true }),
    h('main', { class: 'c-main' }, tab === 'game' ? gameTab() : tab === 'players' ? playersTab() : tab === 'sections' ? sectionsTab() : null),
    h(
      'nav',
      { class: 'c-tabs' },
      [
        ['game', 'Juego'],
        ['players', 'Jugadores'],
        ['sections', 'Secciones'],
        ['play', '🎮 Jugar'],
      ].map(([id, label]) =>
        h(
          'button',
          {
            class: tab === id ? 'active' : '',
            onclick: () => {
              tab = id;
              render();
            },
          },
          label,
        ),
      ),
    ),
  );
  showPlayFrame(tab === 'play');
}

/**
 * Jugar desde el mando: la página de jugador va dentro del mando (un iframe que no se quita al cambiar de pestaña).
 * Así el móvil mantiene las dos conexiones vivas: con dos pestañas del navegador, la que no se ve se congela y se
 * desconecta. Usa la identidad de jugador de este móvil (si ya jugaste con él, eres el mismo) y avisa a la tele de que
 * eres el presentador: en las secciones donde no juegas (las que ves con respuestas), la tele te deja fuera.
 */
function showPlayFrame(visible) {
  document.body.classList.toggle('c-playing', visible);
  if (!visible) {
    if (playFrame) playFrame.hidden = true;
    return;
  }
  if (!playFrame) {
    playFrame = h('iframe', {
      class: 'c-play-frame',
      title: 'Jugar',
      src: `./?sala=${view.code}&mando=1`,
      allow: 'screen-wake-lock; vibrate',
    });
    document.body.append(playFrame);
  }
  playFrame.hidden = false;
  // entre la cabecera del mando y las pestañas
  const top = app.querySelector('.c-top')?.getBoundingClientRect().bottom ?? 0;
  playFrame.style.top = `${Math.round(top)}px`;
  playFrame.style.height = `calc(100dvh - ${Math.round(top)}px - 3.4rem - env(safe-area-inset-bottom))`; // un iframe no se estira con top y bottom
}

function renderBanner(text) {
  const el = document.getElementById('c-banner');
  if (!el) return;
  el.hidden = !text;
  el.textContent = text ?? '';
}

const btn = (label, onclick, cls = '') => h('button', { class: `btn ${cls}`, onclick }, label);
const avatar = (p) =>
  h('span', { class: 'c-avatar emoji', style: { background: getColor(p.color).bg, color: getColor(p.color).fg } }, avatarOf(p));
const teamOf = (id) => view.teams.find((t) => t.id === id);

function navRow() {
  return h(
    'div',
    { class: 'c-nav' },
    btn('← Atrás', () => cmd('prev')),
    view.screen !== 'setup' ? btn(view.peekScoreboard ? 'Quitar marcador' : 'Marcador', () => cmd('scoreboard')) : null,
    view.screen !== 'final' ? btn('Siguiente →', () => cmd('next')) : null,
  );
}

// ---------- Pestaña Juego

/** Antitrampas: quién ha salido de la app con una pregunta abierta (últimos 10 min), con «Perdonar». */
function cheatCard() {
  const recent = (view.cheatAlerts ?? []).filter((a) => Date.now() - a.at < 600_000).reverse();
  if (!recent.length) return null;
  return h(
    'section',
    { class: 'c-card c-cheats' },
    h('p', { class: 'c-kicker' }, '🚨 Han salido de la app'),
    recent.map((a) =>
      h(
        'div',
        { class: 'c-row c-cheat' },
        h('span', {}, h('strong', {}, a.name), ` · ${Math.round(a.ms / 1000)} s fuera${a.forgiven ? ' · perdonado' : a.voided ? ' · anulado' : ''}`),
        a.voided && !a.forgiven ? btn('Perdonar', () => cmd('forgive', { playerId: a.playerId })) : null,
      ),
    ),
  );
}

/** Quién está fuera de la app en este momento. */
function awayNowCard() {
  const out = view.players.filter((p) => p.away);
  if (!out.length) return null;
  return h('section', { class: 'c-card c-away-now' }, h('p', { class: 'c-kicker' }, '👀 Fuera de la app ahora'), h('p', {}, out.map((p) => p.name).join(', ')));
}

function gameTab() {
  return [cheatCard(), awayNowCard(), gameTabBody()];
}

function gameTabBody() {
  if (view.paused) return pausedPanel();
  switch (view.screen) {
    case 'setup':
      return setupPanel();
    case 'cover':
      if (view.punish?.step === 'vote') return punishVotePanel();
      if (view.versus) return [h('section', { class: 'c-card center' }, h('p', { class: 'c-kicker' }, 'En la tele: los equipos'), h('h2', {}, view.teams.map((t) => t.name).join(' vs '))), bigNext('Portada →'), navRow()];
      return [h('section', { class: 'c-card center' }, h('p', { class: 'c-kicker' }, 'En la tele: portada'), h('h2', {}, view.title)), bigNext(`Presentar «${view.sections.find((s) => s.on)?.name ?? 'la primera sección'}» →`), navRow()];
    case 'intro':
      if (view.section?.type === 'test' && view.playable && !view.introRules) return [sectionCard(), bigNext('Explicar cómo se juega →'), navRow()];
      return [sectionCard(), bigNext(view.playable ? 'Empezar sección →' : 'Saltar esta sección →'), navRow()];
    case 'play':
      if (view.squid) return squidPanel();
      if (view.hanky) return hankyPanel();
      if (view.words) return wordsPanel();
      if (view.shake) return shakePanel();
      if (view.bet) return betPanel();
      if (view.millionaire) return millionairePanel();
      if (view.free) return freePanel();
      if (view.answer) return answerPanel();
      return view.section?.type === 'pulsador' ? buzzerPanel() : [sectionCard(), bigNext('Siguiente →'), navRow()];
    case 'scoreboard':
      // (con el nombre de lo que viene: así se sabe qué preparar antes de pulsar)
      return [standingsCard('Marcador'), bigNext(nextSectionName() ? `Siguiente: «${nextSectionName()}» →` : 'Al final →'), navRow()];
    case 'final':
      if (view.punish?.step === 'roulette') return roulettePanel();
      return [standingsCard('Clasificación final'), view.hasPunish ? bigNext('🎡 La ruleta del castigo →') : null, navRow()];
    default:
      return null;
  }
}

// ---------- Juegos nuevos y castigos

/** Reloj que cuenta hacia atrás (lo que quedaba cuando llegó el estado). */
let liveClockTimer = 0;
function liveClock(msLeft) {
  clearInterval(liveClockTimer);
  const el = h('strong', { class: 'c-clock' });
  const end = performance.now() + (msLeft ?? 0);
  const step = () => (el.textContent = `${Math.max(0, Math.ceil((end - performance.now()) / 1000))} s`);
  step();
  liveClockTimer = setInterval(step, 250);
  return el;
}

const WORD_MARK = { ok: '✓', pass: '↷', foul: '✗' };

/** Palabras secretas: la tarjeta (tú la ves siempre), el reloj y los botones por si el móvil de quien juega falla. */
function wordsPanel() {
  const w = view.words;
  const card = w.card;
  const head = h(
    'section',
    { class: 'c-card' },
    h('p', { class: 'c-kicker' }, `${view.section.name} · Turno ${w.turn} de ${w.turns}`),
    h('h2', {}, w.actor ? `Le toca a ${w.actor.name}` : 'Nadie conectado'),
    w.team ? h('p', { class: 'muted' }, w.team.name) : null,
  );
  const results = w.results.length ? h('p', { class: 'c-words' }, w.results.map((r) => h('span', { class: r.result }, `${WORD_MARK[r.result]} ${r.word}`))) : null;
  if (w.phase === 'ready') return [head, h('p', { class: 'muted small center' }, 'Empieza al pulsar «¡Empezar!» en su móvil (o aquí).'), h('button', { class: 'btn primary big', onclick: () => cmd('wordsStart') }, '¡Empezar!'), navRow()];
  if (w.phase === 'done')
    return [
      head,
      h('section', { class: 'c-card center' }, h('h2', {}, `${w.score} ${w.score === 1 ? 'palabra' : 'palabras'}`), w.score ? h('p', {}, `+${w.score * w.points} ${w.team ? `para ${w.team.name}` : ''}`) : null, results),
      h('button', { class: 'btn primary big', onclick: () => cmd('nextItem') }, 'Siguiente turno →'),
      h('div', { class: 'c-row' }, btn('Repetir el turno', () => confirm('¿Repetir este turno? Se quitan sus puntos.') && cmd('restart'))),
      navRow(),
    ];
  return [
    head,
    h(
      'section',
      { class: 'c-card c-word-card center' },
      h('div', { class: 'c-row' }, liveClock(w.endsInMs), h('strong', {}, `✓ ${w.score}`)),
      card ? h('p', { class: 'c-kicker' }, `${card.icon} ${card.label}`) : null,
      card ? h('h2', { class: 'c-word' }, card.word) : null,
      card?.banned?.length ? h('p', { class: 'c-banned' }, card.banned.join(' · ')) : null,
    ),
    h('div', { class: 'c-grid2' }, btn('Pasar', () => cmd('wordsPass')), btn('✓ ¡Acertada!', () => cmd('wordsOk'), 'primary')),
    h('div', { class: 'c-grid2' }, btn('¡Falta!', () => cmd('wordsFoul'), 'danger'), btn('↶ Deshacer', () => cmd('wordsUndo'))),
    results,
    btn('Terminar el turno ya', () => cmd('wordsStop')),
  ];
}

/** Agita el móvil: la salida y la carrera. */
function shakePanel() {
  const s = view.shake;
  const head = h('section', { class: 'c-card' }, h('p', { class: 'c-kicker' }, [view.section.name, s.rounds > 1 ? `Ronda ${s.round} de ${s.rounds}` : ''].filter(Boolean).join(' · ')), h('h2', {}, '📱 Agita el móvil'), h('p', { class: 'muted' }, `${s.seconds} segundos · gana quien más agite`));
  const list = h(
    'ol',
    { class: 'c-standings' },
    s.players.map((p) => h('li', {}, h('span', {}, `${p.place ? `${p.place}º ` : ''}${p.name}`), h('strong', {}, String(p.total)), s.points?.[p.id] ? h('small', {}, ` +${s.points[p.id]}`) : null)),
  );
  if (s.phase === 'ready') return [head, h('button', { class: 'btn primary big', onclick: () => cmd('shakeStart') }, '¡Empezar! (3, 2, 1…)'), navRow()];
  if (s.phase === 'done') return [head, h('section', { class: 'c-card' }, list), h('button', { class: 'btn primary big', onclick: () => cmd('nextItem') }, 'Siguiente →'), h('div', { class: 'c-row' }, btn('Repetir la ronda', () => confirm('¿Repetir esta ronda? Se quitan sus puntos.') && cmd('restart'))), navRow()];
  return [head, h('section', { class: 'c-card' }, h('div', { class: 'c-row' }, liveClock(Math.max(0, s.endsInMs ?? 0))), list), btn('Parar ya', () => cmd('shakeStop'))];
}

/**
 * El pañuelo (lobos contra vampiros): sortear la pareja o elegirla en secreto (tocando uno de cada equipo), dar la
 * salida y decir quién ha cogido el pañuelo. Lo elegido en secreto se guarda fuera del pintado.
 */
let hankyDraft = { wolf: null, vampire: null };
function hankyPanel() {
  const k = view.hanky;
  const c = k.current;
  const ICON = { wolf: '🐺', vampire: '🧛' };
  const name = (side) => k.teams[side]?.name ?? (side === 'wolf' ? 'Hombres lobo' : 'Vampiros');
  const head = h(
    'section',
    { class: 'c-card center' },
    h('p', { class: 'c-kicker' }, `${view.section.name} · ${k.finished ? 'Terminado' : k.number ? `Duelo ${k.number} de ${k.total}` : `${k.total} duelos`}`),
    h('h2', {}, `${ICON.wolf} ${k.score.wolf} – ${k.score.vampire} ${ICON.vampire}`),
    h('p', { class: 'muted' }, `${name('wolf')} contra ${name('vampire')} · ${k.points} puntos por duelo ganado`),
  );
  const history = k.duels.length
    ? h('section', { class: 'c-card' }, h('p', { class: 'c-kicker' }, 'Duelos'), k.duels.map((d, i) => h('div', { class: 'c-row' }, h('span', {}, `${i + 1}. ${d.wolf} – ${d.vampire}`), h('strong', {}, `${ICON[d.winner]} ${d.winner === 'wolf' ? d.wolf : d.vampire}`))))
    : null;
  const undo = c?.step === 'done' ? btn('↶ Deshacer el último resultado', () => cmd('hankyUndo'), 'small') : null;
  if (k.finished)
    return [head, h('section', { class: 'c-card center' }, h('h2', {}, k.champion === 'tie' ? '¡Empate!' : `${ICON[k.champion]} ${name(k.champion)}, campeones`)), history, h('button', { class: 'btn primary big', onclick: () => cmd('nextItem') }, 'Al marcador →'), undo, navRow()];

  // Elegir la pareja: sorteo o en secreto
  const picker = () => {
    hankyDraft = { wolf: k.wolves.some((p) => p.id === hankyDraft.wolf) ? hankyDraft.wolf : null, vampire: k.vampires.some((p) => p.id === hankyDraft.vampire) ? hankyDraft.vampire : null };
    const chips = (side, people) =>
      h(
        'div',
        { class: 'c-chips' },
        people.map((p) =>
          h(
            'button',
            {
              class: `c-chip ${hankyDraft[side] === p.id ? 'picking' : k.candidates?.[side]?.includes(p.id) ? '' : 'done'}`,
              onclick: () => {
                hankyDraft = { ...hankyDraft, [side]: hankyDraft[side] === p.id ? null : p.id };
                lastSignature = null;
                render();
              },
            },
            `${p.name}${p.fought ? ` ·${p.fought}` : ''}`,
          ),
        ),
      );
    const ready = hankyDraft.wolf && hankyDraft.vampire;
    return [
      h('button', { class: 'btn primary big', onclick: () => cmd('hankyDraw') }, `🎲 Sortear el ${c ? 'siguiente ' : ''}duelo`),
      h(
        'section',
        { class: 'c-card' },
        h('p', { class: 'c-kicker' }, '🤫 O elige tú la pareja (nadie lo sabe hasta la tele)'),
        h('p', { class: 'c-team-head', style: { '--tc': getColor(k.teams.wolf?.color ?? 'azul').bg } }, `${ICON.wolf} ${name('wolf')}`),
        chips('wolf', k.wolves),
        h('p', { class: 'c-team-head', style: { '--tc': getColor(k.teams.vampire?.color ?? 'rojo').bg } }, `${ICON.vampire} ${name('vampire')}`),
        chips('vampire', k.vampires),
        h(
          'button',
          {
            class: 'btn ok',
            disabled: !ready,
            onclick: () => {
              cmd('hankyChoose', { wolf: hankyDraft.wolf, vampire: hankyDraft.vampire });
              hankyDraft = { wolf: null, vampire: null };
            },
          },
          'Llamar a esta pareja',
        ),
        h('p', { class: 'muted small' }, 'Los apagados ya han salido. Con un equipo más pequeño, alguno repite.'),
      ),
    ];
  };

  if (!c || c.step === 'done') {
    const result = c ? h('section', { class: 'c-card center' }, h('p', { class: 'c-kicker' }, 'Último duelo'), h('h2', {}, `${ICON[c.winner]} Gana ${c[c.winner].name}`), h('p', { class: 'muted' }, `${c.wolf.name} contra ${c.vampire.name}`)) : null;
    return [head, result, undo, ...picker(), history, navRow()];
  }
  const pair = h('section', { class: 'c-card center' }, h('p', { class: 'c-kicker' }, c.step === 'called' ? 'Al sillón' : '¡En carrera!'), h('h2', {}, `${ICON.wolf} ${c.wolf.name}`), h('p', {}, 'contra'), h('h2', {}, `${c.vampire.name} ${ICON.vampire}`));
  const winners = h('div', { class: 'c-grid2' }, btn(`${ICON.wolf} Gana ${c.wolf.name}`, () => cmd('hankyWin', { side: 'wolf' }), 'ok'), btn(`${ICON.vampire} Gana ${c.vampire.name}`, () => cmd('hankyWin', { side: 'vampire' }), 'ok'));
  if (c.step === 'called')
    return [head, pair, h('button', { class: 'btn primary big', onclick: () => cmd('hankyGo') }, '▶ ¡Preparados… YA! (3, 2, 1)'), h('div', { class: 'c-row' }, btn('Cambiar la pareja', () => cmd('hankyCancel'))), winners, history, navRow()];
  return [head, pair, h('p', { class: 'c-live' }, '¿Quién ha vuelto antes con el pañuelo?'), winners, h('div', { class: 'c-row' }, btn('Salida nula (repetir)', () => cmd('hankyFalse'))), history];
}

/** La gran apuesta: tú ves las apuestas y respuestas de todos; puedes apostar o responder por un equipo. */
function betPanel() {
  const b = view.bet;
  const L = ['A', 'B', 'C', 'D'];
  const head = h('section', { class: 'c-card' }, h('p', { class: 'c-kicker' }, [view.section.name, b.rounds > 1 ? `Apuesta ${b.round} de ${b.rounds}` : ''].filter(Boolean).join(' · ')), h('h2', {}, '💰 La gran apuesta'), b.question ? h('p', {}, b.question) : null, b.options ? h('p', { class: 'muted' }, b.options.map((o, i) => `${L[i]}: ${o}${i === b.correct ? ' ✓' : ''}`).join(' · ')) : null);
  const owners = h(
    'section',
    { class: 'c-card' },
    b.owners.map((o) =>
      h(
        'div',
        { class: 'c-row c-bet-owner' },
        h('strong', {}, o.name),
        h('span', { class: 'muted' }, `💰 ${o.bet ?? '—'} / ${o.max}`),
        // apostar por ellos: botones de cantidad (antes, una ventana de escribir que congelaba la página)
        b.phase === 'betting'
          ? h(
              'span',
              { class: 'c-bet-amounts' },
              [...new Set([0, Math.round(o.max / 4), Math.round(o.max / 2), o.max])].map((v) => btn(v === o.max ? `Todo (${v})` : String(v), () => cmd('betSet', { owner: o.id, amount: v }), o.bet === v ? 'primary small' : 'small')),
            )
          : null,
        b.phase === 'question' ? h('span', {}, L.slice(0, b.options.length).map((l, i) => btn(l, () => cmd('betAnswer', { owner: o.id, index: i }), o.answer === i ? 'primary small' : 'small'))) : null,
        b.phase === 'revealed' ? h('strong', { class: o.result > 0 ? 'ok' : o.result < 0 ? 'warn' : '' }, o.result > 0 ? `+${o.result}` : String(o.result ?? 0)) : null,
      ),
    ),
  );
  if (b.phase === 'betting') return [head, owners, h('button', { class: 'btn primary big', onclick: () => cmd('betClose') }, b.allBet ? 'Cerrar apuestas y ver la pregunta →' : 'Cerrar apuestas (faltan) →'), navRow()];
  if (b.phase === 'question') return [head, owners, h('button', { class: 'btn primary big', onclick: () => cmd('betReveal') }, b.allAnswered ? 'Revelar →' : 'Revelar (no han respondido todos) →'), navRow()];
  return [head, owners, h('button', { class: 'btn primary big', onclick: () => cmd('nextItem') }, 'Siguiente →'), navRow()];
}

/** Squid Games: empezar cada juego, ver lo secreto (el camino del puente, las canicas escondidas) y corregir a mano. */
function squidPanel() {
  const q = view.squid;
  const g = q.g;
  const n = (x) => `Nº ${String(x.number ?? '').padStart(3, '0')} ${x.name}`;
  const head = h(
    'section',
    { class: 'c-card' },
    h('p', { class: 'c-kicker' }, q.game === 'hucha' ? 'Squid Games · La hucha' : `Squid Games · Juego ${q.step} de ${q.steps - 1}`),
    h('h2', {}, `${q.icon} ${q.label}`),
    h('p', { class: 'muted' }, q.rule),
    h('p', {}, `🐷 ${q.pot} pts en la hucha · ${q.alive.length} vivos · ${q.perHead} por eliminado`),
  );
  const fixes = (allowed) =>
    allowed
      ? h(
          'section',
          { class: 'c-card' },
          h('p', { class: 'c-kicker' }, 'Corregir a mano'),
          q.alive.map((p) => h('div', { class: 'c-row' }, h('span', {}, n(p)), btn('💀 Eliminar', () => confirm(`¿Eliminar a ${p.name}?`) && cmd('squidEliminate', { id: p.id }), 'bad small'))),
          q.fallen.map((p) => h('div', { class: 'c-row' }, h('span', { class: 'muted' }, `💀 ${n(p)}`), btn('↩ Revivir', () => cmd('squidRevive', { id: p.id }), 'small'))),
        )
      : null;
  if (q.game === 'hucha') {
    return [head, h('section', { class: 'c-card center' }, h('h2', {}, q.alive.length ? `+${q.share} para cada superviviente` : 'No sobrevive nadie'), h('p', {}, q.alive.map(n).join(' · '))), bigNext('Al marcador →'), fixes(true), navRow()];
  }
  // Si ya solo queda uno (o nadie), lo que falta se salta: directo a la hucha
  if (q.alive.length <= 1 && q.phase !== 'running') return [head, h('section', { class: 'c-card center' }, h('p', {}, q.alive.length ? 'Solo queda uno: los juegos que faltan se saltan.' : 'No queda nadie: los juegos que faltan se saltan.')), h('button', { class: 'btn primary big', onclick: () => cmd('next') }, 'La hucha →'), q.phase === 'done' ? h('div', { class: 'c-row' }, btn('Repetir este juego', () => confirm('¿Repetir el juego? Vuelven los que cayeron en él.') && cmd('restart'))) : null, fixes(true), navRow()];
  if (!g || q.phase === 'ready') {
    const extra = q.game === 'panal' && g ? h('p', { class: 'muted' }, `${g.picked.length} de ${g.players.length} han elegido lata`) : null;
    return [head, extra, h('button', { class: 'btn primary big', onclick: () => cmd('squidStart') }, '▶ ¡Empezar! (3, 2, 1…)'), fixes(true), navRow()];
  }
  if (q.phase === 'done') {
    const gone = g.players.filter((p) => p.out);
    return [
      head,
      h('section', { class: 'c-card' }, h('p', { class: 'c-kicker' }, g.skipped ? 'Se ha saltado (poca gente)' : `Fuera en este juego: ${gone.length}`), h('p', {}, gone.map(n).join(' · ') || '¡Nadie!')),
      bigNext(q.step < q.steps - 1 ? 'Siguiente juego →' : 'La hucha →'),
      h('div', { class: 'c-row' }, btn('Repetir este juego', () => confirm('¿Repetir el juego? Vuelven los que cayeron en él.') && cmd('restart'))),
      fixes(true),
      navRow(),
    ];
  }
  // En marcha: lo que pasa (y lo secreto)
  const live = [];
  const byId = new Map(g.players.map((p) => [p.id, p]));
  if (q.game === 'luzroja') live.push(h('p', {}, `🏁 ${g.crossed.length} a salvo · 💀 ${Object.keys(g.fallen).length} fuera · ${g.players.length - g.crossed.length - Object.keys(g.fallen).length} en juego`));
  if (q.game === 'panal') live.push(h('p', {}, g.players.map((p) => `${p.name}: ${g.state[p.id] === 'done' ? '✅' : g.state[p.id] === 'broken' ? '💀' : `${Math.round(g.progress[p.id] ?? 0)} %`}`).join(' · ')));
  if (q.game === 'puente') {
    const cur = g.current && byId.get(g.current);
    live.push(
      h('p', {}, `Camino bueno: ${g.safe.map((x, i) => `${i + 1}${x === 'L' ? '⬅️' : '➡️'}`).join(' ')}`),
      h('p', {}, cur ? `Elige ${n(cur)} (tramo ${g.pos + 1} de ${g.steps})` : '…'),
      cur ? h('div', { class: 'c-grid2' }, btn('Elige por él: ⬅️', () => cmd('squidChoose', { side: 'L' })), btn('Elige por él: ➡️', () => cmd('squidChoose', { side: 'R' }))) : null,
    );
  }
  if (q.game === 'cuerda') live.push(h('p', {}, `Media por cabeza: ○ ${g.averages.A} · △ ${g.averages.B} (en total: ${g.totals.A} y ${g.totals.B})`));
  if (q.game === 'canicas') {
    live.push(
      ...g.duels.map((d) =>
        h('p', { class: d.loser ? 'muted' : '' }, `${byId.get(d.a)?.name} ${d.marbles[d.a]} – ${d.marbles[d.b]} ${byId.get(d.b)?.name}${d.loser ? ' · 💀 ' + byId.get(d.loser)?.name : d.hidden != null ? ` · esconde ${byId.get(d.hider)?.name}: ${d.hidden}` : ''}`),
      ),
    );
  }
  return [head, h('section', { class: 'c-card' }, h('p', { class: 'c-kicker' }, 'En marcha'), ...live), btn('Terminar ya este juego', () => confirm('¿Terminar ya? Quien no lo haya superado queda fuera.') && cmd('squidStop')), navRow()];
}

/** Castigos: la votación (tras presentar los equipos). */
function punishVotePanel() {
  const p = view.punish;
  const finalists = new Set(p.finalists?.map((f) => f.index) ?? []);
  return [
    h(
      'section',
      { class: 'c-card' },
      h('p', { class: 'c-kicker' }, `Castigos · ${p.voters} ${p.voters === 1 ? 'ha votado' : 'han votado'}`),
      h('h2', {}, p.closed ? 'Van a la ruleta' : 'Votando castigos'),
      h(
        'ol',
        { class: 'c-standings' },
        p.options.map((text, i) => h('li', { class: p.closed && !finalists.has(i) ? 'dim' : '' }, h('span', {}, `${finalists.has(i) ? '🎡 ' : ''}${text}`), h('strong', {}, String(p.tally[i])))),
      ),
    ),
    h('button', { class: 'btn primary big', onclick: () => cmd('next') }, p.closed ? 'Portada →' : 'Cerrar votación (pasan 3) →'),
    p.closed ? h('div', { class: 'c-row' }, btn('Volver a votar', () => confirm('¿Borrar los votos y votar otra vez?') && cmd('punishReopen'))) : null,
    navRow(),
  ];
}

/** Castigos: la ruleta (en el final). */
function roulettePanel() {
  const p = view.punish;
  return [
    h(
      'section',
      { class: 'c-card center' },
      h('p', { class: 'c-kicker' }, 'La ruleta del castigo'),
      p.loser ? h('h2', {}, `Pierde${p.loser.isTeam ? 'n' : ''}: ${p.loser.name}`) : null,
      h('p', {}, (p.finalists ?? []).map((f) => f.text).join(' · ')),
      p.spin ? h('p', { class: 'c-word' }, `🎡 ${p.spin.text}`) : null,
    ),
    p.spin ? null : h('button', { class: 'btn primary big', onclick: () => cmd('punishSpin') }, '🎡 ¡Girar la ruleta!'),
    navRow(),
  ];
}

/** La siguiente sección que se juega (o null si esta es la última). */
const nextSectionName = () => view.sections.slice(view.sectionIndex + 1).find((s) => s.on)?.name ?? null;

function bigNext(label) {
  return h('button', { class: 'btn primary big', onclick: () => cmd('next') }, label);
}

function setupPanel() {
  const connected = view.players.filter((p) => p.connected).length;
  const imp = view.lastImport;
  if (view.setupStep === 'prep') {
    return [
      h(
        'section',
        { class: 'c-card' },
        h('p', { class: 'c-kicker' }, 'Preparación'),
        h('h2', {}, view.title),
        h('p', { class: 'muted' }, `${view.sections.length} secciones · ${view.teams.length ? `${view.teams.length} equipos` : 'sin equipos'}`),
        h('p', { class: 'muted small' }, 'Carga la hoja y la carpeta del concurso en la tele. Luego, presenta el concurso: sale el título con su canción.'),
      ),
      h(
        'section',
        { class: 'c-card' },
        h('p', { class: 'c-kicker' }, `¿Qué juegos jugamos? · ${view.sections.filter((s) => s.on).length} de ${view.sections.length}`),
        view.sections.map((s) =>
          h(
            'label',
            { class: `c-game ${s.on ? '' : 'off'}` },
            h('input', { type: 'checkbox', checked: s.on, onchange: (e) => cmd('toggleSection', { id: s.id, on: e.target.checked }) }),
            h('span', {}, s.name),
            h('small', { class: 'muted' }, s.label),
          ),
        ),
      ),
      bigNext('Presentar el concurso →'),
    ];
  }
  if (view.setupStep === 'title') {
    return [
      h('section', { class: 'c-card center' }, h('p', { class: 'c-kicker' }, 'En la tele: el título'), h('h2', {}, view.title)),
      bigNext('Que se conecte la gente →'),
      navRow(),
    ];
  }
  return [
    h(
      'section',
      { class: 'c-card' },
      h('p', { class: 'c-kicker' }, 'Concurso cargado'),
      h('h2', {}, view.title),
      h('p', { class: 'muted' }, `${view.sections.length} secciones · ${view.teams.length ? `${view.teams.length} equipos` : 'sin equipos'}`),
      imp?.failed ? h('p', { class: 'warn' }, `El último archivo («${imp.fileName}») tenía ${imp.errors.length} errores: revísalos en la tele.`) : null,
      h('p', { class: 'muted small' }, 'Para cargar otro concurso, arrástralo a la tele (pantalla de preparación).'),
    ),
    h(
      'section',
      { class: 'c-card' },
      h('p', { class: 'c-kicker' }, `${connected} conectados (mínimo ${view.minPlayers})`),
      view.teams.length ? teamsSummary() : h('p', {}, view.players.map((p) => p.name).join(', ') || 'Nadie todavía.'),
      view.teams.length
        ? btn(view.teamsLocked ? '🔒 Equipos cerrados (abrir)' : '🔓 Equipos abiertos (cerrar)', () => cmd('lockTeams', { locked: !view.teamsLocked }))
        : null,
    ),
    h('button', { class: 'btn primary big', disabled: !view.canStart, onclick: () => cmd('next') }, view.teams.length ? 'Presentar los equipos →' : 'Empezar concurso →'),
    view.canStart ? h('p', { class: 'muted small center' }, view.teams.length ? 'Al empezar, los equipos se cierran.' : '') : null,
  ];
}

function teamsSummary() {
  const groups = view.teams.map((t) => ({ team: t, members: view.players.filter((p) => p.teamId === t.id) }));
  const teamless = view.players.filter((p) => !p.teamId);
  return h(
    'div',
    { class: 'c-teams' },
    groups.map(({ team, members }) =>
      h(
        'div',
        { class: 'c-team', style: { '--tc': getColor(team.color).bg } },
        h('strong', {}, `${team.name} (${members.length})`),
        h('span', {}, members.map((m) => m.name).join(', ') || '—'),
      ),
    ),
    teamless.length ? h('div', { class: 'c-team no-team' }, h('strong', {}, `Sin equipo (${teamless.length})`), h('span', {}, teamless.map((m) => m.name).join(', '))) : null,
  );
}

function sectionCard() {
  const s = view.section;
  if (!s) return null;
  return h(
    'section',
    { class: 'c-card' },
    h('p', { class: 'c-kicker' }, `Sección ${view.sections.filter((s) => s.on && s.index <= view.sectionIndex).length} de ${view.sections.filter((s) => s.on).length} · ${view.sectionLabel}`),
    h('h2', {}, s.name),
    s.description ? h('p', {}, s.description) : null,
    h('p', { class: 'muted' }, `Puntos: ${s.points.join(' · ')}`),
    view.playable ? null : h('p', { class: 'warn' }, 'Este tipo de sección aún no se puede jugar: se saltará.'),
  );
}

function buzzerPanel() {
  const item = view.item;
  const game = view.game;
  const progress = view.itemCount ? `Pregunta ${view.itemIndex + 1} de ${view.itemCount}` : `Pregunta ${view.itemIndex + 1} (improvisada)`;

  const question = h(
    'section',
    { class: 'c-card' },
    h('p', { class: 'c-kicker' }, `${view.section.name} · ${progress}`),
    item?.question ? h('p', { class: 'c-question' }, item.question) : h('p', { class: 'muted' }, item?.song ? '🎵 Pregunta con canción' : 'Sin pregunta escrita: improvisa.'),
    item?.answer ? h('p', { class: 'c-answer' }, h('small', {}, 'Respuesta'), item.answer) : null,
    item?.notes ? h('p', { class: 'c-notes' }, '📝 ', item.notes) : null,
    item?.showOnTv && item.question
      ? h('p', { class: 'muted small' }, view.shown.question ? '✓ La pregunta se ve en la tele.' : 'La pregunta aún no se ve en la tele.')
      : item && !item.showOnTv
        ? h('p', { class: 'muted small' }, 'Esta pregunta no se muestra en la tele.')
        : null,
  );

  let turn;
  switch (game?.phase) {
    case 'idle':
      turn = [
        item?.showOnTv && item.question && !view.shown.question ? btn('Mostrar pregunta en la tele', () => cmd('showQuestion')) : null,
        h('button', { class: 'btn primary big', disabled: !view.canStart, onclick: () => cmd('open') }, 'Abrir turno'),
      ];
      break;
    case 'open':
      turn = [h('p', { class: 'c-live' }, '¡Turno abierto! Esperando pulsaciones…'), btn('Reiniciar pregunta', () => cmd('restart'))];
      break;
    case 'result':
      turn = [
        resultCard(game),
        game.judged
          ? null
          : h(
              'div',
              { class: 'c-row' },
              h('button', { class: 'btn ok big', onclick: () => cmd('correct') }, `Acierto +${view.pointsForCorrect}`),
              h('button', { class: 'btn bad big', onclick: () => cmd('wrong') }, 'Fallo: rebote'),
            ),
        item?.answer && !view.shown.answer ? btn('Mostrar respuesta en la tele', () => cmd('showAnswer')) : null,
        h('button', { class: `btn big ${game.judged ? 'primary' : ''}`, onclick: () => cmd('nextItem') }, 'Siguiente pregunta →'),
        btn('Reiniciar pregunta', () => cmd('restart')),
      ];
      break;
    case 'closed':
      turn = [
        h('p', { class: 'c-live' }, 'Nadie más puede responder.'),
        item?.answer && !view.shown.answer ? btn('Mostrar respuesta en la tele', () => cmd('showAnswer')) : null,
        h('button', { class: 'btn primary big', onclick: () => cmd('nextItem') }, 'Siguiente pregunta →'),
        btn('Reiniciar pregunta', () => cmd('restart')),
      ];
      break;
  }

  return [
    question,
    h('section', { class: 'c-turn' }, turn),
    h('div', { class: 'c-row secondary' }, btn('Saltar pregunta', () => cmd('nextItem')), btn('Terminar sección', () => cmd('endSection'))),
    navRow(),
  ];
}

/** Ganadores marcados en el mando antes de dar los puntos (por prueba). */
let freeWinners = { roundId: null, ids: new Set() };

/** Sección Libre ("Fit o Fat"): participantes, cronómetro o contador, y ganadores. */
/**
 * Millonario: quién concursa, enseñar respuestas, ver lo que ha elegido, marcarla (amarillo), mostrar la buena (verde)
 * y llevar la llamada y el público.
 */
function millionairePanel() {
  const m = view.millionaire;
  const L = ['A', 'B', 'C', 'D', 'E', 'F'];
  const playing = m.phase === 'playing';
  const revealed = m.phase === 'revealed';
  const progress = `Pregunta ${view.itemIndex + 1} de ${view.itemCount}`;

  const seatCard = h(
    'section',
    { class: 'c-card' },
    h('p', { class: 'c-kicker' }, [view.section.name, progress, `${m.points} ${m.points === 1 ? 'punto' : 'puntos'}`].join(' · ')),
    h(
      'label',
      { class: 'c-counter-row' },
      h('span', {}, 'Concursa'),
      h(
        'select',
        { class: 'c-select', disabled: revealed, onchange: (e) => cmd('mSeat', { playerId: e.target.value }) },
        m.seat ? null : h('option', { value: '', selected: true }, '— elige —'),
        view.players.map((p) => h('option', { value: p.id, selected: p.id === m.seat?.id }, `${p.name}${p.connected ? '' : ' (desconectado)'}`)),
      ),
    ),
    m.jokers ? h('p', { class: 'muted small' }, 'Comodines: ' + ['fifty', 'audience', 'call'].map((k) => `${{ fifty: '50:50', audience: 'Público', call: 'Llamada' }[k]} ${m.jokers[k] > 0 ? '✓' : '✗'}`).join(' · ')) : null,
    m.cheated ? h('p', { class: 'c-live' }, '🚨 Ha salido de la app: aunque acierte, no puntúa (puedes perdonarle arriba)') : null,
  );

  const optionsCard = h(
    'section',
    { class: 'c-card' },
    h('h2', {}, m.text),
    h(
      'ol',
      { class: 'c-mill-options' },
      m.options.map((text, i) =>
        h(
          'li',
          { class: [i === m.correct ? 'right' : '', i === m.marked ? 'marked' : '', i === m.choice ? 'choice' : '', i >= m.shown ? 'hidden' : ''].join(' ') },
          h('strong', {}, `${L[i]}: `),
          text,
          i === m.correct ? ' ✓' : '',
          m.removed.includes(i) ? h('small', {}, ' · quitada (50:50)') : null,
          i === m.choice && !revealed ? h('small', {}, ' · ← la elegida') : null,
          i >= m.shown ? h('small', {}, ' · aún no se ve') : null,
          playing && !m.removed.includes(i) ? btn(`Marcar ${L[i]}`, () => cmd('mMark', { index: i }), i === m.choice ? 'primary small' : 'small') : null,
        ),
      ),
    ),
  );

  const actions = [];
  if (!revealed && m.shown < m.count) {
    actions.push(btn(m.shown ? 'Enseñar la siguiente respuesta' : 'Enseñar la respuesta A', () => cmd('mShow'), 'primary big'), btn('Enseñar todas', () => cmd('mShow', { all: true })));
  }
  if (playing && m.shown >= m.count) {
    actions.push(
      m.choice != null
        ? btn(`Marcar la del concursante (${L[m.choice]})`, () => cmd('mMark'), 'primary big')
        : h('p', { class: 'c-live' }, 'Esperando a que el concursante elija (o márcala tú)'),
    );
  }
  if (m.phase === 'marked') actions.push(btn('Mostrar la respuesta correcta', () => cmd('mReveal'), 'primary big'), btn('Desmarcar', () => cmd('mUnmark')));
  if (revealed) {
    actions.push(
      h('p', { class: 'c-live' }, m.result.correct ? `✓ ¡Correcta!${m.cheated ? ' (sin puntos)' : ` +${m.points}`}` : `✗ Marcó la ${L[m.marked]}, era la ${L[m.correct]}`),
      btn('Siguiente pregunta →', () => cmd('nextItem'), 'primary big'),
    );
  }

  const jokerCards = [];
  if (m.audience && m.audience.state !== 'cancelled') {
    jokerCards.push(
      h(
        'section',
        { class: 'c-card' },
        h('p', { class: 'c-kicker' }, '👥 Público'),
        m.audience.state === 'voting'
          ? [
              h('p', {}, `Votando: ${m.audience.voted} de ${m.audience.voters}`),
              h('div', { class: 'c-row' }, btn('Terminar ya', () => cmd('mAudienceEnd')), btn('Anular (han hablado)', () => confirm('¿Anular el comodín del público? No se devuelve.') && cmd('mAudienceCancel'), 'danger')),
            ]
          : h('p', {}, m.audience.percentages.map((p, i) => `${L[i]}: ${p} %`).join(' · ')),
      ),
    );
  }
  if (m.call && m.call.state !== 'done') {
    jokerCards.push(
      h(
        'section',
        { class: 'c-card' },
        h('p', { class: 'c-kicker' }, `📞 Llamada a ${m.call.friend?.name ?? '¿?'}`),
        m.call.state === 'waiting'
          ? [h('p', {}, 'Cuando estén al teléfono, di «ya»:'), btn('¡Ya! Empezar los 30 s', () => cmd('mCallStart'), 'primary big')]
          : [h('p', {}, 'Corren los 30 segundos…'), btn('Terminar la llamada', () => cmd('mCallEnd'))],
      ),
    );
  }

  return [seatCard, optionsCard, ...jokerCards, h('div', { class: 'c-actions' }, actions), navRow()];
}

/** Libre con contador y equipos: qué jugador de cada equipo cuenta desde su móvil (solo ese móvil puede sumar). */
function countersCard(f) {
  return h(
    'section',
    { class: 'c-card' },
    h('p', { class: 'c-kicker' }, '¿Quién cuenta por cada equipo?'),
    h('p', { class: 'muted small' }, 'Solo el móvil de ese jugador tendrá los botones +1 / −1.'),
    f.participants.map((t) =>
      h(
        'label',
        { class: 'c-counter-row' },
        h('span', {}, t.name),
        h(
          'select',
          { class: 'c-select', onchange: (e) => cmd('freeCounter', { teamId: t.id, playerId: e.target.value }) },
          h('option', { value: '', selected: !t.counter }, 'Nadie (cuento yo)'),
          (t.members ?? []).map((m) => h('option', { value: m.id, selected: m.id === t.counter }, m.name)),
        ),
      ),
    ),
  );
}

function freePanel() {
  const f = view.free;
  const toolLabel = { none: f.song ? 'Con canción' : 'Sin herramienta', stopwatch: 'Cronómetro', counter: 'Contador', trial: 'Contrarreloj' }[f.tool];
  const progress = view.itemCount > 1 ? `Prueba ${view.itemIndex + 1} de ${view.itemCount}` : '';
  const chosen = new Set(f.participants.map((p) => p.id));
  const label = (p) => [p.icon || p.face ? h('span', { class: 'c-mini emoji' }, avatarOf(p)) : null, ' ', p.name];

  const card = h(
    'section',
    { class: 'c-card' },
    h('p', { class: 'c-kicker' }, [view.section.name, progress, toolLabel].filter(Boolean).join(' · ')),
    h('h2', {}, f.title),
    f.description ? h('p', {}, f.description) : null,
    h('p', { class: 'muted' }, `${f.points} ${f.points === 1 ? 'punto' : 'puntos'} para ${f.byTeams ? 'el equipo ganador' : 'quien gane'}`),
  );

  let body = [];
  if (f.phase === 'setup') {
    const send = (ids) => cmd('freeParticipants', { ids: [...ids].join(',') });
    const check = (p) =>
      h(
        'label',
        { class: 'c-check' },
        h('input', {
          type: 'checkbox',
          checked: chosen.has(p.id),
          onchange: (e) => {
            if (e.target.checked) chosen.add(p.id);
            else chosen.delete(p.id);
            send(chosen);
          },
        }),
        label(p),
      );
    // Cada uno con equipos (p. ej. «uno por equipo» que se lleva los puntos él): agrupados por equipo
    const groups = !f.byTeams && view.teams.length ? [...view.teams.map((t) => ({ team: t, list: f.pool.filter((p) => p.teamId === t.id) })), { team: null, list: f.pool.filter((p) => !teamOf(p.teamId)) }].filter((g) => g.list.length) : null;
    body.push(
      h(
        'section',
        { class: 'c-card' },
        h('p', { class: 'c-kicker' }, f.byTeams ? '¿Qué equipos participan?' : groups ? '¿Quién sale de cada equipo? (los puntos son para él)' : '¿Quién participa?'),
        groups
          ? groups.map((g) => [
              h('p', { class: 'c-team-head', style: { '--tc': getColor(g.team?.color ?? 'gris').bg } }, g.team?.name ?? 'Sin equipo'),
              h('div', { class: 'c-checks' }, g.list.map(check)),
            ])
          : h('div', { class: 'c-checks' }, f.pool.map(check)),
        h('div', { class: 'c-row' }, btn('Todos', () => send(f.pool.map((p) => p.id))), btn('Ninguno', () => send([]))),
      ),
    );
    if (f.tool === 'counter' && f.byTeams && f.participants.length) body.push(countersCard(f));
    if (f.startable) {
      const first = f.participants[0]?.name;
      const label = f.tool === 'stopwatch' ? '¡Empezar! (cronómetro)' : f.tool === 'trial' ? `¡Empezar! Sale ${first ?? '…'}` : f.tool === 'none' || (f.tool === 'score' && f.song) ? '🎵 ¡Que suene la canción!' : '¡Empezar!';
      if (f.song) body.push(h('p', { class: 'muted small' }, `🎵 «${f.song}» desde el segundo ${f.songStart}${f.beat != null ? ` · se calla ${f.silence} s antes del golpe (${f.beat} s) y vuelve en el golpe` : ''}`));
      body.push(h('button', { class: 'btn primary big', disabled: !chosen.size, onclick: () => cmd('freeStart') }, label));
    } else if (chosen.size) {
      body.push(winnersPicker(f));
    }
  } else if (f.tool === 'score' && (f.phase === 'running' || f.phase === 'stopped')) {
    // Nota: mientras suena (o al acabar), una nota del 1 al 10 a cada uno; luego, dar los puntos
    body.push(h('p', { class: 'c-live' }, f.phase === 'running' ? (f.song ? '🎵 Suena la canción: pon una nota del 1 al 10 a cada uno' : 'Pon una nota del 1 al 10 a cada uno') : 'Pon las notas que falten y da los puntos'), scoreCard(f));
    if (f.phase === 'running') body.push(btn(f.song ? 'Parar la canción' : 'Parar', () => cmd('freeStop')));
  } else if (f.phase === 'running' && f.tool === 'trial') {
    body.push(trialCard(f), btn('Parar la prueba', () => cmd('freeStop')));
  } else if (f.phase === 'running' && f.tool === 'none') {
    // Con canción: mientras suena (o al acabar), eliges a quien lo ha hecho bien
    body.push(h('p', { class: 'c-live' }, '🎵 Suena la canción: al acabar, marca a quien lo ha hecho bien'), winnersPicker(f), btn('Parar la canción', () => cmd('freeStop')));
  } else if (f.phase === 'running') {
    if (f.tool === 'counter' && f.byTeams) body.push(countersCard(f)); // se puede cambiar quién cuenta en marcha
    body.push(
      h('p', { class: 'c-live' }, f.tool === 'stopwatch' ? 'Cronómetro en marcha: marca a quien caiga' : 'En marcha: suma lo que haga cada uno'),
      h(
        'section',
        { class: 'c-card' },
        f.participants.map((p) =>
          h(
            'div',
            { class: `c-player ${p.out != null ? 'offline' : ''}` },
            h('span', { class: 'c-team-dot', style: { '--tc': getColor(p.color).bg } }),
            h('span', { class: 'c-pname' }, label(p), p.out != null ? h('small', {}, ` · cayó a los ${formatClockText(p.out)}`) : null),
            f.tool === 'counter'
              ? [
                  h('strong', { class: 'c-score' }, String(p.count)),
                  btn('−', () => cmd('freeCount', { id: p.id, delta: -1 }), 'round'),
                  btn('+', () => cmd('freeCount', { id: p.id, delta: 1 }), 'round'),
                ]
              : [
                  h('span'),
                  p.out != null
                    ? btn('Deshacer', () => cmd('freeRevive', { id: p.id }), 'small')
                    : btn('Eliminado', () => cmd('freeOut', { id: p.id }), 'bad small'),
                  h('span'),
                ],
          ),
        ),
      ),
      btn('Parar', () => cmd('freeStop')),
    );
  } else if (f.phase === 'stopped') {
    body.push(winnersPicker(f));
  } else {
    body.push(
      f.tool === 'score'
        ? h('section', { class: 'c-card' }, h('p', { class: 'c-kicker' }, 'Notas'), f.ranking.map((r) => h('div', { class: 'c-row' }, h('span', {}, r.who.name), h('strong', {}, r.value == null ? '—' : `${r.value} → +${r.value}`))))
        : h('section', { class: 'c-card' }, h('p', { class: 'c-kicker' }, 'Ganador'), h('p', { class: 'c-question' }, f.winners.map((w) => w.name).join(' y '), ` (+${f.points})`)),
      h('button', { class: 'btn primary big', onclick: () => cmd('nextItem') }, view.itemIndex + 1 < view.itemCount ? 'Siguiente prueba →' : 'Al marcador →'),
    );
  }

  return [
    card,
    ...body,
    h(
      'div',
      { class: 'c-row secondary' },
      btn('Reiniciar prueba', () => (f.phase !== 'awarded' || confirm('¿Reiniciar? Se quitan los puntos de esta prueba.')) && cmd('restart')),
      btn('Terminar sección', () => cmd('endSection')),
    ),
    navRow(),
  ];
}

/** Contrarreloj: quién sale, su reloj, sus intentos (cuántas piezas tiene bien) y los tiempos de los demás. */
let trialClockTimer = 0;
function trialCard(f) {
  clearInterval(trialClockTimer);
  const cur = f.participants.find((p) => p.id === f.current);
  const tr = f.trials?.[f.current];
  const done = f.participants.filter((p) => f.trials?.[p.id]?.time != null);
  const clock = h('strong', { class: 'c-clock' });
  if (f.trialRunning) {
    const start = performance.now() - f.trialElapsed;
    const step = () => (clock.textContent = formatClockText(performance.now() - start));
    step();
    trialClockTimer = setInterval(step, 100);
  }
  const attempts = tr?.attempts ?? [];
  return [
    h(
      'section',
      { class: 'c-card center' },
      h('p', { class: 'c-kicker' }, f.trialRunning ? 'En marcha' : 'Siguiente'),
      h('h2', {}, cur ? cur.name : '—'),
      f.trialRunning ? clock : null,
      attempts.length ? h('p', { class: 'c-words' }, attempts.map((a, i) => h('span', {}, `${i + 1}º: ${a.n}${f.pieces ? `/${f.pieces}` : ''}`))) : null,
    ),
    f.trialRunning
      ? [
          f.pieces
            ? h(
                'section',
                { class: 'c-card' },
                h('p', { class: 'c-kicker' }, '¿Cuántas tiene bien en este intento?'),
                h('div', { class: 'c-pieces' }, Array.from({ length: f.pieces + 1 }, (_, n) => btn(String(n), () => cmd('freeAttempt', { n }), n === f.pieces ? 'ok' : ''))),
                attempts.length ? btn('↶ Quitar el último intento', () => cmd('freeUndoAttempt'), 'small') : null,
              )
            : null,
          h('div', { class: 'c-grid2' }, btn('Se rinde', () => confirm(`¿${cur?.name} se rinde?`) && cmd('freeDone', { gaveUp: true }), 'bad'), btn('✓ ¡Lo tiene!', () => cmd('freeDone'), 'ok')),
        ]
      : h('button', { class: 'btn primary big', onclick: () => cmd('freeNext') }, `▶ Empieza ${cur?.name ?? ''}`),
    done.length
      ? h(
          'section',
          { class: 'c-card' },
          h('p', { class: 'c-kicker' }, 'Tiempos'),
          done.map((p) => h('div', { class: 'c-row' }, h('span', {}, p.name), h('strong', {}, f.trials[p.id].gaveUp ? 'se rindió' : formatClockText(f.trials[p.id].time)))),
        )
      : null,
  ];
}

/** Nota: botones del 1 al 10 por participante (tocar la misma la quita) y dar los puntos (cada uno, su nota). */
function scoreCard(f) {
  const label = (p) => [p.icon || p.face ? h('span', { class: 'c-mini emoji' }, avatarOf(p)) : null, ' ', p.name];
  const scored = f.participants.filter((p) => p.score != null).length;
  return h(
    'section',
    { class: 'c-card' },
    f.participants.map((p) =>
      h(
        'div',
        { class: 'c-score-row' },
        h('p', { class: 'c-pname' }, h('span', { class: 'c-team-dot', style: { '--tc': getColor(p.color).bg } }), label(p), h('strong', {}, p.score == null ? '' : ` · ${p.score}`)),
        h(
          'div',
          { class: 'c-score-grid' },
          Array.from({ length: 10 }, (_, i) => i + 1).map((n) => btn(String(n), () => cmd('freeScore', { id: p.id, value: p.score === n ? '' : n }), p.score === n ? 'ok' : 'small')),
        ),
      ),
    ),
    h('button', { class: 'btn ok big', disabled: !scored, onclick: () => cmd('freeAward', { ids: '' }) }, scored === f.participants.length ? 'Dar los puntos (cada uno, su nota)' : `Dar los puntos (${scored} de ${f.participants.length} con nota)`),
  );
}

/** Elegir ganadores (viene marcado lo que propone la herramienta) y dar los puntos. */
function winnersPicker(f) {
  if (freeWinners.roundId !== f.roundId) freeWinners = { roundId: f.roundId, ids: new Set(f.suggestion) };
  const picked = freeWinners.ids;
  const valueOf = (id) => f.ranking.find((r) => r.id === id);
  return h(
    'section',
    { class: 'c-card' },
    h('p', { class: 'c-kicker' }, f.suggestion.length ? 'Ganador (propuesto por la herramienta: puedes cambiarlo)' : '¿Quién gana?'),
    h(
      'div',
      { class: 'c-checks' },
      f.participants.map((p) => {
        const r = valueOf(p.id);
        const extra =
          f.tool === 'stopwatch' || (f.tool === 'trial' && r?.value != null) ? ` · ${formatClockText(r?.value ?? 0)}` : f.tool === 'trial' ? ' · sin tiempo' : f.tool === 'counter' ? ` · ${r?.value ?? 0}` : '';
        return h(
          'label',
          { class: 'c-check' },
          h('input', {
            type: 'checkbox',
            checked: picked.has(p.id),
            onchange: (e) => (e.target.checked ? picked.add(p.id) : picked.delete(p.id)),
          }),
          `${p.name}${extra}`,
        );
      }),
    ),
    h('button', { class: 'btn ok big', onclick: () => cmd('freeAward', { ids: [...picked].join(',') }) }, `Dar ${f.points} ${f.points === 1 ? 'punto' : 'puntos'}`),
  );
}

/** 83 456 ms → "1:23,4" */
function formatClockText(ms) {
  const total = Math.max(0, ms) / 1000;
  const minutes = Math.floor(total / 60);
  return `${minutes}:${(total - minutes * 60).toFixed(1).padStart(4, '0').replace('.', ',')}`;
}

/** Secciones de respuestas: Test, Verdad o mentira, Dos verdades, Votación y Estimación. */
function answerPanel() {
  const a = view.answer;
  const progress = view.itemCount ? `Pregunta ${view.itemIndex + 1} de ${view.itemCount}` : '';
  const fmt = (n) => `${Number(n).toLocaleString('es-ES')}${a.unit ? ` ${a.unit}` : ''}`;

  let solution = null;
  if (a.options && a.correct != null) {
    const s = optionStyle(a.kind, a.correct);
    solution = h('p', { class: 'c-answer' }, h('small', {}, a.kind === 'dosVerdades' ? 'La mentira' : 'Correcta'), `${s.shape} ${a.options[a.correct]}`);
  } else if (a.kind === 'estimacion') {
    solution = h('p', { class: 'c-answer' }, h('small', {}, a.noOver ? 'Respuesta (gana el más cercano sin pasarse)' : 'Respuesta (gana el más cercano)'), fmt(a.correct));
  } else if (a.kind === 'contador') {
    const mode = { visible: 'reloj visible', blind: 'a ciegas', hide: `el reloj desaparece a los ${a.hideAfter} s` }[a.mode];
    solution = h('p', { class: 'c-answer' }, h('small', {}, `Objetivo · ${mode}`), `${String(a.target).replace('.', ',')} s`);
  } else if (a.kind === 'reflejos') {
    solution = h('p', { class: 'c-answer' }, h('small', {}, a.duel ? 'Duelo' : 'Todos contra todos'), `Ronda ${a.round} de ${a.rounds}`);
  }
  const subjectWarning =
    a.kind === 'dosVerdades' && a.subject && !a.subject.id
      ? h('p', { class: 'warn' }, `No hay ningún jugador llamado «${a.subject.name}»: votarán todos y nadie suma por engañar.`)
      : null;

  const timing = a.kind === 'contador' || a.kind === 'reflejos';
  const question = h(
    'section',
    { class: 'c-card' },
    h('p', { class: 'c-kicker' }, [view.section.name, progress, a.label].filter(Boolean).join(' · ')),
    h('p', { class: 'c-question' }, a.text),
    a.options ? h('ol', { class: 'c-options' }, a.options.map((o, i) => h('li', {}, `${optionStyle(a.kind, i).shape} ${o}`))) : null,
    solution,
    subjectWarning,
  );

  const answered = new Set(a.answeredIds);
  const progressCard =
    a.phase === 'open' || a.phase === 'closed'
      ? h(
          'section',
          { class: 'c-card' },
          h('p', { class: 'c-kicker' }, `${a.answeredIds.length} de ${a.eligibleIds.length} ${timing ? 'han pulsado' : 'han respondido'}`),
          h(
            'p',
            { class: 'small' },
            a.eligibleIds.map((id) => {
              const p = view.players.find((x) => x.id === id);
              return h('span', { class: answered.has(id) ? 'c-done' : 'c-waiting' }, `${answered.has(id) ? '✓' : '…'} ${p?.name ?? '¿?'}  `);
            }),
          ),
          liveCounts(a),
        )
      : null;

  let actions;
  switch (a.phase) {
    case 'ready': {
      const label = { contador: '¡Empezar! (3, 2, 1…)', reflejos: 'Poner en rojo' }[a.kind] ?? 'Abrir respuestas';
      actions = [
        a.kind === 'reflejos' && a.duel ? duelPicker(a) : null,
        h('button', { class: 'btn primary big', disabled: !view.canStart, onclick: () => cmd('openAnswers') }, label),
      ];
      break;
    }
    case 'open':
      actions = [h('p', { class: 'c-live' }, timing ? '¡En juego!' : '¡Respondiendo!'), btn('Cerrar ya', () => cmd('closeAnswers'))];
      break;
    case 'closed':
      actions = [h('button', { class: 'btn primary big', onclick: () => cmd('reveal') }, 'Revelar')];
      break;
    case 'revealed':
      actions = [revealSummary(a), h('button', { class: 'btn primary big', onclick: () => cmd('nextItem') }, 'Siguiente pregunta →')];
      break;
  }

  return [
    question,
    progressCard,
    h('section', { class: 'c-turn' }, actions),
    h(
      'div',
      { class: 'c-row secondary' },
      btn('Reiniciar pregunta', () => (a.phase !== 'revealed' || confirm('¿Reiniciar? Se quitan los puntos de esta pregunta.')) && cmd('restart')),
      btn('Terminar sección', () => cmd('endSection')),
    ),
    navRow(),
  ];
}

/**
 * Duelo de reflejos: el presentador toca a los dos que juegan; con el segundo, queda fijado. Lo elegido se guarda
 * fuera del pintado (antes eran dos desplegables y el repintado borraba el primero mientras se elegía el segundo).
 */
let duelDraft = [];
function duelPicker(a) {
  const players = view.players.filter((p) => p.connected);
  const [first, second] = a.duelPick;
  duelDraft = duelDraft.filter((id) => players.some((p) => p.id === id));
  const toggle = (id) => {
    duelDraft = duelDraft.includes(id) ? duelDraft.filter((x) => x !== id) : [...duelDraft, id].slice(-2);
    if (duelDraft.length === 2) {
      cmd('setDuel', { a: duelDraft[0], b: duelDraft[1] });
      duelDraft = [];
    }
    lastSignature = null;
    render();
  };
  const fixed = first && second ? [first.id, second.id] : [];
  return h(
    'div',
    { class: 'c-card' },
    h('p', { class: 'c-kicker' }, first && second ? `Duelo: ${first.name} contra ${second.name}` : 'Elige a los dos del duelo'),
    h('p', { class: 'c-hint' }, duelDraft.length ? `${players.find((p) => p.id === duelDraft[0])?.name ?? ''} contra… (toca al segundo)` : 'Toca a dos jugadores: el duelo se fija al tocar el segundo.'),
    h(
      'div',
      { class: 'c-chips' },
      players.map((p) =>
        h('button', { class: `c-chip ${duelDraft.includes(p.id) ? 'picking' : fixed.includes(p.id) ? 'on' : ''}`, onclick: () => toggle(p.id) }, p.name),
      ),
    ),
  );
}

/** Recuento en directo (solo lo ve el presentador). */
function liveCounts(a) {
  if (a.kind === 'contador' || a.kind === 'reflejos') {
    if (!a.answers?.length) return null;
    const text = (x) => (x.value == null ? 'en rojo' : a.kind === 'contador' ? `${x.value.toFixed(3).replace('.', ',')} s` : `${Math.round(x.value)} ms`);
    return h('p', { class: 'small muted' }, a.answers.map((x) => `${x.player.name}: ${text(x)}`).join(' · '));
  }
  if (!a.counts) return null;
  if (a.kind === 'votacion') {
    const rows = a.candidates.map((p) => [p.name, a.counts[p.id] ?? 0]).sort((x, y) => y[1] - x[1]);
    return h('p', { class: 'small muted' }, rows.map(([n, c]) => `${n}: ${c}`).join(' · '));
  }
  if (a.kind === 'estimacion') {
    return a.answers?.length ? h('p', { class: 'small muted' }, a.answers.map((x) => `${x.player.name}: ${Number(x.value).toLocaleString('es-ES')}`).join(' · ')) : null;
  }
  return h('p', { class: 'small muted' }, a.counts.map((c, i) => `${optionStyle(a.kind, i).shape} ${c}`).join('   '));
}

function revealSummary(a) {
  const scorers = a.results.entries.filter((e) => e.points > 0);
  const extra = [];
  if (a.kind === 'votacion') extra.push(a.results.winners.length ? `Más votado: ${a.results.winners.map((w) => w.name).join(' y ')}` : 'Nadie ha votado');
  if (a.kind === 'dosVerdades' && a.subject?.id) extra.push(`${a.subject.name} ha engañado a ${a.results.fooled ?? 0} (+${a.results.fooled ?? 0})`);
  return h(
    'div',
    { class: 'c-card' },
    h('p', { class: 'c-kicker' }, 'Resultado'),
    extra.map((t) => h('p', {}, t)),
    scorers.length
      ? h('ol', { class: 'c-followers plain' }, scorers.map((e) => h('li', {}, `${e.player.name} +${e.points}`)))
      : h('p', { class: 'muted' }, 'Nadie suma en esta pregunta.'),
  );
}

function resultCard(game) {
  const w = game.winner;
  if (!w) return null;
  const team = teamOf(w.teamId);
  const first = game.ranking[0];
  return h(
    'div',
    { class: 'c-winner', style: { '--wc': getColor(w.color).bg, '--wc-fg': getColor(w.color).fg } },
    h('div', { class: 'c-winner-main' }, w.icon || w.face ? h('span', { class: 'emoji big-icon' }, avatarOf(w)) : null, h('div', {}, h('strong', {}, w.name), team ? h('small', {}, team.name) : null)),
    first ? h('span', { class: 'c-time' }, formatSeconds(first.reactionMs)) : null,
    game.judged === 'correct' ? h('p', { class: 'c-verdict' }, `¡Correcto! +${view.pointsForCorrect}`) : null,
    game.ranking.length > 1
      ? h(
          'ol',
          { class: 'c-followers' },
          game.ranking.slice(1).map((r) => h('li', {}, `${r.place}º ${r.player.name} ${formatDeltaMs(r.deltaMs)}${r.nearTie ? ' · casi empate' : ''}`)),
        )
      : null,
  );
}

function standingsCard(title) {
  const players = [...view.players].sort((a, b) => b.score - a.score);
  return h(
    'section',
    { class: 'c-card' },
    h('p', { class: 'c-kicker' }, title),
    view.standings.length
      ? h(
          'ol',
          { class: 'c-standings' },
          view.standings.map((s) => h('li', { style: { '--tc': getColor(s.team.color).bg } }, h('span', {}, s.team.name), h('strong', {}, String(s.score)))),
        )
      : null,
    h(
      'ol',
      { class: 'c-standings players' },
      players.map((p) => h('li', {}, h('span', {}, avatar(p), ' ', p.name), h('strong', {}, String(p.score)))),
    ),
  );
}

// ---------- Pestaña Jugadores

/** Portavoces de los equipos (para las secciones por turnos). */
function spokespeopleCard() {
  if (!view.teams.length) return null;
  const turns = view.turns;
  return h(
    'section',
    { class: 'c-card' },
    h('p', { class: 'c-kicker' }, '📣 Portavoces'),
    h('p', { class: 'muted small' }, 'En las secciones por turnos, el portavoz ordena a su equipo desde su móvil.'),
    view.teams.map((t) => {
      const members = view.players.filter((p) => p.teamId === t.id);
      const tt = turns?.teams.find((x) => x.team.id === t.id);
      return h(
        'div',
        {},
        h(
          'label',
          { class: 'c-counter-row' },
          h('span', {}, t.name),
          h(
            'select',
            { class: 'c-select', onchange: (e) => cmd('setSpokesperson', { teamId: t.id, playerId: e.target.value }) },
            members.map((m) => h('option', { value: m.id, selected: m.id === view.spokespeople?.[t.id] }, m.name)),
          ),
        ),
        tt ? h('p', { class: 'muted small' }, (tt.ready ? '✓ Orden: ' : 'Orden (aún sin elegir): ') + tt.order.filter(Boolean).map((p, i) => `${i + 1}. ${p.name}`).join(' · ')) : null,
      );
    }),
  );
}

function playersTab() {
  return [spokespeopleCard(), awaySummaryCard(), playersTabBody()];
}

/** Recuento de salidas de la app por concursante (quien más con pregunta, arriba). */
function awaySummaryCard() {
  const rows = view.awaySummary ?? [];
  return h(
    'section',
    { class: 'c-card' },
    h('p', { class: 'c-kicker' }, '👀 Salidas de la app'),
    rows.length
      ? [
          h(
            'table',
            { class: 'c-away-table' },
            h('thead', {}, h('tr', {}, h('th', {}, 'Quién'), h('th', {}, 'Veces'), h('th', {}, 'Con pregunta'), h('th', {}, 'Tiempo fuera'))),
            h(
              'tbody',
              {},
              rows.map((r) =>
                h(
                  'tr',
                  { class: r.inQuestion ? 'serious' : '' },
                  h('td', {}, r.name),
                  h('td', {}, String(r.count)),
                  h('td', {}, r.inQuestion ? `🚨 ${r.inQuestion}` : '—'),
                  h('td', {}, formatAway(r.totalMs)),
                ),
              ),
            ),
          ),
          h('p', { class: 'muted small' }, 'Cuenta cada vez que alguien minimiza, cambia de app o de pestaña, en cualquier momento. «Con pregunta»: tenía una pregunta en juego.'),
          btn('Borrar recuento', () => confirm('¿Borrar el recuento de salidas?') && cmd('awayReset')),
        ]
      : h('p', { class: 'muted small' }, 'Nadie ha salido de la app todavía. Si alguien lo hace, te aviso aquí arriba al momento.'),
  );
}

function playersTabBody() {
  const groups = view.teams.length
    ? [...view.teams.map((t) => ({ team: t, members: view.players.filter((p) => p.teamId === t.id) })), { team: null, members: view.players.filter((p) => !p.teamId) }]
    : [{ team: null, members: view.players }];
  return [
    view.teams.length
      ? h(
          'section',
          { class: 'c-card' },
          h('p', { class: 'c-kicker' }, 'Equipos'),
          view.standings.map((s) =>
            h(
              'div',
              { class: 'c-player', style: { '--tc': getColor(s.team.color).bg } },
              h('span', { class: 'c-team-dot' }),
              h('span', { class: 'c-pname' }, s.team.name),
              h('strong', { class: 'c-score' }, String(s.score)),
              btn('−', () => cmd('adjustTeamBonus', { teamId: s.team.id, delta: -1 }), 'round'),
              btn('+', () => cmd('adjustTeamBonus', { teamId: s.team.id, delta: 1 }), 'round'),
            ),
          ),
          h('p', { class: 'muted small' }, '± aquí da o quita puntos al equipo entero.'),
          btn(view.teamsLocked ? '🔒 Equipos cerrados (abrir)' : '🔓 Equipos abiertos (cerrar)', () => cmd('lockTeams', { locked: !view.teamsLocked })),
        )
      : null,
    ...groups
      .filter((g) => g.members.length)
      .map(({ team, members }) =>
        h(
          'section',
          { class: 'c-card' },
          h('p', { class: 'c-kicker' }, team ? team.name : view.teams.length ? 'Sin equipo' : 'Jugadores'),
          members.map((p) =>
            h(
              'div',
              { class: `c-player ${p.connected ? '' : 'offline'}` },
              avatar(p),
              h('span', { class: 'c-pname' }, p.name, p.lock ? h('small', {}, ' · bloqueado') : null, p.away ? h('small', {}, ' · 👀 fuera') : null),
              h('strong', { class: 'c-score' }, String(p.score)),
              btn('−', () => cmd('adjustScore', { playerId: p.id, delta: -1 }), 'round'),
              btn('+', () => cmd('adjustScore', { playerId: p.id, delta: 1 }), 'round'),
              view.teams.length
                ? h(
                    'select',
                    { class: 'c-select', 'aria-label': `Equipo de ${p.name}`, onchange: (e) => cmd('moveTeam', { playerId: p.id, teamId: e.target.value }) },
                    p.teamId ? null : h('option', { value: '', selected: true }, '—'),
                    view.teams.map((t) => h('option', { value: t.id, selected: t.id === p.teamId }, t.name)),
                  )
                : null,
              btn('✕', () => confirm(`¿Quitar a ${p.name} de la sala? Perderá sus puntos.`) && cmd('removePlayer', { playerId: p.id }), 'round ghost'),
            ),
          ),
        ),
      ),
    view.players.length ? null : h('p', { class: 'muted center' }, 'Todavía no hay jugadores.'),
    btn('Poner todos los marcadores a 0', () => confirm('¿Poner todos los marcadores a 0 (también los de equipo)?') && cmd('resetScores'), 'danger'),
  ];
}

// ---------- Pestaña Secciones

function sectionsTab() {
  return [
    h(
      'section',
      { class: 'c-card' },
      h('p', { class: 'c-kicker' }, 'Ir a una sección'),
      h(
        'ol',
        { class: 'c-sections' },
        view.sections.map((s) =>
          h(
            'li',
            { class: s.index === view.sectionIndex && view.screen !== 'setup' ? 'current' : '' },
            h(
              'button',
              {
                onclick: () => {
                  if (view.screen === 'play' && !confirm(`¿Saltar a «${s.name}»? Se deja la pregunta actual.`)) return;
                  cmd('gotoSection', { index: s.index });
                  tab = 'game';
                },
              },
              h('span', { class: 'c-sec-name' }, `${s.index + 1}. ${s.name}`),
              h('small', {}, `${s.label}${s.items ? ` · ${s.items}` : ''}${s.playable ? '' : ' · próximamente'}${s.on ? '' : ' · no se juega esta noche'}`),
            ),
          ),
        ),
      ),
    ),
    soundCard(),
    view.paused
      ? null
      : btn('⏸ Parar el concurso por hoy', () => {
          if (!confirm('¿Parar por hoy? Queda guardado en el portátil tal cual: otro día, al abrir la tele, «Seguir el concurso».')) return;
          cmd('pause');
          tab = 'game';
        }),
    view.screen !== 'setup' ? btn('Volver a preparación', () => confirm('¿Volver a la pantalla de preparación?') && cmd('toSetup')) : null,
  ];
}

/** Concurso en pausa (para seguir otro día). */
function pausedPanel() {
  const connected = view.players.filter((p) => p.connected).length;
  return [
    h(
      'section',
      { class: 'c-card center' },
      h('p', { class: 'c-kicker' }, '⏸ En pausa'),
      h('h2', {}, 'Continuará…'),
      h('p', { class: 'muted' }, 'Todo queda guardado en el portátil de la tele. Otro día, al abrirla, sale «▶ Seguir el concurso».'),
      h('p', {}, `${connected} de ${view.players.length} conectados · sala ${view.code}`),
    ),
    h('button', { class: 'btn primary big', onclick: () => cmd('resume') }, '▶ Seguir el concurso'),
  ];
}

/** Sonido de la tele: música y efectos (se pueden quitar si pones tu propia música) y volumen. */
function soundCard() {
  const st = view.settings;
  const set = (patch) => cmd('updateSettings', patch);
  const vol = (d) => set({ volume: Math.min(100, Math.max(0, st.volume + d)) });
  return h(
    'section',
    { class: 'c-card' },
    h('p', { class: 'c-kicker' }, 'Sonido de la tele'),
    h(
      'div',
      { class: 'c-sound' },
      btn(st.musicOn ? '🎵 Música: sí' : '🎵 Música: no', () => set({ musicOn: !st.musicOn }), st.musicOn ? 'on' : ''),
      btn(st.sfxOn ? '🔊 Efectos: sí' : '🔇 Efectos: no', () => set({ sfxOn: !st.sfxOn }), st.sfxOn ? 'on' : ''),
    ),
    h('div', { class: 'c-sound' }, btn('−', () => vol(-10)), h('span', { class: 'c-volume' }, `Volumen ${st.volume} %`),btn('+', () => vol(10))),
  );
}

// ------------------------------------------------------------------ Utilidades

let toastTimer = null;
/** Aviso abajo; fuera del pintado (si no, el siguiente repintado lo borraba antes de poder leerlo). */
function toast(text) {
  let el = document.getElementById('c-toast');
  if (!el) {
    el = h('div', { id: 'c-toast', class: 'c-toast', hidden: true });
    document.body.append(el);
  }
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 3500);
}

function deviceName() {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua)) return 'iPad';
  if (/Android/.test(ua)) return 'Móvil Android';
  return 'Ordenador';
}

keepScreenAwake();
init();
