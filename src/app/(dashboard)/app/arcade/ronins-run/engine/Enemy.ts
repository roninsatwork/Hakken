import { MAP_SETTINGS } from "./MapData";
import { Position } from "./Player";

export class Enemy {
  public pos: Position;
  public gridPos: Position;
  public color: string;
  public direction: number = 0; // 0=Right, 1=Down, 2=Left, 3=Up
  public radius: number = Math.floor(MAP_SETTINGS.TILE_SIZE * 0.7) / 2;
  
  private speed = 1;
  // 0: chase, 1: frightened, 2: dead (eyes)
  public state: number = 0;
  public facing: number = 1; // 1 = Right, -1 = Left

  constructor(startX: number, startY: number, color: string) {
    this.pos = { x: startX * MAP_SETTINGS.TILE_SIZE + MAP_SETTINGS.TILE_SIZE / 2, y: startY * MAP_SETTINGS.TILE_SIZE + MAP_SETTINGS.TILE_SIZE / 2 };
    this.gridPos = { x: startX, y: startY };
    this.color = color;
  }

  public update(grid: number[][], target: Position) {
    if (this.state === 2) {
      // Dead - return to spawn
      // Simplified: Just respawn for now to keep logic safe
      this.pos.x = 13 * MAP_SETTINGS.TILE_SIZE + MAP_SETTINGS.TILE_SIZE / 2;
      this.pos.y = 11 * MAP_SETTINGS.TILE_SIZE + MAP_SETTINGS.TILE_SIZE / 2;
      this.state = 0;
      return;
    }

    this.gridPos.x = Math.floor(this.pos.x / MAP_SETTINGS.TILE_SIZE);
    this.gridPos.y = Math.floor(this.pos.y / MAP_SETTINGS.TILE_SIZE);

    const isCenteredX = (this.pos.x % MAP_SETTINGS.TILE_SIZE) === MAP_SETTINGS.TILE_SIZE / 2;
    const isCenteredY = (this.pos.y % MAP_SETTINGS.TILE_SIZE) === MAP_SETTINGS.TILE_SIZE / 2;
    
    // Choose intersection
    if (isCenteredX && isCenteredY) {
      const validMoves = [];
      for (let i = 0; i < 4; i++) {
        // Can't reverse
        if (i === (this.direction + 2) % 4) continue;
        if (this.canMove(i, grid)) {
          validMoves.push(i);
        }
      }

      if (validMoves.length > 0) {
        if (this.state === 1) {
          // Frightened: pick randomly
          this.direction = validMoves[Math.floor(Math.random() * validMoves.length)];
        } else {
          // Chase: biased pick towards target (pseudo pathfinding)
          // Evaluate distances
          let bestMove = validMoves[0];
          let minDistance = Infinity;

          for (const move of validMoves) {
            let nextX = this.gridPos.x;
            let nextY = this.gridPos.y;
            if (move === 0) nextX++;
            if (move === 1) nextY++;
            if (move === 2) nextX--;
            if (move === 3) nextY--;

            const dist = Math.pow(nextX - target.x, 2) + Math.pow(nextY - target.y, 2);
            if (dist < minDistance) {
              minDistance = dist;
              bestMove = move;
            }
          }
          // Slight randomness to prevent getting stuck in loops
          if (Math.random() > 0.8) {
             this.direction = validMoves[Math.floor(Math.random() * validMoves.length)];
          } else {
             this.direction = bestMove;
          }
        }
      }
    }

    if (this.canMove(this.direction, grid)) {
      if (this.direction === 0) { this.pos.x += this.speed; this.facing = 1; }
      if (this.direction === 1) this.pos.y += this.speed;
      if (this.direction === 2) { this.pos.x -= this.speed; this.facing = -1; }
      if (this.direction === 3) this.pos.y -= this.speed;
    } else {
       if (this.direction === 0 || this.direction === 2) {
          this.pos.x = this.gridPos.x * MAP_SETTINGS.TILE_SIZE + MAP_SETTINGS.TILE_SIZE / 2;
       }
       if (this.direction === 1 || this.direction === 3) {
          this.pos.y = this.gridPos.y * MAP_SETTINGS.TILE_SIZE + MAP_SETTINGS.TILE_SIZE / 2;
       }
       // If totally stuck against a wall, reverse
       this.direction = (this.direction + 2) % 4;
    }
  }

  private canMove(dir: number, grid: number[][]): boolean {
    const margin = this.speed;
    let nextX = this.pos.x;
    let nextY = this.pos.y;

    if (dir === 0) nextX += MAP_SETTINGS.TILE_SIZE / 2 + margin;
    if (dir === 1) nextY += MAP_SETTINGS.TILE_SIZE / 2 + margin;
    if (dir === 2) nextX -= MAP_SETTINGS.TILE_SIZE / 2 + margin;
    if (dir === 3) nextY -= MAP_SETTINGS.TILE_SIZE / 2 + margin;

    const row = Math.floor(nextY / MAP_SETTINGS.TILE_SIZE);
    const col = Math.floor(nextX / MAP_SETTINGS.TILE_SIZE);

    if (col < 0 || col >= MAP_SETTINGS.COLUMNS) return true; // Warp logic
    if (row < 0 || row >= MAP_SETTINGS.ROWS) return false;

    // Ghosts CAN move through doors (4) if they are spawning
    return grid[row][col] !== 1;
  }

  public draw(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.translate(this.pos.x, this.pos.y);

    let isFrightened = false;
    if (this.state === 1) {
      isFrightened = true;
    }

    if (this.state === 2) {
      // Dead (fleeing spirit/smoke)
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.beginPath();
      ctx.arc(0, 0, this.radius * 0.5, 0, Math.PI * 2);
      ctx.fill();
    } else if (isFrightened) {
      // Substitution Log (Kawarimi no Jutsu)
      ctx.fillStyle = '#8B5A2B'; // Wood
      ctx.fillRect(-this.radius + 2, -this.radius * 0.8, this.radius * 2 - 4, this.radius * 1.6);
      
      // Log rings
      ctx.strokeStyle = '#5A3A1B';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(-this.radius + 2, 0, this.radius * 0.6, Math.PI * -0.5, Math.PI * 0.5);
      ctx.stroke();
    } else {
      // True Side-Profile Ninja Body
      // We flip horizontally based on facing direction, but NEVER rotate for vertical movement
      // to maintain a true side-scrolling platformer perspective.
      ctx.scale(this.facing, 1);

      // Simple run cycle animation based on map position
      const runCycle = Math.sin((this.pos.x + this.pos.y) * 0.3);
      const bounce = Math.abs(runCycle) * 2;
      
      // Shift everything slightly based on running bounce
      ctx.translate(0, -bounce + this.radius * 0.2); // slight downward adjust to anchor feet

      // 1. Torso (Leaning forward in ninja run)
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.ellipse(-this.radius * 0.15, this.radius * 0.3, this.radius * 0.4, this.radius * 0.5, Math.PI / 8, 0, Math.PI * 2);
      ctx.fill();

      // 2. Head
      ctx.beginPath();
      ctx.arc(0, -this.radius * 0.3, this.radius * 0.5, 0, Math.PI * 2);
      ctx.fill();

      // 3. Face Opening (Profile cut-out)
      ctx.fillStyle = '#FFE4C4'; // Skin tone
      ctx.beginPath();
      ctx.arc(this.radius * 0.25, -this.radius * 0.3, this.radius * 0.35, -Math.PI * 0.4, Math.PI * 0.45);
      ctx.fill();

      // 4. Headband Ribbon (blowing straight back)
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.moveTo(-this.radius * 0.45, -this.radius * 0.3);
      ctx.lineTo(-this.radius * 1.4, -this.radius * 0.5 + runCycle * 2);
      ctx.lineTo(-this.radius * 0.9, -this.radius * 0.3);
      ctx.lineTo(-this.radius * 1.3, -this.radius * 0.1 - runCycle * 2);
      ctx.fill();
      
      // 5. Headband Tie
      ctx.strokeStyle = '#111';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-this.radius * 0.4, -this.radius * 0.5);
      ctx.lineTo(this.radius * 0.5, -this.radius * 0.5);
      ctx.stroke();

      // 6. Eye (Side profile)
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.arc(this.radius * 0.3, -this.radius * 0.4, 1.5, 0, Math.PI * 2);
      ctx.fill();

      // 7. Arms (Thrown back for aggressive sprint)
      ctx.strokeStyle = this.color;
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-this.radius * 0.1, this.radius * 0.1);
      ctx.lineTo(-this.radius * 1.0, -this.radius * 0.1 + (runCycle * 1.5));
      ctx.stroke();

      // 8. Legs (Animated scissoring spread)
      ctx.strokeStyle = this.color;
      ctx.lineWidth = 3.5;
      
      // Front Leg
      ctx.beginPath();
      ctx.moveTo(0, this.radius * 0.6);
      ctx.lineTo(this.radius * 0.4 * runCycle + 2, this.radius * 1.1);
      ctx.stroke();

      // Back Leg
      ctx.beginPath();
      ctx.moveTo(-this.radius * 0.2, this.radius * 0.6);
      ctx.lineTo(-this.radius * 0.4 * runCycle - 2, this.radius * 1.1);
      ctx.stroke();
    }
    
    ctx.restore();
  }
}
