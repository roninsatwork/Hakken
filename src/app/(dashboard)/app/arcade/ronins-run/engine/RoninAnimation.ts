import type { Actor } from './NightHeistSimulation';

// Two footfalls per cycle. Both the artwork and Foley follow travelled distance.
export const RONIN_STRIDE = 88;
export const RONIN_FOOTFALL = RONIN_STRIDE / 2;
const FRONT_RUN = [0, 1, 2, 3, 4, 7] as const;
const BACK_RUN = [8, 9, 10, 11, 12, 15] as const;

export function roninPose(actor: Actor, dashing = false) {
  const back = actor.facing.y < -0.15;
  const flip = actor.facing.x < 0;
  if (!actor.moving && !dashing)
    return { sheet: 'idle' as const, frame: back ? 1 : 0, flip, airborne: false };
  if (dashing) return { sheet: 'run' as const, frame: back ? 10 : 3, flip, airborne: true };
  const phase = Math.floor(((actor.stride % RONIN_STRIDE) / RONIN_STRIDE) * 6);
  return {
    sheet: 'run' as const,
    frame: (back ? BACK_RUN : FRONT_RUN)[phase],
    flip,
    airborne: phase === 2 || phase === 5,
  };
}
