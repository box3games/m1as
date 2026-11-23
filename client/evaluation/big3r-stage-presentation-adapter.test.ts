import test from "node:test";
import assert from "node:assert/strict";
import { Big3rStagePresentationAdapter } from "./big3r-stage-presentation-adapter.js";
import type { PortableAnchorSnapshot } from "./portable-anchor-contract.js";
import { PortableEvaluationRouter, type PortableEvaluationCommand, type PortableEvaluationContext } from "./portable-evaluation-router.js";

const context: PortableEvaluationContext = {
  experimentId: "big3r-stage-presentation-test",
  subject: { subjectId: "subject-1", assetId: "fixture", assetKind: "glb", source: "local" },
  simulationTimeSeconds: 0,
  configurationVersion: "test-v1",
};

function fixture() {
  let mode: 1 | 2 | 3 | 4 | 5 = 1;
  let doubleSided = false;
  const stage = {
    getPortableAnchorSnapshot: (subjectId: string, configurationVersion: string): PortableAnchorSnapshot => ({
      schemaVersion: "big3r-portable-anchors/1.0",
      capturedAtSimulationTimeSeconds: 3,
      configurationVersion,
      anchors: [{
        anchorId: "subject-origin",
        ownerId: subjectId,
        group: "character",
        semantic: "subject-root-origin",
        coordinateSpace: "stage-world",
        position: { x: 0, y: 0, z: 0 },
        access: "read-only",
        source: "test-fixture",
        sourceVersion: "1",
      }],
    }),
    getCameraRigMode: () => mode,
    setCameraRigMode: (next: 1 | 2 | 3 | 4 | 5) => { mode = next; },
    getRoomDoubleSided: () => doubleSided,
    setRoomDoubleSided: (next: boolean) => { doubleSided = next; },
    getActualScaleEvaluationSnapshot: () => ({ growthModel: "m1as-vfx", currentVisualScale: 1.35 }),
    getStageScaleEvaluationSnapshot: () => ({
      status: "available" as const,
      activeTierId: "tier-2",
      activeTierName: "Lab Sink",
      metricHeight: 1.6,
      normalizedPlayerScale: 1.35,
      activeTierWorldScale: 0.8,
      prewarmedTierWorldScale: 1.6,
      progress01: 0.4,
      rebaseCount: 2,
      effectiveMetricHeight: 2.16,
    }),
  };
  return { stage, read: () => ({ mode, doubleSided }) };
}

function command(domain: PortableEvaluationCommand["domain"], operation: string, payload: PortableEvaluationCommand["payload"] = null): PortableEvaluationCommand {
  return { commandId: `test:${domain}:${operation}`, domain, operation, payload };
}

test("BIG3R presentation adapter delegates camera mode changes to the stage coordinator", async () => {
  const f = fixture();
  const router = new PortableEvaluationRouter();
  router.register(new Big3rStagePresentationAdapter(f.stage));
  const result = await router.route(command("camera", "set-mode", { mode: 4 }), context);
  assert.equal(result.status, "executed");
  assert.equal(f.read().mode, 4);
  assert.deepEqual(result.output, { mode: 4 });
});

test("BIG3R presentation adapter rejects unknown camera modes without mutation", async () => {
  const f = fixture();
  const adapter = new Big3rStagePresentationAdapter(f.stage);
  const translation = adapter.translate(command("camera", "set-mode", { mode: 6 }), context);
  assert.equal(translation.status, "unsupported");
  assert.equal(f.read().mode, 1);
});

test("BIG3R presentation adapter delegates stage double-sided control", async () => {
  const f = fixture();
  const router = new PortableEvaluationRouter();
  router.register(new Big3rStagePresentationAdapter(f.stage));
  const result = await router.route(command("stage", "set-room-double-sided", { enabled: true }), context);
  assert.equal(result.status, "executed");
  assert.equal(f.read().doubleSided, true);
});

test("BIG3R presentation adapter advertises live read-only anchors but not unsupported presentation controls", () => {
  const adapter = new Big3rStagePresentationAdapter(fixture().stage);
  assert.equal(adapter.descriptor.domains.anchors?.operations.includes("get-current"), true);
  assert.equal("stage-scaling" in adapter.descriptor.domains, true);
  assert.equal("shadow" in adapter.descriptor.domains, false);
  assert.equal("horizon" in adapter.descriptor.domains, false);
});

test("actual scale snapshot stays owned by the active growth model", async () => {
  const f = fixture();
  const router = new PortableEvaluationRouter();
  router.register(new Big3rStagePresentationAdapter(f.stage));
  const result = await router.route(command("actual-scaling", "get-current", null), context);
  assert.equal(result.status, "executed");
  assert.deepEqual(result.output, { growthModel: "m1as-vfx", currentVisualScale: 1.35 });
});

test("stage-relative scale snapshot reports native rebase and metric-height state separately", async () => {
  const f = fixture();
  const router = new PortableEvaluationRouter();
  router.register(new Big3rStagePresentationAdapter(f.stage));
  const result = await router.route(command("stage-scaling", "get-current", null), context);
  assert.equal(result.status, "executed");
  assert.deepEqual(result.output, {
    status: "available",
    activeTierId: "tier-2",
    activeTierName: "Lab Sink",
    metricHeight: 1.6,
    normalizedPlayerScale: 1.35,
    activeTierWorldScale: 0.8,
    prewarmedTierWorldScale: 1.6,
    progress01: 0.4,
    rebaseCount: 2,
    effectiveMetricHeight: 2.16,
  });
});

test("live anchor snapshot routes through the BIG3R adapter with experiment subject identity", async () => {
  const f = fixture();
  const router = new PortableEvaluationRouter();
  router.register(new Big3rStagePresentationAdapter(f.stage));
  const result = await router.route(command("anchors", "get-current", null), context);
  assert.equal(result.status, "executed");
  assert.deepEqual(result.output, {
    schemaVersion: "big3r-portable-anchors/1.0",
    capturedAtSimulationTimeSeconds: 3,
    configurationVersion: "test-v1",
    anchors: [{
      anchorId: "subject-origin",
      ownerId: "subject-1",
      group: "character",
      semantic: "subject-root-origin",
      coordinateSpace: "stage-world",
      position: { x: 0, y: 0, z: 0 },
      access: "read-only",
      source: "test-fixture",
      sourceVersion: "1",
    }, {
      anchorId: "rig-bone:Head",
      ownerId: "subject-1",
      group: "character",
      semantic: "rig-bone:Head",
      coordinateSpace: "stage-world",
      position: { x: 0, y: 1.8, z: 0 },
      parentAnchorId: "rig-bone:Spine",
      access: "read-only",
      source: "big3r-glb-skeleton",
      sourceVersion: "1.0.0",
    }, {
      anchorId: "reference:building-1:bounds-top",
      ownerId: "scene-reference:building-1",
      group: "environment",
      semantic: "reference-prop-top:Building",
      coordinateSpace: "stage-world",
      position: { x: 2, y: 30, z: 0 },
      parentAnchorId: "reference:building-1:bounds-bottom",
      access: "read-only",
      source: "big3r-reference-prop",
      sourceVersion: "1.0.0",
    }, {
      anchorId: "reference:building-1:bounds-bottom",
      ownerId: "scene-reference:building-1",
      group: "environment",
      semantic: "reference-prop-bottom:Building",
      coordinateSpace: "stage-world",
      position: { x: 2, y: 0, z: 0 },
      access: "read-only",
      source: "big3r-reference-prop",
      sourceVersion: "1.0.0",
    }],
  });
});
