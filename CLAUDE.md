# Concurso del año — pulsador con móviles

Web 100 % estática (GitHub Pages) para concursos en casa. El presentador (portátil conectado a la tele)
crea una sala; cada jugador usa su móvil como pulsador. Comunicación WebRTC con PeerJS usando el
servidor de enlace público (`0.peerjs.com`). **El presentador es la autoridad**: decide ganador, puntos y estado.

## Comandos

- `npm run dev` — servidor Vite con HTTPS autofirmado, accesible desde la LAN (`--host`).
- `npm test` — tests (Vitest) de la lógica pura en `src/core` y `src/shared`.
- `npm run build` — genera `dist/`. El despliegue lo hace `.github/workflows/deploy.yml` al hacer push a `main`.
- `node scripts/check-sheet.mjs "<hoja.xlsx>"` — lee una hoja como la tele (errores, avisos, secciones).
  `node scripts/check-folder.mjs "<carpeta>"` — reparte la carpeta del concurso como la tele (qué suena dónde, qué sobra).
- `npm run plantilla` — regenera `public/plantilla-concurso.xlsx` (script `scripts/make-template.mjs`, ExcelJS solo en desarrollo).
  Un test comprueba que la plantilla se lee sin errores ni avisos: si se cambian columnas, cambiar a la vez `src/core/show.js`.

En este Windows, Node y Git se instalaron con winget; si una terminal antigua no los encuentra, refrescar `PATH`.
Ojo con PowerShell 5.1: `Get-Content`/`Set-Content` sin `-Encoding` rompen los acentos (leen ANSI, escriben BOM). Editar con las herramientas de archivo.
`npm run dev:http` (puerto 5174, sin certificado) sirve para probar en el navegador del portátil.

## Decisiones

- **Vite + Vitest**, sin frameworks. JS plano con módulos ES. Dependencias con versión exacta (`.npmrc` → `save-exact`), lockfile versionado, `npm ci` en CI.
- `base: './'` → funciona bajo cualquier nombre de repositorio en Pages.
- Páginas: `index.html` = jugador (URL corta para teclear), `host.html` = tele (autoridad), `control.html` = mando del presentador.
- Idioma: identificadores en inglés; comentarios, documentación e interfaz en español.
- Código de sala: 4 caracteres del alfabeto `ACDEFGHJKMNPRTUVWXY23479` (de cada pareja confusa queda como mucho uno: sin O/0/Q, I/1/L, S/5, B/8, 6, Z).
- ID PeerJS del presentador: `concurso-del-ano-v1-<CÓDIGO>` (prefijo porque el servidor público es compartido). Los jugadores usan IDs aleatorios.
- Jugadores: mínimo 2 para jugar, máximo 20. Identidad = `playerId` (UUID en localStorage del móvil), no el nombre.
  - Nombre repetido → el presentador lo renombra a "Ana (2)".
  - Sin equipos, cada jugador elige **color + icono** y la **pareja** es única en la sala. Con equipos, el color es el del
    equipo y el icono es único dentro del equipo. Si choca, el presentador asigna otro libre y avisa.
  - Iconos: solo animales (emoji), en `src/shared/appearance.js`; para añadir, al final (los ids se guardan).
- Puntos: los de cada sección (columna Puntos de la hoja) y "Puntos por fallo" de Ajustes; además +/− manual por jugador
  y por equipo. Comodines (Test = millonario): 1 de cada (50:50, Público, Llamada) por equipo, o por jugador si no hay equipos.
- Pulsar antes de abrir el turno bloquea al jugador durante esa pregunta (opción activada por defecto).
- Todos los jugadores estarán en la misma wifi (no se optimiza para datos móviles / TURN).
- Sin vibración en iPhone (Safari no la soporta): aceptado.

## Forma de trabajar (léelo primero; viene de muchas sesiones)

- **Quién:** Rodri es el presentador y prueba con su gente en una fiesta real; habla en español y pide cambios en listas.
  Cuando pide «plan primero», se le da el plan y las preguntas y se espera; si no, se hace todo y se prueba.
- **Commit solo cuando lo pide.** El `git push` desde la terminal de Claude falló en el primer ordenador (403: el
  Administrador de credenciales tenía otra cuenta, GammaSim2020); él sube con **GitHub Desktop** («Push origin»). En otro
  ordenador, probar `git push` una vez y, si da 403, pedirle que use GitHub Desktop (no tocar credenciales).
- **La carpeta del concurso no viaja con git:** `Concurso del año - archivos/` (dentro del repo, en .gitignore) tiene la
  hoja de trabajo, la música, canciones, caras, vídeos, `Copias/` y su `LÉEME.txt`. Hay que copiarla a mano al otro
  ordenador. La tele usa la **.xlsx más reciente de la raíz** (la buena: `plantilla-concurso Prueba 1.xlsx`; la plantilla
  de `public/` es otra cosa). Lo leído se guarda en el IndexedDB de cada navegador: en un ordenador nuevo hay que elegir
  la carpeta otra vez en la preparación de la tele.
- **Tocar su Excel:** nunca regenerarlo ni sobrescribirlo. Copia antes en `Copias/` (fuera de la raíz, para que la tele no
  la coja), edición puntual con ExcelJS buscando filas por su valor (no por número), añadir los valores nuevos a las
  listas desplegables, y comprobar con `node scripts/check-sheet.mjs "<hoja>"` (0 errores, 0 avisos). Si se cambian
  columnas o tipos, regenerar la plantilla (`npm run plantilla`) y aplicar lo mismo a su hoja.
- **Comprobar la carpeta:** `node scripts/check-folder.mjs "Concurso del año - archivos"` enseña qué hoja, música (por
  momento y por sección), Squid, vídeos y caras reconoce la tele y qué queda sin usar. Si crea carpetas, nada de `?` ni
  `:` en los nombres (Windows): `folderKey` ignora signos, así que «Qué canción es» vale por «¿Qué canción es?».
- **Probar en el navegador** (servidor `dev-http`, puerto 5174): `host.html?demo=squid&bots=N`; `window.__room.run(orden,
  args)` (p. ej. `gotoSection {index}`; `view().sections` no lleva `type`, buscar por nombre); `localStorage
  concurso.silencio = 1`; ventana 1280×720 para hacer de tele. El servidor sirve la carpeta del concurso:
  `fetch(encodeURI('/Concurso del año - archivos/…'))` sirve para cargar su Excel en la tele (DataTransfer en
  `input[type=file][accept=".xlsx"]`) o un vídeo (`trackStore.tracks.set('video:<clave>', …)`). Cada cambio recarga la
  página (HMR) y la demo empieza de cero; la consola conserva errores de antes de recargar (mirar la hora del módulo).
- **Errores ya cometidos (no repetir):**
  - Temporizadores con `requestAnimationFrame`: se paran con la ventana oculta → `setTimeout`.
  - Todo lo que cambia con el reloj (lo que falta, lo que lleva, `now`) fuera de las firmas de repintado; lo que se está
    eligiendo (casillas, borradores) fuera del pintado. Si no, se repiten animaciones y sonidos y se pierden toques.
  - `confirm()` / `prompt()` congelan la página y la conexión: dos toques en la propia página.
  - `mix-blend-mode` en un elemento dentro de una capa `position:fixed` con `z-index` solo se mezcla dentro de esa capa.
  - Un `::before` con `z-index:-1` queda detrás del fondo WebGL. En `conic-gradient`, los ángulos con unidad (`0deg`).
  - Las horas `performance.now()` guardadas no valen tras recargar la tele (su reloj empieza de 0): rebasarlas.
  - Lo jugado se guarda por `playKey` (número de sección): reordenar secciones con algo jugado lo mezclaría.
  - El nombre del archivo de una canción tiene que coincidir con la columna «Canción» (`songKey`: sin tildes ni signos).
  - En Bash, guiones con comillas invertidas → escribir el script en un archivo y ejecutarlo con node.
- **Sin probar aún en móviles reales** (avisar si se toca): la galleta con `MAX_SPEED` 0,4, la dureza de la luz roja,
  comodines con dos toques, «✓ Apuesta guardada», las marcas de Palabras, los botones nuevos del mando.

## Arquitectura

- `src/core/` — lógica pura, sin DOM ni red, con tests: roster (jugadores y equipos), concurso y lectura de la hoja
  (`show.js`), recorrido de pantallas (`runner.js`), motor del pulsador (`game.js`), ranking, sincronización y plausibilidad.
- `src/shared/` — protocolo, código de sala, configuración PeerJS, apariencias, almacenamiento seguro, formato de tiempos,
  entornos de Halloween (`environments.js`), pantalla encendida (`wakeLock.js`) y el estilo común de los móviles (`phone.css`).
- `src/host/` — tele: `room.js` (controlador: une todo, órdenes en `run(action, args)`), `screens.js` + `stage.js`
  (pantallas), `main.js` (pintado, teclado, importar), persistencia (`concurso.host.v2`). Las conexiones entran por
  `sources/peerSource.js` (jugadores y mandos); fase futura: mandos físicos (Gamepad API) con offset 0.
  `show.css` = capa visual del espectáculo sobre `host.css`. `fx/` = espectáculo (ver «Espectáculo (fase 9)»).
- `src/player/` — móvil del jugador: reconexión, sincronización, botón, elegir equipo; `gamesPad.js` = juegos de la fase 10.
- `src/host/games/` — controladores de los juegos de la fase 10 (ver «Juegos de fiesta»).
- **Concursantes de prueba** («🤖 Pruebas» en la barra de la tele, `host/botsDialog.js`; órdenes botsAdd {count},
  botsRemove, botsAuto {on}, botsAct): `host/bots.js` `BotPlayers` entra por los mismos manejadores que la red
  (`room` los guarda en `handlers` y se los pasa a PeerSource y a los bots), sin red: hello en los huecos libres (equipo
  con menos gente, icono y color al azar, nombre «🤖 Lola»; ids `bot-…`), y cada 250 ms deciden al azar
  (`core/bots.js`, puro con tests): pulsan (60 %, 0,25–1,8 s), responden (opciones con 60 % de acierto, votos, números
  entre la mitad y el doble), pulsan cerca del objetivo del Contador o tras la señal en Reflejos (8 % antes de tiempo),
  eligen en el millonario y votan en el Público, ordenan su equipo si son portavoces y cuentan en Libre. «Responden
  solos» (por defecto) o solo con «¡Responded ya!». Siguen en la sala al recargar la tele (`start()` los vuelve a
  conectar). Lo que la tele les manda (`sendTo`) se pierde sin más: miran el estado de la sala directamente.
- `src/control/` — mando del presentador: pestañas Juego / Jugadores / Secciones / 🎮 Jugar; manda órdenes `cmd` y pinta
  `controlState`. «Jugar» = la página de jugador en un iframe (`./?sala=X&mando=1`) que se crea una vez y no se quita:
  con dos pestañas del navegador en el mismo móvil, la que no se ve se congela y se desconecta (y salta el antitrampas);
  dentro de una sola página las dos conexiones siguen vivas. Usa la identidad de jugador del móvil (sin `perfil`).

### Protocolo (objetos por DataConnection fiable, campo `t` = tipo; `PROTOCOL_VERSION` = 2)

Serialización `binary` (peerConfig.js), que trocea: con `json`, PeerJS da error con mensajes de más de 16 300 bytes
(una sola foto de cara ya lo supera) y la conexión se cortaba. Un error al enviar no corta la conexión si sigue abierta.

Jugador → tele: `hello {v, role:'player', playerId, name, color, icon, teamId}`, `profile {name, color, icon, teamId}`,
`hbAck {h0}`, `buzz {seq, epoch, tLocal?, offset?, err?}` (sin offset → cuenta la llegada),
`answer {seq, roundId, value, tLocal?, offset?, err?}` (value = índice de opción, playerId votado o número),
`joker {seq, roundId, kind, target?}` (millonario; target = a quién se llama), `freeCount {seq, roundId, delta}` (Libre con contador: +1/−1 desde el móvil elegido; responde
`answerAck`), `turnOrder {order}` (portavoz: orden de su equipo en una sección por turnos), `away {state: out|back, ms?}`
(antitrampas: salió de la app / volvió y cuánto estuvo fuera), `play {seq, game, roundId, action, value}` (juegos de la
fase 10 y Squid Games: game = palabras | agitar | apuesta | castigo | squid; responde `answerAck`), `sync {id, t0}`, `syncReport {offset, err, rtt, samples}`.

Tele → jugador: `welcome {you, adjusted}`, `state {room, title, playerCount, minPlayers, taken, teams, teamsLocked, you,
screen, section, game, winner, answer, free, standings}` (`section` = nombre, tipo, descripción, puntos, nº de sección y de
pregunta, para la barra de sección del móvil; `standings` = equipos y jugadores con puntos, para el marcador que se abre
sin salir del juego) (foto completa y personalizada; `game` = `playerView()` solo en una pregunta de
pulsador; `answer` solo en una pregunta de respuestas), `hb {h0}` cada 2 s, `buzzAck {seq, result}`,
`answerAck {seq, result, message?}` (respuestas y comodines), `syncReply {id, t0, t1, t2}`,
`faces {images: {faceId: dataURL}}` (fotos de los jugadores reconocidos, también al mando; los jugadores llevan `face`),
`error {code, message}` (`room-full`, `version`, `removed`, `replaced`, `control-denied`, `adopt`: vuelve alguien que ya jugaba).

Mando ↔ tele: `hello {v, role:'control', controlId, token, deviceName}` → `controlStatus {status: pending|approved}`;
luego `controlState {view}` (vista completa con respuestas, agrupada cada 150 ms) y `cmd {id, action, args}` →
`cmdResult {id, ok, error}`. Las órdenes son las de `HostRoom.run()`: next, prev, nextItem, gotoSection, endSection,
scoreboard, toSetup, showQuestion, showAnswer, open, correct, wrong, restart, unlock, forgive, openAnswers, closeAnswers, reveal, setDuel,
setSpokesperson, setTurnOrder, mShow, mSeat, mMark, mUnmark, mReveal, mCallStart, mCallEnd, mAudienceCancel, mAudienceEnd,
freeParticipants, freeCounter, freeStart, freeOut, freeRevive, freeCount, freeStop, freeScore, freeAward,
wordsStart, wordsOk, wordsPass, wordsFoul, wordsUndo, wordsStop, shakeStart, shakeStop, betClose, betReveal, betSet, betAnswer,
punishClose, punishReopen, punishSpin, toggleSection, pause, resume,
squidStart, squidStop, squidRevive, squidEliminate, squidChoose,
hankyDraw, hankyChoose, hankyGo, hankyFalse, hankyCancel, hankyWin, hankyUndo, penalty, setPlaying, moveSection,
lockTeams, moveTeam, adjustScore, adjustTeamBonus, resetScores, removePlayer, approveControl, denyControl, updateSettings.

- Emparejar mando: la tele (preparación) enseña un QR a `control.html?sala=CÓDIGO#k=CLAVE` (la clave tras `#` no sale del
  navegador); con la clave correcta, el portátil pide confirmación (Enter / Esc). Los mandos aprobados se recuerdan.
  Sala nueva = clave nueva.

- Mismo `playerId` desde otra conexión (otra pestaña): la vieja recibe `replaced` y deja de reconectar; si no, se echarían mutuamente.
- `?perfil=X` en la página del jugador usa otra identidad (clave de localStorage distinta): para probar varios jugadores en un navegador.

### Motor de preguntas (`src/core/game.js`)

Fases `idle` ("Pregunta en el aire") → `open` (apertura programada en `tOpen`) → `result` (ganador; `judged` = correct) o,
tras "Fallo" sin nadie más, `closed`. "Fallo" bloquea al ganador y abre una ronda nueva para el resto (todos vuelven a pulsar).
`epoch` crece con cada apertura, reinicio (R) y pregunta nueva; el móvil manda la época que veía al pulsar. Una pulsación
de época vieja se descarta (`stale`, sin bloquear) salvo que caiga dentro del turno abierto ahora (`tPress ≥ tOpen`).
El móvil envía también en "Espera": decide el presentador (antes de tiempo → bloqueo si la opción está activa).
`tPress` lo calcula `peerSource.js` con `resolvePressTime()` (marca sincronizada, o llegada si el móvil aún no está sincronizado).
### Secciones de respuestas (`src/core/answers.js`)

Verdad o mentira, Dos verdades y una mentira, Votación y Estimación comparten `AnswerRound` (el Test va aparte: millonario):
`ready` → `open` (apertura programada; plazo = `tOpen + segundos`) → `closed` (al acabar el tiempo + 500 ms de gracia, o
en cuanto responden todos los conectados) → `revealed` (`scoreRound()` y se suman los puntos). Primera respuesta definitiva;
vale si `tPress` (sincronizado, `resolvePressTime`) ≤ plazo. Cada pregunta tiene `roundId` (`playKey#n`): respuestas de otra
ronda → `closed`. Puntos: acierto = `points[0]`; Votación: quien vota a un más votado (empates incluidos;
nadie se vota a sí mismo); Estimación: por cercanía, puestos densos con `points[puesto-1]`, "sin pasarse" excluye a quien
se pasa; Dos verdades: el protagonista (jugador cuyo nombre coincide con "Sobre quién") no vota y suma 1 por engañado.
En el móvil, opciones y votos se eligen con un toque y se confirman tocando otra vez la misma.

**Secciones de tiempo** (mismo `AnswerRound`; la "respuesta" es el instante del toque, `pointerdown` + `event.timeStamp`):
- **Contador**: `tOpen = ahora + 3 s` (cuenta atrás 3-2-1); valor = segundos desde `tOpen`; pulsar en la cuenta atrás → `early`
  sin registrar (se puede volver a pulsar); plazo = objetivo + max(5 s, objetivo); puntúa por cercanía al objetivo (como
  Estimación). Modos: visible, a ciegas, desaparece a los N s (tele y móvil); tras pulsar no se enseña el tiempo hasta revelar.
- **Reflejos**: cada fila de la hoja (N rondas) se convierte en N preguntas. Rojo en `tOpen`, señal buena en `tGreen` =
  `tOpen` + 2–6 s al azar (4–8 s con despistes; lo elige el portátil); el móvil cambia con su reloj sincronizado. Pulsar
  antes de la señal → eliminado de la ronda (cuenta como respondido). Valor = ms de reacción; plazo = señal + 3 s; puntos
  por puestos. Duelo: el presentador fija a los dos con `setDuel` (se mantiene entre rondas).
  **Despistes** (`reflexVariant`, `reflexPlan` en core/answers.js): ronda 1 clásica (verde); las pares, «pulsa solo con
  el AZUL/MORADO» con colores trampa antes (casi siempre el verde); las impares, una araña que se asoma y vuelve, y al irse
  se pulsa. El plan (`answerRound.reflex = {variant, cues: [{t, show}], target, rule}`) va a tele y móviles; la lógica
  no cambia (todo lo anterior a `tGreen` es pulsar antes). Sin sonido en la señal buena de las rondas con despistes.
  La tele cambia la luz con un `setTimeout` por cambio (no rAF: el navegador lo frena si no se ve la ventana).

**Sección Libre** (`src/core/free.js`, `FreeRound`): `setup` (el presentador marca participantes: jugadores o equipos
según la columna Participan) → `running` (cronómetro: "eliminado" guarda el tiempo y al caer el último se para solo;
contador: ±1 por participante) → `stopped` → `awarded` (el mando propone ganador según la herramienta; se puede cambiar
y marcar varios; cada ganador recibe los puntos de la fila; con equipos van al bonus del equipo). Sin herramienta se elige
ganador directamente. Las pruebas puntuadas se guardan en `itemResults` (`{free, byTeams}`) y R las reinicia quitando
los puntos. El móvil del jugador informa ("¡Te toca!", "¡Eliminado!", "¡Has ganado!"); el contador lo llevan solo los
presentadores desde el mando (fase 14: `countFrom()` responde `not-counter` a todos los móviles).

**Antitrampas** (para quien sale de la app a buscar la respuesta en Google): el móvil manda `away out` al ocultarse la
página (`visibilitychange`) y `away back {ms}` al volver (si no hay conexión, en cuanto reconecta). La tele marca la
tarjeta «👀 Fuera de la app» mientras tanto. Al volver, `AnswerRound.awayWhileOpen()` mide cuánto estuvo fuera con la
pregunta abierta (desde `openedAt`, antes de la cuenta atrás) y sin responder; en el pulsador, desde que se abrió el
turno. Con `AWAY_MIN_MS` (1,5 s) o más, según el ajuste `antiCheat`: 'void' (por defecto) anula su respuesta en esa
pregunta (`disqualify`: no cuenta y no puede responder; en el pulsador, `LOCK.CHEAT`), 'warn' solo avisa, 'off' nada.
Aviso grande en la tele (`cheatAlerts`) y en el mando, con «Perdonar» (`forgive`). Avisado en las reglas de la portada.
Además, **cada** salida (en cualquier momento) queda en `sala.awayLog` (`core/awayLog.js` `AwayLog`, persistido):
`out` al salir (dónde iba el concurso, `#whereNow`; ¿con pregunta en juego?, `#inQuestion`) y `back` al volver (tiempo
fuera, ¿anulada?). No cuentan el presentador que juega desde el mando ni la llamada del millonario. El mando recibe
`awayFeed` (últimos 10) y `awaySummary` en `controlState`: avisa arriba con vibración de cada aviso nuevo (rojo si
tenía pregunta; al conectar no repite los viejos), enseña «👀 Fuera de la app ahora» en Juego y el recuento por
concursante en Jugadores (veces, con pregunta, tiempo fuera; «Borrar recuento» = orden `awayReset`).

**Por turnos** (columna «Por turnos» de la pestaña Concurso → `section.turns`; solo Test, Verdad o mentira, Estimación
y Contador, y con equipos; `core/turns.js`): cada pregunta la responde uno de cada equipo. Cada equipo tiene un
**portavoz** (`spokespeople`, lo elige el presentador con 📣 en la preparación o en el mando; si no, el primero que
entró). En la presentación de la sección, el portavoz ordena a su equipo en su móvil (de la pregunta más fácil a la más
difícil) → `turnOrder` → `turnOrders[sectionId][teamId]` (persistido; `normalizeOrder` añade a los que falten). La
pregunta k le toca al k-ésimo (`answererFor`: vuelve a empezar y salta a los desconectados) y `openAnswers` solo deja
responder a esos. Tele: estado de cada portavoz en la intro y «Responden: …» en la pregunta; móviles: «¡Te toca a ti!» /
«Le toca a Ana: ¡sin soplar!».

**Puntos tras el suspense:** al revelar, los puntos no se suman enseguida: `#holdPoints` los aplica cuando la tele ya
enseña a los ganadores (`revealHoldMs(kind, filas)`, mismos tiempos que la animación: `DRUMROLL_MS`, `REVEAL_AT`,
`listGap`, `WINNER_PAUSE_MS`). Mientras, el móvil dice «👀 Mira la tele» (sin `result`). Cualquier orden (`run`) los
aplica antes; lo guardado ya los incluye por si la tele se recarga.

Preguntas reveladas se guardan en `itemResults` (persistido): al volver a ellas se ven reveladas; R las reinicia
quitando sus puntos.

**Millonario** (secciones de Test, `core/millionaire.js` `MillionaireRound`; tele `millionaireStage.js`, móvil
`player/millionairePad.js`, mando `millionairePanel`): una persona cada vez (el asiento), `seatFor()` alterna equipos
(pregunta 1 → equipo 1, pregunta 2 → equipo 2…) y dentro de cada equipo sigue el orden de su portavoz (el Test siempre
va por turnos si hay equipos; sin equipos, por orden de llegada; el mando puede cambiar el asiento con `mSeat`). Sin
reloj, lo lleva el presentador: `ready` (pregunta, respuestas ocultas) → `mShow` (una a una o todas: `playing`; el
concursante elige en su móvil con dos toques y puede cambiar) → `mMark` (la elegida u otra: amarilla, letras negras;
`marked`) → `mReveal` (la buena en verde; la marcada sigue amarilla si no lo era; puntos tras 2,2 s). Comodines
(`JOKERS`: fifty, audience, call; `JokerBank` por equipo, o por jugador sin equipos; solo con todas las respuestas a la
vista): 50:50 quita dos incorrectas (también en la tele); Público: votan 15 s solo sus compañeros (sin equipos, todos los
demás), el presentador puede anularlo si hablan (no se devuelve), al acabar se ven los porcentajes; Llamada: el
concursante elige a un compañero, que sale de la sala y le llama; el presentador dice «ya» (`mCallStart`) y corren 30 s
(reloj redondo en la tele). Durante la llamada el antitrampas no cuenta para ellos dos (`onCall`); el concursante que
sale de la app fuera de eso queda `cheated` (no puntúa aunque acierte; el mando puede perdonar). Iconos de los
comodines en `shared/jokerIcons.js` (dibujados, no las imágenes del programa). Espacio en la tele: enseñar → marcar →
revelar → siguiente.

Teclas de la tele: Espacio (contextual: abrir turno / siguiente pregunta / avanzar; en respuestas: abrir → cerrar →
revelar → siguiente), ← →, P (mostrar pregunta),
V (mostrar respuesta), A (acierto), F (fallo), R (reiniciar pregunta), M (marcador), D (depuración).
Las pulsaciones solo cuentan en una pregunta de pulsador (`HostRoom.inBuzzerPlay`); fuera, `buzzAck closed` sin bloquear.
Cada pregunta del runner (`runner.playKey`) reinicia el motor (`game.next()`).
La tele repinta la pantalla solo si cambia algo visible (firma JSON sin latencias): así las animaciones no se repiten.
Antes de cada repintado se llama a `stop()` de las pantallas de juego (`stage`, `answerStage`, `freeStage`, `millionaireStage`): quita
el ganador a pantalla completa, relojes y la luz de Reflejos de la pantalla anterior (si no, quedaban encima al saltar de sección).
Los `<dialog>` se gestionan con el evento `submit` del formulario, no con `close`: Chrome no dispara `close`
mientras la página no se pinta (ventana oculta o minimizada).

- Latido: el presentador manda `hb` cada 2 s; RTT = mediana de los últimos 5. Sin respuesta en 6 s → desconectado.
  El jugador, si no recibe `hb` en 6 s, cierra y reconecta.
- Reconexión del jugador (y del mando, misma `PlayerConnection`): espera creciente 0,5 s → 5 s, inmediata al volver a
  primer plano o recuperar red. Si nunca llegó a entrar y la sala no existe (`peer-unavailable`), avisa tras unos
  intentos (el mando sigue probando cada 4 s); si ya había entrado, reintenta siempre. Tras más de 4 s en segundo plano
  se rehace todo con un Peer nuevo (el navegador puede haber matado el enlace con el servidor sin avisar), y si parece
  conectado, se comprueba que llegue el latido en 3,5 s. Dos fallos seguidos (plazo de 8 s o ICE `failed`) → Peer
  nuevo. `onStatus` lleva `detail {attempts, reason}` y `connectionHelp()` lo explica en el móvil y en el mando.
- ICE (`peerConfig.js`): STUN de Google y Cloudflare. Los TURN gratuitos de PeerJS y de Metered ya no existen (2026: sin
  DNS): si la wifi no deja la conexión directa, hace falta un TURN propio en `TURN_SERVERS`. La tele avisa
  (`connectFailures`, banda «📶 Un móvil intenta entrar…») cuando una llamada llega pero no se abre en 15 s o su ICE falla.
  La tele, al volver a primer plano o recuperar la red, reconecta con el servidor de enlace sin esperar.
- **Pausa para seguir otro día** (órdenes `pause` / `resume`; `sala.paused = {at}`, persistido): la tele enseña
  `pausedScreen` encima de todo (screenKey 'pausa', música lobby, sin canciones de prueba), los móviles «Concurso en
  pausa» (`state.paused`) y el mando `pausedPanel`. En pausa lo guardado no caduca (un año; si no, 12 h). Al abrir la
  tele, `showRecover` dice por dónde iba y el marcador. Copia en archivo: `roomToFile` / `roomFromFile` (persistence.js,
  JSON `{kind: 'concurso-del-ano/partida', room}`) → `adoptSavedRoom` + `startRoom`.
- **Vuelve con otro móvil:** ya empezado, un `hello` con un `playerId` desconocido y el nombre de un jugador
  desconectado (`Roster.returningByName`: exacto, o sin el «(2)»; solo si no hay duda) → error `adopt {playerId, name,
  color, icon, teamId}`: el móvil se queda esa identidad y vuelve a entrar (sigue con sus puntos y su equipo).
- Recarga del presentador: estado en localStorage (`concurso.host.v1`, caduca a las 12 h) → "Recuperar sala". Se vuelve
  a registrar el mismo ID; si PeerJS lo tiene ocupado (`unavailable-id`) se reintenta cada 2 s.
- Una vez establecidas, las conexiones son P2P: si cae el servidor PeerJS solo fallan las conexiones nuevas.

### Juegos de fiesta (fase 10)

Lógica pura con tests en `core/words.js`, `core/shake.js`, `core/bet.js` y `core/punishments.js`. En la tele, un
controlador por juego en `host/games/` (`WordsGame`, `ShakeGame`, `BetGame`) con la misma forma: `type`, `inPlay`,
`sync()` (crea la ronda de la pregunta actual o recupera la jugada de `itemResults`), `stop()`, `actions()` (órdenes que
`room` añade a las suyas), `onMessage(playerId, msg, ack)` (mensajes `play`), `restart()` (R: quita sus puntos),
`view({forControl})` (tele / mando), `viewFor(player)` (móvil) y `toJSON()`. Reciben `ctx = {room, changed, turnOrder,
roundId, now, pub}`. `room` los guarda en `this.games`, mete `words` / `shake` / `bet` en la vista y en el estado del
jugador (null si está en el banquillo) y les pasa los `play` (`#onPlay`; `castigo` va a la votación). Tele:
`wordsStage.js` (y su `runRing`, reloj redondo), `shakeStage.js`, `betStage.js`; móvil: `player/gamesPad.js`; mando:
`wordsPanel`, `shakePanel`, `betPanel`, `punishVotePanel`, `roulettePanel`.

- **Palabras secretas** (pestaña Palabras: Palabra, Prohibidas, Modo): las filas son tarjetas (`section.cards`) y los
  ítems del recorrido son **turnos** (`{turn, teamIndex, seconds}`: «Turnos por equipo» × equipos, alternando; sin
  equipos, 6 que rotan entre la gente). Hace adivinar el k-ésimo del orden de su portavoz (`answererFor`). `WordDeck`
  por sección (guardado en `games.palabras.decks`): no repite hasta acabar el mazo. `WordsRound`: ready → running
  (reloj de «Segundos por turno») → done; marcas ok / pass / foul y deshacer. El que la hace y el **equipo rival** ven la
  tarjeta en el móvil (el rival pita «¡Tabú!» = foul); su equipo y la tele, solo el modo. Puntos = acertadas ×
  `points[0]` al bonus del equipo (sin equipos, a quien la hace). Modos en `WORD_MODES` (show.js).
- **Agita el móvil** (pestaña Agitar: Segundos, una fila por carrera): `ShakeRound` con cuenta atrás de 3 s; el móvil
  cuenta sacudidas con `devicemotion` (en iOS, botón «Activar el sensor»; sin sensor, cada toque vale 3) y manda su
  total cada 250 ms (monótono, hasta 600 ms tras el final). Puntos por puestos. La tele se repinta como mucho cada 300 ms.
- **La gran apuesta** (pestaña Apuesta, como el Test sin dificultad): `BetRound` betting → question → revealed. Apuesta
  el portavoz de cada equipo (o cada jugador), de 0 a `maxBet(puntos) = max(5, puntos)`; sin apuesta = 0. Acierto
  +apuesta, fallo −apuesta (al bonus del equipo o a los puntos del jugador). Tele y móviles no ven apuestas ni
  respuestas ajenas hasta revelar; el mando sí, y puede apostar o responder por un equipo (`betSet`, `betAnswer`).
- **Castigos** (pestaña Castigos → `show.punishments`; con 2 o más hay castigo): `PunishmentVote` (persistido en
  `punish`). Tras la presentación de equipos, `punishStep = 'vote'`: cada uno marca 3 en el móvil; `next` cierra
  (`close`: los 3 más votados, empates al azar → `finalists`) y el siguiente va a la portada. En el final, `next` →
  `'roulette'` y `punishSpin` (o Espacio) elige al azar entre los finalistas para `loser` (último equipo, o último
  jugador). La ruleta gira 6 s con CSS; un `spin` guardado se da por girado hace mucho al recargar (no vuelve a girar).
- **Pestañas sin sección:** las filas de un tipo sin ninguna sección en Concurso se ignoran (preguntas de reserva).
- **Qué se juega:** `runner.skipped` (persistido) + orden `toggleSection {id, on}` (solo en la preparación; al menos
  una). La columna «Se juega» de Concurso (`section.play`) da las quitadas al cargar la hoja (si fueran todas, ninguna).
  **Orden:** ↑ ↓ en la preparación (tele y mando) → orden `moveSection {id, delta}` → `runner.moveSection` (cambia
  `show.sections`, que se guarda; salta por encima de las quitadas). Solo antes de jugar nada: lo jugado se guarda por
  número de sección (`itemResults` con `playKey`, Squid), así que con algo jugado responde que se haga tras «Partida nueva».
  El enlace «Descargar plantilla» lleva `?v=` para que el navegador no dé una vieja de su caché. `next` / `prev` / fin de sección saltan las quitadas; nº de sección y total cuentan solo las que se juegan.
- Los concursantes de prueba también juegan: hacen la tarjeta si les toca (65 % aciertan), pitan a veces, agitan a su
  ritmo, apuestan y responden si son portavoces y votan 3 castigos.

### Squid Games (fase 12)

Lógica pura con tests en `core/squid.js` (y `core/dalgona.js`, las formas del panal y el repaso). `SquidState`: números
(1–456, alguien el 456), vivos, caídos `{id, game, pot}` y hucha. Una ronda por juego (`RedLightRound`, `DalgonaRound`,
`GlassBridgeRound`, `TugRound`, `MarblesRound`; `createSquidRound`): ready → running (3-2-1, `COUNTDOWN_MS`) → done
(`out`). `spareBest`: si fueran a caer todos, se salvan los de mejor marca. Pestaña «Squid» (Juego, Segundos, Tramos) →
`section.items` = juegos + `{game: 'hucha'}` al final (sin filas, `SQUID_ORDER` = Luz roja, Panal, Cuerda y el puente
como final; las canicas solo con su fila).
- Tele: `host/games/squid.js` (`SquidGame`, como los de la fase 10 + `reset()`): al entrar en el primer juego juegan los
  conectados que no presentan; persiste por sección `{state, before[playKey] (para R), results[playKey] (vista final),
  awards}` en `games.squid`. Elimina al acabar cada juego (`perHead` = puntos de la sección por cabeza a la hucha);
  en la hucha reparte `share` a los vivos (`adjustScore`). Órdenes squidStart, squidStop, squidRevive, squidEliminate
  {id} (no en marcha), squidChoose {side} (puente: por quien está delante). Fin antes de tiempo (`#earlyEnd`).
  Pantalla `squidStage.js` (escena montada por clave; lo continuo se actualiza en su sitio; luces por temporizador,
  sonidos programados en el reloj de audio). Mando `squidPanel` (con lo secreto). Bots en `#squid` (en el puente
  esperan a que acabe el salto que se está viendo).
- Móvil `player/squidPad.js` (+ `squidPad.css`; `state.squid`, también para quien mira o cayó): `play {game: 'squid',
  action}`: luzroja p (avance), fault (hora de la tele o −1: pulsar o sensor en rojo pasados 450 ms); panal pick,
  trace [%, grietas, 0|1|2]; puente choose 0/1 (dos toques: elegir y saltar), bet 0/1 (los que esperan); cuerda taps; canicas hide n, guess
  [0 pares | 1 nones, apuesta]. `value` admite hasta 4 números (protocol.js). Horas de la tele → locales con
  `sync.toLocal` (sin sincronizar, desde `view.now`). Lo continuo (la cuerda) se pinta con `live` sin remontar.
- **Estética propia** (no la de Halloween): entorno `squid` (`SQUID_ENV`, `still`: el WebGL deja de redibujar si no
  cambia), `host/squid.css` (la escena ocupa toda la tele: `body.squid-on` oculta tarjetas y cabecera, también en la
  presentación de la sección, `squidWelcome` en screens.js), dibujos SVG en `shared/squidArt.js` (logo ○△□, muñeca de
  frente/espaldas, árbol, guardias, cerdito, galletas). Fichas = parche verde del chándal con el número; eliminado =
  aspa roja sobre la cara. Cuenta atrás 3 □ · 2 △ · 1 ○. Megafonía (campana + `sound.say`) al presentar cada juego,
  al acabar y por cada eliminado («Jugador 47, eliminado», agrupados; `announceSpared`: «… se salva por los pelos»).
  Las pantallas fijas no se remontan (`update`).
- **Luz roja:** la muñeca canta en cada verde (`CHANT`, «Mu-gung-hwa…»; `chantTimes(len, rush)` = hora de cada
  sílaba) y la luz se pone roja al acabar la frase: los verdes van de 5,8 s a 2,4 s (`cues` verdes llevan `len` y
  `rush`, a veces una muy rápida). Tele: patio con mural, muñeca que gira y ojos rojos, haz que barre el campo, letra
  sílaba a sílaba; móvil: «¡Avanza!» / «¡Quieto!» con la misma letra.
- **Puente por relevos y con suspense** (`GlassBridgeRound({jumpMs})`): cada uno salta un tramo y pasa el turno al
  siguiente que no ha caído (`#nextTurn`, en círculo); hay un tramo más que gente (hasta 21), así todos saltan. Cada
  salto guarda `at`, `reveal` (3,5–5,7 s al azar, media `BRIDGE_REVEAL_MS`) y `ends` (+1,9 s si aguanta, +3,3 s si
  cae); mientras se ve (`jumping`) nadie elige, el siguiente turno cuenta desde `ends` y el juego acaba en `closesAt`
  (tras el último). Caída la mitad (`cap`), el cristal malo cruje pero aguanta (`held`: «¡Cruje… pero aguanta!», se
  salva por los pelos). Los que esperan apuestan qué cristal aguanta (`bet`, `tally`; quien salta ve el recuento en su
  móvil, la tele «El público dice / decía»; `hits` = aciertos). `revealed(move, now)`
  / `fellBy(now)`: los móviles no saben el resultado hasta su `reveal` (la sala los avisa con temporizadores en
  `#arm`). Tele en primera persona (CSS 3D: `sq-world`, cámara por
  rAF): respirar mientras decide, agacharse, saltar, caer, latidos que aceleran con grietas bajo los pies y aguanta
  (exhala) o se rompe (esquirlas, caída mirando arriba, negro con el número). El móvil del que salta lo vive también.
- **Sonidos** (`fx/squidSound.js`, `sound.sq(nombre, {at})` con `at` = performance.now() exacto): con archivo de la
  carpeta si lo hay (`Squid/` o suelto en `Música/`, reconocido por el nombre: `SQUID_SOUNDS`, `squidSoundFor` en
  core/folder.js → huecos `sq:<tipo>`; `sound.sample()` los iguala de volumen y toca trozos medidos en `CUTS`), si no
  generados (el canto con formantes). La muñeca: si el nombre dice que canta («singing», «canta»), es la canción
  aunque traiga detrás el giro; `core/voicing.js` `splitSong()` (con tests) busca dónde hay voz (tono de 150–700 Hz)
  y separa la canción del ruido de detrás: la canción suena en verde (estirada o encogida para acabar justo en rojo; si
  no cabe ni a 2,5×, solo su final) y el resto (el giro) en rojo; después del giro, los pitidos del escaneo si queda rojo.
  Nunca suenan a la vez la voz del archivo y la generada. Música propia del entorno (`MOODS.squid.styles`: sqTheme flauta original,
  sqTension, sqWaltz = el Danubio azul; `hush` en Luz roja y el puente); con archivo tema/tensión/vals, suena él.
  Hucha con confeti de dinero (`celebrate(ms, {theme: 'money'})`).
- **Que llegue gente al puente, sin contradecir a la megafonía:** cada juego tiene un tope de eliminados
  (`squidCap(game, {alive, started, gamesLeft})`, lo calcula `SquidGame.#newRound`): lo que sobra hasta el suelo
  `squidFloor(empezaron)` (¼, al menos 2) repartido entre los juegos que quedan antes del puente, así todos eliminan a
  alguien; Luz roja, como mucho el 35 %; el puente, la mitad. Pasado el tope, quien caería **se salva en el momento**
  (nunca se anuncia «eliminado» de alguien que luego se salva): Luz roja `saved` (le pilla la muñeca: deja de jugar),
  panal estado `spared` (la galleta rota), cuerda (del bando que pierde caen los que menos tiraron), canicas
  `d.spared` (sello «¡Se salva!») y puente `held`. Cada ronda tiene `spared`; `g.spared` en la vista; tele, voz y
  móvil lo dicen al momento. `spareToFloor` en `#finish` queda de red de seguridad (`floorSpared`). La hucha se reparte entera: `SquidState.shares()` (el resto, +1 a los
  primeros por número). Canicas: la jugada se resuelve al momento pero nadie sabe quién gana hasta `MARBLE_REVEAL_MS`
  (1,8 s: la mano se abre; `#marblesOut`, `decided` en el móvil); jugada en 15 s (`MARBLE_MOVE_MS`, con reloj en la
  tele). Con un solo duelo, 45 s; en los últimos 10 s, todo o nada (`MARBLE_ALL_IN_MS`, `allIn(now)`: se apuestan
  todas, aviso en tele y móvil); con el reloj a cero no se empieza otra jugada; la apuesta del móvil vuelve a 1 en
  cada turno; quien no tiene pareja ve los duelos en directo. Corregir a mano (eliminar/revivir) también borra lo guardado de las pruebas posteriores.
- **Equilibrio** (para que se jueguen los cinco): en Luz roja hay que mantener el 42 % del verde (`HOLD_SHARE`); los
  topes de arriba (sin tope, `defaultCap` = 40 %: lo usan los tests); la cuerda no se
  decide antes de 7 s (`decided(now)`) y cuenta la media por cabeza (`averages`, lo que enseña la tele). La hucha se
  reparte redondeando hacia arriba. Al acabar antes de tiempo, la sala espera un poco antes del resumen
  (`SETTLE_MS`: canicas 3,4 s, para ver su último revelado). Con uno solo vivo (o nadie), `skipTo()`: «siguiente»
  (Espacio o el mando) va directo a la hucha. El reparto se apunta cuando la tele termina de contarla (`#award(key,
  true)`), así móviles y marcador no se adelantan. `SquidState.toJSON()` copia (lo guardado antes de un juego para R
  no cambia con él); R en una prueba borra lo guardado de las posteriores (`#forgetAfter`: resultados, estados y
  repartos). Canicas: quien no esconde o no apuesta en 15 s, lo hace la suerte (`autoPlay`, cada segundo desde la
  sala); empate al acabar el tiempo = a suertes (`coin`). Una prueba empezada cuando se recarga la tele vuelve a su
  presentación con aviso (`started` → `restarted`; con R, `restarted = 'manual'`: «Prueba reiniciada»); los `roundId` llevan una marca de sesión (el móvil no confunde la
  ronda nueva con la de antes de recargar).
- **Para probar** (solo en desarrollo): `host.html?demo=squid&bots=N` monta la sala con la plantilla y N concursantes
  y va a la presentación de Squid Games; `window.__fx.soundLog` = qué ha sonado y cuándo; `localStorage
  concurso.silencio = 1` calla la tele de desarrollo (el registro sigue).

### Lobos contra vampiros (fase 13: el pañuelo, el colofón)

Tipo `panuelo` («Lobos contra vampiros»; sin pestaña de preguntas: un solo ítem `{duels: true}`; puntos por defecto
`HANKY_POINTS` = 10 por duelo ganado; el presentador juega por defecto). Lógica pura con tests en `core/hanky.js`
(`HankyDuels`): el primer equipo de la hoja son los lobos y el segundo los vampiros; duelos = gente del equipo más
grande; `draw` sortea entre los que menos han salido (`candidates`: del equipo pequeño repiten), `choose` = pareja en
secreto; `current` called → running (`go`: cuenta atrás, `goAt`) → done (`win(side)`); `falseStart`, `cancel`, `undo`.
Tele: `host/games/hanky.js` (`HankyGame`, guarda en `itemResults[playKey].hanky`; `join` suma a quien entra tarde;
puntos al ganador con `adjustScore`) y `hankyStage.js` (marcador de duelos, pañuelo SVG, ruleta de caras que se para en
el elegido según `calledAt` + `ROULETTE_MS`, 3-2-1 y silbato, ganador con aullido `howl` o siseo `hiss`, campeón).
Espacio: sortear → ¡ya! → (ganador en el mando) → … → al marcador. Móvil: `gamesPad` `hanky()` («¡TE TOCA!», «¡CORRE!»
con vibración). Mando: `hankyPanel` (chips por equipo para elegir en secreto, `hankyDraft` fuera del pintado). Entorno
`lunallena` (`HANKY_ENV`, con su música en MOODS).

### Ajustes de la fase 13

- **Música:** la canción del título sigue sonando en la conexión (escena `title` en `join`). Sin lluvia en el sonido.
  Un archivo de menos de `SHORT_TRACK_S` (15 s) en un momento de música suena una vez (no se repite: era el «acierto»
  puesto en Revelado).
- **¿Qué canción es?:** la respuesta sale en un cartel dorado grande (`songAnswer` en stage.js).
- **Duelo de reflejos:** los dos del duelo se eligen tocando nombres (`duelDraft`, fuera del pintado; con el segundo,
  `setDuel`). Antes eran dos desplegables que el repintado del mando reiniciaba.
- **Libre con «Jugadores» y equipos:** el mando agrupa por equipo (`pool` lleva `teamId`): se elige quién sale y los
  puntos son suyos. La plantilla usa así twerking, galleta y flexiones. Sin «La silla invisible».
- **Nota:** `freeStart` pone `tStart` = ahora + la cuenta atrás; la tele cuenta 3-2-1 y la canción entra en `tStart`.
- **Panal:** tres pasadas (`LAPS`), velocidad de la aguja (`MAX_SPEED` 0,4 galletas/s medida en 150 ms; pasarse más
  de 250 ms = una grieta por acelerón; aviso «¡Más despacio!» desde el 80 %), 60 s. `restoreTrace` al recargar.
- **Squid:** 5 puntos por eliminado (plantilla y `#perHead` por defecto); `SQUID_ORDER` sin canicas (con su fila, sí).
- **Vídeo de sección** (`Vídeos/<sección>.mp4` o `Vídeos/<sección>/…`, `classifyFolder` → `videos`, trackStore
  `video:<folderKey>`): `syncSectionVideo` en host/main.js lo pone a los dos lados (en espejo, `mix-blend-mode: screen`)
  en la intro y el juego de esa sección. Entorno **Discoteca** (`DISCO_ENV`, solo si la hoja lo elige): `body.disco-on`
  con focos que barren (show.css) y su música con batería.

### Revisión a fondo (tras la fase 13)

- **Repintado:** la firma de la tele quita lo que no se dibuja en la pantalla (`lock/away/cheated` de cada jugador,
  avisos, mandos, bots; fuera de la preparación). El mando quita lo que cambia con el reloj (`squid.now`, `endsInMs`,
  `trialElapsed`, `ranking` en marcha, `inMs` del millonario); el móvil del millonario, también `inMs`. Si no, se
  rehacía todo varias veces por segundo (toques perdidos, podio y fanfarria repetidos).
- **Mando:** `STEP_ACTIONS` (órdenes que hacen avanzar) esperan `STEP_GAP_MS` (800 ms) entre sí: el doble toque no se
  salta un paso (las de contar, sí se repiten). El aviso (`toast`) vive fuera del pintado. El botón principal, fijo
  sobre las pestañas; «Siguiente: «Sección» →»; vibra al pulsar alguien; apuestas con botones (sin `prompt`).
  Tamaños de toque ≥ 44 px.
- **Pulsador:** lo que se da va a `itemResults[key].buzzer = {correct, penalties}` (`#buzzerRecord`): R lo quita y un
  segundo acierto en la misma pregunta sustituye al primero. El presentador en el banquillo no cuenta en `wrong`.
- **Partida nueva** reinicia también Squid (`squid.reset()`) y los mazos de Palabras.
- **Palabras:** el que hace adivinar queda fijo al empezar el turno (`#actor`); la marca lleva `cardNo` (la tarjeta).
- **El pañuelo:** al recargar a mitad de duelo, vuelve al sillón (horas del reloj viejo); el sorteo solo saca a quien
  está (`candidates(side, ok)`) y `join` quita a quien se fue sin salir.
- **Cuenta atrás de la tele** (`fx/countdown.js`): con `setTimeout`, y el número que ya sonó no vuelve a sonar al
  repintar (`countingFor`). El realizador anula sus avisos programados al cambiar de pantalla (`later`).
- **Tele con mucha gente:** `.vote-bars.many` / `.estimates.many` (más de 8: dos columnas, Votación solo los votados);
  el ganador del pulsador enseña 5 de los demás («y N más»); portada `lots` (más de 12 secciones) y títulos largos.
- **Millonario:** al repintar, las respuestas ya vistas no vuelven a aparecer ni la buena a parpadear (`seen`).
  Comodines en el móvil con dos toques (sin `confirm()`, que congela la conexión) y aviso de cuándo se pueden usar.
- **Detalles:** bichos de cada equipo en la presentación (`teamCreature`: 🐺 🧛 🧟…), bola de espejos en la discoteca,
  «Ana, Luis y Eva», el puesto propio en el móvil sin equipos, «✓ Apuesta guardada».
- Pendiente (raro, no arreglado): una prueba Libre a medias o los comodines del millonario antes de revelar no se
  guardan si la tele se recarga; volver a cargar la hoja borra lo jugado pero no los puntos.

### Fase 14: temáticas, dos presentadores y ajustes de juego

- **Libre:** todas se empiezan («▶ 3, 2, 1…»): `freeStart` / `freeNext` ponen `tStart` = ahora + `#freeCountdownMs`
  (los ajustes, mínimo 3 s); la tele (`runClock` en freeStage) cuenta 3-2-1 en el sitio del reloj y luego «¡ya!»; sin
  herramienta enseña un reloj (y el mando, el elegir ganador) — `startable` siempre. **Contar** solo desde el mando:
  `canCount()` → false (los concursantes se sumaban de más); sin `countersCard`. Marcar el golpe: `fadeIn` de 2 s
  (`songFor` → audio `setSong`).
- **Mando:** 🔊/🔇 (ajuste `muted`: volumen 0 sin tocar lo demás) y ⚖️ (orden `penalty {teamId|playerId, points}`: quita
  puntos y `lastPenalty` sale en la tele, `renderPenalty`) arriba, siempre. **Dos presentadores** que se turnan:
  `sala.playingNow` (persistido): un presentador que «ahora juega» no está en el banquillo (`benched`) y juega en todo;
  orden `setPlaying {playerId, playing}` o `{swap: true}`; `presentersCard` en Juego («⇄ Cambiar»).
- **El pañuelo:** sortear (o elegir) = ¡ya! en cuanto la ruleta se para (`HANKY_REVEAL_MS`, `#goOnReveal`), sin cuenta
  atrás; la tele repinta al pararse. «▶ ¡Ya!» solo tras una salida nula.
- **Squid:** sin voz de megafonía (`speak` solo espera lo que tardaría); Luz roja más dura (verdes de 4,2 a 1,4 s, 22 %
  de golpe, `HOLD_SHARE` 0,6, gracia 380 ms). Panal: `MAX_SPEED` 0,4 y el lienzo se borra entero en cada dibujo (la
  aguja dejaba rastro fuera de la galleta).
- **Temáticas** (entornos con `decor`, solo si la hoja los elige): Verano (Watermelon Sugar), Galletas (la galleta),
  Refrescos (botellas en orden, que ahora es por jugadores); `syncDecor` (host/main.js) hace subir lo suyo por detrás.
  Discoteca: el vídeo se mezcla en `.section-videos` (en el vídeo no servía: su capa es su propio contexto) y la bola
  va a un lado. Presentación de equipos sin «pulsa cualquier tecla».
- **Música por sección:** `Música/<Sección>/x.mp3` suelto → `sectionWideSlot` (`Sección|all`): suena en todos sus
  momentos sin cortarse (`#slotKey`: momento de la sección → toda la sección → general). Las carpetas de los momentos
  aceptan otros nombres (`aliases` en `MUSIC_SLOTS`, `slotOf` en folder.js): «En marcha»/«Carrera» = Pregunta abierta,
  «Preparando» = Jugando, «Parada»/«Esperando» = Suspense, «Ganador» = Revelado; la carpeta del presentador tiene ya
  creadas las de cada sección según su tipo (ver su LÉEME).

### Pruebas con canción y contrarreloj (fase 11)

- **Canciones de las pruebas** (carpeta del concurso `Canciones/` → trackStore `song:<songKey(nombre)>`, una por hueco;
  `core/folder.js` `songKey`): la hoja las nombra en «Canción» (Pulsador y Libre). `core/songs.js` `songFor(view)`
  (puro, con tests) dice qué suena: {key, track, from, playing, startAt, silence, until}; el realizador lo manda a
  `sound.setSong()` y `prepareSong()` las descodifica al llegar a la pregunta. audio.js las toca como AudioBuffer por
  `songBus` (suenan aunque la música esté apagada), calla la música de siempre (`#songHeld`), pausa recordando dónde
  iba (`#songPos` por key) y programa el silencio antes del golpe con automatización de ganancia (exacto).
  Pulsador: suena en `tOpen`, para en `result` sin juzgar, sigue en el rebote y al acertar / `closed` / mostrar
  respuesta. Libre con canción (sin herramienta: `FreeRound.startable`): suena al empezar; `silence = [golpe − s,
  golpe]`, acaba 4 s tras el golpe; la tele enseña «A bailar / Silencio / ¡GOLPE!» con `sound.songPosition()`.
  La preparación avisa de las que faltan (`songsStatus()` en main.js). «Golpe» y «Silencio» ya no van en la plantilla
  (se siguen leyendo): marcar el golpe es con la herramienta Nota. Las canciones pueden ir en subcarpetas de
  `Canciones/` (`Adivina la canción/`, `Marcar el golpe/`): cuenta solo el nombre del archivo.
- **Nota** (`TOOL.SCORE`, Libre «Nota»: marcar el golpe bailando): la canción suena entera (sin silencio) y el
  presentador da a cada participante una nota de 1 a `SCORE_MAX` (10) con `freeScore {id, value}` (vacío = quitarla;
  en marcha o parada). `award` da a cada uno su nota (`points`); `winners` = la nota más alta. Tele: la nota junto a
  cada nombre (`chip(p, score)`) y la clasificación «9/10 +9»; móvil: «💃 ¡A bailar!» y, al dar los puntos, «Nota: 8».
- **Contrarreloj** (`TOOL.TRIAL`, Libre «Contrarreloj» + «Piezas»): salen de uno en uno en el orden de
  `participants`; `trials[id] = {tStart, time, gaveUp, attempts: [{n, t}]}`, `current`. Órdenes freeAttempt {n},
  freeUndoAttempt, freeDone {gaveUp}, freeNext. Con n = piezas se para solo. Gana el menor tiempo (rendirse = sin puesto).
- **Fluidez de la tele** (`fx/backdrop.js` `QUALITY_LEVELS`): con calidad 'auto' (ajuste `quality`) mide la mediana del
  fotograma cada 90 y, si pasa de 1,35 × el ritmo de la pantalla, baja un nivel (resolución del shader 0,6 → 0,26,
  dibujar 1 de cada 2–3 fotogramas); sube si va sobrada 8 medidas seguidas y 30 s después de bajar. Desde el nivel 2,
  `body.fx-lite`: sin `backdrop-filter` y la mitad de confeti. Los cristales pequeños (tarjetas, filas) ya no
  desenfocan nunca (brillo en degradado): el desenfoque sobre un fondo que se mueve se recalcula en cada fotograma.
- El realizador va en try/catch: un fallo de sonido no puede dejar la tele sin repintar (pasó con los comodines de
  `AnswerRound`, que ya no existen: las secciones de respuestas no enseñaban el revelado).

### Justicia en los tiempos (fase 3)

- Relojes con `performance.now()` en ambos lados (monótono); la pulsación usa `event.timeStamp` del `pointerdown`
  (instante del toque, no de la ejecución del manejador; si cae a >1 s de `performance.now()` se usa este).
- `src/core/clockSync.js`: NTP iniciado por el móvil. Ráfaga de 10 muestras cada 60 ms al conectar, mini-ráfaga de 4
  cada 15 s y completa al volver a primer plano. Ventana de 24 muestras de ≤ 90 s; se toman las 3 de menor RTT,
  mediana del offset, `err = rttMin/2`. Se reinicia en cada conexión (el presentador pudo recargar: su reloj empieza de 0).
  `player/syncClient.js` lo ejecuta; el presentador contesta `syncReply` en cuanto llega `sync` (t1 = llegada, t2 = salida).
- `src/core/plausibility.js`: `tPress = tLocal + offset`, recortado a `tArrival` si dice ser posterior a la llegada (más de
  max(10 ms, err)) y a `tArrival − max(250 ms, 2×RTT latido)` si dice ser demasiado anterior.
- Apertura programada: el móvil sincronizado cambia a "¡PULSA!" en `tOpen − offset` (a la vez que la tele); sin
  sincronizar, en `recepción + opensInMs`.
- Ventana de 150 ms tras la primera llegada válida; orden por `tPress`, desempate por llegada y `playerId`.
- Modo depuración (D): por jugador RTT del latido, offset, error y muestras; por ronda pulsó / llegó / red / origen.
- Límites y trampas: ver README, "Justicia en los tiempos".

### Espectáculo (fase 9): tema de Halloween

- **Tema:** tokens en `base.css` (noche violeta, calabaza `--accent`, verde poción `--ok`), superficies de cristal
  translúcido (`backdrop-filter`) para que se vea el fondo. Letras: Outfit (variable) y Creepster (`.display`, solo en
  títulos grandes: a tamaño pequeño no se lee). Paquetes `@fontsource`, sin pedir nada a Google.
- **Entornos** (`src/shared/environments.js`): 11 decorados (Noche de luna = preparación, portada y final; Plató
  millonario = secciones de Test, con fichas alargadas «A: B: C: D:» como en «¿Quién quiere ser millonario?»; el resto se
  reparten por sección en orden, o se eligen con la columna opcional «Entorno» de la pestaña Concurso → `section.env`).
  `sectionEnv(section, index)` decide; la tele los pinta con WebGL y los móviles con `envGradient()` (el estado del
  jugador y del mando lleva `section.env`).
- **Fondo WebGL** (`fx/backdrop.js`): un shader de pantalla completa a 0,6 de resolución. Cielo, estrellas, luna,
  nubes y niebla con fbm, siluetas por SDF (tumbas, árboles, castillo con ventanas, telaraña con araña, calabazas
  con cara, cripta con velas, laboratorio con pociones, caldero con fuego, árbol solitario), partículas (luciérnagas,
  brasas, burbujas, lluvia, chispas, polvo), murciélagos y relámpagos con rayo. Al cambiar de entorno los colores se
  funden y las siluetas cambian a mitad de un oscurecimiento. Sin WebGL: degradado CSS. En desarrollo,
  `window.__fx` da acceso al fondo y al sonido desde la consola.
- **Música:** 10 estilos según el momento (además: call y audienceVote, la llamada y el público del millonario, si no hay canciones) (`fx/music.js`, sobre los instrumentos de `fx/synth.js`): lobby
  (preparación, swing), organ (portada e intros), explore (jugando: colchón y caja de música del entorno), tension
  (pregunta abierta: ostinato que sube y latido), suspense (esperando veredicto: timbales y acorde disonante), reveal
  (revelado: resolución en mayor), march (marcador) y waltz (final). El realizador elige el estilo (`musicScene`); la
  tonalidad, escala y ambiente (viento, lluvia, fuego, burbujas, búhos) son del entorno. Las melodías son motivos que se
  repiten y cambian cada 8 compases.
- **Tus canciones** (`fx/tracks.js`, ventana `musicDialog.js`): huecos con nombre y «dónde suena» para cada momento,
  generales (mismas claves que los estilos) y por sección (`Nombre de la sección|momento`: presentación, jugando,
  pregunta abierta, suspense, revelado, marcador). Se arrastra el .mp3 encima del hueco o «Examinar…». Manda el de la
  sección, luego el general, luego la música generada (`setScene(scene, sección, nº de pregunta)`). Ordenadas por nombre.
  **Escalera** (`LADDER_SCENES`): en una sección, «Jugando», «Pregunta abierta» y «Suspense» con varias canciones ponen la
  1ª en la 1ª pregunta, la 2ª en la 2ª… (la última sigue). **Efectos con canción** (`EFFECT_SLOTS`, `SFX_SLOT`): respuesta
  definitiva (al cerrar), acierto, fallo y cada comodín (la tele detecta su uso con `jokersUsed`) suenan una vez en vez
  del efecto generado, con la música bajada mientras. Se guardan en IndexedDB del portátil
  (no en el repositorio, que es público). Un hueco con varias las alterna (al volver antes de 3 min, sigue donde iba).
- **Canciones del millonario** (`core/millionaireMusic.js`, huecos `mill:<canción>` en tracks.js, uno por hueco):
  tema, explicación, fácil, media, difícil, público y llamada. `MILLIONAIRE_CUES` = puntos sacados de analizar los
  archivos del usuario (compás, golpes y bucles con similitud espectral > 0,97): bucle, «respuesta definitiva» (`lock`),
  bucle de suspense, golpe de acierto (`reveal`), fin de votación (`voteEnd`: golpe = fin de los 15 s), fin del reloj de
  la llamada (`clockEnd`: golpe = fin de los 30 s), `end` (sin el silencio final) y `gainDb` (iguala volúmenes).
  `millionaireCue(vista, ahora)` (puro, con tests) dice qué suena: {key, track, from, loop, after}; el realizador lo
  manda a `sound.setCue()`. audio.js descodifica las canciones (AudioBuffer: bucles exactos con loopStart/loopEnd),
  calla la música de siempre mientras (`cueHeld`), no reinicia si la `key` no cambia, sigue sin cortar si ya va por ese
  punto y, al acabar una sin bucle, toca `after` (el colchón desde el bucle). Por la tele recargada a mitad: `from` se
  calcula con lo que queda del comodín. Con canciones sobran la campana, el acierto y el golpe generados. «Cómo se juega»:
  tras el título de una sección de Test, `next` pasa primero a `introRules` (sala `#rulesFor`; `prev` vuelve al título).
  La ventana de música tiene «▶» para escuchar cada punto (`sound.previewCue`) y «⏱ Ajustar tiempos» por canción
  (`CUE_FIELDS`, `cueFieldsOf`): cada punto con su valor, ±0,1 s y «▶» que suena desde 2 s antes con una cuenta
  «2… 1… ¡Ahora!» que sigue la posición real (`sound.cuePosition(key)`). Los ajustes van a localStorage
  (`fx/cueSettings.js`, `concurso.millonario.puntos.v1`) y `applyCueOverrides` los aplica sobre `MILLIONAIRE_CUES`:
  `getCues()` lo usan el realizador (`millionaireCue(v, ahora, cues)`) y audio.js. «📋 Copiar ajustes» los da en
  texto para dejarlos fijos en el código.
- **Carpeta del concurso** (`core/folder.js` `classifyFolder`, puro con tests; `host/contestFolder.js`): hoja .xlsx en la
  raíz, `Millonario/`, `Caras/`, `Música/<Momento>/`, `Música/<Sección>/<Momento>/` y `Canciones/` (nombres sin tildes ni mayúsculas).
  Con File System Access (Chrome/Edge) el handle se guarda en IndexedDB (`concurso-carpeta`) para «Volver a leer» con
  un clic; si no, `webkitdirectory`. Se copia todo a los almacenes con `source: 'carpeta'` y al releer se sustituye.
  La carpeta del presentador está en sus Documentos («Concurso del año - archivos»), fuera del repositorio.
- **Caras** (`faceStore.js`, ventana `facesDialog.js`, `core/faces.js`): fotos en IndexedDB del portátil (recortadas a
  240 px); los nombres salen del archivo («Rodri, Rodrigo.jpg») y se editan. `HostRoom.setFaces()` reconoce a quien
  tenga uno de esos nombres (`matchFace`, sin mayúsculas ni tildes) → `player.face`; manda `faces` con las fotos en uso
  a móviles y mandos. `avatarOf(p)` (shared/appearance.js) pinta la cara o el icono en todas partes.
- **Entrar en el móvil:** primero código y nombre; si hay foto con ese nombre, juega con su cara; si no, tras el equipo
  elige icono y color (`screen-look`, una vez por móvil: `profile.lookChosen`). El ✏️ deja cambiar el nombre solo en
  preparación (la tele lo ignora después) y tiene «Salir y entrar en otra sala». Al entrar (ya con equipo y aspecto),
  bienvenida «¡Hola, Rodri!» con su foto o su icono en grande (`screen-welcome`, 4,5 s o «¡Vamos!»; una vez por sala y
  por carga de la página); con equipos se espera a que la tele confirme el equipo.
- **Efectos** (`fx/audio.js`, Web Audio): whoosh, gong, ¡pulsad!, pulsación, acierto, fallo, tictac, cuenta atrás,
  campana, redoble, revelado, trueno, fanfarria. Ajustes `musicOn`, `sfxOn`, `volume` (en Ajustes de la tele y en el mando, pestaña Secciones). El
  navegador no deja sonar nada hasta un toque: la tele muestra «🔊 Activar sonido» hasta la primera tecla o clic.
- **Realizador** (`fx/director.js`): compara cada vista con la anterior y lanza entorno, música, efectos y confeti
  (abrir turno, pulsar, acertar, fallar, respuestas que llegan, cerrar, revelar, eliminado, ganador de Libre).
- **Movimiento** (`fx/motion.js`): entrada de pantalla con desenfoque al cambiar `screenKey`, títulos letra a letra
  (`kinetic`), cifras de cuentakilómetros (`odometer`: puntos de las tarjetas, marcador, contadores de Libre),
  reordenación FLIP y revelado con suspense (`suspense`: del último puesto al primero; el ganador tras una pausa, con
  golpe y confeti) en Estimación, Votación, Contador y Reflejos. `prefers-reduced-motion` lo desactiva.
- **Marcador:** recuerda los puntos de la última vez que se enseñó; empieza en ese orden, los puntos ruedan y luego las
  filas se reordenan. **Final:** podio 3º → 2º → 1º con foco, redoble, fanfarria y confeti (`fx/confetti.js`).
- En el marcador y el final la firma de repintado no incluye `connected` (que una desconexión no repita la animación);
  un revelado ya pintado (`roundId`, que la vista de la tele incluye) no se vuelve a pintar: cortaría el suspense.
  Los sonidos programados se anulan al cambiar de momento (`momentKey`), no en cada repintado.
- **Antes de empezar** (`sala.setupStep`, persistido): `prep` (preparación: hoja, carpeta, caras, música y QR del
  mando; sin QR de jugadores) → `title` (el título en grande, `.splash` encima de todo, con la canción «Título del
  concurso»; si el sonido no está activado, el primer toque solo lo activa) → `join` (QR grande, equipos, portavoces).
  `next` / `prev` recorren los pasos. Al empezar, si hay al menos dos equipos con gente (`hasVersus`), la portada
  empieza por la **presentación de equipos** (`versusScreen`, `view.versus`, canción «Presentación de equipos»): cada
  equipo entra por un lado con su gente, golpe por equipo y fanfarria con el «VS». La **portada** es la introducción:
  secciones de la noche, cómo se juega y equipos.
- **Antes de cada pregunta:** explicación (`howTo`: tiempo, cómo se puntúa) y cuenta atrás 3-2-1 (`countdownSec`,
  ajustable; 0 = sin ella) en tele y móviles. El motor del pulsador la aplica en la primera apertura (el rebote tras un
  fallo abre enseguida) y `AnswerRound.open({countdownMs})` en Test, Verdad, Dos verdades, Votación y Estimación.
- **Revelado con tensión** (`answerStage.js`): transición de entrada (`revealSweep`: se oscurece y la cruza un destello),
  redoble de 2,4 s y «Y la respuesta correcta es…»; las barras crecen sin
  decir cuál es la buena y a los 2,8 s (`REVEAL_AT`) se ilumina con golpe; luego los que suman. En las listas
  (Votación, Estimación, Contador, Reflejos) primero el redoble y luego las filas del último al primero.
- **Contador** con milisegundos (`12,345 s`; la distancia al objetivo en ms por debajo de 1 s, `formatGap`).
- **Tarjetas de la tele:** compactas con 9–14 jugadores y diminutas con 15–20 (`#player-grid[data-density]`); al sumar
  puntos la tarjeta da un salto y sale «+N».
- **Móviles:** fondo del entorno, pulsador como esfera de cristal del color del jugador, Wake Lock mientras la página
  está a la vista (se vuelve a pedir al volver).
- `h()` aplica las variables CSS de `style` con `setProperty` (antes `Object.assign` las ignoraba y opciones,
  barras y fichas salían sin color).

## Diseño del concurso (acordado; hecho hasta la fase 9)

- **Tres papeles:** `host.html` = espectáculo en la tele (sigue siendo la autoridad: estado, puntos, conexiones,
  música); `control.html` = mando del presentador en su móvil (ve preguntas y respuestas en privado, lo controla
  todo); `index.html` = jugador. El mando se empareja con un QR con clave secreta que muestra la tele en
  preparación + confirmación con tecla en el portátil; luego se recuerda. El teclado del portátil sigue de respaldo.
- **El presentador también puede jugar** en las secciones que lo permitan (columna "El presentador juega"), desde la
  pestaña «Jugar» del mando: su `hello` lleva `presenter: true` → `sala.presenterIds` (persistido). `benched(id)` =
  presentador y la sección no lo permite (Test, Verdad, Estimación…: ve las respuestas): fuera de los elegibles de
  respuestas, del pulsador (`closed`), del asiento y del público/llamada del millonario y del orden de su equipo (y mejor
  no portavoz); su móvil dice «🎤 Presentas» (`state.benched`) y la tele pone 🎤 en su tarjeta.
- **Pantallas de la tele:** Preparación → Título → Conexión → Equipos (A vs B) → Votación de castigos → Portada →
  [Intro de sección → rondas → Marcador] × N → Final (podios) → Ruleta del castigo.
- **Equipos:** se eligen al entrar; antes de empezar, pantalla de comprobación y "Equipos cerrados" (solo el
  presentador puede mover a alguien después). Puntos individuales visibles; equipo = suma de sus miembros + puntos
  dados al equipo entero.
- **Contenido:** hoja de cálculo `.xlsx` (plantilla con «Empieza aquí», Concurso, Equipos, Ajustes y una pestaña por
  tipo de sección), importada en el portátil con validación por fila. Debajo de los títulos, una fila de ayuda azul que
  explica cada columna: empieza por «↳» (`HELP_MARK`) y la lectura la salta. La columna «Sección» de las preguntas va
  al final y vacía = la única sección de ese tipo (si hay varias, error que las nombra). En Concurso, «Sus preguntas, en
  la pestaña» es una fórmula (la lectura no la mira). Formato condicional: la respuesta buena del Test en verde, la
  dificultad en colores, Verdad/Mentira y la frase falsa de Dos verdades.
- **Música:** sin Spotify (descartado). «Canción» y «Desde (s)» (Pulsador y Libre) nombran un archivo de la carpeta
  `Canciones/` (ver «Pruebas con canción»). «Música de entrada» de la pestaña Concurso se lee pero no se usa.
- **Secciones:**
  - **Pulsador** (la actual) + la pregunta en grande en la tele cuando el presentador quiera.
  - **Test** = «¿Quién quiere ser millonario?»: un concursante cada vez; comodines 50:50, Público y Llamada (por equipo);
    fáciles, medias y difíciles (columna «Dificultad» o por tercios; la plantilla trae 4 de cada) que valen 2 · 5 · 10 (Puntos del Test con tres
    valores: `pointsForLevel`; la pregunta lleva `level` y sus puntos, y su música es la de su dificultad).
  - **Verdad o mentira**: V/F a la vez; variante "Dos verdades y una mentira" sobre un jugador (él no vota).
  - **¿Quién es más probable que…?**: todos votan a un jugador; revelado con suspense; puntos a quien vota con la mayoría.
  - **Estimación**: cada uno escribe un número; más cercano, o "sin pasarse" (El precio justo) según la pregunta.
  - **Parar el contador**: objetivo en segundos; modo visible / a ciegas / desaparece a los N s, elegible por ronda.
  - **Duelo de reflejos**: rojo → verde tras 2–6 s al azar; pulsar en rojo elimina de la ronda; todos o un duelo.
  - **Libre** (p. ej. "Fit o Fat"): participantes y puntos; herramientas cronómetro (con "eliminado"), contador +1/−1,
    contrarreloj y nota del 1 al 10 (marcar el golpe bailando).
  - **Palabras secretas**: mímica, Tabú, descríbelo o tararéalo; uno del equipo la hace, el rival vigila y pita.
  - **Agita el móvil**: carrera de sacudidas (acelerómetro). **La gran apuesta**: para el final, se apuestan los puntos.
- **Castigos:** todos votan 3 al empezar; al final, ruleta entre los 3 más votados para el equipo que pierde.
- **Qué se juega esta noche:** el presentador quita secciones con casillas en la preparación (sin tocar la hoja).

## Fases

1. Conexión, sala, QR, lista de jugadores, reconexión, persistencia. ✔
2. Flujo del pulsador (orden por llegada). ✔
3. Sincronización de tiempos y modo depuración. ✔
4. Base del concurso: roles tele / mando / jugador, estructura por secciones y pantallas, equipos con
   comprobación, importación de la hoja + plantilla, Pulsador como sección. ✔
   (Los demás tipos ya se leen y validan desde la hoja; en el juego muestran su intro y se saltan hasta su fase.)
5. Respuestas desde el móvil: Test (con comodines), Verdad o mentira, Dos verdades, ¿Quién es más probable…?, Estimación. ✔
6. Secciones de tiempo: Parar el contador y Duelo de reflejos. ✔
7. Sección Libre (cronómetro y contador). ✔ Y que el presentador juegue desde el mando (pestaña «Jugar»). ✔
8. ~~Spotify~~ — descartado: la música la pone el presentador aparte.
9. Espectáculo con tema de Halloween: entorno por sección (WebGL), música y efectos generados, transiciones, marcador
   animado, revelados con suspense, podio con confeti, wake lock, tarjetas compactas para 20 jugadores. ✔
10. Juegos de fiesta: Palabras secretas, Agita el móvil, La gran apuesta; castigos con ruleta; elegir los juegos. ✔
11. Pruebas físicas y con música: canciones desde la carpeta (¿Qué canción es?, bachata con silencio antes del golpe),
    contrarreloj con intentos (botellas); calidad automática de la imagen de la tele. ✔ Parar y seguir otro día. ✔
12. Squid Games: Luz roja, El panal, El puente, Tira y afloja y Canicas, con eliminados y hucha. ✔
13. Lobos contra vampiros (el pañuelo) como colofón; twerking con discoteca y vídeo; panal más exigente. ✔
14. Temáticas (Watermelon Sugar, galletas, refrescos), dos presentadores, penalizar, silenciar, música por sección. ✔

Hoja de ruta posterior: mandos físicos (Gamepad API), imagen pixelada, rosco, dibuja y adivina.
