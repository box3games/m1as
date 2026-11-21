import type { ExperimentId, ExperimentManifest, ExperimentRecord, ExperimentTime } from "./contracts.js";
import type { ExperimentStorage } from "./recorder.js";

/** Writes the same experiment stream to durable storage and optional export mirrors. */
export class MultiTargetExperimentStorage implements ExperimentStorage {
  constructor(private readonly targets: ExperimentStorage[]) {
    if (targets.length === 0) throw new Error("At least one experiment storage target is required.");
  }

  async createManifest(manifest: ExperimentManifest): Promise<void> {
    await this.run(target => target.createManifest(manifest));
  }

  async appendRecords(experimentId: ExperimentId, stream: string,
    records: readonly ExperimentRecord[]): Promise<void> {
    await this.run(target => target.appendRecords(experimentId, stream, records));
  }

  async finalize(experimentId: ExperimentId, endedAt: ExperimentTime): Promise<void> {
    await this.run(target => target.finalize?.(experimentId, endedAt) ?? Promise.resolve());
  }

  private async run(operation: (target: ExperimentStorage) => Promise<void>): Promise<void> {
    const outcomes = await Promise.allSettled(this.targets.map(operation));
    const failures = outcomes.filter((outcome): outcome is PromiseRejectedResult => outcome.status === "rejected");
    if (failures.length) {
      throw new AggregateError(failures.map(failure => failure.reason),
        `${failures.length} experiment storage target(s) failed.`);
    }
  }
}
