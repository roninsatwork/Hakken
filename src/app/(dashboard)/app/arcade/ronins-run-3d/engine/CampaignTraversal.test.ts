import { expect, it } from "vitest";
import { LEVELS } from "../../ronins-run/engine/Levels";
import { distance, type Point } from "../../ronins-run/engine/MapData";
import { navigationFor } from "../../ronins-run/engine/Navigation";
import { NightHeistSimulation } from "../../ronins-run/engine/NightHeistSimulation";
import { cameraInput, yawToward } from "./WorldLayout";

// Stable player routes exercise the original live patrols. No teleports, enemy
// removal, extended power, modified balancing, or scene-only success flags.
const ROUTES = {
  courtyard: ["spirit", 1, 0, 2, "treasure"],
  market: ["spirit", 0, 1, 2, "treasure"],
  docks: [1, 0, "treasure", 2, "spirit"],
  gardens: ["spirit", 0, 2, "treasure", 1],
} as const;

it.each(LEVELS)(
  "escapes $id from the authored start with live patrols and camera-relative controls",
  (level) => {
    const game = new NightHeistSimulation(level);
    game.start();
    const walkTo = (target: Point) => {
      const path = navigationFor(level).findPath(game.player.pos, target);
      expect(path.length).toBeGreaterThan(0);
      for (const [index, point] of path.entries()) {
        let steps = 0;
        while (
          game.status === "playing" &&
          distance(game.player.pos, point) >
            (index === path.length - 1 ? 12 : 4) &&
          steps++ < 900
        ) {
          const direction = cameraInput(
            yawToward(game.player.pos, point),
            1,
            0,
          );
          const danger = game.enemies.some(
            (e) =>
              e.mode !== "disabled" && distance(e.pos, game.player.pos) < 100,
          );
          game.update(1 / 60, {
            ...direction,
            dash:
              danger &&
              game.cooldown === 0 &&
              distance(game.player.pos, point) > 30,
          });
          game.sounds.length = 0;
        }
        expect(steps, `Stuck before ${point.x},${point.y}`).toBeLessThan(900);
        expect(game.status, `Captured before ${point.x},${point.y}`).not.toBe(
          "caught",
        );
      }
    };
    const goals = ROUTES[level.id].map((goal) =>
      typeof goal === "number" ? level.seals[goal] : level[goal],
    );
    for (const goal of [...goals, level.exit]) walkTo(goal);
    expect(game.result).toMatchObject({
      outcome: "escaped",
      seals: 3,
      treasure: true,
    });
    expect(game.spiritCollected).toBe(true);
    const finished = game.snapshot();
    for (let i = 0; i < 600; i++)
      game.update(1 / 60, { x: 1, y: 0, dash: true });
    expect(game.snapshot()).toEqual(finished);
    game.start();
    expect(game.player.pos).toEqual(level.start);
    expect(game.enemies.every((e) => e.mode === "patrol")).toBe(true);
    expect(game.snapshot()).toMatchObject({
      status: "playing",
      seals: 0,
      spiritCollected: false,
      knockouts: 0,
    });
  },
  15_000,
);
