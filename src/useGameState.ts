import { useState, useCallback, useEffect } from 'react';
import * as turf from '@turf/turf';
import { generateIslandMap, TILE_TYPES, GRID_SIZE, INITIAL_GRID_SIZE, TILE_SIZE, getBuildingTiles, gridToWorldBuilding, gridToWorld, worldToGrid } from './MapConstants';

export const useGameState = () => {
  // --- 1. STATE ---
  const [islandMap, setIslandMap] = useState<number[][]>(() => {
    const saved = localStorage.getItem('warden_map');
    const map = saved ? JSON.parse(saved) : generateIslandMap(INITIAL_GRID_SIZE);
    return map;
  });

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

  const [avatarPos, setAvatarPos] = useState({ x: 16, y: 32 }); // Base position (feet) at bottom of tile 12,12
  const [villageZoom, setVillageZoom] = useState(2.5); // Zoomed in for the small grid
  const [isInsideHouse, setIsInsideHouse] = useState(false);
  const [lastSleepTick, setLastSleepTick] = useState<number | null>(null);
  const [minutesSlept, setMinutesSlept] = useState(0);
  
  const [level, setLevel] = useState(() => {
    const saved = localStorage.getItem('warden_level');
    return saved ? JSON.parse(saved) : 1;
  });

  const [xp, setXp] = useState(() => {
    const saved = localStorage.getItem('warden_xp');
    return saved ? JSON.parse(saved) : 0;
  });

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

  const [treeCooldowns, setTreeCooldowns] = useState<{[key: string]: number}>({});

  const [npcs, setNpcs] = useState<any[]>(() => {
    const saved = localStorage.getItem('warden_npcs');
    const parsed = saved ? JSON.parse(saved) : [];
    return parsed;
  });

  const [catType, setCatType] = useState(() => {
    const saved = localStorage.getItem('warden_cat_type');
    return saved || 'grey-cat';
  });

  const [removedDecorations, setRemovedDecorations] = useState<string[]>(() => {
    const saved = localStorage.getItem('warden_removed_decorations');
    return saved ? JSON.parse(saved) : [];
  });

  const XP_TO_NEXT_LEVEL = level * 20;

  // --- 2. CALLBACKS (HELPERS) ---
  const gridToWorldLocal = useCallback((c: number, r: number) => gridToWorld(c, r, islandMap.length), [islandMap.length]);
  const worldToGridLocal = useCallback((x: number, y: number) => worldToGrid(x, y, islandMap.length), [islandMap.length]);

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
  }, [buildings, islandMap.length]);

  const moveAvatar = useCallback((dx: number, dy: number) => {
    if (isInsideHouse) return;
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

      const queue = [{ c: startC, r: startR, dist: 0 }];
      const visited = new Set([`${startC},${startR}`]);
      const maxDist = 3;

      while (queue.length > 0) {
        const { c, r, dist } = queue.shift()!;
        
        if (map[r] && map[r][c] !== undefined) {
          if (dist < maxDist - 1) map[r][c] = TILE_TYPES.GRASS;
          else if (dist < maxDist) map[r][c] = TILE_TYPES.SAND;
        }

        if (dist < maxDist) {
          const neighbors = [
            { c: c, r: r - 1 }, { c: c, r: r + 1 },
            { c: c - 1, r: r }, { c: c + 1, r: r }
          ];
          for (const n of neighbors) {
            const key = `${n.c},${n.r}`;
            if (!visited.has(key)) {
              visited.add(key);
              queue.push({ ...n, dist: dist + 1 });
            }
          }
        }
      }
      return map;
    });
    return true;
  }, [resources.coins, expansionCost, level]);

  const addBuilding = useCallback((type: string, cost: any, position?: { x: number, y: number }) => {
    // Deduct resources
    setResources((prev: any) => {
      const next = { ...prev };
      Object.keys(cost).forEach(res => {
        next[res] = (next[res] || 0) - cost[res];
      });
      return next;
    });

    const newId = `${type}-${Date.now()}`;
    
    // Award XP
    setXp(x => {
        const threshold = level * 20;
        const next = x + 20;
        if (next >= threshold) { setLevel(l => l + 1); return next - threshold; }
        return next;
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
  }, [resources, setResources, setBuildings, level, islandMap.length]);

  const interactWithBuilding = useCallback((id: string, action: string, data?: any, onHarvest?: any) => {
    setBuildings(prev => prev.map(b => {
      if (b.id !== id) return b;
      
      const now = Date.now();
      const gs = b.growthState;

      switch (action) {
        case 'remove-decoration':
          setRemovedDecorations(prev => [...prev, id]);
          return b;
        case 'select-produce':
          return {
            ...b,
            growthState: {
              ...gs,
              produceType: data.produceType,
              lastProduceType: data.produceType,
              currentLevel: 1,
              startTime: now,
              lastUpdate: now,
              isWatered: true // Auto-watered on plant
            }
          };
        case 'water':
          return { ...b, growthState: { ...gs, isWatered: true, lastUpdate: now } };
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

  const addTerritory = useCallback((circle: any, pos: any) => {
    // This is for the map view, logic not provided but kept for API compatibility
  }, []);

  const collectResource = useCallback((id: string, type: string, amount: number = 10) => {
    setSpawnedResources(prev => prev.filter((r: any) => r.id !== id));
    setResources((prev: any) => ({
      ...prev,
      [type]: (prev[type] || 0) + amount,
      coins: (prev.coins || 0) + 5
    }));
  }, []);

  const resetGame = useCallback((newCatType?: string) => {
    // Nuclear clear for all warden_ keys
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith('warden_')) {
        localStorage.removeItem(key);
      }
    });

    if (newCatType) {
       setCatType(newCatType);
       localStorage.setItem('warden_cat_type', newCatType);
    }

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
    setAvatarPos({ x: 16, y: 32 });
    setRemovedDecorations([]);
    setIslandMap(generateIslandMap(INITIAL_GRID_SIZE));
    setExpansionCost(500);
    setNpcs([]);
    setTreeCooldowns({});
  }, []);

  // --- 3. EFFECTS ---

  // Persistence Effects
  useEffect(() => {
    localStorage.setItem('warden_map', JSON.stringify(islandMap));
  }, [islandMap]);

  useEffect(() => {
    localStorage.setItem('warden_expansion_cost', expansionCost.toString());
  }, [expansionCost]);

  useEffect(() => {
    localStorage.setItem('warden_resources', JSON.stringify(resources));
  }, [resources]);

  useEffect(() => {
    localStorage.setItem('warden_buildings', JSON.stringify(buildings));
  }, [buildings]);

  useEffect(() => {
    localStorage.setItem('warden_inventory', JSON.stringify(inventory));
  }, [inventory]);

  useEffect(() => {
    localStorage.setItem('warden_level', level.toString());
  }, [level]);

  useEffect(() => {
    localStorage.setItem('warden_xp', xp.toString());
  }, [xp]);

  useEffect(() => {
    localStorage.setItem('warden_cat_type', catType);
  }, [catType]);

  useEffect(() => {
    localStorage.setItem('warden_removed_decorations', JSON.stringify(removedDecorations));
  }, [removedDecorations]);

  useEffect(() => {
    localStorage.setItem('warden_distance', totalDistanceWalked.toString());
  }, [totalDistanceWalked]);

  useEffect(() => {
    localStorage.setItem('warden_npcs', JSON.stringify(npcs));
  }, [npcs]);

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
              y: worldPos.y + 16,
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
                y: worldPos.y + 16,
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
            const dy = (targetPos.y + 16) - npc.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < 2) {
              nextNpc.x = targetPos.x;
              nextNpc.y = targetPos.y + 16;
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
                const hotelGrid = worldToGrid(hotel.offset.x, hotel.offset.y, currentSize);
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
          return { ...b, growthState: { ...gs, startTime: gs.startTime - bonusTime } };
        }
        return b;
      }));
    }, 1000);

    return () => clearInterval(interval);
  }, [isInsideHouse, lastSleepTick]);

  // Regular Growth Update
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setBuildings(prev => {
        let changed = false;
        const next = prev.map(b => {
          if ((b.type === 'garden-bed' || b.type === 'garden-tree') && b.growthState) {
            const gs = b.growthState;
            if (!gs.produceType || gs.currentLevel === 5) return b;

            // Simple time-based growth (every 10s check)
            const elapsed = now - gs.startTime;
            const growthInterval = 30000; // 30s per level
            let targetLevel = Math.min(4, Math.floor(elapsed / growthInterval) + 1);

            // Water requirement for level 4
            if (targetLevel === 4 && !gs.isWatered) targetLevel = 3;

            if (targetLevel !== gs.currentLevel) {
              changed = true;
              const updates: any = { currentLevel: targetLevel, lastUpdate: now };
              if (targetLevel === 4) updates.harvestReadyAt = now;
              return { ...b, growthState: { ...gs, ...updates } };
            }

            // Check for death (level 5) after 24h of being ready to harvest
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
    removedDecorations,
    catType,
    setCatType
  };
};
