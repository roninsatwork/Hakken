import { insidePolygon, isWalkable, WORLD, type Point } from './MapData';
import { COURTYARD, type LevelDefinition } from './Levels';
import { RULES, type Actor, type Enemy, type NightHeistSimulation } from './NightHeistSimulation';
import { roninPose } from './RoninAnimation';

interface Frame {
  x: number;
  y: number;
  width: number;
  height: number;
  anchorX: number;
}
interface RoninAtlas {
  referenceHeight: number;
  frames: (Frame & { anchorY: number })[];
}
interface Atlas {
  ronin: RoninAtlas;
  idle: RoninAtlas;
  patrols: { frames: Frame[] };
  treasure: { frames: Frame[] };
}
interface Assets {
  background: HTMLImageElement;
  ronin: HTMLImageElement;
  idle: HTMLImageElement;
  patrols: HTMLImageElement;
  treasure: HTMLImageElement;
  atlas: Atlas;
}
export interface RenderLabels {
  exit: string;
  locked: string;
  seal: string;
  treasure: string;
  spirit: string;
}
function loadImage(path: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Game artwork could not be loaded'));
    img.src = path;
  });
}
export async function loadGameAssets(level: LevelDefinition = COURTYARD): Promise<Assets> {
  const [background, ronin, idle, patrols, treasure, response] = await Promise.all([
    loadImage(level.image),
    loadImage('/games/ronins-run/ronin-run-v2.png'),
    loadImage('/games/ronins-run/ronin-idle-v2.png'),
    loadImage('/games/ronins-run/patrols-walk-v1.png'),
    loadImage('/games/ronins-run/treasure-v1.png'),
    fetch('/games/ronins-run/atlas.json'),
  ]);
  if (!response.ok) throw new Error('Game artwork could not be loaded');
  const atlas: Atlas = await response.json();
  if (
    atlas.ronin?.frames?.length !== 16 ||
    atlas.idle?.frames?.length !== 2 ||
    ![atlas.ronin, atlas.idle].every(
      (sheet) =>
        sheet.referenceHeight > 0 && sheet.frames.every((frame) => Number.isFinite(frame.anchorY)),
    ) ||
    atlas.patrols?.frames?.length !== 16 ||
    atlas.treasure?.frames?.length !== 2
  )
    throw new Error('Game animation data is incomplete');
  return { background, ronin, idle, patrols, treasure, atlas };
}

export class NightHeistRenderer {
  private ctx: CanvasRenderingContext2D;
  private colors = {
    light: '',
    shade: '',
    seal: '',
    danger: '',
    lantern: '',
    scarf: '',
  };
  private cones = new Map<Enemy, { time: number; points: Point[] }>();
  constructor(
    private canvas: HTMLCanvasElement,
    private assets: Assets,
    private labels: RenderLabels,
    private level: LevelDefinition = COURTYARD,
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas rendering is unavailable');
    this.ctx = ctx;
    this.refreshColors();
  }
  refreshColors() {
    const style = getComputedStyle(document.documentElement);
    this.colors = {
      light: style.getPropertyValue('--color-info').trim(),
      shade: style.getPropertyValue('--bg-sidebar').trim(),
      seal: style.getPropertyValue('--color-success').trim(),
      danger: style.getPropertyValue('--color-destructive').trim(),
      lantern: style.getPropertyValue('--color-warning').trim(),
      scarf: style.getPropertyValue('--color-brand').trim(),
    };
  }
  setLabels(labels: RenderLabels) {
    this.labels = labels;
  }
  private path(points: readonly (readonly [number, number])[]) {
    this.ctx.beginPath();
    points.forEach(([x, y], i) => (i ? this.ctx.lineTo(x, y) : this.ctx.moveTo(x, y)));
    this.ctx.closePath();
  }
  private glow(point: Point, color: string, radius: number, opacity: number) {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = opacity;
    const gradient = ctx.createRadialGradient(point.x, point.y, 0, point.x, point.y, radius);
    gradient.addColorStop(0, color);
    gradient.addColorStop(1, 'transparent');
    ctx.fillStyle = gradient;
    ctx.fillRect(point.x - radius, point.y - radius, radius * 2, radius * 2);
    ctx.restore();
  }
  private shadow(pos: Point, width: number) {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = this.colors.shade;
    ctx.beginPath();
    ctx.ellipse(pos.x, pos.y, width, width * 0.33, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  private ronin(actor: Actor, opacity = 1, dashing = false) {
    const ctx = this.ctx;
    const pose = roninPose(actor, dashing);
    const atlas = pose.sheet === 'idle' ? this.assets.atlas.idle : this.assets.atlas.ronin;
    const frame = atlas.frames[pose.frame];
    // One scale for the sheet and an authored ground origin, never the lowest toe.
    // Fitting each pose to its own bounds would erase compression and flight.
    const scale = (pose.sheet === 'idle' ? 84 : 76) / atlas.referenceHeight;
    this.shadow(actor.pos, pose.airborne ? 10 : 13);
    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.translate(actor.pos.x, actor.pos.y);
    if (pose.flip) ctx.scale(-1, 1);
    ctx.drawImage(
      pose.sheet === 'idle' ? this.assets.idle : this.assets.ronin,
      frame.x,
      frame.y,
      frame.width,
      frame.height,
      -frame.anchorX * scale,
      -frame.anchorY * scale,
      frame.width * scale,
      frame.height * scale,
    );
    ctx.restore();
  }
  private actor(actor: Actor, kind: 'guard' | 'hound', opacity = 1, disabled = false) {
    const ctx = this.ctx;
    const left = actor.facing.x < 0,
      back = actor.facing.y < -0.15;
    const row = (kind === 'hound' ? 2 : 0) + (back ? 1 : 0);
    const column = actor.moving ? Math.floor(actor.stride / 15) % 4 : 1;
    const frame = this.assets.atlas.patrols.frames[row * 4 + column];
    const image = this.assets.patrols;
    const height = kind === 'hound' ? 46 : 83;
    const scale = height / frame.height;
    this.shadow(actor.pos, kind === 'hound' ? 24 : 13);
    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.translate(actor.pos.x, actor.pos.y);
    if (disabled) {
      ctx.translate(kind === 'guard' ? -22 : 0, -4);
      if (kind === 'guard') ctx.rotate(Math.PI / 2);
      else ctx.scale(1, 0.48);
    }
    if (left) ctx.scale(-1, 1);
    ctx.drawImage(
      image,
      frame.x,
      frame.y,
      frame.width,
      frame.height,
      -frame.anchorX * scale,
      -height,
      frame.width * scale,
      height,
    );
    ctx.restore();
  }
  private cone(enemy: Enemy, time: number) {
    if (enemy.kind === 'hound') return;
    const cached = this.cones.get(enemy);
    let points = cached?.points;
    if (!cached || time - cached.time > 0.12) {
      points = [];
      const heading = Math.atan2(enemy.facing.y, enemy.facing.x);
      for (let i = 0; i <= 30; i++) {
        const angle = heading - Math.PI * 0.24 + (Math.PI * 0.48 * i) / 30;
        let radius = 4;
        for (; radius < 205; radius += 6)
          if (
            !isWalkable(
              {
                x: enemy.pos.x + Math.cos(angle) * radius,
                y: enemy.pos.y + Math.sin(angle) * radius,
              },
              0,
              this.level,
            )
          )
            break;
        points.push({
          x: enemy.pos.x + Math.cos(angle) * Math.max(0, radius - 6),
          y: enemy.pos.y + Math.sin(angle) * Math.max(0, radius - 6),
        });
      }
      this.cones.set(enemy, { time, points });
    }
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = enemy.mode === 'chase' ? 0.22 : 0.15;
    ctx.fillStyle = enemy.mode === 'chase' ? this.colors.danger : this.colors.lantern;
    ctx.beginPath();
    ctx.moveTo(enemy.pos.x, enemy.pos.y);
    points?.forEach((p) => ctx.lineTo(p.x, p.y));
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  private seal(point: Point, index: number, time: number) {
    const ctx = this.ctx;
    const bob = Math.sin(time * 2.3 + index) * 3;
    this.glow({ x: point.x, y: point.y - 15 }, this.colors.seal, 43, 0.32);
    ctx.save();
    ctx.translate(point.x, point.y - 19 + bob);
    ctx.strokeStyle = this.colors.seal;
    ctx.lineWidth = 2.5;
    ctx.shadowColor = this.colors.seal;
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(0, 0, 15, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.moveTo(0, -9);
    ctx.lineTo(8, 0);
    ctx.lineTo(0, 9);
    ctx.lineTo(-8, 0);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-11, 0);
    ctx.lineTo(11, 0);
    ctx.moveTo(0, -11);
    ctx.lineTo(0, 11);
    ctx.stroke();
    ctx.restore();
  }
  private chest(point: Point, opened: boolean) {
    const frame = this.assets.atlas.treasure.frames[opened ? 1 : 0];
    const scale = 52 / frame.width;
    this.shadow(point, 23);
    this.ctx.drawImage(
      this.assets.treasure,
      frame.x,
      frame.y,
      frame.width,
      frame.height,
      point.x - frame.anchorX * scale,
      point.y - frame.height * scale,
      frame.width * scale,
      frame.height * scale,
    );
  }
  private spiritFlame(point: Point, time: number, spent: boolean) {
    const ctx = this.ctx;
    this.shadow(point, 18);
    ctx.save();
    ctx.translate(point.x, point.y);
    ctx.strokeStyle = this.colors.light;
    ctx.fillStyle = this.colors.shade;
    ctx.lineWidth = 2;
    ctx.globalAlpha = spent ? 0.3 : 0.9;
    this.path([
      [-18, 0],
      [0, -8],
      [18, 0],
      [0, 8],
    ]);
    ctx.fill();
    ctx.stroke();
    if (!spent) {
      const sway = Math.sin(time * 2.5) * 3;
      ctx.shadowColor = this.colors.light;
      ctx.shadowBlur = 18;
      ctx.fillStyle = this.colors.light;
      ctx.beginPath();
      ctx.moveTo(0, -8);
      ctx.bezierCurveTo(-28, -16, -5, -33, -2 + sway, -54);
      ctx.bezierCurveTo(14, -43, 5, -28, 15, -34);
      ctx.bezierCurveTo(27, -17, 12, -8, 0, -8);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.textAlign = 'center';
      ctx.font = '600 13px sans-serif';
      ctx.fillText(this.labels.spirit, 0, 27);
    }
    ctx.restore();
    if (!spent) this.glow({ x: point.x, y: point.y - 24 }, this.colors.light, 64, 0.22);
  }
  private spiritAura(game: NightHeistSimulation, time: number) {
    if (game.spiritTime <= 0) return;
    const ctx = this.ctx,
      pos = game.player.pos;
    const color = game.spiritTime <= RULES.spiritWarning ? this.colors.lantern : this.colors.light;
    this.glow({ x: pos.x, y: pos.y - 30 }, color, 58, 0.35);
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.shadowColor = color;
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.ellipse(pos.x, pos.y - 2, 26, 11, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = color;
    for (let i = 0; i < 4; i++) {
      const angle = time * 2 + (i * Math.PI) / 2;
      ctx.beginPath();
      ctx.arc(pos.x + Math.cos(angle) * 24, pos.y - 24 + Math.sin(angle) * 18, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
  private disabledMarker(enemy: Enemy, elapsed: number, time: number) {
    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = this.colors.light;
    ctx.strokeStyle = this.colors.light;
    ctx.textAlign = 'center';
    ctx.font = 'bold 16px sans-serif';
    // A grounded body and three sparks remain legible even with motion reduced.
    for (let i = 0; i < 3; i++) {
      const angle = time * 1.8 + (i * Math.PI * 2) / 3;
      ctx.fillText('✦', enemy.pos.x + Math.cos(angle) * 16, enemy.pos.y - 26 + Math.sin(angle) * 5);
    }
    const age = elapsed - (enemy.disabledAt ?? elapsed);
    if (age < 0.45) {
      ctx.globalAlpha = 1 - age / 0.45;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(enemy.pos.x, enemy.pos.y - 12, 20 + age * 70, 12 + age * 40, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }
  render(game: NightHeistSimulation, time: number, reducedMotion: boolean) {
    const ctx = this.ctx;
    const width = Math.round(this.canvas.clientWidth * Math.min(devicePixelRatio || 1, 2));
    const height = Math.round((width * WORLD.height) / WORLD.width);
    if (width < 1) return;
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
      this.refreshColors();
    }
    ctx.setTransform(width / WORLD.width, 0, 0, height / WORLD.height, 0, 0);
    ctx.clearRect(0, 0, WORLD.width, WORLD.height);
    ctx.drawImage(this.assets.background, 0, 0, WORLD.width, WORLD.height);
    const animatedTime = reducedMotion ? 0 : time;
    for (const enemy of game.enemies) {
      if (enemy.mode === 'disabled' || enemy.mode === 'flee') continue;
      this.cone(enemy, time);
      if (enemy.kind === 'guard')
        this.glow({ x: enemy.pos.x + 10, y: enemy.pos.y - 26 }, this.colors.lantern, 48, 0.12);
    }
    const unlocked = game.seals.size === 3;
    this.glow(
      this.level.exit,
      unlocked ? this.colors.seal : this.colors.lantern,
      65,
      unlocked ? 0.4 : 0.12,
    );
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = '600 15px sans-serif';
    ctx.fillStyle = unlocked ? this.colors.seal : this.colors.lantern;
    ctx.fillText(
      unlocked ? this.labels.exit : this.labels.locked,
      this.level.exit.x,
      this.level.exit.y - 32,
    );
    ctx.restore();
    this.level.seals.forEach((point, i) => {
      if (!game.seals.has(i)) this.seal(point, i, animatedTime);
    });
    if (!game.treasure) this.glow(this.level.treasure, this.colors.lantern, 40, 0.18);
    const entities: { depth: number; draw: () => void }[] = [
      {
        depth: this.level.treasure.y,
        draw: () => this.chest(this.level.treasure, game.treasure),
      },
      {
        depth: this.level.spirit.y,
        draw: () => this.spiritFlame(this.level.spirit, animatedTime, game.spiritCollected),
      },
    ];
    entities.push(
      ...game.enemies.map((enemy) => ({
        depth: enemy.pos.y,
        draw: () => {
          this.actor(
            enemy,
            enemy.kind,
            enemy.mode === 'disabled' ? 0.65 : 1,
            enemy.mode === 'disabled',
          );
          if (enemy.mode === 'disabled') this.disabledMarker(enemy, game.elapsed, animatedTime);
          else if (enemy.mode === 'flee') this.glow(enemy.pos, this.colors.light, 30, 0.25);
        },
      })),
    );
    if (game.decoy) {
      const decoy = game.decoy;
      entities.push({
        depth: decoy.pos.y,
        draw: () => {
          this.glow(decoy.pos, this.colors.scarf, 42, 0.2);
          this.ronin(
            { pos: decoy.pos, facing: decoy.facing, moving: false, stride: 0 },
            Math.max(0, 0.45 - decoy.age * 0.08),
          );
        },
      });
    }
    entities.push({
      depth: game.player.pos.y,
      draw: () => {
        this.spiritAura(game, animatedTime);
        this.ronin(game.player, 1, game.dashTime > 0);
      },
    });
    entities.push(
      ...this.level.foreground.map((layer) => ({
        depth: layer.depth,
        draw: () => {
          ctx.save();
          this.path(layer.polygon);
          ctx.clip();
          ctx.drawImage(this.assets.background, 0, 0, WORLD.width, WORLD.height);
          ctx.restore();
        },
      })),
    );
    entities.sort((a, b) => a.depth - b.depth).forEach((entity) => entity.draw());
    // A quiet rim marks the hero when architecture is in front of them.
    if (
      this.level.foreground.some(
        (layer) => game.player.pos.y < layer.depth && insidePolygon(game.player.pos, layer.polygon),
      )
    ) {
      ctx.save();
      ctx.strokeStyle = this.colors.light;
      ctx.globalAlpha = 0.8;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(game.player.pos.x, game.player.pos.y, 13, 6, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    for (const enemy of game.enemies) {
      if (enemy.suspicion > 0.05 || enemy.mode === 'decoy') {
        ctx.save();
        ctx.textAlign = 'center';
        ctx.font = 'bold 22px sans-serif';
        ctx.fillStyle = enemy.mode === 'chase' ? this.colors.danger : this.colors.lantern;
        ctx.fillText(
          enemy.mode === 'chase' ? '!' : '?',
          enemy.pos.x,
          enemy.pos.y - (enemy.kind === 'hound' ? 58 : 94),
        );
        ctx.restore();
      }
    }
    if (game.destination.length) {
      const target = game.destination.at(-1)!;
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = this.colors.light;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(target.x, target.y, 10, 5, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    if (!reducedMotion) {
      ctx.save();
      ctx.strokeStyle = this.colors.light;
      ctx.globalAlpha = 0.14;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      for (let i = 0; i < 94; i++) {
        const x = (i * 173.31 + time * 37) % WORLD.width,
          y = (i * 89.17 + time * 480) % WORLD.height;
        ctx.moveTo(x, y);
        ctx.lineTo(x - 5, y + 13);
      }
      ctx.stroke();
      ctx.restore();
    }
  }
}
