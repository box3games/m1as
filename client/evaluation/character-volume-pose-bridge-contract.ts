/**
 * Renderer-neutral character volume / skeletal-pose bridge.
 *
 * A measured or authored envelope is shared across 2D, 2.5D and 3D. Compression
 * changes the requested envelope and pose intent; it never silently changes
 * authoritative growth scale or directly writes a rig/sprite transform.
 */

export const CHARACTER_VOLUME_POSE_SCHEMA_VERSION =
  "big3r-character-volume-pose/1.0" as const;

export type CharacterPoseKind =
  | "neutral-standing"
  | "spine-hunch"
  | "compressed-squat"
  | "tucked-squat"
  | "deep-squat"
  | "seated-v"
  | "crawl"
  | "custom";

export type CharacterRepresentationTarget = "2d" | "2.5d" | "3d";

export interface CharacterDimensionsMeters {
  width: number;
  height: number;
  depth: number;
}

export interface CharacterVolumeEnvelope {
  envelopeId: string;
  subjectId: string;
  /** Uncompressed reference envelope, independent of actual growth scale. */
  referenceDimensionsMeters: CharacterDimensionsMeters;
  /** Current measured/authored envelope before this plan is applied. */
  currentDimensionsMeters: CharacterDimensionsMeters;
  coordinateSpace: "subject-local" | "stage-world";
  provenance: string;
}

export interface CharacterPoseJointTarget {
  /** Exact runtime bone ID or authored semantic joint ID. */
  jointId: string;
  channel: "rotation-x" | "rotation-y" | "rotation-z" | "translation-x" | "translation-y" | "translation-z";
  value: number;
  unit: "radians" | "meters";
}

export interface CharacterVolumePoseRequest {
  requestId: string;
  subjectId: string;
  poseKind: CharacterPoseKind;
  /** Compression ratios applied to the current envelope, independently per axis. */
  envelopeScale: CharacterDimensionsMeters;
  /** Optional authored joint targets; no bone names are inferred by this contract. */
  jointTargets?: CharacterPoseJointTarget[];
  supportedRepresentations: CharacterRepresentationTarget[];
  simulationTimeSeconds: number;
  configurationVersion: string;
  growthStateId: string;
}

export interface CharacterVolumePosePlan {
  schemaVersion: typeof CHARACTER_VOLUME_POSE_SCHEMA_VERSION;
  requestId: string;
  subjectId: string;
  poseKind: CharacterPoseKind;
  sourceEnvelopeId: string;
  referenceDimensionsMeters: CharacterDimensionsMeters;
  sourceDimensionsMeters: CharacterDimensionsMeters;
  targetDimensionsMeters: CharacterDimensionsMeters;
  compressionRatios: CharacterDimensionsMeters;
  /** 2D retains the projected square/rectangle; depth is retained in the shared plan. */
  projection: {
    twoD: { widthRatio: number; heightRatio: number };
    twoPointFiveD: { widthRatio: number; heightRatio: number; depthRatio: number };
    threeD: { widthRatio: number; heightRatio: number; depthRatio: number };
  };
  jointTargets: CharacterPoseJointTarget[];
  supportedRepresentations: CharacterRepresentationTarget[];
  simulationTimeSeconds: number;
  configurationVersion: string;
  growthStateId: string;
  authority: {
    actualGrowthScaleModified: false;
    skeletonTransformsApplied: false;
    spriteTransformsApplied: false;
    physicsExecuted: false;
    animationRendered: false;
  };
}

const POSES: readonly CharacterPoseKind[] = [
  "neutral-standing", "spine-hunch", "compressed-squat", "tucked-squat",
  "deep-squat", "seated-v", "crawl", "custom",
];
const REPRESENTATIONS: readonly CharacterRepresentationTarget[] = ["2d", "2.5d", "3d"];
const finitePositive = (value: number): boolean => Number.isFinite(value) && value > 0;
const nonEmpty = (value: string): boolean => typeof value === "string" && value.trim().length > 0;

function validateDimensions(value: CharacterDimensionsMeters, label: string): void {
  if (!value || !finitePositive(value.width) || !finitePositive(value.height) ||
      !finitePositive(value.depth)) {
    throw new RangeError(`${label} width, height and depth must be finite positive metres.`);
  }
}

export function validateCharacterVolumeEnvelope(envelope: CharacterVolumeEnvelope): void {
  if (!envelope || !nonEmpty(envelope.envelopeId) || !nonEmpty(envelope.subjectId)) {
    throw new TypeError("Volume envelope identity is required.");
  }
  validateDimensions(envelope.referenceDimensionsMeters, "Reference envelope");
  validateDimensions(envelope.currentDimensionsMeters, "Current envelope");
  if (envelope.coordinateSpace !== "subject-local" && envelope.coordinateSpace !== "stage-world") {
    throw new TypeError("Volume envelope coordinateSpace is unsupported.");
  }
  if (!nonEmpty(envelope.provenance)) throw new TypeError("Volume envelope provenance is required.");
}

export function buildCharacterVolumePosePlan(
  envelope: CharacterVolumeEnvelope,
  request: CharacterVolumePoseRequest,
): CharacterVolumePosePlan {
  validateCharacterVolumeEnvelope(envelope);
  if (!request || !nonEmpty(request.requestId) || request.subjectId !== envelope.subjectId) {
    throw new TypeError("Pose request identity must match the volume envelope subject.");
  }
  if (!POSES.includes(request.poseKind)) throw new TypeError("Pose kind is unsupported.");
  if (!Array.isArray(request.supportedRepresentations) ||
      request.supportedRepresentations.length === 0 ||
      request.supportedRepresentations.some(kind => !REPRESENTATIONS.includes(kind)) ||
      new Set(request.supportedRepresentations).size !== request.supportedRepresentations.length) {
    throw new TypeError("At least one unique supported representation target is required.");
  }
  if (!Number.isFinite(request.simulationTimeSeconds) || request.simulationTimeSeconds < 0 ||
      !nonEmpty(request.configurationVersion) || !nonEmpty(request.growthStateId)) {
    throw new TypeError("Pose request timing, configuration and growth-state provenance are required.");
  }
  validateDimensions(request.envelopeScale, "Envelope scale");
  const targetDimensionsMeters = {
    width: envelope.currentDimensionsMeters.width * request.envelopeScale.width,
    height: envelope.currentDimensionsMeters.height * request.envelopeScale.height,
    depth: envelope.currentDimensionsMeters.depth * request.envelopeScale.depth,
  };
  validateDimensions(targetDimensionsMeters, "Target envelope");
  const jointTargets = request.jointTargets ?? [];
  const jointKeys = new Set<string>();
  for (const target of jointTargets) {
    if (!nonEmpty(target.jointId) || !["rotation-x", "rotation-y", "rotation-z",
      "translation-x", "translation-y", "translation-z"].includes(target.channel) ||
      !Number.isFinite(target.value) ||
      (target.unit !== "radians" && target.unit !== "meters")) {
      throw new TypeError("Joint targets require an ID, supported channel, finite value and unit.");
    }
    const key = `${target.jointId}:${target.channel}`;
    if (jointKeys.has(key)) throw new TypeError(`Duplicate joint target ${key}.`);
    jointKeys.add(key);
  }
  const ratios = {
    width: targetDimensionsMeters.width / envelope.referenceDimensionsMeters.width,
    height: targetDimensionsMeters.height / envelope.referenceDimensionsMeters.height,
    depth: targetDimensionsMeters.depth / envelope.referenceDimensionsMeters.depth,
  };
  return {
    schemaVersion: CHARACTER_VOLUME_POSE_SCHEMA_VERSION,
    requestId: request.requestId,
    subjectId: request.subjectId,
    poseKind: request.poseKind,
    sourceEnvelopeId: envelope.envelopeId,
    referenceDimensionsMeters: { ...envelope.referenceDimensionsMeters },
    sourceDimensionsMeters: { ...envelope.currentDimensionsMeters },
    targetDimensionsMeters,
    compressionRatios: { ...request.envelopeScale },
    projection: {
      twoD: { widthRatio: ratios.width, heightRatio: ratios.height },
      twoPointFiveD: { widthRatio: ratios.width, heightRatio: ratios.height, depthRatio: ratios.depth },
      threeD: { widthRatio: ratios.width, heightRatio: ratios.height, depthRatio: ratios.depth },
    },
    jointTargets: jointTargets.map(target => ({ ...target })),
    supportedRepresentations: [...request.supportedRepresentations],
    simulationTimeSeconds: request.simulationTimeSeconds,
    configurationVersion: request.configurationVersion,
    growthStateId: request.growthStateId,
    authority: {
      actualGrowthScaleModified: false,
      skeletonTransformsApplied: false,
      spriteTransformsApplied: false,
      physicsExecuted: false,
      animationRendered: false,
    },
  };
}
