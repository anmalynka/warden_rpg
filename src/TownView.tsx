import React, { useState, useMemo, useEffect, useRef } from 'react';
import PlayerSprite from './PlayerSprite';

// Tile Types
export const TILE_TYPES = {
  FOG: 0,
  WATER: 1,
  SAND: 2,
  GRASS: 3
};

export const GRID_SIZE = 20;
export const TILE_SIZE = 32;

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
  interactWithBuilding
}: any) => {
  const [hoverTile, setHoverTile] = useState<{c: number, r: number} | null>(null);
  const [selectedBedForMenu, setSelectedBedForMenu] = useState<string | null>(null);
  const [selectedBedForActionMenu, setSelectedBedForActionMenu] = useState<string | null>(null);
  const touchDistRef = useRef<number | null>(null);

  // Offset to center the grid at world (0,0)
  const offsetX = -(GRID_SIZE * TILE_SIZE) / 2;
  const offsetY = -(GRID_SIZE * TILE_SIZE) / 2;

  // Stable random decorations with sub-tile offsets
  const decorations = useMemo(() => {
    const decoList: any[] = [];
    const assets = [
      { url: '/images/Bush_simple1_1.png', type: 'bush' },
      { url: '/images/Bush_blue_flowers1.png', type: 'mushroom' }
    ];

    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        if (ISLAND_MAP[r][c] === TILE_TYPES.GRASS) {
          const rand = Math.sin(r * 12.9898 + c * 78.233) * 43758.5453 % 1;
          if (Math.abs(rand) < 0.12) {
            const assetIdx = Math.floor(Math.abs(rand * 100)) % assets.length;
            const subX = (rand * 8); // -4 to +4
            const subY = (Math.cos(r * 10) * 8); // -4 to +4
            
            decoList.push({ 
              r, c, 
              asset: assets[assetIdx].url, 
              type: assets[assetIdx].type,
              subX, subY,
              id: `deco-${r}-${c}`
            });
          }
        }
      }
    }
    return decoList;
  }, []);

  // Stabilize obstacles with useMemo
  const allObstacles = useMemo(() => {
    const decoObstacles = decorations.map(d => ({ r: d.r, c: d.c }));
    const buildingObstacles = buildings
      .filter((b: any) => b.growthState && b.growthState.coordinates)
      .map((b: any) => ({ 
        r: b.growthState.coordinates.y, 
        c: b.growthState.coordinates.x 
      }));
    return [...decoObstacles, ...buildingObstacles];
  }, [decorations, buildings]);

  // Pass obstacles to parent for collision logic
  useEffect(() => {
    onUpdateObstacles?.(allObstacles);
  }, [allObstacles, onUpdateObstacles]);

  const worldToGrid = (x: number, y: number) => {
    const c = Math.floor((x - offsetX) / TILE_SIZE);
    const r = Math.floor((y - offsetY) / TILE_SIZE);
    return { c, r };
  };

  const gridToWorld = (c: number, r: number) => {
    return {
      x: offsetX + c * TILE_SIZE + TILE_SIZE / 2,
      y: offsetY + r * TILE_SIZE + TILE_SIZE / 2
    };
  };

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

  const handleClick = () => {
    if (isPlacing && pendingBuilding && hoverTile) {
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

      // Check for obstacles
      const isOccupied = decorations.some(d => d.r === hoverTile.r && d.c === hoverTile.c) ||
                         buildings.some((b: any) => {
                           // If it's a village-grid building (garden bed)
                           if (b.growthState) {
                             return b.growthState.coordinates.x === hoverTile.c && b.growthState.coordinates.y === hoverTile.r;
                           }
                           // If it's a world-coordinate building (house)
                           const buildingGrid = worldToGrid(b.offset.x, b.offset.y);
                           return buildingGrid.c === hoverTile.c && buildingGrid.r === hoverTile.r;
                         });

      if (isTerrainValid && !isOccupied) {
        onBuild(pendingBuilding.type, pendingBuilding.cost, gridToWorld(hoverTile.c, hoverTile.r));
      }
    } else if (!isPlacing && hoverTile) {
      // INTERACTION MODE
      const clickedBuilding = buildings.find((b: any) => {
        if (b.growthState) {
          return b.growthState.coordinates.x === hoverTile.c && b.growthState.coordinates.y === hoverTile.r;
        }
        const buildingGrid = worldToGrid(b.offset.x, b.offset.y);
        return buildingGrid.c === hoverTile.c && buildingGrid.r === hoverTile.r;
      });

      if (clickedBuilding) {
        // Check adjacency (within 1 tile including diagonals)
        const playerGrid = worldToGrid(avatarPos.x, avatarPos.y);
        const distC = Math.abs(playerGrid.c - hoverTile.c);
        const distR = Math.abs(playerGrid.r - hoverTile.r);

        if (distC <= 1 && distR <= 1) {
           if (clickedBuilding.type === 'garden-bed' || clickedBuilding.type === 'garden-tree') {
             const gs = clickedBuilding.growthState;
             if (gs.currentLevel === 1 && !gs.produceType) {
               setSelectedBedForMenu(clickedBuilding.id);
               setSelectedBedForActionMenu(null);
             } else {
               setSelectedBedForActionMenu(clickedBuilding.id);
               setSelectedBedForMenu(null);
             }
           } else if (clickedBuilding.type === 'starter-house') {
             setSelectedBedForActionMenu(clickedBuilding.id);
             setSelectedBedForMenu(null);
           }
        }
      }
    }
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
      className="relative w-full h-full overflow-hidden bg-[#000b14]"
      style={{ imageRendering: 'pixelated' }}
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
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          
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
              const isWater = type === TILE_TYPES.WATER;

              return (
                <div 
                  key={`${c}-${r}`}
                  className="relative overflow-visible"
                  style={{
                    width: TILE_SIZE,
                    height: TILE_SIZE,
                    backgroundColor: isWater ? '#1e88e5' : isSand ? '#d9c58d' : isGrass ? '#558b2f' : '#050a0f',
                    backgroundImage: isGrass ? 'url("/images/grass.png")' : 'none',
                    backgroundSize: '32px 32px', // Match TILE_SIZE for seamlessness
                    border: 'none',
                    outline: 'none',
                    margin: 0,
                    padding: 0
                  }}
                >
                  {isPlacing && (isGrass || isSand) && hoverTile?.c === c && hoverTile?.r === r && (
                    <div className="absolute inset-0 border-2 border-green-400/80 animate-pulse z-10" />
                  )}
                </div>
              );
            }))}
          </div>

          {/* Decorations Layer */}
          {decorations.map((deco) => (
            <div 
              key={deco.id}
              className="absolute pointer-events-none"
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
            </div>
          ))}

          {/* Buildings Layer */}
          {buildings.filter((b: any) => b.offset && b.offset.x !== undefined).map((building: any) => (
            <div 
              key={building.id}
              className="absolute pointer-events-none flex flex-col items-center justify-center"
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
                     {building.growthState.currentLevel === 3 && (
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
                    className="w-[60px] h-[60px] object-contain"
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
            <div className="relative" style={{ transform: 'translate(-50%, -50%)' }}>
              <PlayerSprite 
                direction={facing as any} 
                isWalking={isWalking} 
                scale={1.2 * (villageZoom / 2.5)} 
              />
            </div>
          </div>

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
                 
                 const isOccupied = decorations.some(d => d.r === hoverTile.r && d.c === hoverTile.c) ||
                                    buildings.some((b: any) => {
                                      if (b.growthState) {
                                        return b.growthState.coordinates.x === hoverTile.c && b.growthState.coordinates.y === hoverTile.r;
                                      }
                                      const buildingGrid = worldToGrid(b.offset.x, b.offset.y);
                                      return buildingGrid.c === hoverTile.c && buildingGrid.r === hoverTile.r;
                                    });
                 
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
                      ) : pendingBuilding.type === 'starter-house' ? (
                        <img 
                          src="/images/house.png"
                          alt="Ghost House"
                          className="w-[60px] h-[60px] object-contain"
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
        <div className="fixed inset-0 z-[5000] flex items-center justify-center bg-black/60 pointer-events-auto font-['Press_Start_2P']">
           <div className="p-8 flex flex-col items-center gap-6 max-w-[360px] w-full border-4 border-[#3e2723] bg-[#f9f5f0]">
              <h3 className="text-[#3e2723] text-[12px] uppercase">CHOOSE PRODUCE</h3>
              
              <div className="grid grid-cols-1 gap-4 w-full">
                {[
                  { type: 'wheat', name: 'WHEAT', icon: '/images/garden-wheat.png' },
                  { type: 'tomato', name: 'TOMATO', icon: '/images/garden-tomato.png' },
                  { type: 'pumpkin', name: 'PUMPKIN', icon: '/images/garden-pumpkin.png' }
                ].map(p => (
                  <button
                    key={p.type}
                    onClick={() => {
                      interactWithBuilding(selectedBedForMenu, 'select-produce', { produceType: p.type });
                      setSelectedBedForMenu(null);
                    }}
                    className="flex items-center gap-4 bg-[#f9f5f0] border-4 border-[#3e2723] p-4 hover:bg-white active:translate-y-1 transition-all text-left shadow-[0_4px_0_0_#3e2723]"
                  >
                    <img src={p.icon} alt={p.name} className="w-10 h-10 object-contain pixel-art" style={{ imageRendering: 'pixelated' }} />
                    <span className="text-[#3e2723] text-[10px]">{p.name}</span>
                  </button>
                ))}

                {/* Bin Button in selection modal */}
                <button
                  onClick={() => {
                    interactWithBuilding(selectedBedForMenu, 'remove');
                    setSelectedBedForMenu(null);
                  }}
                  className="flex items-center gap-4 bg-[#f9f5f0] border-4 border-[#3e2723] p-4 hover:bg-white active:translate-y-1 transition-all text-left shadow-[0_4px_0_0_#3e2723]"
                >
                  <img src="/images/garden-bin.png" className="w-10 h-10 object-contain pixel-art" style={{ imageRendering: 'pixelated' }} alt="Bin" />
                  <span className="text-[#3e2723] text-[10px]">BIN (REMOVE)</span>
                </button>
              </div>

              <button 
                onClick={() => setSelectedBedForMenu(null)}
                className="mt-2 text-[#3e2723] text-[9px] underline uppercase hover:text-[#5d4a44] transition-colors"
              >
                CANCEL
              </button>
           </div>
        </div>
      )}
      {/* Action Menu Overlay (Levels 2-5 and House) */}
      {selectedBedForActionMenu && (
        <div className="fixed inset-0 z-[5000] flex items-center justify-center bg-black/60 pointer-events-auto font-['Press_Start_2P']">
           <div className="p-8 flex flex-col items-center gap-6 max-w-[360px] w-full border-4 border-[#3e2723] bg-[#f9f5f0]">
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
                          {/* Level 1 Trees start with produceType but need to move to Level 2 */}
                          {b.type === 'garden-tree' && gs.currentLevel === 1 && (
                            <button
                              onClick={() => {
                                interactWithBuilding(b.id, 'select-produce', { produceType: gs.produceType });
                                setSelectedBedForActionMenu(null);
                              }}
                              className="flex items-center gap-4 bg-[#f9f5f0] border-4 border-[#3e2723] p-4 hover:bg-white active:translate-y-1 transition-all text-left shadow-[0_4px_0_0_#3e2723]"
                            >
                              <img src={`/images/garden-${gs.produceType}.png`} className="w-10 h-10 object-contain pixel-art" style={{ imageRendering: 'pixelated' }} alt="Plant" />
                              <span className="text-[#3e2723] text-[10px]">PLANT / START GROWING</span>
                            </button>
                          )}

                          {gs.currentLevel >= 2 && (
                            <button
                              onClick={() => {
                                interactWithBuilding(b.id, 'clear');
                                setSelectedBedForActionMenu(null);
                              }}
                              className="flex items-center gap-4 bg-[#f9f5f0] border-4 border-[#3e2723] p-4 hover:bg-white active:translate-y-1 transition-all text-left shadow-[0_4px_0_0_#3e2723]"
                            >
                              <img src="/images/garden-shovel.png" className="w-10 h-10 object-contain pixel-art" style={{ imageRendering: 'pixelated' }} alt="Shovel" />
                              <span className="text-[#3e2723] text-[10px]">{gs.currentLevel === 5 ? 'SHOVEL (CLEAR DEAD)' : 'SHOVEL (RESET)'}</span>
                            </button>
                          )}

                          {gs.currentLevel === 3 && (
                            <button
                              onClick={() => {
                                interactWithBuilding(b.id, 'water');
                                setSelectedBedForActionMenu(null);
                              }}
                              className="flex items-center gap-4 bg-[#f9f5f0] border-4 border-[#3e2723] p-4 hover:bg-white active:translate-y-1 transition-all text-left shadow-[0_4px_0_0_#3e2723]"
                            >
                              <img src="/images/garden-watering-can.png" className="w-10 h-10 object-contain pixel-art" style={{ imageRendering: 'pixelated' }} alt="Water" />
                              <span className="text-[#3e2723] text-[10px]">WATER</span>
                            </button>
                          )}

                          {gs.currentLevel === 4 && (
                            <button
                              onClick={() => {
                                interactWithBuilding(b.id, 'harvest');
                                setSelectedBedForActionMenu(null);
                              }}
                              className="flex items-center gap-4 bg-[#f9f5f0] border-4 border-[#3e2723] p-4 hover:bg-white active:translate-y-1 transition-all text-left shadow-[0_4px_0_0_#3e2723]"
                            >
                              <img src="/images/garden-pick.png" className="w-10 h-10 object-contain pixel-art" style={{ imageRendering: 'pixelated' }} alt="Pick" />
                              <span className="text-[#3e2723] text-[10px]">COLLECT</span>
                            </button>
                          )}
                        </>
                      )}

                      {/* Bin (Remove) - Available for all built items */}
                      <button
                        onClick={() => {
                          interactWithBuilding(b.id, 'remove');
                          setSelectedBedForActionMenu(null);
                        }}
                        className="flex items-center gap-4 bg-[#f9f5f0] border-4 border-[#3e2723] p-4 hover:bg-white active:translate-y-1 transition-all text-left shadow-[0_4px_0_0_#3e2723]"
                      >
                        <img src="/images/garden-bin.png" className="w-10 h-10 object-contain pixel-art" style={{ imageRendering: 'pixelated' }} alt="Bin" />
                        <span className="text-[#3e2723] text-[10px]">BIN (REMOVE)</span>
                      </button>
                    </>
                  );
                })()}
              </div>

              <button 
                onClick={() => setSelectedBedForActionMenu(null)}
                className="mt-2 text-[#3e2723] text-[9px] underline uppercase hover:text-[#5d4a44] transition-colors"
              >
                CANCEL
              </button>
           </div>
        </div>
      )}
    </div>
  );
};

export default TownView;
