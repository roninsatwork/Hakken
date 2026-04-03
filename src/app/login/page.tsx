"use client";

import { useState } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { motion, AnimatePresence } from "framer-motion";
import { Mail, ChevronRight, Loader2, ShieldCheck, CheckCircle2 } from "lucide-react";
import { FluidBackground } from "../../ui/components/layout/FluidBackground";

export default function LoginPage() {
  const { signIn } = useAuthActions();
  const [email, setEmail] = useState("");
  const [isSubmittingEmail, setIsSubmittingEmail] = useState(false);
  const [isSubmittingGoogle, setIsSubmittingGoogle] = useState(false);
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
    } catch (e) {
      // Fail silently to thwart user enumeration attacks
      console.debug("Auth action processed.");
    } finally {
      setIsSubmittingEmail(false);
      setEmailSent(true);
    }
  };

  return (
    <div className="relative min-h-screen w-full flex items-center justify-center bg-background p-4 sm:p-8 overflow-hidden">
      
      {/* The Interactive Living Aura Layer */}
      <FluidBackground />

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

          <h1 className="text-3xl font-light tracking-[0.12em] text-foreground mb-2 text-center">
            SONAE
          </h1>
          <p className="text-secondary text-center mb-8 text-[12px] font-medium tracking-[0.2em] uppercase">
            To Be Prepared
          </p>

          <AnimatePresence mode="wait">
            {!emailSent ? (
              <motion.form 
                key="form"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="w-full flex flex-col gap-4"
                onSubmit={handleEmailSignIn}
              >
                <div className="relative w-full">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-secondary pointer-events-none" />
                  <input
                    type="email"
                    required
                    placeholder="Enter your email address"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-background border border-border-dim focus:border-brand/50 rounded-[16px] pl-12 pr-4 py-4 text-[15px] text-foreground outline-none transition-all placeholder:text-secondary focus:ring-4 focus:ring-brand/10"
                  />
                </div>
                
                <button
                  type="submit"
                  disabled={isSubmittingEmail || !email}
                  className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-foreground text-background rounded-[16px] font-medium hover:bg-foreground/90 transition-all shadow-xl shadow-foreground/20 disabled:opacity-50 disabled:cursor-not-allowed group border border-foreground/10"
                >
                  {isSubmittingEmail ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      <span>Send Magic Link</span>
                      <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                    </>
                  )}
                </button>

                <div className="flex items-center gap-4 my-2">
                  <div className="flex-1 h-px bg-border-dim"></div>
                  <span className="text-[11px] text-muted tracking-widest uppercase">Or</span>
                  <div className="flex-1 h-px bg-border-dim"></div>
                </div>

                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  disabled={isSubmittingGoogle}
                  className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-background border border-border-dim text-foreground rounded-[16px] font-medium hover:bg-foreground/5 transition-all shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed group"
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
                      <span>Continue with Google</span>
                    </>
                  )}
                </button>
              </motion.form>
            ) : (
              <motion.div
                key="success"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="w-full flex flex-col items-center text-center py-4"
              >
                <div className="w-16 h-16 rounded-full bg-brand/10 border border-brand/20 flex items-center justify-center mb-6">
                  <CheckCircle2 className="w-8 h-8 text-brand" />
                </div>
                <h3 className="text-xl font-medium text-foreground mb-2">Thank you</h3>
                <p className="text-[15px] text-secondary leading-relaxed max-w-[280px]">
                  If your account is registered with us, a secure magic link will be sent to <strong className="text-foreground">{email}</strong>.
                </p>
                <button
                  type="button"
                  onClick={() => setEmailSent(false)}
                  className="mt-8 text-[13px] text-brand hover:text-brand/80 transition-colors underline underline-offset-4"
                >
                  Try a different email address
                </button>
              </motion.div>
            )}
          </AnimatePresence>

        </div>
      </motion.div>
    </div>
  );
}
