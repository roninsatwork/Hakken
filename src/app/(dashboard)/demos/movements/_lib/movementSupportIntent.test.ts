import { describe, expect, it } from "vitest";
import { classifyMovementBodyOrientation } from "./movementBodyOrientation";
import {
  movementOrientationPoseWith,
  pronePoseFixture,
  quadrupedPoseFixture,
  seatedPoseFixture,
  sideLyingPoseFixture,
  supinePoseFixture,
} from "./movementBodyOrientation.testFixtures";
import {
  makeMovementAvatarProofPose,
  movementAvatarProofLandmark,
} from "./movementAvatarProofFixtures";
import { resolveMovementAvatarPipelineSupportDecision } from "./movementAvatarPipelineSupportDecision";
import { resolveMovementExercisePose } from "./movementExercisePose";
import { resolveMovementSupportContacts } from "./movementSupportContact";
import { resolveMovementSupportIntent } from "./movementSupportIntent";
import type { TrackingLandmark } from "./movementTrackingCalibration";

function supportIntentFor(poseLandmarks: TrackingLandmark[]) {
  const bodyOrientation = classifyMovementBodyOrientation(poseLandmarks);
  const bodySupport = resolveMovementSupportContacts({
    bodyOrientation,
    poseLandmarks,
  });
  const exercisePose = resolveMovementExercisePose({
    bodyOrientation,
    bodySupport,
    poseLandmarks,
  });

  return resolveMovementSupportIntent({
    bodySupport,
    exercisePose,
  });
}

function fullMotionStandingLegSetupFrame407() {
  return movementOrientationPoseWith({
    0: movementAvatarProofLandmark(0.5926747035611923, 0.32591927392913267, -0.2897100387136117, 0.9999224543571472),
    7: movementAvatarProofLandmark(0.6046958653407585, 0.31977821680065044, -0.1633827842288439, 0.9997965693473816),
    8: movementAvatarProofLandmark(0.5777220227713722, 0.3227688560611795, -0.1637389419467896, 0.9997321963310242),
    11: movementAvatarProofLandmark(0.6352799341125699, 0.38239545219843096, -0.07997825356707802, 0.9999879002571106),
    12: movementAvatarProofLandmark(0.5566497415891563, 0.3859821684268178, -0.07947680923599737, 0.9999391436576843),
    15: movementAvatarProofLandmark(0.7025802816752036, 0.5104843250525016, -0.15155722118397202, 0.9927226901054382),
    16: movementAvatarProofLandmark(0.49389234708583335, 0.505185659232198, -0.18910264513360822, 0.9693379402160645),
    23: movementAvatarProofLandmark(0.6185353594119894, 0.5458683131840673, 0.005729050887657115, 0.9999524354934692),
    24: movementAvatarProofLandmark(0.5710603653555645, 0.5430238830179706, -0.005945047004948417, 0.9999449253082275),
    25: movementAvatarProofLandmark(0.612496220512403, 0.6745984658193667, -0.01412326212139214, 0.9472421407699585),
    26: movementAvatarProofLandmark(0.5676101472533395, 0.6219438716728513, -0.2773178224670089, 0.9875432252883911),
    27: movementAvatarProofLandmark(0.6074611003886279, 0.7946351233570631, 0.1191535096803778, 0.9793522953987122),
    28: movementAvatarProofLandmark(0.5703484893964674, 0.7459488777750695, -0.15645862048644255, 0.9639856219291687),
    29: movementAvatarProofLandmark(0.6022806842721479, 0.8078130747581233, 0.12493121132077338, 0.8012266755104065),
    30: movementAvatarProofLandmark(0.5753176192088114, 0.7559039366519459, -0.1476714816188252, 0.7516450881958008),
    31: movementAvatarProofLandmark(0.609221248014777, 0.8365226736526925, -0.007350705960227727, 0.976815402507782),
    32: movementAvatarProofLandmark(0.5657315476706639, 0.801128815995169, -0.2725271653773052, 0.967499315738678),
  });
}

function standingSquatRampFrame348() {
  return movementOrientationPoseWith({
    0: movementAvatarProofLandmark(0.5450175291536259, 0.3325733028046859, -0.4163331365805952, 0.9999101758003235),
    7: movementAvatarProofLandmark(0.5640812869488142, 0.3222020743299364, -0.2699701051846683, 0.9998292326927185),
    8: movementAvatarProofLandmark(0.527364750663895, 0.3240424700923193, -0.26703585913874783, 0.9998241066932678),
    11: movementAvatarProofLandmark(0.6027561232898053, 0.4129488393998181, -0.17655930976432765, 0.9999660849571228),
    12: movementAvatarProofLandmark(0.49886128053271295, 0.41516767734368604, -0.17807395310215168, 0.9999513030052185),
    15: movementAvatarProofLandmark(0.7095354466125262, 0.5584255658159359, -0.30302638476666416, 0.9880313277244568),
    16: movementAvatarProofLandmark(0.3929952816057044, 0.5631778810243573, -0.3447936488621555, 0.9969519972801208),
    23: movementAvatarProofLandmark(0.5803059887965595, 0.6016326020890018, 0.0000049261785765478835, 0.9999882578849792),
    24: movementAvatarProofLandmark(0.5191180018998242, 0.600628723734623, -0.00027292688822815617, 0.9999893307685852),
    25: movementAvatarProofLandmark(0.5912108849744329, 0.7222675338845596, -0.27063206400001344, 0.9989529848098755),
    26: movementAvatarProofLandmark(0.4887227214147652, 0.7228802030206394, -0.293404997198611, 0.9986901879310608),
    27: movementAvatarProofLandmark(0.5750183227307695, 0.8295962323889092, 0.08517615227934701, 0.9937227964401245),
    28: movementAvatarProofLandmark(0.5173310854221443, 0.8216357451181798, 0.053164112553302285, 0.9931279420852661),
    29: movementAvatarProofLandmark(0.5677909250551392, 0.8423083261082642, 0.11660915013593112, 0.9659068584442139),
    30: movementAvatarProofLandmark(0.5250036634848693, 0.8313928545511466, 0.08651255756017937, 0.952221691608429),
    31: movementAvatarProofLandmark(0.5770915924055797, 0.8862778906162386, 0.008418204235584772, 0.9922997355461121),
    32: movementAvatarProofLandmark(0.5048997074910364, 0.8775041619613572, -0.014581886599326646, 0.9888997673988342),
  });
}

function narrowActiveLowerBodyChairCandidate() {
  return movementOrientationPoseWith({
    0: movementAvatarProofLandmark(0.5, 0.24),
    7: movementAvatarProofLandmark(0.46, 0.27),
    8: movementAvatarProofLandmark(0.54, 0.27),
    11: movementAvatarProofLandmark(0.39, 0.42),
    12: movementAvatarProofLandmark(0.61, 0.42),
    23: movementAvatarProofLandmark(0.43, 0.66),
    24: movementAvatarProofLandmark(0.57, 0.66),
    25: movementAvatarProofLandmark(0.47, 0.7, -0.22),
    26: movementAvatarProofLandmark(0.53, 0.7, -0.22),
    27: movementAvatarProofLandmark(0.47, 0.9),
    28: movementAvatarProofLandmark(0.53, 0.9),
    29: movementAvatarProofLandmark(0.46, 0.91),
    30: movementAvatarProofLandmark(0.54, 0.91),
    31: movementAvatarProofLandmark(0.45, 0.92),
    32: movementAvatarProofLandmark(0.55, 0.92),
  });
}

function asymmetricActiveLowerBodyChairCandidate() {
  return movementOrientationPoseWith({
    0: movementAvatarProofLandmark(0.5, 0.24),
    7: movementAvatarProofLandmark(0.46, 0.27),
    8: movementAvatarProofLandmark(0.54, 0.27),
    11: movementAvatarProofLandmark(0.46, 0.42),
    12: movementAvatarProofLandmark(0.54, 0.42),
    23: movementAvatarProofLandmark(0.47, 0.56),
    24: movementAvatarProofLandmark(0.53, 0.56),
    25: movementAvatarProofLandmark(0.47, 0.68, -0.02),
    26: movementAvatarProofLandmark(0.52, 0.55, -0.22),
    27: movementAvatarProofLandmark(0.47, 0.8, 0.1),
    28: movementAvatarProofLandmark(0.51, 0.69, -0.2),
    29: movementAvatarProofLandmark(0.46, 0.81, 0.1),
    30: movementAvatarProofLandmark(0.52, 0.7, -0.2),
    31: movementAvatarProofLandmark(0.47, 0.84, -0.02),
    32: movementAvatarProofLandmark(0.51, 0.72, -0.34),
  });
}

function activeLowerBodyKneelingCandidate() {
  return movementOrientationPoseWith({
    0: movementAvatarProofLandmark(0.5, 0.24),
    7: movementAvatarProofLandmark(0.46, 0.27),
    8: movementAvatarProofLandmark(0.54, 0.27),
    11: movementAvatarProofLandmark(0.46, 0.42),
    12: movementAvatarProofLandmark(0.54, 0.42),
    23: movementAvatarProofLandmark(0.47, 0.58),
    24: movementAvatarProofLandmark(0.53, 0.58),
    25: movementAvatarProofLandmark(0.47, 0.7),
    26: movementAvatarProofLandmark(0.53, 0.7),
    27: movementAvatarProofLandmark(0.47, 0.74),
    28: movementAvatarProofLandmark(0.53, 0.74),
    29: movementAvatarProofLandmark(0.46, 0.75),
    30: movementAvatarProofLandmark(0.54, 0.75),
    31: movementAvatarProofLandmark(0.45, 0.76),
    32: movementAvatarProofLandmark(0.55, 0.76),
  });
}

describe("movementSupportIntent", () => {
  it("uses active feet as supported standing anchors", () => {
    const intent = supportIntentFor(makeMovementAvatarProofPose("standing"));

    expect(intent.key).toBe("feet-floor");
    expect(intent.status).toBe("active");
    expect(intent.anchorPoints).toEqual(["leftFoot", "rightFoot"]);
  });

  it("prioritizes chair seat support over feet for seated posture", () => {
    const intent = supportIntentFor(seatedPoseFixture());

    expect(intent.key).toBe("seat-chair");
    expect(intent.primarySurface).toBe("chair");
    expect(intent.anchorPoints).toEqual(["seat"]);
  });

  it("does not turn ambiguous upright leg-lift geometry into chair support", () => {
    const pose = movementOrientationPoseWith({
      0: movementAvatarProofLandmark(0.5967310497041877, 0.32606929625033704, -0.2557812827738685),
      7: movementAvatarProofLandmark(0.6097806605713828, 0.3198233680899971, -0.13069771813947947),
      8: movementAvatarProofLandmark(0.5822901023775128, 0.3232036330155013, -0.12868123545902393),
      11: movementAvatarProofLandmark(0.6407855117062458, 0.3838415176043545, -0.056103228793142335),
      12: movementAvatarProofLandmark(0.5613826481493643, 0.3871103858733508, -0.04880757988408509),
      15: movementAvatarProofLandmark(0.6986666033617699, 0.5169355869441545, -0.1286704338212105),
      16: movementAvatarProofLandmark(0.5034663765872764, 0.512225057704416, -0.16252808778224936),
      23: movementAvatarProofLandmark(0.6204805969425525, 0.5454030626315463, 0.006018422350817393),
      24: movementAvatarProofLandmark(0.5735232598697679, 0.5373272446084999, -0.006212926769074464),
      25: movementAvatarProofLandmark(0.6134151858311916, 0.6749072762160947, -0.024754397842076777),
      26: movementAvatarProofLandmark(0.5657520583204282, 0.5298764103363212, -0.32880671544007295),
      27: movementAvatarProofLandmark(0.60721101038976, 0.7942176198283666, 0.10002485046230643),
      28: movementAvatarProofLandmark(0.5706586530684191, 0.6779414985435765, -0.24377513614200658),
      29: movementAvatarProofLandmark(0.6019102293683865, 0.8073230476481703, 0.10534469203486825),
      30: movementAvatarProofLandmark(0.5759621045253525, 0.6922953086493303, -0.23894387540245365),
      31: movementAvatarProofLandmark(0.6090195496669489, 0.8361882072886551, -0.028921218719682472),
      32: movementAvatarProofLandmark(0.5669313272730002, 0.728753961852061, -0.3671221135214482),
    });
    const bodyOrientation = classifyMovementBodyOrientation(pose);
    const bodySupport = resolveMovementSupportContacts({
      bodyOrientation,
      poseLandmarks: pose,
    });
    const exercisePose = resolveMovementExercisePose({
      bodyOrientation,
      bodySupport,
      poseLandmarks: pose,
    });
    const intent = resolveMovementSupportIntent({
      bodySupport,
      exercisePose,
    });

    expect(exercisePose.poseKey).toBe("seated-leg-lift");
    expect(intent.key).toBe("feet-floor");
    expect(intent.primarySurface).toBe("floor");
    expect(intent.anchorPoints).toEqual(["leftFoot", "rightFoot"]);
  });

  it("keeps recorded standing and squat proof frames on foot support instead of inferred chair support", () => {
    const fullMotionLegSetup = supportIntentFor(fullMotionStandingLegSetupFrame407());
    const squatRamp = supportIntentFor(standingSquatRampFrame348());

    expect(fullMotionLegSetup.key).toBe("feet-floor");
    expect(fullMotionLegSetup.primarySurface).toBe("floor");
    expect(squatRamp.key).toBe("feet-floor");
    expect(squatRamp.primarySurface).toBe("floor");
  });

  it("lets active standing lower-body evidence veto plain inferred chair support", () => {
    const pose = narrowActiveLowerBodyChairCandidate();
    const bodyOrientation = classifyMovementBodyOrientation(pose);
    const decision = resolveMovementAvatarPipelineSupportDecision({
      bodyOrientation,
      poseLandmarks: pose,
      preferFeetFloorForActiveLowerBody: true,
    });

    expect(bodyOrientation.orientation).toBe("seated");
    expect(decision.exercisePose.poseKey).toBe("standing-neutral");
    expect(decision.supportIntent.key).toBe("feet-floor");
    expect(decision.supportPresentation.owner).toBe("support-presentation-none");
  });

  it("lets active standing lower-body evidence veto asymmetric one-leg chair inference", () => {
    const pose = asymmetricActiveLowerBodyChairCandidate();
    const bodyOrientation = classifyMovementBodyOrientation(pose);
    const decision = resolveMovementAvatarPipelineSupportDecision({
      bodyOrientation,
      poseLandmarks: pose,
      preferFeetFloorForActiveLowerBody: true,
    });

    expect(bodyOrientation.orientation).toBe("seated");
    expect(decision.exercisePose.poseKey).toBe("standing-neutral");
    expect(decision.supportIntent.key).toBe("feet-floor");
    expect(decision.supportPresentation.owner).toBe("support-presentation-none");
  });

  it("keeps explicit wide-base seated support seated when active lower-body override is present", () => {
    const pose = seatedPoseFixture();
    const bodyOrientation = classifyMovementBodyOrientation(pose);
    const decision = resolveMovementAvatarPipelineSupportDecision({
      bodyOrientation,
      poseLandmarks: pose,
      preferFeetFloorForActiveLowerBody: true,
    });

    expect(bodyOrientation.orientation).toBe("seated");
    expect(decision.exercisePose.poseKey).toBe("chair-seated");
    expect(decision.supportIntent.key).toBe("seat-chair");
    expect(decision.supportPresentation.owner).toBe("support-presentation-seated");
  });

  it("lets active standing lower-body evidence veto inferred kneeling support", () => {
    const pose = activeLowerBodyKneelingCandidate();
    const bodyOrientation = classifyMovementBodyOrientation(pose);
    const supportIntent = supportIntentFor(pose);
    const decision = resolveMovementAvatarPipelineSupportDecision({
      bodyOrientation,
      poseLandmarks: pose,
      preferFeetFloorForActiveLowerBody: true,
    });

    expect(bodyOrientation.orientation).toBe("kneeling");
    expect(supportIntent.key).toBe("knees-floor");
    expect(decision.exercisePose.poseKey).toBe("standing-neutral");
    expect(decision.supportIntent.key).toBe("feet-floor");
    expect(decision.supportPresentation.owner).toBe("support-presentation-none");
  });

  it("keeps explicit deep kneeling proof support kneeling when active lower-body override is present", () => {
    const pose = makeMovementAvatarProofPose("kneeling");
    const bodyOrientation = classifyMovementBodyOrientation(pose);
    const decision = resolveMovementAvatarPipelineSupportDecision({
      bodyOrientation,
      poseLandmarks: pose,
      preferFeetFloorForActiveLowerBody: true,
    });

    expect(bodyOrientation.orientation).toBe("kneeling");
    expect(decision.exercisePose.poseKey).toBe("kneeling-floor");
    expect(decision.supportIntent.key).toBe("knees-floor");
    expect(decision.supportPresentation.owner).toBe("support-presentation-kneeling");
  });

  it("maps floor work support anchors by contact family", () => {
    expect(supportIntentFor(quadrupedPoseFixture())).toMatchObject({
      anchorPoints: ["leftHand", "rightHand", "leftKnee", "rightKnee"],
      key: "hands-knees-floor",
    });
    expect(supportIntentFor(makeMovementAvatarProofPose("yoga-plank"))).toMatchObject({
      anchorPoints: ["leftHand", "rightHand", "leftFoot", "rightFoot"],
      key: "hands-feet-floor",
    });
    expect(supportIntentFor(sideLyingPoseFixture())).toMatchObject({
      anchorPoints: ["sideBody", "leftHip", "leftShoulder", "leftElbow"],
      key: "side-body-floor",
    });
    expect(supportIntentFor(supinePoseFixture())).toMatchObject({
      anchorPoints: [
        "back",
        "leftShoulder",
        "rightShoulder",
        "leftHip",
        "rightHip",
        "leftFoot",
        "rightFoot",
      ],
      key: "back-floor",
    });
    expect(supportIntentFor(pronePoseFixture())).toMatchObject({
      anchorPoints: [
        "chest",
        "belly",
        "leftHip",
        "rightHip",
        "leftHand",
        "rightHand",
        "leftFoot",
        "rightFoot",
      ],
      key: "chest-floor",
    });
  });
});
