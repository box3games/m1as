import type { CaptureProfile, PresentationSampleRecord } from './contracts.js';
import type { ExperimentRecorder } from './recorder.js';

export interface CaptureTrigger {
  type: string;
  simulationTimeSeconds: number;
}

/**
 * Simulation-driven sampler. It owns no timer or render loop: the host calls
 * shouldSample/pushSample from its existing simulation cadence.
 */
export class CaptureScheduler {
  private readonly profile: CaptureProfile;
  private readonly recorder: ExperimentRecorder;
  private readonly buffer: PresentationSampleRecord[] = [];
  private readonly written = new Set<string>();
  private lastCandidateTime = -Infinity;
  private lastWrittenTime = -Infinity;
  private postCaptureUntil = -Infinity;

  constructor(profile: CaptureProfile, recorder: ExperimentRecorder) {
    this.profile = { ...profile, eventTriggers: [...profile.eventTriggers] };
    this.recorder = recorder;
  }

  private get intervalSeconds(): number {
    return this.profile.sampleIntervalSeconds ?? 0.1;
  }

  /** Whether the host should pay the cost of building a presentation sample. */
  public shouldSample(simulationTimeSeconds: number): boolean {
    if (!Number.isFinite(simulationTimeSeconds) || simulationTimeSeconds < 0) return false;
    const needsPreEventBuffer = this.profile.preEventWindowSeconds > 0;
    const continuous = this.profile.mode === 'continuous';
    const inPostWindow = simulationTimeSeconds <= this.postCaptureUntil;
    if (!continuous && !needsPreEventBuffer && !inPostWindow) return false;
    if (simulationTimeSeconds - this.lastCandidateTime + 1e-9 < this.intervalSeconds) return false;
    this.lastCandidateTime = simulationTimeSeconds;
    return true;
  }

  public pushSample(sample: PresentationSampleRecord): void {
    const time = sample.time.simulationTimeSeconds;
    if (!Number.isFinite(time) || time < 0) return;
    this.buffer.push(sample);
    const oldest = time - Math.max(this.profile.preEventWindowSeconds, this.intervalSeconds);
    while (this.buffer.length && this.buffer[0].time.simulationTimeSeconds < oldest) {
      this.buffer.shift();
    }
    if (this.profile.mode === 'continuous' ||
        time <= this.postCaptureUntil) this.write(sample);
  }

  /** Flushes the pre-event window and opens/extends a post-event capture window. */
  public trigger(trigger: CaptureTrigger): void {
    if (!this.profile.eventTriggers.includes(trigger.type)) return;
    const start = Math.max(0, trigger.simulationTimeSeconds - this.profile.preEventWindowSeconds);
    for (const sample of this.buffer) {
      const sampleTime = sample.time.simulationTimeSeconds;
      if (sampleTime >= start && sampleTime <= trigger.simulationTimeSeconds) this.write(sample);
    }
    this.postCaptureUntil = Math.max(
      this.postCaptureUntil,
      trigger.simulationTimeSeconds + this.profile.postEventWindowSeconds,
    );
  }

  /** Explicitly flushes any retained samples and clears scheduler state. */
  public flush(): void {
    for (const sample of this.buffer) this.write(sample);
    this.buffer.length = 0;
  }

  private write(sample: PresentationSampleRecord): void {
    if (this.written.has(sample.sampleId)) return;
    this.written.add(sample.sampleId);
    this.lastWrittenTime = Math.max(this.lastWrittenTime, sample.time.simulationTimeSeconds);
    this.recorder.append('presentation', sample);
  }

  public get bufferedSampleCount(): number { return this.buffer.length; }
  public get lastWrittenSimulationTime(): number { return this.lastWrittenTime; }
}
