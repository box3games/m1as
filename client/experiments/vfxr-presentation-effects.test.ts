import test from "node:test";
import assert from "node:assert/strict";
import { VfxrPresentationEffectRegistry } from "../vfxr/presentation-effects.js";

test("registry routes configured target IDs and reports missing targets", () => {
  const registry = new VfxrPresentationEffectRegistry();
  const calls: Array<[string, number]> = [];
  const target = {
    targetId: "vfxr.test.intensity",
    apply(channelId: string, value: number) {
      calls.push([channelId, value]);
      return {
        status: "available" as const,
        value,
        hostId: "test-host",
        provenance: "test",
      };
    },
    clear() {},
  };
  registry.register(target);
  const applied = registry.applyPresentationAccent("presence", "vfxr.test.intensity", 0.7);
  assert.equal(applied.status, "available");
  assert.deepEqual(calls, [["presence", 0.7]]);
  const missing = registry.applyPresentationAccent("missing", "vfxr.not-registered", 1);
  assert.equal(missing.status, "unsupported");
  registry.dispose();
});

test("registry rejects duplicate targets and disposes unregistered targets", () => {
  const registry = new VfxrPresentationEffectRegistry();
  let disposed = 0;
  const target = {
    targetId: "vfxr.test.duplicate",
    apply() {
      return { status: "available" as const, value: 1, hostId: "test", provenance: "test" };
    },
    clear() {},
    dispose() { disposed += 1; },
  };
  const unregister = registry.register(target);
  assert.throws(() => registry.register(target), /already registered/);
  unregister();
  assert.equal(disposed, 1);
  registry.dispose();
});

test("registry updates registered effects and clears inactive channels", () => {
  const registry = new VfxrPresentationEffectRegistry();
  let updated = 0;
  let cleared: string[] = [];
  registry.register({
    targetId: "vfxr.test.lifecycle",
    apply() {
      return { status: "available" as const, value: 1, hostId: "test", provenance: "test" };
    },
    clear() {},
    clearAllExcept(ids: ReadonlySet<string>) { cleared = [...ids]; },
    update(dt: number) { updated += dt; },
  });
  registry.clearPresentationAccentChannels(["active"]);
  registry.update(0.25);
  assert.deepEqual(cleared, ["active"]);
  assert.equal(updated, 0.25);
  registry.dispose();
});
