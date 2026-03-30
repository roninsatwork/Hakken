const { GoogleGenAI } = require("@google/genai");

function printTypes() {
  console.log("Checking @google/genai setup...");
  try {
      // Create with deliberate error to see what it expects
      const ai = new GoogleGenAI({ vertexai: { project: 'sonae-dev-491717', location: 'global', apiKey: 'fake' } });
      console.log("Accepted payload?");
  } catch(e) {
      console.log(e);
  }
}
printTypes();
