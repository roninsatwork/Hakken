import { describe, expect, it } from 'vitest';
import { COURTYARD, MARKET, type LevelDefinition } from './Levels';
import { distance } from './MapData';
import { NightHeistSimulation } from './NightHeistSimulation';

const idle = { x: 0, y: 0, dash: false };
function advance(game: NightHeistSimulation, seconds: number, input = idle) {
  for (let frame = 0; frame < Math.round(seconds * 60); frame++) game.update(1 / 60, input);
}
function encounter(kind: 'guard' | 'hound', source: LevelDefinition = COURTYARD) {
  const game = new NightHeistSimulation({
    ...source,
    start: { x: 220, y: 180 },
    spirit: { x: 1100, y: 350 },
    exit: { x: 1100, y: 330 },
    walkable: [
      [
        [0, 0],
        [1200, 0],
        [1200, 400],
        [0, 400],
      ],
    ],
    blocked: [],
    patrols: [
      {
        kind,
        route: [
          { x: 140, y: 180 },
          { x: 1100, y: 180 },
        ],
      },
    ],
  });
  game.start();
  game.enemies[0].facing = { x: 1, y: 0 };
  return game;
}

describe('opening-heist balance', () => {
  it.each(['guard', 'hound'] as const)(
    'lets ordinary running gain distance on a pursuing %s',
    (kind) => {
      const game = encounter(kind);
      const enemy = game.enemies[0];
      enemy.mode = 'chase';
      enemy.suspicion = 1;
      const before = distance(enemy.pos, game.player.pos);
      advance(game, 1, { x: 1, y: 0, dash: false });
      expect(game.status).toBe('playing');
      expect(enemy.mode).toBe('chase');
      expect(distance(enemy.pos, game.player.pos)).toBeGreaterThan(before + 20);
      expect(game.cooldown).toBe(0);
      expect(game.spiritCollected).toBe(false);
    },
  );

  it.each(['guard', 'hound'] as const)(
    'gives a full second of warning before a %s chases',
    (kind) => {
      const game = encounter(kind);
      advance(game, 1);
      expect(game.enemies[0].mode).toBe('suspicious');
      expect(game.snapshot().threat).toBeGreaterThan(0.3);
      expect(game.alarms).toBe(0);
      advance(game, 0.95);
      expect(game.enemies[0].mode).toBe('chase');
      expect(game.alarms).toBe(1);
    },
  );

  it('ends an unsuccessful search sooner after the player breaks sight', () => {
    const game = encounter('guard');
    const enemy = game.enemies[0];
    enemy.mode = 'chase';
    enemy.suspicion = 1;
    enemy.target = { ...game.player.pos };
    game.player.pos = { x: 1000, y: 350 };
    advance(game, 1);
    expect(enemy.mode).toBe('search');
    advance(game, 1.1);
    expect(enemy.mode).toBe('patrol');
    expect(enemy.suspicion).toBe(0);
  });

  it('keeps the later-map pursuit challenge while softening the courtyard', () => {
    const game = encounter('hound', MARKET);
    const enemy = game.enemies[0];
    enemy.mode = 'chase';
    enemy.suspicion = 1;
    const before = distance(enemy.pos, game.player.pos);
    advance(game, 1, { x: 1, y: 0, dash: false });
    expect(distance(enemy.pos, game.player.pos)).toBeLessThan(before);
    const detection = encounter('hound', MARKET);
    advance(detection, 0.8);
    expect(detection.enemies[0].mode).toBe('chase');
  });

  it('still requires the player to avoid direct contact', () => {
    const game = encounter('guard');
    game.enemies[0].pos = { ...game.player.pos };
    game.update(1 / 60, idle);
    expect(game.status).toBe('caught');
  });

  it('allows time to look around, then reach the first seal without dashing', () => {
    const game = new NightHeistSimulation(COURTYARD);
    game.start();
    advance(game, 2);
    game.moveTo(COURTYARD.seals[0]);
    for (let frame = 0; frame < 1800 && game.status === 'playing' && !game.seals.has(0); frame++)
      game.update(1 / 60, idle);
    expect(game.status, JSON.stringify({ at: game.player.pos, time: game.elapsed })).toBe(
      'playing',
    );
    expect(game.seals.has(0)).toBe(true);
    expect(game.sounds).not.toContain('dash');
  });
});
