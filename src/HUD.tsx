import React from 'react';

export const ResourceItem = ({ iconUrl, value, label }) => (
  <div className="flex items-center gap-2 px-2 py-1 min-w-[50px] justify-center">
    <img src={iconUrl} alt={label} className="w-5 h-5 object-contain" style={{ imageRendering: 'pixelated' }} />
    <span className="text-[#3e2723] text-[9px] font-['Press_Start_2P']">
      {value}
    </span>
  </div>
);

const HUD = ({ resources }) => {
  return (
    <div className="fixed top-0 left-0 right-0 pointer-events-none flex justify-center p-4 z-[3000]">
      <div className="pointer-events-auto bg-[#f9f5f0] px-6 py-2 rounded-full flex items-center gap-6 shadow-[0_6px_0_0_#d1c4b9,0_12px_24px_rgba(0,0,0,0.3)]">
        <ResourceItem iconUrl="/images/tools-wood.png" value={resources?.wood || 0} label="Wood" />
        <ResourceItem iconUrl="/images/tools-iron.png" value={resources?.metal || 0} label="Metal" />
        <ResourceItem iconUrl="/images/tools-crystals.png" value={resources?.pebbles || 0} label="Pebbles" />
        <ResourceItem iconUrl="/images/tools-coins.png" value={resources?.coins || 0} label="Coins" />
      </div>
    </div>
  );
};

export default HUD;
