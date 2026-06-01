import { Sparkles } from "lucide-react";

type AssistantHeroProps = {
  firstName: string;
  greeting: string;
  subtitle: string;
};

export function AssistantHero({ firstName, greeting, subtitle }: AssistantHeroProps) {
  return (
    <div className="flex flex-col items-center gap-6 z-10 w-full max-w-2xl text-center mb-[8vh] mt-[-10vh]">
      <div className="w-14 h-14 rounded-[18px] bg-brand/10 border border-brand/20 flex items-center justify-center shadow-2xl shadow-brand/20 backdrop-blur-3xl animate-pulse">
        <Sparkles className="w-6 h-6 text-brand" />
      </div>
      <h1 className="text-4xl sm:text-5xl font-light tracking-tight text-foreground drop-shadow-md">
        {greeting}
        {firstName ? `, ${firstName}` : ""}
      </h1>
      <p className="max-w-[500px] text-[15px] sm:text-[18px] text-muted font-light leading-relaxed">
        {subtitle}
      </p>
    </div>
  );
}
