"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  LayoutDashboard, 
  FolderKanban, 
  Building2, 
  Users2, 
  Briefcase,
  LineChart, 
  ChevronDown,
  Search,
  Sidebar,
  Apple,
  Globe,
  PenTool
} from "lucide-react";
import { cn } from "@/src/ui/lib/utils";
import Link from "next/link";
import { useUI } from "@/src/context/UIContext";

interface NavItemProps {
  icon: React.ElementType;
  label: string;
  isActive?: boolean;
  hasChildren?: boolean;
  isOpen?: boolean;
  onToggle?: () => void;
  onClick?: () => void;
  children?: React.ReactNode;
}

function SubNavItem({ label, isActive, onClick }: { label: string, isActive: boolean, onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "py-1.5 px-3 rounded-[8px] text-[13px] tracking-wide transition-all relative group text-left",
        isActive ? "text-foreground font-medium" : "text-secondary hover:text-foreground"
      )}
    >
      {isActive && (
        <motion.div
          layoutId="active-pill"
          className="absolute inset-0 bg-foreground/10 border border-border-dim rounded-[8px] z-0 shadow-sm"
          transition={{ type: "spring", stiffness: 350, damping: 30 }}
        />
      )}
      <span className="relative z-10">{label}</span>
    </button>
  );
}

function NavItem({ icon: Icon, label, isActive, hasChildren, isOpen, onToggle, onClick, children }: NavItemProps) {
  return (
    <div className="flex flex-col mb-0.5 relative">
      <button
        onClick={hasChildren ? (onToggle || onClick) : onClick}
        className={cn(
          "flex items-center justify-between w-full px-3 py-[7px] rounded-[10px] text-[13px] font-medium transition-all group relative",
          isActive 
            ? "text-foreground" 
            : "text-secondary py-[11px] hover:text-foreground hover:bg-hover/50"
        )}
      >
        {isActive && (
          <motion.div
            layoutId="active-pill"
            className="absolute inset-0 bg-foreground/10 border border-border-dim rounded-[10px] z-0 shadow-sm"
            transition={{ type: "spring", stiffness: 350, damping: 30 }}
          />
        )}
        <div className="flex items-center gap-3 relative z-10">
          <Icon className={cn("w-[18px] h-[18px]", isActive ? "text-foreground" : "text-secondary group-hover:text-foreground")} />
          <span>{label}</span>
        </div>
        {hasChildren && (
          <motion.div
            initial={false}
            animate={{ rotate: isOpen ? 180 : 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
            className="relative z-10"
          >
            <ChevronDown className={cn("w-3.5 h-3.5", isActive ? "text-foreground" : "text-muted")} />
          </motion.div>
        )}
      </button>
      
      <AnimatePresence initial={false}>
        {hasChildren && isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className="overflow-hidden"
          >
            <div className="pl-6 pr-1 py-1 flex flex-col gap-0.5 mt-1 ml-4 border-l border-border-dim/30">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function SidebarNavigation() {
  const { isSidebarOpen, setIsSidebarOpen } = useUI();
  const [activeItem, setActiveItem] = useState('Dashboard');
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    workspace: true,
    businessHub: false,
    clients: false,
    companies: false
  });

  const toggleSection = (section: string) => {
    setOpenSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  return (
    <AnimatePresence mode="wait">
      {isSidebarOpen && (
        <motion.aside 
          initial={{ x: -275, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: -275, opacity: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 30, mass: 1 }}
          className="fixed left-0 top-0 bottom-0 w-[275px] bg-sidebar border-r border-border-dim/50 flex flex-col z-50 shadow-2xl"
        >
          
          {/* Header Area */}
          <div className="flex items-center justify-between px-5 pt-8 pb-5">
            <Link href="/" className="flex items-center gap-3 group">
              <div className="w-[30px] h-[30px] rounded-[8px] bg-card border border-border-dim flex items-center justify-center relative shadow-sm">
                <div className="w-[18px] h-[18px] text-brand flex items-center justify-center">
                   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
                     <path d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m0-12.728l.707.707m11.314 11.314l.707.707" />
                     <circle cx="12" cy="12" r="3" />
                   </svg>
                </div>
              </div>
              <span className="font-bold text-[18px] text-foreground tracking-tight group-hover:opacity-90 transition-opacity">Sonae</span>
            </Link>
            <button 
              onClick={() => setIsSidebarOpen(false)}
              className="text-muted hover:text-foreground transition-colors border border-transparent hover:border-border-dim p-1.5 rounded-md"
            >
              <Sidebar className="w-[18px] h-[18px]" />
            </button>
          </div>

          <div className="px-5 pb-5">
            <div className="flex items-center gap-3 px-3.5 py-2.5 rounded-[12px] bg-foreground/[0.03] border border-border-dim text-secondary cursor-text hover:border-brand/30 hover:text-foreground transition-all shadow-sm">
              <Search className="w-[18px] h-[18px] opacity-70" />
              <span className="text-[13px] font-medium flex-1 tracking-wide">Search</span>
              <div className="flex items-center gap-1 text-[11px] font-mono font-bold text-secondary/50 tracking-widest bg-transparent">
                <span>⌘</span>
                <span>K</span>
              </div>
            </div>
          </div>

          <div className="w-full h-[1px] bg-border-dim" />

          <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col pt-6 pb-8 px-4 gap-6">
            
            <section>
              <div className="mb-3 px-3">
                <span className="text-[11px] font-mono tracking-[0.15em] text-muted uppercase">Navigation</span>
              </div>

              <nav>
                <NavItem 
                  icon={LayoutDashboard} 
                  label="Dashboard" 
                  isActive={activeItem === 'Dashboard'} 
                  onClick={() => setActiveItem('Dashboard')}
                />
                
                <NavItem 
                  icon={FolderKanban} 
                  label="Workspace" 
                  isActive={activeItem === 'Workspace'}
                  onClick={() => setActiveItem('Workspace')}
                  hasChildren 
                  isOpen={openSections.workspace}
                  onToggle={() => toggleSection('workspace')}
                >
                  <SubNavItem label="Active Projects" isActive={activeItem === 'Active Projects'} onClick={() => setActiveItem('Active Projects')} />
                  <SubNavItem label="Archived" isActive={activeItem === 'Archived'} onClick={() => setActiveItem('Archived')} />
                </NavItem>

                <NavItem 
                  icon={Briefcase} 
                  label="Business Hub" 
                  isActive={activeItem === 'Business Hub'}
                  onClick={() => setActiveItem('Business Hub')}
                  hasChildren 
                  isOpen={openSections.businessHub}
                  onToggle={() => toggleSection('businessHub')}
                >
                   <SubNavItem label="Documents" isActive={activeItem === 'Documents'} onClick={() => setActiveItem('Documents')} />
                </NavItem>

                <NavItem 
                  icon={Users2} 
                  label="Clients" 
                  isActive={activeItem === 'Clients'}
                  onClick={() => setActiveItem('Clients')}
                  hasChildren 
                  isOpen={openSections.clients}
                  onToggle={() => toggleSection('clients')}
                >
                  <SubNavItem label="Directory" isActive={activeItem === 'Directory'} onClick={() => setActiveItem('Directory')} />
                </NavItem>

                <NavItem 
                  icon={Building2} 
                  label="Companies" 
                  isActive={activeItem === 'Companies'}
                  onClick={() => setActiveItem('Companies')}
                  hasChildren 
                  isOpen={openSections.companies}
                  onToggle={() => toggleSection('companies')}
                >
                  <SubNavItem label="Search" isActive={activeItem === 'Search'} onClick={() => setActiveItem('Search')} />
                </NavItem>

                <NavItem 
                  icon={LineChart} 
                  label="Growth Report" 
                  isActive={activeItem === 'Growth Report'}
                  onClick={() => setActiveItem('Growth Report')}
                />
              </nav>
            </section>

            {/* Divider */}
            <div className="w-full h-[1px] bg-border-dim" />

            {/* Favorites Section */}
            <section>
              <div className="mb-3 px-3">
                <span className="text-[11px] font-mono tracking-[0.15em] text-muted uppercase">Favorites</span>
              </div>

              <div className="flex flex-col gap-0.5">
                {[
                  { label: 'Apple', icon: <Apple className="w-[18px] h-[18px] text-foreground" />, tag: 'COMPANY' },
                  { label: 'Google', icon: <Globe className="w-[18px] h-[18px] text-[#4285F4]" />, tag: 'COMPANY' },
                  { label: 'Figma', icon: <PenTool className="w-[18px] h-[18px] text-[#F24E1E]" />, tag: 'COMPANY' }
                ].map((fav, i) => (
                   <button key={fav.label} className="flex items-center justify-between w-full px-3 py-2 rounded-[10px] text-[13px] hover:bg-hover group transition-all">
                     <div className="flex items-center gap-3 opacity-90 group-hover:opacity-100">
                        <div className="text-foreground transition-colors">{fav.icon}</div>
                        <span className="text-secondary group-hover:text-foreground tracking-wide transition-colors">{fav.label}</span>
                     </div>
                     <span className="text-[10px] font-mono tracking-[0.15em] text-muted uppercase">{fav.tag}</span>
                   </button>
                ))}

                <button className="flex items-center justify-between w-full px-3 py-2 rounded-[10px] text-[13px] hover:bg-hover group transition-all">
                  <div className="flex items-center gap-3">
                    <img src="https://api.dicebear.com/7.x/notionists/svg?seed=Aman" alt="Aman" className="w-[18px] h-[18px] rounded-full bg-card border border-border-dim" />
                    <span className="text-secondary group-hover:text-foreground tracking-wide transition-colors">Aman</span>
                  </div>
                  <span className="text-[10px] font-mono tracking-[0.15em] text-muted uppercase">DESIGNER</span>
                </button>
              </div>
            </section>

          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
