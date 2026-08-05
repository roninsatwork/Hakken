/**
 * Lead-in to the demo panels. Deliberately short and left-aligned — the panels
 * that follow do the showing, so this only has to make the claim and get out of
 * the way. The per-demo build times live on each panel, not here.
 */
export function DemosIntro() {
  return (
    <section className="ps-demos-intro">
      <div className="ps-demos-intro-grid">
        <div>
          <span className="ps-eyebrow" data-reveal>
            Built on Sonae
          </span>
          <h2 className="ps-display ps-demos-intro-h2 mt-3" data-reveal>
            Four demos, pre-built in record time.
          </h2>
        </div>
        <p className="ps-demos-intro-lede" data-reveal>
          None of them were possible before Sonae existed. The foundations were
          already standing, so each demo only needed the part that makes it
          different.
        </p>
      </div>
    </section>
  );
}
