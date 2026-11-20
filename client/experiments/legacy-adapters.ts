import type { GrowthEvent } from '../GrowthEventQueue.js';
import {
  EXPERIMENT_SCHEMA_VERSION,
  type ExperimentTime, type GrowthExecutionRecord, type GrowthOutcome,
  type GrowthRequestRecord, type RecordId,
} from './contracts.js';

export interface LegacyQueueReleaseObservation {
  recordId: RecordId;
  experimentId: string;
  observedEventId: string;
  time: ExperimentTime;
  legacyEvent: GrowthEvent;
  provenance: 'legacy_observation';
  missingIdentity: true;
}

/** Observes a queue release without fabricating absent request/decision/event IDs. */
export function observeLegacyQueueRelease(input: {
  recordId: RecordId; experimentId: string; observedEventId: string;
  time: ExperimentTime; event: GrowthEvent;
}): LegacyQueueReleaseObservation {
  return {
    ...input, time: { ...input.time }, legacyEvent: { ...input.event },
    provenance: 'legacy_observation', missingIdentity: true,
  };
}

/** Synthetic requests are explicit harness injections, never reconstructed gameplay. */
export function createSyntheticHarnessRequest(input: {
  recordId: RecordId; experimentId: string; requestId: string;
  time: ExperimentTime; outcome: GrowthOutcome; source?: string;
}): GrowthRequestRecord {
  return {
    recordId: input.recordId, experimentId: input.experimentId,
    schemaVersion: EXPERIMENT_SCHEMA_VERSION, time: { ...input.time },
    requestId: input.requestId, mode: 'outcome', source: input.source ?? 'harness',
    requestedOutcome: input.outcome,
  };
}

/** Queue release is not proof that character execution finished. */
export function legacyReleaseToExecutionObservation(
  observation: LegacyQueueReleaseObservation,
): GrowthExecutionRecord {
  return {
    recordId: observation.recordId, experimentId: observation.experimentId,
    schemaVersion: EXPERIMENT_SCHEMA_VERSION, time: { ...observation.time },
    eventId: observation.observedEventId, status: 'active',
    initialScale: { status: 'not_captured', reason: 'Legacy queue release has no execution-start scale.' },
    finalScale: { status: 'not_captured', reason: 'Queue release does not prove execution completion.' },
    provenance: 'legacy_observation',
    deviations: ['Legacy queue item has no native requestId, decisionId, or eventId.'],
  };
}
