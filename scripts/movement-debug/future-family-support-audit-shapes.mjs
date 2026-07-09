#!/usr/bin/env node

export const FUTURE_FAMILY_SUPPORT_AUDIT_SHAPES = [
  {
    acceptableSupportClaim: "Standing pivot and visible weight-transfer support for broad child gameplay, not exact center-of-pressure measurement.",
    fallbackRule: "Keep internal-preview until planted-foot pivot, side ownership, and readable left/right transfer pass in Replay and Game.",
    family: "pivot-weight-transfer",
    gameVisualCases: [
      "strongest-weight-shift-left",
      "strongest-weight-shift-right",
      "strongest-standing-pivot",
    ],
    recordedProofCases: [
      "wide-stance-weight-shift-left",
      "wide-stance-weight-shift-right",
      "standing-pivot-left",
      "standing-pivot-right",
      "stable-return-to-neutral",
    ],
  },
  {
    acceptableSupportClaim: "Child-readable jump/hop effort and landing response, not athletic jump-height scoring.",
    fallbackRule: "If feet/root lift are unreliable, degrade to grounded effort only; never count hidden/weak feet as airborne proof.",
    family: "jump-hop",
    gameVisualCases: [
      "strongest-jump-prep",
      "strongest-jump-hop",
      "strongest-jump-landing",
    ],
    recordedProofCases: [
      "jump-prep",
      "jump-flight-or-lift",
      "jump-landing",
      "single-hop-left-or-right",
      "stable-post-landing-recovery",
    ],
  },
  {
    acceptableSupportClaim: "Standing lunge shape recognition for clear forward/side lunges.",
    fallbackRule: "Keep travelling lunges, balance recovery, and deep pose variants internal until separate proof exists.",
    family: "lunges",
    gameVisualCases: [
      "strongest-forward-lunge-left",
      "strongest-forward-lunge-right",
      "strongest-side-lunge",
    ],
    recordedProofCases: [
      "forward-lunge-left",
      "forward-lunge-right",
      "side-lunge-left",
      "side-lunge-right",
      "upright-recovery",
    ],
  },
  {
    acceptableSupportClaim: "Kneeling and half-kneeling posture support where knee contact remains readable.",
    fallbackRule: "Keep internal if knee/foot contact is inferred only from synthetic floor correction or if camera framing hides lower legs.",
    family: "kneeling",
    gameVisualCases: [
      "strongest-kneeling-neutral",
      "strongest-half-kneel",
      "strongest-kneeling-rise",
    ],
    recordedProofCases: [
      "kneeling-neutral",
      "half-kneel-left",
      "half-kneel-right",
      "kneeling-rise-or-lower",
      "stable-knee-foot-contact",
    ],
  },
  {
    acceptableSupportClaim: "Selected floor-work postures and leg-lift support when body-plane contact is visible.",
    fallbackRule: "Do not claim general floor exercise support until body-plane contact, orientation, and limb visibility pass in recorded proof.",
    family: "lying-floor-work",
    gameVisualCases: [
      "strongest-supine-floor",
      "strongest-prone-floor",
      "strongest-floor-leg-lift",
    ],
    recordedProofCases: [
      "supine-neutral",
      "prone-neutral",
      "side-lying-left-or-right",
      "floor-leg-lift",
      "return-to-floor-neutral",
    ],
  },
  {
    acceptableSupportClaim: "Hands-and-knees and selected reach/leg-extension support with readable contact.",
    fallbackRule: "Keep crawl sequencing and fast transitions internal until separate continuous-motion proof exists.",
    family: "quadruped",
    gameVisualCases: [
      "strongest-hands-knees",
      "strongest-bird-dog-left",
      "strongest-bird-dog-right",
    ],
    recordedProofCases: [
      "hands-knees-neutral",
      "bird-dog-left",
      "bird-dog-right",
      "hands-knees-rock-back",
      "stable-hand-knee-contact",
    ],
  },
  {
    acceptableSupportClaim: "Selected crawl/roll transition support for slow, child-readable movement.",
    fallbackRule: "Keep internal unless contact points, direction, and sequencing are readable without one-off Game-only rules.",
    family: "rolling-crawling",
    gameVisualCases: [
      "strongest-bear-crawl-step",
      "strongest-crawl-sequence",
      "strongest-roll-transition",
    ],
    recordedProofCases: [
      "bear-crawl-step-left",
      "bear-crawl-step-right",
      "crawl-sequence-forward",
      "floor-roll-transition",
      "recovery-to-stable-contact",
    ],
  },
  {
    acceptableSupportClaim: "A specific reviewed yoga pose pack, not full yoga library support.",
    fallbackRule: "Any unreviewed pose stays internal/demo-only even if nearby pose families have synthetic preview coverage.",
    family: "yoga",
    gameVisualCases: [
      "strongest-standing-yoga",
      "strongest-seated-yoga",
      "strongest-floor-yoga",
      "strongest-yoga-transition",
    ],
    recordedProofCases: [
      "standing-yoga-hold",
      "seated-yoga-hold",
      "quadruped-yoga-hold",
      "supine-or-prone-yoga-hold",
      "slow-yoga-transition",
    ],
  },
  {
    acceptableSupportClaim: "A specific reviewed Pilates-style routine pack, not broad Pilates instruction.",
    fallbackRule: "Keep internal unless core/leg control is visible in recorded Replay and Game without claiming clinical form accuracy.",
    family: "pilates",
    gameVisualCases: [
      "strongest-pilates-core-hold",
      "strongest-pilates-leg-lift",
      "strongest-pilates-transition",
    ],
    recordedProofCases: [
      "supine-core-hold",
      "supine-leg-lift-control",
      "seated-core-control",
      "prone-or-side-body-control",
      "slow-pilates-transition",
    ],
  },
  {
    acceptableSupportClaim: "Selected prop/contact interactions where the prop/contact target is explicit and visible.",
    fallbackRule: "Do not infer physical object contact from pose alone; keep prop support internal until target/context proof exists.",
    family: "props-contact",
    gameVisualCases: [
      "strongest-left-prop-contact",
      "strongest-right-prop-contact",
      "strongest-two-hand-prop-contact",
    ],
    recordedProofCases: [
      "prop-contact-left",
      "prop-contact-right",
      "two-hand-prop-contact",
      "prop-reach-or-place",
      "stable-contact-release",
    ],
  },
];

export const FUTURE_FAMILY_SUPPORT_AUDIT_SHAPE_FAMILIES =
  FUTURE_FAMILY_SUPPORT_AUDIT_SHAPES.map((shape) => shape.family);

export function futureFamilySupportAuditShapeForFamily(family) {
  return FUTURE_FAMILY_SUPPORT_AUDIT_SHAPES.find((shape) => shape.family === family) ?? null;
}

function unique(values) {
  return Array.from(new Set(values));
}

function hasDuplicates(values) {
  return unique(values).length !== values.length;
}

export function auditFutureFamilySupportAuditShapes(shapes = FUTURE_FAMILY_SUPPORT_AUDIT_SHAPES) {
  const failures = [];
  const families = shapes.map((shape) => shape.family).filter(Boolean);

  if (families.length !== 10) {
    failures.push(`expected 10 future family audit shapes, got ${families.length}`);
  }
  if (hasDuplicates(families)) {
    failures.push(`duplicate future family audit shapes: ${families.filter((family, index) => families.indexOf(family) !== index).join(", ")}`);
  }

  shapes.forEach((shape) => {
    const prefix = shape.family || "unknown-family";
    if (!shape.family) failures.push("future family audit shape is missing family");
    if (!Array.isArray(shape.recordedProofCases) || shape.recordedProofCases.length < 3) {
      failures.push(`${prefix} must define at least 3 recorded proof cases`);
    }
    if (!Array.isArray(shape.gameVisualCases) || shape.gameVisualCases.length < 3) {
      failures.push(`${prefix} must define at least 3 Game visual cases`);
    }
    if (hasDuplicates(shape.recordedProofCases ?? [])) {
      failures.push(`${prefix} has duplicate recorded proof cases`);
    }
    if (hasDuplicates(shape.gameVisualCases ?? [])) {
      failures.push(`${prefix} has duplicate Game visual cases`);
    }
    if (!shape.acceptableSupportClaim || shape.acceptableSupportClaim.length < 20) {
      failures.push(`${prefix} must define acceptable support copy`);
    }
    if (!shape.fallbackRule || shape.fallbackRule.length < 20) {
      failures.push(`${prefix} must define a fallback/non-promotion rule`);
    }
  });

  return {
    failures,
    familyCount: families.length,
    families,
    ok: failures.length === 0,
    shapes,
  };
}

export function formatFutureFamilySupportAuditShapes(audit) {
  const lines = [
    "# Future Family Support-Audit Shapes",
    "",
    `Status: ${audit.ok ? "ready" : "blocked"}`,
    `Families: ${audit.familyCount}/10`,
    "",
    "| Family | Recorded Proof Cases | Game Visual Cases | Acceptable Claim | Fallback Rule |",
    "| --- | --- | --- | --- | --- |",
    ...audit.shapes.map((shape) => [
      shape.family,
      shape.recordedProofCases.join(", "),
      shape.gameVisualCases.join(", "),
      shape.acceptableSupportClaim,
      shape.fallbackRule,
    ].map((cell) => String(cell).replaceAll("|", "\\|")).join(" | ")).map((row) => `| ${row} |`),
  ];

  if (audit.failures.length > 0) {
    lines.push("", "Failures:");
    audit.failures.forEach((failure) => lines.push(`- ${failure}`));
  }

  return lines.join("\n");
}

function printHelp() {
  console.log(`Print and validate first-pass support-audit shapes for future movement families.

Usage:
  npm run movement:future-family-support-audit-shapes
  npm run movement:future-family-support-audit-shapes -- --strict --json

Options:
  --strict   Exit non-zero when a shape is missing required promotion fields.
  --json     Print machine-readable JSON.
  --help     Show this help.
`);
}

function parseArgs(argv) {
  const args = {
    help: false,
    json: false,
    strict: false,
  };

  argv.forEach((arg) => {
    if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else if (arg === "--json") {
      args.json = true;
    } else if (arg === "--strict") {
      args.strict = true;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  });

  return args;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
      printHelp();
    } else {
      const audit = auditFutureFamilySupportAuditShapes();
      console.log(args.json ? JSON.stringify(audit, null, 2) : formatFutureFamilySupportAuditShapes(audit));
      if (args.strict && !audit.ok) process.exitCode = 1;
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
