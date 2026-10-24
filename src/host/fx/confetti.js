// Confeti de Halloween sobre toda la tele: calabazas, murciélagos, caramelos y fantasmas, más tiras de papel
// naranja, violeta y verde. Un solo canvas que solo dibuja mientras quedan partículas.
import { reducedMotion } from './motion.js';

const GLYPHS = ['🎃', '🦇', '🍬', '👻', '🕷️', '🍭', '💀', '🕸️'];
const PAPER = ['#ff8a1f', '#ffb347', '#a66bff', '#7dff6b', '#ff3d5a', '#f6f1ff'];

let canvas = null;
let ctx = null;
let parts = [];
let running = false;
let lite = false; // calidad ligera (fondo.js): la mitad de confeti

/** Calidad ligera: menos partículas (la tele la pone cuando va justa). */
export function setLite(on) {
  lite = !!on;
}
const sprites = new Map(); // emoji → canvas pre-dibujado (dibujar texto en cada fotograma es lento)

function ensureCanvas() {
  if (canvas) return;
  canvas = document.createElement('canvas');
  canvas.className = 'confetti-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.append(canvas);
  ctx = canvas.getContext('2d');
  const resize = () => {
    canvas.width = innerWidth * devicePixelRatio;
    canvas.height = innerHeight * devicePixelRatio;
  };
  addEventListener('resize', resize);
  resize();
}

function sprite(glyph) {
  if (sprites.has(glyph)) return sprites.get(glyph);
  const size = 96;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.font = `${size * 0.8}px 'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji',sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(glyph, size / 2, size / 2 + size * 0.05);
  sprites.set(glyph, c);
  return c;
}

function spawn(x, y, { spread = Math.PI / 2.2, angle = -Math.PI / 2, speed = 18, glyph = Math.random() < 0.35 } = {}) {
  if (lite && Math.random() < 0.5) return;
  const a = angle + (Math.random() - 0.5) * spread;
  const v = speed * (0.55 + Math.random() * 0.6) * devicePixelRatio;
  parts.push({
    x,
    y,
    vx: Math.cos(a) * v,
    vy: Math.sin(a) * v,
    rot: Math.random() * Math.PI * 2,
    vr: (Math.random() - 0.5) * 0.3,
    size: (glyph ? 34 + Math.random() * 26 : 9 + Math.random() * 8) * devicePixelRatio,
    glyph: glyph ? GLYPHS[(Math.random() * GLYPHS.length) | 0] : null,
    color: PAPER[(Math.random() * PAPER.length) | 0],
    wobble: Math.random() * 10,
    life: 0,
  });
}

/** Explosión desde un punto (en proporción de la pantalla: 0..1). */
export function burst({ x = 0.5, y = 0.6, count = 90, speed = 20 } = {}) {
  if (reducedMotion) return;
  ensureCanvas();
  for (let i = 0; i < count; i++) spawn(x * canvas.width, y * canvas.height, { speed, spread: Math.PI * 0.9 });
  start();
}

/** Dos cañones desde las esquinas inferiores y una lluvia desde arriba durante `ms`. */
export function celebrate(ms = 3500) {
  if (reducedMotion) return;
  ensureCanvas();
  const w = canvas.width;
  const hgt = canvas.height;
  for (let i = 0; i < 70; i++) spawn(0, hgt, { angle: -Math.PI / 3, spread: 0.6, speed: 30 });
  for (let i = 0; i < 70; i++) spawn(w, hgt, { angle: (-2 * Math.PI) / 3, spread: 0.6, speed: 30 });
  const end = performance.now() + ms;
  const rain = () => {
    if (performance.now() > end) return;
    for (let i = 0; i < 4; i++) spawn(Math.random() * w, -40, { angle: Math.PI / 2, spread: 0.5, speed: 3 });
    setTimeout(rain, 60);
  };
  rain();
  start();
}

export function clearConfetti() {
  parts = [];
}

function start() {
  if (running) return;
  running = true;
  requestAnimationFrame(frame);
}

function frame() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const g = 0.42 * devicePixelRatio;
  parts = parts.filter((p) => p.y < canvas.height + 80 && p.life < 900);
  for (const p of parts) {
    p.life++;
    p.vx *= 0.985;
    p.vy = p.vy * 0.985 + g;
    if (!p.glyph) p.vy = Math.min(p.vy, 4.5 * devicePixelRatio); // el papel planea
    p.x += p.vx + Math.sin(p.life * 0.08 + p.wobble) * (p.glyph ? 0.4 : 1.6);
    p.y += p.vy;
    p.rot += p.vr;
    // Posición y giro de una vez (más barato que save/translate/rotate/restore por partícula)
    const cos = Math.cos(p.rot);
    const sin = Math.sin(p.rot);
    if (p.glyph) {
      ctx.setTransform(cos, sin, -sin, cos, p.x, p.y);
      ctx.drawImage(sprite(p.glyph), -p.size / 2, -p.size / 2, p.size, p.size);
    } else {
      const k = Math.cos(p.life * 0.15 + p.wobble); // giro del papel
      ctx.setTransform(cos, sin, -sin * k, cos * k, p.x, p.y);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
    }
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (parts.length) requestAnimationFrame(frame);
  else {
    running = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
}
