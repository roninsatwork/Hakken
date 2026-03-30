"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  LayoutDashboard, 
  TrendingDown, 
  Receipt, 
  FileSignature,
  User,
  Settings,
  LogOut,
  ChevronDown,
  Sidebar
} from "lucide-react";

import ThemeToggle from "@/src/ui/components/layout/ThemeToggle";
import SonaeModal from "@/src/ui/components/feedback/SonaeModal";
import Header from "@/src/ui/components/layout/Header";

import { useUI } from "@/src/context/UIContext";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useEffect } from "react";

export default function Home() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { isSidebarOpen, setIsSidebarOpen } = useUI();
  const user = useQuery(api.users.getMe);
  const [greeting, setGreeting] = useState("Welcome");

  useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 12) setGreeting("Good morning");
    else if (hour < 17) setGreeting("Good afternoon");
    else if (hour < 21) setGreeting("Good evening");
    else setGreeting("Good night");
  }, []);

  const firstName = user?.name ? user.name.split(" ")[0] : "";

  return (
    <div className="flex flex-col">
      
      {/* Top Breadcrumb & Profile Bar Container */}
      <Header onOpenModal={() => setIsModalOpen(true)} />

      {/* Main Content Area */}
      <div className="flex flex-col gap-6">
        {/* Hero Header */}
        <header className="flex items-center justify-between">
          <h1 className="text-3xl font-bold text-foreground tracking-tighter">
            {greeting}{firstName ? `, ${firstName}` : ""}
          </h1>
        </header>

        {/* Metric Cards Row */}
        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          
          {/* Active Contracts Card */}
          <div className="bg-card dark:bg-gradient-to-b dark:from-[#2e2e30] dark:to-[#222224] border border-border-dim rounded-[14px] p-5 relative overflow-hidden group shadow-md dark:shadow-2xl transition-all">
            <div className="flex justify-between items-start mb-4 z-10 relative">
              <span className="text-secondary text-[12px] font-medium tracking-wide">Active Contracts</span>
            </div>
            <div className="flex flex-col z-10 relative">
              <span className="text-[36px] font-semibold text-foreground tracking-tight leading-none mb-2">25</span>
              <div className="flex items-center gap-1.5 text-[11px] font-mono tracking-wider">
                <span className="text-[#10b981] font-bold">+5</span>
                <span className="text-secondary">vs last month</span>
              </div>
            </div>

            <div className="absolute right-[-10px] bottom-[-20px] w-[140px] h-[120px]">
               {/* Card visualization... */}
                <div className="absolute right-[10px] bottom-[10px] w-[65px] h-[95px] rounded-[10px] border border-border-dim bg-sidebar/40 rotate-[15deg] translate-x-4 shadow-xl opacity-50 backdrop-blur-sm" />
                <div className="absolute right-[30px] bottom-[15px] w-[65px] h-[95px] rounded-[10px] border border-border-dim/50 bg-foreground/5 rotate-[20deg] shadow-xl opacity-80 backdrop-blur-md" />
                <div className="absolute right-[55px] bottom-[20px] w-[65px] h-[95px] rounded-[10px] border border-foreground/10 bg-gradient-to-br from-foreground/[0.05] to-transparent rotate-[25deg] shadow-2xl flex flex-col justify-center items-center gap-2.5 p-2 backdrop-blur-lg">
                  <div className="w-[16px] h-[2px] bg-foreground/70 rounded-full self-start ml-2 shadow-sm" />
                  <div className="w-[32px] h-[2px] bg-foreground/50 rounded-full shadow-sm" />
                  <div className="w-[24px] h-[2px] bg-foreground/50 rounded-full shadow-sm" />
                </div>
            </div>
          </div>

          {/* Pending Signatures Card */}
          <div className="bg-card dark:bg-gradient-to-b dark:from-[#2e2e30] dark:to-[#222224] border border-border-dim rounded-[14px] p-5 relative overflow-hidden group shadow-md dark:shadow-2xl transition-all">
            <div className="flex justify-between items-start mb-4 z-10 relative">
              <span className="text-secondary text-[12px] font-medium tracking-wide">Pending Signatures</span>
            </div>
            <div className="flex flex-col z-10 relative">
              <span className="text-[36px] font-semibold text-foreground tracking-tight leading-none mb-2">09</span>
              <div className="flex items-center gap-1.5 text-[11px] font-mono tracking-wider">
                <span className="text-[#10b981] font-bold">+6</span>
                <span className="text-secondary">vs last month</span>
              </div>
            </div>
          </div>
        </section>

        {/* Revenue Chart Section */}
        <section className="bg-card dark:bg-gradient-to-b dark:from-[#2c2c2e] dark:to-[#1e1e20] border border-border-dim rounded-[14px] p-6 flex flex-col gap-6 shadow-md dark:shadow-2xl">
          
          {/* Headers for Revenue */}
          <div className="flex flex-col gap-1 z-10 relative">
            <span className="text-secondary text-[12px] font-medium tracking-wide">Revenue</span>
            <span className="text-3xl font-semibold text-foreground tracking-tight leading-none mt-1">$10,985.56</span>
            <div className="flex items-center gap-1.5 text-[11px] font-mono tracking-wider mt-2">
              <span className="text-[#f43f5e] font-bold pb-[1px]">2.5% ↓</span>
              <span className="text-secondary">vs last week</span>
            </div>
          </div>

          {/* CSS Bar Chart */}
          <div className="h-[220px] w-full flex items-end justify-between px-2 sm:px-8 pb-8 relative z-0">
            {/* Horizontal Grid lines */}
             <div className="absolute inset-x-0 bottom-[15%] border-t border-foreground/[0.04] z-0" />
             <div className="absolute inset-x-0 bottom-[45%] border-t border-foreground/[0.04] z-0" />
             <div className="absolute inset-x-0 bottom-[75%] border-t border-foreground/[0.04] z-0" />

            {/* Bars */}
            {[
              { label: 'Mon', h: '35%', active: false },
              { label: 'Tue', h: '65%', active: false },
              { label: 'Wed', h: '45%', active: false },
              { label: 'Thu', h: '80%', active: true, target: '$9,340' },
              { label: 'Fri', h: '55%', active: false },
            ].map((bar, i) => (
              <div key={i} className="flex-1 flex justify-center h-full relative z-10 items-end">
                <div 
                  className={`w-[48px] sm:w-[50px] rounded-t-[8px] relative transition-transform hover:scale-[1.02] ${
                    bar.active 
                      ? 'bg-gradient-to-b from-[#ffedcc] via-[#ff8800] to-[#cc3300] shadow-[0_5px_15px_rgba(255,100,0,0.15)]' 
                      : 'bg-foreground/[0.08] border-t border-l border-r border-foreground/[0.1] border-b-0 shadow-sm'
                  }`} 
                  style={{ height: bar.h }}
                >
                  {bar.active && (
                     <>
                       <div className="absolute top-[1px] left-[5px] w-[500px] border-t border-dashed border-foreground/30 -z-10" />
                       <div className="absolute -top-[5px] -left-[5px] w-3 h-3 rounded-full border-[1.5px] border-sidebar bg-[#3b82f6] shadow-[0_0_10px_#3b82f6] z-20 flex items-center">
                          <div className="absolute right-[16px] bg-card border border-border-dim text-[10px] font-medium text-foreground px-2.5 py-1 rounded-[12px] shadow-2xl whitespace-nowrap tracking-wide">
                            {bar.target}
                          </div>
                       </div>
                     </>
                  )}
                </div>
                <span className="text-[12px] font-medium text-secondary absolute -bottom-8">{bar.label}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Sonae Modal Implementation */}
      <SonaeModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Project Intelligence"
      >
        <div className="flex flex-col gap-4">
          <p className="text-secondary text-[14px] leading-relaxed">
            You are accessing the <span className="text-foreground font-medium">Sonae Intelligence</span> layer. This system tracks relationship compounds and identifies high-value opportunities within your network.
          </p>
          <div className="p-4 rounded-xl bg-foreground/[0.03] border border-border-dim/50 flex flex-col gap-2">
            <span className="text-[11px] font-mono tracking-widest text-brand uppercase">Security Protocol</span>
            <p className="text-[13px] text-secondary">All data accessed is encrypted according to the Ronins Protocol standards.</p>
          </div>
          <div className="mt-4 flex justify-end">
            <button 
              onClick={() => setIsModalOpen(false)}
              className="bg-foreground text-background text-[13px] font-bold px-6 py-2.5 rounded-full hover:opacity-90 transition-opacity"
            >
              Confirm Access
            </button>
          </div>
        </div>
      </SonaeModal>
    </div>
  );
}
