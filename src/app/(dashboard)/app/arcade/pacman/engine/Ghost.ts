import { MAP_SETTINGS } from "./MapData";
import { Position } from "./Player";

export class Ghost {
  public pos: Position;
  public gridPos: Position;
  public color: string;
  public direction: number = 0; // 0=Right, 1=Down, 2=Left, 3=Up
  public radius: number = Math.floor(MAP_SETTINGS.TILE_SIZE * 0.7) / 2;
  
  private speed = 1;
  // 0: chase, 1: frightened, 2: dead (eyes)
  public state: number = 0;

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
      if (this.direction === 0) this.pos.x += this.speed;
      if (this.direction === 1) this.pos.y += this.speed;
      if (this.direction === 2) this.pos.x -= this.speed;
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

    if (this.state === 1) {
      ctx.fillStyle = '#0000FF'; // Frightened blue
    } else if (this.state === 2) {
      ctx.fillStyle = 'rgba(255,255,255,0)'; // Dead (invisible body)
    } else {
      ctx.fillStyle = this.color;
    }

    // Draw body
    ctx.beginPath();
    ctx.arc(0, -2, this.radius, Math.PI, 0);
    ctx.lineTo(this.radius, this.radius);
    
    // Bottom wavy skirt
    ctx.lineTo(this.radius/2, this.radius - 2);
    ctx.lineTo(0, this.radius);
    ctx.lineTo(-this.radius/2, this.radius - 2);
    ctx.lineTo(-this.radius, this.radius);
    ctx.fill();

    // Eyes
    ctx.fillStyle = 'white';
    ctx.beginPath();
    ctx.arc(-3, -2, 2.5, 0, Math.PI * 2);
    ctx.arc(3, -2, 2.5, 0, Math.PI * 2);
    ctx.fill();
    
    // Pupils
    let pupilOffsetX = 0;
    let pupilOffsetY = 0;
    if (this.direction === 0) pupilOffsetX = 1;
    if (this.direction === 1) pupilOffsetY = 1;
    if (this.direction === 2) pupilOffsetX = -1;
    if (this.direction === 3) pupilOffsetY = -1;
    
    ctx.fillStyle = 'blue';
    ctx.beginPath();
    ctx.arc(-3 + pupilOffsetX, -2 + pupilOffsetY, 1, 0, Math.PI * 2);
    ctx.arc(3 + pupilOffsetX, -2 + pupilOffsetY, 1, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.restore();
  }
}
