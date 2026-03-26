import React, { useEffect, useRef } from 'react';
import { ShaderManager } from '../graphics/ShaderManager';

interface WorldShaderBackgroundProps {
  cameraPos: { x: number; y: number };
  overlayUrl: string;
  maskUrl: string;
  scale?: number;
}

/**
 * WorldShaderBackground component hosts the WebGL canvas and 
 * synchronizes the ShaderManager with React state.
 */
export const WorldShaderBackground: React.FC<WorldShaderBackgroundProps> = ({
  cameraPos,
  overlayUrl,
  maskUrl,
  scale = 1/144
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const shaderManagerRef = useRef<ShaderManager | null>(null);
  const requestRef = useRef<number>();

  // Initialize ShaderManager and load textures
  useEffect(() => {
    if (!canvasRef.current) return;

    const manager = new ShaderManager(canvasRef.current);
    shaderManagerRef.current = manager;

    const loadImage = (url: string): Promise<HTMLImageElement> => {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.src = url;
        img.onload = () => resolve(img);
        img.onerror = reject;
      });
    };

    // Load both textures before starting the render loop
    Promise.all([
      loadImage(overlayUrl),
      loadImage(maskUrl)
    ]).then(([overlayImg, maskImg]) => {
      manager.setTexture('u_overlay_tex', overlayImg, 0);
      manager.setTexture('u_mask_tex', maskImg, 1);
      manager.setOverlayScale(scale);
      
      // Initial sizing
      handleResize();
    });

    const handleResize = () => {
      if (canvasRef.current && shaderManagerRef.current) {
        const { innerWidth, innerHeight } = window;
        canvasRef.current.width = innerWidth;
        canvasRef.current.height = innerHeight;
        shaderManagerRef.current.setScreenSize(innerWidth, innerHeight);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [overlayUrl, maskUrl, scale]);

  // Update loop for smooth anchoring
  useEffect(() => {
    const update = () => {
      if (shaderManagerRef.current) {
        // Keeping the texture anchored to world coordinates
        shaderManagerRef.current.setCamera(cameraPos.x, cameraPos.y);
        shaderManagerRef.current.render();
      }
      requestRef.current = requestAnimationFrame(update);
    };

    requestRef.current = requestAnimationFrame(update);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [cameraPos]);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 0 }}
    />
  );
};
