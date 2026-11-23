import test from "node:test";
import assert from "node:assert/strict";
import {
  getRendererCapabilityStatus,
  validateRendererCapabilityDescriptor,
  type RendererCapabilityDescriptor,
} from "./renderer-capability-contract.js";

const sprite: RendererCapabilityDescriptor = {
  schemaVersion: "big3r-renderer-capabilities/1.0",
  rendererId: "vfxr-sprite-runtime",
  rendererVersion: "0.1.0",
  representationKind: "2d-sprite",
  coordinateSpaces: ["sprite-local", "screen-normalized"],
  capabilities: {
    "read-anchors": { status: "native" },
    "sprite-bounds": { status: "native" },
    "screen-projection": { status: "native" },
    depth: { status: "unsupported" },
    "camera-attachment-soft": {
      status: "approximated",
      notes: "Attachment is evaluated against the sprite transform; no independent world-depth transform exists.",
    },
  },
};

test("renderer descriptor declares 2D sprite spaces without requiring 3D capabilities", () => {
  assert.doesNotThrow(() => validateRendererCapabilityDescriptor(sprite));
  assert.equal(getRendererCapabilityStatus(sprite, "sprite-bounds"), "native");
  assert.equal(getRendererCapabilityStatus(sprite, "depth"), "unsupported");
  assert.equal(getRendererCapabilityStatus(sprite, "skeleton-hierarchy"), "unsupported");
});

test("renderer capability lookup never infers absent capabilities", () => {
  assert.equal(getRendererCapabilityStatus(sprite, "write-anchors"), "unsupported");
});

test("translated and approximated capabilities require explanatory notes", () => {
  assert.throws(() => validateRendererCapabilityDescriptor({
    ...sprite,
    capabilities: { depth: { status: "approximated" } },
  }), /requires notes/);
  assert.throws(() => validateRendererCapabilityDescriptor({
    ...sprite,
    capabilities: { depth: { status: "translated", notes: " " } },
  }), /requires notes/);
});

test("renderer coordinate spaces must be unique and explicitly supported", () => {
  assert.throws(() => validateRendererCapabilityDescriptor({
    ...sprite,
    coordinateSpaces: ["sprite-local", "sprite-local"],
  }), /Invalid or duplicate/);
  assert.throws(() => validateRendererCapabilityDescriptor({
    ...sprite,
    coordinateSpaces: ["world-everywhere" as never],
  }), /Invalid or duplicate/);
});

test("2D and 2.5D renderers may declare their own local and viewport spaces", () => {
  assert.doesNotThrow(() => validateRendererCapabilityDescriptor({
    ...sprite,
    representationKind: "2.5d-plane",
    coordinateSpaces: ["plane-local", "viewport-normalized"],
    capabilities: {
      "plane-bounds": { status: "native" },
      "screen-projection": { status: "native" },
      depth: { status: "approximated", notes: "Plane depth is represented by its stage layer." },
    },
  }));
});
