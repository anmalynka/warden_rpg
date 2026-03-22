import React, { useEffect, useRef, useState, useCallback } from 'react';
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
  resources = { wood: 0, metal: 0, pebbles: 0, coins: 0 },
  setResources,
  addWalkDistance,
  totalDistanceWalked = 0,
  isPlacing = false,
  pendingBuilding = null,
  onPlaceBuilding,
  buildings = []
}) => {

  const mapContainer = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const resourceMarkers = useRef({});
  const buildingMarkers = useRef({});
  const prevPos = useRef(null);
  const lastFetchRef = useRef(0);
  const watchId = useRef(null);
  const isDraggingRef = useRef(false);
  
  const [playerPos, setPlayerPos] = useState([0, 0]);
  const [nearbyResource, setNearbyResource] = useState(null);
  const [isScanning, setIsScanning] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [locationError, setLocationError] = useState(null);
  const [failureMessage, setFailureMessage] = useState(null);
  const [pendingCollections, setPendingCollections] = useState([]); // Track 3min waits

  const zoom = 14.5;

  const assetMap = {
    wood: '/images/Tree1.png',
    metal: '/images/Bush_red_flowers1.png',
    pebbles: '/images/Broken_tree1.png',
    coins: '🪙'
  };

  // Helper to get time remaining for pending collections
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const getFogData = (center, territory) => {
    const world = turf.polygon([[[-180, -90], [180, -90], [180, 90], [-180, 90], [-180, -90]]]);
    const playerCircle = turf.circle(center, 0.005, { steps: 32, units: 'kilometers' });
    let visibleArea = playerCircle;
    if (territory) { 
      try { 
        visibleArea = turf.union(turf.featureCollection([visibleArea, territory])); 
      } catch (e) {
        console.warn("Fog Union error", e);
      } 
    }
    return turf.difference(turf.featureCollection([world, visibleArea]));
  };

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    // Helper to update everything when position changes
    const updateGameStatePos = (newLng, newLat, map, marker) => {
      const currentPos = [newLng, newLat];
      
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
          map.easeTo({ center: currentPos, bearing, duration: 800, easing: (t) => t });
        } else {
          map.easeTo({ center: currentPos, duration: 500 });
        }
      }
      prevPos.current = currentPos;
    };

    const initMap = (longitude, latitude) => {
      const center = [longitude, latitude];
      const map = new maplibregl.Map({
        container: mapContainer.current,
        style: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json',
        center, zoom, attributionControl: false, maxZoom: 21, pitchWithRotate: true, antialias: true
      });
      mapRef.current = map;

      map.on('load', () => {
        setMapReady(true);
        map.resize();
        
        map.addSource('territory', { type: 'geojson', data: exploredTerritory || { type: 'FeatureCollection', features: [] } });
        map.addSource('fog-of-war', { type: 'geojson', data: getFogData(center, exploredTerritory) });
        map.addLayer({ id: 'territory-layer', type: 'fill', source: 'territory', paint: { 'fill-color': '#9fb68d', 'fill-opacity': 0.3 }});
        map.addLayer({ id: 'fog-layer', type: 'fill', source: 'fog-of-war', paint: { 'fill-color': '#cbd5e1', 'fill-opacity': 0.85 }});

        const el = document.createElement('div');
        el.className = 'player-marker-pin';
        el.style.fontSize = '40px';
        el.style.filter = 'drop-shadow(0 0 10px rgba(170, 59, 255, 0.5))';
        el.innerHTML = '🛡️';
        
        const marker = new maplibregl.Marker({ element: el, draggable: true })
          .setLngLat(center)
          .addTo(map);
        markerRef.current = marker;

        // Sync initial state
        updateGameStatePos(longitude, latitude, map, marker, true);

        // Manual movement listeners
        marker.on('dragstart', () => {
          isDraggingRef.current = true;
        });

        marker.on('dragend', () => {
          isDraggingRef.current = false;
          const pos = marker.getLngLat();
          updateGameStatePos(pos.lng, pos.lat, map, marker);
        });

        map.on('dblclick', (e) => {
          updateGameStatePos(e.lngLat.lng, e.lngLat.lat, map, marker);
        });

        map.on('click', (e) => {
          // Since this is in an event listener, we need to check the current value of isPlacing
          // But since the listener is created once in initMap, we'll use a window variable 
          // or a ref for the latest isPlacing value to avoid closure issues.
          if (window.isPlacingGlobal && window.pendingBuildingGlobal) {
            onPlaceBuilding(
              window.pendingBuildingGlobal.type, 
              window.pendingBuildingGlobal.cost, 
              e.lngLat.lat, 
              e.lngLat.lng
            );
          }
        });
      });
    };

    const handleGeoSuccess = (position) => {
      if (isDraggingRef.current) return;
      setLocationError(null);
      const { longitude, latitude } = position.coords;
      if (!mapRef.current) {
        initMap(longitude, latitude);
      } else {
        updateGameStatePos(longitude, latitude, mapRef.current, markerRef.current);
      }
    };

    const handleGeoError = (error) => {
      console.warn("Geolocation Error:", error.message);
      setLocationError("GPS signal lost. Using last known location.");
      if (!mapRef.current) initMap(24.02, 49.84); // Fallback to Lviv
    };

    // Watch for real movement
    watchId.current = navigator.geolocation.watchPosition(handleGeoSuccess, (err) => {
      navigator.geolocation.getCurrentPosition(handleGeoSuccess, handleGeoError, {
        enableHighAccuracy: false,
        timeout: 5000
      });
    }, { 
      enableHighAccuracy: true, 
      timeout: 10000,
      maximumAge: 5000 
    });

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
    
    // Get road layers to make them prominent
    const roadLayers = map.getStyle().layers.filter(l => 
      l.id.includes('road') || l.id.includes('highway') || l.id.includes('bridge') || l.id.includes('tunnel')
    );

    if (isTripping) {
      const layers = map.getStyle().layers;
      layers.forEach(l => { if (l.id.includes('label')) map.setLayoutProperty(l.id, 'visibility', 'none'); });
      
      // Make roads bright and thick for navigation in trip mode
      roadLayers.forEach(l => {
        if (l.type === 'line') {
          map.setPaintProperty(l.id, 'line-color', '#ffffff');
          map.setPaintProperty(l.id, 'line-width', [
            'interpolate', ['linear'], ['zoom'],
            14, 4,
            20, 12
          ]);
          map.setPaintProperty(l.id, 'line-opacity', 0.8);
        }
      });

      map.easeTo({ pitch: 85, zoom: 20.5, duration: 1500 }); // REDUCED MAX ZOOM
    } else {
      const layers = map.getStyle().layers;
      layers.forEach(l => { if (l.id.includes('label')) map.setLayoutProperty(l.id, 'visibility', 'visible'); });
      
      // Reset roads to standard subtle style
      roadLayers.forEach(l => {
        if (l.type === 'line') {
          map.setPaintProperty(l.id, 'line-color', '#ebebeb');
          map.setPaintProperty(l.id, 'line-width', [
            'interpolate', ['linear'], ['zoom'],
            14, 1,
            20, 4
          ]);
          map.setPaintProperty(l.id, 'line-opacity', 1);
        }
      });

      map.easeTo({ pitch: 0, zoom: 14.5, bearing: 0, duration: 1500 });
    }
  }, [isTripping, mapReady]);

  const getBuildingEmoji = (type) => {
    switch (type) {
      case 'heart-tree': return '🌳';
      case 'starter-house': return '🏠';
      case 'apple-tree': return '🍎';
      case 'field-tiles': return '🌾';
      case 'well': return '⛲';
      case 'fence': return '🚧';
      case 'garden': return '🌻';
      case 'barn': return '🛖';
      default: return '🏠';
    }
  };

  // Render buildings on map
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    // Filter buildings that have lat/lng
    const mapBuildings = buildings.filter(b => b.offset && b.offset.lat !== undefined);

    // Remove old building markers
    Object.keys(buildingMarkers.current).forEach(id => {
      if (!mapBuildings.find(b => b.id === id)) {
        buildingMarkers.current[id].remove();
        delete buildingMarkers.current[id];
      }
    });

    // Add/Update markers
    mapBuildings.forEach(b => {
      if (!buildingMarkers.current[b.id]) {
        const el = document.createElement('div');
        el.className = 'building-marker';
        el.style.fontSize = '32px';
        el.style.cursor = 'pointer';
        el.innerHTML = getBuildingEmoji(b.type);
        
        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([b.offset.lng, b.offset.lat])
          .addTo(map);
        
        buildingMarkers.current[b.id] = marker;
      }
    });
  }, [buildings, mapReady]);

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

  const handleCancelCollection = useCallback((id, reason = "Cancelled") => {
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
      onSetSpawnedResources(prev => prev.filter(r => r.id !== id));
      setNearbyResource(null);
    }
  };

  // Lock marker if collecting
  useEffect(() => {
    if (markerRef.current) {
      markerRef.current.setDraggable(pendingCollections.length === 0);
    }
  }, [pendingCollections.length]);

  // Monitor collections
  useEffect(() => {
    if (pendingCollections.length === 0) return;

    const checkInterval = setInterval(() => {
      const currentTime = Date.now();
      
      setPendingCollections(prev => {
        let needsUpdate = false;
        const remaining = [];
        
        prev.forEach(p => {
          // Check completion
          if (currentTime >= p.finishTime) {
            onCollect(p.id, p.type, 10);
            needsUpdate = true;
          }
          // Check movement (2m tolerance)
          else {
            const dist = turf.distance(turf.point(playerPos), turf.point(p.startPos), { units: 'meters' });
            if (dist > 2) {
              if (!failureMessage) {
                setFailureMessage("MOVEMENT DETECTED!");
                setTimeout(() => setFailureMessage(null), 3000);
              }
              needsUpdate = true;            } else {
              remaining.push(p);
            }
          }
        });
        
        return needsUpdate ? remaining : prev;
      });
    }, 1000);

    return () => clearInterval(checkInterval);
  }, [playerPos, onCollect, pendingCollections.length]);

  // 1. PROXIMITY CHECK - Fast effect, only runs on player move
  useEffect(() => {
    // Only check proximity if we are in TRIP MODE and can actually collect
    if (!mapReady || !spawnedResources.length || !isTripping) {
      setNearbyResource(null);
      return;
    }
    
    console.log("Checking proximity for", spawnedResources.length, "resources at", playerPos);
    
    const closest = spawnedResources.find(res => {
      const dist = turf.distance(turf.point(playerPos), turf.point([res.lng, res.lat]), { units: 'meters' });
      if (dist < 20) console.log(`Resource ${res.id} is ${dist.toFixed(2)}m away`);
      return dist < 5;
    });

    if (closest) console.log("Found nearby resource:", closest.type);
    setNearbyResource(closest || null);
  }, [playerPos, mapReady, spawnedResources, isTripping]);

  // 2. MARKER & FOG SYNC - Slower effect, runs only when resources or territory change
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const currentIds = new Set(spawnedResources.map(r => r.id));
    
    // Filter out coins if not in TRIP mode
    const visibleResources = isTripping 
      ? spawnedResources 
      : spawnedResources.filter(r => r.type !== 'coins');

    // Remove markers no longer in visibleResources
    Object.keys(resourceMarkers.current).forEach(id => { 
      const res = spawnedResources.find(r => r.id === id);
      if (!res || (!isTripping && res.type === 'coins')) {
        resourceMarkers.current[id].remove(); 
        delete resourceMarkers.current[id]; 
      } 
    });

    // Add or update markers based on visibility and TRIP mode
    visibleResources.forEach(res => {
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
          const inner = marker.getElement().firstChild;
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

    if (map.getSource('territory')) map.getSource('territory').setData(exploredTerritory || { type: 'FeatureCollection', features: [] });
    if (map.getSource('fog-of-war')) map.getSource('fog-of-war').setData(getFogData(playerPos, exploredTerritory));
  }, [mapReady, exploredTerritory, spawnedResources, isTripping]);

  return (
    <div className="fixed inset-0 z-0 bg-slate-200">
      <div className="absolute inset-0 z-[-1]" style={{ background: 'linear-gradient(to bottom, #9fb68d 0%, #cbd5e1 100%)' }} />
      <div ref={mapContainer} className="w-full h-full" style={{ imageRendering: 'pixelated' }} />
      <div className="absolute right-4 bottom-48 z-20 flex flex-col gap-2">
        <button onClick={handleZoomIn} className="w-10 h-10 bg-[#e9d681] border-4 border-[#8b7a6d] flex items-center justify-center text-[#5d4a44] font-bold shadow-lg active:scale-95">+</button>
        <button onClick={handleZoomOut} className="w-10 h-10 bg-[#e9d681] border-4 border-[#8b7a6d] flex items-center justify-center text-[#5d4a44] font-bold shadow-lg active:scale-95">-</button>
        {isTripping && (
          <button 
            onClick={handleRecenter} 
            className="w-10 h-10 bg-[#f4ece4] border-4 border-[#8b7a6d] flex items-center justify-center text-[#5d4a44] shadow-lg active:scale-95 transition-all mt-2"
          >
            🎯
          </button>
        )}
      </div>
      {isTripping && (
        <div className="absolute top-4 left-0 right-0 px-4 z-[5000] pointer-events-none">
           <div className="bg-[#f4ece4] border-b-4 border-[#8b7a6d] border-r-4 p-2 rounded-sm flex justify-around shadow-xl max-w-sm mx-auto pointer-events-auto">
              <ResourceItem icon="🪵" value={resources?.wood || 0} label="Wood" />
              <ResourceItem icon="🔩" value={resources?.metal || 0} label="Metal" />
              <ResourceItem icon="💎" value={resources?.pebbles || 0} label="Pebbles" />
              <ResourceItem icon="🪙" value={resources?.coins || 0} label="Coins" />
           </div>
        </div>
      )}
      <div className="absolute top-24 left-4 z-10 pointer-events-none flex flex-col gap-2 font-['Press_Start_2P']">
         <div className="parchment-panel p-2 text-[#5d4a44] text-[8px] shadow-lg flex flex-col gap-1">
           <div className="flex items-center gap-2">
             {isScanning && <div className="w-2 h-2 bg-[#e9d681] animate-ping rounded-full"></div>}
             {isTripping ? 'STREET' : 'EXPLORE'}
           </div>
           {isTripping && (
             <div className="text-[6px] opacity-70 flex flex-col gap-1">
               <div>{nearbyResource ? `NEARBY: ${nearbyResource.type}` : 'NO RESOURCE NEARBY'}</div>
               <div className="text-blue-600">WALKED: {totalDistanceWalked.toFixed(0)}m ({100 - (totalDistanceWalked % 100).toFixed(0)}m TO 10🪙)</div>
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
                 className="bg-[#e9d681] border-2 border-[#8b7a6d] px-4 py-3 text-[#5d4a44] text-[8px] font-['Press_Start_2P'] shadow-md active:scale-95 transition-all w-full"
               >
                 PICK 1 (NOW)
               </button>
               <button 
                 onClick={handleCollectDelayed} 
                 className="bg-[#9fb68d] border-2 border-[#8b7a6d] px-4 py-3 text-[#5d4a44] text-[8px] font-['Press_Start_2P'] shadow-md active:scale-95 transition-all w-full"
               >
                 PICK 10 (WAIT 3 MIN)
               </button>
             </div>
          </div>
        </div>
      )}
      
      {/* Blocking Pending Modal */}
      {pendingCollections.length > 0 && (
        <div className="absolute inset-0 z-[7000] flex items-center justify-center bg-black/40 backdrop-blur-sm">
           <div className="parchment-panel p-8 flex flex-col items-center gap-6 max-w-[300px] w-full text-center">
              <div className="text-5xl animate-pulse">⏳</div>
              <div className="flex flex-col gap-2">
                <div className="text-[#5d4a44] text-[12px] font-['Press_Start_2P'] uppercase">COLLECTING {pendingCollections[0].type}</div>
                <div className="text-[#8b7a6d] text-[8px] font-['Press_Start_2P']">STAY STILL TO RECEIVE 10 ITEMS</div>
              </div>
              
              <div className="text-[#3e2723] text-2xl font-['Press_Start_2P'] tracking-tighter">
                {(() => {
                  const remainingMs = Math.max(0, pendingCollections[0].finishTime - now);
                  const remainingSec = Math.floor(remainingMs / 1000);
                  const m = Math.floor(remainingSec / 60);
                  const s = remainingSec % 60;
                  return `${m}:${s < 10 ? '0' : ''}${s}`;
                })()}
              </div>

              <button 
                onClick={() => handleCancelCollection(pendingCollections[0].id, "Cancelled")}
                className="bg-[#d97e7e] border-2 border-[#5d4a44] px-6 py-3 text-white text-[10px] font-['Press_Start_2P'] shadow-md active:translate-y-1 w-full"
              >
                CANCEL (LOSE ALL)
              </button>
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
      <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-4">
        <button onClick={onToggleTrip} className={`px-8 py-4 font-['Press_Start_2P'] text-[10px] text-[#5d4a44] border-4 border-[#8b7a6d] active:translate-y-1 transition-all ${isTripping ? 'bg-[#d97e7e]' : 'bg-[#e9d681] shadow-[4px_4px_0_0_rgba(0,0,0,0.2)]'}`}>
          {isTripping ? 'EXIT TRIP' : 'START TRIP'}
        </button>
      </div>
    </div>
  );
};

export default MapComponent;
