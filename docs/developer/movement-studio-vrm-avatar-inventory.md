# Movement Studio VrmAvatar Inventory

Phase 4 audit note for `docs/plans/active/movement-studio-best-practice-architecture-plan.md`.

Scope: `src/app/(dashboard)/demos/movements/[id]/play/_components/VrmAvatar.tsx`.

## Classification Key

- `runtime-ref`: React/Three/VRM object lifetime, refs, loader state, and frame loop plumbing.
- `input-cleanup`: route/role adaptation, mirroring, calibration, solver landmark preparation, or fallback source selection.
- `movement-decision`: support, scoring, tracking confidence, body intent, owner, or pose-family policy.
- `avatar-application`: converting a resolved movement decision into VRM transforms.
- `presentation-debug`: telemetry, labels, visual QA values, and debug registry output.

## Inventory

| Area | Lines | Classification | Keep In Renderer? | Notes |
| --- | ---: | --- | --- | --- |
| VRM loading, skeleton combine, avatar scene, display label | 357-458, 2103-2115 | `runtime-ref` | Yes | Renderer plumbing. Safe to leave until UI shell extraction. |
| Rest-pose and segment mapping helpers | 150-219, 1096-1180 | `avatar-application` | Partial | `movementAvatarRestPose.ts` now owns retarget mapping constants, VRM rest-pose map building, and source-segment direction conversion. `movementAvatarSegmentApplication.ts` owns rest-mapped local quaternion target math. Renderer still owns VRM mutation and smoothing. |
| Root math helpers | 228-246 | `avatar-application` | Extracted | `movementAvatarRootTarget.ts` now owns root heading/travel clamping, posture drop, jump height, and step-response target decisions. Renderer still owns Three.js interpolation and foot bone application. |
| Live root-motion history builder | 248-270, 937-943 | `input-cleanup` | No | Live-only adaptation. Should move before the shared motion pipe so Replay and Game consume the same root-motion frame contract. |
| Avatar visual telemetry | 272-340, 1985-2008 | `presentation-debug` | Temporary | Useful QA output. Should move to an avatar debug adapter once avatar application is extracted. |
| Reset refs on VRM change | 417-458 | `runtime-ref` | Yes | Object lifetime only. |
| Retarget source/root frame ref effects | 453-459 | `runtime-ref` | Yes | React ref sync only. |
| Auto-calibration inside frame loop | 760-783 | `input-cleanup` | Partial | `movementAvatarSetup.ts` now owns live/manual setup state, auto-calibration accumulation, and live source-frame/readiness metadata. Renderer still stores the setup state until it receives a full `MovementSourceFrame`/`MovementMotionFrame`. |
| Solver input preparation and player mirror branch | 512-556 | `input-cleanup` | No | Explicit mirror metadata now exists; this branch should become a source/display adapter before `MovementMotionFrame`. |
| Fallback pose when source is absent | 476-510, 514-519, 932-934 | `avatar-application` | Yes, extract later | Renderer standby pose. It should remain presentation-only and not imply movement support. |
| Studio/replay avatar decision call | 792-804 | `movement-decision` delegated | Partial | `VrmAvatar` now accepts a `motionFrameRef` and prefers `MovementMotionFrame.avatarDecision` when supplied. Route wiring is still pending, so the renderer fallback decision path remains. |
| Exercise transition in renderer | 811-815 | `movement-decision` delegated | Partial | `movementAvatarExerciseTarget.ts` now owns transition state shape and transition resolution for Replay/Game simulation and `VrmAvatar`; renderer still carries the ref until it receives a full `MovementMotionFrame`. |
| Head motion intent in renderer | 818-822 | `movement-decision` leak | No | Should be derived before avatar application from source/truth/motion frame. |
| Leg-raise hold and lower-body visual smoothing | 845-880 | `movement-decision` plus `avatar-application` | No | Policy helpers are in `_lib`, but state and mutation live here. Move decision state into shared motion/gameplay path before thinning renderer. |
| Player source-owner and lower-body owner decisions | 887-899, 1599-1703 | `movement-decision` plus `avatar-application` | Partial | `movementAvatarTarget.ts` now resolves lower-body target ownership/stage for Replay/Game simulation and `VrmAvatar`; Replay Lab/capture exposes the target stage. Renderer still applies the branch-specific bones. |
| Hips/floor/root application options | 900-930, 1951-1984 | `avatar-application` with input cleanup | Partial | Application can stay; calibrated floor source should come from source/truth/readiness contracts. |
| Root transform, jump, and step application | 944-1043, 1410-1431 | `avatar-application` | Partial | `movementAvatarRootTarget.ts` returns the shared root target and response decisions. `VrmAvatar` still applies Three.js root transforms and step foot offsets until the avatar application contract is extracted further. |
| Arm target selection | 1045-1072, 1526-1572 | `movement-decision` plus `avatar-application` | Partial | `movementAvatarArmTarget.ts` now composes player/recorded arm landmarks, hand wrist fallbacks, front-body bias, and wrist/elbow targets. Renderer still applies aim-vs-relax/hold behavior to VRM bones. |
| Lower-body target selection and legacy aim fallback | 1073-1094, 1585-1690 | `movement-decision` plus `avatar-application` | Partial | `movementAvatarLowerBodyTargetSelection.ts` now composes shared knee/ankle/toe selections and fallbacks. Legacy aim fallback and bone application still live in the renderer until the avatar application contract exists. |
| Planted squat IK | 1182-1220, 1615-1620, 1670-1677 | `avatar-application` | Partial | Policy result and basis-direction math now live in `_lib`; renderer still applies each desired direction to VRM bones. |
| Planted foot lock | 1222-1308, 1983 | `avatar-application` | Partial | `movementAvatarFootLock.ts` now owns lock state transitions, strength, drift reset, and correction math. Renderer still reads VRM foot world positions and applies the returned root correction. |
| Support contact locks and presentation | 1310-1401, 1705-1717 | `avatar-application` | Yes, extract later | Good consumer of shared support decisions. Ensure no support-family policy creeps back in. |
| Spine application | 1486-1524 | `avatar-application` with fallback policy | Partial | Active drive consumes `_lib` decision; solver fallback/neutral branch should become explicit avatar target output. |
| Head application | 1719-1828 | `movement-decision` plus `avatar-application` | Partial | `movementAvatarHeadTarget.ts` resolves raw head, head intent, calibrated target, apply options, and root-relative yaw. `movementAvatarHeadApplication.ts` now owns head/neck quaternion and offset-vector conversions. Renderer still owns VRM mutation and smoothing. |
| Debug/fallback labels and global registry | 1830-1947, 1992-2023 | `presentation-debug` | Temporary | Valuable for Replay Lab proof; extract after target decision shape stabilizes. |
| Blendshape and finger rig application | 2025-2099 | `avatar-application` | Partial | Blendshape application remains renderer-local. `vrmRigging.ts` now owns hand rotation target selection, wrist skipping, and finger/thumb tuning; renderer still solves hands and applies returned bone quaternions. |

## Route And Role Branches

| Branch | Current Reason | Plan Status |
| --- | --- | --- |
| `usesPlayerMotionPath = isPlayer && motionMode !== "recorded"` | Separates live player input from recorded instructor/replay input. | Keep as temporary input adapter only; do not add movement-family policy here. |
| `resolveMovementAvatarStudioDecision` vs `resolveMovementAvatarReplayDecision` | Studio/live and replay have different setup sources today. | Replace with `MovementSourceFrame -> MovementMotionFrame` entry point. |
| Player display mirroring | Player faces the child and needs display-side mapping. | Replace hidden renderer mirror with explicit `MovementMirrorMode`. |
| Player lower-body hold/squat/leg-raise branches | Keeps live child movement readable and stable. | Move stage decisions into shared motion/gameplay path; renderer should apply a target. |
| Instructor recorded retarget branches | Applies saved proof motion and contact presentation. | Keep only as avatar application fed by shared replay result. |

## Migration Checklist

- [x] Record which helpers are renderer plumbing versus movement policy.
- [x] Identify every remaining player-vs-recorded branch and its reason.
- [x] Identify decisions already delegated to `_lib`.
- [ ] Pass a `MovementSourceFrame` or `MovementMotionFrame` into `VrmAvatar` from each route instead of rebuilding source/adaptation inside the frame loop. `VrmAvatar` now has the `motionFrameRef` socket and prefers it when present; the synthetic proof route and Replay Lab are wired, while the main Game Studio route wiring remains.
- [x] Move auto-calibration/start-readiness setup behind a shared helper.
- [x] Move exercise transition state out of renderer-local pose refs.
- [x] Extract lower-body target ownership/stage resolution into a shared helper.
- [x] Extract head target composition into a shared helper.
- [x] Extract root target composition into a shared helper.
- [x] Extract arm target composition into a shared helper.
- [x] Extract lower-body target-selection composition into a shared helper.
- [x] Extract avatar rest-pose map builder and retarget mapping constants into a shared helper.
- [x] Extract segment-to-local-quaternion target math into a shared helper.
- [x] Extract planted-IK basis-direction math into a shared helper.
- [x] Extract planted foot-lock state and correction math into a shared helper.
- [x] Extract head/neck quaternion and offset conversion math into a shared helper.
- [x] Extract hand rotation target selection and finger/thumb tuning into `vrmRigging`.
- [ ] Replace the lower-body branch-specific bone application with a shared avatar application contract.
- [ ] Extract pure avatar application helpers after replay evals prove parity.

## Non-Negotiable Cleanup Order

1. Keep current behavior stable while the eval gate expands.
2. Make Game Studio consume the same `MovementMotionFrame` result Replay Studio reports.
3. Only then extract pure avatar application helpers such as rest-pose maps, segment quaternions, root transform, foot lock, head application, hands, and debug telemetry.
