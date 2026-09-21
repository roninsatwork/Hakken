import { Check } from "lucide-react";

/**
 * Who it's for, argued through where the money goes.
 *
 * The comparison is drawn from a real count rather than invented percentages:
 * the same eight foundations either get built by you or are already standing,
 * and the block that is actually your product grows accordingly.
 */
const FOUNDATIONS = [
  "Workspaces and permissions",
  "Knowledge and memory",
  "Agents and workflows",
  "Approvals and human review",
  "Model routing across providers",
  "Evals, testing and release gates",
  "Observability and audit",
  "Cost control and spend limits",
];

export function WhoItsFor() {
  return (
    <section className="ps-who">
      <div className="ps-who-inner">
        <div className="ps-who-head">
          <div>
            <span className="ps-eyebrow" data-reveal>
              Who it&apos;s for
            </span>
            <h2 className="ps-display ps-who-h2 mt-3" data-reveal>
              More of your budget goes on your product, not its foundations.
            </h2>
          </div>
          <div>
            <p className="ps-who-lede" data-reveal>
              Hakken suits anyone who wants a robust MVP or a finished product in
              the market sooner, and for less than a bespoke build would cost,
              whether that is a founder proving an idea before raising or a
              business that has outgrown the spreadsheets it runs on or a team
              who need something real in front of customers this quarter.
            </p>
            <p className="ps-who-lede mt-4" data-reveal>
              On a bespoke build most of the money goes somewhere your customers
              never see. Governance and security, training and testing the
              agents, observability, cost control — that work has to be done
              properly and it eats the budget before anyone writes the part that
              makes your product different.
            </p>
          </div>
        </div>

        <div className="ps-who-compare">
          <div className="ps-who-col" data-reveal>
            <div className="ps-who-col-head">
              <span className="ps-who-col-title">A bespoke build</span>
              <span className="ps-who-col-note">Nine things to build</span>
            </div>
            <div className="ps-who-stack">
              {FOUNDATIONS.map((item) => (
                <div key={item} className="ps-who-block">
                  <span className="ps-who-dot" />
                  {item}
                </div>
              ))}
              <div className="ps-who-block ps-who-block-mine">
                <span className="ps-who-dot" />
                Your product
              </div>
            </div>
          </div>

          <div className="ps-who-col ps-who-col-hakken" data-reveal data-reveal-delay="0.12">
            <div className="ps-who-col-head">
              <span className="ps-who-col-title">The same product, on Hakken</span>
              <span className="ps-who-col-note">One thing to build</span>
            </div>
            <div className="ps-who-stack">
              <div className="ps-who-done">
                <span className="ps-who-done-label">
                  <Check className="h-3.5 w-3.5" strokeWidth={3} />
                  Already built and running
                </span>
                <ul className="ps-who-done-list">
                  {FOUNDATIONS.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
              <div className="ps-who-mine">
                <span className="ps-who-mine-label">Your business logic</span>
                <span className="ps-who-mine-note">
                  The part only you can make, and where the budget now goes
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
