// Aspecto de las opciones de respuesta, igual en la tele y en los móviles: color + forma + letra,
// para que se distingan aunque alguien no vea bien los colores.
// Sin rojo ni azul (los de Vampiros y Hombres lobo) ni ningún color de equipo de shared/appearance.js tal cual: una
// opción no puede parecer un equipo. Texto blanco o casi negro según el fondo (contraste ≥ 4,5).
const VIOLET = '#6a3de8';
const AMBER = '#f2a900';
const TEAL = '#00796b';
const PINK = '#c2338c';
const GREEN = '#26890c';

const CHOICES = [
  { letter: 'A', shape: '▲', bg: VIOLET, fg: '#ffffff' },
  { letter: 'B', shape: '◆', bg: AMBER, fg: '#111111' },
  { letter: 'C', shape: '●', bg: TEAL, fg: '#ffffff' },
  { letter: 'D', shape: '■', bg: PINK, fg: '#ffffff' },
];

const TRUE_FALSE = [
  { letter: 'V', shape: '✓', bg: GREEN, fg: '#ffffff' },
  { letter: 'M', shape: '✗', bg: VIOLET, fg: '#ffffff' },
];

const STATEMENTS = [
  { letter: '1', shape: '1', bg: TEAL, fg: '#ffffff' },
  { letter: '2', shape: '2', bg: VIOLET, fg: '#ffffff' },
  { letter: '3', shape: '3', bg: AMBER, fg: '#111111' },
];

export function optionStyle(kind, index) {
  if (kind === 'verdad') return TRUE_FALSE[index];
  if (kind === 'dosVerdades') return STATEMENTS[index];
  return CHOICES[index];
}

/** Lo que pide cada tipo de sección, para la tele y el móvil. */
export const ANSWER_PROMPT = {
  test: 'Elige la respuesta correcta',
  verdad: '¿Verdad o mentira?',
  dosVerdades: '¿Cuál es la mentira?',
  votacion: 'Vota a un jugador',
  estimacion: 'Escribe un número',
};
