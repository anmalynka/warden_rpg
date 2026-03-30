import { useState, useCallback, useEffect } from 'react';
import * as turf from '@turf/turf';
import { generateIslandMap, TILE_TYPES, GRID_SIZE, INITIAL_GRID_SIZE, TILE_SIZE, getBuildingTiles, gridToWorldBuilding, gridToWorld, worldToGrid, getBuildingHitbox } from './MapConstants';
import { PersistenceService } from './services/PersistenceService';
import type { Item } from './services/PersistenceService';

export const useGameState = () => {
  const [isLoaded, setIsLoaded] = useState(false);

  // --- 1. STATE ---
  const [islandMap, setIslandMap] = useState<number[][]>(() => generateIslandMap(INITIAL_GRID_SIZE));
  const [expansionCost, setExpansionCost] = useState(500);
  const [resources, setResources] = useState({ wood: 50, metal: 20, coins: 100 });
  const [exploredTerritory, setExploredTerritory] = useState<any>(null);
  const [spawnedResources, setSpawnedResources] = useState([]);
  const [lastSpawnLocations, setLastSpawnLocations] = useState([]);
  const [buildings, setBuildings] = useState<any[]>([]);
  const [totalDistanceWalked, setTotalDistanceWalked] = useState(0);
  const [avatarPos, setAvatarPos] = useState({ x: 16, y: 32 });
  const [villageZoom, setVillageZoom] = useState(2.5);
  const [isInsideHouse, setIsInsideHouse] = useState(false);
  const [lastSleepTick, setLastSleepTick] = useState<number | null>(null);
  const [minutesSlept, setMinutesSlept] = useState(0);
  const [level, setLevel] = useState(1);
  const [xp, setXp] = useState(0);
  const [totalXp, setTotalXp] = useState(0);
  const [lastLevelReached, setLastLevelReached] = useState<number | null>(null);
  const [inventory, setInventory] = useState<{[key: string]: number}>({
    wheat: 0, tomato: 0, pumpkin: 0, apple: 0, peach: 0, cherry: 0, wood: 0, milk: 0, wool: 0
  });
  const [treeCooldowns, setTreeCooldowns] = useState<{[key: string]: number}>({});
  const [npcs, setNpcs] = useState<any[]>([]);
  const [catType, setCatType] = useState('grey-cat');
  const [playerName, setPlayerName] = useState('Warden');
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(false);
  const [devMode, setDevMode] = useState(false);
  const [removedDecorations, setRemovedDecorations] = useState<string[]>([]);

  const autoSave = useCallback((immediate = false) => {
    PersistenceService.getInstance().save(immediate);
  }, []);

  // --- Persistence Initialization ---
  useEffect(() => {
    const ps = PersistenceService.getInstance();
    ps.init().then((state) => {
      if (state.worldData) {
        const wd = state.worldData;
        if (wd.islandMap) setIslandMap(wd.islandMap);
        if (wd.expansionCost) setExpansionCost(wd.expansionCost);
        if (wd.resources) setResources(wd.resources);
        if (wd.exploredTerritory) setExploredTerritory(wd.exploredTerritory);
        if (wd.buildings) setBuildings(wd.buildings);
        if (wd.totalDistanceWalked) setTotalDistanceWalked(wd.totalDistanceWalked);
        if (wd.level) setLevel(wd.level);
        if (wd.xp) setXp(wd.xp);
        if (wd.totalXp) setTotalXp(wd.totalXp);
        if (wd.npcs) setNpcs(wd.npcs);
        if (wd.hasCompletedOnboarding !== undefined) setHasCompletedOnboarding(wd.hasCompletedOnboarding);
        if (wd.removedDecorations) setRemovedDecorations(wd.removedDecorations);
      }
      setPlayerName(state.catName);
      setCatType(state.catColor);
      
      // Inventory conversion
      if (state.inventory && state.inventory.length > 0) {
        const invMap: any = {};
        state.inventory.forEach(item => invMap[item.id] = item.count);
        setInventory(invMap);
      }
      
      setIsLoaded(true);
    });
  }, []);

  // --- Auto-Save Hooks ---
  useEffect(() => {
    if (!isLoaded) return;
    const ps = PersistenceService.getInstance();
    ps.setWorldValue('islandMap', islandMap);
    ps.setWorldValue('expansionCost', expansionCost);
    ps.setWorldValue('resources', resources);
    ps.setWorldValue('exploredTerritory', exploredTerritory);
    ps.setWorldValue('buildings', buildings);
    ps.setWorldValue('totalDistanceWalked', totalDistanceWalked);
    ps.setWorldValue('level', level);
    ps.setWorldValue('xp', xp);
    ps.setWorldValue('totalXp', totalXp);
    ps.setWorldValue('npcs', npcs);
    ps.setWorldValue('hasCompletedOnboarding', hasCompletedOnboarding);
    ps.setWorldValue('removedDecorations', removedDecorations);
    ps.setGameValue('catName', playerName);
    ps.setGameValue('catColor', catType);
    
    // Inventory sync
    const invArray: Item[] = Object.entries(inventory).map(([id, count]) => ({ id, name: id, count }));
    ps.setGameValue('inventory', invArray);
  }, [
    isLoaded, islandMap, expansionCost, resources, exploredTerritory, buildings, 
    totalDistanceWalked, level, xp, totalXp, npcs, playerName, catType, 
    hasCompletedOnboarding, removedDecorations, inventory
  ]);

  // --- 2. CALLBACKS (HELPERS) ---
  const getXpToNextLevel = useCallback((lvl: number) => {
    if (lvl === 1) return 30;
    // We cannot easily use recursion with dependency array if we want it stable,
    // but for this simple math it's fine.
    const calculate = (l: number): number => {
      if (l === 1) return 30;
      return Math.floor(Math.pow(calculate(l - 1), 1.1) + l);
    };
    return calculate(lvl);
  }, []);

  const XP_TO_NEXT_LEVEL = getXpToNextLevel(level);

  const addXp = useCallback((amount: number) => {
    setTotalXp(prev => prev + amount);
    setXp(currentXp => {
      let nextXp = currentXp + amount;
      let currentLvl = level;
      let needed = getXpToNextLevel(currentLvl);

      if (nextXp >= needed) {
        const newLvl = currentLvl + 1;
        setLevel(newLvl);
        setLastLevelReached(newLvl); // Trigger for Level Up Modal
        
        // Award rewards based on new level
        setResources((prev: any) => {
          let coins = 0, wood = 0, metal = 0;
          if (newLvl >= 2 && newLvl <= 9) {
            coins = 10; wood = 5; metal = 5;
          } else if (newLvl >= 10 && newLvl <= 19) {
            coins = 20; wood = 10; metal = 10;
          } else if (newLvl >= 20) {
            coins = 40; wood = 20; metal = 20;
          }
          return {
            ...prev,
            coins: (prev.coins || 0) + coins,
            wood: (prev.wood || 0) + wood,
            metal: (prev.metal || 0) + metal
          };
        });

        return nextXp - needed;
      }
      return nextXp;
    });
  }, [level, getXpToNextLevel]);

  const gridToWorldLocal = useCallback((c: number, r: number) => gridToWorld(c, r, islandMap.length), [islandMap.length]);
  const worldToGridLocal = useCallback((x: number, y: number) => worldToGrid(x, y, islandMap.length), [islandMap.length]);

  // BFS Pathfinding Utility
  const findPath = useCallback((start: {c: number, r: number}, end: {c: number, r: number}, currentIslandMap: number[][], npcType?: string, targetBuildingId?: string) => {
    if (start.c === end.c && start.r === end.r) return [];
    
    // Grid bounds
    const currentSize = islandMap.length;
    const gridLimit = currentSize;

    const queue: any[] = [[start]];
    const visited = new Set([`${start.c},${start.r}`]);

    // Get current buildings for collision
    const buildingPositions = new Set<string>();
    buildings.forEach(b => {
      // If this building is the NPC's target, don't treat it as an obstacle for pathfinding
      if (b.id === targetBuildingId) return;
      
      const gridPos = b.growthState?.coordinates || worldToGrid(b.offset.x, b.offset.y, currentSize);
      getBuildingTiles(b.type, gridPos.c, gridPos.r).forEach(t => {
        buildingPositions.add(`${t.c},${t.r}`);
      });
    });

    // Add decorations to buildingPositions
    for (let r = 0; r < currentSize; r++) {
      for (let c = 0; c < currentSize; c++) {
        if (islandMap[r][c] === TILE_TYPES.GRASS) {
          const rand = Math.sin(r * 12.9898 + c * 78.233) * 43758.5453 % 1;
          if (Math.abs(rand) < 0.15) {
            const id = `tree-${c}-${r}`;
            if (!removedDecorations.includes(id)) {
              buildingPositions.add(`${c},${r}`);
            }
          }
        }
      }
    }

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
    setExpansionCost(prev => prev + 100);

    // Award XP
    addXp(40);

    setIslandMap(prevMap => {
      const currentSize = prevMap.length;
      const map = prevMap.map(row => [...row]);

      // Expand in a 3x3 area around the clicked point
      const tilesToChange: {r: number, c: number}[] = [];
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const r = startR + dr;
          const c = startC + dc;
          if (r >= 0 && r < currentSize && c >= 0 && c < currentSize) {
            tilesToChange.push({r, c});
          }
        }
      }

      // Convert all tiles in the 3x3 to SAND first if they were WATER
      tilesToChange.forEach(({r, c}) => {
        if (map[r][c] === TILE_TYPES.WATER) {
          map[r][c] = TILE_TYPES.SAND;
        }
      });

      // Then randomly pick 5-8 tiles to become GRASS
      const grassCount = 5 + Math.floor(Math.random() * 4); // 5, 6, 7, or 8
      const shuffled = [...tilesToChange].sort(() => 0.5 - Math.random());
      shuffled.slice(0, grassCount).forEach(({r, c}) => {
        map[r][c] = TILE_TYPES.GRASS;
      });

      return map;
    });

    // Schedule resource refill in 2.5 minutes (150000 ms)
    setTimeout(() => {
      // Logic to spawn resources manually or trigger a state update that the resource useEffect picks up
      // For simplicity, we can just clear a bit of spawnedResources if it's full to force the effect to run
      setSpawnedResources(prev => prev.slice(0, Math.max(0, prev.length - 10)));
    }, 150000);

    return true;
  }, [resources.coins, expansionCost, level, addXp, setSpawnedResources]);

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
    const isMajorBuilding = ['starter-house', 'mini-house', 'hotel'].includes(type);
    addXp(isMajorBuilding ? 20 : 2);

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

      if (type === 'lucky-farm') {
        newBuilding.hotelStatus = {
          moisture: 100,
          lastWateredAt: Date.now(),
          guests: [], // { id, type, invitedAt, lastProducedAt }
          farmStatus: 'alive',
          lastActionAt: Date.now(),
          producedItems: { milk: 0, wool: 0 }
        };
      }
      
      return [...prevBuildings, newBuilding];
    });

    autoSave(true);
    return newId;
  }, [resources, setResources, setBuildings, level, islandMap.length, addXp, autoSave]);

  const interactWithBuilding = useCallback((id: string, action: string, data?: any, onHarvest?: any) => {
    const now = Date.now();

    // Handle decoration-specific actions first (they are not buildings)
    if (action === 'remove-decoration') {
      setRemovedDecorations(prev => [...prev, id]);
      return;
    }

    if (action === 'collect-default-wood') {
      setResources(r => ({ ...r, wood: (r.wood || 0) + 1 }));
      addXp(2); // Keep existing XP
      setTreeCooldowns(prev => ({ ...prev, [id]: now + 12 * 60 * 60 * 1000 })); // 12 hours cooldown
      return;
    }

    // Side-effects handling OUTSIDE of setBuildings updater
    const b = buildings.find(building => building.id === id);
    if (!b) return;

    if (action === 'select-produce') {
      addXp(2);
    } else if (action === 'harvest' && b.growthState?.currentLevel === 4) {
      addXp(3);
      const produce = b.growthState.produceType || (b.type === 'garden-tree' ? 'apple' : 'wheat');
      setInventory(inv => ({ ...inv, [produce]: (inv[produce] || 0) + 1 }));
      onHarvest?.(produce, 1);
    } else if (action === 'clear' && b.growthState?.currentLevel === 5) {
      addXp(2);
    } else if (action === 'collect-farm') {
      if (b.hotelStatus && b.hotelStatus.producedItems) {
        const { milk, wool } = b.hotelStatus.producedItems;
        if (milk > 0 || wool > 0) {
          setInventory(inv => ({ 
            ...inv, 
            milk: (inv.milk || 0) + milk,
            wool: (inv.wool || 0) + wool 
          }));
          addXp((milk + wool) * 2);
        }
      }
    } else if (action === 'sleep') {
      setIsInsideHouse(true);
      setLastSleepTick(Date.now());
      setMinutesSlept(0);
    } else if (action === 'wake') {
      setIsInsideHouse(false);
      setLastSleepTick(null);
      setMinutesSlept(0);
    }

    setBuildings(prev => {
      const next = prev.map(b => {
        if (b.id !== id) return b;
        
        const gs = b.growthState;

        switch (action) {
          case 'select-produce':
            return {
              ...b,
              growthState: {
                ...gs,
                produceType: data.produceType,
                lastProduceType: data.produceType,
                currentLevel: 2,
                startTime: now,
                lastUpdate: now,
                isWatered: false,
                waterNeededAt: now + 300000
              }
            };
          case 'water':
            return { 
              ...b, 
              growthState: { 
                ...gs, 
                isWatered: true, 
                lastUpdate: now,
                harvestReadyAt: now + 120000
              } 
            };
          case 'harvest':
            if (gs.currentLevel === 4) {
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
            break;
          case 'clear':
            if (gs.currentLevel >= 2) {
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
           return { ...b, pendingVacationers: (b.pendingVacationers || 0) + 1, hasGuestsAskedToLeave: false };
          case 'leave-vacationer':
           return { ...b, pendingVacationers: 0, hasGuestsAskedToLeave: true };
          case 'leave-worker':
            return { ...b, hasWorkerRequested: false };
          case 'water-hotel':
            if (b.hotelStatus) {
              return { ...b, hotelStatus: { ...b.hotelStatus, moisture: 100, lastWateredAt: now } };
            }
            return b;
          case 'invite-cow':
          case 'invite-sheep':
            if (b.hotelStatus && b.hotelStatus.farmStatus === 'alive') {
              const cows = b.hotelStatus.guests.filter((g: any) => g.type === 'cow').length;
              const sheeps = b.hotelStatus.guests.filter((g: any) => g.type === 'sheep').length;
              
              if (action === 'invite-cow' && cows >= 3) return b;
              if (action === 'invite-sheep' && sheeps >= 3) return b;

              const guestType = action === 'invite-cow' ? 'cow' : 'sheep';
              const newGuest = {
                id: `guest-${Date.now()}-${Math.random()}`,
                type: guestType,
                invitedAt: now,
                lastProducedAt: now
              };
              return { ...b, hotelStatus: { ...b.hotelStatus, guests: [...b.hotelStatus.guests, newGuest] } };
            }
            return b;
          case 'collect-farm':
            if (b.hotelStatus && b.hotelStatus.producedItems) {
               return { ...b, hotelStatus: { ...b.hotelStatus, producedItems: { milk: 0, wool: 0 } } };
            }
            return b;
          case 'leave-guest':
              if (b.hotelStatus) {
              const nextGuests = b.hotelStatus.guests.filter((g: any) => g.id !== data.guestId);
              return { ...b, hotelStatus: { ...b.hotelStatus, guests: nextGuests } };
              }
              return b;
          case 'renew-farm':
              if (b.hotelStatus && b.hotelStatus.farmStatus === 'dead') {
              return { ...b, hotelStatus: { ...b.hotelStatus, moisture: 100, lastWateredAt: now, farmStatus: 'alive', guests: [] } };
              }
              return b;
          }
        return b;
      }).filter(Boolean);
      return next;
    });

    autoSave(true);
  }, [buildings, setResources, setIsInsideHouse, level, treeCooldowns, addXp, autoSave]);

  const addTerritory = useCallback((circle: any, pos: any) => {
    setExploredTerritory((prev: any) => {
      if (!prev) return circle;
      try {
        const unioned = turf.union(turf.featureCollection([prev, circle]));
        return unioned || prev;
      } catch (e) {
        console.warn("Territory union failed", e);
        return prev;
      }
    });

    // Spawn logic: Every 100m of new exploration
    setLastSpawnLocations((prev: any[]) => {
      const isTooClose = prev.some((loc: any) => turf.distance(turf.point(pos), turf.point(loc), { units: 'meters' }) < 100);
      if (isTooClose) return prev;

      // Spawn 1 resource randomly around pos (volume reduced to 0.5x-ish from 1-3)
      const count = 1;
      const newResources: any[] = [];
      const types = ['wood', 'metal', 'coins'];
      const icons: any = { wood: '/images/tools-wood.png', metal: '/images/tools-iron.png', coins: '/images/tools-coins.png' };

      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const dist = 0.01 + Math.random() * 0.04; // 10-50 meters away
        const resLng = pos[0] + (dist / 111.32) * Math.cos(angle); // rough estimate
        const resLat = pos[1] + (dist / 110.57) * Math.sin(angle);
        
        const type = types[Math.floor(Math.random() * types.length)];
        newResources.push({
          id: `res-${Date.now()}-${Math.random()}`,
          type,
          lng: resLng,
          lat: resLat,
          icon: icons[type]
        });
      }

      setSpawnedResources((current: any) => [...current, ...newResources]);
      return [...prev, pos];
    });
  }, []);

  const collectResource = useCallback((id: string, type: string, amount: number = 1) => {
    setSpawnedResources(prev => prev.filter((r: any) => r.id !== id));
    setResources((prev: any) => ({
      ...prev,
      [type]: (prev[type] || 0) + amount
    }));
  }, []);

  const resetGame = useCallback((newCatType?: string, newPlayerName?: string) => {
    // Nuclear clear for all warden_ keys
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith('warden_')) {
        localStorage.removeItem(key);
      }
    });

    // Clear IndexedDB
    PersistenceService.getInstance().clear();

    if (newCatType) {
       setCatType(newCatType);
    }

    if (newPlayerName) {
       setPlayerName(newPlayerName);
    }

    setHasCompletedOnboarding(false);

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
      cherry: 0,
      wood: 0
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
  }, [setIslandMap, setExpansionCost, setNpcs, setTreeCooldowns, setResources, setInventory, setBuildings, setLevel, setXp, setExploredTerritory, setSpawnedResources, setTotalDistanceWalked, setAvatarPos, setRemovedDecorations, setCatType, setPlayerName, setHasCompletedOnboarding]);

  // --- 3. EFFECTS ---

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

        const hotels = buildings.filter(b => b.type === 'hotel');
        const luckyFarms = buildings.filter(b => b.type === 'lucky-farm');

        // Remove guests/workers if house no longer requests/exists
        updatedNpcs = updatedNpcs.filter(npc => {
          if (npc.type === 'worker') {
            const mh = miniHouses.find(h => h.id === npc.homeId);
            if (!mh || !mh.hasWorkerRequested) { changed = true; return false; }
          }
          if (npc.type === 'guest') {
            const lf = luckyFarms.find(h => h.id === npc.hotelId);
            if (!lf || !lf.hotelStatus.guests.some(g => g.id === npc.guestId)) { changed = true; return false; }
          }
          return true;
        });

        // 1. Spawning Logic: Lucky Farm Guests
        luckyFarms.forEach(lf => {
          lf.hotelStatus.guests.forEach((g: any) => {
            const hasNpc = updatedNpcs.some(n => n.guestId === g.id);
            if (!hasNpc) {
              const gridPos = worldToGrid(lf.offset.x, lf.offset.y, currentSize);
              // Spawn in the left half (64x64 area)
              const worldPos = { x: lf.offset.x - 32 + (Math.random() - 0.5) * 32, y: lf.offset.y + (Math.random() - 0.5) * 32 };
              updatedNpcs.push({
                id: `guest-${g.id}`,
                type: 'guest',
                guestId: g.id,
                hotelId: lf.id,
                char: g.type,
                c: gridPos.c,
                r: gridPos.r,
                x: worldPos.x,
                y: worldPos.y,
                path: [],
                status: 'staying',
                lastAction: now,
                isWalking: false,
                facing: 'down'
              });
              changed = true;
            }
          });
        });

        // 2. Spawning & Eviction Logic: Foxglove Inn
        hotels.forEach(hotel => {
          if (hotel.hasGuestsAskedToLeave) {
              const guests = updatedNpcs.filter(n => n.type === 'vacationer' && n.targetHotelId === hotel.id);
              if (guests.length > 0) {
                  updatedNpcs = updatedNpcs.filter(n => !(n.type === 'vacationer' && n.targetHotelId === hotel.id));
                  changed = true;
              }
              setBuildings(prev => prev.map(b => b.id === hotel.id ? { ...b, hasGuestsAskedToLeave: false, pendingVacationers: 0 } : b));
          }
          if ((hotel.pendingVacationers || 0) > 0) {
            const currentGuests = updatedNpcs.filter(n => n.type === 'vacationer' && n.targetHotelId === hotel.id).length;
            if (currentGuests < 5) {
              const hotelGrid = worldToGrid(hotel.offset.x, hotel.offset.y, currentSize);
              let sc = hotelGrid.c, sr = hotelGrid.r;
              let found = false;
              for (let radius = 2; radius < 10 && !found; radius++) {
                for (let dr = -radius; dr <= radius && !found; dr++) {
                  for (let dc = -radius; dc <= radius && !found; dc++) {
                    const r = hotelGrid.r + dr;
                    const c = hotelGrid.c + dc;
                    if (r >= 0 && r < currentSize && c >= 0 && c < currentSize) {
                      const tile = islandMap[r][c];
                      if (tile === TILE_TYPES.GRASS || tile === TILE_TYPES.SAND) {
                        sc = c; sr = r;
                        found = true;
                      }
                    }
                  }
                }
              }
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
              setBuildings(prev => prev.map(b => b.id === hotel.id ? { ...b, pendingVacationers: b.pendingVacationers - 1 } : b));
              changed = true;
            }
          }
        });

        // 3. Obstacle Map for NPCs (Buildings + Decorations)
        const buildingHitboxes = buildings.map(b => {
          if (!b.offset) return null;
          let w = 64, h = 64;
          if (b.type === 'garden-bed' || b.type === 'garden-tree' || b.type === 'shop') { w = 32; h = 32; }
          
          if (b.type === 'lucky-farm') {
             // Block the "back" half (128x32) for NPCs
             return { x: b.offset.x - 64, y: b.offset.y - 32, w: 128, h: 32 };
          }
          
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
          const nextNpc = { ...npc };

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
                const isHotelTarget = nextNpc.type === 'vacationer' && nextNpc.targetHotelId === b.id && b.type === 'hotel';
                // Also check if the current target tile is within or very near the building
                const isNearBuilding = Math.abs(bGrid.c - targetTile.c) <= 2 && Math.abs(bGrid.r - targetTile.r) <= 2;
                return (bGrid.c === targetTile.c && bGrid.r === targetTile.r) || isNpcTarget || (isHotelTarget && isNearBuilding);
              });

              let blocked = false;
              if (!isTargetBuilding) {
                // Building/Decoration hitbox check - slightly smaller padding for NPCs
                blocked = allHitboxes.some(h =>
                  nextX + 4 > h.x && nextX - 4 < h.x + h.w &&
                  nextY + 4 > h.y && nextY - 4 < h.y + h.h
                );

                // Terrain check - must be on Grass or Sand
                if (!blocked) {
                  const nextGrid = worldToGridLocal(nextX, nextY - 16); // Check at feet position
                  const terrainType = islandMap[nextGrid.r]?.[nextGrid.c];
                  if (terrainType !== TILE_TYPES.GRASS && terrainType !== TILE_TYPES.SAND) {
                    blocked = true;
                  }
                }
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
                // If a Fox is blocked, clear its path and reset lastAction to force a new wandering calculation
                if (nextNpc.type === 'vacationer' && nextNpc.status === 'staying') {
                  nextNpc.path = [];
                  nextNpc.lastAction = 0; // Force immediate recalculation in the next logic block
                }
              }
            }
          } else {
            nextNpc.isWalking = false;
          }

          if (nextNpc.type === 'worker') {
            const home = buildings.find(b => b.id === nextNpc.homeId);
            const homeGrid = home ? worldToGrid(home.offset.x, home.offset.y, currentSize) : null;

            if (nextNpc.status === 'idle') {
               // Look for work: Water, Harvest, Replant, or Water/Collect Lucky Farm
               const targets = buildings.filter(b => {
                 if (b.type === 'lucky-farm' && b.hotelStatus) {
                   const hs = b.hotelStatus;
                   const needsWater = hs.farmStatus === 'alive' && hs.moisture < 50;
                   const readyToCollect = hs.producedItems && (hs.producedItems.milk > 0 || hs.producedItems.wool > 0);
                   return needsWater || readyToCollect;
                 }
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
                 const targetGrid = target.growthState 
                  ? { c: target.growthState.coordinates.x, r: target.growthState.coordinates.y }
                  : worldToGrid(target.offset.x, target.offset.y, currentSize);
                 
                 // For Lucky Farm, we want to target the front row center
                 if (target.type === 'lucky-farm') {
                    targetGrid.r += 1;
                    targetGrid.c += 1;
                 }

                 const path = findPath({c: nextNpc.c, r: nextNpc.r}, {c: targetGrid.c, r: targetGrid.r}, islandMap, nextNpc.type, target.id);
                 if (path) {
                    return { ...nextNpc, status: 'moving_to_work', targetId: target.id, path: path.slice(0, -1) };
                 }
               } else if (homeGrid && (nextNpc.c !== homeGrid.c || homeGrid.r !== nextNpc.r) && nextNpc.path.length === 0) {
                 const path = findPath({c: nextNpc.c, r: nextNpc.r}, homeGrid, islandMap, nextNpc.type, nextNpc.homeId);
                 if (path) return { ...nextNpc, path };
               }
            } else if (nextNpc.status === 'moving_to_work' && nextNpc.path.length === 0) {
               return { ...nextNpc, status: 'working', lastAction: now };
            } else if (nextNpc.status === 'working' && now - nextNpc.lastAction > 3000) {
               const target = buildings.find(b => b.id === nextNpc.targetId);
               if (target) {
                  if (target.type === 'lucky-farm' && target.hotelStatus) {
                    const hs = target.hotelStatus;
                    if (hs.producedItems && (hs.producedItems.milk > 0 || hs.producedItems.wool > 0)) {
                      interactWithBuilding(target.id, 'collect-farm');
                    } else if (hs.farmStatus === 'alive' && hs.moisture < 50) {
                      interactWithBuilding(target.id, 'water-hotel');
                    }
                  } else if (target.growthState) {
                    const gs = target.growthState;
                    if (gs.currentLevel === 3) interactWithBuilding(target.id, 'water');
                    else if (gs.currentLevel === 4) interactWithBuilding(target.id, 'harvest');
                    else if (gs.currentLevel === 5) interactWithBuilding(target.id, 'clear');
                    else if (gs.currentLevel === 1 && gs.lastProduceType) {
                      interactWithBuilding(target.id, 'select-produce', { produceType: gs.lastProduceType });
                    }
                  }
               }
               return { ...nextNpc, status: 'idle', targetId: null };
            }
          }

          if (nextNpc.type === 'vacationer') {
            const hotel = buildings.find(b => b.id === nextNpc.targetHotelId);
            if (!hotel) return null; // Foxes disappear if no hotel exists

            if (nextNpc.status === 'arriving') {
              // Target is just outside the hotel's 2x2 area
              const hotelGrid = worldToGrid(hotel.offset.x, hotel.offset.y, currentSize);
              const targetGrid = { c: hotelGrid.c, r: hotelGrid.r + 2 }; // 2 tiles below center point

              if (nextNpc.c === targetGrid.c && nextNpc.r === targetGrid.r) {
                return { ...nextNpc, status: 'staying', lastAction: now };
              } else if (nextNpc.path.length === 0) {
                const path = findPath({c: nextNpc.c, r: nextNpc.r}, targetGrid, islandMap, nextNpc.type, nextNpc.targetHotelId);
                if (path) return { ...nextNpc, path };
              }
            } else if (nextNpc.status === 'staying') {
              const hotel = buildings.find(b => b.id === nextNpc.targetHotelId);
              if (!hotel) {
                 return { ...nextNpc, status: 'leaving', path: [] };
              }

              if (now >= nextNpc.stayUntil) {
                // Final payment upon natural departure: 50 coins
                setResources(r => ({ ...r, coins: (r.coins || 0) + 50 }));
                return { ...nextNpc, status: 'leaving', path: [] };
              }
              // Pay 50 coins every 10 minutes (600,000 ms)
              if (now - nextNpc.lastPayment >= 600000) {
                setResources(r => ({ ...r, coins: (r.coins || 0) + 50 }));
                return { ...nextNpc, lastPayment: now };
              }

              // Sightseeing Movement: Random wandering on grass or sand
              if (nextNpc.path.length === 0 && now - (nextNpc.lastAction || 0) > 500 + Math.random() * 2000) {
                // Pick a random nearby walkable tile (Grass or Sand)
                const walkableTiles: {c: number, r: number}[] = [];
                const searchRadius = 5; // Local wandering radius
                for (let dr = -searchRadius; dr <= searchRadius; dr++) {
                  for (let dc = -searchRadius; dc <= searchRadius; dc++) {
                    const r = nextNpc.r + dr;
                    const c = nextNpc.c + dc;
                    if (r >= 0 && r < currentSize && c >= 0 && c < currentSize) {
                      const tile = islandMap[r][c];
                      if (tile === TILE_TYPES.GRASS || tile === TILE_TYPES.SAND) {
                        walkableTiles.push({c, r});
                      }
                    }
                  }
                }

                if (walkableTiles.length > 0) {
                  const target = walkableTiles[Math.floor(Math.random() * walkableTiles.length)];
                  const path = findPath({c: nextNpc.c, r: nextNpc.r}, target, islandMap, nextNpc.type, nextNpc.targetHotelId);
                  if (path) return { ...nextNpc, path, lastAction: now };
                }
                // Update lastAction even if no path found to avoid checking every tick
                return { ...nextNpc, lastAction: now };
              }
            } else if (nextNpc.status === 'leaving') {
              // Foxes disappear instantly as requested
              return null;
            }
          }

          if (nextNpc.type === 'guest') {
            const lf = luckyFarms.find(h => h.id === nextNpc.hotelId);
            if (!lf) return null;

            // Sightseeing Movement: Random wandering on grass or sand (like foxes)
            if (nextNpc.path.length === 0 && now - (nextNpc.lastAction || 0) > 1000 + Math.random() * 3000) {
              // Pick a random nearby walkable tile (Grass or Sand)
              const walkableTiles: {c: number, r: number}[] = [];
              const searchRadius = 8; // Larger wandering radius for cows/sheep
              for (let dr = -searchRadius; dr <= searchRadius; dr++) {
                for (let dc = -searchRadius; dc <= searchRadius; dc++) {
                  const r = nextNpc.r + dr;
                  const c = nextNpc.c + dc;
                  if (r >= 0 && r < currentSize && c >= 0 && c < currentSize) {
                    const tile = islandMap[r][c];
                    if (tile === TILE_TYPES.GRASS || tile === TILE_TYPES.SAND) {
                      walkableTiles.push({c, r});
                    }
                  }
                }
              }

              if (walkableTiles.length > 0) {
                const target = walkableTiles[Math.floor(Math.random() * walkableTiles.length)];
                const path = findPath({c: nextNpc.c, r: nextNpc.r}, target, islandMap, nextNpc.type, nextNpc.hotelId);
                if (path) {
                  return { ...nextNpc, path, lastAction: now };
                }
              }
              // Update lastAction even if no path found to avoid checking every tick
              return { ...nextNpc, lastAction: now };
            }
          }

          return nextNpc;
        }).filter(Boolean);

        return changed || JSON.stringify(updatedNpcs) !== JSON.stringify(prevNpcs) ? updatedNpcs : prevNpcs;
      });
    }, 50); // Fast interval for smooth movement

    return () => clearInterval(npcInterval);
  }, [buildings, islandMap, findPath, interactWithBuilding, gridToWorldLocal, worldToGridLocal]);

  // Handle Accelerated Time (Sleeping)
  useEffect(() => {
    if (!isInsideHouse || !lastSleepTick) return;

    const interval = setInterval(() => {
      const bonusTime = 60000; // 1 real second = 1 minute (60,000ms) bonus growth
      
      setMinutesSlept(prev => prev + 1);

      setBuildings(prev => prev.map(b => {
        if ((b.type === 'garden-bed' || b.type === 'garden-tree') && b.growthState) {
          const gs = b.growthState;
          if (gs.currentLevel === 5 || !gs.produceType) return b;
          
          // Advance all milestones so it grows faster
          const updates: any = {
            startTime: gs.startTime - bonusTime,
            lastUpdate: gs.lastUpdate - bonusTime
          };
          if (gs.waterNeededAt) updates.waterNeededAt = gs.waterNeededAt - bonusTime;
          if (gs.harvestReadyAt) updates.harvestReadyAt = gs.harvestReadyAt - bonusTime;
          if (gs.deathAt) updates.deathAt = gs.deathAt - bonusTime;

          return { ...b, growthState: { ...gs, ...updates } };
        }
        return b;
      }));

      setTreeCooldowns(prev => {
        const next = { ...prev };
        let changed = false;
        Object.keys(next).forEach(key => {
          next[key] -= bonusTime;
          changed = true;
        });
        return changed ? next : prev;
      });

      setNpcs(prev => prev.map(n => {
        if (n.type === 'vacationer') {
          return {
            ...n,
            stayUntil: n.stayUntil - bonusTime,
            lastPayment: n.lastPayment - bonusTime
          };
        }
        return n;
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

            let targetLevel = gs.currentLevel;

            // Requirements:
            // 2 -> 3: 5 minutes (300,000ms)
            // 3 -> 4: 2 minutes (120,000ms) after watering
            // 4 -> 5: 24 hours (86,400,000ms)

            if (gs.currentLevel === 2) {
              if (now >= (gs.waterNeededAt || 0)) {
                targetLevel = 3;
              }
            } else if (gs.currentLevel === 3) {
              if (gs.isWatered && now >= (gs.harvestReadyAt || 0)) {
                targetLevel = 4;
              }
            }

            if (targetLevel !== gs.currentLevel) {
              changed = true;
              const updates: any = { currentLevel: targetLevel, lastUpdate: now };
              if (targetLevel === 4) updates.deathAt = now + 86400000; // 24 hours to stage 5
              return { ...b, growthState: { ...gs, ...updates } };
            }

            // Check for death (level 5) after 24h
            if (gs.currentLevel === 4 && gs.deathAt) {
               if (now >= gs.deathAt) {
                 changed = true;
                 return { ...b, growthState: { ...gs, currentLevel: 5, lastUpdate: now } };
               }
            }
          }

          if (b.type === 'lucky-farm' && b.hotelStatus) {
            const hs = b.hotelStatus;
            let nextHs = { ...hs };
            let hsChanged = false;

            // Moisture Logic: 100 to 0 in 5 minutes (300,000 ms)
            const elapsedSinceWater = now - hs.lastWateredAt;
            const newMoisture = Math.max(0, 100 - (elapsedSinceWater / 300000) * 100);
            if (Math.abs(newMoisture - hs.moisture) > 1) {
              nextHs.moisture = newMoisture;
              hsChanged = true;
            }

            // Death/Unhappy Logic: if not watered for > 6 hours (21,600,000 ms)
            if (elapsedSinceWater > 21600000) { 
              if (hs.farmStatus !== 'dead') {
                nextHs.farmStatus = 'dead';
                nextHs.guests = []; // All leave
                hsChanged = true;
              }
            } else if (hs.guests.length > 0 && newMoisture <= 0) {
               // Guests leave if unhappy (moisture is 0)
               // The user didn't specify changing the "leaving" logic here, 
               // but the 6h death is now strictly from lastWateredAt.
            }

            // Production Logic: Cow (10 min), Sheep (10 min)
            if (hs.guests.length > 0 && hs.farmStatus === 'alive') {
              let prodMilk = 0;
              let prodWool = 0;
              
              nextHs.guests = hs.guests.map(g => {
                const interval = 600000; // 10 minutes (600,000 ms) for both
                const lastProd = g.lastProducedAt || g.invitedAt;
                
                // We produce as long as farm is alive
                if (now - lastProd >= interval) {
                  const count = Math.floor((now - lastProd) / interval);
                  if (g.type === 'cow') prodMilk += count;
                  else prodWool += count;
                  return { ...g, lastProducedAt: lastProd + (count * interval) };
                }
                return g;
              });

              if (prodMilk > 0 || prodWool > 0) {
                nextHs.producedItems = {
                  milk: (nextHs.producedItems?.milk || 0) + prodMilk,
                  wool: (nextHs.producedItems?.wool || 0) + prodWool
                };
                hsChanged = true;
              }
              
              if (JSON.stringify(nextHs.guests) !== JSON.stringify(hs.guests)) hsChanged = true;
            }

            if (hsChanged) {
              changed = true;
              return { ...b, hotelStatus: nextHs };
            }
          }
          return b;
        });
        return changed ? next : prev;
      });
    }, 5000); // 5s check for responsiveness
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!exploredTerritory || spawnedResources.length >= 50) return;
    const needed = 20 - spawnedResources.length;
    if (needed <= 0) return;

    const bbox = turf.bbox(exploredTerritory);
    const newResources: any[] = [];
    const types = ['wood', 'metal', 'coins'];
    const icons: any = { wood: '/images/tools-wood.png', metal: '/images/tools-iron.png', coins: '/images/tools-coins.png' };

    for (let i = 0; i < needed; i++) {
      const lng = bbox[0] + Math.random() * (bbox[2] - bbox[0]);
      const lat = bbox[1] + Math.random() * (bbox[3] - bbox[1]);
      
      try {
        if (turf.booleanPointInPolygon(turf.point([lng, lat]), exploredTerritory)) {
          const type = types[Math.floor(Math.random() * types.length)];
          newResources.push({
            id: `res-${Date.now()}-${Math.random()}`,
            type,
            lng,
            lat,
            icon: icons[type]
          });
        }
      } catch (e) {
        // Skip invalid points
      }
    }
    
    if (newResources.length > 0) {
      setSpawnedResources((current: any) => [...current, ...newResources]);
    }
  }, [exploredTerritory, spawnedResources.length]);

  useEffect(() => {
    if (!isLoaded) return;
    PersistenceService.getInstance().setWorldValue('devMode', devMode);
  }, [devMode, isLoaded]);

  return {
    isLoaded,
    autoSave,
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
    setLevel,
    xp,
    totalXp,
    XP_TO_NEXT_LEVEL,
    lastLevelReached,
    setLastLevelReached,
    inventory,
    setInventory,
    treeCooldowns,
    islandMap,
    expandLand,
    expansionCost,
    npcs,
    removedDecorations,
    catType,
    setCatType,
    playerName,
    setPlayerName,
    hasCompletedOnboarding,
    setHasCompletedOnboarding,
    devMode,
    setDevMode
  };
};
