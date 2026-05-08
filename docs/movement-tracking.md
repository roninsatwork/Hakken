# Sonae Movement Tracking Architecture

This document outlines the coordinate system mapping and geometry rules required to accurately translate 2D/3D tracking data (MediaPipe) into VRM avatar kinematics (Kalidokit + Three.js).

## 🧮 Coordinate Systems & The "Double-Flip" Trap

The tracking system relies on three conflicting coordinate spaces. Understanding how they interact is critical to preventing limb-crossing and backwards-facing avatars.

### 1. MediaPipe (`worldLandmarks`)
- **Y-Axis**: Down (Positive = Down)
- **X-Axis**: Points from the subject's left to right. For a mirrored webcam (which acts like a physical mirror), **+X points LEFT on the screen**.
- **Z-Axis**: Away from the camera (Positive = Away)

### 2. Three.js (Absolute World Space)
- **Y-Axis**: Up
- **X-Axis**: Right (Positive = Right)
- **Z-Axis**: Towards the camera (Positive = Towards Viewer)

### 3. VRM Models (Default Pose)
- **Facing**: Native VRMs face the **-Z axis** (deep into the screen, showing their back to the camera).

## 📐 The "Golden State" Implementation

To achieve 1:1 fluid tracking with zero "Exorcist" heads or crossed limbs, we enforce a strict **Pure Data / Mirrored Group** architecture.

### Rule 1: Rotate the Parent Group, Not the Math
Do **not** use Euler inversions or manual bone-swapping to force the avatar to face the user.
Instead, let the physics engine process the raw data naturally, and simply rotate the entire VRM container 180 degrees:
```tsx
<group rotation={[0, Math.PI, 0]}>
  <primitive object={vrm} />
</group>
```

### Rule 2: Pure Data to Kalidokit (No Mirroring)
Kalidokit's solver expects raw, un-tampered data. If you invert `imageLms` or `worldLandmarks` before feeding them to `Pose.solve()`, Kalidokit will detect impossible torso geometry (e.g., chest facing backward, depth facing forward) and default to a rigid `0` rotation for the spine.

### Rule 3: The 2D Fallback Must Match `worldLandmarks` Space
When older recordings lack true 3D `worldLandmarks`, the system fakes depth using 2D `imageLms`. This fallback **must** mimic the `worldLandmarks` coordinate space exactly:
```tsx
// Correct 2D Fallback: Positive X must flow the same way as worldLandmarks
solverLms = imageLms.map((lm) => ({
  x: (lm.x - hipX) * 3.0, // DO NOT INVERT THIS WITH A MINUS SIGN
  y: (lm.y - hipY) * 3.0,
  z: lm.z * 3.0
}));
```

### Rule 4: Absolute World-Space Vectors for Arms (`aimBone`)
We use absolute `THREE.Vector3` directions to map the MediaPipe sticks directly to the VRM arms. Because the parent group is rotated 180 degrees (Rule 1), we do **not** invert the X-axis in our vector math.

```tsx
// Correct aimBone Vector Math
const desiredDir = new THREE.Vector3(
  (p2.x - p1.x),   // Raw X (No minus sign)
  -(p2.y - p1.y),  // Invert Y (MediaPipe Down -> Three.js Up)
  -dz              // Invert Z
).normalize();
```

### Rule 5: Negate Kalidokit's Automatic Head Flip
Because Kalidokit assumes the VRM natively faces backwards (-Z), when it detects the user looking at the camera, it forcefully applies a 180-degree (`Math.PI`) Y-rotation to the Head bone to make the avatar look at the screen. 
Since we already spun the entire root group 180 degrees (Rule 1), Kalidokit's added rotation spins the head backwards (360 degrees total). We must safely strip it out:

```tsx
// Inside applyRot
if (boneName === "head") { targetEuler.y -= Math.PI; }
```

---

> **⚠️ DO NOT REVERT THESE GEOMETRY DECISIONS**
> Any attempt to re-introduce manual `-` signs into the `aimBone` X-axis or the 2D fallback array will instantly cause the arms to cross the chest and point inwards. Keep the physics data pure and rely on the root group rotation to handle the visual orientation.
