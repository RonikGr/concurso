// Dibujos de Squid Games (SVG hecho a mano, sin imágenes de la serie): logo ○△□, la muñeca de frente y de espaldas,
// el árbol, los guardias, el cerdito-hucha, las galletas del panal y las formas de la cuenta atrás. Los usan la tele
// y los móviles. Solo devuelven texto SVG fijo (los datos de los jugadores nunca van aquí dentro).
import { DALGONA_SHAPES } from '../core/dalgona.js';

/** Un elemento a partir de su SVG (fijo). */
export function svg(markup, cls = '') {
  const wrap = document.createElement('div');
  wrap.innerHTML = markup.trim();
  const el = wrap.firstElementChild;
  if (cls) el.classList.add(...cls.split(' ').filter(Boolean));
  el.setAttribute('aria-hidden', 'true');
  return el;
}

export const SHAPE_SVG = {
  circle: '<circle cx="50" cy="50" r="38"/>',
  triangle: '<path d="M50 12 L90 84 L10 84 Z"/>',
  square: '<rect x="14" y="14" width="72" height="72"/>',
};

/** ○ △ □ en línea (logo). */
export function logo(cls = 'sq-logo') {
  return svg(
    `<svg viewBox="0 0 330 100" class="${cls}" fill="none" stroke="currentColor" stroke-width="11" stroke-linejoin="round">
      <g transform="translate(0 0)">${SHAPE_SVG.circle}</g>
      <g transform="translate(115 0)">${SHAPE_SVG.triangle}</g>
      <g transform="translate(230 0)">${SHAPE_SVG.square}</g>
    </svg>`,
  );
}

/** Una forma sola (cuenta atrás: 3 □, 2 △, 1 ○). */
export function shape(name, cls = '') {
  return svg(`<svg viewBox="0 0 100 100" class="${cls}" fill="none" stroke="currentColor" stroke-width="7" stroke-linejoin="round">${SHAPE_SVG[name]}</svg>`);
}

/** La muñeca gigante: espaldas (canta) y frente (mira). `data-face` en el contenedor elige cuál se ve. */
export function doll() {
  const body = `
    <rect x="80" y="248" width="13" height="52" rx="5" fill="#efe4d6"/>
    <rect x="107" y="248" width="13" height="52" rx="5" fill="#efe4d6"/>
    <rect x="74" y="294" width="24" height="13" rx="6" fill="#262626"/>
    <rect x="102" y="294" width="24" height="13" rx="6" fill="#262626"/>
    <rect x="50" y="152" width="15" height="74" rx="7.5" fill="#ffd23f"/>
    <rect x="135" y="152" width="15" height="74" rx="7.5" fill="#ffd23f"/>
    <circle cx="57.5" cy="230" r="8" fill="#f6dcc6"/>
    <circle cx="142.5" cy="230" r="8" fill="#f6dcc6"/>
    <path d="M70 146 Q100 136 130 146 L152 262 Q100 276 48 262 Z" fill="#f28c28"/>
    <path d="M70 146 Q100 136 130 146 L134 168 Q100 160 66 168 Z" fill="#ffd23f"/>
    <path d="M60 230 Q100 242 140 230" stroke="#c96a12" stroke-width="3" fill="none"/>`;
  const pigtails = `
    <circle cx="40" cy="74" r="17" fill="#111"/><circle cx="160" cy="74" r="17" fill="#111"/>
    <rect x="49" y="66" width="9" height="12" rx="3" fill="#f2c94c"/><rect x="142" y="66" width="9" height="12" rx="3" fill="#f2c94c"/>`;
  return svg(`
    <div class="sq-doll" data-face="back">
      <svg viewBox="0 0 200 312" class="sq-doll-back">${body}
        <path d="M86 146 L92 200 M114 146 L108 200" stroke="#c96a12" stroke-width="5"/>
        ${pigtails}
        <ellipse cx="100" cy="96" rx="58" ry="60" fill="#121212"/>
        <path d="M60 70 Q100 50 140 70" stroke="#2a2a2a" stroke-width="3" fill="none"/>
      </svg>
      <svg viewBox="0 0 200 312" class="sq-doll-front">${body}
        <rect x="94" y="168" width="12" height="12" rx="6" fill="#fff6"/>
        ${pigtails}
        <ellipse cx="100" cy="99" rx="55" ry="57" fill="#f6dcc6"/>
        <path d="M44 96 Q44 36 100 36 Q156 36 156 96 Q152 70 128 66 L126 78 L118 66 L100 68 L82 66 L74 78 L72 66 Q48 70 44 96 Z" fill="#121212"/>
        <ellipse class="sq-eye" cx="80" cy="104" rx="8.5" ry="11" fill="#151515"/>
        <ellipse class="sq-eye" cx="120" cy="104" rx="8.5" ry="11" fill="#151515"/>
        <circle cx="83" cy="99" r="2.6" fill="#fff"/><circle cx="123" cy="99" r="2.6" fill="#fff"/>
        <circle cx="68" cy="122" r="8" fill="#ff8fa3" opacity=".45"/><circle cx="132" cy="122" r="8" fill="#ff8fa3" opacity=".45"/>
        <path d="M92 132 Q100 137 108 132" stroke="#b5544f" stroke-width="3" fill="none" stroke-linecap="round"/>
      </svg>
    </div>`);
}

/** El árbol seco detrás de la muñeca. */
export function tree() {
  return svg(`
    <svg viewBox="0 0 300 300" class="sq-tree" fill="none" stroke="#4a3426" stroke-linecap="round">
      <path d="M150 300 L150 170" stroke-width="22"/>
      <path d="M150 190 Q120 140 80 120 M150 175 Q180 120 230 100 M150 160 Q150 110 140 60 M80 120 Q60 90 40 85 M80 120 Q70 150 40 160 M230 100 Q250 70 270 60 M230 100 Q250 120 280 125 M140 60 Q120 40 110 20 M140 60 Q160 40 175 30" stroke-width="9"/>
    </svg>`);
}

/** Guardia de rosa con su máscara (○, △ o □). */
export function guard(mark = 'circle') {
  return svg(`
    <svg viewBox="0 0 120 260" class="sq-guard">
      <path d="M22 90 Q60 60 98 90 L104 250 L16 250 Z" fill="#e8306f"/>
      <path d="M60 250 L60 120" stroke="#b51f55" stroke-width="3"/>
      <rect x="20" y="96" width="14" height="80" rx="7" fill="#d12a63"/>
      <rect x="86" y="96" width="14" height="80" rx="7" fill="#d12a63"/>
      <ellipse cx="60" cy="52" rx="34" ry="40" fill="#e8306f"/>
      <ellipse cx="60" cy="56" rx="25" ry="31" fill="#0b0b0b"/>
      <g transform="translate(44 40) scale(0.32)" fill="none" stroke="#f5f5f5" stroke-width="9" stroke-linejoin="round">${SHAPE_SVG[mark]}</g>
    </svg>`);
}

/** La hucha: cerdito de cristal con el oro dentro (la altura del oro va en --fill, de 0 a 1). */
export function piggy() {
  return svg(`
    <svg viewBox="0 0 320 240" class="sq-piggy">
      <defs>
        <clipPath id="sq-pig-body"><ellipse cx="160" cy="130" rx="118" ry="88"/></clipPath>
        <linearGradient id="sq-gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe680"/><stop offset="1" stop-color="#d99a1e"/></linearGradient>
        <radialGradient id="sq-glass" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#ffffff55"/><stop offset=".6" stop-color="#ffffff14"/><stop offset="1" stop-color="#ffffff30"/></radialGradient>
      </defs>
      <path d="M160 -40 L160 44" stroke="#9aa0a8" stroke-width="4"/>
      <circle cx="160" cy="44" r="5" fill="#9aa0a8"/>
      <g clip-path="url(#sq-pig-body)"><rect class="sq-gold" x="40" y="42" width="240" height="180" fill="url(#sq-gold)"/>
        <g class="sq-bills" fill="#ffefa6" opacity=".55"><rect x="70" y="160" width="40" height="18" rx="2"/><rect x="150" y="175" width="40" height="18" rx="2"/><rect x="200" y="150" width="40" height="18" rx="2"/></g>
      </g>
      <ellipse cx="160" cy="130" rx="118" ry="88" fill="url(#sq-glass)" stroke="#ffffffaa" stroke-width="4"/>
      <ellipse cx="272" cy="132" rx="20" ry="24" fill="#f6c3cf55" stroke="#ffffffaa" stroke-width="4"/>
      <circle cx="267" cy="126" r="4" fill="#fff9"/><circle cx="277" cy="138" r="4" fill="#fff9"/>
      <path d="M200 58 L226 16 L244 66 Z" fill="#f6c3cf55" stroke="#ffffffaa" stroke-width="4" stroke-linejoin="round"/>
      <path d="M120 54 L140 20 L160 52 Z" fill="#f6c3cf44" stroke="#ffffffaa" stroke-width="4" stroke-linejoin="round"/>
      <rect x="140" y="40" width="44" height="7" rx="3" fill="#0008"/>
      <path d="M92 196 L92 232 Q103 238 114 232 L114 206" fill="#f6c3cf44" stroke="#ffffffaa" stroke-width="3"/>
      <path d="M206 206 L206 232 Q217 238 228 232 L228 196" fill="#f6c3cf44" stroke="#ffffffaa" stroke-width="3"/>
      <path d="M40 120 Q20 112 26 96 Q34 88 40 100" fill="none" stroke="#ffffffaa" stroke-width="4" stroke-linecap="round"/>
      <circle cx="236" cy="104" r="6" fill="#111"/>
    </svg>`);
}

/** Trazo SVG (viewBox 0–100) de una forma del panal. */
export function shapePath(shapeId) {
  const s = DALGONA_SHAPES[shapeId];
  if (!s) return '';
  return s.paths.map((pts) => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${(x * 100).toFixed(1)} ${(y * 100).toFixed(1)}`).join(' ')).join(' ');
}

/** Galleta del panal con su forma (tallada hasta `--carved` vía pathLength) y sus grietas. */
export function cookie(shapeId, seed = 1) {
  const d = shapePath(shapeId);
  // tres grietas «al azar» pero siempre las mismas para cada jugador
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const cracks = [0, 1, 2]
    .map((k) => {
      const a = rnd() * Math.PI * 2;
      let x = 50 + Math.cos(a) * 46;
      let y = 50 + Math.sin(a) * 46;
      let path = `M${x.toFixed(1)} ${y.toFixed(1)}`;
      for (let i = 0; i < 4; i++) {
        x += (50 - x) * 0.28 + (rnd() - 0.5) * 12;
        y += (50 - y) * 0.28 + (rnd() - 0.5) * 12;
        path += ` L${x.toFixed(1)} ${y.toFixed(1)}`;
      }
      return `<path class="sq-crack c${k + 1}" d="${path}" pathLength="100"/>`;
    })
    .join('');
  return svg(`
    <svg viewBox="0 0 100 100" class="sq-cookie-svg">
      <defs><radialGradient id="sq-caramel" cx=".4" cy=".35" r=".75"><stop offset="0" stop-color="#f2c46b"/><stop offset=".75" stop-color="#d89a3c"/><stop offset="1" stop-color="#a8691f"/></radialGradient></defs>
      <circle cx="50" cy="50" r="48" fill="url(#sq-caramel)"/>
      <circle cx="50" cy="50" r="48" fill="none" stroke="#8a5216" stroke-width="1.5" opacity=".6"/>
      <path d="${d}" fill="none" stroke="#9b5d18" stroke-width="3.2" stroke-linejoin="round" stroke-linecap="round" opacity=".85"/>
      <path class="sq-carved" d="${d}" pathLength="100" fill="none" stroke="#fff3cf" stroke-width="3.6" stroke-linejoin="round" stroke-linecap="round"/>
      <g fill="none" stroke="#3a1d05" stroke-width="1.6" stroke-linecap="round">${cracks}</g>
    </svg>`);
}

/** Número del jugador con sus tres cifras (como en el chándal). */
export const numText = (n) => (n == null ? '' : String(n).padStart(3, '0'));
