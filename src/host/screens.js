// Pantallas de la tele (salvo el juego del Pulsador, en stage.js). Cada función devuelve el contenido de la
// pantalla a partir de `room.view()`; main.js decide cuándo repintar.
import { h } from '../shared/dom.js';
import { avatarOf, getColor } from '../shared/appearance.js';
import { MAX_PLAYERS, MIN_PLAYERS } from '../core/players.js';
import { envGradient, getEnv, sectionEnv } from '../shared/environments.js';
import { flipReorder, kinetic, later, odometer } from './fx/motion.js';
import { celebrate } from './fx/confetti.js';
import { sound } from './fx/audio.js';
import { JOKER_NAMES, jokerIcon } from '../shared/jokerIcons.js';
import { guard, logo } from '../shared/squidArt.js';
import { SQUID_GAMES } from '../core/squid.js';

const kbd = (key) => h('kbd', {}, key);
const avatar = (p, cls = 'avatar') =>
  h('span', { class: `${cls} emoji`, style: { '--pc': getColor(p.color).bg, '--pc-fg': getColor(p.color).fg }, 'aria-hidden': 'true' }, avatarOf(p));

/** Millonario: «fácil 1 · media 3 · difícil 5 puntos» (o un solo valor para todas). */
function levelPointsText(points) {
  if (!(points?.length >= 3)) return pointsText(points, false);
  return `fácil ${points[0]} · media ${points[1]} · difícil ${points[2]} puntos`;
}

function pointsText(points, ranked) {
  if (!points?.length) return '';
  if (points.length > 1) return `${points.join(' · ')} puntos para los ${points.length} primeros`;
  const n = points[0];
  return `${n} ${Math.abs(n) === 1 ? 'punto' : 'puntos'}${ranked ? '' : ' por acierto'}`;
}

// ---------------------------------------------------------------------------------------- Preparación

// La plantilla siempre recién bajada (sin «?v=…», el navegador podía dar una vieja de su caché tras publicar otra)
const TEMPLATE_URL = `./plantilla-concurso.xlsx?v=${Date.now()}`;

/**
 * Antes de empezar hay tres pasos (view.setupStep): «prep» = la hoja, los archivos y el mando; «title» = el título en
 * grande (main.js lo pinta encima, con su canción); «join» = se conecta la gente.
 * @param ctx {joinQr, controlQr, joinUrlText, onFile, onStart, onLockTeams, onMoveTeam, facesCount, tracksCount, onOpenFaces, onOpenMusic}
 */
export function setupScreen(view, ctx) {
  return view.setupStep === 'prep' ? prepScreen(view, ctx) : joinScreen(view, ctx);
}

/** El QR del mando (o «Mando conectado»). */
function controlBox(view, ctx) {
  return h(
    'aside',
    { class: 'setup-control' },
    h('p', { class: 'join-label' }, 'Mando del presentador'),
    view.controlsConnected
      ? h('p', { class: 'control-ok' }, `✓ ${view.controlsConnected === 1 ? 'Mando conectado' : `${view.controlsConnected} mandos conectados`}`)
      : h('p', { class: 'muted small' }, 'Escanéalo con tu móvil (no lo enseñes a los jugadores).'),
    view.controlsConnected ? null : ctx.controlQr,
  );
}

/** La hoja del concurso: cargar otra, plantilla y qué tal fue la última. */
function importBox(view, ctx) {
  const imp = view.lastImport;
  const fileInput = h('input', { type: 'file', accept: '.xlsx', hidden: true, onchange: (e) => e.target.files[0] && ctx.onFile(e.target.files[0]) });
  return h(
    'div',
    { class: 'import-box' },
    h('h3', {}, view.title),
    h(
      'p',
      { class: 'muted' },
      `${view.sectionCount} ${view.sectionCount === 1 ? 'sección' : 'secciones'}`,
      view.teams.length ? ` · ${view.teams.length} equipos` : ' · sin equipos',
    ),
    h(
      'div',
      { class: 'import-actions' },
      h('button', { class: 'btn', onclick: () => fileInput.click() }, 'Cargar concurso (.xlsx)'),
      h('a', { class: 'btn', href: TEMPLATE_URL, download: 'plantilla-concurso.xlsx' }, 'Descargar plantilla'),
      ctx.onOpenSaved ? h('button', { class: 'btn', onclick: ctx.onOpenSaved }, '📂 Seguir un concurso guardado') : null,
      fileInput,
    ),
    h('p', { class: 'muted small' }, 'También puedes arrastrar el archivo a esta pantalla.'),
    imp ? importReport(imp) : null,
  );
}

/** «¿Qué juegos jugamos?»: casillas para quitar las secciones que esta noche no se juegan. */
function gamesBox(view, ctx) {
  const on = view.sections.filter((s) => s.on).length;
  return h(
    'div',
    { class: 'import-box games-box' },
    h('h3', {}, '¿Qué juegos jugamos?', h('span', { class: 'muted small' }, ` · ${on} de ${view.sections.length}`)),
    h(
      'ul',
      { class: 'games-list' },
      view.sections.map((s, i) =>
        h(
          'li',
          { class: s.on ? 'on' : 'off' },
          h(
            'label',
            {},
            h('input', { type: 'checkbox', checked: s.on, onchange: (e) => ctx.onToggleSection(s.id, e.target.checked) }),
            h('span', { class: 'gl-name' }, `${i + 1}. ${s.name}`),
            h('span', { class: 'gl-type muted small' }, s.label),
          ),
        ),
      ),
    ),
    h('p', { class: 'muted small' }, 'Quita las que no te apetezcan esta noche: se saltan. También desde el mando.'),
  );
}

/** Paso 1: preparación (sin jugadores todavía): la hoja, los archivos y el mando. */
function prepScreen(view, ctx) {
  return h(
    'div',
    { class: 'setup prep' },
    h(
      'section',
      { class: 'setup-main' },
      h('div', { class: 'prep-head' }, h('h1', { class: 'prep-title' }, 'Preparación'), h('p', { class: 'muted' }, 'Carga el concurso y sus archivos y empareja tu mando. La gente se conecta después de presentar el concurso.')),
      importBox(view, ctx),
      gamesBox(view, ctx),
      extrasBox(ctx),
      h('div', { class: 'setup-start' }, h('span', {}), h('button', { class: 'btn primary huge', onclick: ctx.onStart }, 'Presentar el concurso ', kbd('Espacio'))),
    ),
    controlBox(view, ctx),
  );
}

/** Paso 3: se conecta la gente (QR grande) y se comprueban los equipos. */
function joinScreen(view, ctx) {
  const connected = view.players.filter((p) => p.connected).length;
  const missing = MIN_PLAYERS - connected;

  const teamsBoard = view.teams.length ? teamsBoardView(view, ctx) : playersBoardView(view);

  return h(
    'div',
    { class: 'setup' },
    h(
      'section',
      { class: 'setup-join' },
      h('p', { class: 'join-label' }, 'Únete con el móvil'),
      ctx.joinQr,
      h('p', { class: 'join-url' }, ctx.joinUrlText),
      h('p', { class: 'join-code' }, view.code),
    ),
    h(
      'section',
      { class: 'setup-main' },
      h(
        'div',
        { class: 'setup-players' },
        h(
          'div',
          { class: 'players-head' },
          h('h2', {}, view.teams.length ? 'Equipos' : 'Jugadores', ' ', h('span', { class: 'players-count' }, `${connected} conectados · ${view.players.length}/${MAX_PLAYERS}`)),
          view.teams.length
            ? h(
                'button',
                { class: `btn small ${view.teamsLocked ? 'locked' : ''}`, onclick: () => ctx.onLockTeams(!view.teamsLocked) },
                view.teamsLocked ? '🔒 Equipos cerrados' : '🔓 Equipos abiertos',
              )
            : null,
        ),
        teamsBoard,
      ),
      h(
        'div',
        { class: 'setup-start' },
        missing > 0
          ? h('p', { class: 'stage-hint' }, `Falta${missing > 1 ? 'n' : ''} ${missing} para empezar (mínimo ${MIN_PLAYERS}).`)
          : h('p', { class: 'muted' }, view.teams.length ? 'Comprobad que cada uno está en su equipo: al empezar, los equipos se cierran.' : '¡Todo listo!'),
        h('button', { class: 'btn primary huge', disabled: missing > 0, onclick: ctx.onStart }, view.teams.length ? 'Presentar los equipos ' : 'Empezar concurso ', kbd('Espacio')),
      ),
    ),
    controlBox(view, ctx),
  );
}

// Archivos del concurso: la carpeta (hoja, canciones y caras de una vez) y las ventanas de caras y música (main.js).
function extrasBox(ctx) {
  const n = ctx.tracksCount;
  const f = ctx.folder;
  const r = f.report;
  return h(
    'div',
    { class: 'import-box extras-box' },
    h('h3', {}, 'Archivos del concurso'),
    h(
      'div',
      { class: 'import-actions' },
      f.name
        ? h('button', { class: 'btn primary', type: 'button', disabled: f.busy, onclick: f.onReread }, f.busy ? 'Leyendo…' : `📁 Volver a leer «${f.name}»`)
        : h('button', { class: 'btn primary', type: 'button', disabled: f.busy, onclick: f.onChoose }, f.busy ? 'Leyendo…' : '📁 Elegir la carpeta del concurso'),
      f.name ? h('button', { class: 'btn', type: 'button', disabled: f.busy, onclick: f.onChoose }, 'Otra carpeta…') : null,
      h('button', { class: 'btn', type: 'button', onclick: ctx.onOpenFaces }, `🙂 Caras · ${ctx.facesCount}`),
      h('button', { class: 'btn', type: 'button', onclick: ctx.onOpenMusic }, `🎵 Música · millonario ${ctx.millionaireCount}/7${n ? ` · ${n} ${n === 1 ? 'canción' : 'canciones'}` : ''}`),
    ),
    r
      ? h(
          'p',
          { class: 'folder-report' },
          `✓ «${r.name}»: `,
          [r.sheet ? `hoja «${r.sheet}»` : 'sin hoja', `millonario ${r.millionaire}/7`, `${r.faces} ${r.faces === 1 ? 'cara' : 'caras'}`, `${r.music} ${r.music === 1 ? 'canción' : 'canciones'} más`, `${r.songs ?? 0} de las pruebas`, r.videos ? `${r.videos} ${r.videos === 1 ? 'vídeo' : 'vídeos'}` : null].filter(Boolean).join(' · '),
          r.ignored.length ? h('span', { class: 'muted', title: r.ignored.join('\n') }, ` · ${r.ignored.length} sin usar`) : null,
        )
      : null,
    // Canciones que pide la hoja (¿Qué canción es?, la bachata…): cuáles faltan en la carpeta «Canciones»
    ctx.songs?.wanted
      ? h(
          'p',
          { class: `folder-report ${ctx.songs.missing.length ? 'warn' : ''}` },
          ctx.songs.missing.length
            ? `🎵 Faltan ${ctx.songs.missing.length} de las ${ctx.songs.wanted} canciones de las pruebas en «Canciones»: ${ctx.songs.missing.join(', ')}`
            : `🎵 Están las ${ctx.songs.wanted} canciones de las pruebas`,
        )
      : null,
    h(
      'p',
      { class: 'muted small' },
      'En la carpeta: la hoja (.xlsx), «Millonario» (sus 7 canciones), «Caras» (fotos con los nombres en el del archivo), «Música/<momento>» y «Canciones» (las de las pruebas, con el nombre que pone la hoja). ',
      'Todo se copia a este portátil: si se pierde la sala, sigue aquí.',
    ),
  );
}

function importReport(imp) {
  const lines = [...imp.errors.map((e) => ({ ...e, kind: 'error' })), ...imp.warnings.map((w) => ({ ...w, kind: 'warn' }))];
  return h(
    'div',
    { class: `import-report ${imp.failed ? 'failed' : 'ok'}` },
    h(
      'p',
      { class: 'import-title' },
      imp.failed
        ? `✗ "${imp.fileName}" tiene ${imp.errors.length} ${imp.errors.length === 1 ? 'error' : 'errores'}: no se ha cargado.`
        : `✓ "${imp.fileName}" cargado: ${imp.sections} secciones${imp.teams ? `, ${imp.teams} equipos` : ''}.`,
    ),
    lines.length
      ? h(
          'ul',
          {},
          lines.slice(0, 12).map((l) => h('li', { class: l.kind }, `${l.sheet}${l.row ? `, fila ${l.row}` : ''}: ${l.message}`)),
          lines.length > 12 ? h('li', {}, `… y ${lines.length - 12} más.`) : null,
        )
      : null,
  );
}

function teamsBoardView(view, ctx) {
  const columns = view.teams.map((team) => ({ team, members: view.players.filter((p) => p.teamId === team.id) }));
  const teamless = view.players.filter((p) => !p.teamId);
  if (teamless.length) columns.push({ team: { id: null, name: 'Sin equipo', color: 'gris' }, members: teamless });
  return h(
    'div',
    { class: 'teams-board' },
    columns.map(({ team, members }) =>
      h(
        'div',
        { class: `team-col ${team.id ? '' : 'no-team'}`, style: { '--tc': getColor(team.color).bg, '--tc-fg': getColor(team.color).fg } },
        h('h3', { class: 'team-name' }, team.name, h('span', { class: 'team-count' }, String(members.length))),
        members.length
          ? h(
              'ul',
              {},
              members.map((p) =>
                h(
                  'li',
                  { class: p.connected ? '' : 'offline' },
                  avatar(p, 'mini-avatar'),
                  h('span', { class: 'member-name' }, p.name),
                  team.id
                    ? h(
                        'button',
                        {
                          type: 'button',
                          class: `spokes-btn ${view.spokespeople?.[team.id] === p.id ? 'on' : ''}`,
                          title: view.spokespeople?.[team.id] === p.id ? 'Portavoz del equipo' : `Hacer portavoz a ${p.name}`,
                          'aria-label': view.spokespeople?.[team.id] === p.id ? `${p.name} es el portavoz` : `Hacer portavoz a ${p.name}`,
                          onclick: () => ctx.onSpokesperson(team.id, p.id),
                        },
                        '📣',
                      )
                    : null,
                  h(
                    'select',
                    {
                      class: 'move-team',
                      title: `Mover a ${p.name} de equipo`,
                      'aria-label': `Equipo de ${p.name}`,
                      onchange: (e) => ctx.onMoveTeam(p.id, e.target.value),
                    },
                    team.id ? null : h('option', { value: '', selected: true }, '—'),
                    view.teams.map((t) => h('option', { value: t.id, selected: t.id === p.teamId }, t.name)),
                  ),
                ),
              ),
            )
          : h('p', { class: 'muted small' }, team.id ? 'Nadie todavía' : ''),
      ),
    ),
  );
}

function playersBoardView(view) {
  if (!view.players.length) return h('div', { class: 'empty' }, 'Todavía no hay nadie. ¡Escanead el QR!');
  return h(
    'ul',
    { class: 'chips' },
    view.players.map((p) => h('li', { class: p.connected ? '' : 'offline' }, avatar(p, 'mini-avatar'), h('span', { class: 'member-name' }, p.name))),
  );
}

// ---------------------------------------------------------------------------------------- Portada e intro

// Introducción del concurso: título, qué secciones habrá esta noche, equipos y cómo se juega.
export function coverScreen(view) {
  const teams = view.standings.map((s) => s.team);
  return h(
    'div',
    { class: 'cover' },
    h('p', { class: 'cover-kicker' }, '¡Bienvenidos a…'),
    kinetic('h1', 'cover-title display', view.title),
    h(
      'div',
      { class: 'cover-body' },
      h(
        'section',
        { class: 'cover-block' },
        h('h2', {}, `Esta noche · ${view.sectionCount} ${view.sectionCount === 1 ? 'sección' : 'secciones'}`),
        h(
          'ol',
          // con muchas (más de 12), sin el tipo debajo: que quepan todas en una tele de 720 de alto
          { class: `cover-sections ${view.sectionCount > 5 ? 'many' : ''} ${view.sectionCount > 12 ? 'lots' : ''}` },
          view.sections
            .filter((s) => s.on)
            .map((s, i) =>
            h(
              'li',
              { style: { '--d': `${900 + i * 140}ms`, '--env': envGradient(s.env) } },
              h('span', { class: 'cs-num' }, String(i + 1)),
              h('span', { class: 'cs-name' }, s.name),
              h('span', { class: 'cs-type' }, s.label),
            ),
          ),
        ),
      ),
      h(
        'section',
        { class: 'cover-block' },
        h('h2', {}, 'Cómo se juega'),
        h(
          'ul',
          { class: 'cover-rules' },
          [
            ['📱', 'Tu móvil es tu pulsador: respondes desde él.'],
            ['⏱️', 'Antes de cada pregunta, una cuenta atrás. ¡No pulses antes de tiempo!'],
            ['🔒', 'La primera respuesta es la que vale: tócala dos veces para confirmar.'],
            ['🚨', 'Si sales de la app con una pregunta abierta, ¡te pillamos! Y tu respuesta no cuenta.'],
            teams.length ? ['🏆', `Juegan ${teams.length} equipos: cada punto tuyo suma para el tuyo.`] : ['🏆', 'Gana quien más puntos tenga al final.'],
          ].map(([icon, text], i) => h('li', { style: { '--d': `${1300 + i * 220}ms` } }, h('span', { class: 'emoji' }, icon), h('span', {}, text))),
        ),
        teams.length
          ? h(
              'ul',
              { class: 'cover-teams' },
              teams.map((t) => h('li', { style: { '--tc': getColor(t.color).bg, '--tc-fg': getColor(t.color).fg } }, t.name)),
            )
          : h('p', { class: 'cover-sub' }, `${view.players.length} concursantes`),
      ),
    ),
  );
}

/**
 * Presentación de los equipos, antes de la portada: cada equipo entra por su lado con su gente y, en medio, «VS»
 * (los golpes y la fanfarria los lanza el realizador a la vez: 0,5 s, 1,3 s y 2,1 s).
 */
/** El bicho de un equipo de Halloween, por su nombre («Hombres lobo» → 🐺), para la presentación de equipos. */
const CREATURES = [
  [/lobo|wolf/, '🐺'],
  [/vampir|dracul/, '🧛'],
  [/zombi/, '🧟'],
  [/bruj|witch/, '🧙'],
  [/fantasm|ghost/, '👻'],
  [/calabaz|pumpkin/, '🎃'],
  [/esquelet|calaver|skelet/, '💀'],
  [/momia|mummy/, '🧻'],
];
const teamCreature = (name) =>
  CREATURES.find(([re]) =>
    re.test(
      String(name)
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase(),
    ),
  )?.[1] ?? null;

export function versusScreen(view) {
  const teams = view.teams
    .map((team) => ({ team, members: view.players.filter((p) => p.teamId === team.id) }))
    .filter((t) => t.members.length);
  const items = [];
  teams.forEach(({ team, members }, i) => {
    if (i) items.push(h('div', { class: 'vs-sep display', style: { '--d': `${2100 + (i - 1) * 150}ms` } }, 'VS'));
    items.push(
      h(
        'section',
        { class: `vs-team ${i % 2 ? 'from-right' : 'from-left'}`, style: { '--tc': getColor(team.color).bg, '--d': `${500 + i * 800}ms` } },
        teamCreature(team.name) ? h('p', { class: 'vs-creature', 'aria-hidden': 'true' }, teamCreature(team.name)) : null,
        h('h2', { class: 'vs-name display' }, team.name),
        h(
          'ul',
          { class: 'vs-members' },
          members.map((p, k) => h('li', { style: { '--d': `${800 + i * 800 + k * 120}ms` } }, h('span', { class: 'mini-avatar emoji', style: { '--pc': getColor(p.color).bg } }, avatarOf(p)), h('span', {}, p.name))),
        ),
      ),
    );
  });
  return h(
    'div',
    { class: `versus n${teams.length}` },
    h('p', { class: 'versus-kicker' }, view.title),
    h('div', { class: 'versus-row' }, items),
  );
}

export function introScreen(view) {
  const s = view.section;
  if (view.introRules) return millionaireRules(view);
  if (s.type === 'squid') return squidWelcome(view);
  return h(
    'div',
    { class: 'intro anim-in' },
    h('p', { class: 'intro-kicker' }, `Sección ${view.sectionNumber} de ${view.sectionCount} · ${getEnv(sectionEnv(s, view.sectionIndex)).name}`),
    // (un nombre largo, más pequeño: en dos líneas no cabe lo demás en una tele de 720)
    kinetic('h1', `intro-title display ${s.name.length > 16 ? 'long' : ''}`, s.name),
    h('p', { class: 'intro-type' }, view.sectionLabel),
    s.description && s.type !== 'panuelo' ? h('p', { class: 'intro-desc' }, s.description) : null,
    s.type === 'panuelo' ? hankyIntro(view) : null,
    h('p', { class: 'intro-points' }, s.type === 'test' ? levelPointsText(s.points) : s.type === 'apuesta' ? 'Os jugáis vuestros puntos' : s.type === 'palabras' ? pointsText(s.points, true) + ' por palabra acertada' : s.type === 'panuelo' ? pointsText(s.points, true) + ' por cada duelo ganado' : pointsText(s.points, s.points.length > 1)),
    view.playable ? null : h('p', { class: 'intro-soon' }, 'Esta sección llegará en una próxima versión: se saltará.'),
    view.turns ? turnsIntro(view.turns) : null,
  );
}

/** El pañuelo: los dos bandos (el primer equipo son los lobos; el segundo, los vampiros) y cómo se juega. */
function hankyIntro(view) {
  const [wolf, vampire] = view.teams;
  return [
    h('p', { class: 'hk-intro-vs' }, h('span', {}, `🐺 ${wolf?.name ?? 'Hombres lobo'}`), h('strong', { class: 'display' }, 'VS'), h('span', {}, `${vampire?.name ?? 'Vampiros'} 🧛`)),
    h('p', { class: 'intro-desc' }, 'Sale uno de cada equipo y se sientan en su sillón. A la señal, ¡a por el pañuelo del centro y de vuelta al sillón! El presentador dice quién llega antes.'),
  ];
}

/** Squid Games: la invitación (su propia estética, a toda la tele: ver squid.css). */
function squidWelcome(view) {
  const s = view.section;
  const games = (s.items ?? []).filter((i) => i.game && i.game !== 'hucha');
  const players = view.players.filter((p) => p.connected && !p.presenter).length;
  const pts = s.points?.[0] ?? 1;
  return h(
    'section',
    { class: 'squid-stage sq-welcome' },
    guard('triangle'),
    h(
      'div',
      { class: 'sq-welcome-main' },
      h('div', { class: 'sq-invite' }, h('div', { class: 'sq-invite-card' }, h('div', { class: 'sq-invite-face front' }, logo('sq-invite-logo')), h('div', { class: 'sq-invite-face back' }, logo('sq-invite-logo'), h('p', {}, '¿Quieres jugar?'), h('small', {}, '456')))),
      h('p', { class: 'sq-game-no' }, `Sección ${view.sectionNumber} de ${view.sectionCount}`),
      h('h1', { class: 'sq-title sq-welcome-title' }, s.name),
      h(
        'ol',
        { class: 'sq-welcome-games' },
        games.map((g, i) => h('li', { style: { '--d': `${900 + i * 140}ms` } }, h('b', {}, String(i + 1)), h('span', { class: 'emoji' }, SQUID_GAMES[g.game]?.icon ?? '❔'), SQUID_GAMES[g.game]?.label ?? g.game)),
      ),
      h('p', { class: 'sq-rule' }, `${players} jugadores. Quien cae en un juego, fuera: cada eliminado mete ${pts} ${pts === 1 ? 'punto' : 'puntos'} en la hucha y los supervivientes se la reparten al final.`),
    ),
    guard('circle'),
  );
}

/** Millonario: «Cómo se juega» (suena la Explicación), entre el título de la sección y la primera pregunta. */
function millionaireRules(view) {
  const teams = view.teams.length > 0;
  const jokers = [
    ['fifty', 'quita dos respuestas incorrectas'],
    ['audience', `${teams ? 'tu equipo vota' : 'los demás votan'} en su móvil durante 15 s… ¡sin hablar!`],
    ['call', `${teams ? 'un compañero' : 'alguien'} sale de la sala y te llama: 30 segundos`],
  ];
  return h(
    'div',
    { class: 'intro mill-rules anim-in' },
    h('p', { class: 'intro-kicker' }, view.section.name),
    kinetic('h1', 'intro-title display', 'Cómo se juega'),
    h(
      'ol',
      { class: 'mill-rules-list' },
      h('li', {}, teams ? 'Concursa una persona cada vez, alternando equipos y en el orden que elija vuestro portavoz.' : 'Concursa una persona cada vez.'),
      h('li', {}, 'Las respuestas van apareciendo. Elige en tu móvil: toca una y vuelve a tocarla para confirmar.'),
      h('li', {}, 'Cuando el presentador la marque, es tu respuesta definitiva.'),
      h('li', {}, `Por acierto: ${levelPointsText(view.section.points)}. Salir de la app durante tu pregunta es trampa: no puntúas.`),
    ),
    h('p', { class: 'mill-rules-sub' }, `Comodines: uno de cada ${teams ? 'por equipo' : 'por persona'} para toda la sección`),
    h(
      'ul',
      { class: 'mill-rules-jokers' },
      jokers.map(([k, text]) => h('li', {}, jokerIcon(k), h('div', {}, h('strong', {}, JOKER_NAMES[k]), h('span', {}, text)))),
    ),
    view.turns ? turnsIntro(view.turns) : null,
  );
}

/** Por turnos: cada uno responde una pregunta; el portavoz de cada equipo elige el orden en su móvil. */
function turnsIntro(turns) {
  return h(
    'div',
    { class: 'turns-intro' },
    h('p', { class: 'how' }, 'Por turnos: cada uno responde una pregunta. ¡Portavoces, ordenad a vuestro equipo de la más fácil a la más difícil!'),
    h(
      'ul',
      { class: 'turns-teams' },
      turns.teams.map((t) =>
        h(
          'li',
          { class: t.ready ? 'ready' : '', style: { '--tc': getColor(t.team.color).bg } },
          h('strong', {}, t.team.name),
          h('span', { class: 'muted' }, t.ready ? '✓ Orden listo' : `📣 ${t.spokesperson?.name ?? '¿?'} está ordenando…`),
          t.ready
            ? h(
                'ol',
                {},
                t.order.filter(Boolean).map((p) => h('li', {}, h('span', { class: 'emoji' }, avatarOf(p)), p.name)),
              )
            : null,
        ),
      ),
    ),
  );
}

// ---------------------------------------------------------------------------------------- Marcador y final

// Puntos de la última vez que se enseñó el marcador: el siguiente empieza ahí, en el orden de entonces, y luego
// los puntos ruedan hasta los de ahora y las filas se reordenan. La primera vez, todos parten de 0.
const shownScores = new Map(); // 't:id' / 'p:id' → puntos
const ROLL_AT = 700; // ms: empiezan a rodar los puntos
const REORDER_AT = 2000; // ms: se reordenan las filas

export function scoreboardScreen(view, { title = 'Marcador' } = {}) {
  const max = Math.max(1, ...view.standings.map((s) => s.score), ...view.players.map((p) => p.score));
  const width = (score) => `${Math.max(3, (Math.max(0, score) / max) * 100)}%`;

  const teams = view.standings.map((s) => ({ key: `t:${s.team.id}`, s, score: s.score }));
  const players = [...view.players].sort((a, b) => b.score - a.score).map((p) => ({ key: `p:${p.id}`, p, score: p.score }));
  for (const list of [teams, players]) for (const r of list) r.old = shownScores.get(r.key) ?? 0;
  const byOld = (list) => [...list].sort((a, b) => b.old - a.old || list.indexOf(a) - list.indexOf(b));

  const teamList = teams.length
    ? h(
        'ol',
        { class: 'sb-teams' },
        byOld(teams).map((r) =>
          h(
            'li',
            { 'data-key': r.key, style: { '--tc': getColor(r.s.team.color).bg, '--tc-fg': getColor(r.s.team.color).fg, '--w': width(r.old) } },
            h('span', { class: 'sb-place' }),
            h('span', { class: 'sb-team-name' }, r.s.team.name),
            h('span', { class: 'sb-bar' }, h('span', { class: 'sb-fill' })),
            h('span', { class: 'sb-score' }, odometer(r.score, r.old, { delay: ROLL_AT })),
          ),
        ),
      )
    : null;
  const playerList = h(
    'ol',
    { class: `sb-players ${teams.length ? 'compact' : ''} ${players.length > 12 ? 'many' : ''}` },
    byOld(players).map((r) =>
      h(
        'li',
        { 'data-key': r.key, style: { '--pc': getColor(r.p.color).bg } },
        h('span', { class: 'sb-place' }),
        avatar(r.p, 'mini-avatar'),
        h('span', { class: 'member-name' }, r.p.name),
        h('span', { class: 'sb-score' }, odometer(r.score, r.old, { delay: ROLL_AT })),
      ),
    ),
  );
  const root = h('div', { class: 'scoreboard anim-in' }, kinetic('h1', 'sb-title display', title), teamList, playerList);

  const places = (list) => [...list.children].forEach((li, i) => (li.querySelector('.sb-place').textContent = `${i + 1}º`));
  for (const list of [teamList, playerList]) if (list) places(list);
  later(root, ROLL_AT, () =>
    teamList?.querySelectorAll('li').forEach((li) => li.style.setProperty('--w', width(teams.find((r) => r.key === li.dataset.key).score))),
  );
  later(root, REORDER_AT, () => {
    for (const [list, rows] of [
      [teamList, teams],
      [playerList, players],
    ]) {
      if (!list) continue;
      const before = [...list.children].map((li) => li.dataset.key).join();
      flipReorder(list, rows.map((r) => r.key));
      places(list);
      if (before !== rows.map((r) => r.key).join()) sound.play('pop');
    }
  });
  for (const r of [...teams, ...players]) shownScores.set(r.key, r.score);
  return root;
}

// Podio: aparece el 3º, luego el 2º y, tras un redoble, el 1º con confeti y fanfarria.
const PODIUM_AT = { 3: 800, 2: 2300, 1: 4300 };

export function finalScreen(view) {
  const podium = (entries) =>
    h(
      'div',
      { class: 'podium' },
      // Orden visual 2º · 1º · 3º
      [1, 0, 2].map((i) => {
        const e = entries[i];
        if (!e) return h('div', { class: 'podium-step empty' });
        return h(
          'div',
          { class: `podium-step p${i + 1}`, style: { '--pc': getColor(e.color).bg, '--pc-fg': getColor(e.color).fg, '--d': `${PODIUM_AT[i + 1]}ms` } },
          e.icon || e.face ? h('span', { class: 'podium-icon emoji' }, avatarOf(e)) : null,
          h('span', { class: 'podium-name' }, e.name),
          h('span', { class: 'podium-score' }, `${e.score} pts`),
          h('span', { class: 'podium-block' }, `${i + 1}º`),
        );
      }),
    );
  const teamEntries = view.standings.map((s) => ({ name: s.team.name, color: s.team.color, score: s.score }));
  const playerEntries = [...view.players].sort((a, b) => b.score - a.score);
  const root = h(
    'div',
    { class: 'final' },
    kinetic('h1', 'final-title display', '¡Enhorabuena!'),
    h(
      'div',
      { class: `final-podiums ${teamEntries.length ? 'two' : ''}` },
      teamEntries.length ? h('div', {}, h('h2', {}, 'Equipos'), podium(teamEntries)) : null,
      h('div', {}, h('h2', {}, teamEntries.length ? 'Concursantes' : 'Podio'), podium(playerEntries)),
    ),
  );
  sound.play('pop', PODIUM_AT[3]);
  sound.play('pop', PODIUM_AT[2]);
  sound.play('roll', PODIUM_AT[1] - 900);
  sound.play('fanfare', PODIUM_AT[1]);
  later(root, PODIUM_AT[1], () => celebrate(4500));
  return root;
}

// ---------------------------------------------------------------------------------------- Castigos

/** Tras presentar los equipos: cada uno vota 3 castigos en su móvil; al cerrar, los 3 que van a la ruleta. */
export function punishVoteScreen(view) {
  const p = view.punish;
  const max = Math.max(1, ...p.tally);
  const finalists = new Set(p.finalists?.map((f) => f.index) ?? []);
  return h(
    'div',
    { class: 'punish anim-in' },
    h('p', { class: 'intro-kicker' }, view.title),
    kinetic('h1', 'punish-title display', p.closed ? '¡Estos van a la ruleta!' : '¿Qué castigo para quien pierda?'),
    h(
      'p',
      { class: 'answer-prompt' },
      p.closed ? 'Al final del concurso, la ruleta elegirá uno para el equipo que quede último.' : `Votad en el móvil vuestros 3 favoritos · ${p.voters} ${p.voters === 1 ? 'ha votado' : 'han votado'}`,
    ),
    h(
      'ol',
      { class: 'punish-list' },
      p.options.map((text, i) =>
        h(
          'li',
          { class: p.closed ? (finalists.has(i) ? 'finalist' : 'out') : '', style: { '--w': `${(p.tally[i] / max) * 100}%` } },
          h('span', { class: 'pl-bar' }),
          h('span', { class: 'pl-text' }, text),
          h('span', { class: 'pl-votes' }, String(p.tally[i])),
        ),
      ),
    ),
  );
}

const SPIN_MS = 6000; // lo que tarda la ruleta en pararse
let spunAt = null; // la tirada que ya se animó (al repintar no vuelve a girar)

/** En el final: la ruleta con los 3 castigos; gira y se para en el que toca al que ha perdido. */
export function rouletteScreen(view) {
  const p = view.punish;
  const list = p.finalists ?? [];
  const slice = 360 / Math.max(1, list.length);
  const colors = ['#ff8a1f', '#7c4dff', '#2fbf71', '#e53935', '#1e88e5'];
  const wheel = h('div', { class: 'roulette-wheel' });
  wheel.style.background = `conic-gradient(${list.map((_, i) => `${colors[i % colors.length]} ${i * slice}deg ${(i + 1) * slice}deg`).join(', ')})`;
  list.forEach((f, i) => {
    const label = h('span', { class: 'rw-label' }, f.text);
    label.style.transform = `rotate(${i * slice + slice / 2}deg)`; // el texto, en la mitad de arriba de su porción
    wheel.append(label);
  });
  const result = h('p', { class: 'roulette-result display', hidden: true });
  if (p.spin) {
    const k = list.findIndex((f) => f.index === p.spin.index);
    const target = 360 * 6 + (360 - (k * slice + slice / 2));
    const fresh = spunAt !== p.spin.at && p.spin.ago < SPIN_MS;
    spunAt = p.spin.at;
    const land = () => {
      result.textContent = p.spin.text;
      result.hidden = false;
    };
    if (fresh) {
      requestAnimationFrame(() => requestAnimationFrame(() => (wheel.style.transform = `rotate(${target}deg)`)));
      later(wheel, SPIN_MS - p.spin.ago, () => {
        land();
        celebrate(3000);
      });
    } else {
      wheel.style.transition = 'none';
      wheel.style.transform = `rotate(${target}deg)`;
      land();
    }
  }
  return h(
    'div',
    { class: 'roulette anim-in' },
    kinetic('h1', 'punish-title display', 'La ruleta del castigo'),
    p.loser ? h('p', { class: 'roulette-loser', style: { '--tc': getColor(p.loser.color).bg } }, `Pierde${p.loser.isTeam ? 'n' : ''}: `, h('strong', {}, p.loser.name)) : null,
    h('div', { class: 'roulette-box' }, h('span', { class: 'roulette-pointer' }, '▼'), wheel),
    result,
    p.spin ? null : h('p', { class: 'muted' }, 'Pulsa Espacio (o «Girar» en el mando) para girar la ruleta'),
  );
}

// ---------------------------------------------------------------------------------------- En pausa (seguir otro día)

/** «el sábado 25 de octubre a las 23:40» */
export function pausedDate(at) {
  const d = new Date(at);
  const day = d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }).replace(',', '');
  const time = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  return `el ${day} a las ${time}`;
}

/** Por dónde iba el concurso: «Sección 7 de 15 · Reloj interno», «Antes de empezar»… */
export function pausedWhere({ screen, sectionNumber, sectionCount, sectionName }) {
  if (screen === 'setup') return 'Antes de empezar';
  if (screen === 'cover') return 'En la portada';
  if (screen === 'final') return 'En el final';
  return `Sección ${sectionNumber} de ${sectionCount}${sectionName ? ` · ${sectionName}` : ''}`;
}

/**
 * Concurso en pausa: «Continuará…», cuándo se paró, por dónde iba, el marcador y cómo volver a entrar.
 * @param ctx {joinQr, joinUrlText, onResume, onSaveCopy}
 */
export function pausedScreen(view, ctx) {
  const connected = view.players.filter((p) => p.connected).length;
  const teams = view.standings.map((s) => ({ name: s.team.name, color: s.team.color, score: s.score })).sort((a, b) => b.score - a.score);
  const top = [...view.players].sort((a, b) => b.score - a.score).slice(0, teams.length ? 0 : 5);
  const rows = teams.length ? teams : top;
  return h(
    'div',
    { class: 'paused anim-in' },
    h('p', { class: 'paused-kicker' }, `⏸ En pausa desde ${pausedDate(view.paused.at)}`),
    kinetic('h1', 'paused-title display', 'Continuará…'),
    h('p', { class: 'paused-where' }, 'Íbamos por: ', h('strong', {}, pausedWhere({ screen: view.screen, sectionNumber: view.sectionNumber, sectionCount: view.sectionCount, sectionName: view.section?.name }))),
    rows.length
      ? h(
          'ol',
          { class: 'paused-standings' },
          rows.map((r, i) =>
            h(
              'li',
              { style: { '--pc': getColor(r.color).bg } },
              h('span', { class: 'ps-place' }, `${i + 1}º`),
              r.icon || r.face ? h('span', { class: 'emoji' }, avatarOf(r)) : null,
              h('span', { class: 'ps-name' }, r.name),
              h('strong', {}, `${r.score} pts`),
            ),
          ),
        )
      : null,
    h(
      'div',
      { class: 'paused-join' },
      ctx.joinQr,
      h(
        'div',
        {},
        h('p', {}, 'Para volver: entrad con el código ', h('strong', { class: 'code-inline' }, view.code), ' y vuestro mismo nombre.'),
        h('p', { class: 'muted' }, `${ctx.joinUrlText} · ${connected} de ${view.players.length} conectados`),
      ),
    ),
    h(
      'div',
      { class: 'stage-actions' },
      h('button', { class: 'btn primary huge', onclick: ctx.onResume }, '▶ Seguir el concurso ', h('kbd', {}, 'Espacio')),
      h('button', { class: 'btn', onclick: ctx.onSaveCopy }, '💾 Guardar copia en un archivo'),
    ),
  );
}
