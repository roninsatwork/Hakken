import { PACMAN_GRID, MAP_SETTINGS } from "./MapData";
import { Player } from "./Player";
import { Ghost } from "./Ghost";
import { AudioEngine } from "./AudioEngine";

interface GameEngineCallbacks {
  onGameOver: (score: number) => void;
}

export class GameEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private animationFrameId: number = 0;
  private isRunning: boolean = false;
  private grid: number[][] = [];
  
  // Entities
  private player!: Player;
  private ghosts: Ghost[] = [];
  private audio: AudioEngine;

  // Game State
  private score: number = 0;
  private lives: number = 3;
  private currentLevel: number = 1;
  private powerTimer: number = 0;
  private levelTransitionTimer: number = 0;
  private lastTime: number = 0;
  private accumulator: number = 0;
  private readonly fixedStep: number = 1000 / 60; // Locked 60 FPS

  private callbacks: GameEngineCallbacks;

  constructor(canvas: HTMLCanvasElement, callbacks: GameEngineCallbacks) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error("Could not initialize 2D context");
    this.ctx = ctx;
    this.callbacks = callbacks;
    this.audio = new AudioEngine();
    
    this.resetGame();
    
    // Bind the loop so it has the correct 'this' context
    this.loop = this.loop.bind(this);
    this.handleInput = this.handleInput.bind(this);
  }

  private resetGame() {
    this.grid = PACMAN_GRID.map(row => [...row]);
    
    // Spawn Player at standard pos (col 13.5, row 23)
    this.player = new Player(13.5, 23);
    
    // Spawn Ghosts
    this.ghosts = [
      new Ghost(13.5, 11, '#FF0000'), // Blinky
      new Ghost(13.5, 14, '#FFB8FF'), // Pinky
      new Ghost(11.5, 14, '#00FFFF'), // Inky
      new Ghost(15.5, 14, '#FFB852')  // Clyde
    ];
  }

  private resetRound() {
    this.player = new Player(13.5, 23);
    this.ghosts = [
      new Ghost(13.5, 11, '#FF0000'), 
      new Ghost(13.5, 14, '#FFB8FF'), 
      new Ghost(11.5, 14, '#00FFFF'), 
      new Ghost(15.5, 14, '#FFB852')  
    ];
  }

  public start() {
    if (this.isRunning) return;
    this.audio.init();
    this.isRunning = true;
    this.lastTime = performance.now();
    this.accumulator = 0;
    window.addEventListener('keydown', this.handleInput);
    this.animationFrameId = requestAnimationFrame(this.loop);
    this.audio.playSiren(this.currentLevel);
  }

  public stop() {
    this.isRunning = false;
    this.audio.stopSiren();
    window.removeEventListener('keydown', this.handleInput);
    cancelAnimationFrame(this.animationFrameId);
  }

  private handleInput(e: KeyboardEvent) {
    if (e.key === "ArrowRight") this.player.nextDirection = 0;
    if (e.key === "ArrowDown") this.player.nextDirection = 1;
    if (e.key === "ArrowLeft") this.player.nextDirection = 2;
    if (e.key === "ArrowUp") this.player.nextDirection = 3;
    // Prevent default scrolling
    if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(e.key)) {
       e.preventDefault();
    }
  }

  private update() {
    if (this.levelTransitionTimer > 0) {
      this.levelTransitionTimer -= this.fixedStep;
      if (this.levelTransitionTimer <= 0) {
        this.levelTransitionTimer = 0;
        this.currentLevel++;
        this.resetGame();
        this.audio.playSiren(this.currentLevel);
      }
      return; 
    }

    this.player.update(this.grid);

    // Collision with dots
    const col = this.player.gridPos.x;
    const row = this.player.gridPos.y;

    let dotsRemaining = 0;

    if (row >= 0 && row < MAP_SETTINGS.ROWS && col >= 0 && col < MAP_SETTINGS.COLUMNS) {
      if (this.grid[row][col] === 2) {
        this.grid[row][col] = 0; // eaten
        this.score += 10;
        this.audio.playChomp();
      } else if (this.grid[row][col] === 3) {
        this.grid[row][col] = 0; // eaten power pellet
        this.score += 50;
        this.powerTimer = 500 - (this.currentLevel * 20); // ticks
        this.ghosts.forEach(g => { if (g.state !== 2) g.state = 1; });
        this.audio.playPowerPelletLoop();
      }
    }
    
    // Check win condition (Count remaining dots)
    for (let r = 0; r < MAP_SETTINGS.ROWS; r++) {
      for (let c = 0; c < MAP_SETTINGS.COLUMNS; c++) {
        if (this.grid[r][c] === 2 || this.grid[r][c] === 3) dotsRemaining++;
      }
    }

    if (dotsRemaining === 0) {
       this.audio.stopSiren();
       this.levelTransitionTimer = 3000; // 3 second pause
       return;
    }

    if (this.powerTimer > 0) {
       this.powerTimer--;
       if (this.powerTimer === 0) {
          this.ghosts.forEach(g => { if (g.state === 1) g.state = 0; });
          this.audio.playSiren(this.currentLevel);
       }
    }

    const collisionDist = Math.pow(MAP_SETTINGS.TILE_SIZE * 0.8, 2);

    this.ghosts.forEach(ghost => {
      ghost.update(this.grid, this.player.gridPos);
      
      const dist = Math.pow(this.player.pos.x - ghost.pos.x, 2) + Math.pow(this.player.pos.y - ghost.pos.y, 2);
      if (dist < collisionDist) {
        if (ghost.state === 1) { // Eat ghost
           ghost.state = 2; // Dead eyes
           this.score += 200;
           this.audio.playEatGhost(); 
        } else if (ghost.state === 0) {
           // Pacman dies
           this.audio.playDeath();
           this.lives--;
           if (this.lives <= 0) {
             this.gameOver();
           } else {
             this.resetRound();
           }
        }
      }
    });
  }

  private drawMap() {
    const { TILE_SIZE } = MAP_SETTINGS;
    
    // Fill background
    this.ctx.fillStyle = '#000000';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    for (let row = 0; row < MAP_SETTINGS.ROWS; row++) {
      for (let col = 0; col < MAP_SETTINGS.COLUMNS; col++) {
        const tile = this.grid[row][col];
        const x = col * TILE_SIZE;
        const y = row * TILE_SIZE;

        if (tile === 1) {
          // Wall
          this.ctx.fillStyle = '#2121ff'; // Neon blue border
          this.ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
          
          // Inner hollow to look like original pipes
          this.ctx.fillStyle = '#000000';
          this.ctx.fillRect(x + 2, y + 2, TILE_SIZE - 4, TILE_SIZE - 4);
        } else if (tile === 2) {
          // Regular dot
          this.ctx.fillStyle = '#ffb8ae';
          this.ctx.beginPath();
          this.ctx.arc(x + TILE_SIZE / 2, y + TILE_SIZE / 2, 3, 0, Math.PI * 2);
          this.ctx.fill();
        } else if (tile === 3) {
          // Power pellet (could blink logic here later)
          this.ctx.fillStyle = '#ffb8ae';
          this.ctx.beginPath();
          this.ctx.arc(x + TILE_SIZE / 2, y + TILE_SIZE / 2, 8, 0, Math.PI * 2);
          this.ctx.fill();
        } else if (tile === 4) {
          // Ghost door
          this.ctx.fillStyle = '#ffb8ff'; // Pink gate
          this.ctx.fillRect(x, y + TILE_SIZE / 2 - 2, TILE_SIZE, 4);
        }
      }
    }
  }

  private drawEntities() {
    this.player.draw(this.ctx);
    this.ghosts.forEach(ghost => ghost.draw(this.ctx));
  }

  private drawUI() {
    this.ctx.fillStyle = '#ffffff';
    this.ctx.font = '16px "Press Start 2P"';
    this.ctx.textAlign = 'left';
    this.ctx.fillText(`SCORE: ${this.score}`, 10, 25);
    
    this.ctx.fillStyle = '#FFEB3B';
    this.ctx.textAlign = 'right';
    this.ctx.fillText(`LEVEL: ${this.currentLevel}`, this.canvas.width - 10, 25);

    // Draw Lives
    this.ctx.fillStyle = '#FFEB3B';
    for(let i=0; i < this.lives; i++) {
       this.ctx.beginPath();
       this.ctx.arc(20 + (i * 25), this.canvas.height - 20, 10, 0.2*Math.PI, 1.8*Math.PI);
       this.ctx.lineTo(20 + (i * 25), this.canvas.height - 20);
       this.ctx.fill();
    }

    if (this.levelTransitionTimer > 0) {
      this.ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

      this.ctx.fillStyle = '#FFEB3B';
      this.ctx.textAlign = 'center';
      this.ctx.font = '24px "Press Start 2P"';
      this.ctx.fillText(`LEVEL ${this.currentLevel} CLEARED!`, this.canvas.width / 2, this.canvas.height / 2 - 20);

      this.ctx.font = '16px "Press Start 2P"';
      this.ctx.fillStyle = '#ffffff';
      const seconds = Math.ceil(this.levelTransitionTimer / 1000);
      this.ctx.fillText(`NEXT LEVEL IN ${seconds}...`, this.canvas.width / 2, this.canvas.height / 2 + 30);
    }
  }

  private loop(timestamp: number) {
    if (!this.isRunning) return;

    if (!this.lastTime) this.lastTime = timestamp;
    const dt = timestamp - this.lastTime;
    this.lastTime = timestamp;
    this.accumulator += dt;

    if (this.accumulator > 200) this.accumulator = 200; // prevent death spiral on background tab

    let updated = false;
    while (this.accumulator >= this.fixedStep) {
      this.update();
      this.accumulator -= this.fixedStep;
      updated = true;
    }

    if (updated) {
      // Clear board
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      
      // Draw pipeline
      this.drawMap();
      this.drawEntities();
      this.drawUI();
    }

    this.animationFrameId = requestAnimationFrame(this.loop);
  }

  private gameOver() {
    this.stop();
    this.callbacks.onGameOver(this.score);
  }
}
