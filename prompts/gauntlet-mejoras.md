# Gauntlet: mejoras visuales, coherencia, bugs y calidad de vida (Concurso del año)

Usa un workflow (multi-agente) para hacer un **Gauntlet Loop** sobre el concurso antes de la fiesta: cuatro críticos
buscan problemas, unos constructores los arreglan y los críticos vuelven a juzgar lo cambiado. Tamaño: hasta unos 14
agentes en total, nunca más de 4 a la vez (para no tocar el límite de sesión).

Lee primero `CLAUDE.md` entero (sobre todo «Forma de trabajar» y «Errores ya cometidos»): manda sobre este prompt.

## Lo que dijo Rodri antes de lanzarlo (2026-10-30)

- Se lanza **sin él delante y con 4 horas como mucho**: no hay punto de espera. Las decisiones las toma el orquestador
  (la opción recomendada) y quedan en `gauntlet/decisiones.md` para que las revise; lo que cambie reglas del juego o no
  se pueda deshacer, no se hace: se deja propuesto.
- Fiesta de **14 personas (7 chicas y 7 chicos)**, secreta: escenario principal = 14 concursantes, dos equipos de 7.
  Las caras están todas. **En el móvil ya se ve bien**: la prioridad visual es la tele.
- Música: **una general por sección y una por prueba** (no por momento). Squid: solo quiere canción propia para Tira y
  afloja (la buscará él).
- Los dos `.mkv` de `Vídeos/` son para la **presentación de Twerking**, con su propia música: elegir uno.
- **Las secciones sin vídeo, con fondo y estética propios** acordes a la sección (como gimnasio, relojería o globos).
- Banco ya preparado: servidores `gauntlet-1` … `gauntlet-4` (puertos 5181–5184, sin recarga automática) en
  `.claude/launch.json`; material en `gauntlet/material/`, capturas en `gauntlet/atlas/` (los dos fuera de git).

## Fase 0 — banco de pruebas común (una vez, lo haces tú, sin agentes)

- Arranca el servidor `dev-http` (puerto 5174) y comprueba que `npm test` y `npm run build` pasan antes de tocar nada.
- Escribe en `gauntlet/banco.md` cómo probar cada zona, para que ningún agente lo reinvente:
  - Tele: `host.html?demo=squid&bots=N`, `window.__room.run(orden, args)`, `window.__room.view()`,
    `window.__fx.soundLog`, `localStorage concurso.silencio = 1`, ventana 1280×720 y 1920×1080.
  - Cargar su hoja y su música desde `Concurso del año - archivos/` con `fetch(encodeURI(...))` (DataTransfer en
    `input[type=file][accept=".xlsx"]`, `trackStore.add(...)`), como dice CLAUDE.md.
  - Móvil del jugador (`index.html?sala=X&perfil=N`, 375×812) y mando (`control.html`), con los concursantes de prueba.
  - Escenarios fijos: 2 jugadores, 8 con dos equipos, 20 sin equipos; recargar la tele a mitad de una prueba.
- Estado en disco: `gauntlet/estado.md` (qué parte va por qué ronda) y un archivo por crítico y por parte. Si la
  sesión se corta, se sigue desde ahí.
- Material de Rodri en `gauntlet/material/` (capturas y grabaciones de móviles reales, fotos de la tele, notas de la
  última prueba…): léelo y apúntalo en el banco para que lo usen los críticos. Los vídeos no se pueden ver: si hay
  `ffmpeg`, saca fotogramas cada pocos segundos; si no, pide capturas.
- Un **atlas de capturas** en `gauntlet/atlas/`: una captura por pantalla importante (preparación, título, conexión,
  equipos, portada, la intro y una pregunta de cada tipo de sección, revelados, marcador, final, cada juego de Squid,
  el pañuelo, la ruleta) en 1280×720, más el móvil y el mando en 375×812 en los momentos clave. Lo usan los dos
  críticos visuales (y los constructores para comparar antes y después).

## Fase 1 — cuatro críticos en paralelo (solo leen y prueban; no cambian código)

Cada crítico entrega `gauntlet/critica-<lente>.md` con **como mucho 15 hallazgos**, ordenados por severidad:

- **crítica**: rompe la partida o da puntos mal delante de todos;
- **grave**: se nota y molesta en la fiesta, o el presentador se atasca;
- **menor**: pulido.

Cada hallazgo lleva: dónde (`archivo:línea` y pantalla), cómo reproducirlo con el banco (pasos exactos), qué se ve
(captura o valores de `view()`/`soundLog`), qué propone y si necesita una decisión de Rodri. Nada de «podría
pasar»: lo que no se reproduce va como sospecha aparte, sin severidad.

1. **Crítico visual (cada pantalla por sí sola: ¿se ve bien y se entiende?).** Legibilidad a 3 metros en 1280×720
   y 1920×1080, cosas que se cortan o se solapan (como la muñeca de Luz roja que solo enseñaba el pelo), contraste
   sobre los fondos WebGL de cada entorno, jerarquía (lo importante, lo más grande), animaciones o sonidos que se
   repiten al repintar, tarjetas con 2 y con 20 jugadores, y el móvil a 375 px.
2. **Crítico de coherencia visual (todas juntas: ¿parecen el mismo programa?).** Compara el atlas entero: tipos de
   letra y tamaños para el mismo papel (títulos, rótulos, cifras), colores (los tokens de `base.css` frente a colores
   sueltos en el CSS), botones, chips y tarjetas que hacen lo mismo con aspecto distinto, iconos (emoji frente a
   dibujos propios, mezclados sin criterio), márgenes y esquinas, transiciones de entrada, y que tele, móvil y mando
   cuenten lo mismo con el mismo lenguaje (palabras, colores de equipo, avatares). Que cada temática (Halloween,
   millonario, Squid, discoteca, gimnasio, relojería, globos…) tenga su carácter sin que se pierda la marca del
   concurso. Propón una regla por hallazgo («los rótulos de sección siempre así»), no arreglos sueltos.
3. **Crítico de bugs (correcto y robusto).** Puntos que se suman dos veces o se pierden, R y «Partida nueva»,
   recargar la tele a mitad de cada tipo de sección, reconexión de móviles y mando, temporizadores con la ventana
   oculta, firmas de repintado, la música (huecos, «sigue la que sonaba», canción por juego, redoble) y casos límite:
   empates, nadie responde, un solo vivo en Squid, equipos desiguales, presentador que juega.
4. **Crítico de calidad de vida (presentador y jugadores).** Cuántos toques cuesta cada paso en el mando, qué
   botón toca ahora y si se ve, cómo deshacer un error delante de todos, si el jugador sabe siempre qué hacer en su
   móvil, avisos que no se entienden y lo pesado de la preparación (hoja, carpeta, caras, música).

Los críticos con esfuerzo medio, salvo el de bugs (alto). Los dos visuales se reparten el terreno: si un hallazgo es de
una pantalla, es del visual; si es de que no casan entre sí, del de coherencia.

## Punto de decisión (antes de construir nada)

Junta los cuatro informes, quita repetidos y enséñame:

- la lista por severidad, en una tabla corta;
- **las decisiones abiertas como cuestionario**: cada pregunta con su contexto en dos o tres frases, cada opción con
  su consecuencia y la recomendada primero.

Espera mis respuestas. Lo que no necesita decisión sigue adelante.

## Fase 2 — constructores por partes

- Reparte lo aprobado en **partes con archivos que no se pisen** (p. ej. tele/escenas, móvil, mando, sonido,
  núcleo con tests). Una parte = un constructor, como mucho 3–4 a la vez.
- Las reglas de coherencia aprobadas van **primero y solas** (tokens y clases comunes en `base.css`/`show.css`/
  `phone.css`): las demás partes visuales empiezan cuando estén, para no arreglar dos veces lo mismo.
- Cada constructor arregla **solo su brecha**: nada de reescribir módulos ni de mejoras que nadie pidió. Sigue el
  estilo del código de alrededor (identificadores en inglés; comentarios e interfaz en español).
- Lógica en `src/core` → con su test. Todo lo visible → probado con el banco (captura o `view()` de antes y después).
- Al acabar cada parte: `npm test` y `npm run build` en verde, y una nota en `gauntlet/parte-<n>.md` con qué cambió
  y cómo se comprobó.
- Esfuerzo alto solo en las partes de núcleo/puntos; medio en el resto.

## Fase 3 — los críticos vuelven a juzgar (por diferencia)

- Cada crítico mira **solo el diff de su lente** y un pase rápido de regresión del resto de la pantalla tocada.
- **Pasa** la parte que no deja nada crítico ni grave abierto; los menores pueden quedar apuntados.
- **Como mucho 2 rondas por parte.** Si en la segunda sigue sin pasar, se para y me lo cuentas con las opciones.

## Reglas que no se saltan

- Sin `commit` ni `push`: al final te pido yo el commit.
- La hoja y la carpeta del concurso, solo como dice CLAUDE.md («Tocar su Excel», «Comprobar la carpeta»): copia en
  `Copias/`, edición puntual, `check-sheet` y `check-folder` sin errores.
- Respeta los «Errores ya cometidos» de CLAUDE.md (setTimeout y no rAF para relojes, nada de `confirm()`/`prompt()`,
  lo que cambia con el reloj fuera de las firmas…).
- Lo que dependa de móviles reales (vibración, sensores, Safari) márcalo como «sin probar en móvil real».

## Entrega final

Un resumen corto: qué se arregló (por severidad), qué quedó y por qué, cómo lo compruebo yo en un minuto en la tele, y
qué conviene probar con el móvil de verdad. Actualiza CLAUDE.md con lo que deba saber la próxima sesión.
