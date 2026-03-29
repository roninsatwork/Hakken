"use client";

import { useState } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { motion } from "framer-motion";
import { Mail, ChevronRight, Loader2, ShieldCheck } from "lucide-react";

export default function LoginPage() {
  const { signIn } = useAuthActions();
  const [email, setEmail] = useState("");
  const [isSubmittingGoogle, setIsSubmittingGoogle] = useState(false);
  const [isSubmittingEmail, setIsSubmittingEmail] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  const handleGoogleSignIn = async () => {
    setIsSubmittingGoogle(true);
    await signIn("google", { redirectTo: "/app" });
  };

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setIsSubmittingEmail(true);
    try {
      await signIn("resend", { email });
      setEmailSent(true);
    } catch (err) {
      console.error(err);
      // In a real app we'd display an error modal.
    } finally {
      setIsSubmittingEmail(false);
    }
  };

  return (
    <div className="relative min-h-screen w-full flex items-center justify-center bg-background p-4 sm:p-8 overflow-hidden">
      
      {/* Dynamic Lighting Background */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute top-[20%] left-[20%] w-[40vw] h-[40vw] rounded-full bg-brand/5 blur-[120px]" />
        <div className="absolute bottom-[20%] right-[20%] w-[30vw] h-[30vw] rounded-full bg-foreground/5 blur-[100px]" />
      </div>

      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className="relative w-full max-w-md"
      >
        <div className="bg-sidebar/40 border border-border-dim rounded-[32px] p-8 sm:p-10 shadow-2xl backdrop-blur-2xl flex flex-col items-center">
          
          <div className="w-16 h-16 rounded-[20px] bg-foreground/5 border border-border-dim flex items-center justify-center mb-6 shadow-inner">
            <ShieldCheck className="w-8 h-8 text-brand" />
          </div>

          <h1 className="text-3xl font-light tracking-[0.12em] text-foreground mb-2 text-center">SONAE GATEWAY</h1>
          <p className="text-secondary text-center mb-8 text-[14px]">Secure access protocol. Invite-only infrastructure.</p>

          <button
            onClick={handleGoogleSignIn}
            disabled={isSubmittingGoogle || emailSent}
            className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-foreground text-background rounded-[16px] font-medium hover:bg-foreground/90 transition-all shadow-xl shadow-foreground/10 disabled:opacity-50 disabled:cursor-not-allowed group"
          >
            {isSubmittingGoogle ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                <span>Authenticate via Google</span>
              </>
            )}
          </button>

          <div className="w-full flex items-center gap-4 my-6 opacity-50">
            <div className="flex-1 h-px bg-border-dim" />
            <span className="text-[11px] uppercase tracking-widest text-secondary font-medium">OR</span>
            <div className="flex-1 h-px bg-border-dim" />
          </div>

          <form onSubmit={handleEmailSignIn} className="w-full flex flex-col gap-4">
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-secondary" />
              <input
                type="email"
                placeholder="Secure magic link..."
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={emailSent || isSubmittingEmail}
                className="w-full pl-12 pr-4 py-4 bg-background border border-border-dim rounded-[16px] text-foreground focus:border-brand/50 outline-none transition-all placeholder:text-muted"
                required
              />
            </div>
            <button
              type="submit"
              disabled={isSubmittingEmail || emailSent}
              className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-sidebar/50 border border-border-dim text-foreground rounded-[16px] font-medium hover:bg-background transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmittingEmail ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : emailSent ? (
                <span>Link Dispatched! Check inbox.</span>
              ) : (
                <>
                  <span>Dispatch Link</span>
                  <ChevronRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

        </div>
      </motion.div>
    </div>
  );
}
