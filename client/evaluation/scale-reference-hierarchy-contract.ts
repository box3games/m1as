/**
 * Persistent parent/child scale-reference hierarchy.
 *
 * A world transition may promote a larger parent reference, but never deletes
 * or rewrites the player's growth history. The previous parent is retained as
 * either a nested child or a historical reference.
 */

export type ScaleReferenceKind =
  | "character"
  | "colossus"
  | "npc"
  | "boss"
  | "creature"
  | "building"
  | "environment"
  | "world-landmark";

export type ScaleReferenceRole =
  | "parent"
  | "child"
  | "historical"
  | "npc"
  | "boss"
  | "environment"
  | "transition";

export type ScaleReferenceStatus = "active" | "historical";
export type PreviousParentDisposition = "child" | "historical";
export type ScaleReferenceAxis = "x" | "y" | "z" | "height" | "width" | "depth" | "diameter";

export interface ScaleReferenceExtent {
  value: number;
  unit: string;
  metric: string;
  axis: ScaleReferenceAxis;
}

export interface ScaleReferenceNode {
  referenceId: string;
  entityId: string;
  displayName: string;
  kind: ScaleReferenceKind;
  role: ScaleReferenceRole;
  status: ScaleReferenceStatus;
  /** Immediate containing scale reference; stable across world transitions. */
  parentReferenceId?: string;
  extent: ScaleReferenceExtent;
  introducedInWorldId: string;
  /** Optional link to the source reference from which this representation was derived. */
  sourceReferenceId?: string;
}

export interface ScaleReferencePromotionRecord {
  transitionId: string;
  fromWorldId: string;
  toWorldId: string;
  previousParentReferenceId: string;
  promotedParentReferenceId: string;
  previousParentDisposition: PreviousParentDisposition;
  comparisonMetric: string;
  previousParentExtent: number;
  promotedParentExtent: number;
  unit: string;
  simulationTimeSeconds: number;
  configurationVersion: string;
}

export interface ScaleReferenceHierarchySnapshot {
  schemaVersion: "big3r-scale-reference-hierarchy/1.0";
  hierarchyId: string;
  revision: number;
  currentWorldId: string;
  activeParentReferenceId: string;
  references: ScaleReferenceNode[];
  promotions: ScaleReferencePromotionRecord[];
}

export interface PromoteScaleParentInput {
  transitionId: string;
  fromWorldId: string;
  toWorldId: string;
  newParent: ScaleReferenceNode;
  previousParentDisposition: PreviousParentDisposition;
  simulationTimeSeconds: number;
  configurationVersion: string;
}

function assertNonEmpty(value: string, label: string): void {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(`${label} must be a non-empty string.`);
  }
}

function validateExtent(extent: ScaleReferenceExtent, label: string): void {
  if (!extent || typeof extent !== "object") throw new TypeError(`${label} is required.`);
  if (!Number.isFinite(extent.value) || extent.value <= 0) {
    throw new RangeError(`${label}.value must be finite and greater than zero.`);
  }
  assertNonEmpty(extent.unit, `${label}.unit`);
  assertNonEmpty(extent.metric, `${label}.metric`);
  if (!["x", "y", "z", "height", "width", "depth", "diameter"].includes(extent.axis)) {
    throw new TypeError(`${label}.axis is unsupported.`);
  }
}

function validateReferenceNode(node: ScaleReferenceNode): void {
  assertNonEmpty(node.referenceId, "reference.referenceId");
  assertNonEmpty(node.entityId, "reference.entityId");
  assertNonEmpty(node.displayName, "reference.displayName");
  assertNonEmpty(node.introducedInWorldId, "reference.introducedInWorldId");
  if (!["character", "colossus", "npc", "boss", "creature", "building", "environment", "world-landmark"].includes(node.kind)) {
    throw new TypeError(`Reference "${node.referenceId}" has an unsupported kind.`);
  }
  if (!["parent", "child", "historical", "npc", "boss", "environment", "transition"].includes(node.role)) {
    throw new TypeError(`Reference "${node.referenceId}" has an unsupported role.`);
  }
  if (node.status !== "active" && node.status !== "historical") {
    throw new TypeError(`Reference "${node.referenceId}" has an unsupported status.`);
  }
  if (node.parentReferenceId !== undefined) {
    assertNonEmpty(node.parentReferenceId, "reference.parentReferenceId");
    if (node.parentReferenceId === node.referenceId) {
      throw new RangeError("A scale reference cannot parent itself.");
    }
  }
  if (node.sourceReferenceId !== undefined) {
    assertNonEmpty(node.sourceReferenceId, "reference.sourceReferenceId");
  }
  validateExtent(node.extent, `reference[${node.referenceId}].extent`);
}

export function validateScaleReferenceHierarchy(
  snapshot: ScaleReferenceHierarchySnapshot,
): void {
  if (snapshot.schemaVersion !== "big3r-scale-reference-hierarchy/1.0") {
    throw new TypeError("Scale reference hierarchy has an unsupported schema version.");
  }
  assertNonEmpty(snapshot.hierarchyId, "hierarchyId");
  assertNonEmpty(snapshot.currentWorldId, "currentWorldId");
  assertNonEmpty(snapshot.activeParentReferenceId, "activeParentReferenceId");
  if (!Number.isInteger(snapshot.revision) || snapshot.revision < 1) {
    throw new RangeError("revision must be a positive integer.");
  }
  if (!Array.isArray(snapshot.references) || snapshot.references.length === 0) {
    throw new TypeError("references must be a non-empty array.");
  }
  if (!Array.isArray(snapshot.promotions)) {
    throw new TypeError("promotions must be an array.");
  }

  const byId = new Map<string, ScaleReferenceNode>();
  for (const reference of snapshot.references) {
    validateReferenceNode(reference);
    if (byId.has(reference.referenceId)) {
      throw new TypeError(`Duplicate scale reference ID "${reference.referenceId}".`);
    }
    byId.set(reference.referenceId, reference);
  }

  const activeParent = byId.get(snapshot.activeParentReferenceId);
  if (!activeParent || activeParent.role !== "parent" || activeParent.status !== "active") {
    throw new RangeError("activeParentReferenceId must identify an active parent reference.");
  }

  for (const reference of snapshot.references) {
    if (reference.parentReferenceId && !byId.has(reference.parentReferenceId)) {
      throw new RangeError(`Reference "${reference.referenceId}" points to a missing parent.`);
    }
    if (reference.sourceReferenceId && !byId.has(reference.sourceReferenceId)) {
      throw new RangeError(`Reference "${reference.referenceId}" points to a missing source reference.`);
    }
    const visited = new Set<string>([reference.referenceId]);
    let parentId = reference.parentReferenceId;
    while (parentId) {
      if (visited.has(parentId)) throw new RangeError("Scale reference hierarchy contains a cycle.");
      visited.add(parentId);
      parentId = byId.get(parentId)?.parentReferenceId;
    }
  }

  const promotionIds = new Set<string>();
  for (const promotion of snapshot.promotions) {
    assertNonEmpty(promotion.transitionId, "promotion.transitionId");
    if (promotionIds.has(promotion.transitionId)) {
      throw new TypeError(`Duplicate promotion transition ID "${promotion.transitionId}".`);
    }
    promotionIds.add(promotion.transitionId);
    assertNonEmpty(promotion.fromWorldId, "promotion.fromWorldId");
    assertNonEmpty(promotion.toWorldId, "promotion.toWorldId");
    assertNonEmpty(promotion.previousParentReferenceId, "promotion.previousParentReferenceId");
    assertNonEmpty(promotion.promotedParentReferenceId, "promotion.promotedParentReferenceId");
    assertNonEmpty(promotion.comparisonMetric, "promotion.comparisonMetric");
    assertNonEmpty(promotion.unit, "promotion.unit");
    assertNonEmpty(promotion.configurationVersion, "promotion.configurationVersion");
    if (!Number.isFinite(promotion.simulationTimeSeconds) || promotion.simulationTimeSeconds < 0) {
      throw new RangeError("promotion.simulationTimeSeconds must be finite and non-negative.");
    }
    if (!Number.isFinite(promotion.previousParentExtent) || promotion.previousParentExtent <= 0 ||
        !Number.isFinite(promotion.promotedParentExtent) ||
        promotion.promotedParentExtent <= promotion.previousParentExtent) {
      throw new RangeError("A promoted parent must have a larger positive comparison extent.");
    }
  }
}

/**
 * Promotes a larger parent reference while preserving the previous parent.
 * This is a pure data operation: it does not move, resize, or mutate any
 * physical entity, growth state, stage scale, or renderer object.
 */
export function promoteScaleParent(
  snapshot: ScaleReferenceHierarchySnapshot,
  input: PromoteScaleParentInput,
): ScaleReferenceHierarchySnapshot {
  validateScaleReferenceHierarchy(snapshot);
  assertNonEmpty(input.transitionId, "transitionId");
  assertNonEmpty(input.fromWorldId, "fromWorldId");
  assertNonEmpty(input.toWorldId, "toWorldId");
  assertNonEmpty(input.configurationVersion, "configurationVersion");
  if (!Number.isFinite(input.simulationTimeSeconds) || input.simulationTimeSeconds < 0) {
    throw new RangeError("simulationTimeSeconds must be finite and non-negative.");
  }
  if (input.fromWorldId !== snapshot.currentWorldId) {
    throw new RangeError("fromWorldId must match the hierarchy's current world.");
  }
  if (input.toWorldId === input.fromWorldId) {
    throw new RangeError("A parent promotion must advance to a different world.");
  }
  if (snapshot.promotions.some(item => item.transitionId === input.transitionId)) {
    throw new TypeError(`Promotion transition "${input.transitionId}" already exists.`);
  }

  const previousParent = snapshot.references.find(
    item => item.referenceId === snapshot.activeParentReferenceId,
  )!;
  const nextParent = input.newParent;
  validateReferenceNode(nextParent);
  if (snapshot.references.some(item => item.referenceId === nextParent.referenceId)) {
    throw new TypeError(`Scale reference "${nextParent.referenceId}" already exists.`);
  }
  if (nextParent.role !== "parent" || nextParent.status !== "active") {
    throw new TypeError("The promoted reference must be an active parent.");
  }
  if (nextParent.introducedInWorldId !== input.toWorldId) {
    throw new RangeError("The promoted parent must be introduced in the destination world.");
  }
  if (nextParent.parentReferenceId !== undefined) {
    throw new RangeError("A promoted world parent must be a root of its new world hierarchy.");
  }
  if (nextParent.extent.unit !== previousParent.extent.unit ||
      nextParent.extent.metric !== previousParent.extent.metric ||
      nextParent.extent.axis !== previousParent.extent.axis) {
    throw new RangeError("Parent promotion requires matching extent units, metrics, and axes.");
  }
  if (nextParent.extent.value <= previousParent.extent.value) {
    throw new RangeError("The promoted parent must be larger than the previous parent.");
  }
  if (input.previousParentDisposition !== "child" &&
      input.previousParentDisposition !== "historical") {
    throw new TypeError("previousParentDisposition is unsupported.");
  }

  const retainedPreviousParent: ScaleReferenceNode = input.previousParentDisposition === "child"
    ? { ...previousParent, role: "child", status: "historical", parentReferenceId: nextParent.referenceId }
    : { ...previousParent, role: "historical", status: "historical", parentReferenceId: undefined };

  const promotion: ScaleReferencePromotionRecord = {
    transitionId: input.transitionId,
    fromWorldId: input.fromWorldId,
    toWorldId: input.toWorldId,
    previousParentReferenceId: previousParent.referenceId,
    promotedParentReferenceId: nextParent.referenceId,
    previousParentDisposition: input.previousParentDisposition,
    comparisonMetric: previousParent.extent.metric,
    previousParentExtent: previousParent.extent.value,
    promotedParentExtent: nextParent.extent.value,
    unit: previousParent.extent.unit,
    simulationTimeSeconds: input.simulationTimeSeconds,
    configurationVersion: input.configurationVersion,
  };

  const result: ScaleReferenceHierarchySnapshot = {
    ...snapshot,
    revision: snapshot.revision + 1,
    currentWorldId: input.toWorldId,
    activeParentReferenceId: nextParent.referenceId,
    references: snapshot.references.map(reference =>
      reference.referenceId === previousParent.referenceId ? retainedPreviousParent : reference,
    ).concat({ ...nextParent }),
    promotions: [...snapshot.promotions, promotion],
  };
  validateScaleReferenceHierarchy(result);
  return result;
}
