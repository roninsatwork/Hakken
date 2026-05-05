"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Calendar, ChevronDown } from "lucide-react";

type TimeframeOption = "today" | "yesterday" | "7d" | "14d" | "30d" | "60d" | "90d" | "180d" | "365d" | "ytd" | "custom";

interface TimeframeDropdownProps {
  timeframe: string;
  setTimeframe: (val: TimeframeOption) => void;
  customStart: string;
  setCustomStart: (val: string) => void;
  customEnd: string;
  setCustomEnd: (val: string) => void;
  className?: string;
}

export default function TimeframeDropdown({
  timeframe,
  setTimeframe,
  customStart,
  setCustomStart,
  customEnd,
  setCustomEnd,
  className = ""
}: TimeframeDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const presets = [
    { id: "today", label: "Today" },
    { id: "yesterday", label: "Yesterday" },
    { id: "7d", label: "Last 7 Days" },
    { id: "14d", label: "Last 14 Days" },
    { id: "30d", label: "Last 30 Days" },
    { id: "60d", label: "Last 60 Days" },
    { id: "90d", label: "Last 90 Days" },
    { id: "180d", label: "Last 180 Days" },
    { id: "365d", label: "Last 365 Days" },
  ];

  const getActiveLabel = () => {
    if (timeframe === "custom") return "Custom Range";
    return presets.find(p => p.id === timeframe)?.label || "Select Range";
  };

  const handleApplyCustom = () => {
    setTimeframe("custom");
    setIsOpen(false);
  };

  const handleSelectPreset = (id: TimeframeOption) => {
    setTimeframe(id);
    setIsOpen(false);
  };

  return (
    <div className={`relative z-50 ${className}`} ref={containerRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 bg-card/40 backdrop-blur-lg border border-border-dim px-4 py-2 rounded-[12px] shadow-sm transition-all hover:bg-card/60 text-[13px] font-medium text-foreground"
      >
        <Calendar className="w-4 h-4 text-muted" />
        <span>{getActiveLabel()}</span>
        <ChevronDown className="w-4 h-4 text-muted/50 ml-1" />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ duration: 0.2 }}
            className="absolute top-full right-0 mt-2 bg-[#252525] dark:bg-[#252525] border border-[#333333] shadow-2xl rounded-[12px] overflow-hidden flex min-w-[420px]"
          >
            {/* Left Panel: Presets */}
            <div className="flex flex-col w-[170px] border-r border-[#333333] py-3">
              <span className="text-[10px] font-bold tracking-widest text-[#888888] uppercase px-5 mb-3 mt-1">Presets</span>
              {presets.map(p => (
                <button
                  key={p.id}
                  onClick={() => handleSelectPreset(p.id as TimeframeOption)}
                  className={`text-left px-5 py-2.5 text-[13px] transition-colors ${
                    timeframe === p.id 
                      ? 'bg-[#333333] text-[#e87030] font-medium' 
                      : 'text-[#cccccc] hover:bg-[#333333]'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* Right Panel: Custom Range */}
            <div className="flex flex-col flex-1 p-5 relative">
              <span className="text-[10px] font-bold tracking-widest text-[#888888] uppercase mb-5 mt-0">Custom Range</span>
              
              <div className="flex flex-col gap-5 flex-1">
                <div className="flex flex-col gap-2">
                  <label className="text-[12px] text-[#aaaaaa]">Start Date</label>
                  <div className="relative">
                    <input 
                      type="date"
                      value={customStart}
                      onChange={(e) => setCustomStart(e.target.value)}
                      className="w-full bg-[#1a1a1a] border border-[#333333] rounded-[8px] text-[13px] text-[#cccccc] px-3 py-2.5 outline-none focus:border-[#e87030] transition-colors [color-scheme:dark]"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-[12px] text-[#aaaaaa]">End Date (Optional)</label>
                  <div className="relative">
                    <input 
                      type="date"
                      value={customEnd}
                      onChange={(e) => setCustomEnd(e.target.value)}
                      className="w-full bg-[#1a1a1a] border border-[#333333] rounded-[8px] text-[13px] text-[#cccccc] px-3 py-2.5 outline-none focus:border-[#e87030] transition-colors [color-scheme:dark]"
                    />
                  </div>
                </div>
              </div>

              <div className="mt-8">
                <button 
                  onClick={handleApplyCustom}
                  disabled={!customStart}
                  className="w-full bg-[#333333] hover:bg-[#444444] disabled:opacity-50 disabled:hover:bg-[#333333] text-[#cccccc] text-[13px] font-medium py-2.5 rounded-[8px] transition-colors"
                >
                  Apply Range
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
