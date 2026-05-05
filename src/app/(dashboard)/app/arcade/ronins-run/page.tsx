"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { usePaginatedQuery, useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Trophy, Gamepad2, Play, Crown, Clock, Loader2, ChevronLeft, ChevronRight, Maximize2, Minimize2, X } from "lucide-react";
import Header from "@/src/ui/components/layout/Header";
import { Press_Start_2P } from "next/font/google";
import RoninCanvas from "./RoninCanvas";
import { AudioEngine } from "./engine/AudioEngine";

const pressStart = Press_Start_2P({ weight: '400', subsets: ['latin'] });

export default function RoninArcadePage() {
  const [currentPage, setCurrentPage] = useState(1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const gameContainerRef = useRef<HTMLDivElement>(null);
  const [audioEngine] = useState(() => typeof window !== 'undefined' ? new AudioEngine() : null);
  const itemsPerPage = 15;

  useEffect(() => {
    const handleInteraction = () => {
      if (audioEngine && !isPlaying) {
        audioEngine.playMenuAmbience();
      }
    };
    
    if (!isPlaying) {
      document.addEventListener('click', handleInteraction, { once: true });
      document.addEventListener('keydown', handleInteraction, { once: true });
    } else {
      if (audioEngine) audioEngine.stopMenuAmbience();
    }
    
    return () => {
      document.removeEventListener('click', handleInteraction);
      document.removeEventListener('keydown', handleInteraction);
    };
  }, [audioEngine, isPlaying]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  const handleFullscreenToggle = () => {
    if (!document.fullscreenElement) {
      gameContainerRef.current?.requestFullscreen().catch(err => {
        console.error("Error attempting to enable fullscreen:", err);
      });
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  };

  const submitScore = useMutation(api.arcade.submitScore);

  const { results, status, loadMore } = usePaginatedQuery(
    api.arcade.getPaginatedLeaderboard,
    { game: "ronin" },
    { initialNumItems: 15 }
  );

  const scoreCount = useQuery(api.arcade.getScoresCount, { game: "ronin" }) || 0;
  const totalItems = Math.max(results.length, scoreCount);
  const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;

  const paginatedItems = results.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const handleNextPage = () => {
    if (currentPage < totalPages) {
      const next = currentPage + 1;
      setCurrentPage(next);
      if (next * itemsPerPage > results.length && status === "CanLoadMore") {
         loadMore(15);
      }
    }
  };

  const handlePrevPage = () => {
    if (currentPage > 1) {
      setCurrentPage(prev => Math.max(1, prev - 1));
    }
  };

  const handleGameOver = async (score: number) => {
    try {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      }
      if (score > 0) {
        await submitScore({ game: "ronin", score });
      }
    } catch (e) {
      console.error("Failed to submit score", e);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <Header />

      <div className="flex flex-col gap-5 pb-8 mt-2">
        
        <style>
          {`
          .arcade-maze-bg {
            background-color: #2a2118; /* Dim ambient Shoji paper lighting */
            background-image: 
              /* Main Dojo Wooden Framework (Shoji Lattice) */
              linear-gradient(90deg, #120d09 14px, transparent 14px),
              linear-gradient(#120d09 14px, transparent 14px);
            background-size: 180px 180px, 180px 180px;
            background-position: center;
          }
          
          /* Ambient Vignette - Darkens the wooden frame edges heavily so text pops in the illuminated center */
          .arcade-maze-bg::after {
            content: '';
            position: absolute;
            inset: 0;
            background: radial-gradient(ellipse at center 40%, rgba(0,0,0,0) 15%, #0f0a05 85%);
            pointer-events: none;
            z-index: 1;
          }
          
          @keyframes moveTrack {
            0% { transform: translateX(-150px); }
            100% { transform: translateX(100vw); }
          }

          @keyframes bob {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-3px); }
          }
          
          @keyframes spinShuriken {
            100% { transform: rotate(360deg); }
          }

          .sprite-track {
            animation: moveTrack 10s linear infinite;
            will-change: transform;
          }
          
          .cursor-sprite {
            width: 24px;
            height: 24px;
            background: #E0E0E0;
            clip-path: polygon(50% 0%, 60% 40%, 100% 50%, 60% 60%, 50% 100%, 40% 60%, 0% 50%, 40% 40%);
            animation: spinShuriken 0.5s linear infinite;
          }
          .cursor-sprite::after {
            content: '';
            position: absolute;
            top: 50%;
            left: 50%;
            width: 6px;
            height: 6px;
            background: #241D17;
            border-radius: 50%;
            transform: translate(-50%, -50%);
          }

          .ninja {
            position: relative;
            width: 24px;
            height: 28px;
            animation: ninja-bob 0.25s infinite alternate ease-in-out;
            --ncolor: #DC143C; /* Default Red (Blinky) */
          }
          @keyframes ninja-bob {
            0% { transform: translateY(0px); }
            100% { transform: translateY(-3px); }
          }
          .n-body {
            position: absolute;
            bottom: 6px;
            left: 0px;
            width: 14px;
            height: 12px;
            background: var(--ncolor);
            border-radius: 10px 10px 4px 4px;
            transform: rotate(15deg);
          }
          .n-head {
            position: absolute;
            top: 0;
            left: 6px;
            width: 14px;
            height: 14px;
            background: var(--ncolor);
            border-radius: 50%;
          }
          .n-face {
            position: absolute;
            top: 2px;
            right: -2px;
            width: 8px;
            height: 10px;
            background: #FFE4C4;
            border-radius: 3px;
          }
          .n-eye {
            position: absolute;
            top: 3px;
            right: 0px;
            width: 2px;
            height: 2px;
            background: #000;
            border-radius: 50%;
          }
          .n-band {
            position: absolute;
            top: 5px;
            right: -3px;
            width: 16px;
            height: 1.5px;
            background: #111;
          }
          .n-ribbon {
             position: absolute;
             left: -7px;
             top: 4px;
             width: 0;
             height: 0;
             border-top: 3px solid transparent;
             border-bottom: 3px solid transparent;
             border-right: 12px solid var(--ncolor);
             transform: rotate(-10deg);
          }
          .n-arm {
            position: absolute;
            top: 10px;
            left: -4px;
            width: 12px;
            height: 3px;
            background: var(--ncolor);
            border-radius: 2px;
            transform: rotate(160deg);
          }
          .n-leg-f {
            position: absolute;
            bottom: 0;
            left: 10px;
            width: 3.5px;
            height: 8px;
            background: var(--ncolor);
            border-radius: 2px;
            transform-origin: top center;
            animation: n-scissor-f 0.3s infinite alternate linear;
          }
          .n-leg-b {
            position: absolute;
            bottom: 0;
            left: 4px;
            width: 3.5px;
            height: 8px;
            background: var(--ncolor);
            border-radius: 2px;
            transform-origin: top center;
            animation: n-scissor-b 0.3s infinite alternate linear;
          }
          @keyframes n-scissor-f {
            0% { transform: rotate(30deg); }
            100% { transform: rotate(-30deg); }
          }
          @keyframes n-scissor-b {
            0% { transform: rotate(-30deg); }
            100% { transform: rotate(30deg); }
          }
          
          .dot-track {
            background-image: radial-gradient(#FFEB3B 2px, transparent 2px);
            background-size: 30px 20px;
            background-position: center;
            width: 100%;
            height: 4px;
            position: absolute;
            bottom: 24px;
          }

          @keyframes blinkText {
            0%, 49% { opacity: 1; }
            50%, 100% { opacity: 0; }
          }
          .blink-text {
            animation: blinkText 1.5s infinite;
          }
          `}
        </style>

        {/* Game Container */}
        <div 
          ref={gameContainerRef}
          className={`w-full bg-[#1C1714] overflow-hidden shadow-sm flex flex-col relative ${
            isPlaying 
              ? (isFullscreen ? 'h-screen w-screen rounded-none' : 'h-[calc(100vh-140px)] rounded-[24px] border-[4px] border-[#8B5A2B]/80') 
              : 'min-h-[500px] rounded-[24px] border-[4px] border-[#8B5A2B]/80 bg-[#1C1714]'
          }`}
        >
          <div className="absolute inset-0 arcade-maze-bg z-0" />
          
          {isPlaying ? (
            <div className="relative w-full h-full flex flex-col flex-1 z-10 bg-black/60 backdrop-blur-sm justify-center items-center">
               <div className="absolute top-4 right-4 z-50 flex items-center gap-3">
                 <button 
                   onClick={handleFullscreenToggle} 
                   className="p-2.5 bg-white/5 hover:bg-white/10 backdrop-blur-md rounded-[10px] text-white/70 hover:text-white transition-all border border-white/5"
                 >
                   {isFullscreen ? <Minimize2 className="w-5 h-5"/> : <Maximize2 className="w-5 h-5" />}
                 </button>
                 <button 
                   onClick={() => { 
                     setIsPlaying(false); 
                     if (document.fullscreenElement) document.exitFullscreen(); 
                   }} 
                   className="p-2.5 bg-red-500/10 hover:bg-red-500/20 backdrop-blur-md rounded-[10px] text-red-400 hover:text-red-300 transition-all border border-red-500/10"
                 >
                   <X className="w-5 h-5" />
                 </button>
               </div>
               <RoninCanvas isFullscreen={isFullscreen} onGameOver={score => { setIsPlaying(false); setIsFullscreen(false); handleGameOver(score); }} />
            </div>
          ) : (
            <>
              <div className="flex-1 flex flex-col items-center justify-center p-12 text-center relative z-10 pt-16 pb-24">
                 <h2 className={`text-4xl lg:text-5xl font-bold tracking-widest mb-6 text-[#D2B48C] drop-shadow-[0_0_15px_rgba(139,90,43,0.8)] ${pressStart.className}`}>RONIN'S RUN</h2>
                 <p className={`text-white/80 max-w-lg mx-auto mb-10 text-[10px] leading-loose ${pressStart.className}`}>
                   INSERT A VIRTUAL TOKEN TO START THE EMULATION MATRIX... HIGH SCORES WILL BE RECORDED ON THE LEDGER.
                 </p>
                 
                 <button 
                    onClick={() => {
                      if (audioEngine) {
                        audioEngine.playCoinInsert();
                        audioEngine.stopMenuAmbience();
                      }
                      setTimeout(() => setIsPlaying(true), 600);
                    }}
                    className={`relative px-8 py-5 bg-[#FFD700] border-b-[6px] border-[#B8860B] rounded-lg active:border-b-0 active:translate-y-[6px] transition-all hover:brightness-110 shadow-[0_0_20px_rgba(255,215,0,0.2)] ${pressStart.className}`}
                 >
                    <div className="flex items-center gap-4 text-black">
                      <Play className="w-5 h-5 fill-current" />
                      <span className="text-[14px] leading-none tracking-wide mt-1">PLAY NOW</span>
                    </div>
                 </button>
                 
                 <div className="mt-8 flex items-center justify-center gap-3 text-secondary/60">
                   <Gamepad2 className="w-4 h-4" />
                   <span className="text-[11px] font-mono tracking-widest uppercase">USE ARROW KEYS TO MOVE</span>
                 </div>
              </div>

              {/* Infinite Animation Track */}
              <div className="absolute bottom-0 left-0 w-full h-[60px] overflow-hidden z-20 pointer-events-none bg-black/50 border-t border-[#8B5A2B]/40 backdrop-blur-sm">
                 <div className="dot-track"></div>
                 <div className="sprite-track absolute bottom-3 flex items-center gap-8">
                    <div className="cursor-sprite"></div>
                    {/* The 4 Ninja Ghosts chasing the Shuriken */}
                    {['#DC143C', '#FF69B4', '#00FFFF', '#FFA500'].map((color, i) => (
                      <div key={i} className="ninja shrink-0" style={{ '--ncolor': color } as React.CSSProperties}>
                        <div className="n-arm"></div>
                        <div className="n-leg-b"></div>
                        <div className="n-body"></div>
                        <div className="n-leg-f"></div>
                        <div className="n-ribbon"></div>
                        <div className="n-head">
                          <div className="n-face">
                            <div className="n-band"></div>
                            <div className="n-eye"></div>
                          </div>
                        </div>
                      </div>
                    ))}
                 </div>
              </div>
            </>
          )}
        </div>

        {/* Leaderboard Table (Hidden when playing) */}
        {!isPlaying && (
          <div className="w-full bg-sidebar/40 border border-border-dim/50 rounded-[20px] overflow-hidden shadow-sm backdrop-blur-xl">
           <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 border-b border-border-dim/50 bg-background/50">
             <div className="flex items-center gap-3">
               <Trophy className="w-5 h-5 text-brand" />
               <div>
                  <h3 className="text-[15px] font-semibold text-foreground tracking-wide">Global Leaderboard</h3>
                  <p className="text-[13px] text-secondary mt-0.5">Top users in the matrix</p>
               </div>
             </div>
           </div>

           <div className="w-full overflow-x-auto">
             <table className="w-full text-left border-collapse">
               <thead>
                 <tr className="border-b border-border-dim/50 bg-foreground/[0.02] whitespace-nowrap">
                   <th className="px-6 py-4 text-[11px] font-medium text-secondary uppercase tracking-[0.1em] w-[80px]">Rank</th>
                   <th className="px-6 py-4 text-[11px] font-medium text-secondary uppercase tracking-[0.1em]">User</th>
                   <th className="px-6 py-4 text-[11px] font-medium text-secondary uppercase tracking-[0.1em] text-right">Score</th>
                   <th className="px-6 py-4 text-[11px] font-medium text-secondary uppercase tracking-[0.1em] text-right">Timestamp</th>
                 </tr>
               </thead>
               <tbody className="divide-y divide-border-dim/30">
                 {(status === "LoadingFirstPage" || status === "LoadingMore") && paginatedItems.length === 0 && (
                   <tr>
                     <td colSpan={4} className="px-6 py-12 text-center text-secondary">
                       <Loader2 className="w-5 h-5 animate-spin mx-auto opacity-50" />
                     </td>
                   </tr>
                 )}

                 {paginatedItems.length === 0 && status !== "LoadingFirstPage" && status !== "LoadingMore" && (
                   <tr>
                     <td colSpan={4} className="px-6 py-12 text-center text-secondary text-[13px]">
                        No scores recorded. Be the first to enter the matrix.
                     </td>
                   </tr>
                 )}

                 {paginatedItems.map((entry, index) => {
                   const globalIndex = (currentPage - 1) * itemsPerPage + index;
                   return (
                     <tr key={entry._id} className="group hover:bg-foreground/[0.03] transition-colors">
                       <td className="px-6 py-4">
                         <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[13px] font-bold ${globalIndex === 0 ? "bg-amber-400/20 text-amber-500" : globalIndex === 1 ? "bg-slate-300/20 text-slate-400" : globalIndex === 2 ? "bg-amber-700/20 text-amber-600" : "bg-foreground/5 text-foreground/70"}`}>
                           {globalIndex === 0 ? <Crown className="w-4 h-4" /> : `#${globalIndex + 1}`}
                         </div>
                       </td>
                       <td className="px-6 py-4">
                         <div className="flex items-center gap-3">
                           {entry.userAvatar ? (
                             <img src={entry.userAvatar} className="w-8 h-8 rounded-full object-cover shadow-sm bg-background border border-border-dim" />
                           ) : (
                             <div className="w-8 h-8 rounded-full bg-brand/10 border border-brand/20 flex items-center justify-center text-brand font-bold text-[12px]">
                               {entry.userName?.charAt(0).toUpperCase() || "?"}
                             </div>
                           )}
                           <span className="text-[14px] font-medium text-foreground">{entry.userName}</span>
                         </div>
                       </td>
                       <td className="px-6 py-4 text-right">
                         <span className="text-[16px] font-mono font-bold text-brand tracking-widest">{entry.score.toLocaleString()}</span>
                       </td>
                       <td className="px-6 py-4 text-right">
                         <div className="flex items-center justify-end gap-1.5 text-secondary">
                           <Clock className="w-3.5 h-3.5" />
                           <span className="text-[12px] tracking-wide">
                             {new Date(entry.playedAt).toLocaleDateString()}
                           </span>
                         </div>
                       </td>
                     </tr>
                   );
                 })}
               </tbody>
             </table>
           </div>

           <div className="flex items-center justify-between px-6 py-4 border-t border-border-dim bg-sidebar/50">
             <div className="flex items-center gap-2 text-[12px] text-muted">
                 <span>Showing</span>
                 <span className="font-medium text-foreground">{totalItems === 0 ? 0 : Math.min((currentPage - 1) * itemsPerPage + 1, totalItems)}</span>
                 <span>to</span>
                 <span className="font-medium text-foreground">{Math.min(currentPage * itemsPerPage, totalItems)}</span>
                 <span>of</span>
                 <span className="font-medium text-foreground">{totalItems}</span>
                 <span>attempts</span>
             </div>
             <div className="flex items-center gap-2">
                 <button 
                   disabled={currentPage === 1}
                   onClick={handlePrevPage}
                   className="p-1.5 rounded-[8px] bg-foreground/5 text-secondary hover:text-foreground hover:bg-foreground/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                 >
                   <ChevronLeft className="w-4 h-4" />
                 </button>
                 <button 
                   disabled={currentPage >= totalPages || totalItems === 0}
                   onClick={handleNextPage}
                   className="p-1.5 rounded-[8px] bg-foreground/5 text-secondary hover:text-foreground hover:bg-foreground/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                 >
                   <ChevronRight className="w-4 h-4" />
                 </button>
             </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
