import { describe, expect, it } from 'vitest';
import { LEVELS } from './Levels';
import { ACTOR_RADIUS, clearPath, distance, isWalkable } from './MapData';
import { navigationFor } from './Navigation';
import { NightHeistSimulation } from './NightHeistSimulation';

for (const level of LEVELS)
  describe(level.id, () => {
    it('places every objective and patrol on reachable painted ground', () => {
      const points = [
        level.start,
        level.exit,
        level.treasure,
        level.spirit,
        ...level.seals,
        ...level.patrols.flatMap((p) => p.route),
      ];
      expect(points.filter((p) => !isWalkable(p, ACTOR_RADIUS, level))).toEqual([]);
      const nav = navigationFor(level);
      for (const target of points) {
        const path = nav.findPath(level.start, target);
        expect(path.length, JSON.stringify(target)).toBeGreaterThan(0);
        let previous = level.start;
        for (const point of path) {
          expect(
            clearPath(previous, point, ACTOR_RADIUS, level),
            JSON.stringify({ previous, point }),
          ).toBe(true);
          previous = point;
        }
      }
    // Full-map path scans need room for coverage instrumentation on slower CI runners.
    }, 30_000);
    it('physically completes every objective route without corner snags', () => {
      const game = new NightHeistSimulation(level);
      game.start();
      game.enemies = [];
      for (const target of [...level.seals, level.treasure, level.exit]) {
        game.moveTo(target);
        for (
          let i = 0;
          i < 3600 && game.status === 'playing' && distance(game.player.pos, target) > 27;
          i++
        )
          game.update(1 / 60, { x: 0, y: 0, dash: false });
        expect(
          distance(game.player.pos, target),
          JSON.stringify({ target, at: game.player.pos }),
        ).toBeLessThan(target === level.exit ? 35 : 28);
      }
      expect(game.result).toMatchObject({
        outcome: 'escaped',
        seals: 3,
        treasure: true,
      });
    });
    it('supports a full escape with live patrols and ordinary timed decoys', () => {
      const game = new NightHeistSimulation(level);
      game.start();
      const route =
        level.id !== 'docks'
          ? [level.seals[0], level.seals[2], level.treasure, level.seals[1], level.exit]
          : [...level.seals, level.treasure, level.exit];
      let goal = 0;
      game.moveTo(route[goal]);
      for (let i = 0; i < 18000 && game.status === 'playing'; i++) {
        if (distance(game.player.pos, route[goal]) < 27 && goal < route.length - 1)
          game.moveTo(route[++goal]);
        const danger = game.enemies.some(
          (e) =>
            distance(e.pos, game.player.pos) < 100 && clearPath(e.pos, game.player.pos, 0, level),
        );
        game.update(1 / 60, {
          x: 0,
          y: 0,
          dash: danger && game.cooldown === 0,
        });
      }
      expect(
        game.result,
        JSON.stringify({
          goal,
          at: game.player.pos,
          time: game.elapsed,
          enemies: game.enemies.map((e) => ({
            kind: e.kind,
            pos: e.pos,
            mode: e.mode,
          })),
        }),
      ).toMatchObject({ outcome: 'escaped', seals: 3, treasure: true });
    });
  });
it('keeps navigation isolated when maps run or reload alongside one another', () => {
  const [courtyard, market] = LEVELS;
  const a = new NightHeistSimulation(courtyard),
    b = new NightHeistSimulation(market);
  a.start();
  b.start();
  a.moveTo(courtyard.seals[0]);
  b.moveTo(market.seals[0]);
  for (let i = 0; i < 30; i++) {
    a.update(1 / 60, { x: 0, y: 0, dash: false });
    b.update(1 / 60, { x: 0, y: 0, dash: false });
  }
  expect(isWalkable(a.player.pos, ACTOR_RADIUS, courtyard)).toBe(true);
  expect(isWalkable(b.player.pos, ACTOR_RADIUS, market)).toBe(true);
  expect(new Set(LEVELS.map((l) => l.image)).size).toBe(4);
  expect(LEVELS[2].patrols.filter((p) => p.kind === 'hound')).toHaveLength(2);
});

it('crosses each dock bridge locally instead of taking a long detour to another bridge', () => {
  const level = LEVELS[2],
    nav = navigationFor(level);
  for (const [from, to] of [
    [
      { x: 108, y: 309 },
      { x: 278, y: 141 },
    ],
    [
      { x: 600, y: 539 },
      { x: 864, y: 353 },
    ],
    [
      { x: 1210, y: 833 },
      { x: 1480, y: 614 },
    ],
  ]) {
    const path = nav.findPath(from, to);
    expect(path.length).toBeGreaterThan(0);
    let previous = from,
      length = 0;
    for (const p of path) {
      length += distance(previous, p);
      previous = p;
    }
    expect(length, JSON.stringify({ from, to, path })).toBeLessThan(450);
  }
});
