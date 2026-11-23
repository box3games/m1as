import type {
  CharacterAnimationCapabilityReport,
} from "../animation/character-animation-capability-adapter.js";
import type {
  CharacterPoseJointTarget,
  CharacterVolumePosePlan,
} from "./character-volume-pose-bridge-contract.js";

export interface CharacterPoseDispatchResult {
  accepted: boolean;
  targetId: string;
  requestId: string;
  subjectId: string;
  pipeline: "BIG3R" | "VFXR";
  status: "dispatched" | "unsupported" | "rejected";
  reason?: string;
  telemetry?: Record<string, string | number | boolean>;
}

/** A BIG3R rig target must explicitly confirm each joint channel it can safely accept. */
export interface Big3rRigPoseTarget {
  targetId: string;
  rigId: string;
  supportsJointTarget(target: CharacterPoseJointTarget): boolean;
  submitPoseEvaluation(plan: CharacterVolumePosePlan): Promise<{
    accepted: boolean;
    reason?: string;
    telemetry?: Record<string, string | number | boolean>;
  }> | {
    accepted: boolean;
    reason?: string;
    telemetry?: Record<string, string | number | boolean>;
  };
}

/** VFXR target receives the same plan as a 2D authoring/render request; it owns rendering. */
export interface VfxrPoseAuthoringTarget {
  targetId: string;
  supportsPoseKind(poseKind: CharacterVolumePosePlan["poseKind"]): boolean;
  submitPoseAuthoringRequest(plan: CharacterVolumePosePlan): Promise<{
    accepted: boolean;
    reason?: string;
    telemetry?: Record<string, string | number | boolean>;
  }> | {
    accepted: boolean;
    reason?: string;
    telemetry?: Record<string, string | number | boolean>;
  };
}

function result(
  pipeline: "BIG3R" | "VFXR",
  targetId: string,
  plan: CharacterVolumePosePlan,
  accepted: boolean,
  reason?: string,
  telemetry?: Record<string, string | number | boolean>,
): CharacterPoseDispatchResult {
  return {
    accepted, targetId, requestId: plan.requestId, subjectId: plan.subjectId,
    pipeline, status: accepted ? "dispatched" : "rejected",
    ...(reason ? { reason } : {}),
    ...(telemetry ? { telemetry } : {}),
  };
}

/**
 * Dispatches only to an explicitly supplied BIG3R rig target whose discovered
 * topology matches the target rig. It never writes bone transforms itself.
 */
export class Big3rCharacterPoseAdapter {
  constructor(
    private readonly report: CharacterAnimationCapabilityReport,
    private readonly target: Big3rRigPoseTarget,
  ) {}

  async dispatch(plan: CharacterVolumePosePlan): Promise<CharacterPoseDispatchResult> {
    if (!plan.supportedRepresentations.includes("3d")) {
      return { ...result("BIG3R", this.target.targetId, plan, false, "Pose plan does not declare 3D support."), status: "unsupported" };
    }
    if (this.report.executionStatus !== "discovery_only" || !this.report.topologyValidation.valid) {
      return { ...result("BIG3R", this.target.targetId, plan, false, "Rig capability report is invalid or unavailable."), status: "unsupported" };
    }
    if (this.report.rig.rigId !== this.target.rigId) {
      return { ...result("BIG3R", this.target.targetId, plan, false, "Target rig identity does not match discovered rig."), status: "unsupported" };
    }
    for (const joint of plan.jointTargets) {
      if (!this.report.topology.boneIds.includes(joint.jointId) || !this.target.supportsJointTarget(joint)) {
        return { ...result("BIG3R", this.target.targetId, plan, false, `Joint target ${joint.jointId}:${joint.channel} is not explicitly supported.`), status: "unsupported" };
      }
    }
    const applied = await this.target.submitPoseEvaluation(plan);
    return result("BIG3R", this.target.targetId, plan, applied.accepted, applied.reason, applied.telemetry);
  }
}

/** Dispatches the same pose/envelope intent to a VFXR 2D authoring target. */
export class VfxrCharacterPoseAdapter {
  constructor(private readonly target: VfxrPoseAuthoringTarget) {}

  async dispatch(plan: CharacterVolumePosePlan): Promise<CharacterPoseDispatchResult> {
    if (!plan.supportedRepresentations.includes("2d")) {
      return { ...result("VFXR", this.target.targetId, plan, false, "Pose plan does not declare 2D support."), status: "unsupported" };
    }
    if (!this.target.supportsPoseKind(plan.poseKind)) {
      return { ...result("VFXR", this.target.targetId, plan, false, `VFXR target does not support pose kind ${plan.poseKind}.`), status: "unsupported" };
    }
    const submitted = await this.target.submitPoseAuthoringRequest(plan);
    return result("VFXR", this.target.targetId, plan, submitted.accepted, submitted.reason, submitted.telemetry);
  }
}
