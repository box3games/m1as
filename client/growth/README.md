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
