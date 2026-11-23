import test from "node:test";
import assert from "node:assert/strict";
import { PortableEvaluationRouter } from "../evaluation/portable-evaluation-router.js";
import { VfxrStructuralResponseAdapter } from "../vfxr/structural-response-adapter.js";
import { measureScaleEnvironmentRelationship } from "../evaluation/scale-environment-relationship-contract.js";
import { evaluateStructuralResponses, type StructuralResponseEvent } from "../evaluation/environment-structural-response-contract.js";

const context = {
  experimentId: "vfxr-structural-test",
  subject: { subjectId: "player", assetId: "sprite-player", assetKind: "sprite_2d", source: "local" as const },
  simulationTimeSeconds: 5,
  configurationVersion: "vfxr-cfg-1",
};

function event(): StructuralResponseEvent {
  const relationship = measureScaleEnvironmentRelationship({
    sampleId: "sample", subjectId: "player", referenceId: "wall",
    simulationTimeSeconds: 5, configurationVersion: "vfxr-cfg-1", growthStateId: "growth-1",
    subjectBounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 2, y: 3, z: 2 } },
    referenceBounds: { min: { x: 1, y: 0, z: -1 }, max: { x: 2, y: 4, z: 3 } },
  });
  const evaluated = evaluateStructuralResponses({
    observationId: "obs-1", relationship, signals: {},
    provenance: { sourceId: "bounds", sourceVersion: "1", sourceKind: "authored-envelope" },
  }, [{
    ruleId: "wall-crack", metric: "penetrationDepthX", operator: "greater-than-or-equal", threshold: 0.05,
    channel: "visual-effect", effectKind: "crack-overlay", responseId: "crack-wall",
    severity: "warning", priority: 1, targetId: "vfxr.wall.cracks",
    asset: { kind: "sprite-sequence", assetId: "wall-crack-growth" },
  }]);
  return evaluated.events[0];
}

test("routes shared structural events to an explicitly registered VFXR sprite target", async () => {
  const router = new PortableEvaluationRouter();
  const adapter = new VfxrStructuralResponseAdapter();
  const calls: StructuralResponseEvent[] = [];
  adapter.register({
    targetId: "vfxr.wall.cracks",
    supportedEffectKinds: ["crack-overlay"],
    supportedAssetKinds: ["sprite-sequence"],
    apply(input) { calls.push(input); return { accepted: true, output: { frames: 12 } }; },
  });
  router.register(adapter);
  const input = event();
  const result = await router.route({
    commandId: "dispatch-crack-1", domain: "structural-response",
    operation: "apply-structural-response", payload: input as unknown as import("../evaluation/portable-evaluation-router.js").PortableJsonValue,
  }, context);
  assert.equal(result.status, "executed");
  assert.equal(calls.length, 1);
  assert.equal((result.telemetry as Record<string, unknown> | undefined)?.pipeline, "VFXR");
  assert.equal((result.telemetry as Record<string, unknown> | undefined)?.assetId, "wall-crack-growth");
});

test("does not fall back when a VFXR target or asset capability is missing", async () => {
  const router = new PortableEvaluationRouter();
  const adapter = new VfxrStructuralResponseAdapter();
  router.register(adapter);
  const result = await router.route({
    commandId: "missing-target", domain: "structural-response",
    operation: "apply-structural-response", payload: event() as unknown as import("../evaluation/portable-evaluation-router.js").PortableJsonValue,
  }, context);
  assert.equal(result.status, "unsupported");
  assert.match(result.reason ?? "", /not registered/);
});

test("does not let VFXR claim physics or structural-integrity ownership", async () => {
  const router = new PortableEvaluationRouter();
  const adapter = new VfxrStructuralResponseAdapter();
  router.register(adapter);
  const input = event();
  const physicsEvent = { ...input, channel: "physics" as const };
  const result = await router.route({
    commandId: "physics-not-vfxr", domain: "structural-response",
    operation: "apply-structural-response", payload: physicsEvent as unknown as import("../evaluation/portable-evaluation-router.js").PortableJsonValue,
  }, context);
  assert.equal(result.status, "unsupported");
});

test("rejects unreferenced effect payloads and supports clearing an event", async () => {
  const adapter = new VfxrStructuralResponseAdapter();
  const cleared: string[] = [];
  adapter.register({
    targetId: "vfxr.wall.cracks", supportedEffectKinds: ["crack-overlay"],
    supportedAssetKinds: ["sprite-sequence"],
    apply() { return { accepted: true }; },
    clear(id) { cleared.push(id); },
  });
  const malformed = { ...event(), asset: undefined };
  const translated = adapter.translate({
    commandId: "no-asset", domain: "structural-response",
    operation: "apply-structural-response", payload: malformed as unknown as import("../evaluation/portable-evaluation-router.js").PortableJsonValue,
  }, context);
  assert.equal(translated.status, "unsupported");
  const clearedResult = await adapter.execute({
    commandId: "clear", domain: "structural-response", operation: "clear-structural-response",
    payload: { targetId: "vfxr.wall.cracks", eventId: "obs-1:wall-crack" },
  }, context);
  assert.equal(clearedResult.accepted, true);
  assert.deepEqual(cleared, ["obs-1:wall-crack"]);
});


test("suppresses duplicate VFXR event delivery by stable event ID", async () => {
  const router = new PortableEvaluationRouter();
  const adapter = new VfxrStructuralResponseAdapter();
  let applied = 0;
  adapter.register({
    targetId: "vfxr.wall.cracks",
    supportedEffectKinds: ["crack-overlay"],
    supportedAssetKinds: ["sprite-sequence"],
    apply() { applied += 1; return { accepted: true }; },
  });
  router.register(adapter);
  const payload = event() as unknown as import("../evaluation/portable-evaluation-router.js").PortableJsonValue;
  const command = {
    commandId: "duplicate-dispatch",
    domain: "structural-response" as const,
    operation: "apply-structural-response",
    payload,
  };
  const first = await router.route(command, context);
  const second = await router.route(command, context);
  assert.equal(first.status, "executed");
  assert.equal(second.status, "executed");
  assert.equal(applied, 1);
  assert.equal((second.telemetry as Record<string, unknown> | undefined)?.duplicateEventSuppressed, true);
});
