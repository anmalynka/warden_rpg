import { useState, useCallback, useEffect } from 'react';
import * as turf from '@turf/turf';

export const useGameState = () => {
  // 1. ALL USESTATE AT THE TOP
  const [resources, setResources] = useState({
    wood: 50,
    metal: 20,
    pebbles: 10,
    coins: 100
  });
  const [exploredTerritory, setExploredTerritory] = useState(null);
  const [spawnedResources, setSpawnedResources] = useState([]);
  const [lastSpawnLocations, setLastSpawnLocations] = useState([]);
  const [buildings, setBuildings] = useState<any[]>(() => {
    const saved = localStorage.getItem('warden_buildings');
    return saved ? JSON.parse(saved) : [];
  });
  const [totalDistanceWalked, setTotalDistanceWalked] = useState(0);
  const [avatarPos, setAvatarPos] = useState({ x: 8, y: 8 }); // Offset from center to avoid obstacles
  const [villageZoom, setVillageZoom] = useState(2.5); // Zoomed in for the small grid

  // 2. ALL USECALLBACK AFTER USESTATE
  const moveAvatar = useCallback((dx: number, dy: number) => {
    setAvatarPos((prev: any) => ({
      x: prev.x + dx,
      y: prev.y + dy
    }));
  }, []);

  const addWalkDistance = useCallback((meters: number) => {
    setTotalDistanceWalked((prev: number) => {
      const newTotal = prev + meters;
      const oldMilestone = Math.floor(prev / 100);
      const newMilestone = Math.floor(newTotal / 100);
      
      if (newMilestone > oldMilestone) {
        const reward = (newMilestone - oldMilestone) * 10;
        setResources((r: any) => ({ ...r, pebbles: (r.pebbles || 0) + reward }));
      }
      return newTotal;
    });
  }, []);

  const spawnResourcesInArea = useCallback((centerPos: [number, number], radiusMeters: number, count: number) => {
    const types = ['wood', 'metal', 'pebbles', 'coins'];
    const assetMap: any = {
      wood: '/images/tools-wood.png',
      metal: '/images/tools-iron.png',
      pebbles: '/images/tools-crystals.png',
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

  const interactWithBuilding = useCallback((id: string, action: string, data?: any) => {
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
          // Watering moves from level 3 to level 4
          if (gs.currentLevel === 3) {
            return {
              ...b,
              growthState: {
                ...gs,
                currentLevel: 4,
                harvestReadyAt: now,
                lastUpdate: now
              }
            };
          }
          break;
        case 'harvest':
          if (gs.currentLevel === 4) {
            setResources((r: any) => ({ ...r, coins: r.coins + 20 })); 
            // Revert to level 1 (empty wheat state)
            return {
              ...b,
              growthState: {
                ...gs,
                produceType: null,
                currentLevel: 1,
                startTime: now,
                lastUpdate: now
              }
            };
          }
          break;
        case 'clear':
          if (gs.isDead) {
            return {
              ...b,
              growthState: {
                ...gs,
                produceType: null,
                currentLevel: 1,
                isDead: false,
                startTime: now,
                lastUpdate: now
              }
            };
          }
          break;
        case 'remove':
          return null;
      }
      return b;
    }).filter(Boolean));
  }, [setResources]);

  const addBuilding = useCallback((type: string, cost: any, position: any = null) => {
    // We need to check resources and update them together
    setResources((prev: any) => {
      const canAfford = Object.entries(cost).every(([res, amount]: [string, any]) => (prev[res] || 0) >= amount);
      if (canAfford) {
        const nextResources = { ...prev };
        Object.entries(cost).forEach(([res, amount]: [string, any]) => {
          nextResources[res] -= amount;
        });
        return nextResources;
      }
      return prev;
    });

    setBuildings((prevBuildings: any[]) => {
      // Re-check resources using the current state in the closure
      const canAfford = Object.entries(cost).every(([res, amount]: [string, any]) => (resources[res] || 0) >= amount);
      
      if (canAfford) {
        const newId = `building-${Date.now()}`;
        const offset = position || { 
          x: (Math.random() - 0.5) * 300, 
          y: (Math.random() - 0.5) * 300 
        };
        
        const newBuilding: any = { id: newId, type, offset };
        
        if (type === 'garden-bed') {
          // Calculate grid coordinates from position (world coordinates)
          const gridX = Math.floor((offset.x + (20 * 32) / 2) / 32);
          const gridY = Math.floor((offset.y + (20 * 32) / 2) / 32);
          
          newBuilding.growthState = {
            id: newId,
            coordinates: { x: gridX, y: gridY },
            produceType: null,
            currentLevel: 1, // Start at level 1
            startTime: Date.now(),
            lastUpdate: Date.now(),
            isDead: false
          };
        }
        
        return [...prevBuildings, newBuilding];
      }
      return prevBuildings;
    });

    return true;
  }, [resources, setResources, setBuildings]);

  // 3. ALL USEEFFECT AT THE BOTTOM
  // Persistence
  useEffect(() => {
    localStorage.setItem('warden_buildings', JSON.stringify(buildings));
  }, [buildings]);

  useEffect(() => {
    const interval = setInterval(() => {
      setBuildings(prev => {
        let changed = false;
        const now = Date.now();
        const next = prev.map(b => {
          if (b.type === 'garden-bed' && b.growthState) {
            const gs = b.growthState;
            if (gs.isDead || !gs.produceType) return b;

            const elapsedTime = now - gs.startTime;
            
            // 1. Automatic Growth (2 -> 3)
            if (gs.currentLevel === 2) {
              const nextLevel = elapsedTime > 300000 ? 3 : 2;
              if (nextLevel !== gs.currentLevel) {
                changed = true;
                const update: any = { ...gs, currentLevel: nextLevel, lastUpdate: now, waterNeededAt: now };
                return { ...b, growthState: update };
              }
            }

            // 2. Death Timer at Stage 3 (Watering Gate)
            if (gs.currentLevel === 3 && gs.waterNeededAt) {
              if (now - gs.waterNeededAt > 86400000) { // 24 hours
                changed = true;
                return { ...b, growthState: { ...gs, isDead: true, lastUpdate: now } };
              }
            }

            // 3. Death Timer at Stage 4 (Harvest Window)
            if (gs.currentLevel === 4 && gs.harvestReadyAt) {
              if (now - gs.harvestReadyAt > 86400000) { // 24 hours
                changed = true;
                return { ...b, growthState: { ...gs, isDead: true, lastUpdate: now } };
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
    interactWithBuilding
  };
};
