export const TILE_TYPES = {
  FOG: 0,
  WATER: 1,
  SAND: 2,
  GRASS: 3
};

const GRID_SIZE = 24; 
const INITIAL_GRID_SIZE = 24;
const TILE_SIZE = 32;

export { GRID_SIZE, INITIAL_GRID_SIZE, TILE_SIZE };

// Dynamic Offset to center the grid at world (0,0) based on current size
export const getMapOffset = (size: number) => {
  return -(size * TILE_SIZE) / 2;
};

export const worldToGrid = (x: number, y: number, currentSize: number = INITIAL_GRID_SIZE) => {
  const offset = getMapOffset(currentSize);
  const c = Math.floor((x - offset) / TILE_SIZE);
  const r = Math.floor((y - offset) / TILE_SIZE);
  return { c, r };
};

export const gridToWorld = (c: number, r: number, currentSize: number = INITIAL_GRID_SIZE) => {
  const offset = getMapOffset(currentSize);
  return {
    x: offset + c * TILE_SIZE + TILE_SIZE / 2,
    y: offset + r * TILE_SIZE + TILE_SIZE / 2
  };
};

// For 2x2 buildings, the center is between 4 tiles
export const gridToWorldBuilding = (c: number, r: number, currentSize: number = INITIAL_GRID_SIZE) => {
  const offset = getMapOffset(currentSize);
  return {
    x: offset + c * TILE_SIZE,
    y: offset + r * TILE_SIZE
  };
};

// Generate an organic blob-like island with 5-tile water buffer
export const generateIslandMap = (size: number = INITIAL_GRID_SIZE) => {
  const map = Array(size).fill(0).map(() => Array(size).fill(TILE_TYPES.WATER));
  const center = size / 2;

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      // Ensure first row is always water
      if (r === 0) {
        map[r][c] = TILE_TYPES.WATER;
        continue;
      }

      const dist = Math.sqrt(Math.pow(r - center, 2) + Math.pow(c - center, 2));
      // Organic noise simulation using sine waves
      const noise = (Math.sin(r * 0.5) + Math.cos(c * 0.5)) * 1.5;
      const threshold = 6 + noise;

      if (dist < threshold) {
        map[r][c] = TILE_TYPES.GRASS;
      } else if (dist < threshold + 1.0) { // Thinner sand border
        map[r][c] = TILE_TYPES.SAND;
      }
    }
  }
  return map;
};

export const getBuildingTiles = (type: string, c: number, r: number) => {
  if (type === 'starter-house' || type === 'mini-house' || type === 'hotel' || type === 'market') {
    return [
      { r, c },
      { r, c: c - 1 },
      { r: r - 1, c },
      { r: r - 1, c: c - 1 }
    ];
  }
  return [{ r, c }];
};

export const ISLAND_MAP = generateIslandMap(INITIAL_GRID_SIZE);
