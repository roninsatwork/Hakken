"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Bot,
  Building2,
  CheckCircle2,
  Cloud,
  FileSearch,
  Gauge,
  Globe2,
  LineChart,
  LockKeyhole,
  MessageSquareText,
  Server,
  ShieldCheck,
  Sparkles,
  Users,
  WalletCards,
  Workflow,
} from "lucide-react";

import SonaeModal from "@/src/ui/components/feedback/SonaeModal";
import Header from "@/src/ui/components/layout/Header";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";

const highlights = [
  { key: "answers", icon: MessageSquareText },
  { key: "knowledge", icon: FileSearch },
  { key: "control", icon: ShieldCheck },
  { key: "growth", icon: Gauge },
] as const;

const features = [
  { key: "assistant", icon: Bot },
  { key: "knowledge", icon: FileSearch },
  { key: "workflows", icon: Workflow },
  { key: "widget", icon: Globe2 },
  { key: "reports", icon: LineChart },
  { key: "admin", icon: Building2 },
] as const;

const benefits = [
  { key: "faster", icon: Sparkles },
  { key: "safer", icon: LockKeyhole },
  { key: "clearer", icon: WalletCards },
  { key: "together", icon: Users },
] as const;

const platformDepth = [
  "models",
  "safety",
  "privacy",
  "testing",
  "observability",
  "costs",
  "workflows",
  "widgets",
] as const;

const hostingOptions = [
  { key: "googleCloud", icon: Cloud },
  { key: "aws", icon: Server },
  { key: "azure", icon: Globe2 },
] as const;

const assurance = [
  "unit",
  "security",
  "ui",
  "regression",
  "backend",
  "drift",
] as const;

const governance = [
  "tenancy",
  "roles",
  "pii",
  "tools",
  "audit",
  "health",
] as const;

export default function Home() {
  const t = useTranslations('dashboard');
  const router = useRouter();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const user = useQuery(api.users.getMe);

  useEffect(() => {
    if (user && user.role === "SUPER_ADMIN") {
      const redirected = sessionStorage.getItem("admin_redirected");
      if (!redirected) {
        sessionStorage.setItem("admin_redirected", "true");
        router.push("/admin");
      }
    }
  }, [user, router]);

  return (
    <div className="flex flex-col pb-12">
      <Header onOpenModal={() => setIsModalOpen(true)} />

      <div className="flex flex-col gap-8">
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
          className="bg-sidebar/40 backdrop-blur-3xl border border-border-dim rounded-[32px] p-8 md:p-10 lg:p-12 flex flex-col gap-8 relative overflow-hidden shadow-2xl"
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.08),transparent_38%),linear-gradient(135deg,rgba(255,255,255,0.04),rgba(255,255,255,0)_60%)] pointer-events-none" />

          <div className="relative z-10 grid gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-end">
            <div className="flex flex-col gap-6">
              <div className="flex flex-col gap-3">
                <span className="text-brand font-mono text-[12px] tracking-[0.16em] uppercase font-medium">
                  {t("hero.eyebrow")}
                </span>
                <h2 className="text-4xl md:text-5xl lg:text-6xl font-light tracking-[0.04em] text-foreground font-sans leading-tight">
                  {t("hero.title")}
                </h2>
              </div>
              <p className="text-secondary text-[16px] md:text-[17px] font-light leading-relaxed max-w-3xl">
                {t("hero.body")}
              </p>
              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <button
                  onClick={() => router.push("/app/assistant")}
                  className="inline-flex items-center gap-2.5 justify-center bg-foreground text-background hover:opacity-90 text-[14px] font-bold tracking-[0.08em] px-6 py-3.5 rounded-full transition-all duration-300 hover:scale-[1.02] shadow-lg"
                >
                  <span>{t("hero.primaryAction")}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setIsModalOpen(true)}
                  className="inline-flex items-center gap-2.5 justify-center bg-foreground/[0.04] hover:bg-foreground/[0.08] text-foreground border border-border-dim/85 text-[14px] font-medium tracking-[0.08em] px-6 py-3.5 rounded-full backdrop-blur-md transition-all duration-300"
                >
                  <span>{t("hero.secondaryAction")}</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {highlights.map(({ key, icon: Icon }, index) => (
                <motion.div
                  key={key}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15 + index * 0.06 }}
                  className="min-h-[138px] rounded-[22px] border border-border-dim bg-foreground/[0.035] p-5 flex flex-col justify-between"
                >
                  <Icon className="w-5 h-5 text-brand" />
                  <div className="flex flex-col gap-1">
                    <span className="text-2xl font-light text-foreground tracking-[0.04em]">
                      {t(`hero.highlights.${key}.value`)}
                    </span>
                    <span className="text-[13px] leading-relaxed text-secondary">
                      {t(`hero.highlights.${key}.label`)}
                    </span>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {features.map(({ key, icon: Icon }, index) => (
            <motion.article
              key={key}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08 * index }}
              className="min-h-[210px] rounded-[24px] border border-border-dim bg-sidebar/35 backdrop-blur-2xl p-6 flex flex-col gap-5 shadow-sm"
            >
              <div className="w-11 h-11 rounded-[16px] border border-border-dim bg-foreground/[0.04] flex items-center justify-center">
                <Icon className="w-5 h-5 text-brand" />
              </div>
              <div className="flex flex-col gap-3">
                <h3 className="text-[18px] font-medium tracking-[0.04em] text-foreground">
                  {t(`features.${key}.title`)}
                </h3>
                <p className="text-[15px] leading-relaxed text-secondary">
                  {t(`features.${key}.body`)}
                </p>
              </div>
            </motion.article>
          ))}
        </section>

        <section className="rounded-[28px] border border-border-dim bg-sidebar/35 backdrop-blur-2xl p-7 md:p-8 flex flex-col gap-6">
          <div className="flex flex-col gap-3 max-w-4xl">
            <span className="text-brand font-mono text-[12px] tracking-[0.16em] uppercase font-medium">
              {t("platformDepth.eyebrow")}
            </span>
            <h2 className="text-2xl md:text-3xl font-light tracking-[0.05em] text-foreground">
              {t("platformDepth.title")}
            </h2>
            <p className="text-[15px] leading-relaxed text-secondary">
              {t("platformDepth.body")}
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {platformDepth.map((key) => (
              <div key={key} className="rounded-[18px] border border-border-dim bg-foreground/[0.025] p-5 flex gap-4 items-start">
                <CheckCircle2 className="w-5 h-5 text-brand shrink-0 mt-0.5" />
                <div className="flex flex-col gap-2">
                  <h3 className="text-[15px] font-medium tracking-[0.03em] text-foreground">
                    {t(`platformDepth.items.${key}.title`)}
                  </h3>
                  <p className="text-[14px] leading-relaxed text-secondary">
                    {t(`platformDepth.items.${key}.body`)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-[28px] border border-border-dim bg-sidebar/35 backdrop-blur-2xl p-7 md:p-8 flex flex-col gap-6">
          <div className="flex flex-col gap-3 max-w-4xl">
            <span className="text-brand font-mono text-[12px] tracking-[0.16em] uppercase font-medium">
              {t("hosting.eyebrow")}
            </span>
            <h2 className="text-2xl md:text-3xl font-light tracking-[0.05em] text-foreground">
              {t("hosting.title")}
            </h2>
            <p className="text-[15px] leading-relaxed text-secondary">
              {t("hosting.body")}
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            {hostingOptions.map(({ key, icon: Icon }) => (
              <div key={key} className="rounded-[20px] border border-border-dim bg-foreground/[0.025] p-5 flex flex-col gap-4">
                <div className="w-10 h-10 rounded-[14px] border border-border-dim bg-sidebar/45 flex items-center justify-center">
                  <Icon className="w-5 h-5 text-brand" />
                </div>
                <div className="flex flex-col gap-2">
                  <h3 className="text-[16px] font-medium tracking-[0.03em] text-foreground">
                    {t(`hosting.items.${key}.title`)}
                  </h3>
                  <p className="text-[14px] leading-relaxed text-secondary">
                    {t(`hosting.items.${key}.body`)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-[28px] border border-border-dim bg-sidebar/35 backdrop-blur-2xl p-7 md:p-8 flex flex-col gap-6">
          <div className="grid gap-6 xl:grid-cols-[0.75fr_1.25fr] xl:items-start">
            <div className="flex flex-col gap-4">
              <span className="text-brand font-mono text-[12px] tracking-[0.16em] uppercase font-medium">
                {t("assurance.eyebrow")}
              </span>
              <h2 className="text-2xl md:text-3xl font-light tracking-[0.05em] text-foreground">
                {t("assurance.title")}
              </h2>
              <p className="text-[15px] leading-relaxed text-secondary">
                {t("assurance.body")}
              </p>
              <div className="rounded-[20px] border border-border-dim bg-foreground/[0.03] p-5 flex flex-col gap-2">
                <span className="text-[13px] font-mono tracking-[0.12em] uppercase text-brand">
                  {t("assurance.proofLabel")}
                </span>
                <p className="text-[14px] leading-relaxed text-secondary">
                  {t("assurance.proofBody")}
                </p>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              {assurance.map((key) => (
                <div key={key} className="rounded-[18px] border border-border-dim bg-foreground/[0.025] p-5 flex flex-col gap-3">
                  <CheckCircle2 className="w-5 h-5 text-brand" />
                  <div className="flex flex-col gap-2">
                    <h3 className="text-[15px] font-medium tracking-[0.03em] text-foreground">
                      {t(`assurance.items.${key}.title`)}
                    </h3>
                    <p className="text-[14px] leading-relaxed text-secondary">
                      {t(`assurance.items.${key}.body`)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
          <div className="rounded-[28px] border border-border-dim bg-sidebar/35 backdrop-blur-2xl p-7 md:p-8 flex flex-col gap-5">
            <span className="text-brand font-mono text-[12px] tracking-[0.16em] uppercase font-medium">
              {t("benefits.eyebrow")}
            </span>
            <div className="flex flex-col gap-3">
              <h2 className="text-2xl md:text-3xl font-light tracking-[0.05em] text-foreground">
                {t("benefits.title")}
              </h2>
              <p className="text-[15px] leading-relaxed text-secondary">
                {t("benefits.body")}
              </p>
            </div>
            <button
              onClick={() => router.push(user?.role === "SUPER_ADMIN" ? "/admin/ai/usage/costs" : "/app/reports")}
              className="mt-auto inline-flex items-center gap-2.5 justify-center w-fit bg-foreground/[0.04] hover:bg-foreground/[0.08] text-foreground border border-border-dim/85 text-[14px] font-medium tracking-[0.08em] px-5 py-3 rounded-full transition-all duration-300"
            >
              <span>{t("benefits.action")}</span>
              <ArrowRight className="w-4 h-4 text-secondary" />
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {benefits.map(({ key, icon: Icon }, index) => (
              <motion.div
                key={key}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.08 * index }}
                className="rounded-[22px] border border-border-dim bg-foreground/[0.025] p-5 flex gap-4 items-start"
              >
                <div className="w-10 h-10 rounded-[14px] border border-border-dim bg-sidebar/45 flex items-center justify-center shrink-0">
                  <Icon className="w-5 h-5 text-brand" />
                </div>
                <div className="flex flex-col gap-2">
                  <h3 className="text-[15px] font-medium tracking-[0.04em] text-foreground">
                    {t(`benefits.items.${key}.title`)}
                  </h3>
                  <p className="text-[14px] leading-relaxed text-secondary">
                    {t(`benefits.items.${key}.body`)}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </section>

        <section className="rounded-[28px] border border-border-dim bg-sidebar/35 backdrop-blur-2xl p-7 md:p-8 flex flex-col gap-6">
          <div className="flex flex-col gap-3 max-w-4xl">
            <span className="text-brand font-mono text-[12px] tracking-[0.16em] uppercase font-medium">
              {t("governance.eyebrow")}
            </span>
            <h2 className="text-2xl md:text-3xl font-light tracking-[0.05em] text-foreground">
              {t("governance.title")}
            </h2>
            <p className="text-[15px] leading-relaxed text-secondary">
              {t("governance.body")}
            </p>
          </div>

          <div className="grid gap-3 lg:grid-cols-3">
            {governance.map((key) => (
              <div key={key} className="rounded-[20px] border border-border-dim bg-foreground/[0.025] p-5 flex flex-col gap-4">
                <div className="w-9 h-9 rounded-[12px] border border-border-dim bg-sidebar/45 flex items-center justify-center">
                  <ShieldCheck className="w-4 h-4 text-brand" />
                </div>
                <div className="flex flex-col gap-2">
                  <h3 className="text-[15px] font-medium tracking-[0.03em] text-foreground">
                    {t(`governance.items.${key}.title`)}
                  </h3>
                  <p className="text-[14px] leading-relaxed text-secondary">
                    {t(`governance.items.${key}.body`)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-[28px] border border-border-dim bg-sidebar/35 backdrop-blur-2xl p-7 md:p-8 flex flex-col gap-6">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-5">
            <div className="flex flex-col gap-3 max-w-3xl">
              <span className="text-brand font-mono text-[12px] tracking-[0.16em] uppercase font-medium">
                {t("useCases.eyebrow")}
              </span>
              <h2 className="text-2xl md:text-3xl font-light tracking-[0.05em] text-foreground">
                {t("useCases.title")}
              </h2>
            </div>
            <button
              onClick={() => router.push("/app/assistant")}
              className="inline-flex items-center gap-2.5 justify-center w-fit bg-foreground/[0.04] hover:bg-foreground/[0.08] text-foreground border border-border-dim/85 text-[14px] font-medium tracking-[0.08em] px-5 py-3 rounded-full transition-all duration-300"
            >
              <span>{t("useCases.action")}</span>
              <ArrowRight className="w-4 h-4 text-secondary" />
            </button>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            {["sales", "customers", "teams"].map((key) => (
              <div key={key} className="rounded-[20px] border border-border-dim bg-foreground/[0.025] p-5 flex flex-col gap-4">
                <CheckCircle2 className="w-5 h-5 text-brand" />
                <div className="flex flex-col gap-2">
                  <h3 className="text-[15px] font-medium tracking-[0.04em] text-foreground">
                    {t(`useCases.items.${key}.title`)}
                  </h3>
                  <p className="text-[14px] leading-relaxed text-secondary">
                    {t(`useCases.items.${key}.body`)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <SonaeModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={t("modal.title")}
      >
        <div className="flex flex-col gap-4">
          <p className="text-secondary text-[15px] leading-relaxed">
            {t("modal.body")}
          </p>
          <div className="p-4 rounded-xl bg-foreground/[0.03] border border-border-dim/50 flex flex-col gap-2">
            <span className="text-[12px] font-mono tracking-[0.14em] text-brand uppercase">{t("modal.pointTitle")}</span>
            <p className="text-[14px] leading-relaxed text-secondary">{t("modal.pointBody")}</p>
          </div>
          <div className="mt-4 flex justify-end">
            <button
              onClick={() => setIsModalOpen(false)}
              className="bg-foreground text-background text-[14px] font-bold px-6 py-2.5 rounded-full hover:opacity-90 transition-opacity"
            >
              {t("modal.close")}
            </button>
          </div>
        </div>
      </SonaeModal>
    </div>
  );
}
