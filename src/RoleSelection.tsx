import React from 'react';

const roles = [
  { id: 'round', name: 'WARDEN OF THE CIRCLE', icon: '⭕', color: 'bg-blue-500', desc: 'Protector of the cycles' },
  { id: 'triangle', name: 'TRIANGLE SENTINEL', icon: '🔺', color: 'bg-red-500', desc: 'Guardian of the vertices' },
  { id: 'square', name: 'SQUARE GUARDIAN', icon: '🟦', color: 'bg-green-500', desc: 'Keeper of the foundation' }
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
            key={role.name}
            onClick={() => onSelect(role)}
            className="flex items-center gap-6 btn-off-white p-6 transition-all text-left group"
          >
            <div className={`w-12 h-12 ${role.color} flex items-center justify-center border-2 border-[#f1ebe3] shadow-inner group-hover:scale-110 transition-transform`}>
              <span className="text-3xl">{role.icon}</span>
            </div>
            <div className="flex flex-col gap-1">
              <div className="text-[#3e2723] text-[12px] font-bold">{role.name}</div>
              <div className="text-[#8b7a6d] text-[8px] uppercase">{role.desc}</div>
            </div>
          </button>

        ))}
      </div>
    </div>
  );
};

export default RoleSelection;
