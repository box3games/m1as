import { BiologicalBreathController, type BiologicalBreathConfig } from "./biological-breathing.js";
import type {
  BiologicalBreathTelemetry,
  GrowthModel,
  GrowthModelCommand,
  GrowthModelContext,
  GrowthModelDescriptor,
  GrowthModelResult,
  GrowthModelSubject,
  GrowthModelTelemetry,
} from "./model-contract.js";

/**
 * Composes biological breathing with any growth model that supports the
 * optional presentation seam. The wrapped model remains authoritative for
 * its execution mechanics; the controller supplies a separate growth profile.
 */
export class BiologicalBreathingGrowthModel implements GrowthModel {
  readonly descriptor: GrowthModelDescriptor;
  private readonly config: Partial<BiologicalBreathConfig>;
  private controller: BiologicalBreathController;
  private active = false;
  private previousBreathScale: number;

  constructor(
    private readonly inner: GrowthModel,
    config: Partial<BiologicalBreathConfig> = {},
  ) {
    this.config = { ...config };
    this.controller = new BiologicalBreathController(this.config);
    this.previousBreathScale = this.controller.getState().actualScale;
    this.descriptor = {
      ...inner.descriptor,
      id: `${inner.descriptor.id}+biological-breathing`,
      displayName: `${inner.descriptor.displayName} · Biological Breathing`,
      version: "1.0.0",
      capabilities: { ...inner.descriptor.capabilities },
    };
  }

  initialize(subject: GrowthModelSubject, context: GrowthModelContext): void {
    this.inner.initialize(subject, context);
    const initialScale = this.config.initialScale ?? this.inner.readTelemetry(context.simulationTimeSeconds).currentScale ?? 1;
    this.controller = new BiologicalBreathController({ ...this.config, initialScale });
    this.previousBreathScale = initialScale;
    this.active = false;
  }

  /** Starts or resumes the biological profile; ordinary model commands remain available. */
  startBreathing(): void {
    this.active = true;
  }

  /** Pauses the biological profile without resetting accumulated growth. */
  stopBreathing(): void {
    this.active = false;
  }

  isBreathingActive(): boolean {
    return this.active;
  }

  apply(command: GrowthModelCommand, context: GrowthModelContext): GrowthModelResult {
    return this.inner.apply(command, context);
  }

  advance(simulationTimeSeconds: number, deltaSeconds: number): void {
    this.inner.advance(simulationTimeSeconds, deltaSeconds);
    if (!this.active) return;

    const state = this.controller.advance(deltaSeconds);
    const growthDelta = state.actualScale - this.previousBreathScale;
    this.previousBreathScale = state.actualScale;
    this.inner.applyBiologicalBreathState?.(state, growthDelta);
  }

  readTelemetry(simulationTimeSeconds: number): GrowthModelTelemetry {
    return {
      ...this.inner.readTelemetry(simulationTimeSeconds),
      biologicalBreath: this.toTelemetry(),
      modelData: {
        ...this.inner.readTelemetry(simulationTimeSeconds).modelData,
        biologicalBreathingActive: this.active,
      },
    };
  }

  reset(): void {
    this.inner.reset();
    this.controller = new BiologicalBreathController(this.config);
    this.previousBreathScale = this.controller.getState().actualScale;
    this.active = false;
    this.inner.applyBiologicalBreathState?.(this.toTelemetry(), 0);
  }

  dispose(): void {
    this.inner.dispose();
  }

  private toTelemetry(): BiologicalBreathTelemetry {
    const state = this.controller.getState();
    return {
      completedCycles: state.completedCycles,
      cycleIndex: state.cycleIndex,
      phase: state.phase,
      cycleElapsedSeconds: state.cycleElapsedSeconds,
      cycleDurationSeconds: state.cycleDurationSeconds,
      actualScale: state.actualScale,
      visualExpansion: state.visualExpansion,
      internalPressure: state.internalPressure,
      pressureWave: state.pressureWave,
      pressureWavePhaseRadians: state.pressureWavePhaseRadians,
    };
  }
}
