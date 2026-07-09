export type MovementAvatarLowerBodyNonRetargetApplicationResult = {
  feetOwner: string | null;
  handled: boolean;
  lowerBodyOwner: string | null;
  plantedSquatIkDepth: number | null;
};

export type MovementAvatarLowerBodyRetargetPostPlanApplicationResult = {
  appliedLegRaiseOverlay: boolean;
  appliedSolvedLowerBody: boolean;
  appliedSquatFlexion: boolean;
  plantedSquatIkDepth: number;
};

export type MovementAvatarLowerBodyRetargetPostPlanApplicationToVrmBonesResult =
  MovementAvatarLowerBodyRetargetPostPlanApplicationResult & {
    feetOwner: string;
  };

export type MovementAvatarLowerBodySquatPoseApplicationResult = {
  appliedSquatFlexion: boolean;
  plantedSquatIkDepth: number;
};

export type MovementAvatarInstructorFootPlantSide = "left" | "right";

export type MovementAvatarInstructorFootPlantBone =
  `${MovementAvatarInstructorFootPlantSide}${"Foot" | "Toes"}`;

export type MovementAvatarInstructorFootPlantContacts = Partial<
  Record<`${MovementAvatarInstructorFootPlantSide}Foot`, boolean>
>;

export type MovementAvatarInstructorFootPlantPoseResult = {
  applied: boolean;
  appliedRotations: number;
  feetOwner: string;
};

export type MovementAvatarInstructorFootPlantRequestsToVrmBonesResult = {
  applied: number;
  feetOwner: string;
};

