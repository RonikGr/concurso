// Pantalla de la tele en la sección Libre ("Fit o Fat"): presentación de la prueba, cronómetro o contadores
// en grande y ganador. Solo espectáculo: lo arbitra el presentador desde el mando.
import { fill, h } from '../shared/dom.js';
import { avatarOf, getColor } from '../shared/appearance.js';
import { FPHASE, TOOL } from '../core/free.js';
import { kinetic, odometer } from './fx/motion.js';
import { sound } from './fx/audio.js';

/** 83 456 ms → "1:23,4" */
export function formatClock(ms) {
  const total = Math.max(0, ms) / 1000;
  const minutes = Math.floor(total / 60);
  const seconds = total - minutes * 60;
  return `${minutes}:${seconds.toFixed(1).padStart(4, '0').replace('.', ',')}`;
}

export function createFreeStage() {
  const root = h('section', { class: 'free-stage' });
  let raf = 0;
  let songTimer = 0; // bachata: el letrero sigue la canción
  const lastCounts = new Map(); // id → último valor pintado del contador, para que la cifra ruede

  function render(view) {
    cancelAnimationFrame(raf);
    clearTimeout(songTimer);
    const f = view.free;
    if (!f) return;
    root.dataset.phase = f.phase;
    const progress = view.itemCount > 1 ? `Prueba ${view.itemIndex + 1} de ${view.itemCount}` : '';
    const header = h('p', { class: 'stage-q' }, [view.section.name, progress].filter(Boolean).join(' · '));
    const pointsText =
      f.tool === TOOL.SCORE
        ? `El presentador da ${f.byTeams ? 'a cada equipo' : 'a cada uno'} una nota del 1 al 10: son sus puntos`
        : `${f.points} ${f.points === 1 ? 'punto' : 'puntos'} para ${f.byTeams ? 'el equipo ganador' : 'quien gane'}`;

    if (f.phase === FPHASE.SETUP) {
      return fill(
        root,
        header,
        kinetic('h2', 'free-title big display', f.title),
        f.description ? h('p', { class: 'free-desc' }, f.description) : null,
        f.participants.length
          ? h('ul', { class: 'free-chips' }, f.participants.map((p) => chip(p)))
          : h('p', { class: 'answer-prompt' }, `El presentador elige ${f.byTeams ? 'qué equipos participan' : 'quién participa'}`),
        h('p', { class: 'intro-points' }, pointsText),
      );
    }

    if (f.phase === FPHASE.AWARDED) {
      return fill(
        root,
        header,
        h('h2', { class: 'free-title' }, f.title),
        kinetic('p', 'free-winner display', `🏆 ${andList(f.winners.map((w) => w.name))}`),
        h('p', { class: 'result-verdict' }, f.tool === TOOL.SCORE ? `La mejor nota: ${f.awarded[f.winners[0]?.id] ?? ''}` : `+${f.points} ${f.winners.length > 1 ? 'cada uno' : ''}`.trim()),
        f.tool === TOOL.NONE ? null : results(f),
      );
    }

    if (f.tool === TOOL.TRIAL) return renderTrial(f, header);
    if ((f.tool === TOOL.NONE && f.song) || f.tool === TOOL.SCORE) return renderSong(f, header);

    // En marcha o parada: reloj en grande y cada participante.
    const clock = h('p', { class: `big-clock free-clock ${f.phase === FPHASE.STOPPED ? 'stopped' : ''}` });
    fill(
      root,
      header,
      h('h2', { class: 'free-title' }, f.title),
      clock,
      h(
        'ul',
        { class: `free-cards ${f.tool}` },
        f.participants.map((p) =>
          h(
            'li',
            { class: p.out != null ? 'out' : '', style: { '--pc': getColor(p.color).bg, '--pc-fg': getColor(p.color).fg } },
            h('span', { class: 'free-name' }, p.icon || p.face ? h('span', { class: 'emoji' }, avatarOf(p)) : null, ' ', p.name),
            f.tool === TOOL.COUNTER
              ? h('span', { class: 'free-count' }, odometer(p.count, lastCounts.get(p.id) ?? p.count, { duration: 500 }))
              : h('span', { class: 'free-status' }, p.out != null ? `Cayó a los ${formatClock(p.out)}` : f.phase === FPHASE.STOPPED ? '¡Aguantó!' : 'Aguanta…'),
          ),
        ),
      ),
    );
    for (const p of f.participants) lastCounts.set(p.id, p.count);
    const tick = () => {
      clock.textContent = formatClock((f.tStop ?? performance.now()) - f.tStart);
      if (f.phase === FPHASE.RUNNING) raf = requestAnimationFrame(tick);
    };
    tick();
  }

  /** Contrarreloj (las botellas): quién sale, su reloj, sus intentos y los tiempos de los que ya han salido. */
  function renderTrial(f, header) {
    const cur = f.participants.find((p) => p.id === f.current);
    const tr = f.trials?.[f.current];
    const clock = h('p', { class: `big-clock free-clock ${f.trialRunning ? '' : 'stopped'}` });
    const attempts = tr?.attempts ?? [];
    fill(
      root,
      header,
      h('h2', { class: 'free-title' }, f.title),
      cur && f.phase === FPHASE.RUNNING
        ? h('p', { class: 'trial-who', style: { '--pc': getColor(cur.color).bg } }, cur.icon || cur.face ? h('span', { class: 'emoji' }, avatarOf(cur)) : null, ' ', cur.name, f.trialRunning ? '' : ' · ¡prepárate!')
        : null,
      clock,
      attempts.length
        ? h(
            'ol',
            { class: 'trial-attempts' },
            attempts.slice(-6).map((a, i, list) =>
              h(
                'li',
                { class: i === list.length - 1 ? 'last' : '' },
                h('span', { class: 'ta-n' }, `${attempts.length - list.length + i + 1}º`),
                f.pieces ? h('span', { class: 'ta-pieces' }, Array.from({ length: f.pieces }, (_, k) => h('i', { class: k < a.n ? 'on' : '' }))) : null,
                h('strong', {}, f.pieces ? `${a.n} de ${f.pieces}` : formatClock(a.t)),
              ),
            ),
          )
        : null,
      h(
        'ul',
        { class: 'trial-times' },
        f.participants.map((p) => {
          const t = f.trials?.[p.id];
          return h(
            'li',
            { class: p.id === f.current && f.trialRunning ? 'now' : t?.time != null ? 'done' : '', style: { '--pc': getColor(p.color).bg } },
            h('span', {}, p.name),
            h('strong', {}, t?.time != null ? (t.gaveUp ? 'se rindió' : formatClock(t.time)) : p.id === f.current && f.trialRunning ? 'en marcha' : '—'),
          );
        }),
      ),
    );
    const tick = () => {
      if (tr) clock.textContent = formatClock(tr.time ?? performance.now() - tr.tStart);
      else clock.textContent = formatClock(0);
      if (f.trialRunning) raf = requestAnimationFrame(tick);
    };
    tick();
  }

  /** Prueba con canción (marcar el golpe bailando): suena… y, si la fila tiene golpe, se calla antes y ¡golpe! */
  function renderSong(f, header) {
    const scoring = f.tool === TOOL.SCORE;
    const status = h('p', { class: 'song-status display' });
    fill(
      root,
      header,
      h('h2', { class: 'free-title' }, f.title),
      f.description ? h('p', { class: 'free-desc' }, f.description) : null,
      status,
      h('ul', { class: 'free-chips' }, f.participants.map((p) => chip(p, scoring ? p.score : undefined))),
    );
    const show = (text, mode) => {
      if (status.textContent !== text) status.textContent = text;
      status.dataset.mode = mode;
    };
    let lastCount = null;
    const tick = () => {
      if (f.phase !== FPHASE.RUNNING) return show(scoring ? '🎵 Las notas del presentador…' : '🎵 ¿Quién lo ha clavado?', 'end');
      // Nota: cuenta atrás 3-2-1 antes de que suene (la canción empieza en tStart)
      const left = f.tStart - performance.now();
      if (left > 0) {
        const n = Math.ceil(left / 1000);
        if (n !== lastCount) {
          lastCount = n;
          sound.play('count');
        }
        show(String(n), 'count');
        songTimer = setTimeout(tick, 40);
        return;
      }
      if (lastCount != null) {
        lastCount = null;
        sound.play('go');
      }
      if (!f.song) return show('💃 ¡A bailar!', 'dance');
      const pos = sound.songPosition(f.roundId);
      // (si la canción no está en el portátil, a los 1,5 s se baila igual)
      if (pos == null) show(performance.now() - f.tStart > 1500 ? '💃 ¡A bailar!' : '🎵 Preparados…', 'dance');
      else if (pos < f.songStart) show('🎵 Preparados…', 'ready');
      else if (f.beat == null) show('💃 ¡A bailar!', 'dance');
      else if (pos < f.beat - f.silence) show('💃 ¡A bailar!', 'dance');
      else if (pos < f.beat) show('🤫 ¡Seguid sin música!', 'silence');
      else show('💥 ¡GOLPE!', 'beat');
      songTimer = setTimeout(tick, 40); // no rAF: el navegador lo frena si la ventana no se ve
    };
    tick();
  }

  return {
    root,
    render,
    stop: () => {
      cancelAnimationFrame(raf);
      clearTimeout(songTimer);
    },
  };
}

/** «Ana», «Ana y Luis», «Ana, Luis y Eva» */
const andList = (names) => (names.length > 1 ? `${names.slice(0, -1).join(', ')} y ${names.at(-1)}` : (names[0] ?? ''));

/** Un participante; con `score` (nota), su nota al lado (o «…» si aún no la tiene). */
function chip(p, score) {
  return h(
    'li',
    { style: { '--pc': getColor(p.color).bg, '--pc-fg': getColor(p.color).fg } },
    p.icon || p.face ? h('span', { class: 'emoji' }, avatarOf(p)) : null,
    h('span', {}, p.name),
    score === undefined ? null : h('strong', { class: `free-score ${score == null ? 'none' : ''}` }, score == null ? '…' : String(score)),
  );
}

function results(f) {
  return h(
    'ol',
    { class: 'estimates' },
    f.ranking.map((r) =>
      h(
        'li',
        { class: r.place === 1 ? 'first' : '', style: { '--pc': getColor(r.who.color).bg } },
        h('span', { class: 'f-place' }, r.place ? `${r.place}º` : '—'),
        h('span', { class: 'emoji' }, r.who.icon || r.who.face ? avatarOf(r.who) : ''),
        h('span', { class: 'es-name' }, r.who.name),
        h('span', { class: 'es-value' }, f.tool === TOOL.STOPWATCH || f.tool === TOOL.TRIAL ? (r.value == null ? '—' : formatClock(r.value)) : f.tool === TOOL.SCORE ? (r.value == null ? '—' : `${r.value}/10`) : String(r.value)),
        h('span', {}),
        h('strong', { class: 'es-points' }, f.awarded[r.id] ? `+${f.awarded[r.id]}` : ''),
      ),
    ),
  );
}
