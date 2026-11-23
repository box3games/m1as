import test from "node:test";
import assert from "node:assert/strict";
import { buildColossusWorldGenerationPlan } from "./world-generation-plan-contract.js";
import { generateColossusDimensions } from "./colossus-profile-contract.js";
import type { ColossusProfile } from "./colossus-profile-contract.js";

function profile(overrides: Partial<ColossusProfile> = {}): ColossusProfile {
  return {
    schemaVersion: "big3r-colossus-profile/1.0",
    profileId: "petri-world-profile",
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
    dimensions: { widthMeters: 20, heightMeters: 100, depthMeters: 20 },
    worldEnvelope: { widthMeters: 1, heightMeters: 1, depthMeters: 1 },
    generation: {
      mode: "procedural",
      seed: 13163,
      algorithm: "mulberry32-v1",
      dimensionRangesMeters: {
        width: { minimum: 10, maximum: 30 },
        height: { minimum: 80, maximum: 120 },
        depth: { minimum: 10, maximum: 30 },
      },
      npcHeightRatio: 0.2,
      bossHeightRatio: 0.75,
      nextParentScaleFactor: 10,
      worldEnvelopeMultiplier: 0.01,
      referenceLandmarkRatios: [0.1, 0.5, 1, 2, 5],
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

test("builds a 100m Colossus blueprint inside an independent 1m envelope", () => {
  const plan = buildColossusWorldGenerationPlan(profile());
  assert.equal(plan.colossus.dimensions.heightMeters, 100);
  assert.equal(plan.worldEnvelope.dimensions.heightMeters, 1);
  assert.equal(plan.worldEnvelope.actualHeightRatio, 0.01);
  assert.equal(plan.worldEnvelope.configuredMultiplierMatchesEnvelope, true);
  assert.equal(plan.worldId, "petri-world");
});

test("creates NPC and boss scale templates from configured Colossus-relative ratios", () => {
  const plan = buildColossusWorldGenerationPlan(profile());
  const npc = plan.scaleTemplates.find(item => item.kind === "npc")!;
  const boss = plan.scaleTemplates.find(item => item.kind === "boss")!;
  assert.equal(npc.dimensions.heightMeters, 20);
  assert.equal(boss.dimensions.heightMeters, 75);
  assert.equal(npc.sourceColossusReferenceId, "petri-colossus");
});

test("landmark ratios can continue beyond the Colossus without becoming caps", () => {
  const plan = buildColossusWorldGenerationPlan(profile());
  const landmarks = plan.scaleTemplates.filter(item => item.kind === "world-landmark");
  assert.deepEqual(landmarks.map(item => item.relativeHeightRatio), [0.1, 0.5, 1, 2, 5]);
  assert.equal(landmarks[landmarks.length - 1]!.dimensions.heightMeters, 500);
});

test("produces a larger next-parent candidate without promoting hierarchy", () => {
  const plan = buildColossusWorldGenerationPlan(profile());
  assert.equal(plan.nextParentCandidate.scaleFactor, 10);
  assert.equal(plan.nextParentCandidate.dimensions.heightMeters, 1000);
  assert.equal(plan.nextParentCandidate.sourceReferenceId, "petri-colossus");
  assert.equal(plan.nextParentCandidate.introducedInWorldId, "petri-world:next");
  assert.equal(plan.authority.hierarchyPromoted, false);
});

test("preserves explicit world envelope when its ratio differs from the configured multiplier", () => {
  const configured = profile({
    worldEnvelope: { widthMeters: 4, heightMeters: 2, depthMeters: 3 },
  });
  const plan = buildColossusWorldGenerationPlan(configured);
  assert.deepEqual(plan.worldEnvelope.dimensions, configured.worldEnvelope);
  assert.equal(plan.worldEnvelope.actualHeightRatio, 0.02);
  assert.equal(plan.worldEnvelope.configuredHeightMultiplier, 0.01);
  assert.equal(plan.worldEnvelope.configuredMultiplierMatchesEnvelope, false);
});

test("generation plan is stable for the same profile revision and does not claim runtime mutations", () => {
  const configured = profile();
  assert.deepEqual(
    buildColossusWorldGenerationPlan(configured),
    buildColossusWorldGenerationPlan(configured),
  );
  const plan = buildColossusWorldGenerationPlan(configured);
  assert.equal(plan.authority.worldGeometryInstantiated, false);
  assert.equal(plan.authority.spatialPlacementGenerated, false);
  assert.equal(plan.authority.growthStateModified, false);
  assert.equal(plan.authority.cameraOrPresentationModified, false);
});


test("procedural world plan uses seeded generated dimensions rather than the authored placeholder", () => {
  const configured = profile();
  const plan = buildColossusWorldGenerationPlan(configured);
  const generated = generateColossusDimensions(configured);
  assert.deepEqual(plan.colossus.dimensions, generated);
  assert.notDeepEqual(plan.colossus.dimensions, configured.dimensions);
  assert.deepEqual(plan.nextParentCandidate.dimensions, {
    widthMeters: generated.widthMeters * configured.generation.nextParentScaleFactor,
    heightMeters: generated.heightMeters * configured.generation.nextParentScaleFactor,
    depthMeters: generated.depthMeters * configured.generation.nextParentScaleFactor,
  });
});

test("hybrid mode without procedural ranges preserves authored dimensions", () => {
  const configured = profile({
    generation: {
      ...profile().generation,
      mode: "hybrid",
      dimensionRangesMeters: undefined,
    },
  });
  const plan = buildColossusWorldGenerationPlan(configured);
  assert.deepEqual(plan.colossus.dimensions, configured.dimensions);
});
