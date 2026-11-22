import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { TwoDimensionalSpriteGrowthModel } from "./two-dimensional-sprite-growth-model.js";
import {
  parseTwoDimensionalSpriteExperimentConfig,
  TwoDimensionalSpriteExperimentRunner,
  validateTwoDimensionalSpriteExperimentConfig,
  type TwoDimensionalSpriteExperimentConfig,
} from "./two-dimensional-sprite-experiment-runner.js";

const baseConfig: TwoDimensionalSpriteExperimentConfig = {
  schemaVersion: 1,
  experimentId: "sprite-json-smoke-test",
  configurationVersion: "test-v1",
  subject: {
    subjectId: "test-subject",
    assetId: "test-character.png",
    assetKind: "png",
    initialDimensions: { x: 2, y: 4, z: 0 },
    worldUnit: "m",
  },
  durationSeconds: 3,
  timestepSeconds: 0.5,
  events: [
    {
      atSeconds: 0,
      action: {
        kind: "growth",
        command: {
          kind: "discrete",
          commandId: "grow-1",
          stimulus: "json-test",
          amount: { kind: "relative_change", fraction: 1 },
          requestedDurationSeconds: 1,
        },
      },
    },
  ],
};

function makeModel(): { sprite: THREE.Sprite; model: TwoDimensionalSpriteGrowthModel } {
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial());
  sprite.scale.set(2, 4, 1);
  return { sprite, model: new TwoDimensionalSpriteGrowthModel(sprite) };
}

test("2D sprite experiment config parses valid JSON and rejects malformed JSON", () => {
  const parsed = parseTwoDimensionalSpriteExperimentConfig(JSON.stringify(baseConfig));
  assert.equal(parsed.experimentId, baseConfig.experimentId);
  assert.throws(() => parseTwoDimensionalSpriteExperimentConfig("{bad json"), /Invalid experiment JSON/);
});

test("2D sprite experiment config reports unsupported regional growth and unordered events", () => {
  const invalid = {
    ...baseConfig,
    events: [
      { atSeconds: 1, action: { kind: "growth", command: {
        kind: "discrete", commandId: "regional", stimulus: "test",
        amount: { kind: "regional_growth", regionId: "torso", amount: { kind: "relative_change", fraction: 0.2 } },
      } } },
      { atSeconds: 0.5, action: { kind: "breathing", active: true } },
    ],
  };
  const result = validateTwoDimensionalSpriteExperimentConfig(invalid);
  assert.equal(result.valid, false);
  if (!result.valid) {
    assert.ok(result.issues.some(issue => issue.path.includes("amount.kind")));
    assert.ok(result.issues.some(issue => issue.path.endsWith("atSeconds")));
  }
});

test("runner executes JSON growth events at simulation times and captures telemetry", async () => {
  const { sprite, model } = makeModel();
  const runner = new TwoDimensionalSpriteExperimentRunner(model, baseConfig);
  await runner.initialize();
  const result = await runner.run();
  assert.equal(result.endedAtSeconds, 3);
  assert.equal(result.commandResults.length, 1);
  assert.equal(result.commandResults[0].accepted, true);
  assert.equal(result.samples[result.samples.length - 1]?.telemetry.currentScale, 2);
  assert.equal(sprite.scale.x, 4);
  assert.equal(sprite.scale.y, 8);
  assert.ok(result.samples.some(sample => sample.simulationTimeSeconds === 1));
});

test("runner splits fixed steps at event boundaries and supports optional breathing events", async () => {
  const { model } = makeModel();
  const config: TwoDimensionalSpriteExperimentConfig = {
    ...baseConfig,
    durationSeconds: 2,
    timestepSeconds: 0.5,
    biologicalBreathing: { enabled: true },
    events: [
      { atSeconds: 0.25, action: { kind: "breathing", active: true } },
      { atSeconds: 1.25, action: { kind: "breathing", active: false } },
    ],
  };
  const runner = new TwoDimensionalSpriteExperimentRunner(model, config);
  await runner.initialize();
  const result = await runner.run();
  assert.ok(result.samples.some(sample => sample.simulationTimeSeconds === 0.25));
  assert.ok(result.samples.some(sample => sample.simulationTimeSeconds === 1.25));
  assert.equal(result.samples[result.samples.length - 1]?.telemetry.modelData?.biologicalBreathingActive, false);
  assert.ok(result.samples.some(sample => sample.telemetry.biologicalBreath !== undefined));
});

test("runner rejects breathing events unless breathing is enabled", async () => {
  const { model } = makeModel();
  const config: TwoDimensionalSpriteExperimentConfig = {
    ...baseConfig,
    events: [{ atSeconds: 0, action: { kind: "breathing", active: true } }],
  };
  const runner = new TwoDimensionalSpriteExperimentRunner(model, config);
  await assert.rejects(() => runner.initialize(), /Breathing events require/);
});
