import type {
  AuthoritativePosture,
  CharacterIntersectionKind,
  CharacterIntersectionObservation,
  MotionSourceMeasurement,
  ScaleDeformationTelemetry,
} from "./presentation-motion-contract.js";

export interface IntegrityBounds3 {
  min: { x: number; y: number; z: number };
  max: { x: number; y: number; z: number };
}

export interface IntegrityGeometrySubject {
  objectId: string;
  role: "character_region" | "clothing" | "attachment" | "environment";
  regionId?: string;
  bounds: IntegrityBounds3;
}

export interface IntegrityDetectorContext {
  subjectId: string;
  rigId: string;
  simulationTimeSeconds: number;
  posture: AuthoritativePosture;
  actualScale: MotionSourceMeasurement;
  stageRelativeScale: MotionSourceMeasurement;
  animationPhase?: string;
  experimentId?: string;
  frameNumber?: number;
  sequenceNumber?: number;
  geometry: IntegrityGeometrySubject[];
}

export type IntegrityDetectorResult =
  | { status: "completed"; verificationLevel?: "broad_phase_candidate" | "surface_exact" | "constraint_metric" | "unknown"; observations: Array<Omit<CharacterIntersectionObservation, "observationId" | "simulationTimeSeconds">> }
  | { status: "unsupported"; reason: string }
  | { status: "not_tested"; reason: string };

export interface CharacterIntegrityDetector {
  id: string;
  supportedKinds: CharacterIntersectionKind[];
  inspect(context: IntegrityDetectorContext): IntegrityDetectorResult;
}

export interface DeformationIntegrityReport {
  subjectId: string;
  rigId: string;
  experimentId?: string;
  frameNumber?: number;
  sequenceNumber?: number;
  simulationTimeSeconds: number;
  posture: AuthoritativePosture;
  animationPhase: string;
  actualScale: MotionSourceMeasurement;
  stageRelativeScale: MotionSourceMeasurement;
  telemetry: ScaleDeformationTelemetry;
  detectorResults: Array<{
    detectorId: string;
    status: "completed" | "unsupported" | "not_tested" | "failed";
    reason?: string;
    observationCount: number;
  }>;
}


/**
 * Conservative AABB broad-phase detector. An overlap is only a candidate:
 * exact mesh/surface intersection must be checked by a later narrow-phase detector.
 * A no-overlap result never certifies that surfaces are free of clipping.
 */
export class AabbBroadPhaseIntegrityDetector implements CharacterIntegrityDetector {
  readonly id = "aabb-broad-phase";
  readonly supportedKinds: CharacterIntersectionKind[] = [
    "environment_collision", "clothing_penetration", "attachment_misalignment",
  ];

  inspect(context: IntegrityDetectorContext): IntegrityDetectorResult {
    const observations: Array<Omit<CharacterIntersectionObservation, "observationId" | "simulationTimeSeconds">> = [];
    const subjects = context.geometry.filter(item => item.role !== "environment");
    const environments = context.geometry.filter(item => item.role === "environment");
    const overlaps = (a: IntegrityBounds3, b: IntegrityBounds3): boolean =>
      a.min.x < b.max.x && a.max.x > b.min.x &&
      a.min.y < b.max.y && a.max.y > b.min.y &&
      a.min.z < b.max.z && a.max.z > b.min.z;

    for (const subject of subjects) {
      const candidates = subject.role === "character_region"
        ? environments
        : context.geometry.filter(item => item.role === "character_region");
      for (const other of candidates) {
        if (!overlaps(subject.bounds, other.bounds)) continue;
        const kind: CharacterIntersectionKind =
          other.role === "environment" ? "environment_collision" :
          subject.role === "clothing" ? "clothing_penetration" :
          "attachment_misalignment";
        observations.push({
          kind,
          subjectRegionIds: [subject.regionId ?? subject.objectId, ...(other.regionId ? [other.regionId] : [])],
          otherObjectId: other.objectId,
          severity: "info",
          status: "detected",
          provenance: this.id,
          details: "Broad-phase AABB overlap candidate only; exact mesh/surface intersection is not established.",
        });
      }
    }
    return { status: "completed", verificationLevel: "broad_phase_candidate", observations };
  }
}

/**
 * Detector orchestration and evidence aggregation only. It never changes
 * transforms, growth, posture, animation, collision response, or scene state.
 */
export class DeformationIntegrityMonitor {
  private readonly detectors = new Map<string, CharacterIntegrityDetector>();

  registerDetector(detector: CharacterIntegrityDetector): void {
    if (!detector.id.trim()) throw new TypeError("Detector id must be non-empty.");
    if (this.detectors.has(detector.id)) throw new Error(`Detector "${detector.id}" is already registered.`);
    this.detectors.set(detector.id, detector);
  }

  unregisterDetector(detectorId: string): boolean {
    return this.detectors.delete(detectorId);
  }

  inspect(context: IntegrityDetectorContext): DeformationIntegrityReport {
    if (!context.subjectId.trim() || !context.rigId.trim()) {
      throw new TypeError("subjectId and rigId must be non-empty.");
    }
    if (!Number.isFinite(context.simulationTimeSeconds) || context.simulationTimeSeconds < 0) {
      throw new TypeError("simulationTimeSeconds must be finite and non-negative.");
    }
    const observations: CharacterIntersectionObservation[] = [];
    const detectorResults: DeformationIntegrityReport["detectorResults"] = [];
    let broadPhaseOnlyWithoutCandidates = false;
    for (const detector of this.detectors.values()) {
      try {
        const result = detector.inspect(context);
        if (result.status === "completed") {
          if (result.verificationLevel === "broad_phase_candidate" && result.observations.length === 0) broadPhaseOnlyWithoutCandidates = true;
          for (const [index, observation] of result.observations.entries()) {
            observations.push({
              ...observation,
              observationId: `${detector.id}:${context.sequenceNumber ?? context.frameNumber ?? context.simulationTimeSeconds}:${index}`,
              simulationTimeSeconds: context.simulationTimeSeconds,
              provenance: observation.provenance || detector.id,
            });
          }
          detectorResults.push({ detectorId: detector.id, status: "completed", observationCount: result.observations.length });
        } else {
          detectorResults.push({ detectorId: detector.id, status: result.status, reason: result.reason, observationCount: 0 });
        }
      } catch (error) {
        detectorResults.push({
          detectorId: detector.id, status: "failed",
          reason: error instanceof Error ? error.message : String(error),
          observationCount: 0,
        });
      }
    }

    const usable = detectorResults.filter(result => result.status === "completed");
    const allUnsupported = detectorResults.length > 0 && detectorResults.every(result => result.status === "unsupported");
    const anyFailed = detectorResults.some(result => result.status === "failed");
    const anyUnsupported = detectorResults.some(result => result.status === "unsupported");
    const anyCritical = observations.some(item => item.status === "detected" && item.severity === "critical");
    const anyWarning = observations.some(item => item.status === "detected" && item.severity === "warning");
    const anyNotTested = detectorResults.some(result => result.status === "not_tested");
    const deformationStatus: ScaleDeformationTelemetry["deformationStatus"] =
      anyCritical ? "critical" :
      anyWarning ? "warning" :
      anyFailed ? "failed" :
      allUnsupported || anyUnsupported ? "unsupported" :
      usable.length === 0 || anyNotTested || broadPhaseOnlyWithoutCandidates ? "not_tested" :
      observations.some(item => item.status === "failed") ? "failed" :
      observations.some(item => item.status === "unsupported") ? "unsupported" :
      observations.some(item => item.status === "not_tested") ? "not_tested" :
      "within_policy";

    return {
      subjectId: context.subjectId,
      rigId: context.rigId,
      ...(context.experimentId ? { experimentId: context.experimentId } : {}),
      ...(context.frameNumber !== undefined ? { frameNumber: context.frameNumber } : {}),
      ...(context.sequenceNumber !== undefined ? { sequenceNumber: context.sequenceNumber } : {}),
      simulationTimeSeconds: context.simulationTimeSeconds,
      posture: context.posture,
      animationPhase: context.animationPhase ?? "unknown",
      actualScale: context.actualScale,
      stageRelativeScale: context.stageRelativeScale,
      telemetry: {
        subjectId: context.subjectId,
        rigId: context.rigId,
        actualScale: context.actualScale,
        stageRelativeScale: context.stageRelativeScale,
        posture: context.posture,
        observations,
        deformationStatus,
        simulationTimeSeconds: context.simulationTimeSeconds,
        provenance: "deformation-integrity-monitor",
      },
      detectorResults,
    };
  }

  get registeredDetectorIds(): string[] {
    return [...this.detectors.keys()].sort();
  }

  dispose(): void {
    this.detectors.clear();
  }
}
