# Concurso del año

Pulsador de concurso con móviles, estilo Kahoot. La pantalla del presentador se ve en la tele (portátil
conectado por HDMI); cada jugador usa su móvil como pulsador, sin instalar nada. Web 100 % estática
(GitHub Pages) con WebRTC mediante [PeerJS](https://peerjs.com/).

> Estado: **fase 10** — concurso por secciones con equipos, cargado desde una hoja de cálculo; la tele es el
> espectáculo (tema de Halloween, con un decorado animado, música y efectos distintos en cada sección) y el
> presentador lo maneja desde su móvil. Se juegan **Pulsador**, **Test** (como «¿Quién quiere ser millonario?»),
> **Verdad o mentira**, **Dos verdades y una mentira**, **¿Quién es más probable…?**, **Estimación**,
> **Parar el contador**, **Duelo de reflejos**, **Libre** (pruebas tipo «Fit o Fat» con cronómetro o contador),
> **Palabras secretas** (mímica, Tabú, descríbelo, tararéalo), **Agita el móvil** y **La gran apuesta**. Antes de
> empezar se eligen los juegos de la noche y se votan los **castigos** del equipo que pierda (al final, ruleta).

## Preparar el concurso

1. Descarga la plantilla: en la tele, pantalla de preparación → **Descargar plantilla** (o
   `public/plantilla-concurso.xlsx`). Ábrela con Excel o Google Sheets (para cargarla: Archivo → Descargar → .xlsx).
2. Rellénala: empieza por la pestaña **Empieza aquí** (4 pasos y qué es cada tipo de sección). En **Concurso**, una
   fila por sección (la columna gris te dice en qué pestaña van sus preguntas); luego las preguntas en la pestaña de su
   tipo, una por fila. Debajo de los títulos, una fila azul explica cada columna. La columna **Sección** de las
   preguntas puede quedar vacía si solo hay una sección de ese tipo. En el Test la respuesta buena se pinta de verde.
   Para cambiar algo, edita la celda y vuelve a cargarla.
3. En la tele, **Cargar concurso** (o arrastra el archivo a la pantalla). Si algo está mal, dice la pestaña y la fila.
4. Opcional: en la pestaña **Concurso**, la columna **Entorno** elige el decorado de cada sección (Cementerio, Bosque
   encantado, Huerto de calabazas, Laboratorio, Mansión encantada, Telaraña, Aquelarre, Cripta helada, Tormenta o
   Noche de luna). Si se deja vacía, cada sección tiene uno distinto.
5. **Castigos**: en la pestaña Castigos, una opción por fila (sin filas, no hay castigo).
6. La plantilla viene llena (18 secciones con preguntas de Halloween y pruebas físicas, equipos Zombies y Hombres Lobo).
   La columna **Se juega** de Concurso dice cuáles van esta noche: Calentamiento, ¿Verdad o mentira? y Calcula vienen
   con «No» (en rojo) y salen sin marcar en la tele; se activan con un clic.
   ¿Una noche sin algún juego? No hace falta borrarlo: en la preparación de la tele, **¿Qué juegos jugamos?** tiene una
   casilla por sección (también en el mando, pestaña Juego, durante la preparación). Las que quitas se saltan.

## Cómo se juega

1. Abre `host.html` en el portátil conectado a la tele y pon la ventana a pantalla completa. Empieza en la
   **Preparación**: carga la hoja y la carpeta del concurso (canciones y caras).
2. **Tu móvil como mando:** escanea el QR «Mando del presentador» de la preparación y confirma en el portátil (Enter).
   Desde entonces tu móvil se reconecta solo, también si lo bloqueas o cambias de app. Ves cada pregunta con su
   respuesta antes de lanzarla.
3. **Presentar el concurso**: el título en grande con su canción (hueco «Título del concurso» de 🎵 Música). Un toque
   o una tecla y sale el QR grande para que **se conecte la gente**: eligen nombre e icono y, si hay equipos, su equipo.
   Comprueba los equipos en la tele (se puede mover a alguien) y pulsa **Presentar los equipos**: los equipos se cierran
   y sale «Zombies contra Hombres Lobo» con su música (hueco «Presentación de equipos»).
4. **Castigos**: todos eligen en el móvil sus 3 favoritos de la lista (la tele va contando los votos). Siguiente cierra
   la votación: los 3 más votados (empates al azar) van a la ruleta.
5. Portada → presentación de cada sección → preguntas → marcador → … → final con podios → **ruleta del castigo**
   (Espacio o «Girar» en el mando): gira 6 s y sale el castigo del equipo que ha quedado último.
6. En el **Pulsador**: «Mostrar pregunta» (la pone en grande en la tele), «Abrir turno» → a los 300 ms tele y
   móviles pasan a **¡Pulsad!** a la vez. La primera pulsación llena la tele con el ganador, su tiempo y el orden de
   los siguientes (con «casi empate» si la diferencia es menor de 30 ms). Luego **Acierto** (suma los puntos de la
   sección) o **Fallo: rebote al resto** (bloquea a quien falló y reabre el turno), «Mostrar respuesta» y
   «Siguiente pregunta».
   - **Con canción** («¿Qué canción es?»: columnas «Canción» y «Desde (s)»): la tele la pone en el «¡Pulsad!», la
     para en cuanto alguien pulsa, sigue donde iba si falla y suena entera al acertar. Los archivos van en la carpeta
     del concurso, en `Canciones/`, con el nombre que pone la hoja (sin tildes ni mayúsculas, da igual). En la
     preparación, la tele dice si falta alguna.
7. Quien pulse antes de abrir el turno queda **bloqueado** en esa pregunta (se puede desactivar en **Ajustes** o
   perdonar con «Desbloquear»).

8. **Test = «¿Quién quiere ser millonario?»**: concursa una persona cada vez, alternando equipos (pregunta 1 → Zombies,
   pregunta 2 → Hombres Lobo…) y dentro de cada equipo en el orden que eligió su portavoz. La plantilla trae
   **4 fáciles, 4 medias y 4 difíciles** (columna «Dificultad»; vacía = por tercios), que valen **2, 5 y 10 puntos**
   (columna Puntos del Test en la pestaña Concurso: «2,5,10»). Cada una suena con su música (fácil, media o difícil). No hay reloj: desde el mando vas **enseñando las respuestas** (una a
   una o todas); el concursante elige en su móvil (tú ves cuál) y la **marcas** cuando la dé por definitiva (se pone
   amarilla con letras negras; también puedes marcar otra si la dice en voz alta); luego **muestras la correcta**: verde.
   - **Comodines**, uno de cada para todo el concurso, por equipo (o por jugador sin equipos), y solo con las cuatro
     respuestas a la vista: **50:50** (quita dos incorrectas); **Público** (sus compañeros de equipo votan 15 s en sus
     móviles sin hablar; si hablan, lo anulas desde el mando; luego se ven los porcentajes); **Llamada** (el concursante
     elige a un compañero, que sale de la sala con su móvil y le llama; cuando digas «ya» desde el mando, corren 30 s
     con su reloj en la tele y su propia música).
   - Si el concursante sale de la app fuera de la llamada, aunque acierte no puntúa (puedes perdonarle).
   - En el teclado del portátil, Espacio: enseñar respuesta → marcar → mostrar la correcta → siguiente.
9. En las secciones de **respuestas** (Verdad o mentira, Dos verdades, Votación, Estimación) todos responden a
   la vez desde el móvil: «Abrir respuestas» → cuenta atrás (se cierra sola al acabar o cuando han respondido todos)
   → «Revelar» (respuesta correcta, recuento, quién suma) → «Siguiente pregunta». La primera respuesta es la buena.
   - **Votación**: nadie puede votarse; suman quienes votan al más votado (con empate, a cualquiera de los empatados).
   - **Estimación**: puntos por puestos según la columna Puntos (p. ej. 3,2,1); «Sin pasarse» deja fuera a quien se pasa.
   - **Dos verdades y una mentira**: el protagonista (su nombre debe coincidir con el de su jugador) no vota y suma
     1 punto por cada uno al que engaña.
   - En el móvil, la respuesta se elige con un toque y se **confirma tocando otra vez la misma**.
   - «Reiniciar pregunta» después de revelar quita los puntos que dio esa pregunta.
10. **Parar el contador**: «¡Empezar!» → cuenta atrás 3-2-1 → el reloj corre en la tele y en los móviles (visible, a
   ciegas o desaparece a los N segundos, según la fila) → cada uno pulsa STOP → «Revelar» ordena por cercanía al
   objetivo. Cuenta el instante exacto del toque con el reloj sincronizado.
11. **Duelo de reflejos**: «Poner en rojo» → entre 2 y 6 s después, al azar, todo se pone verde (tele y móviles a la
   vez) → gana la reacción más rápida. Quien pulsa en rojo queda fuera de esa ronda. En modo «Duelo», el presentador
   elige en el mando a los dos que juegan.
12. **Libre** («Fit o Fat»): cada fila es una prueba. En el mando marcas quién participa (jugadores o equipos, según
    la columna Participan) y la tele la presenta.
    - **Cronómetro**: «¡Empezar!» y, cuando alguien cae, «Eliminado» (con «Deshacer» por si te equivocas). Al caer el
      último se para solo. Gana quien más aguanta.
    - **Contador**: botones −/+ por participante y números en grande en la tele; «Parar» cuando acabe el tiempo.
    - **Contrarreloj** (p. ej. «Botellas en orden»): salen de uno en uno (el orden en que los marcas). «¡Empezar!» pone
      en marcha el reloj del primero; con «Piezas» (5 botellas), en cada intento tocas cuántas tiene bien (0…5) y la
      tele lo enseña con botellas encendidas; con todas bien, o «¡Lo tiene!», se para su reloj. Luego «▶ Empieza…» el
      siguiente. Gana el más rápido; quien se rinde no puntúa.
    - **Ninguna**: eliges al ganador directamente. Con **canción** (la bachata: columnas «Canción», «Desde», «Golpe» y
      «Silencio»), «¡Que suene la canción!» la pone: se calla «Silencio» segundos antes del golpe (3 si lo dejas
      vacío) y vuelve justo en el golpe. Regla: seguir bailando sin música y marcar el golpe a la vez que vuelve, y
      quedarse congelados 3 s; quien se adelanta, se retrasa o se mueve, no lo ha clavado. Tú marcas a quien sí.
      Para cada canción hay que escribir en «Golpe» su segundo exacto (escúchala).
    - El mando propone el ganador (puedes cambiarlo o marcar varios) y «Dar puntos»: a cada jugador o, si participan
      equipos, al equipo entero.
13. **Palabras secretas**: cada turno es de un equipo (se alternan; «Turnos por equipo» y «Segundos por turno» en
    Ajustes) y lo hace el siguiente de ese equipo, en el orden de su portavoz. Su móvil le enseña la tarjeta (palabra,
    modo y, en Tabú, las prohibidas) y pulsa «¡Empezar!»; luego «✓ ¡Acertada!» o «Pasar» con cada una. Su equipo
    adivina en voz alta; el **equipo rival** ve la misma tarjeta en sus móviles y pulsa **¡Tabú!** (o ¡Falta!) si hace
    trampa. La tele enseña el reloj, el modo y las que van saliendo, nunca la palabra en juego. Tú lo ves todo en el
    mando y puedes corregir (acertada, pasar, falta, deshacer). Cada acertada da los puntos de la sección al equipo.
    Modos: 🎭 Mímica, 🤐 Tabú, 🗣️ Descríbelo y 🎵 Tararéalo; las tarjetas no se repiten hasta que salen todas.
14. **Agita el móvil**: «¡Empezar!» → 3-2-1 → todos agitan el móvil durante los segundos de la fila; la tele enseña la
    carrera en directo (y el total de cada equipo). Gana quien más agite (puntos por puestos). En iPhone hay que tocar
    «Activar el sensor» la primera vez; sin sensor, se juega dando toques a la pantalla.
15. **La gran apuesta** (para el final): el portavoz de cada equipo (o cada uno, sin equipos) apuesta desde el móvil
    cuántos puntos se juega, entre 0 y los que tiene (mínimo 5). «Cerrar apuestas» → sale la pregunta y responden →
    «Revelar»: quien acierta gana lo apostado y quien falla lo pierde.
16. **Squid Games**: cinco juegos seguidos desde el móvil en los que la gente se va eliminando. Al empezar, cada uno
    lleva un número (alguien se lleva el 456). Cada eliminado mete los puntos de la sección en la hucha y, al final,
    los supervivientes se la reparten. Cada juego se empieza desde el mando (o Espacio) con una cuenta 3-2-1:
    - **Luz roja, luz verde**: en verde, mantén el botón para avanzar; en rojo, ni tocarlo ni moverte (el sensor del
      móvil lo nota; en iPhone, «Activar el sensor» antes de empezar). La tele dice «¡Luz roja!» en voz alta. Quien
      llega a la meta se salva; quien se mueve o no llega a tiempo, fuera.
    - **El panal**: cada uno elige un sobre (círculo, triángulo, estrella o paraguas) y repasa la forma con el dedo.
      Salirse agrieta la galleta: a la tercera grieta, rota y fuera. Quien no la termina a tiempo, también.
    - **El puente de cristal**: salen de uno en uno; izquierda o derecha en cada tramo. El que falla cae y el siguiente
      ya conoce ese tramo. Si no eliges en 15 s, te empujan. Cuando alguien llega, cruzan todos los que quedan.
    - **Tira y afloja**: dos bandos al azar; todos tocan lo más rápido que pueden (cuenta la media del bando). El bando
      que pierde, fuera entero.
    - **Canicas**: duelos de pares o nones con 10 canicas cada uno; quien se queda sin ninguna, fuera.
    - Nunca caen todos: si un juego fuera a dejar a todos fuera, se salvan los que mejor lo han hecho. En el mando ves
      lo secreto (el camino bueno del puente, cuántas canicas esconde cada uno), puedes elegir por quien tenga el
      móvil roto en el puente, terminar un juego antes y revivir o eliminar a mano entre juegos. R repite el juego.
    - En la pestaña **Squid** de la hoja eliges qué juegos y en qué orden, sus segundos y los tramos del puente.

En el móvil de cada concursante, bajo su nombre, se ve en qué sección está (nº de sección, tipo, pregunta y puntos en
juego) y su equipo con el puesto. Tocando sus puntos se abre el **marcador** (equipos y concursantes, en directo) sin
salir de lo que está pasando: «Volver al juego» lo cierra.

**Parar y seguir otro día:** **⏸ Parar por hoy** (en la barra de la tele o en el mando, pestaña Secciones). La tele
enseña «Continuará…» con el marcador y por dónde ibais, y los móviles «Concurso en pausa». Todo queda guardado en el
portátil y, mientras esté en pausa, no caduca: otro día, al abrir la tele, **▶ Seguir el concurso** (o Espacio en la
pantalla de pausa) y seguís justo donde lo dejasteis. Los jugadores vuelven con el mismo código y su mismo nombre: si
el móvil ha perdido sus datos (Safari los borra a los 7 días) o es otro móvil, la tele lo reconoce por el nombre y
sigue con sus puntos y su equipo. Para seguir en **otro ordenador**: **💾 Copia en archivo** y, allí, **📂 Seguir un
concurso guardado** (en la preparación) o **📂 Abrir una copia guardada** (al abrir la tele). Las canciones y las caras
no van en la copia: vuelve a leer la carpeta del concurso.

**Probar sin móviles:** en la barra de la tele (abajo; mueve el ratón si no se ve), **🤖 Pruebas**: «+1», «+5» o
«Llenar los huecos» mete concursantes de prueba («🤖 Lola», «🤖 Paco»…) con equipo, icono y color, y juegan solos al
azar: pulsan, responden, votan, eligen en el millonario, votan en el Público, ordenan su equipo si son portavoces y
cuentan en Libre, hacen mímica (y a veces pitan falta), agitan, apuestan y votan castigos. Con «Responden solos» apagado, solo lo hacen al pulsar «¡Responded ya!». «Quitarlos» los saca.
Tú llevas el concurso como siempre, desde el teclado o el mando.

El mando tiene cuatro pestañas: **Juego** (lo que toca ahora), **Jugadores** (puntos ±, puntos de equipo, mover de
equipo, quitar), **Secciones** (saltar a cualquiera) y **🎮 Jugar**: para jugar tú también con el mismo móvil (no abras
la página de jugador en otra pestaña: el móvil congela la que no ves y se desconecta). Solo juegas en las secciones con
«El presentador juega» (por defecto Votación, Contador, Reflejos y Libre); en las demás, como ves las respuestas, tu
móvil dice «🎤 Presentas» y la tele no cuenta contigo (ni en los turnos ni en el millonario).

Teclado del portátil (por si el mando falla): **Espacio** (abrir turno / siguiente), **← →**, **P** pregunta,
**V** respuesta, **A** acierto, **F** fallo, **R** reiniciar, **M** marcador, **D** depuración. En **Ajustes** se
cambian el umbral de casi empate, la ventana de decisión y la apertura programada.

## Justicia en los tiempos

Cada móvil tiene una conexión distinta: uno puede tardar 5 ms en hacer llegar su pulsación y otro 150 ms
(los móviles en ahorro de energía responden lento a la wifi). Si ganara quien **llega** antes, ganaría el de mejor
conexión. Por eso:

1. **Sincronización de relojes.** Al conectar, cada 15 s y al volver a primer plano, el móvil intercambia mensajes con
   el presentador al estilo NTP: anota cuándo sale cada mensaje y cuándo vuelve, y el presentador cuándo llega y
   cuándo contesta. Con 10 muestras se queda con las 3 más rápidas (las que no se han quedado esperando en la red) y
   calcula la diferencia entre los dos relojes (*offset*).
2. **La pulsación lleva su hora.** El móvil manda el instante exacto en que el dedo tocó la pantalla
   (`event.timeStamp`), traducido al reloj del presentador.
3. **Ventana de decisión.** El presentador espera 150 ms tras la primera pulsación que llega antes de declarar
   ganador, para que entren pulsaciones anteriores que viajaban más despacio. Luego ordena por la hora de pulsación.
4. **Apertura programada.** «Abrir turno» se programa 300 ms en el futuro y cada móvil lo traduce a su reloj: la tele
   y todos los móviles cambian a «¡Pulsad!» a la vez, sin que el de peor conexión lo vea más tarde.

### Límites y margen de error

| Fuente de error | Magnitud típica | ¿Se corrige? |
|---|---|---|
| Asimetría de la red al sincronizar (ida ≠ vuelta) | wifi: ±1–5 ms (peor caso ±10 ms) | Se acota: el error nunca supera la mitad del RTT de la mejor muestra; el panel D lo muestra por jugador |
| **Pantalla táctil y sistema** (del dedo al evento) | 10–60 ms, distinto en cada modelo | **No**: el navegador no puede saberlo. Es la mayor fuente de error |
| Resolución del reloj del navegador | 0,1–1 ms | Despreciable |
| Deriva entre relojes | < 1 ms entre resincronizaciones | Sí (resincronización cada 15 s) |
| Móvil bloqueado / app en segundo plano | El reloj puede pararse | Resincroniza al volver |
| Pulsación que llega más de 150 ms tarde | Rara en wifi | Entra en la lista, pero no quita el puesto al ganador; el panel D la marca |

**En la práctica:** con todos en la misma wifi, el orden es fiable cuando la diferencia supera **30–50 ms**. Por
debajo de eso decide más el hardware de cada móvil que el jugador: por eso se marca «casi empate» por debajo de
30 ms. Sin sincronizar, ordenando por llegada, el sesgo entre un móvil rápido y uno lento era de 50–200 ms.

### ¿Se puede hacer trampa?

Sí, y es fácil para quien sepa programar: la hora de la pulsación la pone el móvil. Abriendo la página de jugador
en un ordenador, con una línea en la consola del navegador se puede enviar una pulsación con la hora adelantada.
El presentador **recorta** lo físicamente imposible (una pulsación anterior a su llegada en más de 250 ms o del
doble del RTT, o posterior a su llegada), así que la ventaja máxima de un tramposo queda en unos 250 ms, y el panel
D marca esas pulsaciones como «recortadas». Impedirlo del todo es imposible sin confiar en el reloj del móvil:
lo único que no se puede falsear es el orden de llegada, que es justo lo que no es justo. Entre amigos, suficiente.

## Requisitos

- Node.js 22.12 o superior (probado con 24 LTS) y Git.
- Portátil y móviles **en la misma wifi** (no la de invitados: suele aislar los dispositivos). Si un móvil se queda
  en «Conectando…», el propio móvil y la tele dicen por qué. Si la wifi no deja la conexión directa, hace falta un
  servidor TURN (repetidor): los gratuitos de PeerJS ya no existen; se pone uno propio en `src/shared/peerConfig.js`.
- Navegadores actuales: Chrome, Safari (iOS 16.4+) o Firefox.

## Probar en local

```bash
npm install
```

```bash
npm run dev
```

Vite muestra dos direcciones:

```
➜  Local:   https://localhost:5173/
➜  Network: https://192.168.1.50:5173/
```

1. En el portátil abre **la dirección Network** + `host.html` (por ejemplo `https://192.168.1.50:5173/host.html`).
   No uses `localhost`: el QR apuntaría a `localhost` y los móviles no podrían abrirlo.
2. El navegador avisará de que el certificado no es de confianza (es autofirmado, lo genera
   `@vitejs/plugin-basic-ssl`). Pulsa «Configuración avanzada → Continuar».
3. En el móvil escanea el QR. Saldrá el mismo aviso de certificado: acéptalo (Chrome: «Configuración avanzada →
   Acceder»; Safari: «Mostrar detalles → visitar este sitio web»).
4. Elige nombre, color e icono y pulsa **Entrar**. Debe aparecer en la tele con su latencia.

¿Por qué HTTPS? Los móviles solo permiten Wake Lock y otras API en contexto seguro, y `localhost` no sirve
desde otro dispositivo.

Si Windows pregunta por el firewall al arrancar Vite, permite el acceso en **redes privadas**.

Para probar sin móvil: abre `host.html` en una pestaña y la dirección del QR en otras. Dos pestañas del mismo
navegador serían el mismo jugador (comparten localStorage), así que añade `&perfil=2`, `&perfil=3`… a la dirección
de cada pestaña de jugador. Si solo vas a usar el portátil, `npm run dev:http` arranca sin certificado en
`http://localhost:5174/host.html`.

### Tests

```bash
npm test
```

Cubren la lógica que no depende de la red (`src/core`, `src/shared`).

### Qué probar en la fase 3

- Abrir el panel **D**: cada jugador debe mostrar «Error sinc.» de pocos ms y 10 o más muestras.
- Pulsar con dos móviles casi a la vez: en el panel, «Pulsó» decide el orden aunque «Llegó» diga otra cosa.
- Bloquear un móvil, desbloquearlo y comprobar que vuelve a sincronizar (las muestras empiezan de nuevo).

### Qué probar en la fase 2

- Abrir turno, pulsar con dos móviles casi a la vez y ver el orden y el «casi empate».
- Fallo → rebote: el que falló queda bloqueado y los demás vuelven a pulsar.
- Pulsar en «Pregunta en el aire»: queda bloqueado esa pregunta.
- Quitar la wifi a un móvil en mitad de una pregunta y devolvérsela.

### Qué probar en la fase 1

- Entrar con 2+ móviles; nombres repetidos («Ana (2)») y la misma pareja color+icono (se asigna otra).
- Botones +/− del marcador y ✕ para quitar a alguien.
- Bloquear el móvil o cambiar de app y volver: debe reconectar solo y conservar los puntos.
- Recargar la página del presentador: recupera la sala y los móviles vuelven solos (puede tardar unos segundos
  mientras el servidor de PeerJS libera el código).
- Apagar la wifi del portátil: aparece el aviso de servidor de enlace.

## Desplegar en GitHub Pages

1. Crea un repositorio vacío en GitHub (por ejemplo `concurso`), sin README.
2. Conecta y sube el código:

   ```bash
   git remote add origin https://github.com/TU_USUARIO/concurso.git
   ```

   ```bash
   git push -u origin main
   ```

3. En GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
4. Cada push a `main` ejecuta `.github/workflows/deploy.yml` (tests + build + publicación). Al terminar, la web
   queda en `https://TU_USUARIO.github.io/concurso/`:
   - Presentador: `https://TU_USUARIO.github.io/concurso/host.html`
   - Jugadores: escanean el QR o abren `https://TU_USUARIO.github.io/concurso/` y escriben el código.

## Espectáculo: imagen y sonido

- Cada sección tiene su **entorno de Halloween** animado en la tele (y sus colores de fondo en los móviles); entre
  secciones el decorado se funde en otro.
- **Fluidez:** la tele mide cómo de fluida va y, si el portátil no llega, simplifica sola el fondo (menos resolución,
  menos fotogramas), quita el desenfoque de los cristales y echa menos confeti; si va sobrada, vuelve a subir. En
  **Ajustes → Imagen de la tele** se puede fijar «Siempre la mejor» o «Ligera». Con **D** (depuración) se ven los
  fotogramas por segundo y la calidad. Todo (letras, sonidos, música generada) ya es local: no se descarga nada
  durante el concurso; lo que cuesta es dibujar, no descargar.
- **Presentar el concurso**: el título en grande con su canción; luego se conecta la gente y, al empezar, «Equipo A
  contra equipo B» (cada equipo entra por su lado con su gente). Después, una **introducción**: las secciones de la
  noche, cómo se juega y los equipos.
- **Antes de cada pregunta**, una breve explicación (tiempo, puntos) y una **cuenta atrás 3-2-1** en la tele y en los
  móviles. Se ajusta en **Ajustes** («Cuenta atrás antes de cada pregunta», 0 = sin ella).
- **Música:** cambia según el momento (preparación, presentación, jugando, pregunta abierta, suspense, revelado,
  marcador y final) y el entorno de la sección. **Tus canciones:** en la preparación, botón **🎵 Música**. Cada hueco dice
  dónde suena; arrastra el .mp3 encima o pulsa «Examinar…». Hay huecos para todo el concurso y, por cada sección,
  huecos propios (p. ej. la música del millonario solo en el Test). Puedes poner varias: se alternan. Se guardan solo
  en ese portátil; donde no pongas ninguna suena la general o la música generada. Además hay efectos (pulsar, acierto,
  fallo, tictac, redoble, fanfarria…).
- **Salidas de la app en el mando:** cada vez que un concursante minimiza el navegador o cambia de app o de pestaña,
  tu mando te avisa arriba («👀 Ana ha salido de la app») y vibra, y otra vez al volver («↩️ Ana ha vuelto · 12 s
  fuera»). En rojo si tenía una pregunta en juego. En **Juego** ves quién está fuera ahora, y en **Jugadores** el
  recuento: cuántas veces ha salido cada uno, cuántas con pregunta y cuánto tiempo en total («Borrar recuento» lo pone a 0).
- **Antitrampas:** si alguien sale de la app del móvil (para buscar en Google, cambiar de app o de pestaña…) con una
  pregunta abierta y sin responder más de 1,5 s, su respuesta en esa pregunta no cuenta (en el pulsador, queda
  bloqueado), y sale un aviso grande en la tele y en el mando, donde se le puede **perdonar**. Mientras está fuera, su
  tarjeta dice «👀 Fuera de la app». En **Ajustes** se puede dejar solo en aviso o quitarlo.
- **Por turnos** (columna «Por turnos» de la pestaña Concurso, para Verdad o mentira, Estimación y Contador; el Test
  siempre va por turnos, un concursante cada vez): cada pregunta la responde uno de cada equipo. Antes de empezar el concurso elige el **portavoz** de cada equipo con 📣 en la pantalla de preparación
  (o en el mando, pestaña Jugadores). Al presentar la sección, cada portavoz ordena a su equipo en su móvil, de la
  pregunta más fácil a la más difícil, y la tele enseña quién ya ha ordenado. En cada pregunta, la tele dice quién
  responde y los demás ven «¡sin soplar!».
- **Carpeta del concurso:** en la preparación, **📁 Elegir la carpeta del concurso**. Una carpeta del portátil con:
  la hoja (.xlsx), `Millonario/` (sus 7 canciones), `Caras/` (una foto por persona, «Rodri, Rodrigo.jpg») y
  `Música/<Momento>/` o `Música/<Sección>/<Momento>/` (momentos con el nombre de la ventana de música) y `Canciones/`
  (las de las pruebas: «¿Qué canción es?», la bachata; con el nombre que pone la hoja). La tele lo copia
  todo al portátil y recuerda la carpeta (Chrome y Edge): luego basta **📁 Volver a leer**. Si se pierde la sala o se
  crea otra, las canciones y las caras siguen ahí. Esa carpeta no va al repositorio, que es público.
- **Canciones del millonario** (todas las secciones de Test): tema del programa, explicación, pregunta fácil, media y
  difícil, preguntar al equipo y llamar a alguien. Están sincronizadas: el tema suena al presentar la sección; la
  explicación, en «Cómo se juega» (la pantalla que sale tras el título); las de pregunta (por tercios: fácil, media,
  difícil) hacen su intro y luego un bucle que no se nota, al marcar saltan al golpe de «respuesta definitiva» y a un
  bucle de suspense, y al acertar al golpe final (al fallar, silencio). La del público empieza donde hace falta para
  que su golpe caiga al acabar los 15 s; la de la llamada espera en bucle y, con el «ya», su golpe final cae a los 30 s.
  En **🎵 Música** se escucha cada punto con «▶». Sin ellas suena la música generada.
  Si algún golpe o empalme no cae justo, **⏱ Ajustar tiempos** en esa canción: cada punto con su valor en segundos,
  «−0,1 / +0,1» y «▶», que suena desde 2 s antes con una cuenta «2… 1… ¡Ahora!» (en «¡Ahora!» tiene que sonar el
  golpe). Se guarda en el portátil; «↺» vuelve al valor de partida y «📋 Copiar ajustes» te los da en texto para que
  queden fijos para siempre.
- **Otras canciones:** en **🎵 Música** hay huecos por sección y efectos que suenan una vez (respuesta definitiva,
  acierto, fallo y cada comodín). Si pones varias canciones en «Jugando», «Pregunta abierta» o «Suspense» de una
  sección, van en escalera: la 1ª en la 1ª pregunta, la 2ª en la 2ª… (por orden de nombre: «1 - …», «2 - …»).
- **Caras:** en la preparación, botón **🙂 Caras**: suelta una foto por persona. El nombre del archivo da los nombres con
  que se le reconoce, separados por comas («Rodri, Rodrigo.jpg»), y se pueden cambiar ahí. Quien entre con uno de esos
  nombres (da igual mayúsculas y tildes) juega con su cara; si no, elige icono y color. Las fotos se guardan solo en ese
  portátil.
- **En el móvil:** al entrar se pide el código y el nombre. Con ✏️ se cambia el nombre (solo antes de empezar el
  concurso), el icono y el equipo, y está «Salir y entrar en otra sala».
- El navegador no deja sonar nada hasta que se toca la página: si la tele se recarga, aparece **🔊 Activar sonido**
  hasta la primera tecla o clic en el portátil. Música, efectos y volumen: **Ajustes** (tele) o el mando, pestaña
  **Secciones**.
- **Libre con contador** (flexiones…): el móvil de quien participa muestra **+1 / −1** para ir sumando. Con equipos,
  antes de empezar eliges en el mando quién cuenta por cada equipo: solo su móvil tendrá los botones. El presentador
  puede corregir desde el mando.
- **Duelo de reflejos con trampas:** la primera ronda es la clásica (pulsa en verde). Después: «pulsa solo cuando salga
  el AZUL» (o el morado) con colores trampa antes, ¡verde incluido!, o una araña: mientras esté no se pulsa, a ratos se
  asoma y vuelve, y cuando se va, ¡a pulsar!
- **Test como «¿Quién quiere ser millonario?»**: plató con focos, respuestas alargadas «A: B: C: D:» como en el
  programa, iconos de los comodines y el reloj redondo de la llamada.
- **Puntos después del suspense:** al revelar, los marcadores no se mueven hasta que la tele enseña quién ha acertado o
  ganado (y el móvil dice «Mira la tele» mientras).
- **Revelados con suspense:** en Verdad o mentira, redoble y «Y la respuesta correcta es…» antes de iluminar la
  buena. En Estimación, Votación, Contador y Reflejos, tras el redoble los puestos aparecen del último al primero;
  el ganador sale el último, con golpe y confeti. El marcador parte de cómo estaba la última vez, los puntos ruedan y
  las filas se reordenan. Al final, podio 3º → 2º → 1º con fanfarria.
- Los móviles mantienen la pantalla encendida mientras la página está abierta (si el navegador lo permite).
- Si el sistema tiene activado «reducir movimiento», las animaciones se quitan.

## Cómo funciona

Ver [CLAUDE.md](CLAUDE.md) para las decisiones, el protocolo de mensajes y el algoritmo de sincronización.

- El presentador registra en el servidor público de PeerJS el ID `concurso-del-ano-v1-<CÓDIGO>`; los móviles se
  conectan a ese ID. Después la comunicación es directa (P2P) dentro de tu wifi.
- Si el servidor de PeerJS cae, las conexiones ya abiertas siguen funcionando; solo no puede entrar gente nueva.
