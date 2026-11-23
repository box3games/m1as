import type { CharacterPoseTransition, CharacterPoseTransitionSample, PoseTransitionTargetResult, VfxrPoseTransitionTarget } from "../evaluation/character-pose-transition-adapters.js";
import type { CharacterPoseKind } from "../evaluation/character-volume-pose-bridge-contract.js";

export interface VfxrPoseSequenceFrame {
  elapsedSeconds: number;
  normalizedProgress: number;
  poseKind: CharacterPoseKind;
  envelopeMeters: { width: number; height: number };
  projectedEnvelopeRatio: { width: number; height: number };
  depthSourceMetadataMeters: number;
  sourceJointTargets: CharacterPoseTransitionSample["jointTargets"];
}
export interface VfxrPoseSequenceDocument {
  schemaVersion: "vfxr-pose-sequence/1.0";
  targetId: string;
  transitionId: string;
  subjectId: string;
  durationSeconds: number;
  configurationVersion: string;
  growthStateId: string;
  referenceEnvelopeMeters: { width: number; height: number; depth: number };
  frames: VfxrPoseSequenceFrame[];
  rendering: { spriteTransformsApplied: false; animationRendered: false; depthRendered: false };
}
export interface VfxrPoseSequenceTargetOptions {
  targetId: string;
  supportedPoseKinds: CharacterPoseKind[];
}
/**
 * A VFXR authoring document target. It records 2D envelope/keyframe intent for
 * downstream sprite, WEBM, or procedural authoring; it does not render assets.
 */
export class VfxrPoseSequenceAuthoringTarget implements VfxrPoseTransitionTarget {
  public readonly targetId: string;
  private readonly supportedPoseKinds: Set<CharacterPoseKind>;
  private readonly documents = new Map<string, VfxrPoseSequenceDocument>();

  constructor(options: VfxrPoseSequenceTargetOptions) {
    if (!options.targetId.trim()) throw new TypeError("VFXR pose sequence targetId is required.");
    if (!options.supportedPoseKinds.length) throw new TypeError("VFXR target must declare supported pose kinds.");
    this.targetId = options.targetId;
    this.supportedPoseKinds = new Set(options.supportedPoseKinds);
  }

  public supportsTransition(transition: CharacterPoseTransition): { supported: boolean; reason?: string } {
    if (!transition.supportedRepresentations.includes("2d")) return { supported: false, reason: "Transition does not declare 2D support." };
    const unsupported = transition.keyframes.find(frame => !this.supportedPoseKinds.has(frame.poseKind));
    if (unsupported) return { supported: false, reason: `VFXR authoring target does not support pose kind ${unsupported.poseKind}.` };
    return { supported: true };
  }

  public submitTransitionSample(sample: CharacterPoseTransitionSample): PoseTransitionTargetResult {
    if (!sample || !sample.transitionId.trim() || !sample.subjectId.trim() || !sample.configurationVersion.trim() || !sample.growthStateId.trim()) {
      return { accepted: false, reason: "VFXR pose sample identity and provenance are required." };
    }
    if (!sample.supportedRepresentations.includes("2d")) return { accepted: false, reason: "VFXR cannot author a sample without declared 2D support." };
    if (!this.supportedPoseKinds.has(sample.poseKind)) return { accepted: false, reason: `VFXR authoring target does not support pose kind ${sample.poseKind}.` };
    const existing = this.documents.get(sample.transitionId);
    if (existing && (existing.subjectId !== sample.subjectId ||
        existing.configurationVersion !== sample.configurationVersion || existing.growthStateId !== sample.growthStateId)) {
      return { accepted: false, reason: "Transition sample provenance does not match the existing VFXR sequence document." };
    }
    const reference = existing?.referenceEnvelopeMeters ?? {
      width: sample.envelope.width, height: sample.envelope.height, depth: sample.envelope.depth,
    };
    const frame: VfxrPoseSequenceFrame = {
      elapsedSeconds: sample.elapsedSeconds,
      normalizedProgress: sample.normalizedProgress,
      poseKind: sample.poseKind,
      envelopeMeters: { width: sample.envelope.width, height: sample.envelope.height },
      projectedEnvelopeRatio: {
        width: sample.envelope.width / reference.width,
        height: sample.envelope.height / reference.height,
      },
      depthSourceMetadataMeters: sample.envelope.depth,
      sourceJointTargets: sample.jointTargets.map(target => ({ ...target })),
    };
    const frames = existing ? [...existing.frames] : [];
    const duplicate = frames.find(item => item.elapsedSeconds === sample.elapsedSeconds);
    if (duplicate) {
      if (JSON.stringify(duplicate) !== JSON.stringify(frame)) {
        return { accepted: false, reason: "A different VFXR frame already exists at this transition time." };
      }
      return { accepted: true, telemetry: { pipeline: "VFXR", duplicateSampleSuppressed: true, authoredFrameCount: frames.length } };
    }
    frames.push(frame);
    frames.sort((a, b) => a.elapsedSeconds - b.elapsedSeconds);
    this.documents.set(sample.transitionId, {
      schemaVersion: "vfxr-pose-sequence/1.0",
      targetId: this.targetId,
      transitionId: sample.transitionId,
      subjectId: sample.subjectId,
      durationSeconds: sample.durationSeconds,
      configurationVersion: sample.configurationVersion,
      growthStateId: sample.growthStateId,
      referenceEnvelopeMeters: reference,
      frames,
      rendering: { spriteTransformsApplied: false, animationRendered: false, depthRendered: false },
    });
    return { accepted: true, telemetry: { pipeline: "VFXR", authoredFrameCount: frames.length, rendererConnected: false } };
  }

  public getDocument(transitionId: string): VfxrPoseSequenceDocument | undefined {
    const document = this.documents.get(transitionId);
    if (!document) return undefined;
    return {
      ...document,
      referenceEnvelopeMeters: { ...document.referenceEnvelopeMeters },
      frames: document.frames.map(frame => ({
        ...frame,
        envelopeMeters: { ...frame.envelopeMeters },
        projectedEnvelopeRatio: { ...frame.projectedEnvelopeRatio },
        sourceJointTargets: frame.sourceJointTargets.map(target => ({ ...target })),
      })),
      rendering: { ...document.rendering },
    };
  }

  public clearDocument(transitionId: string): boolean {
    return this.documents.delete(transitionId);
  }
}
