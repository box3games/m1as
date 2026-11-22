/**
 * Biological breathing growth profile.
 *
 * Actual scale accumulation, cycle timing, internal pressure, and visual
 * expansion are separate outputs. Visual pulsing never changes actual scale.
 */

export type BiologicalBreathPhase = "inhale" | "hold" | "release";

export interface BiologicalBreathConfig {
  initialScale: number;
  growthMultiplierPerCycle: number;
  baseCycleDurationSeconds: number;
  durationMultiplierPerCycle: number;
  inhaleFraction: number;
  holdFraction: number;
  growthEnvelopeExponent: number;
  visualPulseExponent: number;
  /** Release is the remaining fraction of the cycle. */
  pressureMultiplierPerCycle: number;
  basePressure: number;
  waveResponseWeight: number;
  waveCyclesPerSecond: number;
}

export interface BiologicalBreathState {
  completedCycles: number;
  cycleIndex: number;
  phase: BiologicalBreathPhase;
  phaseElapsedSeconds: number;
  cycleElapsedSeconds: number;
  cycleDurationSeconds: number;
  actualScale: number;
  cycleStartScale: number;
  cycleTargetScale: number;
  visualExpansion: number;
  internalPressure: number;
  pressureWave: number;
  pressureWavePhaseRadians: number;
}

export const DEFAULT_BIOLOGICAL_BREATH_CONFIG: BiologicalBreathConfig = {
  initialScale: 1,
  growthMultiplierPerCycle: 1.08,
  baseCycleDurationSeconds: 1,
  durationMultiplierPerCycle: 1.25,
  inhaleFraction: 0.35,
  holdFraction: 0.3,
  growthEnvelopeExponent: 1,
  visualPulseExponent: 1,
  pressureMultiplierPerCycle: 1.2,
  basePressure: 1,
  waveResponseWeight: 0.35,
  waveCyclesPerSecond: 1.5,
};

function smoothStep(value: number): number {
  const t = Math.min(1, Math.max(0, value));
  return t * t * (3 - 2 * t);
}

export class BiologicalBreathController {
  private readonly config: BiologicalBreathConfig;
  private state: BiologicalBreathState;

  constructor(config: Partial<BiologicalBreathConfig> = {}) {
    this.config = { ...DEFAULT_BIOLOGICAL_BREATH_CONFIG, ...config };
    this.validateConfig(this.config);
    this.state = {
      completedCycles: 0,
      cycleIndex: 0,
      phase: "inhale",
      phaseElapsedSeconds: 0,
      cycleElapsedSeconds: 0,
      cycleDurationSeconds: this.durationForCycle(0),
      actualScale: this.config.initialScale,
      cycleStartScale: this.config.initialScale,
      cycleTargetScale: this.config.initialScale * this.config.growthMultiplierPerCycle,
      visualExpansion: 0,
      internalPressure: 0,
      pressureWave: 0,
      pressureWavePhaseRadians: 0,
    };
  }

  getState(): Readonly<BiologicalBreathState> {
    return { ...this.state };
  }

  getConfig(): Readonly<BiologicalBreathConfig> {
    return { ...this.config };
  }

  /** Advance using simulation delta seconds; large steps may cross cycle boundaries. */
  advance(deltaSeconds: number): Readonly<BiologicalBreathState> {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) {
      throw new RangeError("deltaSeconds must be finite and non-negative.");
    }
    let remaining = deltaSeconds;
    while (remaining > 0) {
      const phaseDuration = this.phaseDuration();
      const step = Math.min(remaining, Math.max(0, phaseDuration - this.state.phaseElapsedSeconds));
      this.state.phaseElapsedSeconds += step;
      this.state.cycleElapsedSeconds += step;
      remaining -= step;
      this.updatePresentation();
      if (this.state.phaseElapsedSeconds + Number.EPSILON >= phaseDuration) {
        this.completePhase();
      } else if (step === 0) {
        break;
      }
    }
    return this.getState();
  }

  /** Current authored cycle duration; useful for deterministic experiment capture. */
  getCycleDurationSeconds(): number {
    return this.state.cycleDurationSeconds;
  }

  private phaseDuration(): number {
    if (this.state.phase === "inhale") {
      return this.state.cycleDurationSeconds * this.config.inhaleFraction;
    }
    if (this.state.phase === "hold") {
      return this.state.cycleDurationSeconds * this.config.holdFraction;
    }
    return this.state.cycleDurationSeconds *
      (1 - this.config.inhaleFraction - this.config.holdFraction);
  }

  private completePhase(): void {
    if (this.state.phase === "inhale") {
      this.state.phase = "hold";
    } else if (this.state.phase === "hold") {
      this.state.phase = "release";
    } else {
      this.state.cycleStartScale = this.state.cycleTargetScale;
      this.state.cycleTargetScale = this.state.cycleStartScale * this.config.growthMultiplierPerCycle;
      this.state.actualScale = this.state.cycleStartScale;
      this.state.completedCycles += 1;
      this.state.cycleIndex += 1;
      this.state.phase = "inhale";
      this.state.cycleElapsedSeconds = 0;
      this.state.cycleDurationSeconds = this.durationForCycle(this.state.cycleIndex);
    }
    this.state.phaseElapsedSeconds = 0;
    this.updatePresentation();
  }

  private updatePresentation(): void {
    const phaseDuration = this.phaseDuration();
    const progress = phaseDuration > 0
      ? Math.min(1, this.state.phaseElapsedSeconds / phaseDuration)
      : 1;
    const cyclePressure = this.config.basePressure *
      Math.pow(this.config.pressureMultiplierPerCycle, this.state.cycleIndex);

    if (this.state.phase === "inhale") {
      const growthEnvelope = Math.pow(smoothStep(progress), this.config.growthEnvelopeExponent);
      this.state.actualScale = this.state.cycleStartScale +
        (this.state.cycleTargetScale - this.state.cycleStartScale) * growthEnvelope;
      this.state.visualExpansion = Math.pow(smoothStep(progress), this.config.visualPulseExponent);
      this.state.internalPressure = cyclePressure * 0.25 * progress;
    } else if (this.state.phase === "hold") {
      this.state.actualScale = this.state.cycleTargetScale;
      this.state.visualExpansion = 1;
      this.state.internalPressure = cyclePressure * (0.25 + 0.75 * smoothStep(progress));
    } else {
      this.state.actualScale = this.state.cycleTargetScale;
      this.state.visualExpansion = 1 - Math.pow(smoothStep(progress), this.config.visualPulseExponent);
      this.state.internalPressure = cyclePressure * (1 - smoothStep(progress));
    }

    this.state.pressureWavePhaseRadians =
      this.state.cycleElapsedSeconds * this.config.waveCyclesPerSecond * Math.PI * 2;
    this.state.pressureWave = this.state.internalPressure *
      this.config.waveResponseWeight *
      Math.sin(this.state.pressureWavePhaseRadians);
  }

  private durationForCycle(index: number): number {
    return this.config.baseCycleDurationSeconds *
      Math.pow(this.config.durationMultiplierPerCycle, index);
  }

  private validateConfig(config: BiologicalBreathConfig): void {
    const positive = [
      "initialScale",
      "growthMultiplierPerCycle",
      "baseCycleDurationSeconds",
      "durationMultiplierPerCycle",
      "pressureMultiplierPerCycle",
    ] as const;
    for (const key of positive) {
      if (!Number.isFinite(config[key]) || config[key] <= 0) {
        throw new RangeError(`${key} must be finite and greater than zero.`);
      }
    }
    if (config.growthMultiplierPerCycle < 1 ||
        config.durationMultiplierPerCycle < 1 ||
        config.pressureMultiplierPerCycle < 1) {
      throw new RangeError("Growth, duration, and pressure multipliers must be at least 1.");
    }
    if (!Number.isFinite(config.inhaleFraction) || config.inhaleFraction <= 0 ||
        !Number.isFinite(config.holdFraction) || config.holdFraction <= 0 ||
        config.inhaleFraction + config.holdFraction >= 1) {
      throw new RangeError("Inhale and hold fractions must be positive and sum to less than 1.");
    }
    if (!Number.isFinite(config.growthEnvelopeExponent) || config.growthEnvelopeExponent <= 0 ||
        !Number.isFinite(config.visualPulseExponent) || config.visualPulseExponent <= 0) {
      throw new RangeError("Growth and visual pulse envelope exponents must be finite and greater than zero.");
    }
    if (!Number.isFinite(config.basePressure) || config.basePressure < 0 ||
        !Number.isFinite(config.waveResponseWeight) || config.waveResponseWeight < 0 ||
        !Number.isFinite(config.waveCyclesPerSecond) || config.waveCyclesPerSecond < 0) {
      throw new RangeError("Pressure and wave parameters must be finite and non-negative.");
    }
  }
}
