import * as THREE from "three";
import { GrowthStimulusType } from "../GrowthEventQueue.js";
import type { M1ASVFXEngine } from "../M1ASVFXEngine.js";
import type {
  GrowthModel, GrowthModelCommand, GrowthModelContext, GrowthModelDescriptor,
  GrowthModelResult, GrowthModelSubject, GrowthModelTelemetry,
} from "./model-contract.js";

const BASELINE_DESCRIPTOR: GrowthModelDescriptor = {
  id: "three-object-scale",
  displayName: "Baseline GLB Object Scaling",
  version: "1.0.0",
  capabilities: {
    wholeObjectScale: true,
    regionalGrowth: false,
    meshDeformation: false,
    skeletalDeformation: false,
    proceduralVfx: false,
    sustainedFlow: true,
    deterministicReplay: "deterministic",
    supportedAssetKinds: ["glb", "gltf", "three-object3d"],
  },
};

/** Simple deterministic reference model for comparing streamed GLB growth. */
export class ThreeObjectScaleGrowthModel implements GrowthModel {
  readonly descriptor = BASELINE_DESCRIPTOR;
  private baseScale = new THREE.Vector3(1, 1, 1);
  private currentScale = 1;
  private targetScale = 1;
  private interpolationStart = 1;
  private interpolationElapsed = 0;
  private interpolationDuration = 0;
  private flowRemainingSeconds = 0;
  private flowMultiplier = 1;
  private growthPerSupplySecond = 0.1;
  private lastSimulationTimeSeconds = 0;
  private holdActive = false;
  private holdElapsedSeconds = 0;

  constructor(private readonly root: THREE.Object3D) {}

  initialize(_subject: GrowthModelSubject, context: GrowthModelContext): void {
    this.baseScale.copy(this.root.scale);
    this.currentScale = 1;
    this.targetScale = 1;
    this.lastSimulationTimeSeconds = context.simulationTimeSeconds;
  }

  apply(command: GrowthModelCommand, context: GrowthModelContext): GrowthModelResult {
    if (command.kind === "hold") {
      if (command.active) {
        this.holdActive = true;
        this.holdElapsedSeconds = 0;
      } else if (this.holdActive) {
        this.holdActive = false;
        const holdRate = command.parameters?.growthPerHoldSecond;
        const rate = typeof holdRate === "number" && Number.isFinite(holdRate) && holdRate >= 0
          ? holdRate : 0.25;
        const chargedGrowth = this.holdElapsedSeconds * rate;
        this.holdElapsedSeconds = 0;
        if (chargedGrowth > 0) {
          this.interpolationStart = this.currentScale;
          this.targetScale = this.currentScale + chargedGrowth;
          this.interpolationElapsed = 0;
          this.interpolationDuration = 0.5;
        }
      }
      return { commandId: command.commandId, accepted: true, telemetry: this.readTelemetry(this.lastSimulationTimeSeconds) };
    }
    if (command.kind === "flow") {
      if (!Number.isFinite(command.flowMultiplier) || command.flowMultiplier < 0 ||
          !Number.isFinite(command.supplySeconds) || command.supplySeconds < 0) {
        return { commandId: command.commandId, accepted: false, reason: "Flow multiplier and supply must be finite and non-negative." };
      }
      this.flowMultiplier = command.flowMultiplier;
      this.flowRemainingSeconds = command.supplySeconds;
      const configuredRate = command.parameters?.growthPerSupplySecond;
      if (typeof configuredRate === "number" && Number.isFinite(configuredRate) && configuredRate >= 0) {
        this.growthPerSupplySecond = configuredRate;
      }
      return { commandId: command.commandId, accepted: true, telemetry: this.readTelemetry(this.lastSimulationTimeSeconds) };
    }

    const target = command.amount.kind === "relative_change"
      ? this.targetScale * (1 + command.amount.fraction)
      : command.amount.scale;
    if (!Number.isFinite(target) || target <= 0 || target < this.targetScale) {
      return { commandId: command.commandId, accepted: false, reason: "Baseline growth accepts positive, non-decreasing target scales." };
    }
    this.interpolationStart = this.currentScale;
    this.targetScale = target;
    this.interpolationElapsed = 0;
    this.interpolationDuration = Math.max(0, command.requestedDurationSeconds ?? 0);
    if (this.interpolationDuration === 0) {
      this.currentScale = this.targetScale;
      this.applyScale();
    }
    return { commandId: command.commandId, accepted: true, telemetry: this.readTelemetry(this.lastSimulationTimeSeconds) };
  }

  advance(simulationTimeSeconds: number, deltaSeconds: number): void {
    if (!Number.isFinite(simulationTimeSeconds) || !Number.isFinite(deltaSeconds) ||
        deltaSeconds < 0 || simulationTimeSeconds < this.lastSimulationTimeSeconds) return;
    this.lastSimulationTimeSeconds = simulationTimeSeconds;

    if (this.holdActive) this.holdElapsedSeconds += deltaSeconds;
    if (this.interpolationDuration > 0 && this.currentScale !== this.targetScale) {
      this.interpolationElapsed = Math.min(this.interpolationDuration, this.interpolationElapsed + deltaSeconds);
      const t = this.interpolationElapsed / this.interpolationDuration;
      this.currentScale = this.interpolationStart + (this.targetScale - this.interpolationStart) * t;
    }
    if (this.flowRemainingSeconds > 0 && this.flowMultiplier > 0) {
      const consumed = Math.min(this.flowRemainingSeconds, deltaSeconds * this.flowMultiplier);
      this.flowRemainingSeconds -= consumed;
      this.currentScale += consumed * this.growthPerSupplySecond;
      this.targetScale = Math.max(this.targetScale, this.currentScale);
    }
    this.applyScale();
  }

  readTelemetry(simulationTimeSeconds: number): GrowthModelTelemetry {
    return {
      simulationTimeSeconds,
      currentScale: this.currentScale,
      targetScale: this.targetScale,
      flowMultiplier: this.flowMultiplier,
      supplyRemainingSeconds: this.flowRemainingSeconds,
      modelData: { holdActive: this.holdActive, holdElapsedSeconds: this.holdElapsedSeconds },
    };
  }

  reset(): void {
    this.currentScale = 1;
    this.targetScale = 1;
    this.interpolationStart = 1;
    this.interpolationElapsed = 0;
    this.interpolationDuration = 0;
    this.flowRemainingSeconds = 0;
    this.flowMultiplier = 1;
    this.holdActive = false;
    this.holdElapsedSeconds = 0;
    this.applyScale();
  }

  dispose(): void {
    // The scene owns the Object3D; this adapter deliberately does not dispose it.
  }

  private applyScale(): void {
    this.root.scale.set(
      this.baseScale.x * this.currentScale,
      this.baseScale.y * this.currentScale,
      this.baseScale.z * this.currentScale,
    );
    this.root.updateMatrixWorld(true);
  }
}

const stimulusFor = (stimulus: string): GrowthStimulusType => {
  switch (stimulus) {
    case "Buff": return GrowthStimulusType.Buff;
    case "Exercise": return GrowthStimulusType.Exercise;
    case "Environmental": return GrowthStimulusType.Environmental;
    case "NPCInfluence": return GrowthStimulusType.NPCInfluence;
    case "ToolActivation": return GrowthStimulusType.ToolActivation;
    default: return GrowthStimulusType.Consumption;
  }
};

/**
 * Adapter for the existing M1AS VFX engine and queue.
 * The engine retains ownership of its render/simulation loop and queue policy.
 */
export class M1ASVFXGrowthModel implements GrowthModel {
  readonly descriptor: GrowthModelDescriptor = {
    id: "m1as-vfx-queue",
    displayName: "M1AS VFX Growth Engine",
    version: "legacy-queue-adapter-v1",
    capabilities: {
      wholeObjectScale: true,
      regionalGrowth: true,
      meshDeformation: true,
      skeletalDeformation: true,
      proceduralVfx: true,
      sustainedFlow: true,
      deterministicReplay: "best_effort",
      supportedAssetKinds: ["glb", "gltf"],
    },
  };

  constructor(private readonly engine: M1ASVFXEngine) {}

  initialize(_subject: GrowthModelSubject, _context: GrowthModelContext): void {
    // The engine has already loaded and normalized the GLB subject.
  }

  apply(command: GrowthModelCommand, context: GrowthModelContext): GrowthModelResult {
    if (command.kind === "flow") {
      const growthPerSupplySecond = command.parameters?.growthPerSupplySecond;
      const accepted = this.engine.startGrowthFlow(
        command.supplySeconds,
        command.flowMultiplier,
        typeof growthPerSupplySecond === "number" ? growthPerSupplySecond : 0.1,
        stimulusFor(command.stimulus ?? "Buff"),
      );
      return {
        commandId: command.commandId,
        accepted,
        reason: accepted ? undefined : "The M1AS VFX engine rejected this flow command or the active model is not M1AS VFX.",
        telemetry: accepted ? this.readTelemetry(context.simulationTimeSeconds) : undefined,
      };
    }
    if (command.kind === "hold") {
      if (command.active) this.engine.startHoldGrowth();
      else this.engine.releaseHoldGrowth();
      return { commandId: command.commandId, accepted: true };
    }

    const telemetry = this.engine.getGrowthModelTelemetry();
    const requestedTarget = command.amount.kind === "relative_change"
      ? telemetry.projectedTargetScale * (1 + command.amount.fraction)
      : command.amount.scale;
    const delta = requestedTarget - telemetry.projectedTargetScale;
    if (!Number.isFinite(delta) || delta <= 0) {
      return { commandId: command.commandId, accepted: false, reason: "Legacy M1AS queue adapter currently accepts positive growth deltas only." };
    }
    this.engine.enqueueGrowth(delta, stimulusFor(command.stimulus));
    return {
      commandId: command.commandId,
      accepted: true,
      telemetry: this.readTelemetry(context.simulationTimeSeconds),
    };
  }

  advance(_simulationTimeSeconds: number, _deltaSeconds: number): void {
    // M1ASVFXEngine advances itself from its existing animation loop.
  }

  readTelemetry(simulationTimeSeconds: number): GrowthModelTelemetry {
    const state = this.engine.getGrowthModelTelemetry();
    return {
      simulationTimeSeconds,
      currentScale: state.currentScale,
      targetScale: state.targetScale,
      activeEventCount: state.pendingEvents,
      deformation: { instability: state.instability, goldenBuffer: state.goldenBuffer },
      modelData: { posture: state.posture, isHolding: state.isHolding, ...this.engine.getGrowthFlowTelemetry() },
    };
  }

  reset(): void {
    this.engine.resetGrowth();
  }

  dispose(): void {
    // Engine lifecycle remains owned by the sandbox controller.
  }
}
