// Fondo animado de la tele: un shader de pantalla completa que pinta el entorno de Halloween de cada sección
// (cielo, luna, niebla, siluetas, partículas, murciélagos y relámpagos). Sin imágenes: todo es procedural.
// Al cambiar de entorno, los colores se funden y las siluetas cambian en mitad de un oscurecimiento.
import { getEnv } from '../../shared/environments.js';

const VERTEX = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const FRAGMENT = `
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform vec3 uTop, uBot, uFog, uGlow, uPartCol;
uniform float uFogAmt, uMoon, uSil, uPart, uBats, uFlash, uDim, uHorizon;
uniform vec2 uBolt; // relámpago: x y semilla

const float PI = 3.14159265;

float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0; float a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }
  return v;
}
float sdSeg(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a; vec2 ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h); }
float sdBox(vec2 p, vec2 b) { vec2 d = abs(p) - b; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }
float hill(float x, float base, float amp, float seed) {
  return base + amp * (sin(x * 2.1 + seed) * 0.5 + sin(x * 5.3 + seed * 2.0) * 0.25) + (fbm(vec2(x * 1.5, seed)) - 0.5) * amp;
}
// Pirámide (tejado de torre): dentro si está sobre 'y0' y bajo la recta que sube hasta el pico.
float spire(vec2 p, float x0, float y0, float w, float h) { return step(y0, p.y) * step(abs(p.x - x0), w * (1.0 - (p.y - y0) / h)); }

// ---------------- Siluetas (1 = sólido) ----------------
float graves(vec2 p) {
  float g = hill(p.x, -0.31, 0.05, 1.0);
  float m = step(p.y, g);
  float w = 0.3;
  float cx = floor((p.x + 10.0) / w);
  vec2 q = vec2(mod(p.x + 10.0, w) - w * 0.5, p.y - g);
  float r = hash(vec2(cx, 3.0));
  if (r > 0.2) {
    float h = 0.09 + 0.09 * hash(vec2(cx, 7.0));
    float bw = 0.035 + 0.02 * hash(vec2(cx, 9.0));
    q.x += (hash(vec2(cx, 11.0)) - 0.5) * 0.1;
    float a = (hash(vec2(cx, 13.0)) - 0.5) * 0.3;
    q = mat2(cos(a), -sin(a), sin(a), cos(a)) * q;
    float d;
    if (r > 0.72) d = min(sdBox(q - vec2(0.0, h * 0.6), vec2(0.008, h * 0.6)), sdBox(q - vec2(0.0, h * 0.85), vec2(0.035, 0.008)));
    else d = min(sdBox(q - vec2(0.0, h * 0.5), vec2(bw, h * 0.5)), length(q - vec2(0.0, h)) - bw);
    m = max(m, step(d, 0.0));
  }
  return m;
}

float tree(vec2 p, vec2 base, float s) {
  vec2 q = (p - base) / s;
  float d = sdSeg(q, vec2(0.0, 0.0), vec2(0.02, 0.55)) - mix(0.045, 0.012, clamp(q.y / 0.55, 0.0, 1.0));
  d = min(d, sdSeg(q, vec2(0.01, 0.25), vec2(0.22, 0.45)) - 0.012);
  d = min(d, sdSeg(q, vec2(0.15, 0.38), vec2(0.2, 0.6)) - 0.007);
  d = min(d, sdSeg(q, vec2(0.015, 0.35), vec2(-0.2, 0.52)) - 0.011);
  d = min(d, sdSeg(q, vec2(-0.12, 0.44), vec2(-0.26, 0.47)) - 0.006);
  d = min(d, sdSeg(q, vec2(0.02, 0.5), vec2(0.1, 0.68)) - 0.007);
  d = min(d, sdSeg(q, vec2(-0.1, 0.47), vec2(-0.08, 0.62)) - 0.005);
  return d * s;
}
float trees(vec2 p, float aspect) {
  float g = hill(p.x, -0.34, 0.04, 4.0);
  float m = step(p.y, g);
  float e = aspect * 0.5;
  float d = tree(p, vec2(-e + 0.15, -0.36), 1.0);
  d = min(d, tree(vec2(-p.x, p.y), vec2(-e + 0.2, -0.36), 0.85));
  d = min(d, tree(p, vec2(-0.25, -0.34), 0.45));
  d = min(d, tree(vec2(-p.x, p.y), vec2(-0.35, -0.33), 0.38));
  return max(m, step(d, 0.0));
}

float castle(vec2 p, out float windows) {
  float g = hill(p.x, -0.3, 0.06, 2.0);
  float m = step(p.y, g);
  vec2 c = p - vec2(0.5, -0.16);
  // el cuerpo baja hasta el suelo (si no, el castillo flota sobre las colinas)
  float d = sdBox(c - vec2(0.0, -0.1), vec2(0.17, 0.17));
  d = min(d, sdBox(c - vec2(-0.14, 0.0), vec2(0.03, 0.23)));
  d = min(d, sdBox(c - vec2(0.15, 0.0), vec2(0.035, 0.19)));
  d = min(d, sdBox(c - vec2(0.0, 0.05), vec2(0.05, 0.16)));
  // almenas del cuerpo central
  float merlons = step(0.07, c.y) * step(c.y, 0.09) * step(abs(c.x), 0.17) * step(0.5, fract(c.x * 30.0));
  float s = max(spire(c, -0.14, 0.23, 0.045, 0.12), max(spire(c, 0.15, 0.19, 0.05, 0.13), spire(c, 0.0, 0.21, 0.065, 0.16)));
  m = max(m, max(step(d, 0.0), max(merlons, s)));
  // ventanas encendidas (parpadean)
  vec2 wq = vec2(mod(c.x + 0.2, 0.06) - 0.03, c.y);
  float win = step(abs(wq.x), 0.008) * step(abs(c.y + 0.01), 0.018) * step(abs(c.x), 0.15);
  win = max(win, step(abs(c.x + 0.14), 0.008) * step(abs(c.y - 0.15), 0.014));
  win = max(win, step(abs(c.x), 0.012) * step(abs(c.y - 0.13), 0.02));
  win = max(win, step(abs(c.x - 0.15), 0.009) * step(abs(c.y - 0.1), 0.014));
  float flick = 0.7 + 0.3 * noise(vec2(floor(c.x * 16.0), uTime * 3.0));
  windows = win * flick * step(d, 0.0);
  return m;
}

float pumpkins(vec2 p, out float face) {
  float g = hill(p.x, -0.35, 0.03, 6.0);
  float m = step(p.y, g);
  face = 0.0;
  float w = 0.42;
  float cx = floor((p.x + 10.0) / w);
  vec2 q = vec2(mod(p.x + 10.0, w) - w * 0.5, p.y - g);
  float s = 0.05 + 0.035 * hash(vec2(cx, 2.0));
  q.x += (hash(vec2(cx, 5.0)) - 0.5) * 0.14;
  vec2 pc = q - vec2(0.0, s * 0.75);
  float body = length(pc * vec2(0.82, 1.0)) - s;
  float stem = sdBox(pc - vec2(0.02 * s, s * 1.05), vec2(s * 0.12, s * 0.22));
  float inside = step(min(body, stem), 0.0);
  vec2 e = pc / s;
  float eyes = step(length((vec2(abs(e.x), e.y) - vec2(0.38, 0.18)) * vec2(1.0, 1.4)), 0.2);
  float mouth = step(abs(e.y + 0.3 + 0.12 * cos(e.x * 3.0)), 0.09) * step(abs(e.x), 0.55) * step(0.5, fract(e.x * 3.0 + 0.25));
  face = step(body, 0.0) * max(eyes, mouth) * (0.8 + 0.2 * noise(vec2(cx, uTime * 4.0)));
  return max(m, inside * 0.999); // 0.999 para distinguir la calabaza del suelo al colorear
}

float hills(vec2 p) {
  float far = step(p.y, hill(p.x * 0.7, -0.22, 0.07, 8.0));
  float near = step(p.y, hill(p.x, -0.33, 0.05, 3.0));
  return max(far * 0.6, near);
}

// Cripta: columnas con bóvedas, suelo, un sarcófago y dos velas.
float crypt(vec2 p, out vec3 emit) {
  float w = 0.5;
  float lx = mod(p.x + 10.0, w) - w * 0.5;
  float col = step(abs(lx), 0.035) * step(p.y, 0.5);
  float archTop = 0.26 + 0.14 * (1.0 - pow(abs(lx) / (w * 0.5), 2.0));
  float m = max(max(col, step(archTop, p.y)), step(p.y, -0.36));
  // sarcófago en el centro
  vec2 s = p - vec2(0.0, -0.33);
  float d = sdBox(s, vec2(0.2, 0.05));
  d = min(d, sdBox(s - vec2(0.0, 0.06), vec2(0.22, 0.012)));
  d = min(d, sdBox(s - vec2(0.0, 0.08), vec2(0.03, 0.008)));
  m = max(m, step(d, 0.0));
  // velas a los lados
  emit = vec3(0.0);
  for (int i = 0; i < 2; i++) {
    float x = i == 0 ? -0.36 : 0.36;
    vec2 c = p - vec2(x, -0.36);
    m = max(m, step(sdBox(c - vec2(0.0, 0.045), vec2(0.012, 0.045)), 0.0));
    float fl = 0.85 + 0.15 * sin(uTime * 13.0 + float(i) * 3.0) * noise(vec2(uTime * 5.0, float(i)));
    vec2 f = (c - vec2(0.0, 0.105)) * vec2(1.0, 0.55);
    emit += vec3(1.0, 0.75, 0.4) * (smoothstep(0.014, 0.0, length(f)) * 1.5 + 0.18 * exp(-length(c - vec2(0.0, 0.1)) * 9.0)) * fl;
  }
  return m;
}

// Laboratorio: matraces y probetas en una mesa, con pociones que brillan y burbujean.
float lab(vec2 p, out vec3 emit) {
  emit = vec3(0.0);
  float table = -0.3;
  float m = step(p.y, table) * step(-0.5, p.y);
  float w = 0.42;
  float cx = floor((p.x + 10.0) / w);
  float lx = mod(p.x + 10.0, w) - w * 0.5 + (hash(vec2(cx, 1.0)) - 0.5) * 0.12;
  vec2 q = vec2(lx, p.y - table);
  float kind = hash(vec2(cx, 4.0));
  float level = 0.45 + 0.3 * hash(vec2(cx, 6.0)) + 0.02 * sin(uTime * 2.0 + cx);
  float d;
  float liquid;
  if (kind < 0.4) {
    // matraz redondo
    float r = 0.07 + 0.03 * hash(vec2(cx, 8.0));
    d = min(length(q - vec2(0.0, r)) - r, sdBox(q - vec2(0.0, r * 2.2), vec2(0.016, r * 0.8)));
    liquid = step(length(q - vec2(0.0, r)), r * 0.9) * step(q.y, r * 2.0 * level);
  } else if (kind < 0.75) {
    // Erlenmeyer (cónico)
    float hh = 0.15;
    float hw = mix(0.085, 0.018, clamp(q.y / hh, 0.0, 1.0));
    d = max(abs(q.x) - hw, max(-q.y, q.y - hh));
    d = min(d, sdBox(q - vec2(0.0, hh + 0.03), vec2(0.018, 0.035)));
    liquid = step(abs(q.x), hw - 0.008) * step(0.006, q.y) * step(q.y, hh * level);
  } else {
    // probetas en su soporte
    float tx = mod(q.x + 0.06, 0.04) - 0.02;
    float tubes = step(abs(q.x), 0.06);
    d = max(sdBox(vec2(tx, q.y - 0.09), vec2(0.009, 0.09)), -tubes + 0.5);
    d = min(d, sdBox(q - vec2(0.0, 0.11), vec2(0.075, 0.006)));
    liquid = tubes * step(abs(tx), 0.006) * step(0.01, q.y) * step(q.y, 0.17 * level);
  }
  m = max(m, step(d, 0.0));
  // pequeñas burbujas en el líquido
  vec2 b = vec2(lx * 40.0, (q.y - uTime * 0.08) * 40.0);
  float bub = step(0.85, hash(floor(b))) * step(length(fract(b) - 0.5), 0.25);
  float glow = liquid * (0.9 + 0.3 * bub) + 0.15 * exp(-max(d, 0.0) * 28.0) * step(q.y, 0.24);
  emit = uGlow * glow * (0.85 + 0.15 * sin(uTime * 3.0 + cx * 2.0));
  return m;
}

// Aquelarre: un caldero en el fuego, sobre las colinas.
float cauldron(vec2 p, out vec3 emit) {
  float m = hills(p);
  vec2 c = p - vec2(0.0, -0.26);
  float body = length(c * vec2(0.85, 1.0)) - 0.12;
  body = max(body, c.y - 0.08);
  float rim = sdBox(c - vec2(0.0, 0.085), vec2(0.115, 0.014));
  float legs = min(sdSeg(c, vec2(-0.08, -0.08), vec2(-0.11, -0.16)), sdSeg(c, vec2(0.08, -0.08), vec2(0.11, -0.16))) - 0.012;
  float d = min(min(body, rim), legs);
  m = max(m, step(d, 0.0));
  // poción burbujeante (verde) en la boca y fuego debajo
  vec2 top = (c - vec2(0.0, 0.1)) * vec2(1.0, 3.5);
  float surface = smoothstep(0.11, 0.09, length(top)) * step(0.0, c.y - 0.085);
  vec3 potion = vec3(0.45, 1.0, 0.35);
  emit = potion * (surface * (0.9 + 0.2 * sin(uTime * 4.0 + c.x * 60.0)) + 0.45 * exp(-length(c - vec2(0.0, 0.14)) * 10.0) * step(0.08, c.y));
  float fy = c.y + 0.17;
  float flame = smoothstep(0.0, 0.06, fy) * smoothstep(0.16, 0.0, fy) * smoothstep(0.13, 0.0, abs(c.x));
  flame *= smoothstep(0.35, 0.75, fbm(vec2(c.x * 14.0, c.y * 9.0 - uTime * 3.5)) + 0.25 * (1.0 - fy * 6.0));
  emit += vec3(1.0, 0.45, 0.1) * flame * 2.0;
  return m;
}

// Plató millonario: suelo brillante con anillos de luz, focos que barren el escenario y paneles al fondo.
float stage(vec2 p, float aspect, out vec3 emit) {
  emit = vec3(0.0);
  float t = uTime;
  // suelo: elipse de luz en el centro con anillos que se expanden
  float floorY = -0.22;
  float isFloor = step(p.y, floorY);
  vec2 q = (p - vec2(0.0, -0.4)) * vec2(1.0, 3.4);
  float r = length(q);
  float rings = smoothstep(0.05, 0.0, abs(fract(r * 3.0 - t * 0.25) - 0.5) - 0.42) * smoothstep(1.2, 0.2, r);
  float disc = smoothstep(0.55, 0.0, r);
  emit += isFloor * (uGlow * (0.35 * rings + 0.45 * disc) + vec3(0.25, 0.35, 1.0) * 0.12 * smoothstep(1.6, 0.0, r));
  // reflejo de los focos en el suelo
  emit += isFloor * vec3(0.2, 0.3, 0.9) * 0.15 * (0.5 + 0.5 * sin(p.x * 9.0 + t));
  // paneles de luz al fondo (rejilla de rombos que respira)
  vec2 g = vec2(p.x * 7.0, (p.y - floorY) * 7.0);
  vec2 cell = abs(fract(g + vec2(0.5 * floor(g.y), 0.0)) - 0.5);
  float diamond = smoothstep(0.06, 0.0, abs(cell.x + cell.y - 0.45));
  float wall = (1.0 - isFloor) * smoothstep(0.55, floorY, p.y);
  emit += wall * diamond * vec3(0.25, 0.4, 1.0) * (0.25 + 0.2 * sin(t * 1.3 + floor(g.x) * 0.7 + floor(g.y)));
  // focos: haces que salen de arriba y barren
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    vec2 src = vec2((fi - 1.5) * aspect * 0.28, 0.6);
    float ang = sin(t * (0.35 + fi * 0.07) + fi * 1.7) * 0.45;
    vec2 dir = vec2(sin(ang), -cos(ang));
    vec2 d = p - src;
    float along = dot(d, dir);
    float across = abs(d.x * dir.y - d.y * dir.x);
    float beam = smoothstep(0.03 + along * 0.18, 0.0, across) * step(0.0, along) * smoothstep(1.4, 0.2, along);
    emit += beam * mix(vec3(0.5, 0.7, 1.0), vec3(1.0, 0.85, 0.5), step(1.5, fi) * step(fi, 2.5)) * 0.22;
  }
  return isFloor * 0.85;
}

// Tormenta: un árbol seco solitario en lo alto de una loma.
float loneTree(vec2 p, float aspect) {
  float m = max(hills(p), step(length((p - vec2(aspect * 0.22, -0.62)) * vec2(0.6, 1.0)), 0.35));
  return max(m, step(tree(p, vec2(aspect * 0.22, -0.28), 0.95), 0.0));
}

// Telaraña en la esquina superior izquierda (líneas claras) y la araña colgando (silueta).
float web(vec2 p, float aspect, out float spiderMask) {
  vec2 c = p - vec2(-aspect * 0.5, 0.5);
  float r = length(c);
  float a = atan(-c.y, c.x);
  float k = PI / 2.0 / 8.0;
  float inQuad = step(0.0, a) * step(a, PI * 0.5);
  float spokes = smoothstep(0.004, 0.0, abs(mod(a + k * 0.5, k) - k * 0.5) * r) * step(r, 0.95) * inQuad;
  // anillos rectos entre radio y radio, con un poco de comba
  float off = mod(a + k * 0.5, k) - k * 0.5;
  float rr = r * cos(off) / cos(k * 0.5) * (1.0 + 0.04 * (1.0 - abs(off) / (k * 0.5)));
  float rings = smoothstep(0.005, 0.0, abs(fract(rr * 8.0) - 0.5) / 8.0) * step(r, 0.9) * step(0.06, r) * inQuad;
  float sy = -0.4 + 0.035 * sin(uTime * 0.7);
  vec2 s = c - vec2(0.42, sy);
  float d = length(s * vec2(1.0, 0.85)) - 0.022;
  d = min(d, length(s - vec2(0.0, 0.03)) - 0.013);
  vec2 sl = vec2(abs(s.x), s.y);
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    vec2 a0 = vec2(0.012, 0.01 - fi * 0.008);
    vec2 a1 = vec2(0.04 + fi * 0.004, 0.035 - fi * 0.02);
    vec2 a2 = vec2(0.055 + fi * 0.006, -0.01 - fi * 0.022);
    d = min(d, min(sdSeg(sl, a0, a1), sdSeg(sl, a1, a2)) - 0.003);
  }
  spiderMask = step(d, 0.0);
  float thread = smoothstep(0.0025, 0.0, abs(c.x - 0.42)) * step(sy, c.y);
  return max(max(spokes, rings) * 0.55, thread * 0.5);
}

float bat(vec2 p, vec2 c, float s, float flap) {
  vec2 q = (p - c) / s;
  q.x = abs(q.x);
  float body = step(length(q * vec2(1.6, 1.0)), 0.22);
  float ears = step(sdSeg(q, vec2(0.07, 0.12), vec2(0.11, 0.3)), 0.04);
  float top = 0.1 + flap * 0.55 * q.x - 0.25 * q.x * q.x;
  // borde inferior festoneado entre las "varillas" del ala
  float bottom = top - 0.42 + 0.25 * abs(sin(q.x * PI * 1.5));
  float wing = step(q.x, 1.05) * step(q.y, top) * step(bottom, q.y);
  return max(max(body, ears), wing);
}

// ---------------- Partículas ----------------
vec3 particles(vec2 p) {
  vec3 acc = vec3(0.0);
  for (int L = 0; L < 2; L++) {
    float fl = float(L);
    float scale = 6.0 + fl * 5.0;
    vec2 vel = vec2(0.12, 0.08);
    if (uPart == 2.0) vel = vec2(0.08, -0.45);
    if (uPart == 3.0) vel = vec2(0.0, -0.35);
    if (uPart == 4.0) vel = vec2(-0.25, 2.4);
    if (uPart == 5.0) vel = vec2(0.2, -0.8);
    if (uPart == 6.0) vel = vec2(0.05, 0.12);
    vec2 q = p * scale + vel * uTime * (1.0 + fl * 0.6);
    vec2 id = floor(q);
    vec2 f = fract(q) - 0.5;
    float h = hash(id + fl * 17.0);
    float density = uPart == 4.0 ? 0.55 : (uPart == 6.0 ? 0.45 : 0.22);
    if (h > density) continue;
    vec2 off = (vec2(hash(id + 3.0), hash(id + 5.0)) - 0.5) * 0.6;
    if (uPart != 4.0) off += 0.15 * vec2(sin(uTime * (1.0 + h * 2.0) + h * 20.0), cos(uTime * (1.3 + h) + h * 10.0));
    vec2 d2 = f - off;
    float glow;
    if (uPart == 4.0) {
      glow = smoothstep(0.03, 0.0, abs(d2.x + d2.y * 0.1)) * smoothstep(0.35, 0.0, abs(d2.y)) * 0.45;
    } else if (uPart == 3.0) {
      float d = length(d2); float s = 0.06 + 0.06 * h;
      glow = smoothstep(0.012, 0.0, abs(d - s)) * 0.9 + smoothstep(s, 0.0, d) * 0.12;
    } else {
      float d = length(d2);
      float s = (uPart == 6.0 ? 0.015 : 0.035) + 0.03 * h;
      glow = smoothstep(s, 0.0, d) + 0.35 * exp(-d * 14.0);
      if (uPart == 1.0) glow *= 0.5 + 0.5 * sin(uTime * 2.5 + h * 40.0);
      if (uPart == 2.0 || uPart == 5.0) glow *= 0.6 + 0.4 * sin(uTime * 8.0 + h * 30.0);
    }
    acc += glow * uPartCol * (1.0 - fl * 0.35);
  }
  return acc;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  float aspect = uRes.x / uRes.y;
  vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  float t = uTime;

  // cielo + estrellas
  vec3 col = mix(uBot, uTop, smoothstep(-0.1, 1.0, uv.y));
  vec2 sg = floor(gl_FragCoord.xy / 2.5);
  float star = step(0.9965, hash(sg)) * (0.55 + 0.45 * sin(t * 2.0 + hash(sg + 7.0) * 30.0)) * smoothstep(0.35, 1.0, uv.y);
  col += star * 0.7 * (1.0 - uFogAmt * 0.6);

  // nubes / niebla alta
  float clouds = fbm(vec2(p.x * 1.2 + t * 0.015, p.y * 2.5 - t * 0.008) + 3.0);
  col = mix(col, uFog * 0.55, smoothstep(0.45, 0.95, clouds) * uFogAmt * 0.7);

  // luna con halo
  if (uMoon > 0.0) {
    vec2 mp = p - vec2(aspect * 0.28, 0.25);
    float d = length(mp);
    float disk = smoothstep(0.105, 0.1, d);
    float craters = fbm(mp * 16.0 + 4.0);
    vec3 moonCol = mix(uGlow, uGlow * 0.6, smoothstep(0.4, 0.7, craters));
    col = mix(col, moonCol, disk * uMoon);
    col += uGlow * 0.32 * exp(-d * 5.5) * uMoon;
    // nubes que cruzan la luna
    col = mix(col, uFog * 0.35, smoothstep(0.55, 0.8, fbm(vec2(p.x * 3.0 - t * 0.04, p.y * 6.0))) * disk * 0.6);
  }

  // murciélagos
  if (uBats > 0.0) {
    for (int i = 0; i < 4; i++) {
      float fi = float(i);
      float span = aspect + 0.6;
      vec2 c = vec2(mod(t * (0.07 + 0.02 * fi) + fi * 0.73, span) - span * 0.5, 0.18 + 0.12 * sin(t * 0.6 + fi * 2.1) + fi * 0.04);
      float flap = 0.4 + 0.6 * sin(t * (10.0 + fi * 2.0) + fi);
      col = mix(col, vec3(0.01, 0.005, 0.02), bat(p, c, 0.045 + 0.014 * fi, flap) * uBats);
    }
  }

  // resplandor del horizonte (hogueras, calabazas, pociones), detrás de las siluetas
  col += uGlow * uHorizon * 0.6 * exp(-max(p.y + 0.3, 0.0) * 4.0) * (0.75 + 0.25 * noise(vec2(p.x * 4.0, t * 1.5)));

  // siluetas (sil = máscara) y lo que brilla en ellas (emit)
  vec3 silCol = vec3(0.015, 0.01, 0.025) + uFog * 0.04;
  float sil = 0.0;
  vec3 emit = vec3(0.0);
  float glowLines = 0.0;
  if (uSil == 1.0) sil = max(graves(p), step(tree(p, vec2(-aspect * 0.5 + 0.22, -0.34), 0.75), 0.0));
  if (uSil == 2.0) sil = trees(p, aspect);
  if (uSil == 3.0) { float w; sil = castle(p, w); emit = uGlow * w * 1.2; }
  if (uSil == 4.0) { float spider; glowLines = web(p, aspect, spider); sil = max(hills(p) * 0.85, spider); }
  if (uSil == 5.0) {
    float face; float m = pumpkins(p, face);
    sil = step(0.5, m);
    if (m > 0.5 && m < 0.9995) silCol = vec3(0.3, 0.1, 0.02); // la calabaza, no el suelo
    emit = uGlow * face * 1.75;
  }
  if (uSil == 6.0) sil = hills(p);
  if (uSil == 7.0) sil = crypt(p, emit);
  if (uSil == 8.0) sil = lab(p, emit);
  if (uSil == 9.0) sil = cauldron(p, emit);
  if (uSil == 10.0) sil = loneTree(p, aspect);
  if (uSil == 11.0) sil = stage(p, aspect, emit);
  col = mix(col, silCol, sil);

  // niebla baja que se arrastra (menos sobre las siluetas, para que se sigan viendo)
  float ground = fbm(vec2(p.x * 2.2 + t * 0.05, p.y * 5.0 - t * 0.02));
  col = mix(col, uFog * 0.6, smoothstep(0.3, 0.85, ground) * smoothstep(0.05, -0.45, p.y) * uFogAmt * (1.0 - 0.6 * sil));
  col += emit;

  // partículas y telaraña
  if (uPart > 0.0) col += particles(p);
  col += vec3(0.85, 0.82, 0.95) * glowLines * 0.6;

  // relámpago: el cielo se ilumina y se ve el rayo, en zigzag
  col += vec3(0.55, 0.6, 0.8) * uFlash * (0.4 + 0.6 * uv.y);
  if (uFlash > 0.25 && uBolt.y > 0.0) {
    float bx = uBolt.x + (noise(vec2(p.y * 7.0, uBolt.y)) - 0.5) * 0.3 + (noise(vec2(p.y * 32.0, uBolt.y)) - 0.5) * 0.06;
    float bolt = exp(-abs(p.x - bx) * 220.0) + 0.3 * exp(-abs(p.x - bx) * 30.0);
    col += vec3(0.85, 0.9, 1.0) * bolt * step(-0.2, p.y) * (uFlash - 0.25) * 2.5;
  }

  // viñeta, grano y oscurecido de transición
  col *= 1.0 - 0.55 * dot(p * vec2(0.8, 1.1), p * vec2(0.8, 1.1));
  col += (hash(gl_FragCoord.xy + fract(t) * 100.0) - 0.5) * 0.035;
  col *= 1.0 - uDim;
  gl_FragColor = vec4(max(col, 0.0), 1.0);
}
`;

/**
 * Calidad del fondo, de mejor a más ligera: resolución del shader (fracción de la pantalla) y cada cuántos fotogramas
 * se dibuja (2 = a 30 fps: la niebla y las partículas van lentas, no se nota). Desde «lite», la tele quita además el
 * desenfoque de los cristales (body.fx-lite), que es lo más caro en una gráfica integrada: cada cristal se vuelve a
 * desenfocar en cada fotograma porque el fondo se mueve.
 */
export const QUALITY_LEVELS = [
  { scale: 0.6, every: 1, lite: false },
  { scale: 0.5, every: 1, lite: true },
  { scale: 0.42, every: 2, lite: true },
  { scale: 0.34, every: 2, lite: true },
  { scale: 0.26, every: 3, lite: true },
];
const SAMPLE = 90; // fotogramas por medida

const NUMERIC = ['fogAmt', 'moon', 'bats', 'horizon'];
const COLORS = ['top', 'bot', 'fog', 'glow', 'part'];
const TRANSITION_MS = 1600;

export class Backdrop {
  #deltas;
  #last;
  #frameNo;
  #goodRuns;
  #lastDrop;
  #stillFrames = 0; // entornos fijos (Squid Games): basta con dibujarlos un par de veces

  constructor(canvas) {
    this.canvas = canvas;
    // Calidad: 'auto' mide cómo de fluida va la tele y la ajusta sola; 'high' / 'low' la fijan.
    this.mode = 'auto';
    this.level = 0;
    this.scale = QUALITY_LEVELS[0].scale;
    this.fps = null; // fotogramas por segundo de la página (para la depuración)
    this.onQuality = null; // (nivel) → la tele pone o quita body.fx-lite
    this.#deltas = [];
    this.#last = 0;
    this.#frameNo = 0;
    this.#goodRuns = 0;
    this.#lastDrop = 0;
    this.gl = canvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'high-performance' });
    this.ok = !!this.gl && this.#init();
    this.env = null;
    this.cur = null; // valores actuales (interpolados)
    this.from = null;
    this.to = null;
    this.tStart = 0;
    this.flashLevel = 0;
    this.nextLightning = 0;
    this.t0 = performance.now();
    this.onLightning = null; // para el trueno
    if (this.ok) {
      addEventListener('resize', () => this.#resize());
      this.#resize();
      requestAnimationFrame((t) => this.#frame(t));
    }
  }

  /** Cambia de entorno (con transición, salvo la primera vez). */
  setEnv(id, { instant = false } = {}) {
    const e = getEnv(id);
    if (this.env === e.id) return;
    this.env = e.id;
    this.#stillFrames = 0;
    const target = {
      ...Object.fromEntries(NUMERIC.map((k) => [k, e[k]])),
      ...Object.fromEntries(COLORS.map((k) => [k, [...e[k]]])),
      sil: e.sil,
      particles: e.particles,
      lightning: e.lightning,
    };
    if (!this.cur || instant) {
      this.cur = structuredClone(target);
      this.from = this.to = null;
      return;
    }
    this.from = structuredClone(this.cur);
    this.to = target;
    this.tStart = performance.now();
  }

  /** 'auto' | 'high' | 'low' */
  setMode(mode) {
    if (!['auto', 'high', 'low'].includes(mode) || mode === this.mode) return;
    this.mode = mode;
    this.#deltas = [];
    this.#setLevel(mode === 'high' ? 0 : mode === 'low' ? 3 : 0);
  }

  #setLevel(level) {
    level = Math.max(0, Math.min(QUALITY_LEVELS.length - 1, level));
    if (level === this.level && this.scale === QUALITY_LEVELS[level].scale) return;
    this.level = level;
    this.scale = QUALITY_LEVELS[level].scale;
    if (this.ok) this.#resize();
    this.onQuality?.(QUALITY_LEVELS[level]);
  }

  /**
   * Calidad automática: cada 90 fotogramas compara lo que tarda uno (mediana) con el ritmo de la pantalla (lo más
   * rápido que se ha visto: 60 Hz, 50 Hz…). Si va a trompicones, baja un nivel; si va sobrada un buen rato, sube uno
   * (pero no enseguida después de bajar, para no ir y venir).
   */
  #measure(now) {
    const d = now - this.#last;
    this.#last = now;
    if (this.mode !== 'auto' || d <= 0 || d > 250) return; // pestaña oculta o parón puntual: no cuenta
    this.#deltas.push(d);
    if (this.#deltas.length < SAMPLE) return;
    const sorted = [...this.#deltas].sort((a, b) => a - b);
    this.#deltas = [];
    const refresh = sorted[Math.floor(sorted.length * 0.1)];
    const median = sorted[Math.floor(sorted.length / 2)];
    const slow = sorted[Math.floor(sorted.length * 0.9)];
    this.fps = Math.round(1000 / median);
    if (median > refresh * 1.35 || slow > refresh * 2.2) {
      this.#goodRuns = 0;
      this.#lastDrop = now;
      this.#setLevel(this.level + 1);
    } else if (this.level > 0 && slow < refresh * 1.25 && ++this.#goodRuns >= 8 && now - this.#lastDrop > 30_000) {
      this.#goodRuns = 0;
      this.#setLevel(this.level - 1);
    }
  }

  /** Destello (relámpago o momento de impacto). */
  flash(strength = 1) {
    this.flashLevel = Math.max(this.flashLevel, strength);
    this.#stillFrames = 0;
  }

  #init() {
    const gl = this.gl;
    const compile = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.error('[fondo] shader:', gl.getShaderInfoLog(s));
        return null;
      }
      return s;
    };
    const vs = compile(gl.VERTEX_SHADER, VERTEX);
    const fs = compile(gl.FRAGMENT_SHADER, FRAGMENT);
    if (!vs || !fs) return false;
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error('[fondo] programa:', gl.getProgramInfoLog(prog));
      return false;
    }
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    this.u = {};
    for (const name of [
      'uRes',
      'uTime',
      'uTop',
      'uBot',
      'uFog',
      'uGlow',
      'uPartCol',
      'uFogAmt',
      'uMoon',
      'uSil',
      'uPart',
      'uBats',
      'uFlash',
      'uDim',
      'uHorizon',
      'uBolt',
    ]) {
      this.u[name] = gl.getUniformLocation(prog, name);
    }
    return true;
  }

  #resize() {
    // Resolución reducida (según la calidad): la niebla es suave y así la tele va fluida.
    const w = Math.round(innerWidth * this.scale);
    const h = Math.round(innerHeight * this.scale);
    this.canvas.width = w;
    this.canvas.height = h;
    this.gl.viewport(0, 0, w, h);
    this.#stillFrames = 0; // el lienzo se ha borrado
  }

  #frame(now) {
    requestAnimationFrame((t) => this.#frame(t));
    this.#measure(now);
    if (!this.cur) return;
    // En las calidades ligeras, el fondo no se dibuja en todos los fotogramas
    if (++this.#frameNo % QUALITY_LEVELS[this.level].every !== 0 && !this.to && this.flashLevel < 0.05) return;
    if (getEnv(this.env).still && !this.to && this.flashLevel < 0.05 && ++this.#stillFrames > 3) return;
    let dim = 0;
    if (this.to) {
      const k = Math.min(1, (now - this.tStart) / TRANSITION_MS);
      const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2; // ease in-out
      for (const key of NUMERIC) this.cur[key] = this.from[key] + (this.to[key] - this.from[key]) * e;
      for (const key of COLORS) this.cur[key] = this.from[key].map((v, i) => v + (this.to[key][i] - v) * e);
      // Las siluetas y partículas cambian a mitad, con la pantalla oscurecida.
      dim = 0.75 * Math.sin(Math.PI * k);
      if (k >= 0.5) Object.assign(this.cur, { sil: this.to.sil, particles: this.to.particles, lightning: this.to.lightning });
      if (k >= 1) this.from = this.to = null;
    }
    // Relámpagos: dobles, cada 5–12 s, en los entornos de tormenta.
    if (this.cur.lightning && now > this.nextLightning) {
      this.flash(0.9);
      setTimeout(() => this.flash(0.6), 140);
      this.bolt = [(Math.random() - 0.5) * 1.2, 1 + Math.random() * 50];
      this.onLightning?.();
      this.nextLightning = now + 5000 + Math.random() * 7000;
    }
    this.flashLevel *= 0.88;
    if (this.flashLevel < 0.05) this.bolt = null; // el rayo solo se dibuja con su relámpago

    const gl = this.gl;
    const u = this.u;
    gl.uniform2f(u.uRes, this.canvas.width, this.canvas.height);
    gl.uniform1f(u.uTime, (now - this.t0) / 1000);
    gl.uniform3fv(u.uTop, this.cur.top);
    gl.uniform3fv(u.uBot, this.cur.bot);
    gl.uniform3fv(u.uFog, this.cur.fog);
    gl.uniform3fv(u.uGlow, this.cur.glow);
    gl.uniform3fv(u.uPartCol, this.cur.part);
    gl.uniform1f(u.uFogAmt, this.cur.fogAmt);
    gl.uniform1f(u.uMoon, this.cur.moon);
    gl.uniform1f(u.uSil, this.cur.sil);
    gl.uniform1f(u.uPart, this.cur.particles);
    gl.uniform1f(u.uBats, this.cur.bats);
    gl.uniform1f(u.uFlash, this.flashLevel);
    gl.uniform1f(u.uDim, dim);
    gl.uniform1f(u.uHorizon, this.cur.horizon);
    gl.uniform2fv(u.uBolt, this.bolt ?? [0, 0]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}
