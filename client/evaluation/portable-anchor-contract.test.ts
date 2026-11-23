import test from "node:test";
import assert from "node:assert/strict";
import {
  measureScaleRelationship,
  validatePortableAnchorSnapshot,
  type PortableAnchorSnapshot,
  type ScaleRelationshipInput,
} from "./portable-anchor-contract.js";

function snapshot(ownerId: string, time: number, height: number): PortableAnchorSnapshot {
  return {
    schemaVersion: "big3r-portable-anchors/1.0",
    capturedAtSimulationTimeSeconds: time,
    configurationVersion: "fixture-v1",
    anchors: [
      {
        anchorId: "ground",
        ownerId,
        group: "character",
        semantic: "ground-contact",
        coordinateSpace: "stage-world",
        position: { x: 0, y: 0, z: 0 },
        access: "read-only",
        source: "fixture",
        sourceVersion: "1",
      },
      {
        anchorId: "top",
        ownerId,
        group: "character",
        semantic: "top-of-subject",
        coordinateSpace: "stage-world",
        position: { x: 0, y: height, z: 0 },
        parentAnchorId: "ground",
        access: "read-only",
        source: "fixture",
        sourceVersion: "1",
      },
    ],
  };
}

function relationship(subjectHeight: number, referenceHeight = 1): ScaleRelationshipInput {
  return {
    relationshipId: "subject-vs-reference",
    baselineSubject: snapshot("growing-subject", 0, 1),
    currentSubject: snapshot("growing-subject", 10, subjectHeight),
    baselineReference: snapshot("reference-entity", 0, referenceHeight),
    currentReference: snapshot("reference-entity", 10, referenceHeight),
    subjectSpan: {
      ownerId: "growing-subject",
      lowerAnchorId: "ground",
      upperAnchorId: "top",
      coordinateSpace: "stage-world",
    },
    referenceSpan: {
      ownerId: "reference-entity",
      lowerAnchorId: "ground",
      upperAnchorId: "top",
      coordinateSpace: "stage-world",
    },
  };
}

test("anchor snapshots validate stable identity, provenance and parent references", () => {
  assert.doesNotThrow(() => validatePortableAnchorSnapshot(snapshot("subject", 0, 1)));
  const invalid = snapshot("subject", 0, 1);
  invalid.anchors[1].parentAnchorId = "missing";
  assert.throws(() => validatePortableAnchorSnapshot(invalid), /missing parent anchor/);
});

test("relationship measurement preserves baseline growth and detects smaller/equal/larger", () => {
  const below = measureScaleRelationship(relationship(0.98));
  assert.equal(below.relationship, "approximately-equal");
  assert.equal(below.subjectGrowthFactorFromBaseline, 0.98);

  const clearlyBelow = measureScaleRelationship(relationship(0.8));
  assert.equal(clearlyBelow.relationship, "smaller");

  const equal = measureScaleRelationship(relationship(1));
  assert.equal(equal.relationship, "approximately-equal");

  const above = measureScaleRelationship(relationship(1.2));
  assert.equal(above.relationship, "larger");
  assert.equal(above.currentSubjectToReferenceRatio, 1.2);
});

test("relationship comparison works with non-human reference entities and preserves the starting point", () => {
  const result = measureScaleRelationship(relationship(120, 100));
  assert.equal(result.subjectGrowthFactorFromBaseline, 120);
  assert.equal(result.currentSubjectToReferenceRatio, 1.2);
  assert.equal(result.relationship, "larger");
  assert.equal(result.referenceId, "reference-entity");
});

test("relationship comparison rejects mismatched coordinate spaces and invalid tolerance", () => {
  const mismatched = relationship(2);
  mismatched.referenceSpan.coordinateSpace = "subject-local";
  assert.throws(() => measureScaleRelationship(mismatched), /same coordinate space/);

  assert.throws(() => measureScaleRelationship({
    ...relationship(2),
    equalityTolerance: 1,
  }), /equalityTolerance/);
});

test("relationship comparison rejects a current capture before baseline", () => {
  const input = relationship(2);
  input.currentSubject.capturedAtSimulationTimeSeconds = -1;
  assert.throws(() => measureScaleRelationship(input), /invalid capture metadata/);
});

test("portable anchors validate sprite-local, plane-local, and viewport-normalized spaces", () => {
  for (const coordinateSpace of ["sprite-local", "plane-local", "viewport-normalized"] as const) {
    const value = snapshot("2d-subject", 0, 1);
    value.anchors = value.anchors.map(anchor => ({ ...anchor, coordinateSpace }));
    assert.doesNotThrow(() => validatePortableAnchorSnapshot(value));
  }
});
