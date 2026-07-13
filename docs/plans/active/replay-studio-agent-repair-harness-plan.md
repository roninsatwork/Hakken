# Replay Studio Agent Repair Harness Plan

Last reviewed: 2026-07-13
Status: active controlling plan. Repair-packet fail-closed coverage and browser display/export parity are implemented, but current rendered acceptance is reopened: the 2026-07-12 bundle is complete evidence under its historical fingerprint, not a current passing proof after the strengthened sustained-adherence gates.
Scope: turn Replay Studio from a useful human QA screen into a deterministic repair harness that a coding agent can use to reproduce, diagnose, fix, and re-prove avatar motion from one saved recording.

## Adherence Repair Update, 2026-07-13

- Overall implementation is approximately 78% against the full Definition of Done. The repair packet, fixture resolver, canonical source identity, exact browser JSON export, fail-closed coverage, and non-repository CLI bundle scratch handling are substantially in place. Per-bone target/final evidence, remaining batch-policy consolidation, current all-nine recapture/repair, one-command browser orchestration, timed-playback acceptance, and Game Studio live confirmation remain.
- `ReplayStudioRepairPacket` now blocks when rendered or compared frame coverage is incomplete. `silentSkipCount` reflects the larger rendered/compared gap, so analyzer labels alone cannot certify a source session.
- The raw stable-squat source fixture now correctly blocks at `rendered-telemetry` with 0/3 rendered frames; it is no longer described as accepted proof.
- Source-session packets use one source-only SHA-256 identity in the CLI and browser. Retarget, fallback, verdict, and rendered-output changes do not change the human-source hash.
- Replay Lab exports the exact `ReplayStudioRepairPacket` instance shown by Agent Diagnosis, preserving live supplemental failures and avoiding a second browser-only verdict.
- Strict CLI mode exits non-zero for every non-accepted packet, including `review-only`, while still writing the handoff artifacts.
- Full-sequence analysis now blocks sustained moving-target/static-bone runs, sustained confident leg suppression, and persistent high-confidence wrong-side motion. Deterministic frame-step jerk remains diagnostic-only; uninterrupted timed playback owns the blocking jerk decision.
- Three-party analysis retains session p95 metrics but also blocks three or more consecutive above-threshold segment or axial frames, preventing short but visible instructor/player-avatar disagreements from being diluted by a long recording.
- Re-analysis of the complete 11,383-frame-per-path 2026-07-12 artifacts with the strengthened gate blocks all nine recordings. The old artifacts also carry a non-current motion-pipeline fingerprint, so a current rerender is mandatory. For example, Spins exposes sustained left/right shin divergence on frames 645-647 despite a low session p95. This is a newly visible adherence failure, not a reason to weaken the gate.
- The current shared-pipeline repair now passes `Full Spinal Flow` under both strict paths: **1,290/1,290** player-avatar frames and **1,290/1,290** independent three-party frames, zero missing, and zero failures. The controlling local artifact is `tmp/movement-replay-lab/cycle-break-full-spinal-inactive-neutral-parity-2026-07-13/`; it remains intentionally uncommitted.
- A fresh current-fingerprint all-nine run was started only as the final regression gate and was stopped at the user's request during the first recording. It is not an acceptance result. Current all-nine status therefore remains open; the historical 9/9 result must not be reported as current strengthened-gate adherence.

Historical implementation inventory, 2026-07-12. Completion claims below are superseded by the 2026-07-13 adherence repair update above:

- Progress estimate after the 2026-07-12 final acceptance proof: the nine-recording rendered-proof objective is 100% complete. The broader harness remains approximately 85% against this plan's full Definition of Done because browser display/export parity, final canonical-policy consolidation, and Game Studio live confirmation are follow-on work.
- Phase 1/2/5 foundation started in code: Replay Studio frame failures now carry stable repair stage, evidence status, likely files, focused tests, and guardrails.
- A versioned `ReplayStudioRepairPacket` builder exists and is used by browser fix-log export.
- `npm run movement:diagnose` exists for existing analysis JSON or Replay session fixtures and writes JSON and Markdown packets by default.
- `npm run movement:diagnose -- --before <packet.json>` now attaches same-source before/after comparison to JSON, Markdown, and CLI summary output.
- `npm run movement:diagnose:golden` now runs the committed minimized Replay Studio fixture registry without network access and enforces expected packet fields plus source hash for the first wrong-side fixture.
- `npm run movement:diagnose:golden` now prints deterministic repair-stage coverage and gap summaries; all current repair stages have at least one minimized fixture.
- `npm run movement:diagnose:golden -- --json` and `--json-out <file>` now emit a schemaVersion 1 summary with fixture results, artifact kind/path/freshness, source hashes, frame accounting, and stage coverage for machine-readable agent handoff.
- Golden JSON summary rows now also include fixture input kind/path and refresh command, so failure rows and success rows are directly actionable without opening the registry.
- `npm run movement:diagnose -- --fixture <id>` now resolves committed fixtures from the Replay Studio fixture registry.
- `npm run movement:diagnose -- --recording-id <fixture-id>` now falls back to the committed fixture registry when no explicit artifact exists or an implicit default tmp artifact is stale/mismatched, preserving fixture-based reproduce commands.
- `npm run movement:diagnose -- --list-fixtures` now lists committed fixtures with their input kind; JSON output is schemaVersion 1 and includes fixture count, input path, and refresh command.
- Fixture-backed diagnosis now preserves `fixtureId` in the packet and in generated reproduce/compare commands.
- Fixture-backed diagnosis now supports source-first committed fixtures: registry entries may point at a raw Replay session fixture, which `movement:diagnose -- --fixture <id>` re-analyzes through current motion code before building the repair packet.
- The committed golden set now includes a raw source-session weak-feet fixture proving the harness can route untrustworthy source capture to `source-capture` without treating it as an avatar-code repair.
- The committed golden set includes a raw source-session stable-squat fixture with 3/3 analyzer frame accounting. The 2026-07-13 fail-closed packet correctly blocks it because it has 0/3 rendered-avatar frames.
- The committed golden set includes a source-session rendered-final-bone/VRM mismatch fixture with 3/3 analyzer frame accounting. It proves packet routing from supplied session telemetry, but it does not rerender those frames through the current VRM application.
- `movement:diagnose` packets now include artifact resolver metadata for committed fixtures, explicit analysis, explicit sessions, default analysis, recording-id fixture fallback, and stale-default fixture fallback.
- Artifact metadata now includes freshness status and reason; `movement:diagnose -- --require-fresh-artifact` exits with structured `stale-input` when analysis artifacts are stale or lack motion-pipeline fingerprint proof.
- Artifact metadata now includes a `refreshCommand`, and `stale-input` recovery messages include the exact command to refresh, re-diagnose a session, or switch to a committed fixture when available.
- Structured `stale-input` JSON failures now include a machine-readable `refreshCommand` field when the resolver knows the next command, so agents do not need to scrape recovery prose.
- `movement:diagnose -- --refresh` now enforces current/recomputed/source-controlled evidence before diagnosis and blocks unsupported stale/unknown analysis refreshes with a structured refresh command.
- `movement:diagnose -- --recording-id <id>` now resolves an existing configured local Replay export pointer (`tmp/movement-replay-lab/runs/latest-export-path.txt`) when no committed/default artifact covers the id, converts the row to a Replay session, re-analyzes it with current code, and marks the artifact as `configured-recording-source` with recomputed freshness.
- `movement:diagnose -- --recording-id <id> --refresh --require-fresh-artifact` now auto-refreshes stale/unknown default analysis from the configured local Replay export when that export contains the requested recording, rather than stopping at a prose recovery instruction.
- `movement:replay:analyze -- --create-export` now creates a fresh timestamped Convex export path instead of reusing an existing `latest-export-path.txt` target, preventing Convex export download collisions.
- A remote Convex export smoke run succeeded on 2026-07-12 with `npm run movement:replay:analyze -- --limit 1 --create-export --out tmp/movement-replay-lab/remote-export-smoke-analysis.json --manifest-out tmp/movement-replay-lab/remote-export-smoke-analysis.proof-manifest.json`, producing a downloaded export zip plus analysis/manifest artifacts. The manifest remains blocked on recorded visual capture rows, which belongs to the rendered-capture acceptance proof layer.
- Structured missing-input JSON failures now include checked paths, requested recording id, and source-priority order when the default artifact resolver cannot find evidence.
- Structured missing-input JSON failures now include available recording ids when an analysis bundle is ambiguous or the requested recording id is absent.
- Structured missing-input JSON failures now include available fixture ids when a requested committed fixture id is unknown.
- Structured missing-input JSON failures now cover invalid `--before` packet inputs instead of reporting them as generic harness errors.
- Structured missing-input JSON failures now cover malformed JSON input files instead of surfacing parser stack traces.
- Structured missing-input JSON failures now cover unknown options, missing option values, and invalid frame values.
- The golden runner now validates that every fixture declares exactly one input source (`analysis` or `session`) and that the committed input path exists before running diagnosis.
- Golden runs now have human-readable terminal output plus machine-readable JSON summary output/file writing, including artifact resolver metadata per fixture row, so agents can consume fixture status without scraping text.
- The `movement:diagnose` wrapper now writes its transient esbuild bundle under the OS temp directory instead of repository `tmp`, avoiding races with concurrent quality-drift scanners that inspect `tmp/movement-replay-lab/**`.
- The committed golden set covers accepted/no-failure analysis input; raw source-session fail-closed coverage; source-blocked analysis and raw source-session inputs; source-normalization mismatch; calibration-unreliable; rendered-telemetry-missing; wrong-side motion; owner flicker; seated support/contact; root motion; VRM application; and missing visual-proof artifact paths.
- Golden minimized fixtures now enforce honest frame accounting: `totalFramesExpected`, `totalFramesCompared`, and `silentSkipCount` are asserted per fixture instead of silently assuming sampled proof coverage.
- Accepted/no-failure packets now report `failureCode: none` and `unknown` repair owner/stage instead of inventing a divergent owner.
- `movement:diagnose -- --strict` is now test-covered: blocked and review-only fixtures exit non-zero after writing the repair packet, while accepted fixtures exit zero.
- `movement:diagnose` now reports missing artifacts and missing recording ids as structured `missing-input` outcomes instead of generic Node stack traces, including JSON output when `--json` is requested.
- Replay Lab top-level avatar-follow acceptance now derives from the repair packet, with live browser telemetry passed in as supplemental packet evidence.
- Replay Lab current-frame inspection now shows a tested Agent Diagnosis component sourced from the same repair packet: status, failure, stage, source/expected/actual layers, evidence, frame scope, rendered/expected/compared coverage, source hash, pipeline fingerprint, generated timestamp, likely file, focused test, and reproduce command.
- Replay Lab Agent Diagnosis now also shows artifact kind/path and artifact freshness status with refresh-command detail for stale/unknown evidence.
- The Agent Diagnosis component now includes tested jump targets for first failure, worst frame, and first lower-owner transition, derived from one shared helper instead of route-local button logic.
- Replay Lab Avatar Follow session failures, current-frame failure aggregation, criterion status policy, criterion failure-code mapping, and timeline frame severity now run through a tested pure diagnosis helper instead of page-local acceptance logic.
- Replay Lab Avatar Follow criteria display labels/order now also come from the tested diagnosis helper; the page only supplies current metric strings.
- Replay Lab Avatar Follow acceptance summary text/status mapping and Replay-vs-Game parity failure construction now also come from the tested diagnosis helper, leaving the page to wire inputs and render outputs.
- Browser fix-log export consumes the exact displayed repair packet through a pure `buildReplayStudioFixLog` helper with fixture-backed tests, including supplemental rendered failures and the canonical source-session SHA-256 identity.
- Repair-packet failure selection is now deterministic: blocked/error candidates rank first, then repair-route confidence, measured failure magnitude, frame index, and stable failure-code tiebreaking.
- Full-sequence telemetry analysis now emits explicit expected/rendered/compared/missing frame accounting and blocks visible one-frame rendered owner snaps as `rendered-owner-flicker` while leaving stable longer transitions and smooth label-only handoffs visible but non-blocking.
- `npm run movement:replay:full-sequence:bundle` validates a schemaVersion 1 bundle manifest, runs full-sequence analysis for every listed recording, and reports required recording ids plus expected/rendered/compared/missing frame totals. Zero-rendered, malformed, incomplete, wrong-identity, and stale-fingerprint evidence are fail-closed.
- A committed full-sequence smoke bundle fixture now exercises `movement:replay:full-sequence:bundle -- --json --strict` from source-controlled session/telemetry files, so the bundle validator no longer depends only on ignored `tmp` test artifacts for fresh-checkout proof.
- Still pending: per-bone expected-versus-final telemetry in repair packets; final canonical batch-policy consolidation; broader durable real-source fixtures; current all-nine rerender/repair; timed-playback acceptance; one-command orchestration; and Game Studio live confirmation.

## Rendered Proof Update, 2026-07-12

### Historical all-nine rendered proof — passed under the 2026-07-12 gate, current acceptance reopened

The strict canonical command passed on 2026-07-12 against the immutable export at `tmp/movement-replay-lab/runs/2026-07-12T16-01-49-207Z-movement-recordings.convex-export.zip`. This is valuable historical before-evidence, but it is not a current acceptance result after the 2026-07-13 sustained-adherence gates and pipeline-fingerprint change:

```bash
npm run movement:replay:nine-proof -- \
  --export tmp/movement-replay-lab/runs/2026-07-12T16-01-49-207Z-movement-recordings.convex-export.zip \
  --out-dir tmp/movement-replay-lab/nine-recording-rendered-proof-2026-07-12 \
  --resume
```

The final manifest is `tmp/movement-replay-lab/nine-recording-rendered-proof-2026-07-12/manifest.json`; the strict result is `tmp/movement-replay-lab/nine-recording-rendered-proof-2026-07-12/bundle-report.json`. Both proof paths have matching recording/session identity, immutable source hash, required proof mode, unique frame indexes, complete rendered telemetry, and the then-current motion-pipeline fingerprint.

| Recording | ID | Player avatar frames | Three-party frames | Historical result |
| --- | --- | ---: | ---: | --- |
| Spins | `px71h2bsqg9xv8pxyffv5xgaed89wbx3` | 648/648 | 648/648 | Passed |
| Turning Around in Circles | `px72q2e5m8pw9gctaj11yh36a989wjt7` | 632/632 | 632/632 | Passed |
| Full Spinal Flow | `px736zs97w9axrn39je7pfahc989q8jv` | 1,290/1,290 | 1,290/1,290 | Passed |
| Star Jumps | `px74tzfb514yq5zpm2mpt3fdkx89xr2z` | 708/708 | 708/708 | Passed |
| Full Motion Exercises | `px75fgt11wbg0jvr17j6fc2dvd89trpm` | 3,026/3,026 | 3,026/3,026 | Passed |
| Body Capture 3D | `px7b0y1rcfbe1e1zanknsgefp986f1qs` | 1,815/1,815 | 1,815/1,815 | Passed |
| Head Roll | `px7ebpmfazdrtbad9bpefxnmp589xwj6` | 554/554 | 554/554 | Passed |
| Full Body Flow | `px7fafa0wypmmc5rfz1nzmdvas88n6m0` | 2,169/2,169 | 2,169/2,169 | Passed |
| Walking on the Spot | `px7fmzw2v4yzex6yx3n9dchj0h89x7e3` | 541/541 | 541/541 | Passed |
| **Total** | **9 recordings** | **11,383/11,383** | **11,383/11,383** | **Passed** |

`Player avatar frames` records final rendered player-avatar source-follow telemetry. `Three-party frames` records the instructor avatar, independently constructed opposite player input, and player avatar for every source frame, with zero missing role frames and no duplicate indexes. The 2026-07-13 analyzer now detects sustained above-threshold disagreements hidden by the earlier p95-only decision, so these rows must be rerendered and repaired before they can be called accepted again.

### Same-source repair evidence: Full Spinal Flow

The saved `Full Spinal Flow` source was the repair fixture; it was not rerecorded. Before the shared display/model-boundary repair, its complete 1,290-frame three-party proof was blocked by axial p95 `0.2892` (limit `0.12`) and right-thigh p95 `0.1534` (limit `0.15`), while the player source-follow gate exposed two one-frame lower-owner changes.

After the shared fix, the same source passes both paths: player source-follow is 1,290/1,290 with no visible owner flicker and signed side-bend correlation `0.8848`; three-party axial p95 is `0.0891`, while left/right thigh p95 is `0.1468`/`0.1472` against the `0.15` limit. The repair did not introduce Replay-only or Game-only bone rules:

- player display landmarks and player neutral source model are both prepared in the same display/anatomical space before retargeting, eliminating the prior double inversion;
- the low-confidence leg continuation band keeps a continuous recorded shin direction through a narrow occlusion boundary instead of switching a rendered leg chain to fallback for one frame;
- the shared three-party mirror oracle preserves the same anatomical target contract as the browser pipeline.

### Evidence-gate corrections exercised by the all-nine run

The strict gate now checks physical rendered output rather than treating diagnostics as output proof:

- side-bend correlation retains anatomical sign and only evaluates a meaningful source range; a near-zero threshold tail cannot manufacture a failure, while an inverted final VRM side bend remains blocking;
- a transient owner label is reported, but `rendered-owner-flicker` blocks only when final VRM directions/axial rotations visibly snap out and back in the same frame window;
- lower-limb mirror ownership needs at least `0.06` radians of source motion, so incidental leg drift in a head-only recording cannot be mistaken for a decisive side error;
- missing debug data, missing rendered roles, duplicate or absent indexes, identity/hash mismatch, wrong proof mode, and stale pipeline fingerprints remain fail-closed.

The regression suite for these rules and the strict full-sequence/three-party/bundle runners passed: 36 tests across four focused harness files.

## Historical Adherence Audit, 2026-07-12

This is the pre-completion baseline. The final rendered-proof update above supersedes its statements that all-nine proof is absent or that strict accounting/identity checks are incomplete. Remaining packet/export and Game Studio follow-ons continue to be tracked here.

### Verified working

- `npm run movement:diagnose:golden` passed all fifteen committed fixtures and reported every repair-stage category.
- The focused repair-packet, browser-diagnosis, diagnosis CLI, golden-runner, full-sequence, and bundle tests passed: eight files and eighty tests.
- The committed two-recording full-sequence smoke bundle passed in strict mode.
- Stable repair stages, route ownership, structured CLI failures, fixture resolution, freshness metadata, JSON/Markdown packets, deterministic failure ranking, and the Replay Agent Diagnosis panel exist.
- Runtime avatar telemetry can read post-application VRM segment directions, and deterministic browser capture can step source frames while waiting for avatar updates.
- `git diff --check` passed.

### Audit items resolved by the final acceptance update

The final bundle resolves the acceptance-critical portions of the historical audit:

1. Full-sequence, three-party, and bundle gates now fail closed on missing debug/role data, absent or duplicate indexes, incomplete accounting, identity/source-hash mismatch, wrong proof mode, and stale pipeline fingerprints.
2. Adversarial regressions cover zero rendered data, missing roles, duplicate indexes, stale fingerprints, wrong identity, inverted side bend, visible owner snaps, and incidental lower-limb drift.
3. The source-only hash excludes retarget, fallback, ownership, and rendered output evidence; the Full Spinal before/fix/after exercise used the same saved source hash.
4. `movement:replay:nine-proof` now performs the canonical export/session resolution, deterministic player and three-party capture, and strict aggregate gate for the configured nine recordings.
5. The real all-nine rendered bundle is no longer absent: it passed with 11,383/11,383 frames in each proof path.

### Remaining implementation order beyond acceptance proof

1. Preserve per-frame expected targets and final rendered VRM bone/segment transforms in the repair packet, including root, contact, floor, avatar role, and frame identity.
2. Make browser display and fix-log export consume the exact same packet instance and supplemental evidence.
3. Complete final canonical-policy consolidation across batch, current-frame, session, unsupported, and proof-missing decisions.
4. Make `movement:diagnose` delegate to the current capture/aggregate proof workflow where source access is available, without adding hidden local-artifact prerequisites.
5. Perform the final Game Studio live-camera confirmation; this is confirmation after Replay proof, not a replacement for it.

## Executive Decision

Replay Studio is the motion-engine diagnosis and acceptance harness for recorded movement. It is not only a video player, screenshot tool, or dashboard of movement metrics.

The required loop is:

```text
record a human movement once
  -> preserve the recording as immutable source evidence
  -> replay the same frames through the current shared motion pipeline
  -> measure the source, expected avatar result, and actual rendered VRM result
  -> produce a ranked, machine-readable repair packet
  -> change the owning shared motion module
  -> rerun the same recording and compare before/after
  -> pass deterministic Replay gates
  -> perform one final live-camera confirmation in Game Studio
```

The recording must be reusable across code changes. Generated analysis, screenshots, bone telemetry, and verdicts may change because the code changed; the source recording must not.

This plan controls the missing agent-repair capability. The existing observability, visual-acceptance, avatar-correction, mirror-methodology, and movement-architecture plans remain authoritative for their own behavior and proof contracts.

## Why This Plan Exists

Replay Studio already exposes substantial diagnosis information, but an agent still cannot consistently move from a visible failure to a verified code fix.

Today, the evidence is split across:

- shared analyzer verdicts in `movementReplayAnalyzer.ts`;
- current-frame and session calculations assembled in `replay-lab/page.tsx`;
- runtime-only VRM telemetry produced by the browser;
- capture-backed proof and manifests under ignored `tmp/movement-replay-lab/**` paths;
- separate scripts for analysis, capture, full-sequence proof, three-party proof, and gates;
- prose in several overlapping plans.

This fragmentation creates a predictable failure mode: Replay Studio can say `blocked` or show a bad avatar, but the next agent does not receive one durable answer to these questions:

1. Which exact recording and frame reproduce the problem?
2. Was the source trustworthy enough to judge?
3. What motion did the source perform?
4. What should each avatar bone have done?
5. What did the final rendered VRM bones actually do?
6. At which pipeline stage did expected and actual first diverge?
7. Which module owns that stage?
8. Which command reproduces the failure from a fresh checkout?
9. Which command proves the fix without asking the user to move again?

Until one artifact answers all nine questions, Replay Studio is a strong human QA surface but not yet an agent-grade repair harness.

## Current State, Audited 2026-07-12

### What already works

- Live webcam, recorded replay, and synthetic proof sources normalize into `MovementSourceFrame`.
- Live and recorded paths resolve through the shared `resolveMovementMotionFrame` boundary.
- Instructor and player avatars consume shared motion-frame decisions, with explicit role and mirror behavior.
- `movementReplayAnalyzer.ts` produces frame and session Replay Studio verdicts.
- Replay Studio shows avatar-follow status, failure markers, worst frames, current-frame details, and batch review.
- The browser can export a JSON fix log.
- `movement:avatar-follow-gate` and `movement:replay-studio-verdict-gate` enforce important visual-proof rules.
- Full-sequence and three-party capture/analyzer scripts already exist.
- The mirror contract requires actual rendered-bone proof and complete frame accounting.

### What is incomplete

| Gap | Current consequence | Required correction |
| --- | --- | --- |
| Verdict ownership is split | React can calculate a different practical status from the shared analyzer | One pure diagnosis builder must produce the canonical frame, session, and criterion verdicts used by UI, CLI, and tests |
| Export is descriptive, not a repair packet | An agent sees failures but not the first divergent stage, owner module, or exact verification command | Add a versioned `ReplayStudioRepairPacket` with evidence, attribution, commands, and before/after fields |
| Required proof inputs are ignored scratch files | A fresh checkout can lack the files used by the named gates | Commit small sanitized fixtures and a fixture registry; make larger proof bundles reproducible with one command |
| Existing CLI gates consume artifacts but do not guarantee their creation | The command can fail because `current-*.json` is missing rather than because motion is wrong | Add one orchestration command that resolves inputs, regenerates allowed artifacts, diagnoses, and gates |
| Saved analysis often lacks final rendered VRM telemetry | Analyzer decisions can pass while the visible avatar is wrong | Capture actual post-application VRM bone transforms for every required frame |
| Sparse captures can miss temporal defects | Flicker, snapping, drift, and short owner switches can hide between selected frames | Run uninterrupted full-sequence telemetry and temporal checks for golden recordings |
| Exact real failures are not durable fixtures | A synthetic equivalent can pass while the original bug returns | Minimize and commit sanitized frame windows for known failures, including expected diagnoses |
| Failure attribution is free-form text | `nextFixArea` does not reliably route an agent to a module or test | Add stable stage and owner enums mapped to files and focused commands |
| Green status has several meanings | Supported, review-only, and not-supported rows can be misunderstood as full acceptance | Use explicit `accepted`, `blocked`, `review-only`, and `not-supported` outcomes everywhere |
| Live parity remains a separate manual environment | Replay success does not prove camera permissions, timing, or live smoothing | Keep a short live check as final confirmation, never as the primary debugging loop |

## Product Contract

### Replay Studio is

- the primary debugger for avatar motion;
- the repeatable reproduction environment for saved human movement;
- the source of canonical diagnosis records;
- the place where source truth, expected motion, and rendered output are compared;
- the acceptance harness used before Game Studio live-camera confirmation;
- a before/after comparison tool for motion-engine changes.

### Replay Studio is not

- proof that MediaPipe source tracking is correct merely because landmarks exist;
- proof that avatar output is correct merely because a solver or owner label is correct;
- a replacement for actual rendered VRM-bone measurement;
- a second movement implementation separate from Game Studio;
- a place to add replay-only bone rules or pose-specific animation patches;
- a store for mutable golden recordings;
- allowed to call unsupported or missing evidence accepted.

### Source-of-truth hierarchy

The words "source of truth" refer to different layers and must remain explicit:

1. **Human source truth:** the immutable saved landmarks, hands, face, timing, camera metadata, and recording metadata.
2. **Motion decision truth:** the shared `MovementMotionFrame` and avatar pipeline decision produced by current code.
3. **Rendered output truth:** post-application VRM bone transforms and root/floor/contact telemetry from the actual renderer.
4. **Diagnosis truth:** the canonical verdict and repair packet generated by comparing layers 1-3.
5. **Product acceptance truth:** strict gates over the supported recording set, followed by a short live confirmation.

No lower layer may be inferred from a higher one. In particular, an owner label is not evidence that a VRM bone visibly moved.

## Required Architecture

```text
Immutable recording or committed minimized fixture
  -> MovementSourceFrame
  -> resolveMovementMotionFrame
  -> shared avatar pipeline decision
  -> actual VrmAvatar application
  -> post-application rendered telemetry
  -> canonical ReplayStudioDiagnosis
  -> ReplayStudioRepairPacket
  -> UI + CLI + tests + acceptance gates
```

Game Studio must continue to consume the same shared motion result. Route-specific differences are limited to input cleanup, camera lifecycle, presentation, and documented VRM plumbing. They must be represented in diagnosis data rather than hidden in route-local rules.

## Canonical Data Contracts

The implementation may refine field names, but it must preserve these concepts and use one shared builder.

```ts
type ReplayStudioRepairStage =
  | "source-capture"
  | "source-normalization"
  | "calibration"
  | "motion-decision"
  | "mirror-side-mapping"
  | "support-contact"
  | "retarget-solve"
  | "vrm-application"
  | "rendered-telemetry"
  | "proof-artifact"
  | "unknown";

type ReplayStudioEvidenceStatus =
  | "proven"
  | "suspected"
  | "insufficient-evidence";

type ReplayStudioAcceptanceStatus =
  | "accepted"
  | "blocked"
  | "review-only"
  | "not-supported";

type ReplayStudioRepairPacket = {
  schemaVersion: 1;
  generatedAt: string;
  code: {
    commit: string;
    motionPipelineFingerprint: string;
  };
  recording: {
    id: string;
    title: string;
    sourceHash: string;
    fixtureId?: string;
  };
  scope: {
    frameStart: number;
    frameEnd: number;
    totalFramesExpected: number;
    totalFramesRendered: number;
    totalFramesCompared: number;
    silentSkipCount: number;
  };
  verdict: {
    status: ReplayStudioAcceptanceStatus;
    failureCode: ReplayStudioFailureCode;
    severity: "error" | "warning";
    evidenceStatus: ReplayStudioEvidenceStatus;
    confidence: number;
  };
  source: {
    readiness: string;
    quality: number;
    anatomicalSide: "left" | "right" | "both" | null;
    motion: string;
    visibleBodyParts: string[];
  };
  expected: {
    avatarRole: "instructor" | "player";
    anatomicalMapping: "identity" | "opposite";
    avatarSide: "left" | "right" | "both" | null;
    bones: Record<string, unknown>;
    owners: Record<string, string>;
  };
  actual: {
    bones: Record<string, unknown>;
    owners: Record<string, string>;
    contacts: Record<string, unknown>;
    root: Record<string, unknown>;
  };
  divergence: {
    firstDivergentStage: ReplayStudioRepairStage;
    metrics: Record<string, number | null>;
    explanation: string;
  };
  repair: {
    owner: ReplayStudioRepairStage;
    likelyFiles: string[];
    focusedTests: string[];
    doNotPatch: string[];
  };
  commands: {
    reproduce: string;
    compareAfterChange: string;
    acceptance: string;
  };
};
```

Rules:

- `schemaVersion` is mandatory so saved packets remain readable after fields evolve.
- `sourceHash` proves that before and after runs used the same source recording.
- `motionPipelineFingerprint` prevents stale rendered proof from being accepted after motion code changes.
- `firstDivergentStage` must be `unknown` when evidence cannot prove attribution.
- `likelyFiles` are produced from a reviewed owner map, not guessed from a failure message.
- `silentSkipCount` must be zero for strict acceptance.
- The UI, CLI, JSON, Markdown, and tests must consume the same packet builder.

## Failure Attribution Contract

The agent needs stable routing, not only prose. Add a reviewed map similar to:

| Stage | Evidence that selects it | Primary ownership |
| --- | --- | --- |
| `source-capture` | Raw landmarks are missing, stale, corrupt, or not trustworthy | capture/recording and MediaPipe input modules |
| `source-normalization` | Raw data is valid but `MovementSourceFrame` changes side, timing, or confidence incorrectly | `movementSourceFrame.ts` and display/input preparation |
| `calibration` | Neutral model, floor, scale, or camera-relative axes are wrong before retargeting | tracking calibration and retarget source-model modules |
| `motion-decision` | Source is correct but owner, intent, target, or fallback decision is wrong | `movementMotionFrame.ts` and avatar pipeline decision modules |
| `mirror-side-mapping` | Identity/opposite anatomical mapping or scoring correspondence is wrong | canonical mirror mapping and side-ownership modules |
| `support-contact` | Standing/seated state, planted foot, floor, or contact is wrong | support, contact, footing, and root constraint modules |
| `retarget-solve` | Expected source vector is correct but solved target rotation/offset is wrong | retargeting and avatar rest-pose modules |
| `vrm-application` | Target is correct but final VRM bone differs after application | `VrmAvatar` adapter and frame application modules |
| `rendered-telemetry` | Avatar may be correct, but measurement is absent or reads the wrong bones/time | renderer telemetry/capture modules |
| `proof-artifact` | Evidence is missing, stale, fingerprint-mismatched, or incomplete | movement debug scripts and fixture registry |

The first implementation PR must put this map in code and test every mapping. A free-form `nextFixArea` may remain for display, but it must be derived from the enum.

## Durable Recording And Artifact Strategy

The repository must support both small deterministic tests and realistic full recordings.

### Tier 1: committed minimized fixtures

Commit sanitized, minimal frame windows for known failure classes. Each fixture contains:

- immutable source frames needed to reproduce the defect;
- recording and frame metadata;
- a source hash;
- expected source motion;
- expected failure code and owner stage for the known-bad variant;
- expected pass criteria after the fix;
- no generated screenshots, credentials, personal video, or unnecessary raw payload.

Suggested location:

```text
scripts/movement-debug/fixtures/replay-studio/
  registry.json
  full-motion-frame-868/
    source.json
    expectation.json
```

Start with at least these regression shapes:

- active leg moves but avatar under-follows;
- source left/right maps to the wrong avatar side;
- leg raise collapses into squat or seated support;
- planted foot floats;
- owner flickers across a short frame window;
- expected target is correct but final VRM bone application is wrong;
- source is untrustworthy and must not be blamed on avatar output;
- proof fingerprint is stale or telemetry is missing.

### Tier 2: reproducible full-recording bundle

Keep large generated analysis and captures under `tmp/movement-replay-lab/**`, but make them reproducible from a checked-in registry and one command.

The registry must declare:

- recording ids and human-readable titles;
- required proof cases and supported/not-supported status;
- expected frame count;
- immutable source hash when available;
- approved source: local sanitized export or configured Convex environment;
- regeneration command;
- whether browser rendering is required;
- expected output filenames.

When required input is unavailable, the command must fail with one precise recovery instruction. It must not fail later with an unexplained missing `current-analysis-reviewed.json`.

### Tier 3: local review artifacts

Screenshots, videos, broad analysis reports, and ad hoc debug exports remain ignored scratch output. They are evidence during a run, not repository source. The strict gate may consume them only when their manifest includes the current source hash and motion-pipeline fingerprint.

## One-Command Agent Experience

Add a canonical command:

```bash
npm run movement:diagnose -- --recording-id <id> --frame <index>
```

It must:

1. resolve a committed fixture, local export, or configured recording source;
2. verify the recording/source hash;
3. generate or refresh current analysis;
4. run browser rendering when final VRM telemetry is required;
5. account for every requested frame;
6. write JSON and Markdown repair packets;
7. print the top failures, first divergent stage, likely files, and exact next command;
8. exit non-zero for a blocking supported failure;
9. distinguish infrastructure failure from motion failure with different error codes/messages.

Also add:

```bash
npm run movement:diagnose:golden
```

This command runs all committed minimized fixtures without network access. It is the fast regression command every agent can run from a fresh checkout after `npm ci`.

The existing lower-level scripts should remain available, but the plan must not require a new agent to manually compose five commands or know which `current-*.json` filename is current.

## Implementation Phases

Each phase is a separate reviewable change. Do not combine motion tuning with harness construction.

### Phase 0: Lock the contract and baseline

Goal: make the current limitations executable before changing behavior.

Tasks:

- Add this plan to the architecture guard or plan-status audit as the controlling repair-harness plan.
- Add characterization vectors that exercise the shared analyzer result and the current route-level status calculation separately, recording the disagreement without leaving a failing test in the branch.
- Add a fixture of the current browser export shape and a target repair-packet contract so the Phase 2 schema gap is explicit.
- Record the required CLI inputs, outcomes, exit semantics, and missing-artifact behavior as test cases for the future command.
- Record the current state of the known Full Motion failure window and one source-not-trustworthy window.

Acceptance:

- All committed tests remain green; there are no skipped or intentionally failing acceptance tests.
- Characterization data describes the gap without changing motion behavior.
- Baseline output records the same source hash for repeated runs.
- The phase contains no avatar tuning and no Game Studio patch.

### Phase 1: One canonical diagnosis model

Goal: UI, CLI, and tests receive the same verdict.

2026-07-12 partial implementation:

- Stable acceptance, evidence, stage, and owner-routing types now exist.
- Replay Studio frame failures are enriched from one reviewed route map.
- Failure-code-to-stage mapping has table coverage.
- Replay Lab top-level avatar-follow status now consumes `ReplayStudioRepairPacket.verdict`.
- React-facing helpers still own batch status, issue-code selection, thresholds, and next-fix routing outside the canonical packet builder; that remains the next Phase 1 gap.

Primary files:

- `movementReplayAnalyzer.ts`
- a new focused `movementReplayDiagnosis.ts` or equivalent
- `replay-lab/_lib/replayLabFrameFailures.ts`
- `replay-lab/page.tsx`

Tasks:

- Introduce stable acceptance, evidence, stage, and owner types.
- Move session thresholds, current-frame criteria, parity failures, and proof-missing logic into a pure shared builder.
- Make React render the canonical result instead of recomputing status.
- Preserve source-trust separation.
- Preserve explicit `not-supported` reporting.
- Add table-driven tests for every failure-code-to-stage mapping.

Acceptance:

- The same input JSON produces byte-equivalent verdict content in unit tests, CLI, and browser export, excluding timestamps.
- `replay-lab/page.tsx` no longer owns acceptance policy.
- No supported blocked frame can display `accepted` or `pass` in another Replay Studio surface.

### Phase 2: Versioned repair packets

Goal: every actionable failure tells an agent what to inspect and how to prove the result.

2026-07-12 partial implementation:

- `ReplayStudioRepairPacket` schema version 1 exists.
- Packet builder includes the named source, expected, actual, owners, contacts, root, confidence, first-divergent-stage, likely-files, focused-test, guardrail, source-hash, and command fields. The expected/actual bone payload is still summary-level and does not yet preserve the per-bone target and final rendered transforms required for strict attribution.
- Browser JSON fix-log export uses the exact repair packet shown by Agent Diagnosis, including live supplemental evidence; JSON display/export verdict parity is complete.
- Browser-only rendered telemetry failures can now be passed as supplemental evidence and routed through the same repair-stage map.
- Markdown repair-packet output now comes from the same packet data as JSON.
- Deterministic ranking now chooses failures by blocked/error status, repair-route confidence, measured failure magnitude, frame index, and stable failure-code tiebreaking.
- A committed rendered-final-bone mismatch fixture proves that supplied expected-motion and rendered-error data can route to `vrm-application`; it does not rerender the current VRM implementation from immutable source evidence.
- Still pending: per-bone target/final-transform packet evidence and broader exact known-bad fixtures from real recordings.

Tasks:

- Implement `ReplayStudioRepairPacket` and its pure builder.
- Add a reviewed stage-to-files and stage-to-tests registry.
- Include source, expected, actual, owners, contacts, root, confidence, and first divergent stage.
- Include exact reproduce, compare, and acceptance commands.
- Add deterministic ranking: blocked first, evidence confidence second, magnitude third, frame index last. Done 2026-07-12.
- Generate JSON and Markdown from the same packet data.
- Mark attribution `unknown` or `insufficient-evidence` rather than guessing.

Acceptance:

- A known wrong-side fixture routes to `mirror-side-mapping`.
- An expected-target/final-bone mismatch routes to `vrm-application`.
- Missing rendered telemetry routes to `rendered-telemetry`, not to the motion solver.
- Source-blocked input routes to `source-capture` and does not accuse avatar output.
- Repeated runs are stable apart from timestamp and commit metadata.

### Phase 3: Durable golden fixtures and artifact resolution

Goal: a fresh checkout can reproduce known failure classes without hidden local files.

2026-07-12 partial implementation:

- Added `scripts/movement-debug/fixtures/replay-studio/registry.json`.
- Added minimized fixtures for accepted leg raise, source-blocked lower body, source-normalization mismatch, calibration-unreliable, missing rendered telemetry, wrong-side leg raise, owner flicker, seated support/contact, root-motion drift, missing VRM leg application, rendered-final-bone mismatch, and missing visual proof.
- Added source-session fixtures for stable squat without rendered proof, weak-feet source capture, and rendered-final-bone/VRM mismatch, all re-analyzed through current motion code by the fixture resolver.
- Added `npm run movement:diagnose:golden`, which runs the registry without local `tmp` inputs and validates status, failure code, evidence status, first divergent stage, repair owner, and source hash.
- Added `movement:diagnose:golden -- --json` and `--json-out <file>`, which emit fixture result rows, artifact metadata, and stage coverage as schemaVersion 1 JSON.
- Golden JSON fixture rows now include fixture input kind, committed input path, and fixture refresh command.
- Golden registry expectations now include frame accounting (`silentSkipCount`, expected frames, compared frames), so minimized fixtures cannot silently claim untested frames.
- Golden registry validation now checks fixture input source shape and path existence before running each packet.
- Golden packets include and validate `fixtureId`, and generated reproduce/compare commands use the fixture resolver.
- `movement:diagnose -- --fixture <id>` resolves committed fixture analysis, default frame, fixture id, and optional recording id from the registry.
- `movement:diagnose -- --list-fixtures` exposes each fixture's input kind, and `--json` exposes the committed input path and refresh command for agent orchestration.
- `movement:diagnose -- --recording-id <id>` can now regenerate a Replay session from an existing local export pointer when no local analysis or committed fixture covers the id, preserving source-priority metadata and recomputed freshness in the repair packet.
- `movement:diagnose -- --recording-id <id> --refresh --require-fresh-artifact` can now supersede stale/unknown default analysis with a recomputed configured local export session when available.
- `movement:replay:analyze -- --create-export` now deliberately ignores stale latest-export pointers and writes a fresh timestamped Convex export path before analysis.
- Golden runs now print covered repair stages and remaining stage gaps; current gaps are `none`.
- `movement:diagnose` now records the resolved artifact kind, path, checked paths, requested recording id, fixture id, stale default path, fallback reason, and source-priority list inside the repair packet and Markdown handoff.
- `movement:diagnose` now records artifact freshness and supports `--require-fresh-artifact` to fail stale or freshness-unknown analysis inputs before a packet is accepted as proof.
- `movement:diagnose` now adds a refresh command to artifact metadata and stale-input recovery output, giving the next agent a concrete rerun command instead of prose-only regeneration guidance.
- Still pending: broader source-frame-first fixture payloads beyond the fail-closed/source-blocked/VRM-mismatch source-session cases. The historical all-nine generated evidence remains intentionally ignored under `tmp`; a current rerender is required.

Tasks:

- Add the committed minimized fixture registry and sanitized fixture payloads.
- Add source hashing and schema validation.
- Add an artifact resolver with explicit source priority: committed fixture, supplied local export, configured Convex fetch.
- Add one regeneration command for the full-recording bundle.
- Add precise missing-input errors and recovery instructions.
- Keep large generated outputs ignored.

Acceptance:

- `movement:diagnose:golden` runs without network access.
- Deleting `tmp/movement-replay-lab/**` does not break minimized fixture tests.
- Full-bundle regeneration recreates all named current artifacts or exits early with one actionable missing-input message.
- A fixture source hash change fails until its expectation is deliberately reviewed.

### Phase 4: Full-sequence rendered telemetry

Goal: diagnose what the user actually sees, including temporal defects.

2026-07-12 partial implementation:

- `npm run movement:replay:full-sequence` captures every rendered Replay Lab frame during deterministic or timed playback.
- `npm run movement:replay:full-sequence:analyze` checks missing frames, suppressed leg motion, head/side-bend response, temporal jerk, independent mirror side ownership, and rendered owner transitions.
- The full-sequence analyzer now reports `frameAccounting` with expected, rendered, compared, missing, and completeness fields.
- Strict status now requires complete accounting and rendered telemetry for every expected frame; zero-rendered evidence is fail-closed.
- Strict status also blocks sustained moving-target/static-bone runs, persistent high-confidence wrong-side response, sustained confident leg suppression, and three-party segment/axial divergence that a whole-session p95 can hide.
- A one-frame owner label switch is reported, and it fails temporal acceptance with `rendered-owner-flicker` only when final VRM directions or axial rotations visibly snap out and back; stable longer transitions and smooth label-only handoffs remain reported but non-blocking.
- `npm run movement:replay:full-sequence:bundle` now preserves the recording-id list and frame totals from a captured telemetry manifest, including strict failures for missing inputs or missing required ids.
- A committed smoke manifest under `scripts/movement-debug/fixtures/replay-studio/full-sequence-bundle-smoke/` now proves the strict bundle validator can run from checked-in session and telemetry files without local scratch artifacts.
- Completed: fail-closed full-sequence and three-party accounting, artifact identity/fingerprint validation, browser capture for all nine acceptance recordings, and the nine-recording id/frame-total report. The generated proof is retained locally under `tmp/movement-replay-lab/nine-recording-rendered-proof-2026-07-12/` and is intentionally not committed.

Tasks:

- Capture final post-application VRM bone transforms, root transform, floor clearance, contacts, and owner labels.
- Capture expected motion targets before bone application.
- Tie each telemetry frame to recording id, frame index, source hash, avatar id, role, and pipeline fingerprint.
- Use the existing full-sequence and three-party harnesses rather than creating a separate renderer.
- Require expected/rendered/compared/missing counts.
- Detect owner flicker, side switches, snaps, drift, held motion, and dropped frames across uninterrupted playback.
- Keep an independent mirror oracle for side-ownership acceptance; do not reuse production mirror mapping as its own expected answer.

Acceptance:

- Strict golden runs have zero silent skips.
- The harness identifies the first divergent stage between shared target and final bone application.
- A deliberately broken final-bone application fails even when analyzer owner labels remain correct.
- A visibly snapping one-frame owner switch fails temporal acceptance; a label-only transient does not substitute for rendered output proof. Done 2026-07-12.
- All nine acceptance recording ids and frame totals are reported by the final strict bundle. Completed 2026-07-12: 11,383 frames per proof path, zero missing.

### Phase 5: Canonical diagnosis CLI

Goal: an agent can reproduce and triage with one command.

2026-07-12 partial implementation:

- `npm run movement:diagnose` exists.
- It supports `--analysis`, `--session`, `--recording-id`, `--frame`, `--out`, `--json`, and `--strict`.
- It supports `--md-out` and `--no-md`.
- It supports `--fixture <id>` for committed Replay Studio fixtures.
- It supports `--list-fixtures` so new agents can discover fixture ids, input kind, input path, and refresh command without opening the registry.
- `--list-fixtures --json` emits a versioned schemaVersion 1 payload with command and fixture count metadata for machine consumers.
- It supports `--before <packet.json>` and reports improved, regressed, unchanged, or source-changed against the prior packet.
- `movement:diagnose:golden` exists for the committed minimized fixture registry.
- `movement:diagnose:golden -- --json` and `--json-out <file>` exist for structured fixture/artifact/coverage handoff.
- Golden summary result rows include fixture input kind/path and refresh command for direct agent orchestration.
- Missing analysis/session/packet files and absent requested recording ids now produce structured `missing-input` failures; `--json` prints the same failure contract as JSON.
- Ambiguous multi-recording analysis inputs and absent requested recording ids now include `availableRecordingIds` in structured JSON failure output.
- Unknown fixture ids now include `availableFixtureIds` in structured JSON failure output.
- Invalid `--before` packet inputs now produce structured `missing-input` failures with the offending path and recovery instruction.
- Malformed JSON input files now produce structured `missing-input` failures with the offending path and recovery instruction.
- Unknown options, missing option values, and invalid frame values now produce structured `missing-input` failures with recovery instructions.
- Repair packets now expose artifact resolver metadata so agents can see whether the command used a committed fixture, explicit local artifact, default tmp analysis, or fallback from stale/missing default artifacts.
- `--require-fresh-artifact` produces structured `stale-input` failures when local analysis artifacts do not prove the current motion-pipeline fingerprint.
- `--refresh` enforces current, recomputed, or source-controlled evidence before diagnosis and refuses stale/unknown analysis artifacts with a structured refresh command instead of fetching implicitly.
- Stale/freshness-unknown failures include a concrete refresh command when the resolver can infer one.
- Missing default-analysis failures include checked paths, requested recording id, and source-priority metadata in the structured JSON failure output.
- Strict mode exits non-zero for every non-accepted packet but still writes JSON/Markdown repair artifacts first.
- It prints a compact summary and writes complete JSON and Markdown packets.
- Artifact resolution and packet-writing are substantially implemented. End-to-end orchestration is incomplete: the command does not yet run current browser rendering, full-sequence capture, three-party proof, and strict acceptance gates as one workflow.

Primary files:

- new `scripts/movement-debug/diagnose-replay-studio.mjs`
- focused helper modules and tests under `scripts/movement-debug/`
- `package.json`

Tasks:

- Implement `movement:diagnose` and `movement:diagnose:golden`.
- Orchestrate existing analyze, render, full-sequence, three-party, and gate capabilities.
- Support recording, fixture, frame, range, avatar, before-report, and output options.
- Print a compact ranked summary and write complete JSON/Markdown packets.
- Use distinct outcomes for accepted, blocked, review-only, not-supported, missing-input, and harness-error.
- Never fetch or recapture when a valid current artifact with matching hashes/fingerprint exists unless `--refresh` is supplied.

Acceptance:

- A new agent can run the command from `--help` without reading implementation code.
- Known-bad fixtures exit non-zero and name the owner stage.
- Known-good fixtures exit zero.
- `--before` reports improved, unchanged, and regressed metrics against the same source hash.
- Missing input does not masquerade as a motion failure.

### Phase 6: Replay Studio Agent Diagnosis Mode

Goal: the browser presents the same repair information clearly to humans and agents.

2026-07-12 partial implementation:

- Current-frame Avatar Follow now renders a compact `ReplayAgentDiagnosisPanel` from `ReplayStudioRepairPacket`.
- The block exposes packet status, failure code, first divergent stage, source/expected/actual layers, evidence, frame scope, rendered coverage, source hash, pipeline fingerprint, generated timestamp, likely file, focused test, and reproduce command.
- It also has stable `data-testid` anchors for browser proof and a direct React render test covering the fields a coding agent needs.
- Browser fix-log export has a pure payload builder and direct fixture-backed tests, and consumes the same packet instance shown by the browser panel, including live supplemental failures.
- Agent Diagnosis jump targets now cover first failure, worst frame, and first lower-owner transition, with a pure helper test and click-path render coverage.
- Avatar Follow session failures, current-frame failure aggregation, criterion statuses, criterion code ownership, and frame marker severity are now centralized in `replayAvatarFollowDiagnosis.ts` with focused tests.
- Agent Diagnosis now displays artifact kind/path and freshness status with stale/unknown warning styling plus refresh-command detail in the title.
- Avatar Follow criteria labels/order are now centralized in `replayAvatarFollowDiagnosis.ts` instead of assembled directly in `replay-lab/page.tsx`.
- Still pending: browser Markdown export, remaining batch-policy consolidation, and final browser proof over the cleaned display wiring.

Tasks:

- Replace remaining route-local acceptance calculations with the canonical diagnosis.
- Add an Agent Diagnosis view or panel showing source, expected, actual, first divergent stage, owner, evidence strength, and commands.
- Add JSON and Markdown repair-packet export.
- Allow jumping to first failure, worst failure, and first owner transition.
- Show artifact freshness, source hash, pipeline fingerprint, and rendered-frame coverage.
- Keep Start Gate, Avatar Follow, and Acceptance visibly distinct.
- Avoid adding a second set of thresholds in React.

Acceptance:

- Browser export matches CLI packet content for the same input.
- The page cannot display accepted while the canonical packet is blocked.
- The user can identify whether the problem is source, decision, retarget, application, or proof without reading raw logs.
- Exact known-bad fixtures have browser tests for visible failure code, stage, frame, and export action.

### Phase 7: Repair-loop acceptance and Game confirmation

Goal: prove the intended record-once, refine-many workflow end to end.

Run this controlled exercise:

1. Select one known-bad committed fixture and its full recording when available.
2. Run `movement:diagnose` and save the before packet.
3. Confirm the packet identifies the correct stage and focused files.
4. Apply one deliberately scoped shared-pipeline fix.
5. Rerun the same source with `--before`.
6. Confirm the target failure improves or clears with no new blocked frames.
7. Run the golden suite, full supported recording gate, mirror gate, and full-sequence temporal gate.
8. Open Game Studio for the matching movement and perform one live confirmation.

Acceptance:

- No new recording is needed to diagnose or verify the shared motion fix.
- Before and after packets have the same source hash.
- The repaired recording passes without weakening thresholds or changing fixture expectations to hide the defect.
- Replay and Game use the same shared decision and final application path.
- Live confirmation agrees with Replay; any difference generates a new packet classified as live input cleanup or documented application plumbing.

## Required Tests

At minimum, implementation must add:

- diagnosis builder unit tests for all failure codes and owner stages;
- repair packet schema and deterministic-order tests;
- fixture registry validation and source-hash tests;
- missing-artifact and stale-fingerprint CLI tests;
- exact minimized real-frame regression tests;
- final-target-versus-rendered-bone tests;
- full-sequence skip/flicker/snap/drift tests;
- browser tests proving canonical status and export parity;
- architecture tests preventing Replay-only or Game-only motion policy;
- a test that unsupported recordings remain visible and never count as accepted.

## Commands And Verification

During implementation, each phase runs its focused tests. Before a phase is considered complete, run the repository gates required by `AGENTS.md`:

```bash
npm run verify:env
npm run lint:all
npm run check
npm run build
git diff --check
```

When the harness commands exist, the movement-specific minimum becomes:

```bash
npm run movement:diagnose:golden
npm run movement:replay-studio-verdict-gate
npm run movement:architecture-guard
```

For mirror or shared avatar behavior changes, also run the complete rendered three-party and all-frame gates required by `movement-mirror-and-side-ownership-contract.md`.

## Guardrails For Future Agents

- Do not ask the user to repeat a live movement until the matching saved recording has been diagnosed.
- Do not tune Game Studio separately from Replay Studio.
- Do not make a solver label the oracle for rendered correctness.
- Do not change thresholds to turn a visible failure green.
- Do not overwrite or mutate a golden source recording.
- Do not commit broad generated `tmp` artifacts.
- Do not claim all-nine acceptance when any recording is `not-supported`, `review-only`, missing, skipped, or stale.
- Do not guess a repair owner when rendered evidence is absent.
- Do not combine harness work and avatar behavior tuning in the same phase or commit unless a focused regression test requires both.
- Stop and report the evidence gap when source privacy, missing recording access, or renderer availability prevents a truthful diagnosis.

## Pull Request Boundaries

Recommended sequence for a less experienced coding agent:

1. PR 1: Phase 0 tests and canonical contracts only.
2. PR 2: Phase 1 shared diagnosis and React policy removal.
3. PR 3: Phase 2 repair packet and owner registry.
4. PR 4: Phase 3 fixtures, hashing, and artifact resolver.
5. PR 5: Phase 4 rendered telemetry and temporal proof.
6. PR 6: Phase 5 CLI orchestration.
7. PR 7: Phase 6 browser diagnosis mode and export parity.
8. PR 8: Phase 7 end-to-end repair exercise and live confirmation record.

Every PR description must include:

- overall roadmap and current phase percentage;
- behavior changed and behavior intentionally unchanged;
- exact fixtures/recordings and frame ranges used;
- before and after packet paths or summaries;
- commands run and their outcomes;
- remaining evidence gaps;
- confirmation that no Replay-only or Game-only motion rule was introduced.

## Definition Of Done

This plan is complete only when all of the following are true:

- One saved recording can be reused across multiple code changes without recapture.
- A fresh checkout can run the committed golden diagnosis suite without hidden local artifacts.
- One command generates or resolves evidence, diagnoses failures, writes repair packets, and returns a truthful exit status.
- UI, CLI, tests, and gates use one canonical diagnosis builder.
- Every actionable packet includes source, expected, actual, evidence status, first divergent stage, likely files, and verification commands.
- Strict proof reads actual final VRM transforms and reports complete frame accounting with zero silent skips.
- Temporal failures such as flicker, snaps, and drift are tested over uninterrupted sequences.
- Unsupported and missing-evidence recordings remain visible and never count as accepted.
- A documented end-to-end exercise proves `record once -> fix -> rerun same proof -> pass`.
- Game Studio needs only final live confirmation after Replay passes.

The current `Full Spinal Flow` rerun satisfies the strict-rendered-proof and record-once/replay/reprove loop for that recording. The final current-fingerprint all-nine bundle remains open because the fresh run was intentionally stopped; historical 9/9 artifacts do not satisfy the strengthened sustained-divergence gate.

## Progress Baseline

- Overall movement roadmap: approximately 95% for the Replay/avatar acceptance slice; final Game Studio confirmation remains separate.
- Existing Replay observability and diagnostic UI capability: approximately 90%.
- Agent repair harness infrastructure: approximately 92% for contracts, routing, packet writing, fixture discovery, artifact resolution, focused tests, browser diagnosis display, non-repository CLI scratch handling, and strict rendered proof.
- Agent repair harness against this plan's full Definition of Done: approximately 78%; per-bone packet evidence, final one-command browser orchestration, current all-nine acceptance, timed playback, and final live confirmation remain.
- Strict real rendered-avatar acceptance proof: **recording-level pass, all-nine open** — current `Full Spinal Flow` passes 1,290/1,290 frames on both proof paths with zero missing and zero failures; the strengthened-gate all-nine run is incomplete.
- Remaining harness work: complete the current-fingerprint all-nine gate when requested, repair any remaining recordings without weakening thresholds, then perform final Game Studio live confirmation.
- Current planning/documentation correction slice: 100%; implementation changes and this plan update remain uncommitted.
