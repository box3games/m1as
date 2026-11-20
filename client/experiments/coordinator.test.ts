import test from 'node:test';
import assert from 'node:assert/strict';
import type {
  CaptureProfile, ExperimentManifest, PresentationSampleRecord,
} from './contracts.js';
import { ExperimentCoordinator } from './coordinator.js';
import { GrowthStimulusType } from '../GrowthEventQueue.js';
import type { ExperimentRecord } from './recorder.js';
import type { ExperimentStorage } from './recorder.js';

const profile: CaptureProfile = {
  name: 'lightweight', mode: 'snapshot', sampleIntervalSeconds: 0.1,
  eventTriggers: ['growth_started'], preEventWindowSeconds: 0.5,
  postEventWindowSeconds: 0.5, includeCamera: true, includeCharacter: true,
  includeWorldLandmarks: false, includeScreenSpace: true, includePerception: true,
};
const manifest: ExperimentManifest = {
  experimentId: 'exp-test', schemaVersion: 1, createdAtISO: '2026-11-20T00:00:00.000Z',
  title: 'Coordinator test', buildVersion: 'test', configurationVersion: 'test',
  worldUnit: 'meters', screenCoordinateConvention: 'normalized_top_left_origin',
  captureProfile: profile,
  configurationRefs: { character: 'c', growth: 'g', camera: 'cam', world: 'w' },
};

class MemoryStorage implements ExperimentStorage {
  records: ExperimentRecord[] = [];
  async createManifest(): Promise<void> {}
  async appendRecords(_id: string, _stream: string, records: readonly ExperimentRecord[]): Promise<void> {
    this.records.push(...records);
  }
}

function samplePayload(): Omit<PresentationSampleRecord,
  'recordId' | 'sampleId' | 'experimentId' | 'schemaVersion' | 'time'> {
  return {
    cameraConfiguration: { status: 'not_captured', reason: 'test' },
    cameraRuntime: { status: 'not_captured', reason: 'test' },
    character: {
      rootTransform: { status: 'not_captured', reason: 'test' },
      worldBounds: { status: 'not_captured', reason: 'test' },
      screenBounds: { status: 'not_captured', reason: 'test' },
      screenOccupancy: { status: 'not_captured', reason: 'test' },
      posture: { status: 'not_captured', reason: 'test' },
      orientation: { status: 'not_captured', reason: 'test' },
      visible: { status: 'not_captured', reason: 'test' },
      regions: [],
    },
    worldLandmarks: [],
    screen: {
      viewport: { widthPixels: 640, heightPixels: 480, aspectRatio: 4 / 3 },
      characterBounds: { status: 'not_captured', reason: 'test' },
      characterOccupancy: { status: 'not_captured', reason: 'test' },
      viewportEdgeContact: { status: 'not_captured', reason: 'test' },
      occlusion: { status: 'not_captured', reason: 'test' },
      landmarkRatios: {},
    },
    relatedRequestIds: [], relatedDecisionIds: [], relatedEventIds: [],
  };
}

test('coordinator buffers pre-event samples and captures through post-event window', async () => {
  const storage = new MemoryStorage();
  const coordinator = new ExperimentCoordinator({
    manifest, storage, capturePresentation: samplePayload,
  });
  await coordinator.start();
  coordinator.tick(0, 0);
  coordinator.tick(0.5, 30);
  coordinator.trigger('growth_started', 0.5, 30);
  coordinator.tick(0.6, 36);
  await coordinator.stop();

  const samples = storage.records.filter((record): record is PresentationSampleRecord =>
    'sampleId' in record);
  assert.deepEqual(samples.map(sample => sample.time.simulationTimeSeconds), [0, 0.5, 0.6]);
  assert.equal(new Set(samples.map(sample => sample.sampleId)).size, samples.length);
  assert.equal(coordinator.isRecording, false);
});

test('unconfigured triggers do not flush a pre-event buffer', async () => {
  const storage = new MemoryStorage();
  const coordinator = new ExperimentCoordinator({
    manifest, storage, capturePresentation: samplePayload,
  });
  await coordinator.start();
  coordinator.tick(0, 0);
  coordinator.trigger('not_configured', 0.1, 6);
  await coordinator.stop();
  const samples = storage.records.filter(record => 'sampleId' in record);
  assert.equal(samples.length, 1); // retained buffer is flushed on orderly stop
});

test('capture-provider exceptions are isolated and reported', async () => {
  const storage = new MemoryStorage();
  const coordinator = new ExperimentCoordinator({
    manifest, storage, capturePresentation: () => { throw new Error('adapter failure'); },
  });
  await coordinator.start();
  assert.doesNotThrow(() => coordinator.tick(0, 0));
  await coordinator.stop();
  assert.equal(coordinator.captureErrors.length, 1);
  assert.match(String(coordinator.captureErrors[0].error), /adapter failure/);
});

test('overlapping event windows extend capture and do not duplicate prior samples', async () => {
  const storage = new MemoryStorage();
  const coordinator = new ExperimentCoordinator({
    manifest, storage, capturePresentation: samplePayload,
  });
  await coordinator.start();
  coordinator.tick(0, 0);
  coordinator.tick(0.5, 30);
  coordinator.trigger('growth_started', 0.5, 30);
  coordinator.tick(0.6, 36);
  coordinator.trigger('growth_started', 0.8, 48);
  coordinator.tick(0.9, 54);
  await coordinator.stop();

  const samples = storage.records.filter((record): record is PresentationSampleRecord =>
    'sampleId' in record);
  assert.deepEqual(samples.map(sample => sample.time.simulationTimeSeconds), [0, 0.5, 0.6, 0.8, 0.9]);
  assert.equal(new Set(samples.map(sample => sample.sampleId)).size, samples.length);
});

test('legacy queue release observations are exported and linked to presentation samples', async () => {
  const storage = new MemoryStorage();
  const coordinator = new ExperimentCoordinator({
    manifest, storage, capturePresentation: samplePayload,
  });
  await coordinator.start();
  coordinator.recordLegacyQueueRelease({
    oldScale: 1, newScale: 1.35, delta: 0.35, growthPressure: 0.35,
    type: GrowthStimulusType.Consumption, entropyImpact: 0.225, delayWeight: 0.28,
  }, 0.25, 15);
  coordinator.tick(0.25, 15);
  await coordinator.stop();

  const execution = storage.records.find(record =>
    'provenance' in record && record.provenance === 'legacy_observation');
  assert.ok(execution && 'eventId' in execution);
  assert.equal(execution.status, 'active');
  const presentation = storage.records.find(record => 'sampleId' in record);
  assert.ok(presentation && 'relatedEventIds' in presentation);
  assert.deepEqual(presentation.relatedEventIds, [execution.eventId]);
});
