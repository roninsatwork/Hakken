import type { Translate } from "./types";

export type StarterKey = "summarise" | "draft" | "explain" | "plan";

export const STARTER_KEYS: readonly StarterKey[] = ["summarise", "draft", "explain", "plan"];

type AssistantHeroProps = {
  firstName: string;
  greeting: string;
  onPickStarter: (text: string) => void;
  t: Translate;
};

/**
 * The opening screen.
 *
 * It used to be a centred greeting and a line of filler over an empty
 * canvas. Now it is left-aligned to the same column as the composer, asks a
 * real question, and offers four ways in — clicking one loads it into the
 * input rather than sending it, so nothing happens without a deliberate
 * press.
 *
 * Behind it sits 備 at three per cent: the character the product is named
 * for, from the brand's own "prepared before the moment arrives". It is
 * decoration, so it is hidden from assistive technology.
 */
export function AssistantHero({ firstName, greeting, onPickStarter, t }: AssistantHeroProps) {
  return (
    <div className="relative w-full">
      <span
        aria-hidden="true"
        className="pointer-events-none select-none absolute -top-24 right-0 text-[210px] leading-none text-foreground opacity-[0.03] font-serif hidden lg:block"
      >
        備
      </span>

      <div className="relative flex flex-col gap-6">
        {/* Sizing matches the approved design exactly: 34px, 1.05 leading,
            light weight, tight tracking — with the eyebrow that names the
            brand's own idea of being prepared. */}
        <div className="flex flex-col gap-2">
          <span className="text-[9px] font-medium uppercase tracking-[0.24em] text-brand">
            {t("welcome.stamp")}
          </span>
          <h1 className="text-[34px] leading-[1.05] font-light tracking-[-0.035em] text-foreground">
            {greeting}
            {firstName ? `, ${firstName}` : ""}.
            <br />
            <span className="text-muted">{t("welcome.question")}</span>
          </h1>
        </div>

        <ul className="flex flex-col border-t border-border-dim">
          {STARTER_KEYS.map((key, index) => {
            const title = t(`welcome.starters.${key}.title`);
            return (
              <li key={key} className="border-b border-border-dim">
                <button
                  type="button"
                  onClick={() => onPickStarter(title)}
                  className="group flex w-full items-baseline gap-3.5 py-2.5 px-0.5 text-left transition-colors hover:bg-foreground/[0.02] focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2"
                >
                  <span className="w-4 flex-shrink-0 font-mono text-[10px] text-muted group-hover:text-brand transition-colors tabular-nums">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="text-[14px] text-foreground/90 group-hover:text-foreground transition-colors">
                    {title}
                  </span>
                  <span className="ml-auto pl-4 text-[12px] text-muted hidden sm:block">
                    {t(`welcome.starters.${key}.hint`)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
