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
