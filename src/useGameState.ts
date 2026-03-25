import { useState, useCallback, useEffect } from 'react';
import * as turf from '@turf/turf';
import { generateIslandMap, TILE_TYPES, GRID_SIZE, INITIAL_GRID_SIZE, TILE_SIZE, getBuildingTiles, gridToWorldBuilding, gridToWorld, worldToGrid } from './MapConstants';

export const useGameState = () => {
  // 1. ALL USESTATE AT THE TOP
  const [islandMap, setIslandMap] = useState<number[][]>(() => {
    const saved = localStorage.getItem('warden_map');
    const map = saved ? JSON.parse(saved) : generateIslandMap(INITIAL_GRID_SIZE);
    return map;
  });

  // Local helpers for grid conversions (avoiding scope issues in closures)
  const gridToWorldLocal = useCallback((c: number, r: number) => gridToWorld(c, r, islandMap.length), [islandMap.length]);
  const worldToGridLocal = useCallback((x: number, y: number) => worldToGrid(x, y, islandMap.length), [islandMap.length]);
  const [expansionCost, setExpansionCost] = useState(() => {
    if (!localStorage.getItem('warden_map')) return 500;
    const saved = localStorage.getItem('warden_expansion_cost');
    return saved ? parseInt(saved) : 500;
  });

  const [resources, setResources] = useState(() => {
    const saved = localStorage.getItem('warden_resources');
    if (!localStorage.getItem('warden_map')) return { wood: 50, metal: 20, coins: 100 };
    return saved ? JSON.parse(saved) : {
      wood: 50,
      metal: 20,
      coins: 100
    };
  });
  const [exploredTerritory, setExploredTerritory] = useState(() => {
    const saved = localStorage.getItem('warden_territory');
    return saved ? JSON.parse(saved) : null;
  });
  const [spawnedResources, setSpawnedResources] = useState([]);
  const [lastSpawnLocations, setLastSpawnLocations] = useState([]);
  const [buildings, setBuildings] = useState<any[]>(() => {
    const saved = localStorage.getItem('warden_buildings');
    return saved ? JSON.parse(saved) : [];
  });
  const [totalDistanceWalked, setTotalDistanceWalked] = useState(() => {
    const saved = localStorage.getItem('warden_distance');
    return saved ? JSON.parse(saved) : 0;
  });
  const [avatarPos, setAvatarPos] = useState({ x: 0, y: 0 }); // Ground position at center
  const [villageZoom, setVillageZoom] = useState(2.5); // Zoomed in for the small grid
  const [isInsideHouse, setIsInsideHouse] = useState(false);
  const [lastSleepTick, setLastSleepTick] = useState<number | null>(null);
  const [minutesSlept, setMinutesSlept] = useState(0);
  
  // XP & Leveling
  const [level, setLevel] = useState(() => {
    const saved = localStorage.getItem('warden_level');
    return saved ? JSON.parse(saved) : 1;
  });
  const [xp, setXp] = useState(() => {
    const saved = localStorage.getItem('warden_xp');
    return saved ? JSON.parse(saved) : 0;
  });
  const XP_TO_NEXT_LEVEL = level * 20;

  // Inventory
  const [inventory, setInventory] = useState<{[key: string]: number}>(() => {
    const saved = localStorage.getItem('warden_inventory');
    return saved ? JSON.parse(saved) : {
      wheat: 0,
      tomato: 0,
      pumpkin: 0,
      apple: 0,
      peach: 0,
      cherry: 0
    };
  });

  // Default Tree Cooldowns (Key: "c,r", Value: timestamp when ready)
  const [treeCooldowns, setTreeCooldowns] = useState<{[key: string]: number}>({});

  // NPCs State
  const [npcs, setNpcs] = useState<any[]>(() => {
    const saved = localStorage.getItem('warden_npcs');
    const parsed = saved ? JSON.parse(saved) : [];
    // Migration: ensure NPCs have x, y, isWalking, facing
    return parsed.map((n: any) => {
      if (n.x === undefined || n.y === undefined) {
        const worldPos = gridToWorldLocal(n.c, n.r);
        return { ...n, x: worldPos.x, y: worldPos.y, isWalking: false, facing: 'down' };
      }
      return n;
    });
  });

  const [removedDecorations, setRemovedDecorations] = useState<string[]>(() => {
    const saved = localStorage.getItem('warden_removed_decorations');
    return saved ? JSON.parse(saved) : [];
  });

  // 2. ALL USECALLBACK AFTER USESTATE
  
  // BFS Pathfinding Utility
  const findPath = useCallback((start: {c: number, r: number}, end: {c: number, r: number}, currentIslandMap: number[][]) => {
    if (start.c === end.c && start.r === end.r) return [];
    
    // Grid bounds
    const currentSize = islandMap.length;
    const gridLimit = currentSize;

    const queue: any[] = [[start]];
    const visited = new Set([`${start.c},${start.r}`]);

    // Get current buildings for collision
    const buildingPositions = new Set<string>();
    buildings.forEach(b => {
      const gridPos = b.growthState?.coordinates || worldToGrid(b.offset.x, b.offset.y, currentSize);
      getBuildingTiles(b.type, gridPos.c, gridPos.r).forEach(t => {
        buildingPositions.add(`${t.c},${t.r}`);
      });
    });

    while (queue.length > 0) {
      const path = queue.shift();
      const current = path[path.length - 1];

      if (current.c === end.c && current.r === end.r) {
        return path.slice(1); // Return path without start point
      }

      const neighbors = [
        { c: current.c, r: current.r - 1 },
        { c: current.c, r: current.r + 1 },
        { c: current.c - 1, r: current.r },
        { c: current.c + 1, r: current.r }
      ];

      for (const next of neighbors) {
        const key = `${next.c},${next.r}`;
        // Bounds check & Water check
        const isTerrainWalkable = next.c >= 0 && next.c < gridLimit && next.r >= 0 && next.r < gridLimit && 
                           (currentIslandMap[next.r][next.c] === TILE_TYPES.GRASS || currentIslandMap[next.r][next.c] === TILE_TYPES.SAND);
        
        // Building collision check (except for target tile)
        const isOccupied = buildingPositions.has(key) && !(next.c === end.c && next.r === end.r);

        if (isTerrainWalkable && !isOccupied && !visited.has(key)) {
          visited.add(key);
          queue.push([...path, next]);
        }
      }
    }
    return null; // No path found
  }, [buildings]);

  const moveAvatar = useCallback((dx: number, dy: number) => {
    if (isInsideHouse) return; // Cannot move while inside
    setAvatarPos((prev: any) => ({
      x: prev.x + dx,
      y: prev.y + dy
    }));
  }, [isInsideHouse]);

  const addWalkDistance = useCallback((meters: number) => {
    setTotalDistanceWalked((prev: number) => {
      const newTotal = prev + meters;
      const oldMilestone = Math.floor(prev / 100);
      const newMilestone = Math.floor(newTotal / 100);
      
      if (newMilestone > oldMilestone) {
        const reward = (newMilestone - oldMilestone) * 10;
        setResources((r: any) => ({ ...r, coins: (r.coins || 0) + reward }));
      }
      return newTotal;
    });
  }, []);

  const expandLand = useCallback((startC: number, startR: number) => {
    if ((resources.coins || 0) < expansionCost) return false;

    // Deduct cost
    setResources((prev: any) => ({ ...prev, coins: (prev.coins || 0) - expansionCost }));
    
    // Increase cost
    setExpansionCost(prev => prev + 250);

    // Award XP
    setXp(x => {
        const threshold = level * 20;
        const next = x + 40;
        if (next >= threshold) { setLevel(l => l + 1); return next - threshold; }
        return next;
    });

    setIslandMap(prevMap => {
      let currentSize = prevMap.length;
      let map = prevMap.map(row => [...row]);
      
      // 1. Zone 1: Identify 8 tiles to convert to GRASS (Blob Growth)
      const tilesToConvert: {c: number, r: number}[] = [{c: startC, r: startR}];
      const visited = new Set([`${startC},${startR}`]);
      const queue = [{c: startC, r: startR}];
      
      while (queue.length > 0 && tilesToConvert.length < 8) {
        const curr = queue.shift()!;
        const neighbors = [
          { c: curr.c + 1, r: curr.r }, { c: curr.c - 1, r: curr.r },
          { c: curr.c, r: curr.r + 1 }, { c: curr.c, r: curr.r - 1 }
        ];

        for (const n of neighbors) {
          if (n.c >= 0 && n.c < currentSize && n.r >= 0 && n.r < currentSize) {
             const key = `${n.c},${n.r}`;
             if (!visited.has(key)) {
               const type = map[n.r][n.c];
               if (type === TILE_TYPES.SAND || type === TILE_TYPES.WATER) {
                 visited.add(key);
                 tilesToConvert.push(n);
                 queue.push(n);
                 if (tilesToConvert.length >= 8) break;
               }
             }
          }
        }
      }

      // Convert to GRASS
      tilesToConvert.forEach(t => {
        if (t.r > 0) map[t.r][t.c] = TILE_TYPES.GRASS;
      });

      // 2. Zone 2: Dynamic Beach Generation: Only where Grass meets Water
      for (let r = 1; r < currentSize; r++) {
        for (let c = 0; c < currentSize; c++) {
          if (map[r][c] === TILE_TYPES.GRASS) {
            const neighbors = [
              { c: c + 1, r }, { c: c - 1, r },
              { c, r: r + 1 }, { c, r: r - 1 }
            ];
            neighbors.forEach(n => {
              if (n.c >= 0 && n.c < currentSize && n.r >= 0 && n.r < currentSize && map[n.r][n.c] === TILE_TYPES.WATER) {
                map[n.r][n.c] = TILE_TYPES.SAND;
              }
            });
          }
        }
      }

      // 3. Zone 3: The Deep Water Buffer (Dynamic Grid Growth)
      // Check if any Sand or Grass is within 5 tiles of the edge
      let needsGrowth = false;
      let growthDirection = { top: 0, bottom: 0, left: 0, right: 0 };

      for (let r = 0; r < currentSize; r++) {
        for (let c = 0; c < currentSize; c++) {
          if (map[r][c] === TILE_TYPES.GRASS || map[r][c] === TILE_TYPES.SAND) {
            if (r < 8) growthDirection.top = Math.max(growthDirection.top, 8 - r);
            if (r > currentSize - 9) growthDirection.bottom = Math.max(growthDirection.bottom, r - (currentSize - 9));
            if (c < 8) growthDirection.left = Math.max(growthDirection.left, 8 - c);
            if (c > currentSize - 9) growthDirection.right = Math.max(growthDirection.right, c - (currentSize - 9));
          }
        }
      }

      if (growthDirection.top > 0 || growthDirection.bottom > 0 || growthDirection.left > 0 || growthDirection.right > 0) {
        const newSizeH = currentSize + growthDirection.left + growthDirection.right;
        const newSizeV = currentSize + growthDirection.top + growthDirection.bottom;
        
        // We want to keep it square if possible, or just expand as needed
        const newSize = Math.max(newSizeH, newSizeV);
        const padTop = Math.floor((newSize - currentSize) / 2);
        const padLeft = Math.floor((newSize - currentSize) / 2);
        
        const newMap = Array(newSize).fill(0).map(() => Array(newSize).fill(TILE_TYPES.WATER));
        for (let r = 0; r < currentSize; r++) {
          for (let c = 0; c < currentSize; c++) {
            newMap[r + padTop][c + padLeft] = map[r][c];
          }
        }

        // Adjust Building and NPC offsets to keep them in place relative to the island
        setBuildings(prev => prev.map(b => ({
          ...b,
          offset: {
            x: b.offset.x - (padLeft * TILE_SIZE),
            y: b.offset.y - (padTop * TILE_SIZE)
          }
        })));

        setNpcs(prev => prev.map(n => ({
          ...n,
          c: n.c + padLeft,
          r: n.r + padTop,
          x: n.x, // We'll need to sync x/y later or just let them snap
          y: n.y
        })));
        
        map = newMap;
      }

      // Ensure first row is always water
      map[0] = Array(map.length).fill(TILE_TYPES.WATER);

      return map;
    });

    return true;
  }, [resources, expansionCost, level]);

  const spawnResourcesInArea = useCallback((centerPos: [number, number], radiusMeters: number, count: number) => {
    const types = ['wood', 'metal', 'coins'];
    const assetMap: any = {
      wood: '/images/tools-wood.png',
      metal: '/images/tools-iron.png',
      coins: '/images/tools-coins.png'
    };

    const newBatch: any[] = [];
    let attempts = 0;
    const centerPoint = turf.point(centerPos);

    while (newBatch.length < count && attempts < 20) {
      attempts++;
      const dist = Math.random() * radiusMeters / 1000;
      const bearing = Math.random() * 360;
      const destination = turf.destination(centerPoint, dist, bearing);
      const [lng, lat] = destination.geometry.coordinates;

      const isDuplicate = [...spawnedResources, ...newBatch, ...lastSpawnLocations].some((r: any) => 
        turf.distance(destination, turf.point([r.lng, r.lat]), { units: 'meters' }) < 20
      );

      if (!isDuplicate) {
        const type = types[Math.floor(Math.random() * types.length)];
        newBatch.push({ 
          id: `rsc-${Date.now()}-${newBatch.length}-${Math.random()}`, 
          type, lat, lng, icon: assetMap[type] 
        });
      }
    }

    if (newBatch.length > 0) {
      setSpawnedResources((prev: any[]) => [...prev, ...newBatch]);
      setLastSpawnLocations((prev: any[]) => [...newBatch.map(b => ({lat: b.lat, lng: b.lng})), ...prev].slice(0, 40));
    }
  }, [spawnedResources, lastSpawnLocations]);

  const addTerritory = useCallback((newPolygon: any, playerPos: [number, number]) => {
    setExploredTerritory((prev: any) => {
      if (!prev) {
        if (playerPos) spawnResourcesInArea(playerPos, 200, 5);
        return newPolygon;
      }
      
      try {
        const isNewArea = !turf.booleanContains(prev, newPolygon);
        if (isNewArea && playerPos) {
          spawnResourcesInArea(playerPos, 200, 2);
        }
        return turf.union(turf.featureCollection([prev, newPolygon]));
      } catch (e) {
        console.error("Union error", e);
        return prev;
      }
    });
  }, [spawnResourcesInArea]);

  const collectResource = useCallback((id: string, type: string, amount = 1) => {
    setSpawnedResources((prev: any[]) => prev.filter(r => r.id !== id));
    setResources((prev: any) => ({
      ...prev,
      [type]: (prev[type] || 0) + amount
    }));
  }, []);

  const interactWithBuilding = useCallback((id: string, action: string, data?: any, onHarvest?: (item: string, count: number) => void) => {
    // Handle Default Trees (Coordinate ID)
    if (id.startsWith('tree-')) {
      if (action === 'collect-default-wood') {
        const cooldown = treeCooldowns[id] || 0;
        if (Date.now() >= cooldown) {
          setResources(prev => ({ ...prev, wood: (prev.wood || 0) + 1 }));
          setTreeCooldowns(prev => ({ ...prev, [id]: Date.now() + 43200000 })); // 12 hours
          onHarvest?.('wood', 1);
        }
        return;
      }
      if (action === 'remove-decoration') {
        setRemovedDecorations(prev => [...prev, id]);
        return;
      }
    }

    if (action === 'leave-vacationer') {
      setNpcs(prev => {
        const hotelGuests = prev.filter(n => n.type === 'vacationer' && n.targetHotelId === id && n.status !== 'leaving');
        if (hotelGuests.length === 0) return prev;
        
        // Find the one that's been staying the longest (or just the first one in the list)
        const guestToLeave = hotelGuests[0];
        return prev.map(n => n.id === guestToLeave.id ? { ...n, status: 'leaving', path: [] } : n);
      });
      return;
    }

    setBuildings(prev => prev.map(b => {
      if (b.id !== id) return b;
      const gs = b.growthState;
      const now = Date.now();

      switch (action) {
        case 'select-produce':
          // Selection moves from level 1 to level 2
          return {
            ...b,
            growthState: {
              ...gs,
              produceType: data.produceType,
              lastProduceType: data.produceType, // Store for NPC replanting
              currentLevel: 2,
              startTime: now,
              lastUpdate: now
            }
          };
        case 'water':
          // Watering moves from level 3 to state that will become 4 in 2 min
          if (gs.currentLevel === 3 && Date.now() >= (gs.waterNeededAt || 0)) {
            // Award XP
            setXp(x => {
                const threshold = level * 20;
                const next = x + 5;
                if (next >= threshold) { setLevel(l => l + 1); return next - threshold; }
                return next;
            });
            
            return {
              ...b,
              growthState: {
                ...gs,
                isWatered: true,
                wateredAt: now,
                lastUpdate: now
              }
            };
          }
          break;
        case 'harvest':
          if (gs.currentLevel === 4) {
            // Award XP
            setXp(x => {
                const threshold = level * 20;
                const next = x + 10;
                if (next >= threshold) { setLevel(l => l + 1); return next - threshold; }
                return next;
            });
            // Add Inventory & Resources (User request: 50 of each)
            const produce = gs.produceType || (b.type === 'garden-tree' ? 'apple' : 'wheat');
            setInventory(inv => ({ ...inv, [produce]: (inv[produce] || 0) + 1 }));
            setResources(prev => ({
              ...prev,
              wood: (prev.wood || 0) + 50,
              metal: (prev.metal || 0) + 50,
              coins: (prev.coins || 0) + 50
            }));
            onHarvest?.(produce, 1);
            
            // Revert to level 3 for trees, level 1 for beds
            if (b.type === 'garden-tree') {
                return {
                  ...b,
                  growthState: {
                    ...gs,
                    currentLevel: 3,
                    isWatered: false,
                    waterNeededAt: now + 300000, // 5 min
                    lastUpdate: now
                  }
                };
            }

            // Revert to level 1 (empty state)
            return {
              ...b,
              growthState: {
                ...gs,
                produceType: null,
                currentLevel: 1,
                isWatered: false,
                startTime: now,
                lastUpdate: now
              }
            };
          }
          break;
        case 'clear':
          if (gs.currentLevel >= 2) {
            // Award XP for clearing dead plants
            if (gs.currentLevel === 5) {
                setXp(x => {
                    const threshold = level * 20;
                    const next = x + 20;
                    if (next >= threshold) { setLevel(l => l + 1); return next - threshold; }
                    return next;
                });
            }

            return {
              ...b,
              growthState: {
                ...gs,
                produceType: b.type === 'garden-tree' ? gs.produceType : null,
                currentLevel: 1,
                isWatered: false,
                startTime: now,
                lastUpdate: now
              }
            };
          }
          break;
        case 'invite-worker':
         return { ...b, hasWorkerRequested: true };
        case 'invite-vacationer':
         return { ...b, pendingVacationers: (b.pendingVacationers || 0) + 1 };
        case 'leave-worker':          // We handle NPC removal in the NPC useEffect
          return { ...b, hasWorkerRequested: false };
        case 'move':
          // Handled by UI state (entering placement mode)
          return b;
        case 'remove':
          return null;
        case 'sleep':
          setIsInsideHouse(true);
          setLastSleepTick(Date.now());
          setMinutesSlept(0);
          return b;
        case 'wake':
          setIsInsideHouse(false);
          setLastSleepTick(null);
          setMinutesSlept(0);
          return b;
      }
      return b;
    }).filter(Boolean));
  }, [setResources, setIsInsideHouse, level, treeCooldowns]);

  // NPC Behavior & Lifecycle
  useEffect(() => {
    const npcInterval = setInterval(() => {
      const now = Date.now();
      
      // 1. Spawning Logic
      setNpcs(prevNpcs => {
        let updatedNpcs = [...prevNpcs];
        let changed = false;
        const currentSize = islandMap.length;

        // Sync Workers with Mini-Houses
        const miniHouses = buildings.filter(b => b.type === 'mini-house');
        
        // Remove workers if mini-house no longer requests one
        updatedNpcs = updatedNpcs.filter(npc => {
          if (npc.type === 'worker') {
            const mh = miniHouses.find(h => h.id === npc.homeId);
            if (!mh || !mh.hasWorkerRequested) {
              changed = true;
              return false;
            }
          }
          return true;
        });

        miniHouses.forEach(mh => {
          const hasWorker = updatedNpcs.some(n => n.type === 'worker' && n.homeId === mh.id);
          // Only one worker per mini-house
          if (mh.hasWorkerRequested && !hasWorker) {
            const gridPos = worldToGrid(mh.offset.x, mh.offset.y, currentSize);
            const worldPos = gridToWorldLocal(gridPos.c, gridPos.r);
            updatedNpcs.push({
              id: `worker-${mh.id}`,
              type: 'worker',
              char: 'racoon',
              homeId: mh.id,
              c: gridPos.c,
              r: gridPos.r,
              x: worldPos.x,
              y: worldPos.y,
              targetC: gridPos.c,
              targetR: gridPos.r,
              path: [],
              status: 'idle',
              lastAction: now,
              isWalking: false,
              facing: 'down'
            });
            changed = true;
          }
        });

        // Invite Vacationers logic (Manual spawning)
        const hotels = buildings.filter(b => b.type === 'hotel');
        hotels.forEach(hotel => {
          if ((hotel.pendingVacationers || 0) > 0) {
            const currentGuests = updatedNpcs.filter(n => n.type === 'vacationer' && n.targetHotelId === hotel.id).length;
            if (currentGuests < 5) {
              // Spawn at random edge
              const edge = Math.floor(Math.random() * 4);
              let sc = 0, sr = 0;
              if (edge === 0) { sc = Math.floor(Math.random() * currentSize); sr = 0; }
              else if (edge === 1) { sc = Math.floor(Math.random() * currentSize); sr = currentSize - 1; }
              else if (edge === 2) { sc = 0; sr = Math.floor(Math.random() * currentSize); }
              else { sc = currentSize - 1; sr = Math.floor(Math.random() * currentSize); }

              const worldPos = gridToWorldLocal(sc, sr);
              updatedNpcs.push({
                id: `vac-${now}-${Math.random()}`,
                type: 'vacationer',
                char: 'fox',
                c: sc,
                r: sr,
                x: worldPos.x,
                y: worldPos.y,
                targetHotelId: hotel.id,
                status: 'arriving',
                path: [],
                stayUntil: now + (6 * 60 * 60 * 1000), // 6 hours max
                lastPayment: now,
                isWalking: false,
                facing: 'down'
              });

              // Decrement pending count in buildings state
              setBuildings(prev => prev.map(b => b.id === hotel.id ? { ...b, pendingVacationers: b.pendingVacationers - 1 } : b));
              changed = true;
            }
          }
        });

        // 2. Obstacle Map for NPCs (Buildings + Decorations)
        const buildingHitboxes = buildings.map(b => {
          if (!b.offset) return null;
          let w = 64, h = 64;
          if (b.type === 'garden-bed' || b.type === 'garden-tree' || b.type === 'shop') { w = 32; h = 32; }
          return { x: b.offset.x - w/2, y: b.offset.y - h/2, w, h };
        }).filter(Boolean);

        // Calculate current decorations for collision
        const decorationHitboxes: any[] = [];
        for (let r = 0; r < currentSize; r++) {
          for (let c = 0; c < currentSize; c++) {
            if (islandMap[r][c] === TILE_TYPES.GRASS) {
              const rand = Math.sin(r * 12.9898 + c * 78.233) * 43758.5453 % 1;
              if (Math.abs(rand) < 0.15) {
                const id = `tree-${c}-${r}`;
                if (!removedDecorations.includes(id)) {
                  const worldPos = gridToWorldLocal(c, r);
                  const subX = (rand * 8); 
                  const subY = (Math.cos(r * 10) * 8); 
                  decorationHitboxes.push({ x: worldPos.x + subX - 5, y: worldPos.y + subY - 5, w: 10, h: 10 });
                }
              }
            }
          }
        }

        const allHitboxes = [...buildingHitboxes, ...decorationHitboxes];

        // 3. Movement & Task Logic
        updatedNpcs = updatedNpcs.map(npc => {
          let nextNpc = { ...npc };
          
          // Smooth Movement
          if (npc.path && npc.path.length > 0) {
            const targetTile = npc.path[0];
            const targetPos = gridToWorldLocal(targetTile.c, targetTile.r);
            const dx = targetPos.x - npc.x;
            const dy = targetPos.y - npc.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            if (dist < 2) {
              nextNpc.x = targetPos.x;
              nextNpc.y = targetPos.y;
              nextNpc.c = targetTile.c;
              nextNpc.r = targetTile.r;
              nextNpc.path = npc.path.slice(1);
              nextNpc.isWalking = nextNpc.path.length > 0;
            } else {
              const speed = 1.2;
              const vx = (dx / dist) * speed;
              const vy = (dy / dist) * speed;
              
              const nextX = npc.x + vx;
              const nextY = npc.y + vy;
              
              const isTargetBuilding = buildings.some(b => {
                const bGrid = worldToGridLocal(b.offset.x, b.offset.y);
                const isNpcTarget = nextNpc.targetId === b.id;
                return (bGrid.c === targetTile.c && bGrid.r === targetTile.r) || isNpcTarget;
              });

              let blocked = false;
              if (!isTargetBuilding) {
                blocked = allHitboxes.some(h => 
                  nextX + 6 > h.x && nextX - 6 < h.x + h.w &&
                  nextY + 6 > h.y && nextY - 6 < h.y + h.h
                );
              }

              if (!blocked) {
                nextNpc.x = nextX;
                nextNpc.y = nextY;
                nextNpc.isWalking = true;
                if (Math.abs(dx) > Math.abs(dy)) {
                  nextNpc.facing = dx > 0 ? 'right' : 'left';
                } else {
                  nextNpc.facing = dy > 0 ? 'down' : 'up';
                }
              } else {
                nextNpc.isWalking = false;
              }
            }
          } else {
            nextNpc.isWalking = false;
          }

          if (nextNpc.type === 'worker') {
            const home = buildings.find(b => b.id === nextNpc.homeId);
            const homeGrid = home ? worldToGrid(home.offset.x, home.offset.y, currentSize) : null;

            if (nextNpc.status === 'idle') {
               // Look for work: Water, Harvest, or Replant
               const targets = buildings.filter(b => {
                 if (!b.growthState) return false;
                 const gs = b.growthState;
                 const needsWater = gs.currentLevel === 3 && !gs.isWatered && Date.now() >= (gs.waterNeededAt || 0);
                 const readyToHarvest = gs.currentLevel === 4;
                 const dead = gs.currentLevel === 5;
                 const needsReplant = gs.currentLevel === 1 && gs.lastProduceType;
                 return needsWater || readyToHarvest || dead || needsReplant;
               });

               if (targets.length > 0) {
                 const target = targets[0];
                 const targetGrid = target.growthState.coordinates;
                 const path = findPath({c: nextNpc.c, r: nextNpc.r}, {c: targetGrid.x, r: targetGrid.y}, islandMap);
                 if (path) {
                    return { ...nextNpc, status: 'moving_to_work', targetId: target.id, path: path.slice(0, -1) };
                 }
               } else if (homeGrid && (nextNpc.c !== homeGrid.c || nextNpc.r !== homeGrid.r) && nextNpc.path.length === 0) {
                 const path = findPath({c: nextNpc.c, r: nextNpc.r}, homeGrid, islandMap);
                 if (path) return { ...nextNpc, path };
               }
            } else if (nextNpc.status === 'moving_to_work' && nextNpc.path.length === 0) {
               return { ...nextNpc, status: 'working', lastAction: now };
            } else if (nextNpc.status === 'working' && now - nextNpc.lastAction > 3000) {
               const target = buildings.find(b => b.id === nextNpc.targetId);
               if (target && target.growthState) {
                  const gs = target.growthState;
                  if (gs.currentLevel === 3) interactWithBuilding(target.id, 'water');
                  else if (gs.currentLevel === 4) interactWithBuilding(target.id, 'harvest');
                  else if (gs.currentLevel === 5) interactWithBuilding(target.id, 'clear');
                  else if (gs.currentLevel === 1 && gs.lastProduceType) {
                    interactWithBuilding(target.id, 'select-produce', { produceType: gs.lastProduceType });
                  }
               }
               return { ...nextNpc, status: 'idle', targetId: null };
            }
          }

          if (nextNpc.type === 'vacationer') {
            if (nextNpc.status === 'arriving') {
              const hotel = buildings.find(b => b.id === nextNpc.targetHotelId);
              if (hotel) {
                const hotelGrid = { c: Math.floor((hotel.offset.x + (currentSize * 32) / 2 + 16) / 32), r: Math.floor((hotel.offset.y + (currentSize * 32) / 2 + 16) / 32) };
                if (nextNpc.c === hotelGrid.c && nextNpc.r === hotelGrid.r) {
                  return { ...nextNpc, status: 'staying', lastAction: now };
                } else if (nextNpc.path.length === 0) {
                  const path = findPath({c: nextNpc.c, r: nextNpc.r}, hotelGrid, islandMap);
                  if (path) return { ...nextNpc, path };
                }
              } else {
                 return { ...nextNpc, status: 'leaving', path: [] };
              }
            } else if (nextNpc.status === 'staying') {
              if (now >= nextNpc.stayUntil) {
                return { ...nextNpc, status: 'leaving', path: [] };
              }
              if (now - nextNpc.lastPayment >= 60000) {
                setResources(r => ({ ...r, coins: (r.coins || 0) + 50 }));
                return { ...nextNpc, lastPayment: now };
              }

              // Sightseeing Movement
              if (nextNpc.path.length === 0 && now - (nextNpc.lastAction || 0) > 5000 + Math.random() * 10000) {
                // Pick a random grass tile to visit
                const grassTiles: {c: number, r: number}[] = [];
                for (let r = 0; r < currentSize; r++) {
                  for (let c = 0; c < currentSize; c++) {
                    if (islandMap[r][c] === TILE_TYPES.GRASS) grassTiles.push({c, r});
                  }
                }
                if (grassTiles.length > 0) {
                  const target = grassTiles[Math.floor(Math.random() * grassTiles.length)];
                  const path = findPath({c: nextNpc.c, r: nextNpc.r}, target, islandMap);
                  if (path) return { ...nextNpc, path, lastAction: now };
                }
              }
            } else if (nextNpc.status === 'leaving') {
               if (nextNpc.path.length === 0) {
                 const edge = { c: 0, r: 0 };
                 const path = findPath({c: nextNpc.c, r: nextNpc.r}, edge, islandMap);
                 if (path) return { ...nextNpc, path };
                 else return null;
               } else if (nextNpc.path.length === 0 && (nextNpc.c === 0 && nextNpc.r === 0)) {
                 return null;
               }
            }
          }

          return nextNpc;
        }).filter(Boolean);

        return changed || JSON.stringify(updatedNpcs) !== JSON.stringify(prevNpcs) ? updatedNpcs : prevNpcs;
      });
    }, 50); // Fast interval for smooth movement

    return () => clearInterval(npcInterval);
  }, [buildings, islandMap, findPath, interactWithBuilding]);

  // Handle Accelerated Time (Sleeping)
  useEffect(() => {
    if (!isInsideHouse || !lastSleepTick) return;

    const interval = setInterval(() => {
      const now = Date.now();
      const bonusTime = 60000; // 1 real second = 1 minute (60,000ms) bonus growth
      
      setMinutesSlept(prev => prev + 1);

      setBuildings(prev => prev.map(b => {
        if ((b.type === 'garden-bed' || b.type === 'garden-tree') && b.growthState) {
          const gs = b.growthState;
          if (gs.currentLevel === 5 || !gs.produceType) return b;
          
          // Advance startTime so it grows faster
          // We move the startTime backwards so Date.now() - gs.startTime is larger
          return {
            ...b,
            growthState: {
              ...gs,
              startTime: gs.startTime - bonusTime,
              // Also adjust wateredAt and harvestReadyAt if they exist
              wateredAt: gs.wateredAt ? gs.wateredAt - bonusTime : gs.wateredAt,
              harvestReadyAt: gs.harvestReadyAt ? gs.harvestReadyAt - bonusTime : gs.harvestReadyAt,
              waterNeededAt: gs.waterNeededAt ? gs.waterNeededAt - bonusTime : gs.waterNeededAt,
              lastUpdate: now
            }
          };
        }
        return b;
      }));

      // Accelerate wood regeneration on default trees/bushes
      setTreeCooldowns(prev => {
        const next = { ...prev };
        let changed = false;
        Object.keys(next).forEach(key => {
          if (next[key] > now) {
            next[key] -= bonusTime;
            changed = true;
          }
        });
        return changed ? next : prev;
      });

      setLastSleepTick(now);
    }, 1000); // Check every second for bonus growth

    return () => clearInterval(interval);
  }, [isInsideHouse, lastSleepTick]);

  const addBuilding = useCallback((type: string, cost: any, position: any = null) => {
    // Level Checks removed to allow building at any level as per user request
    
    const canAfford = Object.entries(cost).every(([res, amount]: [string, any]) => (resources[res] || 0) >= amount);
    if (!canAfford) return null;

    const newId = `building-${Date.now()}`;

    // Award XP for construction
    setXp(x => {
        const threshold = level * 20;
        const next = x + 50;
        if (next >= threshold) { setLevel(l => l + 1); return next - threshold; }
        return next;
    });

    // Deduct resources
    setResources((prev: any) => {
      const nextResources = { ...prev };
      Object.entries(cost).forEach(([res, amount]: [string, any]) => {
        nextResources[res] -= amount;
      });
      return nextResources;
    });

    setBuildings((prevBuildings: any[]) => {
      const offset = position || { 
        x: (Math.random() - 0.5) * 300, 
        y: (Math.random() - 0.5) * 300 
      };
      
      const newBuilding: any = { id: newId, type, offset };
      
      if (type === 'garden-bed' || type === 'garden-tree') {
        const currentSize = islandMap.length;
        const gridPos = worldToGrid(offset.x, offset.y, currentSize);
        
        newBuilding.growthState = {
          id: newId,
          coordinates: { x: gridPos.c, y: gridPos.r },
          produceType: null,
          currentLevel: 1,
          startTime: Date.now(),
          lastUpdate: Date.now(),
          isWatered: false
        };
      }
      
      return [...prevBuildings, newBuilding];
    });

    return newId;
  }, [resources, setResources, setBuildings, level]);

  // 3. ALL USEEFFECT AT THE BOTTOM
  // Persistence
  useEffect(() => {
    localStorage.setItem('warden_buildings', JSON.stringify(buildings));
  }, [buildings]);

  useEffect(() => {
    localStorage.setItem('warden_resources', JSON.stringify(resources));
  }, [resources]);

  useEffect(() => {
    localStorage.setItem('warden_inventory', JSON.stringify(inventory));
  }, [inventory]);

  useEffect(() => {
    localStorage.setItem('warden_level', JSON.stringify(level));
  }, [level]);

  useEffect(() => {
    localStorage.setItem('warden_xp', JSON.stringify(xp));
  }, [xp]);

  useEffect(() => {
    localStorage.setItem('warden_distance', JSON.stringify(totalDistanceWalked));
  }, [totalDistanceWalked]);

  useEffect(() => {
    localStorage.setItem('warden_territory', JSON.stringify(exploredTerritory));
  }, [exploredTerritory]);

  useEffect(() => {
    localStorage.setItem('warden_map', JSON.stringify(islandMap));
  }, [islandMap]);

  useEffect(() => {
    localStorage.setItem('warden_expansion_cost', JSON.stringify(expansionCost));
  }, [expansionCost]);

  useEffect(() => {
    localStorage.setItem('warden_npcs', JSON.stringify(npcs));
  }, [npcs]);

  useEffect(() => {
    localStorage.setItem('warden_removed_decorations', JSON.stringify(removedDecorations));
  }, [removedDecorations]);

  useEffect(() => {
    const interval = setInterval(() => {
      setBuildings(prev => {
        let changed = false;
        const now = Date.now();
        const next = prev.map(b => {
          if ((b.type === 'garden-bed' || b.type === 'garden-tree') && b.growthState) {
            const gs = b.growthState;
            if (gs.currentLevel === 5 || !gs.produceType) return b;

            const elapsedTime = now - gs.startTime;
            
            // 1. Automatic Growth (2 -> 3) in 5 min
            if (gs.currentLevel === 2) {
              const nextLevel = elapsedTime > 300000 ? 3 : 2;
              if (nextLevel !== gs.currentLevel) {
                changed = true;
                const update: any = { ...gs, currentLevel: nextLevel, lastUpdate: now, waterNeededAt: now };
                return { ...b, growthState: update };
              }
            }

            // 2. Growth from Water (3 -> 4) in 2 min
            if (gs.currentLevel === 3 && gs.isWatered && gs.wateredAt) {
               if (now - gs.wateredAt > 120000) {
                 changed = true;
                 return { ...b, growthState: { ...gs, currentLevel: 4, harvestReadyAt: now, lastUpdate: now } };
               }
            }

            // 3. Death Timer at Stage 3 (Watering Gate)
            if (gs.currentLevel === 3 && gs.waterNeededAt && !gs.isWatered) {
              if (now - gs.waterNeededAt > 86400000) { // 24 hours
                changed = true;
                return { ...b, growthState: { ...gs, currentLevel: 5, lastUpdate: now } };
              }
            }

            // 4. Death Timer at Stage 4 (Harvest Window)
            if (gs.currentLevel === 4 && gs.harvestReadyAt) {
              if (now - gs.harvestReadyAt > 86400000) { // 24 hours
                changed = true;
                return { ...b, growthState: { ...gs, currentLevel: 5, lastUpdate: now } };
              }
            }
          }
          return b;
        });
        return changed ? next : prev;
      });
    }, 10000); 
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!exploredTerritory || spawnedResources.length >= 50) return;
    const needed = 10 - spawnedResources.length;
    if (needed <= 0) return;
  }, [exploredTerritory, spawnedResources.length]);

  const resetGame = useCallback(() => {
    // Nuclear clear for all warden_ keys
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith('warden_')) {
        localStorage.removeItem(key);
      }
    });
    
    setBuildings([]);
    setLevel(1);
    setXp(0);
    setResources({
      wood: 50,
      metal: 20,
      coins: 100
    });
    setInventory({
      wheat: 0,
      tomato: 0,
      pumpkin: 0,
      apple: 0,
      peach: 0,
      cherry: 0
    });
    setExploredTerritory(null);
    setSpawnedResources([]);
    setTotalDistanceWalked(0);
    setAvatarPos({ x: 0, y: 0 });
    setRemovedDecorations([]);
    setIslandMap(generateIslandMap(INITIAL_GRID_SIZE));
    setExpansionCost(500);
    setNpcs([]);
    setTreeCooldowns({});
  }, []);

  return {
    resources,
    setResources,
    exploredTerritory,
    addTerritory,
    spawnedResources,
    setSpawnedResources,
    collectResource,
    buildings,
    setBuildings,
    addBuilding,
    totalDistanceWalked,
    addWalkDistance,
    avatarPos,
    moveAvatar,
    villageZoom,
    setVillageZoom,
    isInsideHouse,
    setIsInsideHouse,
    minutesSlept,
    interactWithBuilding,
    resetGame,
    level,
    xp,
    XP_TO_NEXT_LEVEL,
    inventory,
    setInventory,
    treeCooldowns,
    islandMap,
    expandLand,
    expansionCost,
    npcs,
    removedDecorations
  };
};

