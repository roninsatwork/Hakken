import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GameEngine } from './GameEngine';
import { EXIT } from './MapData';

const mock = vi.hoisted(() => ({
  load: vi.fn(),
  render: vi.fn(),
  audioStart: vi.fn(),
  audioPause: vi.fn(),
  audioDispose: vi.fn(),
  stopMusic: vi.fn(),
}));
vi.mock('./NightHeistRenderer', () => ({
  loadGameAssets: mock.load,
  NightHeistRenderer: class {
    render = mock.render;
    refreshColors = vi.fn();
    setLabels = vi.fn();
  },
}));
vi.mock('./AudioEngine', () => ({
  AudioEngine: class {
    start = mock.audioStart;
    pause = mock.audioPause;
    dispose = mock.audioDispose;
    stopMusic = mock.stopMusic;
    play = vi.fn();
    setThreat = vi.fn();
    setMuted = vi.fn();
    setVolume = vi.fn();
  },
}));

describe('Night Heist engine input and lifecycle', () => {
  let canvas: HTMLCanvasElement;
  let engine: GameEngine;
  let now: number;
  let frameId: number;
  let frames: Map<number, FrameRequestCallback>;
  const labels = {
    exit: 'Exit',
    locked: 'Locked',
    seal: 'Seal',
    treasure: 'Treasure',
    spirit: 'Spirit Power',
  };
  const onResult = vi.fn();
  function advance(ms = 20) {
    now += ms;
    const pending = [...frames.values()];
    frames.clear();
    pending.forEach((callback) => callback(now));
  }
  function key(value: string, repeat = false) {
    canvas.dispatchEvent(new KeyboardEvent('keydown', { key: value, repeat, bubbles: true }));
  }
  beforeEach(() => {
    vi.clearAllMocks();
    mock.load.mockResolvedValue({});
    now = 0;
    frameId = 0;
    frames = new Map();
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.set(++frameId, callback);
      return frameId;
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
    canvas = document.createElement('canvas');
    canvas.tabIndex = 0;
    document.body.append(canvas);
    engine = new GameEngine(canvas, { onSnapshot: vi.fn(), onResult });
  });
  afterEach(() => {
    engine.dispose();
    document.body.replaceChildren();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('releases held movement and a queued dash when focus leaves the canvas', async () => {
    await engine.load(labels);
    engine.start();
    const start = { ...engine.simulation.player.pos };
    key('d');
    advance();
    expect(engine.simulation.player.pos.x).toBeGreaterThan(start.x);
    const stopped = { ...engine.simulation.player.pos };
    key(' ');
    const button = document.createElement('button');
    document.body.append(button);
    button.focus();
    advance(100);
    expect(engine.simulation.player.pos).toEqual(stopped);
    expect(engine.simulation.cooldown).toBe(0);
  });

  it('does not carry keyboard input or a queued dash across pause and resume', async () => {
    await engine.load(labels);
    engine.start();
    key('d');
    key(' ');
    engine.pause();
    key('a');
    key(' ');
    engine.resume();
    const start = { ...engine.simulation.player.pos };
    advance();
    expect(engine.simulation.player.pos).toEqual(start);
    expect(engine.simulation.cooldown).toBe(0);
  });

  it('pauses when the window loses focus and never catches up background time', async () => {
    await engine.load(labels);
    engine.start();
    key('d');
    window.dispatchEvent(new Event('blur'));
    advance(60_000);
    expect(engine.simulation.status).toBe('paused');
    expect(engine.simulation.elapsed).toBe(0);
    expect(mock.audioPause).toHaveBeenCalledOnce();
    engine.resume();
    advance();
    expect(engine.simulation.elapsed).toBeCloseTo(1 / 60);
  });

  it('pauses when the document becomes hidden', async () => {
    await engine.load(labels);
    engine.start();
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(engine.simulation.status).toBe('paused');
    expect(mock.audioPause).toHaveBeenCalledOnce();
  });

  it('ignores repeat dashes and secondary clicks, but accepts the primary pointer', async () => {
    await engine.load(labels);
    engine.start();
    key(' ', true);
    advance();
    expect(engine.simulation.cooldown).toBe(0);
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 1586,
      height: 992,
    } as DOMRect);
    canvas.dispatchEvent(new MouseEvent('pointerdown', { button: 2, clientX: 235, clientY: 248 }));
    expect(engine.simulation.destination).toHaveLength(0);
    canvas.dispatchEvent(new MouseEvent('pointerdown', { button: 0, clientX: 235, clientY: 248 }));
    expect(engine.simulation.destination.length).toBeGreaterThan(0);
    key(' ');
    advance();
    expect(engine.simulation.cooldown).toBeGreaterThan(0);
  });

  it('publishes a terminal result once and does not restart audio after the result', async () => {
    await engine.load(labels);
    engine.start();
    engine.simulation.seals = new Set([0, 1, 2]);
    engine.simulation.player.pos = { ...EXIT };
    advance();
    advance();
    engine.resume();
    expect(onResult).toHaveBeenCalledOnce();
    expect(onResult.mock.calls[0][0]).toMatchObject({
      outcome: 'escaped',
      seals: 3,
    });
    expect(mock.stopMusic).toHaveBeenCalledOnce();
    expect(mock.audioStart).toHaveBeenCalledOnce();
  });

  it('removes frame callbacks and input listeners on disposal', async () => {
    await engine.load(labels);
    engine.start();
    engine.dispose();
    key('Escape');
    engine.resume();
    engine.start();
    advance();
    expect(frames.size).toBe(0);
    expect(engine.simulation.status).toBe('playing');
    expect(engine.simulation.elapsed).toBe(0);
    expect(mock.audioStart).toHaveBeenCalledOnce();
    expect(mock.audioDispose).toHaveBeenCalledOnce();
  });

  it('does not install a renderer or listeners when disposed during artwork loading', async () => {
    let finish!: (assets: object) => void;
    mock.load.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const loading = engine.load(labels);
    engine.dispose();
    finish({});
    await loading;
    advance();
    expect(frames.size).toBe(0);
    expect(mock.render).not.toHaveBeenCalled();
  });
});
