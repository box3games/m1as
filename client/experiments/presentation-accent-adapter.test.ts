import test from "node:test";
import assert from "node:assert/strict";
import { applyPresentationAccentEvaluation } from "./presentation-accent-adapter.js";

test("applies configured targets and records the effect host response", () => {
  const calls: Array<[string, string, number]> = [];
  const cleared: string[][] = [];
  const host = {
    presentationAccentHostId: "test-host",
    clearPresentationAccentChannels(ids: readonly string[]) { cleared.push([...ids]); },
    applyPresentationAccent(channelId: string, target: string, value: number) {
      calls.push([channelId, target, value]);
      return { status: "available" as const, value, hostId: "test-host", provenance: "test" };
    },
  };
  const result = applyPresentationAccentEvaluation({
    profileId: "test",
    profileVersion: "1",
    channels: [
      {
        channelId: "emissive",
        source: "perceived_mass",
        sourceValue: 0.8,
        mappedTargetValue: 1.2,
        effectTarget: "m1as.subject.emissive-intensity",
        appliedValue: { status: "not_captured", reason: "pending" },
      },
      {
        channelId: "unbound",
        source: "actual_scale_geometric_mean",
        sourceValue: 2,
        mappedTargetValue: 0.4,
        appliedValue: { status: "not_captured", reason: "pending" },
      },
    ],
  }, host);
  assert.deepEqual(cleared, [["emissive"]]);
  assert.deepEqual(calls, [["emissive", "m1as.subject.emissive-intensity", 1.2]]);
  assert.equal(result.channels[0].appliedValue.status, "available");
  assert.equal(result.channels[1].appliedValue.status, "not_captured");
});

test("records unsupported host targets without claiming application", () => {
  const host = {
    presentationAccentHostId: "limited-host",
    clearPresentationAccentChannels() {},
    applyPresentationAccent() {
      return { status: "unsupported" as const, reason: "Target not registered." };
    },
  };
  const result = applyPresentationAccentEvaluation({
    profileId: "test",
    profileVersion: "1",
    channels: [{
      channelId: "camera",
      source: "camera_relative_area",
      sourceValue: 0.4,
      mappedTargetValue: 2,
      effectTarget: "camera.fov-offset",
      appliedValue: { status: "not_captured", reason: "pending" },
    }],
  }, host);
  assert.equal(result.channels[0].appliedValue.status, "unsupported");
});
