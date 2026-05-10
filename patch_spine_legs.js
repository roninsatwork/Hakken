const fs = require('fs');
const file = 'src/app/(dashboard)/demos/movements/[id]/play/page.tsx';
let content = fs.readFileSync(file, 'utf8');

const oldCode = `      // 1. Core Physics Path: Body, Legs, Head
      // We allow Kalidokit to establish the base Yaw (turning) and head/neck IK
      if (rp.Hips) applyRot("hips", rp.Hips.rotation);
      applyRot("chest", (rp as any).Chest);`;

const newCode = `      // 1. Core Physics Path: Body, Legs, Head
      // We allow Kalidokit to establish the base Yaw (turning) and head/neck IK
      if (rp.Hips) applyRot("hips", rp.Hips.rotation);
      applyRot("spine", rp.Spine);
      applyRot("chest", (rp as any).Chest);`;

content = content.replace(oldCode, newCode);

const oldLegs = `      const hipsNode = vrmRef.current.humanoid.getNormalizedBoneNode("hips");`;

const newLegs = `      applyRot("rightUpperLeg", rp.RightUpperLeg);
      applyRot("rightLowerLeg", rp.RightLowerLeg);
      applyRot("rightFoot", (rp as any).RightFoot);
      
      applyRot("leftUpperLeg", rp.LeftUpperLeg);
      applyRot("leftLowerLeg", rp.LeftLowerLeg);
      applyRot("leftFoot", (rp as any).LeftFoot);
      
      const hipsNode = vrmRef.current.humanoid.getNormalizedBoneNode("hips");`;

content = content.replace(oldLegs, newLegs);

fs.writeFileSync(file, content);
console.log('Restored Kalidokit spine and legs');
