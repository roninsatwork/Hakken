import type { LevelDefinition } from "../ronins-run/engine/Levels";
import { clearPath, distance } from "../ronins-run/engine/MapData";
import type { Snapshot } from "../ronins-run/engine/NightHeistSimulation";
import type { ViewState } from "./engine/FirstPersonGame";
import { cameraInput } from "./engine/WorldLayout";

export type PickupNotice = "sealRecovered" | "powerStarted" | "powerEnded";

export function pickupNotice(
  before: Snapshot | undefined,
  after: Snapshot,
): PickupNotice | null {
  if (!before || after.status !== "playing") return null;
  if (before.spiritSeconds <= 0 && after.spiritSeconds > 0)
    return "powerStarted";
  if (before.spiritSeconds > 0 && after.spiritSeconds <= 0) return "powerEnded";
  if (after.seals > before.seals) return "sealRecovered";
  return null;
}

/** Label the nearby pickup the player is facing, with the same solid-cover rules as collection. */
export function focusedPickup(
  level: LevelDefinition,
  state: ViewState,
): "seal" | "spirit" | null {
  const player = { x: state.x, y: state.y },
    facing = cameraInput(state.yaw, 1, 0);
  const candidates = [
    ...level.seals
      .filter((_, i) => !state.collected.includes(i))
      .map((point) => ({ point, kind: "seal" as const })),
    ...(!state.spiritCollected
      ? [{ point: level.spirit, kind: "spirit" as const }]
      : []),
  ]
    .filter(({ point }) => {
      const d = distance(player, point);
      return (
        d < 220 &&
        (d < 30 ||
          ((point.x - player.x) * facing.x + (point.y - player.y) * facing.y) /
            d >
            0.8) &&
        clearPath(player, point, 0, level)
      );
    })
    .sort((a, b) => distance(player, a.point) - distance(player, b.point));
  return candidates[0]?.kind ?? null;
}
