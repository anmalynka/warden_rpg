import React, { useState } from 'react';
import PlayerSprite from './PlayerSprite';
import './Onboarding.css';

interface CharacterSelectionProps {
  onStart: (name: string, catType: string) => void;
}

const CAT_TYPES = [
  { id: 'black-cat', label: 'Black' },
  { id: 'orange-cat', label: 'Orange' },
  { id: 'grey-cat', label: 'Gray' }
];

const CharacterSelection: React.FC<CharacterSelectionProps> = ({ onStart }) => {
  const [name, setName] = useState('');
  const [selectedCat, setSelectedCat] = useState(CAT_TYPES[2].id); // Default to Gray
  const [error, setError] = useState(false);

  const handleStart = () => {
    if (!name.trim()) {
      setError(true);
      return;
    }
    onStart(name.trim(), selectedCat);
  };

  return (
    <div className="character-selection-overlay relative" style={{ 
      backgroundImage: 'url("/images/grass texture.png")',
      backgroundSize: '100px 100px',
      imageRendering: 'pixelated'
    }}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm"></div>
      <div className="parchment-panel p-8 flex flex-col items-center gap-6 max-w-[320px] w-full rounded-3xl z-10">
        
        <div className="w-[100px] h-[100px] flex justify-center items-center overflow-visible">
          <div className="scale-[3]">
             <PlayerSprite direction="down" isWalking={true} catType={selectedCat} />
          </div>
        </div>

        <div className="input-group">
          <input 
            type="text" 
            className={`w-full bg-[#fcfaf8] border-2 ${error ? 'border-red-500' : 'border-[#8b7a6d]'} p-3 text-[10px] text-[#3e2723] text-center focus:outline-none pixel-font`} 
            placeholder="NAME YOUR CAT" 
            value={name}
            onChange={(e) => {
              setName(e.target.value.toUpperCase());
              if (e.target.value.trim()) setError(false);
            }}
            maxLength={10}
          />
          {error && <div className="text-red-500 text-[8px] pixel-font mt-2 text-center uppercase">Name is mandatory</div>}
        </div>

        <div className="input-group w-full">
          <div className="flex gap-2 justify-center w-full">
            {CAT_TYPES.map(cat => (
              <button
                key={cat.id}
                className={`flex-1 py-2 text-[8px] pixel-font transition-all ${selectedCat === cat.id ? 'bg-[#3e2723] text-[#fcfaf8] border-2 border-[#3e2723]' : 'bg-[#fcfaf8] text-[#8b7a6d] border-2 border-[#8b7a6d]'}`}
                onClick={() => setSelectedCat(cat.id)}
              >
                {cat.label.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <button className="btn-off-white w-full py-4 text-[10px] font-bold pixel-font mt-4" onClick={handleStart}>
          START JOURNEY
        </button>
      </div>
    </div>
  );
};

export default CharacterSelection;
