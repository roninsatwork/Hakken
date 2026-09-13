import { describe, expect, it } from 'vitest';
import { roninPose, RONIN_FOOTFALL, RONIN_STRIDE } from './RoninAnimation';
import { NightHeistSimulation } from './NightHeistSimulation';
import { distance } from './MapData';

describe('Ronin locomotion', () => {
  it('shows planted idle, alternating run phases and a held dash pose in all directions', () => {
    const game = new NightHeistSimulation();
    const actor = game.player;
    for (const x of [-1, 1])
      for (const y of [-1, 1]) {
        actor.facing = { x, y };
        actor.moving = false;
        expect(roninPose(actor)).toMatchObject({
          sheet: 'idle',
          frame: y < 0 ? 1 : 0,
          flip: x < 0,
          airborne: false,
        });
        actor.moving = true;
        const frames = new Set<number>();
        for (let phase = 0; phase < 6; phase++) {
          actor.stride = ((phase + 0.01) * RONIN_STRIDE) / 6;
          const pose = roninPose(actor);
          frames.add(pose.frame);
          expect(pose.airborne).toBe(phase === 2 || phase === 5);
          expect(pose.flip).toBe(x < 0);
          expect(pose.frame < 8).toBe(y > 0);
        }
        expect(frames.size).toBe(6);
        actor.stride = 4;
        const dash = roninPose(actor, true);
        actor.stride = 75;
        expect(roninPose(actor, true)).toEqual(dash);
      }
  });

  it('synchronizes sound with distance and restarts on contact after stopping', () => {
    const run = (dt: number) => {
      const game = new NightHeistSimulation();
      game.start();
      game.enemies = [];
      game.player.pos = { x: 380, y: 585 };
      const start = { ...game.player.pos };
      for (let i = 0; i < Math.round(0.6 / dt); i++) game.update(dt, { x: 1, y: -0.5, dash: false });
      const travel = distance(start, game.player.pos);
      expect(travel).toBeCloseTo(92.4);
      expect(game.player.stride).toBeCloseTo(travel);
      expect(game.sounds.filter((sound) => sound === 'step')).toHaveLength(
        1 + Math.floor(travel / RONIN_FOOTFALL),
      );
      game.sounds = [];
      game.update(dt, { x: 0, y: 0, dash: false });
      expect(game.player.stride).toBe(0);
      expect(roninPose(game.player).sheet).toBe('idle');
      expect(game.sounds).toEqual([]);
      game.update(dt, { x: 1, y: -0.5, dash: false });
      expect(game.sounds).toContain('step');
      return travel;
    };
    expect(run(1 / 60)).toBeCloseTo(run(1 / 120));
  });

  it('does not play rapid running footsteps during a dash or while blocked', () => {
    const game = new NightHeistSimulation();
    game.start();
    game.enemies = [];
    for (let i = 0; i < 8; i++) game.update(1 / 60, { x: 1, y: 0, dash: i === 0 });
    expect(game.sounds).toContain('dash');
    expect(game.sounds).not.toContain('step');
    expect(game.player.stride).toBe(0);
    for (let i = 0; i < 600; i++) game.update(1 / 60, { x: 0, y: 1, dash: false });
    game.sounds = [];
    const stopped = { ...game.player.pos };
    for (let i = 0; i < 60; i++) game.update(1 / 60, { x: 0, y: 1, dash: false });
    expect(game.player.pos).toEqual(stopped);
    expect(game.sounds).not.toContain('step');
    expect(roninPose(game.player).sheet).toBe('idle');
  });
});
