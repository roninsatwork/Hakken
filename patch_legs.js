const fs = require('fs');
const file = 'src/app/(dashboard)/demos/movements/[id]/play/page.tsx';
let content = fs.readFileSync(file, 'utf8');

const oldLegs = `      applyRot("rightUpperLeg", rp.RightUpperLeg);
      applyRot("rightLowerLeg", rp.RightLowerLeg);
      applyRot("rightFoot", (rp as any).RightFoot);
      
      applyRot("leftUpperLeg", rp.LeftUpperLeg);
      applyRot("leftLowerLeg", rp.LeftLowerLeg);
      applyRot("leftFoot", (rp as any).LeftFoot);
      
      const hipsNode = vrmRef.current.humanoid.getNormalizedBoneNode("hips");`;

const newLegs = `      // Removed Kalidokit leg physics to prevent the 'leg grouping/locking' heuristic bug
      // Pure FK (aimVector) will handle leg movements with true 3D fidelity
      const hipsNode = vrmRef.current.humanoid.getNormalizedBoneNode("hips");`;

content = content.replace(oldLegs, newLegs);
fs.writeFileSync(file, content);
console.log('Removed Kalidokit from legs to fix grouping bug');
