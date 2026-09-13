import { expect, it } from "vitest";
import { COURTYARD } from "../ronins-run/engine/Levels";
import { NightHeistSimulation } from "../ronins-run/engine/NightHeistSimulation";
import type { ViewState } from "./engine/FirstPersonGame";
import { yawToward } from "./engine/WorldLayout";
import { focusedPickup, pickupNotice } from "./PickupFeedback";

function state(): ViewState {
  const game = new NightHeistSimulation(COURTYARD);
  game.start();
  return {
    ...game.snapshot(),
    x: COURTYARD.start.x,
    y: COURTYARD.start.y,
    yaw: 0,
    collected: [],
  };
}
it("distinguishes recovering a seal from activating Spirit Power, and announces expiry", () => {
  const before = state(),
    seal = { ...before, seals: 1 };
  expect(pickupNotice(before, seal)).toBe("sealRecovered");
  const powered = { ...seal, spiritSeconds: 10, spiritCollected: true };
  expect(pickupNotice(seal, powered)).toBe("powerStarted");
  expect(pickupNotice(powered, { ...powered, spiritSeconds: 9.5 })).toBeNull();
  expect(pickupNotice(powered, { ...powered, spiritSeconds: 0 })).toBe(
    "powerEnded",
  );
});
it("labels the blue flame and a green seal accurately, hides collected or obstructed pickups", () => {
  const at = state();
  at.x = COURTYARD.spirit.x;
  at.y = COURTYARD.spirit.y;
  expect(focusedPickup(COURTYARD, at)).toBe("spirit");
  expect(focusedPickup(COURTYARD, { ...at, spiritCollected: true })).toBeNull();
  at.x = COURTYARD.seals[2].x;
  at.y = COURTYARD.seals[2].y;
  expect(focusedPickup(COURTYARD, at)).toBe("seal");
  expect(focusedPickup(COURTYARD, { ...at, collected: [2] })).toBeNull();
  const start = { x: 200, y: 200 },
    target = { x: 240, y: 200 };
  const blocked = {
    ...COURTYARD,
    spirit: target,
    walkable: [
      [
        [0, 0],
        [1000, 0],
        [1000, 1000],
        [0, 1000],
      ] as const,
    ],
    blocked: [
      [
        [216, 0],
        [220, 0],
        [220, 500],
        [216, 500],
      ] as const,
    ],
  };
  expect(
    focusedPickup(blocked, {
      ...at,
      ...start,
      x: start.x,
      y: start.y,
      yaw: yawToward(start, target),
    }),
  ).toBeNull();
});
