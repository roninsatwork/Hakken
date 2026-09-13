/** Authored navigation in the courtyard plate's 1586 × 992 coordinate system.
 * These polygons describe the ground at the actor's feet, not image colours.
 */
export type Point = { x: number; y: number };
export type Polygon = readonly (readonly [number, number])[];

export const WORLD = { width: 1586, height: 992 };
export const ACTOR_RADIUS = 6;
export const PLAYER_START: Point = { x: 236, y: 683 };
export const EXIT: Point = { x: 1457, y: 179 };
export const TREASURE: Point = { x: 1423, y: 472 };
export const SEALS: readonly Point[] = [
  { x: 235, y: 248 },
  { x: 1018, y: 126 },
  { x: 1446, y: 824 },
];

export const WALKABLE: readonly Polygon[] = [
  // Main street, southwest entry and market passage.
  [
    [110, 672],
    [405, 477],
    [465, 457],
    [582, 383],
    [656, 359],
    [705, 388],
    [701, 452],
    [632, 505],
    [611, 557],
    [334, 746],
    [190, 745],
  ],
  [
    [570, 390],
    [739, 291],
    [812, 246],
    [858, 216],
    [914, 180],
    [961, 208],
    [886, 272],
    [800, 314],
    [702, 415],
    [663, 418],
  ],
  // Garden gate and ascending steps. The garden is a quiet side route.
  [
    [358, 415],
    [425, 382],
    [487, 432],
    [463, 493],
    [411, 514],
    [365, 475],
  ],
  [
    [389, 481],
    [315, 421],
    [293, 373],
    [321, 345],
    [409, 389],
    [450, 434],
  ],
  [
    [297, 385],
    [265, 331],
    [146, 269],
    [165, 244],
    [236, 225],
    [312, 248],
    [349, 294],
    [363, 348],
  ],
  // Upper market courtyard.
  [
    [799, 253],
    [907, 167],
    [942, 143],
    [969, 84],
    [1034, 62],
    [1108, 85],
    [1123, 181],
    [1156, 204],
    [1087, 251],
    [997, 289],
    [943, 271],
    [904, 260],
  ],
  // Northern route to the escape gate, along the edge of the canal.
  [
    [1001, 260],
    [1095, 202],
    [1122, 167],
    [1190, 166],
    [1243, 198],
    [1341, 145],
    [1425, 125],
    [1508, 126],
    [1510, 184],
    [1440, 227],
    [1369, 254],
    [1250, 314],
    [1146, 274],
  ],
  // Bridge: three overlapping ground sections around its foreground railing.
  [
    [597, 511],
    [650, 476],
    [695, 505],
    [683, 563],
    [621, 568],
    [599, 548],
  ],
  [
    [607, 535],
    [683, 478],
    [916, 584],
    [940, 623],
    [898, 671],
    [691, 584],
    [641, 581],
  ],
  [
    [889, 576],
    [1005, 585],
    [1094, 625],
    [1116, 684],
    [1045, 709],
    [908, 663],
  ],
  // Eastern street and lower gate.
  [
    [1069, 651],
    [1145, 606],
    [1189, 580],
    [1235, 584],
    [1259, 627],
    [1359, 690],
    [1440, 752],
    [1539, 850],
    [1578, 877],
    [1550, 930],
    [1456, 891],
    [1362, 814],
    [1232, 749],
    [1150, 722],
    [1072, 716],
  ],
  // Treasure steps and alcove.
  [
    [1187, 613],
    [1226, 541],
    [1291, 493],
    [1341, 461],
    [1417, 432],
    [1477, 452],
    [1481, 488],
    [1410, 506],
    [1361, 514],
    [1298, 557],
    [1251, 622],
  ],
  // Narrow northern/eastern connection through the garden stairs.
  [
    [1194, 313],
    [1248, 290],
    [1289, 322],
    [1275, 370],
    [1262, 403],
    [1317, 451],
    [1305, 506],
    [1262, 535],
    [1224, 478],
    [1197, 420],
    [1170, 380],
  ],
];

export const PATROLS: readonly (readonly Point[])[] = [
  [
    { x: 805, y: 270 },
    { x: 1017, y: 206 },
    { x: 1076, y: 133 },
    { x: 986, y: 147 },
    { x: 865, y: 250 },
    { x: 686, y: 383 },
  ],
  [
    { x: 1250, y: 658 },
    { x: 1447, y: 816 },
    { x: 1235, y: 682 },
    { x: 1240, y: 575 },
    { x: 1367, y: 491 },
  ],
  [
    { x: 559, y: 464 },
    { x: 350, y: 620 },
    { x: 611, y: 492 },
    { x: 847, y: 595 },
    { x: 1067, y: 669 },
  ],
];

/** Foreground pieces drawn from the plate after actors behind their depth line.
 * Sharing the plate keeps the painted edge exact; these are render masks, not
 * collision geometry. Ground coordinates remain owned by WALKABLE above.
 */
export const FOREGROUND: readonly { depth: number; polygon: Polygon }[] = [
  {
    depth: 728,
    polygon: [
      [942, 468],
      [1062, 398],
      [1178, 453],
      [1130, 494],
      [1131, 659],
      [1166, 684],
      [1143, 735],
      [1043, 747],
      [956, 704],
      [972, 543],
    ],
  },
  {
    depth: 660,
    polygon: [
      [651, 542],
      [900, 645],
      [939, 621],
      [943, 646],
      [901, 680],
      [646, 580],
    ],
  },
];

export function insidePolygon(point: Point, polygon: Polygon): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if (yi > point.y !== yj > point.y && point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi)
      inside = !inside;
  }
  return inside;
}
export interface Terrain {
  walkable: readonly Polygon[];
  blocked: readonly Polygon[];
}
export const COURTYARD_TERRAIN: Terrain = { walkable: WALKABLE, blocked: [] };
export function isWalkable(point: Point, radius = 0, terrain: Terrain = COURTYARD_TERRAIN): boolean {
  const offsets = radius
    ? [
        [0, 0],
        [radius, 0],
        [-radius, 0],
        [0, radius * 0.65],
        [0, -radius * 0.65],
      ]
    : [[0, 0]];
  return offsets.every(
    ([x, y]) =>
      terrain.walkable.some((polygon) => insidePolygon({ x: point.x + x, y: point.y + y }, polygon)) &&
      !terrain.blocked.some((polygon) => insidePolygon({ x: point.x + x, y: point.y + y }, polygon)),
  );
}
export const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
export function clearPath(
  a: Point,
  b: Point,
  radius = 0,
  terrain: Terrain = COURTYARD_TERRAIN,
): boolean {
  const steps = Math.ceil(distance(a, b) / 2);
  for (let i = 0; i <= steps; i++) {
    const t = steps ? i / steps : 0;
    if (!isWalkable({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, radius, terrain))
      return false;
  }
  return true;
}
