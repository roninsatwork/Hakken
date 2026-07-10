import movementNextProofRehearsalItems from "./movementNextProofRehearsalItems.json";

export type MovementNextProofRehearsalItem = {
  families: string[];
  freshRecordingLabel: string;
  proofCases: string[];
  quickValidationScriptCommand: string;
  rehearsal: {
    motionChecks: string[];
    setupChecks: string[];
    stopIf: string[];
    validationChecks: string[];
  };
};

export const MOVEMENT_NEXT_PROOF_REHEARSAL_ITEMS =
  movementNextProofRehearsalItems as MovementNextProofRehearsalItem[];
