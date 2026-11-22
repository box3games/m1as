import test from "node:test";
import assert from "node:assert/strict";
import { AabbBroadPhaseIntegrityDetector, DeformationIntegrityMonitor, type IntegrityDetectorContext } from "./deformation-integrity-monitor.js";

const context: IntegrityDetectorContext = {
  subjectId: "subject-1",
  rigId: "rig-1",
  simulationTimeSeconds: 12.5,
  posture: "crawl",
  actualScale: { status: "available", value: 4.2, unit: "ratio", provenance: "growth-model" },
  stageRelativeScale: { status: "available", value: 1.4, unit: "ratio", provenance: "stage-profile" },
  animationPhase: "hold",
  experimentId: "experiment-1",
  frameNumber: 250,
  sequenceNumber: 3,
  geometry: [],
};

test("reports not_tested when no integrity detectors are registered", () => {
  const monitor = new DeformationIntegrityMonitor();
  const report = monitor.inspect(context);
  assert.equal(report.telemetry.deformationStatus, "not_tested");
  assert.equal(report.telemetry.observations.length, 0);
  assert.equal(report.posture, "crawl");
  assert.equal(report.animationPhase, "hold");
  assert.equal(report.experimentId, "experiment-1");
});

test("preserves detector findings and simulation-time correlation", () => {
  const monitor = new DeformationIntegrityMonitor();
  monitor.registerDetector({
    id: "test-self-intersection",
    supportedKinds: ["self_intersection"],
    inspect: () => ({
      status: "completed",
      observations: [{
        kind: "self_intersection",
        subjectRegionIds: ["perineum", "thighs"],
        severity: "warning",
        status: "detected",
        provenance: "fixture-detector",
        details: "Synthetic test observation.",
      }],
    }),
  });
  const report = monitor.inspect(context);
  assert.equal(report.telemetry.deformationStatus, "warning");
  assert.equal(report.telemetry.observations[0].simulationTimeSeconds, 12.5);
  assert.equal(report.telemetry.observations[0].observationId, "test-self-intersection:3:0");
  assert.deepEqual(report.telemetry.observations[0].subjectRegionIds, ["perineum", "thighs"]);
});

test("distinguishes unsupported, not-tested, and failed detector states", () => {
  const monitor = new DeformationIntegrityMonitor();
  monitor.registerDetector({ id: "unsupported", supportedKinds: [], inspect: () => ({ status: "unsupported", reason: "No mesh data." }) });
  assert.equal(monitor.inspect(context).telemetry.deformationStatus, "unsupported");
  monitor.unregisterDetector("unsupported");
  monitor.registerDetector({ id: "not-tested", supportedKinds: [], inspect: () => ({ status: "not_tested", reason: "Detector disabled." }) });
  assert.equal(monitor.inspect(context).telemetry.deformationStatus, "not_tested");
  monitor.unregisterDetector("not-tested");
  monitor.registerDetector({ id: "failed", supportedKinds: [], inspect: () => { throw new Error("fixture failure"); } });
  const failed = monitor.inspect(context);
  assert.equal(failed.telemetry.deformationStatus, "failed");
  assert.equal(failed.detectorResults[0].reason, "fixture failure");
});

test("prevents duplicate detector IDs and supports removal and disposal", () => {
  const monitor = new DeformationIntegrityMonitor();
  const detector = { id: "detector", supportedKinds: [], inspect: () => ({ status: "not_tested" as const, reason: "idle" }) };
  monitor.registerDetector(detector);
  assert.throws(() => monitor.registerDetector(detector), /already registered/);
  assert.deepEqual(monitor.registeredDetectorIds, ["detector"]);
  assert.equal(monitor.unregisterDetector("detector"), true);
  monitor.registerDetector(detector);
  monitor.dispose();
  assert.deepEqual(monitor.registeredDetectorIds, []);
});

test("rejects invalid simulation timestamps", () => {
  const monitor = new DeformationIntegrityMonitor();
  assert.throws(() => monitor.inspect({ ...context, simulationTimeSeconds: Number.NaN }), /finite and non-negative/);
});

test("AABB detector reports broad-phase candidates without claiming exact clipping", () => {
  const monitor = new DeformationIntegrityMonitor();
  monitor.registerDetector(new AabbBroadPhaseIntegrityDetector());
  const overlapping = monitor.inspect({
    ...context,
    geometry: [
      { objectId: "left-thigh", role: "character_region", regionId: "thighs", bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 2, y: 2, z: 2 } } },
      { objectId: "wall", role: "environment", bounds: { min: { x: 1, y: 0, z: 0 }, max: { x: 3, y: 2, z: 2 } } },
    ],
  });
  assert.equal(overlapping.telemetry.deformationStatus, "warning");
  assert.match(overlapping.telemetry.observations[0].details ?? "", /AABB overlap candidate only/);
  assert.equal(overlapping.detectorResults[0].verificationLevel, "broad_phase_candidate");

  const clear = monitor.inspect({ ...context, geometry: [] });
  assert.equal(clear.telemetry.deformationStatus, "not_tested");
});
