"use client";

import React from "react";
import { AVATAR_ROSTER } from "@/src/lib/constants/avatars";
import { ArrowRight, GraduationCap, UserRound } from "lucide-react";

interface Props {
  playerAvatarUrl: string;
  setPlayerAvatarUrl: (url: string) => void;
  instructorAvatarUrl: string;
  setInstructorAvatarUrl: (url: string) => void;
  onStart: () => void;
}

interface AvatarColumnProps {
  accentClassName: string;
  icon: React.ReactNode;
  label: string;
  selectedUrl: string;
  selectedIndicatorClassName: string;
  onSelect: (url: string) => void;
}

function AvatarColumn({
  accentClassName,
  icon,
  label,
  selectedUrl,
  selectedIndicatorClassName,
  onSelect,
}: AvatarColumnProps) {
  return (
    <section className="flex min-w-0 flex-col">
      <div className={`mb-4 flex items-center gap-3 px-5 py-4 text-black ${accentClassName}`}>
        {icon}
        <h3 className="text-lg font-black uppercase sm:text-xl">{label}</h3>
      </div>

      <div className="flex flex-col gap-2">
        {AVATAR_ROSTER.map((avatar) => {
          const isSelected = selectedUrl === avatar.path;

          return (
            <button
              key={`${label}-${avatar.id}`}
              type="button"
              aria-pressed={isSelected}
              onClick={() => onSelect(avatar.path)}
              className={`flex min-h-14 items-center justify-between border border-white/10 px-5 py-3 text-left transition-colors ${
                isSelected
                  ? `bg-white/10 text-white ${selectedIndicatorClassName}`
                  : "bg-transparent text-white/60 hover:bg-white/5 hover:text-white"
              }`}
            >
              <span className="min-w-0 truncate text-base font-bold uppercase sm:text-lg">
                {avatar.name}
              </span>
              {isSelected && <span className="ml-4 h-3 w-3 shrink-0 bg-current" />}
            </button>
          );
        })}
      </div>
    </section>
  );
}

export default function AvatarSelectorLobby({
  playerAvatarUrl,
  setPlayerAvatarUrl,
  instructorAvatarUrl,
  setInstructorAvatarUrl,
  onStart,
}: Props) {
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center overflow-y-auto bg-[#050510] px-4 py-8">
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-[0.03]">
        <p className="whitespace-nowrap text-[18vw] font-black leading-none text-white">
          PRACTICE
        </p>
      </div>

      <div className="relative z-10 flex w-full max-w-7xl flex-col gap-8">
        <div className="flex flex-col gap-5 border-b-2 border-white/10 pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-col">
            <span className="mb-2 text-sm font-bold uppercase text-[#CCFF00]">
              Movement Practice
            </span>
            <h2 className="text-4xl font-black uppercase text-white sm:text-5xl">
              Choose Avatars
            </h2>
          </div>

          <button
            type="button"
            onClick={onStart}
            className="group flex w-full items-center justify-center gap-4 bg-white px-8 py-4 font-black uppercase text-black transition-colors hover:bg-[#CCFF00] sm:w-auto"
          >
            Begin Session
            <ArrowRight className="h-6 w-6 transition-transform group-hover:translate-x-2" />
          </button>
        </div>

        <div className="grid gap-8 lg:grid-cols-2 lg:gap-12">
          <AvatarColumn
            accentClassName="bg-[#CCFF00]"
            icon={<UserRound className="h-6 w-6" />}
            label="Player"
            selectedUrl={playerAvatarUrl}
            selectedIndicatorClassName="border-[#CCFF00] text-[#CCFF00]"
            onSelect={setPlayerAvatarUrl}
          />

          <AvatarColumn
            accentClassName="bg-[#FF6B35]"
            icon={<GraduationCap className="h-6 w-6" />}
            label="Instructor"
            selectedUrl={instructorAvatarUrl}
            selectedIndicatorClassName="border-[#FF6B35] text-[#FF6B35]"
            onSelect={setInstructorAvatarUrl}
          />
        </div>
      </div>
    </div>
  );
}
