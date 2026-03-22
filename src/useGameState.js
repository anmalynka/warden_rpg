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
  const moveAvatar = useCallback((dx, dy) => {
    setAvatarPos(prev => ({
      x: prev.x + dx,
      y: prev.y + dy
    }));
  }, []);

  const addWalkDistance = useCallback((meters) => {
    setTotalDistanceWalked(prev => {
      const newTotal = prev + meters;
      const oldMilestone = Math.floor(prev / 100);
      const newMilestone = Math.floor(newTotal / 100);
      
      if (newMilestone > oldMilestone) {
        const reward = (newMilestone - oldMilestone) * 10;
        setResources(r => ({ ...r, coins: (r.coins || 0) + reward }));
      }
      return newTotal;
    });
  }, []);

  const spawnResourcesInArea = useCallback((centerPos, radiusMeters, count) => {
    const types = ['wood', 'metal', 'pebbles', 'coins'];
    const assetMap = {
      wood: '/images/Tree1.png',
      metal: '/images/Bush_red_flowers1.png',
      pebbles: '/images/Broken_tree1.png',
      coins: '🪙'
    };

    const newBatch = [];
    let attempts = 0;
    const centerPoint = turf.point(centerPos);

    while (newBatch.length < count && attempts < 20) {
      attempts++;
      const dist = Math.random() * radiusMeters / 1000;
      const bearing = Math.random() * 360;
      const destination = turf.destination(centerPoint, dist, bearing);
      const [lng, lat] = destination.geometry.coordinates;

      const isDuplicate = [...spawnedResources, ...newBatch, ...lastSpawnLocations].some(r => 
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
      setSpawnedResources(prev => [...prev, ...newBatch]);
      setLastSpawnLocations(prev => [...newBatch.map(b => ({lat: b.lat, lng: b.lng})), ...prev].slice(0, 40));
    }
  }, [spawnedResources, lastSpawnLocations]);

  const addTerritory = useCallback((newPolygon, playerPos) => {
    setExploredTerritory(prev => {
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

  const collectResource = useCallback((id, type, amount = 1) => {
    setSpawnedResources(prev => prev.filter(r => r.id !== id));
    setResources(prev => ({
      ...prev,
      [type]: (prev[type] || 0) + amount
    }));
  }, []);

  const addBuilding = useCallback((type, cost, position = null) => {
    // We need to check resources and update them together
    setResources(prev => {
      const canAfford = Object.entries(cost).every(([res, amount]) => (prev[res] || 0) >= amount);
      if (canAfford) {
        const nextResources = { ...prev };
        Object.entries(cost).forEach(([res, amount]) => {
          nextResources[res] -= amount;
        });
        return nextResources;
      }
      return prev;
    });

    setBuildings(prevBuildings => {
      // Re-check resources using the current state in the closure
      const canAfford = Object.entries(cost).every(([res, amount]) => (resources[res] || 0) >= amount);
      
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
