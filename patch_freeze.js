const fs = require('fs');
const file = 'src/app/(dashboard)/demos/movements/[id]/play/page.tsx';
let content = fs.readFileSync(file, 'utf8');

// Add the ref
content = content.replace(
  '  const vrmRef = useRef<any>(null);',
  '  const vrmRef = useRef<any>(null);\n  const lastGoodQuatRef = useRef<Record<string, THREE.Quaternion>>({});'
);

// Update aimVector
const oldAimVector = `      const aimVector = (boneName: string, childName: string, vStart: any, vEnd: any) => {
        const bone = vrmRef.current?.humanoid?.getNormalizedBoneNode(boneName as any);
        const child = vrmRef.current?.humanoid?.getNormalizedBoneNode(childName as any);
        if (!bone || !child || !vStart || !vEnd) return;

        // Occlusion Freeze: If tracking confidence is lost, freeze in 'Last Known Good Position'
        if (vStart.visibility < 0.5 || vEnd.visibility < 0.5) return;`;

const newAimVector = `      const aimVector = (boneName: string, childName: string, vStart: any, vEnd: any) => {
        const bone = vrmRef.current?.humanoid?.getNormalizedBoneNode(boneName as any);
        const child = vrmRef.current?.humanoid?.getNormalizedBoneNode(childName as any);
        if (!bone || !child || !vStart || !vEnd) return;

        // Aggressive Occlusion Freeze: Overpower Kalidokit's mirroring hallucination
        if (vStart.visibility < 0.2 || vEnd.visibility < 0.2) {
            if (lastGoodQuatRef.current[boneName]) {
                bone.quaternion.copy(lastGoodQuatRef.current[boneName]);
                bone.updateMatrixWorld(true);
            }
            return;
        }`;

content = content.replace(oldAimVector, newAimVector);

// Update the cache saving inside aimVector
const oldSlerp = `            const localQ = parentWorldQ.invert().multiply(targetWorldQ);
            bone.quaternion.slerp(localQ, slerpFactor);
        }
        
        bone.updateMatrixWorld(true);`;

const newSlerp = `            const localQ = parentWorldQ.invert().multiply(targetWorldQ);
            bone.quaternion.slerp(localQ, slerpFactor);
            // Cache this good rotation for the aggressive freeze
            lastGoodQuatRef.current[boneName] = bone.quaternion.clone();
        }
        
        bone.updateMatrixWorld(true);`;

content = content.replace(oldSlerp, newSlerp);

fs.writeFileSync(file, content);
console.log('Patched aggressive occlusion freeze');
