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
  const [buildings, setBuildings] = useState([
    { id: 'initial-heart-tree', type: 'heart-tree', offset: { x: 0, y: 0 } }
  ]);
  const [totalDistanceWalked, setTotalDistanceWalked] = useState(0);
  const [avatarPos, setAvatarPos] = useState({ x: 0, y: 0 });
  const [villageZoom, setVillageZoom] = useState(1);

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
        setResources((r: any) => ({ ...r, coins: (r.coins || 0) + reward }));
      }
      return newTotal;
    });
  }, []);

  const spawnResourcesInArea = useCallback((centerPos: [number, number], radiusMeters: number, count: number) => {
    const types = ['wood', 'metal', 'pebbles', 'coins'];
    const assetMap: any = {
      wood: '/images/Tree1.png',
      metal: '/images/Bush_red_flowers1.png',
      pebbles: '/images/Broken_tree1.png',
      coins: '🪙'
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
        return [...prevBuildings, { id: newId, type, offset }];
      }
      return prevBuildings;
    });

    return true;
  }, [resources, setResources, setBuildings]);

  // 3. ALL USEEFFECT AT THE BOTTOM
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
    setVillageZoom
  };
};
