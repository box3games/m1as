/**
 * Interchangeable growth-model boundary.
 *
 * Models consume the same semantic commands and report comparable telemetry.
 * A model owns its execution mechanics; the experiment system observes it.
 */
import type { ScalePerceptionMeasurements } from './scale-perception.js';

export type GrowthModelId = string;

export interface GrowthModelCapabilities {
  wholeObjectScale: boolean;
  regionalGrowth: boolean;
  meshDeformation: boolean;
  skeletalDeformation: boolean;
  proceduralVfx: boolean;
  sustainedFlow: boolean;
  deterministicReplay: "deterministic" | "seeded" | "best_effort" | "unsupported";
  supportedAssetKinds: string[];
}

export interface GrowthModelDescriptor {
  id: GrowthModelId;
  displayName: string;
  version: string;
  capabilities: GrowthModelCapabilities;
}

export interface GrowthModelSubject {
  /** Stable experiment-local subject identifier. */
  subjectId: string;
  /** Asset identity should be a stable asset ID/hash, not a temporary signed URL. */
  assetId: string;
  assetKind: string;
  initialDimensions: { x: number; y: number; z: number };
  worldUnit: string;
}

export interface GrowthModelContext {
  experimentId: string;
  simulationTimeSeconds: number;
  randomSeed?: number;
  configurationVersion: string;
}

export type GrowthModelCommand =
  | {
      kind: "discrete";
      commandId: string;
      stimulus: string;
      amount: { kind: "relative_change"; fraction: number } |
              { kind: "absolute_target"; scale: number };
      requestedDurationSeconds?: number;
      parameters?: Record<string, number | string | boolean>;
    }
  | {
      kind: "flow";
      commandId: string;
      /** 1 means nominal supply; values above/below 1 change feed rate. */
      flowMultiplier: number;
      supplySeconds: number;
      stimulus?: string;
      parameters?: Record<string, number | string | boolean>;
    }
  | {
      kind: "hold";
      commandId: string;
      active: boolean;
      stimulus?: string;
      parameters?: Record<string, number | string | boolean>;
    };

export interface BiologicalBreathTelemetry {
  completedCycles: number;
  cycleIndex: number;
  phase: "inhale" | "hold" | "release";
  cycleElapsedSeconds: number;
  cycleDurationSeconds: number;
  actualScale: number;
  visualExpansion: number;
  internalPressure: number;
  pressureWave: number;
  pressureWavePhaseRadians: number;
}

export interface GrowthModelTelemetry {
  simulationTimeSeconds: number;
  currentScale?: number;
  targetScale?: number;
  growthVelocity?: number;
  flowMultiplier?: number;
  supplyRemainingSeconds?: number;
  activeEventCount?: number;
  deformation?: Record<string, number>;
  visualEffects?: Record<string, number | string | boolean>;
  /** Shared biological profile output, separate from model-specific telemetry. */
  biologicalBreath?: BiologicalBreathTelemetry;
  /** Optional observational snapshot; never feeds back into execution scale. */
  scalePerception?: ScalePerceptionMeasurements;
  /** Model-specific values remain namespaced and do not replace common fields. */
  modelData?: Record<string, unknown>;
}

export interface GrowthModelResult {
  commandId: string;
  accepted: boolean;
  reason?: string;
  telemetry?: GrowthModelTelemetry;
}

export interface GrowthModel {
  readonly descriptor: GrowthModelDescriptor;
  initialize(subject: GrowthModelSubject, context: GrowthModelContext): Promise<void> | void;
  apply(command: GrowthModelCommand, context: GrowthModelContext): Promise<GrowthModelResult> | GrowthModelResult;
  /** Optional presentation/execution seam for a biological breath profile. */
  applyBiologicalBreathState?(
    state: BiologicalBreathTelemetry,
    growthDelta: number,
  ): void;
  advance(simulationTimeSeconds: number, deltaSeconds: number): void;
  readTelemetry(simulationTimeSeconds: number): GrowthModelTelemetry;
  reset(): void;
  dispose(): void;
}
