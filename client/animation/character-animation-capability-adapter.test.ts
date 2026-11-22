import test from "node:test";
import assert from "node:assert/strict";
import { inspectCharacterAnimationCapabilities } from "./character-animation-capability-adapter.js";

test("discovers actual rig bones, clip targets, and conservative region capabilities", () => {
  const report = inspectCharacterAnimationCapabilities({
    rigId: "glb-subject-1",
    boneNames: ["mixamorigSpine", "mixamorigChest", "mixamorigLeftArm", "mixamorigHead", "mixamorigPerineum", "mixamorigLeftThigh"],
    clips: [
      { name: "Idle", durationSeconds: 2, trackNames: ["mixamorigSpine.quaternion", "mixamorigHead.position"] },
      { name: "Walk", durationSeconds: 1.2, trackNames: ["mixamorigLeftArm.quaternion", "mixamorigHips.position"] },
    ],
  });
  assert.deepEqual(report.rig.availableClipIds, ["Idle", "Walk"]);
  assert.ok(report.rig.supportedRegions.includes("spine"));
  assert.ok(report.rig.supportedRegions.includes("arms"));
  assert.ok(report.rig.supportedRegions.includes("perineum"));
  assert.ok(report.rig.supportedRegions.includes("thighs"));
  assert.deepEqual(report.bonesByRegion.perineum, ["mixamorigPerineum"]);
  assert.deepEqual(report.bonesByRegion.thighs, ["mixamorigLeftThigh"]);
  assert.ok(report.rig.postureControlledRegions.includes("full_body"));
  assert.deepEqual(report.rig.supportedLayerModes, []);
  assert.equal(report.rig.supportsPerRegionTelemetry, false);
  assert.equal(report.executionStatus, "discovery_only");
  assert.deepEqual(report.clips[0].regions, ["head", "spine"]);
});

test("empty or non-skeletal subjects do not receive fabricated capabilities", () => {
  const report = inspectCharacterAnimationCapabilities({
    rigId: "empty-subject",
    boneNames: [],
    clips: [],
  });
  assert.deepEqual(report.rig.supportedRegions, []);
  assert.deepEqual(report.rig.availableClipIds, []);
  assert.deepEqual(report.rig.availableScriptIds, []);
  assert.deepEqual(report.rig.supportedLayerModes, []);
  assert.deepEqual(report.boneNames, []);
});
