import test from "node:test";
import assert from "node:assert/strict";
import type { GrowthModel, GrowthModelCommand, GrowthModelSubject } from "../growth/model-contract.js";
import { GrowthModelPortableAdapter } from "./growth-model-portable-adapter.js";
import { PortableEvaluationRouter, type PortableEvaluationContext } from "./portable-evaluation-router.js";

const subject: GrowthModelSubject = {
  subjectId: "subject-1",
  assetId: "fixture.glb",
  assetKind: "glb",
  initialDimensions: { x: 1, y: 2, z: 1 },
  worldUnit: "meters",
};
const context: PortableEvaluationContext = {
  experimentId: "growth-bridge-test",
  subject: { subjectId: subject.subjectId, assetId: subject.assetId, assetKind: subject.assetKind, source: "local" },
  simulationTimeSeconds: 2,
  configurationVersion: "test-v1",
};
function fakeModel(): GrowthModel {
  return {
    descriptor: {
      id: "fake-growth",
      displayName: "Fake Growth",
      version: "1.0.0",
      capabilities: {
        wholeObjectScale: true,
        regionalGrowth: false,
        meshDeformation: false,
        skeletalDeformation: false,
        proceduralVfx: false,
        sustainedFlow: true,
        deterministicReplay: "deterministic",
        supportedAssetKinds: ["glb"],
      },
    },
    initialize: () => undefined,
    apply: (command: GrowthModelCommand) => ({
      commandId: command.commandId,
      accepted: true,
      telemetry: { simulationTimeSeconds: 2, currentScale: 1.25 },
    }),
    advance: () => undefined,
    readTelemetry: () => ({ simulationTimeSeconds: 2 }),
    reset: () => undefined,
    dispose: () => undefined,
  };
}

test("GrowthModel portable adapter exposes only capabilities in the existing model descriptor", () => {
  const adapter = new GrowthModelPortableAdapter(fakeModel(), subject);
  assert.deepEqual(adapter.descriptor.domains.growth?.operations, ["discrete", "flow"]);
});

test("GrowthModel portable adapter translates and executes an existing discrete command", async () => {
  const router = new PortableEvaluationRouter();
  router.register(new GrowthModelPortableAdapter(fakeModel(), subject));
  const result = await router.route({
    commandId: "growth-1",
    domain: "growth",
    operation: "discrete",
    payload: {
      kind: "discrete",
      commandId: "growth-1",
      stimulus: "Buff",
      amount: { kind: "relative_change", fraction: 0.1 },
    },
  }, context);
  assert.equal(result.status, "executed");
  assert.equal(result.adapterId, "fake-growth");
  assert.equal(result.translationStatus, "translated");
  assert.deepEqual(result.telemetry, { simulationTimeSeconds: 2, currentScale: 1.25 });
});

test("GrowthModel portable adapter does not invent hold capability", async () => {
  const router = new PortableEvaluationRouter();
  router.register(new GrowthModelPortableAdapter(fakeModel(), subject));
  const result = await router.route({
    commandId: "hold-1",
    domain: "growth",
    operation: "hold",
    payload: { kind: "hold", commandId: "hold-1", active: true },
  }, context);
  assert.equal(result.status, "unsupported");
});
