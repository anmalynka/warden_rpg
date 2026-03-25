import React from 'react';

interface MarketUIProps {
  inventory: any;
  onSell: (item: string, price: number, amount: number) => void;
  onClose: () => void;
}

const MarketUI: React.FC<MarketUIProps> = ({ inventory, onSell, onClose }) => {
  const items = [
    { id: 'wheat', name: 'WHEAT', icon: '/images/garden-wheat.png', price: 10, bonusWood: 3 },
    { id: 'tomato', name: 'TOMATO', icon: '/images/garden-tomato.png', price: 8, bonusWood: 1 },
    { id: 'pumpkin', name: 'PUMPKIN', icon: '/images/garden-pumpkin.png', price: 12 },
    { id: 'apple', name: 'APPLE', icon: '/images/garden-apple.png', price: 12 },
    { id: 'peach', name: 'PEACH', icon: '/images/garden-peach.png', price: 10, bonusWood: 1 },
    { id: 'cherry', name: 'CHERRY', icon: '/images/garden-cherry.png', price: 15 }
  ];

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 pointer-events-auto font-['Press_Start_2P'] animate-in fade-in zoom-in duration-200">
      <div className="p-8 flex flex-col items-center gap-6 max-w-[360px] w-full bg-[#f9f5f0] border-4 border-[#3e2723] shadow-xl relative rounded-3xl">
        <h3 className="text-[#3e2723] text-[12px] uppercase text-center">MARKET</h3>
        
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 btn-off-white flex items-center justify-center text-[10px]"
        >
          X
        </button>

        <div className="flex flex-col gap-4 w-full max-h-[60vh] overflow-y-auto pr-2">
          {items.map(item => (
            <div key={item.id} className="bg-[#f1ebe3] p-4 rounded-xl flex justify-between items-center shadow-md">
              <div className="flex items-center gap-3">
                <img src={item.icon} alt={item.name} className="w-8 h-8 object-contain pixel-art" style={{ imageRendering: 'pixelated' }} />
                <div className="flex flex-col gap-1">
                  <span className="text-[#3e2723] text-[10px]">{item.name}</span>
                  <div className="flex items-center gap-1">
                     <span className="text-[#8b7a6d] text-[8px]">HAVE: {inventory[item.id] || 0}</span>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <div className="flex flex-col items-end gap-1">
                  <div className="flex items-center gap-1 bg-[#e6ded5] px-2 py-1 rounded-full">
                    <img src="/images/tools-coins.png" className="w-3 h-3" />
                    <span className="text-[#3e2723] text-[8px]">+{item.price}</span>
                  </div>
                  {item.bonusWood && (
                    <div className="flex items-center gap-1 bg-[#d1c4b9] px-2 py-0.5 rounded-full">
                      <img src="/images/tools-wood.png" className="w-2.5 h-2.5" />
                      <span className="text-[#3e2723] text-[7px]">+{item.bonusWood}</span>
                    </div>
                  )}
                </div>
                
                <button
                  onClick={() => onSell(item.id, item.price, 1)}
                  disabled={!inventory[item.id] || inventory[item.id] <= 0}
                  className={`px-4 py-2 text-[8px] btn-off-white ${
                    !inventory[item.id] || inventory[item.id] <= 0 ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  SELL
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default MarketUI;
