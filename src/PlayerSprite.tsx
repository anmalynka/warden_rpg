import React from 'react';

interface PlayerSpriteProps {
  direction: 'down' | 'left' | 'right' | 'up';
  isWalking: boolean;
  scale?: number;
}

const PlayerSprite: React.FC<PlayerSpriteProps> = ({ direction, isWalking, scale = 2 }) => {
  // Map directions to row indices (0: down, 1: left, 2: right, 3: up)
  const directionMap = {
    down: 0,
    left: 1,
    right: 2,
    up: 3
  };

  const row = directionMap[direction];
  
  // Use raw scale for smooth zooming
  const finalScale = scale;
  const frameSize = 32;
  const sheetWidth = 192;
  const sheetHeight = 128;

  return (
    <div className="player-sprite-container" style={{ 
      width: `${frameSize}px`, 
      height: `${frameSize}px`,
      transform: `scale(${finalScale})`,
      transformOrigin: 'center center',
      overflow: 'hidden',
      position: 'relative'
    }}>
      <style>{`
        @keyframes walk-anim-steps {
          from { background-position-x: 0px; }
          to { background-position-x: -${sheetWidth}px; }
        }
        .cat-sprite-sheet {
          width: ${sheetWidth}px;
          height: ${sheetHeight}px;
          background-image: url('/images/grey-cat.png');
          background-repeat: no-repeat;
          position: absolute;
          image-rendering: pixelated;
          image-rendering: crisp-edges;
        }
        .cat-walking-active {
          animation: walk-anim-steps 0.8s steps(6) infinite;
        }
      `}</style>
      <div 
        className={`cat-sprite-sheet ${isWalking ? 'cat-walking-active' : ''}`}
        style={{
          backgroundPositionY: `-${row * frameSize}px`,
          left: 0,
          top: 0
        }}
      />
    </div>
  );
};

export default PlayerSprite;
