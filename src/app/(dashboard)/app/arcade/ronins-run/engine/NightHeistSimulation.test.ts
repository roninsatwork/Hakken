import { describe, expect, it } from 'vitest';
import { clearPath, distance, EXIT, isWalkable, PATROLS, PLAYER_START, SEALS, TREASURE } from './MapData';
import { findPath } from './Navigation';
import { NightHeistSimulation, RULES } from './NightHeistSimulation';

// These integration checks play a whole map. Coverage on the two-core CI
// runner can exceed Vitest's 5s unit-test default without a gameplay failure.
const FULL_MAP_TIMEOUT_MS = 30_000;
const idle = { x: 0, y: 0, dash: false };
function advance(game: NightHeistSimulation, seconds: number, input = idle) {
  for (let i = 0; i < seconds * 60; i++) game.update(1 / 60, input);
}

describe('courtyard navigation', () => {
  it('places every spawn, objective and patrol on walkable ground', () => {
    const points = [PLAYER_START, EXIT, TREASURE, ...SEALS, ...PATROLS.flat()];
    expect(points.filter((p) => !isWalkable(p, 6))).toEqual([]);
  });
  it('connects every objective to the entrance with collision-safe paths', () => {
    for (const target of [...SEALS, TREASURE, EXIT]) {
      const path = findPath(PLAYER_START, target);
      expect(path.length, JSON.stringify(target)).toBeGreaterThan(0);
      let previous = PLAYER_START;
      for (const point of path) {
        expect(clearPath(previous, point, 5)).toBe(true);
        previous = point;
      }
    }
  });
  it('rejects travel across the canal and outside the map', () => {
    expect(isWalkable({ x: 856, y: 756 })).toBe(false);
    expect(findPath(PLAYER_START, { x: -5, y: 20 })).toEqual([]);
    expect(clearPath({ x: 740, y: 565 }, { x: 970, y: 280 })).toBe(false);
  });
  it('physically traverses every objective route without snagging on corners', () => {
    const game = new NightHeistSimulation();
    game.start();
    game.enemies = [];
    for (const target of [SEALS[0], SEALS[2], TREASURE, SEALS[1], EXIT]) {
      game.moveTo(target);
      for (
        let frame = 0;
        frame < 1800 && game.status === 'playing' && distance(game.player.pos, target) > 27;
        frame++
      )
        game.update(1 / 60, idle);
      expect(distance(game.player.pos, target), JSON.stringify({ target, at: game.player.pos })).toBeLessThan(
        target === EXIT ? 35 : 28,
      );
    }
    expect(game.status).toBe('escaped');
  }, FULL_MAP_TIMEOUT_MS);
});
describe('Night Heist rules', () => {
  it('does not advance in ready or paused states and resets a retry', () => {
    const game = new NightHeistSimulation();
    advance(game, 1, { x: 1, y: 0, dash: false });
    expect(game.player.pos).toEqual(PLAYER_START);
    game.start();
    advance(game, 0.4, { x: 1, y: 0, dash: false });
    game.pause();
    const snapshot = game.snapshot();
    advance(game, 4);
    expect(game.snapshot()).toEqual(snapshot);
    game.start();
    expect(game.elapsed).toBe(0);
    expect(game.player.pos).toEqual(PLAYER_START);
  });
  it('normalizes diagonals and blocks both ordinary movement and dash at walls', () => {
    const game = new NightHeistSimulation();
    game.start();
    game.enemies = [];
    const before = { ...game.player.pos };
    advance(game, 0.2, { x: 1, y: 1, dash: false });
    expect(distance(before, game.player.pos)).toBeCloseTo(RULES.speed * 0.2, 1);
    advance(game, 5, { x: 0, y: 1, dash: true });
    expect(isWalkable(game.player.pos, 6)).toBe(true);
    expect(game.cooldown).toBeGreaterThan(0);
    expect(game.decoy).toBeNull();
  });
  it('collects each seal once and locks extraction until all three are collected', () => {
    const game = new NightHeistSimulation();
    game.start();
    game.enemies = [];
    game.player.pos = { ...EXIT };
    advance(game, 0.1);
    expect(game.status).toBe('playing');
    for (const seal of SEALS) {
      game.player.pos = { ...seal };
      advance(game, 0.1);
      advance(game, 0.1);
    }
    expect(game.seals.size).toBe(3);
    expect(game.sounds.filter((s) => s === 'seal')).toHaveLength(3);
    game.player.pos = { ...EXIT };
    advance(game, 0.1);
    expect(game.status).toBe('escaped');
    const result = { ...game.result };
    advance(game, 1);
    expect(game.result).toEqual(result);
  });
  it('keeps terminal outcomes singular even when multiple enemies overlap', () => {
    const game = new NightHeistSimulation();
    game.start();
    game.enemies.forEach((e) => (e.pos = { ...game.player.pos }));
    advance(game, 0.2);
    expect(game.status).toBe('caught');
    expect(game.sounds.filter((s) => s === 'caught')).toHaveLength(1);
    expect(game.result?.score).toBe(0);
  });
  it('uses decoys once per cooldown and distracts nearby enemies', () => {
    const game = new NightHeistSimulation();
    game.start();
    game.enemies = game.enemies.slice(0, 1);
    game.enemies[0].pos = { x: 330, y: 626 };
    game.update(1 / 60, { x: 1, y: 0, dash: true });
    expect(game.enemies[0].mode).toBe('decoy');
    const id = game.decoy?.id;
    game.update(1 / 60, { x: 1, y: 0, dash: true });
    expect(game.decoy?.id).toBe(id);
    expect(game.cooldown).toBeGreaterThan(5);
  });
  it('does not see through scenery or behind a guard outside its near radius', () => {
    const game = new NightHeistSimulation();
    const guard = game.enemies[0];
    guard.pos = { x: 500, y: 463 };
    guard.facing = { x: 1, y: 0 };
    expect(game.canSee(guard, { x: 430, y: 490 })).toBe(false);
    expect(game.canSee(guard, { x: 575, y: 444 })).toBe(true);
    expect(game.canSee(guard, { x: 539, y: 305 })).toBe(false);
  });
  it('follows a recent scent and gives the decoy priority over the trail', () => {
    const game = new NightHeistSimulation();
    game.start();
    const hound = game.enemies[2];
    game.enemies = [hound];
    game.elapsed = 3;
    game.trail = [{ pos: { x: 520, y: 480 }, time: 1 }];
    game.update(1 / 60, idle);
    expect(hound.target).toEqual({ x: 520, y: 480 });
    game.decoy = { pos: { x: 590, y: 465 }, facing: { x: 1, y: 0 }, age: 0, id: 99 };
    game.update(1 / 60, idle);
    expect(hound.mode).toBe('decoy');
    expect(hound.target).toEqual(game.decoy.pos);
    game.elapsed = 11;
    game.update(1 / 60, idle);
    expect(game.trail).toEqual([]);
  });
  it('can complete the full route with live patrols and timed decoys', () => {
    const game = new NightHeistSimulation();
    game.start();
    const route = [SEALS[0], SEALS[2], TREASURE, SEALS[1], EXIT];
    let goal = 0;
    game.moveTo(route[goal]);
    for (let frame = 0; frame < 18000 && game.status === 'playing'; frame++) {
      if (distance(game.player.pos, route[goal]) < 27 && goal < route.length - 1) game.moveTo(route[++goal]);
      const danger = game.enemies.some(
        (e) => distance(e.pos, game.player.pos) < 100 && clearPath(e.pos, game.player.pos),
      );
      game.update(1 / 60, { ...idle, dash: danger && game.cooldown === 0 });
    }
    expect(game.status, JSON.stringify({ goal, position: game.player.pos, time: game.elapsed })).toBe(
      'escaped',
    );
    expect(game.result).toMatchObject({ seals: 3, treasure: true });
    expect(game.elapsed).toBeLessThan(180);
  });
});
