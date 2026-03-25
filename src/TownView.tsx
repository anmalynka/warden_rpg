import React, { useMemo, useEffect, useRef } from 'react';
import PlayerSprite from './PlayerSprite';
import { 
  TILE_TYPES, TILE_SIZE, 
  worldToGrid, gridToWorld, ISLAND_MAP, getBuildingTiles 
} from './MapConstants';

const TownView = ({ 
  avatarPos, 
  villageZoom, 
  setVillageZoom,
  buildings, 
  isPlacing, 
  pendingBuilding, 
  onBuild,
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
  inventory,
  islandMap,
  expandLand,
  expansionCost,
  npcs,
  shopOpen,
  setShopOpen,
  marketOpen,
  setMarketOpen,
  selectedBedForMenu,
  setSelectedBedForMenu,
  selectedBedForActionMenu,
  setSelectedBedForActionMenu,
  confirmTreeCollect,
  setConfirmTreeCollect,
  expansionConfirm,
  setExpansionConfirm,
  removedDecorations = []
  }: any) => {
  const touchDistRef = useRef<number | null>(null);
  
  // Use passed islandMap or fallback for safety
  const currentMap = islandMap || ISLAND_MAP;

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
  }, [initialSelectedBuilding, buildings, onClearInitialSelection, setSelectedBedForMenu, setSelectedBedForActionMenu]);

  const decorations = useMemo(() => {
    const decoList: any[] = [];
    const assets = [
      { url: '/images/Bush_simple1_1.png', type: 'bush' },
      { url: '/images/Bush_blue_flowers1.png', type: 'mushroom' },
      { url: '/images/Tree1.png', type: 'default-tree' },
      { url: '/images/Tree2.png', type: 'default-tree' }
    ];

    const currentSize = currentMap.length;

    for (let r = 0; r < currentSize; r++) {
      for (let c = 0; c < currentSize; c++) {
        if (currentMap[r][c] === TILE_TYPES.GRASS) {
          const rand = Math.sin(r * 12.9898 + c * 78.233) * 43758.5453 % 1;
          if (Math.abs(rand) < 0.15) {
            const assetIdx = Math.floor(Math.abs(rand * 100)) % assets.length;
            const subX = (rand * 8); 
            const subY = (Math.cos(r * 10) * 8); 
            const id = `tree-${c}-${r}`;
            
            if (!removedDecorations.includes(id)) {
              decoList.push({ 
                r, c, 
                asset: assets[assetIdx].url, 
                type: assets[assetIdx].type,
                subX, subY,
                id 
              });
            }
          }
        }
      }
    }
    return decoList;
  }, [currentMap, removedDecorations]);

  // Stabilize obstacles with useMemo
  const allObstacles = useMemo(() => {
    const currentSize = currentMap.length;
    const decoObstacles = decorations.map(d => {
      const base = gridToWorld(d.c, d.r, currentSize);
      const centerX = base.x + d.subX;
      const centerY = base.y + d.subY;
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
      if (b.offset) {
        const gridPos = worldToGrid(b.offset.x, b.offset.y, currentSize);
        const tiles = getBuildingTiles(b.type, gridPos.c, gridPos.r);
        
        // Use 64x64 collision area for most buildings
        let hitbox = { x: b.offset.x - 32, y: b.offset.y - 32, w: 64, h: 64 };
        
        if (b.type === 'garden-bed' || b.type === 'garden-tree' || b.type === 'shop') {
           hitbox = { x: b.offset.x - 16, y: b.offset.y - 16, w: 32, h: 32 };
        }

        buildingObstacles.push({
          ...hitbox,
          type: b.type,
          isMultiTile: tiles.length > 1,
          tiles: tiles,
          r: gridPos.r,
          c: gridPos.c
        });
      }
    });

    const npcObstacles = npcs.map((npc: any) => {
      const worldPos = gridToWorld(npc.c, npc.r, currentSize);
      return {
        x: worldPos.x - 12,
        y: worldPos.y - 12,
        w: 24,
        h: 24,
        type: 'npc'
      };
    });

    return [...decoObstacles, ...buildingObstacles, ...npcObstacles];
  }, [decorations, buildings, npcs, currentMap.length]);

  // Pass obstacles to parent for collision logic
  useEffect(() => {
    onUpdateObstacles?.(allObstacles);
  }, [allObstacles, onUpdateObstacles]);

  const handleMouseMove = (e: React.MouseEvent) => {
    const currentSize = currentMap.length;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left - rect.width / 2) / villageZoom + avatarPos.x;
    const y = (e.clientY - rect.top - rect.height / 2) / villageZoom + avatarPos.y;
    const { c, r } = worldToGrid(x, y, currentSize);
    
    if (c >= 0 && c < currentSize && r >= 0 && r < currentSize) {
      if (isPlacing) {
        setMousePos(gridToWorld(c, r, currentSize));
      }
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

    const hasActionMenu = [
      'garden-bed', 
      'garden-tree', 
      'starter-house', 
      'mini-house', 
      'shop', 
      'market', 
      'hotel'
    ].includes(building.type);

    if (hasActionMenu) {
      const gs = building.growthState;
      if (gs && gs.currentLevel === 1 && !gs.produceType && (building.type === 'garden-bed' || building.type === 'garden-tree')) {
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
    const currentSize = currentMap.length;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left - rect.width / 2) / villageZoom + avatarPos.x;
    const y = (e.clientY - rect.top - rect.height / 2) / villageZoom + avatarPos.y;
    const { c: hc, r: hr } = worldToGrid(x, y, currentSize);

    if (isPlacing && pendingBuilding && hc >= 0 && hc < currentSize && hr >= 0 && hr < currentSize) {
      if (e.detail === 2) {
        onBuild(null, null, null);
        return;
      }

      const checkOccupied = (cc: number, rr: number) => 
        allObstacles.some(ob => 
          ob.isMultiTile 
            ? ob.tiles.some((t: any) => t.r === rr && t.c === cc)
            : ob.r === rr && ob.c === cc
        );

      const pendingTiles = getBuildingTiles(pendingBuilding.type, hc, hr);
      
      const isOccupied = pendingTiles.some(t => checkOccupied(t.c, t.r));
      const isTerrainValid = pendingTiles.every(t => {
        const tType = currentMap[t.r]?.[t.c];
        return tType === TILE_TYPES.GRASS;
      });

      if (isTerrainValid && !isOccupied) {
        onBuild(pendingBuilding.type, pendingBuilding.cost, gridToWorld(hc, hr, currentSize));
      }
      return;
    }

    // Land Expansion: Click on SAND or WATER
    if (hc >= 0 && hc < currentSize && hr >= 0 && hr < currentSize) {
      const tileType = currentMap[hr][hc];
      if (tileType === TILE_TYPES.SAND || tileType === TILE_TYPES.WATER) {
        const playerGrid = worldToGrid(avatarPos.x, avatarPos.y, currentSize);
        const isPlayerOnLand = currentMap[playerGrid.r]?.[playerGrid.c] === TILE_TYPES.SAND || currentMap[playerGrid.r]?.[playerGrid.c] === TILE_TYPES.GRASS;
        const dist = Math.sqrt(Math.pow(playerGrid.c - hc, 2) + Math.pow(playerGrid.r - hr, 2));

        if (isPlayerOnLand && dist <= 2.5) {
           setExpansionConfirm({ c: hc, r: hr });
        }
      }
    }
  };

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

  const currentSize = currentMap.length;
  const playerGrid = worldToGrid(avatarPos.x, avatarPos.y, currentSize);

  return (
    <div 
      className="relative w-full h-full overflow-hidden bg-[#1e88e5]"
      style={{ 
        imageRendering: 'pixelated', 
        contain: 'paint',
        backgroundImage: 'url(/images/water.jpg)',
        backgroundSize: '256px 256px'
      }}
      onMouseMove={handleMouseMove}
      onClick={handleClick}
      onWheel={handleWheel}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div 
        className="absolute inset-0"
        style={{
          transform: `scale(${villageZoom}) translate(${-Math.round(avatarPos.x)}px, ${-Math.round(avatarPos.y)}px)`,
          transformOrigin: 'center center',
          imageRendering: 'pixelated',
          // @ts-ignore
          imageRendering: 'crisp-edges'
        }}
      >
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-[#1e88e5]">
          
          <div 
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${currentSize}, ${TILE_SIZE}px)`,
              gridTemplateRows: `repeat(${currentSize}, ${TILE_SIZE}px)`,
              width: currentSize * TILE_SIZE,
              height: currentSize * TILE_SIZE,
            }}
          >
            {currentMap.map((row, r) => row.map((type, c) => {
              const isGrass = type === TILE_TYPES.GRASS;
              const isSand = type === TILE_TYPES.SAND;
              const isWater = type === TILE_TYPES.WATER;

              const getType = (rr: number, cc: number) => {
                if (rr < 0 || rr >= currentSize || cc < 0 || cc >= currentSize) return TILE_TYPES.WATER;
                return currentMap[rr][cc];
              };

              const sandRadius = (dr: number, dc: number) => {
                 const vertical = getType(r + dr, c);
                 const horizontal = getType(r, c + dc);
                 // Round if both adjacent sides are water
                 return (vertical === TILE_TYPES.WATER && horizontal === TILE_TYPES.WATER) ? `12px` : '0px';
              };

              const grassRadius = (dr: number, dc: number) => {
                 const vertical = getType(r + dr, c);
                 const horizontal = getType(r, c + dc);
                 // Round if both adjacent sides are not grass
                 return (vertical !== TILE_TYPES.GRASS && horizontal !== TILE_TYPES.GRASS) ? `12px` : '0px';
              };

              const isPlayerOnLand = currentMap[playerGrid.r]?.[playerGrid.c] === TILE_TYPES.SAND || currentMap[playerGrid.r]?.[playerGrid.c] === TILE_TYPES.GRASS;
              const distToPlayer = Math.sqrt(Math.pow(playerGrid.c - c, 2) + Math.pow(playerGrid.r - r, 2));
              const canExpandThisTile = (isSand || isWater) && isPlayerOnLand && distToPlayer <= 2.5;

              return (
                <div 
                  key={`${c}-${r}`}
                  className="relative w-full h-full border-none outline-none overflow-hidden"
                  style={{ 
                    backgroundImage: 'url("/images/water.jpg")',
                    backgroundSize: '32px 32px',
                    imageRendering: 'pixelated',
                    // @ts-ignore
                    imageRendering: 'crisp-edges',
                    margin: '-0.5px',
                    transform: 'scale(1.02)',
                    border: 'none'
                  }}
                >
                  {(isSand || isGrass) && (
                    <div 
                      className="absolute inset-0 z-0"
                      style={{
                        backgroundImage: 'url("/images/sand.jpg")',
                        backgroundSize: '32px 32px',
                        imageRendering: 'pixelated',
                        borderTopLeftRadius: sandRadius(-1, -1),
                        borderTopRightRadius: sandRadius(-1, 1),
                        borderBottomLeftRadius: sandRadius(1, -1),
                        borderBottomRightRadius: sandRadius(1, 1),
                      }}
                    />
                  )}

                  {isGrass && (
                    <div 
                      className="absolute inset-0 z-10"
                      style={{
                        backgroundImage: 'url("/images/grass texture.png")',
                        backgroundSize: '32px 32px',
                        imageRendering: 'pixelated',
                        borderTopLeftRadius: grassRadius(-1, -1),
                        borderTopRightRadius: grassRadius(-1, 1),
                        borderBottomLeftRadius: grassRadius(1, -1),
                        borderBottomRightRadius: grassRadius(1, 1),
                      }}
                    />
                  )}

                  {canExpandThisTile && (
                    <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
                       <div className="bg-[#3e2723]/80 text-[#e9d681] text-[4px] px-1 py-0.5 rounded animate-pulse border border-[#e9d681]">
                         EXPAND
                       </div>
                    </div>
                  )}
                </div>
              );
            }))}
          </div>

          {decorations.map((deco) => (
            <div 
              key={deco.id}
              className={`absolute ${isPlacing ? 'pointer-events-none' : 'pointer-events-auto cursor-pointer'}`}
              onClick={(e) => handleDecorationClick(deco, e)}
              style={{
                left: Math.round(deco.c * TILE_SIZE + TILE_SIZE / 2 + deco.subX),
                top: Math.round(deco.r * TILE_SIZE + TILE_SIZE / 2 + deco.subY),
                zIndex: 100 + Math.round(deco.r * TILE_SIZE + TILE_SIZE / 2 + deco.subY),
              }}
            >
              <div 
                style={{
                  width: TILE_SIZE, height: TILE_SIZE,
                  backgroundImage: `url(${deco.asset})`,
                  backgroundSize: 'contain',
                  backgroundPosition: 'center bottom',
                  backgroundRepeat: 'no-repeat',
                  transform: 'translate(-50%, -100%) scale(1.1)',
                  transformOrigin: 'bottom center'
                }}
              />
              {(deco.type === 'default-tree' || deco.type === 'bush') && (!treeCooldowns[deco.id] || Date.now() >= treeCooldowns[deco.id]) && (
                  <div className="absolute top-[-32px] left-1/2 -translate-x-1/2 animate-bounce z-50">
                      <img src="/images/tools-wood.png" className="w-4 h-4 object-contain pixel-art" style={{ imageRendering: 'pixelated' }} alt="Wood Ready" />
                  </div>
              )}
            </div>
          ))}

          {buildings.filter((b: any) => b.offset && b.offset.x !== undefined).map((building: any) => (
            <div 
              key={building.id}
              className={`absolute flex flex-col items-center justify-center ${isPlacing ? 'pointer-events-none' : 'pointer-events-auto cursor-pointer'}`}
              onClick={(e) => handleBuildingClick(building, e)}
              style={{
                left: Math.round(building.offset.x + (currentSize * TILE_SIZE) / 2 + 16),
                top: Math.round(building.offset.y + (currentSize * TILE_SIZE) / 2 + 16),
                zIndex: 100 + Math.round(building.offset.y + (currentSize * TILE_SIZE) / 2 + 16),
              }}
            >
              <div style={{ transform: 'translate(-50%, -100%)', transformOrigin: 'bottom center' }} className="flex flex-col items-center">
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
                     {!npcs.some((n: any) => n.targetId === building.id) && building.growthState.currentLevel === 3 && !building.growthState.isWatered && Date.now() >= (building.growthState.waterNeededAt || 0) && (
                       <div className="absolute top-0 right-0 animate-bounce">
                          <img src="/images/garden-watering-can.png" className="w-[12px] h-[12px] object-contain" alt="Needs Water" />
                       </div>
                     )}
                     {!npcs.some((n: any) => n.targetId === building.id) && building.growthState.currentLevel === 4 && (
                       <div className="absolute top-0 right-0 animate-pulse">
                          <img src="/images/garden-pick.png" className="w-[12px] h-[12px] object-contain" alt="Ready to Harvest" />
                       </div>
                     )}
                     {!npcs.some((n: any) => n.targetId === building.id) && building.growthState.currentLevel === 5 && (
                       <div className="absolute -top-12 left-1/2 -translate-x-1/2 flex flex-col items-center">
                          <img src="/images/garden-shovel.png" className="w-8 h-8 object-contain" alt="Remove Dead Plant" />
                          <div className="text-[6px] bg-red-500 text-white px-1">DEAD</div>
                       </div>
                     )}
                  </div>
                ) : building.type === 'starter-house' ? (
                  <img src="/images/house.png" alt="House" className="w-[72px] h-[72px] object-contain" style={{ imageRendering: 'pixelated' }} />
                ) : building.type === 'mini-house' ? (
                  <img src="/images/mini-house.png" alt="Mini House" className="w-[72px] h-[72px] object-contain" style={{ imageRendering: 'pixelated' }} />
                ) : building.type === 'shop' ? (
                  <img src="/images/Shop.png" alt="Shop" className="w-[32px] h-[32px] object-contain" style={{ imageRendering: 'pixelated' }} />
                ) : building.type === 'market' ? (
                  <img src="/images/Market.png" alt="Market" className="w-[72px] h-[96px] object-contain" style={{ imageRendering: 'pixelated' }} />
                ) : building.type === 'hotel' ? (
                  <img src="/images/Storage.png" alt="Hotel" className="w-[72px] h-[72px] object-contain" style={{ imageRendering: 'pixelated' }} />
                ) : (
                  <img src={`/images/${building.type}.png`} alt={building.type} className="w-[72px] h-[72px] object-contain" style={{ imageRendering: 'pixelated' }} onError={(e: any) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'block'; }} />
                )}
                <span className="text-4xl hidden" role="img" aria-label={building.type}>{getBuildingEmoji(building.type)}</span>
              </div>
            </div>
          ))}

          {!isInsideHouse && (
            <>
              {/* Player Sprite */}
              <div 
                className="absolute flex items-center justify-center"
                style={{
                  left: Math.round(avatarPos.x + (currentSize * TILE_SIZE) / 2 + 16),
                  top: Math.round(avatarPos.y + (currentSize * TILE_SIZE) / 2 + 16),
                  width: TILE_SIZE, height: TILE_SIZE,
                  zIndex: 100 + Math.round(avatarPos.y + (currentSize * TILE_SIZE) / 2 + 16),
                }}
              >
                <div className="relative" style={{ 
                  transform: 'translate(-50%, -100%) translateZ(0)', 
                  transformOrigin: 'bottom center' 
                }}>
                  <PlayerSprite 
                    direction={facing as any} 
                    isWalking={isWalking} 
                  />
                </div>
              </div>

              {/* NPC Sprites */}
              {npcs.map(npc => {
                const rx = Math.round(npc.x + (currentSize * TILE_SIZE) / 2 + 16);
                const ry = Math.round(npc.y + (currentSize * TILE_SIZE) / 2 + 16);
                
                return (
                  <div 
                    key={npc.id}
                    className="absolute flex items-center justify-center transition-all duration-75"
                    style={{
                      left: rx, top: ry,
                      width: TILE_SIZE, height: TILE_SIZE,
                      zIndex: 100 + ry,
                    }}
                  >
                    <div className="relative" style={{ 
                      transform: 'translate(-50%, -100%) translateZ(0)', 
                      transformOrigin: 'bottom center' 
                    }}>
                       <div 
                         style={{
                           width: '32px', height: '32px',
                           transform: 'translateZ(0)',
                           transformOrigin: 'bottom center',
                           imageRendering: 'pixelated',
                           // @ts-ignore
                           imageRendering: 'crisp-edges',
                           backgroundImage: `url(/images/${npc.char === 'racoon' ? 'work-racoon.png' : 'vac-fox.png'})`,
                           backgroundSize: '192px 128px',
                           backgroundPositionX: (npc.isWalking || npc.status === 'working') ? `-${(Math.floor(Date.now() / 150) % 6) * 32}px` : '0px',
                           backgroundPositionY: `-${(npc.facing === 'up' ? 3 : npc.facing === 'left' ? 1 : npc.facing === 'right' ? 2 : 0) * 32}px`,
                         }}
                       />
                       {npc.status === 'staying' && (
                         <div className="absolute -top-12 left-1/2 -translate-x-1/2 text-[8px] bg-green-600 text-white px-2 py-1 rounded border border-white animate-bounce">RESTING</div>
                       )}
                    </div>
                  </div>
                );
              })}
            </>
          )}

          {isPlacing && pendingBuilding && mousePos && (
             <div 
               className="absolute pointer-events-none flex flex-col items-center justify-center"
               style={{
                 left: Math.round(mousePos.x + (currentSize * TILE_SIZE) / 2 + 16),
                 top: Math.round(mousePos.y + (currentSize * TILE_SIZE) / 2 + 16),
                 transform: 'translate(-50%, -100%)',
                 zIndex: 100,
                 opacity: 0.6
               }}
             >
               {(() => {
                 const gridPos = worldToGrid(mousePos.x, mousePos.y, currentSize);
                 const pendingTiles = getBuildingTiles(pendingBuilding.type, gridPos.c, gridPos.r);
                 return (
                   <div className="relative">
                      {pendingTiles.map((t, idx) => {
                         const tType = currentMap[t.r]?.[t.c];
                         const tTerrainValid = tType === TILE_TYPES.GRASS;
                         const dx = t.c - gridPos.c;
                         const dy = t.r - gridPos.r;
                         return (
                           <div key={idx} className={`absolute w-8 h-8 rounded-sm ${tTerrainValid ? 'bg-green-500/30' : 'bg-red-500/50'} border border-white/20`} style={{ transform: `translate(${dx * 32}px, ${dy * 32}px)` }} />
                         );
                      })}
                      <div className="relative z-10 opacity-80">
                        {pendingBuilding.type === 'garden-bed' ? (
                          <img src="/images/garden-bed-wheat-1.png" alt="Ghost" className="w-10 h-10 object-contain" />
                        ) : pendingBuilding.type === 'garden-tree' ? (
                          <img src="/images/garden-apple-1.png" alt="Ghost" className="w-10 h-10 object-contain" />
                        ) : pendingBuilding.type === 'starter-house' ? (
                          <img src="/images/house.png" alt="Ghost" className="w-[72px] h-[72px] object-contain" />
                        ) : pendingBuilding.type === 'mini-house' ? (
                          <img src="/images/mini-house.png" alt="Ghost" className="w-[72px] h-[72px] object-contain" />
                        ) : pendingBuilding.type === 'shop' ? (
                          <img src="/images/Shop.png" alt="Ghost" className="w-[32px] h-[32px] object-contain" />
                        ) : pendingBuilding.type === 'market' ? (
                          <img src="/images/Market.png" alt="Ghost" className="w-[72px] h-[96px] object-contain" />
                        ) : pendingBuilding.type === 'hotel' ? (
                          <img src="/images/Storage.png" alt="Ghost" className="w-[72px] h-[72px] object-contain" />
                        ) : (
                          <span className="text-4xl">{getBuildingEmoji(pendingBuilding.type)}</span>
                        )}
                      </div>
                   </div>
                 );
               })()}
             </div>
          )}
        </div>
      </div>

      {isInsideHouse && (
        <div className="fixed inset-0 z-[10000] flex flex-col items-center justify-center bg-black/60 backdrop-blur-md font-['Press_Start_2P'] p-4">
           <div className="p-8 flex flex-col items-center gap-6 max-w-[360px] w-full bg-[#f9f5f0] border-4 border-[#3e2723] shadow-xl relative rounded-3xl">
              <img src="/images/sleep.png" className="w-16 h-16 object-contain pixel-art" style={{ imageRendering: 'pixelated' }} alt="Sleeping" />
              <div className="flex flex-col items-center gap-4">
                <h2 className="text-[#3e2723] text-[12px] uppercase text-center">SLEEPING...</h2>
                <div className="bg-[#3e2723] text-white px-4 py-2 rounded-xl text-[10px]">{Math.floor(minutesSlept / 60)}h {minutesSlept % 60}m ELAPSED</div>
              </div>
              <button 
                onClick={() => {
                  const h = buildings.find((b: any) => b.type === 'starter-house');
                  if (h) interactWithBuilding(h.id, 'wake');
                }} 
                className="w-full py-4 text-[10px] btn-off-white shadow-[0_4px_0_0_#d1c4b9]"
              >
                WAKE UP
              </button>
           </div>
        </div>
      )}
    </div>
  );
};

export default TownView;
