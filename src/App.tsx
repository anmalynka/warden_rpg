import { useState, useEffect, useRef, useCallback } from 'react'
import { useGameState } from './useGameState'
import HUD from './HUD'
import BuildMenu from './BuildMenu'
import MapComponent from './MapComponent'
import LoginScreen from './LoginScreen'
import RoleSelection from './RoleSelection'
import BottomNav from './BottomNav'
import TownView, { ISLAND_MAP, GRID_SIZE, TILE_SIZE, TILE_TYPES } from './TownView'
import './App.css'

function App() {
  const [appState, setAppState] = useState('main'); // Default to main to skip login
  const [user, setUser] = useState('Dev');
  const [role, setRole] = useState({ name: 'Warden', icon: '🛡️' });
  const [activeTab, setActiveTab] = useState('village'); // village, warden, settings
  const [isTripping, setIsTripping] = useState(false);
  const [isPlacing, setIsPlacing] = useState(false);
  const [pendingBuilding, setPendingBuilding] = useState<{type: string, cost: any} | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [facing, setFacing] = useState('down');
  const [isWalking, setIsWalking] = useState(false);
  const [obstacles, setObstacles] = useState<{r: number, c: number}[]>([]);
  const clickTimeoutRef = useRef<any>(null);
  const animationTimeoutRef = useRef<any>(null);

  // Helper to validate position on the island grid
  const isPositionValid = useCallback((x: number, y: number) => {
    const offsetX = -(GRID_SIZE * TILE_SIZE) / 2;
    const offsetY = -(GRID_SIZE * TILE_SIZE) / 2;
    const c = Math.floor((x - offsetX) / TILE_SIZE);
    const r = Math.floor((y - offsetY) / TILE_SIZE);
    
    if (c >= 0 && c < GRID_SIZE && r >= 0 && r < GRID_SIZE) {
      const tileType = ISLAND_MAP[r][c];
      // Only GRASS (3) and SAND (2) are walkable
      const isTerrainWalkable = tileType === TILE_TYPES.GRASS || tileType === TILE_TYPES.SAND;
      
      // Check for obstacles (decorations)
      const isObstacle = obstacles.some(ob => ob.r === r && ob.c === c);
      
      return isTerrainWalkable && !isObstacle;
    }
    return false;
  }, [obstacles]);
  
  const getBuildingEmoji = (type: string) => {
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

  const handleLogin = (username: string) => {
    setUser(username);
    setAppState('role-selection');
  };

  const handleRoleSelect = (selectedRole: { name: string, icon: string }) => {
    setRole(selectedRole);
    setAppState('main');
  };
  
  const { 
    resources, setResources, buildings, addBuilding, 
    exploredTerritory, addTerritory, 
    spawnedResources, setSpawnedResources, collectResource,
    addWalkDistance, totalDistanceWalked,
    avatarPos, moveAvatar,
    villageZoom, setVillageZoom,
    interactWithBuilding
  } = useGameState();

  // Keyboard controls for avatar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsPlacing(false);
        setPendingBuilding(null);
      }
      if (activeTab !== 'village' || isPlacing) return;
      
      const step = 8;
      let nextX = avatarPos.x;
      let nextY = avatarPos.y;
      let newFacing = facing;
      let moved = false;

      if (e.key === 'ArrowUp') { nextY -= step; newFacing = 'up'; moved = true; }
      else if (e.key === 'ArrowDown') { nextY += step; newFacing = 'down'; moved = true; }
      else if (e.key === 'ArrowLeft') { nextX -= step; newFacing = 'left'; moved = true; }
      else if (e.key === 'ArrowRight') { nextX += step; newFacing = 'right'; moved = true; }

      if (moved) {
        setFacing(newFacing as any);
        if (isPositionValid(nextX, nextY)) {
          moveAvatar(nextX - avatarPos.x, nextY - avatarPos.y);
          setIsWalking(true);
        } else {
          // Play "intent" animation for 0.2s even if move is blocked
          setIsWalking(true);
          if (animationTimeoutRef.current) clearTimeout(animationTimeoutRef.current);
          animationTimeoutRef.current = setTimeout(() => setIsWalking(false), 200);
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        if (!animationTimeoutRef.current) setIsWalking(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [activeTab, moveAvatar, isPlacing, villageZoom, avatarPos, facing, isPositionValid]);

  const handleHarvest = () => {
    setResources((prev: any) => ({
      ...prev,
      wood: prev.wood + 5,
      coins: prev.coins + 10
    }));
  };

  const handleToggleTrip = () => {
    setIsTripping(!isTripping);
  };

  if (appState === 'login') {
    return <LoginScreen onLogin={handleLogin} />;
  }

  if (appState === 'role-selection') {
    return <RoleSelection onSelect={handleRoleSelect} />;
  }

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#08060d]">
      {/* HUD and Global UI */}
      {!isTripping && (
        <HUD 
          resources={resources} 
        />
      )}

      {/* Main Content Areas */}
      <div className="w-full h-full">
        {activeTab === 'village' && (
          <div className="relative w-full h-full">
            <TownView 
              avatarPos={avatarPos}
              villageZoom={villageZoom}
              setVillageZoom={setVillageZoom}
              buildings={buildings}
              isPlacing={isPlacing}
              pendingBuilding={pendingBuilding}
              onBuild={(type: string, cost: any, pos: {x: number, y: number}) => {
                addBuilding(type, cost, pos);
                setIsPlacing(false);
                setPendingBuilding(null);
              }}
              role={role}
              getBuildingEmoji={getBuildingEmoji}
              mousePos={mousePos}
              setMousePos={setMousePos}
              facing={facing}
              isWalking={isWalking}
              onUpdateObstacles={setObstacles}
              interactWithBuilding={interactWithBuilding}
            />

            {/* Village UI Overlays */}
            <div className="fixed top-32 left-6 z-[2000] flex flex-col gap-4">
              <button 
                onClick={() => setVillageZoom((prev: number) => Math.min(prev + 0.2, 3))}
                className="w-12 h-12 bg-[#f9f5f0] border-4 border-[#3e2723] text-[#3e2723] font-['Press_Start_2P'] text-xl flex items-center justify-center shadow-[0_4px_0_0_#3e2723] active:translate-y-1 active:shadow-none pointer-events-auto transition-all"
              >
                +
              </button>
              <button 
                onClick={() => setVillageZoom((prev: number) => Math.max(prev - 0.2, 0.5))}
                className="w-12 h-12 bg-[#f9f5f0] border-4 border-[#3e2723] text-[#3e2723] font-['Press_Start_2P'] text-xl flex items-center justify-center shadow-[0_4px_0_0_#3e2723] active:translate-y-1 active:shadow-none pointer-events-auto transition-all"
              >
                -
              </button>
            </div>

            {/* Placement Mode Instructions */}
            {isPlacing && (
              <div className="fixed top-32 left-1/2 -translate-x-1/2 z-[3000] bg-[#3e2723] text-white font-['Press_Start_2P'] text-[10px] px-6 py-3 border-4 border-white shadow-2xl animate-pulse">
                CLICK TO PLACE OR ESC TO CANCEL
              </div>
            )}

            {/* Directional Controls (Bottom Right) */}
            <div className="fixed bottom-24 right-6 z-[2000] flex flex-col items-center gap-2 pointer-events-auto">
               <button 
                 onMouseDown={() => { 
                   if (isPositionValid(avatarPos.x, avatarPos.y - 16)) {
                     moveAvatar(0, -16); setFacing('up'); setIsWalking(true);
                   } else {
                     setIsWalking(true);
                     setTimeout(() => setIsWalking(false), 200);
                   }
                 }}
                 onMouseUp={() => setIsWalking(false)}
                 onMouseLeave={() => setIsWalking(false)}
                 onTouchStart={(e) => {
                   e.preventDefault();
                   if (isPositionValid(avatarPos.x, avatarPos.y - 16)) {
                     moveAvatar(0, -16); setFacing('up'); setIsWalking(true);
                   } else {
                     setIsWalking(true);
                     setTimeout(() => setIsWalking(false), 200);
                   }
                 }}
                 onTouchEnd={() => setIsWalking(false)}
                 className="w-14 h-14 bg-[#f9f5f0] border-4 border-[#3e2723] text-[#3e2723] flex items-center justify-center shadow-[0_6px_0_0_#3e2723] active:translate-y-1 active:shadow-none transition-all"
               >
                 <span className="text-2xl mt-[-4px]">▲</span>
               </button>
               <div className="flex gap-2">
                 <button 
                   onMouseDown={() => { 
                     if (isPositionValid(avatarPos.x - 16, avatarPos.y)) {
                       moveAvatar(-16, 0); setFacing('left'); setIsWalking(true);
                     } else {
                       setIsWalking(true);
                       setTimeout(() => setIsWalking(false), 200);
                     }
                   }}
                   onMouseUp={() => setIsWalking(false)}
                   onMouseLeave={() => setIsWalking(false)}
                   onTouchStart={(e) => {
                     e.preventDefault();
                     if (isPositionValid(avatarPos.x - 16, avatarPos.y)) {
                       moveAvatar(-16, 0); setFacing('left'); setIsWalking(true);
                     } else {
                       setIsWalking(true);
                       setTimeout(() => setIsWalking(false), 200);
                     }
                   }}
                   onTouchEnd={() => setIsWalking(false)}
                   className="w-14 h-14 bg-[#f9f5f0] border-4 border-[#3e2723] text-[#3e2723] flex items-center justify-center shadow-[0_6px_0_0_#3e2723] active:translate-y-1 active:shadow-none transition-all"
                 >
                   <span className="text-2xl ml-[-4px]">◀</span>
                 </button>
                 <button 
                   onMouseDown={() => { 
                     if (isPositionValid(avatarPos.x, avatarPos.y + 16)) {
                       moveAvatar(0, 16); setFacing('down'); setIsWalking(true);
                     } else {
                       setIsWalking(true);
                       setTimeout(() => setIsWalking(false), 200);
                     }
                   }}
                   onMouseUp={() => setIsWalking(false)}
                   onMouseLeave={() => setIsWalking(false)}
                   onTouchStart={(e) => {
                     e.preventDefault();
                     if (isPositionValid(avatarPos.x, avatarPos.y + 16)) {
                       moveAvatar(0, 16); setFacing('down'); setIsWalking(true);
                     } else {
                       setIsWalking(true);
                       setTimeout(() => setIsWalking(false), 200);
                     }
                   }}
                   onTouchEnd={() => setIsWalking(false)}
                   className="w-14 h-14 bg-[#f9f5f0] border-4 border-[#3e2723] text-[#3e2723] flex items-center justify-center shadow-[0_6px_0_0_#3e2723] active:translate-y-1 active:shadow-none transition-all"
                 >
                   <span className="text-2xl mb-[-4px]">▼</span>
                 </button>
                 <button 
                   onMouseDown={() => { 
                     if (isPositionValid(avatarPos.x + 16, avatarPos.y)) {
                       moveAvatar(16, 0); setFacing('right'); setIsWalking(true);
                     } else {
                       setIsWalking(true);
                       setTimeout(() => setIsWalking(false), 200);
                     }
                   }}
                   onMouseUp={() => setIsWalking(false)}
                   onMouseLeave={() => setIsWalking(false)}
                   onTouchStart={(e) => {
                     e.preventDefault();
                     if (isPositionValid(avatarPos.x + 16, avatarPos.y)) {
                       moveAvatar(16, 0); setFacing('right'); setIsWalking(true);
                     } else {
                       setIsWalking(true);
                       setTimeout(() => setIsWalking(false), 200);
                     }
                   }}
                   onTouchEnd={() => setIsWalking(false)}
                   className="w-14 h-14 bg-[#f9f5f0] border-4 border-[#3e2723] text-[#3e2723] flex items-center justify-center shadow-[0_6px_0_0_#3e2723] active:translate-y-1 active:shadow-none transition-all"
                 >
                   <span className="text-2xl mr-[-4px]">▶</span>
                 </button>
               </div>
            </div>
          </div>
        )}

        {activeTab === 'warden' && (
          <div 
            className={`relative w-full h-full ${isPlacing ? 'cursor-crosshair' : ''}`}
            onClick={(e) => {
              if (isPlacing && pendingBuilding) {
                // MapComponent handles its own clicks for placement usually via map events, 
                // but we can catch it here if needed or let MapComponent handle it.
              }
            }}
          >
            <MapComponent 
              isTripping={isTripping} 
              onToggleTrip={handleToggleTrip}
              exploredTerritory={exploredTerritory}
              onAddTerritory={addTerritory}
              spawnedResources={spawnedResources}
              onSetSpawnedResources={setSpawnedResources}
              onCollect={collectResource}
              resources={resources}
              setResources={setResources}
              addWalkDistance={addWalkDistance}
              totalDistanceWalked={totalDistanceWalked}
              isPlacing={isPlacing}
              pendingBuilding={pendingBuilding}
              onPlaceBuilding={(type: string, cost: any, lat: number, lng: number) => {
                addBuilding(type, cost, { lat, lng });
                setIsPlacing(false);
                setPendingBuilding(null);
              }}
              buildings={buildings}
            />
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="fixed inset-0 bg-[#1d3a19] flex flex-col items-center justify-center font-['Press_Start_2P'] p-6">
             <div className="bg-[#8d6e63] border-4 border-[#3e2723] p-8 w-full max-w-sm pixel-border">
                <h2 className="text-white text-md mb-8 text-center">SETTINGS</h2>
                <div className="flex flex-col gap-4">
                   <div className="text-white text-[10px]">USER: {user}</div>
                   <div className="text-white text-[10px]">ROLE: {role?.name}</div>
                   <button 
                     onClick={() => setAppState('login')}
                     className="mt-6 bg-red-800 text-white p-4 text-[10px] border-b-4 border-r-4 border-black active:translate-y-1"
                   >
                     LOGOUT
                   </button>
                </div>
             </div>
          </div>
        )}
      </div>

      {/* Global Build Menu */}
      {activeTab === 'village' && !isTripping && (
        <BuildMenu 
          resources={resources} 
          onBuild={(type: string, cost: any) => {
            setPendingBuilding({type, cost});
            setIsPlacing(true);
          }} 
        />
      )}

      {/* Navigation */}
      {!isTripping && <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />}
      
      {/* Floating Debug Button for Mobile testing */}
      {activeTab === 'village' && (
        <div className="fixed bottom-24 left-6 z-[2000]">
          <button 
            onClick={handleHarvest}
            className="bg-[#8d6e63] border-4 border-[#3e2723] text-white px-4 py-3 font-['Press_Start_2P'] text-[10px] hover:bg-[#a1887f] active:translate-y-1 active:shadow-none shadow-[0_4px_0_0_#3e2723] transition-all"
          >
            HARVEST
          </button>
        </div>
      )}
    </div>
  )
}

export default App
