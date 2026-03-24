import React from 'react';

interface ShopUIProps {
  resources: any;
  onBuy: (item: string, cost: number, amount: number) => void;
  onClose: () => void;
}

const ShopUI: React.FC<ShopUIProps> = ({ resources, onBuy, onClose }) => {
  const items = [
    { id: 'wood', name: 'WOOD', icon: '/images/tools-wood.png', cost: 10, amount: 5 },
    { id: 'metal', name: 'METAL', icon: '/images/tools-iron.png', cost: 20, amount: 5 }
  ];

  return (
    <div className="fixed inset-0 z-[5000] flex items-center justify-center bg-black/60 pointer-events-auto font-['Press_Start_2P'] animate-in fade-in zoom-in duration-200">
      <div className="p-8 flex flex-col items-center gap-6 max-w-[360px] w-full bg-[#f9f5f0] border-4 border-[#3e2723] shadow-xl relative rounded-3xl">
        <h3 className="text-[#3e2723] text-[12px] uppercase text-center">SHOP</h3>
        
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 btn-off-white flex items-center justify-center text-[10px]"
        >
          X
        </button>

        <div className="flex flex-col gap-4 w-full">
          {items.map(item => (
            <div key={item.id} className="bg-[#f1ebe3] p-4 rounded-xl flex justify-between items-center shadow-md">
              <div className="flex items-center gap-3">
                <img src={item.icon} alt={item.name} className="w-8 h-8 object-contain pixel-art" style={{ imageRendering: 'pixelated' }} />
                <div className="flex flex-col gap-1">
                  <span className="text-[#3e2723] text-[10px]">{item.name} x{item.amount}</span>
                  <div className="flex items-center gap-1">
                     <img src="/images/tools-coins.png" className="w-3 h-3" />
                     <span className="text-[#8b7a6d] text-[8px]">{item.cost}</span>
                  </div>
                </div>
              </div>
              
              <button
                onClick={() => onBuy(item.id, item.cost, item.amount)}
                disabled={(resources.coins || 0) < item.cost}
                className={`px-4 py-2 text-[8px] btn-off-white ${
                  (resources.coins || 0) < item.cost ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              >
                BUY
              </button>
            </div>
          ))}
        </div>
        
        <div className="flex items-center gap-2 mt-2 bg-[#e6ded5] px-4 py-2 rounded-full">
          <img src="/images/tools-coins.png" className="w-4 h-4" />
          <span className="text-[#3e2723] text-[10px]">{resources.coins || 0}</span>
        </div>
      </div>
    </div>
  );
};

export default ShopUI;
