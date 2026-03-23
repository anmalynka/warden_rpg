import React from 'react';

export const ResourceItem = ({ icon, value, label }) => (
  <div className="flex items-center gap-2 bg-[#f4ece4] border-2 border-[#8b7a6d] px-3 py-1.5 rounded-sm shadow-[2px_2px_0_0_rgba(0,0,0,0.1)] min-w-[60px] justify-center">
    <span className="text-lg" role="img" aria-label={label}>{icon}</span>
    <span className="text-[#5d4a44] text-[8px] font-['Press_Start_2P']">
      {value}
    </span>
  </div>
);

const HUD = ({ resources }) => {
  return (
    <div className="fixed top-0 left-0 right-0 pointer-events-none flex flex-col items-center p-4 z-[3000]">
      <div className="w-full max-w-lg pointer-events-auto">
        <div className="bg-[#f4ece4] border-b-4 border-[#8b7a6d] border-r-4 p-2 rounded-sm flex justify-around shadow-lg relative gap-1">
          <div className="absolute top-0 left-4 right-4 h-[1px] bg-white opacity-50"></div>
          
          <ResourceItem icon="🪵" value={resources?.wood || 0} label="Wood" />
          <ResourceItem icon="🔩" value={resources?.metal || 0} label="Metal" />
          <ResourceItem icon="💎" value={resources?.pebbles || 0} label="Pebbles" />
          <ResourceItem icon="🪙" value={resources?.coins || 0} label="Coins" />
        </div>
      </div>
    </div>
  );
};

export default HUD;
