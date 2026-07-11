import type { MovementAvatarPlayerSpineDrive } from "./movementAvatarPlayerSpineDriveShared";
import type { MovementAnatomicalMapping } from "./movementMirrorMapping";

export function applyMovementAnatomicalMappingToPlayerSpineDrive(
  drive: MovementAvatarPlayerSpineDrive,
  anatomicalMapping: MovementAnatomicalMapping,
): MovementAvatarPlayerSpineDrive {
  if (anatomicalMapping === "identity") return drive;
  const reverseLateral = (value: number) => value === 0 ? 0 : -value;

  return {
    ...drive,
    rotations: {
      chest: {
        ...drive.rotations.chest,
        y: reverseLateral(drive.rotations.chest.y),
        z: reverseLateral(drive.rotations.chest.z),
      },
      hips: {
        ...drive.rotations.hips,
        y: reverseLateral(drive.rotations.hips.y),
        z: reverseLateral(drive.rotations.hips.z),
      },
      spine: {
        ...drive.rotations.spine,
        y: reverseLateral(drive.rotations.spine.y),
        z: reverseLateral(drive.rotations.spine.z),
      },
      upperChest: {
        ...drive.rotations.upperChest,
        y: reverseLateral(drive.rotations.upperChest.y),
        z: reverseLateral(drive.rotations.upperChest.z),
      },
    },
    sideBend: reverseLateral(drive.sideBend),
    twist: reverseLateral(drive.twist),
  };
}
