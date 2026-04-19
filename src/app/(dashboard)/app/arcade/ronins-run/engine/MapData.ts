// 0 = empty
// 1 = wall
// 2 = regular dot (pellet)
// 3 = power pellet
// 4 = pink ghost door (passable by ghosts only)

const W = 1;
const D = 2; // Pellet
const P = 3; // Power
const G = 4; // Ghost Door
const E = 0; // Empty Path

export const PACMAN_GRID = [
  /*  0*/ [W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W],
  /*  1*/ [W,D,D,D,D,D,D,D,D,D,D,D,D,W,W,D,D,D,D,D,D,D,D,D,D,D,D,W],
  /*  2*/ [W,D,W,W,W,W,D,W,W,W,W,W,D,W,W,D,W,W,W,W,W,D,W,W,W,W,D,W],
  /*  3*/ [W,P,W,W,W,W,D,W,W,W,W,W,D,W,W,D,W,W,W,W,W,D,W,W,W,W,P,W],
  /*  4*/ [W,D,W,W,W,W,D,W,W,W,W,W,D,W,W,D,W,W,W,W,W,D,W,W,W,W,D,W],
  /*  5*/ [W,D,D,D,D,D,D,D,D,D,D,D,D,D,D,D,D,D,D,D,D,D,D,D,D,D,D,W],
  /*  6*/ [W,D,W,W,W,W,W,W,W,D,W,W,W,W,W,W,W,W,D,W,W,W,W,W,W,W,D,W],
  /*  7*/ [W,D,W,W,W,W,W,W,W,D,W,W,W,W,W,W,W,W,D,W,W,W,W,W,W,W,D,W],
  /*  8*/ [W,D,D,D,D,D,D,D,D,D,D,D,D,W,W,D,D,D,D,D,D,D,D,D,D,D,D,W],
  /*  9*/ [W,W,W,W,W,W,D,W,W,W,W,W,D,W,W,D,W,W,W,W,W,D,W,W,W,W,W,W],
  /* 10*/ [E,E,E,E,E,W,D,W,W,W,W,W,D,W,W,D,W,W,W,W,W,D,W,E,E,E,E,E],
  /* 11*/ [E,E,E,E,E,W,D,W,W,D,D,D,D,D,D,D,D,D,D,W,W,D,W,E,E,E,E,E],
  /* 12*/ [E,E,E,E,E,W,D,W,W,D,W,W,W,G,G,W,W,W,D,W,W,D,W,E,E,E,E,E],
  /* 13*/ [W,W,W,W,W,W,D,W,W,D,W,E,E,E,E,E,E,W,D,W,W,D,W,W,W,W,W,W],
  /* 14*/ [E,E,E,E,E,E,D,E,E,D,W,E,E,E,E,E,E,W,D,E,E,D,E,E,E,E,E,E],
  /* 15*/ [W,W,W,W,W,W,D,W,W,D,W,E,E,E,E,E,E,W,D,W,W,D,W,W,W,W,W,W],
  /* 16*/ [E,E,E,E,E,W,D,W,W,D,W,W,W,W,W,W,W,W,D,W,W,D,W,E,E,E,E,E],
  /* 17*/ [E,E,E,E,E,W,D,W,W,D,D,D,D,D,D,D,D,D,D,W,W,D,W,E,E,E,E,E],
  /* 18*/ [W,W,W,W,W,W,D,W,W,D,W,W,W,W,W,W,W,W,D,W,W,D,W,W,W,W,W,W],
  /* 19*/ [W,D,D,D,D,D,D,D,D,D,D,D,D,W,W,D,D,D,D,D,D,D,D,D,D,D,D,W],
  /* 20*/ [W,D,W,W,W,W,D,W,W,W,W,W,D,W,W,D,W,W,W,W,W,D,W,W,W,W,D,W],
  /* 21*/ [W,D,W,W,W,W,D,W,W,W,W,W,D,W,W,D,W,W,W,W,W,D,W,W,W,W,D,W],
  /* 22*/ [W,D,D,D,W,W,D,D,D,D,D,D,D,D,D,D,D,D,D,D,D,D,W,W,D,D,D,W],
  /* 23*/ [W,W,W,D,W,W,D,W,W,W,W,W,D,D,D,D,W,W,W,W,W,D,W,W,D,W,W,W],
  /* 24*/ [W,P,W,D,W,W,D,W,W,W,W,W,D,W,W,D,W,W,W,W,W,D,W,W,D,W,P,W],
  /* 25*/ [W,D,D,D,D,D,D,D,D,D,D,D,D,W,W,D,D,D,D,D,D,D,D,D,D,D,D,W],
  /* 26*/ [W,D,W,W,W,W,W,W,W,D,W,W,W,W,W,W,W,W,D,W,W,W,W,W,W,W,D,W],
  /* 27*/ [W,D,W,W,W,W,W,W,W,D,W,W,W,W,W,W,W,W,D,W,W,W,W,W,W,W,D,W],
  /* 28*/ [W,D,W,W,W,W,W,W,W,D,W,W,W,W,W,W,W,W,D,W,W,W,W,W,W,W,D,W],
  /* 29*/ [W,D,D,D,D,D,D,D,D,D,D,D,D,D,D,D,D,D,D,D,D,D,D,D,D,D,D,W],
  /* 30*/ [W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W]
];

// Canvas scaling parameters
const TILE_SIZE = 20;

export const MAP_SETTINGS = {
  TILE_SIZE,
  COLUMNS: PACMAN_GRID[0].length, // 28
  ROWS: PACMAN_GRID.length, // 31
  WIDTH: PACMAN_GRID[0].length * TILE_SIZE, // 560
  HEIGHT: PACMAN_GRID.length * TILE_SIZE, // 620
};
