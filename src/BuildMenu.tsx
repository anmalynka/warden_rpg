import React, { useState } from 'react';

const BuildMenu = ({ resources, onBuild }) => {
  const [isOpen, setIsOpen] = useState(false);

  const starterHouseCost = 30;
  const appleTreeCost = 15;
  const fieldTilesCost = 10;

  const handleBuild = (type, cost) => {
    // We already handle the check in onBuild, but let's be safe
    onBuild(type, cost);
    setIsOpen(false);
  };

  const blueprints = [
    { id: 'house', type: 'starter-house', name: 'HOUSE', icon: '🏠', cost: { wood: starterHouseCost } },
    { id: 'apple-tree', type: 'apple-tree', name: 'APPLE TREE', icon: '🍎', cost: { wood: appleTreeCost } },
    { id: 'field-tiles', type: 'field-tiles', name: 'FIELD', icon: '🌾', cost: { wood: fieldTilesCost } },
    { id: 'well', type: 'well', name: 'WELL', icon: '⛲', cost: { wood: 20 } },
    { id: 'fence', type: 'fence', name: 'FENCE', icon: '🚧', cost: { wood: 5 } },
    { id: 'garden', type: 'garden', name: 'GARDEN', icon: '🌻', cost: { wood: 12 } },
    { id: 'barn', type: 'barn', name: 'BARN', icon: '🛖', cost: { wood: 40 } },
    { id: 'statue', type: 'statue', name: 'STATUE', icon: '🗿', cost: { wood: 10, metal: 5 } },
    { id: 'pond', type: 'pond', name: 'POND', icon: '💧', cost: { wood: 0, pebbles: 15 } },
    { id: 'bench', type: 'bench', name: 'BENCH', icon: '🪑', cost: { wood: 8 } }
  ];

  const canAfford = (cost) => {
    return Object.entries(cost).every(([res, amount]) => (resources[res] || 0) >= amount);
  };

  return (
    <div className="fixed top-24 right-6 z-[2000] font-['Press_Start_2P'] flex flex-col items-end">
      {/* Main Hammer Button */}
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-16 h-16 bg-[#a68a78] border-4 border-[#5d4a44] rounded-sm shadow-xl flex items-center justify-center hover:bg-[#bba192] transition-all group active:scale-95"
      >
        <span className="text-3xl group-hover:rotate-12 transition-transform">🔨</span>
      </button>

      {isOpen && (
        <div className="mt-4 parchment-panel p-0 w-80 max-h-[50vh] overflow-hidden flex flex-col border-4 border-[#5d4a44] bg-[#f4ece4] shadow-2xl animate-in slide-in-from-top-4 duration-300">
          {/* Header Area - Sticky within the flex container */}
          <div className="bg-[#f4ece4] p-4 z-10 flex justify-between items-center border-b-4 border-[#8b7a6d]">
            <h3 className="text-[#5d4a44] text-[10px]">BLUEPRINTS</h3>
            <button 
              onClick={() => setIsOpen(false)}
              className="w-8 h-8 bg-[#d97e7e] border-4 border-[#5d4a44] text-white flex items-center justify-center text-[10px] active:scale-90 shadow-[2px_2px_0_0_rgba(0,0,0,0.2)]"
            >
              X
            </button>
          </div>
          
          {/* Item List - Scrollable part */}
          <div className="overflow-y-auto p-4 flex flex-col gap-4 custom-scrollbar bg-[#fcf8f4] h-[350px]">
            {blueprints.map((bp) => (
              <div key={bp.id} className="bg-[#e8dfd5] p-3 border-2 border-[#8b7a6d] flex flex-col gap-3 hover:border-[#5d4a44] transition-colors shadow-sm">
                 <div className="flex justify-between items-center">
                   <div className="flex items-center gap-3">
                     <span className="text-3xl">{bp.icon}</span>
                     <span className="text-[#5d4a44] text-[10px]">{bp.name}</span>
                   </div>
                   <div className="flex flex-col items-end gap-1">
                     {Object.entries(bp.cost).map(([res, amount]) => (
                       <div key={res} className="flex items-center gap-1">
                         <span className="text-[10px]">{res === 'wood' ? '🪵' : res === 'metal' ? '🔩' : res === 'pebbles' ? '💎' : '🪙'}</span>
                         <span className={`text-[8px] ${(resources[res] || 0) >= amount ? 'text-[#5d4a44]' : 'text-red-500'}`}>
                           {amount}
                         </span>
                       </div>
                     ))}
                   </div>
                 </div>
                 
                 <button 
                   onClick={() => handleBuild(bp.type, bp.cost)}
                   disabled={!canAfford(bp.cost)}
                   className={`w-full py-3 text-[8px] border-2 border-[#5d4a44] shadow-[2px_2px_0_0_rgba(0,0,0,0.1)] relative overflow-hidden transition-transform active:translate-y-0.5 ${
                     canAfford(bp.cost) ? 'bg-[#e9d681] text-[#5d4a44]' : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                   }`}
                 >
                   BUILD
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
