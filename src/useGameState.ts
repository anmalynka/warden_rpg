import { useState, useCallback, useEffect } from 'react';
import * as turf from '@turf/turf';

export const useGameState = () => {
  // 1. ALL USESTATE AT THE TOP
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
  const findPath = useCallback((start: {c: number, r: number}, end: {c: number, r: number}, obstacles: any[]) => {
    if (start.c === end.c && start.r === end.r) return [];
    
    // Convert obstacles to a set for fast lookup
    const obstacleSet = new Set();
    obstacles.forEach(ob => {
      if (ob.isMultiTile) {
        ob.tiles.forEach((t: any) => obstacleSet.add(`${t.c},${t.r}`));
      } else {
        obstacleSet.add(`${ob.c},${ob.r}`);
      }
    });

    const queue: any[] = [[start]];
    const visited = new Set([`${start.c},${start.r}`]);
    const gridLimit = 20; // GRID_SIZE

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
        // Bounds check & Water check (using a simpler logic or passing map)
        // For simplicity, we assume walkable if not in obstacleSet and within bounds
        // In a real scenario, we'd check ISLAND_MAP[next.r][next.c] for WATER (1)
        if (next.c >= 0 && next.c < gridLimit && next.r >= 0 && next.r < gridLimit && 
            !obstacleSet.has(key) && !visited.has(key)) {
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

  // Hotel Passive Income & NPC Automation
  useEffect(() => {
    const hotelInterval = setInterval(() => {
      if (buildings.some(b => b.type === 'hotel')) {
        setResources(prev => ({ ...prev, coins: (prev.coins || 0) + 5 }));
      }
    }, 60000); // 60s

    const npcInterval = setInterval(() => {
      if (!buildings.some(b => b.type === 'mini-house')) return;

      setBuildings(prev => {
        let changed = false;
        const now = Date.now();
        const next = prev.map(b => {
          if (!b.growthState) return b;
          const gs = b.growthState;

          // NPC Waters Stage 3
          if (gs.currentLevel === 3 && !gs.isWatered && Date.now() >= (gs.waterNeededAt || 0)) {
             changed = true;
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

          // NPC Harvests Stage 4
          if (gs.currentLevel === 4) {
             changed = true;
             const produce = gs.produceType || (b.type === 'garden-tree' ? 'apple' : 'wheat');
             
             // Directly add to inventory/resources without full harvest logic duplication 
             // (Ideally refactor harvest logic to a helper, but for now inline is safe)
             setInventory(inv => ({ ...inv, [produce]: (inv[produce] || 0) + 1 }));
             setResources(r => ({ ...r, coins: (r.coins || 0) + 20 }));
             
             // Revert logic
             if (b.type === 'garden-tree') {
                return {
                  ...b,
                  growthState: {
                    ...gs,
                    currentLevel: 3,
                    isWatered: false,
                    waterNeededAt: now + 300000,
                    lastUpdate: now
                  }
                };
             }
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
          return b;
        });
        return changed ? next : prev;
      });
    }, 5000); // Check every 5s

    return () => {
      clearInterval(hotelInterval);
      clearInterval(npcInterval);
    };
  }, [buildings]);

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
    treeCooldowns
  };
};

