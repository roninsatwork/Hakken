"use client";

import React from "react";
import { createPortal } from "react-dom";
import { AVATAR_ROSTER } from "@/src/lib/constants/avatars";
import { ArrowRight, GraduationCap, Sparkles, UserRound } from "lucide-react";
import {
  MOVEMENT_CREAM,
  MOVEMENT_INK,
  MOVEMENT_MINT,
  MOVEMENT_SALMON,
  MOVEMENT_SCENE_BG,
} from "../../../_lib/movementPalette";

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
      <div className={`mb-4 flex items-center gap-3 rounded-2xl px-5 py-4 text-[${MOVEMENT_INK}] ${accentClassName}`}>
        {icon}
        <h3 className="text-base font-black uppercase tracking-[0.16em] sm:text-lg">{label}</h3>
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
              className={`flex min-h-14 items-center justify-between rounded-2xl border px-5 py-3 text-left transition-colors ${
                isSelected
                  ? `border-white/25 bg-white/[0.12] text-white ${selectedIndicatorClassName}`
                  : "border-white/10 bg-white/[0.03] text-white/60 hover:border-white/20 hover:bg-white/[0.08] hover:text-white"
              }`}
            >
              <span className="min-w-0 truncate text-sm font-bold uppercase tracking-[0.12em] sm:text-base">
                {avatar.name}
              </span>
              {isSelected && <span className="ml-4 h-2.5 w-2.5 shrink-0 rounded-full bg-current" />}
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
  const lobby = (
    <div className={`fixed inset-0 z-[9999] flex items-center justify-center overflow-y-auto bg-[${MOVEMENT_SCENE_BG}] px-4 py-8`}>
      <style>{`nextjs-portal { display: none !important; }`}</style>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_24%_18%,rgba(246,204,190,0.18),transparent_34%),radial-gradient(circle_at_76%_10%,rgba(168,213,186,0.13),transparent_32%),linear-gradient(180deg,rgba(255,255,255,0.04),transparent_45%)]" />

      <div className="relative z-10 flex w-full max-w-7xl flex-col gap-8">
        <div className="flex flex-col gap-5 border-b border-white/10 pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex max-w-3xl flex-col">
            <span className={`mb-3 inline-flex w-fit items-center gap-2 rounded-full border border-[${MOVEMENT_SALMON}]/[0.25] bg-[${MOVEMENT_SALMON}]/10 px-4 py-2 text-xs font-black uppercase tracking-[0.22em] text-[${MOVEMENT_SALMON}]`}>
              <Sparkles className="h-3.5 w-3.5" />
              Private posture studio
            </span>
            <h2 className="text-4xl font-black uppercase tracking-[0.04em] text-white sm:text-5xl">
              Select Coach & Student
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/[0.58]">
              A calm guided practice for posture, balance, and confident movement.
            </p>
          </div>

          <button
            type="button"
            onClick={onStart}
            className={`group flex w-full items-center justify-center gap-4 rounded-2xl bg-[${MOVEMENT_CREAM}] px-8 py-4 text-sm font-black uppercase tracking-[0.16em] text-[${MOVEMENT_INK}] shadow-[0_20px_60px_rgba(246,204,190,0.14)] transition-colors hover:bg-[${MOVEMENT_SALMON}] sm:w-auto`}
          >
            Begin Practice
            <ArrowRight className="h-6 w-6 transition-transform group-hover:translate-x-2" />
          </button>
        </div>

        <div className="grid gap-8 lg:grid-cols-2 lg:gap-12">
          <AvatarColumn
            accentClassName={`bg-[${MOVEMENT_SALMON}]`}
            icon={<UserRound className="h-6 w-6" />}
            label="Student"
            selectedUrl={playerAvatarUrl}
            selectedIndicatorClassName={`text-[${MOVEMENT_SALMON}]`}
            onSelect={setPlayerAvatarUrl}
          />

          <AvatarColumn
            accentClassName={`bg-[${MOVEMENT_MINT}]`}
            icon={<GraduationCap className="h-6 w-6" />}
            label="Coach"
            selectedUrl={instructorAvatarUrl}
            selectedIndicatorClassName={`text-[${MOVEMENT_MINT}]`}
            onSelect={setInstructorAvatarUrl}
          />
        </div>
      </div>
    </div>
  );

  return typeof document === "undefined" ? lobby : createPortal(lobby, document.body);
}
