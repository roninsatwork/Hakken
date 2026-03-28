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

import { useUI } from "@/src/context/UIContext";

export default function Home() {
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { isSidebarOpen, setIsSidebarOpen } = useUI();

  return (
    <div className="flex flex-col">
      
      {/* Top Breadcrumb & Profile Bar Container */}
      <header className="sticky top-0 z-30 -mx-8 -mt-8 px-8 py-4 mb-8 bg-sidebar/40 backdrop-blur-xl border-b border-border-dim flex items-center justify-between shadow-sm transition-all duration-300">
        <nav className="flex items-center gap-4 text-[13px]">
          <AnimatePresence mode="wait">
            {!isSidebarOpen && (
              <motion.button
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                onClick={() => setIsSidebarOpen(true)}
                className="p-1.5 rounded-md text-muted hover:text-foreground hover:bg-foreground/5 border border-transparent hover:border-border-dim transition-all mr-2"
              >
                <Sidebar className="w-[18px] h-[18px]" />
              </motion.button>
            )}
          </AnimatePresence>
          <div className="flex items-center gap-2 text-foreground font-medium">
            <LayoutDashboard className="w-[18px] h-[18px] opacity-80" />
            <span>Dashboard</span>
          </div>
          <div className="h-4 w-px bg-border-dim" />
          <span className="text-secondary font-mono tracking-[0.15em] text-[11px] uppercase">14 Live Projects</span>
        </nav>

        {/* Profile & Theme Actions */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => setIsModalOpen(true)}
            className="text-[12px] font-medium text-secondary hover:text-foreground px-3 py-1.5 rounded-full border border-border-dim hover:bg-foreground/5 transition-all"
          >
            Preview Modal
          </button>
          
          <ThemeToggle />
          
          <div className="relative">
            <button 
              onClick={() => setIsProfileOpen(!isProfileOpen)}
              className="flex items-center gap-3 p-1.5 rounded-full hover:bg-foreground/5 transition-colors group border border-transparent active:border-border-dim"
            >
              <div className="relative">
                <img 
                  src="https://api.dicebear.com/7.x/notionists/svg?seed=Aman" 
                  alt="Aman" 
                  className="w-8 h-8 rounded-full bg-sidebar border border-border-dim group-hover:border-foreground/20 transition-all"
                />
                <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-[#10b981] border-2 border-sidebar rounded-full" />
              </div>
              <ChevronDown className={`w-4 h-4 text-secondary transition-transform duration-300 ${isProfileOpen ? 'rotate-180' : ''}`} />
            </button>

            {/* Profile Dropdown */}
            <AnimatePresence>
              {isProfileOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setIsProfileOpen(false)} />
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 10 }}
                    transition={{ duration: 0.2, ease: "easeOut" }}
                    className="absolute right-0 top-full mt-2 w-48 bg-card/90 backdrop-blur-xl border border-border-dim rounded-xl shadow-2xl z-50 overflow-hidden"
                  >
                    <div className="p-1">
                      <button className="flex items-center gap-3 w-full px-3 py-2.5 rounded-[10px] text-[13px] text-secondary hover:text-foreground hover:bg-foreground/5 transition-all text-left">
                        <User className="w-4 h-4" />
                        <span>My Profile</span>
                      </button>
                      <button className="flex items-center gap-3 w-full px-3 py-2.5 rounded-[10px] text-[13px] text-secondary hover:text-foreground hover:bg-foreground/5 transition-all text-left">
                        <Settings className="w-4 h-4" />
                        <span>Admin</span>
                      </button>
                      <div className="h-px bg-border-dim my-1" />
                      <button className="flex items-center gap-3 w-full px-3 py-2.5 rounded-[10px] text-[13px] text-[#f43f5e] hover:bg-[#f43f5e]/10 transition-all text-left font-medium">
                        <LogOut className="w-4 h-4" />
                        <span>Logout</span>
                      </button>
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex flex-col gap-10">
        {/* Hero Header */}
        <header className="flex items-center justify-between">
          <h1 className="text-5xl font-bold text-foreground tracking-tighter">Good morning, Aman</h1>
        </header>

        {/* Metric Cards Row */}
        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          
          {/* Active Contracts Card */}
          <div className="bg-card dark:bg-gradient-to-b dark:from-[#1c1c1c] dark:to-[#121212] border border-border-dim rounded-[16px] p-6 relative overflow-hidden group shadow-md dark:shadow-2xl transition-all">
            <div className="flex justify-between items-start mb-6 z-10 relative">
              <span className="text-secondary text-[13px] font-medium tracking-wide">Active Contracts</span>
            </div>
            <div className="flex flex-col z-10 relative">
              <span className="text-[44px] font-semibold text-foreground tracking-tight leading-none mb-3">25</span>
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
          <div className="bg-card dark:bg-gradient-to-b dark:from-[#1c1c1c] dark:to-[#121212] border border-border-dim rounded-[16px] p-6 relative overflow-hidden group shadow-md dark:shadow-2xl transition-all">
            <div className="flex justify-between items-start mb-6 z-10 relative">
              <span className="text-secondary text-[13px] font-medium tracking-wide">Pending Signatures</span>
            </div>
            <div className="flex flex-col z-10 relative">
              <span className="text-[44px] font-semibold text-foreground tracking-tight leading-none mb-3">09</span>
              <div className="flex items-center gap-1.5 text-[11px] font-mono tracking-wider">
                <span className="text-[#10b981] font-bold">+6</span>
                <span className="text-secondary">vs last month</span>
              </div>
            </div>
          </div>
        </section>

        {/* Revenue Chart Section */}
        <section className="bg-card dark:bg-gradient-to-b dark:from-[#161616] dark:to-[#0f0f0f] border border-border-dim rounded-[16px] p-7 flex flex-col gap-10 shadow-md dark:shadow-2xl">
          
          {/* Headers for Revenue */}
          <div className="flex flex-col gap-1 z-10 relative">
            <span className="text-secondary text-[13px] font-medium tracking-wide">Revenue</span>
            <span className="text-[34px] font-semibold text-foreground tracking-tight leading-none mt-1">$10,985.56</span>
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
