const fs = require('fs');
const buffer = fs.readFileSync('public/robot.glb');
const jsonChunkLength = buffer.readUInt32LE(12);
const jsonBuffer = buffer.slice(20, 20 + jsonChunkLength);
const gltf = JSON.parse(jsonBuffer.toString('utf8'));
console.log(gltf.meshes.map((m, i) => i + ': ' + m.name));
