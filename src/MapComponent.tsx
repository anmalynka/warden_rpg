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
  catType = 'grey-cat'
}: any) => {

  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<any>(null);
  const watchId = useRef<number | null>(null);
  const prevPos = useRef<[number, number] | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [playerPos, setPlayerPos] = useState<[number, number]>([0, 0]);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [nearbyResource, setNearbyResource] = useState<any>(null);
  const [failureMessage, setFailureMessage] = useState<string | null>(null);
  const [isSearchingGPS, setIsSearchingGPS] = useState(true);
  const [pendingCollections, setPendingCollections] = useState<any[]>([]); // Track 3min waits
  const [mousePos, setMousePos] = useState<{x: number, y: number} | null>(null);

  const updateMarkerToCat = (el: HTMLElement) => {
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
  };

  const zoom = 14.5;

  const assetMap: any = {
    wood: '/images/tools-wood.png',
    metal: '/images/tools-iron.png',
    coins: '/images/tools-coins.png'
  };

  // Helper to get time remaining for pending collections
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const getFogData = (center: any, territory: any) => {
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
  };

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    // Helper to update everything when position changes
    const updateGameStatePos = (newLng: number, newLat: number, map: any, marker: any) => {
      const currentPos: [number, number] = [newLng, newLat];
      
      // Calculate real distance for coin rewards if in TRIP mode
      if (prevPos.current && window.isTrippingGlobal) {
        const distMeters = turf.distance(
          turf.point(prevPos.current), 
          turf.point(currentPos), 
          { units: 'meters' }
        );
        // Only count if movement is significant (> 1m) to avoid GPS jitter
        if (distMeters > 1 && addWalkDistance) {
          addWalkDistance(distMeters);
        }
      }

      setPlayerPos(currentPos);
      if (marker) marker.setLngLat(currentPos);

      // Reveal territory: 50m radius around new position
      onAddTerritory(turf.circle(currentPos, 0.05, { steps: 16, units: 'kilometers' }), currentPos);
      
      if (map) {
        const bearing = prevPos.current ? turf.bearing(turf.point(prevPos.current), turf.point(currentPos)) : 0;
        if (window.isTrippingGlobal) {
          map.easeTo({ center: currentPos, bearing, duration: 800, easing: (t: any) => t });
        } else {
          map.easeTo({ center: currentPos, duration: 500 });
        }
      }
      prevPos.current = currentPos;
    };

    const initMap = (longitude: number, latitude: number) => {
      const center: [number, number] = [longitude, latitude];
      const map = new maplibregl.Map({
        container: mapContainer.current as HTMLDivElement,
        style: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json',
        center, zoom, attributionControl: false, maxZoom: 21, pitchWithRotate: true
      });
      mapRef.current = map;

      map.on('load', () => {
        setMapReady(true);
        map.resize();
        
        map.addSource('territory', { type: 'geojson', data: (exploredTerritory || { type: 'FeatureCollection', features: [] }) as any });
        map.addSource('fog-of-war', { type: 'geojson', data: getFogData(center, exploredTerritory) as any });

        map.addLayer({ id: 'territory-layer', type: 'fill', source: 'territory', paint: { 'fill-color': '#fff', 'fill-opacity': 0 } });
        map.addLayer({ id: 'fog-layer', type: 'fill', source: 'fog-of-war', paint: { 'fill-color': '#000', 'fill-opacity': 0.8 } });

        const el = document.createElement('div');
        el.className = 'player-marker';
        el.style.display = 'flex';
        el.style.alignItems = 'center';
        el.style.justifyContent = 'center';

        // Initial marker content
        if (window.isTrippingGlobal) {
           updateMarkerToCat(el);
        } else {
           el.innerHTML = `<img src="/images/grey-cat-avatar.png" style="width: 32px; height: 32px; object-fit: contain;" />`;
        }
        
        const marker = new maplibregl.Marker({ element: el, draggable: true })
          .setLngLat(center)
          .addTo(map);
        
        markerRef.current = marker;
        
        // Handle Map Clicks for Building Placement
        map.on('click', (e) => {
           if (window.isPlacingGlobal && window.pendingBuildingGlobal) {
              onPlaceBuilding(window.pendingBuildingGlobal.type, window.pendingBuildingGlobal.cost, [e.lngLat.lng, e.lngLat.lat]);
           }
        });

        map.on('mousemove', (e) => {
           setMousePos(e.point);
        });

        // Track GPS
        updateGameStatePos(longitude, latitude, map, marker);
      });
    };

    const handleGeoSuccess = (pos: GeolocationPosition) => {
      const { longitude, latitude } = pos.coords;
      setLocationError(null);
      setIsSearchingGPS(false);
      
      if (!mapRef.current) {
        initMap(longitude, latitude);
      } else {
        updateGameStatePos(longitude, latitude, mapRef.current, markerRef.current);
      }
    };

    const handleGeoError = (err: GeolocationPositionError) => {
      console.warn("GPS ERROR", err.code, err.message);
      setIsSearchingGPS(false);
      if (err.code === 3) {
        setLocationError("Searching for GPS... (Timeout)");
      } else if (err.code === 1) {
        setLocationError("GPS permission denied.");
      } else {
        setLocationError("GPS signal lost. Falling back.");
      }
      // Fallback for dev: simulate a position
      if (!mapRef.current) initMap(13.405, 52.520);
    };

    // Watch for real movement - Use more permissive options for Android
    const geoOptions = { 
      enableHighAccuracy: true, 
      timeout: 20000, // Longer timeout for initial lock
      maximumAge: 5000 
    };

    watchId.current = navigator.geolocation.watchPosition(handleGeoSuccess, (err) => {
      console.warn("Watch error, trying again...", err.message);
      // If high accuracy fails, try once without it to at least get a rough location
      navigator.geolocation.getCurrentPosition(handleGeoSuccess, handleGeoError, {
        ...geoOptions,
        enableHighAccuracy: false
      });
    }, geoOptions);

    return () => { 
      if (watchId.current) navigator.geolocation.clearWatch(watchId.current);
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; } 
    };
  }, []); 

  useEffect(() => {
    window.isTrippingGlobal = isTripping;
    window.isPlacingGlobal = isPlacing;
    window.pendingBuildingGlobal = pendingBuilding;
    const map = mapRef.current;
    if (!map || !mapReady || !map.isStyleLoaded()) return;

    // Update Player Marker Icon
    if (markerRef.current) {
      const el = markerRef.current.getElement();
      if (isTripping) {
        updateMarkerToCat(el);
      } else {
        el.innerHTML = `<img src="/images/grey-cat-avatar.png" style="width: 32px; height: 32px; object-fit: contain;" />`;
      }
    }
    
    // Get road layers to make them prominent
    const roadLayers = map.getStyle().layers.filter((l: any) => 
      l.id.includes('road') || l.id.includes('highway') || l.id.includes('bridge') || l.id.includes('tunnel')
    );

    if (isTripping) {
      const layers = map.getStyle().layers;
      layers.forEach((l: any) => { if (l.id.includes('label')) map.setLayoutProperty(l.id, 'visibility', 'none'); });
      
      // Make roads bright and thick for navigation in trip mode
      roadLayers.forEach((l: any) => {
        if (l.type === 'line') {
          map.setPaintProperty(l.id, 'line-color', '#fff');
          map.setPaintProperty(l.id, 'line-width', [
            'interpolate', ['linear'], ['zoom'],
            13, 2,
            18, 20
          ]);
          map.setPaintProperty(l.id, 'line-opacity', 0.9);
        }
      });

      map.easeTo({ pitch: 45, zoom: 17, bearing: 0, duration: 1500 });
    } else {
      const layers = map.getStyle().layers;
      layers.forEach((l: any) => { if (l.id.includes('label')) map.setLayoutProperty(l.id, 'visibility', 'visible'); });

      // Reset roads
      roadLayers.forEach((l: any) => {
        if (l.type === 'line') {
          map.setPaintProperty(l.id, 'line-color', '#fff');
          map.setPaintProperty(l.id, 'line-width', [
            'interpolate', ['linear'], ['zoom'],
            13, 1,
            18, 5
          ]);
          map.setPaintProperty(l.id, 'line-opacity', 0.5);
        }
      });

      map.easeTo({ pitch: 0, zoom: 14.5, bearing: 0, duration: 1500 });
    }
  }, [isTripping, mapReady]);

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

  const handleZoomIn = () => mapRef.current?.zoomIn();
  const handleZoomOut = () => mapRef.current?.zoomOut();
  const handleRecenter = () => {
    if (mapRef.current) {
      mapRef.current.easeTo({
        center: playerPos,
        duration: 1000
      });
    }
  };

  const handleCollectImmediate = () => {
    if (nearbyResource) {
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
      const finishTime = Date.now() + 3 * 60 * 1000; // 3 minutes

      setPendingCollections(prev => [...prev, {
        id,
        type,
        finishTime,
        startPos: [...playerPos]
      }]);

      // Hide resource from map immediately
      onSetSpawnedResources((prev: any[]) => prev.filter(r => r.id !== id));
      setNearbyResource(null);
    }
  };

  // Lock marker if collecting
  useEffect(() => {
    if (markerRef.current) {
      markerRef.current.setDraggable(pendingCollections.length === 0);
    }
  }, [pendingCollections.length]);

  // Check for movement during pending collection
  useEffect(() => {
    if (!pendingCollections.length) return;

    const checkMovement = setInterval(() => {
      pendingCollections.forEach(p => {
        const dist = turf.distance(turf.point(p.startPos), turf.point(playerPos), { units: 'meters' });
        if (dist > 50) {
          handleCancelCollection(p.id, "Distance limit exceeded");
        }
      });
    }, 2000);

    return () => clearInterval(checkMovement);
  }, [playerPos, handleCancelCollection, pendingCollections.length]);

  // Auto-finish delayed collections
  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      setPendingCollections(prev => {
        const finished = prev.filter(p => now >= p.finishTime);
        if (finished.length > 0) {
          finished.forEach(p => {
            onCollect(p.id, p.type, 10);
          });
        }
        return prev.filter(p => now < p.finishTime);
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [onCollect, pendingCollections.length]);

  // 1. PROXIMITY CHECK - Fast effect, only runs on player move
  useEffect(() => {
    // Only check proximity if we are in TRIP MODE and can actually collect
    if (!mapReady || !spawnedResources.length || !isTripping) {
      setNearbyResource(null);
      return;
    }
    
    console.log("Checking proximity for", spawnedResources.length, "resources at", playerPos);
    
    const closest = spawnedResources.find((res: any) => {
      const dist = turf.distance(turf.point(playerPos), turf.point([res.lng, res.lat]), { units: 'meters' });
      if (dist < 10) console.log(`Resource ${res.id} is ${dist.toFixed(2)}m away`);
      return dist < 1;
    });

    if (closest) console.log("Found nearby resource:", closest.type);
    setNearbyResource(closest || null);
  }, [playerPos, mapReady, spawnedResources, isTripping]);

  // 2. MARKER & FOG SYNC - Slower effect, runs only when resources or territory change
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const currentIds = new Set(spawnedResources.map((r: any) => r.id));
    
    // Filter out coins if not in TRIP mode
    const visibleResources = isTripping 
      ? spawnedResources 
      : spawnedResources.filter((r: any) => r.type !== 'coins');

    // Remove markers no longer in visibleResources
    Object.keys(resourceMarkers.current).forEach(id => { 
      const res = spawnedResources.find((r: any) => r.id === id);
      if (!res || (!isTripping && res.type === 'coins')) {
        resourceMarkers.current[id].remove(); 
        delete resourceMarkers.current[id]; 
      } 
    });

    // Add or update markers based on visibility and TRIP mode
    visibleResources.forEach((res: any) => {
      const inExplored = exploredTerritory ? turf.booleanPointInPolygon(turf.point([res.lng, res.lat]), exploredTerritory) : false;
      const distToPlayer = turf.distance(turf.point(playerPos), turf.point([res.lng, res.lat]), { units: 'kilometers' });
      const isVisible = inExplored || distToPlayer < 0.1;

      if (isVisible) {
        if (!resourceMarkers.current[res.id]) {
          const lng = Number(res.lng);
          const lat = Number(res.lat);
          if (isNaN(lng) || isNaN(lat)) return;

          const el = document.createElement('div');
          el.className = 'resource-marker-wrapper';
          el.style.width = '48px'; el.style.height = '48px';
          
          const inner = document.createElement('div');
          inner.className = 'flex items-center justify-center w-full h-full';
          
          if (isTripping) {
            // TRIP MODE: SHOW ACTUAL ITEM
            if (res.icon.includes('/')) {
              inner.style.backgroundImage = `url(${res.icon})`;
              inner.style.backgroundSize = 'contain';
              inner.style.backgroundPosition = 'center';
              inner.style.backgroundRepeat = 'no-repeat';
            } else {
              inner.innerHTML = `<span style="font-size: 32px;">${res.icon}</span>`;
            }
          } else {
            // EXPLORE MODE: SHOW ANONYMOUS BUBBLE
            el.style.width = '32px'; el.style.height = '32px';
            inner.innerHTML = `
              <div class="bg-white/80 border-2 border-[#8b7a6d] rounded-full w-full h-full flex items-center justify-center shadow-md">
                <span class="text-[10px] text-[#5d4a44] font-bold">?</span>
              </div>
            `;
          }
          
          el.appendChild(inner);
          
          try {
            resourceMarkers.current[res.id] = new maplibregl.Marker({ element: el }).setLngLat([lng, lat]).addTo(map);
          } catch (err) { console.error("Marker Error:", err); }
        } else {
          // Update existing marker icon if trip mode changed without re-mounting
          const marker = resourceMarkers.current[res.id];
          const inner = marker.getElement().firstChild as HTMLElement;
          if (isTripping) {
             marker.getElement().style.width = '48px'; marker.getElement().style.height = '48px';
             if (res.icon.includes('/')) {
              inner.style.backgroundImage = `url(${res.icon})`;
              inner.style.backgroundSize = 'contain';
              inner.innerHTML = '';
             } else {
              inner.style.backgroundImage = 'none';
              inner.innerHTML = `<span style="font-size: 32px;">${res.icon}</span>`;
             }
          } else {
             marker.getElement().style.width = '32px'; marker.getElement().style.height = '32px';
             inner.style.backgroundImage = 'none';
             inner.innerHTML = `
               <div class="bg-white/80 border-2 border-[#8b7a6d] rounded-full w-full h-full flex items-center justify-center shadow-md">
                 <span class="text-[10px] text-[#5d4a44] font-bold">?</span>
               </div>
             `;
          }
        }
      } else if (resourceMarkers.current[res.id]) {
        resourceMarkers.current[res.id].remove();
        delete resourceMarkers.current[res.id];
      }
    });

    if (map.getSource('territory')) (map.getSource('territory') as any).setData(exploredTerritory || { type: 'FeatureCollection', features: [] });
    if (map.getSource('fog-of-war')) (map.getSource('fog-of-war') as any).setData(getFogData(playerPos, exploredTerritory));
  }, [mapReady, exploredTerritory, spawnedResources, isTripping]);

  const resourceMarkers = useRef<any>({});
  const distanceFromStart = pendingCollections.length ? turf.distance(turf.point(pendingCollections[0].startPos), turf.point(playerPos), { units: 'meters' }) : 0;

  return (
    <div className="fixed inset-0 z-0 bg-[#08060d] pixel-art overflow-hidden" style={{ contain: 'paint' }}>
      <div className="absolute inset-0 z-[-1]" style={{ background: 'linear-gradient(to bottom, #9fb68d 0%, #cbd5e1 100%)', opacity: 0.5 }} />
      <div ref={mapContainer} className="w-full h-full" style={{ imageRendering: 'pixelated' }} />
      
      {/* HUD Controls - Moved to match village view (bottom left) */}
      <div className="fixed bottom-48 left-4 z-10 flex flex-col gap-2">
        <button onClick={handleZoomIn} className="w-12 h-12 btn-off-white flex items-center justify-center active:scale-95 p-2 pointer-events-auto">
          <img src="/images/zoom-in.png" className="w-full h-full object-contain" alt="Zoom In" />
        </button>
        <button onClick={handleZoomOut} className="w-12 h-12 btn-off-white flex items-center justify-center active:scale-95 p-2 pointer-events-auto">
          <img src="/images/zoom-out.png" className="w-full h-full object-contain" alt="Zoom Out" />
        </button>
        {isTripping && (
          <button
            onClick={handleRecenter}
            className="w-12 h-12 btn-off-white flex items-center justify-center active:scale-95 mt-2 p-2 pointer-events-auto"
          >
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
         {locationError && (
           <div className="parchment-panel p-2 text-red-600 text-[6px] shadow-lg">
             {locationError}
           </div>
         )}
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
               <button 
                 onClick={handleCollectImmediate} 
                 className="btn-off-white px-4 py-3 text-[8px] font-['Press_Start_2P'] active:scale-95 w-full flex items-center justify-center gap-2"
               >
                 <img src="/images/garden-pick.png" className="w-4 h-4 object-contain" alt="Pick" />
                 PICK 1 (NOW)
               </button>
               <button 
                 onClick={handleCollectDelayed} 
                 className="btn-off-white px-4 py-3 text-[8px] font-['Press_Start_2P'] active:scale-95 w-full flex items-center justify-center gap-2"
               >
                 <img src="/images/garden-pick.png" className="w-4 h-4 object-contain" alt="Pick" />
                 PICK 10 (WAIT 3 MIN)
               </button>
             </div>
          </div>
        </div>
      )}
      
      {/* Blocking Pending Modal */}
      {pendingCollections.length > 0 && (
        <div className="absolute inset-0 z-[7000] flex items-center justify-center bg-black/40 backdrop-blur-sm">
           <div className="parchment-panel p-8 flex flex-col items-center gap-6 max-w-[300px] w-full text-center relative">
              <button 
                onClick={() => handleCancelCollection(pendingCollections[0].id, "Cancelled")}
                className="absolute top-4 right-4 w-8 h-8 btn-off-white flex items-center justify-center text-[10px]"
              >
                X
              </button>
              <div className="text-[#5d4a44] text-[12px] font-['Press_Start_2P'] uppercase">COLLECTING...</div>
              <div className="flex flex-col gap-2 items-center">
                <div className="text-[#8b7a6d] text-[10px] font-['Press_Start_2P']">
                   {Math.max(0, Math.floor((pendingCollections[0].finishTime - now) / 1000))}s
                </div>
                <div className="w-48 h-4 bg-[#e6ded5] rounded-full overflow-hidden border-2 border-[#8b7a6d]">
                  <div 
                    className="h-full bg-blue-500 transition-all duration-1000" 
                    style={{ width: `${Math.max(0, 100 - ((pendingCollections[0].finishTime - now) / (3 * 60 * 1000)) * 100)}%` }}
                  ></div>
                </div>
              </div>
              <div className="text-[8px] text-[#8b7a6d] uppercase">STAY WITHIN 50M OF START POS</div>
              {distanceFromStart > 50 && (
                <div className="text-red-600 text-[8px] font-bold animate-pulse">TOO FAR! RETURN NOW!</div>
              )}
           </div>
        </div>
      )}

      {/* Failure Message Overlay */}
      {failureMessage && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[8000] bg-red-600 border-4 border-black p-6 shadow-2xl animate-bounce">
           <div className="text-white text-[12px] font-['Press_Start_2P'] text-center leading-relaxed">
             {failureMessage}
           </div>
        </div>
      )}

      {/* Ghost Building Placement Feedback */}
      {isPlacing && pendingBuilding && mousePos && (
        <div 
          className="absolute pointer-events-none z-[9000] transition-transform duration-75"
          style={{
            left: mousePos.x,
            top: mousePos.y,
            transform: 'translate(-50%, -50%)',
            opacity: 0.7
          }}
        >
          <div className="flex flex-col items-center gap-2">
            {pendingBuilding.type === 'garden-bed' || pendingBuilding.type === 'garden-tree' ? (
              <div className="bg-red-600/90 text-white text-[6px] p-1 font-['Press_Start_2P'] border-2 border-white whitespace-nowrap">
                VILLAGE ONLY
              </div>
            ) : (
              <div className="bg-green-600/90 text-white text-[6px] p-1 font-['Press_Start_2P'] border-2 border-white whitespace-nowrap animate-pulse">
                CLICK TO PLACE
              </div>
            )}
            
            {pendingBuilding.type === 'garden-bed' ? (
              <img 
                src="/images/garden-bed-wheat-1.png" 
                className="w-12 h-12 object-contain grayscale opacity-50" 
                alt="Ghost Garden Bed"
              />
            ) : pendingBuilding.type === 'garden-tree' ? (
              <img 
                src="/images/garden-apple-1.png" 
                className="w-12 h-12 object-contain grayscale opacity-50" 
                alt="Ghost Garden Tree"
              />
            ) : pendingBuilding.type === 'starter-house' ? (
              <img src="/images/house.png" className="w-12 h-12 object-contain grayscale opacity-50" alt="Ghost House" />
            ) : pendingBuilding.type === 'mini-house' ? (
              <img src="/images/mini-house.png" className="w-12 h-12 object-contain grayscale opacity-50" alt="Ghost Mini House" />
            ) : pendingBuilding.type === 'shop' ? (
              <img src="/images/Shop.png" className="w-12 h-12 object-contain grayscale opacity-50" alt="Ghost Shop" />
            ) : pendingBuilding.type === 'market' ? (
              <img src="/images/Market.png" className="w-12 h-12 object-contain grayscale opacity-50" alt="Ghost Market" />
            ) : pendingBuilding.type === 'hotel' ? (
              <img src="/images/Storage.png" className="w-12 h-12 object-contain grayscale opacity-50" alt="Ghost Hotel" />
            ) : (
              <span className="text-5xl">
                {getBuildingEmoji(pendingBuilding.type)}
              </span>
            )}
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
