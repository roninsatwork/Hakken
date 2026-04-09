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
import { useTranslations } from "next-intl";

export default function Home() {
  const t = useTranslations('dashboard');
  const tCommon = useTranslations('common');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { isSidebarOpen, setIsSidebarOpen } = useUI();
  const user = useQuery(api.users.getMe);
  const [greeting, setGreeting] = useState("welcome");

  useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 12) setGreeting("goodMorning");
    else if (hour < 17) setGreeting("goodAfternoon");
    else if (hour < 21) setGreeting("goodEvening");
    else setGreeting("goodNight");
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
            {tCommon(greeting)}{firstName ? `, ${firstName}` : ""}
          </h1>
          <p className="text-secondary text-[15px] font-light leading-relaxed">
            {t('heroDesc')}
          </p>
        </header>

        {/* User Interaction Guide */}
        <section className="bg-sidebar/40 backdrop-blur-3xl border border-border-dim rounded-[32px] p-8 flex flex-col gap-6 shadow-xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-96 h-96 bg-brand/10 rounded-full blur-[100px] pointer-events-none" />

          <div className="flex flex-col gap-1 z-10 relative">
            <span className="text-brand font-mono text-[11px] tracking-widest uppercase">{t('quickStart')}</span>
            <h2 className="text-xl font-light tracking-wide text-foreground">{t('exploreWorkspace')}</h2>
          </div>

          <div className="flex flex-col gap-4 z-10 relative">

            <div className="flex items-start gap-4 p-4 rounded-[16px] bg-foreground/[0.02] border border-border-dim/50 hover:bg-foreground/[0.04] transition-colors relative overflow-hidden">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-brand/10 flex items-center justify-center border border-brand/20 ml-2">
                <span className="text-brand font-mono text-[11px] font-bold">1</span>
              </div>
              <div className="flex flex-col gap-1.5 ml-2">
                <span className="text-foreground text-[14px] font-medium tracking-wide">{t('meetAssistant')}</span>
                <p className="text-secondary text-[13px] font-light">{t('meetAssistantDesc')}</p>
              </div>
            </div>

            <div className="flex items-start gap-4 p-4 rounded-[16px] bg-foreground/[0.02] border border-border-dim/50 hover:bg-foreground/[0.04] transition-colors">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-foreground/[0.05] flex items-center justify-center border border-border-dim">
                <span className="text-foreground font-mono text-[11px] font-bold">2</span>
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-foreground text-[14px] font-medium tracking-wide">{t('agenticTesting')}</span>
                <p className="text-secondary text-[13px] font-light">{t('agenticTestingDesc')}</p>
              </div>
            </div>

            <div className="flex items-start gap-4 p-4 rounded-[16px] bg-foreground/[0.02] border border-border-dim/50 hover:bg-foreground/[0.04] transition-colors">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-foreground/[0.05] flex items-center justify-center border border-border-dim">
                <span className="text-foreground font-mono text-[11px] font-bold">3</span>
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-foreground text-[14px] font-medium tracking-wide">{t('exploreKnowledge')}</span>
                <p className="text-secondary text-[13px] font-light">{t('exploreKnowledgeDesc')}</p>
              </div>
            </div>

          </div>
        </section>

        {/* Capabilities Grid */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-5">

          <div className="bg-sidebar/30 backdrop-blur-3xl border border-border-dim rounded-[24px] p-6 shadow-md transition-all hover:bg-sidebar/50">
            <h3 className="text-foreground text-[15px] font-medium tracking-wide mb-3">{t('relationshipContext')}</h3>
            <p className="text-secondary text-[13px] font-light leading-relaxed">{t('relationshipContextDesc')}</p>
          </div>

          <div className="bg-sidebar/30 backdrop-blur-3xl border border-border-dim rounded-[24px] p-6 shadow-md transition-all hover:bg-sidebar/50">
            <h3 className="text-foreground text-[15px] font-medium tracking-wide mb-3">{t('alwaysAvailable')}</h3>
            <p className="text-secondary text-[13px] font-light leading-relaxed">{t('alwaysAvailableDesc')}</p>
          </div>

          <div className="bg-sidebar/30 backdrop-blur-3xl border border-border-dim rounded-[24px] p-6 shadow-md transition-all hover:bg-sidebar/50">
            <h3 className="text-foreground text-[15px] font-medium tracking-wide mb-3">{t('security')}</h3>
            <p className="text-secondary text-[13px] font-light leading-relaxed">{t('securityDesc')}</p>
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
            {t.rich('intelLayer', { sonae: (chunks) => <span className="text-foreground font-medium">Sonae Intelligence</span> })}
          </p>
          <div className="p-4 rounded-xl bg-foreground/[0.03] border border-border-dim/50 flex flex-col gap-2">
            <span className="text-[11px] font-mono tracking-widest text-brand uppercase">{t('securityProtocol')}</span>
            <p className="text-[13px] text-secondary">{t('securityProtocolDesc')}</p>
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
