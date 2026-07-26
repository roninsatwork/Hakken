# Movement Studio And Replay Unification Plan

Last reviewed: 2026-07-14
Status: historical unification plan; end-to-end alignment is now controlled by [Movement Definitive Plan](../plans/active/movement-definitive-plan.md). The retired [Replay Studio And Game Studio Runtime Alignment Plan](../plans/completed/replay-game-runtime-alignment-plan.md) remains background only.
Audience: agents working on Posture Studio live player, Replay Alignment, avatar retargeting, or movement debug tooling

> Current direction: use the active runtime-alignment plan for new work. This document retains the earlier shared-decision audit and rollback history, but its previous progress estimate does not prove current timed Replay/Game visual parity.

## Purpose

Replay Alignment is working as the reference experience for recorded webcam movement. The live Studio player must behave the same way after webcam/MediaPipe points exist.

The goal is not to copy replay code into Studio. The goal is to make both surfaces feed their source points into the same movement pipeline so a fix made in Replay Alignment automatically affects the live game.

Required target:

```text
Replay recording points
  -> shared movement pipeline
  -> avatar bones
```

```text
Studio live webcam points
  -> live-only point smoothing, if needed
  -> shared movement pipeline
  -> avatar bones
```

The only acceptable live-only behavior after this work is point cleanup before the shared pipeline. Avatar bone ownership, retarget selection, arm routing, lower-body ownership, and fallback decisions must not live in a separate Studio-only path.

## Truthful Current State

Replay and Studio are not yet fully unified.

Current partial alignment:

- Both surfaces eventually render through `VrmAvatar`.
- Both surfaces can build and use `movementRetargeting.ts` data.
- Studio and Replay now call named shared movement wrappers in `movementAvatarPipeline.ts`.
- Shared helper tests cover movement retargeting, calibration, profiles, lower-body decisions, deterministic proof payloads, and Replay-vs-Studio wrapper parity.
- Replay Lab now visibly reports same-frame Replay wrapper vs Studio wrapper parity.

Current divergence:

- Replay Lab's visible avatar still primarily exercises the recorded/instructor application path, while the main game Studio exercises the live player application path.
- Studio live input still has upstream smoothing/calibration lifecycle differences, which are allowed only before the shared movement decision.
- `VrmAvatar` still owns final VRM/Three.js bone application. Some remaining player-vs-recorded application differences can affect the rendered avatar even when shared movement decisions match.
- The user-observed distance case exposed this distinction: Replay parity could look good while the main Studio player still looked vertically compressed when standing farther from camera.

Do not describe the system as "unified", "aligned", or "one path" until the acceptance tests in this document pass.

## Non-Negotiable Rules

1. Replay remains the reference for avatar alignment.

   If a recorded webcam frame drives the Replay avatar correctly, the same frame must be able to drive the Studio avatar path correctly.

2. Studio must stop being special after points exist.

   Live webcam capture can smooth or normalize raw points before the pipe. After that, it must call the same movement pipeline as Replay.

3. No more route-local avatar fixes.

   Do not add a fix that only makes `/demos/movements/replay-lab` correct. Do not add a fix that only makes `/demos/movements/[id]/play` correct. The fix belongs in the shared movement pipeline.

4. Fallback behavior must be shared.

   If a point confidence drops, if depth is unclear, if hand and pose disagree, or if a point is missing, both Replay and Studio must use the same decision function. Studio may smooth input points before this decision, but it may not own a separate avatar fallback branch.

5. Tests must prove the paths cannot drift.

   A parity test must feed the same frame/payload into both "Replay source" and "Studio source" wrappers and prove the same movement decisions are produced.

## Terminology

- Source points: MediaPipe pose landmarks, world landmarks, hands, face, blendshapes, and camera metadata.
- Input cleanup: live-only smoothing or normalization before shared movement decisions.
- Shared movement pipeline: the single implementation that turns source points into retarget frames, owner decisions, and avatar bone targets.
- Avatar application: the final VRM bone application layer. It may depend on avatar rest pose, but not on whether data came from Replay or Studio.
- Identity/presentation: avatar URL, player/instructor label, name plate, camera layout, HUD, scoring, and debug UI. These may remain route-specific.

## Desired Architecture

Create a shared module that owns the movement decision from source points to avatar motion. The exact file name can change, but it should live under:

```text
src/app/(dashboard)/demos/movements/_lib/
```

Suggested shape:

```ts
type MovementAvatarSource = {
  poseLandmarks: TrackingLandmark[];
  worldLandmarks?: TrackingLandmark[];
  hands?: MovementHandsPayload | null;
  faceLandmarks?: TrackingLandmark[];
  blendshapes?: MovementBlendshapePayload[];
  camera?: MovementCameraMetadata;
};

type MovementAvatarPipelineInput = {
  source: MovementAvatarSource;
  retargetSourceModel: MovementRetargetSourceModel | null;
  avatarRole: "player" | "instructor";
};

type MovementAvatarPipelineDecision = {
  retargetFrame: MovementRetargetFrame;
  ownerLabels: Record<string, string>;
  upperBodyTargets: AvatarBoneTarget[];
  lowerBodyTargets: AvatarBoneTarget[];
  headTarget?: AvatarHeadTarget;
  handTargets?: AvatarHandTarget[];
};
```

Important: `avatarRole` may be used for presentation labels and mirroring rules only when truly required. It must not cause a separate movement algorithm for player vs replay.

## Implementation Phases

### Phase 0: Freeze Symptom Patches

Goal: stop making the divergence worse.

Tasks:

- Do not add more `usesPlayerMotionPath` behavior for arms, hands, torso, or lower body.
- Do not add more one-off fixes for `cross chest`, `hands front`, `hand on head`, or similar poses inside the live-player branch.
- Keep the app running for user testing, but treat further visual bugs as evidence for the shared pipeline, not as reasons for another route-local patch.

Acceptance:

- No new Studio-only avatar behavior is added.
- The next code change moves logic out of `VrmAvatar` into shared helpers, or routes Studio through existing shared helpers.

### Phase 1: Parity Audit

Goal: list every remaining branch that makes Studio avatar motion different from Replay.

Tasks:

- Audit every `usesPlayerMotionPath` branch in `VrmAvatar`.
- Classify each branch as:
  - `presentation-only`
  - `input-cleanup`
  - `movement-decision`
  - `avatar-bone-application`
- Mark all `movement-decision` and `avatar-bone-application` branches as candidates for removal or extraction.
- Identify all Replay-specific decisions in `replay-lab/page.tsx`.
- Identify all Studio-specific decisions in `[id]/play/page.tsx`, `useMovementPlayerTracking`, and `VrmAvatar`.

Acceptance:

- A checklist exists in the implementation PR or plan update showing which branches remain and why.
- Any remaining player/replay difference has an explicit reason.

Phase 1 audit update, 2026-07-04:

- Extracted first shared movement decision helper: `movementAvatarPipeline.ts`.
- `movementGamePathSimulation` and `VrmAvatar` now share source-to-movement decision code for body confidence, lower-body intent, retarget frame solving, source-bounds reliability, lower-body readiness, lower-body drive, retarget segment counts, arm readiness/fallback, front-body arm target cleanup, head ownership, spine-drive owner selection, lower-body visual smoothing, lower-body application stage, final lower/feet owner labels after avatar segment application, and retarget debug fields.
- Added named `resolveMovementAvatarReplayDecision` and `resolveMovementAvatarStudioDecision` wrappers around the shared pipeline. `movementGamePathSimulation`, `VrmAvatar`, and parity tests now call these wrappers instead of passing route-local origin strings.
- Added shared deterministic proof source helpers in `movementAvatarProofFixtures.ts`. The standalone proof page and `/play?debugTracking=1&debugPlayerPose=...` now build their synthetic live-player payloads through the same wrapper, so deterministic Studio source injection no longer has a route-local payload factory.
- Added `resolveVrmArmTargetLandmarks` in `vrmRigging.ts` so the remaining player-vs-recorded arm landmark preparation is named and tested outside `VrmAvatar`.
- Added `resolveMovementAutoCalibrationState` in `movementTrackingCalibration.ts` so live auto-calibration sample accumulation, full-body/upper-body selection, and rejected-frame pruning are named and tested outside `VrmAvatar`.
- Added `resolveMovementAvatarPlantedFootOwner` in `movementAvatarPipeline.ts` so planted instructor foot owner-label composition is shared instead of route-local.
- Added `resolveMovementAvatarRetargetSegmentApplication` in `movementAvatarPipeline.ts` so retarget segment eligibility, recorded-foot skip reasons, z-scale, and slerp choices are shared instead of route-local.
- Added `resolveMovementAvatarInactiveLowerBodyDecision` in `movementAvatarPipeline.ts` so skipped unreliable recorded lower-body frames get shared source-limited owner labels.
- Added `resolveMovementAvatarTrackingFallbackLabels` in `movementAvatarPipeline.ts` so diagnostic fallback labels for baseline, head, arms, floor, owners, and lower-body detail are shared instead of route-local.
- Added `formatMovementAvatarRetargetDebugLabel` and `appendMovementAvatarFootLockDebugLabel` in `movementAvatarPipeline.ts` so retarget/foot-lock diagnostic strings are shared instead of route-local.
- Added `resolveMovementAvatarArmAimOptions` and `resolveMovementAvatarLegacyLowerBodyAimOptions` in `movementAvatarPipeline.ts` so player/replay aim slerp and visibility thresholds are shared instead of route-local.
- Added `resolveMovementAvatarPlayerSourceOwnerDecision` in `movementAvatarPipeline.ts` so the post-visual-smoothing player lower-body owner recompute, including held squat ownership, is shared instead of assembled inside `VrmAvatar`.
- Added `resolveMovementAvatarLowerBodyTargetSelections` in `movementAvatarPipeline.ts` so knee/ankle/toe target selection and player-vs-recorded endpoint visibility thresholds are shared instead of route-local.
- Added `resolveMovementAvatarRawHeadDecision` in `movementAvatarPipeline.ts` so face-vs-pose raw head source selection is shared before role-specific head ownership is applied.
- Added `resolveMovementAvatarPlantedSquatIkOptions` in `movementAvatarPipeline.ts` so planted-squat IK player-vs-recorded slerp policy is shared instead of route-local.
- Added `resolveMovementAvatarHipsPositionOptions` in `movementAvatarPipeline.ts` so avatar-root visual lerp, hips root lerp, calibrated-floor use, squat hip-drop scale/limit, and foot-floor correction strength are shared instead of route-local.
- Added `resolveMovementAvatarBoneEaseOptions` in `movementAvatarPipeline.ts` so standby fallback, neutral lower-body, relaxed-arm, neutral-hand, squat-flexion, leg-raise, and solved-lower-body easing policy is shared instead of route-local.
- Added `resolveMovementAvatarSpineApplyOptions` in `movementAvatarPipeline.ts` so spine-drive/solver slerp policy and recorded-spine retarget counting are shared instead of route-local.
- Added `resolveMovementAvatarHeadApplyOptions` in `movementAvatarPipeline.ts` so player-vs-recorded head slerp and small player head compensation factors are shared instead of route-local.
- Added `resolveMovementAvatarFootLockOptions` in `movementAvatarPipeline.ts` so foot-lock release, engage, reset, and player-vs-recorded correction-scale policy are shared instead of route-local.
- Added `resolveVrmHandRigOptions` in `vrmRigging.ts` so player-vs-recorded hand mirroring and finger slerp policy are named outside `VrmAvatar`.
- Added parity tests that feed the same source pose through the named replay/studio wrappers and assert matching lower-body, arm, spine, and torso owner decisions.
- Added parity tests that feed deterministic proof payloads, including hand payloads where present, through both named Replay and Studio wrappers and assert matching movement ownership, arm readiness, fallback, and lower-body drive decisions.
- Added parity tests that feed deterministic proof payloads through both the Studio wrapper and the game-path simulation, asserting matching lower-body readiness, owners, spine owner, and torso owner for standing, squat, far-camera squat, leg raises, weak feet, and lower-body out-of-frame cases.
- Promoted deterministic proof parity coverage to every proof mode in `MOVEMENT_AVATAR_PROOF_MODES`, including side-bend, hands-front, upper-body auto, and upper-body-auto rejected cases. A guard test now fails if a new proof mode is added without wrapper/game-path parity coverage.
- Added helper tests for deterministic proof payload shape, player/recorded arm landmark preparation, player/recorded hand rig options, live auto-calibration state accumulation, planted foot owner-label composition, retarget segment application choices, inactive source-limited lower-body labels, diagnostic fallback labels, retarget/foot-lock diagnostic labels, aim option policies, post-smoothing player lower-body source ownership, lower-body target selection thresholds, raw head source selection, planted-squat IK option policy, hips-position option policy, bone-ease option policy, spine-application option policy, head-application option policy, foot-lock option policy, weak-elbow visible-hand arm readiness, weak-endpoint arm hold fallback, live front-body arm target cleanup, recorded arm target cleanup, player-calibrated head ownership, recorded-face head ownership, pose-only recorded head neutrality, lower-body visual smoothing, lower-body application stage selection, player foot fallback, and legacy lower-body fallback.
- Remaining `usesPlayerMotionPath` branches in `VrmAvatar` are classified below.

Remaining branch classification:

- `presentation-only`: standby/fallback easing factors, avatar-specific slerp factors, name/debug labels, root/hips visual correction strength, hand mirroring, profile tuning, and recorded/player label text.
- `input-cleanup`: live auto-calibration sampling state now lives in `movementTrackingCalibration.resolveMovementAutoCalibrationState`; `VrmAvatar` only stores refs for the active calibration. Real camera solver normalization already lives in `vrmRigging.prepareVrmSolverInput`, player-vs-recorded arm target landmark selection now lives in `vrmRigging.resolveVrmArmTargetLandmarks`, and player-vs-recorded hand rig options now live in `vrmRigging.resolveVrmHandRigOptions`. Deterministic proof/debug player source payload construction now lives in `movementAvatarProofFixtures.ts`. Hand wrist fallback target selection, front-body elbow bias target construction, lower-body knee/ankle/toe target selection, raw head source selection, and visual squat/root smoothing have moved into `movementAvatarPipeline.ts`.
- `movement-decision`: route-local movement decisions are now limited to data that depends on actual avatar bone application success. Arm readiness, hand hold/relax fallback, head owner/calibrated head-motion gating, spine-drive owner selection, post-smoothing player lower-body source ownership, lower-body application stage, planted foot owner-label composition, retarget segment application choices, inactive source-limited lower-body labels, diagnostic fallback labels, retarget/foot-lock diagnostic labels, aim option policies, planted-squat IK option policy, hips-position option policy, bone-ease option policy, spine-application option policy, head-application option policy, foot-lock option policy, and final lower/feet owner labels after avatar segment application have moved into `movementAvatarPipeline.ts`.
- `avatar-bone-application`: legacy lower-body aim fallback, planted squat IK, foot lock, lower-body neutral easing, arm aim vectors, spine rotations, head/neck rotations, hand rig bone slerp, and the actual retarget quaternion application remain in `VrmAvatar`.

Phase 1-4 milestone update, 2026-07-04:

- The parity audit, shared movement decision extraction, Studio wrapper routing, and deterministic parity test coverage are now substantially complete.
- `VrmAvatar` still applies VRM/Three.js bones, stores runtime refs, and owns presentation/debug registry writes, but the player-vs-recorded decisions that determine movement ownership, fallback labels, retarget eligibility, target selection, and application options now live in shared helpers.
- Phase 5 Replay Lab visibility is now implemented. Remaining work should focus on main Studio VRM application parity rather than more pose-specific avatar behavior.

Replay-specific decisions identified:

- `replay-lab/page.tsx` selects recordings, frame position, diagnostic grouping, and display state. Its movement failure decisions should continue to come from `movementReplayAnalyzer` and `movementGamePathSimulation`, not route-local avatar rules.

Studio-specific decisions identified:

- `[id]/play/page.tsx` and `useMovementPlayerTracking` still own live camera/tracking state, smoothing, scoring, HUD state, calibration UI, and route progression.
- `VrmAvatar` still owns VRM bone application and several live-vs-recorded presentation/input-cleanup branches. The next extraction should target remaining bone-application owner decisions before changing more pose-specific behavior.

### Phase 2: Extract Shared Movement Decision

Goal: one pure/shared function decides movement ownership and retarget targets.

Tasks:

- Extract the shared input normalization from `VrmAvatar` into `_lib`.
- Extract retarget frame creation, owner labels, arm/torso/lower-body decision, and confidence fallback decisions into one shared helper.
- Keep VRM-specific bone application in `VrmAvatar` only if needed, but make it consume shared decisions rather than make route-specific decisions.
- Move player-only arm readiness, hand fallback, front-body routing, and hold/relax decisions into the shared helper or delete them if replay retargeting makes them unnecessary.

Acceptance:

- Replay and Studio call the same decision helper with the same source-frame shape.
- The helper has unit tests independent of React/Three.js.
- `VrmAvatar` no longer decides arm ownership differently for player vs replay.

### Phase 3: Route Studio Through The Shared Pipeline

Goal: the live Studio avatar uses the same movement decision as Replay.

Tasks:

- Convert live webcam output into the same source payload shape used by Replay.
- Keep live smoothing before the shared helper.
- Pass Studio live payload into the shared helper.
- Remove or bypass Studio-only avatar movement branches after the helper call.
- Keep route-specific scoring, HUD, calibration UI, name labels, and camera preview outside the shared movement decision.

Acceptance:

- The same saved source frame can be run as `sourceOrigin: "replay"` and `sourceOrigin: "studio"` with matching movement decisions.
- Studio no longer has an independent arm solver when shared retarget data is available.
- Any remaining live-only input smoothing is visibly upstream of the shared movement helper.

### Phase 4: Parity Tests

Goal: make drift impossible to miss.

Required tests:

- Same frame parity:
  - Feed one recorded frame into the Replay wrapper and the Studio wrapper.
  - Assert matching retarget segment owners, upper-body owner labels, lower-body owner labels, and fallback labels.

- Hands/front-body parity:
  - Hand in front of chest.
  - Hand on head.
  - Both hands visible.
  - One hand visible, one hand weak.

- Confidence fallback parity:
  - Weak wrist but visible hand.
  - Weak elbow but usable shoulder/wrist.
  - Missing hand.
  - Ambiguous depth.

- Lower-body parity:
  - Standing neutral.
  - Squat.
  - Single-knee raise.
  - Feet weak/out of frame.

Acceptance:

- A test fails if Studio reintroduces a separate movement owner for a case Replay handles differently.
- Tests run without needing a live webcam.
- User-observed bug frames can be added as fixtures after minimization.

### Phase 5: Replay Lab Shows The Truth

Goal: Replay Alignment must say whether the game path is also aligned.

Tasks:

- Add a visible diagnostic row for:
  - `Replay decision`
  - `Studio decision`
  - `Parity`
- If the same source frame would produce different movement decisions, show `diverged`.
- Link divergence to the owner/fallback label that differs.

Acceptance:

- Replay Lab cannot look "green" while Studio would fail the same frame.
- A future agent can use Replay Lab to see whether a fix will carry into Studio.

Phase 5 milestone update, 2026-07-04:

- Replay Lab now builds the same-frame Replay wrapper decision and Studio wrapper decision for the selected frame.
- The Game Path diagnostics panel now includes a visible `Wrapper Parity` section with `Replay decision`, `Studio decision`, and `Parity`.
- Divergence is shown as `diverged`, lists the differing owner/fallback labels, and adds a current-frame `replay_game_path_diverged` warning so the frame strip and frame flags cannot look clean while the wrapper paths disagree.
- Full local check passed after this update: `npm run verify:env`, `npm run lint`, `npm run typecheck`, and `npm run test:run` via `npm run check`.

Phase 5 correction, 2026-07-04:

- Replay Lab wrapper parity proves shared movement decision parity, not complete rendered-avatar parity.
- The main game Studio can still differ after the shared decision because final VRM bone/root/hips application still has live-player behavior inside `VrmAvatar`.
- Added a shared lower-body application-stage guard so neutral player frames stay in `player-neutral` even when distance/perspective creates lower-body retarget segment motion.
- Added a shared hips-position guard so neutral player standing does not apply calibrated floor-contact hip correction after distance-only camera changes.
- Added a shared foot-lock engagement guard so neutral player standing does not apply planted foot lock just because both feet are visible after a distance-only camera change.
- These fixes belong to shared helpers, but they do not close the full plan. The remaining acceptance gap is visual/application parity for main Studio, especially lower-body/root/hips.

### Phase 6: Main Studio Application Parity

Goal: the main game Studio player avatar must obey the same shared movement decisions as Replay when those decisions say neutral, squat, leg raise, arm fallback, spine/head ownership, or retarget ownership.

Tasks:

- Audit remaining `VrmAvatar` player-vs-recorded branches that apply bones, root movement, hips movement, planted squat IK, foot lock, lower-body neutral easing, spine rotations, head/neck rotations, hand rigging, and retarget quaternion application.
- For each branch, classify it as:
  - `input-cleanup`
  - `presentation-only`
  - `avatar-application-policy`
  - `movement-changing divergence`
- Move `avatar-application-policy` choices into shared helpers under `_lib` with deterministic tests.
- Remove or neutralize `movement-changing divergence` unless it is explicitly documented as live input cleanup before the shared movement decision.
- Add application-stage regression tests for main Studio cases:
  - neutral standing at normal distance
  - neutral standing after stepping farther back
  - squat after stepping farther back
  - single-leg raise
  - weak feet/out-of-frame recovery

Acceptance:

- Main Studio neutral standing cannot apply lower-body retarget, floor-contact hip correction, planted squat IK, or squat/root drop just because the user moves farther from camera.
- Main Studio squat and leg raise still apply after the neutral protections.
- Any remaining player-vs-recorded VRM application difference is documented as presentation-only or input cleanup, with a test proving it cannot change movement ownership.
- Manual QA happens in `/demos/movements/[id]/play`, not only `/demos/movements/replay-lab`.

Remaining non-shared application work, 2026-07-04:

- Lower-body ownership, neutral-vs-squat-vs-leg-raise stage decisions, foot lock engagement, hips/root application gates, squat flexion, single-leg raise, and planted-squat IK are shared. The Three.js bone application for neutral easing, solved retarget limits/scales, and legacy lower-body aim remains local in `VrmAvatar` after the 2026-07-04 visual regression rollback.
- Spine/torso ownership and role-specific slerp options are shared. The Three.js solver application, recorded `z` mirroring, limits/scales, and neutral torso easing remain local in `VrmAvatar` after the 2026-07-04 visual regression rollback.
- Head/head-owner decisions and role-specific head slerp options are shared. The Three.js neck compensation, head position offset, and upper-chest compensation formulas remain local in `VrmAvatar` after the 2026-07-04 visual regression rollback.
- Hand/finger rig mirroring, slerp options, and strengthening are shared in `vrmRigging.ts`. The wrist/finger traversal and per-bone application remain local in `VrmAvatar` after the 2026-07-04 visual regression rollback.
- Live input cleanup remains Studio-only by design: webcam capture, smoothing filters, auto/manual calibration lifecycle, and MediaPipe world/pose payload differences happen before the shared movement decision. These are allowed, but must not leak into post-decision avatar application policy.
- Rendered visual parity proof now covers the main Studio player avatar route through `npm run eval:movement-avatar`, including standing, far squat, leg raises, weak feet, lower-body out-of-frame, rendered silhouette differences, and squat/leg-raise mutual exclusion.

Phase 6 progress update, 2026-07-04:

- Extracted `resolveMovementAvatarFootLockEngagement` into `movementAvatarPipeline.ts`.
- `VrmAvatar` now uses the shared engagement decision before applying planted foot lock.
- Neutral main Studio player frames no longer engage planted foot lock; player squat and recorded planted frames still can.
- Extracted `resolveMovementAvatarHipsApplication` into `movementAvatarPipeline.ts`.
- `VrmAvatar` now uses the shared hips/root application decision before applying squat hip drop or floor-contact correction.
- Neutral main Studio player frames now have no squat drop, no calibrated floor-contact hip correction, and no planted foot lock after distance-only camera changes; player squat still keeps those application paths.
- Extracted `resolveMovementAvatarSquatFlexionPose` and `resolveMovementAvatarSingleLegRaisePose` into `movementAvatarPipeline.ts`.
- `VrmAvatar` now consumes shared lower-body rotation recipes for squat flexion and single-leg raise instead of owning those numbers locally.
- Extracted `resolveMovementAvatarPlantedSquatIkPose` into `movementAvatarPipeline.ts`.
- `VrmAvatar` now consumes a shared planted-squat IK direction recipe instead of owning the knee/ankle/foot direction numbers locally.
- Attempted to extract neutral lower-body easing, solved retarget limits/scales, legacy lower-body aim, spine solver/neutral application, head/neck compensation, and wrist/finger traversal recipes into shared helpers.
- Rolled those renderer recipe consumptions back in `VrmAvatar` after the main Studio route visually regressed: avatar curled, legs stopped responding, and head/neck output was mangled. Keep these formulas local until a smaller extraction is proven visually in the main Studio route first.
- Updated `buildMovementGamePathSimulation` so its owner output includes the same applied lower-body stage decision used by the main Studio route; standing/far-standing and side-reach neutral now stay `player-lower-body-neutral` with neutral feet instead of reporting raw retarget ownership.
- Updated the rendered movement proof expectation so neutral standing asserts the intended no-scrunch owner.
- Added deterministic regression coverage for neutral player distance standing vs player squat vs recorded planted foot lock, hips/root application gates, squat-flexion rotation recipes, single-leg-raise rotation recipes, planted-squat IK direction recipes, and applied game-path owner parity.
- Full local check passed after this update: `216` test files and `1127` tests via `npm run check`.
- Rendered proof passed after this update: `17` Playwright movement avatar proof tests via `npm run eval:movement-avatar`.

## Definition Of Done

Studio and Replay are aligned only when all of these are true:

- Replay Studio/shared replay analysis remains the source of truth for motion. If the avatar is broken, repair the shared replay pipeline first and then route Game Studio through the same result; do not create a separate Game Studio fix path.
- The same source frame produces the same movement decision for Replay and Studio.
- Arms, hands, torso, lower body, and fallback ownership are decided by shared code.
- Live-only behavior is limited to point smoothing or input normalization before the shared pipeline.
- `VrmAvatar` applies shared decisions and does not choose a separate player arm/body behavior.
- Parity tests cover hand-in-front, hand-on-head, both-hands, weak-confidence, squat, standing, and out-of-frame cases.
- Replay Lab reports divergence instead of hiding it.

## What Not To Do

- Do not keep adding special cases inside `VrmAvatar` for individual poses.
- Do not claim a fix is complete because Replay looks correct.
- Do not claim a fix is complete because Studio looks correct for one live pose.
- Do not duplicate Replay code inside Studio.
- Do not add a second "almost replay" path for Studio.
- Do not tune Game Studio bone numbers independently from Replay/shared motion proof.
- Do not use live webcam repetition as the debugging loop when a matching recording exists; use the recording first, then live QA only as confirmation.
- Do not treat confidence fallback as a live-only problem after source points enter the shared pipeline.

## Immediate Next Step

Overall progress estimate: 94%.

The next step is not another broad extraction. Keep the current renderer-stable `VrmAvatar` bone application, then extract only one local renderer formula at a time with a main Studio visual proof before and after each change.
