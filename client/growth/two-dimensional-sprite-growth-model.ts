import * as THREE from "three";
import type {
  BiologicalBreathTelemetry, GrowthModel, GrowthModelCommand, GrowthModelContext,
  GrowthModelDescriptor, GrowthModelResult, GrowthModelSubject, GrowthModelTelemetry,
} from "./model-contract.js";

/**
 * Growth adapter for a 2D character represented by a Three.js Sprite.
 *
 * Growth scales the sprite uniformly in X/Y, preserving the source image aspect
 * ratio. Biological expansion is a separate presentation multiplier and is not
 * included in accumulated growth telemetry. Texture loading and ownership stay
 * with the caller.
 */
export class TwoDimensionalSpriteGrowthModel implements GrowthModel {
  readonly descriptor: GrowthModelDescriptor = {
    id: "two-dimensional-sprite-scale",
    displayName: "2D Sprite Character Growth",
    version: "1.0.0",
    capabilities: {
      wholeObjectScale: true,
      regionalGrowth: false,
      meshDeformation: false,
      skeletalDeformation: false,
      proceduralVfx: false,
      sustainedFlow: true,
      deterministicReplay: "deterministic",
      supportedAssetKinds: ["png", "webp", "jpeg", "sprite", "2d-image", "m1as-image", "m1as-video", "m1as-glb-snapshot"],
    },
  };

  private readonly baseScale = new THREE.Vector3(1, 1, 1);
  private currentScale = 1;
  private targetScale = 1;
  private interpolationStart = 1;
  private interpolationElapsed = 0;
  private interpolationDuration = 0;
  private flowRemainingSeconds = 0;
  private flowMultiplier = 1;
  private growthPerSupplySecond = 0.1;
  private holdActive = false;
  private holdElapsedSeconds = 0;
  private biologicalVisualMultiplier = 1;
  private lastSimulationTimeSeconds = 0;

  constructor(private readonly sprite: THREE.Sprite) {}

  initialize(_subject: GrowthModelSubject, context: GrowthModelContext): void {
    this.baseScale.copy(this.sprite.scale);
    this.currentScale = 1;
    this.targetScale = 1;
    this.interpolationStart = 1;
    this.interpolationElapsed = 0;
    this.interpolationDuration = 0;
    this.flowRemainingSeconds = 0;
    this.flowMultiplier = 1;
    this.holdActive = false;
    this.holdElapsedSeconds = 0;
    this.biologicalVisualMultiplier = 1;
    this.lastSimulationTimeSeconds = context.simulationTimeSeconds;
    this.applyScale();
  }

  apply(command: GrowthModelCommand, context: GrowthModelContext): GrowthModelResult {
    if (command.kind === "hold") {
      if (command.active) {
        this.holdActive = true;
        this.holdElapsedSeconds = 0;
      } else if (this.holdActive) {
        this.holdActive = false;
        const configuredRate = command.parameters?.growthPerHoldSecond;
        const rate = typeof configuredRate === "number" && Number.isFinite(configuredRate) && configuredRate >= 0
          ? configuredRate : 0.25;
        const growth = this.holdElapsedSeconds * rate;
        this.holdElapsedSeconds = 0;
        if (growth > 0) this.beginGrowth(this.currentScale + growth, 0.5);
      }
      return { commandId: command.commandId, accepted: true, telemetry: this.readTelemetry(context.simulationTimeSeconds) };
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
      return { commandId: command.commandId, accepted: true, telemetry: this.readTelemetry(context.simulationTimeSeconds) };
    }

    const target = command.amount.kind === "relative_change"
      ? this.targetScale * (1 + command.amount.fraction)
      : command.amount.scale;
    if (!Number.isFinite(target) || target <= 0 || target < this.targetScale) {
      return { commandId: command.commandId, accepted: false, reason: "2D sprite growth accepts positive, non-decreasing target scales." };
    }
    const duration = command.requestedDurationSeconds ?? 0;
    if (!Number.isFinite(duration) || duration < 0) {
      return { commandId: command.commandId, accepted: false, reason: "Growth duration must be finite and non-negative." };
    }
    this.beginGrowth(target, duration);
    return { commandId: command.commandId, accepted: true, telemetry: this.readTelemetry(context.simulationTimeSeconds) };
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

  applyBiologicalBreathState(state: BiologicalBreathTelemetry, growthDelta: number): void {
    if (Number.isFinite(growthDelta) && growthDelta > 0) {
      this.currentScale += growthDelta;
      this.targetScale = Math.max(this.targetScale, this.currentScale);
    }
    this.biologicalVisualMultiplier = Math.max(
      0.01,
      1 + state.visualExpansion * 0.025 + state.pressureWave * 0.01,
    );
    this.applyScale();
  }

  readTelemetry(simulationTimeSeconds: number): GrowthModelTelemetry {
    return {
      simulationTimeSeconds,
      currentScale: this.currentScale,
      targetScale: this.targetScale,
      flowMultiplier: this.flowMultiplier,
      supplyRemainingSeconds: this.flowRemainingSeconds,
      modelData: {
        assetKind: "2d-sprite",
        aspectRatioPreserved: true,
        holdActive: this.holdActive,
        holdElapsedSeconds: this.holdElapsedSeconds,
        biologicalVisualMultiplier: this.biologicalVisualMultiplier,
      },
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
    this.biologicalVisualMultiplier = 1;
    this.applyScale();
  }

  dispose(): void {
    // The caller owns the Sprite, material, and texture; do not dispose them.
  }

  private beginGrowth(target: number, duration: number): void {
    this.interpolationStart = this.currentScale;
    this.targetScale = target;
    this.interpolationElapsed = 0;
    this.interpolationDuration = duration;
    if (duration === 0) {
      this.currentScale = target;
      this.applyScale();
    }
  }

  private applyScale(): void {
    const scale = this.currentScale * this.biologicalVisualMultiplier;
    this.sprite.scale.set(
      this.baseScale.x * scale,
      this.baseScale.y * scale,
      this.baseScale.z,
    );
    this.sprite.updateMatrixWorld(true);
  }
}
