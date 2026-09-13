import { describe, expect, it } from 'vitest';
import { COURTYARD, LEVELS, type LevelDefinition } from './Levels';
import { distance } from './MapData';
import { NightHeistSimulation, RULES } from './NightHeistSimulation';

const idle = { x: 0, y: 0, dash: false };
const arena: LevelDefinition = {
  ...COURTYARD,
  start: { x: 200, y: 200 },
  spirit: { x: 240, y: 200 },
  walkable: [
    [
      [0, 0],
      [1000, 0],
      [1000, 1000],
      [0, 1000],
    ],
  ],
  blocked: [],
  exit: { x: 900, y: 900 },
  seals: [
    { x: 800, y: 800 },
    { x: 850, y: 800 },
    { x: 900, y: 800 },
  ],
  patrols: ['guard', 'hound'].map((kind) => ({
    kind: kind as 'guard' | 'hound',
    route: [
      { x: 400, y: 200 },
      { x: 800, y: 200 },
    ],
  })),
};
function advance(game: NightHeistSimulation, seconds: number) {
  for (let frame = 0; frame < Math.round(seconds * 60); frame++) game.update(1 / 60, idle);
}
function powered() {
  const game = new NightHeistSimulation(arena);
  game.start();
  game.player.pos = { ...arena.spirit };
  game.update(1 / 60, idle);
  return game;
}

describe('Spirit Power', () => {
  it.each(LEVELS)('has a physically reachable, separate pickup on $id', (level) => {
    const game = new NightHeistSimulation(level);
    game.start();
    game.enemies = [];
    game.moveTo(level.spirit);
    for (let frame = 0; frame < 3600 && !game.spiritCollected; frame++) game.update(1 / 60, idle);
    expect(game.spiritCollected).toBe(true);
    expect(game.spiritTime).toBe(RULES.spiritDuration);
    expect(game.sounds.filter((sound) => sound === 'spirit')).toHaveLength(1);
    expect(
      level.seals.every((seal) => distance(seal, level.spirit) > RULES.pickupDistance * 2),
    ).toBe(true);
  });

  it('activates before contact, disables both enemy types once, and does not award seals or score', () => {
    const game = new NightHeistSimulation(arena);
    game.start();
    game.player.pos = { ...arena.spirit };
    game.enemies.forEach((enemy) => {
      enemy.pos = { ...arena.spirit };
      enemy.mode = 'chase';
      enemy.suspicion = 1;
    });
    game.update(1 / 60, idle);
    advance(game, 0.2);
    expect(game.snapshot()).toMatchObject({
      status: 'playing',
      seals: 0,
      score: 0,
      knockouts: 2,
      threat: 0,
      alarms: 0,
    });
    expect(game.enemies.every((enemy) => enemy.mode === 'disabled' && !enemy.moving)).toBe(true);
    expect(game.sounds.filter((sound) => sound === 'knockout')).toHaveLength(2);
    expect(game.enemies.every((enemy) => !game.canSee(enemy, game.player.pos))).toBe(true);
    game.player.pos = { ...arena.exit };
    game.update(1 / 60, idle);
    expect(game.status).toBe('playing');
  });

  it('makes guards and hounds flee even when a decoy or scent is present', () => {
    const game = powered();
    const before = game.enemies.map((enemy) => distance(enemy.pos, game.player.pos));
    game.trail = [{ pos: { ...game.player.pos }, time: -2 }];
    game.decoy = {
      pos: { ...game.player.pos },
      facing: { x: 1, y: 0 },
      age: 0,
      id: 1,
    };
    advance(game, 0.5);
    game.enemies.forEach((enemy, i) => {
      expect(enemy.mode).toBe('flee');
      expect(distance(enemy.pos, game.player.pos)).toBeGreaterThan(before[i]);
    });
    expect(game.alarms).toBe(0);
    expect(game.snapshot().threat).toBe(0);
  });

  it('allows powered contact while dashing and leaves disabled enemies down after expiry', () => {
    const game = powered();
    game.enemies.forEach((enemy) => {
      enemy.pos = { x: game.player.pos.x + 10, y: game.player.pos.y };
      enemy.mode = 'decoy';
    });
    game.update(1 / 60, { x: 1, y: 0, dash: true });
    expect(game.knockouts).toBe(2);
    const positions = game.enemies.map((enemy) => ({ ...enemy.pos }));
    advance(game, 12);
    expect(game.spiritTime).toBe(0);
    expect(game.status).toBe('playing');
    expect(game.enemies.map((enemy) => enemy.pos)).toEqual(positions);
    expect(game.enemies.every((enemy) => enemy.mode === 'disabled')).toBe(true);
    expect(game.knockouts).toBe(2);
  });

  it('warns once at three seconds, expires at ten, and cannot be collected again', () => {
    const game = powered();
    game.enemies = [];
    advance(game, 7);
    expect(game.spiritTime).toBeCloseTo(3);
    expect(game.sounds.filter((sound) => sound === 'spiritWarning')).toHaveLength(1);
    advance(game, 3);
    expect(game.spiritTime).toBe(0);
    advance(game, 2);
    expect(game.spiritTime).toBe(0);
    expect(game.sounds.filter((sound) => sound === 'spirit')).toHaveLength(1);
    expect(game.sounds.filter((sound) => sound === 'spiritEnd')).toHaveLength(1);
  });

  it('freezes power during pause and terminal states and fully restores an attempt on retry', () => {
    const game = powered();
    game.enemies.forEach((enemy) => {
      enemy.pos = { ...game.player.pos };
    });
    game.update(1 / 60, idle);
    game.pause();
    const before = game.snapshot();
    advance(game, 15);
    expect(game.snapshot()).toEqual(before);
    game.resume();
    advance(game, 1);
    expect(game.spiritTime).toBeLessThan(before.spiritSeconds);
    game.seals = new Set([0, 1, 2]);
    game.player.pos = { ...arena.exit };
    game.update(1 / 60, idle);
    const finished = game.snapshot();
    advance(game, 15);
    expect(game.snapshot()).toEqual(finished);
    game.start();
    expect(game.snapshot()).toMatchObject({
      spiritCollected: false,
      spiritSeconds: 0,
      knockouts: 0,
    });
    expect(
      game.enemies.every((enemy) => enemy.mode === 'patrol' && enemy.disabledAt === null),
    ).toBe(true);
    game.player.pos = { ...arena.spirit };
    game.update(1 / 60, idle);
    expect(game.spiritTime).toBe(10);
  });

  it.each(['guard', 'hound'] as const)(
    'restores capture by a remaining %s on the expiry frame',
    (kind) => {
      const game = powered();
      game.spiritTime = 1 / 60;
      game.enemies = game.enemies.filter((enemy) => enemy.kind === kind);
      game.enemies[0].pos = { ...game.player.pos };
      game.update(1 / 60, idle);
      expect(game.status).toBe('caught');
      expect(game.knockouts).toBe(0);
      expect(game.sounds.filter((sound) => sound === 'spiritEnd')).toHaveLength(1);
    },
  );

  it('blocks flame collection and powered takedowns through solid cover', () => {
    const level: LevelDefinition = {
      ...arena,
      spirit: { x: 216, y: 200 },
      blocked: [
        [
          [207, 100],
          [209, 100],
          [209, 300],
          [207, 300],
        ],
      ],
    };
    const game = new NightHeistSimulation(level);
    game.start();
    game.enemies = [game.enemies[0]];
    game.enemies[0].pos = { ...level.spirit };
    game.update(1 / 60, idle);
    expect(game.spiritCollected).toBe(false);
    expect(game.status).toBe('playing');
    game.spiritTime = 10;
    game.update(1 / 60, idle);
    expect(game.knockouts).toBe(0);
    expect(game.enemies[0].mode).toBe('flee');
  });
});

it.each([
  { level: LEVELS[0], kind: 'hound' },
  { level: LEVELS[3], kind: 'guard' },
] as const)('can physically chase down a $kind during the power window', ({ level, kind }) => {
  const game = new NightHeistSimulation(level);
  game.start();
  game.moveTo(level.spirit);
  for (let frame = 0; frame < 1800 && !game.spiritCollected && game.status === 'playing'; frame++) {
    const danger = game.enemies.some((enemy) => distance(enemy.pos, game.player.pos) < 90);
    game.update(1 / 60, { ...idle, dash: danger && game.cooldown === 0 });
  }
  expect(game.spiritCollected).toBe(true);
  const target = game.enemies
    .filter((enemy) => enemy.kind === kind)
    .sort((a, b) => distance(a.pos, game.player.pos) - distance(b.pos, game.player.pos))[0];
  for (let frame = 0; frame < 600 && target.mode !== 'disabled'; frame++) {
    if (frame % 12 === 0) game.moveTo(target.pos);
    game.update(1 / 60, {
      ...idle,
      dash: distance(game.player.pos, target.pos) < 120 && game.cooldown === 0,
    });
  }
  expect({
    mode: target.mode,
    at: game.player.pos,
    enemy: target.pos,
    time: game.spiritTime,
  }).toMatchObject({ mode: 'disabled' });
  expect(game.spiritTime).toBeGreaterThan(0);
});
