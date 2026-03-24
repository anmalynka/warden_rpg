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
  const [initialSelectedBuilding, setInitialSelectedBuilding] = useState<string | null>(null);
  const clickTimeoutRef = useRef<any>(null);
  const animationTimeoutRef = useRef<any>(null);
  const moveIntervalRef = useRef<any>(null);

  const { 
    resources, setResources, buildings, addBuilding, 
    exploredTerritory, addTerritory, 
    spawnedResources, setSpawnedResources, collectResource,
    addWalkDistance, totalDistanceWalked,
    avatarPos, moveAvatar,
    villageZoom, setVillageZoom,
    isInsideHouse, setIsInsideHouse,
    minutesSlept,
    interactWithBuilding,
    resetGame,
    level,
    xp,
    XP_TO_NEXT_LEVEL,
    inventory,
    treeCooldowns
  } = useGameState();

  // Returns the number of collision points for a position (0 = perfectly valid)
  const getCollisionCount = useCallback((x: number, y: number) => {
    const offsetX = -(GRID_SIZE * TILE_SIZE) / 2;
    const offsetY = -(GRID_SIZE * TILE_SIZE) / 2;
    
    // Check points in a small cross/radius around the character center
    const radius = 10; // Slightly smaller radius for smoother movement
    const pointsToCheck = [
      { x, y }, // Center
      { x: x - radius, y }, // Left
      { x: x + radius, y }, // Right
      { x, y: y - radius }, // Top
      { x, y: y + radius }  // Bottom
    ];

    let count = 0;
    for (const p of pointsToCheck) {
      const c = Math.floor((p.x - offsetX) / TILE_SIZE);
      const r = Math.floor((p.y - offsetY) / TILE_SIZE);
      
      if (c < 0 || c >= GRID_SIZE || r < 0 || r >= GRID_SIZE) {
        count++;
        continue;
      }

      const tileType = ISLAND_MAP[r][c];
      const isTerrainWalkable = tileType === TILE_TYPES.GRASS || tileType === TILE_TYPES.SAND;
      if (!isTerrainWalkable) {
        count++;
        continue;
      }

      const isObstacle = obstacles.some(ob => ob.r === r && ob.c === c);
      if (isObstacle) {
        count++;
      }
    }
    
    return count;
  }, [obstacles]);
  
  const isPositionValid = useCallback((x: number, y: number) => {
    const currentCollisions = getCollisionCount(avatarPos.x, avatarPos.y);
    const nextCollisions = getCollisionCount(x, y);

    // If perfectly valid, always allow
    if (nextCollisions === 0) return true;
    
    // If next position has FEWER or EQUAL collisions than current, allow it (allows moving out)
    // Actually, only allow if FEWER if we are currently stuck, 
    // or if we aren't stuck yet, only allow if next is 0.
    if (currentCollisions > 0) {
      return nextCollisions < currentCollisions;
    }

    return nextCollisions === 0;
  }, [avatarPos, getCollisionCount]);
  
  const getBuildingEmoji = (type: string) => {
    switch (type) {
      case 'heart-tree': return '🌳';
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

  const startMovement = useCallback((dx: number, dy: number, newFacing: string) => {
    if (moveIntervalRef.current) return;
    
    const move = () => {
      setFacing(newFacing);
      
      const nextX = avatarPos.x + dx;
      const nextY = avatarPos.y + dy;

      if (isPositionValid(nextX, nextY)) {
        moveAvatar(dx, dy);
        setIsWalking(true);
      } else {
        // Try sliding: check X only or Y only if both moved
        const canMoveX = dx !== 0 && isPositionValid(avatarPos.x + dx, avatarPos.y);
        const canMoveY = dy !== 0 && isPositionValid(avatarPos.x, avatarPos.y + dy);
        
        if (canMoveX) {
          moveAvatar(dx, 0);
          setIsWalking(true);
        } else if (canMoveY) {
          moveAvatar(0, dy);
          setIsWalking(true);
        } else {
          setIsWalking(true);
          // Short timeout to reset if still blocked
          if (animationTimeoutRef.current) clearTimeout(animationTimeoutRef.current);
          animationTimeoutRef.current = setTimeout(() => setIsWalking(false), 200);
        }
      }
    };

    move(); // Initial move
    moveIntervalRef.current = setInterval(move, 150); // Repeat every 150ms
  }, [avatarPos, isPositionValid, moveAvatar]);

  const stopMovement = useCallback(() => {
    if (moveIntervalRef.current) {
      clearInterval(moveIntervalRef.current);
      moveIntervalRef.current = null;
    }
    setIsWalking(false);
  }, []);

  const handleLogin = (username: string) => {
    setUser(username);
    setAppState('role-selection');
  };

  const handleRoleSelect = (selectedRole: { name: string, icon: string }) => {
    setRole(selectedRole);
    setAppState('main');
  };
  
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
        const dx = nextX - avatarPos.x;
        const dy = nextY - avatarPos.y;

        if (isPositionValid(nextX, nextY)) {
          moveAvatar(dx, dy);
          setIsWalking(true);
        } else {
          // Try sliding: check X only or Y only if both moved
          const canMoveX = dx !== 0 && isPositionValid(avatarPos.x + dx, avatarPos.y);
          const canMoveY = dy !== 0 && isPositionValid(avatarPos.x, avatarPos.y + dy);

          if (canMoveX) {
            moveAvatar(dx, 0);
            setIsWalking(true);
          } else if (canMoveY) {
            moveAvatar(0, dy);
            setIsWalking(true);
          } else {
            // Play "intent" animation for 0.2s even if move is blocked
            setIsWalking(true);
            if (animationTimeoutRef.current) clearTimeout(animationTimeoutRef.current);
            animationTimeoutRef.current = setTimeout(() => setIsWalking(false), 200);
          }
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
          level={level}
          xp={xp}
          xpToNext={XP_TO_NEXT_LEVEL}
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
                const newBuildingId = addBuilding(type, cost, pos);
                setIsPlacing(false);
                setPendingBuilding(null);
                
                // Automatically open produce selection for new garden beds/trees
                if (type === 'garden-bed' || type === 'garden-tree') {
                   // We need a way to tell TownView to open this menu
                   // Let's use a state that TownView can react to or just set it if we had access
                   // Since TownView is a child, we might need to lift the selectedBedForMenu state 
                   // or use a ref/effect.
                   // Actually, TownView already has selectedBedForMenu state. 
                   // Let's pass a prop 'initialSelectedBuilding' or similar.
                   setInitialSelectedBuilding(newBuildingId);
                }
              }}
              role={role}
              getBuildingEmoji={getBuildingEmoji}
              mousePos={mousePos}
              setMousePos={setMousePos}
              facing={facing}
              isWalking={isWalking}
              onUpdateObstacles={setObstacles}
              interactWithBuilding={interactWithBuilding}
              initialSelectedBuilding={initialSelectedBuilding}
              onClearInitialSelection={() => setInitialSelectedBuilding(null)}
              isInsideHouse={isInsideHouse}
              minutesSlept={minutesSlept}
              treeCooldowns={treeCooldowns}
            />

            {/* Village UI Overlays */}
            {!isInsideHouse && (
              <div className="fixed top-32 left-6 z-[2000] flex flex-col gap-4">
                <button 
                  onClick={() => setVillageZoom((prev: number) => Math.min(prev + 0.2, 3))}
                  className="w-12 h-12 btn-off-white font-['Press_Start_2P'] text-xl flex items-center justify-center pointer-events-auto"
                >
                  +
                </button>
                <button 
                  onClick={() => setVillageZoom((prev: number) => Math.max(prev - 0.2, 0.5))}
                  className="w-12 h-12 btn-off-white font-['Press_Start_2P'] text-xl flex items-center justify-center pointer-events-auto"
                >
                  -
                </button>
              </div>
            )}

            {/* Placement Mode Instructions */}
            {isPlacing && !isInsideHouse && (
              <div className="fixed top-32 left-1/2 -translate-x-1/2 z-[3000] bg-[#3e2723] text-white font-['Press_Start_2P'] text-[10px] px-6 py-3 border-4 border-white shadow-2xl animate-pulse">
                CLICK TO PLACE OR ESC TO CANCEL
              </div>
            )}

            {/* Directional Controls (Bottom Right) */}
            {!isInsideHouse && (
              <div className="fixed bottom-24 right-6 z-[2000] flex flex-col items-center gap-2 pointer-events-auto">
                 <button 
                   onMouseDown={() => startMovement(0, -16, 'up')}
                   onMouseUp={stopMovement}
                   onMouseLeave={stopMovement}
                   onTouchStart={(e) => { e.preventDefault(); startMovement(0, -16, 'up'); }}
                   onTouchEnd={stopMovement}
                   className="w-14 h-14 btn-off-white flex items-center justify-center"
                 >
                   <span className="text-2xl mt-[-4px]">▲</span>
                 </button>
                 <div className="flex gap-2">
                   <button 
                     onMouseDown={() => startMovement(-16, 0, 'left')}
                     onMouseUp={stopMovement}
                     onMouseLeave={stopMovement}
                     onTouchStart={(e) => { e.preventDefault(); startMovement(-16, 0, 'left'); }}
                     onTouchEnd={stopMovement}
                     className="w-14 h-14 btn-off-white flex items-center justify-center"
                   >
                     <span className="text-2xl ml-[-4px]">◀</span>
                   </button>
                   <button 
                     onMouseDown={() => startMovement(0, 16, 'down')}
                     onMouseUp={stopMovement}
                     onMouseLeave={stopMovement}
                     onTouchStart={(e) => { e.preventDefault(); startMovement(0, 16, 'down'); }}
                     onTouchEnd={stopMovement}
                     className="w-14 h-14 btn-off-white flex items-center justify-center"
                   >
                     <span className="text-2xl mb-[-4px]">▼</span>
                   </button>
                   <button 
                     onMouseDown={() => startMovement(16, 0, 'right')}
                     onMouseUp={stopMovement}
                     onMouseLeave={stopMovement}
                     onTouchStart={(e) => { e.preventDefault(); startMovement(16, 0, 'right'); }}
                     onTouchEnd={stopMovement}
                     className="w-14 h-14 btn-off-white flex items-center justify-center"
                   >
                     <span className="text-2xl mr-[-4px]">▶</span>
                   </button>
                 </div>
              </div>
            )}
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
                     onClick={() => {
                        if (window.confirm('Restart game from new village? All progress will be lost.')) {
                          resetGame();
                          setActiveTab('village');
                        }
                     }}
                     className="mt-2 btn-off-white p-4 text-[10px]"
                   >
                     RESTART GAME
                   </button>
                   <button 
                     onClick={() => setAppState('login')}
                     className="mt-6 btn-off-white p-4 text-[10px]"
                   >
                     LOGOUT
                   </button>
                </div>
             </div>
          </div>
        )}
      </div>

      {/* Global Build Menu */}
      {activeTab === 'village' && !isTripping && !isInsideHouse && (
        <BuildMenu 
          resources={resources} 
          onBuild={(type: string, cost: any) => {
            setPendingBuilding({type, cost});
            setIsPlacing(true);
          }} 
        />
      )}

      {/* Navigation */}
      {!isTripping && !isInsideHouse && <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />}
      
      {/* Floating Debug Button for Mobile testing */}
      {activeTab === 'village' && (
        <div className="fixed bottom-24 left-6 z-[2000]">
          <button 
            onClick={handleHarvest}
            className="btn-off-white px-4 py-3 font-['Press_Start_2P'] text-[10px]"
          >
            HARVEST
          </button>
        </div>
      )}
    </div>
  )
}

export default App
