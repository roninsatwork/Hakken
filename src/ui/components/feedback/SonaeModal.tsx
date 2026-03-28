"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { cn } from "@/src/ui/lib/utils";

interface SonaeModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

const sizeClasses = {
  sm: 'max-w-md',
  md: 'max-w-xl',
  lg: 'max-w-3xl',
  xl: 'max-w-5xl',
};

export default function SonaeModal({ 
  isOpen, 
  onClose, 
  title, 
  children, 
  className,
  size = 'md'
}: SonaeModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-[12px]"
          />

          {/* Dialog Body */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 30, filter: "blur(10px)" }}
            animate={{ opacity: 1, scale: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, scale: 0.9, y: 30, filter: "blur(10px)" }}
            transition={{ type: "spring", stiffness: 400, damping: 30, mass: 0.8 }}
            className={cn(
              "relative w-full bg-sidebar/40 backdrop-blur-3xl border border-white/10 shadow-[0_0_50px_rgba(0,0,0,0.5)] rounded-[32px] overflow-hidden flex flex-col",
              sizeClasses[size],
              className
            )}
          >
            {/* Atmospheric Inner Glow (Top Left) */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-[32px]">
              <div className="absolute -top-[150px] -left-[150px] w-[300px] h-[300px] bg-white/5 blur-[80px] rounded-full" />
              <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-50" />
            </div>

            {/* Close Button - Floating Tactical Circle */}
            <button
              onClick={onClose}
              className="absolute top-6 right-6 z-50 text-muted hover:text-foreground transition-all p-2 rounded-full border border-white/5 bg-white/5 backdrop-blur-md hover:bg-white/10 hover:scale-110 active:scale-95"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Header Content */}
            <div className="px-10 pt-12 pb-6 flex flex-col gap-2 relative z-10">
              {title && (
                <h2 className="text-2xl font-light text-foreground tracking-[0.12em] uppercase opacity-90">
                  {title}
                </h2>
              )}
            </div>

            {/* Content Body */}
            <div className="px-10 pb-12 overflow-y-auto max-h-[70vh] custom-scrollbar relative z-10">
              {children}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
