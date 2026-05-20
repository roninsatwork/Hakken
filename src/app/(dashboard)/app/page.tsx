"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";

import SonaeModal from "@/src/ui/components/feedback/SonaeModal";
import Header from "@/src/ui/components/layout/Header";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";

export default function Home() {
  const t = useTranslations('dashboard');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const user = useQuery(api.users.getMe);
  const [greeting, setGreeting] = useState("welcome");

  useEffect(() => {
    if (user && user.role === "SUPER_ADMIN") {
      const redirected = sessionStorage.getItem("admin_redirected");
      if (!redirected) {
        sessionStorage.setItem("admin_redirected", "true");
        router.push("/admin");
      }
    }
  }, [user, router]);

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
        <header className="flex flex-col gap-3">
          <h1 className="text-3xl font-light text-foreground tracking-[0.08em] font-sans">
            {tCommon(greeting)}{firstName ? `, ${firstName}` : ""}
          </h1>
        </header>

        {/* User Interaction Guide -> Redesigned into high fidelity Welcome Blueprint Card */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ 
            opacity: 1, 
            y: 0,
            boxShadow: [
              "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
              "0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 12px 24px -8px rgba(0, 0, 0, 0.15)",
              "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)"
            ]
          }}
          transition={{ 
            opacity: { duration: 0.8 },
            y: { duration: 0.8 },
            boxShadow: {
              repeat: Infinity,
              duration: 8,
              ease: "easeInOut"
            }
          }}
          className="bg-sidebar/40 backdrop-blur-3xl border border-border-dim rounded-[32px] p-8 md:p-10 flex flex-col gap-6 relative overflow-hidden group"
        >
          {/* Ambient Lighting Accents */}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.03),transparent_45%)] pointer-events-none" />
          <div className="absolute top-0 right-0 w-96 h-96 bg-brand/5 rounded-full blur-[120px] pointer-events-none" />

          <div className="flex flex-col gap-2 z-10 relative">
            <span className="text-brand font-mono text-[11px] tracking-[0.2em] uppercase font-medium">
              {t('blueprintLabel')}
            </span>
            <h2 className="text-2xl font-light tracking-[0.08em] text-foreground font-sans mt-1">
              {t('blueprintTitle')}
            </h2>
          </div>

          <div className="z-10 relative flex flex-col gap-6">
            <p className="text-secondary text-[15px] font-light leading-relaxed">
              {t('blueprintBody')}
            </p>

            <div className="pt-2">
              <button
                onClick={() => router.push("/app/assistant")}
                className="inline-flex items-center gap-2.5 justify-center bg-foreground/[0.03] hover:bg-foreground/[0.08] text-foreground border border-border-dim/85 text-[14px] font-medium tracking-[0.1em] px-8 py-3.5 rounded-full backdrop-blur-md transition-all duration-300 hover:scale-[1.02] shadow-sm hover:shadow-md group/btn"
              >
                <span>{t('exploreButton')}</span>
                <ArrowRight className="w-4 h-4 text-secondary group-hover/btn:translate-x-1 group-hover/btn:text-foreground transition-all duration-300" />
              </button>
            </div>
          </div>
        </motion.section>
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

