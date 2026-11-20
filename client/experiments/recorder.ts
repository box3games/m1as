import {
  EXPERIMENT_SCHEMA_VERSION,
  type ApprovedGrowthEventRecord, type ExperimentId, type ExperimentManifest,
  type ExperimentRecordBase, type ExperimentTime, type ExperimentHypothesisRecord,
  type GrowthDecisionRecord, type GrowthExecutionRecord, type GrowthRequestRecord,
  type PerceptionAnnotationRecord, type PresentationSampleRecord, type SweetSpotEvidenceRecord,
} from './contracts.js';
import { validateExperimentManifest } from './validation.js';

export type ExperimentRecord =
  | GrowthRequestRecord | GrowthDecisionRecord | ApprovedGrowthEventRecord
  | GrowthExecutionRecord | PresentationSampleRecord | PerceptionAnnotationRecord
  | ExperimentHypothesisRecord | SweetSpotEvidenceRecord;

export interface ExperimentStorage {
  createManifest(manifest: ExperimentManifest): Promise<void>;
  appendRecords(experimentId: ExperimentId, stream: string, records: readonly ExperimentRecord[]): Promise<void>;
  finalize?(experimentId: ExperimentId, endedAt: ExperimentTime): Promise<void>;
}
export interface ExperimentClock { now(): ExperimentTime }
export interface ExperimentRecorderOptions {
  manifest: ExperimentManifest; storage: ExperimentStorage; clock: ExperimentClock;
  onCaptureError?: (error: unknown, stream: string) => void;
}

/** Append-only recorder. It does not tick the simulation, mutate queues, or control cameras. */
export class ExperimentRecorder {
  private readonly manifest: ExperimentManifest;
  private readonly storage: ExperimentStorage;
  private readonly clock: ExperimentClock;
  private readonly onCaptureError?: (error: unknown, stream: string) => void;
  private started = false;
  private starting = false;
  private stopped = false;
  private writeChain: Promise<void> = Promise.resolve();
  private readonly captureErrors: Array<{ stream: string; error: unknown }> = [];

  constructor(options: ExperimentRecorderOptions) {
    const result = validateExperimentManifest(options.manifest);
    if (!result.valid) throw new Error('Invalid experiment manifest: ' +
      result.issues.map(issue => issue.path + ': ' + issue.message).join('; '));
    this.manifest = options.manifest;
    this.storage = options.storage;
    this.clock = options.clock;
    this.onCaptureError = options.onCaptureError;
  }
  public get experimentId(): ExperimentId { return this.manifest.experimentId; }
  public get isRecording(): boolean { return this.started && !this.stopped; }
  public get errors(): ReadonlyArray<{ stream: string; error: unknown }> { return this.captureErrors; }

  private reportCaptureError(error: unknown, stream: string): void {
    this.captureErrors.push({ stream, error });
    try { this.onCaptureError?.(error, stream); } catch { /* observers cannot interrupt simulation */ }
  }

  public async start(): Promise<void> {
    if (this.started || this.starting) throw new Error('Experiment recorder has already been started.');
    this.starting = true;
    try {
      await this.storage.createManifest(this.manifest);
      this.started = true;
    } finally {
      this.starting = false;
    }
  }

  public append(stream: string, record: ExperimentRecord): void {
    if (!this.isRecording) { this.reportCaptureError(new Error('Recorder is not active.'), stream); return; }
    if (record.experimentId !== this.experimentId) { this.reportCaptureError(new Error('Record belongs to another experiment.'), stream); return; }
    if (record.schemaVersion !== EXPERIMENT_SCHEMA_VERSION) { this.reportCaptureError(new Error('Record schema version does not match recorder.'), stream); return; }
    // The promise chain preserves emission order and isolates storage failures from simulation callbacks.
    this.writeChain = this.writeChain.then(() =>
      this.storage.appendRecords(this.experimentId, stream, [record])
    ).catch(error => { this.reportCaptureError(error, stream); });
  }

  public async flush(): Promise<void> { await this.writeChain; }

  public async stop(): Promise<void> {
    if (!this.started || this.stopped) return;
    this.stopped = true;
    await this.flush();
    await this.storage.finalize?.(this.experimentId, this.clock.now());
  }
}
