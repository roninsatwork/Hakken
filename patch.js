const fs = require('fs');
const file = 'src/app/(dashboard)/demos/movements/[id]/play/page.tsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
`      if ((lms as any).worldLandmarks) {
        applyRot("rightShoulder", (rp as any).RightShoulder);
        applyRot("leftShoulder", (rp as any).LeftShoulder);
      }
      
      const hipsNode = vrmRef.current.humanoid.getNormalizedBoneNode("hips");`,
`      if ((lms as any).worldLandmarks) {
        applyRot("rightShoulder", (rp as any).RightShoulder);
        applyRot("leftShoulder", (rp as any).LeftShoulder);
      }
      
      // Restore Kalidokit base human limits for arms
      applyRot("rightUpperArm", rp.RightUpperArm);
      applyRot("rightLowerArm", rp.RightLowerArm);
      applyRot("rightHand", rp.RightHand);
      
      applyRot("leftUpperArm", rp.LeftUpperArm);
      applyRot("leftLowerArm", rp.LeftLowerArm);
      applyRot("leftHand", rp.LeftHand);
      
      const hipsNode = vrmRef.current.humanoid.getNormalizedBoneNode("hips");`
);

fs.writeFileSync(file, content);
console.log('Patched');
