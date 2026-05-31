import React, { useEffect, useRef } from 'react';
import { GameEngine } from './engine/GameEngine';

interface RoninCanvasProps {
  onGameOver: (score: number) => void;
  isFullscreen: boolean;
}

export default function RoninCanvas({ onGameOver, isFullscreen }: RoninCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GameEngine | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    
    // Initialize Game Engine
    engineRef.current = new GameEngine(canvasRef.current, {
      onGameOver: (score) => {
        onGameOver(score);
      }
    });

    engineRef.current.start();

    return () => {
      if (engineRef.current) {
        engineRef.current.stop();
      }
    };
  }, [onGameOver]);

  // Adjust canvas wrapper layout depending on fullscreen state
  return (
    <div className={`flex items-center justify-center bg-[#1C1714] w-full h-full ${isFullscreen ? 'p-6' : 'rounded-[16px] p-4'} overflow-hidden`}>
      <canvas 
        ref={canvasRef} 
        width={560} 
        height={620}
        className="bg-[#2a2420] shadow-[0_0_50px_rgba(139,90,43,0.3)] w-full h-full object-contain"
      />
    </div>
  );
}
