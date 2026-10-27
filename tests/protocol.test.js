import { describe, expect, it } from 'vitest';
import { MSG, PROTOCOL_VERSION, parseHostMessage, parsePlayerMessage } from '../src/shared/protocol.js';
import { CONNECTION_OPTIONS } from '../src/shared/peerConfig.js';

describe('protocolo', () => {
  it('acepta un hello válido y descarta campos desconocidos', () => {
    const msg = parsePlayerMessage({ t: MSG.HELLO, v: PROTOCOL_VERSION, playerId: 'abc', name: 'Ana', color: 'rojo', icon: 'zorro', extra: 1 });
    expect(msg).toEqual({ t: 'hello', v: PROTOCOL_VERSION, role: 'player', playerId: 'abc', name: 'Ana', color: 'rojo', icon: 'zorro', teamId: null, presenter: false });
    // desde el mando del presentador (pestaña «Jugar»)
    expect(parsePlayerMessage({ t: MSG.HELLO, v: PROTOCOL_VERSION, playerId: 'abc', presenter: true }).presenter).toBe(true);
    expect(parsePlayerMessage({ t: MSG.HELLO, v: PROTOCOL_VERSION, playerId: 'abc', presenter: 'sí' }).presenter).toBe(false);
  });

  it('rechaza mensajes mal formados', () => {
    expect(parsePlayerMessage(null)).toBeNull();
    expect(parsePlayerMessage('hola')).toBeNull();
    expect(parsePlayerMessage({ t: MSG.HELLO, v: 1 })).toBeNull();
    expect(parsePlayerMessage({ t: MSG.HELLO, v: 1, playerId: 'x'.repeat(65) })).toBeNull();
    expect(parsePlayerMessage({ t: MSG.HB_ACK, h0: 'ayer' })).toBeNull();
    expect(parsePlayerMessage({ t: 'desconocido' })).toBeNull();
  });

  it('recorta textos demasiado largos', () => {
    const msg = parsePlayerMessage({ t: MSG.PROFILE, name: 'x'.repeat(500), color: 1 });
    expect(msg.name).toHaveLength(64);
    expect(msg.color).toBe('');
  });

  it('valida pulsaciones', () => {
    expect(parsePlayerMessage({ t: MSG.BUZZ, seq: 1, epoch: 4, x: 1 })).toEqual({
      t: 'buzz',
      seq: 1,
      epoch: 4,
      tLocal: undefined,
      offset: undefined,
      err: undefined,
    });
    expect(parsePlayerMessage({ t: MSG.BUZZ, seq: 1, epoch: 4, tLocal: 10.5, offset: -3, err: 'x' })).toMatchObject({
      tLocal: 10.5,
      offset: -3,
      err: undefined,
    });
    expect(parsePlayerMessage({ t: MSG.BUZZ, seq: 1 })).toBeNull();
    expect(parseHostMessage({ t: MSG.BUZZ_ACK, seq: 1, result: 'ok' })).not.toBeNull();
    expect(parseHostMessage({ t: MSG.BUZZ_ACK, seq: 1 })).toBeNull();
  });

  it('valida respuestas y comodines', () => {
    expect(parsePlayerMessage({ t: MSG.ANSWER, seq: 1, roundId: 'r', value: 2, tLocal: 5 })).toMatchObject({ value: 2, tLocal: 5, offset: undefined });
    expect(parsePlayerMessage({ t: MSG.ANSWER, seq: 1, roundId: 'r', value: 'ana' }).value).toBe('ana');
    expect(parsePlayerMessage({ t: MSG.ANSWER, seq: 1, roundId: 'r', value: { x: 1 } })).toBeNull();
    expect(parsePlayerMessage({ t: MSG.ANSWER, seq: 1, value: 1 })).toBeNull();
    expect(parsePlayerMessage({ t: MSG.JOKER, seq: 1, roundId: 'r', kind: 'fifty' })).toEqual({ t: 'joker', seq: 1, roundId: 'r', kind: 'fifty' });
    expect(parseHostMessage({ t: MSG.ANSWER_ACK, seq: 1, result: 'ok' })).not.toBeNull();
    expect(parsePlayerMessage({ t: MSG.FREE_COUNT, seq: 2, roundId: 'f', delta: -1 })).toEqual({ t: 'freeCount', seq: 2, roundId: 'f', delta: -1 });
    expect(parsePlayerMessage({ t: MSG.FREE_COUNT, seq: 2, roundId: 'f', delta: 5 })).toBeNull();
  });

  it('valida la sincronización', () => {
    expect(parsePlayerMessage({ t: MSG.SYNC, id: 3, t0: 12.5 })).toEqual({ t: 'sync', id: 3, t0: 12.5 });
    expect(parsePlayerMessage({ t: MSG.SYNC, id: 3 })).toBeNull();
    expect(parsePlayerMessage({ t: MSG.SYNC_REPORT, offset: 100, err: 4 })).toEqual({ t: 'syncReport', offset: 100, err: 4, rtt: 8, samples: 0 });
    expect(parseHostMessage({ t: MSG.SYNC_REPLY, id: 1, t0: 1, t1: 2, t2: 3 })).not.toBeNull();
    expect(parseHostMessage({ t: MSG.SYNC_REPLY, id: 1, t0: 1, t1: 2 })).toBeNull();
  });

  it('valida el saludo y las órdenes del mando', () => {
    expect(parsePlayerMessage({ t: MSG.HELLO, v: 2, role: 'control', controlId: 'c1', token: 'k', deviceName: 'Móvil' })).toEqual({
      t: 'hello',
      v: 2,
      role: 'control',
      controlId: 'c1',
      token: 'k',
      deviceName: 'Móvil',
    });
    expect(parsePlayerMessage({ t: MSG.HELLO, v: 2, role: 'control' })).toBeNull();
    expect(parsePlayerMessage({ t: MSG.CMD, id: 1, action: 'next' })).toEqual({ t: 'cmd', id: 1, action: 'next', args: {} });
    expect(parsePlayerMessage({ t: MSG.CMD, id: 1, action: 'adjustScore', args: { playerId: 'p', delta: -1 } }).args).toEqual({ playerId: 'p', delta: -1 });
    expect(parsePlayerMessage({ t: MSG.CMD, id: 1, action: 'x', args: { evil: { nested: 1 } } })).toBeNull();
    expect(parsePlayerMessage({ t: MSG.CMD, id: 1, action: 'x', args: [1] })).toBeNull();
    expect(parseHostMessage({ t: MSG.CONTROL_STATE, view: {} })).not.toBeNull();
    expect(parseHostMessage({ t: MSG.CMD_RESULT, id: 1, ok: false, error: 'no' })).not.toBeNull();
  });

  it('valida mensajes del presentador', () => {
    expect(parseHostMessage({ t: MSG.HB, h0: 12.5 })).not.toBeNull();
    expect(parseHostMessage({ t: MSG.STATE })).toBeNull();
    expect(parseHostMessage({ t: MSG.STATE, you: {} })).not.toBeNull();
    expect(parseHostMessage({ t: MSG.ERROR, code: 'room-full' })).not.toBeNull();
  });

  it('los mensajes grandes se trocean (con «json», PeerJS corta a partir de 16 300 bytes)', () => {
    // Una foto de la cara ya pasa de 16 KB: con «json» la conexión se cortaba y quien tenía foto no podía entrar.
    expect(CONNECTION_OPTIONS.serialization).toBe('binary');
    expect(CONNECTION_OPTIONS.reliable).toBe(true);
  });

  it('juegos (play): el valor es un número o unos pocos números', () => {
    const play = (value) => parsePlayerMessage({ t: MSG.PLAY, seq: 1, game: 'squid', roundId: 'r', action: 'trace', value });
    expect(play(3)?.value).toBe(3);
    expect(play([40, 1, 0])?.value).toEqual([40, 1, 0]);
    expect(play([1, 2, 3, 4, 5])).toBeNull();
    expect(play(['x'])).toBeNull();
    expect(play('hola')).toBeNull();
  });
});
