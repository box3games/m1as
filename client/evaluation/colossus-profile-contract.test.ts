import test from "node:test";
import assert from "node:assert/strict";
import {
  colossusProfileToScaleReferenceNode,
  resizeColossusProfile,
  validateColossusProfile,
  type ColossusProfile,
} from "./colossus-profile-contract.js";

function profile(overrides: Partial<ColossusProfile> = {}): ColossusProfile {
  return {
    schemaVersion: "big3r-colossus-profile/1.0",
    profileId: "petri-colossus-profile",
    configurationVersion: "petri-v1",
    revision: 1,
    reference: {
      referenceId: "petri-colossus",
      entityId: "petri-colossus-entity",
      displayName: "Petri Dish Colossus",
      kind: "colossus",
      role: "parent",
      introducedInWorldId: "petri-world",
    },
    dimensions: { widthMeters: 1, heightMeters: 1, depthMeters: 1 },
    worldEnvelope: { widthMeters: 1, heightMeters: 1, depthMeters: 1 },
    generation: {
      mode: "authored",
      seed: 13163,
      npcHeightRatio: 0.2,
      bossHeightRatio: 0.75,
      nextParentScaleFactor: 10,
      worldEnvelopeMultiplier: 1,
      referenceLandmarkRatios: [0.1, 0.25, 0.5, 0.75, 1, 2, 3, 5],
    },
    progression: {
      referenceIdentityPersists: true,
      allowRuntimeResizing: true,
      allowSmallerThanCharacter: true,
      allowParentPromotion: true,
    },
    ...overrides,
  };
}

test("accepts a 1m cube with an independent 1m world envelope", () => {
  assert.doesNotThrow(() => validateColossusProfile(profile()));
});

test("Colossus identity persists when resized smaller or larger than the character", () => {
  const original = profile();
  const micro = resizeColossusProfile(original, {
    configurationVersion: "petri-micro-v2",
    dimensions: { widthMeters: 1e-9, heightMeters: 1e-9, depthMeters: 1e-9 },
    worldEnvelope: { widthMeters: 1e-8, heightMeters: 1e-8, depthMeters: 1e-8 },
  });
  const macro = resizeColossusProfile(micro, {
    configurationVersion: "petri-macro-v3",
    dimensions: { widthMeters: 1e9, heightMeters: 1e9, depthMeters: 1e9 },
  });

  assert.equal(micro.reference.referenceId, original.reference.referenceId);
  assert.equal(micro.reference.kind, "colossus");
  assert.equal(micro.revision, 2);
  assert.equal(macro.reference.referenceId, original.reference.referenceId);
  assert.equal(macro.reference.kind, "colossus");
  assert.equal(macro.revision, 3);
  assert.equal(original.dimensions.heightMeters, 1);
  assert.equal(micro.dimensions.heightMeters, 1e-9);
  assert.equal(macro.dimensions.heightMeters, 1e9);
});

test("converts profile identity and configured height into the hierarchy parent node", () => {
  const node = colossusProfileToScaleReferenceNode(profile());
  assert.equal(node.referenceId, "petri-colossus");
  assert.equal(node.kind, "colossus");
  assert.equal(node.role, "parent");
  assert.equal(node.extent.value, 1);
  assert.equal(node.extent.unit, "m");
});

test("procedural generation requires a height range and retains deterministic seed", () => {
  const generated = profile({
    generation: {
      ...profile().generation,
      mode: "procedural",
      seed: "petri-seed-001",
      heightRangeMeters: { minimum: 1e-6, maximum: 1e6 },
    },
  });
  assert.doesNotThrow(() => validateColossusProfile(generated));
  assert.throws(() => validateColossusProfile(profile({
    generation: { ...profile().generation, mode: "procedural" },
  })), /requires heightRangeMeters/);
});

test("rejects invalid ratios, dimensions, and non-increasing landmarks", () => {
  assert.throws(() => validateColossusProfile(profile({
    dimensions: { widthMeters: 0, heightMeters: 1, depthMeters: 1 },
  })), /greater than zero/);
  assert.throws(() => validateColossusProfile(profile({
    generation: { ...profile().generation, npcHeightRatio: 1.1 },
  })), /npcHeightRatio/);
  assert.throws(() => validateColossusProfile(profile({
    generation: { ...profile().generation, referenceLandmarkRatios: [0.5, 0.25] },
  })), /strictly increasing/);
  assert.throws(() => validateColossusProfile(profile({
    progression: {
      referenceIdentityPersists: false,
      allowRuntimeResizing: true,
      allowSmallerThanCharacter: true,
      allowParentPromotion: true,
    },
  })), /invariants must remain enabled/);
});

test("world envelope is independent and may differ from the Colossus dimensions", () => {
  const configured = profile({
    worldEnvelope: { widthMeters: 500, heightMeters: 500, depthMeters: 500 },
  });
  assert.doesNotThrow(() => validateColossusProfile(configured));
  assert.equal(configured.dimensions.heightMeters, 1);
  assert.equal(configured.worldEnvelope.heightMeters, 500);
});
