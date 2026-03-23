import { useState, useEffect, useRef } from 'react'
import { useGameState } from './useGameState'
import HUD from './HUD'
import BuildMenu from './BuildMenu'
import MapComponent from './MapComponent'
import LoginScreen from './LoginScreen'
import RoleSelection from './RoleSelection'
import BottomNav from './BottomNav'
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
  const clickTimeoutRef = useRef<any>(null);
  
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
    villageZoom, setVillageZoom
  } = useGameState();

  // Keyboard controls for avatar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsPlacing(false);
        setPendingBuilding(null);
      }
      if (activeTab !== 'village' || isPlacing) return;
      const step = 20 / villageZoom;
      if (e.key === 'ArrowUp') { moveAvatar(0, -step); setFacing('up'); }
      if (e.key === 'ArrowDown') { moveAvatar(0, step); setFacing('down'); }
      if (e.key === 'ArrowLeft') { moveAvatar(-step, 0); setFacing('left'); }
      if (e.key === 'ArrowRight') { moveAvatar(step, 0); setFacing('right'); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTab, moveAvatar, isPlacing, villageZoom]);

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
          <div 
            className={`relative w-full h-full overflow-hidden bg-[#4caf50] ${isPlacing ? 'cursor-crosshair' : ''}`}
            onClick={(e) => {
              if (!isPlacing || !pendingBuilding) return;
              
              if (clickTimeoutRef.current) {
                clearTimeout(clickTimeoutRef.current);
                clickTimeoutRef.current = null;
                return;
              }

              const rect = e.currentTarget.getBoundingClientRect();
              // Calculate world coordinates by accounting for camera and zoom
              const worldX = (e.clientX - rect.left - rect.width / 2) / villageZoom + avatarPos.x;
              const worldY = (e.clientY - rect.top - rect.height / 2) / villageZoom + avatarPos.y;

              clickTimeoutRef.current = setTimeout(() => {
                addBuilding(pendingBuilding.type, pendingBuilding.cost, { x: worldX, y: worldY });
                setIsPlacing(false);
                setPendingBuilding(null);
                clickTimeoutRef.current = null;
              }, 250);
            }}
            onDoubleClick={() => {
              if (isPlacing) {
                if (clickTimeoutRef.current) {
                  clearTimeout(clickTimeoutRef.current);
                  clickTimeoutRef.current = null;
                }
                setIsPlacing(false);
                setPendingBuilding(null);
              }
            }}
            onMouseMove={(e) => {
              if (isPlacing) {
                const rect = e.currentTarget.getBoundingClientRect();
                const worldX = (e.clientX - rect.left - rect.width / 2) / villageZoom + avatarPos.x;
                const worldY = (e.clientY - rect.top - rect.height / 2) / villageZoom + avatarPos.y;
                setMousePos({ x: worldX, y: worldY });
              }
            }}
          >
            {/* Camera Container */}
            <div 
              className="absolute inset-0 transition-transform duration-300 ease-out"
              style={{
                transform: `scale(${villageZoom}) translate(${-avatarPos.x}px, ${-avatarPos.y}px)`,
                transformOrigin: 'center center'
              }}
            >
              <div className="world-grid" style={{ width: '10000px', height: '10000px', transform: 'translate(-5000px, -5000px)' }} />
              
              {/* Village Elements Layer */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="relative w-0 h-0 flex items-center justify-center">
                  {/* Buildings */}
                  {buildings.filter(b => b.offset && b.offset.x !== undefined).map((building) => (
                    <div 
                      key={building.id}
                      className="absolute flex flex-col items-center justify-center transition-all duration-500"
                      style={{
                        transform: `translate(${building.offset.x}px, ${building.offset.y}px)`,
                        zIndex: 10
                      }}
                    >
                      <div className="flex flex-col items-center">
                        <span className="text-6xl drop-shadow-lg mb-2" role="img" aria-label={building.type}>
                          {getBuildingEmoji(building.type)}
                        </span>
                        <div className="bg-[#3e2723] text-white font-['Press_Start_2P'] text-[6px] px-1 py-0.5 rounded-sm">
                          {building.type.replace('-', ' ').toUpperCase()}
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* Ghost Building */}
                  {isPlacing && pendingBuilding && (
                    <div 
                      className="absolute flex flex-col items-center justify-center opacity-50 pointer-events-none"
                      style={{
                        transform: `translate(${mousePos.x}px, ${mousePos.y}px)`,
                        zIndex: 30
                      }}
                    >
                      <span className="text-6xl drop-shadow-lg mb-2">
                        {getBuildingEmoji(pendingBuilding.type)}
                      </span>
                      <div className="bg-[#3e2723] text-white font-['Press_Start_2P'] text-[6px] px-1 py-0.5 rounded-sm">
                        PLACE {pendingBuilding.type.replace('-', ' ').toUpperCase()}
                      </div>
                    </div>
                  )}

                  {/* Avatar */}
                  <div 
                    className="absolute z-20 transition-all duration-100 ease-linear flex items-center justify-center"
                    style={{
                      transform: `translate(${avatarPos.x}px, ${avatarPos.y}px)`,
                      width: '64px',
                      height: '64px'
                    }}
                  >
                    <div className="relative">
                      {/* Shadow */}
                      <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-8 h-3 bg-black/20 rounded-full blur-[2px]" />
                      <span className="text-5xl drop-shadow-md select-none">
                        {role?.icon || '🛡️'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Village UI Overlays */}
            <div className="fixed top-32 left-6 z-[2000] flex flex-col gap-2">
              <button 
                onClick={() => setVillageZoom((prev: number) => Math.min(prev + 0.2, 3))}
                className="w-10 h-10 bg-[#f4ece4] border-4 border-[#8b7a6d] text-[#5d4a44] font-bold flex items-center justify-center shadow-lg active:translate-y-1 pointer-events-auto"
              >
                +
              </button>
              <button 
                onClick={() => setVillageZoom((prev: number) => Math.max(prev - 0.2, 0.5))}
                className="w-10 h-10 bg-[#f4ece4] border-4 border-[#8b7a6d] text-[#5d4a44] font-bold flex items-center justify-center shadow-lg active:translate-y-1 pointer-events-auto"
              >
                -
              </button>
            </div>

            {/* Placement Mode Instructions */}
            {isPlacing && (
              <div className="fixed top-32 left-1/2 -translate-x-1/2 z-[3000] bg-[#3e2723] text-white font-['Press_Start_2P'] text-[10px] px-4 py-2 border-2 border-white animate-pulse">
                CLICK TO PLACE OR DOUBLE-CLICK/ESC TO CANCEL
              </div>
            )}

            {/* Directional Controls (Bottom Right) */}
            <div className="fixed bottom-24 right-6 z-[2000] flex flex-col items-center gap-1 pointer-events-auto">
               <button 
                 onClick={() => { moveAvatar(0, -20 / villageZoom); setFacing('up'); }}
                 className="w-10 h-10 bg-[#8d6e63] border-4 border-[#3e2723] text-white flex items-center justify-center pixel-border active:translate-y-1"
               >
                 ▲
               </button>
               <div className="flex gap-1">
                 <button 
                   onClick={() => { moveAvatar(-20 / villageZoom, 0); setFacing('left'); }}
                   className="w-10 h-10 bg-[#8d6e63] border-4 border-[#3e2723] text-white flex items-center justify-center pixel-border active:translate-y-1"
                 >
                   ◀
                 </button>
                 <button 
                   onClick={() => { moveAvatar(0, 20 / villageZoom); setFacing('down'); }}
                   className="w-10 h-10 bg-[#8d6e63] border-4 border-[#3e2723] text-white flex items-center justify-center pixel-border active:translate-y-1"
                 >
                   ▼
                 </button>
                 <button 
                   onClick={() => { moveAvatar(20 / villageZoom, 0); setFacing('right'); }}
                   className="w-10 h-10 bg-[#8d6e63] border-4 border-[#3e2723] text-white flex items-center justify-center pixel-border active:translate-y-1"
                 >
                   ▶
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
      {(activeTab === 'village' || activeTab === 'warden') && !isTripping && (
        <BuildMenu 
          resources={resources} 
          onBuild={(type, cost) => {
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
            className="bg-[#8d6e63] border-4 border-[#3e2723] text-white p-2 font-['Press_Start_2P'] text-[8px] hover:bg-[#a1887f] active:translate-y-1 pixel-border shadow-xl"
          >
            HARVEST
          </button>
        </div>
      )}
    </div>
  )
}

export default App
