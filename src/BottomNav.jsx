import React from 'react';

const BottomNav = ({ activeTab, onTabChange }) => {
  const tabs = [
    { id: 'village', label: 'VILLAGE', icon: '🏠' },
    { id: 'warden', label: 'WARDEN', icon: '⚔️' },
    { id: 'settings', label: 'SETTS', icon: '⚙️' }
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 h-20 bg-[#f4ece4] border-t-4 border-[#8b7a6d] z-[3000] flex justify-around items-center px-4 font-['Press_Start_2P']">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={`flex flex-col items-center gap-2 transition-all ${
            activeTab === tab.id ? 'scale-110' : 'opacity-60 grayscale'
          }`}
        >
          <div className="text-2xl">
            {tab.icon}
          </div>
          <span className={`text-[7px] ${activeTab === tab.id ? 'text-[#5d4a44] font-bold' : 'text-[#8b7a6d]'}`}>
            {tab.label}
          </span>
          
          {activeTab === tab.id && (
            <div className="absolute -bottom-2 w-full h-1 bg-[#e9d681]"></div>
          )}
        </button>
      ))}
    </div>
  );
};

export default BottomNav;
