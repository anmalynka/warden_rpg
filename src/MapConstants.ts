export const TILE_TYPES = {
  FOG: 0,
  WATER: 1,
  SAND: 2,
  GRASS: 3
};

export const GRID_SIZE = 20;
export const TILE_SIZE = 32;

// Offset to center the grid at world (0,0)
export const MAP_OFFSET_X = -(GRID_SIZE * TILE_SIZE) / 2;
export const MAP_OFFSET_Y = -(GRID_SIZE * TILE_SIZE) / 2;

export const worldToGrid = (x: number, y: number) => {
  const c = Math.floor((x - MAP_OFFSET_X) / TILE_SIZE);
  const r = Math.floor((y - MAP_OFFSET_Y) / TILE_SIZE);
  return { c, r };
};

export const gridToWorld = (c: number, r: number) => {
  return {
    x: MAP_OFFSET_X + c * TILE_SIZE + TILE_SIZE / 2,
    y: MAP_OFFSET_Y + r * TILE_SIZE + TILE_SIZE / 2
  };
};

// Generate an organic blob-like island
export const generateIslandMap = () => {
  const map = Array(GRID_SIZE).fill(0).map(() => Array(GRID_SIZE).fill(TILE_TYPES.WATER));
  const center = GRID_SIZE / 2;
  
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      const dist = Math.sqrt(Math.pow(r - center, 2) + Math.pow(c - center, 2));
      // Organic noise simulation using sine waves
      const noise = (Math.sin(r * 0.5) + Math.cos(c * 0.5)) * 1.5;
      const threshold = 6 + noise;

      if (dist < threshold) {
        map[r][c] = TILE_TYPES.GRASS;
      } else if (dist < threshold + 1.2) {
        map[r][c] = TILE_TYPES.SAND;
      } else if (dist > GRID_SIZE * 0.45) {
        map[r][c] = TILE_TYPES.FOG;
      }
    }
  }
  return map;
};

export const ISLAND_MAP = generateIslandMap();
