import {
  EXPERIMENT_SCHEMA_VERSION,
  type ExperimentManifest,
  type PresentationSampleRecord,
} from './contracts.js';
import { CaptureScheduler } from './capture-scheduler.js';
import { ExperimentRecorder, type ExperimentStorage } from './recorder.js';
import { ExperimentTimeline } from './timeline.js';
import type { GrowthEvent } from '../GrowthEventQueue.js';
import { observeLegacyQueueRelease, legacyReleaseToExecutionObservation } from './legacy-adapters.js';

export type PresentationSamplePayload = Omit<
  PresentationSampleRecord,
  'recordId' | 'sampleId' | 'experimentId' | 'schemaVersion' | 'time'
>;

export interface ExperimentCoordinatorOptions {
  manifest: ExperimentManifest;
  storage: ExperimentStorage;
  /** Reads current presentation only; it must not mutate engine or scene state. */
  capturePresentation: () => PresentationSamplePayload;
  onCaptureError?: (error: unknown, stream: string) => void;
}

/**
 * Lifecycle and sampling facade for an existing simulation. The host supplies
 * simulation time and invokes tick/trigger; this class never starts a loop.
 */
export class ExperimentCoordinator {
  private readonly manifest: ExperimentManifest;
  private readonly timeline = new ExperimentTimeline();
  private readonly recorder: ExperimentRecorder;
  private readonly scheduler: CaptureScheduler;
  private readonly capturePresentation: () => PresentationSamplePayload;
  private started = false;
  private stopped = false;

  constructor(options: ExperimentCoordinatorOptions) {
    this.manifest = options.manifest;
    this.capturePresentation = options.capturePresentation;
    this.recorder = new ExperimentRecorder({
      manifest: options.manifest,
      storage: options.storage,
      clock: { now: () => this.timeline.next(this.lastSimulationTime) },
      onCaptureError: options.onCaptureError,
    });
    this.scheduler = new CaptureScheduler(options.manifest.captureProfile, this.recorder);
  }

  private lastSimulationTime = 0;
  private readonly pendingRelatedEventIds: string[] = [];
  public get experimentId(): string { return this.manifest.experimentId; }
  public get isRecording(): boolean { return this.started && !this.stopped && this.recorder.isRecording; }
  public get captureErrors(): ReadonlyArray<{ stream: string; error: unknown }> {
    return this.recorder.errors;
  }

  public async start(): Promise<void> {
    if (this.started || this.stopped) throw new Error('Experiment coordinator cannot be restarted.');
    await this.recorder.start();
    this.started = true;
  }

  /** Called by the host's existing update/render cadence; no time is generated here. */
  public tick(simulationTimeSeconds: number, frameNumber?: number): void {
    if (!this.isRecording) return;
    if (!Number.isFinite(simulationTimeSeconds) || simulationTimeSeconds < this.lastSimulationTime) {
      throw new RangeError('Coordinator simulation time must be finite and monotonic.');
    }
    this.lastSimulationTime = simulationTimeSeconds;
    if (this.scheduler.hasSampleAt(simulationTimeSeconds)) return;
    if (!this.scheduler.shouldSample(simulationTimeSeconds, frameNumber)) return;
    this.capture(simulationTimeSeconds, frameNumber);
  }

  /** Call at meaningful growth/camera/environment events to capture configured windows. */
  public trigger(type: string, simulationTimeSeconds: number, frameNumber?: number): void {
    if (!this.isRecording) return;
    if (!Number.isFinite(simulationTimeSeconds) || simulationTimeSeconds < this.lastSimulationTime) {
      throw new RangeError('Coordinator event time must be finite and monotonic.');
    }
    this.lastSimulationTime = simulationTimeSeconds;
    const configured = this.scheduler.trigger({ type, simulationTimeSeconds });
    if (configured && !this.scheduler.hasSampleAt(simulationTimeSeconds)) {
      this.capture(simulationTimeSeconds, frameNumber);
    }
  }

  /** Records a legacy queue release as an observation, not a fabricated native event identity. */
  public recordLegacyQueueRelease(
    event: GrowthEvent,
    simulationTimeSeconds: number,
    frameNumber?: number,
  ): void {
    if (!this.isRecording) return;
    if (!Number.isFinite(simulationTimeSeconds) || simulationTimeSeconds < this.lastSimulationTime) {
      this.recorder.reportExternalCaptureError(
        new RangeError('Legacy queue observation time must be finite and monotonic.'),
        'growth-executions',
      );
      return;
    }
    this.lastSimulationTime = simulationTimeSeconds;
    try {
      const time = this.timeline.next(simulationTimeSeconds, frameNumber);
      const observationId = `${this.experimentId}:legacy-queue-observation:${time.sequenceNumber}`;
      const observation = observeLegacyQueueRelease({
        recordId: observationId,
        experimentId: this.experimentId,
        observedEventId: observationId,
        time,
        event,
      });
      this.recorder.append(
        'growth-executions',
        legacyReleaseToExecutionObservation(observation),
      );
      this.pendingRelatedEventIds.push(observation.observedEventId);
    } catch (error) {
      this.recorder.reportExternalCaptureError(error, 'growth-executions');
    }
  }

  private capture(simulationTimeSeconds: number, frameNumber?: number): void {
    try {
      const time = this.timeline.next(simulationTimeSeconds, frameNumber);
      const payload = this.capturePresentation();
      const relatedEventIds = [...new Set([...payload.relatedEventIds, ...this.pendingRelatedEventIds])];
      this.pendingRelatedEventIds.length = 0;
      const sampleId = `${this.experimentId}:sample:${time.sequenceNumber}`;
      this.scheduler.pushSample({
        ...payload,
        relatedEventIds,
        recordId: sampleId,
        sampleId,
        experimentId: this.experimentId,
        schemaVersion: EXPERIMENT_SCHEMA_VERSION,
        time,
      });
    } catch (error) {
      // Capture provider failures are recorded as recorder errors, not thrown into simulation.
      this.recorder.reportExternalCaptureError(error, 'presentation');
    }
  }

  public async stop(): Promise<void> {
    if (!this.started || this.stopped) return;
    this.stopped = true;
    this.scheduler.flush();
    await this.recorder.stop();
  }
}
