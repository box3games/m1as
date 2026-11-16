export enum GrowthStimulusType {
  Consumption = 'Consumption',
  Buff = 'Buff',
  Exercise = 'Exercise',
  Environmental = 'Environmental',
  NPCInfluence = 'NPCInfluence',
  ToolActivation = 'ToolActivation',
}

export interface GrowthEvent {
  oldScale: number;
  newScale: number;
  delta: number;
  growthPressure: number;
  type: GrowthStimulusType;
  entropyImpact: number;
  delayWeight: number;
}

interface TimedEvent {
  event: GrowthEvent;
  timeLeft: number;
}

export interface CascadeBurstPayload {
  bugKineticKick: number;
  instabilityScore: number;
  totalPressure: number;
  newTargetScale: number;
  dominantStimulus: GrowthStimulusType;
}

export interface GrowthQueueTelemetry {
  visualScale: number;
  targetScale: number;
  absoluteFinalScale: number;
  instabilityScore: number;
  pendingEventsCount: number;
  currentThreshold: number;
}

export class GrowthEventQueue {
  private readonly queue: TimedEvent[] = [];
  private readonly ready: GrowthEvent[] = [];

  // Dynamic Rate Limiter State
  private printThreshold = 1;
  private releasedSinceLog = 0;
  private readonly growthFactor = 1.5;

  // Instability & Spring Mechanics
  public baseStiffness = 150.0;
  public baseDamping = 10.0;

  private instabilityScore = 0.0;
  private visualScale = 1.0;
  private targetScale = 1.0;
  private growthVelocity = 0.0;

  public onCascadeBurst?: (burst: CascadeBurstPayload) => void;

  constructor(initialScale = 1.0) {
    this.visualScale = initialScale;
    this.targetScale = initialScale;
  }

  public get hasEvents(): boolean {
    return this.ready.length > 0;
  }

  public get currentVisualScale(): number {
    return this.visualScale;
  }

  public get currentTargetScale(): number {
    return this.targetScale;
  }

  public get currentInstability(): number {
    return this.instabilityScore;
  }

  public get pendingCount(): number {
    return this.queue.length;
  }

  public reset(scale = 1.0): void {
    this.queue.length = 0;
    this.ready.length = 0;
    this.printThreshold = 1;
    this.releasedSinceLog = 0;
    this.instabilityScore = 0.0;
    this.visualScale = scale;
    this.targetScale = scale;
    this.growthVelocity = 0.0;
  }

  public push(
    oldScale: number,
    newScale: number,
    type: GrowthStimulusType = GrowthStimulusType.Consumption,
    customDelayOverride?: number
  ): void {
    const delta = newScale - oldScale;
    const pressure = Math.min(5.0, Math.max(0.0, delta / Math.max(oldScale, 0.01)));
    const entropy = pressure * 0.5 + (type === GrowthStimulusType.Buff ? 0.2 : 0.05);
    const delay =
      customDelayOverride !== undefined
        ? customDelayOverride
        : Math.min(1.25, Math.max(0.15, 0.25 + entropy * 0.15));

    this.queue.push({
      event: {
        oldScale,
        newScale,
        delta,
        growthPressure: pressure,
        type,
        entropyImpact: entropy,
        delayWeight: delay,
      },
      timeLeft: delay,
    });
  }

  public pop(): GrowthEvent | undefined {
    return this.ready.shift();
  }

  public step(deltaSeconds: number): GrowthQueueTelemetry {
    const fDelta = Math.min(deltaSeconds, 0.05);

    // 1. Process Unstable Physics Simulation Loop
    const dynamicStiffness = this.baseStiffness * (1.0 + this.instabilityScore * 2.0);
    const dynamicDamping = Math.max(this.baseDamping - this.instabilityScore * 1.5, 1.0);

    const displacement = this.visualScale - this.targetScale;
    const springForce = -dynamicStiffness * displacement;
    const dampingForce = -dynamicDamping * this.growthVelocity;
    const acceleration = springForce + dampingForce;

    this.growthVelocity += acceleration * fDelta;

    let organicTremble = 0.0;
    if (this.instabilityScore > 0.1) {
      organicTremble = (Math.random() * 2 - 1) * this.instabilityScore * 0.05;
      this.instabilityScore = Math.max(0.0, this.instabilityScore - fDelta * 0.5);
    }

    this.visualScale += this.growthVelocity * fDelta;
    const absoluteFinalScale = Math.max(0.25, this.visualScale + organicTremble);

    // 2. Queue & Pulse Checking Loop
    if (this.queue.length === 0) {
      this.printThreshold = 1;
      this.releasedSinceLog = 0;
      return {
        visualScale: this.visualScale,
        targetScale: this.targetScale,
        absoluteFinalScale,
        instabilityScore: this.instabilityScore,
        pendingEventsCount: 0,
        currentThreshold: this.printThreshold,
      };
    }

    const count = this.queue.length;
    let shouldPulseThisFrame = false;
    let totalPressureInPulse = 0.0;
    let highestNewScaleThisFrame = this.targetScale;
    let dominantStimulus = GrowthStimulusType.Consumption;

    for (let i = 0; i < count; i++) {
      const t = this.queue.shift()!;
      t.timeLeft -= fDelta;

      if (t.timeLeft <= 0.0) {
        this.ready.push(t.event);
        this.releasedSinceLog++;

        totalPressureInPulse += t.event.growthPressure;
        dominantStimulus = t.event.type;
        if (t.event.newScale > highestNewScaleThisFrame) {
          highestNewScaleThisFrame = t.event.newScale;
        }

        if (this.releasedSinceLog >= this.printThreshold) {
          shouldPulseThisFrame = true;
          this.releasedSinceLog = 0;

          const nextThreshold = Math.ceil(this.printThreshold * this.growthFactor);
          this.printThreshold = Math.max(this.printThreshold + 1, nextThreshold);
        }
      } else {
        this.queue.push(t);
      }
    }

    // 3. Cascade Trigger Response
    if (shouldPulseThisFrame) {
      this.targetScale = highestNewScaleThisFrame;
      this.instabilityScore = Math.min(2.0, Math.max(0.0, totalPressureInPulse * 0.3));

      const minKick = Math.min(totalPressureInPulse, this.instabilityScore * 5.0);
      const maxKick = Math.max(totalPressureInPulse, this.instabilityScore * 5.0);
      const bugKineticKick = minKick + Math.random() * (maxKick - minKick);
      this.growthVelocity += bugKineticKick * 3.5;

      this.onCascadeBurst?.({
        bugKineticKick,
        instabilityScore: this.instabilityScore,
        totalPressure: totalPressureInPulse,
        newTargetScale: this.targetScale,
        dominantStimulus,
      });
    }

    return {
      visualScale: this.visualScale,
      targetScale: this.targetScale,
      absoluteFinalScale,
      instabilityScore: this.instabilityScore,
      pendingEventsCount: this.queue.length,
      currentThreshold: this.printThreshold,
    };
  }
}
