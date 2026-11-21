import test from "node:test";
import assert from "node:assert/strict";
import { GrowTimeController } from "./grow-time.js";

test("press points convert continuously into a persistent Grow Time reserve", () => {
  const controller = new GrowTimeController({ growTimeSecondsPerPoint: 0.5, pointsPerPress: 2 });
  controller.pressStack(0);
  controller.pressStack(0.1);
  assert.equal(controller.getState().stackPointsEarned, 4);
  assert.equal(controller.getState().availableGrowTimeSeconds, 2);
});

test("hold input earns points from simulation elapsed time, not callback count", () => {
  const controller = new GrowTimeController({ pointsPerHoldSecond: 2, growTimeSecondsPerPoint: 0.5 });
  controller.beginHold(0);
  controller.advance(1);
  controller.advance(2.5);
  controller.endHold(3);
  assert.equal(controller.getState().stackPointsEarned, 6);
  assert.equal(controller.getState().availableGrowTimeSeconds, 3);
});

test("R consumes only the requested amount and preserves the remainder", () => {
  const controller = new GrowTimeController({ pointsPerPress: 10, growTimeSecondsPerPoint: 1 });
  controller.pressStack(0);
  assert.equal(controller.triggerRestAndGrow(0, { kind: "duration", seconds: 6 }), 6);
  assert.equal(controller.getState().availableGrowTimeSeconds, 4);
  assert.equal(controller.getState().activeGrowTimeSeconds, 6);
  controller.advance(2);
  assert.equal(controller.getState().activeGrowTimeSeconds, 4);
  assert.equal(controller.getState().availableGrowTimeSeconds, 4);
});

test("growth completion returns to buff phase; reserve remains available", () => {
  const controller = new GrowTimeController({ pointsPerPress: 4, growTimeSecondsPerPoint: 1 });
  controller.pressStack(0);
  controller.triggerRestAndGrow(0, { kind: "duration", seconds: 3 });
  controller.advance(3);
  assert.equal(controller.getState().phase, "buff");
  assert.equal(controller.getState().clockState, "idle");
  assert.equal(controller.getState().availableGrowTimeSeconds, 1);
});

test("chaos consumption is deterministic when a random sample is supplied", () => {
  const controller = new GrowTimeController({ pointsPerPress: 20, growTimeSecondsPerPoint: 1 });
  controller.pressStack(0);
  const consumed = controller.triggerRestAndGrow(0, {
    kind: "chaos", minimumSeconds: 2, maximumSeconds: 10, chaos: 0.5,
  }, 0.5);
  assert.equal(consumed, 4);
  assert.equal(controller.getState().availableGrowTimeSeconds, 16);
});

test("disabled or restricted conversion does not mint global Grow Time", () => {
  for (const conversionMode of ["disabled", "restricted"] as const) {
    const controller = new GrowTimeController({ conversionMode });
    controller.pressStack(0);
    assert.equal(controller.getState().stackPointsEarned, 1);
    assert.equal(controller.getState().availableGrowTimeSeconds, 0);
  }
});

test("stacking during growth obeys configuration", () => {
  const controller = new GrowTimeController({
    pointsPerPress: 1, growTimeSecondsPerPoint: 1, allowStackingDuringGrowth: false,
  });
  controller.pressStack(0);
  controller.triggerRestAndGrow(0, { kind: "duration", seconds: 1 });
  controller.pressStack(0.1);
  assert.equal(controller.getState().stackPointsEarned, 1);
});

test("simulation time cannot move backwards", () => {
  const controller = new GrowTimeController();
  controller.advance(2);
  assert.throws(() => controller.advance(1), /cannot move backwards/);
});

test("restricted mode converts only allowlisted sources", () => {
  const controller = new GrowTimeController({
    conversionMode: "restricted",
    restrictedConversionSources: ["rest_bonus"],
    pointsPerPress: 2,
    growTimeSecondsPerPoint: 3,
  });
  controller.pressStack(0, "mini_game_press");
  assert.equal(controller.getState().availableGrowTimeSeconds, 0);
  controller.pressStack(1, "rest_bonus");
  assert.equal(controller.getState().availableGrowTimeSeconds, 6);
});


test("flow multiplier changes real-time supply consumption without changing the reserve", () => {
  const controller = new GrowTimeController({ pointsPerPress: 10, growTimeSecondsPerPoint: 1 });
  controller.pressStack(0);
  controller.triggerRestAndGrow(0, { kind: "duration", seconds: 5 });
  controller.setFlowMultiplier(2);
  controller.advance(1);
  assert.equal(controller.getState().activeGrowTimeSeconds, 3);
  assert.equal(controller.getState().availableGrowTimeSeconds, 5);
  assert.equal(controller.getState().activeFlowMultiplier, 2);
  controller.advance(2.5);
  assert.equal(controller.getState().activeGrowTimeSeconds, 0);
  assert.equal(controller.getState().activeFlowMultiplier, 1);
});

test("flow multiplier rejects zero, negative, and non-finite values", () => {
  const controller = new GrowTimeController();
  assert.throws(() => controller.setFlowMultiplier(0), /greater than zero/);
  assert.throws(() => controller.setFlowMultiplier(-1), /greater than zero/);
  assert.throws(() => controller.setFlowMultiplier(Number.NaN), /greater than zero/);
});
