# 13163R Experiment Foundation

This package is observational. It must not own the simulation loop, mutate the
growth queue, control the camera, or decide gameplay eligibility.

## Invariants

- Simulation time is authoritative; wall-clock time is supplemental.
- Same-frame ordering uses a monotonic sequence number.
- Each test bed declares its world unit; angles are radians.
- Screen coordinates are normalized with a top-left origin.
- Requests, manager decisions, approved events, and execution records remain
  distinct and traceable.
- Relative, absolute-target, regional, and authored-profile growth are
  explicit variants. Numeric semantics are never inferred.
- Outcome and opportunity requests remain distinct modes.
- Legacy observations never fabricate missing native IDs or decisions.
- Automated metrics are not tester perception annotations.
- Authored camera configuration and runtime camera state remain separate.
- Sweet-spot recipes and their experiment evidence are separate records.
- Capture/storage failures must not alter simulation behavior.

## Compatibility boundary

The existing numeric enqueueGrowth(amount, stimulus) API and the current
M1ASVFXEngine implementation remain the legacy experimental route. The legacy
adapter records observed queue releases without pretending they are completed
character executions. The current engine exposes a PerspectiveCamera;
orthographic configuration in the contracts does not claim current runtime
support. The specialized procedural-big3r-tube-ceiling recorder remains
separately owned and unchanged.

## Acceptance checklist for integration

1. Existing numeric enqueueGrowth behavior and sandbox controls remain intact.
2. Outcome and opportunity request forms validate independently.
3. All four growth amount representations validate with explicit semantics.
4. Request, decision, event, and execution identities remain traceable.
5. Deferred requests retain identity and can be reevaluated without duplicate
   event creation.
6. Recorder samples use simulation time and deterministic sequence ordering.
7. Authored camera configuration and actual runtime state are stored separately.
8. Perspective-only adapters report orthographic as unsupported.
9. Presentation samples may reference multiple simultaneous growth events.
10. Tester annotations and automated metrics remain distinguishable.
11. Sweet-spot variants retain parent lineage and separate evidence.
12. Capture/storage errors cannot interrupt or modify simulation behavior.
13. Replay and comparison remain later capabilities; bit-exact replay is not
    implied by these contracts.

## First adapter limits

The initial Three.js adapter records a perspective camera's effective runtime
projection and transform, generic character/world bounds, and projected
screen-space bounding rectangles. It does not yet capture bone/region-specific
deformation, posture semantics, pixel-accurate silhouette occupancy, material
visibility, or occlusion. Those fields remain explicitly unsupported or
unpopulated until rig-aware and renderer-aware adapters are added. The
camera adapter is intentionally typed for the current PerspectiveCamera path;
orthographic runtime support is not implied by the broader schema.

The generic projection is a bounding-box estimate, not a pixel mask. Treat it
as a repeatable geometric indicator and pair it with tester annotations when
evaluating perceptual sweet spots.

## Persistence and scheduling status

ExperimentStorage is currently an interface; no concrete JSONL/file exporter,
media packager, replay engine, or comparison runner is included in this
foundation pass. Capture profiles are now consumed by CaptureScheduler, and ExperimentCoordinator provides an explicit lifecycle/tick/trigger facade. The host must still supply a read-only presentation provider and call tick/trigger from its existing simulation cadence; the current sandbox/engine does not yet instantiate the coordinator. The recorder serializes append operations and exposes
capture/storage errors so callers can monitor failures without interrupting
the simulation.


## Coordinator and scheduler boundary

- The host supplies simulation time; neither component starts a timer, RAF loop, or competing simulation.
- CaptureScheduler retains a bounded pre-event sample buffer, flushes matching samples on configured triggers, extends overlapping post-event windows, and deduplicates sample IDs.
- ExperimentCoordinator owns recorder lifecycle and invokes an injected read-only presentation provider. Provider failures are isolated into recorder capture errors.
- The current M1ASVFXEngine exposes scene/camera/renderer/subject getters but does not expose its internal simulation clock. Live wiring therefore requires a deliberate host integration that passes the engine's actual elapsed simulation time; wall-clock time or a second clock must not be substituted.
