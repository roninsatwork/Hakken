import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import { ProductHero } from "./_components/home/ProductHero";
import { WhatSonaeIs } from "./_components/home/WhatSonaeIs";
import { DemosIntro } from "./_components/home/DemosIntro";
import { WhoItsFor } from "./_components/home/WhoItsFor";
import { ProductPanels } from "./_components/home/ProductPanels";
import { ContactLink } from "./_components/ContactLink";

export const metadata: Metadata = {
  title: "Sonae — Build agent-powered products with governance built in",
};

export default function HomePage() {
  return (
    <div>
      <ProductHero />

      <WhatSonaeIs />

      {/* template:remove:start properties */}
      <DemosIntro />
      <ProductPanels />
      {/* template:remove:end */}

      <WhoItsFor />

      <div className="mx-auto w-full max-w-[1180px] px-5 pt-28 sm:px-7">
        <div className="ps-story grid items-center gap-14 p-12 sm:p-16 md:grid-cols-[auto_1fr]" data-reveal>
          <div className="ps-kanji" data-speed="1.04">備え</div>
          <div className="relative">
            <div className="mb-4 text-[12px] uppercase tracking-[0.4em] text-[#8D7F6C]">so · na · e</div>
            <h2 className="ps-display text-[clamp(30px,4.2vw,48px)] leading-[1.06]">
              Prepared before the moment arrives.
            </h2>
            <p className="mt-4 max-w-[54ch] text-[15.5px] leading-relaxed text-[#B7AD9F]">
              Sonae is Japanese for preparedness — readiness in place before it
              is needed. That is why the name was chosen, and it is the whole
              idea: by the time your product needs knowledge, approvals, models
              and a memory, the foundation is already standing.
            </p>
          </div>
        </div>
      </div>

      <section className="px-5 pb-36 pt-32 text-center">
        <span className="ps-eyebrow" data-reveal>Thinking about an AI product?</span>
        <h2
          className="ps-display mx-auto mt-3 max-w-[18ch] text-[clamp(36px,5.6vw,64px)] leading-[1.03]"
          data-reveal
        >
          Tell us what you want to build. We&apos;ll show you how to get there quicker.
        </h2>
        <div className="mt-9 flex justify-center" data-reveal>
          <ContactLink className="ps-btn-primary group">
            <span>Get in touch</span>
            <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
          </ContactLink>
        </div>
      </section>
    </div>
  );
}
