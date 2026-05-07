const fs = require('fs');
const buffer = fs.readFileSync('public/robot.glb');
const jsonChunkLength = buffer.readUInt32LE(12);
const jsonBuffer = buffer.slice(20, 20 + jsonChunkLength);
const jsonStr = jsonBuffer.toString('utf8');
const gltf = JSON.parse(jsonStr);
console.log(gltf.nodes.map(n => n.name).filter(Boolean).join(', '));
