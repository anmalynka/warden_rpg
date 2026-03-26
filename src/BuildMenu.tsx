import React, { useState } from 'react';

const BuildMenu = ({ resources, level, onBuild }) => {
  const [isOpen, setIsOpen] = useState(false);

  const handleBuild = (type, cost) => {
    // We already handle the check in onBuild, but let's be safe
    onBuild(type, cost);
    setIsOpen(false);
  };

  const blueprints = [
    { id: 'house', type: 'starter-house', name: 'FOUNDER’S LODGE', description: 'Rest here to pass the time.', icon: '/images/house.png', isImage: true, cost: { wood: 50, coins: 20 }, minLevel: 1 },
    { id: 'garden-bed', type: 'garden-bed', name: 'GARDEN BED', description: 'Plant vegetables here.', icon: '/images/garden-bed-wheat-1.png', isImage: true, cost: { wood: 10, coins: 5 }, minLevel: 1 },
    { id: 'garden-tree', type: 'garden-tree', name: 'GARDEN TREE', description: 'Plant fruit trees here.', icon: '/images/garden-apple-4.png', isImage: true, cost: { coins: 30 }, minLevel: 3 },
    { id: 'mini-house', type: 'mini-house', name: 'WORKER’S CONDO', description: 'Attracts a Raccoon worker to tend your garden.', icon: '/images/mini-house.png', isImage: true, cost: { wood: 100, metal: 50, coins: 100 }, minLevel: 6 },
    { id: 'shop', type: 'shop', name: 'GENERAL STORE', description: 'Buy raw materials and resources.', icon: '/images/Shop.png', isImage: true, cost: { wood: 30, metal: 100, coins: 50 }, minLevel: 9 },
    { id: 'market', type: 'market', name: 'FARMERS’ MARKET', description: 'Sell your harvest for coins.', icon: '/images/Market.png', isImage: true, cost: { wood: 100, metal: 20, coins: 50 }, minLevel: 12 },
    { id: 'hotel', type: 'hotel', name: 'FOXGLOVE INN', description: 'Attracts foxes who pay 100 coins per hour.', icon: '/images/Storage.png', isImage: true, cost: { wood: 200, metal: 200, coins: 100 }, minLevel: 20 }
  ];

  const canAfford = (cost) => {
    return Object.entries(cost).every(([res, amount]) => (resources[res] || 0) >= amount);
  };

  const isLocked = (minLvl) => level < minLvl;

  return (
    <div className="relative font-['Press_Start_2P'] flex flex-col items-center">
      {/* Main Hammer Button - Styled like Level Circle */}
      <div className="relative flex items-center justify-center w-16 h-16 pointer-events-auto flex-shrink-0">
        <button 
          onClick={() => setIsOpen(!isOpen)}
          className="absolute inset-0 bg-[#f9f5f0] rounded-full shadow-[0_4px_0_0_#d1c4b9] border-2 border-[#e6ded5] aspect-square flex items-center justify-center group active:translate-y-1 active:shadow-none transition-all"
        >
          <img src="/images/tools-build.png" alt="Build" className="w-10 h-10 object-contain pixel-art group-hover:rotate-12 transition-transform" style={{ imageRendering: 'pixelated' }} />
        </button>
      </div>

      {isOpen && (
        <div className="absolute top-20 right-0 z-[5000] pointer-events-auto p-0 w-80 max-h-[50vh] overflow-hidden flex flex-col rounded-3xl bg-[#fcfaf8] shadow-[0_12px_0_0_#d1c4b9,0_20px_40px_rgba(0,0,0,0.4)] animate-in slide-in-from-top-4 duration-300">
          {/* Header Area */}
          <div className="bg-[#fcfaf8] p-4 z-10 flex justify-between items-center border-b-2 border-[#d1c4b9]">
            <h3 className="text-[#3e2723] text-[10px]">BLUEPRINTS</h3>
            <button 
              onClick={() => setIsOpen(false)}
              className="w-8 h-8 btn-off-white flex items-center justify-center text-[10px]"
            >
              X
            </button>
          </div>
          
          {/* Item List */}
          <div className="overflow-y-auto p-4 flex flex-col gap-4 custom-scrollbar bg-[#fcfaf8] h-[350px]">
            {blueprints.map((bp) => (
              <div key={bp.id} className="bg-[#f1ebe3] p-4 rounded-3xl shadow-[0_4px_0_0_#d1c4b9] flex flex-col gap-4 hover:bg-[#ebe2d8] transition-colors">
                 <div className="flex justify-between items-start">
                   <div className="flex items-center gap-3">
                     {bp.isImage ? (
                       <img src={bp.icon} alt={bp.name} className="w-8 h-8 object-contain pixel-art" style={{ imageRendering: 'pixelated' }} />
                     ) : (
                       <span className="text-2xl">{bp.icon}</span>
                     )}
                     <span className="text-[#3e2723] text-[9px]">{bp.name}</span>
                   </div>
                   <div className="flex flex-col items-end gap-1">
                     {Object.entries(bp.cost).map(([res, amount]) => (
                       <div key={res} className="flex items-center gap-1">
                         <img 
                           src={res === 'wood' ? '/images/tools-wood.png' : res === 'metal' ? '/images/tools-iron.png' : '/images/tools-coins.png'} 
                           alt={res} 
                           className="w-3 h-3 object-contain pixel-art" 
                           style={{ imageRendering: 'pixelated' }} 
                         />
                         <span className={`text-[8px] ${(resources[res] || 0) >= amount ? 'text-[#3e2723]' : 'text-red-500'}`}>
                           {amount}
                         </span>
                       </div>
                     ))}
                   </div>
                 </div>

                 <div className="text-[#8b7a6d] text-[7px] leading-relaxed uppercase">
                    {bp.description}
                 </div>
                 
                 <button 
                   onClick={() => handleBuild(bp.type, bp.cost)}
                   disabled={isLocked(bp.minLevel) || !canAfford(bp.cost)}
                   className={`w-full py-3 text-[9px] btn-off-white ${
                     isLocked(bp.minLevel) 
                       ? 'opacity-70 cursor-not-allowed bg-[#d1c4b9]' 
                       : canAfford(bp.cost) ? '' : 'opacity-50 cursor-not-allowed grayscale'
                   }`}
                 >
                   {isLocked(bp.minLevel) ? `UNLOCKS AT LVL ${bp.minLevel}` : 'BUILD'}
                 </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default BuildMenu;
