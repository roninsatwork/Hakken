import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NightHeistRenderer } from './NightHeistRenderer';
import { NightHeistSimulation } from './NightHeistSimulation';

describe('Ronin sprite rendering', () => {
  afterEach(() => vi.restoreAllMocks());

  it('preserves frame scale and authored ground origins through compression', () => {
    const drawImage = vi.fn();
    const ctx = new Proxy(
      {
        drawImage,
        createRadialGradient: () => ({ addColorStop: vi.fn() }),
      },
      { get: (target, key) => Reflect.get(target, key) ?? vi.fn() },
    );
    const canvas = document.createElement('canvas');
    Object.defineProperty(canvas, 'clientWidth', { value: 1586 });
    vi.spyOn(canvas, 'getContext').mockReturnValue(ctx as never);
    const frames = Array.from({ length: 16 }, (_, i) => ({
      x: i * 120,
      y: 0,
      width: 120,
      height: i === 1 ? 170 : 200,
      anchorX: 50,
      anchorY: i === 1 ? 174 : 180,
    }));
    const assets = {
      background: new Image(),
      ronin: new Image(),
      idle: new Image(),
      patrols: new Image(),
      treasure: new Image(),
      atlas: {
        ronin: { referenceHeight: 200, frames },
        idle: { referenceHeight: 220, frames: frames.slice(0, 2) },
        patrols: { frames },
        treasure: { frames: frames.slice(0, 2) },
      },
    };
    const renderer = new NightHeistRenderer(canvas, assets, {
      exit: 'Exit',
      locked: 'Locked',
      seal: 'Seal',
      treasure: 'Treasure',
      spirit: 'Spirit Power',
    });
    const game = new NightHeistSimulation();
    game.enemies = [];
    game.player.facing = { x: 1, y: 1 };
    game.player.moving = true;
    renderer.render(game, 0, true);
    const contact = drawImage.mock.calls.find((call) => call[0] === assets.ronin)!;
    drawImage.mockClear();
    game.player.stride = 20;
    renderer.render(game, 1, true);
    const compression = drawImage.mock.calls.find((call) => call[0] === assets.ronin)!;
    expect(contact[7] / contact[3]).toBeCloseTo(76 / 200);
    expect(compression[7] / compression[3]).toBeCloseTo(76 / 200);
    expect(contact[8]).toBeCloseTo(76);
    expect(compression[8]).toBeCloseTo(64.6);
    expect(contact[6]).toBeCloseTo((-180 * 76) / 200);
    expect(compression[6]).toBeCloseTo((-174 * 76) / 200);
    drawImage.mockClear();
    game.player.moving = false;
    renderer.render(game, 2, true);
    expect(drawImage.mock.calls.some((call) => call[0] === assets.idle)).toBe(true);
    expect(drawImage.mock.calls.some((call) => call[0] === assets.ronin)).toBe(false);
  });

  it('keeps every selected frame inside its real transparent source image', () => {
    const root = 'public/games/ronins-run/';
    const atlas = JSON.parse(readFileSync(root + 'atlas.json', 'utf8'));
    for (const key of ['ronin', 'idle']) {
      const sheet = atlas[key];
      const png = readFileSync(root + sheet.file);
      expect(png.readUInt32BE(16)).toBe(sheet.width);
      expect(png.readUInt32BE(20)).toBe(sheet.height);
      expect(png[25]).toBe(6); // RGBA, not an RGB checkerboard stand-in.
      expect(sheet.referenceHeight).toBeGreaterThan(0);
      for (const frame of sheet.frames) {
        expect(frame.x).toBeGreaterThanOrEqual(0);
        expect(frame.y).toBeGreaterThanOrEqual(0);
        expect(frame.x + frame.width).toBeLessThanOrEqual(sheet.width);
        expect(frame.y + frame.height).toBeLessThanOrEqual(sheet.height);
        expect(Number.isFinite(frame.anchorY)).toBe(true);
      }
    }
  });
});

it('keeps the flame, aura and downed patrols distinct with reduced motion', () => {
  const calls = {
    drawImage: vi.fn(),
    fillText: vi.fn(),
    rotate: vi.fn(),
    ellipse: vi.fn(),
    bezierCurveTo: vi.fn(),
  };
  const ctx = new Proxy(
    { ...calls, createRadialGradient: () => ({ addColorStop: vi.fn() }) },
    { get: (target, key) => Reflect.get(target, key) ?? vi.fn() },
  );
  const canvas = document.createElement('canvas');
  Object.defineProperty(canvas, 'clientWidth', { value: 1586 });
  const spy = vi.spyOn(canvas, 'getContext').mockReturnValue(ctx as never);
  const atlas = JSON.parse(readFileSync('public/games/ronins-run/atlas.json', 'utf8'));
  const assets = {
    background: new Image(),
    ronin: new Image(),
    idle: new Image(),
    patrols: new Image(),
    treasure: new Image(),
    atlas,
  };
  const renderer = new NightHeistRenderer(canvas, assets, {
    exit: 'Exit',
    locked: 'Locked',
    seal: 'Seal',
    treasure: 'Treasure',
    spirit: 'Spirit Power',
  });
  const game = new NightHeistSimulation();
  renderer.render(game, 1, true);
  expect(calls.fillText.mock.calls.some((call) => call[0] === 'Spirit Power')).toBe(true);
  expect(calls.bezierCurveTo).toHaveBeenCalledTimes(3);
  Object.values(calls).forEach((fn) => fn.mockClear());
  game.spiritCollected = true;
  game.spiritTime = 8;
  game.enemies.forEach((enemy) => {
    enemy.mode = 'disabled';
    enemy.disabledAt = 0;
  });
  game.elapsed = 1;
  renderer.render(game, 5, true);
  expect(calls.fillText.mock.calls.some((call) => call[0] === 'Spirit Power')).toBe(false);
  expect(calls.bezierCurveTo).not.toHaveBeenCalled();
  expect(calls.rotate).toHaveBeenCalledTimes(2);
  expect(calls.fillText.mock.calls.filter((call) => call[0] === '✦')).toHaveLength(9);
  const sparks = calls.fillText.mock.calls.map((call) => [...call]);
  calls.fillText.mockClear();
  renderer.render(game, 20, true);
  expect(calls.fillText.mock.calls).toEqual(sparks);
  expect(calls.ellipse.mock.calls.some((call) => call[2] === 26 && call[3] === 11)).toBe(true);
  spy.mockRestore();
});
