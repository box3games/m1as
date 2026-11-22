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
  | { status: "completed"; observations: Array<Omit<CharacterIntersectionObservation, "observationId" | "simulationTimeSeconds">> }
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
    for (const detector of this.detectors.values()) {
      try {
        const result = detector.inspect(context);
        if (result.status === "completed") {
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
    const anyCritical = observations.some(item => item.status === "detected" && item.severity === "critical");
    const anyWarning = observations.some(item => item.status === "detected" && item.severity === "warning");
    const anyNotTested = detectorResults.some(result => result.status === "not_tested");
    const deformationStatus: ScaleDeformationTelemetry["deformationStatus"] =
      anyCritical ? "critical" :
      anyWarning ? "warning" :
      anyFailed ? "failed" :
      usable.length === 0 && allUnsupported ? "unsupported" :
      usable.length === 0 || anyNotTested ? "not_tested" :
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
