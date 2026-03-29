import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";

export default function LandingPage() {
  return (
    <div className="relative min-h-screen w-full bg-background flex flex-col items-center justify-center overflow-hidden">
      {/* Background Lighting */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[60vw] h-[60vw] rounded-full bg-brand/5 blur-[150px] pointer-events-none" />
      <div className="absolute top-0 right-0 w-[40vw] h-[40vw] rounded-full bg-foreground/5 blur-[120px] pointer-events-none" />

      {/* Navigation Bar */}
      <header className="absolute top-0 w-full flex items-center justify-between p-6 sm:p-10 z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-[10px] bg-brand flex items-center justify-center shadow-lg shadow-brand/20">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <span className="text-xl font-light tracking-[0.2em] uppercase text-foreground">Sonae</span>
        </div>
        <Link 
          href="/login" 
          className="px-6 py-2.5 rounded-full bg-sidebar/50 border border-border-dim text-[13px] font-medium text-foreground hover:bg-foreground hover:text-background transition-all backdrop-blur-md"
        >
          Secure Access
        </Link>
      </header>

      {/* Hero Content */}
      <main className="relative z-10 flex flex-col items-center text-center px-4 max-w-4xl">
        <div className="mb-8 px-4 py-1.5 rounded-full border border-brand/30 bg-brand/5 backdrop-blur-md flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-brand animate-pulse" />
          <span className="text-[12px] font-medium text-brand tracking-widest uppercase">Protocol Online</span>
        </div>
        
        <h1 className="text-5xl sm:text-7xl font-light tracking-tight text-foreground leading-[1.1] mb-6">
          The Living Dossier for <br />
          <span className="font-semibold bg-gradient-to-r from-foreground via-foreground/80 to-brand bg-clip-text text-transparent">Relationship Intelligence</span>
        </h1>
        
        <p className="text-lg sm:text-xl text-secondary max-w-2xl mb-12 font-light leading-relaxed">
          An invite-only infrastructure designed to catalogue, measure, and scale high-value network protocols across the Ronins ecosystem.
        </p>

        <Link 
          href="/login"
          className="group relative flex items-center gap-3 px-8 py-4 bg-foreground text-background rounded-[20px] font-medium hover:bg-foreground/90 transition-all shadow-2xl shadow-foreground/20 hover:scale-[1.02]"
        >
          <span className="text-[15px] tracking-wide relative z-10">Initialize Session</span>
          <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform relative z-10" />
        </Link>
      </main>

      {/* Footer */}
      <footer className="absolute bottom-6 w-full text-center z-10">
        <p className="text-[11px] text-muted tracking-widest uppercase">© {new Date().getFullYear()} Ronins Group Ltd. All rights reserved.</p>
      </footer>
    </div>
  );
}
