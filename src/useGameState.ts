import { useState, useCallback, useEffect } from 'react';
import * as turf from '@turf/turf';
import { generateIslandMap, TILE_TYPES, GRID_SIZE } from './MapConstants';

export const useGameState = () => {
  // 1. ALL USESTATE AT THE TOP
  const [islandMap, setIslandMap] = useState<number[][]>(() => {
    const saved = localStorage.getItem('warden_map');
    return saved ? JSON.parse(saved) : generateIslandMap();
  });
  const [expansionCost, setExpansionCost] = useState(() => {
    const saved = localStorage.getItem('warden_expansion_cost');
    return saved ? parseInt(saved) : 500;
  });

  const [resources, setResources] = useState(() => {
    const saved = localStorage.getItem('warden_resources');
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
    return saved ? JSON.parse(saved) : [];
  });

  // 2. ALL USECALLBACK AFTER USESTATE
  
  // BFS Pathfinding Utility
  const findPath = useCallback((start: {c: number, r: number}, end: {c: number, r: number}, currentIslandMap: number[][]) => {
    if (start.c === end.c && start.r === end.r) return [];
    
    // Grid bounds
    const gridLimit = GRID_SIZE;

    const queue: any[] = [[start]];
    const visited = new Set([`${start.c},${start.r}`]);

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
        const isWalkable = next.c >= 0 && next.c < gridLimit && next.r >= 0 && next.r < gridLimit && 
                           (currentIslandMap[next.r][next.c] === TILE_TYPES.GRASS || currentIslandMap[next.r][next.c] === TILE_TYPES.SAND);
        
        if (isWalkable && !visited.has(key)) {
          visited.add(key);
          queue.push([...path, next]);
        }
      }
    }
    return null; // No path found
  }, []);

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
      const newMap = prevMap.map(row => [...row]);
      
      // 1. Identify 8 tiles to convert to GRASS (Blob Growth)
      // Start with clicked tile
      const tilesToConvert: {c: number, r: number}[] = [{c: startC, r: startR}];
      const visited = new Set([`${startC},${startR}`]);
      
      // Simple BFS to find 7 more neighbors (SAND or WATER)
      const queue = [{c: startC, r: startR}];
      
      while (queue.length > 0 && tilesToConvert.length < 8) {
        const curr = queue.shift()!;
        const neighbors = [
          { c: curr.c + 1, r: curr.r }, { c: curr.c - 1, r: curr.r },
          { c: curr.c, r: curr.r + 1 }, { c: curr.c, r: curr.r - 1 }
        ];

        for (const n of neighbors) {
          if (n.c >= 0 && n.c < GRID_SIZE && n.r >= 0 && n.r < GRID_SIZE) {
             const key = `${n.c},${n.r}`;
             if (!visited.has(key)) {
               // Prefer SAND then WATER, or just any valid expansion target
               const type = newMap[n.r][n.c];
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

      // Connectivity Check (Simplified: We assume expansion from existing land is connected)
      // Convert to GRASS
      tilesToConvert.forEach(t => {
        newMap[t.r][t.c] = TILE_TYPES.GRASS;
      });

      // 2. Dynamic Beach Generation
      // For every new grass tile touching water, convert 0-3 adjacent water to SAND
      tilesToConvert.forEach(t => {
        const neighbors = [
          { c: t.c + 1, r: t.r }, { c: t.c - 1, r: t.r },
          { c: t.c, r: t.r + 1 }, { c: t.c, r: t.r - 1 }
        ];
        
        // Find adjacent water tiles
        const waterNeighbors = neighbors.filter(n => 
          n.c >= 0 && n.c < GRID_SIZE && n.r >= 0 && n.r < GRID_SIZE && 
          newMap[n.r][n.c] === TILE_TYPES.WATER
        );

        if (waterNeighbors.length > 0) {
           // Convert 0 to 3 of them to SAND
           const count = Math.floor(Math.random() * 4); // 0, 1, 2, or 3
           // Shuffle to pick random ones
           const shuffled = waterNeighbors.sort(() => 0.5 - Math.random());
           
           for (let i = 0; i < Math.min(count, shuffled.length); i++) {
             const n = shuffled[i];
             // Ensure we only convert WATER to SAND on the "outside"
             // This is naturally handled by only selecting WATER neighbors
             newMap[n.r][n.c] = TILE_TYPES.SAND;
           }
        }
      });

      return newMap;
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
    if (id.startsWith('tree-') && action === 'collect-default-wood') {
      const cooldown = treeCooldowns[id] || 0;
      if (Date.now() >= cooldown) {
        setResources(prev => ({ ...prev, wood: (prev.wood || 0) + 1 }));
        setTreeCooldowns(prev => ({ ...prev, [id]: Date.now() + 43200000 })); // 12 hours
        onHarvest?.('wood', 1);
      }
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
            // Add Inventory
            const produce = gs.produceType || (b.type === 'garden-tree' ? 'apple' : 'wheat');
            setInventory(inv => ({ ...inv, [produce]: (inv[produce] || 0) + 1 }));
            onHarvest?.(produce, 1);
            
            setResources((r: any) => ({ ...r, coins: r.coins + 20 }));
            
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

        // Sync Workers with Mini-Houses
        const miniHouses = buildings.filter(b => b.type === 'mini-house');
        miniHouses.forEach(mh => {
          const hasWorker = updatedNpcs.some(n => n.type === 'worker' && n.homeId === mh.id);
          if (!hasWorker) {
            const gridX = Math.floor((mh.offset.x + (GRID_SIZE * 32) / 2) / 32);
            const gridY = Math.floor((mh.offset.y + (GRID_SIZE * 32) / 2) / 32);
            updatedNpcs.push({
              id: `worker-${mh.id}`,
              type: 'worker',
              char: 'racoon',
              homeId: mh.id,
              c: gridX,
              r: gridY,
              targetC: gridX,
              targetR: gridY,
              path: [],
              status: 'idle',
              lastAction: now
            });
            changed = true;
          }
        });

        // Spawn Vacationers (every 2-5 mins)
        const lastVacSpawn = (window as any).lastVacSpawn || 0;
        const hotels = buildings.filter(b => b.type === 'hotel');
        if (now - lastVacSpawn > (2 + Math.random() * 3) * 60000 && hotels.length > 0) {
          const availableHotel = hotels.find(h => !updatedNpcs.some(n => n.targetHotelId === h.id));
          if (availableHotel) {
            (window as any).lastVacSpawn = now;
            // Spawn at random edge
            const edge = Math.floor(Math.random() * 4);
            let sc = 0, sr = 0;
            if (edge === 0) { sc = Math.floor(Math.random() * GRID_SIZE); sr = 0; }
            else if (edge === 1) { sc = Math.floor(Math.random() * GRID_SIZE); sr = GRID_SIZE - 1; }
            else if (edge === 2) { sc = 0; sr = Math.floor(Math.random() * GRID_SIZE); }
            else { sc = GRID_SIZE - 1; sr = Math.floor(Math.random() * GRID_SIZE); }

            updatedNpcs.push({
              id: `vac-${now}`,
              type: 'vacationer',
              char: 'fox',
              c: sc,
              r: sr,
              targetHotelId: availableHotel.id,
              status: 'arriving',
              path: [],
              stayUntil: now + (3 + Math.random() * 7) * 60000,
              lastPayment: now
            });
            changed = true;
          }
        }

        // 2. Movement & Task Logic
        updatedNpcs = updatedNpcs.map(npc => {
          // Movement step (1 tile per 0.5s)
          if (now - (npc.lastMove || 0) > 500) {
            if (npc.path && npc.path.length > 0) {
              const next = npc.path[0];
              return { ...npc, c: next.c, r: next.r, path: npc.path.slice(1), lastMove: now, facing: next.c > npc.c ? 'right' : next.c < npc.c ? 'left' : next.r > npc.r ? 'down' : 'up' };
            }
          }

          if (npc.type === 'worker') {
            const home = buildings.find(b => b.id === npc.homeId);
            const homeGrid = home ? { c: Math.floor((home.offset.x + (GRID_SIZE * 32) / 2) / 32), r: Math.floor((home.offset.y + (GRID_SIZE * 32) / 2) / 32) } : null;

            if (npc.status === 'idle') {
               // Look for work
               const targets = buildings.filter(b => b.growthState && (b.growthState.currentLevel === 3 && !b.growthState.isWatered && Date.now() >= (b.growthState.waterNeededAt || 0) || b.growthState.currentLevel === 4 || b.growthState.currentLevel === 5));
               if (targets.length > 0) {
                 const target = targets[0];
                 const targetGrid = target.growthState.coordinates;
                 // Path to neighbor of target
                 const path = findPath({c: npc.c, r: npc.r}, {c: targetGrid.x, r: targetGrid.y}, islandMap);
                 if (path) {
                    return { ...npc, status: 'moving_to_work', targetId: target.id, path: path.slice(0, -1) };
                 }
               } else if (homeGrid && (npc.c !== homeGrid.c || npc.r !== homeGrid.r) && npc.path.length === 0) {
                 const path = findPath({c: npc.c, r: npc.r}, homeGrid, islandMap);
                 if (path) return { ...npc, path };
               }
            } else if (npc.status === 'moving_to_work' && npc.path.length === 0) {
               return { ...npc, status: 'working', lastAction: now };
            } else if (npc.status === 'working' && now - npc.lastAction > 3000) {
               const target = buildings.find(b => b.id === npc.targetId);
               if (target && target.growthState) {
                  if (target.growthState.currentLevel === 3) interactWithBuilding(target.id, 'water');
                  else if (target.growthState.currentLevel === 4) interactWithBuilding(target.id, 'harvest');
                  else if (target.growthState.currentLevel === 5) interactWithBuilding(target.id, 'clear');
               }
               return { ...npc, status: 'idle', targetId: null };
            }
          }

          if (npc.type === 'vacationer') {
            if (npc.status === 'arriving') {
              const hotel = buildings.find(b => b.id === npc.targetHotelId);
              if (hotel) {
                const hotelGrid = { c: Math.floor((hotel.offset.x + (GRID_SIZE * 32) / 2) / 32), r: Math.floor((hotel.offset.y + (GRID_SIZE * 32) / 2) / 32) };
                if (npc.c === hotelGrid.c && npc.r === hotelGrid.r) {
                  return { ...npc, status: 'staying' };
                } else if (npc.path.length === 0) {
                  const path = findPath({c: npc.c, r: npc.r}, hotelGrid, islandMap);
                  if (path) return { ...npc, path };
                }
              } else {
                 return { ...npc, status: 'leaving', path: [] }; // Hotel deleted
              }
            } else if (npc.status === 'staying') {
              if (now >= npc.stayUntil) {
                return { ...npc, status: 'leaving', path: [] };
              }
              // Payment logic
              if (now - npc.lastPayment >= 60000) {
                setResources(r => ({ ...r, coins: (r.coins || 0) + 5 }));
                return { ...npc, lastPayment: now };
              }
            } else if (npc.status === 'leaving') {
               if (npc.path.length === 0) {
                 const edge = { c: 0, r: 0 }; // Exit at top-left for simplicity
                 const path = findPath({c: npc.c, r: npc.r}, edge, islandMap);
                 if (path) return { ...npc, path };
                 else return null; // Disappear if no path
               } else if (npc.path.length === 0 && (npc.c === 0 && npc.r === 0)) {
                 return null;
               }
            }
          }

          return npc;
        }).filter(Boolean);

        return changed || JSON.stringify(updatedNpcs) !== JSON.stringify(prevNpcs) ? updatedNpcs : prevNpcs;
      });
    }, 500); // 0.5s tick

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
        const gridX = Math.floor((offset.x + (20 * 32) / 2) / 32);
        const gridY = Math.floor((offset.y + (20 * 32) / 2) / 32);
        
        newBuilding.growthState = {
          id: newId,
          coordinates: { x: gridX, y: gridY },
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
    localStorage.removeItem('warden_buildings');
    localStorage.removeItem('warden_level');
    localStorage.removeItem('warden_xp');
    localStorage.removeItem('warden_resources');
    localStorage.removeItem('warden_inventory');
    localStorage.removeItem('warden_distance');
    localStorage.removeItem('warden_territory');
    
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
    npcs
  };
};

