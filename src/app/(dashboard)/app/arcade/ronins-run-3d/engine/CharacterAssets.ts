import * as THREE from "three";
import { batchRigidMeshes } from "./MeshBatch";
import { clothLeg, coatPanels, guardBoot, guardEyes, houndArmour, houndBody, houndMask, pointedEar, sleeve, tailoredSurface } from "./TailoredGeometry";
import { beam, cylinder, globe, lantern, rounded } from "./SceneAssets";
import { poseHands } from "./CharacterAnimation";
import { sculptedHand } from "./SculptedHand";

type Palette = Record<string, THREE.Material>;
export interface PatrolModel {
  group: THREE.Group;
  limbs: THREE.Group[];
}
const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
function ellipsoid(
  parent: THREE.Object3D,
  mat: THREE.Material,
  x: number,
  y: number,
  z: number,
  sx: number,
  sy: number,
  sz: number,
) {
  const mesh = globe(parent, mat, x, y, z, 1);
  mesh.scale.set(sx, sy, sz);
  mesh.castShadow = true;
  return mesh;
}

export function patrolModel(
  kind: "guard" | "hound",
  mats: Palette,
): PatrolModel {
  const group = new THREE.Group(),
    limbs: THREE.Group[] = [];
  if (kind === "guard") {
    group.add(coatPanels(mats.cloth));
    for (const side of [-1, 1]) {
      const lapel = rounded(
        group,
        mats.leather,
        side * 0.074,
        1.33,
        -0.172,
        0.052,
        0.37,
        0.017,
        0.007,
      );
      lapel.rotation.z = -side * 0.4;
    }
    cylinder(group, mats.leather, 0, 1.025, 0, 0.232, 0.24, 0.09, 32).scale.z = 0.72;
    rounded(group, mats.gold, 0.03, 1.023, -0.175, 0.065, 0.057, 0.013, 0.005);
    const sash = new THREE.CatmullRomCurve3([v(-0.1, 1.02, -0.176), v(-0.15, 0.97, -0.19), v(-0.105, 0.95, -0.192), v(-0.078, 0.99, -0.183)]);
    group.add(new THREE.Mesh(new THREE.TubeGeometry(sash, 16, 0.011, 5, false), mats.wrap));
    ellipsoid(group, mats.cloth, 0, 1.67, 0, 0.168, 0.22, 0.158);
    group.add(guardEyes(mats.skin));
    for (const side of [-1, 1])
      ellipsoid(
        group,
        mats.wood,
        side * 0.057,
        1.703,
        -0.153,
        0.016,
        0.004,
        0.004,
      );
    const faceWrap = new THREE.Mesh(tailoredSurface([
      [1.505, 0.081, 0.098], [1.55, 0.11, 0.134],
      [1.615, 0.15, 0.151], [1.677, 0.16, 0.16],
    ], { folds: 0.028, segments: 32 }), mats.cloth);
    group.add(faceWrap);
    // Woven conical hat, layered rim, ties and narrow radial straw ribs.
    const hat = new THREE.Mesh(new THREE.LatheGeometry([
      new THREE.Vector2(0, 0.238), new THREE.Vector2(0.035, 0.228),
      new THREE.Vector2(0.18, 0.144), new THREE.Vector2(0.33, 0.055),
      new THREE.Vector2(0.45, 0.003), new THREE.Vector2(0.448, -0.008),
      new THREE.Vector2(0.328, 0.038), new THREE.Vector2(0.17, 0.128),
      new THREE.Vector2(0.03, 0.211), new THREE.Vector2(0, 0.215),
    ], 48), mats.straw);
    hat.position.y = 1.794;
    group.add(hat);
    const brim = new THREE.Mesh(
      new THREE.TorusGeometry(0.446, 0.018, 5, 48),
      mats.wood,
    );
    brim.rotation.x = Math.PI / 2;
    brim.position.y = 1.796;
    group.add(brim);
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      beam(
        group,
        mats.straw,
        v(Math.sin(a) * 0.037, 2.022, Math.cos(a) * 0.037),
        v(Math.sin(a) * 0.44, 1.799, Math.cos(a) * 0.44),
        0.0035,
      );
    }
    for (const side of [-1, 1])
      beam(
        group,
        mats.leather,
        v(side * 0.16, 1.79, 0),
        v(side * 0.065, 1.51, -0.13),
        0.012,
      );
    for (const side of [-1, 1]) {
      const leg = new THREE.Group();
      leg.position.set(side * 0.14, 0.73, 0);
      group.add(leg);
      leg.add(clothLeg(mats.cloth));
      const knee = new THREE.Group();
      knee.name = "knee";
      knee.position.y = -0.32;
      leg.add(knee);
      ellipsoid(knee, mats.leather, 0, -0.145, 0.02, 0.075, 0.17, 0.075);
      for (let j = 0; j < 2; j++)
        cylinder(
          knee,
          mats.cloth,
          0,
          -0.045 - j * 0.145,
          0.02,
          0.082,
          0.082,
          0.012,
          12,
        );
      const ankle = new THREE.Group();
      ankle.name = "ankle";
      ankle.position.set(0, -0.32, 0);
      knee.add(ankle);
      ankle.add(guardBoot(mats.leather));
      limbs.push(leg);
      const arm = new THREE.Group();
      arm.position.set(side * 0.31, 1.38, 0);
      group.add(arm);
      ellipsoid(arm, mats.cloth, 0, -0.015, 0.015, 0.12, 0.105, 0.131);
      const upperSleeve = sleeve(mats.cloth, 0.36);
      upperSleeve.rotation.z = Math.PI;
      upperSleeve.position.set(0, -0.16, 0.01);
      upperSleeve.scale.set(1.35, 1, 1.5);
      arm.add(upperSleeve);
      const elbow = new THREE.Group();
      elbow.name = "elbow";
      elbow.position.y = -0.29;
      arm.add(elbow);
      ellipsoid(elbow, mats.leather, 0, -0.11, -0.045, 0.079, 0.16, 0.075);
      for (let j = 0; j < 2; j++)
        cylinder(
          elbow,
          mats.cloth,
          0,
          -0.04 - j * 0.125,
          -0.045,
          0.082,
          0.084,
          0.012,
          12,
        );
      ellipsoid(elbow, mats.leather, 0, -0.245, -0.06, 0.055, 0.083, 0.048);
      limbs.push(arm);
      if (side === 1) {
        const hoop = new THREE.Mesh(
          new THREE.TorusGeometry(0.08, 0.011, 5, 16),
          mats.wood,
        );
        hoop.position.set(0, -0.31, -0.06);
        elbow.add(hoop);
        lantern(elbow, 0, -0.62, -0.06, mats.paper, mats.wood);
      }
    }
    beam(group, mats.wood, v(-0.29, 0.95, 0.04), v(-0.39, 0.19, 0.16), 0.04);
    beam(group, mats.leather, v(-0.29, 0.94, 0.04), v(-0.25, 1.2, 0), 0.032);
    const guard = cylinder(
      group,
      mats.gold,
      -0.28,
      0.98,
      0.04,
      0.07,
      0.07,
      0.025,
      12,
    );
    guard.rotation.z = -0.15;
  } else {
    group.add(houndBody(mats.leather));
    for (const [front, back] of [[-0.39, -0.05], [-0.09, 0.23], [0.19, 0.44]])
      group.add(houndArmour(mats.gold, front, back));
    beam(group, mats.leather, v(0, 0.77, -0.38), v(0, 0.97, -0.55), 0.15, 0.135);
    group.add(houndMask(mats.gold));
    ellipsoid(group, mats.leather, 0, 0.93, -0.8, 0.115, 0.055, 0.17);
    ellipsoid(group, mats.gold, 0, 0.875, -0.76, 0.117, 0.045, 0.18);
    rounded(group, mats.wood, 0, 0.965, -0.937, 0.13, 0.064, 0.06);
    for (const side of [-1, 1]) {
      for (let slot = 0; slot < 4; slot++) {
        const vent = rounded(group, mats.leather, side * (0.147 - slot * 0.012),
          0.967, -0.66 - slot * 0.035, 0.009, 0.059 - slot * 0.006, 0.013, 0.004);
        vent.rotation.z = side * 0.2;
      }
      for (const z of [-0.26, -0.1, 0.06, 0.22])
        ellipsoid(group, mats.wood, side * 0.223, 0.72, z, 0.014, 0.014, 0.014);
      group.add(pointedEar(mats.gold, side));
      ellipsoid(
        group,
        mats.lit,
        side * 0.151,
        1.017,
        -0.712,
        0.038,
        0.009,
        0.019,
      );
      for (const z of [-0.31, 0.31]) {
        const leg = new THREE.Group();
        leg.position.set(side * 0.225, 0.67, z);
        group.add(leg);
        const joint = cylinder(leg, mats.gold, 0, 0, 0, 0.09, 0.09, 0.11, 16);
        joint.rotation.z = Math.PI / 2;
        const bolt = cylinder(
          leg,
          mats.wood,
          side * 0.061,
          0,
          0,
          0.038,
          0.038,
          0.016,
          8,
        );
        bolt.rotation.z = Math.PI / 2;
        beam(
          leg,
          mats.gold,
          v(0, -0.02, 0),
          v(side * 0.016, -0.23, 0.1),
          0.045,
          0.035,
        );
        const thigh = new THREE.Mesh(tailoredSurface([
          [-0.235, 0.044, 0.046, 0.095], [-0.15, 0.069, 0.077, 0.04],
          [-0.045, 0.087, 0.111, 0], [0.025, 0.062, 0.068, 0],
        ], { segments: 24, square: 0.75 }), mats.gold);
        leg.add(thigh);
        const knee = new THREE.Group();
        knee.name = "knee";
        knee.position.set(side * 0.016, -0.23, 0.1);
        leg.add(knee);
        ellipsoid(knee, mats.leather, 0, 0, 0, 0.06, 0.06, 0.06);
        beam(knee, mats.gold, v(0, 0, 0), v(0, -0.27, -0.09), 0.03, 0.045);
        for (const dx of [-0.043, 0, 0.043])
          rounded(
            knee,
            mats.leather,
            dx,
            -0.315,
            -0.125,
            0.041,
            0.07,
            0.16,
            0.025,
          );
        limbs.push(leg);
      }
    }
    const curve = new THREE.CatmullRomCurve3([
      v(0, 0.71, 0.43),
      v(0, 0.81, 0.62),
      v(0.04, 1.0, 0.84),
      v(0.09, 0.97, 1.08),
    ]);
    group.add(
      new THREE.Mesh(
        new THREE.TubeGeometry(curve, 12, 0.034, 8, false),
        mats.gold,
      ),
    );
    for (let i = 0; i < 7; i++) {
      const p = curve.getPoint(i / 7);
      ellipsoid(group, mats.leather, p.x, p.y, p.z, 0.043, 0.043, 0.043);
    }
  }
  const joints = new Set<THREE.Object3D>(limbs);
  group.traverse((object) => {
    if (["knee", "ankle", "elbow"].includes(object.name)) joints.add(object);
  });
  batchRigidMeshes(group, joints);
  return { group, limbs };
}

export function firstPersonHands(mats: Palette) {
  const hands = new THREE.Group();
  for (const side of [-1, 1]) {
    const hand = new THREE.Group();
    hand.name = side === -1 ? "left-hand" : "right-hand";
    const arm = sleeve(mats.cloth);
    arm.position.y = -0.29;
    hand.add(arm, sculptedHand(mats.leather, side));
    // Stitched reinforcement follows the back of the glove rather than a square plate.
    for (let f = 0; f < 4; f++) {
      const x = (f - 1.5) * 0.024;
      const start = 0.081 - Math.abs(f - 1.4) * 0.006;
      const seam = new THREE.CatmullRomCurve3([
        v(x, -0.025, 0.026),
        v(x, 0.04, 0.025),
        v(x, start + 0.016, 0.006),
      ]);
      hand.add(
        new THREE.Mesh(
          new THREE.TubeGeometry(seam, 10, 0.0007, 4, false),
          mats.cloth,
        ),
      );
    }
    for (let i = 0; i < 3; i++) {
      const wrap = cylinder(
        hand,
        side === -1 ? mats.wrap : mats.leather,
        0,
        -0.11 + i * 0.019,
        0,
        0.052,
        0.055,
        0.022,
        32,
      );
      wrap.scale.z = 0.76;
      wrap.rotation.z = Math.sin(i * 2) * 0.08;
    }
    if (side === -1) {
      const ribbonGeo = new THREE.PlaneGeometry(0.034, 0.16, 5, 14);
      const rp = ribbonGeo.attributes.position;
      for (let i = 0; i < rp.count; i++)
        rp.setZ(i, Math.sin(rp.getY(i) * 40) * 0.014);
      ribbonGeo.computeVertexNormals();
      const ribbon = new THREE.Mesh(ribbonGeo, mats.wrap);
      ribbon.position.set(-0.05, -0.17, 0.035);
      ribbon.rotation.z = -0.18;
      hand.add(ribbon);
      ellipsoid(hand, mats.wrap, -0.047, -0.083, 0.023, 0.022, 0.016, 0.015);
    }
    batchRigidMeshes(hand);
    hands.add(hand);
  }
  poseHands(hands, 0, false, false, 0);
  return hands;
}
