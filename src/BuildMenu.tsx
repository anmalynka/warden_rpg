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
    { id: 'house', type: 'starter-house', name: 'HOUSE', icon: '/images/house.png', isImage: true, cost: { wood: starterHouseCost } },
    { id: 'garden-bed', type: 'garden-bed', name: 'GARDEN BED', icon: '/images/garden-bed-wheat-1.png', isImage: true, cost: { wood: 10 } },
    { id: 'apple-tree', type: 'garden-tree', name: 'APPLE TREE', icon: '/images/garden-apple-1.png', isImage: true, cost: { wood: 15, isApple: true } },
    { id: 'peach-tree', type: 'garden-tree', name: 'PEACH TREE', icon: '/images/garden-peach-1.png', isImage: true, cost: { wood: 15, isPeach: true } },
    { id: 'cherry-tree', type: 'garden-tree', name: 'CHERRY TREE', icon: '/images/garden-cherry-1.png', isImage: true, cost: { wood: 15, isCherry: true } }
  ];

  const canAfford = (cost) => {
    return Object.entries(cost).every(([res, amount]) => (resources[res] || 0) >= amount);
  };

  return (
    <div className="fixed top-24 right-6 z-[2000] font-['Press_Start_2P'] flex flex-col items-end">
      {/* Main Hammer Button */}
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-16 h-16 bg-[#f9f5f0] border-4 border-[#3e2723] shadow-[0_6px_0_0_#3e2723,0_12px_24px_rgba(0,0,0,0.3)] flex items-center justify-center hover:bg-white transition-all group active:translate-y-1 active:shadow-[0_2px_0_0_#3e2723,0_4px_12px_rgba(0,0,0,0.2)]"
      >
        <img src="/images/tools-build.png" alt="Build" className="w-10 h-10 object-contain pixel-art group-hover:rotate-12 transition-transform" style={{ imageRendering: 'pixelated' }} />
      </button>

      {isOpen && (
        <div className="mt-8 p-0 w-80 max-h-[50vh] overflow-hidden flex flex-col border-4 border-[#3e2723] bg-[#f9f5f0] shadow-[0_12px_0_0_#3e2723,0_20px_40px_rgba(0,0,0,0.4)] animate-in slide-in-from-top-4 duration-300">
          {/* Header Area */}
          <div className="bg-[#f9f5f0] p-4 z-10 flex justify-between items-center border-b-4 border-[#3e2723]">
            <h3 className="text-[#3e2723] text-[10px]">BLUEPRINTS</h3>
            <button 
              onClick={() => setIsOpen(false)}
              className="w-8 h-8 bg-[#d97e7e] border-4 border-[#3e2723] text-white flex items-center justify-center text-[10px] active:translate-y-1 shadow-[0_4px_0_0_#3e2723]"
            >
              X
            </button>
          </div>
          
          {/* Item List */}
          <div className="overflow-y-auto p-4 flex flex-col gap-4 custom-scrollbar bg-[#f9f5f0] h-[350px]">
            {blueprints.map((bp) => (
              <div key={bp.id} className="bg-[#f1ebe3] p-3 border-4 border-[#3e2723] flex flex-col gap-3 hover:bg-[#ebe2d8] transition-colors">
                 <div className="flex justify-between items-center">
                   <div className="flex items-center gap-3">
                     {bp.isImage ? (
                       <img src={bp.icon} alt={bp.name} className="w-8 h-8 object-contain pixel-art" style={{ imageRendering: 'pixelated' }} />
                     ) : (
                       <span className="text-2xl">{bp.icon}</span>
                     )}
                     <span className="text-[#3e2723] text-[9px]">{bp.name}</span>
                   </div>
                   <div className="flex flex-col items-end gap-1">
                     {Object.entries(bp.cost)
                       .filter(([res]) => !['isApple', 'isPeach', 'isCherry'].includes(res))
                       .map(([res, amount]) => (
                       <div key={res} className="flex items-center gap-1">
                         <img 
                           src={res === 'wood' ? '/images/tools-wood.png' : res === 'metal' ? '/images/tools-iron.png' : res === 'pebbles' ? '/images/tools-crystals.png' : '/images/tools-coins.png'} 
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
                 
                 <button 
                   onClick={() => handleBuild(bp.type, bp.cost)}
                   disabled={!canAfford(bp.cost)}
                   className={`w-full py-3 text-[9px] border-4 border-[#3e2723] shadow-[0_4px_0_0_#3e2723] relative overflow-hidden transition-all active:translate-y-1 active:shadow-none ${
                     canAfford(bp.cost) ? 'bg-[#e9d681] text-[#3e2723] hover:bg-[#f0e2a3]' : 'bg-gray-300 text-gray-500 cursor-not-allowed border-gray-400 shadow-[0_4px_0_0_rgba(156,163,175,1)]'
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
