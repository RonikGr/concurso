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
uniform float uFogAmt, uMoon, uSun, uSil, uPart, uBats, uFlash, uDim, uHorizon;
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

// Gimnasio (Fit o Fat): suelo de caucho, y en fila racks con la barra cargada, mancuerneros y bancos; neones en la
// pared que laten como al ritmo de la música.
float gym(vec2 p, out vec3 emit) {
  emit = vec3(0.0);
  float t = uTime;
  float floorY = -0.3;
  float m = step(p.y, floorY);
  // líneas del suelo (losetas de caucho) con el reflejo de los neones
  emit += m * uGlow * 0.06 * smoothstep(0.004, 0.0, abs(fract(p.x * 4.0 + p.y * 1.5) - 0.5) - 0.48);
  // neones que laten: una tira arriba del todo y un zócalo de luz a ras de suelo (lejos de los textos)
  float wall = 1.0 - m;
  float beat = 0.75 + 0.25 * pow(0.5 + 0.5 * sin(t * 6.0), 4.0);
  emit += wall * uGlow * (smoothstep(0.005, 0.0, abs(p.y - 0.465)) * 0.8 + 0.1 * exp(-abs(p.y - 0.465) * 18.0)) * beat;
  emit += wall * uFog * (smoothstep(0.005, 0.0, abs(p.y - floorY - 0.008)) * 0.8 + 0.18 * exp(-(p.y - floorY) * 22.0)) * beat;
  float w = 0.9;
  float cx = floor((p.x + 10.0) / w);
  vec2 q = vec2(mod(p.x + 10.0, w) - w * 0.5, p.y - floorY);
  float kind = mod(cx, 3.0);
  float d = 1.0;
  if (kind < 0.5) {
    // rack: dos postes, travesaño y la barra con discos
    d = min(sdBox(vec2(abs(q.x) - 0.17, q.y - 0.21), vec2(0.012, 0.21)), sdBox(q - vec2(0.0, 0.41), vec2(0.18, 0.01)));
    d = min(d, sdBox(q - vec2(0.0, 0.27), vec2(0.33, 0.006)));
    d = min(d, sdBox(vec2(abs(q.x) - 0.25, q.y - 0.27), vec2(0.016, 0.075)));
    d = min(d, sdBox(vec2(abs(q.x) - 0.215, q.y - 0.27), vec2(0.011, 0.055)));
    d = min(d, sdBox(vec2(abs(q.x) - 0.17, q.y - 0.005), vec2(0.06, 0.005))); // pies
  } else if (kind < 1.5) {
    // mancuernero: dos baldas con mancuernas
    d = min(sdBox(vec2(abs(q.x) - 0.24, q.y - 0.09), vec2(0.01, 0.09)), sdBox(q - vec2(0.0, 0.07), vec2(0.25, 0.006)));
    d = min(d, sdBox(q - vec2(0.0, 0.16), vec2(0.25, 0.006)));
    for (int s = 0; s < 2; s++) {
      float y = s == 0 ? 0.094 : 0.184;
      float r = s == 0 ? 0.019 : 0.015;
      float dx = mod(q.x + 0.25, 0.1) - 0.05;
      vec2 c = vec2(dx, q.y - y);
      float db = min(length(vec2(abs(c.x) - 0.022, c.y)) - r, sdBox(c, vec2(0.022, 0.004)));
      d = min(d, max(db, abs(q.x) - 0.23));
    }
  } else {
    // banco plano con la barra en sus soportes y unas pesas rusas al lado
    d = min(sdBox(q - vec2(0.0, 0.085), vec2(0.17, 0.016)), sdBox(vec2(abs(q.x) - 0.13, q.y - 0.04), vec2(0.008, 0.04)));
    d = min(d, sdBox(vec2(q.x + 0.15, q.y - 0.12), vec2(0.008, 0.12)));
    d = min(d, sdBox(q - vec2(-0.15, 0.24), vec2(0.27, 0.005)));
    d = min(d, sdBox(vec2(q.x + 0.15, q.y - 0.24) - vec2(sign(q.x + 0.15) * 0.21, 0.0), vec2(0.014, 0.065)));
    vec2 k = q - vec2(0.3, 0.035);
    d = min(d, min(length(k) - 0.035, length(vec2(k.x, k.y - 0.045)) - 0.022));
  }
  m = max(m, step(d, 0.0));
  return m;
}

// Engranaje que gira (dientes, aro y agujero): <0 dentro.
float gear(vec2 q, float r, float teeth, float rot) {
  float a = atan(q.y, q.x) + rot;
  float d = length(q) - r - 0.018 * r * 8.0 * step(0.0, sin(a * teeth));
  return max(d, 0.35 * r - length(q));
}

// Relojería (Reloj interno): reloj de pared con agujas que giran a la izquierda, reloj de péndulo a la derecha y
// engranajes por el suelo; las esferas brillan (y las agujas se recortan encima).
float clocks(vec2 p, float aspect, out vec3 emit) {
  emit = vec3(0.0);
  float t = uTime;
  float floorY = -0.34;
  float m = step(p.y, floorY);
  // reloj de pared
  vec2 c = p - vec2(-aspect * 0.33, 0.08);
  float R = 0.16;
  float r = length(c);
  float rim = step(abs(r - R), 0.014);
  float face = step(r, R - 0.014);
  float a = atan(c.x, c.y); // 0 arriba, en el sentido del reloj
  float tick = step(abs(fract(a / (2.0 * PI) * 12.0 + 0.5) - 0.5), 0.06) * step(R - 0.04, r) * face;
  float sec = t * (2.0 * PI / 6.0); // segundero: una vuelta cada 6 s
  float mn = t * (2.0 * PI / 90.0);
  vec2 ds = vec2(sin(sec), cos(sec));
  vec2 dm = vec2(sin(mn), cos(mn));
  float hands = max(step(sdSeg(c, -ds * 0.03, ds * (R - 0.03)), 0.004), step(sdSeg(c, vec2(0.0), dm * (R - 0.06)), 0.009));
  hands = max(hands, step(r, 0.014));
  float marks = max(tick, hands);
  m = max(m, max(rim, marks));
  emit += uGlow * 0.32 * face * (1.0 - marks) * (0.9 + 0.1 * smoothstep(R, 0.0, r));
  // reloj de péndulo
  vec2 g = p - vec2(aspect * 0.33, floorY);
  float body = step(sdBox(g - vec2(0.0, 0.27), vec2(0.075, 0.27)), 0.0);
  float hood = step(sdBox(g - vec2(0.0, 0.57), vec2(0.095, 0.03)), 0.0);
  vec2 fc = g - vec2(0.0, 0.46);
  float gface = step(length(fc), 0.055);
  float win = step(sdBox(g - vec2(0.0, 0.22), vec2(0.045, 0.15)), 0.0);
  float sw = 0.35 * sin(t * PI); // un vaivén por segundo
  vec2 pv = vec2(sin(sw), -cos(sw));
  vec2 piv = vec2(0.0, 0.36);
  float pend = max(step(sdSeg(g, piv, piv + pv * 0.17), 0.004), step(length(g - piv - pv * 0.19), 0.028));
  float gh = step(sdSeg(fc, vec2(0.0), vec2(sin(sec * 0.5), cos(sec * 0.5)) * 0.042), 0.004);
  float lit = max(gface, win) * (1.0 - max(pend, gh));
  m = max(m, max(max(body, hood) * (1.0 - lit), max(pend * win, gh * gface)));
  emit += uGlow * 0.3 * lit;
  // engranajes en el suelo, engranados entre sí
  m = max(m, step(gear(p - vec2(-0.12, floorY - 0.02), 0.11, 12.0, t * 0.4), 0.0));
  m = max(m, step(gear(p - vec2(0.1, floorY + 0.01), 0.07, 8.0, -t * 0.6), 0.0));
  m = max(m, step(gear(p - vec2(-aspect * 0.12, floorY + 0.03), 0.05, 6.0, -t * 0.85), 0.0) * 0.8);
  return m;
}

// Guerra de globos: globos rojos y azules (los equipos) que suben meciéndose y explotan arriba; los más lejanos,
// más pequeños y más oscuros. Suelo oscuro.
float balloons(vec2 p, out vec3 emit) {
  emit = vec3(0.0);
  float t = uTime;
  float m = step(p.y, -0.38);
  for (int L = 0; L < 2; L++) {
    float fl = float(L);
    float w = fl == 0.0 ? 0.2 : 0.13;
    float rad = fl == 0.0 ? 0.05 : 0.032;
    float cx = floor((p.x + 10.0) / w);
    float h = hash(vec2(cx, 2.0 + fl));
    if (h > 0.75) continue; // huecos
    float speed = (0.05 + 0.04 * hash(vec2(cx, 5.0 + fl))) * (fl == 0.0 ? 1.0 : 0.7);
    float cyc = fract(t * speed + h * 7.0);
    float y = -0.55 + cyc * 1.05;
    float x = (cx + 0.5) * w - 10.0 + 0.02 * sin(t * 1.3 + h * 20.0);
    vec2 q = p - vec2(x, y);
    vec3 colr = mix(vec3(1.0, 0.23, 0.31), vec3(0.23, 0.55, 1.0), step(0.5, hash(vec2(cx, 9.0 + fl))));
    colr = mix(colr, vec3(1.0, 0.82, 0.25), step(0.88, hash(vec2(cx, 13.0 + fl))));
    float dim = fl == 0.0 ? 1.0 : 0.55;
    if (cyc < 0.92) {
      // globo (óvalo), nudo e hilo que ondea
      float d = length(q * vec2(1.0, 0.82)) - rad;
      float knot = step(sdBox(q + vec2(0.0, rad * 1.25), vec2(rad * 0.15, rad * 0.12)), 0.0);
      float sx = 0.012 * sin(q.y * 40.0 + t * 3.0);
      float str = step(abs(q.x - sx), 0.0025) * step(q.y, -rad * 1.3) * step(-rad * 1.3 - 0.16, q.y);
      float b = step(d, 0.0);
      m = max(m, max(max(b, knot), str * 0.7));
      float shine = smoothstep(rad * 0.45, 0.0, length(q - vec2(-rad * 0.35, rad * 0.45)));
      emit += b * dim * (colr * (0.55 + 0.35 * smoothstep(rad, -rad, q.y + q.x * 0.5)) + vec3(0.9) * shine * 0.5);
      emit += knot * colr * 0.4 * dim;
    } else {
      // ¡pum!: rayos que salen y se apagan
      float k = (cyc - 0.92) / 0.08;
      float ang = atan(q.y, q.x);
      float ray = step(abs(fract(ang / (2.0 * PI) * 8.0) - 0.5), 0.12);
      float ring = smoothstep(0.012, 0.0, abs(length(q) - rad * (0.6 + 1.4 * k)));
      emit += (ray * ring + 0.4 * ring) * colr * (1.0 - k) * 1.4 * dim;
    }
  }
  return m;
}

// Botella de pie (base en q.y = 0): cuerpo, hombros y cuello. <0 dentro.
float bottle(vec2 q, float h, float w) {
  float body = sdBox(q - vec2(0.0, h * 0.33), vec2(w, h * 0.33));
  float shoulder = length((q - vec2(0.0, h * 0.64)) * vec2(1.0, 1.7)) - w;
  float neck = sdBox(q - vec2(0.0, h * 0.84), vec2(w * 0.32, h * 0.17));
  return min(min(body, shoulder), neck);
}

// Coctelería (Agita el móvil): barra con el borde iluminado, estanterías de botellas a los lados con luz de
// neón debajo de cada balda, una coctelera que se agita a ratos y una copa de cóctel con licor que brilla.
float cocktailBar(vec2 p, float aspect, out vec3 emit) {
  emit = vec3(0.0);
  float t = uTime;
  float counter = -0.3;
  float m = step(p.y, counter);
  emit += uGlow * (smoothstep(0.006, 0.0, abs(p.y - counter)) * 0.9 + 0.14 * exp(-(p.y - counter) * 30.0) * step(counter, p.y));
  float side = step(aspect * 0.24, abs(p.x));
  for (int s = 0; s < 2; s++) {
    float fs = float(s);
    float y0 = fs < 0.5 ? -0.04 : 0.19;
    m = max(m, step(abs(p.y - y0), 0.006) * side);
    emit += uGlow * 0.22 * exp(-(p.y - y0) * 22.0) * step(y0, p.y) * step(p.y, y0 + 0.17) * side;
    float w = 0.07;
    float cx = floor((p.x + 10.0) / w);
    vec2 q = vec2(mod(p.x + 10.0, w) - w * 0.5, p.y - y0 - 0.006);
    float h = 0.08 + 0.07 * hash(vec2(cx, fs + 3.0));
    float bw = 0.013 + 0.008 * hash(vec2(cx, fs + 7.0));
    float b = step(bottle(q, h, bw), 0.0) * side * step(hash(vec2(cx, fs + 11.0)), 0.85);
    m = max(m, b);
  }
  // coctelera sobre la barra: a ratos se agita (gira un poco sobre su base)
  float a = step(0.62, fract(t * 0.22)) * sin(t * 38.0) * 0.14;
  vec2 c = p - vec2(-aspect * 0.16, counter);
  c = mat2(cos(a), -sin(a), sin(a), cos(a)) * c;
  float hw = mix(0.042, 0.032, clamp(c.y / 0.14, 0.0, 1.0));
  float sh = max(abs(c.x) - hw, max(-c.y, c.y - 0.14));
  sh = min(sh, sdBox(c - vec2(0.0, 0.16), vec2(0.022, 0.022)));
  sh = min(sh, length(c - vec2(0.0, 0.19)) - 0.013);
  m = max(m, step(sh, 0.0));
  emit += vec3(0.75, 0.9, 0.95) * 0.35 * step(sh, 0.0) * smoothstep(0.008, 0.0, abs(c.x + hw * 0.45)); // brillo del metal
  // copa de cóctel con licor
  vec2 g = p - vec2(aspect * 0.16, counter);
  float glass = min(sdBox(g - vec2(0.0, 0.05), vec2(0.004, 0.05)), sdBox(g - vec2(0.0, 0.003), vec2(0.03, 0.003)));
  vec2 k = g - vec2(0.0, 0.1);
  float cone = max(abs(k.x) - k.y * 0.95, max(-k.y, k.y - 0.075));
  glass = min(glass, cone);
  m = max(m, step(glass, 0.0));
  emit += uGlow * 0.7 * step(cone, -0.004) * step(k.y, 0.058);
  return m;
}

// Karaoke (¿Qué canción es?): escenario con un ecualizador de luces que baila en el frente, dos bafles con los
// conos que laten y un micro de pie con su foco.
float karaoke(vec2 p, float aspect, out vec3 emit) {
  emit = vec3(0.0);
  float t = uTime;
  float floorY = -0.32;
  float m = step(p.y, floorY);
  // ecualizador (barras de LED por segmentos)
  float bw = 0.045;
  float bx = floor(p.x / bw);
  float lx = mod(p.x, bw) - bw * 0.5;
  float lvl = 0.03 + 0.13 * noise(vec2(bx * 0.7, t * 3.0)) * (0.65 + 0.35 * sin(t * 8.0 + bx));
  float bar = step(abs(lx), bw * 0.33) * step(-0.48, p.y) * step(p.y, -0.48 + lvl) * step(abs(p.x), aspect * 0.3);
  float seg = step(0.35, fract((p.y + 0.48) * 70.0));
  emit += bar * seg * mix(uGlow, uFog, smoothstep(0.0, 0.15, p.y + 0.48)) * 0.9;
  // bafles en los extremos
  float pulse = pow(0.5 + 0.5 * sin(t * 7.5), 6.0);
  for (int i = 0; i < 2; i++) {
    float sx = (i == 0 ? -1.0 : 1.0) * (aspect * 0.5 - 0.13);
    vec2 q = p - vec2(sx, floorY);
    m = max(m, step(sdBox(q - vec2(0.0, 0.18), vec2(0.1, 0.18)), 0.0));
    float r1 = length(q - vec2(0.0, 0.1));
    float r2 = length(q - vec2(0.0, 0.27));
    emit += uFog * 0.55 * (smoothstep(0.006, 0.0, abs(r1 - 0.062 - 0.008 * pulse)) + smoothstep(0.005, 0.0, abs(r2 - 0.034)));
  }
  // micro de pie
  vec2 s = p - vec2(-aspect * 0.27, floorY);
  float d = sdSeg(s, vec2(0.0, 0.03), vec2(0.0, 0.3)) - 0.005;
  d = min(d, min(sdSeg(s, vec2(0.0, 0.035), vec2(-0.06, 0.0)), sdSeg(s, vec2(0.0, 0.035), vec2(0.06, 0.0))) - 0.004);
  d = min(d, sdSeg(s, vec2(0.0, 0.3), vec2(0.06, 0.355)) - 0.004);
  d = min(d, length((s - vec2(0.072, 0.37)) * vec2(1.0, 0.8)) - 0.021);
  m = max(m, step(d, 0.0));
  float spot = smoothstep(0.03 + (0.85 - s.y) * 0.16, 0.0, abs(s.x - 0.05)) * step(s.y, 0.85) * step(0.0, s.y);
  emit += uGlow * 0.12 * spot;
  return m;
}

// Figura de vaquero de espaldas (base en q = 0, altura ~h): sombrero, cuerpo y piernas. <0 dentro.
float cowboy(vec2 q, float h) {
  q /= h;
  float d = sdBox(q - vec2(0.0, 0.62), vec2(0.13, 0.2)); // torso
  d = min(d, sdSeg(q, vec2(-0.06, 0.42), vec2(-0.09, 0.0)) - 0.05); // piernas
  d = min(d, sdSeg(q, vec2(0.06, 0.42), vec2(0.09, 0.0)) - 0.05);
  d = min(d, sdSeg(q, vec2(-0.13, 0.78), vec2(-0.2, 0.45)) - 0.04); // brazos
  d = min(d, sdSeg(q, vec2(0.13, 0.78), vec2(0.2, 0.45)) - 0.04);
  d = min(d, length(q - vec2(0.0, 0.9)) - 0.08); // cabeza
  d = min(d, sdBox(q - vec2(0.0, 0.98), vec2(0.2, 0.015))); // ala del sombrero
  d = min(d, sdBox(q - vec2(0.0, 1.04), vec2(0.09, 0.06))); // copa
  return d * h;
}

// Duelo al sol (Reflejos): desierto con mesetas al fondo, un saguaro, el saloon con las ventanas encendidas y dos
// vaqueros de espaldas que se miran. Sin verdes ni luces de semáforo (la señal de Reflejos es verde).
float western(vec2 p, float aspect, out vec3 emit) {
  emit = vec3(0.0);
  float mesa = -0.27 + 0.13 * (1.0 - smoothstep(0.0, 0.05, abs(p.x - aspect * 0.12) - 0.13)) + 0.08 * (1.0 - smoothstep(0.0, 0.04, abs(p.x + aspect * 0.18) - 0.06));
  float m = step(p.y, mesa) * 0.55;
  m = max(m, step(p.y, hill(p.x, -0.36, 0.015, 5.0)));
  // saguaro a la izquierda
  vec2 c = p - vec2(-aspect * 0.34, -0.36);
  float d = sdSeg(c, vec2(0.0), vec2(0.0, 0.3)) - 0.022;
  d = min(d, min(sdSeg(c, vec2(0.0, 0.12), vec2(-0.07, 0.12)), sdSeg(c, vec2(-0.07, 0.12), vec2(-0.07, 0.22))) - 0.016);
  d = min(d, min(sdSeg(c, vec2(0.0, 0.17), vec2(0.06, 0.17)), sdSeg(c, vec2(0.06, 0.17), vec2(0.06, 0.25))) - 0.015);
  m = max(m, step(d, 0.0));
  // saloon a la derecha: fachada con remate escalonado, porche y puertas batientes
  vec2 s = p - vec2(aspect * 0.33, -0.36);
  float b = sdBox(s - vec2(0.0, 0.11), vec2(0.16, 0.11));
  b = min(b, sdBox(s - vec2(0.0, 0.25), vec2(0.11, 0.04)));
  b = min(b, sdBox(s - vec2(0.0, 0.3), vec2(0.05, 0.02)));
  b = min(b, sdBox(s - vec2(0.0, 0.135), vec2(0.2, 0.008))); // tejadillo del porche
  m = max(m, step(b, 0.0));
  vec2 wq = vec2(abs(s.x) - 0.1, s.y - 0.06);
  float win = step(sdBox(wq, vec2(0.025, 0.03)), 0.0);
  float door = step(sdBox(s - vec2(0.0, 0.045), vec2(0.03, 0.035)), 0.0) * step(0.004, abs(s.x));
  emit += uGlow * 0.55 * (win + door * 0.6) * (0.85 + 0.15 * noise(vec2(s.x * 20.0, uTime * 3.0)));
  // los dos vaqueros, frente a frente
  float cw = min(cowboy(p - vec2(-0.2, -0.37), 0.1), cowboy(p - vec2(0.2, -0.37), 0.1));
  m = max(m, step(cw, 0.0));
  return m;
}

// Palmera (base en base, escala s, inclinación lean): tronco curvo y hojas que se mecen. <0 dentro.
float palm(vec2 p, vec2 base, float s, float lean) {
  vec2 q = (p - base) / s;
  vec2 b = vec2(lean * 0.3, 0.3);
  vec2 c = vec2(lean * 0.8, 0.58);
  float d = min(sdSeg(q, vec2(0.0), b) - 0.032, sdSeg(q, b, c) - 0.025);
  d = min(d, length(q - c) - 0.04); // cocos
  for (int i = 0; i < 6; i++) {
    // hoja en arco: sube un poco, se curva y cae; gruesa al salir y fina en la punta
    float fi = float(i);
    float a = PI * (0.06 + fi * 0.176) + 0.04 * sin(uTime * 1.1 + fi * 1.7);
    float sx = cos(a);
    float up = sin(a);
    vec2 p1 = c + vec2(sx * 0.12, 0.05 + up * 0.06);
    vec2 p2 = c + vec2(sx * 0.23, 0.03 + up * 0.05);
    vec2 p3 = c + vec2(sx * 0.31, -0.07 + up * 0.06);
    d = min(d, min(sdSeg(q, c, p1) - 0.03, min(sdSeg(q, p1, p2) - 0.021, sdSeg(q, p2, p3) - 0.01)));
  }
  return d * s;
}

// Noche latina (Bachata): terraza con barandilla, dos palmeras y una guirnalda de bombillas que cuelga de lado a
// lado y titila.
float latinNight(vec2 p, float aspect, out vec3 emit) {
  emit = vec3(0.0);
  float t = uTime;
  float m = step(p.y, -0.4);
  // barandilla de la terraza
  m = max(m, step(abs(p.y + 0.3), 0.007));
  float bal = step(abs(mod(p.x + 10.0, 0.06) - 0.03), 0.007) * step(-0.4, p.y) * step(p.y, -0.3);
  m = max(m, bal);
  // palmeras
  float d = min(palm(p, vec2(-aspect * 0.42, -0.4), 0.72, 0.35), palm(p, vec2(aspect * 0.43, -0.4), 0.64, -0.3));
  m = max(m, step(d, 0.0));
  // guirnalda: cable en catenaria y bombillas que titilan
  float wy = 0.44 - 0.12 * cos(p.x * PI / aspect);
  m = max(m, smoothstep(0.003, 0.0, abs(p.y - wy)) * 0.9);
  float bw = 0.09;
  float bx = floor((p.x + 10.0) / bw);
  float cx = (bx + 0.5) * bw - 10.0;
  vec2 bulb = p - vec2(cx, 0.44 - 0.12 * cos(cx * PI / aspect) - 0.02);
  float fl = 0.75 + 0.25 * sin(t * (2.0 + hash(vec2(bx, 1.0)) * 3.0) + bx);
  vec3 bc = mix(uGlow, vec3(1.0, 0.55, 0.45), step(0.5, hash(vec2(bx, 4.0))));
  emit += bc * fl * (smoothstep(0.012, 0.004, length(bulb * vec2(1.0, 0.8))) * 1.2 + 0.25 * exp(-length(bulb) * 30.0));
  return m;
}

// Interrogatorio (Dos verdades): lámpara que cuelga y se mece con su cono de luz sobre la mesa, dos sillas, un
// perchero con gabardina y sombrero, y la luz de la calle entrando por una persiana.
float interrogation(vec2 p, float aspect, out vec3 emit) {
  emit = vec3(0.0);
  float t = uTime;
  // franjas de la persiana en la pared de la derecha
  float region = step(aspect * 0.14, p.x) * step(p.x, aspect * 0.47) * step(-0.26, p.y) * step(p.y, 0.42);
  float stripe = step(0.45, fract((p.y + p.x * 0.35) * 13.0));
  emit += uGlow * 0.07 * stripe * region * (0.9 + 0.1 * sin(t * 0.7));
  float m = step(p.y, -0.36);
  // mesa y sillas
  float d = sdBox(p - vec2(0.0, -0.27), vec2(0.36, 0.012));
  d = min(d, sdBox(vec2(abs(p.x) - 0.32, p.y + 0.32), vec2(0.01, 0.05)));
  for (int i = 0; i < 2; i++) {
    float sx = i == 0 ? -0.47 : 0.47;
    vec2 q = p - vec2(sx, -0.36);
    float back = sdBox(vec2(q.x - sign(sx) * 0.05, q.y - 0.12), vec2(0.008, 0.12));
    d = min(d, min(back, sdBox(q - vec2(0.0, 0.07), vec2(0.06, 0.008))));
    d = min(d, sdBox(vec2(abs(q.x) - 0.05, q.y - 0.035), vec2(0.006, 0.035)));
  }
  // perchero con gabardina y sombrero
  vec2 r = p - vec2(-aspect * 0.37, -0.36);
  d = min(d, sdBox(r - vec2(0.0, 0.24), vec2(0.007, 0.24)));
  d = min(d, sdBox(r - vec2(0.0, 0.005), vec2(0.06, 0.005)));
  float coatW = mix(0.075, 0.035, clamp((r.y - 0.18) / 0.22, 0.0, 1.0));
  d = min(d, max(abs(r.x + 0.01) - coatW, max(0.18 - r.y, r.y - 0.42)));
  d = min(d, sdBox(r - vec2(0.0, 0.48), vec2(0.06, 0.006)));
  d = min(d, sdBox(r - vec2(0.0, 0.505), vec2(0.032, 0.025)));
  m = max(m, step(d, 0.0));
  // lámpara que se mece
  float a = sin(t * 0.8) * 0.05;
  vec2 piv = vec2(0.0, 0.52);
  vec2 l = mat2(cos(a), -sin(a), sin(a), cos(a)) * (p - piv) + piv;
  float lamp = sdSeg(l, vec2(0.0, 0.52), vec2(0.0, 0.46)) - 0.003;
  float sw = mix(0.03, 0.085, clamp((0.46 - l.y) / 0.06, 0.0, 1.0));
  lamp = min(lamp, max(abs(l.x) - sw, max(l.y - 0.46, 0.4 - l.y)));
  m = max(m, step(lamp, 0.0));
  float bulb = length(l - vec2(0.0, 0.392));
  emit += uGlow * (smoothstep(0.02, 0.008, bulb) * 1.1 + 0.18 * exp(-bulb * 14.0));
  float across = abs(l.x) / (0.085 + (0.4 - l.y) * 0.45);
  emit += uGlow * 0.07 * smoothstep(1.0, 0.75, across) * step(l.y, 0.4) * step(-0.27, p.y);
  emit += uGlow * 0.35 * step(abs(p.y + 0.27), 0.012) * smoothstep(0.36, 0.0, abs(p.x)); // la mesa iluminada
  return m;
}

// Casino (La gran apuesta): mesa de tapete verde con el canto dorado, una ruleta que gira, pilas de fichas y dos
// lámparas colgantes con su luz cálida.
float casino(vec2 p, float aspect, out vec3 emit) {
  emit = vec3(0.0);
  float t = uTime;
  float tableY = -0.3;
  float m = step(p.y, tableY);
  emit += m * uFog * 0.3 * smoothstep(-0.55, tableY, p.y);
  emit += uGlow * 0.8 * smoothstep(0.006, 0.0, abs(p.y - tableY));
  // ruleta en la mesa (en perspectiva) que gira
  vec2 q = (p - vec2(aspect * 0.27, -0.4)) * vec2(1.0, 2.8);
  float r = length(q);
  float a = atan(q.y, q.x) + t * 0.9;
  float sector = mod(floor(a / (2.0 * PI) * 18.0), 2.0);
  float wheel = step(r, 0.13) * step(0.05, r);
  emit += wheel * mix(vec3(0.75, 0.08, 0.1), vec3(0.04), sector) * 0.9;
  emit += uGlow * (smoothstep(0.01, 0.0, abs(r - 0.135)) + smoothstep(0.012, 0.0, abs(r - 0.05)) + step(r, 0.02)) * 0.8;
  // pilas de fichas
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    vec2 c = p - vec2(-aspect * 0.3 + fi * 0.07, -0.36);
    float hgt = 0.04 + 0.03 * hash(vec2(fi, 2.0));
    float chip = sdBox(c - vec2(0.0, hgt * 0.5), vec2(0.026, hgt * 0.5));
    m = max(m, step(chip, 0.0));
    emit += step(chip, 0.0) * mix(uGlow, vec3(0.8, 0.1, 0.12), step(0.5, hash(vec2(fi, 5.0)))) * 0.45 * step(0.5, fract(c.y * 120.0));
  }
  // lámparas colgantes
  for (int i = 0; i < 2; i++) {
    float lx = (i == 0 ? -1.0 : 1.0) * aspect * 0.3;
    vec2 l = p - vec2(lx, 0.0);
    float d = sdSeg(l, vec2(0.0, 0.5), vec2(0.0, 0.4)) - 0.003;
    d = min(d, max(abs(l.x) - mix(0.03, 0.1, clamp((0.4 - l.y) / 0.05, 0.0, 1.0)), max(l.y - 0.4, 0.35 - l.y)));
    m = max(m, step(d, 0.0));
    float across = abs(l.x) / (0.1 + (0.35 - l.y) * 0.4);
    emit += uGlow * 0.06 * smoothstep(1.0, 0.7, across) * step(l.y, 0.35) * step(tableY, l.y);
    emit += uGlow * 0.6 * smoothstep(0.012, 0.0, abs(l.y - 0.35)) * step(abs(l.x), 0.1);
  }
  return m;
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
  // (sin estrellas de día ni en los sitios cerrados: gimnasio, relojería, coctelería, interrogatorio y casino)
  float indoor = (uSil == 12.0 || uSil == 13.0 || uSil == 15.0 || uSil == 19.0 || uSil == 20.0) ? 1.0 : 0.0;
  col += star * 0.7 * (1.0 - uFogAmt * 0.6) * (1.0 - indoor) * (1.0 - clamp(uSun, 0.0, 1.0));

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

  // sol (temáticas de día): disco liso, sin cráteres, con halo cálido
  if (uSun > 0.0) {
    vec2 sp = p - vec2(aspect * 0.28, 0.2);
    float d = length(sp);
    float disk = smoothstep(0.125, 0.118, d);
    col = mix(col, mix(vec3(1.0, 0.96, 0.8), uGlow, 0.3), disk * uSun);
    col += (vec3(1.0, 0.62, 0.3) * 0.38 * exp(-d * 4.5) + uGlow * 0.14 * exp(-d * 1.6)) * uSun;
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
  if (uSil == 12.0) sil = gym(p, emit);
  if (uSil == 13.0) sil = clocks(p, aspect, emit);
  if (uSil == 14.0) sil = balloons(p, emit);
  if (uSil == 15.0) sil = cocktailBar(p, aspect, emit);
  if (uSil == 16.0) sil = karaoke(p, aspect, emit);
  if (uSil == 17.0) sil = western(p, aspect, emit);
  if (uSil == 18.0) sil = latinNight(p, aspect, emit);
  if (uSil == 19.0) sil = interrogation(p, aspect, emit);
  if (uSil == 20.0) sil = casino(p, aspect, emit);
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

const NUMERIC = ['fogAmt', 'moon', 'sun', 'bats', 'horizon'];
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
      ...Object.fromEntries(NUMERIC.map((k) => [k, e[k] ?? 0])),
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
      'uSun',
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
    gl.uniform1f(u.uSun, this.cur.sun);
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
