import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCharacterRigTopology,
  inspectCharacterAnimationCapabilities,
  validateCharacterRigTopology,
} from "./character-animation-capability-adapter.js";

test("discovers actual bones and semantic regions without assuming deformability", () => {
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
  assert.equal(report.topology.regions.find(region => region.regionId === "perineum")?.deformable, false);
  assert.ok(report.rig.postureControlledRegions.includes("full_body"));
  assert.deepEqual(report.rig.supportedLayerModes, []);
  assert.equal(report.rig.supportsPerRegionTelemetry, false);
  assert.equal(report.executionStatus, "discovery_only");
  assert.deepEqual(report.clips[0].regions, ["head", "spine"]);
});

test("authored mappings override heuristics and can map multiple bones with hierarchy", () => {
  const result = buildCharacterRigTopology({
    rigId: "custom-rig",
    bones: [
      { boneId: "bone_17", parentBoneId: "bone_1" },
      { boneId: "bone_18", parentBoneId: "bone_17" },
      { boneId: "bone_19", parentBoneId: "bone_17" },
    ],
    authoredMappings: [
      { regionId: "pelvis", boneIds: ["bone_17"], deformable: true },
      { regionId: "perineum", boneIds: ["bone_18", "bone_19"], parentRegionId: "pelvis", deformable: true },
    ],
  });
  assert.equal(result.validation.valid, true);
  const perineum = result.topology.regions.find(region => region.regionId === "perineum");
  assert.deepEqual(perineum?.boneIds, ["bone_18", "bone_19"]);
  assert.equal(perineum?.parentRegionId, "pelvis");
  assert.equal(perineum?.provenance, "authored_mapping");
  assert.equal(perineum?.deformable, true);
});

test("topology validation reports missing bones, missing parents, and hierarchy cycles", () => {
  const validation = validateCharacterRigTopology({
    rigId: "invalid-rig", rigVersion: "1", boneIds: ["a"],
    regions: [
      { regionId: "pelvis", boneIds: ["missing"], deformable: true, provenance: "authored_mapping", parentRegionId: "perineum" },
      { regionId: "perineum", boneIds: ["a"], deformable: true, provenance: "authored_mapping", parentRegionId: "pelvis" },
    ],
  });
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.some(error => error.includes("missing bone")));
  assert.ok(validation.errors.some(error => error.includes("cycle")));
});

test("empty subjects do not receive fabricated capabilities", () => {
  const report = inspectCharacterAnimationCapabilities({
    rigId: "empty-subject", boneNames: [], clips: [],
  });
  assert.deepEqual(report.rig.supportedRegions, []);
  assert.deepEqual(report.rig.availableClipIds, []);
  assert.deepEqual(report.rig.availableScriptIds, []);
  assert.deepEqual(report.rig.supportedLayerModes, []);
  assert.deepEqual(report.boneNames, []);
  assert.equal(report.topologyValidation.valid, true);
});
