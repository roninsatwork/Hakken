"use client";

import React from "react";
import { AVATAR_ROSTER } from "@/src/lib/constants/avatars";
import { ArrowRight, User, Skull } from "lucide-react";

interface Props {
  playerAvatarUrl: string;
  setPlayerAvatarUrl: (url: string) => void;
  instructorAvatarUrl: string;
  setInstructorAvatarUrl: (url: string) => void;
  onStart: () => void;
}

export default function AvatarSelectorLobby({
  playerAvatarUrl,
  setPlayerAvatarUrl,
  instructorAvatarUrl,
  setInstructorAvatarUrl,
  onStart,
}: Props) {
  return (
    <div className="absolute inset-0 z-50 bg-[#050510] flex flex-col justify-center items-center overflow-hidden">
      {/* Massive Background Typography */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.03]">
        <h1 className="text-[20vw] font-black text-white leading-none whitespace-nowrap tracking-tighter">
          FIGHTER
        </h1>
      </div>

      <div className="w-full max-w-7xl px-8 flex flex-col gap-16 relative z-10">
        
        {/* Header */}
        <div className="flex justify-between items-end border-b-2 border-white/10 pb-6">
          <div className="flex flex-col">
            <span className="text-[#CCFF00] font-bold tracking-[0.2em] text-sm mb-2 uppercase">Initialisation Protocol</span>
            <h2 className="text-5xl font-black text-white uppercase tracking-tight">Select Combatants</h2>
          </div>
          
          <button 
            onClick={onStart}
            className="group flex items-center gap-4 bg-white text-black px-8 py-4 font-black uppercase tracking-widest hover:bg-[#CCFF00] transition-colors"
          >
            Engage
            <ArrowRight className="w-6 h-6 transform group-hover:translate-x-2 transition-transform" />
          </button>
        </div>

        {/* Selection Columns */}
        <div className="grid grid-cols-2 gap-12">
          
          {/* Player Column */}
          <div className="flex flex-col">
            <div className="flex items-center gap-3 bg-[#CCFF00] text-black px-6 py-4 mb-6">
              <User className="w-6 h-6" />
              <h3 className="text-2xl font-black uppercase tracking-widest">Player 1 (You)</h3>
            </div>
            
            <div className="flex flex-col gap-2">
              {AVATAR_ROSTER.map((avatar) => {
                const isSelected = playerAvatarUrl === avatar.path;
                return (
                  <button
                    key={avatar.id}
                    onClick={() => setPlayerAvatarUrl(avatar.path)}
                    className={`flex items-center justify-between px-6 py-4 text-left border border-white/10 transition-all ${
                      isSelected 
                        ? "bg-white/10 border-[#CCFF00] text-[#CCFF00]" 
                        : "bg-transparent text-white/50 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    <span className="text-xl font-bold uppercase tracking-wider">{avatar.name}</span>
                    {isSelected && <span className="w-3 h-3 bg-[#CCFF00]" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Instructor Column */}
          <div className="flex flex-col">
            <div className="flex items-center gap-3 bg-[#FF3300] text-black px-6 py-4 mb-6">
              <Skull className="w-6 h-6" />
              <h3 className="text-2xl font-black uppercase tracking-widest">Instructor</h3>
            </div>
            
            <div className="flex flex-col gap-2">
              {AVATAR_ROSTER.map((avatar) => {
                const isSelected = instructorAvatarUrl === avatar.path;
                return (
                  <button
                    key={`inst-${avatar.id}`}
                    onClick={() => setInstructorAvatarUrl(avatar.path)}
                    className={`flex items-center justify-between px-6 py-4 text-left border border-white/10 transition-all ${
                      isSelected 
                        ? "bg-white/10 border-[#FF3300] text-[#FF3300]" 
                        : "bg-transparent text-white/50 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    <span className="text-xl font-bold uppercase tracking-wider">{avatar.name}</span>
                    {isSelected && <span className="w-3 h-3 bg-[#FF3300]" />}
                  </button>
                );
              })}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
