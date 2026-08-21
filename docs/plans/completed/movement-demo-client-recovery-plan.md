# Movement Demo Client Recovery Plan

Last updated: 2026-06-29
Status: required plan for making the posture studio demo client-ready.
Audience: engineers and future agents working on the temporary movement demo.

## Why This Plan Exists

The movement demo is pitch-critical. A large follow-on project may depend on this demo feeling credible, premium, and safe for a posture / movement coaching product for children.

The current demo has become unstable because the instructor avatar is animated by several overlapping systems:

- recorded MediaPipe landmarks
- Kalidokit / live-style pose solving
- custom landmark-to-bone aiming
- partial vector retargeting
- auto calibration
- presentation patches for squats, feet, head, and root motion

This creates circular debugging. Fixing the head reveals leg problems. Fixing legs reveals foot problems. Fixing foot noise reveals calibration problems. The system is not failing because of one bad multiplier; it is failing because multiple animation owners are fighting over the same VRM skeleton.

## Honest Verdict

Stripping away a working deterministic bone playback path, if that is what happened, was bad for this demo.

The long-term direction should still be a proper retargeter. But for the client demo, the instructor must first be boring, stable, and trustworthy. A simple deterministic guide is better than a sophisticated guide that looks broken.

The instructor should not be treated like a live student. The instructor is the reference. It should be stable and readable.

## Demo Goal

The demo should make a non-technical buyer believe:

- The coach / guide performs a clear, safe movement sequence.
- The student avatar follows without looking broken.
- The UI feels premium and calm.
- Debug tooling can prove whether any mismatch is source-data, calibration, or retargeting.

The demo does not need production-perfect biomechanics. It needs credible visual intent and no obviously broken body poses.

## Non-Negotiables

- Do not continue chasing isolated pose symptoms in `VrmAvatar.tsx`.
- Do not let instructor playback use live student calibration.
- Do not stack Kalidokit rotations, custom aiming, vector retargeting, and canned presentation poses on the same instructor bones.
- Do not drive the instructor primarily from labels such as `squat` or `knee-lift`.
- Do not hide the source skeleton debug layer.
- Do not accept a guide avatar that looks upward, crossed-legged, folded, floppy, or artificial.

## Recommended Recovery Strategy

### Phase 1: Stabilize The Instructor As A Reference

Overall roadmap: 0-35%.

Goal: make the guide avatar stable before improving player matching.

Actions:

1. Create a dedicated instructor playback path, separate from live player tracking.
2. Pick one animation owner for instructor bones.
3. Prefer a deterministic recorded-pose playback path for the guide, even if it is visually simpler.
4. Disable instructor auto calibration, live head tracking, live torso solving, and layered foot patches.
5. Keep hands and arms readable, but clamp extreme shoulder / elbow rotations aggressively.
6. Keep head and neck neutral unless a tested head retargeter is added.
7. Keep feet planted unless the recorded source clearly lifts a foot.

Acceptance:

- Instructor looks forward or slightly toward camera, never constantly up.
- Instructor can stand neutrally without feet crossing or toes twisting.
- Instructor can raise arms without shoulders folding unnaturally.
- Instructor remains stable when playback starts, pauses, resumes, and loops.
- Debug source skeleton and instructor avatar agree on timing and broad movement intent.

### Phase 2: Make Debug Mode The Arbiter

Overall roadmap: 35-50%.

Goal: stop diagnosing from screenshots alone.

Actions:

1. Make `?debugTracking=1` show:
   - source skeleton
   - frame number
   - source confidence
   - retarget source quality
   - solved / held bones
   - applied animation owner per body region
2. Add a visible instructor/player distinction in diagnostics.
3. Add a "freeze guide frame" control if the existing scrubber is not enough.
4. Add a small set of named checkpoints:
   - neutral stand
   - arms raised
   - squat / bend
   - single-knee lift, if present
5. Capture screenshots for each checkpoint as QA artifacts when tuning.

Acceptance:

- Engineers can answer "source bad or avatar bad?" in under one minute.
- A guide frame can be scrubbed and inspected without smoothing hiding the bug.
- Each body region reports which system last controlled it.

### Phase 3: Rebuild The Instructor Retarget Contract

Overall roadmap: 50-75%.

Goal: replace the mixed animation stack with a clean recorded-source retargeter.

Required contract:

```text
recorded landmarks
  -> validate frame confidence
  -> normalize / mirror into playback coordinate space
  -> choose neutral source model from stable upright frames
  -> compute body-relative segment vectors
  -> map vectors onto avatar rest bones
  -> apply limits and smoothing once
  -> emit debug state
```

The output should be one object that owns instructor bones:

```ts
type InstructorRetargetResult = {
  rotations: Partial<Record<VrmBoneName, THREE.Quaternion>>;
  positions: {
    hips?: THREE.Vector3;
    root?: THREE.Vector3;
  };
  contacts: {
    leftFoot: boolean;
    rightFoot: boolean;
  };
  debug: {
    sourceQuality: number;
    solvedBones: string[];
    heldBones: string[];
    clampedBones: string[];
    rejectedReason?: string;
  };
};
```

Rules:

- If the retargeter owns a bone, `VrmAvatar` should not also apply Kalidokit or legacy aim to that bone.
- If a frame is weak, hold the previous good pose or ease to a neutral guide pose.
- Feet should be stable by default.
- Head should be neutral until head retargeting is separately proven.

Acceptance:

- No mixed ownership of instructor hips, spine, legs, feet, or head.
- Debug output explains every held or rejected segment.
- Recorded guide playback is deterministic across refreshes.

### Phase 4: Reintroduce Player Tracking Separately

Overall roadmap: 75-90%.

Goal: preserve student tracking without polluting the instructor path.

Actions:

1. Keep player calibration and live smoothing in the player path only.
2. Compare player to guide in source-space or normalized body-space, not by reading back VRM bone rotations.
3. Make score / sync tolerant enough for demo conditions.
4. Keep player fallbacks graceful:
   - weak lower body: upper-body-only mode
   - weak hands: pose wrists
   - weak camera: preview mode message

Acceptance:

- Instructor remains stable when player tracking fails.
- Player can be imperfect without making the guide look broken.
- Score and feedback do not claim precision the demo cannot support yet.

### Phase 5: Demo Polish And Freeze

Overall roadmap: 90-100%.

Goal: freeze the demo for the client.

Actions:

1. Pick one known-good routine and avatar pairing.
2. Test the guide against the recorded playback route, not only live camera playback.
3. Fix recorded-playback issues found during QA before calling the demo slice ready.
4. Record a short QA checklist video or screenshot set.
5. Disable risky controls that invite bad states during the client demo.
6. Keep debug mode available but hidden from the normal demo path.
7. Document the exact route, routine ID, expected browser setup, and fallback if camera permission fails.

Acceptance:

- The demo can be run twice in a row without visual degradation.
- The guide looks stable at neutral, arms-raised, and squat / bend moments.
- The user-facing HUD text does not overlap the camera preview.
- A presenter has a known fallback route if live tracking misbehaves.

## Suggested Implementation Order

1. Stop and inventory current instructor bone ownership in `VrmAvatar.tsx`.
2. Add debug labels for body-region owners before more visual tuning.
3. Extract instructor playback into an explicit helper or component boundary.
4. Make instructor head neutral and feet stable by default.
5. Restore or rebuild deterministic instructor bone playback.
6. Only then tune player matching and scoring.

## Files Likely In Scope

- `src/app/(dashboard)/demos/movements/[id]/play/_components/VrmAvatar.tsx`
- `src/app/(dashboard)/demos/movements/[id]/play/_components/MovementSourceSkeleton.tsx`
- `src/app/(dashboard)/demos/movements/[id]/play/_components/MovementDebugFrameScrubber.tsx`
- `src/app/(dashboard)/demos/movements/[id]/play/_components/MovementTrackingDebugOverlay.tsx`
- `src/app/(dashboard)/demos/movements/_hooks/useMovementInstructorPlayback.ts`
- `src/app/(dashboard)/demos/movements/_lib/movementRetargeting.ts`
- `src/app/(dashboard)/demos/movements/_lib/vrmRigging.ts`

## Verification Gates

Before calling the demo client-ready:

```bash
npm run verify:env
npm run lint:all
npm run check
npm run build
git diff --check
```

Visual gates:

- Run `/demos/movements/px7fafa0wypmmc5rfz1nzmdvas88n6m0/play?guidedPreview=1`.
- Run the same route with `&debugTracking=1`.
- Test against recorded playback and fix any guide stability, timing, or retargeting issues found there.
- Capture guide at neutral, arms raised, and deepest bend / squat.
- Confirm source skeleton and avatar broad movement agree.
- Confirm instructor head is not constantly looking up.
- Confirm feet do not cross or twist during neutral stance.

## When To Stop Tuning

Stop tuning the current path if:

- A change fixes one body region but breaks another.
- The guide requires more per-avatar multipliers to look acceptable.
- The debug skeleton looks correct but the avatar remains broken.
- More than one system still controls the same instructor bone.

At that point, the right next move is to simplify ownership, not add another patch.

## Current Recommendation

For the client demo, prioritize a stable guide over full-body expressiveness.

The fastest credible path is:

```text
stable deterministic instructor
  -> clear debug proof
  -> tolerant player matching
  -> polished demo flow
```

Do not optimize for maximum motion fidelity until the guide is visually trustworthy.
