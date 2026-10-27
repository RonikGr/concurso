// El panal (dalgona) de Squid Games: las formas y el repaso con el dedo. Lógica pura (la usa el móvil; la prueban
// los tests). Coordenadas de 0 a 1 (el móvil las escala a su lienzo).
//
// Repasar = pasar el dedo cerca de la línea: cada punto de la forma por el que pasas queda «hecho». Salirse mucho de la
// línea agrieta la galleta (una grieta por cada salida, no por cada movimiento); a la tercera, se rompe.

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

/** Repaso de una forma: {shape, points, done[], cracks, outside, last} */
export function createTrace(shapeId) {
  const points = shapePoints(shapeId);
  return { shape: shapeId, points, done: new Array(points.length).fill(false), count: 0, cracks: 0, outside: false, last: null };
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
  }
}

/** El dedo pasa por (x, y): se rellenan también los puntos entre el anterior y este (el dedo va rápido). */
export function traceMove(trace, x, y) {
  if (isBroken(trace) || isDone(trace)) return trace;
  const from = trace.last ?? [x, y];
  const n = Math.max(1, Math.ceil(Math.hypot(x - from[0], y - from[1]) / (STEP / 2)));
  for (let k = 1; k <= n; k++) touch(trace, from[0] + ((x - from[0]) * k) / n, from[1] + ((y - from[1]) * k) / n);
  trace.last = [x, y];
  return trace;
}

/** Levanta el dedo: el siguiente toque no se une con este. */
export function traceLift(trace) {
  trace.last = null;
  trace.outside = false;
  return trace;
}

export const traceProgress = (trace) => trace.count / trace.points.length;
export const isDone = (trace) => traceProgress(trace) >= DONE_AT;
export const isBroken = (trace) => trace.cracks >= MAX_CRACKS;
