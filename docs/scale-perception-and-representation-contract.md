# Scale, Mass Perception, and Representation Contract

Status: E-branch architectural decision / design contract
Target: `box3games_13163R_E_EH-37`
Scope: E1 growth/presentation state; E2 VFXR mappings; E3 subject adapters and representation transitions; E4 experiment capture.

## 1. Governing invariant

A subject has four independent, persistent or context-evaluated measurements:

1. **Actual scale** — authoritative dimensions and accumulated growth in declared world units.
2. **Stage-relative scale** — actual dimensions evaluated against an authored level-stage reference profile.
3. **Camera-relative projected scale** — the subject's projected footprint under a particular camera, viewport, and framing state.
4. **Perceived mass** — independently authored presentation weight describing how substantial, heavy, or imposing the subject should feel.

These measurements may inform one another's presentation mappings, but must never be substituted for one another. A level transition, camera change, LOD change, or representation swap must not rewrite actual scale or growth history.

## 2. Actual scale and physical mass

- Preserve initial dimensions, current dimensions, world-unit declaration, and accumulated growth independently of the active render representation.
- Store dimensions as a vector; do not reduce anisotropic or regional growth to one scalar.
- Physical mass is optional and must carry units and provenance.
- Never infer physical mass from scale or volume unless an explicit density/material model authorizes that calculation.
- A representation adapter may change geometry, rig, sprite, projection, or render proxy while preserving subject identity and authoritative scale state.

## 3. Stage-relative normalization

Each level stage supplies a versioned reference profile. It declares its world unit, reference dimensions or volume, reference subject/landmark, normalization basis, and applicable scale bands.

- Linear ratios are component-wise: current subject dimensions divided by the authored reference dimensions.
- A volume ratio may also be recorded when the reference and subject volumes are meaningful and the assumptions are explicit.
- Stage-relative values are dimensionless. Preserve the underlying absolute dimensions alongside them.
- Do not assume every stage uses the same reference object, room size, camera, or scale band.
- On stage transition, recompute stage-relative values against the new profile. Do not rescale or reset the subject to fit the new stage.
- Normalization curves may shape presentation or band selection, but must not clamp or discard the underlying measurement. Preserve out-of-range values and identify extrapolation.

## 4. Camera-relative projected scale and 2D relative mass

Camera-relative values are contextual observations, not persistent physical properties. Each sample identifies the camera, projection type, viewport dimensions/aspect, framing state, and simulation time.

Capture at least:
- normalized screen-space bounds (top-left origin, viewport-normalized coordinates);
- projected width, height, and area as separate measures;
- projected area divided by viewport area;
- optional ratio against an authored reference projection captured under a declared camera/reference setup.

**2D relative mass** is a normalized screen-space presence proxy derived from projected footprint and an authored stage/camera reference. It describes how much visual presence the subject occupies in that view. It is not physical mass and must not be used as a substitute for actual scale, stage-relative scale, or perceived mass.

A camera move, FOV change, viewport resize, occlusion, or subject leaving the frame can change projected measurements without changing actual scale. Record clipping/visibility state; do not interpret an absent or fully clipped projection as zero physical size.

For 2D and 2.5D subjects, preserve source-space dimensions/aspect ratio and the subject's logical scale state separately from the plane/sprite's projected footprint.

## 5. Perceived mass normalization

Perceived mass is authored independently of physical mass and geometric scale. It is a presentation input usable by 3D, 2.5D, 2D, VFXR, holographic, camera, audio, and environmental-response systems.

- Store the authored value, profile ID/version, declared range, and normalized presentation value.
- Normalize against the selected authored profile into a documented dimensionless presentation domain; do not silently compare raw values from unrelated profiles.
- Permit deliberate high perceived mass for nonphysical holograms or projections.
- Keep effect mappings independently configurable. Perceived mass may influence deformation, breath/pressure response, wave strength, holographic density, camera presence, shadows, audio, and environmental reactions, but no universal multiplier is implied.
- Perceived mass alone must not alter actual scale, physical mass, collision dimensions, or stage-relative scale.
- A visual effect may intentionally communicate weight without asserting that the hologram or sprite has physical mass.

## 6. Representation prediction and remodeling

A representation policy may consume:
- actual scale and growth history;
- stage-relative scale and authored stage bands;
- camera-relative projected scale and visibility;
- subject/asset capabilities and available representations;
- perceived-mass profile and effect mappings.

It may predict transitions among detailed GLB, simplified mesh/proxy, breakable/debris state, 2D sprite, 2.5D layered subject, rigged vector/sprite subject, hologram, or non-rendered/distant state.

Rules:
- Prediction and application are separate. Record the predicted representation, selected representation, decision reason, and transition timing.
- Use configurable thresholds with hysteresis to prevent rapid oscillation near a boundary.
- Camera-dependent transitions may change the render representation without changing logical scale or subject identity.
- Stage changes may select a different representation profile, but may not reset actual growth.
- Preserve logical position, orientation, hierarchy/region identity, interaction state, destruction state, and growth history across representation swaps where supported.
- Perceived mass controls presentation cues; it may inform representation styling, but must not silently dictate physical collision or object dimensions.
- If a requested representation is unsupported, report that explicitly and retain a valid fallback.

## 7. Shared state boundaries

Keep these responsibilities separate:

- **Growth model:** actual growth, current dimensions, growth trajectory, breath cycle, pressure, and deformation state.
- **Stage profile:** reference dimensions, stage bands, normalization curves, and representation policy defaults.
- **Camera/presentation adapter:** projected bounds, viewport context, visibility, and framing.
- **Mass-perception profile:** authored perceived-mass value and effect-specific mappings.
- **Subject/representation adapter:** applies supported render transformations while preserving logical subject state.
- **VFXR:** consumes presentation inputs through extensible effect mappings; it does not own authoritative subject scale.
- **Experiment recorder:** observes and records inputs, predictions, decisions, and outcomes; it does not mutate simulation state.

## 8. Experiment capture requirements

Record, with common experiment and simulation-time identity:
- actual dimensions, initial dimensions, world units, and growth history;
- stage ID, reference-profile ID/version, normalization basis, and stage-relative values;
- camera ID/configuration, projection, viewport, normalized bounds, projected width/height/area, reference ratio, and visibility/clipping;
- perceived-mass authored value, profile/version, and normalized value;
- predicted and applied representation, transition reason, thresholds/hysteresis state, and adapter capability/fallback;
- relevant growth/breath/pressure state and VFX response measurements.

Keep authored configuration distinct from runtime measurements. Preserve unavailable/unsupported/not-captured states rather than writing fabricated zeroes. Capture prediction versus actual outcome so experiments can evaluate whether the chosen representation and presentation produced the intended result.

## 9. Implementation sequence

- **E1:** add the scale/perception state contract and stage-normalization primitives alongside flow shaping. Keep actual growth, breath/pressure, and perceived mass independent.
- **E2:** expose typed, extensible VFXR mappings for perceived mass and presentation responses.
- **E3:** implement representation-aware subject adapters, beginning with GLB and a 2D sprite/plane path; add 2.5D and rigged/vector subjects without changing the shared scale contract.
- **E4:** capture camera-relative measurements and predicted-versus-applied representation decisions.
- **E5:** validate across the lab stage progression and transitions.

## 10. Acceptance invariants

1. Camera movement changes projected measurements, never actual scale.
2. Stage changes recompute relative measurements, never actual scale.
3. Representation swaps preserve subject identity and authoritative growth state.
4. Perceived mass can differ from physical mass and geometric scale.
5. 2D relative mass is explicitly camera/reference-normalized and is never treated as physical mass.
6. A hologram can have high perceived mass and zero/unknown physical mass.
7. Normalization preserves out-of-range values; it does not cap actual progression.
8. Recorder failures or presentation sampling do not alter growth execution.

## 11. First implementation slice

The following renderer-independent foundations are now present:

- `client/growth/scale-perception.ts`: actual-dimension snapshots, stage-relative axis ratios, optional 3D bounding-volume ratio proxy, camera-relative projected-area ratio, and stage-bound perceived-mass normalization.
- `client/growth/biological-breathing.ts`: simulation-time breath phases with continuous, monotonic scale accumulation during inhale; progressively longer cycles; increasing hold pressure; a separate traveling pressure-wave signal; and independently tunable growth and visual-pulse envelopes.
- `client/growth/scale-perception.test.ts` and `client/growth/biological-breathing.test.ts`: deterministic edge-case and progression tests, included in `npm run test:experiments`.

The 3D volume output is explicitly a bounding-volume ratio proxy, not physical mass. The 2D relative-mass output is projected visual area divided by a stage/camera-authored reference footprint. Camera and perceived-mass profiles identify their stage, preventing accidental comparison across unrelated level references.

**Initial integration boundary:** the scale/perception measurement functions remain renderer-independent and are not yet automatically populated from every live camera/stage combination. Their values must be supplied by explicit stage and camera reference profiles.

## 12. Biological breathing adapter and sandbox integration

The next integration slice now connects the breathing controller to the existing growth path:

- `client/growth/model-contract.ts` exposes a shared biological-breath telemetry shape and an optional `applyBiologicalBreathState` adapter seam.
- `client/growth/biological-breathing-model.ts` composes the profile with any GrowthModel implementation that supports the seam. It preserves ordinary discrete/flow/hold commands and supports start, pause, telemetry and reset.
- `client/growth/model-adapters.ts` maps the profile to baseline Three.js scaling or the M1AS VFX engine without changing the legacy discrete command contract.
- `client/M1ASVFXEngine.ts` can run the controller from its existing simulation delta. Each inhale contributes a continuous positive delta through `GrowthEventQueue.feedSustainedGrowth`; it does not enqueue one discrete event per frame. Hold pressure and the pressure-wave signal contribute separately to the existing organic deformation response.
- The sandbox growth-model panel exposes start/pause controls for biological breathing. Starting requires the M1AS VFX model and an idle queue/hold/flow state. Discrete queue events may still be introduced after breathing starts, allowing a deliberate hybrid experiment. Model switching remains locked while the breath profile is retained; reset clears it.
- Experiment presentation capture now records the engine's current scale, target, velocity, instability, breathing phase/progression, pressure, pulse, posture and Golden Buffer through the existing deformation/VFX measurement fields.
- Three.js projected screen bounds now preserve offscreen extents while screen occupancy remains clipped to the visible viewport. This prevents a partly offscreen growing subject from appearing artificially smaller in the recorded bounds; a focused regression test is included.

The wrapper and engine use the same biological controller implementation. The wrapper is the interchangeable-model composition seam; the engine-owned instance is the live sandbox path, which follows the engine's existing simulation clock. Recorder capture remains observational and does not advance or mutate the profile.

**Not yet integrated:** automatic stage-reference selection, camera-relative 2D normalization from live projected bounds, authored perceived-mass profiles, representation-tier prediction/remodeling, and VFXR/hologram registration. Those remain the next scale/perception and extensibility tasks.
