export type MovementSupportStatus =
  | "supported"
  | "approximate"
  | "diagnostic-only"
  | "unsupported";

export type MovementCoverageFamily =
  | "upright"
  | "upper-body-standing"
  | "standing-side-bend-head-direction"
  | "squat-knee-lift"
  | "facing-occlusion"
  | "root-turn"
  | "root-travel"
  | "walking"
  | "pivot-weight-transfer"
  | "jump-hop"
  | "lunges"
  | "sitting"
  | "kneeling"
  | "lying-floor-work"
  | "quadruped"
  | "rolling-crawling"
  | "yoga"
  | "pilates"
  | "props-contact";

export type MovementSupportStatusEntry = {
  status: MovementSupportStatus;
  summary: string;
};

export const MOVEMENT_COVERAGE_FAMILIES: MovementCoverageFamily[] = [
  "upright",
  "upper-body-standing",
  "standing-side-bend-head-direction",
  "squat-knee-lift",
  "facing-occlusion",
  "root-turn",
  "root-travel",
  "walking",
  "pivot-weight-transfer",
  "jump-hop",
  "lunges",
  "sitting",
  "kneeling",
  "lying-floor-work",
  "quadruped",
  "rolling-crawling",
  "yoga",
  "pilates",
  "props-contact",
];

export const MOVEMENT_SUPPORT_STATUS: Record<MovementCoverageFamily, MovementSupportStatusEntry> = {
  upright: {
    status: "supported",
    summary: "Standing posture, posture check-in, and neutral upright calibration.",
  },
  "upper-body-standing": {
    status: "supported",
    summary: "Reviewed broad standing upper-body support for arm raise, reach, twist, and shoulder/scapula proxy presentation with child-readable Game proof.",
  },
  "standing-side-bend-head-direction": {
    status: "supported",
    summary: "Reviewed standing side-bend and head-direction support with child-readable Game presentation.",
  },
  "squat-knee-lift": {
    status: "supported",
    summary: "Reviewed standing squat and single-knee lift support with mirror-readable Game presentation.",
  },
  "facing-occlusion": {
    status: "diagnostic-only",
    summary: "Root heading, away-body, source-limited, mirror-side ownership, and confidence gates are internally demo-ready as diagnostics with focused recorded Replay and Game proof closed; keep this non-user-facing until product truth is deliberately promoted.",
  },
  "root-turn": {
    status: "supported",
    summary: "Reviewed standing root-turn support with recorded proof and child-readable Game presentation. This does not include root travel or walking support.",
  },
  "root-travel": {
    status: "approximate",
    summary: "Root X/Z path groundwork is available for internal simple-travel proof modes when world landmarks are usable, but root travel remains non-user-facing before recorded proof and Game visual proof.",
  },
  walking: {
    status: "approximate",
    summary: "Alternating step release/landing and root-travel sequencing are internally previewable through shared root-motion proof; full gait IK and recorded walking proof are still missing before user-facing support.",
  },
  "pivot-weight-transfer": {
    status: "approximate",
    summary: "Side-lunge and wide-stance weight-transfer prep can be detected and presented in internal preview paths; exact planted-foot pivot IK and center-of-pressure transfer still need recorded proof.",
  },
  "jump-hop": {
    status: "approximate",
    summary: "Grounded jumping-jack/star-shape prep can be detected and presented for internal testing; true airborne jump/hop flight, impact, and balance recovery remain unproved.",
  },
  lunges: {
    status: "approximate",
    summary: "Forward-lunge, side-lunge, low-lunge, and warrior-lunge prep shapes can be detected and presented in internal preview paths; travelling lunge balance recovery still needs proof.",
  },
  sitting: {
    status: "approximate",
    summary: "Seated body orientation, twist, forward fold, leg lift presentation, and conservative pelvis/foot contact correction are implemented for internal synthetic proof; recorded replay and exact chair geometry are still missing before user-facing support.",
  },
  kneeling: {
    status: "approximate",
    summary: "Kneeling body orientation, presentation, and conservative knee/foot floor correction are implemented for internal synthetic proof; recorded replay and full shin/foot rest solve are still missing before user-facing support.",
  },
  "lying-floor-work": {
    status: "approximate",
    summary: "Lying/floor orientation, presentation, and body-anchor floor correction are implemented for internal synthetic proof; recorded replay and full body-plane contact are still missing before user-facing support.",
  },
  quadruped: {
    status: "approximate",
    summary: "Hands-and-knees orientation, presentation, and conservative hand/knee floor correction are implemented for internal synthetic proof; recorded replay and continuous crawl sequencing are still missing before user-facing support.",
  },
  "rolling-crawling": {
    status: "approximate",
    summary: "Bear-crawl and floor-transition prep shapes can be detected and presented in internal preview paths; continuous rolling/crawling locomotion and limb sequencing remain unproved.",
  },
  yoga: {
    status: "approximate",
    summary: "Standing, seated, kneeling, quadruped, supine, and prone yoga prep shapes can be detected and presented in internal preview paths; exact pose scoring and the full yoga library remain unproved.",
  },
  pilates: {
    status: "approximate",
    summary: "Pilates mat prep shapes including bridge, hundred, single-leg stretch, dead bug, hollow hold, double-leg stretch, plank, all-fours reach, side-lying leg lift, clam, and swimming can be detected and presented in internal preview paths; equipment-specific constraints remain unmodeled.",
  },
  "props-contact": {
    status: "approximate",
    summary: "Virtual chair contact is detected and corrected through seated preview poses; wall, ball, reformer, and explicit prop calibration remain missing.",
  },
};

export function getMovementSupportStatusEntry(family: MovementCoverageFamily) {
  return MOVEMENT_SUPPORT_STATUS[family];
}
