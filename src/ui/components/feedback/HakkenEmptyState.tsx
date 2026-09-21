"use client";

import { motion } from "framer-motion";
import { LucideIcon, SearchX } from "lucide-react";

interface HakkenEmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
}

export default function HakkenEmptyState({
  icon: Icon = SearchX,
  title,
  description,
  action
}: HakkenEmptyStateProps) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center py-16 px-6 text-center w-full"
    >
      <div className="bg-sidebar/40 p-5 rounded-full mb-5 ring-1 ring-border-dim shadow-xl backdrop-blur-3xl">
        <Icon className="w-8 h-8 text-secondary" strokeWidth={1.5} />
      </div>
      <h3 className="text-[15px] font-medium tracking-wide text-foreground mb-2">{title}</h3>
      <p className="text-[13px] text-secondary max-w-[280px] leading-relaxed mb-6">{description}</p>
      
      {action && (
        <div className="mt-2">
          {action}
        </div>
      )}
    </motion.div>
  );
}
