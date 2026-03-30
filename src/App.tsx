import { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react'
import { useGameState } from './useGameState'
import { ResourcesPanel, LevelCircle } from './HUD'
import BuildMenu from './BuildMenu'
import MapComponent from './MapComponent'
import LoginScreen from './LoginScreen'
import RoleSelection from './RoleSelection'
import BottomNav from './BottomNav'
import TownView from './TownView'
import ShopUI from './ShopUI'
import MarketUI from './MarketUI'
import PlayerSprite from './PlayerSprite'
import OnboardingOverlay from './OnboardingOverlay'
import CharacterSelection from './CharacterSelection'
import { useImagePreloader } from './hooks/useImagePreloader'
import { ISLAND_MAP, TILE_SIZE, TILE_TYPES, getMapOffset } from './MapConstants'
import type { Obstacle } from './types/game'
import './App.css'

// const MapComponent = lazy(() => import('./MapComponent'));

function App() {
  const imagesLoaded = useImagePreloader();
  const { 
    isLoaded, autoSave,
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
    } = useGameState();

  const [appState, setAppState] = useState(() => {
    // Note: We use isLoaded effect to sync appState later, 
    // but we can still check localStorage for immediate initial render
    if (!localStorage.getItem('warden_has_completed_onboarding') || localStorage.getItem('warden_has_completed_onboarding') === 'false') {
      return 'onboarding';
    }
    if (!localStorage.getItem('warden_cat_type')) {
      return 'character-selection';
    }
    return 'main';
  });

  // Sync appState after persistence is loaded
  useEffect(() => {
    if (isLoaded) {
      if (!hasCompletedOnboarding) setAppState('onboarding');
      else if (!catType) setAppState('character-selection');
      else setAppState('main');
    }
  }, [isLoaded, hasCompletedOnboarding, catType]);

  const [user, setUser] = useState(playerName);
  const [role, setRole] = useState({ name: 'Warden', icon: '🛡️' });
  const [activeTab, setActiveTab] = useState('village'); // village, warden, settings
  const [isTripping, setIsTripping] = useState(false);
  const [isPlacing, setIsPlacing] = useState(false);
  const [pendingBuilding, setPendingBuilding] = useState<{type: string, cost: any} | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [facing, setFacing] = useState('down');
  const [isWalking, setIsWalking] = useState(false);
  const [initialSelectedBuilding, setInitialSelectedBuilding] = useState<string | null>(null);
  const [harvestNotification, setHarvestNotification] = useState<{item: string, count: number} | null>(null);
  const [joystickPos, setJoystickPos] = useState({ x: 0, y: 0 });
  const [isJoystickActive, setIsJoystickActive] = useState(false);
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleOnboardingComplete = () => {
    setHasCompletedOnboarding(true);
    setAppState('character-selection');
  };

  const handleCharacterSelectionComplete = (name: string, type: string) => {
    setPlayerName(name);
    setCatType(type);
    setAppState('main');
    autoSave(true); // Immediate save after character selection
  };

  useEffect(() => {
    setUser(playerName);
  }, [playerName]);

  // Mark onboarding as done as soon as it's shown, so it's skipped on refresh
  useEffect(() => {
    if (appState === 'onboarding') {
      setHasCompletedOnboarding(true);
    }
  }, [appState, setHasCompletedOnboarding]);

  // Lifted Modal States
  const [shopOpen, setShopOpen] = useState(false);
  const [marketOpen, setMarketOpen] = useState(false);
  const [selectedBedForMenu, setSelectedBedForMenu] = useState<string | null>(null);
  const [selectedBedForActionMenu, setSelectedBedForActionMenu] = useState<string | null>(null);
  const [confirmTreeCollect, setConfirmTreeCollect] = useState<string | null>(null);
  const [expansionConfirm, setExpansionConfirm] = useState<{c: number, r: number} | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id?: string, type: 'building' | 'decoration' | 'restart' } | null>(null);
  const [obstacles, setObstacles] = useState<Obstacle[]>([]);

  const clickTimeoutRef = useRef<any>(null);
  const currentPosRef = useRef(avatarPos);
  const moveIntentionRef = useRef<{ dx: number, dy: number, facing: string } | null>(null);
  const obstaclesRef = useRef<Obstacle[]>(obstacles);

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
    const currentSize = islandMap.length;
    const offset = getMapOffset(currentSize);
    
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
      const c = Math.floor((p.x - offset) / TILE_SIZE);
      const r = Math.floor((p.y - 1 - offset) / TILE_SIZE);
      
      if (c < 0 || c >= currentSize || r < 0 || r >= currentSize) {
        count++;
        continue;
      }

      const tileType = islandMap[r][c];
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
  }, [islandMap]); // Depends on the dynamic islandMap
  
  const isPositionValid = useCallback((x: number, y: number) => {
    // Use Ref to get latest position
    const currentCollisions = getCollisionCount(currentPosRef.current.x, currentPosRef.current.y);
    const nextCollisions = getCollisionCount(x, y);

    if (nextCollisions === 0) return true;
    
    // If we're already in a collision area, allow any move that doesn't make it worse
    if (currentCollisions > 0) {
      return nextCollisions <= currentCollisions;
    }

    // If not in a collision, only allow moves into 0-collision areas
    return nextCollisions === 0;
  }, [getCollisionCount]); // Depends on the stable collision checker which now depends on islandMap
  
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
            animationTimeoutRef.current = setTimeout(() => {
              setIsWalking(false);
              animationTimeoutRef.current = null;
            }, 200);
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
    // Level Up Boost (Testing)
    const nextLvl = level + 1;
    setLevel(nextLvl);
    setLastLevelReached(nextLvl);

    // Inventory Boost
    setInventory((prev: any) => ({
      ...prev,
      wheat: (prev.wheat || 0) + 10,
      tomato: (prev.tomato || 0) + 10,
      pumpkin: (prev.pumpkin || 0) + 10,
      apple: (prev.apple || 0) + 10,
      peach: (prev.peach || 0) + 10,
      cherry: (prev.cherry || 0) + 10,
      wood: (prev.wood || 0) + 10,
    }));

    // Resource Boost (+50 each for testing)
    setResources((prev: any) => ({
      ...prev,
      wood: (prev.wood || 0) + 50,
      metal: (prev.metal || 0) + 50,
      coins: (prev.coins || 0) + 50
    }));
  };
  const handleToggleTrip = () => {
    setIsTripping(!isTripping);
  };

  const handleHarvestNotification = useCallback((item: string, count: number) => {
    setHarvestNotification({ item, count });
    setTimeout(() => setHarvestNotification(null), 3000);
  }, []);

  const handleBuy = (item: string, cost: number, amount: number) => {
    if ((resources.coins || 0) >= cost) {
      setResources((prev: any) => ({
        ...prev,
        coins: prev.coins - cost,
        [item]: (prev[item] || 0) + amount
      }));
    }
  };

  const handleSell = (item: string, price: number, amount: number) => {
    if ((inventory[item] || 0) >= amount) {
      // Find bonus wood from MarketUI logic
      const marketItems = [
        { id: 'wheat', price: 10, bonusWood: 3 },
        { id: 'tomato', price: 8, bonusWood: 1 },
        { id: 'peach', price: 10, bonusWood: 1 },
        { id: 'wool', price: 15, bonusWood: 10 }
      ];
      const match = marketItems.find(i => i.id === item);
      const bonusWood = (match?.bonusWood || 0) * amount;

      setInventory((prev: any) => ({
        ...prev,
        [item]: prev[item] - amount
      }));
      setResources((prev: any) => ({
        ...prev,
        coins: (prev.coins || 0) + price,
        wood: (prev.wood || 0) + bonusWood
      }));
    }
  };

  const renderBackpackView = () => {
    const items = [
      { id: 'wheat', label: 'WHEAT', icon: '/images/garden-wheat.png' },
      { id: 'tomato', label: 'TOMATO', icon: '/images/garden-tomato.png' },
      { id: 'pumpkin', label: 'PUMPKIN', icon: '/images/garden-pumpkin.png' },
      { id: 'apple', label: 'APPLE', icon: '/images/garden-apple.png' },
      { id: 'peach', label: 'PEACH', icon: '/images/garden-peach.png' },
      { id: 'cherry', label: 'CHERRY', icon: '/images/garden-cherry.png' },
      { id: 'milk', label: 'MILK', icon: '/images/milk.png' },
      { id: 'wool', label: 'SHEALING', icon: '/images/shealing.png' },
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

  if (windowWidth > 600) {
    return (
      <div className="fixed inset-0 z-[20000] bg-[#1d3a19] flex flex-col items-center justify-center p-8 text-center font-['Press_Start_2P']">
         <img src="/images/logo.png" className="w-32 h-32 mb-8 object-contain" alt="Logo" />
         <h1 className="text-[#e9d681] text-xl mb-4">WARDEN</h1>
         <p className="text-[#f9f5f0] text-[12px] leading-relaxed max-w-sm">
           GAME IS OPTIMISED FOR MOBILE ONLY. PLEASE RESIZE YOUR BROWSER OR OPEN ON A MOBILE DEVICE.
         </p>
         <div className="mt-8 text-[#8b7a6d] text-[8px] uppercase opacity-50">Width: {windowWidth}px</div>
      </div>
    );
  }

  if (!imagesLoaded) {
    return (
      <div className="fixed inset-0 z-[10000] bg-[#1d3a19] flex flex-col items-center justify-center font-['Press_Start_2P']">
         <div className="flex flex-col items-center gap-8">
            <div className="relative w-24 h-24">
               <div className="absolute inset-0 border-4 border-[#3e2723] rounded-full"></div>
               <div className="absolute inset-0 border-4 border-[#e9d681] rounded-full border-t-transparent animate-spin"></div>
               <img src="/images/tools-wood.png" className="absolute inset-0 m-auto w-10 h-10 object-contain" alt="Loading" />
            </div>
            <div className="text-[#e9d681] text-[10px] animate-pulse">LOADING WORLD...</div>
         </div>
      </div>
    );
  }

  if (appState === 'onboarding') {
    return (
      <OnboardingOverlay
        onComplete={handleOnboardingComplete}
        onSkip={handleOnboardingComplete}
      />
    );
  }
  if (appState === 'character-selection') {
    return <CharacterSelection onStart={handleCharacterSelectionComplete} />;
  }

  if (appState === 'login') {
    return <LoginScreen onLogin={handleLogin} />;
  }

  if (appState === 'role-selection') {
    return <RoleSelection onSelect={handleRoleSelect} />;
  }

  return (
    <div className={`relative w-screen min-h-screen ${activeTab === 'backpack' || activeTab === 'settings' ? 'bg-[#f9f5f0]' : 'bg-[#1e88e5]'}`}>
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
                  level={level}
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
              onBuild={(type: string, cost: any, pos: {x: number, y: number}, isMove: boolean = false) => {
                if (!type) {
                  setIsPlacing(false);
                  setPendingBuilding(null);
                  return;
                }
                
                // If moving, we don't deduct cost
                const actualCost = isMove ? {} : cost;
                const newBuildingId = addBuilding(type, actualCost, pos);
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
              catType={catType}
              interactWithBuilding={(id: string, action: string, data?: any) => 
                interactWithBuilding(id, action, data, handleHarvestNotification)
              }
              initialSelectedBuilding={initialSelectedBuilding}
              onClearInitialSelection={() => setInitialSelectedBuilding(null)}
              isInsideHouse={isInsideHouse}
              minutesSlept={minutesSlept}
              treeCooldowns={treeCooldowns}
              resources={resources}
              setResources={setResources}
              inventory={inventory}
              setInventory={setInventory}
              islandMap={islandMap}
              expandLand={expandLand}
              expansionCost={expansionCost}
              npcs={npcs}
              removedDecorations={removedDecorations}
              shopOpen={shopOpen}
              setShopOpen={setShopOpen}
              marketOpen={marketOpen}
              setMarketOpen={setMarketOpen}
              selectedBedForMenu={selectedBedForMenu}
              setSelectedBedForMenu={setSelectedBedForMenu}
              selectedBedForActionMenu={selectedBedForActionMenu}
              setSelectedBedForActionMenu={setSelectedBedForActionMenu}
              confirmTreeCollect={confirmTreeCollect}
              setConfirmTreeCollect={setConfirmTreeCollect}
              expansionConfirm={expansionConfirm}
              setExpansionConfirm={setExpansionConfirm}
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
                addBuilding(type, cost, { x: lng, y: lat });
                setIsPlacing(false);
                setPendingBuilding(null);
              }}
              buildings={buildings}
              catType={catType}
              devMode={devMode}
            />
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="w-full bg-[#f9f5f0] p-10 pb-32 font-['Press_Start_2P'] flex flex-col items-center">
            <h2 className="text-[#3e2723] text-center text-[14px] uppercase mb-12">SETTINGS</h2>
            
            <div className="flex flex-col gap-6 w-full max-w-xs">
                <div className="flex flex-col items-center gap-2">
                   <div className="text-[7px] text-[#8b7a6d] uppercase">USER</div>
                   <div className="text-[14px] text-[#3e2723]">{user}</div>
                </div>
                
                <div className="flex flex-col items-center gap-2">
                   <div className="text-[7px] text-[#8b7a6d] uppercase">ROLE</div>
                   <div className="text-[14px] text-[#3e2723]">{role?.name}</div>
                </div>

                <div className="flex items-center justify-between bg-[#f1ebe3] p-4 rounded-2xl shadow-sm mt-4">
                  <span className="text-[#3e2723] text-[9px]">DEV MODE</span>
                  <button 
                    onClick={() => setDevMode(!devMode)}
                    className={`w-12 h-6 rounded-full transition-colors relative ${devMode ? 'bg-green-500' : 'bg-[#d1c4b9]'}`}
                  >
                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${devMode ? 'left-7' : 'left-1'}`} />
                  </button>
                </div>

                <div className="flex flex-col gap-3 mt-4">
                  <button 
                    onClick={() => {
                       setDeleteConfirm({ type: 'restart' });
                    }}
                    className="btn-off-white py-4 text-[10px] w-full shadow-[0_4px_0_0_#d1c4b9]"
                  >
                    RESTART GAME
                  </button>
                  <button 
                    onClick={() => setAppState('login')}
                    className="btn-off-white py-4 text-[10px] w-full shadow-[0_4px_0_0_#d1c4b9]"
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
      
      {/* GLOBAL MODALS (Highest Z-index) */}
      <div className="modal-root">
        {/* Produce Selection Menu Overlay */}
        {selectedBedForMenu && (
          <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 pointer-events-auto font-['Press_Start_2P'] animate-in fade-in duration-200">
            <div className="p-8 flex flex-col items-center gap-6 max-w-[360px] w-full bg-[#f9f5f0] border-4 border-[#3e2723] shadow-xl relative rounded-3xl">
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedBedForMenu(null);
                  }}
                  className="absolute top-4 right-4 w-8 h-8 btn-off-white flex items-center justify-center text-[10px]"
                >
                  X
                </button>
                {(() => {
                  const b = buildings.find((b: any) => b.id === selectedBedForMenu);
                  if (!b) return null;
                  const BUILDING_NAMES: Record<string, string> = {
                    'starter-house': 'FOUNDER’S LODGE',
                    'garden-bed': 'GARDEN BED',
                    'garden-tree': 'GARDEN TREE',
                    'mini-house': 'WORKER’S CONDO',
                    'shop': 'GENERAL STORE',
                    'market': 'FARMERS’ MARKET',
                    'hotel': 'FOXGLOVE INN'
                  };
                  const title = BUILDING_NAMES[b.type] || b.type.replace('-', ' ').toUpperCase();
                  return <h3 className="text-[#3e2723] text-[12px] uppercase text-center">{title}</h3>;
                })()}
                
                <div className="grid grid-cols-1 gap-4 w-full">
                  {(() => {
                    const b = buildings.find((b: any) => b.id === selectedBedForMenu);
                    const items = b?.type === 'garden-tree'
                      ? [
                          { type: 'apple', name: 'APPLE', icon: '/images/garden-apple.png' },
                          { type: 'peach', name: 'PEACH', icon: '/images/garden-peach.png' },
                          { type: 'cherry', name: 'CHERRY', icon: '/images/garden-cherry.png' }
                        ]
                      : [
                          { type: 'wheat', name: 'WHEAT', icon: '/images/garden-wheat.png' },
                          { type: 'tomato', name: 'TOMATO', icon: '/images/garden-tomato.png' },
                          { type: 'pumpkin', name: 'PUMPKIN', icon: '/images/garden-pumpkin.png' }
                        ];
                    return items.map(p => (
                      <button
                        key={p.type}
                        onClick={(e) => {
                          e.stopPropagation();
                          interactWithBuilding(selectedBedForMenu, 'select-produce', { produceType: p.type });
                          setSelectedBedForMenu(null);
                        }}
                        className="flex items-center gap-4 btn-off-white p-4 text-left"
                      >
                        <img src={p.icon} alt={p.name} className="w-10 h-10 object-contain pixel-art" style={{ imageRendering: 'pixelated' }} />
                        <span className="text-[#3e2723] text-[10px]">{p.name}</span>
                      </button>
                    ));
                  })()}
                </div>
            </div>
          </div>
        )}

        {/* Action Menu Overlay (Levels 2-5 and House) */}
        {selectedBedForActionMenu && (
          <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 pointer-events-auto font-['Press_Start_2P'] animate-in fade-in duration-200">
            <div className="p-8 flex flex-col items-center gap-6 max-w-[360px] w-full bg-[#f9f5f0] border-4 border-[#3e2723] shadow-xl relative rounded-3xl">
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedBedForActionMenu(null);
                  }}
                  className="absolute top-4 right-4 w-8 h-8 btn-off-white flex items-center justify-center text-[10px]"
                >
                  X
                </button>
                {(() => {
                  const b = buildings.find((b: any) => b.id === selectedBedForActionMenu);
                  if (!b) return null;
                  
                  const BUILDING_NAMES: Record<string, string> = {
                    'starter-house': 'FOUNDER’S LODGE',
                    'garden-bed': 'GARDEN BED',
                    'garden-tree': 'GARDEN TREE',
                    'mini-house': 'WORKER’S CONDO',
                    'shop': 'GENERAL STORE',
                    'market': 'FARMERS’ MARKET',
                    'hotel': 'FOXGLOVE INN',
                    'lucky-farm': 'LUCKY FARM'
                  };

                  let title = BUILDING_NAMES[b.type] || b.type.replace('-', ' ').toUpperCase();
                  if (b.type === 'garden-bed' || b.type === 'garden-tree') {
                    if (b.growthState?.produceType) {
                      title = b.growthState.produceType.toUpperCase();
                    }
                  }
                  return (
                    <div className="flex flex-col items-center gap-2 w-full">
                      <h3 className="text-[#3e2723] text-[12px] uppercase text-center">{title}</h3>
                      {b.type === 'lucky-farm' && b.hotelStatus && (
                        <div className="w-full max-w-[200px] bg-[#e6ded5] h-4 rounded-full overflow-hidden border border-[#d1c4b9] relative">
                          <div 
                            className="h-full bg-blue-400 transition-all duration-500"
                            style={{ width: `${b.hotelStatus.moisture}%` }}
                          />
                          <div className="absolute inset-0 flex items-center justify-center text-[6px] text-[#3e2723] font-bold">
                            MOISTURE: {Math.round(b.hotelStatus.moisture)}%
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}
                
                <div className="grid grid-cols-1 gap-4 w-full">
                  {(() => {
                    const b = buildings.find((b: any) => b.id === selectedBedForActionMenu);
                    if (!b) return null;
                    const gs = b.growthState;

                    return (
                      <>
                        {/* Garden Bed or Tree Specific Actions */}
                        {(b.type === 'garden-bed' || b.type === 'garden-tree') && gs && (
                          <>
                            {gs.currentLevel === 3 && Date.now() >= (gs.waterNeededAt || 0) && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  interactWithBuilding(b.id, 'water');
                                  setSelectedBedForActionMenu(null);
                                }}
                                className="flex items-center gap-4 btn-off-white p-4 text-left"
                              >
                                <img src="/images/garden-watering-can.png" className="w-10 h-10 object-contain pixel-art" style={{ imageRendering: 'pixelated' }} alt="Water" />
                                <span className="text-[#3e2723] text-[10px]">WATER</span>
                              </button>
                            )}

                            {gs.currentLevel === 4 && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  interactWithBuilding(b.id, 'harvest');
                                  setSelectedBedForActionMenu(null);
                                }}
                                className="flex items-center gap-4 btn-off-white p-4 text-left"
                              >
                                <img src="/images/garden-pick.png" className="w-10 h-10 object-contain pixel-art" style={{ imageRendering: 'pixelated' }} alt="Pick" />
                                <span className="text-[#3e2723] text-[10px]">PICK</span>
                              </button>
                            )}
                          </>
                        )}

                        {/* Starter House Specific Actions */}
                        {b.type === 'starter-house' && (
                          <>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                interactWithBuilding(b.id, 'sleep');
                                setSelectedBedForActionMenu(null);
                              }}
                              className="flex items-center gap-4 btn-off-white p-4 text-left"
                            >
                              <img src="/images/sleep.png" className="w-10 h-10 object-contain pixel-art" style={{ imageRendering: 'pixelated' }} alt="Sleep" />
                              <span className="text-[#3e2723] text-[10px]">GO TO SLEEP</span>
                            </button>
                            </>
                            )}

                            {/* Mini House Specific Actions */}
                            {b.type === 'mini-house' && (
                            <>
                            {!b.hasWorkerRequested ? (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  interactWithBuilding(b.id, 'invite-worker');
                                  setSelectedBedForActionMenu(null);
                                }}
                                className="flex items-center gap-4 btn-off-white p-4 text-left"
                              >
                                <img src="/images/work-invite.png" className="w-10 h-10 object-contain pixel-art" style={{ imageRendering: 'pixelated' }} alt="Worker" />
                                <span className="text-[#3e2723] text-[10px]">INVITE WORKER</span>
                              </button>
                            ) : (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  interactWithBuilding(b.id, 'leave-worker');
                                  setSelectedBedForActionMenu(null);
                                }}
                                className="flex items-center gap-4 btn-off-white p-4 text-left"
                              >
                                <img src="/images/ask-to-leave.png" className="w-10 h-10 object-contain pixel-art" style={{ imageRendering: 'pixelated' }} alt="Worker" />
                                <span className="text-[#3e2723] text-[10px]">ASK WORKER TO LEAVE</span>
                              </button>
                            )}
                            </>
                            )}

                            {/* Shop Specific Actions */}
                            {b.type === 'shop' && (
                            <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setShopOpen(true);
                              setSelectedBedForActionMenu(null);
                            }}
                            className="flex items-center gap-4 btn-off-white p-4 text-left"
                            >
                            <img src="/images/Shop.png" className="w-10 h-10 object-contain pixel-art" style={{ imageRendering: 'pixelated' }} alt="Shop" />
                            <span className="text-[#3e2723] text-[10px]">OPEN SHOP</span>
                            </button>
                            )}

                            {/* Market Specific Actions */}
                            {b.type === 'market' && (
                            <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setMarketOpen(true);
                              setSelectedBedForActionMenu(null);
                            }}
                            className="flex items-center gap-4 btn-off-white p-4 text-left"
                            >
                            <img src="/images/Market.png" className="w-10 h-10 object-contain pixel-art" style={{ imageRendering: 'pixelated' }} alt="Market" />
                            <span className="text-[#3e2723] text-[10px]">OPEN MARKET</span>
                            </button>
                            )}

                            {/* Hotel Specific Actions */}
                            {b.type === 'hotel' && (
                            <>
                            <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const currentFoxes = npcs.filter(n => n.type === 'vacationer' && n.targetHotelId === b.id).length;
                              if (currentFoxes < 5) {
                                interactWithBuilding(b.id, 'invite-vacationer');
                                setSelectedBedForActionMenu(null);
                              } else {
                                alert("Hotel is full!");
                              }
                            }}
                            className="flex items-center gap-4 btn-off-white p-4 text-left"
                            >
                            <img src="/images/vac-invite.png" className="w-10 h-10 object-contain pixel-art" style={{ imageRendering: 'pixelated' }} alt="Vacationer" />
                            <div className="flex flex-col">
                              <span className="text-[#3e2723] text-[10px]">INVITE VACATIONER</span>
                              <span className="text-[#8b7a6d] text-[8px] uppercase">
                                {npcs.filter(n => n.type === 'vacationer' && n.targetHotelId === b.id).length} / 5 GUESTS
                              </span>
                            </div>
                            </button>

                            {npcs.filter(n => n.type === 'vacationer' && n.targetHotelId === b.id && n.status !== 'leaving').length > 0 && (
                              <button
                              onClick={(e) => {
                                e.stopPropagation();
                                interactWithBuilding(b.id, 'leave-vacationer');
                                setSelectedBedForActionMenu(null);
                              }}
                              className="flex items-center gap-4 btn-off-white p-4 text-left"
                              >
                              <img src="/images/ask-to-leave.png" className="w-10 h-10 object-contain pixel-art" style={{ imageRendering: 'pixelated' }} alt="Ask to Leave" />
                              <span className="text-[#3e2723] text-[10px]">ASK GUEST TO LEAVE</span>
                              </button>
                            )}
                            </>
                            )}

                            {/* Lucky Farm Specific Actions */}
                            {b.type === 'lucky-farm' && (
                            <div className="flex flex-col gap-3">
                            {b.hotelStatus?.farmStatus === 'alive' ? (
                              <>
                              {b.hotelStatus?.moisture < 100 && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    interactWithBuilding(b.id, 'water-hotel');
                                    setSelectedBedForActionMenu(null);
                                  }}
                                  className="flex items-center gap-4 btn-off-white p-4 text-left"
                                >
                                  <img src="/images/garden-watering-can.png" className="w-10 h-10 object-contain pixel-art" style={{ imageRendering: 'pixelated' }} alt="Water" />
                                  <span className="text-[#3e2723] text-[10px]">WATER GRASS</span>
                                </button>
                              )}

                              {b.hotelStatus?.producedItems && (b.hotelStatus.producedItems.milk > 0 || b.hotelStatus.producedItems.wool > 0) && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    interactWithBuilding(b.id, 'collect-farm');
                                    setSelectedBedForActionMenu(null);
                                  }}
                                  className="flex items-center gap-4 btn-off-white p-4 text-left border-2 border-green-500"
                                >
                                  <img src="/images/garden-pick.png" className="w-10 h-10 object-contain pixel-art" style={{ imageRendering: 'pixelated' }} alt="Collect" />
                                  <div className="flex flex-col">
                                    <span className="text-green-600 text-[10px] font-bold uppercase">COLLECT</span>
                                    <span className="text-[#8b7a6d] text-[7px] uppercase">
                                      {b.hotelStatus.producedItems.milk} Milk, {b.hotelStatus.producedItems.wool} Shealing
                                      </span>                                  </div>
                                </button>
                              )}

                              <div className="grid grid-cols-2 gap-2">
                                {(() => {
                                  const cows = b.hotelStatus.guests.filter((g: any) => g.type === 'cow').length;
                                  return (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (cows < 3) {
                                          interactWithBuilding(b.id, 'invite-cow');
                                          setSelectedBedForActionMenu(null);
                                        }
                                      }}
                                      disabled={cows >= 3}
                                      className={`flex flex-col items-center gap-2 btn-off-white p-3 text-center ${cows >= 3 ? 'opacity-50 grayscale cursor-not-allowed' : ''}`}
                                    >
                                      <img src="/images/avatar-cow.png" className="w-8 h-8 object-contain pixel-art" style={{ imageRendering: 'pixelated' }} alt="Cow" />
                                      <div className="flex flex-col">
                                        <span className="text-[#3e2723] text-[8px]">INVITE COW</span>
                                        <span className="text-[#8b7a6d] text-[6px] uppercase">{cows}/3</span>
                                      </div>
                                    </button>
                                  );
                                })()}
                                {(() => {
                                  const sheeps = b.hotelStatus.guests.filter((g: any) => g.type === 'sheep').length;
                                  return (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (sheeps < 3) {
                                          interactWithBuilding(b.id, 'invite-sheep');
                                          setSelectedBedForActionMenu(null);
                                        }
                                      }}
                                      disabled={sheeps >= 3}
                                      className={`flex flex-col items-center gap-2 btn-off-white p-3 text-center ${sheeps >= 3 ? 'opacity-50 grayscale cursor-not-allowed' : ''}`}
                                    >
                                      <img src="/images/avatar-sheep.png" className="w-8 h-8 object-contain pixel-art" style={{ imageRendering: 'pixelated' }} alt="Sheep" />
                                      <div className="flex flex-col">
                                        <span className="text-[#3e2723] text-[8px]">INVITE SHEEP</span>
                                        <span className="text-[#8b7a6d] text-[6px] uppercase">{sheeps}/3</span>
                                      </div>
                                    </button>
                                  );
                                })()}
                              </div>
                              </>
                            ) : (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  interactWithBuilding(b.id, 'renew-farm');
                                  setSelectedBedForActionMenu(null);
                                }}
                                className="flex items-center gap-4 btn-off-white p-4 text-left w-full border-2 border-red-500"
                              >
                                <img src="/images/garden-shovel.png" className="w-10 h-10 object-contain pixel-art" style={{ imageRendering: 'pixelated' }} alt="Renew" />
                                <span className="text-red-500 text-[10px] font-bold uppercase">Renew (Shovel)</span>
                              </button>
                            )}

                            {b.hotelStatus?.guests.length > 0 && (
                              <div className="flex flex-col gap-2 mt-1 bg-[#e6ded5] p-2 rounded-xl">
                                <div className="text-[7px] text-[#8b7a6d] uppercase text-center font-bold">CURRENT ANIMALS</div>
                                <div className="flex flex-wrap gap-2 justify-center">
                                  {b.hotelStatus.guests.map((g: any) => (
                                    <div key={g.id} className="flex flex-col items-center gap-1">
                                      <div className="relative group">
                                        <img src={`/images/${g.type === 'cow' ? 'avatar-cow' : 'avatar-sheep'}.png`} className="w-8 h-8 object-contain" alt={g.type} />
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            interactWithBuilding(b.id, 'leave-guest', { guestId: g.id });
                                          }}
                                          className="absolute -top-1 -right-1 bg-red-500 text-white w-4 h-4 rounded-full flex items-center justify-center text-[8px] border border-white"
                                          title="Ask to leave"
                                        >
                                          X
                                        </button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            
                            <div className="text-[7px] text-[#8b7a6d] uppercase text-center mt-2">
                               Moisture: {Math.round(b.hotelStatus?.moisture || 0)}%
                            </div>
                            </div>
                            )}

                            {/* Common Remove Action for all player buildings */}
                            <div className="flex justify-center mt-2">
                            <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteConfirm({ id: b.id, type: 'building' });
                              setSelectedBedForActionMenu(null);
                            }}
                            className="flex items-center gap-4 btn-off-white p-4 w-full"
                            >
                            <img src="/images/garden-bin.png" className="w-8 h-8 object-contain pixel-art" style={{ imageRendering: 'pixelated' }} alt="Remove" />
                            <span className="text-[#3e2723] text-[8px]">DELETE</span>
                            </button>
                            </div>                      </>
                    );
                  })()}
                </div>
            </div>
          </div>
        )}

        {/* Tree Collection Confirmation Modal */}
        {confirmTreeCollect && (
          <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 pointer-events-auto font-['Press_Start_2P'] animate-in fade-in zoom-in duration-200">
            <div className="p-8 flex flex-col items-center gap-6 max-w-[300px] w-full bg-[#f9f5f0] border-4 border-[#3e2723] shadow-xl relative rounded-3xl">
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    setConfirmTreeCollect(null);
                  }}
                  className="absolute top-4 right-4 w-8 h-8 btn-off-white flex items-center justify-center text-[10px]"
                >
                  X
                </button>
                <h3 className="text-[#3e2723] text-[12px] uppercase text-center">TREE</h3>
                <div className="flex flex-col gap-3 w-full justify-center">
                    <button 
                      onClick={(e) => {
                          e.stopPropagation();
                          interactWithBuilding(confirmTreeCollect, 'collect-default-wood');
                          setConfirmTreeCollect(null);
                      }}
                      className="flex items-center gap-4 btn-off-white p-4 text-left w-full"
                    >
                      <img src="/images/garden-pick.png" className="w-10 h-10 object-contain pixel-art" style={{ imageRendering: 'pixelated' }} alt="Pick" />
                      <span className="text-[#3e2723] text-[10px]">PICK</span>
                    </button>
                    
                    <button 
                      onClick={(e) => {
                          e.stopPropagation();
                          setDeleteConfirm({ id: confirmTreeCollect, type: 'decoration' });
                          setConfirmTreeCollect(null);
                      }}
                      className="flex items-center gap-4 btn-off-white p-4 text-left w-full"
                    >
                      <img src="/images/garden-bin.png" className="w-10 h-10 object-contain pixel-art" style={{ imageRendering: 'pixelated' }} alt="Remove" />
                      <span className="text-[#3e2723] text-[10px]">REMOVE</span>
                    </button>
                </div>
            </div>
          </div>
        )}

        {/* Expansion Confirmation Modal */}
        {expansionConfirm && (
          <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 pointer-events-auto font-['Press_Start_2P'] animate-in fade-in zoom-in duration-200">
            <div className="p-8 flex flex-col items-center gap-6 max-w-[320px] w-full bg-[#f9f5f0] border-4 border-[#3e2723] shadow-xl relative rounded-3xl">
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    setExpansionConfirm(null);
                  }}
                  className="absolute top-4 right-4 w-8 h-8 btn-off-white flex items-center justify-center text-[10px]"
                >
                  X
                </button>
                <h3 className="text-[#3e2723] text-[12px] uppercase text-center">EXPAND ISLAND?</h3>
                
                <div className="flex flex-col items-center gap-4 text-center">
                  <div className="text-[#8b7a6d] text-[8px] leading-relaxed">
                    CONVERT SAND TO GRASS AND EXTEND THE BEACH.
                  </div>
                  <div className="flex items-center gap-2 bg-[#e6ded5] px-4 py-2 rounded-full">
                    <span className="text-[#3e2723] text-[10px]">COST:</span>
                    <img src="/images/tools-coins.png" className="w-4 h-4" />
                    <span className={`text-[10px] ${(resources.coins || 0) >= expansionCost ? 'text-[#3e2723]' : 'text-red-600'}`}>
                      {expansionCost}
                    </span>
                  </div>
                </div>

                <button 
                  onClick={(e) => {
                      e.stopPropagation();
                      if (expandLand(expansionConfirm.c, expansionConfirm.r)) {
                        setExpansionConfirm(null);
                      } else {
                        alert("Not enough coins!");
                      }
                  }}
                  disabled={(resources.coins || 0) < expansionCost}
                  className={`w-full py-4 text-[10px] btn-off-white ${
                    (resources.coins || 0) < expansionCost ? 'opacity-50 cursor-not-allowed grayscale' : ''
                  }`}
                >
                  CONFIRM EXPANSION
                </button>
            </div>
          </div>
        )}

        {deleteConfirm && (
          <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 pointer-events-auto font-['Press_Start_2P'] animate-in fade-in zoom-in duration-200">
            <div className="p-8 flex flex-col items-center gap-6 max-w-[320px] w-full bg-[#f9f5f0] border-4 border-[#3e2723] shadow-xl relative rounded-3xl">
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteConfirm(null);
                  }}
                  className="absolute top-4 right-4 w-8 h-8 btn-off-white flex items-center justify-center text-[10px]"
                >
                  X
                </button>
                <h3 className="text-[#3e2723] text-[12px] uppercase text-center">CONFIRM ACTION</h3>
                
                <div className="flex flex-col items-center gap-4 text-center">
                  <div className="text-[#8b7a6d] text-[8px] leading-relaxed">
                    {deleteConfirm.type === 'restart' && "RESTART GAME? ALL PROGRESS WILL BE LOST."}
                    {deleteConfirm.type === 'building' && "ARE YOU SURE YOU WANT TO DELETE THIS BUILDING?"}
                    {deleteConfirm.type === 'decoration' && "REMOVE THIS TREE FROM LAND?"}
                  </div>
                </div>

                <div className="flex flex-col gap-3 w-full">
                  <button 
                    onClick={(e) => {
                        e.stopPropagation();
                        if (deleteConfirm.type === 'restart') {
                          resetGame();
                          setAppState('onboarding');
                          setDeleteConfirm(null);
                        } else if (deleteConfirm.type === 'building' && deleteConfirm.id) {
                          interactWithBuilding(deleteConfirm.id, 'remove');
                          setDeleteConfirm(null);
                        } else if (deleteConfirm.type === 'decoration' && deleteConfirm.id) {
                          interactWithBuilding(deleteConfirm.id, 'remove-decoration');
                          setDeleteConfirm(null);
                        }
                    }}
                    className="w-full py-4 text-[10px] bg-[#d32f2f] text-white border-4 border-[#3e2723] shadow-[0_4px_0_0_#b71c1c] active:shadow-none active:translate-y-1"
                  >
                    {deleteConfirm.type === 'restart' ? 'RESTART' : 'REMOVE'}
                  </button>
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteConfirm(null);
                    }}
                    className="w-full py-4 text-[10px] btn-off-white"
                  >
                    CANCEL
                  </button>
                </div>
            </div>
          </div>
        )}

        {shopOpen && (
          <ShopUI 
            resources={resources} 
            onBuy={(item, cost, amount) => handleBuy(item, cost, amount)} 
            onClose={() => setShopOpen(false)} 
          />
        )}

        {marketOpen && (
          <MarketUI 
            inventory={inventory} 
            onSell={(item, price, amount) => handleSell(item, price, amount)} 
            onClose={() => setMarketOpen(false)} 
          />
        )}
      </div>

      {/* Level Up Modal */}
      {lastLevelReached && (
        <div className="fixed inset-0 z-[20000] flex items-center justify-center bg-black/60 backdrop-blur-md p-4 font-['Press_Start_2P']" onClick={() => setLastLevelReached(null)}>
          <div className="bg-[#f9f5f0] border-4 border-[#3e2723] p-8 rounded-3xl shadow-xl flex flex-col items-center gap-6 max-w-[400px] w-full text-center animate-in zoom-in duration-300" onClick={e => e.stopPropagation()}>
            <h2 className="text-[#3e2723] text-[16px] uppercase animate-bounce">LEVEL {lastLevelReached} REACHED!</h2>
            
            <div className="flex flex-col gap-4 w-full">
               <div className="text-[#8b7a6d] text-[8px] uppercase">REWARDS EARNED:</div>
               <div className="flex justify-center gap-6 bg-[#e6ded5] p-4 rounded-2xl">
                 <div className="flex flex-col items-center gap-2">
                   <img src="/images/tools-coins.png" className="w-6 h-6" alt="Coins" />
                   <span className="text-[10px] text-[#3e2723]">+{lastLevelReached >= 20 ? 40 : lastLevelReached >= 10 ? 20 : 10}</span>
                 </div>
                 <div className="flex flex-col items-center gap-2">
                   <img src="/images/tools-wood.png" className="w-6 h-6" alt="Wood" />
                   <span className="text-[10px] text-[#3e2723]">+{lastLevelReached >= 20 ? 20 : lastLevelReached >= 10 ? 10 : 5}</span>
                 </div>
                 <div className="flex flex-col items-center gap-2">
                   <img src="/images/tools-iron.png" className="w-6 h-6" alt="Metal" />
                   <span className="text-[10px] text-[#3e2723]">+{lastLevelReached >= 20 ? 20 : lastLevelReached >= 10 ? 10 : 5}</span>
                 </div>
               </div>
            </div>

            {/* Unlock Section */}
            {(lastLevelReached === 3 || lastLevelReached === 6 || lastLevelReached === 9 || lastLevelReached === 12 || lastLevelReached === 20) && (
              <div className="flex flex-col gap-4 w-full border-t-2 border-[#d1c4b9] pt-6">
                 <div className="text-[#3e2723] text-[8px] uppercase animate-pulse">NEW BUILDING AVAILABLE!</div>
                 <div className="flex flex-col items-center gap-4 bg-[#f1ebe3] p-4 rounded-2xl self-center border-2 border-[#e9d681] w-full">
                    <div className="flex items-center gap-4">
                      {lastLevelReached === 3 && (
                        <>
                          <img src="/images/garden-apple-4.png" className="w-10 h-10 object-contain" alt="Tree" />
                          <div className="text-[8px] text-[#3e2723] font-bold">GARDEN TREE</div>
                        </>
                      )}
                      {lastLevelReached === 6 && (
                        <>
                          <img src="/images/mini-house.png" className="w-10 h-10 object-contain" alt="Condo" />
                          <div className="text-[8px] text-[#3e2723] font-bold">WORKER’S CONDO</div>
                        </>
                      )}
                      {lastLevelReached === 9 && (
                        <>
                          <img src="/images/Shop.png" className="w-10 h-10 object-contain" alt="Store" />
                          <div className="text-[8px] text-[#3e2723] font-bold">GENERAL STORE</div>
                        </>
                      )}
                      {lastLevelReached === 12 && (
                        <>
                          <img src="/images/Market.png" className="w-10 h-10 object-contain" alt="Market" />
                          <div className="text-[8px] text-[#3e2723] font-bold">FARMERS’ MARKET</div>
                        </>
                      )}
                      {lastLevelReached === 20 && (
                        <>
                          <img src="/images/Storage.png" className="w-10 h-10 object-contain" alt="Inn" />
                          <div className="text-[8px] text-[#3e2723] font-bold">FOXGLOVE INN</div>
                        </>
                      )}
                    </div>
                    <div className="text-[#8b7a6d] text-[7px] leading-relaxed uppercase max-w-[200px]">
                      {lastLevelReached === 3 && "Plant fruit trees here to harvest apples, peaches and more."}
                      {lastLevelReached === 6 && "Invite workers to live here and work in your garden automatically."}
                      {lastLevelReached === 9 && "Buy raw materials, seeds and various resources."}
                      {lastLevelReached === 12 && "Sell your harvest for coins to grow your village."}
                      {lastLevelReached === 20 && "Attracts fox guests who will pay you for their stay."}
                    </div>
                 </div>
              </div>
            )}

            <button 
              onClick={() => setLastLevelReached(null)}
              className="w-full py-4 text-[10px] btn-off-white mt-4"
            >
              SWEET!
            </button>
          </div>
        </div>
      )}

      {/* Floating Debug Button for Mobile testing */}
      {activeTab === 'village' && devMode && (
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
