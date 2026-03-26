import React from 'react';

interface PlayerSpriteProps {
  direction: 'down' | 'left' | 'right' | 'up';
  isWalking: boolean;
  catType?: string;
}

const PlayerSprite: React.FC<PlayerSpriteProps> = ({ direction, isWalking, catType = 'grey-cat' }) => {
  // Map directions to row indices (0: down, 1: left, 2: right, 3: up)
  const directionMap = {
    down: 0,
    left: 1,
    right: 2,
    up: 3
  };

  const row = directionMap[direction];
  const frameSize = 32;

  // Use unique key for the main div based on catType to force re-render/style update
  return (
    <div key={catType} className="player-sprite-container" style={{ 
      width: `${frameSize}px`, 
      height: `${frameSize}px`,
      transform: 'translateZ(0)',
      transformOrigin: 'bottom center',
      overflow: 'hidden',
      position: 'relative',
      imageRendering: 'pixelated',
      // @ts-ignore
      imageRendering: 'crisp-edges'
    }}>
      <div 
        className={`cat-sprite-sheet ${isWalking ? 'cat-walking-active' : 'cat-idle-active'}`}
        style={{
          width: '192px',
          height: '128px',
          backgroundRepeat: 'no-repeat',
          position: 'absolute',
          imageRendering: 'pixelated',
          // @ts-ignore
          imageRendering: 'crisp-edges',
          backgroundImage: `url('/images/${catType}.png')`,
          backgroundPositionY: `-${row * frameSize}px`,
          left: 0,
          top: 0,
          transform: 'translateZ(0)'
        }}
      />
    </div>
  );
};

export default PlayerSprite;
