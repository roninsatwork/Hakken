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
        <header className="flex flex-col gap-3 max-w-3xl border-b border-border-dim pb-6">
          <h1 className="text-3xl font-light text-foreground tracking-wide">
            {greeting}{firstName ? `, ${firstName}` : ""}
          </h1>
          <p className="text-secondary text-[15px] font-light leading-relaxed">
            Welcome to your intelligent workspace. Sonae is fully integrated and ready to assist you. Use this dashboard as your launching pad to interact with the assistant, run specialized workflows, and navigate your projects.
          </p>
        </header>

        {/* User Interaction Guide */}
        <section className="bg-sidebar/40 backdrop-blur-3xl border border-border-dim rounded-[32px] p-8 flex flex-col gap-6 shadow-xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-96 h-96 bg-brand/10 rounded-full blur-[100px] pointer-events-none" />
          
          <div className="flex flex-col gap-1 z-10 relative">
            <span className="text-brand font-mono text-[11px] tracking-widest uppercase">Quick Start</span>
            <h2 className="text-xl font-light tracking-wide text-foreground">Explore The Workspace</h2>
          </div>

          <div className="flex flex-col gap-4 z-10 relative">
            
            <div className="flex items-start gap-4 p-4 rounded-[16px] bg-foreground/[0.02] border border-border-dim/50 hover:bg-foreground/[0.04] transition-colors relative overflow-hidden">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-brand/10 flex items-center justify-center border border-brand/20 ml-2">
                <span className="text-brand font-mono text-[11px] font-bold">1</span>
              </div>
              <div className="flex flex-col gap-1.5 ml-2">
                <span className="text-foreground text-[14px] font-medium tracking-wide">Meet The Sonae Assistant</span>
                <p className="text-secondary text-[13px] font-light">Jump into the Sonae Assistant tab on your left to begin chatting. Ask questions, analyze data, or generate insights instantly.</p>
              </div>
            </div>

            <div className="flex items-start gap-4 p-4 rounded-[16px] bg-foreground/[0.02] border border-border-dim/50 hover:bg-foreground/[0.04] transition-colors">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-foreground/[0.05] flex items-center justify-center border border-border-dim">
                <span className="text-foreground font-mono text-[11px] font-bold">2</span>
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-foreground text-[14px] font-medium tracking-wide">Agentic Testing</span>
                <p className="text-secondary text-[13px] font-light">Access the Agentic Sandbox to experiment with highly specialized workflows isolated from your main history.</p>
              </div>
            </div>

            <div className="flex items-start gap-4 p-4 rounded-[16px] bg-foreground/[0.02] border border-border-dim/50 hover:bg-foreground/[0.04] transition-colors">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-foreground/[0.05] flex items-center justify-center border border-border-dim">
                <span className="text-foreground font-mono text-[11px] font-bold">3</span>
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-foreground text-[14px] font-medium tracking-wide">Explore Knowledge</span>
                <p className="text-secondary text-[13px] font-light">Sonae actively reads from the documents uploaded to your business hub, ensuring your answers are always grounded in reality.</p>
              </div>
            </div>

          </div>
        </section>

        {/* Capabilities Grid */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-5">
          
          <div className="bg-sidebar/30 backdrop-blur-3xl border border-border-dim rounded-[24px] p-6 shadow-md transition-all hover:bg-sidebar/50">
            <h3 className="text-foreground text-[15px] font-medium tracking-wide mb-3">Relationship Context</h3>
            <p className="text-secondary text-[13px] font-light leading-relaxed">Sonae remembers deep context over time. It synthesizes past interactions so you walk into every meeting fully prepared.</p>
          </div>

          <div className="bg-sidebar/30 backdrop-blur-3xl border border-border-dim rounded-[24px] p-6 shadow-md transition-all hover:bg-sidebar/50">
            <h3 className="text-foreground text-[15px] font-medium tracking-wide mb-3">Always Available</h3>
            <p className="text-secondary text-[13px] font-light leading-relaxed">Your assistant is connected to a live edge network, ensuring instant replies and unbroken uptime during critical workflows.</p>
          </div>

          <div className="bg-sidebar/30 backdrop-blur-3xl border border-border-dim rounded-[24px] p-6 shadow-md transition-all hover:bg-sidebar/50">
            <h3 className="text-foreground text-[15px] font-medium tracking-wide mb-3">Air-Tight Security</h3>
            <p className="text-secondary text-[13px] font-light leading-relaxed">Interactions are locked into your secure company perimeter. Your queries are never used to train public machine learning models.</p>
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
