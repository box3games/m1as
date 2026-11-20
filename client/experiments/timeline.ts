import type { ExperimentTime } from './contracts.js';

/**
 * Shared record clock. Callers provide simulation time from the active
 * simulation; this class only adds a monotonic sequence number and optional
 * wall-clock annotation.
 */
export class ExperimentTimeline {
  private sequenceNumber = 0;
  private lastSimulationTime = -Infinity;

  public next(simulationTimeSeconds: number, frameNumber?: number): ExperimentTime {
    if (!Number.isFinite(simulationTimeSeconds) || simulationTimeSeconds < 0) {
      throw new RangeError('Simulation time must be finite and non-negative.');
    }
    if (simulationTimeSeconds < this.lastSimulationTime) {
      throw new RangeError('Simulation time cannot move backwards within an experiment.');
    }
    this.lastSimulationTime = simulationTimeSeconds;
    return {
      simulationTimeSeconds,
      wallClockTimeISO: new Date().toISOString(),
      frameNumber,
      sequenceNumber: this.sequenceNumber++,
    };
  }
}
