import React, { useState, useMemo, useEffect, useRef } from 'react';
import PlayerSprite from './PlayerSprite';
import ShopUI from './ShopUI';
import MarketUI from './MarketUI';

// Tile Types
export const TILE_TYPES = {
  FOG: 0,
  WATER: 1,
  SAND: 2,
  GRASS: 3
};

export const GRID_SIZE = 20;
export const TILE_SIZE = 32;

// Offset to center the grid at world (0,0)
const offsetX = -(GRID_SIZE * TILE_SIZE) / 2;
const offsetY = -(GRID_SIZE * TILE_SIZE) / 2;

export const worldToGrid = (x: number, y: number) => {
  const c = Math.floor((x - offsetX) / TILE_SIZE);
  const r = Math.floor((y - offsetY) / TILE_SIZE);
  return { c, r };
};

export const gridToWorld = (c: number, r: number) => {
  return {
    x: offsetX + c * TILE_SIZE + TILE_SIZE / 2,
    y: offsetY + r * TILE_SIZE + TILE_SIZE / 2
  };
};

// Generate an organic blob-like island
const generateIslandMap = () => {
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

const TownView = ({ 
  avatarPos, 
  villageZoom, 
  setVillageZoom,
  buildings, 
  isPlacing, 
  pendingBuilding, 
  onBuild,
  role,
  getBuildingEmoji,
  mousePos,
  setMousePos,
  facing = 'down',
  isWalking = false,
  onUpdateObstacles,
  interactWithBuilding,
  initialSelectedBuilding,
  onClearInitialSelection,
  isInsideHouse,
  minutesSlept = 0,
  treeCooldowns = {},
  resources,
  setResources,
  inventory,
  setInventory
  }: any) => {
  const [hoverTile, setHoverTile] = useState<{c: number, r: number} | null>(null);
  const [selectedBedForMenu, setSelectedBedForMenu] = useState<string | null>(null);
  const [selectedBedForActionMenu, setSelectedBedForActionMenu] = useState<string | null>(null);
  const [shopOpen, setShopOpen] = useState(false);
  const [marketOpen, setMarketOpen] = useState(false);
  const touchDistRef = useRef<number | null>(null);
  const [confirmTreeCollect, setConfirmTreeCollect] = useState<string | null>(null);

  const handleBuy = (item: string, cost: number, amount: number) => {
    if ((resources.coins || 0) >= cost) {
      setResources((prev: any) => ({
        ...prev,
        coins: prev.coins - cost,
        [item]: (prev[item] || 0) + amount
      }));
    }
  };

  const handleSell = (item: string, price: number, amount: number) => {
    if ((inventory[item] || 0) >= amount) {
      setInventory((prev: any) => ({
        ...prev,
        [item]: prev[item] - amount
      }));
      setResources((prev: any) => ({
        ...prev,
        coins: (prev.coins || 0) + price
      }));
    }
  };


  // Automatically open menu for new buildings (e.g., from placement)
  useEffect(() => {
    if (initialSelectedBuilding) {
      const b = buildings.find((b: any) => b.id === initialSelectedBuilding);
      if (b) {
        if (b.type === 'garden-bed' || b.type === 'garden-tree') {
          setSelectedBedForMenu(b.id);
        } else {
          setSelectedBedForActionMenu(b.id);
        }
      }
      onClearInitialSelection?.();
    }
  }, [initialSelectedBuilding, buildings, onClearInitialSelection]);

  // Stable random decorations with sub-tile offsets
  const decorations = useMemo(() => {
    const decoList: any[] = [];
    const assets = [
      { url: '/images/Bush_simple1_1.png', type: 'bush' },
      { url: '/images/Bush_blue_flowers1.png', type: 'mushroom' },
      { url: '/images/Tree1.png', type: 'default-tree' }, // Added default trees
      { url: '/images/Tree2.png', type: 'default-tree' }
    ];

    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        if (ISLAND_MAP[r][c] === TILE_TYPES.GRASS) {
          const rand = Math.sin(r * 12.9898 + c * 78.233) * 43758.5453 % 1;
          // Increased density slightly to account for trees, but tree chance is lower
          if (Math.abs(rand) < 0.15) {
            const assetIdx = Math.floor(Math.abs(rand * 100)) % assets.length;
            
            // Trees need more space, prevent them from spawning too close if possible, 
            // but for now simple random is fine.
            
            const subX = (rand * 8); // -4 to +4
            const subY = (Math.cos(r * 10) * 8); // -4 to +4
            
            decoList.push({ 
              r, c, 
              asset: assets[assetIdx].url, 
              type: assets[assetIdx].type,
              subX, subY,
              id: `tree-${c}-${r}` // Consistent ID for cooldown tracking
            });
          }
        }
      }
    }
    return decoList;
  }, []);

  // Stabilize obstacles with useMemo
  const allObstacles = useMemo(() => {
    // For decorations, use a small 8x8 hitbox at their visual center (base)
    const decoObstacles = decorations.map(d => {
      const base = gridToWorld(d.c, d.r);
      const centerX = base.x + d.subX;
      const centerY = base.y + d.subY;
      
      // Trees and bushes are rendered with translate(-50%, -85%).
      // The (centerX, centerY) is the anchor point on the ground.
      // We'll put a small 10x10 hitbox around this ground point.
      return {
        x: centerX - 5,
        y: centerY - 5,
        w: 10,
        h: 10,
        r: d.r,
        c: d.c,
        type: d.type
      };
    });

    const buildingObstacles: any[] = [];
    
    buildings.forEach((b: any) => {
      if (b.growthState && b.growthState.coordinates && b.offset) {
        // Garden beds and trees (sitting on 1 tile)
        // Hitbox: 24x24 (slightly smaller than 32x32)
        buildingObstacles.push({ 
          x: b.offset.x - 12,
          y: b.offset.y - 12,
          w: 24,
          h: 24,
          r: b.growthState.coordinates.y,
          c: b.growthState.coordinates.x,
          type: b.type
        });
      } else if (b.type === 'starter-house' && b.offset) {
        // House (2x2 tiles visually, 72x72 image)
        // anchor is at 50% width, 85% height. 
        // Hitbox: 64x64 centered
        const gridPos = worldToGrid(b.offset.x, b.offset.y);
        const houseObstacle = { 
          x: b.offset.x - 32,
          y: b.offset.y - 48, // Adjusted for 85% anchor
          w: 64,
          h: 64,
          type: 'house',
          isMultiTile: true,
          tiles: [
            { r: gridPos.r, c: gridPos.c },
            { r: gridPos.r, c: gridPos.c - 1 },
            { r: gridPos.r - 1, c: gridPos.c },
            { r: gridPos.r - 1, c: gridPos.c - 1 }
          ]
        };
        buildingObstacles.push(houseObstacle);
      } else if (b.type === 'market' && b.offset) {
        // Market (72x96)
        const gridPos = worldToGrid(b.offset.x, b.offset.y);
        buildingObstacles.push({ 
          x: b.offset.x - 32,
          y: b.offset.y - 70, 
          w: 64,
          h: 80,
          r: gridPos.r,
          c: gridPos.c,
          type: b.type
        });
      } else if (b.offset && (b.type === 'mini-house' || b.type === 'shop' || b.type === 'hotel')) {
        // Standard buildings (72x72)
        const gridPos = worldToGrid(b.offset.x, b.offset.y);
        buildingObstacles.push({ 
          x: b.offset.x - 32,
          y: b.offset.y - 48,
          w: 64,
          h: 64,
          r: gridPos.r,
          c: gridPos.c,
          type: b.type
        });
      } else if (b.offset) {
        // Default 1x1 hitbox for other buildings (like garden beds)
        const gridPos = worldToGrid(b.offset.x, b.offset.y);
        buildingObstacles.push({ 
          x: b.offset.x - 12,
          y: b.offset.y - 12,
          w: 24,
          h: 24,
          r: gridPos.r,
          c: gridPos.c,
          type: b.type
        });
      }
    });

    return [...decoObstacles, ...buildingObstacles];
  }, [decorations, buildings]);

  // Pass obstacles to parent for collision logic
  useEffect(() => {
    onUpdateObstacles?.(allObstacles);
  }, [allObstacles, onUpdateObstacles]);

  const handleMouseMove = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left - rect.width / 2) / villageZoom + avatarPos.x;
    const y = (e.clientY - rect.top - rect.height / 2) / villageZoom + avatarPos.y;
    const { c, r } = worldToGrid(x, y);
    
    if (c >= 0 && c < GRID_SIZE && r >= 0 && r < GRID_SIZE) {
      setHoverTile({ c, r });
      if (isPlacing) {
        setMousePos(gridToWorld(c, r));
      }
    } else {
      setHoverTile(null);
    }
  };

  const handleBuildingClick = (building: any, e: React.MouseEvent) => {
    if (isPlacing) return;
    e.stopPropagation();
    
    if (building.type === 'starter-house' && isInsideHouse) {
      interactWithBuilding(building.id, 'wake');
      setSelectedBedForActionMenu(null);
      setSelectedBedForMenu(null);
      return;
    }

    if (building.type === 'shop') {
      setShopOpen(true);
      return;
    }

    if (building.type === 'market') {
      setMarketOpen(true);
      return;
    }

    if (building.type === 'garden-bed' || building.type === 'garden-tree' || building.type === 'starter-house') {
      const gs = building.growthState;
      if (gs && gs.currentLevel === 1 && !gs.produceType) {
        setSelectedBedForMenu(building.id);
        setSelectedBedForActionMenu(null);
      } else {
        setSelectedBedForActionMenu(building.id);
        setSelectedBedForMenu(null);
      }
    }
  };

  const handleDecorationClick = (deco: any, e: React.MouseEvent) => {
    if (isPlacing) return;
    e.stopPropagation();
    
    if (deco.type === 'default-tree' || deco.type === 'bush') {
      const isReady = !treeCooldowns[deco.id] || Date.now() >= treeCooldowns[deco.id];
      if (isReady) {
        setConfirmTreeCollect(deco.id);
      }
    }
  };

  const handleClick = (e: React.MouseEvent) => {
    if (isPlacing && pendingBuilding && hoverTile) {
      if (e.detail === 2) {
        // Double click to cancel
        onBuild(null, null, null); // We can signal cancel this way or add a separate onCancel
        return;
      }

      const tileType = ISLAND_MAP[hoverTile.r][hoverTile.c];
      
      // Constraint: Garden Bed only on GRASS
      if (pendingBuilding.type === 'garden-bed' && tileType !== TILE_TYPES.GRASS) {
        return;
      }
      
      // Constraint: No placement on WATER, SAND is only allowed for non-garden-bed (except if restricted further)
      // Existing logic allows GRASS or SAND
      const isTerrainValid = pendingBuilding.type === 'garden-bed' 
        ? tileType === TILE_TYPES.GRASS 
        : (tileType === TILE_TYPES.GRASS || tileType === TILE_TYPES.SAND);

      // Check for obstacles using the calculated allObstacles
      const checkOccupied = (c: number, r: number) => 
        allObstacles.some(ob => 
          ob.isMultiTile 
            ? ob.tiles.some((t: any) => t.r === r && t.c === c)
            : ob.r === r && ob.c === c
        );

      let isOccupied = checkOccupied(hoverTile.c, hoverTile.r);
      
      // If placing a house, check the 2x2 area
      if (pendingBuilding.type === 'starter-house') {
        isOccupied = isOccupied || 
                     checkOccupied(hoverTile.c - 1, hoverTile.r) || 
                     checkOccupied(hoverTile.c, hoverTile.r - 1) || 
                     checkOccupied(hoverTile.c - 1, hoverTile.r - 1);
      }

      if (isTerrainValid && !isOccupied) {
        onBuild(pendingBuilding.type, pendingBuilding.cost, gridToWorld(hoverTile.c, hoverTile.r));
      }
    }
    // General click on empty tiles doesn't need to do anything anymore for interaction
    // as we added direct handlers to objects.
  };

  // Custom Zoom Handlers
  const handleWheel = (e: React.WheelEvent) => {
    const delta = e.deltaY * -0.001;
    setVillageZoom((prev: number) => Math.min(Math.max(prev + delta, 0.5), 4));
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].pageX - e.touches[1].pageX,
        e.touches[0].pageY - e.touches[1].pageY
      );
      if (touchDistRef.current !== null) {
        const delta = (dist - touchDistRef.current) * 0.01;
        setVillageZoom((prev: number) => Math.min(Math.max(prev + delta, 0.5), 4));
      }
      touchDistRef.current = dist;
    }
  };

  const handleTouchEnd = () => {
    touchDistRef.current = null;
  };

  return (
    <div 
      className="relative w-full h-full overflow-hidden bg-[#1e88e5]"
      style={{ imageRendering: 'pixelated', contain: 'paint' }}
      onMouseMove={handleMouseMove}
      onClick={handleClick}
      onWheel={handleWheel}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div 
        className="absolute inset-0 transition-transform duration-300 ease-out"
        style={{
          transform: `scale(${villageZoom}) translate(${-avatarPos.x}px, ${-avatarPos.y}px)`,
          transformOrigin: 'center center'
        }}
      >
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-[#1e88e5]">
          
          {/* Tile Grid */}
          <div 
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${GRID_SIZE}, ${TILE_SIZE}px)`,
              gridTemplateRows: `repeat(${GRID_SIZE}, ${TILE_SIZE}px)`,
              width: GRID_SIZE * TILE_SIZE,
              height: GRID_SIZE * TILE_SIZE,
            }}
          >
            {ISLAND_MAP.map((row, r) => row.map((type, c) => {
              const isGrass = type === TILE_TYPES.GRASS;
              const isSand = type === TILE_TYPES.SAND;
              
              // Jitter for organic feel
              const jitter = ((Math.sin(r * 11 + c * 7) * 43758.5453) % 1) * 3;

              // Helper for neighbors (treat out of bounds as Water)
              const getType = (rr: number, cc: number) => {
                if (rr < 0 || rr >= GRID_SIZE || cc < 0 || cc >= GRID_SIZE) return TILE_TYPES.WATER;
                return ISLAND_MAP[rr][cc];
              };

              // Masking Logic
              // Sand Layer (renders if Sand or Grass)
              const showSand = isSand || isGrass;
              const sandRadius = (dr: number, dc: number) => {
                 const t = getType(r + dr, c);
                 const s = getType(r, c + dc);
                 // If both neighbors are Water, round this corner
                 return (t === TILE_TYPES.WATER && s === TILE_TYPES.WATER) ? `12px` : '0px';
              };

              // Grass Layer (renders if Grass)
              const grassRadius = (dr: number, dc: number) => {
                 const t = getType(r + dr, c);
                 const s = getType(r, c + dc);
                 // If both neighbors are Water OR Sand, round this corner
                 return (t !== TILE_TYPES.GRASS && s !== TILE_TYPES.GRASS) ? `12px` : '0px';
              };

              return (
                <div 
                  key={`${c}-${r}`}
                  className="relative w-full h-full border-none outline-none"
                  style={{ 
                    backgroundColor: '#1e88e5', // Base Water
                    margin: '-0.5px',
                    padding: 0,
                    border: 'none',
                    transform: 'scale(1.02)'
                  }}
                >
                  {/* Sand Layer */}
                  {showSand && (
                    <div 
                      className="absolute inset-0 z-0 border-none outline-none"
                      style={{
                        backgroundImage: 'url("/images/sand.jpg")',
                        backgroundSize: '32px 32px',
                        imageRendering: 'pixelated',
                        borderTopLeftRadius: sandRadius(-1, -1),
                        borderTopRightRadius: sandRadius(-1, 1),
                        borderBottomLeftRadius: sandRadius(1, -1),
                        borderBottomRightRadius: sandRadius(1, 1),
                        border: 'none',
                        margin: 0
                      }}
                    />
                  )}

                  {/* Grass Layer */}
                  {isGrass && (
                    <div 
                      className="absolute inset-0 z-10 border-none outline-none"
                      style={{
                        backgroundImage: 'url("/images/grass texture.png")',
                        backgroundSize: '32px 32px',
                        imageRendering: 'pixelated',
                        borderTopLeftRadius: grassRadius(-1, -1),
                        borderTopRightRadius: grassRadius(-1, 1),
                        borderBottomLeftRadius: grassRadius(1, -1),
                        borderBottomRightRadius: grassRadius(1, 1),
                        border: 'none',
                        margin: 0
                      }}
                    />
                  )}

                  {isPlacing && (isGrass || isSand) && hoverTile?.c === c && hoverTile?.r === r && (
                    <div className="absolute inset-0 border-2 border-green-400/80 animate-pulse z-20" />
                  )}
                </div>
              );
            }))}
          </div>

          {/* Decorations Layer */}
          {decorations.map((deco) => (
            <div 
              key={deco.id}
              className={`absolute ${isPlacing ? 'pointer-events-none' : 'pointer-events-auto cursor-pointer'}`}
              onClick={(e) => handleDecorationClick(deco, e)}
              style={{
                left: deco.c * TILE_SIZE + TILE_SIZE / 2 + deco.subX,
                top: deco.r * TILE_SIZE + TILE_SIZE / 2 + deco.subY,
                zIndex: 100 + Math.floor(deco.r * TILE_SIZE + TILE_SIZE / 2 + deco.subY)
              }}
            >
              {/* Asset */}
              <div 
                style={{
                  width: TILE_SIZE,
                  height: TILE_SIZE,
                  backgroundImage: `url(${deco.asset})`,
                  backgroundSize: 'contain',
                  backgroundPosition: 'center bottom',
                  backgroundRepeat: 'no-repeat',
                  transform: 'translate(-50%, -85%) scale(1.1)',
                }}
              />
              
              {/* Ready to Harvest Icon for Default Trees/Bushes */}
              {(deco.type === 'default-tree' || deco.type === 'bush') && (!treeCooldowns[deco.id] || Date.now() >= treeCooldowns[deco.id]) && (
                  <div className="absolute top-[-40px] left-1/2 -translate-x-1/2 animate-bounce z-50">
                      <img src="/images/tools-wood.png" className="w-4 h-4 object-contain pixel-art" style={{ imageRendering: 'pixelated' }} alt="Wood Ready" />
                  </div>
              )}
            </div>
          ))}

          {/* Buildings Layer */}
          {buildings.filter((b: any) => b.offset && b.offset.x !== undefined).map((building: any) => (
            <div 
              key={building.id}
              className={`absolute flex flex-col items-center justify-center ${isPlacing ? 'pointer-events-none' : 'pointer-events-auto cursor-pointer'}`}
              onClick={(e) => handleBuildingClick(building, e)}
              style={{
                left: building.offset.x + (GRID_SIZE * TILE_SIZE) / 2,
                top: building.offset.y + (GRID_SIZE * TILE_SIZE) / 2,
                zIndex: 100 + Math.floor(building.offset.y + (GRID_SIZE * TILE_SIZE) / 2)
              }}
            >
              <div style={{ transform: 'translate(-50%, -85%)' }} className="flex flex-col items-center">
                {(building.type === 'garden-bed' || building.type === 'garden-tree') && building.growthState ? (
                  <div className="relative">
                     <img 
                       src={building.type === 'garden-tree' 
                         ? `/images/garden-${building.growthState.produceType || 'apple'}-${building.growthState.currentLevel}.png`
                         : `/images/garden-bed-${building.growthState.produceType || 'wheat'}-${building.growthState.currentLevel}.png`
                       }
                       alt={building.type}
                       className={`w-10 h-10 object-contain ${building.growthState.currentLevel === 5 ? 'grayscale brightness-75' : ''}`}
                       style={{ imageRendering: 'pixelated' }}
                     />
                     
                     {/* Interaction Icons Above Bed/Tree */}
                     {building.growthState.currentLevel === 3 && !building.growthState.isWatered && Date.now() >= (building.growthState.waterNeededAt || 0) && (
                       <div className="absolute top-0 right-0 animate-bounce">
                          <img src="/images/garden-watering-can.png" className="w-[12px] h-[12px] object-contain" alt="Needs Water" />
                       </div>
                     )}
                     {building.growthState.currentLevel === 4 && (
                       <div className="absolute top-0 right-0 animate-pulse">
                          <img src="/images/garden-pick.png" className="w-[12px] h-[12px] object-contain" alt="Ready to Harvest" />
                       </div>
                     )}
                     {building.growthState.currentLevel === 5 && (
                       <div className="absolute -top-10 left-1/2 -translate-x-1/2 flex flex-col items-center">
                          <img src="/images/garden-shovel.png" className="w-8 h-8 object-contain" alt="Clear Dead Plant" />
                          <div className="text-[6px] bg-red-500 text-white px-1">DEAD</div>
                       </div>
                     )}
                  </div>
                ) : building.type === 'starter-house' ? (
                  <img 
                    src="/images/house.png" 
                    alt="House" 
                    className="w-[72px] h-[72px] object-contain"
                    style={{ imageRendering: 'pixelated' }}
                  />
                ) : building.type === 'mini-house' ? (
                  <img 
                    src="/images/mini-house.png" 
                    alt="Mini House" 
                    className="w-[72px] h-[72px] object-contain"
                    style={{ imageRendering: 'pixelated' }}
                  />
                ) : building.type === 'shop' ? (
                  <img 
                    src="/images/Shop.png" 
                    alt="Shop" 
                    className="w-[72px] h-[72px] object-contain"
                    style={{ imageRendering: 'pixelated' }}
                  />
                ) : building.type === 'market' ? (
                  <img 
                    src="/images/Market.png" 
                    alt="Market" 
                    className="w-[72px] h-[96px] object-contain"
                    style={{ imageRendering: 'pixelated' }}
                  />
                ) : building.type === 'hotel' ? (
                  <img 
                    src="/images/Storage.png" 
                    alt="Hotel" 
                    className="w-[72px] h-[72px] object-contain"
                    style={{ imageRendering: 'pixelated' }}
                  />
                ) : (
                  <span className="text-4xl" role="img" aria-label={building.type}>
                    {getBuildingEmoji(building.type)}
                  </span>
                )}
              </div>
            </div>
          ))}

          {/* Avatar Rendering */}
          {!isInsideHouse && (
            <>
              {/* Interaction Prompt for House */}
              {(() => {
                const house = buildings.find((b: any) => b.type === 'starter-house');
                if (house) {
                  const playerGrid = worldToGrid(avatarPos.x, avatarPos.y);
                  const houseGrid = worldToGrid(house.offset.x, house.offset.y);
                  const distC = Math.abs(playerGrid.c - houseGrid.c);
                  const distR = Math.abs(playerGrid.r - houseGrid.r);
                  
                  // Near the house (adjacent tiles)
                  if (distC <= 1 && distR <= 1) {
                    return null;
                  }
                }
                return null;
              })()}

              {/* Sleep Hours Counter Above House */}
              {isInsideHouse && (() => {
                const house = buildings.find((b: any) => b.type === 'starter-house');
                if (house) {
                  const hrs = Math.floor(minutesSlept / 60);
                  const mins = minutesSlept % 60;
                  return (
                    <div 
                      className="absolute z-[2000] pointer-events-none flex flex-col items-center gap-2"
                      style={{
                        left: house.offset.x + (GRID_SIZE * TILE_SIZE) / 2,
                        top: house.offset.y + (GRID_SIZE * TILE_SIZE) / 2 - 85,
                      }}
                    >
                      <div className="bg-[#fcfaf8] text-[#3e2723] text-[8px] px-3 py-2 rounded-full shadow-[0_4px_0_0_#d1c4b9] font-['Press_Start_2P'] animate-bounce border-2 border-[#d1c4b9]">
                        {hrs}h {mins}m PASSED
                      </div>
                      <div className="flex gap-2">
                        <span className="text-white text-sm animate-ping delay-75">z</span>
                        <span className="text-white text-md animate-ping delay-200">z</span>
                        <span className="text-white text-lg animate-ping delay-500">z</span>
                      </div>
                    </div>
                  );
                }
                return null;
              })()}

              <div 
                className="absolute transition-all duration-100 ease-linear flex items-center justify-center"
                style={{
                  left: avatarPos.x + (GRID_SIZE * TILE_SIZE) / 2,
                  top: avatarPos.y + (GRID_SIZE * TILE_SIZE) / 2,
                  width: TILE_SIZE,
                  height: TILE_SIZE,
                  zIndex: 100 + Math.floor(avatarPos.y + (GRID_SIZE * TILE_SIZE) / 2)
                }}
              >
                <div className="relative" style={{ transform: 'translate(-50%, -85%)' }}>
                  <PlayerSprite 
                    direction={facing as any} 
                    isWalking={isWalking} 
                    scale={1.2 * (villageZoom / 2.5)} 
                  />
                </div>
              </div>
            </>
          )}

          {/* Ghost Building */}
          {isPlacing && pendingBuilding && hoverTile && (
             <div 
               className="absolute pointer-events-none flex flex-col items-center justify-center transition-all duration-75"
               style={{
                 left: mousePos.x + (GRID_SIZE * TILE_SIZE) / 2,
                 top: mousePos.y + (GRID_SIZE * TILE_SIZE) / 2,
                 transform: 'translate(-50%, -85%)',
                 zIndex: 100,
                 opacity: 0.6
               }}
             >
               {(() => {
                 const tileType = ISLAND_MAP[hoverTile.r][hoverTile.c];
                 const isTerrainValid = pendingBuilding.type === 'garden-bed' 
                   ? tileType === TILE_TYPES.GRASS 
                   : (tileType === TILE_TYPES.GRASS || tileType === TILE_TYPES.SAND);
                 
                 const checkOccupied = (c: number, r: number) => 
                   allObstacles.some(ob => 
                     ob.isMultiTile 
                       ? ob.tiles.some((t: any) => t.r === r && t.c === c)
                       : ob.r === r && ob.c === c
                   );

                 let isOccupied = checkOccupied(hoverTile.c, hoverTile.r);
                 if (pendingBuilding.type === 'starter-house') {
                   isOccupied = isOccupied || 
                                checkOccupied(hoverTile.c - 1, hoverTile.r) || 
                                checkOccupied(hoverTile.c, hoverTile.r - 1) || 
                                checkOccupied(hoverTile.c - 1, hoverTile.r - 1);
                 }
                 
                 const isValid = isTerrainValid && !isOccupied;

                 return (
                   <div className="relative">
                      {/* Ghost base highlight */}
                      <div className={`absolute inset-0 scale-150 rounded-full ${isValid ? 'bg-green-500/40' : 'bg-red-500/40'}`} />
                      
                      {pendingBuilding.type === 'garden-bed' ? (
                        <img 
                          src="/images/garden-bed-wheat-1.png"
                          alt="Ghost Garden Bed"
                          className="w-10 h-10 object-contain"
                          style={{ 
                            imageRendering: 'pixelated'
                          }}
                        />
                      ) : pendingBuilding.type === 'garden-tree' ? (
                        <img 
                          src="/images/garden-apple-1.png"
                          alt="Ghost Garden Tree"
                          className="w-10 h-10 object-contain"
                          style={{ 
                            imageRendering: 'pixelated'
                          }}
                        />
                      ) : pendingBuilding.type === 'starter-house' ? (
                        <img 
                          src="/images/house.png"
                          alt="Ghost House"
                          className="w-[72px] h-[72px] object-contain"
                          style={{ 
                            imageRendering: 'pixelated'
                          }}
                        />
                      ) : pendingBuilding.type === 'mini-house' ? (
                        <img 
                          src="/images/mini-house.png"
                          alt="Ghost Mini House"
                          className="w-[72px] h-[72px] object-contain"
                          style={{ 
                            imageRendering: 'pixelated'
                          }}
                        />
                      ) : pendingBuilding.type === 'shop' ? (
                        <img 
                          src="/images/Shop.png"
                          alt="Ghost Shop"
                          className="w-[72px] h-[72px] object-contain"
                          style={{ 
                            imageRendering: 'pixelated'
                          }}
                        />
                      ) : pendingBuilding.type === 'market' ? (
                        <img 
                          src="/images/Market.png"
                          alt="Ghost Market"
                          className="w-[72px] h-[96px] object-contain"
                          style={{ 
                            imageRendering: 'pixelated'
                          }}
                        />
                      ) : pendingBuilding.type === 'hotel' ? (
                        <img 
                          src="/images/Storage.png"
                          alt="Ghost Hotel"
                          className="w-[72px] h-[72px] object-contain"
                          style={{ 
                            imageRendering: 'pixelated'
                          }}
                        />
                      ) : (
                        <span className="text-4xl">
                          {getBuildingEmoji(pendingBuilding.type)}
                        </span>
                      )}
                   </div>
                 );
               })()}
             </div>
          )}

        </div>
      </div>

      {/* Produce Selection Menu Overlay */}
      {selectedBedForMenu && (
        <div className="fixed inset-0 z-[5000] flex items-center justify-center bg-black/60 pointer-events-auto font-['Press_Start_2P'] animate-in fade-in duration-200">
           <div className="p-8 flex flex-col items-center gap-6 max-w-[360px] w-full bg-[#f9f5f0]">
              {/* ... content ... */}
              <h3 className="text-[#3e2723] text-[12px] uppercase">CHOOSE PRODUCE</h3>
              
              <div className="grid grid-cols-1 gap-4 w-full">
                {(() => {
                  const b = buildings.find((b: any) => b.id === selectedBedForMenu);
                  const items = b?.type === 'garden-tree'
                    ? [
                        { type: 'apple', name: 'APPLE', icon: '/images/garden-apple.png' },
                        { type: 'peach', name: 'PEACH', icon: '/images/garden-peach.png' },
                        { type: 'cherry', name: 'CHERRY', icon: '/images/garden-cherry.png' }
                      ]
                    : [
                        { type: 'wheat', name: 'WHEAT', icon: '/images/garden-wheat.png' },
                        { type: 'tomato', name: 'TOMATO', icon: '/images/garden-tomato.png' },
                        { type: 'pumpkin', name: 'PUMPKIN', icon: '/images/garden-pumpkin.png' }
                      ];
                  return items.map(p => (
                    <button
                      key={p.type}
                      onClick={(e) => {
                        e.stopPropagation();
                        interactWithBuilding(selectedBedForMenu, 'select-produce', { produceType: p.type });
                        setSelectedBedForMenu(null);
                      }}
                      className="flex items-center gap-4 btn-off-white p-4 text-left"
                    >
                      <img src={p.icon} alt={p.name} className="w-10 h-10 object-contain pixel-art" style={{ imageRendering: 'pixelated' }} />
                      <span className="text-[#3e2723] text-[10px]">{p.name}</span>
                    </button>
                  ));
                })()}

                {/* Bin Button in selection modal */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    interactWithBuilding(selectedBedForMenu, 'remove');
                    setSelectedBedForMenu(null);
                  }}
                  className="flex items-center gap-4 btn-off-white p-4 text-left"
                >
                  <img src="/images/garden-bin.png" className="w-10 h-10 object-contain pixel-art" style={{ imageRendering: 'pixelated' }} alt="Bin" />
                  <span className="text-[#3e2723] text-[10px]">BIN (REMOVE)</span>
                </button>
              </div>

              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedBedForMenu(null);
                }}
                className="mt-2 text-[#3e2723] text-[9px] underline uppercase hover:text-[#5d4a44] transition-colors"
              >
                CANCEL
              </button>
           </div>
        </div>
      )}
      {/* Action Menu Overlay (Levels 2-5 and House) */}
      {selectedBedForActionMenu && (
        <div className="fixed inset-0 z-[5000] flex items-center justify-center bg-black/60 pointer-events-auto font-['Press_Start_2P'] animate-in fade-in duration-200">
           <div className="p-8 flex flex-col items-center gap-6 max-w-[360px] w-full bg-[#f9f5f0]">

              <h3 className="text-[#3e2723] text-[12px] uppercase">ACTIONS</h3>
              
              <div className="grid grid-cols-1 gap-4 w-full">
                {(() => {
                  const b = buildings.find((b: any) => b.id === selectedBedForActionMenu);
                  if (!b) return null;
                  const gs = b.growthState;

                  return (
                    <>
                      {/* Garden Bed or Tree Specific Actions */}
                      {(b.type === 'garden-bed' || b.type === 'garden-tree') && gs && (
                        <>
                          {gs.currentLevel >= 2 && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                interactWithBuilding(b.id, 'clear');
                                setSelectedBedForActionMenu(null);
                              }}
                              className="flex items-center gap-4 btn-off-white p-4 text-left"
                            >
                              <img src="/images/garden-shovel.png" className="w-10 h-10 object-contain pixel-art" style={{ imageRendering: 'pixelated' }} alt="Shovel" />
                              <span className="text-[#3e2723] text-[10px]">{gs.currentLevel === 5 ? 'SHOVEL (CLEAR DEAD)' : 'SHOVEL (RESET)'}</span>
                            </button>
                          )}

                          {gs.currentLevel === 3 && Date.now() >= (gs.waterNeededAt || 0) && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                interactWithBuilding(b.id, 'water');
                                setSelectedBedForActionMenu(null);
                              }}
                              className="flex items-center gap-4 btn-off-white p-4 text-left"
                            >
                              <img src="/images/garden-watering-can.png" className="w-10 h-10 object-contain pixel-art" style={{ imageRendering: 'pixelated' }} alt="Water" />
                              <span className="text-[#3e2723] text-[10px]">WATER</span>
                            </button>
                          )}

                          {gs.currentLevel === 4 && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                interactWithBuilding(b.id, 'harvest');
                                setSelectedBedForActionMenu(null);
                              }}
                              className="flex items-center gap-4 btn-off-white p-4 text-left"
                            >
                              <img src="/images/garden-pick.png" className="w-10 h-10 object-contain pixel-art" style={{ imageRendering: 'pixelated' }} alt="Pick" />
                              <span className="text-[#3e2723] text-[10px]">PICK</span>
                            </button>
                          )}
                        </>
                      )}

                      {/* Starter House Specific Actions */}
                      {b.type === 'starter-house' && (
                        <>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              interactWithBuilding(b.id, 'sleep');
                              setSelectedBedForActionMenu(null);
                            }}
                            className="flex items-center gap-4 btn-off-white p-4 text-left"
                          >
                            <div className="text-3xl">😴</div>
                            <span className="text-[#3e2723] text-[10px]">GO TO SLEEP</span>
                          </button>
                        </>
                      )}

                      {/* Bin (Remove) - Available for all built items */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          interactWithBuilding(b.id, 'remove');
                          setSelectedBedForActionMenu(null);
                        }}
                        className="flex items-center gap-4 btn-off-white p-4 text-left"
                      >
                        <img src="/images/garden-bin.png" className="w-10 h-10 object-contain pixel-art" style={{ imageRendering: 'pixelated' }} alt="Bin" />
                        <span className="text-[#3e2723] text-[10px]">{b.type === 'starter-house' ? 'DELETE HOUSE' : 'BIN (REMOVE)'}</span>
                      </button>
                    </>
                  );
                })()}
              </div>

              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedBedForActionMenu(null);
                }}
                className="mt-2 text-[#3e2723] text-[9px] underline uppercase hover:text-[#5d4a44] transition-colors"
              >
                CANCEL
              </button>
           </div>
        </div>
      )}

      {/* Tree Collection Confirmation Modal */}
      {confirmTreeCollect && (
        <div className="fixed inset-0 z-[5000] flex items-center justify-center bg-black/60 pointer-events-auto font-['Press_Start_2P'] animate-in fade-in zoom-in duration-200">
           <div className="p-8 flex flex-col items-center gap-6 max-w-[300px] w-full bg-[#f9f5f0] border-4 border-[#3e2723] shadow-xl">
              <h3 className="text-[#3e2723] text-[12px] uppercase text-center">WOOD READY</h3>
              <div className="flex flex-col gap-3 w-full justify-center">
                  <button 
                    onClick={(e) => {
                        e.stopPropagation();
                        interactWithBuilding(confirmTreeCollect, 'collect-default-wood');
                        setConfirmTreeCollect(null);
                    }}
                    className="flex items-center gap-4 btn-off-white p-4 text-left w-full"
                  >
                    <img src="/images/garden-pick.png" className="w-10 h-10 object-contain pixel-art" style={{ imageRendering: 'pixelated' }} alt="Pick" />
                    <span className="text-[#3e2723] text-[10px]">PICK</span>
                  </button>
                  
                  <button 
                    onClick={(e) => {
                        e.stopPropagation();
                        setConfirmTreeCollect(null);
                    }}
                    className="mt-2 text-[#3e2723] text-[9px] underline uppercase hover:text-[#5d4a44] transition-colors"
                  >
                    CANCEL
                  </button>
              </div>
           </div>
        </div>
      )}
      {/* Sleeping Overlay */}
      {isInsideHouse && (
        <div className="fixed inset-0 z-[6000] flex flex-col items-center justify-center bg-black/60 backdrop-blur-md pointer-events-auto font-['Press_Start_2P'] animate-[fade-in_0.5s_ease-out]">
           <div className="p-12 flex flex-col items-center gap-10 bg-[#fcfaf8] rounded-3xl shadow-[0_16px_0_0_#d1c4b9] border-8 border-[#8d6e63]">
              <div className="text-8xl animate-bounce">😴</div>
              <div className="flex flex-col items-center gap-6">
                <h2 className="text-[#3e2723] text-2xl animate-pulse">SLEEPING...</h2>
                <div className="bg-[#3e2723] text-white px-6 py-3 rounded-xl text-[14px]">
                  {Math.floor(minutesSlept / 60)}h {minutesSlept % 60}m ELAPSED
                </div>
                <p className="text-[#8b7a6d] text-[10px] text-center max-w-[240px] leading-loose opacity-70">
                  TIME FLOWS FAST (1s = 1m)
                </p>
              </div>
              
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  const house = buildings.find((b: any) => b.id.includes('house')); // Flexible search
                  const h = house || buildings.find((b: any) => b.type === 'starter-house');
                  if (h) interactWithBuilding(h.id, 'wake');
                }}
                className="btn-off-white px-10 py-5 text-[14px] font-bold shadow-xl active:translate-y-1 active:shadow-none transition-all"
              >
                WAKE UP
              </button>
           </div>
        </div>
      )}
      {/* Shop UI */}
      {shopOpen && (
        <ShopUI 
          resources={resources} 
          onBuy={(item, cost, amount) => handleBuy(item, cost, amount)} 
          onClose={() => setShopOpen(false)} 
        />
      )}

      {/* Market UI */}
      {marketOpen && (
        <MarketUI 
          inventory={inventory} 
          onSell={(item, price, amount) => handleSell(item, price, amount)} 
          onClose={() => setMarketOpen(false)} 
        />
      )}
    </div>
  );
};

export default TownView;
