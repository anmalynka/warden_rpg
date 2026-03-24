import React from 'react';

export const ResourceItem = ({ iconUrl, value, label }) => (
  <div className="flex items-center gap-2 px-2 py-1 min-w-[50px] justify-center">
    <img src={iconUrl} alt={label} className="w-5 h-5 object-contain" style={{ imageRendering: 'pixelated' }} />
    <span className="text-[#3e2723] text-[9px] font-['Press_Start_2P']">
      {value}
    </span>
  </div>
);

const LevelCircle = ({ level, xp, xpToNext }) => {
  const radius = 24;
  const circumference = 2 * Math.PI * radius;
  const xpPercent = Math.min(100, Math.max(0, (xp / xpToNext) * 100));
  const offset = circumference - (xpPercent / 100) * circumference;

  return (
    <div className="relative flex items-center justify-center w-16 h-16 pointer-events-auto">
      {/* Background Circle */}
      <div className="absolute inset-0 bg-[#f9f5f0] rounded-full shadow-[0_4px_0_0_#d1c4b9] border-2 border-[#e6ded5]" />
      
      {/* Progress SVG */}
      <svg className="w-full h-full -rotate-90 relative z-10">
        <circle
          cx="32"
          cy="32"
          r={radius}
          fill="transparent"
          stroke="#e6ded5"
          strokeWidth="6"
        />
        <circle
          cx="32"
          cy="32"
          r={radius}
          fill="transparent"
          stroke="#e9d681"
          strokeWidth="6"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-500 ease-out"
        />
      </svg>
      
      {/* Level Number */}
      <div className="absolute inset-0 flex flex-col items-center justify-center z-20">
        <span className="text-[6px] font-['Press_Start_2P'] text-[#8b7a6d] mb-0.5">LVL</span>
        <span className="text-[12px] font-['Press_Start_2P'] text-[#3e2723] leading-none">{level}</span>
      </div>
    </div>
  );
};

const HUD = ({ resources, level = 1, xp = 0, xpToNext = 100 }) => {
  return (
    <div className="fixed top-4 left-0 right-0 pointer-events-none flex justify-center items-start z-[3000] px-4">
      <div className="flex items-center gap-3">
        {/* Resources */}
        <div className="pointer-events-auto bg-[#f9f5f0] px-6 py-3 rounded-full flex items-center gap-4 shadow-[0_6px_0_0_#d1c4b9,0_12px_24px_rgba(0,0,0,0.3)] border-2 border-[#e6ded5]">
          <ResourceItem iconUrl="/images/tools-wood.png" value={resources?.wood || 0} label="Wood" />
          <ResourceItem iconUrl="/images/tools-iron.png" value={resources?.metal || 0} label="Metal" />
          <ResourceItem iconUrl="/images/tools-crystals.png" value={resources?.pebbles || 0} label="Pebbles" />
          <ResourceItem iconUrl="/images/tools-coins.png" value={resources?.coins || 0} label="Coins" />
        </div>

        {/* Level Circle */}
        <LevelCircle level={level} xp={xp} xpToNext={xpToNext} />
      </div>
    </div>
  );
};

export default HUD;
