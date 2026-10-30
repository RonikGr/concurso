import { describe, expect, it } from 'vitest';
import { ENVIRONMENTS, HOME_ENV, TEST_ENV, applyEnvUi, envConfetti, sectionEnv } from '../src/shared/environments.js';
import { MOODS } from '../src/host/fx/music.js';

describe('entornos de las secciones', () => {
  it('el Test va al plató millonario; los demás se reparten sin repetir el de casa ni el plató', () => {
    expect(sectionEnv({ type: 'test' }, 3)).toBe(TEST_ENV);
    const others = Array.from({ length: 9 }, (_, i) => sectionEnv({ type: 'pulsador' }, i));
    expect(new Set(others).size).toBe(9);
    expect(others).not.toContain(HOME_ENV);
    expect(others).not.toContain(TEST_ENV);
  });
  it('lo que diga la hoja manda', () => {
    expect(sectionEnv({ type: 'test', env: 'cripta' }, 0)).toBe('cripta');
    expect(sectionEnv({ type: 'pulsador', env: 'inventado' }, 0)).toBe('cementerio');
    expect(sectionEnv({ type: 'reflejos', env: 'oeste' }, 0)).toBe('oeste');
  });
  it('las temáticas (con decorado) no entran en el reparto automático', () => {
    const auto = new Set(Array.from({ length: 40 }, (_, i) => sectionEnv({ type: 'pulsador' }, i)));
    for (const e of ENVIRONMENTS.filter((e) => e.decor)) expect(auto.has(e.id)).toBe(false);
  });
});

describe('piel de cada temática', () => {
  const themed = ENVIRONMENTS.filter((e) => e.decor || e.id === 'discoteca'); // temáticas (la discoteca no lleva decorado: tiene focos)
  const ids = (list) => list.map((e) => e.id);

  it('las seis nuevas existen, con decorado, silueta propia y su música', () => {
    for (const id of ['cocteleria', 'karaoke', 'oeste', 'latina', 'noir', 'casino']) {
      const e = ENVIRONMENTS.find((x) => x.id === id);
      expect(e, id).toBeTruthy();
      expect(e.decor.length).toBeGreaterThan(0);
      expect(MOODS[id], id).toBeTruthy();
    }
    const sils = ['cocteleria', 'karaoke', 'oeste', 'latina', 'noir', 'casino'].map((id) => ENVIRONMENTS.find((x) => x.id === id).sil);
    expect(new Set(sils).size).toBe(6);
  });

  it('toda temática con decorado lleva `ui` completa (acento, kicker, letra y confeti)', () => {
    expect(themed.length).toBeGreaterThanOrEqual(13); // 6 de antes + discoteca + 6 nuevas;
    for (const e of themed) {
      expect(e.ui, e.id).toBeTruthy();
      expect(e.ui.accent, e.id).toMatch(/^#[0-9a-f]{6}$/);
      expect(e.ui.accent2, e.id).toMatch(/^#[0-9a-f]{6}$/);
      expect(e.ui.kicker, e.id).toBeTruthy();
      expect(['outfit', 'halloween']).toContain(e.ui.display);
      expect(e.ui.confetti, e.id).toBeTruthy();
    }
    expect(ids(themed)).toContain('verano');
    expect(ENVIRONMENTS.find((e) => e.id === 'discoteca').ui.display).toBe('outfit');
  });

  it('el decorado no lleva caras emoji', () => {
    const faces = /[\u{1F600}-\u{1F64F}\u{1F910}-\u{1F92F}\u{1F970}-\u{1F97A}\u{1F920}\u{1F575}\u{1F31A}-\u{1F31E}\u{1F383}]/u; // caras, 🌞🌝 y 🎃
    for (const e of themed) for (const g of e.decor ?? []) expect(faces.test(g), `${e.id} ${g}`).toBe(false);
    for (const e of themed) {
      const c = e.ui.confetti;
      if (typeof c === 'object') for (const g of c.glyphs) expect(faces.test(g), `${e.id} ${g}`).toBe(false);
    }
  });

  it('el confeti: el de la temática, money en el casino y nada (Halloween) en los de Halloween', () => {
    expect(envConfetti('casino')).toBe('money');
    expect(envConfetti('verano').glyphs).toContain('🍉');
    expect(envConfetti('cementerio')).toBeNull();
    expect(envConfetti(undefined)).toBeNull();
  });

  it('Verano y el oeste tienen sol, no luna', () => {
    for (const id of ['verano', 'oeste']) {
      const e = ENVIRONMENTS.find((x) => x.id === id);
      expect(e.sun).toBe(1);
      expect(e.moon).toBe(0);
    }
  });
});

describe('applyEnvUi', () => {
  function fakeEl() {
    const props = new Map();
    let sets = 0;
    return {
      props,
      get sets() {
        return sets;
      },
      dataset: {},
      style: {
        setProperty(k, v) {
          sets++;
          props.set(k, v);
        },
        removeProperty(k) {
          props.delete(k);
        },
      },
    };
  }

  it('pone las variables de la temática y el entorno en dataset', () => {
    const el = fakeEl();
    applyEnvUi('verano', el);
    expect(el.dataset.env).toBe('verano');
    expect(el.props.get('--accent')).toBe('#ff5a7a');
    expect(el.props.get('--accent-2')).toBe('#ffe066');
    expect(el.props.get('--kicker')).toBe('#4a1030'); // oscuro: Verano es claro (V7)
    expect(el.props.get('--title-glow')).toBeTruthy();
    expect(el.props.get('--accent-glow')).toContain('var(--accent)');
    expect(el.props.get('--display')).toContain('Outfit');
    expect(el.props.get('--display-weight')).toBe('900');
    expect(el.props.get('--env-veil')).toContain('gradient');
  });

  it('no hace nada si el entorno no cambia', () => {
    const el = fakeEl();
    applyEnvUi('casino', el);
    const n = el.sets;
    applyEnvUi('casino', el);
    expect(el.sets).toBe(n);
  });

  it('al pasar a uno de Halloween (sin ui) quita las variables; sin entorno, quita también dataset.env', () => {
    const el = fakeEl();
    applyEnvUi('karaoke', el);
    expect(el.props.size).toBeGreaterThan(0);
    applyEnvUi('cementerio', el);
    expect(el.props.size).toBe(0);
    expect(el.dataset.env).toBe('cementerio');
    applyEnvUi('oeste', el);
    expect(el.props.has('--env-veil')).toBe(true);
    applyEnvUi('relojeria', el);
    expect(el.props.has('--env-veil')).toBe(false); // lo que no pone la temática vuelve al de base.css
    applyEnvUi(null, el);
    expect(el.props.size).toBe(0);
    expect(el.dataset.env).toBeUndefined();
  });

  it('el plató millonario solo cambia el confeti (rótulo de siempre)', () => {
    const el = fakeEl();
    applyEnvUi('millonario', el);
    expect(el.props.size).toBe(0);
    expect(el.dataset.env).toBe('millonario');
  });
});
