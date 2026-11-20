import test from 'node:test';
import assert from 'node:assert/strict';
import type { ExperimentManifest, ExperimentHypothesisRecord } from './contracts.js';
import { BrowserDownloadExperimentStorage } from './browser-download-storage.js';

const manifest: ExperimentManifest = {
  experimentId: 'browser-export-test', schemaVersion: 1,
  createdAtISO: '2026-11-20T00:00:00.000Z', title: 'Browser export test',
  buildVersion: 'test', configurationVersion: 'test', worldUnit: 'meters',
  screenCoordinateConvention: 'normalized_top_left_origin',
  captureProfile: {
    name: 'lightweight', mode: 'snapshot', eventTriggers: ['growth_queued'],
    preEventWindowSeconds: 0.5, postEventWindowSeconds: 1,
    includeCamera: true, includeCharacter: true, includeWorldLandmarks: false,
    includeScreenSpace: true, includePerception: true,
  },
  configurationRefs: { character: 'c', growth: 'g', camera: 'cam', world: 'w' },
};

test('browser storage exports manifest and appended records as a portable JSON package', async () => {
  const ready: { value?: { url: string; fileName: string } } = {};
  const storage = new BrowserDownloadExperimentStorage((url, fileName) => {
    ready.value = { url, fileName };
  });
  await storage.createManifest(manifest);
  const record: ExperimentHypothesisRecord = {
    recordId: 'hypothesis-1', experimentId: manifest.experimentId, schemaVersion: 1,
    time: { simulationTimeSeconds: 0.25, sequenceNumber: 0 },
    hypothesisId: 'h1', kind: 'presentation', statement: 'Framing increases apparent scale.',
    successCriteria: ['screen occupancy increases'], failureCriteria: ['framing loses subject'],
  };
  await storage.appendRecords(manifest.experimentId, 'hypotheses', [record]);
  await storage.finalize(manifest.experimentId, {
    simulationTimeSeconds: 1, sequenceNumber: 1,
  });

  assert.ok(ready.value);
  const exportResult = ready.value;
  const response = await fetch(exportResult.url);
  const payload = await response.json() as {
    packageFormat: string;
    manifest: ExperimentManifest;
    streams: Record<string, ExperimentHypothesisRecord[]>;
  };
  assert.equal(exportResult.fileName, '13163r-experiment-browser-export-test.json');
  assert.equal(payload.packageFormat, 'm1as-experiment-json');
  assert.equal(payload.manifest.experimentId, manifest.experimentId);
  assert.equal(payload.streams.hypotheses[0].hypothesisId, 'h1');
  storage.dispose();
});
