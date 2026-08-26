import React, { useEffect, useMemo, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { GameEngine, type GameEngineLabels } from './engine/GameEngine';

interface RoninCanvasProps {
  onGameOver: (score: number) => void;
  isFullscreen: boolean;
}

export default function RoninCanvas({ onGameOver, isFullscreen }: RoninCanvasProps) {
  const t = useTranslations('arcade.hud');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GameEngine | null>(null);

  const labels = useMemo<GameEngineLabels>(
    () => ({
      score: (score) => t('score', { score }),
      level: (level) => t('level', { level }),
      levelCleared: (level) => t('levelCleared', { level }),
      nextLevelIn: (seconds) => t('nextLevelIn', { seconds }),
    }),
    [t],
  );

  useEffect(() => {
    if (!canvasRef.current) return;

    // Initialize Game Engine
    engineRef.current = new GameEngine(canvasRef.current, {
      onGameOver: (score) => {
        onGameOver(score);
      }
    }, labels);

    engineRef.current.start();

    return () => {
      if (engineRef.current) {
        engineRef.current.stop();
      }
    };
  }, [onGameOver, labels]);

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
