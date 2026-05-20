"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  User,
  Settings,
  LogOut,
  ChevronDown,
  Sidebar,
  ShieldCheck,
  ChevronsUpDown
} from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useAuthActions } from "@convex-dev/auth/react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import Link from "next/link";
import { useUI } from "@/src/context/UIContext";
import { useTranslations } from "next-intl";

interface HeaderProps {
  onOpenModal?: () => void;
}

export default function Header({ onOpenModal }: HeaderProps) {
  const t = useTranslations('header');
  const tc = useTranslations('common');
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [hasNotifications, setHasNotifications] = useState(true);
  const { isSidebarOpen, setIsSidebarOpen } = useUI();
  const pathname = usePathname();
  const router = useRouter();
  const { signOut } = useAuthActions();
  const isAdmin = pathname.startsWith('/admin');

  const user = useQuery(api.users.getMe);
  const recordLogin = useMutation(api.users.recordLogin);
  const recordLogout = useMutation(api.users.recordLogout);
  const impersonateCompany = useMutation(api.users.impersonateCompany);
  const profileRef = useRef<HTMLDivElement>(null);

  const handleExitWorkspace = async () => {
    await impersonateCompany({ companyId: undefined });
    router.push("/admin/companies");
  };

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setIsProfileOpen(false);
      }
    }
    if (isProfileOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isProfileOpen]);

  useEffect(() => {
    if (user && !sessionStorage.getItem("login_tracked")) {
      sessionStorage.setItem("login_tracked", "true");
      fetch("https://ipapi.co/json/")
        .then(res => res.json())
        .then(data => {
          recordLogin({
            device: navigator.userAgent,
            ip: data.ip || "Unknown IP",
            location: data.city ? `${data.city}, ${data.country_name}` : "Unknown Location"
          });
        })
        .catch(() => {
          recordLogin({
            device: navigator.userAgent,
            ip: "Concealed IP",
            location: "Unknown Location"
          });
        });
    }
  }, [user, recordLogin]);

  const handleLogout = async () => {
    setIsProfileOpen(false);
    sessionStorage.removeItem("login_tracked");
    try {
      await recordLogout();
      await signOut();
    } finally {
      // Use hard browser navigation instead of router.push() to ensure the redirect happens
      // even if sudden loss of Convex auth triggers a React client-side exception in deep admin pages
      window.location.href = "/";
    }
  };

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
              <span>{t('adminOverview')}</span>
            </>
          ) : (
            <>
              <LayoutDashboard className="w-[18px] h-[18px] opacity-80" />
              <span>{tc('dashboard')}</span>
            </>
          )}
        </div>

      </nav>

      {/* Profile & Utility Actions */}
      <div className="flex items-center gap-6">

        {/* Utility Group */}
        {user?.role === "SUPER_ADMIN" && user?.companyId ? (
          <>
            <div className="flex items-center gap-3">
              <button
                onClick={handleExitWorkspace}
                className="relative w-11 h-11 flex items-center justify-center rounded-[14px] bg-red-500/5 backdrop-blur-3xl border border-red-500/20 hover:text-red-400 hover:bg-red-500/10 text-red-500/80 transition-all group overflow-visible"
              >
                <LogOut className="w-5 h-5 z-10" />
                <div className="absolute inset-0 bg-radial-at-tl from-red-500/10 to-transparent pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity rounded-[14px] overflow-hidden" />

                {/* Tooltip */}
                <div className="absolute top-full mt-2 opacity-0 group-hover:opacity-100 transition-all duration-200 pointer-events-none z-50 translate-y-2 group-hover:translate-y-0">
                  <div className="bg-card dark:bg-[#1a1a1c] border border-border-dim text-[11px] font-medium text-foreground px-3 py-1.5 rounded-[8px] whitespace-nowrap shadow-xl">
                    {t('exitWorkspace')}
                  </div>
                </div>
              </button>
            </div>
            <div className="h-8 w-px bg-border-dim/50 ml-2" />
          </>
        ) : null}

        <div className="relative" ref={profileRef}>
          <button
            onClick={() => setIsProfileOpen(!isProfileOpen)}
            className="flex items-center gap-4 p-1 rounded-full hover:bg-foreground/5 transition-colors group"
          >
            <div className="relative">
              <img
                src={user?.image || "https://api.dicebear.com/7.x/notionists/svg?seed=Aman"}
                alt={user?.name || "Aman"}
                className="w-10 h-10 rounded-full bg-sidebar border border-border-dim group-hover:border-foreground/20 transition-all object-cover"
              />
              <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-[#10b981] border-2 border-[#161616] rounded-full" />
            </div>

            <div className="flex flex-col items-start min-w-[120px]">
              <span className="text-[15px] font-light text-foreground tracking-[0.12em] leading-tight">{user?.name || tc('loading')}</span>
              <span className="text-[12px] text-secondary/70 font-normal">{user?.email || tc('authenticating')}</span>
            </div>

            <ChevronsUpDown className={`w-4 h-4 text-secondary/50 group-hover:text-secondary transition-colors transition-transform duration-300 ${isProfileOpen ? 'scale-y-[-1]' : ''}`} />
          </button>

          {/* Profile Dropdown */}
          <AnimatePresence>
            {isProfileOpen && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="absolute right-0 top-full mt-4 w-52 bg-card border border-border-dim rounded-[24px] shadow-[0_10px_40px_rgba(0,0,0,0.8)] z-[999] overflow-hidden"
              >
                <div className="p-2 flex flex-col gap-0.5">
                  <Link
                    href="/app/profile"
                    onClick={() => setIsProfileOpen(false)}
                    className="flex items-center gap-3 w-full px-3 py-2 rounded-[10px] text-[13px] text-secondary hover:text-foreground hover:bg-foreground/5 transition-all text-left"
                  >
                    <User className="w-4 h-4" />
                    <span>{tc('profile')}</span>
                  </Link>

                  <Link
                    href="/app"
                    onClick={() => setIsProfileOpen(false)}
                    className="flex items-center gap-3 w-full px-3 py-2 rounded-[10px] text-[13px] text-secondary hover:text-foreground hover:bg-foreground/5 transition-all text-left"
                  >
                    <LayoutDashboard className="w-4 h-4" />
                    <span>{tc('dashboard')}</span>
                  </Link>

                  <Link
                    href="/admin"
                    onClick={() => setIsProfileOpen(false)}
                    className="flex items-center gap-3 w-full px-3 py-2 rounded-[10px] text-[13px] text-secondary hover:text-foreground hover:bg-foreground/5 transition-all text-left"
                  >
                    <Settings className="w-4 h-4" />
                    <span>{tc('admin')}</span>
                  </Link>

                  <div className="h-px bg-border-dim my-1 mx-2" />

                  <button
                    onClick={handleLogout}
                    className="flex items-center gap-3 w-full px-3 py-2 rounded-[10px] text-[13px] text-[#f43f5e] hover:bg-[#f43f5e]/10 transition-all text-left font-medium"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>{tc('logout')}</span>
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  );
}
