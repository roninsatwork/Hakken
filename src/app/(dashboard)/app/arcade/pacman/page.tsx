"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { usePaginatedQuery, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Trophy, Gamepad2, Play, Crown, Clock, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import Header from "@/src/ui/components/layout/Header";
import { Press_Start_2P } from "next/font/google";

const pressStart = Press_Start_2P({ weight: '400', subsets: ['latin'] });

export default function PacmanArcadePage() {
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;

  const { results, status, loadMore } = usePaginatedQuery(
    api.arcade.getPaginatedLeaderboard,
    { game: "pacman" },
    { initialNumItems: 15 }
  );

  const scoreCount = useQuery(api.arcade.getScoresCount, { game: "pacman" }) || 0;
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

  return (
    <div className="flex flex-col">
      <Header 
        title="Arcade | Pacman" 
        subtitle="Classic arcade action on the Sonae matrix."
        icon={<Gamepad2 className="w-5 h-5" />}
      />

      <div className="flex flex-col gap-5 pb-8 mt-2">
        
        <style dangerouslySetInnerHTML={{__html: `
          .arcade-maze-bg {
            background-color: #0b0b0f;
            background-image: 
              linear-gradient(rgba(33, 33, 255, 0.4) 2px, transparent 2px),
              linear-gradient(90deg, rgba(33, 33, 255, 0.4) 2px, transparent 2px),
              linear-gradient(rgba(33, 33, 255, 0.1) 1px, transparent 1px),
              linear-gradient(90deg, rgba(33, 33, 255, 0.1) 1px, transparent 1px);
            background-size: 50px 50px, 50px 50px, 10px 10px, 10px 10px;
            background-position: -2px -2px, -2px -2px, -1px -1px, -1px -1px;
          }
          
          @keyframes moveTrack {
            0% { transform: translateX(-150px); }
            100% { transform: translateX(100vw); }
          }

          @keyframes chomp {
            0%, 100% { clip-path: polygon(100% 74%, 44% 48%, 100% 21%, 100% 0, 0 0, 0 100%, 100% 100%); }
            50% { clip-path: polygon(100% 60%, 44% 48%, 100% 40%, 100% 0, 0 0, 0 100%, 100% 100%); }
          }
          
          .sprite-track {
            animation: moveTrack 10s linear infinite;
            will-change: transform;
          }
          
          .pacman-sprite {
            width: 24px;
            height: 24px;
            background: #FFEB3B;
            border-radius: 50%;
            animation: chomp 0.3s infinite;
          }

          .ghost-sprite {
            width: 24px;
            height: 24px;
            background: #FF0000;
            border-top-left-radius: 12px;
            border-top-right-radius: 12px;
            position: relative;
          }
          .ghost-sprite::after {
            content: '';
            position: absolute;
            bottom: -4px;
            left: 0;
            width: 100%;
            height: 8px;
            background: radial-gradient(circle at 4px 4px, transparent 4px, #FF0000 5px);
            background-size: 8px 8px;
          }
          .ghost-eyes {
            position: absolute;
            top: 6px;
            left: 4px;
            width: 6px;
            height: 8px;
            background: white;
            border-radius: 50%;
            box-shadow: 10px 0 0 white;
          }
          .ghost-pupils {
            position: absolute;
            top: 3px;
            left: 4px;
            width: 3px;
            height: 3px;
            background: blue;
            border-radius: 50%;
            box-shadow: 10px 0 0 blue;
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
        `}} />

        {/* Game Container (Placeholder) */}
        <div className="w-full bg-card border-[3px] border-[#2121ff]/50 rounded-[24px] overflow-hidden shadow-sm flex flex-col relative min-h-[400px]">
          <div className="absolute inset-0 arcade-maze-bg z-0" />
          
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center relative z-10 pt-16 pb-24">
             <h2 className={`text-4xl lg:text-5xl font-bold tracking-widest mb-6 text-[#FFEB3B] drop-shadow-[0_0_15px_rgba(255,235,59,0.5)] ${pressStart.className}`}>PACMAN</h2>
             <p className={`text-white/80 max-w-lg mx-auto mb-10 text-[10px] leading-loose ${pressStart.className}`}>
               INSERT A VIRTUAL TOKEN TO START THE EMULATION MATRIX... HIGH SCORES WILL BE BROADCASTED TO THE ORGANIZATIONAL LEDGER.
             </p>
             
             <button className={`relative px-8 py-5 bg-[#FFD700] border-b-[6px] border-[#B8860B] rounded-lg active:border-b-0 active:translate-y-[6px] transition-all hover:brightness-110 shadow-[0_0_20px_rgba(255,215,0,0.2)] ${pressStart.className}`}>
                <div className="flex items-center gap-4 text-black">
                  <Play className="w-5 h-5 fill-current" />
                  <span className="text-[14px] leading-none blink-text mt-1">INSERT COIN</span>
                </div>
             </button>
          </div>

          {/* Infinite Animation Track */}
          <div className="absolute bottom-0 left-0 w-full h-[60px] overflow-hidden z-20 pointer-events-none bg-black/40 border-t border-[#2121ff]/30 backdrop-blur-sm">
             <div className="dot-track"></div>
             <div className="sprite-track absolute bottom-3 flex items-center gap-10">
                <div className="pacman-sprite"></div>
                <div className="ghost-sprite">
                   <div className="ghost-eyes"><div className="ghost-pupils"></div></div>
                </div>
             </div>
          </div>
        </div>

        {/* Leaderboard Table */}
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

      </div>
    </div>
  );
}
