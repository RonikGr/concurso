// Sonido del espectáculo, generado al momento con Web Audio (sin archivos: nada que descargar ni licencias).
//  - Música (music.js): 7 estilos según el momento (preparación, portada, juego, tensión, revelado, marcador, final),
//    en la tonalidad y con el ambiente (viento, lluvia, fuego, burbujas, búhos) del entorno de la sección.
//  - Efectos: entrada de pantalla, gong, ¡pulsad!, pulsación, acierto, fallo, tictac, campana, redoble, trueno…
// El navegador no deja sonar nada hasta que alguien toca la página: se activa con la primera tecla o clic.
import { bell, bubble, crackle, mtof, noiseHit, owl, snare, thump, tone } from './synth.js';
import { MOODS, STYLES } from './music.js';
import { LADDER_SCENES, SFX_SLOT } from './tracks.js';
import { getCues } from './cueSettings.js';
import { SQUID_SFX } from './squidSound.js';
import { splitSong } from '../../core/voicing.js';
import { sectionWideSlot } from '../../core/folder.js';

const CROSSFADE = 0.7; // s (constante de tiempo del fundido entre estilos)
const SHORT_TRACK_S = 15; // un archivo más corto en un momento de música es un efecto: suena una vez
const CUE_LEVEL = 0.75; // volumen de las canciones del millonario (como la música, sin reverberación)

class SoundEngine extends EventTarget {
  ctx = null;
  settings = { musicOn: true, sfxOn: true, volume: 70 };
  #moodId = 'luna';
  #scene = 'lobby';
  #section = null; // sección en juego (sus canciones mandan sobre las generales)
  #step = null; // nº de pregunta en la sección (escalera de canciones)
  #layer = null; // música generada que suena ahora
  #tracks = new Map(); // tus canciones: slot → [{url, name}]
  #players = new Map(); // slot → reproductor de canciones
  #slot = null; // reproductor que suena ahora
  #amb = null; // ambiente del entorno
  #timers = new Set();
  // Canciones del millonario (core/millionaireMusic.js): se descodifican enteras para saltar a sus puntos y hacer
  // bucles exactos. Mientras suenan, la música de siempre calla.
  #mill = new Map(); // canción → {id, blob}
  #buffers = new Map(); // id del archivo → AudioBuffer
  #decoding = new Set();
  #cue = null; // lo que pide el realizador ahora
  #preview = null; // lo que se está probando en la ventana de música (manda sobre #cue)
  #cueKey = null; // última entrada atendida
  #cuePlay = null; // lo que suena: {key, track, src, g, t0, from, loop, after}
  #cueHeld = false; // ¿la música de siempre está callada por las canciones del millonario?
  // Canciones de las pruebas (carpeta «Canciones»: «¿Qué canción es?», la bachata…): también descodificadas, para
  // pausar y seguir donde iba y para callar justo antes del golpe. Mientras hay una, la música de siempre calla.
  #songs = new Map(); // clave (songKey) → {id, blob}
  #song = null; // lo que pide el realizador: {key, track, from, playing, silence: [desde, hasta]?, until?}
  #songPlay = null; // lo que suena: {key, src, g, t0, from}
  #songPos = new Map(); // key → segundo de la canción donde se pausó (o acabó)
  #songHeld = false;
  #noise = null;
  #schedule = 0;
  // Sonidos de Squid Games de la carpeta (huecos «sq:…»): descodificados y con el volumen igualado
  #samples = new Map(); // tipo (latido, respiración…) → {id, blob}
  #sampleMeta = new Map(); // id → {norm, start, length} (ganancia para igualar y dónde suena de verdad)
  /** Qué ha sonado y cuándo (para quien no puede oír: depuración y pruebas). */
  soundLog = [];
  /** Silencio total (solo en desarrollo: localStorage concurso.silencio = 1, para probar sin oírlo). El registro sigue. */
  muted = false;

  constructor() {
    super();
    const unlock = () => this.unlock();
    addEventListener('pointerdown', unlock, true);
    addEventListener('keydown', unlock, true);
  }

  get unlocked() {
    return this.ctx?.state === 'running';
  }

  /** Crea el contexto de audio (tiene que ser dentro de un gesto del usuario). */
  unlock() {
    if (this.unlocked) return;
    if (!this.ctx) {
      const Ctx = window.AudioContext ?? window.webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx({ latencyHint: 'interactive' });
      this.#build();
    }
    this.ctx.resume().then(() => {
      this.#decodeMill();
      this.#decodeSamples();
      this.#startMusic();
      this.#applyCue();
      this.#applySong();
      this.dispatchEvent(new Event('unlock'));
    });
  }

  configure(settings) {
    this.settings = { ...this.settings, ...settings };
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.muted ? 0 : (this.settings.volume / 100) * 0.9, t, 0.1);
    this.sfxBus.gain.setTargetAtTime(this.settings.sfxOn ? 1 : 0, t, 0.05);
    this.musicBus.gain.setTargetAtTime(this.settings.musicOn ? 0.6 : 0, t, 0.4);
    this.cueBus.gain.setTargetAtTime(this.settings.musicOn ? CUE_LEVEL : 0, t, 0.4);
  }

  /** Entorno actual: cambia la tonalidad y el ambiente. */
  setMood(id) {
    if (this.#moodId === id || !MOODS[id]) return;
    this.#moodId = id;
    if (!this.unlocked) return;
    this.#switchAmbience();
    this.#switchLayer();
  }

  /** Momento del concurso → estilo de música (ver music.js). */
  /**
   * Momento del concurso → estilo de música (ver music.js); `section` = nombre de la sección en juego, para usar sus
   * canciones si las tiene.
   */
  setScene(scene, section = null, step = null) {
    if (!STYLES[scene]) return;
    if (this.#scene === scene && this.#section === section) {
      // misma escena: solo cambia de canción si es una escalera y ha cambiado la pregunta
      if (this.#step !== step) {
        this.#step = step;
        const slot = this.#slotKey();
        if (this.unlocked && slot && this.#isLadder(slot) && !this.#cueHeld) this.#playSlot(slot, false);
      }
      return;
    }
    this.#step = step;
    const before = this.#slotKey();
    const sameScene = this.#scene === scene;
    this.#scene = scene;
    this.#section = section;
    // Misma música (la general de «Jugando» al pasar de sección, o la de toda una sección al cambiar de momento): que
    // no vuelva a empezar
    if (before === this.#slotKey() && (before || sameScene)) return;
    if (this.unlocked) this.#switchLayer();
  }

  /** ¿Este hueco elige canción por número de pregunta? (de una sección, con varias, en jugando/pregunta/suspense) */
  #isLadder(slot) {
    return slot.includes('|') && LADDER_SCENES.has(this.#scene) && this.#step != null && (this.#tracks.get(slot)?.length ?? 0) > 1;
  }

  /**
   * Hueco de canciones que toca ahora: el del momento de la sección si tiene, si no el de toda la sección (la misma en
   * todos sus momentos: sigue sin cortarse), si no el general; null = música generada.
   */
  #slotKey() {
    const own = this.#section ? `${this.#section}|${this.#scene}` : null;
    if (own && this.#tracks.get(own)?.length) return own;
    const whole = this.#section ? sectionWideSlot(this.#section) : null;
    if (whole && this.#tracks.get(whole)?.length) return whole;
    return this.#tracks.get(this.#scene)?.length ? this.#scene : null;
  }

  /** Efecto de sonido, opcionalmente con retraso (ms). */
  play(name, delayMs = 0) {
    if (!this.unlocked || !this.settings.sfxOn) return;
    const fn = SFX[name];
    if (!fn) return;
    // Si hay una canción tuya para este efecto (la de la sección o la general), suena ella en vez del generado
    const fire = () => {
      this.log('efecto', name);
      const own = this.#effectTrack(name);
      if (own) this.#playOnce(own);
      else fn(this, this.ctx.currentTime + 0.01);
    };
    if (delayMs <= 0) return fire();
    const id = setTimeout(() => {
      this.#timers.delete(id);
      if (this.unlocked) fire();
    }, delayMs);
    this.#timers.add(id);
  }

  #effectTrack(name) {
    const slot = SFX_SLOT[name];
    if (!slot) return null;
    const list = (this.#section && this.#tracks.get(`${this.#section}|${slot}`)) || this.#tracks.get(slot);
    return list?.length ? list[(Math.random() * list.length) | 0].url : null;
  }

  /** Efecto con canción: suena una vez y, mientras, la música de fondo baja. */
  #playOnce(url) {
    const audio = new Audio(url);
    const src = this.ctx.createMediaElementSource(audio);
    src.connect(this.sfxBus);
    const t = this.ctx.currentTime;
    const level = this.settings.musicOn ? 0.6 : 0;
    this.musicBus.gain.setTargetAtTime(level * 0.2, t, 0.08);
    this.cueBus.gain.setTargetAtTime(this.settings.musicOn ? CUE_LEVEL * 0.2 : 0, t, 0.08);
    const done = () => {
      src.disconnect();
      this.musicBus.gain.setTargetAtTime(this.settings.musicOn ? 0.6 : 0, this.ctx.currentTime, 0.5);
      this.cueBus.gain.setTargetAtTime(this.settings.musicOn ? CUE_LEVEL : 0, this.ctx.currentTime, 0.5);
    };
    audio.addEventListener('ended', done, { once: true });
    audio.addEventListener('error', done, { once: true });
    audio.play().catch(done);
  }

  /** Apunta en `soundLog` lo que suena (los últimos 400). */
  log(kind, name, extra = null) {
    const t = performance.now();
    const d = new Date();
    const clock = `${d.toLocaleTimeString('es-ES')}.${String(d.getMilliseconds()).padStart(3, '0')}`;
    this.soundLog.push({ t: Math.round(t), clock, kind, name, ...(extra ?? {}) });
    if (this.soundLog.length > 400) this.soundLog.splice(0, this.soundLog.length - 400);
  }

  /** Hora del AudioContext para un instante de performance.now() (ahora, si ya pasó). */
  perfToCtx(ms) {
    return this.ctx.currentTime + Math.max(0, (ms - performance.now()) / 1000);
  }

  /**
   * Sonido de Squid Games (fx/squidSound.js): con el archivo de la carpeta si lo hay, si no generado. `at` =
   * performance.now() en que debe sonar (para cuadrar con la pantalla). Los que duran devuelven {stop()}.
   */
  sq(name, opts = {}) {
    if (!this.unlocked || !this.settings.sfxOn || !SQUID_SFX[name]) return null;
    const t = opts.at != null ? this.perfToCtx(opts.at) : this.ctx.currentTime + 0.01;
    this.log('squid', name, opts.at != null ? { at: Math.round(opts.at) } : null);
    return SQUID_SFX[name](this, t, opts) ?? null;
  }

  /** ¿Hay archivo (ya listo) para este sonido? Con dónde empieza y cuánto dura lo que suena. */
  sampleInfo(kind) {
    const rec = this.#samples.get(kind);
    const meta = rec && this.#sampleMeta.get(rec.id);
    return meta && this.#buffers.has(rec.id) ? { start: meta.start, length: meta.length, turn: meta.turn ?? null } : null;
  }

  /**
   * Toca un trozo de un archivo de la carpeta (o null si no lo hay). {t, offset, duration, rate, gain, loop: [a, b],
   * fadeOut} → {stop()}
   */
  sample(kind, { t = null, offset = 0, duration = null, rate = 1, gain = 1, loop = null, fadeOut = 0 } = {}) {
    const rec = this.#samples.get(kind);
    const buf = rec && this.#buffers.get(rec.id);
    if (!buf) return null;
    const c = this.ctx;
    const at = t ?? c.currentTime + 0.01;
    const from = offset < buf.duration - 0.05 ? offset : 0;
    const src = c.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const g = c.createGain();
    const level = (this.#sampleMeta.get(rec.id)?.norm ?? 1) * gain;
    g.gain.setValueAtTime(level, at);
    if (loop) {
      src.loop = true;
      src.loopStart = Math.min(loop[0], buf.duration - 0.1);
      src.loopEnd = Math.min(loop[1], buf.duration);
      src.start(at, from);
    } else {
      const dur = Math.min(duration ?? buf.duration, buf.duration - from);
      if (fadeOut) g.gain.setTargetAtTime(0, at + (dur - fadeOut) / rate, fadeOut / 3);
      src.start(at, from, dur);
    }
    src.connect(g).connect(this.sfxBus);
    this.log('archivo', kind, { offset: +from.toFixed(2), at: Math.round(performance.now() + (at - c.currentTime) * 1000) });
    return {
      stop: (fade = 0.15) => {
        const now = c.currentTime;
        g.gain.cancelScheduledValues(now);
        g.gain.setTargetAtTime(0, now, fade);
        try {
          src.stop(now + fade * 5);
        } catch {
          // ya parado
        }
      },
    };
  }

  /** Descodifica los sonidos de la carpeta y mide su volumen y dónde empieza y acaba lo que suena. */
  async #decodeSamples() {
    for (const [, rec] of this.#samples) {
      if (this.#buffers.has(rec.id) || this.#decoding.has(rec.id)) continue;
      this.#decoding.add(rec.id);
      try {
        const buf = await this.ctx.decodeAudioData(await rec.blob.arrayBuffer());
        const d = buf.getChannelData(0);
        let peak = 0;
        for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
        const floor = peak * 0.05;
        let a = 0;
        let b = d.length - 1;
        while (a < b && Math.abs(d[a]) < floor) a++;
        while (b > a && Math.abs(d[b]) < floor) b--;
        const meta = { norm: Math.min(400, 0.7 / Math.max(peak, 1e-4)), start: a / buf.sampleRate, length: (b - a) / buf.sampleRate };
        // La muñeca: dónde canta y, si el archivo trae detrás el giro de la cabeza, dónde empieza (canción en verde, giro en rojo)
        if (this.#samples.get('doll')?.id === rec.id) {
          const cut = splitSong(d, buf.sampleRate);
          if (cut) Object.assign(meta, { start: cut.song[0], length: cut.song[1] - cut.song[0], turn: cut.turn });
        }
        this.#sampleMeta.set(rec.id, meta);
        this.#buffers.set(rec.id, buf);
        // si es la música que toca ahora (tema, tensión, vals), que empiece a sonar ella
        const want = (MOODS[this.#moodId]?.styles?.[this.#scene] && STYLES[MOODS[this.#moodId].styles[this.#scene]]?.sample) || STYLES[this.#scene]?.sample;
        if (want && this.#samples.get(want)?.id === rec.id) this.#switchLayer(true);
      } catch (e) {
        console.warn('[sonido] no se pudo leer un sonido de Squid Games', e);
      } finally {
        this.#decoding.delete(rec.id);
      }
    }
  }

  /** Voz del navegador (en local): la megafonía de Squid Games. Si no hay voz, no pasa nada. */
  say(text, { rate = 0.95, pitch = 0.85 } = {}) {
    if (!this.settings.sfxOn || !this.unlocked) return; // sin activar el sonido, tampoco habla (no se oiría entero)
    this.log('voz', text);
    try {
      if (!('speechSynthesis' in window)) return;
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'es-ES';
      u.voice = speechSynthesis.getVoices().find((v) => v.lang?.startsWith('es')) ?? null;
      u.rate = rate;
      u.pitch = pitch;
      u.volume = this.muted ? 0 : Math.min(1, this.settings.volume / 70);
      speechSynthesis.speak(u);
    } catch {
      // sin voz
    }
  }

  /** Calla la voz (al cambiar de pantalla). */
  hush() {
    try {
      speechSynthesis.cancel();
    } catch {
      // sin voz
    }
  }

  /** Anula los efectos programados (al cambiar de pantalla). */
  cancel() {
    for (const id of this.#timers) clearTimeout(id);
    this.#timers.clear();
  }

  // ------------------------------------------------------------------------------------------ montaje

  #build() {
    const c = this.ctx;
    this.master = c.createGain();
    this.master.gain.value = this.muted ? 0 : (this.settings.volume / 100) * 0.9;
    // Compresor final: que los golpes fuertes no saturen los altavoces de la tele.
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(c.destination);

    this.reverb = c.createConvolver();
    this.reverb.buffer = this.#impulse(3.2);
    const wet = c.createGain();
    wet.gain.value = 0.55;
    this.reverb.connect(wet).connect(this.master);

    this.musicBus = c.createGain();
    this.musicBus.gain.value = 0;
    this.musicBus.connect(this.master);
    const musicSend = c.createGain();
    musicSend.gain.value = 0.7;
    this.musicBus.connect(musicSend).connect(this.reverb);

    // Canciones del millonario: sin reverberación (ya vienen grabadas)
    this.cueBus = c.createGain();
    this.cueBus.gain.value = this.settings.musicOn ? CUE_LEVEL : 0;
    this.cueBus.connect(this.master);

    // Canciones de las pruebas: son parte del juego, suenan aunque la música esté apagada
    this.songBus = c.createGain();
    this.songBus.gain.value = 0.85;
    this.songBus.connect(this.master);

    this.sfxBus = c.createGain();
    this.sfxBus.gain.value = this.settings.sfxOn ? 1 : 0;
    this.sfxBus.connect(this.master);
    const sfxSend = c.createGain();
    sfxSend.gain.value = 0.35;
    this.sfxBus.connect(sfxSend).connect(this.reverb);
  }

  #impulse(seconds) {
    const c = this.ctx;
    const len = Math.round(c.sampleRate * seconds);
    const buf = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3.2;
    }
    return buf;
  }

  noise() {
    if (this.#noise) return this.#noise;
    const c = this.ctx;
    const buf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return (this.#noise = buf);
  }

  // ------------------------------------------------------------------------------------------ música

  #startMusic() {
    this.configure({});
    this.#switchAmbience();
    this.#switchLayer();
    if (this.#schedule) return;
    // Planificador con margen: se programan las notas un poco antes de que toquen.
    this.#schedule = setInterval(() => this.#tick(), 90);
  }

  /** Apaga una capa (música o ambiente) con un fundido y libera sus osciladores. */
  #fadeOut(layer) {
    if (!layer) return;
    layer.out.gain.setTargetAtTime(0, this.ctx.currentTime, CROSSFADE * 0.6);
    setTimeout(() => {
      layer.nodes.forEach((n) => n.stop?.());
      layer.out.disconnect();
    }, 5000);
  }

  #newOut(level = 1) {
    const out = this.ctx.createGain();
    out.gain.value = 0;
    out.gain.setTargetAtTime(level, this.ctx.currentTime + 0.1, CROSSFADE);
    out.connect(this.musicBus);
    return out;
  }

  /** Qué suena ahora (para depurar desde la consola). */
  state() {
    const p = this.#slot;
    const q = this.#cuePlay;
    return {
      scene: this.#scene,
      mood: this.#moodId,
      generated: !!this.#layer,
      track: p && { slot: p.slot, src: p.audio.src, paused: p.audio.paused, time: p.audio.currentTime },
      cue: q && { key: q.key, track: q.track, pos: q.src ? +this.#cuePos(q).toFixed(2) : null },
    };
  }

  /** Tus canciones por momento: slot → [{url, name}] (ver tracks.js). */
  setTracks(map) {
    this.#tracks = map;
    this.#mill = new Map();
    for (const [slot, list] of map) if (slot.startsWith('mill:') && list.length) this.#mill.set(slot.slice(5), { id: list[0].id, blob: list[0].blob });
    this.#songs = new Map();
    for (const [slot, list] of map) if (slot.startsWith('song:') && list.length) this.#songs.set(slot.slice(5), { id: list[0].id, blob: list[0].blob });
    this.#samples = new Map();
    for (const [slot, list] of map) if (slot.startsWith('sq:') && list.length) this.#samples.set(slot.slice(3), { id: list[0].id, blob: list[0].blob });
    this.#cueKey = null; // por si ha cambiado la canción que sonaba
    if (!this.unlocked) return;
    this.#decodeMill();
    this.#decodeSamples();
    this.#switchLayer(true);
    this.#applyCue();
    this.#applySong();
  }

  // ------------------------------------------------------------------------------------------ millonario

  /** Qué tiene que sonar del millonario (millionaireCue), o null para la música de siempre. */
  setCue(cue) {
    this.#cue = cue;
    if (this.unlocked) this.#applyCue();
  }

  /** Probar un punto de una canción del millonario (ventana de música); null = dejar de probar. */
  previewCue(cue) {
    this.#preview = cue;
    if (this.unlocked) this.#applyCue();
  }

  /** Por dónde va (s) la canción del millonario que suena con esta `key`, o null si no es esa o aún no suena. */
  cuePosition(key) {
    const p = this.#cuePlay;
    return p?.src && p.key === key ? this.#cuePos(p) : null;
  }

  /** ¿Suenan ahora las canciones del millonario? (entonces sobran algunos efectos generados) */
  get cueActive() {
    return this.#cueHeld;
  }

  hasMillionaireTrack(track) {
    return this.#mill.has(track);
  }

  #bufferOf(track) {
    const rec = this.#mill.get(track);
    return rec ? this.#buffers.get(rec.id) : null;
  }

  async #decodeMill() {
    for (const [, rec] of this.#mill) {
      if (this.#buffers.has(rec.id) || this.#decoding.has(rec.id)) continue;
      this.#decoding.add(rec.id);
      try {
        this.#buffers.set(rec.id, await this.ctx.decodeAudioData(await rec.blob.arrayBuffer()));
        this.#cueKey = null;
        this.#applyCue();
      } catch (e) {
        console.warn('[música] no se pudo leer una canción del millonario', e);
      } finally {
        this.#decoding.delete(rec.id);
      }
    }
  }

  #applyCue() {
    const cue = this.#preview ?? this.#cue;
    // Sin canciones del millonario (o sin la que toca) suena la música de siempre
    const usable = !!cue && this.#mill.size > 0 && (cue.track == null || !!this.#bufferOf(cue.track));
    if (!usable) {
      this.#cueKey = null;
      if (!this.#cueHeld) return;
      this.#stopCue();
      this.#cueHeld = false;
      this.#switchLayer();
      return;
    }
    if (!this.#cueHeld) {
      this.#cueHeld = true;
      this.#fadeOut(this.#layer);
      this.#layer = null;
      this.#stopSlot();
    }
    if (this.#cueKey === cue.key) return;
    this.#cueKey = cue.key;
    // La misma canción ya va por ese punto (p. ej. el golpe final de la llamada al acabar el tiempo): que siga
    const cur = this.#cuePlay;
    if (cur?.src && cur.track === cue.track && !cue.loop) {
      const pos = this.#cuePos(cur);
      if (pos >= cue.from - 0.3 && pos <= cue.from + 2) {
        cur.after = cue.after;
        return;
      }
    }
    this.#startCue(cue);
  }

  #startCue(cue) {
    this.#stopCue();
    if (!cue.track) return; // silencio
    const c = this.ctx;
    const t = c.currentTime;
    const buf = this.#bufferOf(cue.track);
    if (!buf) return;
    const src = c.createBufferSource();
    src.buffer = buf;
    if (cue.loop) {
      src.loop = true;
      src.loopStart = cue.loop[0];
      src.loopEnd = cue.loop[1];
    }
    const g = c.createGain();
    const level = 10 ** ((getCues()[cue.track]?.gainDb ?? 0) / 20);
    // desde el principio, de golpe; a mitad de canción, un fundido cortísimo para que no chasque
    if (cue.from > 0.05) {
      g.gain.value = 0;
      g.gain.setTargetAtTime(level, t, 0.015);
    } else {
      g.gain.value = level;
    }
    src.connect(g).connect(this.cueBus);
    const from = Math.max(0, Math.min(cue.from, buf.duration - 0.05));
    const end = getCues()[cue.track]?.end;
    if (!cue.loop && end > from) src.start(t, from, end - from);
    else src.start(t, from);
    const play = { key: cue.key, track: cue.track, src, g, t0: t, from, loop: cue.loop, after: cue.after };
    this.log('millonario', cue.key);
    src.onended = () => {
      if (this.#cuePlay !== play) return;
      this.#cuePlay = null;
      if (play.after && this.#cueHeld) this.#startCue(play.after); // p. ej. tras la llamada, vuelve el colchón
    };
    this.#cuePlay = play;
  }

  #stopCue() {
    const p = this.#cuePlay;
    this.#cuePlay = null;
    if (!p?.src) return;
    const t = this.ctx.currentTime;
    p.g.gain.setTargetAtTime(0, t, 0.08);
    p.src.stop(t + 0.6);
  }

  /** Por dónde va (segundos de la canción), contando los bucles. */
  #cuePos(p) {
    let pos = p.from + (this.ctx.currentTime - p.t0);
    if (p.loop && pos > p.loop[1]) pos = p.loop[0] + ((pos - p.loop[0]) % (p.loop[1] - p.loop[0]));
    return pos;
  }

  #switchLayer(force = false) {
    if (this.#cueHeld || this.#songHeld) return; // suenan las canciones del millonario o la de una prueba
    const c = this.ctx;
    // Si hay canciones tuyas para este momento, suenan ellas; si no, la música generada.
    const slot = this.#slotKey();
    if (slot) {
      this.#fadeOut(this.#layer);
      this.#layer = null;
      this.log('música', `canción: ${slot}`);
      return this.#playSlot(slot, force);
    }
    this.#stopSlot();
    this.#fadeOut(this.#layer);
    const mood = MOODS[this.#moodId];
    // Un entorno puede tener su propia música para cada momento (Squid Games)
    const styleId = mood.styles?.[this.#scene] ?? this.#scene;
    const style = STYLES[styleId];
    const out = this.#newOut();
    // …y si en la carpeta hay canción para ese estilo, suena ella en bucle
    const rec = style.sample && this.#samples.get(style.sample);
    const buf = rec && this.#buffers.get(rec.id);
    if (buf) {
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const g = this.ctx.createGain();
      g.gain.value = (this.#sampleMeta.get(rec.id)?.norm ?? 1) * 0.6;
      src.connect(g).connect(out);
      src.start();
      this.#layer = { style: STYLES.hush, mood, out, soft: out, nodes: [src], voices: [], st: {}, beat: 0, nextBeat: this.ctx.currentTime + 0.15 };
      this.log('música', `${styleId} (archivo)`);
      return;
    }
    this.log('música', styleId);
    // filtro para los sonidos de sierra (ostinatos, trémolos): que no chirríen
    const soft = c.createBiquadFilter();
    soft.type = 'lowpass';
    soft.frequency.value = 1800;
    soft.connect(out);
    const layer = { style, mood, out, soft, nodes: [], voices: [], st: {}, beat: 0, nextBeat: c.currentTime + 0.15 };
    if (style.pad) this.#buildPad(layer);
    style.start?.(layer.st, mood);
    this.#layer = layer;
  }

  // ------------------------------------------------------------------------------------------ canciones de las pruebas

  /** ¿Está en el portátil la canción con esta clave (songKey)? */
  hasSong(track) {
    return this.#songs.has(track);
  }

  /** Descodificarla ya (al llegar a la pregunta), para que al abrir suene sin esperar. */
  prepareSong(track) {
    if (this.unlocked && track) this.#decodeSong(track);
  }

  /**
   * Lo que tiene que sonar de una prueba, o null. {key (una por pregunta: si cambia, empieza de nuevo), track,
   * from (s), playing (false = en pausa: luego sigue donde iba), startAt (performance.now() en que empieza a sonar, si
   * es más tarde), silence: [a, b] (calla de a a b), until (s: ahí acaba)}
   */
  setSong(song) {
    this.#song = song;
    if (this.unlocked) this.#applySong();
  }

  /** Por dónde va (s) la canción de la prueba con esta key, o null si no suena. */
  songPosition(key) {
    const p = this.#songPlay;
    if (p?.key === key) return p.from + (this.ctx.currentTime - p.t0);
    return this.#songPos.get(key) ?? null;
  }

  async #decodeSong(track) {
    const rec = this.#songs.get(track);
    if (!rec || this.#buffers.has(rec.id) || this.#decoding.has(rec.id)) return;
    this.#decoding.add(rec.id);
    try {
      this.#buffers.set(rec.id, await this.ctx.decodeAudioData(await rec.blob.arrayBuffer()));
      this.#applySong();
    } catch (e) {
      console.warn('[música] no se pudo leer una canción de las pruebas', e);
    } finally {
      this.#decoding.delete(rec.id);
    }
  }

  #applySong() {
    const s = this.#song;
    const rec = s && this.#songs.get(s.track);
    if (!rec) {
      // Sin canción (o no está en el portátil): la música de siempre
      this.#stopSong();
      if (this.#songHeld) {
        this.#songHeld = false;
        this.#switchLayer();
      }
      return;
    }
    if (!this.#songHeld) {
      this.#songHeld = true;
      this.#fadeOut(this.#layer);
      this.#layer = null;
      this.#stopSlot();
    }
    const buf = this.#buffers.get(rec.id);
    if (!buf) return this.#decodeSong(s.track); // al descodificarla se vuelve aquí
    const cur = this.#songPlay;
    if (cur && cur.key !== s.key) this.#stopSong();
    if (!s.playing) {
      if (this.#songPlay) {
        this.#songPos.set(s.key, this.songPosition(s.key));
        this.#stopSong();
      }
      return;
    }
    if (this.#songPlay) return; // ya suena
    const from = this.#songPos.get(s.key) ?? s.from;
    const end = Math.min(buf.duration, s.until ?? buf.duration);
    if (from >= end - 0.05) return; // ya acabó
    const c = this.ctx;
    const wait = s.startAt != null ? Math.max(0, (s.startAt - performance.now()) / 1000) : 0; // p. ej. al «¡Pulsad!»
    const t = c.currentTime + 0.03 + wait;
    const src = c.createBufferSource();
    src.buffer = buf;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    // entrada: casi al momento, o con fundido (marcar el golpe); si se retoma por donde iba, rápida
    g.gain.setTargetAtTime(1, t, s.fadeIn && from <= s.from + 0.1 ? s.fadeIn / 3 : 0.015);
    // Silencio antes del golpe: calla en «a» y vuelve de golpe en «b» (programado: exacto)
    if (s.silence && s.silence[1] > from) {
      const [a, b] = s.silence;
      if (a > from) g.gain.setTargetAtTime(0, t + (a - from), 0.04);
      else g.gain.setValueAtTime(0, t);
      g.gain.setValueAtTime(1, t + (b - from));
    }
    // Final con fundido (si se corta antes de que acabe la canción)
    if (end < buf.duration) g.gain.setTargetAtTime(0, t + (end - from) - 0.6, 0.2);
    src.connect(g).connect(this.songBus);
    src.start(t, from, end - from);
    this.log('canción', s.track, { from: +from.toFixed(2) });
    const play = { key: s.key, src, g, t0: t, from };
    src.onended = () => {
      if (this.#songPlay !== play) return;
      this.#songPlay = null;
      this.#songPos.set(play.key, end); // acabada: no vuelve a empezar al repintar
    };
    this.#songPlay = play;
  }

  #stopSong() {
    const p = this.#songPlay;
    this.#songPlay = null;
    if (!p) return;
    const t = this.ctx.currentTime;
    p.g.gain.cancelScheduledValues(t);
    p.g.gain.setTargetAtTime(0, t, 0.05);
    p.src.stop(t + 0.3);
  }

  // ------------------------------------------------------------------------------------------ canciones (.mp3)

  /**
   * Un reproductor por momento. Al volver a un momento en menos de 3 min, la canción sigue donde iba; si no, empieza
   * otra (al azar entre las de ese momento). Al acabar una, suena la siguiente.
   */
  #playSlot(slot, force) {
    const list = this.#tracks.get(slot);
    let p = this.#players.get(slot);
    if (p && (force || !list.some((t) => t.url === p.audio.src))) {
      p.audio.pause();
      this.#players.delete(slot);
      p = null;
    }
    if (!p) {
      const audio = new Audio();
      audio.preload = 'auto';
      const gain = this.ctx.createGain();
      gain.gain.value = 0;
      this.ctx.createMediaElementSource(audio).connect(gain).connect(this.musicBus);
      p = { audio, gain, pausedAt: 0, slot };
      // Un archivo corto (un efecto puesto en un momento de música) suena una vez: no se repite
      audio.addEventListener('ended', () => audio.duration >= SHORT_TRACK_S && this.#nextTrack(p));
      this.#players.set(slot, p);
      this.#nextTrack(p, false);
    } else if (performance.now() - p.pausedAt > 180_000 && !this.#isLadder(slot)) {
      this.#nextTrack(p, false);
    }
    // Escalera: la canción de esta pregunta (la última se repite para el resto), siempre en bucle
    if (this.#isLadder(slot)) {
      const want = list[Math.min(this.#step, list.length - 1)].url;
      p.audio.loop = true;
      if (p.audio.src !== want) p.audio.src = want;
    } else {
      p.audio.loop = false;
    }
    if (this.#slot && this.#slot !== p) this.#stopSlot();
    this.#slot = p;
    p.audio.play().catch(() => {});
    p.gain.gain.setTargetAtTime(1, this.ctx.currentTime, CROSSFADE * 0.8);
  }

  #nextTrack(p, play = true) {
    const list = this.#tracks.get(p.slot) ?? [];
    if (!list.length) return;
    const others = list.length > 1 ? list.filter((t) => t.url !== p.audio.src) : list;
    p.audio.src = others[(Math.random() * others.length) | 0].url;
    if (play) p.audio.play().catch(() => {});
  }

  /** Funde y pausa la canción que suena (se recuerda dónde iba). */
  #stopSlot() {
    const p = this.#slot;
    if (!p) return;
    this.#slot = null;
    p.gain.gain.setTargetAtTime(0, this.ctx.currentTime, CROSSFADE * 0.6);
    p.pausedAt = performance.now();
    setTimeout(() => this.#slot !== p && p.audio.pause(), 3000);
  }

  /** Colchón del estilo explore: tónica, quinta y octava desafinadas por un filtro que respira. */
  #buildPad(layer) {
    const c = this.ctx;
    const m = layer.mood;
    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = m.cutoff;
    filter.Q.value = 2;
    const lfo = c.createOscillator();
    const lfoGain = c.createGain();
    lfo.frequency.value = 0.06;
    lfoGain.gain.value = m.cutoff * 0.45;
    lfo.connect(lfoGain).connect(filter.frequency);
    lfo.start();
    layer.nodes.push(lfo);
    const padGain = c.createGain();
    padGain.gain.value = m.wave === 'square' ? 0.028 : m.wave === 'sine' ? 0.09 : 0.045;
    filter.connect(padGain).connect(layer.out);
    for (const interval of [0, 7, 12, -12]) {
      for (const detune of interval === -12 ? [0] : [-8, 8]) {
        const o = c.createOscillator();
        o.type = interval === -12 ? 'sine' : m.wave;
        o.frequency.value = mtof(m.root + interval);
        o.detune.value = detune;
        const g = c.createGain();
        g.gain.value = interval === -12 ? 2.2 : 1;
        o.connect(g).connect(filter);
        o.start();
        layer.nodes.push(o);
        layer.voices.push({ o, interval });
      }
    }
  }

  /** Ambiente continuo del entorno (viento, lluvia); lo puntual (fuego, burbujas, búhos) va en #tick. */
  #switchAmbience() {
    const c = this.ctx;
    this.#fadeOut(this.#amb);
    const m = MOODS[this.#moodId];
    const out = this.#newOut(0.8);
    const amb = { m, out, nodes: [], nextBeat: c.currentTime };
    const loop = (filterType, freq, gain, q = 1, offset = 0) => {
      const src = c.createBufferSource();
      src.buffer = this.noise();
      src.loop = true;
      const f = c.createBiquadFilter();
      f.type = filterType;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = c.createGain();
      g.gain.value = gain;
      src.connect(f).connect(g).connect(out);
      src.start(0, offset);
      amb.nodes.push(src);
      return f;
    };
    if (m.amb.includes('rain')) loop('highpass', 2500, 0.05);
    if (m.amb.includes('wind')) {
      const bp = loop('bandpass', 500, m.amb.includes('rain') ? 0.05 : 0.07, 3, 0.3);
      // Ráfagas: el filtro sube y baja despacio
      const wl = c.createOscillator();
      const wg = c.createGain();
      wl.frequency.value = 0.09;
      wg.gain.value = 300;
      wl.connect(wg).connect(bp.frequency);
      wl.start();
      amb.nodes.push(wl);
    }
    if (m.amb.includes('rain') && m.amb.includes('wind')) loop('lowpass', 350, 0.12, 1, 0.7); // tormenta: retumbo grave
    this.#amb = amb;
  }

  #tick() {
    const c = this.ctx;
    if (c.state !== 'running') return;
    const horizon = c.currentTime + 0.35;
    const L = this.#layer; // null mientras suena una canción tuya
    const spb = L ? 60 / (L.style.bpm * (L.style === STYLES.explore ? L.mood.tempo : 1)) : 0;
    while (L && L.nextBeat < horizon) {
      const meter = L.style.meter;
      L.style.beat({ s: this, out: L.out, soft: L.soft, t: L.nextBeat, beat: L.beat, bar: Math.floor(L.beat / meter), inBar: L.beat % meter, spb, mood: L.mood, st: L.st, layer: L });
      L.nextBeat += spb;
      L.beat++;
    }
    // Ambiente puntual, cada medio segundo
    const A = this.#amb;
    while (A && A.nextBeat < horizon) {
      const t = A.nextBeat;
      if (A.m.amb.includes('fire')) for (let i = 0; i < 2; i++) if (Math.random() < 0.6) crackle(this, A.out, t + Math.random() * 0.5);
      if (A.m.amb.includes('bubbles') && Math.random() < 0.5) bubble(this, A.out, t + Math.random() * 0.5);
      if (A.m.amb.includes('owl') && Math.random() < 0.012) owl(this, A.out, t);
      A.nextBeat += 0.5;
    }
  }
}

// ------------------------------------------------------------------------------------------ efectos

const SFX = {
  /** Cambio de pantalla: ráfaga de aire. */
  whoosh(s, t) {
    noiseHit(s, s.sfxBus, t, { freq: 300, sweepTo: 2600, q: 1.2, peak: 0.25, attack: 0.25, decay: 0.45 });
  },
  /** Intro de sección: gong grave. */
  gong(s, t) {
    for (const [r, g, d] of [
      [1, 0.25, 4],
      [2.76, 0.12, 2.6],
      [5.4, 0.06, 1.6],
      [8.93, 0.03, 0.9],
    ])
      tone(s, s.sfxBus, { freq: 82 * r, t, attack: 0.01, peak: g, decay: d });
    tone(s, s.sfxBus, { freq: 60, slideTo: 38, slideTime: 0.5, t, peak: 0.4, decay: 1.2 });
    noiseHit(s, s.sfxBus, t, { type: 'lowpass', freq: 900, peak: 0.12, decay: 0.4 });
  },
  /** Se abre el turno: acorde que sube. */
  go(s, t) {
    [69, 73, 76, 81].forEach((m, i) => tone(s, s.sfxBus, { type: 'triangle', freq: mtof(m), t: t + i * 0.035, peak: 0.12, decay: 0.5 }));
    noiseHit(s, s.sfxBus, t, { type: 'highpass', freq: 4000, peak: 0.1, decay: 0.15 });
  },
  /** Alguien ha pulsado. */
  buzz(s, t) {
    tone(s, s.sfxBus, { type: 'square', freq: 880, slideTo: 440, slideTime: 0.12, t, peak: 0.12, decay: 0.25 });
    tone(s, s.sfxBus, { freq: 110, slideTo: 45, slideTime: 0.2, t, peak: 0.5, decay: 0.35 });
    noiseHit(s, s.sfxBus, t, { freq: 2500, q: 0.8, peak: 0.2, decay: 0.12 });
  },
  /** ¡Correcto! Arpegio mayor brillante. */
  correct(s, t) {
    [72, 76, 79, 84, 88].forEach((m, i) => bell(s, s.sfxBus, mtof(m), t + i * 0.07, { gain: 0.14, decay: 1.4 }));
    noiseHit(s, s.sfxBus, t + 0.3, { type: 'highpass', freq: 6000, peak: 0.06, attack: 0.2, decay: 1 });
  },
  /** Fallo: lamento que baja, desafinado. */
  wrong(s, t) {
    for (const det of [-25, 25]) {
      tone(s, s.sfxBus, { type: 'sawtooth', freq: 311, slideTo: 233, slideTime: 0.35, t, peak: 0.07, decay: 0.4, detune: det });
      tone(s, s.sfxBus, { type: 'sawtooth', freq: 233, slideTo: 147, slideTime: 0.7, t: t + 0.4, peak: 0.07, decay: 0.8, detune: det });
    }
  },
  /** Tictac de los últimos segundos. */
  tick(s, t) {
    tone(s, s.sfxBus, { freq: 1500, t, peak: 0.15, decay: 0.04 });
    noiseHit(s, s.sfxBus, t, { freq: 3000, q: 5, peak: 0.08, decay: 0.02 });
  },
  /** Cuenta atrás de salida (3, 2, 1). */
  count(s, t) {
    tone(s, s.sfxBus, { type: 'triangle', freq: 660, t, peak: 0.16, decay: 0.25 });
  },
  /** Se acaba el tiempo / ronda cerrada. */
  bell(s, t) {
    bell(s, s.sfxBus, 523, t, { gain: 0.22, decay: 2.5 });
    bell(s, s.sfxBus, 784, t + 0.01, { gain: 0.1, decay: 2 });
  },
  /** Llega una respuesta. */
  blip(s, t) {
    tone(s, s.sfxBus, { type: 'triangle', freq: 1100 + Math.random() * 300, t, peak: 0.06, decay: 0.09 });
  },
  /** Aparece una fila en un revelado con suspense. */
  pop(s, t) {
    tone(s, s.sfxBus, { type: 'triangle', freq: 520, slideTo: 780, slideTime: 0.06, t, peak: 0.13, decay: 0.14 });
    thump(s, s.sfxBus, t, 0.25);
  },
  /** Subida de tensión antes de revelar. */
  riser(s, t) {
    noiseHit(s, s.sfxBus, t, { freq: 400, sweepTo: 5000, q: 2, peak: 0.12, attack: 1.2, decay: 0.15 });
    tone(s, s.sfxBus, { type: 'sawtooth', freq: 110, slideTo: 440, slideTime: 1.3, t, attack: 1.2, peak: 0.05, decay: 0.12 });
  },
  /** Golpe del revelado. */
  hit(s, t) {
    tone(s, s.sfxBus, { freq: 70, slideTo: 32, slideTime: 0.4, t, peak: 0.6, decay: 0.8 });
    noiseHit(s, s.sfxBus, t, { type: 'highpass', freq: 3000, peak: 0.18, decay: 1.2 });
  },
  /** Eliminado (Reflejos en rojo, Libre). */
  out(s, t) {
    tone(s, s.sfxBus, { type: 'square', freq: 196, slideTo: 98, slideTime: 0.3, t, peak: 0.08, decay: 0.35 });
    thump(s, s.sfxBus, t, 0.45);
  },
  /** Relámpago: trueno grave que retumba. */
  thunder(s, t) {
    noiseHit(s, s.sfxBus, t, { type: 'lowpass', freq: 1400, sweepTo: 120, peak: 0.35, attack: 0.02, decay: 2.8 });
    noiseHit(s, s.sfxBus, t + 0.25, { type: 'lowpass', freq: 300, peak: 0.25, attack: 0.1, decay: 2.2 });
  },
  /** Comodines: 50:50 (dos golpes que se apagan), público (murmullo) y llamada (timbre de teléfono). */
  fifty(s, t) {
    tone(s, s.sfxBus, { type: 'square', freq: 440, slideTo: 220, slideTime: 0.15, t, peak: 0.08, decay: 0.2 });
    tone(s, s.sfxBus, { type: 'square', freq: 440, slideTo: 220, slideTime: 0.15, t: t + 0.25, peak: 0.08, decay: 0.2 });
  },
  audience(s, t) {
    noiseHit(s, s.sfxBus, t, { freq: 700, q: 0.6, peak: 0.12, attack: 0.3, decay: 1.2 });
    bell(s, s.sfxBus, 660, t + 0.2, { gain: 0.08, decay: 1 });
  },
  call(s, t) {
    for (let r = 0; r < 2; r++) for (let i = 0; i < 12; i++) tone(s, s.sfxBus, { freq: i % 2 ? 480 : 440, t: t + r * 0.6 + i * 0.03, peak: 0.06, decay: 0.03 });
  },
  /** El pañuelo: aullido de lobo (sube, aguanta y cae, con vibrato de dos voces desafinadas). */
  howl(s, t) {
    for (const det of [-9, 9]) {
      tone(s, s.sfxBus, { type: 'sine', freq: 280, slideTo: 540, slideTime: 0.7, t, attack: 0.35, peak: 0.1, decay: 1.5, detune: det });
      tone(s, s.sfxBus, { type: 'triangle', freq: 540, slideTo: 330, slideTime: 1.1, t: t + 0.85, attack: 0.08, peak: 0.08, decay: 1.4, detune: det });
    }
  },
  /** El pañuelo: siseo de vampiro y chillido de murciélago. */
  hiss(s, t) {
    noiseHit(s, s.sfxBus, t, { type: 'highpass', freq: 4500, peak: 0.14, attack: 0.06, decay: 0.7 });
    for (let i = 0; i < 3; i++) tone(s, s.sfxBus, { type: 'square', freq: 2100, slideTo: 3200, slideTime: 0.05, t: t + 0.35 + i * 0.09, peak: 0.03, decay: 0.06 });
  },
  /** El pañuelo: silbato de salida (dos pitidos). */
  whistle(s, t) {
    for (const [at, dur] of [
      [0, 0.12],
      [0.18, 0.45],
    ]) {
      tone(s, s.sfxBus, { type: 'square', freq: 2850, t: t + at, attack: 0.01, peak: 0.045, decay: dur });
      noiseHit(s, s.sfxBus, t + at, { freq: 2900, q: 6, peak: 0.08, decay: dur });
    }
  },
  /** Redoble de caja antes de un revelado (2,4 s, crece hasta el golpe). */
  drumroll(s, t) {
    for (let i = 0; i < 40; i++) snare(s, s.sfxBus, t + i * 0.06, 0.015 + i * 0.0028);
  },
  /** Marcador: redoble corto. */
  roll(s, t) {
    for (let i = 0; i < 14; i++) noiseHit(s, s.sfxBus, t + i * 0.055, { freq: 1800, q: 1.5, peak: 0.05 + i * 0.008, decay: 0.05 });
    tone(s, s.sfxBus, { freq: 80, slideTo: 40, slideTime: 0.3, t: t + 0.8, peak: 0.4, decay: 0.5 });
  },
  /** Final y grandes victorias: fanfarria (menor → mayor). */
  fanfare(s, t) {
    const chords = [
      [57, 60, 64],
      [53, 57, 60],
      [55, 59, 62],
      [57, 61, 64, 69],
    ];
    chords.forEach((ch, i) => {
      const at = t + i * 0.32;
      const dur = i === chords.length - 1 ? 2.2 : 0.3;
      for (const m of ch) {
        for (const det of [-6, 6]) tone(s, s.sfxBus, { type: 'sawtooth', freq: mtof(m), t: at, attack: 0.03, peak: 0.035, decay: dur, detune: det });
      }
      tone(s, s.sfxBus, { freq: mtof(ch[0] - 24), slideTo: mtof(ch[0] - 24) * 0.7, slideTime: 0.2, t: at, peak: 0.35, decay: 0.4 });
    });
    noiseHit(s, s.sfxBus, t + 0.96, { type: 'highpass', freq: 5000, peak: 0.12, decay: 2 });
  },
};

export const sound = new SoundEngine();
