# Movement Studio VrmAvatar Inventory

Phase 4 audit note for the retired `docs/plans/completed/movement-studio-best-practice-architecture-plan.md`.

Scope: `src/app/(dashboard)/demos/movements/[id]/play/_components/VrmAvatar.tsx`.

Reset reviewed: 2026-07-05.

Current summary: `VrmAvatar` now consumes required route-provided `MovementMotionFrame` refs in the synthetic proof route, Replay Lab, main live Game Studio player avatar, and main recorded instructor avatar. It is no longer the primary owner of movement-decision assembly for those paths, but it is still not a thin VRM adapter. It remains the owner of React/Three/VRM object lifetime, raw solver preparation inside the frame loop, setup/ref state, live root-motion history, leg-raise hold state, hips/floor correction, foot-lock/support-contact orchestration, final VRM object lookup/write callbacks, and debug telemetry plumbing.

## Classification Key

- `runtime-ref`: React/Three/VRM object lifetime, refs, loader state, and frame loop plumbing.
- `input-cleanup`: route/role adaptation, mirroring, calibration, solver landmark preparation, or fallback source selection.
- `movement-decision`: support, scoring, tracking confidence, body intent, owner, or pose-family policy.
- `avatar-application`: converting a resolved movement decision into VRM transforms.
- `presentation-debug`: telemetry, labels, visual QA values, and debug registry output.

## Inventory

| Area | Lines | Classification | Keep In Renderer? | Notes |
| --- | ---: | --- | --- | --- |
| VRM loading, skeleton combine, avatar scene, display label | 357-458, 2103-2115 | `runtime-ref` | Yes | Renderer plumbing. Safe to leave until UI shell extraction. `vrmRigging.ts` now owns the normalized-bone lookup adapter used by frame-level application helpers. |
| Rest-pose and segment mapping helpers | 150-219, 1096-1180 | `avatar-application` | Partial | `movementAvatarRestPose.ts` now owns retarget mapping constants, VRM rest-pose map building, and source-segment direction conversion. `movementAvatarSegmentApplication.ts` owns rest-mapped local quaternion target math, rest-mapped bone mutation, rest-map refresh and optional last-good storage sequencing, planted IK specs, retarget segment world-direction specs, and retarget mapping execution/counting. `vrmRigging.ts` now owns generic named-rotation target execution against VRM-like bones, including the single-target wrapper used by head upper-chest compensation. Renderer still owns VRM bone lookup/build callbacks and some smoothing callers. |
| Root math helpers | 228-246 | `avatar-application` | Extracted | `movementAvatarRootTarget.ts` now owns root heading/travel clamping, posture drop, jump height, and step-response target decisions. `movementAvatarRootApplication.ts` owns root transform interpolation, yaw-wrap math, root transform execution, step-foot target calculation, nullable step-foot execution, and step-foot world-to-local execution sequencing. Renderer still supplies final Three.js/root and foot-bone write callbacks. |
| Live root-motion history builder | 248-270, 937-943 | `input-cleanup` | Extracted | `movementRootMotion.ts` now owns bounded live root-motion history append/trimming and latest-frame analysis through `appendMovementRootMotionHistoryFrame`. `VrmAvatar` still stores the history ref until the live source adapter owns this state before the shared motion pipe. |
| Avatar visual telemetry | 272-340, 1985-2008 | `presentation-debug` | Partial | `movementAvatarDebugTelemetry.ts` now owns avatar root debug assembly, final tracking debug-state assembly, avatar-vs-source segment direction comparison, error averaging, compact vector formatting, foot-lock debug patching, and role-keyed retarget debug registry writes. Renderer still supplies resolved labels, measurements, and decisions. |
| Reset refs on VRM change | 417-458 | `runtime-ref` | Yes | Object lifetime only. |
| Retarget source/root frame ref effects | 453-459 | `runtime-ref` | Yes | React ref sync only. |
| Auto-calibration inside frame loop | 760-783 | `input-cleanup` | Partial | `movementAvatarSetup.ts` now owns live/manual setup state, auto-calibration accumulation, and live source-frame/readiness metadata. Renderer still stores the setup state until it receives a full `MovementSourceFrame`/`MovementMotionFrame`. |
| Solver input preparation and player mirror branch | 512-556 | `input-cleanup` | No | Explicit mirror metadata now exists; this branch should become a source/display adapter before `MovementMotionFrame`. |
| Fallback pose when source is absent | 476-510, 514-519, 932-934 | `avatar-application` | Partial | Renderer standby pose. `vrmRigging.ts` now owns fallback pose target resolution and final shared bone application through `applyVrmDemoFallbackPoseToBones`; `VrmAvatar` only decides when standby should be applied. It should remain presentation-only and not imply movement support. |
| Studio/replay avatar decision call | 792-804 | `movement-decision` delegated | Mostly extracted | `VrmAvatar` now requires a `motionFrameRef` and consumes `MovementMotionFrame.avatarDisplayDecision` when present. Current proof/practice routes are wired, and missing current frames use presentation standby instead of renderer-local movement decision fallback. Compatibility wrappers remain outside the renderer for parity harnesses. |
| Exercise transition in renderer | 811-815 | `movement-decision` delegated | Partial | `movementAvatarExerciseTarget.ts` now owns transition state shape and transition resolution for Replay/Game simulation and `VrmAvatar`; renderer still carries the ref until it receives a full `MovementMotionFrame`. |
| Head motion intent in renderer | 818-822 | `movement-decision` leak | No | Should be derived before avatar application from source/truth/motion frame. |
| Leg-raise hold and lower-body visual smoothing | 845-880 | `movement-decision` plus `avatar-application` | No | Policy helpers are in `_lib`, but state and mutation live here. Move decision state into shared motion/gameplay path before thinning renderer. |
| Player source-owner and lower-body owner decisions | 887-899, 1599-1703 | `movement-decision` plus `avatar-application` | Partial | `movementAvatarTarget.ts` now resolves lower-body target ownership/stage for Replay/Game simulation and `VrmAvatar`; Replay Lab/capture exposes the target stage. Renderer still applies the branch-specific bones. |
| Hips/floor/root application options | 900-930, 1951-1984 | `avatar-application` with input cleanup | Partial | Application can stay; calibrated floor source should come from source/truth/readiness contracts. |
| Root transform, jump, and step application | 944-1043, 1410-1431 | `avatar-application` | Partial | `movementAvatarRootTarget.ts` returns the shared root target and response decisions, and `movementAvatarRootApplication.ts` owns the interpolated root transform, root object application, step-foot world target, nullable step-foot execution wrapper, local step-foot execution wrapper, and final step-foot object application. `VrmAvatar` supplies only the root, scene, and foot objects. |
| Arm target selection | 1045-1072, 1526-1572 | `movement-decision` plus `avatar-application` | Partial | `movementAvatarArmTarget.ts` now composes player/recorded arm landmarks, hand wrist fallbacks, front-body bias, and wrist/elbow targets. `movementAvatarArmApplication.ts` owns tracked aim vs retarget skip vs relax/last-good dispatch, tracked arm aim request execution, and full arm application wiring to VRM bones. `movementAvatarAimApplication.ts` owns vector-aim visibility gating, fallback/last-good application, direction conversion, and local quaternion mutation. `vrmRigging.ts` owns relaxed-arm, last-good, and hand-neutral fallback target/execution wrappers, including direct relaxed-arm, last-good, and hand-neutral bone application. Renderer still resolves VRM bones and supplies last-good storage. |
| Lower-body target selection and legacy aim fallback | 1073-1094, 1585-1690 | `movement-decision` plus `avatar-application` | Partial | `movementAvatarLowerBodyTargetSelection.ts` now composes shared knee/ankle/toe selections and fallbacks. Legacy aim recipe selection, concrete aim request composition, fallback gating, request execution mechanics, vector-aim mutation, neutral pose specs, solved lower-body flex specs, lower-body rotation-spec execution mechanics, lower-body named/solved VRM write wrappers, non-retarget lower-body plan VRM execution, retarget post-plan VRM execution, lower-body retarget legacy-aim final vector application, generic rig-rotation target construction/last-good gating, and instructor foot-plant request/execution/contact/VRM write mechanics are shared, including batch foot-plant request execution against VRM bones. `VrmAvatar` still owns bone lookup, last-good storage, and scene-dependent planted IK wiring. |
| Planted squat IK | 1182-1220, 1615-1620, 1670-1677 | `avatar-application` | Partial | Policy result, basis-direction math, world-direction specs, execution/counting, applied-depth resolution, rest-map lifetime, and rest-mapped bone mutation now live in `_lib`; renderer supplies only VRM bone lookup and rest-map refresh/storage callbacks. |
| Planted foot lock | 1222-1308, 1983 | `avatar-application` | Partial | `movementAvatarFootLock.ts` now owns lock state transitions, strength, drift reset, correction math, and root-correction execution gating/scale calculation. Renderer still reads VRM foot world positions and supplies the final root-vector write callback. |
| Support contact locks and presentation | 1310-1401, 1705-1717 | `avatar-application` | Partial | Good consumer of shared support decisions. Support-presentation lower-body, spine, and arm rotation-spec execution and final VRM bone write mechanics now use shared helpers. Support-contact weighted root correction math, root-correction execution gating, residual bone-correction execution/counting, bone-correction local-position sequencing, anchor sampling, and final root/bone object mutation are shared; renderer supplies only root, scene, floor, and bone lookup. |
| Spine application | 1486-1524 | `avatar-application` with fallback policy | Partial | Active, solver fallback, and neutral spine recipe resolution/application wrappers, active/solver/neutral branch dispatch, generic rig-rotation target construction/last-good gating, rotation-spec execution, and final VRM bone slerp/write mechanics now come from shared helpers. Renderer supplies only spine bone lookup and last-good storage callbacks. |
| Head application | 1719-1828 | `movement-decision` plus `avatar-application` | Partial | `movementAvatarHeadTarget.ts` resolves raw head, head intent, calibrated target, apply options, and root-relative yaw. `movementAvatarHeadApplication.ts` now owns head/neck quaternion conversions, head/neck target execution, offset-vector conversion, head offset execution, upper-chest compensation execution, full head application sequencing, and VRM bone lookup/write orchestration for head, neck, and upper chest. Renderer still keeps the debug head-node read. |
| Debug/fallback labels and global registry | 1830-1947, 1992-2023 | `presentation-debug` | Temporary | Valuable for Replay Lab proof; extract after target decision shape stabilizes. |
| Blendshape and finger rig application | 2025-2099 | `avatar-application` | Partial | `vrmRigging.ts` now owns blendshape-to-expression target mapping, hand solve orchestration, hand rotation target selection, wrist skipping, finger/thumb tuning, target-quaternion construction, target execution wrappers, expression-manager write orchestration, and hand-bone target orchestration. Renderer now supplies only the current expression manager and hand-bone lookup callback. |

## Route And Role Branches

| Branch | Current Reason | Plan Status |
| --- | --- | --- |
| `usesPlayerMotionPath = isPlayer && motionMode !== "recorded"` | Separates live player input from recorded instructor/replay input. | Keep as temporary input adapter only; do not add movement-family policy here. |
| `resolveMovementAvatarStudioDecision` vs `resolveMovementAvatarReplayDecision` | Compatibility wrappers for parity harnesses and migration tests. | Quarantined in `movementAvatarLegacyDecision.ts`; runtime paths should use `MovementSourceFrame -> MovementMotionFrame`. |
| Player display mirroring | Player faces the child and needs display-side mapping. | Explicit `MovementMirrorMode` exists in `MovementMotionFrame`; keep removing hidden route/renderer swaps as proof allows. |
| Player lower-body hold/squat/leg-raise branches | Keeps live child movement readable and stable. | Stage/action decisions are mostly shared, but renderer still stores hold state and supplies final application callbacks. Move remaining state into the shared motion/gameplay path only with replay/eval proof. |
| Instructor recorded retarget branches | Applies saved proof motion and contact presentation. | Keep only as avatar application fed by shared replay result. |

## Migration Checklist

- [x] Record which helpers are renderer plumbing versus movement policy.
- [x] Identify every remaining player-vs-recorded branch and its reason.
- [x] Identify decisions already delegated to `_lib`.
- [x] Pass a `MovementSourceFrame` or `MovementMotionFrame` into `VrmAvatar` from current proof and practice routes instead of rebuilding source/adaptation inside the frame loop. `VrmAvatar` now requires the `motionFrameRef` socket; the synthetic proof route, Replay Lab, main Game Studio live player avatar, and main Game Studio recorded instructor avatar are wired. The synthetic upper-body auto-calibration proof owns setup state at the route adapter level. Missing current frames now use presentation standby instead of renderer-local movement decision fallback.
- [x] Move auto-calibration/start-readiness setup behind a shared helper.
- [x] Move exercise transition state out of renderer-local pose refs.
- [x] Extract lower-body target ownership/stage resolution into a shared helper.
- [x] Extract head target composition into a shared helper.
- [x] Extract root target composition into a shared helper.
- [x] Extract root transform interpolation into a shared helper.
- [x] Extract root transform execution into a shared helper.
- [x] Extract root step-foot target calculation into a shared helper.
- [x] Extract root step-foot nullable execution into a shared helper.
- [x] Extract root step-foot world-to-local execution sequencing into a shared helper.
- [x] Extract arm target composition into a shared helper.
- [x] Extract lower-body target-selection composition into a shared helper.
- [x] Extract instructor foot-plant request execution/contact gating into a shared helper.
- [x] Extract solved lower-body rig-rotation execution mechanics into a shared helper.
- [x] Extract instructor foot-plant batch VRM execution into `movementAvatarLowerBodyApplication`.
- [x] Extract avatar rest-pose map builder and retarget mapping constants into a shared helper.
- [x] Extract segment-to-local-quaternion target math into a shared helper.
- [x] Extract rest-map refresh and optional last-good storage sequencing into a shared helper.
- [x] Extract retarget segment mapping execution/counting into a shared helper.
- [x] Extract planted-IK basis-direction math into a shared helper.
- [x] Extract planted-IK world-direction spec execution/counting into a shared helper.
- [x] Extract planted-IK and retarget segment rest-mapped world-direction final application into shared helpers.
- [x] Extract planted foot-lock state and correction math into a shared helper.
- [x] Extract planted foot-lock root-correction execution gating into a shared helper.
- [x] Extract support-contact root-correction execution gating into a shared helper.
- [x] Extract support-contact residual bone-correction execution/counting into a shared helper.
- [x] Extract support-contact bone-correction local-position execution sequencing into a shared helper.
- [x] Extract support-contact anchor sampling and final root/bone object mutation into a shared helper.
- [x] Extract root transform and root step-foot final Three.js object application into a shared helper.
- [x] Extract head/neck quaternion and offset conversion math into a shared helper.
- [x] Extract head/neck quaternion target execution into a shared helper.
- [x] Extract head position-offset, base-position sequencing, local-position lerp, and upper-chest compensation execution into a shared helper.
- [x] Extract hand rotation target selection and finger/thumb tuning into `vrmRigging`.
- [x] Extract hand solve target batching and blendshape-to-expression target mapping into `vrmRigging`.
- [x] Extract hand rotation and blendshape expression target execution wrappers into `vrmRigging`.
- [x] Extract blendshape expression-manager writes into `vrmRigging`.
- [x] Extract hand target-quaternion construction into `vrmRigging`.
- [x] Extract hand rotation target bone-slerp execution into `vrmRigging`.
- [x] Extract blendshape manager and hand-bone orchestration wrappers into `vrmRigging`.
- [x] Extract arm relaxed, last-good, and hand-neutral fallback target/execution wrappers into `vrmRigging`.
- [x] Extract relaxed-arm and hand-neutral final bone application into `vrmRigging`.
- [x] Extract arm stored-quaternion hold slerp execution into `vrmRigging`.
- [x] Extract last-good arm final bone application into `vrmRigging`.
- [x] Extract tracked arm aim final vector application into shared helpers.
- [x] Extract arm application VRM callback wiring into `movementAvatarArmApplication`.
- [x] Extract non-retarget lower-body plan VRM execution into `movementAvatarLowerBodyApplication`.
- [x] Extract retarget post-plan lower-body VRM execution into `movementAvatarLowerBodyApplication`.
- [x] Extract generic rig-rotation target construction, limit/scale handling, and last-good gating into `vrmRigging`.
- [x] Extract demo fallback pose rotation target selection into `vrmRigging`.
- [x] Route generic eased bone rotation application through the shared `vrmRigging` target/application contract.
- [x] Extract generic named-rotation final bone slerp execution into `vrmRigging`.
- [x] Extract single named-rotation final bone slerp execution into `vrmRigging`.
- [x] Extract demo fallback/standby pose target execution into `vrmRigging`.
- [x] Extract named rotation target batch execution/counting into `vrmRigging`.
- [x] Wire active, solver fallback, and neutral spine application through shared spine specs.
- [x] Extract active, solver, and neutral spine rotation-spec execution mechanics into a shared helper.
- [x] Extract active/solver/neutral spine branch dispatch and final VRM bone write mechanics into a shared helper.
- [x] Extract lower-body neutral, squat-flexion, single-leg-raise, solved-lower-body, instructor foot-plant, and support-presentation final VRM write mechanics into shared helpers.
- [x] Extract lower-body retarget legacy-aim final vector application into shared helpers.
- [x] Extract head/neck/upper-chest final VRM write orchestration into `movementAvatarHeadApplication`.
- [x] Extract avatar visual telemetry construction into a shared debug helper.
- [x] Extract foot-lock debug patching and retarget debug registry writes into a shared debug helper.
- [x] Extract avatar root debug telemetry assembly into a shared debug helper.
- [x] Extract final tracking debug-state assembly into a shared debug helper.
- [x] Extract shared normalized VRM bone lookup adaptation into `vrmRigging`.
- [x] Quarantine legacy Replay/Studio avatar decision wrappers outside the core pipeline module.
- [ ] Replace the remaining lower-body branch-specific bone application with a shared avatar application contract. Shared helpers now resolve lower-body stage actions, non-retarget mode dispatch, retarget aftermath policy, retarget segment count accumulation, retarget applied-decision handoff/input composition, retarget post-plan overlay sequencing, the legacy lower-body aim recipe/request composition/gating/execution/application mechanics, vector-aim mutation, live arm application dispatch and tracked arm aim execution, head/neck/upper-chest application sequencing, neutral/squat/leg-raise/solved lower-body pose recipe resolution/execution/write wrappers, active/solver/neutral spine recipe resolution/execution/write mechanics, instructor foot-plant pose execution/write mechanics, non-retarget squat pose bundling, lower-body and support-presentation rotation-spec execution/write mechanics, support-contact correction/object-mutation mechanics, planted IK world-direction specs/application, retarget segment world-direction specs/application, retarget/planted rest-mapped bone mutation, rest-mapped bone lookup/rest-map lifetime sequencing, debug telemetry assembly, and shared normalized-bone lookup adaptation outside the branch-specific logic; remaining work is mostly route/lifecycle-only cleanup and eventual removal of quarantined compatibility wrappers when parity harnesses no longer need them.
- [ ] Extract pure avatar application helpers after replay evals prove parity.

## Non-Negotiable Cleanup Order

1. Keep current behavior stable while the eval gate expands.
2. Keep recorded replay analysis one-command reproducible from repo state, including Convex file-storage exports where needed. Use the manifest-driven `movement:replay:proof-set -- --manifest <proof-manifest>` flow, then feed Replay Lab capture manifests back through `movement:replay:analyze -- --visual-captures <dir>`. Treat warning/manual-review manifest rows as blockers for broad avatar extraction even when `automatedStatus` has passed and visual capture evidence is attached.
3. Only then continue extracting pure avatar application helpers such as remaining setup/root-motion state, hold state, VRM lookup/write callbacks, and debug telemetry plumbing.
