export interface Obstacle {
  x: number;
  y: number;
  w: number;
  h: number;
  r?: number;
  c?: number;
  type?: string;
  isMultiTile?: boolean;
  tiles?: { r: number; c: number }[];
}

export const OBSTACLE_TYPE = 'obstacle';
