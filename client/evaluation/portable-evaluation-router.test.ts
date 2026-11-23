import test from "node:test";
import assert from "node:assert/strict";
import {
  PortableEvaluationRouter,
  type PortableEngineAdapter,
  type PortableEvaluationCommand,
  type PortableEvaluationContext,
} from "./portable-evaluation-router.js";

const context: PortableEvaluationContext = {
  experimentId: "portable-router-test",
  subject: { subjectId: "subject-1", assetId: "fixture", assetKind: "sprite", source: "local" },
  simulationTimeSeconds: 1,
  configurationVersion: "test-v1",
};

function adapter(id: string, operation = "set"): PortableEngineAdapter {
  return {
    descriptor: {
      id,
      displayName: id,
      version: "1.0.0",
      domains: { camera: { status: "native", operations: [operation] } },
    },
    translate: (command) => ({ status: "native", notes: [], translatedCommand: command }),
    execute: (command) => ({ accepted: true, output: { operation: command.operation } }),
  };
}

const command: PortableEvaluationCommand = {
  commandId: "camera-1",
  domain: "camera",
  operation: "set",
  payload: { framing: "profile" },
};

test("portable router executes a uniquely advertised native command", async () => {
  const router = new PortableEvaluationRouter();
  router.register(adapter("camera-rig"));
  const result = await router.route(command, context);
  assert.equal(result.status, "executed");
  assert.equal(result.adapterId, "camera-rig");
  assert.equal(result.translationStatus, "native");
  assert.deepEqual(result.output, { operation: "set" });
});

test("portable router refuses ambiguous adapter ownership", async () => {
  const router = new PortableEvaluationRouter();
  router.register(adapter("camera-a"));
  router.register(adapter("camera-b"));
  const result = await router.route(command, context);
  assert.equal(result.status, "ambiguous");
  assert.match(result.reason ?? "", /targetAdapterId/);
});

test("portable router reports unsupported operations without fallback", async () => {
  const router = new PortableEvaluationRouter();
  router.register(adapter("camera-rig", "orbit"));
  const result = await router.route(command, context);
  assert.equal(result.status, "unsupported");
  assert.equal(result.adapterId, undefined);
});

test("portable router requires notes for approximated translations", async () => {
  const router = new PortableEvaluationRouter();
  const native = adapter("camera-rig");
  router.register({
    ...native,
    translate: (source) => ({ status: "approximated", notes: [], translatedCommand: source }),
  });
  const result = await router.route(command, context);
  assert.equal(result.status, "translation-failed");
  assert.match(result.reason ?? "", /semantic differences/);
});

test("portable router preserves source command identity through translation", async () => {
  const router = new PortableEvaluationRouter();
  const native = adapter("camera-rig");
  router.register({
    ...native,
    translate: (source) => ({
      status: "translated",
      notes: ["Mapped framing preset to native camera target."],
      translatedCommand: { ...source, commandId: "changed-id" },
    }),
  });
  const result = await router.route(command, context);
  assert.equal(result.status, "translation-failed");
  assert.match(result.reason ?? "", /preserve commandId and domain/);
});
