import { ACTOR_RADIUS, clearPath, distance, isWalkable, type Point } from './MapData';
import {
  COURTYARD,
  STANDARD_PATROL_TUNING,
  type LevelDefinition,
  type PatrolTuning,
} from './Levels';
import { navigationFor, type Navigation } from './Navigation';
import { calculateNightHeistScore } from '@/convex/utils/nightHeistRules';
import { RONIN_FOOTFALL } from './RoninAnimation';

export type RunStatus = 'ready' | 'playing' | 'paused' | 'escaped' | 'caught';
export type EnemyMode =
  | 'patrol'
  | 'suspicious'
  | 'chase'
  | 'search'
  | 'decoy'
  | 'flee'
  | 'disabled';
export type SoundCue =
  | 'step'
  | 'dash'
  | 'seal'
  | 'treasure'
  | 'alert'
  | 'escaped'
  | 'caught'
  | 'spirit'
  | 'spiritWarning'
  | 'spiritEnd'
  | 'knockout';
export interface Actor {
  pos: Point;
  facing: Point;
  moving: boolean;
  stride: number;
}
export interface Enemy extends Actor {
  kind: 'guard' | 'hound';
  mode: EnemyMode;
  suspicion: number;
  route: readonly Point[];
  waypoint: number;
  path: Point[];
  target: Point;
  repath: number;
  searchTime: number;
  seenDecoy: number;
  disabledAt: number | null;
}
export interface RunResult {
  outcome: 'escaped' | 'caught';
  elapsedSeconds: number;
  seals: number;
  treasure: boolean;
  alarms: number;
  score: number;
}
export interface Snapshot {
  status: RunStatus;
  seconds: number;
  seals: number;
  treasure: boolean;
  alarms: number;
  score: number;
  dashCooldown: number;
  threat: number;
  spiritSeconds: number;
  spiritCollected: boolean;
  knockouts: number;
}
export interface Input {
  x: number;
  y: number;
  dash: boolean;
}
export interface Decoy {
  pos: Point;
  facing: Point;
  age: number;
  id: number;
}
export const RULES = {
  speed: 154,
  dashSpeed: 440,
  dashDuration: 0.22,
  dashCooldown: 6,
  decoyDuration: 3.8,
  catchDistance: 18,
  pickupDistance: 28,
  spiritDuration: 10,
  spiritWarning: 3,
  spiritContactDistance: 26,
};

export class NightHeistSimulation {
  status: RunStatus = 'ready';
  player: Actor = {
    pos: { x: 0, y: 0 },
    facing: { x: 1, y: -0.4 },
    moving: false,
    stride: 0,
  };
  enemies: Enemy[] = [];
  seals = new Set<number>();
  treasure = false;
  elapsed = 0;
  alarms = 0;
  cooldown = 0;
  dashTime = 0;
  spiritCollected = false;
  spiritTime = 0;
  knockouts = 0;
  decoy: Decoy | null = null;
  trail: { pos: Point; time: number }[] = [];
  destination: Point[] = [];
  sounds: SoundCue[] = [];
  result: RunResult | null = null;
  private trailTime = 0;
  private decoyId = 0;

  private navigation: Navigation;
  private readonly patrolTuning: Readonly<PatrolTuning>;
  constructor(readonly level: LevelDefinition = COURTYARD) {
    this.navigation = navigationFor(level);
    this.patrolTuning = level.patrolTuning ?? STANDARD_PATROL_TUNING;
    this.reset();
  }
  reset() {
    this.status = 'ready';
    this.player = {
      pos: { ...this.level.start },
      facing: { x: 1, y: -0.4 },
      moving: false,
      stride: 0,
    };
    this.enemies = this.level.patrols.map(({ route, kind }) => ({
      kind,
      pos: { ...route[0] },
      facing: { x: 1, y: 0.4 },
      moving: false,
      stride: 0,
      mode: 'patrol',
      suspicion: 0,
      route,
      waypoint: 1,
      path: [],
      target: { ...route[1] },
      repath: 0,
      searchTime: 0,
      seenDecoy: 0,
      disabledAt: null,
    }));
    this.seals.clear();
    this.treasure = false;
    this.elapsed = 0;
    this.alarms = 0;
    this.cooldown = 0;
    this.dashTime = 0;
    this.spiritCollected = false;
    this.spiritTime = 0;
    this.knockouts = 0;
    this.decoy = null;
    this.trail = [];
    this.destination = [];
    this.sounds = [];
    this.result = null;
    this.trailTime = 0;
  }
  start() {
    this.reset();
    this.status = 'playing';
  }
  pause() {
    if (this.status === 'playing') {
      this.status = 'paused';
      this.player.moving = false;
    }
  }
  resume() {
    if (this.status === 'paused') this.status = 'playing';
  }
  moveTo(point: Point) {
    if (this.status === 'playing')
      this.destination = this.navigation.findPath(this.player.pos, point);
  }
  snapshot(): Snapshot {
    return {
      status: this.status,
      seconds: Math.floor(this.elapsed),
      seals: this.seals.size,
      treasure: this.treasure,
      alarms: this.alarms,
      score: this.result?.score ?? this.seals.size * 1000 + (this.treasure ? 750 : 0),
      dashCooldown: this.cooldown,
      threat: Math.max(0, ...this.enemies.map((e) => e.suspicion)),
      spiritSeconds: this.spiritTime,
      spiritCollected: this.spiritCollected,
      knockouts: this.knockouts,
    };
  }
  private move(actor: Actor, vector: Point, speed: number, dt: number) {
    const len = Math.hypot(vector.x, vector.y);
    actor.moving = false;
    if (len < 0.001) return;
    const vx = vector.x / len,
      vy = vector.y / len;
    actor.facing = { x: vx, y: vy };
    const before = { ...actor.pos };
    // Substeps prevent a dash tunnelling through a narrow wall or canal edge.
    const steps = Math.max(1, Math.ceil((speed * dt) / 3));
    for (let i = 0; i < steps; i++) {
      const dx = (vx * speed * dt) / steps,
        dy = (vy * speed * dt) / steps;
      const next = { x: actor.pos.x + dx, y: actor.pos.y + dy };
      if (isWalkable(next, ACTOR_RADIUS, this.level)) actor.pos = next;
      else {
        if (isWalkable({ x: next.x, y: actor.pos.y }, ACTOR_RADIUS, this.level))
          actor.pos.x = next.x;
        if (isWalkable({ x: actor.pos.x, y: next.y }, ACTOR_RADIUS, this.level))
          actor.pos.y = next.y;
      }
    }
    const travelled = distance(before, actor.pos);
    actor.moving = travelled > 0.05;
    actor.stride += travelled;
  }
  private follow(enemy: Enemy, target: Point, speed: number, dt: number) {
    enemy.repath -= dt;
    if (enemy.repath <= 0 && (distance(enemy.target, target) > 18 || !enemy.path.length)) {
      enemy.target = { ...target };
      enemy.path = this.navigation.findPath(enemy.pos, target);
      enemy.repath = 0.45;
    }
    while (enemy.path.length && distance(enemy.pos, enemy.path[0]) < 0.1) enemy.path.shift();
    const next = enemy.path[0];
    if (next)
      this.move(
        enemy,
        { x: next.x - enemy.pos.x, y: next.y - enemy.pos.y },
        Math.min(speed * this.patrolTuning.speedMultiplier, distance(enemy.pos, next) / dt),
        dt,
      );
    else enemy.moving = false;
  }
  canSee(enemy: Enemy, target: Point): boolean {
    if (enemy.mode === 'disabled' || enemy.mode === 'flee') return false;
    const d = distance(enemy.pos, target),
      range = enemy.kind === 'hound' ? 135 : 205;
    if (d > range || !clearPath(enemy.pos, target, 0, this.level)) return false;
    if (d < 35 || enemy.kind === 'hound') return true;
    const facingLength = Math.hypot(enemy.facing.x, enemy.facing.y) || 1;
    const dot =
      ((target.x - enemy.pos.x) * enemy.facing.x + (target.y - enemy.pos.y) * enemy.facing.y) /
      (d * facingLength);
    return dot > Math.cos(Math.PI * 0.24);
  }
  private updateEnemy(enemy: Enemy, dt: number) {
    if (enemy.mode === 'disabled') return;
    if (this.spiritTime > 0) {
      if (enemy.mode !== 'flee') {
        enemy.mode = 'flee';
        enemy.suspicion = 0;
        enemy.path = [];
        enemy.repath = 0;
        enemy.searchTime = 0;
      }
      enemy.searchTime -= dt;
      if (enemy.searchTime <= 0) {
        enemy.target = {
          ...enemy.route.reduce((farthest, point) =>
            distance(point, this.player.pos) > distance(farthest, this.player.pos)
              ? point
              : farthest,
          ),
        };
        enemy.path = this.navigation.findPath(enemy.pos, enemy.target);
        enemy.repath = 0.45;
        enemy.searchTime = 1;
      }
      this.follow(enemy, enemy.target, enemy.kind === 'hound' ? 106 : 92, dt);
      return;
    }
    if (enemy.mode === 'flee') {
      enemy.mode = 'patrol';
      enemy.path = [];
      enemy.repath = 0;
    }
    const distraction =
      this.decoy &&
      this.decoy.age < RULES.decoyDuration &&
      distance(enemy.pos, this.decoy.pos) < 330
        ? this.decoy
        : null;
    if (distraction && enemy.seenDecoy !== distraction.id) {
      enemy.seenDecoy = distraction.id;
      enemy.mode = 'decoy';
      enemy.suspicion = 0;
      enemy.repath = 0;
      enemy.searchTime = RULES.decoyDuration;
    }
    if (enemy.mode === 'decoy' && distraction) {
      this.follow(enemy, distraction.pos, enemy.kind === 'hound' ? 156 : 124, dt);
      return;
    }
    if (enemy.mode === 'decoy') {
      enemy.mode = 'search';
      enemy.searchTime = Math.min(3, this.patrolTuning.searchSeconds);
      enemy.suspicion = 0.2;
    }
    const sees = this.canSee(enemy, this.player.pos);
    if (sees) {
      enemy.suspicion = Math.min(
        1,
        enemy.suspicion +
          dt * (enemy.kind === 'hound' ? 1.5 : 1.1) * this.patrolTuning.awarenessMultiplier,
      );
      if (enemy.suspicion >= 1 && enemy.mode !== 'chase') {
        this.alarms++;
        this.sounds.push('alert');
        enemy.mode = 'chase';
        enemy.repath = 0;
      }
      if (enemy.mode === 'chase') {
        enemy.searchTime = this.patrolTuning.searchSeconds;
        this.follow(enemy, this.player.pos, enemy.kind === 'hound' ? 167 : 139, dt);
        return;
      }
      enemy.mode = 'suspicious';
      enemy.moving = false;
      enemy.facing = {
        x: this.player.pos.x - enemy.pos.x,
        y: this.player.pos.y - enemy.pos.y,
      };
      return;
    }
    enemy.suspicion = Math.max(0, enemy.suspicion - dt * 0.32);
    if (enemy.mode === 'chase') {
      enemy.mode = 'search';
      enemy.searchTime = this.patrolTuning.searchSeconds;
    }
    if (enemy.mode === 'search') {
      enemy.searchTime -= dt;
      this.follow(enemy, enemy.target, 100, dt);
      if (enemy.searchTime <= 0) {
        enemy.mode = 'patrol';
        enemy.repath = 0;
        enemy.suspicion = 0;
      }
      return;
    }
    if (enemy.mode === 'suspicious' && enemy.suspicion <= 0) enemy.mode = 'patrol';
    if (enemy.kind === 'hound') {
      const scent = [...this.trail]
        .reverse()
        .find((p) => distance(enemy.pos, p.pos) < 190 && this.elapsed - p.time > 1.2);
      if (scent) {
        this.follow(enemy, scent.pos, 104, dt);
        return;
      }
    }
    const target = enemy.route[enemy.waypoint];
    if (distance(enemy.pos, target) < 16) {
      enemy.waypoint = (enemy.waypoint + 1) % enemy.route.length;
      enemy.repath = 0;
    }
    this.follow(enemy, enemy.route[enemy.waypoint], enemy.kind === 'hound' ? 72 : 58, dt);
  }
  private finish(outcome: 'escaped' | 'caught') {
    if (this.result) return;
    this.status = outcome;
    this.player.moving = false;
    this.result = {
      outcome,
      elapsedSeconds: Math.floor(this.elapsed),
      seals: this.seals.size,
      treasure: this.treasure,
      alarms: this.alarms,
      score:
        outcome === 'escaped'
          ? calculateNightHeistScore(this.elapsed, this.treasure, this.alarms)
          : 0,
    };
    this.sounds.push(outcome);
  }
  update(dt: number, input: Input) {
    if (this.status !== 'playing') return;
    dt = Math.max(0, Math.min(dt, 1 / 30));
    this.elapsed += dt;
    this.cooldown = Math.max(0, this.cooldown - dt);
    const previousSpirit = this.spiritTime;
    this.spiritTime = this.spiritTime - dt <= 1e-9 ? 0 : this.spiritTime - dt;
    if (
      previousSpirit > RULES.spiritWarning + 1e-9 &&
      this.spiritTime <= RULES.spiritWarning + 1e-9
    )
      this.sounds.push('spiritWarning');
    if (previousSpirit > 0 && this.spiritTime === 0) this.sounds.push('spiritEnd');
    if (this.decoy) {
      this.decoy.age += dt;
      if (this.decoy.age > RULES.decoyDuration) this.decoy = null;
    }
    let direction = { x: input.x, y: input.y };
    if (input.x || input.y) this.destination = [];
    else {
      while (this.destination.length && distance(this.player.pos, this.destination[0]) < 0.1)
        this.destination.shift();
      if (this.destination[0])
        direction = {
          x: this.destination[0].x - this.player.pos.x,
          y: this.destination[0].y - this.player.pos.y,
        };
    }
    if (input.dash && this.cooldown === 0) {
      this.decoy = {
        pos: { ...this.player.pos },
        facing: { ...this.player.facing },
        age: 0,
        id: ++this.decoyId,
      };
      this.cooldown = RULES.dashCooldown;
      this.dashTime = RULES.dashDuration;
      this.sounds.push('dash');
    }
    if (this.dashTime > 0) {
      this.dashTime = Math.max(0, this.dashTime - dt);
      if (!direction.x && !direction.y) direction = { ...this.player.facing };
    }
    const speed = this.dashTime > 0 ? RULES.dashSpeed : RULES.speed;
    const next = this.destination[0];
    const previousStride = this.player.stride;
    this.move(
      this.player,
      direction,
      next ? Math.min(speed, distance(this.player.pos, next) / dt) : speed,
      dt,
    );
    this.trailTime += dt;
    if (!this.player.moving || this.dashTime > 0) {
      // A stop or dash returns the next ordinary step to a contact pose.
      this.player.stride = 0;
    } else if (
      previousStride === 0 ||
      Math.floor(this.player.stride / RONIN_FOOTFALL) > Math.floor(previousStride / RONIN_FOOTFALL)
    ) {
      this.sounds.push('step');
    }
    if (this.player.moving && this.trailTime > 0.3) {
      this.trail.push({ pos: { ...this.player.pos }, time: this.elapsed });
      this.trailTime = 0;
    }
    this.trail = this.trail.filter((p) => this.elapsed - p.time < 7);
    // Resolve the pickup before contact so reaching the flame can save a chased player.
    if (
      !this.spiritCollected &&
      distance(this.player.pos, this.level.spirit) < RULES.pickupDistance &&
      clearPath(this.player.pos, this.level.spirit, 0, this.level)
    ) {
      this.spiritCollected = true;
      this.spiritTime = RULES.spiritDuration;
      this.trail = [];
      this.sounds.push('spirit');
    }
    this.level.seals.forEach((seal, i) => {
      if (!this.seals.has(i) && distance(this.player.pos, seal) < RULES.pickupDistance) {
        this.seals.add(i);
        this.sounds.push('seal');
      }
    });
    if (!this.treasure && distance(this.player.pos, this.level.treasure) < RULES.pickupDistance) {
      this.treasure = true;
      this.sounds.push('treasure');
    }
    if (this.seals.size === 3 && distance(this.player.pos, this.level.exit) < 35) {
      this.finish('escaped');
      return;
    }
    for (const enemy of this.enemies) {
      this.updateEnemy(enemy, dt);
      if (
        distance(this.player.pos, enemy.pos) <
          (this.spiritTime > 0 ? RULES.spiritContactDistance : RULES.catchDistance) &&
        clearPath(this.player.pos, enemy.pos, 0, this.level) &&
        enemy.mode !== 'disabled'
      ) {
        if (this.spiritTime > 0) {
          enemy.mode = 'disabled';
          enemy.disabledAt = this.elapsed;
          enemy.moving = false;
          enemy.suspicion = 0;
          enemy.path = [];
          this.knockouts++;
          this.sounds.push('knockout');
        } else if (this.dashTime === 0 && enemy.mode !== 'decoy') {
          this.finish('caught');
          return;
        }
      }
    }
  }
}
