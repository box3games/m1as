import type { CharacterPoseTransition, CharacterPoseTransitionSample } from "./character-pose-transition-contract.js";
import { sampleCharacterPoseTransition } from "./character-pose-transition-contract.js";

export interface Plane25DPoseTarget {
  targetId: string;
  planeRigId: string;
  supportsJointTarget(jointId: string, channel: string): boolean;
  submitPoseSample(sample: CharacterPoseTransitionSample): Promise<{
    accepted: boolean; reason?: string; telemetry?: Record<string, string | number | boolean>;
  }> | {
    accepted: boolean; reason?: string; telemetry?: Record<string, string | number | boolean>;
  };
}
export interface Plane25DPoseDispatchResult {
  accepted: boolean;
  status: "dispatched" | "unsupported" | "rejected";
  pipeline: "2.5D";
  targetId: string;
  planeRigId: string;
  transitionId: string;
  subjectId: string;
  elapsedSeconds: number;
  normalizedProgress: number;
  depthMeters: number;
  reason?: string;
  telemetry?: Record<string, string | number | boolean>;
}
/** Dispatches shared transition samples to an explicitly capable 2.5D plane/rig. */
export class Plane25DPoseTransitionAdapter {
  constructor(private readonly target: Plane25DPoseTarget, private readonly discoveredPlaneRigId: string) {}
  async dispatch(transition: CharacterPoseTransition, elapsedSeconds: number): Promise<Plane25DPoseDispatchResult> {
    const sample = sampleCharacterPoseTransition(transition, elapsedSeconds);
    const base = {
      pipeline: "2.5D" as const, targetId: this.target.targetId, planeRigId: this.target.planeRigId,
      transitionId: sample.transitionId, subjectId: sample.subjectId,
      elapsedSeconds: sample.elapsedSeconds, normalizedProgress: sample.normalizedProgress,
      depthMeters: sample.envelope.depth,
    };
    if (!transition.supportedRepresentations.includes("2.5d")) {
      return { ...base, accepted: false, status: "unsupported", reason: "Transition does not declare 2.5D support." };
    }
    if (this.target.planeRigId !== this.discoveredPlaneRigId) {
      return { ...base, accepted: false, status: "unsupported", reason: "Target plane/rig identity does not match discovered plane/rig." };
    }
    for (const joint of sample.jointTargets) {
      if (!this.target.supportsJointTarget(joint.jointId, joint.channel)) {
        return { ...base, accepted: false, status: "unsupported", reason: `2.5D target does not support joint channel ${joint.jointId}:${joint.channel}.` };
      }
    }
    const result = await this.target.submitPoseSample(sample);
    return { ...base, accepted: result.accepted, status: result.accepted ? "dispatched" : "rejected",
      ...(result.reason ? { reason: result.reason } : {}), ...(result.telemetry ? { telemetry: result.telemetry } : {}) };
  }
}
