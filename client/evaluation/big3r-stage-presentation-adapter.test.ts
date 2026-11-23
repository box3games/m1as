import test from "node:test";
import assert from "node:assert/strict";
import { Big3rStagePresentationAdapter } from "./big3r-stage-presentation-adapter.js";
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
    getCameraRigMode: () => mode,
    setCameraRigMode: (next: 1 | 2 | 3 | 4 | 5) => { mode = next; },
    getRoomDoubleSided: () => doubleSided,
    setRoomDoubleSided: (next: boolean) => { doubleSided = next; },
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

test("BIG3R presentation adapter does not advertise anchor or unsupported presentation controls", () => {
  const adapter = new Big3rStagePresentationAdapter(fixture().stage);
  assert.equal("anchors" in adapter.descriptor.domains, false);
  assert.equal("stage-scaling" in adapter.descriptor.domains, false);
  assert.equal("shadow" in adapter.descriptor.domains, false);
  assert.equal("horizon" in adapter.descriptor.domains, false);
});
