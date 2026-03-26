import React, { useState, useEffect, useRef, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import * as turf from '@turf/turf';
import { ResourceItem } from './HUD';

const MapComponent = ({
  isTripping = false,
  onToggleTrip,
  exploredTerritory,
  onAddTerritory,
  spawnedResources = [],
  onSetSpawnedResources,
  onCollect,
  resources = { wood: 0, metal: 0, coins: 0 },
  setResources,
  addWalkDistance,
  totalDistanceWalked = 0,
  isPlacing = false,
  pendingBuilding = null,
  onPlaceBuilding,
  buildings = [],
  catType = 'grey-cat',
  devMode = false
}: any) => {

  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<any>(null);
  const prevPos = useRef<[number, number] | null>(null);
  const resourceMarkers = useRef<any>({});
  
  const [mapReady, setMapReady] = useState(false);
  const [playerPos, setPlayerPos] = useState<[number, number]>([0, 0]);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [nearbyResource, setNearbyResource] = useState<any>(null);
  const [failureMessage, setFailureMessage] = useState<string | null>(null);
  const [isSearchingGPS, setIsSearchingGPS] = useState(true);
  const [pendingCollections, setPendingCollections] = useState<any[]>([]);
  const [mousePos, setMousePos] = useState<{x: number, y: number} | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const zoom = 14.5;

  // Stable Refs for callbacks and props used in timers/gps
  const propsRef = useRef({ 
    onAddTerritory, 
    addWalkDistance, 
    onCollect, 
    onSetSpawnedResources, 
    onPlaceBuilding,
    isTripping,
    isPlacing,
    pendingBuilding,
    devMode,
    catType,
    spawnedResources,
    playerPos,
    exploredTerritory
  });

  useEffect(() => {
    propsRef.current = { 
      onAddTerritory, 
      addWalkDistance, 
      onCollect, 
      onSetSpawnedResources, 
      onPlaceBuilding,
      isTripping,
      isPlacing,
      pendingBuilding,
      devMode,
      catType,
      spawnedResources,
      playerPos,
      exploredTerritory
    };
  }, [onAddTerritory, addWalkDistance, onCollect, onSetSpawnedResources, onPlaceBuilding, isTripping, isPlacing, pendingBuilding, devMode, catType, spawnedResources, playerPos, exploredTerritory]);

  const updateMarkerToCat = useCallback((el: HTMLElement) => {
    el.innerHTML = `
      <div style="width: 96px; height: 96px; transform-origin: center center; overflow: hidden; position: relative; image-rendering: pixelated; image-rendering: crisp-edges;">
        <style>
          @keyframes map-cat-walk {
            from { background-position-x: 0px; }
            to { background-position-x: -576px; }
          }
        </style>
        <div style="
          width: 576px; height: 384px; 
          background-image: url('/images/${catType}.png'); 
          background-repeat: no-repeat; 
          position: absolute; 
          image-rendering: pixelated; 
          image-rendering: crisp-edges;
          background-position-y: 0px; 
          animation: map-cat-walk 0.8s steps(6) infinite;
          transform: translateZ(0);
          background-size: 576px 384px;
        "></div>
      </div>
    `;
  }, [catType]);

  const getFogData = useCallback((center: any, territory: any) => {
    const world = turf.polygon([[[-180, -90], [180, -90], [180, 90], [-180, 90], [-180, -90]]]);
    const playerCircle = turf.circle(center, 0.005, { steps: 32, units: 'kilometers' });
    let visibleArea: any = playerCircle;
    if (territory) { 
      try { 
        const unionResult = turf.union(turf.featureCollection([visibleArea, territory]));
        if (unionResult) visibleArea = unionResult;
      } catch (e) {
        console.warn("Fog Union error", e);
      } 
    }
    return turf.difference(turf.featureCollection([world, visibleArea]));
  }, []);

  const updateGameStatePos = useCallback((newLng: number, newLat: number, map: any, marker: any) => {
    const currentPos: [number, number] = [newLng, newLat];
    const { onAddTerritory, addWalkDistance, isTripping } = propsRef.current;
    
    if (prevPos.current && isTripping) {
      const distMeters = turf.distance(
        turf.point(prevPos.current), 
        turf.point(currentPos), 
        { units: 'meters' }
      );
      if (distMeters > 1 && addWalkDistance) {
        addWalkDistance(distMeters);
      }
    }

    setPlayerPos(currentPos);
    if (marker) marker.setLngLat(currentPos);
    if (onAddTerritory) {
      onAddTerritory(turf.circle(currentPos, 0.05, { steps: 16, units: 'kilometers' }), currentPos);
    }
    
    if (map) {
      const bearing = prevPos.current ? turf.bearing(turf.point(prevPos.current), turf.point(currentPos)) : 0;
      if (isTripping) {
        map.easeTo({ center: currentPos, bearing, duration: 800, easing: (t: any) => t });
      } else {
        map.easeTo({ center: currentPos, duration: 500 });
      }
    }
    prevPos.current = currentPos;
  }, []);

  const initMap = useCallback((longitude: number, latitude: number) => {
    if (!mapContainer.current || mapRef.current) return;
    
    const center: [number, number] = [longitude, latitude];
    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json',
      center, zoom, attributionControl: false, maxZoom: 21, pitchWithRotate: true
    });
    mapRef.current = map;

    map.on('load', () => {
      setMapReady(true);
      map.resize();
      
      const { exploredTerritory, isTripping } = propsRef.current;
      
      map.addSource('territory', { type: 'geojson', data: (exploredTerritory || { type: 'FeatureCollection', features: [] }) as any });
      map.addSource('fog-of-war', { type: 'geojson', data: getFogData(center, exploredTerritory) as any });

      map.addLayer({ id: 'territory-layer', type: 'fill', source: 'territory', paint: { 'fill-color': '#fff', 'fill-opacity': 0 } });
      map.addLayer({ id: 'fog-layer', type: 'fill', source: 'fog-of-war', paint: { 'fill-color': '#000', 'fill-opacity': 0.8 } });

      const el = document.createElement('div');
      el.className = 'player-marker';
      el.style.display = 'flex';
      el.style.alignItems = 'center';
      el.style.justifyContent = 'center';

      if (isTripping) {
         updateMarkerToCat(el);
      } else {
         el.innerHTML = `<img src="/images/grey-cat-avatar.png" style="width: 32px; height: 32px; object-fit: contain;" />`;
      }
      
      const marker = new maplibregl.Marker({ element: el, draggable: true })
        .setLngLat(center)
        .addTo(map);
      
      markerRef.current = marker;
      updateGameStatePos(longitude, latitude, map, marker);
      
      // Events
      map.on('click', (e) => {
        const { isPlacing, pendingBuilding, onPlaceBuilding, devMode } = propsRef.current;
        if (isPlacing && pendingBuilding && onPlaceBuilding) {
          onPlaceBuilding(pendingBuilding.type, pendingBuilding.cost, [e.lngLat.lng, e.lngLat.lat]);
        } else if (devMode) {
          updateGameStatePos(e.lngLat.lng, e.lngLat.lat, mapRef.current, markerRef.current);
        }
      });
      map.on('mousemove', (e) => setMousePos(e.point));
    });
  }, [getFogData, updateGameStatePos, updateMarkerToCat]);

  // GPS WATCHER (Runs once)
  useEffect(() => {
    let watchId: number | null = null;
    let mapInitialized = false;

    const handleGeoSuccess = (pos: GeolocationPosition) => {
      const { longitude, latitude } = pos.coords;
      setLocationError(null);
      setIsSearchingGPS(false);
      
      if (!mapRef.current && !mapInitialized) {
        mapInitialized = true;
        initMap(longitude, latitude);
      } else if (mapRef.current) {
        // Only update automatically if not in devMode or just following GPS
        const { devMode } = propsRef.current;
        if (!devMode) {
          updateGameStatePos(longitude, latitude, mapRef.current, markerRef.current);
        }
      }
    };

    const handleGeoError = (err: GeolocationPositionError) => {
      console.warn("GPS ERROR", err.code, err.message);
      setIsSearchingGPS(false);
      if (err.code === 3) setLocationError("Searching for GPS... (Timeout)");
      else if (err.code === 1) setLocationError("GPS permission denied.");
      else setLocationError("GPS signal lost. Falling back.");

      if (!mapRef.current && !mapInitialized) {
        mapInitialized = true;
        initMap(13.405, 52.520);
      }
    };

    const geoOptions = { enableHighAccuracy: true, timeout: 20000, maximumAge: 5000 };
    
    if (navigator.geolocation) {
      watchId = navigator.geolocation.watchPosition(handleGeoSuccess, (err) => {
        console.warn("Watch failed, fallback to current pos", err.message);
        navigator.geolocation.getCurrentPosition(handleGeoSuccess, handleGeoError, { ...geoOptions, enableHighAccuracy: false });
      }, geoOptions);
    } else {
      handleGeoError({ code: 0, message: "Geo not supported" } as any);
    }

    const safetyTimer = setTimeout(() => {
      if (!mapInitialized && !mapRef.current) {
        console.warn("Safety timeout hit");
        handleGeoError({ code: 3, message: "Timeout" } as any);
      }
    }, 15000);

    return () => { 
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      clearTimeout(safetyTimer);
      if (mapRef.current) { 
        mapRef.current.remove(); 
        mapRef.current = null; 
      } 
    };
  }, []); // Run only once

  // MODE STYLING & MARKER RE-SYNC
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const { isTripping, catType } = propsRef.current;

    // Sync Marker Content
    if (markerRef.current) {
      const el = markerRef.current.getElement();
      if (isTripping) updateMarkerToCat(el);
      else el.innerHTML = `<img src="/images/grey-cat-avatar.png" style="width: 32px; height: 32px; object-fit: contain;" />`;
    }

    // Sync Map Style
    const roadLayers = map.getStyle().layers.filter((l: any) => 
      l.id.includes('road') || l.id.includes('highway') || l.id.includes('bridge') || l.id.includes('tunnel')
    );

    if (isTripping) {
      map.getStyle().layers.forEach((l: any) => { if (l.id.includes('label')) map.setLayoutProperty(l.id, 'visibility', 'none'); });
      roadLayers.forEach((l: any) => {
        if (l.type === 'line') {
          map.setPaintProperty(l.id, 'line-color', '#fff');
          map.setPaintProperty(l.id, 'line-width', ['interpolate', ['linear'], ['zoom'], 13, 2, 18, 20]);
          map.setPaintProperty(l.id, 'line-opacity', 0.9);
        }
      });
      map.easeTo({ pitch: 45, zoom: 17, duration: 1000 });
    } else {
      map.getStyle().layers.forEach((l: any) => { if (l.id.includes('label')) map.setLayoutProperty(l.id, 'visibility', 'visible'); });
      roadLayers.forEach((l: any) => {
        if (l.type === 'line') {
          map.setPaintProperty(l.id, 'line-color', '#fff');
          map.setPaintProperty(l.id, 'line-width', ['interpolate', ['linear'], ['zoom'], 13, 1, 18, 5]);
          map.setPaintProperty(l.id, 'line-opacity', 0.5);
        }
      });
      map.easeTo({ pitch: 0, zoom: 14.5, duration: 1000 });
    }
  }, [isTripping, mapReady, catType, updateMarkerToCat]);

  // RESOURCE MARKERS SYNC
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const { isTripping, spawnedResources, playerPos, exploredTerritory } = propsRef.current;
    
    const visibleResources = isTripping 
      ? spawnedResources 
      : spawnedResources.filter((r: any) => r.type !== 'coins');

    // Remove old
    Object.keys(resourceMarkers.current).forEach(id => { 
      if (!spawnedResources.find((r: any) => r.id === id)) {
        resourceMarkers.current[id].remove(); 
        delete resourceMarkers.current[id]; 
      } 
    });

    // Add/Update
    visibleResources.forEach((res: any) => {
      const inExplored = exploredTerritory ? turf.booleanPointInPolygon(turf.point([res.lng, res.lat]), exploredTerritory) : false;
      const distToPlayer = turf.distance(turf.point(playerPos), turf.point([res.lng, res.lat]), { units: 'kilometers' });
      const isVisible = inExplored || distToPlayer < 0.1;

      if (isVisible) {
        if (!resourceMarkers.current[res.id]) {
          const el = document.createElement('div');
          el.className = 'resource-marker-wrapper';
          el.style.width = isTripping ? '48px' : '32px';
          el.style.height = isTripping ? '48px' : '32px';
          const inner = document.createElement('div');
          inner.className = 'flex items-center justify-center w-full h-full';
          if (isTripping) {
            if (res.icon.includes('/')) {
              inner.style.backgroundImage = `url(${res.icon})`;
              inner.style.backgroundSize = 'contain';
              inner.style.backgroundRepeat = 'no-repeat';
              inner.style.backgroundPosition = 'center';
            } else {
              inner.innerHTML = `<span style="font-size: 32px;">${res.icon}</span>`;
            }
          } else {
            inner.innerHTML = `<div class="bg-white/80 border-2 border-[#8b7a6d] rounded-full w-full h-full flex items-center justify-center shadow-md"><span class="text-[10px] text-[#5d4a44] font-bold">?</span></div>`;
          }
          el.appendChild(inner);
          resourceMarkers.current[res.id] = new maplibregl.Marker({ element: el }).setLngLat([res.lng, res.lat]).addTo(map);
        } else {
          // Sync size/icon if mode changed
          const marker = resourceMarkers.current[res.id];
          const el = marker.getElement();
          const inner = el.firstChild as HTMLElement;
          el.style.width = isTripping ? '48px' : '32px';
          el.style.height = isTripping ? '48px' : '32px';
          if (isTripping && !inner.style.backgroundImage && res.icon.includes('/')) {
             inner.style.backgroundImage = `url(${res.icon})`;
             inner.style.backgroundSize = 'contain';
             inner.style.backgroundRepeat = 'no-repeat';
             inner.style.backgroundPosition = 'center';
             inner.innerHTML = '';
          } else if (!isTripping && inner.style.backgroundImage) {
             inner.style.backgroundImage = 'none';
             inner.innerHTML = `<div class="bg-white/80 border-2 border-[#8b7a6d] rounded-full w-full h-full flex items-center justify-center shadow-md"><span class="text-[10px] text-[#5d4a44] font-bold">?</span></div>`;
          }
        }
      } else if (resourceMarkers.current[res.id]) {
        resourceMarkers.current[res.id].remove();
        delete resourceMarkers.current[res.id];
      }
    });

    // Territory & Fog Data Update
    if (map.getSource('territory')) (map.getSource('territory') as any).setData(exploredTerritory || { type: 'FeatureCollection', features: [] });
    if (map.getSource('fog-of-war')) (map.getSource('fog-of-war') as any).setData(getFogData(playerPos, exploredTerritory));
  }, [mapReady, isTripping, spawnedResources, playerPos, exploredTerritory, getFogData]);

  // PROXIMITY CHECK & TIMERS
  useEffect(() => {
    if (!mapReady || !spawnedResources.length) { setNearbyResource(null); return; }
    const closest = spawnedResources.find((res: any) => {
      const dist = turf.distance(turf.point(playerPos), turf.point([res.lng, res.lat]), { units: 'meters' });
      return dist <= 2;
    });
    setNearbyResource(closest || null);
  }, [playerPos, mapReady, spawnedResources]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const handleCollectImmediate = () => {
    if (nearbyResource && onCollect) {
      onCollect(nearbyResource.id, nearbyResource.type, 1);
      setNearbyResource(null);
    }
  };

  const handleCancelCollection = useCallback((id: string, reason = "Cancelled") => {
    setPendingCollections(prev => prev.filter(p => p.id !== id));
    setFailureMessage(`${reason.toUpperCase()}!`);
    setTimeout(() => setFailureMessage(null), 3000);
  }, []);

  const handleCollectDelayed = () => {
    if (nearbyResource) {
      const { id, type } = nearbyResource;
      setPendingCollections(prev => [...prev, { id, type, finishTime: Date.now() + 3 * 60 * 1000, startPos: [...playerPos] }]);
      if (onSetSpawnedResources) onSetSpawnedResources((prev: any[]) => prev.filter(r => r.id !== id));
      setNearbyResource(null);
    }
  };

  useEffect(() => {
    if (!pendingCollections.length) return;
    const checkInterval = setInterval(() => {
      pendingCollections.forEach(p => {
        const dist = turf.distance(turf.point(p.startPos), turf.point(playerPos), { units: 'meters' });
        if (dist > 50) handleCancelCollection(p.id, "Distance limit exceeded");
      });
    }, 2000);
    return () => clearInterval(checkInterval);
  }, [playerPos, handleCancelCollection, pendingCollections.length]);

  useEffect(() => {
    const timer = setInterval(() => {
      const currentTime = Date.now();
      setPendingCollections(prev => {
        const finished = prev.filter(p => currentTime >= p.finishTime);
        if (finished.length > 0) finished.forEach(p => onCollect && onCollect(p.id, p.type, 10));
        return prev.filter(p => currentTime < p.finishTime);
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [onCollect]);

  const handleZoomIn = () => mapRef.current?.zoomIn();
  const handleZoomOut = () => mapRef.current?.zoomOut();
  const handleRecenter = () => {
    if (mapRef.current) mapRef.current.easeTo({ center: playerPos, duration: 1000 });
  };

  const getBuildingEmoji = (type: string) => {
    switch (type) {
      case 'starter-house': return '🏠';
      case 'apple-tree': return '🍎';
      case 'field-tiles': return '🌾';
      case 'well': return '⛲';
      case 'fence': return '🚧';
      case 'garden': return '🌻';
      case 'garden-tree': return '🌳';
      case 'garden-bed': return '🌱';
      case 'barn': return '🛖';
      default: return '🏠';
    }
  };

  const distanceFromStart = pendingCollections.length ? turf.distance(turf.point(pendingCollections[0].startPos), turf.point(playerPos), { units: 'meters' }) : 0;

  return (
    <div className="fixed inset-0 z-0 bg-[#08060d] pixel-art overflow-hidden" style={{ contain: 'paint' }}>
      <div className="absolute inset-0 z-[-1]" style={{ background: 'linear-gradient(to bottom, #9fb68d 0%, #cbd5e1 100%)', opacity: 0.5 }} />
      <div ref={mapContainer} className="w-full h-full" style={{ imageRendering: 'pixelated' }} />
      
      <div className="fixed bottom-48 left-4 z-10 flex flex-col gap-2">
        <button onClick={handleZoomIn} className="w-12 h-12 btn-off-white flex items-center justify-center p-2 pointer-events-auto active:scale-95">
          <img src="/images/zoom-in.png" className="w-full h-full object-contain" alt="Zoom In" />
        </button>
        <button onClick={handleZoomOut} className="w-12 h-12 btn-off-white flex items-center justify-center p-2 pointer-events-auto active:scale-95">
          <img src="/images/zoom-out.png" className="w-full h-full object-contain" alt="Zoom Out" />
        </button>
        {isTripping && (
          <button onClick={handleRecenter} className="w-12 h-12 btn-off-white flex items-center justify-center mt-2 p-2 pointer-events-auto active:scale-95">
            <img src="/images/recenter.png" className="w-full h-full object-contain" alt="Recenter" />
          </button>
        )}
      </div>

      {isTripping && (
        <div className="absolute top-4 left-0 right-0 px-4 z-[5000] pointer-events-none">
           <div className="bg-[#f9f5f0] p-2 rounded-full flex justify-around shadow-xl max-w-sm mx-auto pointer-events-auto">
              <ResourceItem iconUrl="/images/tools-wood.png" value={resources?.wood || 0} label="Wood" />
              <ResourceItem iconUrl="/images/tools-iron.png" value={resources?.metal || 0} label="Metal" />
              <ResourceItem iconUrl="/images/tools-coins.png" value={resources?.coins || 0} label="Coins" />
           </div>
        </div>
      )}

      <div className="absolute top-24 left-4 z-10 pointer-events-none flex flex-col gap-2 font-['Press_Start_2P']">
         {isSearchingGPS && (
           <div className="parchment-panel p-2 text-blue-600 text-[6px] shadow-lg flex items-center gap-2 animate-pulse">
             <div className="w-1.5 h-1.5 bg-blue-600 rounded-full animate-ping"></div>
             SEARCHING FOR GPS...
           </div>
         )}
         {locationError && <div className="parchment-panel p-2 text-red-600 text-[6px] shadow-lg">{locationError}</div>}
         <div className="parchment-panel p-2 text-[#5d4a44] text-[8px] shadow-lg flex flex-col gap-1">
           <div className="flex items-center gap-2">
             {isScanning && <div className="w-2 h-2 bg-[#e9d681] animate-ping rounded-full"></div>}
             {isTripping ? 'STREET' : 'EXPLORE'}
           </div>
           {isTripping && (
             <div className="text-[6px] opacity-70 flex flex-col gap-1">
               <div>{nearbyResource ? `NEARBY: ${nearbyResource.type}` : 'NO RESOURCE NEARBY'}</div>
               <div className="text-blue-600">WALKED: {totalDistanceWalked.toFixed(0)}m ({100 - Number((totalDistanceWalked % 100).toFixed(0))}m TO 10🪙)</div>
             </div>
           )}
         </div>
      </div>

      {nearbyResource && (
        <div className="absolute inset-0 z-[6000] flex items-center justify-center bg-black/20">
          <div className="parchment-panel p-6 flex flex-col items-center gap-4 max-w-[280px] w-full pointer-events-auto">
             <div className="text-4xl">
               {nearbyResource.icon.includes('/') ? <img src={nearbyResource.icon} className="w-16 h-16 object-contain" alt="Resource" /> : nearbyResource.icon}
             </div>
             <div className="text-[#5d4a44] text-[10px] text-center font-['Press_Start_2P'] uppercase">FOUND {nearbyResource.type}!</div>
             <div className="flex flex-col gap-3 w-full">
               <button onClick={handleCollectImmediate} className="btn-off-white px-4 py-3 text-[8px] font-['Press_Start_2P'] active:scale-95 w-full flex items-center justify-center gap-2">
                 <img src="/images/garden-pick.png" className="w-4 h-4 object-contain" alt="Pick" /> PICK 1 (NOW)
               </button>
               <button onClick={handleCollectDelayed} className="btn-off-white px-4 py-3 text-[8px] font-['Press_Start_2P'] active:scale-95 w-full flex items-center justify-center gap-2">
                 <img src="/images/garden-pick.png" className="w-4 h-4 object-contain" alt="Pick" /> PICK 10 (WAIT 3 MIN)
               </button>
             </div>
          </div>
        </div>
      )}

      {pendingCollections.length > 0 && (
        <div className="absolute inset-0 z-[7000] flex items-center justify-center bg-black/40 backdrop-blur-sm">
           <div className="parchment-panel p-8 flex flex-col items-center gap-6 max-w-[300px] w-full text-center relative">
              <button onClick={() => handleCancelCollection(pendingCollections[0].id, "Cancelled")} className="absolute top-4 right-4 w-8 h-8 btn-off-white flex items-center justify-center text-[10px]">X</button>
              <div className="text-[#5d4a44] text-[12px] font-['Press_Start_2P'] uppercase">COLLECTING...</div>
              <div className="flex flex-col gap-2 items-center">
                <div className="text-[#8b7a6d] text-[10px] font-['Press_Start_2P']">{Math.max(0, Math.floor((pendingCollections[0].finishTime - now) / 1000))}s</div>
                <div className="w-48 h-4 bg-[#e6ded5] rounded-full overflow-hidden border-2 border-[#8b7a6d]">
                  <div className="h-full bg-blue-500 transition-all duration-1000" style={{ width: `${Math.max(0, 100 - ((pendingCollections[0].finishTime - now) / (3 * 60 * 1000)) * 100)}%` }}></div>
                </div>
              </div>
              <div className="text-[8px] text-[#8b7a6d] uppercase">STAY WITHIN 50M OF START POS</div>
              {distanceFromStart > 50 && <div className="text-red-600 text-[8px] font-bold animate-pulse">TOO FAR! RETURN NOW!</div>}
           </div>
        </div>
      )}

      {failureMessage && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[8000] bg-red-600 border-4 border-black p-6 shadow-2xl animate-bounce">
           <div className="text-white text-[12px] font-['Press_Start_2P'] text-center leading-relaxed">{failureMessage}</div>
        </div>
      )}

      {isPlacing && pendingBuilding && mousePos && (
        <div className="absolute pointer-events-none z-[9000] transition-transform duration-75" style={{ left: mousePos.x, top: mousePos.y, transform: 'translate(-50%, -50%)', opacity: 0.7 }}>
          <div className="flex flex-col items-center gap-2">
            <div className="bg-green-600/90 text-white text-[6px] p-1 font-['Press_Start_2P'] border-2 border-white whitespace-nowrap animate-pulse">CLICK TO PLACE</div>
            <span className="text-5xl">{getBuildingEmoji(pendingBuilding.type)}</span>
          </div>
        </div>
      )}

      <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-4">
        <button onClick={onToggleTrip} className="px-8 py-4 font-['Press_Start_2P'] text-[10px] btn-off-white">
          {isTripping ? 'EXIT TRIP' : 'START TRIP'}
        </button>
      </div>
    </div>
  );
};

export default MapComponent;
