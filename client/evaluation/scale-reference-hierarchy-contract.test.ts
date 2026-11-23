import test from "node:test";
import assert from "node:assert/strict";
import {
  promoteScaleParent,
  validateScaleReferenceHierarchy,
  type ScaleReferenceHierarchySnapshot,
} from "./scale-reference-hierarchy-contract.js";

function hierarchy(): ScaleReferenceHierarchySnapshot {
  return {
    schemaVersion: "big3r-scale-reference-hierarchy/1.0",
    hierarchyId: "campaign-scale-lineage",
    revision: 1,
    currentWorldId: "lab-world",
    activeParentReferenceId: "colossus-100m",
    references: [
      {
        referenceId: "colossus-100m",
        entityId: "colossus-entity-1",
        displayName: "First Colossus",
        kind: "colossus",
        role: "parent",
        status: "active",
        extent: { value: 100, unit: "m", metric: "height", axis: "height" },
        introducedInWorldId: "lab-world",
      },
      {
        referenceId: "npc-75m",
        entityId: "npc-boss-1",
        displayName: "Colossus-scale boss",
        kind: "boss",
        role: "boss",
        status: "active",
        parentReferenceId: "colossus-100m",
        extent: { value: 75, unit: "m", metric: "height", axis: "height" },
        introducedInWorldId: "lab-world",
      },
      {
        referenceId: "city-tower",
        entityId: "tower-1",
        displayName: "City Tower",
        kind: "building",
        role: "environment",
        status: "active",
        parentReferenceId: "colossus-100m",
        extent: { value: 40, unit: "m", metric: "height", axis: "height" },
        introducedInWorldId: "lab-world",
      },
    ],
    promotions: [],
  };
}

function nextParent() {
  return {
    referenceId: "cloud-colossus",
    entityId: "cloud-colossus-entity",
    displayName: "Cloud Colossus",
    kind: "colossus" as const,
    role: "parent" as const,
    status: "active" as const,
    extent: { value: 1000, unit: "m", metric: "height", axis: "height" as const },
    introducedInWorldId: "cloud-world",
  };
}

test("validates a parent with nested boss and environment references", () => {
  assert.doesNotThrow(() => validateScaleReferenceHierarchy(hierarchy()));
});

test("promotes a larger parent and retains the previous Colossus as a child", () => {
  const original = hierarchy();
  const promoted = promoteScaleParent(original, {
    transitionId: "lab-to-cloud-world",
    fromWorldId: "lab-world",
    toWorldId: "cloud-world",
    newParent: nextParent(),
    previousParentDisposition: "child",
    simulationTimeSeconds: 120,
    configurationVersion: "world-progression-v1",
  });

  assert.equal(promoted.revision, 2);
  assert.equal(promoted.currentWorldId, "cloud-world");
  assert.equal(promoted.activeParentReferenceId, "cloud-colossus");
  assert.equal(promoted.references.length, original.references.length + 1);
  const oldParent = promoted.references.find(item => item.referenceId === "colossus-100m")!;
  assert.equal(oldParent.role, "child");
  assert.equal(oldParent.status, "historical");
  assert.equal(oldParent.parentReferenceId, "cloud-colossus");
  assert.equal(promoted.promotions[0].previousParentReferenceId, "colossus-100m");
  assert.equal(promoted.promotions[0].promotedParentReferenceId, "cloud-colossus");
  assert.equal(original.activeParentReferenceId, "colossus-100m");
  assert.equal(original.references[0].status, "active");
});

test("can retain the previous parent as a historical reference without nesting it", () => {
  const promoted = promoteScaleParent(hierarchy(), {
    transitionId: "lab-to-cloud-world-historical",
    fromWorldId: "lab-world",
    toWorldId: "cloud-world",
    newParent: nextParent(),
    previousParentDisposition: "historical",
    simulationTimeSeconds: 120,
    configurationVersion: "world-progression-v1",
  });
  const oldParent = promoted.references.find(item => item.referenceId === "colossus-100m")!;
  assert.equal(oldParent.role, "historical");
  assert.equal(oldParent.status, "historical");
  assert.equal(oldParent.parentReferenceId, undefined);
});

test("promotion rejects a non-larger parent, mismatched units, and duplicate IDs", () => {
  const base = hierarchy();
  assert.throws(() => promoteScaleParent(base, {
    transitionId: "too-small",
    fromWorldId: "lab-world",
    toWorldId: "cloud-world",
    newParent: { ...nextParent(), extent: { ...nextParent().extent, value: 90 } },
    previousParentDisposition: "child",
    simulationTimeSeconds: 120,
    configurationVersion: "v1",
  }), /must be larger/);
  assert.throws(() => promoteScaleParent(base, {
    transitionId: "wrong-unit",
    fromWorldId: "lab-world",
    toWorldId: "cloud-world",
    newParent: { ...nextParent(), extent: { ...nextParent().extent, unit: "km" } },
    previousParentDisposition: "child",
    simulationTimeSeconds: 120,
    configurationVersion: "v1",
  }), /matching extent units/);
  assert.throws(() => promoteScaleParent(base, {
    transitionId: "duplicate-ref",
    fromWorldId: "lab-world",
    toWorldId: "cloud-world",
    newParent: { ...nextParent(), referenceId: "colossus-100m" },
    previousParentDisposition: "child",
    simulationTimeSeconds: 120,
    configurationVersion: "v1",
  }), /already exists/);
});

test("hierarchy validation rejects missing parents and cycles", () => {
  const missing = hierarchy();
  missing.references[1].parentReferenceId = "missing-parent";
  assert.throws(() => validateScaleReferenceHierarchy(missing), /missing parent/);

  const cyclic = hierarchy();
  cyclic.references[1].parentReferenceId = "city-tower";
  cyclic.references[2].parentReferenceId = "npc-75m";
  assert.throws(() => validateScaleReferenceHierarchy(cyclic), /contains a cycle/);
});

test("promotion requires the current world and a distinct destination world", () => {
  const base = hierarchy();
  assert.throws(() => promoteScaleParent(base, {
    transitionId: "wrong-origin",
    fromWorldId: "other-world",
    toWorldId: "cloud-world",
    newParent: nextParent(),
    previousParentDisposition: "child",
    simulationTimeSeconds: 120,
    configurationVersion: "v1",
  }), /must match the hierarchy's current world/);
  assert.throws(() => promoteScaleParent(base, {
    transitionId: "same-world",
    fromWorldId: "lab-world",
    toWorldId: "lab-world",
    newParent: { ...nextParent(), introducedInWorldId: "lab-world" },
    previousParentDisposition: "child",
    simulationTimeSeconds: 120,
    configurationVersion: "v1",
  }), /different world/);
});
