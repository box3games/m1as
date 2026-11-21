# Grow Time Resource Controller

## Purpose

This is the minimal, deterministic resource loop shared conceptually by the 13163R browser harness and the Golden Boy C# project. It is not the full Growth Event Manager or an experiment database.

## State ownership

- `stackPointsEarned`: points produced by the buff-stacking mini-game.
- `availableGrowTimeSeconds`: persistent, spendable global Grow Time reserve.
- `activeGrowTimeSeconds`: amount currently allocated to a growth/rest event.
- `phase`: buff-building or active growth.
- `clockState`: idle, active, or paused.
- `lastSimulationTimeSeconds`: authoritative simulation clock checkpoint.

Points are awarded by discrete presses or by hold duration. In continuous conversion mode, points immediately convert into reserve seconds. Restricted mode converts only points whose source is explicitly allowlisted. Disabled mode retains local stack points but does not create global Grow Time.

Regional buff systems may use local points independently; they must not implicitly write to the global reserve.

## Commands

- `pressStack(simTime, source)`
- `beginHold(simTime, source)`
- `endHold(simTime)`
- `advance(simTime)`
- `triggerRestAndGrow(simTime, policy, randomUnit)`
- `pauseGrowth()` / `resumeGrowth()`

The controller receives simulation time in seconds. Implementations must not derive elapsed time from timer callback counts or wall-clock time.

## Consumption policies

- Duration: request an explicit number of seconds.
- Chaos: choose from a configured interval using an injected random sample and chaos factor. The random sample/seed belongs to the calling simulation so the same input can be replayed.

Consumption is clamped to the available reserve. Unspent reserve remains available. Active duration counts down on simulation time and returns the phase to buff when it reaches zero.

## Persistence

The browser adapter persists only durable values (earned point total and available reserve) to localStorage. It intentionally does not resume an active event or timer after reload. The storage key is versioned.

A C# port should serialize the same versioned snapshot fields and implement the same transition rules. It should use the game's simulation clock and deterministic random source. This repository currently contains no C# project source, so parity is specified and browser-tested here but not yet implemented or executed in C#.

## Current sandbox bridge

The 13163R sandbox provides A (press), B (hold), and R (rest/grow) controls. R consumes a configured duration and translates that duration to a configurable legacy queue scale delta before calling the existing Buff growth path. That scale-per-second value is a harness tuning parameter, not a universal gameplay law. Existing engine queue behavior is otherwise preserved.

## Verification

Run `npm run test:experiments`. Grow Time tests cover continuous conversion, hold timing, reserve consumption, growth completion, deterministic chaos, restricted/disabled conversion, stacking policy, and monotonic simulation time.


## Interchangeable growth models

The growth-model contract is defined in `model-contract.ts`. It separates common experiment commands and telemetry from model-specific execution.

Available adapters:

- `ThreeObjectScaleGrowthModel`: deterministic baseline GLB/Object3D scaling with duration-driven growth, held-charge growth, and sustained supply flow.
- `M1ASVFXGrowthModel`: adapter over the existing M1AS VFX engine and legacy queue. It preserves the queue's event timing, spring response, posture, skeletal response, and VFX behavior.

The M1AS VFX adapter supports sustained flow commands. Grow Time supply is consumed against simulation time at a configurable multiplier and converted into gradual target-scale feed through the existing GrowthEventQueue spring response. This does not enqueue one discrete event per frame; the queue retains ownership of spring, damping, instability and character embodiment.

The adapters are exported for use by a model host. The sandbox now exposes an engine-level selector between the existing M1AS VFX queue and a baseline whole-object scaling mode. Both modes use the same normalized streamed GLB, subject root, camera, scene, room references, spatial props, and input controls. Switching is rejected while growth is active or queued, and the selector is locked during experiment capture. The standalone baseline adapter remains available for future independent model hosts. For controlled comparisons, use the same asset, initial scale, scene, camera, stimulus sequence, and capture profile.

## Experiment diagnostics and persistence

The sandbox diagnostic logger mirrors structured operational events to the browser console and a bounded localStorage ring buffer. It records important asset stream/load results, input actions, growth queue events, and capture/storage errors. LocalStorage is intentionally limited to recent diagnostics and settings; it is not the experiment database.

Experiment capture uses IndexedDB for persistent structured records. Finalization builds the portable JSON export from the persisted manifest and streams, avoiding a second in-memory copy of every record during the experiment. The recorder remains observational and reports storage failures without changing simulation execution.


## Sustained Grow Time flow

- Grow Time reserve is a finite supply measured in supply-seconds.
- Flow multiplier controls supply consumption per simulation second (1.0x is nominal; 2.0x consumes twice as quickly).
- Growth-per-supply-second independently controls how much target-scale increase each supply-second produces.
- The M1AS engine feeds the existing queue's spring target directly. It does not enqueue an event every frame, and discrete stimuli remain independently available to interrupt or compound sustained growth.
- The Grow Time controller and engine both advance from the same simulation clock and use the same flow multiplier.
- Flow start, rate changes, depletion, and stop are written to diagnostics. Active flow samples are captured at 2 Hz during experiments with scale, remaining supply, multiplier, and growth response configuration.
- Baseline scaling remains a control model; this sandbox Grow Time flow path currently requires M1AS VFX mode.
