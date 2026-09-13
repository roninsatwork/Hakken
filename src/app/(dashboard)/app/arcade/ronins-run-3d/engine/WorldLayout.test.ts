import { describe, expect, it } from "vitest";
import { LEVELS } from "../../ronins-run/engine/Levels";
import {
  distance,
  isWalkable,
  type Point,
} from "../../ronins-run/engine/MapData";
import { navigationFor } from "../../ronins-run/engine/Navigation";
import {
  NightHeistSimulation,
  RULES,
} from "../../ronins-run/engine/NightHeistSimulation";
import {
  boundarySegments,
  cameraInput,
  toMap,
  toWorld,
  yawToward,
} from "./WorldLayout";

it("keeps overlapping corridors open and includes the solid island boundaries", () => {
  const borders = boundarySegments({
    walkable: [
      [
        [0, 0],
        [100, 0],
        [100, 60],
        [0, 60],
      ],
      [
        [50, 0],
        [150, 0],
        [150, 60],
        [50, 60],
      ],
    ],
    blocked: [
      [
        [70, 20],
        [80, 20],
        [80, 30],
        [70, 30],
      ],
    ],
  });
  expect(borders.some((e) => e.a.x === 50 && e.b.x === 50)).toBe(false);
  expect(borders.some((e) => e.a.x === 100 && e.b.x === 100)).toBe(false);
  expect(
    borders.filter(
      (e) => e.a.x >= 70 && e.b.x <= 80 && e.a.y >= 20 && e.b.y <= 30,
    ),
  ).toHaveLength(4);
});

for (const level of LEVELS)
  describe(level.id, () => {
    it("preserves every authored objective and route under the 3D transform", () => {
      for (const point of [
        level.start,
        level.exit,
        level.treasure,
        level.spirit,
        ...level.seals,
        ...level.patrols.flatMap((p) => p.route),
      ]) {
        const world = toWorld(point),
          restored = toMap(world.x, world.z);
        expect(restored.x).toBeCloseTo(point.x, 10);
        expect(restored.y).toBeCloseTo(point.y, 10);
      }
    });
    it("renders boundaries only where playable ground meets an obstacle", () => {
      const borders = boundarySegments(level);
      expect(borders.length).toBeGreaterThan(12);
      for (const e of borders) {
        const midpoint = { x: (e.a.x + e.b.x) / 2, y: (e.a.y + e.b.y) / 2 };
        expect(
          isWalkable(
            {
              x: midpoint.x + e.outward.x * 0.02,
              y: midpoint.y + e.outward.y * 0.02,
            },
            0,
            level,
          ),
        ).toBe(false);
        expect(
          isWalkable(
            {
              x: midpoint.x - e.outward.x * 0.02,
              y: midpoint.y - e.outward.y * 0.02,
            },
            0,
            level,
          ),
        ).toBe(true);
      }
    });
    it("can collect all seals and escape using camera-relative forward movement", () => {
      const game = new NightHeistSimulation(level);
      game.start();
      game.enemies = [];
      const walkTo = (target: Point) => {
        const route = navigationFor(level).findPath(game.player.pos, target);
        expect(route.length).toBeGreaterThan(0);
        for (const waypoint of route) {
          let steps = 0;
          while (
            game.status === "playing" &&
            distance(game.player.pos, waypoint) > 0.01 &&
            steps++ < 1500
          ) {
            const input = cameraInput(
              yawToward(game.player.pos, waypoint),
              1,
              0,
            );
            game.update(
              Math.min(
                1 / 60,
                distance(game.player.pos, waypoint) / RULES.speed,
              ),
              { ...input, dash: false },
            );
          }
          expect(steps).toBeLessThan(1500);
        }
      };
      for (const goal of [...level.seals, level.treasure, level.exit])
        walkTo(goal);
      expect(game.result).toMatchObject({
        outcome: "escaped",
        seals: 3,
        treasure: true,
      });
    });
  });

it("moves and strafes in the camera direction without changing original rules", () => {
  expect(cameraInput(0, 1, 0)).toEqual({ x: 0, y: -1 });
  expect(cameraInput(0, 0, 1)).toEqual({ x: 1, y: -0 });
  const facingWest = cameraInput(Math.PI / 2, 1, 0);
  expect(facingWest.x).toBeCloseTo(-1);
  expect(facingWest.y).toBeCloseTo(0);
  const original = new NightHeistSimulation(LEVELS[0]),
    second = new NightHeistSimulation(LEVELS[0]);
  original.start();
  second.start();
  second.update(1 / 60, { ...cameraInput(-Math.PI / 2, 1, 0), dash: true });
  expect(original.player.pos).toEqual(LEVELS[0].start);
  expect(original.cooldown).toBe(0);
  expect(second.cooldown).toBeGreaterThan(0);
  expect(original.enemies).not.toBe(second.enemies);
});
