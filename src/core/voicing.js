// Dónde canta una grabación: tramos con voz (tono estable de 150–700 Hz) frente a ruido o silencio. Sirve para los
// archivos de la muñeca de Squid Games que traen la canción y, detrás, el ruido de la cabeza al girar: la canción
// suena en verde y el giro en rojo. Lógica pura (recibe las muestras), con tests.

const STEP_S = 0.05;
const WIN = 1024;
const MIN_HZ = 150;
const MAX_HZ = 700;
const VOICED = 0.85; // autocorrelación normalizada: «aquí canta»
const TAIL = 0.55; // …y con menos, la cola de la última sílaba (que se apaga)
const QUIET_DB = -45;
const LEAD_S = 0.3; // la consonante del principio («Mu») va antes del primer tono
const MAX_S = 30; // las grabaciones de la muñeca son cortas: no se mira más allá

/**
 * @param data Float32Array (un canal)
 * @param sr frecuencia de muestreo
 * @returns {song: [inicio, fin], turn: [inicio, fin] | null} en segundos, o null si no hay voz. `turn` = lo que suena
 *   después de la voz (si dura al menos 0,4 s).
 */
export function splitSong(data, sr) {
  // a 1/2 de resolución basta para la voz (y va el doble de rápido)
  const k = sr > 30000 ? 2 : 1;
  const rate = sr / k;
  const n = Math.min(Math.floor(data.length / k), Math.floor(MAX_S * rate));
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = data[i * k];
  const minLag = Math.floor(rate / MAX_HZ);
  const maxLag = Math.ceil(rate / MIN_HZ);
  const step = Math.round(STEP_S * rate);
  const frames = []; // {t, loud, c}
  for (let i0 = 0; i0 + WIN + maxLag < n; i0 += step) {
    let e0 = 0;
    for (let j = 0; j < WIN; j++) e0 += x[i0 + j] * x[i0 + j];
    const loud = 10 * Math.log10(e0 / WIN + 1e-12) >= QUIET_DB;
    let best = 0;
    if (loud) {
      for (let lag = minLag; lag <= maxLag; lag++) {
        let s = 0;
        let e1 = 0;
        for (let j = 0; j < WIN; j++) {
          const b = x[i0 + j + lag];
          s += x[i0 + j] * b;
          e1 += b * b;
        }
        best = Math.max(best, s / Math.sqrt(e0 * e1 + 1e-12));
      }
    }
    frames.push({ t: i0 / rate, loud, c: best });
  }
  const voiced = frames.map((f, i) => (f.c >= VOICED ? i : -1)).filter((i) => i >= 0);
  if (!voiced.length) return null;
  // principio: el primer sonido justo antes del primer tono
  let a = voiced[0];
  while (a > 0 && frames[a - 1].loud && frames[voiced[0]].t - frames[a - 1].t <= LEAD_S) a--;
  // final: la cola de la última sílaba, mientras aún suena con algo de tono (salvando huecos de 0,1 s)
  let b = voiced.at(-1);
  for (let i = b + 1; i < frames.length && i - b <= 3; i++) if (frames[i].c >= TAIL) b = i;
  const winS = WIN / rate;
  const start = frames[a].t;
  const end = frames[b].t + winS;
  const loudEnd = Math.max(...frames.filter((f) => f.loud).map((f) => f.t + winS));
  return { song: [start, end], turn: loudEnd - end >= 0.4 ? [end, loudEnd] : null };
}
