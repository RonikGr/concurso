// Pantalla del jugador (móvil).
import '@fontsource-variable/outfit';
import '@fontsource/creepster/latin.css';
import './player.css';
import '../shared/phone.css';
import { $, fill, h } from '../shared/dom.js';
import { COLORS, ICONS, avatarOf, getColor, setFaceImages } from '../shared/appearance.js';
import { isValidRoomCode, normalizeRoomCode } from '../shared/roomCode.js';
import { ERROR_CODE, MSG, PROTOCOL_VERSION } from '../shared/protocol.js';
import { loadJSON, newId, saveJSON } from '../shared/storage.js';
import { formatDeltaSeconds, formatSeconds } from '../shared/format.js';
import { PlayerConnection, connectionHelp } from './network.js';
import { createProfilePicker } from './profilePicker.js';
import { SyncClient } from './syncClient.js';
import { createAnswerPad } from './answerPad.js';
import { createMillionairePad } from './millionairePad.js';
import { createGamesPad } from './gamesPad.js';
import { createSquidPad } from './squidPad.js';
import { envGradient, HOME_ENV } from '../shared/environments.js';
import { keepScreenAwake } from '../shared/wakeLock.js';

// `?perfil=2` usa otra identidad: para probar varios jugadores en pestañas del mismo navegador.
const profileSlot = new URLSearchParams(location.search).get('perfil');
const PROFILE_KEY = 'concurso.player.v1' + (profileSlot ? `.${profileSlot.slice(0, 16)}` : '');
// `?mando=1`: esta página va dentro del mando del presentador (pestaña «Jugar»): la tele sabe que juega el presentador
const inRemote = new URLSearchParams(location.search).get('mando') === '1';
if (inRemote) document.body.classList.add('in-remote');
// sessionStorage: sala en la que está esta pestaña, para volver a entrar sola si se recarga.
const SESSION_KEY = 'concurso.player.session';

const profile = loadProfile();
let connection = null;
let roomCode = null;
let me = null; // lo que el presentador dice de mí (nombre final, color, icono, puntos)
let lastState = null; // último mensaje `state`
let stateReceivedAt = 0; // performance.now() al recibirlo (para la apertura programada)
let pressedEpoch = null; // época en la que ya pulsé
let buzzSeq = 0;
let goTimer = null;
let lastShownStatus = null;
let teamRequested = false; // se ha elegido equipo y se espera la confirmación del presentador
const lastResultRound = new Set(); // rondas cuyo resultado ya hizo vibrar el móvil

const sync = new SyncClient({ send: (msg) => connection?.send(msg) ?? false });
// Al volver a primer plano el reloj puede haberse parado (iOS lo hace con la pantalla bloqueada): resincronizar.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && connection?.connected) sync.burst();
});

// Secciones de respuestas: el botón grande se cambia por las opciones.
const ackKinds = new Map(); // seq → 'answer' | 'joker'
const pad = createAnswerPad({
  onAnswer: (roundId, value, tLocal) => {
    const clock = sync.estimate();
    const seq = ++buzzSeq;
    ackKinds.set(seq, 'answer');
    connection?.send({ t: MSG.ANSWER, seq, roundId, value, tLocal: tLocal ?? performance.now(), offset: clock?.offset, err: clock?.err });
    vibrate(30);
  },
  onJoker: (roundId, kind) => {
    const seq = ++buzzSeq;
    ackKinds.set(seq, 'joker');
    connection?.send({ t: MSG.JOKER, seq, roundId, kind });
  },
  toLocal: (tHost) => (tHost == null ? null : sync.toLocal(tHost)),
});
$('#screen-game').append(pad.root);

// Millonario (secciones de Test): concursante, público, amigo de la llamada o espectador
const millPad = createMillionairePad({
  onAnswer: (roundId, value) => {
    const seq = ++buzzSeq;
    ackKinds.set(seq, 'answer');
    connection?.send({ t: MSG.ANSWER, seq, roundId, value });
  },
  onJoker: (roundId, kind, target) => {
    const seq = ++buzzSeq;
    ackKinds.set(seq, 'joker');
    connection?.send({ t: MSG.JOKER, seq, roundId, kind, target });
  },
});
$('#screen-game').append(millPad.root);

// Juegos nuevos (Palabras secretas, Agita el móvil, La gran apuesta) y el voto y la ruleta de castigos
const gamesPad = createGamesPad({
  send: (game, roundId, action, value = null) => {
    const seq = ++buzzSeq;
    ackKinds.set(seq, 'play');
    connection?.send({ t: MSG.PLAY, seq, game, roundId, action, value });
  },
  vibrate: (p) => vibrate(p),
});
$('#screen-game').append(gamesPad.root);

// Squid Games: cada juego con su pantalla (con la hora de la tele para las luces y los relojes)
const squidPad = createSquidPad({
  send: (action, roundId, value = null) => {
    const seq = ++buzzSeq;
    ackKinds.set(seq, 'play');
    connection?.send({ t: MSG.PLAY, seq, game: 'squid', roundId, action, value });
  },
  toLocal: (tHost) => sync.toLocal(tHost),
  toHost: (tLocal) => {
    const e = sync.estimate();
    return e ? tLocal + e.offset : null;
  },
  vibrate: (p) => vibrate(p),
});
$('#screen-game').append(squidPad.root);

const ANSWER_REJECTED = {
  cheat: '🚨 Saliste de la app con la pregunta abierta: tu respuesta no cuenta.',
  late: 'Se acabó el tiempo: tu respuesta llegó tarde.',
  closed: 'La pregunta ya está cerrada.',
  'not-eligible': 'Esta pregunta no es para ti.',
  invalid: 'Respuesta no válida.',
  early: '¡Aún no ha empezado el reloj! Espera a que corra.',
};

const joinPicker = createProfilePicker(profile);
const editPicker = createProfilePicker(profile);
const lookPicker = createProfilePicker(profile);
// Al entrar, solo el nombre: si hay foto con ese nombre, juegas con tu cara; si no, luego se elige icono y color.
joinPicker.showLook(false);
lookPicker.showName(false);
$('#join-picker').append(joinPicker.root);
$('#edit-picker').append(editPicker.root);
$('#look-picker').append(lookPicker.root);

function init() {
  const fromUrl = normalizeRoomCode(new URLSearchParams(location.search).get('sala'));
  $('#code').value = isValidRoomCode(fromUrl) ? fromUrl : '';

  if (isValidRoomCode(fromUrl) && readSession() === fromUrl && profile.name) {
    join(fromUrl);
  } else {
    showJoin();
  }
}

// ---------- Pantallas ----------

function show(id) {
  for (const s of document.querySelectorAll('.screen')) s.hidden = s.id !== id;
}

// ---------- Bienvenida ----------

// Al entrar en una sala (ya con equipo, cara o icono y color): «¡Hola, Rodri!» con su foto o su icono en grande. Unos
// segundos (o un toque en «¡Vamos!») y al juego. Una vez por sala.
const WELCOME_MS = 4500;
let welcomedRoom = null;
let welcomeTimer = 0;

function showWelcome(state) {
  welcomedRoom = state.room;
  const color = getColor(me.color);
  const avatar = $('#welcome-avatar');
  avatar.style.setProperty('--wc', color.bg);
  avatar.classList.toggle('has-face', !!me.face);
  avatar.replaceChildren(avatarOf(me));
  $('#welcome-name').textContent = `¡Hola, ${me.name}!`;
  const team = state.teams?.find((t) => t.id === me.teamId);
  $('#welcome-sub').textContent = [
    'Ya estás en el concurso',
    team ? `con ${team.name}` : null,
    me.face ? '· juegas con tu foto' : null,
  ]
    .filter(Boolean)
    .join(' ');
  show('screen-welcome');
  vibrate([40, 40, 40]);
  clearTimeout(welcomeTimer);
  welcomeTimer = setTimeout(endWelcome, WELCOME_MS);
}

function endWelcome() {
  clearTimeout(welcomeTimer);
  welcomeTimer = 0;
  if (!$('#screen-welcome').hidden) show('screen-game');
}

$('#welcome-go').addEventListener('click', endWelcome);

function showJoin(error = '') {
  show('screen-join');
  $('#join-error').textContent = error;
  if (!$('#code').value) $('#code').focus();
  else if (!joinPicker.value.name) joinPicker.focusName();
}

function showMessage(title, text, actionLabel = 'Volver', action = () => showJoin()) {
  show('screen-message');
  $('#message-title').textContent = title;
  $('#message-text').textContent = text;
  const btn = $('#message-action');
  btn.textContent = actionLabel;
  btn.onclick = action;
}

$('#join-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const code = normalizeRoomCode($('#code').value);
  if (!isValidRoomCode(code)) return showJoin('El código tiene 4 caracteres, como aparece en la tele.');
  const value = joinPicker.value;
  if (!value.name.trim()) {
    $('#join-error').textContent = 'Escribe tu nombre.';
    return joinPicker.focusName();
  }
  Object.assign(profile, value);
  saveProfile();
  join(code);
});

$('#code').addEventListener('input', (e) => {
  e.target.value = normalizeRoomCode(e.target.value);
});

$('#connecting-cancel').addEventListener('click', leave);

// ---------- Conexión ----------

function join(code) {
  connection?.stop();
  roomCode = code;
  writeSession(code);
  history.replaceState(null, '', `?sala=${code}${profileSlot ? `&perfil=${encodeURIComponent(profileSlot)}` : ''}${inRemote ? '&mando=1' : ''}`);
  $('#connecting-text').textContent = `Conectando con la sala ${code}…`;
  $('#connecting-help').hidden = true;
  show('screen-connecting');

  connection = new PlayerConnection({
    roomCode: code,
    onOpen: () => {
      connection.send({
        t: MSG.HELLO,
        v: PROTOCOL_VERSION,
        playerId: profile.playerId,
        name: profile.name,
        color: profile.color,
        icon: profile.icon,
        teamId: profile.teamId ?? null,
        presenter: inRemote,
      });
      sync.start(); // después del hello: el presentador ignora todo lo anterior
      sendBack(); // si volvió a la app mientras no había conexión
    },
    onMessage: handleMessage,
    onStatus: handleStatus,
  });
  connection.start();
}

function leave() {
  sync.stop();
  connection?.stop();
  connection = null;
  me = null;
  lastState = null;
  writeSession(null);
  showJoin();
}

function handleStatus({ state, message, detail }) {
  const banner = $('#net-banner');
  const help = connectionHelp(detail);
  $('#connecting-help').hidden = !help;
  $('#connecting-help').textContent = help ?? '';
  switch (state) {
    case 'connected':
      banner.hidden = true;
      break;
    case 'reconnecting':
    case 'server-down':
      if (me) {
        banner.hidden = false;
        banner.textContent = state === 'server-down' ? message : 'Reconectando…';
      } else {
        $('#connecting-text').textContent = state === 'server-down' ? message : `Conectando con la sala ${roomCode}…`;
      }
      break;
    case 'not-found':
      sync.stop();
      writeSession(null);
      showJoin(`No encuentro la sala ${roomCode}. Revisa el código y que el presentador tenga la sala abierta.`);
      break;
    case 'fatal':
      showMessage('No se puede jugar en este navegador', message);
      break;
  }
  if (state !== 'connected') sync.stop(); // al reconectar, onOpen la vuelve a arrancar desde cero
  document.body.classList.toggle('offline', state !== 'connected');
}

function handleMessage(msg, tRecv) {
  switch (msg.t) {
    case MSG.SYNC_REPLY:
      sync.handleReply(msg, tRecv);
      break;
    case MSG.WELCOME: {
      const firstTime = !me;
      me = msg.you;
      // Guardar lo que asignó el presentador (color/icono); el nombre se guarda tal como lo escribió la persona.
      profile.color = me.color;
      profile.icon = me.icon;
      if (me.teamId) profile.teamId = me.teamId;
      teamRequested = false;
      saveProfile();
      const notes = [];
      if (msg.adjusted?.renamed) notes.push(`Ya había alguien con ese nombre: aparecerás como «${me.name}».`);
      if (msg.adjusted?.appearanceChanged) notes.push('Ese icono ya estaba cogido: te hemos puesto otro.');
      if (me.face && firstTime) notes.push('¡Te hemos reconocido! Juegas con tu foto.');
      if (notes.length) toast(notes.join(' ') + (msg.adjusted?.renamed || msg.adjusted?.appearanceChanged ? ' Puedes cambiarlo con ✏️.' : ''));
      if (firstTime && !needsLook()) show('screen-game');
      renderMe();
      break;
    }
    case MSG.STATE: {
      me = msg.you;
      lastState = msg;
      stateReceivedAt = performance.now();
      editPicker.setTaken(msg.taken ?? []);
      const team = msg.teams?.find((t) => t.id === me.teamId);
      const teamPlace = team ? (msg.standings?.teams.findIndex((t) => t.id === team.id) ?? -1) + 1 : 0;
      const teamText = team ? `${team.name}${teamPlace ? ` · ${teamPlace}º` : ''}` : null;
      $('#room-line').textContent = [teamText, `Sala ${msg.room}`, `${msg.playerCount} ${msg.playerCount === 1 ? 'jugador' : 'jugadores'}`]
        .filter(Boolean)
        .join(' · ');
      renderMe();
      renderSectionBar(msg);
      // El fondo del móvil lleva los colores del entorno de la sección (el mismo que la tele).
      document.body.style.setProperty('--env-bg', envGradient(msg.section?.env ?? HOME_ENV));
      document.body.classList.toggle('squid-on', msg.section?.env === 'squid'); // Squid Games: sus colores, no los de Halloween
      if (standingsDialog.open) renderStandings();
      // Concurso en pausa (para seguir otro día): solo el aviso
      $('#paused-pad').hidden = !msg.paused;
      if (!msg.squid || msg.paused) squidPad.hide();
      if (msg.paused) {
        gamesPad.hide();
        pad.hide();
        millPad.hide();
        for (const id of ['#buzzer', '#free-pad', '#turn-pad']) $(id).hidden = true;
      } else if (msg.squid) {
        gamesPad.hide();
        pad.hide();
        millPad.hide();
        for (const id of ['#buzzer', '#free-pad', '#turn-pad']) $(id).hidden = true;
        squidPad.show();
        squidPad.render(msg.squid, stateReceivedAt);
      } else if (msg.words || msg.shake || msg.bet || msg.punish) {
        pad.hide();
        millPad.hide();
        for (const id of ['#buzzer', '#free-pad', '#turn-pad']) $(id).hidden = true;
        gamesPad.show();
        gamesPad.render(msg, stateReceivedAt);
      } else if (msg.millionaire) {
        gamesPad.hide();
        pad.hide();
        for (const id of ['#buzzer', '#free-pad', '#turn-pad']) $(id).hidden = true;
        millPad.show();
        millPad.render(msg.millionaire, { me, stateReceivedAt });
      } else if (msg.answer) {
        gamesPad.hide();
        millPad.hide();
        $('#buzzer').hidden = true;
        pad.show();
        if (msg.answer.result?.points && !lastResultRound.has(msg.answer.roundId)) {
          lastResultRound.add(msg.answer.roundId);
          vibrate([80, 60, 80]);
        }
        // Por turnos: a quién le toca de mi equipo (para «¡Te toca!» / «Le toca a Ana»)
        const answerer = msg.turns?.answerer;
        pad.render({ ...msg.answer, turnOf: answerer?.name ?? null, myTurn: answerer?.id === me.id }, { stateReceivedAt });
      } else {
        gamesPad.hide();
        pad.hide();
        millPad.hide();
        // Libre con contador: si participas, el móvil cuenta (+1/−1) en vez del botón grande.
        const counting = !!msg.free?.counter && ['setup', 'running'].includes(msg.free.phase);
        const ordering = !counting && !!msg.turns?.canOrder; // portavoz ordenando a su equipo
        $('#free-pad').hidden = !counting;
        $('#turn-pad').hidden = !ordering;
        $('#buzzer').hidden = counting || ordering;
        if (counting) renderFreePad(msg.free);
        else if (ordering) renderTurnPad(msg.turns);
        else renderBuzzer();
      }
      // Con equipos, quien aún no tiene uno tiene que elegirlo antes de nada; luego, icono y color si no hay foto.
      if (msg.teams?.length && !me.teamId) {
        if (!teamRequested) showTeamPicker(msg.teams); // si ya lo pidió, se espera a que la tele lo confirme
      } else if (needsLook()) showLook(msg);
      else if (welcomedRoom !== msg.room && msg.squid?.phase === 'running') {
        welcomedRoom = msg.room; // vuelve a entrar con un juego en marcha: nada de bienvenida, que no tape el juego
        if ($('#screen-game').hidden) show('screen-game');
      } else if (welcomedRoom !== msg.room) showWelcome(msg);
      else if (welcomeTimer) {
        // sigue la bienvenida: que no la tape el juego
      } else if ($('#screen-game').hidden) show('screen-game');
      break;
    }
    case MSG.ANSWER_ACK: {
      const kind = ackKinds.get(msg.seq);
      ackKinds.delete(msg.seq);
      if (msg.result === 'ok') break;
      // En Reflejos, pulsar en rojo queda registrado: lo cuenta el estado ("¡Demasiado pronto!").
      if (msg.result === 'early' && lastState?.answer?.kind === 'reflejos') break;
      if (kind === 'answer') {
        pad.rejectPending();
        toast(ANSWER_REJECTED[msg.result] ?? 'No se ha podido enviar la respuesta.');
      } else if (msg.message) {
        toast(msg.message);
      }
      break;
    }
    case MSG.FACES:
      // Fotos de los jugadores reconocidos por su nombre (la tuya incluida)
      setFaceImages(msg.images);
      renderMe();
      if (standingsDialog.open) renderStandings();
      break;
    case MSG.ERROR:
      handleError(msg);
      break;
  }
}

// ---------- Por turnos: el portavoz ordena a su equipo ----------

let turnDraft = null; // orden que está montando el portavoz (ids), hasta que lo guarda
let turnDirty = false;

function renderTurnPad(turns) {
  const ids = turns.order.map((p) => p.id);
  // Si cambia el equipo (alguien entra o sale) o aún no ha tocado nada, se parte del orden de la tele
  if (!turnDraft || !turnDirty || turnDraft.length !== ids.length || turnDraft.some((id) => !ids.includes(id))) {
    turnDraft = ids;
    turnDirty = false;
  }
  const byId = new Map(turns.order.map((p) => [p.id, p]));
  const move = (i, d) => {
    const j = i + d;
    if (j < 0 || j >= turnDraft.length) return;
    [turnDraft[i], turnDraft[j]] = [turnDraft[j], turnDraft[i]];
    turnDirty = true;
    renderTurnPad(turns);
  };
  fill(
    $('#turn-list'),
    turnDraft.map((id, i) => {
      const p = byId.get(id);
      return h(
        'li',
        {},
        h('span', { class: 'turn-num' }, String(i + 1)),
        h('span', { class: 'emoji turn-avatar' }, avatarOf(p)),
        h('span', { class: 'turn-name' }, p.name, p.id === me?.id ? ' (tú)' : ''),
        h('button', { class: 'btn small', type: 'button', disabled: i === 0, 'aria-label': `Subir a ${p.name}`, onclick: () => move(i, -1) }, '↑'),
        h('button', { class: 'btn small', type: 'button', disabled: i === turnDraft.length - 1, 'aria-label': `Bajar a ${p.name}`, onclick: () => move(i, 1) }, '↓'),
      );
    }),
  );
  $('#turn-status').textContent = turnDirty ? 'Sin guardar' : turns.ready ? '✓ Guardado: ya sale en la tele' : 'Aún no lo has guardado';
}

$('#turn-save').addEventListener('click', () => {
  if (!turnDraft || !connection?.connected) return;
  connection.send({ t: MSG.TURN_ORDER, order: turnDraft });
  turnDirty = false;
  vibrate(30);
  toast('Orden guardado');
});

// ---------- Antitrampas ----------

// Si sales de la app (otra app, otra pestaña, Google…) el portátil lo sabe: al salir se avisa y al volver se dice cuánto
// tiempo estuviste fuera. Si tenías una pregunta abierta, según el ajuste tu respuesta no cuenta.
let leftAt = null;
let pendingBack = null; // ms fuera, por mandar (si al volver aún no hay conexión)

function sendBack() {
  if (pendingBack == null || !connection?.connected) return;
  connection.send({ t: MSG.AWAY, state: 'back', ms: Math.round(pendingBack) });
  pendingBack = null;
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    leftAt = performance.now();
    if (connection?.connected) connection.send({ t: MSG.AWAY, state: 'out' });
  } else if (leftAt != null) {
    pendingBack = (pendingBack ?? 0) + (performance.now() - leftAt);
    leftAt = null;
    sendBack();
  }
});

// ---------- Icono y color (si no hay foto con tu nombre) ----------

/** Hay que elegir icono y color: no tiene foto y aún no los eligió en este móvil. */
const needsLook = () => !!me && !me.face && !profile.lookChosen;

function showLook(state) {
  if (!$('#screen-look').hidden) return;
  lookPicker.setTaken(state.taken ?? []);
  lookPicker.setFixedColor(state.teams?.find((t) => t.id === me.teamId)?.color ?? null);
  lookPicker.value = { ...profile, color: me.color, icon: me.icon };
  show('screen-look');
}

$('#look-done').addEventListener('click', () => {
  const value = lookPicker.value;
  Object.assign(profile, { color: value.color, icon: value.icon, lookChosen: true });
  saveProfile();
  connection?.send({ t: MSG.PROFILE, name: me?.name ?? profile.name, color: value.color, icon: value.icon, teamId: me?.teamId ?? null });
  show('screen-game');
});

function handleError(msg) {
  sync.stop();
  connection?.stop();
  connection = null;
  me = null;
  lastState = null;
  writeSession(null);
  if (msg.code === ERROR_CODE.ROOM_FULL) showMessage('Sala llena', msg.message);
  else if (msg.code === ERROR_CODE.REMOVED) showMessage('Fuera de la sala', msg.message, 'Volver a entrar', () => join(roomCode));
  else if (msg.code === ERROR_CODE.REPLACED) showMessage('Abierto en otra pestaña', msg.message, 'Jugar aquí', () => join(roomCode));
  else if (msg.code === ERROR_CODE.VERSION) showMessage('Versión distinta', msg.message, 'Recargar', () => location.reload());
  else if (msg.code === ERROR_CODE.ADOPT && typeof msg.playerId === 'string') {
    // Ya jugaba con este nombre (otro móvil, o este con los datos borrados): sigue con sus puntos y su equipo
    Object.assign(profile, { playerId: msg.playerId, color: msg.color ?? profile.color, icon: msg.icon ?? profile.icon, teamId: msg.teamId ?? null });
    profile.lookChosen = true;
    saveProfile();
    welcomedRoom = roomCode; // nada de bienvenida otra vez: ya estaba dentro
    toast(msg.message ?? '¡Hola de nuevo!');
    join(roomCode);
  }
  else showMessage('Error', msg.message ?? 'Error desconocido.');
}

// ---------- Interfaz del juego ----------

function renderMe() {
  if (!me) return;
  const color = getColor(me.color);
  document.documentElement.style.setProperty('--me', color.bg);
  document.documentElement.style.setProperty('--me-fg', color.fg);
  $('#me-avatar').replaceChildren(avatarOf(me));
  $('#me-name').textContent = me.name;
  $('#me-score').textContent = me.score;
}

/**
 * Instante local en que empieza el turno. Sincronizado: el `tOpen` del presentador traducido a este reloj
 * (todos los móviles cambian a la vez). Sin sincronizar: cuenta atrás desde que llegó el estado.
 */
function localOpenTime(g) {
  return sync.toLocal(g.tOpen) ?? stateReceivedAt + (g.opensInMs ?? 0);
}

/** Estado que se ve ahora: el del presentador, más "preparados" (apertura programada) y "pulsado" local. */
function displayedStatus() {
  const g = lastState?.game;
  if (!g) return 'wait';
  if (g.status === 'go') {
    if (pressedEpoch === g.epoch) return 'pressed'; // optimista: no esperar al presentador
    if (localOpenTime(g) > performance.now()) return 'ready';
  }
  return g.status;
}

// ---------- Sección Libre: contador desde el móvil ----------

function renderFreePad(free) {
  const c = free.counter;
  const running = free.phase === 'running';
  $('#free-title').textContent = free.title;
  $('#free-count').textContent = free.count;
  $('#free-hint').textContent = !c.mine
    ? c.by
      ? `Lleva la cuenta ${c.by} desde su móvil`
      : 'La cuenta la lleva el presentador'
    : running
      ? free.byTeams
        ? 'Suma uno por cada repetición de tu equipo'
        : 'Suma uno por cada repetición'
      : 'Cuando empiece la prueba, cuenta aquí';
  for (const id of ['#free-plus', '#free-minus']) {
    $(id).hidden = !c.mine;
    $(id).disabled = !running;
  }
}

function sendFreeCount(delta) {
  const free = lastState?.free;
  if (!free?.counter?.mine || free.phase !== 'running' || !connection?.connected) return;
  const seq = ++buzzSeq;
  ackKinds.set(seq, 'free');
  connection.send({ t: MSG.FREE_COUNT, seq, roundId: free.roundId, delta });
  // Se ve al momento; el siguiente estado del portátil lo confirma.
  free.count = Math.max(0, free.count + delta);
  renderFreePad(free);
  vibrate(20);
}

// pointerdown: que cuente al tocar, aunque se toque muy seguido
for (const [id, delta] of [
  ['#free-plus', 1],
  ['#free-minus', -1],
]) {
  $(id).addEventListener('pointerdown', (e) => {
    e.preventDefault();
    sendFreeCount(delta);
  });
  $(id).addEventListener('click', (e) => e.detail === 0 && sendFreeCount(delta)); // con teclado
}

/** Fuera de una pregunta de pulsador el botón solo informa de lo que pasa en la tele. */
function renderInfo(state) {
  const section = state.section;
  const free = state.free; // sección Libre: lo arbitra el presentador; aquí solo se informa
  const freeText =
    free &&
    (free.tool === 'score' && free.participating
      ? free.score != null
        ? [`Nota: ${free.score}`, `+${free.score} ${free.byTeams ? 'para tu equipo' : free.score === 1 ? 'punto' : 'puntos'}`]
        : free.phase === 'running'
          ? ['💃 ¡A bailar!', 'Marca el golpe bailando: el presentador pone la nota']
          : ['¡Te toca!', free.title]
      : [
          free.won ? '¡Has ganado!' : free.out ? '¡Eliminado!' : free.participating ? '¡Te toca!' : free.title,
          free.won ? `+${free.points} ${free.byTeams ? 'para tu equipo' : ''}`.trim() : free.participating ? free.title : 'Mira la tele',
        ]);
  // El presentador, en las secciones donde no juega (ve las respuestas en el mando)
  const benched = state.benched && ['intro', 'play'].includes(state.screen) ? ['🎤 Presentas', 'En esta sección no juegas: tú la llevas'] : null;
  const [label, sub] = benched ?? freeText ?? {
    setup: ['Espera', state.playerCount < state.minPlayers ? `Esperando jugadores (mínimo ${state.minPlayers})` : 'Enseguida empezamos'],
    cover: ['¡Empezamos!', 'Mira la tele'],
    intro: state.turns
      ? [
          section?.name ?? 'Nueva sección',
          state.turns.ready
            ? `Por turnos: responderás la pregunta ${state.turns.position}`
            : `Por turnos: ${state.turns.spokespersonName ?? 'tu portavoz'} está eligiendo el orden de tu equipo`,
        ]
      : section?.env === 'squid'
        ? ['○ △ □  ¿Quieres jugar?', `${section.name}: cinco juegos seguidos. Si caes en uno, fuera; los que sobreviven se reparten la hucha. ¡Mira la tele!`]
        : [section?.name ?? 'Nueva sección', section?.label ?? ''],
    play: [section?.name ?? 'Espera', 'Mira la tele'],
    scoreboard: ['Marcador', 'Mira la tele'],
    final: ['¡Fin del concurso!', `Has hecho ${me?.score ?? 0} ${me?.score === 1 ? 'punto' : 'puntos'}`],
  }[state.screen] ?? ['Espera', ''];
  const buzzer = $('#buzzer');
  buzzer.dataset.state = 'info';
  $('#buzzer-label').textContent = label;
  $('#buzzer-sub').textContent = sub;
  lastShownStatus = 'info';
}

function renderBuzzer() {
  const state = lastState;
  const g = state?.game;
  clearTimeout(goTimer);
  if (!state) return;
  if (!g) return renderInfo(state);
  const status = displayedStatus();
  // Cuenta atrás: repintar en cada cambio de segundo y, al llegar a 0, cambiar a "¡PULSA!" justo a tiempo.
  const left = localOpenTime(g) - performance.now();
  if (status === 'ready') goTimer = setTimeout(renderBuzzer, left > 1000 ? (left % 1000) + 5 : left);
  if (status === 'first' && lastShownStatus !== 'first') vibrate([80, 60, 80]);
  lastShownStatus = status;

  const winnerName = state.winner?.name ?? '';
  const [label, sub] = {
    wait: ['Espera', state.playerCount < state.minPlayers ? `Esperando jugadores (mínimo ${state.minPlayers})` : 'Pregunta en el aire'],
    ready: left > 900 ? [String(Math.ceil(left / 1000)), '¡No pulses todavía!'] : ['Espera', 'Preparados…'],
    go: ['¡PULSA!', ''],
    pressed: ['¡Pulsado!', 'Esperando resultado…'],
    first: g.judged === 'correct' ? ['¡Has acertado!', '¡Bien hecho!'] : ['¡Has sido el primero!', formatSeconds(g.reactionMs ?? 0)],
    placed: [`Llegaste ${g.place}º`, `(${formatDeltaSeconds(g.deltaMs ?? 0)})${g.nearTie ? ' · ¡casi empate!' : ''}`],
    missed: g.judged === 'correct' ? [`${winnerName} ha acertado`, ''] : ['Espera', `Ha pulsado antes ${winnerName}`],
    blocked: [
      'Bloqueado',
      { early: 'Pulsaste antes de tiempo', cheat: '🚨 Saliste de la app con el turno abierto' }[g.reason] ?? 'Fallaste: espera a la siguiente pregunta',
    ],
    closed: ['Nadie acertó', 'Espera a la siguiente pregunta'],
  }[status] ?? ['Espera', ''];

  const buzzer = $('#buzzer');
  buzzer.dataset.state = status;
  $('#buzzer-label').textContent = label;
  $('#buzzer-sub').textContent = sub;
}

// El pulsador responde a pointerdown (no a click): se dispara al tocar, sin esperar a levantar el dedo.
const buzzer = $('#buzzer');
buzzer.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  buzzer.classList.add('pressed');
  setTimeout(() => buzzer.classList.remove('pressed'), 140);

  const g = lastState?.game;
  const status = displayedStatus();
  // Se envía también en "Espera"/"Preparados": quien decide si es antes de tiempo es el presentador.
  if (!g || !connection?.connected || !['wait', 'ready', 'go'].includes(status)) return;
  if (pressedEpoch === g.epoch) return; // una pulsación por ronda
  pressedEpoch = g.epoch;
  // event.timeStamp = cuándo tocó el dedo la pantalla (no cuándo se ejecuta este código), en el reloj de
  // performance.now(). Si un navegador antiguo usara otra base, se nota porque cae lejos de ahora.
  const now = performance.now();
  const tLocal = Math.abs(now - e.timeStamp) < 1000 ? e.timeStamp : now;
  const clock = sync.estimate();
  connection.send({ t: MSG.BUZZ, seq: ++buzzSeq, epoch: g.epoch, tLocal, offset: clock?.offset, err: clock?.err });
  vibrate(30);
  renderBuzzer();
});

function vibrate(pattern) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // iPhone y escritorio: sin vibración
  }
}
buzzer.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('contextmenu', (e) => {
  if (!$('#screen-game').hidden) e.preventDefault();
});

// ---------- Cambiar perfil ----------

const dialog = $('#profile-dialog');
const teamSelect = $('#team-select');

$('#edit-profile').addEventListener('click', () => {
  const teams = lastState?.teams ?? [];
  const locked = !!lastState?.teamsLocked;
  $('#team-field').hidden = !teams.length || locked;
  $('#team-locked').hidden = !(teams.length && locked);
  fill(
    teamSelect,
    teams.map((t) => h('option', { value: t.id, selected: t.id === me?.teamId }, t.name)),
  );
  editPicker.setFixedColor(teams.length ? (teams.find((t) => t.id === me?.teamId)?.color ?? null) : null);
  editPicker.value = { ...profile, name: me?.name ?? profile.name, color: me?.color ?? profile.color, icon: me?.icon ?? profile.icon };
  // Con foto no hace falta icono; el nombre, solo antes de empezar el concurso
  editPicker.showLook(!me?.face);
  editPicker.lockName(!!lastState && lastState.screen !== 'setup');
  dialog.showModal();
});

$('#switch-room').addEventListener('click', () => {
  if (!confirm('¿Salir de esta sala? Podrás entrar en otra con su código.')) return;
  dialog.close();
  $('#code').value = '';
  leave();
});

// Al cambiar de equipo en el diálogo, los iconos ocupados se calculan con el color del nuevo equipo.
teamSelect.addEventListener('change', () => {
  const team = lastState?.teams?.find((t) => t.id === teamSelect.value);
  if (team) editPicker.setFixedColor(team.color);
});

// 'submit' y no 'close': Chrome no dispara 'close' mientras la página no se pinta.
$('#profile-form').addEventListener('submit', (e) => {
  e.preventDefault();
  dialog.close();
  if (e.submitter?.value !== 'save') return;
  const value = editPicker.value;
  const teamId = $('#team-field').hidden ? (me?.teamId ?? null) : teamSelect.value || null;
  Object.assign(profile, value, { teamId });
  saveProfile();
  connection?.send({ t: MSG.PROFILE, name: value.name, color: value.color, icon: value.icon, teamId });
});

// ---------- Sección y marcador ----------

/** Barra bajo la cabecera: en qué sección estamos, qué pregunta va y cuántos puntos hay en juego. */
function renderSectionBar(state) {
  const bar = $('#section-bar');
  const s = state.section;
  bar.hidden = !s;
  if (!s) return;
  const unit = state.words ? 'Turno' : state.shake ? 'Carrera' : state.bet ? 'Apuesta' : ({ contador: 'Ronda', reflejos: 'Ronda', libre: 'Prueba' }[state.answer?.kind ?? (state.free ? 'libre' : '')] ?? 'Pregunta');
  let item = s.itemIndex == null ? '' : s.itemCount ? `${unit} ${s.itemIndex + 1} de ${s.itemCount}` : `${unit} ${s.itemIndex + 1}`;
  // Squid Games: «Juego 2 de 5» (la última «pregunta» es el reparto de la hucha)
  if (state.squid) item = state.squid.game === 'hucha' ? 'La hucha' : `Juego ${state.squid.step} de ${state.squid.steps - 1}`;
  const pts = state.squid ? `${s.points?.[0] ?? 1} pts a la hucha por eliminado` : state.bet ? 'apuesta tus puntos' : s.points?.length > 1 ? `${s.points.join('·')} pts` : `${s.points?.[0] ?? 1} ${s.points?.[0] === 1 ? 'pt' : 'pts'}${state.words ? ' por palabra' : ''}`;
  $('#section-top').textContent = [`Sección ${s.index + 1} de ${s.count}`, s.label, item].filter(Boolean).join(' · ');
  $('#section-name').textContent = `${s.name} · ${pts}`;
  $('#section-desc').textContent = s.description ?? '';
  // En Squid Games, la descripción sobra (cada juego explica lo suyo) y quita sitio al botón
  $('#section-desc').hidden = !s.description || !!state.squid;
}

const standingsDialog = $('#standings-dialog');
$('#open-standings').addEventListener('click', () => {
  renderStandings();
  standingsDialog.showModal();
});
// 'submit' y no 'close': Chrome no dispara 'close' mientras la página no se pinta.
$('#standings-form').addEventListener('submit', (e) => {
  e.preventDefault();
  standingsDialog.close();
});

/** Marcador en directo: equipos (si hay) y jugadores, con el tuyo resaltado. */
function renderStandings() {
  const st = lastState?.standings;
  if (!st) return;
  const row = (place, name, score, { color, icon, face, mine }) =>
    h(
      'li',
      { class: mine ? 'mine' : '', style: { '--pc': getColor(color).bg } },
      h('span', { class: 'st-place' }, `${place}º`),
      icon ? h('span', { class: 'emoji' }, avatarOf({ icon, face })) : null,
      h('span', { class: 'st-name' }, name),
      h('strong', {}, String(score)),
    );
  fill(
    $('#standings-body'),
    st.teams.length
      ? [
          h('h3', {}, 'Equipos'),
          h(
            'ol',
            { class: 'st-list' },
            st.teams.map((t, i) => row(i + 1, t.name, t.score, { color: t.color, mine: t.id === me?.teamId })),
          ),
        ]
      : null,
    h('h3', {}, st.teams.length ? 'Concursantes' : 'Clasificación'),
    h(
      'ol',
      { class: 'st-list' },
      st.players.map((p, i) => row(i + 1, p.name, p.score, { color: p.color, icon: p.icon, face: p.face, mine: p.id === me?.id })),
    ),
  );
}

// ---------- Elegir equipo ----------

function showTeamPicker(teams) {
  fill(
    $('#team-list'),
    teams.map((t) => {
      const color = getColor(t.color);
      return h(
        'button',
        {
          type: 'button',
          class: 'team-button',
          style: { background: color.bg, color: color.fg },
          onclick: () => {
            profile.teamId = t.id;
            teamRequested = true; // hasta que conteste, no volver a enseñar la lista
            saveProfile();
            connection?.send({ t: MSG.PROFILE, name: profile.name, color: t.color, icon: profile.icon, teamId: t.id });
            show('screen-game');
          },
        },
        t.name,
      );
    }),
  );
  show('screen-team');
}

// ---------- Utilidades ----------

let toastTimer = null;
function toast(text) {
  const el = $('#toast');
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 5000);
}

function loadProfile() {
  const saved = loadJSON(PROFILE_KEY, {}) ?? {};
  const p = {
    playerId: typeof saved.playerId === 'string' ? saved.playerId : newId(),
    name: typeof saved.name === 'string' ? saved.name : '',
    color: saved.color ?? COLORS[Math.floor(Math.random() * COLORS.length)].id,
    icon: saved.icon ?? ICONS[Math.floor(Math.random() * ICONS.length)].id,
    lookChosen: saved.lookChosen === true, // ya eligió icono y color en este móvil
  };
  saveJSON(PROFILE_KEY, p);
  return p;
}

function saveProfile() {
  saveJSON(PROFILE_KEY, profile);
}

function readSession() {
  try {
    return sessionStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

function writeSession(code) {
  try {
    if (code) sessionStorage.setItem(SESSION_KEY, code);
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // sin sessionStorage solo se pierde la vuelta automática tras recargar
  }
}

keepScreenAwake();
init();
