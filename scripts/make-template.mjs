// Genera public/plantilla-concurso.xlsx: la plantilla que rellena el presentador.
// Uso: npm run plantilla   (hay un test que comprueba que la plantilla se lee sin errores)
//
// Pensada para rellenarla sin leer instrucciones: debajo de cada título, una fila azul explica la columna (empieza por
// «↳» y la lectura la salta); desplegables donde hay opciones; la respuesta buena se pinta de verde; la columna
// «Sección» de las preguntas va al final y vacía vale (= la única sección de ese tipo).
import ExcelJS from 'exceljs';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { COLORS } from '../src/shared/appearance.js';
import { ENVIRONMENTS } from '../src/shared/environments.js';

const OUT = resolve(import.meta.dirname, '../public/plantilla-concurso.xlsx');
const HELP = '↳ '; // marca de la fila de ayuda (src/core/show.js la salta)
const FIRST = 3; // primera fila de datos (1 = títulos, 2 = ayuda)
const ROWS = 200; // filas con desplegables y formato
const SECTION_LIST = `Concurso!$B$${FIRST}:$B$100`;

const yesNo = ['Sí', 'No'];

/** Tipos de sección: nombre en el desplegable, pestaña de sus preguntas y qué es (para «Empieza aquí»). */
const TYPES = [
  { type: 'Pulsador', sheet: 'Pulsador', what: 'El primero que pulse responde en voz alta; tú das acierto o fallo. Puede sonar una canción («¿Qué canción es?»).' },
  { type: 'Test', sheet: 'Test', what: '«¿Quién quiere ser millonario?»: uno cada vez, 4 respuestas y comodines.' },
  { type: 'Verdad o mentira', sheet: 'Verdad o mentira', what: 'Una afirmación; todos responden a la vez desde el móvil.' },
  { type: 'Dos verdades y una mentira', sheet: 'Dos verdades', what: 'Tres frases sobre un jugador; los demás buscan la falsa.' },
  { type: 'Votación', sheet: 'Votación', what: '«¿Quién es más probable que…?»: todos votan a un jugador.' },
  { type: 'Estimación', sheet: 'Estimación', what: 'Cada uno escribe un número; gana el más cercano.' },
  { type: 'Parar el contador', sheet: 'Contador', what: 'Parar el reloj lo más cerca posible de un tiempo.' },
  { type: 'Duelo de reflejos', sheet: 'Reflejos', what: 'Rojo… ¡verde! Gana el más rápido en pulsar.' },
  { type: 'Libre', sheet: 'Libre', what: 'Pruebas físicas: cronómetro, contador, contrarreloj (las botellas) o nota del 1 al 10 (marcar el golpe bailando); tú das los puntos.' },
  { type: 'Palabras secretas', sheet: 'Palabras', what: 'Mímica, Tabú, descríbelo o tararéalo: uno del equipo la hace y los suyos adivinan.' },
  { type: 'Agita el móvil', sheet: 'Agitar', what: 'Carrera: gana quien más agite el móvil en los segundos que digas.' },
  { type: 'La gran apuesta', sheet: 'Apuesta', what: 'Para el final: cada equipo apuesta sus puntos y luego responde.' },
  { type: 'Squid Games', sheet: 'Squid', what: 'Juegos seguidos desde el móvil en los que la gente se va eliminando; los supervivientes se reparten la hucha.' },
];

// Formato que se repite
const fill = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
const DARK = 'FF232946';
const HELP_FILL = 'FFDDEBFF';
const GOOD = { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFC8E6C9' } }, font: { bold: true, color: { argb: 'FF1B5E20' } } };
const BAD = { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFFCDD2' } }, font: { bold: true, color: { argb: 'FFB71C1C' } } };
const MID = { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFFF3C4' } }, font: { bold: true, color: { argb: 'FF8D6E00' } } };

/** La columna «Sección» de las pestañas de preguntas (al final: casi nunca hace falta). */
const sectionCol = {
  title: 'Sección',
  width: 22,
  list: SECTION_LIST,
  help: 'Vacía = la única sección de este tipo. Si hay varias, elige a cuál va cada fila.',
};

/**
 * Cada hoja: columnas {title, width, help (fila azul), list?: valores o rango, wrap?} y filas de ejemplo.
 * `cf` = reglas de formato condicional {col, when, style} (when = fórmula con {r} = fila).
 */
const SHEETS = [
  {
    name: 'Concurso',
    tab: 'FFFFD400',
    columns: [
      { title: 'Orden', width: 7, help: '1, 2, 3… (orden de juego)' },
      { title: 'Se juega', width: 9, list: yesNo, help: 'No = sale sin marcar en «¿Qué juegos jugamos?» (se activa en la tele).' },
      { title: 'Sección', width: 26, help: 'Nombre que verá todo el mundo en la tele. Sin repetir.' },
      { title: 'Tipo', width: 26, list: TYPES.map((t) => t.type), help: 'Elige en el desplegable qué juego es.' },
      { title: 'Sus preguntas, en la pestaña', width: 22, help: 'Se rellena sola: ahí escribes sus preguntas.', formula: true },
      { title: 'Descripción', width: 46, wrap: true, help: 'Opcional: una frase que sale en la tele al presentarla.' },
      {
        title: 'Puntos',
        width: 10,
        help: 'Por acierto (p. ej. 1). Por puestos: 3,2,1. Test: fácil, media, difícil (2,5,10). Palabras: por palabra. Squid: lo que mete cada eliminado en la hucha.',
      },
      { title: 'El presentador juega', width: 12, list: yesNo, help: 'Vacío = lo normal del tipo.' },
      { title: 'Por turnos', width: 11, list: yesNo, help: 'Sí = uno de cada equipo por pregunta (Verdad, Estimación, Contador).' },
      { title: 'Entorno', width: 20, list: ENVIRONMENTS.map((e) => e.name), help: 'Opcional: decorado de la tele.' },
    ],
    rows: [
      // Todos los juegos; los de «No» quedan en reserva (se marcan en la preparación de la tele si apetecen).
      // Se alternan juegos de móvil y pruebas físicas.
      [1, 'No', 'Calentamiento', 'Pulsador', null, 'El primero que pulse, responde. ¡Ojo con pulsar antes de tiempo!', 1, 'No'],
      [2, 'Sí', 'Cultura general', 'Test', null, '¿Quién quiere ser millonario? Uno cada vez; vuestro portavoz decide el orden.', '2,5,10', null, null],
      [3, 'No', '¿Verdad o mentira?', 'Verdad o mentira', null, '¿Te lo crees o no? Todos a la vez.', 1, null],
      [4, 'Sí', 'Palabras secretas', 'Palabras secretas', null, 'Mímica, Tabú y canciones: haz que tu equipo adivine todas las que pueda.', 1, null],
      [5, 'Sí', '¿Quién es más probable…?', 'Votación', null, 'Votad sin piedad.', 1, null],
      [6, 'Sí', 'Guerra de globos', 'Libre', null, 'Tres de cada equipo, con un globo atado al tobillo: ¡explotad los del equipo contrario!', 3, null],
      [7, 'No', 'Calcula', 'Estimación', null, 'El que más se acerque. En algunas, sin pasarse.', '3,2,1', null],
      [8, 'Sí', 'Agita el móvil', 'Agita el móvil', null, '¡Agita hasta que te duela el brazo!', '3,2,1', 'Sí'],
      [9, 'Sí', '¿Qué canción es?', 'Pulsador', null, 'Suena una canción: el primero que pulse, responde.', 2, 'No'],
      [10, 'Sí', 'Reloj interno', 'Parar el contador', null, 'Para el reloj lo más cerca posible del objetivo.', '3,2,1', null],
      [11, 'Sí', 'Twerking de pimpón', 'Libre', null, 'Caja con pelotas a la cadera, por la espalda: ¡sácalas todas a golpe de twerking antes que tu rival!', 3, null],
      [12, 'Sí', 'Reflejos', 'Duelo de reflejos', null, 'Cuando se ponga en verde… ¡pulsa!', '3,2,1', null],
      [13, 'Sí', 'Marca el golpe', 'Libre', null, 'Suena la canción: bailad y marcad el golpe a la vez. El presentador da a cada uno una nota del 1 al 10.', 2, null],
      [14, 'Sí', 'Dos verdades y una mentira', 'Dos verdades y una mentira', null, '¿Cuál es la mentira?', 1, null],
      [15, 'Sí', 'La galleta', 'Libre', null, 'Con las manos atadas a la espalda: el primero que se coma la galleta, gana.', 3, null],
      [16, 'Sí', 'Botellas en orden', 'Libre', null, 'Adivina el orden de las 5 botellas: en cada intento te decimos cuántas están bien. Gana el más rápido.', 5, null],
      [17, 'Sí', 'Fit o Fat', 'Libre', null, 'Pruebas físicas.', 3, 'Sí', null, 'Noche de luna'],
      [18, 'Sí', 'Squid Games', 'Squid Games', null, 'Cinco juegos seguidos: quien falla, fuera. Los que sobreviven se reparten la hucha.', 3, null],
      [19, 'Sí', 'La gran apuesta', 'La gran apuesta', null, 'Apostad lo que tenéis. Aquí se decide todo.', null, null],
    ],
    // Las que no se juegan, en rojo (de un vistazo)
    cf: [
      { col: 2, when: '$B{r}="No"', style: BAD },
      { col: 3, when: '$B{r}="No"', style: BAD },
    ],
  },
  {
    name: 'Equipos',
    tab: 'FF1E63D6',
    columns: [
      { title: 'Equipo', width: 26, help: 'Un equipo por fila. Borra todas para jugar sin equipos.' },
      { title: 'Color', width: 14, list: COLORS.filter((c) => c.id !== 'gris').map((c) => c.name), help: 'Opcional. Cada equipo, uno distinto.' },
    ],
    rows: [
      ['Zombies', 'Rojo'],
      ['Hombres Lobo', 'Azul'],
    ],
  },
  {
    name: 'Ajustes',
    tab: 'FF616161',
    columns: [
      { title: 'Ajuste', width: 30, help: 'No cambies esta columna.' },
      { title: 'Valor', width: 22, help: 'Cambia solo esta.' },
      { title: 'Qué hace', width: 70, wrap: true, help: 'Solo para leer.' },
    ],
    rows: [
      ['Título del concurso', 'El concurso del año', 'Sale en la tele (portada, título) y en los móviles.'],
      ['Comodín 50 %', 1, 'Millonario: cuántos 50:50 tiene cada equipo (o cada jugador sin equipos).'],
      ['Comodín Llamada', 1, 'Millonario: cuántas llamadas a un compañero.'],
      ['Comodín Público', 1, 'Millonario: cuántas veces puede votar su equipo.'],
      ['Puntos por defecto', 1, 'Los de una sección sin nada en «Puntos».'],
      ['Puntos por fallo', 0, 'En el Pulsador, lo que se resta al fallar (0 = nada; −1 = resta uno).'],
      ['Bloquear si pulsa antes', 'Sí', 'Pulsador: quien pulsa antes de tiempo se queda sin pulsar esa pregunta.'],
      ['Segundos por pregunta', 20, 'Tiempo para responder en Verdad o mentira, Votación… (la Estimación tiene 10 más).'],
      ['Segundos por turno (Palabras)', 60, 'Palabras secretas: cuánto dura cada turno.'],
      ['Turnos por equipo (Palabras)', 3, 'Palabras secretas: cuántas veces sale cada equipo (cada vez, otro de sus jugadores). Mejor 3 como mucho.'],
    ],
  },
  {
    name: 'Pulsador',
    tab: 'FFE53935',
    columns: [
      { title: 'Pregunta', width: 50, wrap: true, help: 'Lo que lees en voz alta (y sale en la tele si quieres).' },
      { title: 'Respuesta', width: 30, wrap: true, help: 'Solo la ves tú, en tu móvil.' },
      { title: 'Mostrar en tele', width: 10, list: yesNo, help: 'Vacío = sí.' },
      { title: 'Notas', width: 30, wrap: true, help: 'Solo para ti.' },
      { title: 'Canción', width: 20, help: 'Opcional: nombre del archivo en «Canciones» (sin .mp3), p. ej. Adivina Cancion n1. Suena al abrir el turno.' },
      { title: 'Desde (s)', width: 9, help: 'Segundo de la canción por el que empieza. Vacío = 0.' },
      sectionCol,
    ],
    // ¿Qué canción es?: la tele pone la canción al «¡Pulsad!», la para cuando alguien pulsa y sigue si falla.
    rows: [
      ['¿Cuántas patas tiene una araña?', 'Ocho', 'Sí', null, null, null, 'Calentamiento'],
      ['¿Qué día se celebra Halloween?', 'El 31 de octubre', 'Sí', null, null, null, 'Calentamiento'],
      ['¿Qué hortaliza se vacía para hacer la linterna de Halloween?', 'La calabaza', 'Sí', null, null, null, 'Calentamiento'],
      ['¿Qué dicen los niños al llamar a las puertas en Halloween?', '¿Truco o trato?', 'Sí', null, null, null, 'Calentamiento'],
      ['¿Cómo se llama el conde vampiro de la novela de Bram Stoker?', 'Drácula', 'Sí', null, null, null, 'Calentamiento'],
      ['¿De qué metal tiene que ser la bala para matar a un hombre lobo?', 'De plata', 'Sí', null, null, null, 'Calentamiento'],
      ['¿Cuál es el río más largo de la península ibérica?', 'El Tajo', 'Sí', 'El Ebro es el más largo que va entero por España', null, null, 'Calentamiento'],
      ['¿Cómo se llama el científico que crea al monstruo en la novela de Mary Shelley?', 'Víctor Frankenstein', 'Sí', 'El monstruo no tiene nombre', null, null, 'Calentamiento'],
      ['¿Qué fiesta celta, de origen irlandés, dio lugar a Halloween?', 'Samhain', 'Sí', 'Vale «la de los celtas» si lo explican', null, null, 'Calentamiento'],
      ['🎵 ¿Qué canción es?', 'Thriller (Michael Jackson)', 'Sí', 'Archivo «Adivina Cancion n1» en «Canciones/Adivina la canción»', 'Adivina Cancion n1', 0, '¿Qué canción es?'],
      ['🎵 ¿Qué canción es?', 'Despacito (Luis Fonsi)', 'Sí', 'Archivo «Adivina Cancion n2»', 'Adivina Cancion n2', 0, '¿Qué canción es?'],
      ['🎵 ¿Qué canción es?', 'Macarena (Los del Río)', 'Sí', 'Archivo «Adivina Cancion n3»', 'Adivina Cancion n3', 0, '¿Qué canción es?'],
    ],
  },
  {
    name: 'Test',
    tab: 'FF2E7D32',
    columns: [
      { title: 'Pregunta', width: 46, wrap: true, help: 'La pregunta tal cual.' },
      { title: 'A', width: 20, wrap: true, help: 'Respuesta A' },
      { title: 'B', width: 20, wrap: true, help: 'Respuesta B' },
      { title: 'C', width: 20, wrap: true, help: 'C (opcional)' },
      { title: 'D', width: 20, wrap: true, help: 'D (opcional)' },
      { title: 'Correcta', width: 10, list: ['A', 'B', 'C', 'D'], help: 'Letra: se pinta de verde' },
      { title: 'Dificultad', width: 11, list: ['Fácil', 'Media', 'Difícil'], help: 'Música y puntos. Vacía = por orden.' },
      { title: 'Imagen', width: 30, help: 'Opcional: dirección web (https://…).' },
      sectionCol,
    ],
    // Millonario: fáciles, medias y difíciles por orden (con dos equipos, se alternan: cada equipo tiene de todas).
    rows: [
      ['¿Cuántos lados tiene un hexágono?', 'Cinco', 'Seis', 'Siete', 'Ocho', 'B', 'Fácil'],
      ['¿Qué usan las brujas de los cuentos para volar?', 'Una escoba', 'Una alfombra', 'Un paraguas', 'Una nube', 'A', 'Fácil'],
      ['¿Qué planeta es conocido como «el planeta rojo»?', 'Venus', 'Marte', 'Júpiter', 'Mercurio', 'B', 'Fácil'],
      ['¿Qué animal es Simba en «El rey león»?', 'Un tigre', 'Un guepardo', 'Un león', 'Un lobo', 'C', 'Fácil'],
      ['¿En qué año llegó el hombre a la Luna?', '1965', '1969', '1972', '1975', 'B', 'Media'],
      ['¿Cuál es el planeta más grande del sistema solar?', 'Saturno', 'Neptuno', 'Júpiter', 'Urano', 'C', 'Media'],
      ['¿Quién escribió «Frankenstein»?', 'Bram Stoker', 'Mary Shelley', 'Edgar Allan Poe', 'H. P. Lovecraft', 'B', 'Media'],
      ['¿Quién dirigió la película «Psicosis» (1960)?', 'Stanley Kubrick', 'Steven Spielberg', 'John Carpenter', 'Alfred Hitchcock', 'D', 'Media'],
      ['¿Cuál es la capital de provincia española que está a más altitud?', 'Cuenca', 'Soria', 'Teruel', 'Ávila', 'D', 'Difícil'],
      ['¿Qué elemento químico tiene el símbolo W?', 'Wolframio', 'Vanadio', 'Osmio', 'Teluro', 'A', 'Difícil'],
      ['¿Cuántos huesos tiene el cuerpo de un adulto?', '186', '206', '226', '256', 'B', 'Difícil'],
      ['¿En qué año se estrenó «La noche de Halloween», de John Carpenter?', '1974', '1978', '1982', '1986', 'B', 'Difícil'],
    ],
    cf: [
      ...['A', 'B', 'C', 'D'].map((l, i) => ({ col: 2 + i, when: `$F{r}="${l}"`, style: GOOD })), // respuestas: columnas B a E
      { col: 7, when: '$G{r}="Fácil"', style: GOOD },
      { col: 7, when: '$G{r}="Media"', style: MID },
      { col: 7, when: '$G{r}="Difícil"', style: BAD },
    ],
  },
  {
    name: 'Verdad o mentira',
    tab: 'FF00ACC1',
    columns: [
      { title: 'Afirmación', width: 60, wrap: true, help: 'Una frase que puede ser verdad o mentira.' },
      { title: 'Respuesta', width: 12, list: ['Verdad', 'Mentira'], help: 'Elige' },
      sectionCol,
    ],
    rows: [
      ['Los pulpos tienen tres corazones.', 'Verdad'],
      ['La Gran Muralla China se ve desde el espacio a simple vista.', 'Mentira'],
      ['Los murciélagos son ciegos.', 'Mentira'],
      ['Para los botánicos, la calabaza es una fruta.', 'Verdad'],
      ['La miel bien cerrada no se estropea nunca.', 'Verdad'],
      ['En Japón y en Escocia, un gato negro trae buena suerte.', 'Verdad'],
      ['Bram Stoker viajó a Transilvania para escribir «Drácula».', 'Mentira'],
      ['Un rayo nunca cae dos veces en el mismo sitio.', 'Mentira'],
    ],
    cf: [
      { col: 1, when: '$B{r}="Verdad"', style: GOOD },
      { col: 1, when: '$B{r}="Mentira"', style: BAD },
    ],
  },
  {
    name: 'Dos verdades',
    tab: 'FF8E24AA',
    columns: [
      { title: 'Sobre quién', width: 16, help: 'Un jugador (su nombre, como entre: no vota) o un personaje famoso.' },
      { title: 'Frase 1', width: 34, wrap: true, help: 'Tres frases…' },
      { title: 'Frase 2', width: 34, wrap: true, help: '…dos verdad…' },
      { title: 'Frase 3', width: 34, wrap: true, help: '…y una mentira.' },
      { title: 'Mentira', width: 9, list: ['1', '2', '3'], help: 'Nº de la falsa: se pinta de rojo' },
      sectionCol,
    ],
    rows: [
      ['Ana', 'He saltado en paracaídas.', 'Hablo japonés.', 'Tengo tres hermanos.', 2],
      ['Drácula (la novela)', 'Puede convertirse en lobo y en murciélago.', 'No se refleja en los espejos.', 'Muere de un disparo con una bala de plata.', 3],
      ['El monstruo de Frankenstein', 'En la novela tiene tornillos en el cuello.', 'En la novela no tiene nombre.', 'Mary Shelley empezó a escribirlo con 18 años.', 1],
      ['Harry Potter', 'Su cumpleaños es el 31 de julio.', 'Su patronus es un lobo.', 'Su varita lleva una pluma de fénix.', 2],
      ['Pesadilla antes de Navidad', 'Jack Skellington es el rey de Halloween.', 'Su perro fantasma se llama Zero.', 'La dirigió Tim Burton.', 3],
      ['Los Cazafantasmas', 'Su cuartel es un antiguo parque de bomberos.', 'Cazan fantasmas en Chicago.', 'La película es de 1984.', 2],
      ['Stephen King', 'Escribió «It».', 'Escribió «El exorcista».', 'Nació en Maine (Estados Unidos).', 2],
    ],
    cf: [1, 2, 3].map((n) => ({ col: n + 1, when: `OR($E{r}=${n},$E{r}="${n}")`, style: BAD })), // (el desplegable puede dejarlo como texto)
  },
  {
    name: 'Votación',
    tab: 'FFF06292',
    columns: [
      { title: 'Pregunta', width: 64, wrap: true, help: '«¿Quién es más probable que…?»: todos votan a un jugador.' },
      sectionCol,
    ],
    rows: [
      ['¿Quién es más probable que llegue tarde a su propia boda?'],
      ['¿Quién es más probable que sobreviva a un apocalipsis zombi?'],
      ['¿Quién es más probable que sea el primero en morir en una película de miedo?'],
      ['¿Quién es más probable que se coma los caramelos de Halloween antes de que llegue nadie?'],
      ['¿Quién es más probable que grite en el pasaje del terror?'],
      ['¿Quién es más probable que se haga amigo del fantasma de su casa?'],
      ['¿Quién es más probable que repita disfraz todos los años?'],
      ['¿Quién es más probable que invoque a un demonio por leer en voz alta un libro raro?'],
    ],
  },
  {
    name: 'Estimación',
    tab: 'FFFB8C00',
    columns: [
      { title: 'Pregunta', width: 48, wrap: true, help: 'Una pregunta cuya respuesta es un número.' },
      { title: 'Respuesta', width: 13, help: 'El número exacto.' },
      { title: 'Unidad', width: 10, help: 'Opcional (km, €…).' },
      { title: 'Gana', width: 14, list: ['Más cercano', 'Sin pasarse'], help: 'Vacío = más cercano.' },
      sectionCol,
    ],
    rows: [
      ['¿Cuántos kilómetros mide el Ebro?', 910, 'km', 'Más cercano'],
      ['¿Cuántos kilos pesaba la calabaza más pesada del mundo (récord de 2023)?', 1247, 'kg', 'Más cercano'],
      ['¿En qué año se publicó «Drácula», de Bram Stoker?', 1897, null, 'Más cercano'],
      ['¿Cuántos metros mide la Torre Eiffel (con sus antenas)?', 330, 'm', 'Más cercano'],
      ['¿Cuántas teclas tiene un piano normal?', 88, 'teclas', 'Sin pasarse'],
      ['¿Cuántos kilómetros hay en línea recta de Madrid a Barcelona?', 505, 'km', 'Más cercano'],
      ['¿Cuántos años vivió Edgar Allan Poe?', 40, 'años', 'Sin pasarse'],
      ['¿Cuántos dientes tiene un adulto, con las muelas del juicio?', 32, 'dientes', 'Sin pasarse'],
    ],
  },
  {
    name: 'Contador',
    tab: 'FF9CCC65',
    columns: [
      { title: 'Objetivo (s)', width: 12, help: 'Segundos a los que hay que parar el reloj.' },
      { title: 'Modo', width: 14, list: ['Visible', 'A ciegas', 'Desaparece'], help: '¿Se ve el reloj?' },
      { title: 'Desaparece a los (s)', width: 14, help: 'Solo con «Desaparece».' },
      sectionCol,
    ],
    rows: [
      [10, 'Visible', null],
      [15, 'Desaparece', 3],
      [7, 'A ciegas', null],
      [12, 'Desaparece', 5],
      [20, 'A ciegas', null],
    ],
  },
  {
    name: 'Reflejos',
    tab: 'FF795548',
    columns: [
      { title: 'Rondas', width: 10, help: 'Cuántas veces se juega.' },
      { title: 'Participan', width: 12, list: ['Todos', 'Duelo'], help: 'Duelo: eliges a dos en el mando.' },
      sectionCol,
    ],
    rows: [
      [3, 'Todos'],
      [2, 'Duelo'],
      [3, 'Todos'],
    ],
  },
  {
    name: 'Libre',
    tab: 'FF1E63D6',
    columns: [
      { title: 'Prueba', width: 22, help: 'Nombre de la prueba.' },
      { title: 'Descripción', width: 44, wrap: true, help: 'Qué hay que hacer (sale en la tele).' },
      {
        title: 'Herramienta',
        width: 14,
        list: ['Ninguna', 'Cronómetro', 'Contador', 'Contrarreloj', 'Nota'],
        help: 'Cronómetro: gana quien más aguanta. Contador: +1/−1. Contrarreloj: de uno en uno, gana el más rápido. Nota: das a cada uno del 1 al 10 (sus puntos). Ninguna: eliges tú.',
      },
      { title: 'Participan', width: 12, list: ['Jugadores', 'Equipos'], help: '¿Juega cada uno o cada equipo (uno por equipo)?' },
      { title: 'Puntos', width: 9, help: 'Vacío = los de la sección. Con Nota no cuenta: los puntos son la nota.' },
      { title: 'Piezas', width: 9, help: 'Contrarreloj: en cada intento apuntas cuántas tiene bien (p. ej. 5 botellas).' },
      { title: 'Canción', width: 18, help: 'Opcional: archivo en «Canciones» (sin .mp3), p. ej. Golpe Cancion n1. Suena entera al «¡Empezar!».' },
      { title: 'Desde (s)', width: 9, help: 'Segundo por el que empieza la canción.' },
      sectionCol,
    ],
    rows: [
      ['Guerra de globos', '3 de cada equipo con un globo en el tobillo. Gana el equipo al que le quede algún globo.', 'Ninguna', 'Equipos', null, null, null, null, 'Guerra de globos'],
      ['La revancha', '¡Otra vez! Globos nuevos y los mismos tres… o tres distintos.', 'Ninguna', 'Equipos', null, null, null, null, 'Guerra de globos'],
      ['Twerking de pimpón', 'Uno por equipo. La caja a la cadera, por la espalda: gana quien saque todas las pelotas primero.', 'Ninguna', 'Equipos', null, null, null, null, 'Twerking de pimpón'],
      ['Twerking: la revancha', 'Otro de cada equipo, la caja llena otra vez.', 'Ninguna', 'Equipos', null, null, null, null, 'Twerking de pimpón'],
      ['La galleta', 'Uno por equipo, manos atadas a la espalda y la galleta en la mesa. ¡A comer!', 'Ninguna', 'Equipos', null, null, null, null, 'La galleta'],
      ['La galleta: segunda carrera', 'Otros dos, otra galleta.', 'Ninguna', 'Equipos', null, null, null, null, 'La galleta'],
      ['Botellas en orden', 'Uno por equipo, primero uno y luego el otro. Ordena las 5 botellas como las tiene escondidas el presentador.', 'Contrarreloj', 'Equipos', null, 5, null, null, 'Botellas en orden'],
      // Marca el golpe: suena la canción entera; el presentador da a cada uno una nota del 1 al 10.
      ['Golpe 1', 'En pareja: bailad la canción y marcad el golpe a la vez. Nota del 1 al 10.', 'Nota', 'Jugadores', null, null, 'Golpe Cancion n1', 0, 'Marca el golpe'],
      ['Golpe 2', 'Otra canción, otro golpe: ¡a clavarlo!', 'Nota', 'Jugadores', null, null, 'Golpe Cancion n2', 0, 'Marca el golpe'],
      ['Golpe 3', 'La final: la más difícil.', 'Nota', 'Jugadores', null, null, 'Golpe Cancion n3', 0, 'Marca el golpe'],
      ['Plancha', 'Aguanta en plancha. Gana el último.', 'Cronómetro', 'Jugadores', null, null, null, null, 'Fit o Fat'],
      ['Flexiones', 'Más flexiones en un minuto.', 'Contador', 'Equipos', 5, null, null, null, 'Fit o Fat'],
      ['Sentadillas', 'Más sentadillas en un minuto (bajando hasta abajo).', 'Contador', 'Jugadores', null, null, null, null, 'Fit o Fat'],
      ['La silla invisible', 'Espalda en la pared, como sentado en una silla. Gana el último.', 'Cronómetro', 'Jugadores', null, null, null, null, 'Fit o Fat'],
      ['Flamenco a ciegas', 'A la pata coja y con los ojos cerrados. Gana el último en apoyar el pie.', 'Cronómetro', 'Jugadores', null, null, null, null, 'Fit o Fat'],
      ['La momia', 'Envolved a un compañero en papel higiénico en un minuto. Gana la mejor momia.', 'Ninguna', 'Equipos', 5, null, null, null, 'Fit o Fat'],
      ['Manzana colgante', 'Muerde la manzana que cuelga de un hilo, sin manos. El primero, gana.', 'Ninguna', 'Jugadores', null, null, null, null, 'Fit o Fat'],
      ['Burpees', 'Más burpees en 30 segundos, entre todo el equipo.', 'Contador', 'Equipos', 5, null, null, null, 'Fit o Fat'],
    ],
  },
  {
    name: 'Palabras',
    tab: 'FFFF7043',
    columns: [
      { title: 'Palabra', width: 26, help: 'Lo que hay que adivinar. Solo la ven quien la hace y el equipo rival.' },
      { title: 'Prohibidas', width: 46, wrap: true, help: 'Tabú: las que no se pueden decir, separadas por comas.' },
      { title: 'Modo', width: 13, list: ['Mímica', 'Tabú', 'Descríbelo', 'Tararéalo'], help: 'Vacío = Tabú si hay prohibidas; si no, Mímica.' },
      sectionCol,
    ],
    // Las tarjetas salen al azar y no se repiten hasta que salgan todas. Los turnos los marcan los Ajustes.
    rows: [
      ['Calabaza', 'Halloween, naranja, vela, cara', 'Tabú'],
      ['Vampiro', 'Sangre, Drácula, colmillos, murciélago', 'Tabú'],
      ['Fantasma', 'Sábana, espíritu, casa encantada, susto', 'Tabú'],
      ['Bruja', 'Escoba, caldero, sombrero, hechizo', 'Tabú'],
      ['Telaraña', 'Araña, hilo, red, tejer', 'Tabú'],
      ['Esqueleto', 'Huesos, calavera, cuerpo, muerto', 'Tabú'],
      ['Cementerio', 'Tumba, muertos, lápida, enterrar', 'Tabú'],
      ['Murciélago', 'Vampiro, volar, cueva, noche', 'Tabú'],
      ['Caramelo', 'Dulce, azúcar, chuche, truco o trato', 'Tabú'],
      ['Luna llena', 'Noche, lobo, redonda, cielo', 'Tabú'],
      ['Hombre lobo', null, 'Mímica'],
      ['Momia', null, 'Mímica'],
      ['Zombi', null, 'Mímica'],
      ['Tallar una calabaza', null, 'Mímica'],
      ['Pedir caramelos', null, 'Mímica'],
      ['Volar en escoba', null, 'Mímica'],
      ['Ver una peli de miedo', null, 'Mímica'],
      ['Salir de un ataúd', null, 'Mímica'],
      ['Gato negro', null, 'Mímica'],
      ['Poción', null, 'Descríbelo'],
      ['Disfraz', null, 'Descríbelo'],
      ['Escalofrío', null, 'Descríbelo'],
      ['Casa encantada', null, 'Descríbelo'],
      ['Ataúd', null, 'Descríbelo'],
      ['Thriller', null, 'Tararéalo'],
      ['Los Cazafantasmas', null, 'Tararéalo'],
      ['La familia Addams', null, 'Tararéalo'],
      ['Tiburón', null, 'Tararéalo'],
      ['Piratas del Caribe', null, 'Tararéalo'],
      ['Cumpleaños feliz', null, 'Tararéalo'],
    ],
  },
  {
    name: 'Agitar',
    tab: 'FF26A69A',
    columns: [
      { title: 'Segundos', width: 12, help: 'Cuánto dura cada carrera (de 3 a 60). Una fila = una carrera.' },
      sectionCol,
    ],
    rows: [[10], [15]],
  },
  {
    name: 'Apuesta',
    tab: 'FFFFB300',
    columns: [
      { title: 'Pregunta', width: 46, wrap: true, help: 'Mejor difícil: cada equipo apuesta antes de verla.' },
      { title: 'A', width: 20, wrap: true, help: 'Respuesta A' },
      { title: 'B', width: 20, wrap: true, help: 'Respuesta B' },
      { title: 'C', width: 20, wrap: true, help: 'C (opcional)' },
      { title: 'D', width: 20, wrap: true, help: 'D (opcional)' },
      { title: 'Correcta', width: 10, list: ['A', 'B', 'C', 'D'], help: 'Letra: se pinta de verde' },
      sectionCol,
    ],
    rows: [
      ['¿Qué famoso escapista murió un 31 de octubre, noche de Halloween?', 'Harry Houdini', 'David Copperfield', 'Charles Chaplin', 'Bela Lugosi', 'A'],
      ['¿Qué actor fue Drácula en la película de 1931?', 'Boris Karloff', 'Christopher Lee', 'Bela Lugosi', 'Vincent Price', 'C'],
    ],
    cf: ['A', 'B', 'C', 'D'].map((l, i) => ({ col: 2 + i, when: `$F{r}="${l}"`, style: GOOD })),
  },
  {
    name: 'Squid',
    tab: 'FFFF2E88',
    columns: [
      { title: 'Juego', width: 22, list: ['Luz roja', 'El panal', 'El puente', 'Tira y afloja', 'Canicas'], help: 'Uno por fila, en el orden en que se juegan. Sin filas = los 5.' },
      { title: 'Segundos', width: 10, help: 'Cuánto dura (en el puente, el tiempo para elegir cada tramo). Vacío = lo normal.' },
      { title: 'Tramos', width: 9, help: 'Solo el puente: cuántos tramos tiene. Vacío = según cuántos quedan vivos.' },
      sectionCol,
    ],
    rows: [['Luz roja', 60], ['El panal', 75], ['Tira y afloja', 20], ['Canicas', 90], ['El puente', 20]],
  },
  {
    name: 'Castigos',
    tab: 'FF6A1B9A',
    columns: [
      { title: 'Castigo', width: 70, wrap: true, help: 'Uno por fila. Al empezar se votan 3; al final, la ruleta elige el del equipo que pierda.' },
    ],
    rows: [
      ['Bailar «Thriller» entera delante de todos'],
      ['Servir las bebidas a los ganadores el resto de la noche'],
      ['Llevar el disfraz que elijan los ganadores hasta el final de la fiesta'],
      ['Fregar todos los platos de la cena'],
      ['Declarar su amor a una calabaza, de rodillas y con drama'],
      ['Cantar la canción que elijan los ganadores'],
      ['Imitar a cada ganador durante 30 segundos'],
      ['Contar un chiste malo a cada ganador hasta que se ría'],
    ],
  },
];

const START = [
  ['EMPIEZA AQUÍ', 'title'],
  ['Cómo preparar tu concurso en 4 pasos', 'sub'],
  [''],
  ['1.  Pestaña «Concurso»: una fila por sección (cada juego de la noche), en el orden en que se jugarán.', 'step'],
  ['     Ponle nombre y elige el Tipo en el desplegable. La columna gris te dice en qué pestaña van sus preguntas.'],
  ['2.  Escribe las preguntas en la pestaña de su tipo, una por fila. La fila azul de debajo de los títulos explica cada columna.', 'step'],
  ['     La columna «Sección» (al final) puedes dejarla vacía si solo hay una sección de ese tipo.'],
  ['3.  «Equipos»: uno por fila con su color (sin filas = sin equipos). «Ajustes»: el título y poco más.', 'step'],
  ['     Las canciones de las pruebas van en la carpeta del concurso, en «Canciones», con el nombre que pone la hoja.'],
  ['     «Castigos»: opciones para el equipo que pierda (todos votan 3 al empezar; al final, la ruleta elige). Sin filas = sin castigo.'],
  ['4.  Guárdala como .xlsx y cárgala en la tele («Cargar concurso» o dentro de la carpeta del concurso).', 'step'],
  ['     Si algo está mal, la tele te dice la pestaña y la fila.'],
  [''],
  ['Para cambiar algo después: edita la celda y vuelve a cargar el archivo. Las filas que ya hay son ejemplos: cámbialas o bórralas.'],
  ['¿Esta noche no os apetece algún juego? Mejor que borrarlo: pon «No» en «Se juega» o quita su casilla en «¿Qué juegos jugamos?» (tele).'],
  ['En el Test, la respuesta buena se pinta de verde según la letra de «Correcta»: así ves de un vistazo que está bien.'],
  ['Desde Google Sheets: Archivo → Descargar → Microsoft Excel (.xlsx).'],
  [''],
  ['TIPOS DE SECCIÓN', 'sub'],
];

const wb = new ExcelJS.Workbook();
wb.creator = 'Concurso del año';

// ---------------------------------------------------------------- «Empieza aquí»
const start = wb.addWorksheet('Empieza aquí', { properties: { tabColor: { argb: 'FFFF8A1F' } }, views: [{ showGridLines: false }] });
start.getColumn(1).width = 30;
start.getColumn(2).width = 22;
start.getColumn(3).width = 80;
START.forEach(([line, kind], i) => {
  const cell = start.getCell(i + 1, 1);
  cell.value = line;
  cell.font = kind === 'title' ? { bold: true, size: 22, color: { argb: 'FFFF8A1F' } } : kind === 'sub' ? { bold: true, size: 14 } : kind === 'step' ? { bold: true, size: 12 } : { size: 12 };
});
const typesHeader = start.getRow(START.length + 1);
typesHeader.values = ['Tipo', 'Sus preguntas, en', 'Qué es'];
typesHeader.font = { bold: true, color: { argb: 'FFFFFFFF' } };
typesHeader.eachCell((c) => (c.fill = fill(DARK)));
TYPES.forEach((t, i) => {
  const row = start.getRow(START.length + 2 + i);
  row.values = [t.type, `pestaña «${t.sheet}»`, t.what];
  row.getCell(1).font = { bold: true };
  if (i % 2) row.eachCell((c) => (c.fill = fill('FFF4F1FA')));
});

// ---------------------------------------------------------------- pestañas de datos
const letter = (n) => String.fromCharCode(64 + n); // 1 → A (las hojas no pasan de la Z)

for (const def of SHEETS) {
  const ws = wb.addWorksheet(def.name, {
    properties: { tabColor: { argb: def.tab } },
    views: [{ state: 'frozen', ySplit: 2 }],
  });
  ws.columns = def.columns.map((c) => ({ header: c.title, width: c.width }));

  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = fill(DARK);
  header.alignment = { vertical: 'middle', wrapText: true };
  header.height = 30;

  // Fila de ayuda (azul, cursiva): «↳ …» en cada columna
  const help = ws.getRow(2);
  help.values = def.columns.map((c) => (c.help ? HELP + c.help : ''));
  help.height = 42;
  def.columns.forEach((c, i) => {
    const cell = help.getCell(i + 1);
    cell.fill = fill(HELP_FILL);
    cell.font = { italic: true, size: 9, color: { argb: 'FF2A3F6B' } };
    cell.alignment = { vertical: 'top', wrapText: true };
  });

  def.rows.forEach((row, k) => (ws.getRow(FIRST + k).values = row));

  def.columns.forEach((c, i) => {
    const col = i + 1;
    for (let r = FIRST; r <= ROWS; r++) {
      const cell = ws.getCell(r, col);
      cell.alignment = { vertical: 'top', wrapText: !!c.wrap };
      if (c.list) {
        cell.dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [Array.isArray(c.list) ? `"${c.list.join(',')}"` : c.list],
          showErrorMessage: Array.isArray(c.list),
          errorStyle: 'warning',
          errorTitle: 'Valor no previsto',
          error: 'Elige un valor de la lista.',
        };
      }
    }
  });

  // Concurso: en qué pestaña van las preguntas de cada sección (fórmula; la lectura no mira esta columna)
  const fcol = def.columns.findIndex((c) => c.formula) + 1;
  if (fcol) {
    const typeCol = letter(def.columns.findIndex((c) => c.title === 'Tipo') + 1);
    const types = `{${TYPES.map((t) => `"${t.type}"`).join(',')}}`;
    const sheets = `{${TYPES.map((t) => `"${t.sheet}"`).join(',')}}`;
    for (let r = FIRST; r <= 100; r++) {
      const t = ws.getCell(r, def.columns.findIndex((c) => c.title === 'Tipo') + 1).value;
      const result = TYPES.find((x) => x.type === t)?.sheet;
      const cell = ws.getCell(r, fcol);
      cell.value = { formula: `IF(${typeCol}${r}="","",IFERROR("→ "&INDEX(${sheets},MATCH(${typeCol}${r},${types},0)),"¿tipo?"))`, result: result ? `→ ${result}` : '' };
      cell.font = { color: { argb: 'FF6B6B80' }, italic: true };
      cell.fill = fill('FFF2F2F2');
    }
  }

  // Formato condicional (la respuesta buena en verde…)
  for (const { col, when, style } of def.cf ?? []) {
    ws.addConditionalFormatting({
      ref: `${letter(col)}${FIRST}:${letter(col)}${ROWS}`,
      rules: [{ type: 'expression', formulae: [when.replaceAll('{r}', String(FIRST))], style }],
    });
  }
}

mkdirSync(dirname(OUT), { recursive: true });
await wb.xlsx.writeFile(OUT);
console.log(`Plantilla escrita en ${OUT}`);
