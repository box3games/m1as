import test from "node:test";
import assert from "node:assert/strict";
import { assessFramingIntegrity } from "./framing-integrity-monitor.js";

function observation(overrides: Record<string, unknown> = {}) {
  return {
    sampleId: "frame-001",
    subjectId: "subject-1",
    simulationTimeSeconds: 10,
    configurationVersion: "camera-config-v1",
    growthStateId: "growth-state-10",
    framingIntent: "full-body" as const,
    projectedBounds: { left: 0.2, top: 0.1, right: 0.8, bottom: 0.9 },
    projectedDepthRange: { minimumNdc: -0.8, maximumNdc: 0.8 },
    nativeRecoveryAvailable: true,
    ...overrides,
  };
}

test("reports intact full-body framing and visible viewport occupancy", () => {
  const result = assessFramingIntegrity(observation());
  assert.equal(result.trigger, "none");
  assert.equal(result.visibleOccupancy, 0.48);
  assert.equal(result.depthClipped, false);
});

test("distinguishes recoverable screen clipping from unrecoverable framing", () => {
  const recoverable = assessFramingIntegrity(observation({
    projectedBounds: { left: -0.2, top: 0.1, right: 0.8, bottom: 1.1 },
    nativeRecoveryAvailable: true,
  }));
  assert.equal(recoverable.trigger, "subject-clipped");
  assert.equal(recoverable.visibleOccupancy, 0.8);

  const unrecoverable = assessFramingIntegrity(observation({
    projectedBounds: { left: -0.2, top: 0.1, right: 0.8, bottom: 1.1 },
    nativeRecoveryAvailable: false,
  }));
  assert.equal(unrecoverable.trigger, "framing-unrecoverable");
});

test("depth clipping takes precedence over screen framing", () => {
  const result = assessFramingIntegrity(observation({
    projectedBounds: { left: -0.2, top: 0.1, right: 0.8, bottom: 1.1 },
    projectedDepthRange: { minimumNdc: -1.2, maximumNdc: 0.8 },
  }));
  assert.equal(result.trigger, "depth-range-exhausted");
  assert.equal(result.depthClipped, true);
});

test("intentional dramatic crops do not trigger screen-clipping recovery", () => {
  const result = assessFramingIntegrity(observation({
    framingIntent: "dramatic-crop",
    projectedBounds: { left: -0.5, top: 0.1, right: 1.5, bottom: 1.2 },
  }));
  assert.equal(result.trigger, "none");
  assert.equal(result.visibleOccupancy, 0.9);
});

test("unavailable projection bounds remain explicit and do not fabricate occupancy", () => {
  const result = assessFramingIntegrity(observation({
    projectedBounds: null,
    projectedDepthRange: null,
  }));
  assert.equal(result.trigger, "projected-bounds-unavailable");
  assert.equal(result.visibleOccupancy, undefined);
});

test("rejects invalid bounds, depth ranges, and missing recovery evidence", () => {
  assert.throws(() => assessFramingIntegrity(observation({
    projectedBounds: { left: 0.8, top: 0, right: 0.2, bottom: 1 },
  })), /non-negative width/);
  assert.throws(() => assessFramingIntegrity(observation({
    projectedDepthRange: { minimumNdc: 1, maximumNdc: -1 },
  })), /finite and ordered/);
  assert.throws(() => assessFramingIntegrity(observation({
    nativeRecoveryAvailable: undefined,
  })), /explicitly provided/);
});
