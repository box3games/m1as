import test from "node:test";
import assert from "node:assert/strict";
import {
  BODY_ARCHETYPE_REGISTRY_SCHEMA_VERSION,
  CHARACTER_BODY_ARCHETYPE_SCHEMA_VERSION,
  CHARACTER_BODY_ARCHITECTURE_SCHEMA_VERSION,
  CharacterBodyArchetypeRegistry,
  createAnatomicalRegionId,
  instantiateCharacterBodyArchetype,
  parseBodyArchetypeRegistry,
  serializeBodyArchetypeRegistry,
  validateBodyArchetypeRegistry,
  validateCharacterBodyArchetype,
  validateCharacterBodyIdentity,
  validateCharacterBodyStateSnapshot,
  validateCharacterDevelopmentHistory,
  validateCharacterBodyProfile,
  type BodyArchetypeRegistryDocument,
  type BodyMorphologyCompositionProfile,
  type CharacterBodyArchetype,
  type CharacterBodyProfile,
  type SemanticRegionId,
} from "./body-architecture-contract.js";

const tail = createAnatomicalRegionId("studio:tail_fin");
const morphology: BodyMorphologyCompositionProfile = {
  frame: [{ key: "height", value: 2.1, unit: "world_units" }],
  proportions: [{ key: "torso_to_leg_ratio", value: 0.82, unit: "ratio" }],
  silhouette: [{ key: "overall_roundness", value: 1.35, unit: "authored_index" }],
  tissueComposition: [
    {
      tissueType: "skeletal_muscle",
      parameters: [{ key: "development", value: 1.8, unit: "authored_index" }],
      regionalDistribution: [
        { regionId: "chest", parameters: [{ key: "volume_emphasis", value: 1.6, unit: "authored_index" }] },
      ],
    },
    {
      tissueType: "adipose",
      parameters: [{ key: "fullness", value: 0.7, unit: "authored_index" }],
      regionalDistribution: [
        { regionId: "pelvis", parameters: [{ key: "fullness", value: 1.2, unit: "authored_index" }] },
      ],
    },
  ],
  regionalProfiles: [
    { regionId: "chest", parameters: [{ key: "width", value: 1.4, unit: "ratio" }] },
    { regionId: "pelvis", parameters: [{ key: "roundness", value: 1.1, unit: "authored_index" }] },
  ],
};

const bodyProfile: CharacterBodyProfile = {
  schemaVersion: CHARACTER_BODY_ARCHITECTURE_SCHEMA_VERSION,
  id: "body-profile-1",
  version: "1",
  bodyPlan: {
    id: "hybrid-plan",
    version: "1",
    label: "Hybrid reference",
    family: "hybrid",
    regionIds: ["root", "pelvis", "perineum", "chest", tail],
  },
  vocabulary: [
    { regionId: "root", label: "Root", namespace: "core", origin: "standard" },
    { regionId: "pelvis", label: "Pelvis", namespace: "core", origin: "standard" },
    { regionId: "perineum", label: "Perineum", namespace: "core", origin: "standard" },
    { regionId: "chest", label: "Chest", namespace: "core", origin: "standard" },
    { regionId: tail, label: "Tail fin", namespace: "studio", origin: "creator" },
  ],
  relationships: [
    { fromRegionId: "root", toRegionId: "pelvis", kind: "parent_of", provenance: "authored" },
    { fromRegionId: "pelvis", toRegionId: "perineum", kind: "parent_of", provenance: "authored" },
    { fromRegionId: "root", toRegionId: tail, kind: "connected_to", provenance: "authored" },
  ],
  surfaceBindings: [
    { id: "surface-pelvis", regionIds: ["pelvis"], meshId: "body-mesh", state: "declared", provenance: "authored" },
  ],
  rigBindings: [
    { id: "rig-pelvis", regionId: "pelvis", boneIds: ["pelvis_A", "pelvis_B"], state: "declared", provenance: "authored_mapping" },
  ],
  growthCapabilities: [
    { id: "pelvis-growth", regionId: "pelvis", dimensions: ["volume", "shape", "distribution"], state: "declared", provenance: "authored" },
  ],
  deformationCapabilities: [
    { id: "pelvis-deform", regionId: "pelvis", dimensions: ["skeletal", "soft_tissue", "surface_continuity"], state: "declared", provenance: "authored" },
  ],
  morphology,
  presentation: {
    version: "1",
    goals: ["silhouette_dominance", "transformation_recognition"],
    cues: [{
      id: "low-angle",
      cueType: "camera_framing",
      goals: ["silhouette_dominance"],
      targetRegionIds: ["chest"],
      parameters: { angle: "low", intensity: 0.8 },
    }],
  },
  attachments: [{
    id: "suit",
    label: "Growth suit",
    attachmentType: "clothing",
    regionIds: ["pelvis", "chest"],
    attachPointIds: ["pelvis_anchor", "chest_anchor"],
    growthResponse: "authored_deformation",
    clippingPolicy: "require_validation",
  }],
};

const archetype: CharacterBodyArchetype = {
  schemaVersion: CHARACTER_BODY_ARCHETYPE_SCHEMA_VERSION,
  id: "studio:round-powerhouse",
  version: "1.0.0",
  name: "Round Powerhouse",
  description: "A reusable composition starting point.",
  tags: ["rounded", "muscular", "editable"],
  bodyPlanId: "hybrid-plan",
  regionIds: ["root", "pelvis", "chest", tail],
  morphology,
  growthPreferences: [{
    regionId: "pelvis",
    dimensions: ["volume", "shape", "distribution"],
    preferences: [{ key: "regional_emphasis", value: 1.4, unit: "authored_index" }],
  }],
  capabilityRequirements: [{
    capability: "regional_soft_tissue_deformation",
    regionIds: ["pelvis"],
    requirement: "preferred",
  }],
  createdAt: "2026-11-22T00:00:00.000Z",
  creatorId: "character-team",
};

test("custom anatomical IDs require namespace-qualified identifiers", () => {
  assert.equal(createAnatomicalRegionId("studio:tail_fin"), tail);
  assert.throws(() => createAnatomicalRegionId("tail_fin"), /namespace:region/);
  assert.throws(() => createAnatomicalRegionId("Studio:Tail"), /namespace:region/);
});

test("body profile supports custom anatomy, multi-bone bindings, and parent relationships", () => {
  assert.deepEqual(validateCharacterBodyProfile(bodyProfile), []);
  assert.equal(bodyProfile.rigBindings[0].boneIds.length, 2);
  assert.ok(bodyProfile.bodyPlan.regionIds.includes(tail));
});

test("body profile rejects undeclared regions and cyclic anatomical parent relationships", () => {
  const invalid: CharacterBodyProfile = {
    ...bodyProfile,
    relationships: [
      { fromRegionId: "pelvis", toRegionId: "perineum", kind: "parent_of", provenance: "authored" },
      { fromRegionId: "perineum", toRegionId: "pelvis", kind: "parent_of", provenance: "authored" },
    ],
    growthCapabilities: [{
      id: "missing-region-growth", regionId: "studio:missing" as SemanticRegionId,
      dimensions: ["volume"], state: "declared", provenance: "authored",
    }],
  };
  const issues = validateCharacterBodyProfile(invalid);
  assert.ok(issues.some(issue => issue.includes("cycle")));
  assert.ok(issues.some(issue => issue.includes("undeclared region")));
});

test("morphology keeps muscularity and adipose distribution independent", () => {
  assert.deepEqual(validateCharacterBodyProfile(bodyProfile), []);
  const muscle = bodyProfile.morphology.tissueComposition.find(item => item.tissueType === "skeletal_muscle");
  const adipose = bodyProfile.morphology.tissueComposition.find(item => item.tissueType === "adipose");
  assert.notEqual(muscle?.regionalDistribution[0].regionId, adipose?.regionalDistribution[0].regionId);
  assert.equal(bodyProfile.morphology.silhouette[0].value, 1.35);
});

test("archetype validation accepts reusable editable starting profiles", () => {
  assert.deepEqual(validateCharacterBodyArchetype(archetype), []);
  assert.equal(archetype.growthPreferences[0].dimensions.includes("distribution"), true);
  assert.equal(archetype.capabilityRequirements[0].requirement, "preferred");
});

test("archetype registry round-trips JSON and returns defensive copies", () => {
  const registry = new CharacterBodyArchetypeRegistry("character-team");
  registry.register(archetype);
  const fetched = registry.get(archetype.id, archetype.version)!;
  fetched.tags.push("mutated-copy");
  assert.equal(registry.get(archetype.id, archetype.version)?.tags.includes("mutated-copy"), false);

  const json = serializeBodyArchetypeRegistry(registry.toDocument());
  const parsed = parseBodyArchetypeRegistry(json);
  const restored = CharacterBodyArchetypeRegistry.fromDocument(parsed);
  assert.deepEqual(restored.get(archetype.id, archetype.version), archetype);
});

test("registry rejects duplicate revisions and missing or cyclic lineage", () => {
  const duplicate: BodyArchetypeRegistryDocument = {
    schemaVersion: BODY_ARCHETYPE_REGISTRY_SCHEMA_VERSION,
    registryId: "team",
    revision: "1",
    archetypes: [archetype, { ...archetype }],
  };
  assert.ok(validateBodyArchetypeRegistry(duplicate).some(issue => issue.includes("duplicate archetype revision")));

  const missingParent = {
    ...archetype,
    parentArchetype: { archetypeId: "studio:missing", archetypeVersion: "1" },
  };
  const missingDoc = { ...duplicate, archetypes: [missingParent] };
  assert.ok(validateBodyArchetypeRegistry(missingDoc).some(issue => issue.includes("missing parent revision")));

  const a = { ...archetype, id: "studio:a", parentArchetype: { archetypeId: "studio:b", archetypeVersion: "1" } };
  const b = { ...archetype, id: "studio:b", parentArchetype: { archetypeId: "studio:a", archetypeVersion: "1" } };
  const cycleDoc = { ...duplicate, archetypes: [a, b] };
  assert.ok(validateBodyArchetypeRegistry(cycleDoc).some(issue => issue.includes("lineage contains a cycle")));
});

test("character identity keeps archetype lineage separate from growth history", () => {
  assert.deepEqual(validateCharacterBodyIdentity({
    characterId: "character-1",
    createdAt: "2026-11-22T00:00:00.000Z",
    activeBodyProfileId: "body-1",
    activeBodyProfileVersion: "2",
    sourceArchetype: { archetypeId: archetype.id, archetypeVersion: archetype.version },
    growthHistoryRef: "growth-log-1",
  }), []);
});


test("archetype instantiation creates an editable profile draft without a character or growth history", () => {
  const draft = instantiateCharacterBodyArchetype({
    baseProfile: bodyProfile,
    archetype,
    bodyProfileId: "derived-profile",
    bodyProfileVersion: "1",
  });
  assert.equal(draft.bodyProfile.id, "derived-profile");
  assert.equal(draft.bodyProfile.designIntent?.sourceArchetype?.archetypeId, archetype.id);
  assert.deepEqual(draft.sourceArchetype, { archetypeId: archetype.id, archetypeVersion: archetype.version });
  assert.equal(draft.growthPreferences[0].regionId, "pelvis");
  assert.equal(draft.bodyProfile.morphology.silhouette[0].value, 1.35);
  assert.throws(() => instantiateCharacterBodyArchetype({
    baseProfile: { ...bodyProfile, bodyPlan: { ...bodyProfile.bodyPlan, id: "other-plan" } },
    archetype,
    bodyProfileId: "bad",
    bodyProfileVersion: "1",
  }), /incompatible/);
});

test("body-state snapshots require explicit dimensional units and provenance", () => {
  assert.deepEqual(validateCharacterBodyStateSnapshot({
    characterId: "character-1",
    bodyProfileId: "body-1",
    bodyProfileVersion: "1",
    simulationTimeSeconds: 2.5,
    actualDimensions: { x: 1.2, y: 2.1, z: 0.8, unit: "world_units" },
    regionalMorphology: [{ regionId: "pelvis", parameters: [{ key: "fullness", value: 1.2, unit: "authored_index" }] }],
    provenance: "growth-event:42",
    growthEventRefs: ["growth-event:42"],
  }), []);
  assert.ok(validateCharacterBodyStateSnapshot({
    characterId: "character-1",
    bodyProfileId: "body-1",
    bodyProfileVersion: "1",
    simulationTimeSeconds: 2.5,
    actualDimensions: { x: 1, y: 2, z: 3, unit: "" },
    regionalMorphology: [],
    provenance: "",
  }).length > 0);
});

test("development history validates revision parents and preserves separate growth references", () => {
  const history = {
    characterId: "character-1",
    growthHistoryRef: "authoritative-growth-log",
    revisions: [
      { revisionId: "r1", bodyProfileId: "body-1", bodyProfileVersion: "1", createdAt: "2026-11-22", changedDomains: ["morphology"] },
      { revisionId: "r2", bodyProfileId: "body-1", bodyProfileVersion: "2", parentRevisionId: "r1", createdAt: "2026-11-22", changedDomains: ["composition"] },
    ],
  };
  assert.deepEqual(validateCharacterDevelopmentHistory(history), []);
  const cyclic = {
    ...history,
    revisions: [
      { ...history.revisions[0], parentRevisionId: "r2" },
      history.revisions[1],
    ],
  };
  assert.ok(validateCharacterDevelopmentHistory(cyclic).some(issue => issue.includes("cycle")));
});


test("live archetype registry refuses orphaned lineage references", () => {
  const registry = new CharacterBodyArchetypeRegistry("team");
  const orphan = {
    ...archetype,
    id: "studio:orphan",
    parentArchetype: { archetypeId: "studio:not-registered", archetypeVersion: "1" },
  };
  assert.throws(() => registry.register(orphan), /missing parent revision/);
  assert.equal(registry.list().length, 0);
});
