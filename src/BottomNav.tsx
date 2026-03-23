import React from 'react';

const BottomNav = ({ activeTab, onTabChange }) => {
  const tabs = [
    { id: 'village', label: 'VILLAGE', icon: '/images/tools-village.png' },
    { id: 'warden', label: 'EXPLORE', icon: '/images/tools-map.png' },
    { id: 'settings', label: 'SETTS', icon: '⚙️' }
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 h-24 bg-[#f9f5f0] border-t-4 border-[#3e2723] z-[3000] flex justify-around items-center px-4 font-['Press_Start_2P'] shadow-[0_-4px_12px_rgba(0,0,0,0.2)]">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={`relative flex flex-col items-center gap-3 transition-all ${
            activeTab === tab.id ? 'scale-110' : 'opacity-40 grayscale blur-[0.5px]'
          }`}
        >
          <div className="w-10 h-10 flex items-center justify-center">
            {tab.icon.startsWith('/') ? (
              <img src={tab.icon} alt={tab.label} className="w-8 h-8 object-contain" style={{ imageRendering: 'pixelated' }} />
            ) : (
              <span className="text-2xl">{tab.icon}</span>
            )}
          </div>
          <span className={`text-[8px] ${activeTab === tab.id ? 'text-[#3e2723]' : 'text-[#8b7a6d]'}`}>
            {tab.label}
          </span>
          
          {activeTab === tab.id && (
            <div className="absolute -bottom-4 w-12 h-1.5 bg-[#e9d681] border-2 border-[#3e2723]"></div>
          )}
        </button>
      ))}
    </div>
  );
};

export default BottomNav;
