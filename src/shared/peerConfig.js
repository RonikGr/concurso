import { loadJSON } from './storage.js';

// El servidor público de PeerJS es compartido por todo el mundo: el prefijo evita choques de IDs.
export const PEER_ID_PREFIX = 'concurso-del-ano-v1-';

export function hostPeerId(roomCode) {
  return PEER_ID_PREFIX + roomCode;
}

/**
 * Servidores TURN (repetidores): solo hacen falta si la wifi no deja que el móvil y el portátil hablen directamente
 * (wifi de invitados, aislamiento entre dispositivos…). Los gratuitos de PeerJS y de Metered ya no existen (2026):
 * aquí van los de una cuenta propia, p. ej. [{urls: ['turn:…:3478', 'turns:…:443?transport=tcp'], username, credential}].
 */
export const TURN_SERVERS = [];

/**
 * TURN puesto en este aparato (Ajustes de la tele): {urls, username, credential} en localStorage, así las claves no van
 * al repositorio (que es público). Con datos móviles, muchas compañías no dejan la conexión directa: basta con que la
 * tele tenga un TURN (los móviles llegan a él sin configurar nada).
 */
export const LOCAL_TURN_KEY = 'concurso.turn';
function localTurn() {
  const t = loadJSON(LOCAL_TURN_KEY);
  const urls = String(t?.urls ?? '')
    .split(/[s,]+/)
    .filter(Boolean);
  return urls.length ? [{ urls, username: t.username ?? '', credential: t.credential ?? '' }] : [];
}

// Sin `host`/`port`: PeerJS usa su servidor de enlace público (0.peerjs.com). Los STUN dicen a cada uno su
// dirección pública; en la misma wifi casi siempre basta con la conexión directa.
export const PEER_OPTIONS = {
  debug: 1, // 0 nada, 1 errores, 2 avisos, 3 todo
  config: {
    iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }, { urls: 'stun:stun.cloudflare.com:3478' }, ...TURN_SERVERS, ...localTurn()],
  },
};

// 'binary' trocea los mensajes grandes (fotos de las caras, el estado del mando con 20 jugadores) y los vuelve a juntar.
// Con 'json', PeerJS da error en cuanto un mensaje pasa de 16 300 bytes y la conexión se cortaba: quien tenía foto
// (y el mando, que recibe todas) no conseguía entrar.
export const CONNECTION_OPTIONS = {
  reliable: true,
  serialization: 'binary',
};

/** Traduce los errores de PeerJS a mensajes para personas. */
export function describePeerError(err) {
  switch (err?.type) {
    case 'network':
    case 'server-error':
    case 'socket-error':
    case 'socket-closed':
      return 'No se puede contactar con el servidor de enlace de PeerJS. Comprueba la conexión a internet; si está bien, puede que el servidor público esté caído: prueba de nuevo en unos minutos.';
    case 'browser-incompatible':
      return 'Este navegador no admite WebRTC. Prueba con Chrome, Safari o Firefox actualizados.';
    case 'peer-unavailable':
      return 'No se encuentra la sala. Comprueba el código.';
    case 'unavailable-id':
      return 'El código de sala está ocupado en el servidor.';
    case 'ssl-unavailable':
      return 'La página debe abrirse con HTTPS.';
    case 'webrtc':
      return 'Fallo de WebRTC al conectar. Asegúrate de estar en la misma wifi.';
    default:
      return 'Error de conexión: ' + (err?.message || err?.type || 'desconocido');
  }
}
