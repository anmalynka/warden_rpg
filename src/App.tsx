import { useState, useEffect, useRef, useCallback } from 'react'
import { useGameState } from './useGameState'
import { ResourcesPanel, LevelCircle } from './HUD'
import BuildMenu from './BuildMenu'
import MapComponent from './MapComponent'
import LoginScreen from './LoginScreen'
import RoleSelection from './RoleSelection'
import BottomNav from './BottomNav'
import TownView, { ISLAND_MAP, GRID_SIZE, TILE_SIZE, TILE_TYPES } from './TownView'
import './App.css'

function App() {
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
  const [harvestNotification, setHarvestNotification] = useState<{item: string, count: number} | null>(null);
  const [joystickPos, setJoystickPos] = useState({ x: 0, y: 0 });
  const [isJoystickActive, setIsJoystickActive] = useState(false);
  const clickTimeoutRef = useRef<any>(null);
  const currentPosRef = useRef(avatarPos);
  const moveIntentionRef = useRef<{ dx: number, dy: number, facing: string } | null>(null);
  const obstaclesRef = useRef(obstacles);

  // Sync refs with state for use in intervals
  useEffect(() => {
    currentPosRef.current = avatarPos;
  }, [avatarPos]);

  useEffect(() => {
    obstaclesRef.current = obstacles;
  }, [obstacles]);

  const animationTimeoutRef = useRef<any>(null);
  const moveIntervalRef = useRef<any>(null);

  // Returns the number of collision points for a position (0 = perfectly valid)
  const getCollisionCount = useCallback((x: number, y: number) => {
    const offsetX = -(GRID_SIZE * TILE_SIZE) / 2;
    const offsetY = -(GRID_SIZE * TILE_SIZE) / 2;
    
    const radius = 6;
    const pointsToCheck = [
      { x, y },
      { x: x - radius, y },
      { x: x + radius, y },
      { x, y: y - radius },
      { x, y: y + radius }
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

      // Use Ref to get latest obstacles
      const isObstacle = obstaclesRef.current.some(ob => 
        p.x >= ob.x && p.x <= ob.x + ob.w &&
        p.y >= ob.y && p.y <= ob.y + ob.h
      );
      if (isObstacle) {
        count++;
      }
    }
    
    return count;
  }, []); // No dependencies needed as it uses Refs
  
  const isPositionValid = useCallback((x: number, y: number) => {
    // Use Ref to get latest position
    const currentCollisions = getCollisionCount(currentPosRef.current.x, currentPosRef.current.y);
    const nextCollisions = getCollisionCount(x, y);

    if (nextCollisions === 0) return true;
    
    if (currentCollisions > 0) {
      return nextCollisions < currentCollisions;
    }

    return nextCollisions === 0;
  }, [getCollisionCount]); // Only depends on the stable collision checker
  
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

  const startMovement = useCallback((dx: number, dy: number, newFacing: string) => {
    // Update movement intention so the interval sees the latest direction
    moveIntentionRef.current = { dx, dy, facing: newFacing };
    
    if (moveIntervalRef.current) return;
    
    const move = () => {
      const intention = moveIntentionRef.current;
      if (!intention) return;

      setFacing(intention.facing);
      
      const step = 4;
      // Calculate normalized-ish direction from intention
      const dx_step = intention.dx > 0 ? step : intention.dx < 0 ? -step : 0;
      const dy_step = intention.dy > 0 ? step : intention.dy < 0 ? -step : 0;
      
      // CRITICAL: Use currentPosRef.current to avoid stale closure over avatarPos
      const nextX = currentPosRef.current.x + dx_step;
      const nextY = currentPosRef.current.y + dy_step;

      if (isPositionValid(nextX, nextY)) {
        moveAvatar(dx_step, dy_step);
        setIsWalking(true);
      } else {
        // Try sliding logic using currentPosRef
        const canMoveX = dx_step !== 0 && isPositionValid(currentPosRef.current.x + dx_step, currentPosRef.current.y);
        const canMoveY = dy_step !== 0 && isPositionValid(currentPosRef.current.x, currentPosRef.current.y + dy_step);
        
        if (canMoveX) {
          moveAvatar(dx_step, 0);
          setIsWalking(true);
        } else if (canMoveY) {
          moveAvatar(0, dy_step);
          setIsWalking(true);
        } else {
          setIsWalking(true);
          if (animationTimeoutRef.current) clearTimeout(animationTimeoutRef.current);
          animationTimeoutRef.current = setTimeout(() => setIsWalking(false), 200);
        }
      }
    };

    move();
    moveIntervalRef.current = setInterval(move, 60);
  }, [isPositionValid, moveAvatar]);

  const stopMovement = useCallback(() => {
    moveIntentionRef.current = null;
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
      let nextX = currentPosRef.current.x;
      let nextY = currentPosRef.current.y;
      let newFacing = facing;
      let moved = false;

      if (e.key === 'ArrowUp') { nextY -= step; newFacing = 'up'; moved = true; }
      else if (e.key === 'ArrowDown') { nextY += step; newFacing = 'down'; moved = true; }
      else if (e.key === 'ArrowLeft') { nextX -= step; newFacing = 'left'; moved = true; }
      else if (e.key === 'ArrowRight') { nextX += step; newFacing = 'right'; moved = true; }

      if (moved) {
        setFacing(newFacing as any);
        const dx = nextX - currentPosRef.current.x;
        const dy = nextY - currentPosRef.current.y;

        if (isPositionValid(nextX, nextY)) {
          moveAvatar(dx, dy);
          setIsWalking(true);
        } else {
          // Try sliding: check X only or Y only if both moved
          const canMoveX = dx !== 0 && isPositionValid(currentPosRef.current.x + dx, currentPosRef.current.y);
          const canMoveY = dy !== 0 && isPositionValid(currentPosRef.current.x, currentPosRef.current.y + dy);

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

  // Joystick movement handler
  useEffect(() => {
    if (!isJoystickActive) {
      setJoystickPos({ x: 0, y: 0 });
      stopMovement();
      return;
    }

    const handleGlobalMove = (e: any) => {
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      
      const joystickEl = document.getElementById('joystick-base');
      if (!joystickEl) return;
      
      const rect = joystickEl.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      
      let dx = clientX - centerX;
      let dy = clientY - centerY;
      
      const distance = Math.sqrt(dx * dx + dy * dy);
      const maxRadius = rect.width / 2;
      
      if (distance > maxRadius) {
        dx = (dx / distance) * maxRadius;
        dy = (dy / distance) * maxRadius;
      }
      
      setJoystickPos({ x: dx, y: dy });
      
      // Determine movement vector and facing
      if (distance > 5) {
        let newFacing = facing;
        if (Math.abs(dx) > Math.abs(dy)) {
          newFacing = dx > 0 ? 'right' : 'left';
        } else {
          newFacing = dy > 0 ? 'down' : 'up';
        }
        
        // Use normalized vector for movement step
        let moveDx = (dx / maxRadius) * 16;
        let moveDy = (dy / maxRadius) * 16;

        // Snap to cardinal directions if one axis is dominant
        if (Math.abs(dx) > Math.abs(dy) * 1.5) {
          moveDy = 0;
        } else if (Math.abs(dy) > Math.abs(dx) * 1.5) {
          moveDx = 0;
        }

        startMovement(moveDx, moveDy, newFacing);
      } else {
        stopMovement();
      }
    };

    const handleGlobalUp = () => {
      setIsJoystickActive(false);
    };

    window.addEventListener('mousemove', handleGlobalMove);
    window.addEventListener('mouseup', handleGlobalUp);
    window.addEventListener('touchmove', handleGlobalMove, { passive: false });
    window.addEventListener('touchend', handleGlobalUp);
    
    return () => {
      window.removeEventListener('mousemove', handleGlobalMove);
      window.removeEventListener('mouseup', handleGlobalUp);
      window.removeEventListener('touchmove', handleGlobalMove);
      window.removeEventListener('touchend', handleGlobalUp);
    };
  }, [isJoystickActive, startMovement, stopMovement, facing]);

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

  const handleHarvestNotification = useCallback((item: string, count: number) => {
    setHarvestNotification({ item, count });
    setTimeout(() => setHarvestNotification(null), 3000);
  }, []);

  const renderBackpackView = () => {
    const items = [
      { id: 'wheat', label: 'WHEAT', icon: '/images/garden-wheat.png' },
      { id: 'tomato', label: 'TOMATO', icon: '/images/garden-tomato.png' },
      { id: 'pumpkin', label: 'PUMPKIN', icon: '/images/garden-pumpkin.png' },
      { id: 'apple', label: 'APPLE', icon: '/images/garden-apple.png' },
      { id: 'peach', label: 'PEACH', icon: '/images/garden-peach.png' },
      { id: 'cherry', label: 'CHERRY', icon: '/images/garden-cherry.png' },
    ];

    return (
      <div className="w-full bg-[#f9f5f0] p-10 pb-32 font-['Press_Start_2P']">
          <h2 className="text-[#3e2723] text-center text-[14px] uppercase mb-12">BACKPACK</h2>
          
          <div className="grid grid-cols-3 gap-8">
            {items.map(item => (
              <div key={item.id} className="flex flex-col items-center gap-3">
                <img src={item.icon} alt={item.label} className="w-16 h-16 object-contain" style={{ imageRendering: 'pixelated' }} />
                <div className="text-[7px] text-[#8b7a6d] text-center">{item.label}</div>
                <div className="text-[14px] text-[#3e2723]">{inventory[item.id] || 0}</div>
              </div>
            ))}
          </div>
      </div>
    );
  };

  if (appState === 'login') {
    return <LoginScreen onLogin={handleLogin} />;
  }

  if (appState === 'role-selection') {
    return <RoleSelection onSelect={handleRoleSelect} />;
  }

  return (
    <div className={`relative w-screen min-h-screen ${activeTab === 'backpack' ? 'bg-[#f9f5f0]' : 'bg-[#1e88e5]'}`}>
      {/* HUD and Global UI - Centered Top Cluster */}
      {!isTripping && (
        <div className="fixed top-4 left-0 right-0 pointer-events-none flex justify-center items-start z-[3000] px-4">
          <div className="flex items-start gap-3">
            <ResourcesPanel resources={resources} />
            
            <div className="flex flex-col items-center gap-3">
              <LevelCircle 
                level={level}
                xp={xp}
                xpToNext={XP_TO_NEXT_LEVEL}
              />
              {activeTab === 'village' && !isInsideHouse && (
                <BuildMenu 
                  resources={resources} 
                  onBuild={(type: string, cost: any) => {
                    setPendingBuilding({type, cost});
                    setIsPlacing(true);
                  }} 
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Harvest Notification */}
      <div 
        className={`fixed top-24 left-1/2 -translate-x-1/2 z-[4000] pointer-events-none transition-all duration-500 ${
          harvestNotification ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'
        }`}
      >
        {harvestNotification && (
          <div className="bg-[#3e2723] text-white font-['Press_Start_2P'] text-[8px] px-6 py-3 border-4 border-[#e9d681] shadow-2xl flex items-center gap-3">
            <span className="text-[#e9d681]">+ {harvestNotification.count}</span>
            <span className="uppercase">{harvestNotification.item} ADDED!</span>
          </div>
        )}
      </div>

      {/* Main Content Areas */}
      <div className="w-full">
        {activeTab === 'backpack' && renderBackpackView()}
        {activeTab === 'village' && (
          <div className="flex flex-col w-full min-h-screen">
            <div className="relative w-full h-screen overflow-hidden flex-shrink-0">
            <TownView 
              avatarPos={avatarPos}
              villageZoom={villageZoom}
              setVillageZoom={setVillageZoom}
              buildings={buildings}
              isPlacing={isPlacing}
              pendingBuilding={pendingBuilding}
              onBuild={(type: string, cost: any, pos: {x: number, y: number}) => {
                if (!type) {
                  setIsPlacing(false);
                  setPendingBuilding(null);
                  return;
                }
                const newBuildingId = addBuilding(type, cost, pos);
                setIsPlacing(false);
                setPendingBuilding(null);
                
                // Automatically open produce selection for new garden beds/trees
                if (type === 'garden-bed' || type === 'garden-tree') {
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
              interactWithBuilding={(id: string, action: string, data?: any) => 
                interactWithBuilding(id, action, data, handleHarvestNotification)
              }
              initialSelectedBuilding={initialSelectedBuilding}
              onClearInitialSelection={() => setInitialSelectedBuilding(null)}
              isInsideHouse={isInsideHouse}
              minutesSlept={minutesSlept}
              treeCooldowns={treeCooldowns}
            />

            {/* Village UI Overlays - Bottom Left Zoom Controls */}
            {!isInsideHouse && !isPlacing && (
              <div className="fixed bottom-48 left-4 z-[2000] flex flex-col gap-2">

                <button 
                  onClick={() => setVillageZoom((prev: number) => Math.min(prev + 0.2, 3))}
                  className="w-12 h-12 btn-off-white flex items-center justify-center pointer-events-auto p-2"
                >
                  <img src="/images/zoom-in.png" className="w-full h-full object-contain" alt="Zoom In" />
                </button>
                <button 
                  onClick={() => setVillageZoom((prev: number) => Math.max(prev - 0.2, 0.5))}
                  className="w-12 h-12 btn-off-white flex items-center justify-center pointer-events-auto p-2"
                >
                  <img src="/images/zoom-out.png" className="w-full h-full object-contain" alt="Zoom Out" />
                </button>
              </div>
            )}

            {/* Placement Mode Instructions */}
            {isPlacing && !isInsideHouse && (
              <div className="fixed top-32 left-1/2 -translate-x-1/2 z-[3000] bg-[#3e2723] text-white font-['Press_Start_2P'] text-[10px] px-6 py-3 border-4 border-white shadow-2xl animate-pulse">
                SELECT LOCATION AND CLICK TO PLACE, DOUBLE CLICK TO CANCEL
              </div>
            )}

            {/* Joystick Control (Bottom Right - Higher position) */}
            {!isInsideHouse && !isPlacing && (
              <div className="fixed bottom-24 right-4 z-[2000] w-32 h-32 pointer-events-none flex items-center justify-center">
                 <div 
                   id="joystick-base"
                   className="w-24 h-24 bg-transparent rounded-full border-4 border-[#d1c4b9]/30 relative pointer-events-auto flex items-center justify-center"
                   onMouseDown={(e) => {
                     setIsJoystickActive(true);
                   }}
                   onTouchStart={(e) => {
                     e.preventDefault();
                     setIsJoystickActive(true);
                   }}
                 >
                   <div 
                    className="w-12 h-12 bg-[#fcfaf8]/90 rounded-full border-2 border-[#3e2723] shadow-[0_4px_0_0_#d1c4b9] transition-transform duration-75 flex items-center justify-center"
                    style={{
                      transform: `translate(${joystickPos.x}px, ${joystickPos.y}px)`
                    }}
                   >
                     <div className="w-4 h-4 rounded-full bg-[#d1c4b9]"></div>
                   </div>
                 </div>
              </div>
            )}
          </div>
          {renderBackpackView()}
        </div>
        )}

        {activeTab === 'warden' && (
          <div 
            className={`relative w-full h-screen ${isPlacing ? 'cursor-crosshair' : ''}`}
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
              onCollect={(id: string, type: string, amount: number) => {
                collectResource(id, type, amount);
                handleHarvestNotification(type, amount);
              }}
              resources={resources}
              setResources={setResources}
              addWalkDistance={addWalkDistance}
              totalDistanceWalked={totalDistanceWalked}
              isPlacing={isPlacing}
              pendingBuilding={pendingBuilding}
              onPlaceBuilding={(type: string, cost: any, lat: number, lng: number) => {
                if (!type) {
                  setIsPlacing(false);
                  setPendingBuilding(null);
                  return;
                }
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
