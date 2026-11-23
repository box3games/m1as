import test from "node:test";
import assert from "node:assert/strict";
import { BiologicalBreathingGrowthModel } from "./biological-breathing-model.js";
import type {
  BiologicalBreathTelemetry,
  GrowthModel,
  GrowthModelCommand,
  GrowthModelContext,
  GrowthModelDescriptor,
  GrowthModelResult,
  GrowthModelSubject,
  GrowthModelTelemetry,
} from "./model-contract.js";

class RecordingModel implements GrowthModel {
  readonly descriptor: GrowthModelDescriptor = {
    id: "recording-model",
    displayName: "Recording Model",
    version: "test",
    capabilities: {
      wholeObjectScale: true,
      regionalGrowth: false,
      meshDeformation: false,
      skeletalDeformation: false,
      proceduralVfx: false,
      sustainedFlow: false,
      deterministicReplay: "deterministic",
      supportedAssetKinds: ["test"],
    },
  };
  readonly applied: Array<{ state: BiologicalBreathTelemetry; growthDelta: number }> = [];
  currentScale = 1;
  initialize(_subject: GrowthModelSubject, _context: GrowthModelContext): void {}
  apply(command: GrowthModelCommand, _context: GrowthModelContext): GrowthModelResult {
    return { commandId: command.commandId, accepted: true };
  }
  applyBiologicalBreathState(state: BiologicalBreathTelemetry, growthDelta: number): void {
    this.currentScale += growthDelta;
    this.applied.push({ state, growthDelta });
  }
  advance(_time: number, _delta: number): void {}
  readTelemetry(time: number): GrowthModelTelemetry {
    return { simulationTimeSeconds: time, currentScale: this.currentScale };
  }
  reset(): void { this.currentScale = 1; this.applied.length = 0; }
  dispose(): void {}
}

const subject: GrowthModelSubject = {
  subjectId: "subject",
  assetId: "fixture",
  assetKind: "test",
  initialDimensions: { x: 1, y: 1, z: 1 },
  worldUnit: "m",
};
const context: GrowthModelContext = {
  experimentId: "breath-adapter-test",
  simulationTimeSeconds: 0,
  configurationVersion: "test",
};

test("breathing decorator is opt-in and preserves ordinary growth commands", async () => {
  const inner = new RecordingModel();
  const model = new BiologicalBreathingGrowthModel(inner);
  model.initialize(subject, context);
  const result = model.apply({ kind: "discrete", commandId: "ordinary", stimulus: "Buff", amount: { kind: "relative_change", fraction: 0.2 } }, context);
  assert.equal((await result).accepted, true);
  model.advance(0.1, 0.1);
  assert.equal(inner.applied.length, 0);
  model.startBreathing();
  model.advance(0.2, 0.2);
  assert.equal(inner.applied.length, 1);
  assert.ok(inner.applied[0].growthDelta > 0);
});

test("breathing decorator exposes biological telemetry and pauses without losing scale", () => {
  const inner = new RecordingModel();
  const model = new BiologicalBreathingGrowthModel(inner);
  model.initialize(subject, context);
  model.startBreathing();
  model.advance(0.35, 0.35);
  const telemetry = model.readTelemetry(0.35);
  assert.equal(telemetry.biologicalBreath?.phase, "hold");
  assert.equal(telemetry.biologicalBreath?.actualScale, 1.08);
  model.stopBreathing();
  const count = inner.applied.length;
  model.advance(0.5, 0.15);
  assert.equal(inner.applied.length, count);
  assert.equal(model.readTelemetry(0.5).biologicalBreath?.actualScale, 1.08);
});

test("reset clears breathing state and returns to inactive", () => {
  const inner = new RecordingModel();
  const model = new BiologicalBreathingGrowthModel(inner);
  model.initialize(subject, context);
  model.startBreathing();
  model.advance(0.35, 0.35);
  model.reset();
  assert.equal(model.isBreathingActive(), false);
  assert.equal(model.readTelemetry(0).biologicalBreath?.actualScale, 1);
  assert.equal(inner.applied.length, 1);
  assert.equal(inner.applied[0].growthDelta, 0);
});
