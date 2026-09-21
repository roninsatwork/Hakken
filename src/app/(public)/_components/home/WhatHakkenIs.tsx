"use client";

import { useEffect, useRef, useState } from "react";
import { ensureGsap, prefersReducedMotion } from "../../_motion/motion";

/**
 * The elaboration beat: the hero introduces Hakken, this section says what it
 * actually is. A thesis on the left, the detail passing it on the right, and a
 * counter tracking which part is being read.
 *
 * Deliberately set as an editorial list on hairlines rather than cards — every
 * other section on this page is made of boxes, and this one carries the reading.
 */
const PARTS = [
  {
    title: "Launch AI products faster",
    body: "Hakken gives you the platform foundations upfront: workspaces, knowledge ingestion, model routing, assistants, agents, workflows, APIs, webhooks and embedded widgets. That means you can spend your time building the product experience, not rebuilding the AI infrastructure underneath it.",
  },
  {
    title: "Stay in control as AI does more",
    body: "As AI moves from answering questions to taking action, Hakken keeps control in the system. Tools, workflows and agents can be governed with permissions, approval steps, tenant boundaries, schemas, rules and human review before anything sensitive happens.",
  },
  {
    title: "Improve AI without guessing",
    body: "Hakken gives you evals, smoke tests, replay, release gates, memory review, reflections and improvement suggestions. You can see what worked, what failed, what should become a test, what should be remembered, and what should never happen again.",
  },
  {
    title: "Use the right model for the job",
    body: "Hakken is model agnostic. It can sit across many providers and hundreds of models, with administrators controlling defaults, capabilities, pricing and use cases from one place. The product is not trapped inside one AI vendor’s limits.",
  },
  {
    title: "Know what it costs and what happened",
    body: "Hakken makes production AI visible. Operators can see runs, failures, approvals, tool calls, model usage, token usage, latency, provider health, quotas and cost. Spend can be capped, problems can be investigated, and AI stops being a black box.",
  },
];

export function WhatHakkenIs() {
  const rootRef = useRef<HTMLElement>(null);
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    const root = rootRef.current;
    if (!root) return;
    const { gsap, ScrollTrigger } = ensureGsap();

    const ctx = gsap.context(() => {
      gsap.utils.toArray<HTMLElement>("[data-part]").forEach((row, i) => {
        ScrollTrigger.create({
          trigger: row,
          start: "top 62%",
          end: "bottom 38%",
          onEnter: () => setActive(i),
          onEnterBack: () => setActive(i),
        });
      });
    }, root);
    return () => ctx.revert();
  }, []);

  return (
    <section ref={rootRef} className="ps-what">
      <div className="ps-what-grid">
        {/* the thesis */}
        <div className="ps-what-thesis">
          <div className="ps-what-thesis-inner">
            <span className="ps-eyebrow" data-reveal>
              What Hakken is
            </span>
            <h2 className="ps-display ps-what-h2 mt-3" data-reveal>
              The production layer behind AI products.
            </h2>
            <p className="ps-what-lede mt-5" data-reveal>
              Hakken gives you the parts every serious AI product needs before it
              can be trusted in the real world: knowledge, models, agents, evals,
              memory, approvals, workflows, observability and cost control.
            </p>
            <p className="ps-what-lede mt-4" data-reveal>
              So you do not start from a blank page. You start with the hard half
              already built.
            </p>
            <div className="ps-what-count mt-10" data-reveal>
              <span className="ps-what-count-now">
                {String(active + 1).padStart(2, "0")}
              </span>
              <span className="ps-what-count-rule" aria-hidden>
                <i style={{ width: `${((active + 1) / PARTS.length) * 100}%` }} />
              </span>
              <span className="ps-what-count-all">
                {String(PARTS.length).padStart(2, "0")}
              </span>
            </div>
          </div>
        </div>

        {/* the detail, passing it */}
        <ol className="ps-what-list">
          {PARTS.map((part, i) => (
            <li
              key={part.title}
              data-part
              data-reveal
              className="ps-what-row"
              data-current={i === active}
            >
              <span className="ps-what-num">{String(i + 1).padStart(2, "0")}</span>
              <div>
                <h3 className="ps-what-row-title">{part.title}</h3>
                <p className="ps-what-row-body">{part.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
