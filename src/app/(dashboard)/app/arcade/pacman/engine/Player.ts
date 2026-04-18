import { MAP_SETTINGS } from "./MapData";

export interface Position {
  x: number;
  y: number;
}

export class Player {
  public pos: Position;
  public gridPos: Position;
  public radius: number = Math.floor(MAP_SETTINGS.TILE_SIZE * 0.7) / 2;
  
  // Directions: 0=Right, 1=Down, 2=Left, 3=Up
  public direction: number = 0;
  public nextDirection: number = 0;
  
  private speed = 1.25; 
  private mouthOpen = 0;
  private mouthDir = 1;

  constructor(startX: number, startY: number) {
    this.pos = { x: startX * MAP_SETTINGS.TILE_SIZE + MAP_SETTINGS.TILE_SIZE / 2, y: startY * MAP_SETTINGS.TILE_SIZE + MAP_SETTINGS.TILE_SIZE / 2 };
    this.gridPos = { x: startX, y: startY };
  }

  public update(grid: number[][]) {
    // 1. Calculate Grid Position based on visual center coordinate
    this.gridPos.x = Math.floor(this.pos.x / MAP_SETTINGS.TILE_SIZE);
    this.gridPos.y = Math.floor(this.pos.y / MAP_SETTINGS.TILE_SIZE);

    // Mouth animation (chomping)
    this.mouthOpen += 0.1 * this.mouthDir;
    if (this.mouthOpen >= 0.4 || this.mouthOpen <= 0) {
      this.mouthDir *= -1;
    }

    // Grid snapping context for cornering cleanly
    const isCenteredX = (this.pos.x % MAP_SETTINGS.TILE_SIZE) === MAP_SETTINGS.TILE_SIZE / 2;
    const isCenteredY = (this.pos.y % MAP_SETTINGS.TILE_SIZE) === MAP_SETTINGS.TILE_SIZE / 2;
    const isCentered = isCenteredX && isCenteredY;

    // Boundary teleportation (warp holes on the sides)
    if (this.gridPos.x <= 0 && this.direction === 2) {
      this.pos.x = MAP_SETTINGS.COLUMNS * MAP_SETTINGS.TILE_SIZE - this.speed;
      return;
    }
    if (this.gridPos.x >= MAP_SETTINGS.COLUMNS - 1 && this.direction === 0) {
      this.pos.x = this.speed;
      return;
    }

    if (isCentered) {
      // Try to execute queued Turn
      if (this.canMove(this.nextDirection, grid)) {
        this.direction = this.nextDirection;
      }
    }

    // Attempt to move in the current direction
    if (this.canMove(this.direction, grid)) {
      if (this.direction === 0) this.pos.x += this.speed;
      if (this.direction === 1) this.pos.y += this.speed;
      if (this.direction === 2) this.pos.x -= this.speed;
      if (this.direction === 3) this.pos.y -= this.speed;
    } else {
       // Snap gracefully if we push up against a wall preventing jitter
       if (this.direction === 0 || this.direction === 2) {
          this.pos.x = this.gridPos.x * MAP_SETTINGS.TILE_SIZE + MAP_SETTINGS.TILE_SIZE / 2;
       }
       if (this.direction === 1 || this.direction === 3) {
          this.pos.y = this.gridPos.y * MAP_SETTINGS.TILE_SIZE + MAP_SETTINGS.TILE_SIZE / 2;
       }
    }
  }

  private canMove(dir: number, grid: number[][]): boolean {
    const margin = this.speed;
    // Calculate leading edge
    let nextX = this.pos.x;
    let nextY = this.pos.y;

    if (dir === 0) nextX += MAP_SETTINGS.TILE_SIZE / 2 + margin;
    if (dir === 1) nextY += MAP_SETTINGS.TILE_SIZE / 2 + margin;
    if (dir === 2) nextX -= MAP_SETTINGS.TILE_SIZE / 2 + margin;
    if (dir === 3) nextY -= MAP_SETTINGS.TILE_SIZE / 2 + margin;

    const row = Math.floor(nextY / MAP_SETTINGS.TILE_SIZE);
    const col = Math.floor(nextX / MAP_SETTINGS.TILE_SIZE);

    if (col < 0 || col >= MAP_SETTINGS.COLUMNS) return true; // Allows walking off edge for warp
    if (row < 0 || row >= MAP_SETTINGS.ROWS) return false;

    // Ghost doors (4) are not passable by player
    return grid[row][col] !== 1 && grid[row][col] !== 4; 
  }

  public draw(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.translate(this.pos.x, this.pos.y);
    
    // Rotate canvas context based on direction
    if (this.direction === 1) ctx.rotate(Math.PI / 2);
    else if (this.direction === 2) ctx.rotate(Math.PI);
    else if (this.direction === 3) ctx.rotate(-Math.PI / 2);
    
    ctx.fillStyle = '#FFEB3B';
    ctx.beginPath();
    
    // The chomp arc logic
    const startAngle = this.mouthOpen * Math.PI;
    const endAngle = (2 - this.mouthOpen) * Math.PI;
    
    ctx.arc(0, 0, this.radius, startAngle, endAngle);
    ctx.lineTo(0, 0);
    ctx.fill();
    ctx.restore();
  }
}
