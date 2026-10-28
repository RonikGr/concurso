// El panal (dalgona) de Squid Games: las formas y el repaso con el dedo. Lógica pura (la usa el móvil; la prueban
// los tests). Coordenadas de 0 a 1 (el móvil las escala a su lienzo).
//
// Repasar = pasar el dedo cerca de la línea: cada punto de la forma por el que pasas queda «hecho». Hay que repasarla
// entera tres veces (LAPS). Salirse mucho de la línea agrieta la galleta (una grieta por cada salida, no por cada
// movimiento), y también ir demasiado deprisa (MAX_SPEED); a la tercera grieta, se rompe.

const STEP = 0.012; // separación entre los puntos de la forma
export const MAX_CRACKS = 3;
export const DONE_AT = 0.96; // repasada (casi) entera

const circle = (cx, cy, r, from = 0, to = Math.PI * 2, n = 96) => Array.from({ length: n + 1 }, (_, i) => [cx + r * Math.cos(from + ((to - from) * i) / n), cy + r * Math.sin(from + ((to - from) * i) / n)]);

function star(cx, cy, outer, inner) {
  const pts = [];
  for (let i = 0; i <= 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 ? inner : outer;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return pts;
}

function umbrella() {
  // Cúpula (semicírculo), borde de abajo con tres ondas y el mango con su gancho
  const top = circle(0.5, 0.5, 0.33, Math.PI, Math.PI * 2, 60);
  const scallops = [];
  for (let k = 0; k < 3; k++) {
    const cx = 0.83 - 0.11 - k * 0.22;
    scallops.push(...circle(cx, 0.5, 0.11, 0, Math.PI, 20).slice(k ? 1 : 0));
  }
  const handle = [
    [0.5, 0.5],
    [0.5, 0.8],
    ...circle(0.43, 0.8, 0.07, 0, Math.PI, 16).slice(1),
  ];
  return [[...top, ...scallops], handle];
}

/** Formas: nombre, dificultad y trazos (cada uno, una línea de puntos). */
export const DALGONA_SHAPES = {
  circulo: { label: 'Círculo', icon: '⭕', tol: 0.04, paths: [circle(0.5, 0.5, 0.3)] },
  triangulo: {
    label: 'Triángulo',
    icon: '🔺',
    tol: 0.038,
    paths: [
      [
        [0.5, 0.17],
        [0.84, 0.76],
        [0.16, 0.76],
        [0.5, 0.17],
      ],
    ],
  },
  estrella: { label: 'Estrella', icon: '⭐', tol: 0.034, paths: [star(0.5, 0.53, 0.36, 0.15)] },
  paraguas: { label: 'Paraguas', icon: '☂️', tol: 0.032, paths: umbrella() },
};

/** Los puntos de una forma, uno cada STEP (para repasar y para dibujarla). */
export function shapePoints(shapeId) {
  const out = [];
  for (const path of DALGONA_SHAPES[shapeId].paths) {
    for (let i = 0; i < path.length - 1; i++) {
      const [x0, y0] = path[i];
      const [x1, y1] = path[i + 1];
      const n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0) / STEP));
      for (let k = 0; k < n; k++) out.push([x0 + ((x1 - x0) * k) / n, y0 + ((y1 - y0) * k) / n]);
    }
    out.push(path.at(-1));
  }
  return out;
}

/**
 * Velocidad de la aguja (en «galletas por segundo»: la galleta mide 1). Por encima de MAX_SPEED durante más de
 * FAST_GRACE_MS, grieta (una por cada vez que se acelera, no por cada movimiento). Se mide sobre los últimos
 * SPEED_WINDOW_MS para que un temblor del dedo no cuente.
 */
export const MAX_SPEED = 0.55;
export const FAST_WARN = 0.8; // desde el 80 % del máximo, «¡Más despacio!»
const FAST_GRACE_MS = 250;
const SPEED_WINDOW_MS = 150;
/** Pasadas: hay que repasar la forma entera tres veces (cada pasada, la línea más honda). */
export const LAPS = 3;

/** Repaso de una forma: {shape, points, lap, done[] (de la pasada actual), count, cracks, speed, fast, crack…} */
export function createTrace(shapeId) {
  const points = shapePoints(shapeId);
  return { shape: shapeId, points, lap: 0, done: new Array(points.length).fill(false), count: 0, cracks: 0, outside: false, last: null, samples: [], speed: 0, fast: false, fastFrom: null, fastCracked: false, lastCrack: null };
}

/** Repaso a medias (el móvil se recargó): lo que diga la tele, en % del total, con sus grietas. */
export function restoreTrace(shapeId, pct = 0, cracks = 0) {
  const t = createTrace(shapeId);
  const laps = Math.min(LAPS, (Math.max(0, pct) / 100) * LAPS);
  t.lap = Math.min(LAPS - 1, Math.floor(laps));
  const k = Math.floor(t.points.length * DONE_AT * (laps - t.lap));
  for (let i = 0; i < k; i++) t.done[i] = true;
  t.count = k;
  t.cracks = cracks;
  return t;
}

function touch(trace, x, y) {
  const tol = DALGONA_SHAPES[trace.shape].tol;
  let nearest = Infinity;
  trace.points.forEach(([px, py], i) => {
    const d = Math.hypot(px - x, py - y);
    if (d < nearest) nearest = d;
    if (d <= tol && !trace.done[i]) {
      trace.done[i] = true;
      trace.count++;
    }
  });
  if (nearest <= tol) trace.outside = false;
  else if (nearest > tol * 2 && !trace.outside) {
    trace.outside = true; // cada salida, una grieta
    trace.cracks++;
    trace.lastCrack = 'out';
  }
  // Pasada completa: la siguiente empieza de cero (la línea, más honda)
  if (trace.count / trace.points.length >= DONE_AT) {
    trace.lap++;
    if (trace.lap < LAPS) {
      trace.done.fill(false);
      trace.count = 0;
    }
  }
}

/** Velocidad de la aguja con el toque nuevo (si viene con su hora `t`, en ms); demasiado rápido y seguido → grieta. */
function measure(trace, x, y, t) {
  const s = trace.samples;
  s.push([t, x, y]);
  while (s.length > 2 && t - s[1][0] >= SPEED_WINDOW_MS) s.shift();
  let dist = 0;
  for (let i = 1; i < s.length; i++) dist += Math.hypot(s[i][1] - s[i - 1][1], s[i][2] - s[i - 1][2]);
  const dt = t - s[0][0];
  trace.speed = dt >= 40 ? dist / (dt / 1000) : trace.speed;
  trace.fast = trace.speed > MAX_SPEED * FAST_WARN;
  if (trace.speed > MAX_SPEED) {
    trace.fastFrom ??= t;
    if (!trace.fastCracked && t - trace.fastFrom >= FAST_GRACE_MS) {
      trace.fastCracked = true;
      trace.cracks++;
      trace.lastCrack = 'fast';
    }
  } else if (trace.speed < MAX_SPEED * FAST_WARN) {
    trace.fastFrom = null;
    trace.fastCracked = false;
  }
}

/**
 * El dedo pasa por (x, y) (a la hora `t`, en ms; sin hora no se mide la velocidad): se rellenan también los puntos
 * entre el anterior y este (el dedo va rápido).
 */
export function traceMove(trace, x, y, t = null) {
  if (isBroken(trace) || isDone(trace)) return trace;
  const from = trace.last ?? [x, y];
  const n = Math.max(1, Math.ceil(Math.hypot(x - from[0], y - from[1]) / (STEP / 2)));
  for (let k = 1; k <= n && !isDone(trace); k++) touch(trace, from[0] + ((x - from[0]) * k) / n, from[1] + ((y - from[1]) * k) / n);
  if (t != null && !isBroken(trace)) measure(trace, x, y, t);
  trace.last = [x, y];
  return trace;
}

/** Levanta el dedo: el siguiente toque no se une con este (ni cuenta para la velocidad). */
export function traceLift(trace) {
  trace.last = null;
  trace.outside = false;
  trace.samples = [];
  trace.speed = 0;
  trace.fast = false;
  trace.fastFrom = null;
  trace.fastCracked = false;
  return trace;
}

/** Lo repasado, de 0 a 1, contando las tres pasadas. */
export const traceProgress = (trace) => (trace.lap >= LAPS ? 1 : Math.min(1, (trace.lap + Math.min(1, trace.count / trace.points.length / DONE_AT)) / LAPS));
export const isDone = (trace) => trace.lap >= LAPS;
export const isBroken = (trace) => trace.cracks >= MAX_CRACKS;
