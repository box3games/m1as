import type { ExperimentId, ExperimentManifest, ExperimentRecord, ExperimentTime } from './contracts.js';
import type { ExperimentStorage } from './recorder.js';

/**
 * Browser-local experiment package staging. Records remain in memory until
 * finalize creates a portable JSON download; no remote service is implied.
 */
export class BrowserDownloadExperimentStorage implements ExperimentStorage {
  private manifest: ExperimentManifest | null = null;
  private readonly streams = new Map<string, ExperimentRecord[]>();
  private downloadUrl: string | null = null;
  private fileName: string | null = null;

  public constructor(private readonly onReady?: (url: string, fileName: string) => void) {}

  public async createManifest(manifest: ExperimentManifest): Promise<void> {
    if (this.manifest) throw new Error('This experiment storage instance is already in use.');
    this.manifest = manifest;
  }

  public async appendRecords(
    experimentId: ExperimentId,
    stream: string,
    records: readonly ExperimentRecord[],
  ): Promise<void> {
    if (!this.manifest || this.manifest.experimentId !== experimentId) {
      throw new Error('Experiment manifest is missing or does not match the record stream.');
    }
    const bucket = this.streams.get(stream) ?? [];
    bucket.push(...records);
    this.streams.set(stream, bucket);
  }

  public async finalize(experimentId: ExperimentId, endedAt: ExperimentTime): Promise<void> {
    if (!this.manifest || this.manifest.experimentId !== experimentId) {
      throw new Error('Cannot finalize an unknown experiment.');
    }
    if (this.downloadUrl) URL.revokeObjectURL(this.downloadUrl);
    const payload = {
      packageFormat: 'm1as-experiment-json',
      packageVersion: 1,
      manifest: this.manifest,
      endedAt,
      streams: Object.fromEntries(this.streams.entries()),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    this.downloadUrl = URL.createObjectURL(blob);
    this.fileName = `13163r-experiment-${this.manifest.experimentId}.json`;
    this.onReady?.(this.downloadUrl, this.fileName);
  }

  public dispose(): void {
    if (this.downloadUrl) URL.revokeObjectURL(this.downloadUrl);
    this.downloadUrl = null;
    this.fileName = null;
  }
}
