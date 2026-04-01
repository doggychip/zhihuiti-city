/**
 * Procedural world generation — builds a tile map with grass, water edges,
 * buildings, fences, trees, and decorations.
 *
 * All coordinates are in tile units (16x16 px per tile).
 */

import { TILE } from "./sprites";

export const TileType = {
  GRASS: 0,
  GRASS_VAR1: 1,
  GRASS_VAR2: 2,
  WATER: 3,
  WATER_EDGE: 4,
  PATH: 5,
} as const;
export type TileType = (typeof TileType)[keyof typeof TileType];

export interface Decoration {
  type: "tree_green" | "tree_pink" | "bush" | "rock" | "flower" | "mushroom" |
        "pumpkin" | "fence_h" | "fence_v" | "house" | "chest" | "plant";
  tx: number;   // tile x
  ty: number;   // tile y
}

export interface WorldMap {
  cols: number;
  rows: number;
  tiles: TileType[][];       // [row][col]
  decorations: Decoration[];
}

/** Seed a simple pseudo-RNG from a number. */
function mulberry32(a: number) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export function generateWorld(canvasW: number, canvasH: number): WorldMap {
  const cols = Math.ceil(canvasW / TILE);
  const rows = Math.ceil(canvasH / TILE);
  const rand = mulberry32(42);

  // Initialize all grass
  const tiles: TileType[][] = [];
  for (let r = 0; r < rows; r++) {
    tiles[r] = [];
    for (let c = 0; c < cols; c++) {
      const v = rand();
      if (v < 0.08) tiles[r][c] = TileType.GRASS_VAR1;
      else if (v < 0.14) tiles[r][c] = TileType.GRASS_VAR2;
      else tiles[r][c] = TileType.GRASS;
    }
  }

  // Water border (3 tiles wide)
  const waterW = 3;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (r < waterW || r >= rows - waterW || c < waterW || c >= cols - waterW) {
        tiles[r][c] = TileType.WATER;
      }
      // edge tiles (just inside the water)
      if (
        (r === waterW || r === rows - waterW - 1 ||
         c === waterW || c === cols - waterW - 1) &&
        r >= waterW && r < rows - waterW &&
        c >= waterW && c < cols - waterW
      ) {
        tiles[r][c] = TileType.GRASS; // keep as grass, we'll draw edge overlay
      }
    }
  }

  // Paths — a few horizontal and vertical paths through the village
  const midR = Math.floor(rows / 2);
  const midC = Math.floor(cols / 2);
  for (let c = waterW + 2; c < cols - waterW - 2; c++) {
    tiles[midR][c] = TileType.PATH;
    tiles[midR + 1][c] = TileType.PATH;
  }
  for (let r = waterW + 2; r < rows - waterW - 2; r++) {
    tiles[r][midC] = TileType.PATH;
    tiles[r][midC + 1] = TileType.PATH;
  }

  // Decorations
  const decorations: Decoration[] = [];

  // Houses — place a few around the map
  const housePositions = [
    [waterW + 4, waterW + 5],
    [waterW + 4, midC + 8],
    [midR + 5, waterW + 5],
    [midR + 5, cols - waterW - 12],
    [waterW + 4, cols - waterW - 12],
    [rows - waterW - 10, midC + 8],
  ];
  for (const [tr, tc] of housePositions) {
    if (tr > 0 && tr < rows - 6 && tc > 0 && tc < cols - 8) {
      decorations.push({ type: "house", tx: tc, ty: tr });
    }
  }

  // Fences along paths
  for (let c = waterW + 2; c < cols - waterW - 2; c += 3) {
    if (tiles[midR - 1]?.[c] !== TileType.PATH) {
      decorations.push({ type: "fence_h", tx: c, ty: midR - 1 });
    }
    if (tiles[midR + 2]?.[c] !== TileType.PATH) {
      decorations.push({ type: "fence_h", tx: c, ty: midR + 2 });
    }
  }

  // Trees scattered on grass areas
  for (let r = waterW + 1; r < rows - waterW - 2; r += 4) {
    for (let c = waterW + 1; c < cols - waterW - 2; c += 5) {
      // skip if near paths or houses
      if (Math.abs(r - midR) < 4 && c > waterW + 3) continue;
      if (Math.abs(c - midC) < 4) continue;

      const v = rand();
      if (v < 0.3) {
        decorations.push({ type: "tree_green", tx: c, ty: r });
      } else if (v < 0.45) {
        decorations.push({ type: "tree_pink", tx: c, ty: r });
      }
    }
  }

  // Small decorations (flowers, rocks, mushrooms, pumpkins)
  for (let r = waterW + 1; r < rows - waterW - 1; r += 3) {
    for (let c = waterW + 1; c < cols - waterW - 1; c += 4) {
      if (tiles[r][c] !== TileType.GRASS && tiles[r][c] !== TileType.GRASS_VAR1) continue;
      if (Math.abs(r - midR) < 3 || Math.abs(c - midC) < 3) continue;

      const v = rand();
      if (v < 0.12) decorations.push({ type: "flower", tx: c, ty: r });
      else if (v < 0.18) decorations.push({ type: "rock", tx: c, ty: r });
      else if (v < 0.22) decorations.push({ type: "mushroom", tx: c, ty: r });
      else if (v < 0.25) decorations.push({ type: "pumpkin", tx: c, ty: r });
      else if (v < 0.30) decorations.push({ type: "bush", tx: c, ty: r });
    }
  }

  // Plants near houses
  for (const h of housePositions) {
    const [tr, tc] = h;
    if (tr < 0 || tr >= rows - 6 || tc < 0 || tc >= cols - 8) continue;
    for (let i = 0; i < 3; i++) {
      const px = tc + 7 + Math.floor(rand() * 3);
      const py = tr + Math.floor(rand() * 4);
      if (px < cols - waterW - 1 && py < rows - waterW - 1) {
        decorations.push({ type: "plant", tx: px, ty: py });
      }
    }
  }

  return { cols, rows, tiles, decorations };
}
