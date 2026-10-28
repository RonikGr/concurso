// Pantalla del portátil conectado a la tele: el espectáculo. También se puede manejar con teclado y ratón,
// aunque lo normal es hacerlo desde el mando del presentador (control.html).
import '@fontsource-variable/outfit';
import '@fontsource/creepster/latin.css';
import './host.css';
import './show.css';
import './squid.css';
import QRCode from 'qrcode';
import { $, clear, fill, h } from '../shared/dom.js';
import { avatarOf, getColor, setFaceImages } from '../shared/appearance.js';
import { generateRoomCode } from '../shared/roomCode.js';
import { LOCK, PHASE } from '../core/game.js';
import { SCREEN } from '../core/runner.js';
import { parseShowWorkbook } from '../core/show.js';
import { folderKey, songKey } from '../core/folder.js';
import { HostRoom } from './room.js';
import { adoptSavedRoom, clearSavedRoom, currentSavedRoom, loadSavedRoom, roomFromFile, roomToFile } from './persistence.js';
import { createStage } from './stage.js';
import { createAnswerStage } from './answerStage.js';
import { createFreeStage } from './freeStage.js';
import { createMillionaireStage } from './millionaireStage.js';
import { createWordsStage } from './wordsStage.js';
import { createShakeStage } from './shakeStage.js';
import { createSquidStage } from './squidStage.js';
import { createBetStage } from './betStage.js';
import { createHankyStage } from './hankyStage.js';
import { WPHASE } from '../core/words.js';
import { SPHASE } from '../core/shake.js';
import { BPHASE } from '../core/bet.js';
import { MPHASE } from '../core/millionaire.js';
import { APHASE } from '../core/answers.js';
import {
  coverScreen,
  finalScreen,
  introScreen,
  pausedDate,
  pausedScreen,
  pausedWhere,
  punishVoteScreen,
  rouletteScreen,
  scoreboardScreen,
  setupScreen,
  versusScreen,
} from './screens.js';
import { openSettingsDialog } from './settingsDialog.js';
import { createDebugPanel } from './debugPanel.js';
import { Backdrop } from './fx/backdrop.js';
import { setLite as setConfettiLite } from './fx/confetti.js';
import { sound } from './fx/audio.js';
import { TrackStore, videoSlot } from './fx/tracks.js';
import { FaceStore } from './faceStore.js';
import { openFacesDialog } from './facesDialog.js';
import { openMusicDialog } from './musicDialog.js';
import { openBotsDialog } from './botsDialog.js';
import { canRemember, chooseFolder, importFolder, rereadFolder, savedFolder } from './contestFolder.js';
import { createDirector, envFor, screenKey } from './fx/director.js';
import { enterScreen, kinetic, odometer } from './fx/motion.js';
import { DISCO_ENV, envGradient, HOME_ENV } from '../shared/environments.js';

// Marca de esta pestaña: si se recarga, se recupera la sala sin preguntar.
const TAB_KEY = 'concurso.host.tab';
const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]'];

const app = $('#app');
let room = null;
let stage = null;
let answerStage = null;
let freeStage = null;
let millionaireStage = null;
let wordsStage = null;
let shakeStage = null;
let squidStage = null;
let betStage = null;
let hankyStage = null;
let qrs = null; // {join, joinMini, control}
let lastScreenSignature = null;
const debug = createDebugPanel({
  imageInfo: () =>
    backdrop?.ok
      ? `Imagen: ${backdrop.fps ?? '…'} fps · fondo al ${Math.round(backdrop.scale * 100)} % (calidad ${backdrop.level + 1} de 5, ${backdrop.mode === 'auto' ? 'automática' : backdrop.mode === 'high' ? 'fija: la mejor' : 'fija: ligera'})`
      : 'Imagen: sin WebGL (fondo fijo)',
});
const cards = new Map(); // playerId → elementos de su tarjeta
let lastScreenKey = null;
let lastMomentKey = null;

// Fondo animado (WebGL) con el entorno de cada sección; sin WebGL, un degradado con los mismos colores.
const backdropCanvas = h('canvas', { class: 'backdrop', 'aria-hidden': 'true' });
document.body.prepend(backdropCanvas);
const backdrop = new Backdrop(backdropCanvas);
if (backdrop.ok) {
  backdrop.setEnv(HOME_ENV, { instant: true });
  backdrop.onLightning = () => sound.play('thunder', 250 + Math.random() * 900);
  // Calidad ligera: sin desenfoque en los cristales y menos confeti
  backdrop.onQuality = (q) => {
    document.body.classList.toggle('fx-lite', q.lite);
    setConfettiLite(q.lite);
  };
} else {
  backdropCanvas.remove();
}
const direct = createDirector({ backdrop: backdrop.ok ? backdrop : null });
sound.addEventListener('unlock', () => room && render());

// Tus canciones y las caras de los jugadores, guardadas en este portátil
const trackStore = new TrackStore();
trackStore.addEventListener('change', () => {
  sound.setTracks(trackStore.tracks);
  lastScreenSignature = null; // repintar el resumen de la preparación
  if (room) render();
});
trackStore.load();

const faceStore = new FaceStore();
faceStore.addEventListener('change', () => {
  setFaceImages(faceStore.images()); // la tele pinta todas
  room?.setFaces(faceStore.faces); // y reconoce a los jugadores por su nombre
  lastScreenSignature = null;
  for (const card of cards.values()) card.look = null; // repintar avatares de las tarjetas
  if (room) render();
});
faceStore.load();
// Para probar desde la consola (y para quien no puede oír: __fx.soundLog dice qué ha sonado y cuándo)
if (import.meta.env.DEV) sound.muted = localStorage.getItem('concurso.silencio') === '1';
if (import.meta.env.DEV) window.__fx = { backdrop, sound, trackStore, faceStore, get soundLog() { return sound.soundLog; } };

// Carpeta del concurso: la hoja, las canciones y las caras de una vez (contestFolder.js)
const folder = { handle: null, busy: false, report: null };
savedFolder().then((handle) => {
  folder.handle = handle;
  lastScreenSignature = null;
  if (room) render();
});

async function loadFolder(again) {
  if (folder.busy || !room) return;
  folder.busy = true;
  lastScreenSignature = null;
  render();
  try {
    const picked = again && folder.handle ? await rereadFolder(folder.handle) : await chooseFolder();
    if (!picked) return;
    if (canRemember) folder.handle = await savedFolder();
    folder.report = {
      name: picked.name,
      ...(await importFolder(picked, { trackStore, faceStore, importSheet: importFile, sections: () => room.view().sections.map((s) => s.name) })),
    };
  } catch (e) {
    console.error(e);
    toast('No se pudo leer la carpeta.');
  } finally {
    folder.busy = false;
    lastScreenSignature = null;
    render();
  }
}

let panel = null; // ventana de caras o de música abierta
const openPanel = (open) => {
  panel?.close();
  panel = open();
};

/** Ejecuta una orden y avisa si no se pudo. */
function run(action, args) {
  const res = room?.run(action, args);
  if (res && !res.ok) toast(res.error);
  return res;
}

const actions = {
  open: () => run('open'),
  correct: () => run('correct'),
  wrong: () => run('wrong'),
  nextItem: () => run('nextItem'),
  restart: () => run('restart'),
  showQuestion: () => run('showQuestion'),
  showAnswer: () => run('showAnswer'),
};

function boot() {
  // Solo en desarrollo: host.html?demo=squid&bots=8 monta una sala con la plantilla y concursantes de prueba y va
  // directa a la presentación de Squid Games (para probarlo sin preparar nada)
  const demo = import.meta.env.DEV ? new URLSearchParams(location.search).get('demo') : null;
  if (demo === 'squid') return squidDemo(Number(new URLSearchParams(location.search).get('bots') ?? 8));
  const saved = loadSavedRoom();
  if (saved && readTabMark() === saved.code) return startRoom(saved);
  if (saved && saved.players.length) return showRecover(saved);
  startRoom(null);
}

function showRecover(saved) {
  const n = saved.players.length;
  const minutes = Math.max(1, Math.round((Date.now() - saved.savedAt) / 60000));
  const when = saved.paused ? `en pausa desde ${pausedDate(saved.paused.at)}` : minutes < 90 ? `de hace ${minutes} min` : `del ${pausedDate(saved.savedAt).slice(3)}`;
  // Por dónde iba (las secciones que se juegan, como en la tele)
  const sections = saved.show?.sections ?? [];
  const skipped = new Set(saved.runner?.skipped ?? []);
  const played = sections.filter((x) => !skipped.has(x.id));
  const current = sections[saved.runner?.sectionIndex ?? 0];
  const where = pausedWhere({
    screen: saved.runner?.screen ?? 'setup',
    sectionNumber: Math.max(1, played.findIndex((x) => x.id === current?.id) + 1),
    sectionCount: played.length,
    sectionName: current?.name,
  });
  // Marcador: equipos (sus jugadores + puntos de equipo) o los tres primeros
  const teams = (saved.show?.teams ?? []).map((t) => ({
    name: t.name,
    score: saved.players.filter((p) => p.teamId === t.id).reduce((sum, p) => sum + p.score, 0) + (saved.teamBonus?.[t.id] ?? 0),
  }));
  const scores = (teams.length ? teams : [...saved.players].slice(0, 3)).sort((x, y) => y.score - x.score).map((x) => `${x.name} ${x.score}`);
  const startNew = () => {
    if (saved.paused && !confirm('El concurso en pausa se perderá (salvo que guardes antes una copia en archivo). ¿Empezar uno nuevo?')) return;
    newRoom();
  };
  clear(app).append(
    h(
      'main',
      { class: 'recover' },
      h('h1', {}, saved.show?.title ?? 'Concurso del año'),
      h(
        'p',
        { class: 'lead' },
        saved.paused ? '⏸ Hay un concurso ' : 'Hay una sala guardada ',
        h('strong', { class: 'code-inline' }, saved.code),
        ` con ${n} ${n === 1 ? 'jugador' : 'jugadores'}, ${when}.`,
      ),
      saved.runner?.screen && saved.runner.screen !== 'setup' ? h('p', {}, 'Íbamos por: ', h('strong', {}, where), scores.length ? ` · ${scores.join(' · ')}` : '') : null,
      h(
        'div',
        { class: 'actions' },
        h('button', { class: 'btn primary', autofocus: true, onclick: () => startRoom(saved) }, saved.paused ? '▶ Seguir el concurso' : 'Recuperar sala'),
        h('button', { class: 'btn', onclick: startNew }, saved.paused ? 'Empezar uno nuevo' : 'Sala nueva'),
        h('button', { class: 'btn', onclick: openSavedCopy }, '📂 Abrir una copia guardada'),
      ),
    ),
  );
}

async function squidDemo(bots) {
  clearSavedRoom();
  startRoom(null);
  const blob = await (await fetch('./plantilla-concurso.xlsx')).blob();
  await importFile(new File([blob], 'plantilla-concurso.xlsx'));
  const n = Math.max(0, Math.min(19, Number.isFinite(bots) ? bots : 8)); // hasta 20 con quien juegue desde su móvil
  if (n) run('botsAdd', { count: n });
  for (let i = 0; i < 3; i++) run('next'); // preparación → título → conexión → empezar
  run('gotoSection', { index: room.show.sections.findIndex((s) => s.type === 'squid') });
}

function newRoom() {
  room?.destroy();
  room = null;
  clearSavedRoom();
  startRoom(null);
}

function startRoom(saved) {
  const code = saved?.code ?? generateRoomCode();
  writeTabMark(code);
  room = new HostRoom({ code, saved });
  room.setFaces(faceStore.faces);
  if (import.meta.env.DEV) window.__room = room; // para probar desde la consola
  qrs = makeQrs();
  renderShell();
  room.addEventListener('change', render);
  room.start();
  render();
}

// ---------- Presentación ----------

// El título del concurso es un paso de la preparación (sala.setupStep = 'title'): se pinta encima de todo, con su
// canción. Si el sonido aún no está activado, el primer toque solo lo activa (para que se oiga la canción).
function syncSplash(view) {
  const want = view.screen === SCREEN.SETUP && view.setupStep === 'title';
  if (want && !splash) showSplash(view.title);
  else if (!want && splash) hideSplash();
  else if (splash) splash.querySelector('.splash-hint').textContent = splashHint();
}

const splashHint = () => (sound.unlocked ? 'Pulsa cualquier tecla o haz clic para continuar' : 'Pulsa para activar el sonido');
let splashReady = false; // ¿el siguiente toque ya pasa de pantalla?
sound.addEventListener('unlock', () => setTimeout(() => (splashReady = true), 400)); // el mismo toque no cuenta

function splashNext() {
  if (!splashReady) return; // este toque solo activa el sonido
  run('next');
}

// Al abrir la tele (no al recuperar un concurso a medias): el título en grande. Con una tecla o un clic se pasa a
// la pantalla de preparación, donde se van conectando los jugadores. Ese mismo toque desbloquea el sonido.
let splash = null;

function showSplash(title) {
  splashReady = sound.unlocked;
  splash = h(
    'div',
    { class: 'splash', role: 'button', tabindex: '0', 'aria-label': `${title}. Pulsa para continuar` },
    h('p', { class: 'splash-kicker' }, 'Esta noche…'),
    kinetic('h1', 'splash-title display', title, { step: 70 }),
    h('p', { class: 'splash-hint' }, splashHint()),
  );
  splash.addEventListener('click', splashNext);
  document.body.append(splash);
  document.body.classList.add('splash-on'); // debajo solo se ve el decorado
}

function hideSplash() {
  if (!splash) return;
  const el = splash;
  splash = null;
  sound.play('whoosh');
  backdrop.ok && backdrop.flash(0.5);
  el.classList.add('leaving');
  document.body.classList.remove('splash-on');
  setTimeout(() => el.remove(), 900);
}

function makeQrs() {
  const joinUrl = playerUrl(room.code);
  const qr = (url, label) => {
    const el = h('div', { class: 'qr', role: 'img', 'aria-label': label });
    QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' })
      .then((svg) => (el.innerHTML = svg))
      .catch(() => el.append('No se pudo generar el QR'));
    return el;
  };
  return {
    joinUrlText: joinUrl.host + joinUrl.pathname.replace(/\/$/, ''),
    join: qr(joinUrl.href, `QR para unirse a la sala ${room.code}`),
    joinMini: qr(joinUrl.href, `QR para unirse a la sala ${room.code}`),
    control: qr(room.controlUrl(location.href).href, 'QR del mando del presentador'),
  };
}

// ---------- Estructura fija ----------

function renderShell() {
  cards.clear();
  lastScreenSignature = null;
  stage = createStage();
  answerStage = createAnswerStage();
  freeStage = createFreeStage();
  millionaireStage = createMillionaireStage();
  wordsStage = createWordsStage();
  shakeStage = createShakeStage();
  squidStage = createSquidStage();
  betStage = createBetStage();
  hankyStage = createHankyStage();

  clear(app).append(
    h(
      'div',
      { class: 'host-shell' },
      h(
        'header',
        { class: 'topbar' },
        h('h1', { id: 'show-title' }),
        h('button', { class: 'sound-chip', id: 'sound-chip', onclick: () => sound.unlock() }, '🔊 Activar sonido'),
        h('div', { class: 'join-chip', id: 'join-chip' }, qrs.joinMini, h('span', {}, h('small', {}, 'Únete · '), h('strong', { id: 'chip-code' }, room.code))),
        h('span', { class: 'net-pill', id: 'net-pill' }),
      ),
      h('div', { class: 'banners', id: 'banners' }),
      h('main', { class: 'screen-area', id: 'screen' }),
      h(
        'section',
        { class: 'players-panel', id: 'players-panel', 'aria-label': 'Jugadores' },
        h('ul', { class: 'player-grid', id: 'player-grid' }),
      ),
      h(
        'footer',
        { class: 'toolbar' },
        h('span', { class: 'hint' }, 'Espacio · ← → · P pregunta · V respuesta · A acierto · F fallo · R reiniciar · M marcador · D depuración'),
        h('button', { class: 'btn', onclick: () => openPanel(() => openBotsDialog({ room, run })) }, '🤖 Pruebas'),
        h('button', { class: 'btn', onclick: () => debug.toggle(room) }, 'Depuración'),
        h('button', { class: 'btn', onclick: () => openSettingsDialog(room) }, 'Ajustes'),
        h('button', { class: 'btn', onclick: toggleFullscreen }, 'Pantalla completa'),
        h('button', { class: 'btn', onclick: confirmPause }, '⏸ Parar por hoy'),
        h('button', { class: 'btn', onclick: saveCopy }, '💾 Copia en archivo'),
        h('button', { class: 'btn', onclick: confirmResetScores }, 'Marcadores a 0'),
        h('button', { class: 'btn danger', onclick: confirmNewRoom }, 'Cerrar sala y crear otra'),
      ),
    ),
    stage.overlay,
    debug.root,
    h('div', { class: 'approve-overlay', id: 'approve', hidden: true }),
    h('div', { class: 'host-toast', id: 'toast', role: 'status', hidden: true }),
  );
}

// ---------- Partes que cambian ----------

/**
 * Vídeo de la sección (carpeta Vídeos/, p. ej. el esqueleto del twerking): dos bailarines, uno a cada lado de la tele y
 * en bucle, sin sonido. Con fondo negro, el negro desaparece (mix-blend-mode: screen) y se ve el decorado detrás.
 */
let sectionVideo = { url: null, el: null };
function syncSectionVideo(section) {
  const url = section ? (trackStore.tracks.get(videoSlot(folderKey(section.name)))?.[0]?.url ?? null) : null;
  if (url === sectionVideo.url) return;
  sectionVideo.el?.remove();
  sectionVideo = { url, el: null };
  if (!url) return;
  const clip = (side) => h('video', { class: `section-video ${side}`, src: url, autoplay: true, loop: true, muted: true, playsinline: true, 'aria-hidden': 'true' });
  sectionVideo.el = h('div', { class: 'section-videos' }, clip('left'), clip('right'));
  document.body.append(sectionVideo.el);
  for (const v of sectionVideo.el.querySelectorAll('video')) {
    v.muted = true; // (el atributo no basta para que el navegador deje empezar solo)
    v.play().catch(() => {});
  }
}

function render() {
  if (!room) return;
  const view = room.view();
  $('#show-title').textContent = view.title;
  $('#join-chip').hidden = view.screen === SCREEN.SETUP;
  // Durante el espectáculo la tele no enseña controles (ver CSS .show-mode); en preparación, sí.
  document.body.classList.toggle('show-mode', view.screen !== SCREEN.SETUP);
  // Squid Games ocupa toda la tele (sus juegos y su presentación)
  const squidIntro = view.screen === SCREEN.INTRO && view.section?.type === 'squid';
  document.body.classList.toggle('squid-on', (!!view.squid || squidIntro) && !view.paused && !view.peekScoreboard);
  // Discoteca (el twerking): focos que barren la tele; y el vídeo de la sección, si la carpeta trae uno
  const inSection = [SCREEN.INTRO, SCREEN.PLAY].includes(view.screen) && !view.paused && !view.peekScoreboard;
  document.body.classList.toggle('disco-on', inSection && envFor(view) === DISCO_ENV);
  syncSectionVideo(inSection ? view.section : null);
  // El navegador no deja sonar nada hasta que se toca la página: aviso hasta la primera tecla o clic.
  $('#sound-chip').hidden = sound.unlocked || !(view.settings.musicOn || view.settings.sfxOn);
  sound.configure({ musicOn: view.settings.musicOn, sfxOn: view.settings.sfxOn, volume: view.settings.volume });
  if (backdrop.ok) backdrop.setMode(view.settings.quality);
  else document.body.classList.add('fx-lite');
  if (!backdrop.ok) document.body.style.backgroundImage = envGradient(envFor(view));
  // El realizador (sonido, entorno, confeti) es adorno: si falla, la pantalla tiene que pintarse igual.
  try {
    direct(view);
  } catch (e) {
    console.error('Realizador:', e);
  }
  renderNetwork(view);
  renderScreen(view);
  renderPlayers(view);
  renderApproval(view);
  syncSplash(view);
  renderCheatAlert(view);
  debug.render(room);
}

const NET_LABEL = {
  connecting: 'Conectando…',
  ready: 'Sala abierta',
  'id-busy': 'Recuperando sala…',
  'signaling-lost': 'Sin servidor de enlace',
  fatal: 'Error',
};

function renderNetwork() {
  const { state, message } = room.network;
  const pill = $('#net-pill');
  pill.dataset.state = state;
  pill.textContent = `Sala ${room.code} · ${NET_LABEL[state] ?? state}`;

  const banners = [];
  // Móviles que no consiguen conectar (en el último minuto): casi siempre es la wifi
  const fails = room.connectFailures;
  if (fails && Date.now() - fails.at < 60_000) {
    banners.push(
      h(
        'div',
        { class: 'banner' },
        `📶 Un móvil intenta entrar, pero la wifi no le deja conectar con la tele (${fails.count} ${fails.count === 1 ? 'vez' : 'veces'}). `,
        'Comprobad que todos estáis en la misma wifi que el portátil (no la de invitados), sin datos móviles ni VPN.',
      ),
    );
    clearTimeout(renderNetwork.timer);
    renderNetwork.timer = setTimeout(() => room && renderNetwork(), 60_500 - (Date.now() - fails.at)); // quitar el aviso
  }
  if (LOCAL_HOSTS.includes(location.hostname) && room.runner.screen === SCREEN.SETUP) {
    banners.push(
      h(
        'div',
        { class: 'banner' },
        'Estás usando "localhost": los móviles no podrán abrir el QR. Abre esta página con la dirección "Network" que muestra Vite (https://192.168.…:5173/host.html).',
      ),
    );
  }
  if (state === 'fatal') {
    banners.push(h('div', { class: 'banner error' }, h('span', {}, message), h('button', { class: 'btn', onclick: newRoom }, 'Sala nueva')));
  } else if (message) {
    banners.push(h('div', { class: 'banner' }, message));
  }
  $('#banners').replaceChildren(...banners);
}

/**
 * Repinta la pantalla solo si cambió algo visible (no con cada latido): así las animaciones de entrada
 * no se repiten y no se pierde el foco.
 */
function renderScreen(view) {
  const t = performance.now();
  const visible = {
    ...view,
    // En el marcador y el final no se ve quién está conectado: que una desconexión no repita sus animaciones.
    players: view.players.map(({ rtt, connected, ...p }) => (view.screen === SCREEN.FINAL || view.screen === SCREEN.SCOREBOARD || view.peekScoreboard ? p : { ...p, connected })),
    settings: null,
    // Lo que «falta» de un reloj cambia en cada vista: la pantalla ya lo calcula con su hora, no hay que repintar por ello
    words: view.words && { ...view.words, endsInMs: null },
    shake: view.shake && { ...view.shake, opensInMs: null, endsInMs: null },
    squid: view.squid && { ...view.squid, now: null, g: view.squid.g && { ...view.squid.g, turnEndsInMs: null } },
    punish: view.punish && { ...view.punish, spin: view.punish.spin && { ...view.punish.spin, ago: null } },
    // La apertura programada no cambia ningún dato: hay que repintar igualmente cuando llega.
    started: [
      view.game && t >= view.game.tOpen,
      view.answer && view.answer.tOpen != null && t >= view.answer.tOpen,
      view.answer && view.answer.tGreen != null && t >= view.answer.tGreen, // Reflejos: rojo → verde
    ],
  };
  const signature = JSON.stringify(visible);
  if (signature === lastScreenSignature) return;
  lastScreenSignature = signature;

  // Antes de pintar, se limpia todo lo de la pantalla anterior (el ganador a pantalla completa del pulsador,
  // relojes y cuentas atrás): la pantalla que toque ahora vuelve a poner lo suyo. Si no, al saltar de sección
  // se quedaba encima el ganador de la pregunta anterior.
  stage.stop();
  answerStage.stop();
  freeStage.stop();
  millionaireStage.stop();
  wordsStage.stop();
  betStage.stop();
  hankyStage.stop();
  if (!view.shake) shakeStage.stop(); // la carrera se repinta cada 300 ms: solo se reinicia al salir de ella
  if (!view.squid || view.paused || view.peekScoreboard) squidStage.stop(); // igual: Squid Games actualiza su escena en su sitio
  // Los sonidos programados (suspense, podio) se anulan al cambiar de momento, no en cada repintado.
  const momentKey = [screenKey(view), view.answer?.roundId, view.answer?.phase, view.game?.phase, view.free?.phase].join('|');
  if (momentKey !== lastMomentKey) sound.cancel();
  lastMomentKey = momentKey;

  const screen = $('#screen');
  // Al cambiar de pantalla (no en cada cambio dentro de ella), entrada con transición.
  const key = screenKey(view);
  // (Squid Games no: su pantalla va fija a toda la tele y el desenfoque de entrada la dejaba un momento en negro)
  const squidScreen = view.squid || (view.screen === SCREEN.INTRO && view.section?.type === 'squid');
  if (key !== lastScreenKey && lastScreenKey != null && !squidScreen) enterScreen(screen);
  lastScreenKey = key;
  screen.dataset.screen = view.peekScoreboard ? 'scoreboard' : view.screen;
  if (view.peekScoreboard) return fill(screen, scoreboardScreen(view));
  if (view.paused) {
    screen.dataset.screen = 'paused';
    return fill(screen, pausedScreen(view, { joinQr: qrs.join, joinUrlText: qrs.joinUrlText, onResume: () => run('resume'), onSaveCopy: saveCopy }));
  }

  switch (view.screen) {
    case SCREEN.SETUP:
      return fill(
        screen,
        setupScreen(view, {
          joinQr: qrs.join,
          controlQr: qrs.control,
          joinUrlText: qrs.joinUrlText,
          onFile: importFile,
          onOpenSaved: openSavedCopy,
          onStart: () => run('next'),
          onLockTeams: (locked) => run('lockTeams', { locked }),
          onMoveTeam: (playerId, teamId) => run('moveTeam', { playerId, teamId }),
          onSpokesperson: (teamId, playerId) => run('setSpokesperson', { teamId, playerId }),
          onToggleSection: (id, on) => run('toggleSection', { id, on }),
          folder: { name: folder.handle?.name ?? null, busy: folder.busy, report: folder.report, onChoose: () => loadFolder(false), onReread: () => loadFolder(true) },
          millionaireCount: [...trackStore.tracks.keys()].filter((k) => k.startsWith('mill:')).length,
          facesCount: faceStore.faces.length,
          tracksCount: [...trackStore.tracks].reduce((n, [k, list]) => n + (/^(mill|song|video):/.test(k) ? 0 : list.length), 0),
          songs: songsStatus(),
          onOpenFaces: () => openPanel(() => openFacesDialog({ store: faceStore, players: () => room.view().players, toast })),
          onOpenMusic: () =>
            openPanel(() =>
              openMusicDialog({ store: trackStore, sections: () => room.view().sections.map(({ name, label }) => ({ name, label })), toast }),
            ),
        }),
      );
    case SCREEN.COVER:
      return fill(screen, view.versus ? versusScreen(view) : view.punish?.step === 'vote' ? punishVoteScreen(view) : coverScreen(view));
    case SCREEN.INTRO:
      return fill(screen, introScreen(view));
    case SCREEN.PLAY:
      for (const [data, st] of [
        [view.words, wordsStage],
        [view.shake, shakeStage],
        [view.bet, betStage],
        [view.squid, squidStage],
        [view.hanky, hankyStage],
      ]) {
        if (!data) continue;
        st.render(view);
        if (st.root.parentNode !== screen) fill(screen, st.root);
        return;
      }
      if (view.millionaire) {
        millionaireStage.render(view);
        if (millionaireStage.root.parentNode !== screen) fill(screen, millionaireStage.root);
        return;
      }
      if (view.free) {
        freeStage.render(view);
        if (freeStage.root.parentNode !== screen) fill(screen, freeStage.root);
        return;
      }
      if (view.answer) {
        answerStage.render(view);
        if (answerStage.root.parentNode !== screen) fill(screen, answerStage.root);
        return;
      }
      if (view.game) {
        stage.render(view);
        if (stage.root.parentNode !== screen) fill(screen, stage.root);
        return;
      }
      return fill(screen, introScreen(view));
    case SCREEN.SCOREBOARD:
      return fill(screen, scoreboardScreen(view, { title: `Marcador tras «${view.section?.name ?? ''}»` }));
    case SCREEN.FINAL:
      return fill(screen, view.punish?.step === 'roulette' ? rouletteScreen(view) : finalScreen(view));
  }
}

function renderPlayers(view) {
  const panel = $('#players-panel');
  panel.hidden = !(view.screen === SCREEN.PLAY && (view.game || view.answer) && !view.peekScoreboard);
  if (panel.hidden) return;

  // Puesto de cada uno en la ronda actual (mientras el turno está abierto o se ve el resultado).
  const game = view.game;
  const places = new Map(game && (game.phase === PHASE.OPEN || game.phase === PHASE.RESULT) ? game.ranking.map((r) => [r.playerId, r.place]) : []);
  // En las secciones de respuestas: quién ha respondido ya (sin decir qué).
  const answer = view.answer;
  const answering = answer && (answer.phase === APHASE.OPEN || answer.phase === APHASE.CLOSED);
  const answered = new Set(answering ? answer.answeredIds : []);
  const eligible = new Set(answering ? answer.eligibleIds : []);

  // Tarjetas con clave: no se recrean en cada latido, así no se pierde el foco ni el hover.
  const grid = $('#player-grid');
  // Con muchos jugadores, tarjetas más pequeñas para que quepan los 20 sin tapar la pregunta.
  const n = view.players.length;
  grid.dataset.density = n > 14 ? 'tiny' : n > 8 ? 'compact' : 'normal';
  const seen = new Set();
  for (const p of view.players) {
    seen.add(p.id);
    let card = cards.get(p.id);
    if (!card) {
      card = createCard();
      cards.set(p.id, card);
    }
    updateCard(card, p, places.get(p.id), answering && eligible.has(p.id) ? answered.has(p.id) : null);
    grid.append(card.root); // append mueve el nodo: mantiene el orden de llegada
  }
  for (const [id, card] of cards) {
    if (!seen.has(id)) {
      card.root.remove();
      cards.delete(id);
    }
  }
}

// Tarjetas de la tele: solo información. Puntos, desbloquear y quitar se hacen desde el mando.
function createCard() {
  const avatar = h('div', { class: 'avatar emoji', 'aria-hidden': 'true' });
  const name = h('div', { class: 'pc-name' });
  const meta = h('span', {});
  const place = h('span', { class: 'pc-place' });
  const score = h('span', { class: 'score', 'aria-live': 'polite' });
  // Rejilla: avatar | nombre (todo el ancho que necesite) | puntos
  //          avatar | estado                               |
  const root = h(
    'li',
    { class: 'player-card' },
    avatar,
    name,
    h('div', { class: 'pc-meta' }, h('span', { class: 'dot' }), meta),
    score,
    place,
  );
  return { root, avatar, name, meta, place, score, lastScore: null };
}

const LOCK_TEXT = { [LOCK.EARLY]: 'Bloqueado · pulsó antes', [LOCK.WRONG]: 'Bloqueado · falló', [LOCK.CHEAT]: '🚨 Bloqueado · salió de la app' };

/** @param hasAnswered true/false en una pregunta de respuestas abierta; null si no aplica */
function updateCard(card, p, place, hasAnswered = null) {
  const color = getColor(p.color);
  card.root.style.setProperty('--pc', color.bg);
  card.root.style.setProperty('--pc-fg', color.fg);
  card.root.classList.toggle('offline', !p.connected);
  card.root.classList.toggle('locked', !!p.lock);
  // Solo si cambia (con una foto, repintarla en cada latido haría parpadear la tarjeta)
  const look = `${p.face ?? ''}|${p.icon}`;
  if (card.look !== look) {
    card.look = look;
    card.avatar.replaceChildren(avatarOf(p));
  }
  card.name.textContent = p.presenter ? `🎤 ${p.name}` : p.name; // juega desde el mando del presentador
  let status = p.connected ? `Conectado${p.rtt != null ? ` · ${Math.round(p.rtt)} ms` : ''}` : 'Desconectado';
  if (p.lock) status = LOCK_TEXT[p.lock] + (p.connected ? '' : ' · desconectado');
  if (hasAnswered != null) status = hasAnswered ? '✓ Ha respondido' : 'Pensando…';
  // Antitrampas: fuera de la app ahora mismo, o anulado en esta pregunta por haber salido
  if (p.cheated) status = '🚨 Anulado · salió de la app';
  else if (p.away) status = '👀 Fuera de la app';
  if (p.benched) status = 'Presenta (no juega esta sección)';
  card.root.classList.toggle('away', !!p.away || !!p.cheated);
  card.root.classList.toggle('benched', !!p.benched);
  card.meta.textContent = status;
  card.root.classList.toggle('answered', hasAnswered === true);
  card.place.textContent = place ? `${place}º` : '';
  card.place.hidden = !place;
  // Los puntos ruedan como un cuentakilómetros; si suben, la tarjeta da un salto y sale el "+N".
  if (card.lastScore !== p.score) {
    const from = card.lastScore ?? p.score;
    card.score.replaceChildren(odometer(p.score, from, { duration: 1100 }));
    if (p.score > from) {
      card.root.classList.remove('bump');
      void card.root.offsetWidth; // reinicia la animación
      card.root.classList.add('bump');
      const gain = h('span', { class: 'pc-gain' }, `+${p.score - from}`);
      card.root.append(gain);
      setTimeout(() => gain.remove(), 1600);
    }
    card.lastScore = p.score;
  }
}

// Antitrampas: aviso grande unos segundos cuando alguien sale de la app con una pregunta abierta.
let lastCheatAlert = null; // id del último aviso enseñado (al cargar, los anteriores no se repiten)

function renderCheatAlert(view) {
  const alerts = view.cheatAlerts ?? [];
  const latest = alerts.at(-1);
  if (lastCheatAlert === null) {
    lastCheatAlert = latest?.id ?? 0;
    return;
  }
  if (!latest || latest.id <= lastCheatAlert) return;
  lastCheatAlert = latest.id;
  const secs = Math.round(latest.ms / 1000);
  const el = h(
    'div',
    { class: 'cheat-alert', role: 'alert' },
    h('span', { class: 'emoji' }, '🚨'),
    h('div', {}, h('strong', {}, `¡${latest.name} ha salido de la app!`), h('small', {}, `${secs} s fuera con la pregunta abierta${latest.voided ? ' · su respuesta no cuenta' : ''}`)),
  );
  document.body.append(el);
  sound.play('wrong');
  setTimeout(() => el.remove(), 7000);
}

/** Un móvil pide ser el mando: se confirma aquí (Enter) o se rechaza (Esc). */
function renderApproval(view) {
  const box = $('#approve');
  const pending = view.pendingControls[0];
  box.hidden = !pending;
  if (!pending) return;
  fill(
    box,
    h(
      'div',
      { class: 'approve-card', role: 'alertdialog', 'aria-label': 'Nuevo mando' },
      h('h2', {}, '¿Permitir este mando?'),
      h('p', {}, `«${pending.deviceName}» quiere ser el mando del presentador. Solo acéptalo si es tu móvil.`),
      h(
        'div',
        { class: 'stage-actions' },
        h('button', { class: 'btn primary huge', onclick: () => run('approveControl', { controlId: pending.id }) }, 'Permitir ', h('kbd', {}, 'Enter')),
        h('button', { class: 'btn huge', onclick: () => run('denyControl', { controlId: pending.id }) }, 'Rechazar ', h('kbd', {}, 'Esc')),
      ),
    ),
  );
}

/** Canciones que pide la hoja (pulsador y Libre) y cuáles no están en la carpeta. */
function songsStatus() {
  const names = new Map();
  for (const s of room.show.sections) for (const it of s.items) if (it.song) names.set(songKey(it.song), it.song);
  const missing = [...names].filter(([k]) => !trackStore.tracks.get(`song:${k}`)?.length).map(([, name]) => name);
  return { wanted: names.size, missing };
}

// ---------- Importar el concurso ----------

async function importFile(file) {
  if (!room) return;
  try {
    const { default: readXlsxFile } = await import('read-excel-file/browser');
    const sheets = await readXlsxFile(file);
    const { show, errors, warnings } = parseShowWorkbook(sheets);
    const report = { fileName: file.name, errors, warnings };
    if (errors.length) return room.reportImportFailure(report);
    const res = room.loadShow(show, report);
    if (res !== true) toast(res);
  } catch (e) {
    console.error(e);
    room.reportImportFailure({ fileName: file.name, errors: [{ sheet: 'Archivo', row: null, message: 'No se pudo leer: ¿es un .xlsx?' }], warnings: [] });
  }
}

addEventListener('dragover', (e) => {
  if (room?.runner.screen === SCREEN.SETUP && e.dataTransfer?.types.includes('Files')) e.preventDefault();
});
addEventListener('drop', (e) => {
  if (room?.runner.screen !== SCREEN.SETUP) return;
  if (document.querySelector('dialog[open]')) return e.preventDefault(); // en las ventanas de caras y música, no es un concurso
  const file = e.dataTransfer?.files?.[0];
  if (!file) return;
  e.preventDefault();
  importFile(file);
});

// ---------- Teclado ----------

document.addEventListener('keydown', (e) => {
  if (!room || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
  if (document.querySelector('dialog[open]') || e.target.closest?.('input, textarea, select')) return;

  const pending = room.view().pendingControls[0];
  if (pending && (e.key === 'Enter' || e.key === 'Escape')) {
    e.preventDefault();
    run(e.key === 'Enter' ? 'approveControl' : 'denyControl', { controlId: pending.id });
    return;
  }
  // En pausa: Espacio sigue el concurso; el resto de teclas, nada
  if (room.paused) {
    if (e.code === 'Space') {
      e.preventDefault();
      run('resume');
    }
    return;
  }
  if (splash) {
    e.preventDefault();
    if (e.code === 'ArrowLeft') return run('prev');
    return splashNext();
  }

  const screen = room.runner.screen;
  const phase = room.inBuzzerPlay ? room.game.phase : null;
  const answerPhase = room.inAnswerPlay ? room.answerRound.phase : null;
  switch (e.code) {
    case 'Space':
      e.preventDefault(); // que no "pulse" el botón con foco
      if (room.games.palabras.inPlay) {
        const p = room.games.palabras.round.phase;
        if (p === WPHASE.READY) run('wordsStart');
        else if (p === WPHASE.DONE) run('nextItem');
      } else if (room.games.agitar.inPlay) {
        const p = room.games.agitar.round.phase;
        if (p === SPHASE.READY) run('shakeStart');
        else if (p === SPHASE.DONE) run('nextItem');
      } else if (room.games.squid.inPlay) {
        // Squid Games: empezar el juego; acabado (o en la hucha), al siguiente. En marcha, nada (que no se corte sin querer).
        const sq = room.games.squid;
        if (sq.skipTo() != null) run('next'); // ya no queda gente para más juegos: a la hucha
        else if (sq.round?.phase === 'ready') run('squidStart');
        else if (!sq.round) run('next');
      } else if (room.games.panuelo.inPlay) {
        // El pañuelo: sortear el duelo → ¡ya! → (el ganador lo dice el mando) → siguiente; acabados, al marcador
        const d = room.games.panuelo.duels;
        if (d.finished) run('nextItem');
        else if (d.current?.step === 'called') run('hankyGo');
        else if (!d.busy) run('hankyDraw');
      } else if (room.games.apuesta.inPlay) {
        const p = room.games.apuesta.round.phase;
        run(p === BPHASE.BETTING ? 'betClose' : p === BPHASE.QUESTION ? 'betReveal' : 'nextItem');
      } else if (room.inMillionairePlay) {
        const m = room.millionaire;
        if (m.phase === MPHASE.REVEALED) run('nextItem');
        else if (m.phase === MPHASE.MARKED) run('mReveal');
        else if (m.shown < m.options.length) run('mShow');
        else run('mMark');
      } else if (answerPhase) {
        const next = { ready: 'openAnswers', open: 'closeAnswers', closed: 'reveal', revealed: 'nextItem' }[answerPhase];
        run(next);
      } else if (phase === PHASE.IDLE) actions.open();
      else if (phase === PHASE.RESULT || phase === PHASE.CLOSED) actions.nextItem();
      else if (phase == null && (screen !== SCREEN.FINAL || room.hasPunish)) run('next'); // en el final: la ruleta
      break;
    case 'ArrowRight':
      run('next');
      break;
    case 'ArrowLeft':
      run('prev');
      break;
    case 'KeyP':
      actions.showQuestion();
      break;
    case 'KeyV':
      actions.showAnswer();
      break;
    case 'KeyR':
      if (phase || answerPhase || room.inFreePlay || room.inMillionairePlay || Object.values(room.games).some((g) => g.inPlay)) actions.restart();
      break;
    case 'KeyA':
      if (phase === PHASE.RESULT) actions.correct();
      else if (room.games.palabras.inPlay) run('wordsOk');
      break;
    case 'KeyF':
      if (phase === PHASE.RESULT) actions.wrong();
      else if (room.games.palabras.inPlay) run('wordsFoul');
      break;
    case 'KeyM':
      run('scoreboard');
      break;
    case 'KeyD':
      debug.toggle(room);
      break;
  }
});

// ---------- Ratón durante el espectáculo ----------

// La barra de herramientas y el cursor aparecen solo si se mueve el ratón (como en un reproductor de vídeo).
let mouseTimer = null;
addEventListener('mousemove', () => {
  document.body.classList.add('mouse-active');
  clearTimeout(mouseTimer);
  mouseTimer = setTimeout(() => document.body.classList.remove('mouse-active'), 3000);
});

// ---------- Acciones ----------

function confirmResetScores() {
  if (confirm('¿Poner todos los marcadores a 0?')) run('resetScores');
}

function confirmPause() {
  if (confirm('¿Parar el concurso por hoy? Queda guardado tal cual en este portátil para seguir otro día (también desde el mando). Los móviles verán «En pausa».')) run('pause');
}

/** Descarga una copia de la partida (para seguirla en otro ordenador o por si se borra este navegador). */
function saveCopy() {
  const saved = currentSavedRoom();
  if (!saved) return toast('Aún no hay nada guardado.');
  const day = new Date().toISOString().slice(0, 10);
  const a = h('a', { href: URL.createObjectURL(roomToFile(saved)), download: `concurso-${saved.code}-${day}.json` });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  toast('Copia descargada: con «📂 Seguir un concurso guardado» se abre en cualquier ordenador.');
}

/** Abre una copia guardada (archivo .json de «Copia en archivo»): la tele sigue esa partida. */
function openSavedCopy() {
  const input = h('input', { type: 'file', accept: '.json,application/json' });
  input.addEventListener('change', async () => {
    const file = input.files[0];
    if (!file) return;
    const saved = roomFromFile(await file.text());
    if (!saved) return toast('Ese archivo no es una copia de un concurso.');
    const what = `«${saved.show?.title ?? 'Concurso'}» (sala ${saved.code}, ${saved.players.length} jugadores)`;
    if (room && room.runner.screen !== SCREEN.SETUP && !confirm(`¿Abrir ${what}? El concurso de ahora se cerrará.`)) return;
    room?.destroy();
    room = null;
    adoptSavedRoom(saved);
    startRoom(saved);
  });
  input.click();
}

function confirmNewRoom() {
  if (confirm('¿Cerrar esta sala y crear otra? Los jugadores tendrán que volver a entrar y el mando, emparejarse de nuevo.')) newRoom();
}

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen?.().catch(() => {});
}

let toastTimer = null;
function toast(text) {
  const el = $('#toast');
  if (!el || !text) return;
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 4000);
}

// ---------- Utilidades ----------

function playerUrl(code) {
  // index.html está junto a host.html, también en GitHub Pages bajo /<repo>/.
  const url = new URL('./', location.href);
  url.search = `?sala=${code}`;
  return url;
}

function readTabMark() {
  try {
    return sessionStorage.getItem(TAB_KEY);
  } catch {
    return null;
  }
}

function writeTabMark(code) {
  try {
    sessionStorage.setItem(TAB_KEY, code);
  } catch {
    // sin sessionStorage solo se pierde la recuperación automática
  }
}

// Liberar el ID de la sala en el servidor cuanto antes para que la recarga lo recupere rápido.
addEventListener('pagehide', () => room?.destroy());
// Si el navegador restaura la página desde su caché (atrás/adelante), la sala ya está cerrada: recargar.
addEventListener('pageshow', (e) => {
  if (e.persisted) location.reload();
});

boot();
