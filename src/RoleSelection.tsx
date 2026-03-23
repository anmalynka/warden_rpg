import React from 'react';

const roles = [
  { id: 'round', name: 'WARDEN OF THE CIRCLE', icon: '⭕', color: 'bg-blue-500' },
  { id: 'triangle', name: 'TRIANGLE SENTINEL', icon: '🔺', color: 'bg-red-500' },
  { id: 'square', name: 'SQUARE GUARDIAN', icon: '🟦', color: 'bg-green-500' }
];

const RoleSelection = ({ onSelect }) => {
  return (
    <div className="fixed inset-0 z-[4000] bg-[#1d3a19] flex flex-col items-center justify-center p-6 font-['Press_Start_2P']">
      <h2 className="text-white text-md text-center mb-12 animate-pulse leading-relaxed">
        CHOOSE YOUR PATH, WARDEN
      </h2>
      
      <div className="flex flex-col gap-6 w-full max-w-sm">
        {roles.map((role) => (
          <button 
            key={role.id}
            onClick={() => onSelect(role)}
            className="flex items-center gap-6 bg-[#8d6e63] border-4 border-[#3e2723] p-6 hover:bg-[#a1887f] active:translate-y-1 transition-all text-left"
          >
            <div className={`w-12 h-12 ${role.color} flex items-center justify-center border-2 border-[#3e2723] shadow-lg`}>
               <span className="text-2xl">{role.icon}</span>
            </div>
            <div className="flex flex-col gap-1">
               <span className="text-white text-[10px] leading-tight">{role.name}</span>
               <span className="text-[#3e2723] text-[8px]">SELECT ROLE</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

export default RoleSelection;
