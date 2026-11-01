// Ajustes del pulsador y del sonido (se guardan con la sala). Los puntos vienen de la hoja del concurso.
import { h } from '../shared/dom.js';
import { loadJSON, removeKey, saveJSON } from '../shared/storage.js';
import { LOCAL_TURN_KEY } from '../shared/peerConfig.js';

const FIELDS = [
  { key: 'musicOn', type: 'checkbox', label: 'Música ambiental (cambia con cada sección)' },
  { key: 'sfxOn', type: 'checkbox', label: 'Efectos de sonido' },
  { key: 'volume', type: 'range', label: 'Volumen', min: 0, max: 100 },
  {
    key: 'quality',
    type: 'select',
    label: 'Imagen de la tele',
    help: 'Automática: si el portátil va justo, el fondo se simplifica para que todo vaya fluido. Máxima: el fondo a la resolución de la tele (nítido en 4K; pide más al portátil).',
    options: [
      ['auto', 'Automática (recomendada)'],
      ['max', 'Máxima (nítida, también en 4K)'],
      ['high', 'Alta'],
      ['low', 'Ligera (portátiles lentos)'],
    ],
  },
  { key: 'countdownSec', type: 'number', label: 'Cuenta atrás antes de cada pregunta (s)', min: 0, max: 10, help: '0 = sin cuenta atrás.' },
  {
    key: 'antiCheat',
    type: 'select',
    label: 'Si alguien sale de la app con una pregunta abierta',
    help: 'Para pillar a quien cambia de ventana para buscar la respuesta (más de 1,5 s fuera).',
    options: [
      ['void', 'Su respuesta no cuenta (y aviso en la tele)'],
      ['warn', 'Solo aviso en la tele y el mando'],
      ['off', 'Nada'],
    ],
  },
  { key: 'lockEarlyBuzz', type: 'checkbox', label: 'Bloquear durante la pregunta a quien pulse antes de abrir el turno' },
  { key: 'nearTieMs', type: 'number', label: 'Umbral de casi empate (ms)', min: 0, max: 500 },
  {
    key: 'decisionWindowMs',
    type: 'number',
    label: 'Ventana de decisión (ms)',
    min: 0,
    max: 1000,
    help: 'Tras la primera pulsación que llega, se espera esto antes de declarar ganador.',
  },
  {
    key: 'scheduledOpenMs',
    type: 'number',
    label: 'Apertura programada (ms)',
    min: 0,
    max: 2000,
    help: 'Retraso entre pulsar "Abrir turno" y que empiece el turno en tele y móviles.',
  },
];

export function openSettingsDialog(room) {
  const inputs = new Map();
  // TURN (móviles con datos): se guarda en este portátil, no en la sala ni en el repositorio
  const turn = loadJSON(LOCAL_TURN_KEY) ?? {};
  const turnInputs = {
    urls: h('input', { type: 'text', name: 'turnUrls', value: turn.urls ?? '', placeholder: 'turn:servidor:3478 turns:servidor:443?transport=tcp', autocomplete: 'off' }),
    username: h('input', { type: 'text', name: 'turnUser', value: turn.username ?? '', autocomplete: 'off' }),
    credential: h('input', { type: 'password', name: 'turnPass', value: turn.credential ?? '', autocomplete: 'off' }),
  };
  const form = h(
    'form',
    { method: 'dialog', class: 'settings-form' },
    h('h2', {}, 'Ajustes'),
    FIELDS.map((f) => {
      const input =
        f.type === 'select'
          ? h('select', { name: f.key }, f.options.map(([value, text]) => h('option', { value, selected: room.settings[f.key] === value }, text)))
          : h('input', { type: f.type, name: f.key, min: f.min, max: f.max, step: 1 });
      if (f.type === 'checkbox') input.checked = !!room.settings[f.key];
      else if (f.type !== 'select') input.value = room.settings[f.key];
      inputs.set(f.key, { input, field: f });
      return h(
        'label',
        { class: `setting ${f.type}` },
        h('span', { class: 'setting-label' }, f.label, f.help ? h('small', {}, f.help) : null),
        input,
      );
    }),
    h(
      'fieldset',
      { class: 'setting-turn' },
      h('legend', {}, 'Móviles con datos (servidor TURN)'),
      h('small', {}, 'Si los móviles entran con sus datos y no conectan, pon aquí el servidor TURN de tu cuenta (varias direcciones separadas por espacios). Se guarda solo en este portátil. Al guardar, la tele se recarga para usarlo.'),
      h('label', { class: 'setting' }, h('span', { class: 'setting-label' }, 'Direcciones'), turnInputs.urls),
      h('label', { class: 'setting' }, h('span', { class: 'setting-label' }, 'Usuario'), turnInputs.username),
      h('label', { class: 'setting' }, h('span', { class: 'setting-label' }, 'Contraseña'), turnInputs.credential),
    ),
    h(
      'div',
      { class: 'dialog-actions' },
      h('button', { class: 'btn', value: 'cancel' }, 'Cancelar'),
      h('button', { class: 'btn primary', value: 'save' }, 'Guardar'),
    ),
  );
  const dialog = h('dialog', { class: 'settings-dialog' }, form);
  const dismiss = () => {
    dialog.close();
    dialog.remove();
  };
  // Se usa 'submit' y no 'close': Chrome no dispara 'close' mientras la página no se pinta (ventana oculta).
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (e.submitter?.value === 'save') {
      const patch = {};
      for (const [key, { input, field }] of inputs) {
        if (field.type === 'checkbox') patch[key] = input.checked;
        else if (field.type === 'select') patch[key] = input.value;
        else {
          const n = Math.round(Number(input.value));
          if (Number.isFinite(n)) patch[key] = Math.min(field.max, Math.max(field.min, n));
        }
      }
      room.run('updateSettings', patch);
      const next = { urls: turnInputs.urls.value.trim(), username: turnInputs.username.value.trim(), credential: turnInputs.credential.value };
      const changed = next.urls !== (turn.urls ?? '') || next.username !== (turn.username ?? '') || next.credential !== (turn.credential ?? '');
      if (changed) {
        if (next.urls) saveJSON(LOCAL_TURN_KEY, next);
        else removeKey(LOCAL_TURN_KEY);
        dismiss();
        return location.reload(); // el TURN se lee al crear la conexión: la sala se recupera al volver
      }
    }
    dismiss();
  });
  dialog.addEventListener('cancel', (e) => {
    e.preventDefault(); // Escape
    dismiss();
  });
  document.body.append(dialog);
  dialog.showModal();
}
