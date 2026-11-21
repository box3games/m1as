/**
 * Deterministic Grow Time resource controller.
 *
 * The controller is renderer- and engine-independent. Call advance() with the
 * authoritative simulation clock; never use interval callback counts as time.
 */
export type GrowTimeConversionMode = "continuous" | "restricted" | "disabled";
export type GrowTimePhase = "buff" | "growth";
export type GrowTimeClockState = "idle" | "active" | "paused";
export type GrowTimeConsumptionPolicy =
  | { kind: "duration"; seconds: number }
  | { kind: "chaos"; minimumSeconds: number; maximumSeconds: number; chaos: number };

export interface GrowTimeConfig {
  conversionMode: GrowTimeConversionMode;
  /** Number of Grow Time seconds awarded for one stack point. */
  growTimeSecondsPerPoint: number;
  /** Points awarded by one press action. */
  pointsPerPress: number;
  /** Points earned per simulation second while the hold action is active. */
  pointsPerHoldSecond: number;
  allowStackingDuringGrowth: boolean;
  maxReserveSeconds: number | null;
  /** In restricted mode, only these named sources convert points globally. */
  restrictedConversionSources: string[];
}

export interface GrowTimeState {
  stackPointsEarned: number;
  availableGrowTimeSeconds: number;
  activeGrowTimeSeconds: number;
  phase: GrowTimePhase;
  clockState: GrowTimeClockState;
  holdActive: boolean;
  lastSimulationTimeSeconds: number | null;
  lastTrigger: string | null;
  growthEventsStarted: number;
}

export interface GrowTimeSnapshot {
  version: 1;
  stackPointsEarned: number;
  availableGrowTimeSeconds: number;
}

export interface GrowTimeStore {
  load(): GrowTimeSnapshot | null;
  save(snapshot: GrowTimeSnapshot): void;
}

export const DEFAULT_GROW_TIME_CONFIG: GrowTimeConfig = {
  conversionMode: "continuous",
  growTimeSecondsPerPoint: 0.6,
  pointsPerPress: 1,
  pointsPerHoldSecond: 2,
  allowStackingDuringGrowth: true,
  maxReserveSeconds: null,
  restrictedConversionSources: [],
};

export const DEFAULT_GROW_TIME_INPUTS = {
  stackPress: "a",
  stackHold: "b",
  restAndGrow: "r",
} as const;

export type GrowTimeInputAction = keyof typeof DEFAULT_GROW_TIME_INPUTS;

export class GrowTimeController {
  private config: GrowTimeConfig;
  private state: GrowTimeState;

  constructor(config: Partial<GrowTimeConfig> = {}, snapshot?: GrowTimeSnapshot | null) {
    this.config = { ...DEFAULT_GROW_TIME_CONFIG, ...config };
    this.assertConfig(this.config);
    this.state = {
      stackPointsEarned: snapshot?.stackPointsEarned ?? 0,
      availableGrowTimeSeconds: snapshot?.availableGrowTimeSeconds ?? 0,
      activeGrowTimeSeconds: 0,
      phase: "buff",
      clockState: "idle",
      holdActive: false,
      lastSimulationTimeSeconds: null,
      lastTrigger: null,
      growthEventsStarted: 0,
    };
    this.assertSnapshot(this.state);
  }

  getState(): Readonly<GrowTimeState> {
    return { ...this.state };
  }

  getConfig(): Readonly<GrowTimeConfig> {
    return { ...this.config };
  }

  updateConfig(config: Partial<GrowTimeConfig>): void {
    const next = { ...this.config, ...config };
    this.assertConfig(next);
    this.config = next;
  }

  /** A discrete mini-game press. Points convert immediately in continuous mode. */
  pressStack(simulationTimeSeconds: number, source = "stack_press"): void {
    this.observeTime(simulationTimeSeconds);
    if (!this.canStack()) return;
    this.awardPoints(this.config.pointsPerPress, source);
  }

  /** Begin earning points while the configured hold input remains down. */
  beginHold(simulationTimeSeconds: number, source = "stack_hold"): void {
    this.observeTime(simulationTimeSeconds);
    if (!this.canStack() || this.state.holdActive) return;
    this.state.holdActive = true;
    this.state.lastTrigger = source;
  }

  endHold(simulationTimeSeconds: number): void {
    this.advance(simulationTimeSeconds);
    this.state.holdActive = false;
  }

  /** Advance all time-dependent behavior using authoritative simulation time. */
  advance(simulationTimeSeconds: number): void {
    this.assertTime(simulationTimeSeconds);
    const previous = this.state.lastSimulationTimeSeconds;
    if (previous === null) {
      this.state.lastSimulationTimeSeconds = simulationTimeSeconds;
      return;
    }
    const delta = simulationTimeSeconds - previous;
    if (delta === 0) return;

    if (this.state.holdActive && this.canStack()) {
      this.awardPoints(this.config.pointsPerHoldSecond * delta, "stack_hold");
    }

    if (this.state.clockState === "active" && this.state.activeGrowTimeSeconds > 0) {
      this.state.activeGrowTimeSeconds = Math.max(0, this.state.activeGrowTimeSeconds - delta);
      if (this.state.activeGrowTimeSeconds === 0) {
        this.state.clockState = "idle";
        this.state.phase = "buff";
        this.state.lastTrigger = "growth_duration_completed";
      }
    }
    this.state.lastSimulationTimeSeconds = simulationTimeSeconds;
  }

  /** R/rest trigger. randomUnit is injectable so chaos policy is reproducible. */
  triggerRestAndGrow(
    simulationTimeSeconds: number,
    policy: GrowTimeConsumptionPolicy,
    randomUnit = 0.5,
  ): number {
    this.advance(simulationTimeSeconds);
    if (this.state.clockState === "active" || this.state.availableGrowTimeSeconds <= 0) return 0;

    const requested = this.resolveConsumption(policy, randomUnit);
    const consumed = Math.min(this.state.availableGrowTimeSeconds, requested);
    if (consumed <= 0) return 0;

    this.state.availableGrowTimeSeconds = this.clampReserve(this.state.availableGrowTimeSeconds - consumed);
    this.state.activeGrowTimeSeconds = consumed;
    this.state.phase = "growth";
    this.state.clockState = "active";
    this.state.holdActive = false;
    this.state.lastTrigger = "rest_and_grow";
    this.state.growthEventsStarted += 1;
    return consumed;
  }

  pauseGrowth(): void {
    if (this.state.clockState === "active") this.state.clockState = "paused";
  }

  resumeGrowth(): void {
    if (this.state.clockState === "paused" && this.state.activeGrowTimeSeconds > 0) {
      this.state.clockState = "active";
    }
  }

  /** Export only durable resource values; active simulation timers are not resumed across sessions. */
  createSnapshot(): GrowTimeSnapshot {
    return {
      version: 1,
      stackPointsEarned: this.state.stackPointsEarned,
      availableGrowTimeSeconds: this.state.availableGrowTimeSeconds,
    };
  }

  private canStack(): boolean {
    return this.state.clockState !== "active" || this.config.allowStackingDuringGrowth;
  }

  private awardPoints(points: number, source: string): void {
    if (!Number.isFinite(points) || points <= 0) return;
    this.state.stackPointsEarned += points;
    const convertsGlobally = this.config.conversionMode === "continuous" ||
      (this.config.conversionMode === "restricted" && this.config.restrictedConversionSources.includes(source));
    if (convertsGlobally) {
      const converted = points * this.config.growTimeSecondsPerPoint;
      this.state.availableGrowTimeSeconds = this.clampReserve(
        this.state.availableGrowTimeSeconds + converted,
      );
    }
    this.state.lastTrigger = source;
  }

  private resolveConsumption(policy: GrowTimeConsumptionPolicy, randomUnit: number): number {
    if (policy.kind === "duration") {
      if (!Number.isFinite(policy.seconds) || policy.seconds < 0) {
        throw new RangeError("Duration consumption must be a finite non-negative number.");
      }
      return policy.seconds;
    }
    if (
      !Number.isFinite(policy.minimumSeconds) || !Number.isFinite(policy.maximumSeconds) ||
      policy.minimumSeconds < 0 || policy.maximumSeconds < policy.minimumSeconds ||
      !Number.isFinite(policy.chaos) || policy.chaos < 0 || policy.chaos > 1
    ) {
      throw new RangeError("Invalid chaos consumption range or chaos value.");
    }
    if (!Number.isFinite(randomUnit) || randomUnit < 0 || randomUnit > 1) {
      throw new RangeError("randomUnit must be between 0 and 1.");
    }
    const spread = (policy.maximumSeconds - policy.minimumSeconds) * policy.chaos;
    return policy.minimumSeconds + randomUnit * spread;
  }

  private clampReserve(value: number): number {
    return this.config.maxReserveSeconds === null
      ? Math.max(0, value)
      : Math.min(this.config.maxReserveSeconds, Math.max(0, value));
  }

  private observeTime(value: number): void {
    this.assertTime(value);
    if (this.state.lastSimulationTimeSeconds === null) {
      this.state.lastSimulationTimeSeconds = value;
    } else if (value < this.state.lastSimulationTimeSeconds) {
      throw new RangeError("Simulation time cannot move backwards.");
    } else if (value > this.state.lastSimulationTimeSeconds) {
      this.advance(value);
    }
  }

  private assertTime(value: number): void {
    if (!Number.isFinite(value) || value < 0) {
      throw new RangeError("Simulation time must be a finite non-negative number.");
    }
    if (this.state.lastSimulationTimeSeconds !== null && value < this.state.lastSimulationTimeSeconds) {
      throw new RangeError("Simulation time cannot move backwards.");
    }
  }

  private assertConfig(config: GrowTimeConfig): void {
    for (const [key, value] of Object.entries(config)) {
      if (typeof value === "number" && (!Number.isFinite(value) || value < 0)) {
        throw new RangeError(`${key} must be a finite non-negative number.`);
      }
    }
    if (config.maxReserveSeconds !== null && config.maxReserveSeconds < 0) {
      throw new RangeError("maxReserveSeconds must be null or non-negative.");
    }
  }

  private assertSnapshot(state: GrowTimeState): void {
    if (
      !Number.isFinite(state.stackPointsEarned) || state.stackPointsEarned < 0 ||
      !Number.isFinite(state.availableGrowTimeSeconds) || state.availableGrowTimeSeconds < 0
    ) throw new RangeError("Persisted Grow Time snapshot contains invalid values.");
  }
}

/** localStorage adapter; safely no-ops when storage is unavailable or malformed. */
export class LocalStorageGrowTimeStore implements GrowTimeStore {
  constructor(private readonly storage: Storage, private readonly key = "m1as.grow-time.v1") {}

  load(): GrowTimeSnapshot | null {
    try {
      const raw = this.storage.getItem(this.key);
      if (!raw) return null;
      const value = JSON.parse(raw) as Partial<GrowTimeSnapshot>;
      if (
        value.version !== 1 ||
        typeof value.stackPointsEarned !== "number" || !Number.isFinite(value.stackPointsEarned) ||
        value.stackPointsEarned < 0 ||
        typeof value.availableGrowTimeSeconds !== "number" ||
        !Number.isFinite(value.availableGrowTimeSeconds) || value.availableGrowTimeSeconds < 0
      ) return null;
      return {
        version: 1,
        stackPointsEarned: value.stackPointsEarned,
        availableGrowTimeSeconds: value.availableGrowTimeSeconds,
      };
    } catch {
      return null;
    }
  }

  save(snapshot: GrowTimeSnapshot): void {
    this.storage.setItem(this.key, JSON.stringify(snapshot));
  }
}
