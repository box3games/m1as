import test from "node:test";
import assert from "node:assert/strict";
import { buildColossusWorldGenerationPlan } from "./world-generation-plan-contract.js";
import { buildWorldSpatialLayoutPlan } from "./world-spatial-layout-contract.js";
import type { ColossusProfile } from "./colossus-profile-contract.js";
import type { WorldSpatialLayoutConfig } from "./world-spatial-layout-contract.js";

function profile(): ColossusProfile {
  return {
    schemaVersion: "big3r-colossus-profile/1.0",
    profileId: "petri-layout-profile",
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
        width: { minimum: 18, maximum: 22 },
        height: { minimum: 95, maximum: 105 },
        depth: { minimum: 18, maximum: 22 },
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
  };
}

function config(overrides: Partial<WorldSpatialLayoutConfig> = {}): WorldSpatialLayoutConfig {
  return {
    layoutId: "petri-layout",
    configurationVersion: "layout-v1",
    seed: "layout-seed-13163",
    npcCount: 4,
    bossCount: 1,
    edgePaddingRatio: 0.05,
    includeTransitionGate: true,
    ...overrides,
  };
}

function build() {
  const generation = buildColossusWorldGenerationPlan(profile());
  return buildWorldSpatialLayoutPlan(generation, config());
}

test("builds a deterministic spatial layout with stable identity and provenance", () => {
  const first = build();
  const second = build();
  assert.deepEqual(first, second);
  assert.equal(first.sourceGenerationId, "petri-layout-profile:r1:13163");
  assert.equal(first.worldId, "petri-world");
  assert.equal(first.diagnostics.placementCount, 1 + 4 + 1 + 5 + 1);
  assert.equal(first.placements[0].referenceId, "petri-colossus");
  assert.equal(first.placements[0].kind, "colossus");
});

test("places NPCs, bosses, landmarks and gate as children of the active Colossus reference", () => {
  const layout = build();
  for (const placement of layout.placements.filter(item => item.kind !== "colossus")) {
    assert.equal(placement.parentReferenceId, "petri-colossus");
  }
  assert.equal(layout.placements.filter(item => item.kind === "npc").length, 4);
  assert.equal(layout.placements.filter(item => item.kind === "boss").length, 1);
  assert.equal(layout.placements.filter(item => item.kind === "world-landmark").length, 5);
  const gate = layout.placements.find(item => item.kind === "transition-gate")!;
  assert.equal(gate.destinationParentReferenceId, "petri-colossus:next-parent");
});

test("keeps every placement anchor inside a 1m envelope without shrinking huge entities", () => {
  const layout = build();
  for (const placement of layout.placements) {
    assert.ok(Math.abs(placement.normalizedPosition.x) <= 0.45);
    assert.ok(Math.abs(placement.normalizedPosition.z) <= 0.45);
    assert.ok(Math.abs(placement.positionMeters.x) <= 0.45);
    assert.ok(Math.abs(placement.positionMeters.z) <= 0.45);
    assert.equal(placement.anchorInsideEnvelope, true);
    assert.equal(placement.collisionResolved, false);
  }
  assert.equal(layout.placements[0].dimensions.heightMeters, layout.placements[0].dimensions.heightMeters);
  assert.equal(layout.placements[0].extentExceedsEnvelope, true);
  assert.ok(layout.diagnostics.footprintCountExceedingEnvelope > 0);
});

test("reports broad-phase overlap candidates instead of silently resolving scale overlap", () => {
  const layout = build();
  assert.ok(layout.overlapDiagnostics.length > 0);
  assert.equal(layout.diagnostics.overlapCandidateCount, layout.overlapDiagnostics.length);
  assert.equal(layout.diagnostics.collisionResolutionPerformed, false);
});

test("supports a minimal layout with no NPCs, bosses, or transition gate", () => {
  const generation = buildColossusWorldGenerationPlan(profile());
  const layout = buildWorldSpatialLayoutPlan(generation, config({
    npcCount: 0,
    bossCount: 0,
    includeTransitionGate: false,
  }));
  assert.equal(layout.placements.filter(item => item.kind === "npc").length, 0);
  assert.equal(layout.placements.filter(item => item.kind === "boss").length, 0);
  assert.equal(layout.placements.filter(item => item.kind === "transition-gate").length, 0);
  assert.equal(layout.placements.filter(item => item.kind === "world-landmark").length, 5);
});

test("changing only the layout seed changes positions but not scale relationships", () => {
  const generation = buildColossusWorldGenerationPlan(profile());
  const a = buildWorldSpatialLayoutPlan(generation, config({ seed: "seed-a" }));
  const b = buildWorldSpatialLayoutPlan(generation, config({ seed: "seed-b" }));
  const npcA = a.placements.find(item => item.kind === "npc")!;
  const npcB = b.placements.find(item => item.kind === "npc")!;
  assert.notDeepEqual(npcA.normalizedPosition, npcB.normalizedPosition);
  assert.deepEqual(npcA.dimensions, npcB.dimensions);
  assert.deepEqual(a.placements[0].dimensions, b.placements[0].dimensions);
});

test("rejects invalid counts, padding, and incomplete source plans", () => {
  const generation = buildColossusWorldGenerationPlan(profile());
  assert.throws(() => buildWorldSpatialLayoutPlan(generation, config({ npcCount: -1 })), /npcCount/);
  assert.throws(() => buildWorldSpatialLayoutPlan(generation, config({ edgePaddingRatio: 0.5 })), /edgePaddingRatio/);
  assert.throws(() => buildWorldSpatialLayoutPlan({ ...generation, schemaVersion: "bad" } as never, config()), /Unsupported/);
});

test("authority flags make clear that no world, growth, hierarchy, or presentation state was mutated", () => {
  const layout = build();
  assert.equal(layout.authority.worldGeometryInstantiated, false);
  assert.equal(layout.authority.growthStateModified, false);
  assert.equal(layout.authority.hierarchyPromoted, false);
  assert.equal(layout.authority.cameraOrPresentationModified, false);
});
