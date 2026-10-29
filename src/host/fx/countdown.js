// Cuenta atrás 3-2-1 de la tele antes de abrir una pregunta: el número grande cambia (con su sonido) hasta `tOpen`.
import { sound } from './audio.js';

/**
 * @param el     elemento donde se pinta el número
 * @param tOpen  instante de apertura (performance.now())
 * @returns función para pararla
 */
export function startCountdown(el, tOpen) {
  let last = null;
  let timer = 0;
  const step = () => {
    const left = tOpen - performance.now();
    if (left <= 0) return;
    const n = Math.ceil(left / 1000);
    if (n !== last) {
      last = n;
      el.textContent = String(n);
      // reinicia la animación de "latido" del número
      el.classList.remove('beat');
      void el.offsetWidth;
      el.classList.add('beat');
      // si se repinta a mitad (alguien pulsa antes de tiempo), el número que ya sonó no vuelve a sonar
      if (sounded.tOpen !== tOpen || sounded.n !== n) sound.play('count');
      Object.assign(sounded, { tOpen, n });
    }
    timer = setTimeout(step, 40); // no rAF: el navegador lo frena si la ventana no se ve
  };
  step();
  return () => clearTimeout(timer);
}

const sounded = { tOpen: null, n: null }; // el último número que sonó, de qué cuenta atrás

/** ¿Ya hay una cuenta atrás en marcha para esta apertura? (al repintar, se sigue con ella aunque quede poco) */
export const countingFor = (tOpen) => sounded.tOpen === tOpen;
