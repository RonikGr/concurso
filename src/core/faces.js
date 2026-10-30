// Caras de los jugadores: cada foto tiene uno o varios nombres («Rodri», «Rodrigo»…). Quien entra con uno de esos
// nombres (sin importar mayúsculas ni tildes) juega con su cara en vez de con el icono.
import { norm } from './show.js';

/** Nombres a partir del nombre del archivo: «Rodri, Rodrigo.jpg» → ['Rodri', 'Rodrigo']. */
export function namesFromFileName(fileName) {
  return String(fileName)
    .replace(/\.[^.]+$/, '')
    .split(/[,;_+]|\s+-\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Cara que corresponde a un nombre, o null. @param faces [{id, names}] */
export function matchFace(name, faces) {
  const key = norm(name);
  if (!key) return null;
  return faces.find((f) => f.names.some((n) => norm(n) === key))?.id ?? null;
}

/**
 * Cara de cada jugador: la puesta a mano (desde el mando) manda; si no, la de su nombre (`matchFace`). Una cara puesta
 * a mano ya no se reparte por nombre a nadie más. @param players [{id, name}] @param faces [{id, names}]
 * @param overrides Map playerId → faceId | null (null = sin cara, aunque su nombre case)
 * @returns Map playerId → faceId | null
 */
export function assignFaces(players, faces, overrides = new Map()) {
  const exists = new Set(faces.map((f) => f.id));
  const here = new Set(players.map((p) => p.id)); // (las de quien ya no está no apartan su cara)
  const manual = new Map([...overrides].filter(([id, faceId]) => here.has(id) && (faceId == null || exists.has(faceId))));
  const claimed = new Set([...manual.values()].filter(Boolean));
  const free = faces.filter((f) => !claimed.has(f.id));
  return new Map(players.map((p) => [p.id, manual.has(p.id) ? manual.get(p.id) : matchFace(p.name, free)]));
}

/**
 * Pone (o quita, con null) la cara de un jugador a mano. Una cara es de una sola persona: si otro la tenía puesta a
 * mano, deja de tenerla a mano (vuelve a la de su nombre). Devuelve el mapa nuevo.
 */
export function setFaceOverride(overrides, playerId, faceId) {
  const next = new Map([...overrides].filter(([id, f]) => id !== playerId && (faceId == null || f !== faceId)));
  next.set(playerId, faceId ?? null);
  return next;
}
