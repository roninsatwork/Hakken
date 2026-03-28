"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  LayoutDashboard, 
  User, 
  Settings, 
  LogOut, 
  ChevronDown, 
  Sidebar,
  ShieldCheck
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import ThemeToggle from "./ThemeToggle";
import { useUI } from "@/src/context/UIContext";

interface HeaderProps {
  onOpenModal?: () => void;
}

export default function Header({ onOpenModal }: HeaderProps) {
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const { isSidebarOpen, setIsSidebarOpen } = useUI();
  const pathname = usePathname();
  const isAdmin = pathname.startsWith('/admin');

  return (
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
          {isAdmin ? (
            <>
              <ShieldCheck className="w-[18px] h-[18px] opacity-80" />
              <span>Admin Overview</span>
            </>
          ) : (
            <>
              <LayoutDashboard className="w-[18px] h-[18px] opacity-80" />
              <span>Dashboard</span>
            </>
          )}
        </div>
        
        <div className="h-4 w-px bg-border-dim" />
        <span className="text-secondary font-mono tracking-[0.15em] text-[11px] uppercase">
          {isAdmin ? "System Protocol Active" : "14 Live Projects"}
        </span>
      </nav>

      {/* Profile & Theme Actions */}
      <div className="flex items-center gap-4">
        {onOpenModal && (
          <button
            onClick={onOpenModal}
            className="text-[12px] font-medium text-secondary hover:text-foreground px-3 py-1.5 rounded-full border border-border-dim hover:bg-foreground/5 transition-all"
          >
            Preview Modal
          </button>
        )}
        
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
                  className="absolute right-0 top-full mt-2 w-52 bg-card/90 backdrop-blur-xl border border-border-dim rounded-xl shadow-2xl z-50 overflow-hidden"
                >
                  <div className="p-1.5 flex flex-col gap-0.5">
                    <button 
                      onClick={() => setIsProfileOpen(false)}
                      className="flex items-center gap-3 w-full px-3 py-2 rounded-[10px] text-[13px] text-secondary hover:text-foreground hover:bg-foreground/5 transition-all text-left"
                    >
                      <User className="w-4 h-4" />
                      <span>Profile</span>
                    </button>
                    
                    <Link 
                      href="/" 
                      onClick={() => setIsProfileOpen(false)}
                      className="flex items-center gap-3 w-full px-3 py-2 rounded-[10px] text-[13px] text-secondary hover:text-foreground hover:bg-foreground/5 transition-all text-left"
                    >
                      <LayoutDashboard className="w-4 h-4" />
                      <span>Dashboard</span>
                    </Link>
                    
                    <Link 
                      href="/admin" 
                      onClick={() => setIsProfileOpen(false)}
                      className="flex items-center gap-3 w-full px-3 py-2 rounded-[10px] text-[13px] text-secondary hover:text-foreground hover:bg-foreground/5 transition-all text-left"
                    >
                      <Settings className="w-4 h-4" />
                      <span>Admin</span>
                    </Link>
                    
                    <div className="h-px bg-border-dim my-1 mx-2" />
                    
                    <button 
                      onClick={() => setIsProfileOpen(false)}
                      className="flex items-center gap-3 w-full px-3 py-2 rounded-[10px] text-[13px] text-[#f43f5e] hover:bg-[#f43f5e]/10 transition-all text-left font-medium"
                    >
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
  );
}
