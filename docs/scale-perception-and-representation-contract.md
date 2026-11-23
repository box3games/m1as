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


## Portable anchors and scale relationships

BIG3R exposes a read-only portable anchor snapshot through the stage presentation adapter. The current runtime sources are deliberately distinct:

- Character root origin and measured geometry bounds are geometric observations, not anatomical claims.
- GLB skeleton nodes are exposed as rig-bone anchors with their original node names and parent-bone relationships.
- Stage origin and camera position/focus are world-space observation references.
- Scene props explicitly registered with role `reference` expose measured bottom/top bounds as environment anchors.

These sources are not interchangeable. A measured mesh bound is not a head/foot landmark, a rig bone is not automatically a semantic anatomical label, and an arbitrary scene prop is not an environment reference unless it is explicitly registered as one.

Reference relationship measurements preserve both baseline and current subject/reference snapshots. This supports character-to-character, creature-to-building and building-to-environment comparisons without assuming a human reference. Camera-relative projected size remains a separate presentation observation; it must not be used as a substitute for world-space growth.

The current live capture is read-only. Authored semantic anchor metadata, writable anchor editing, additional environment landmark types, and paired first-person/observer capture remain subsequent integration work.


## 14. Camera perspectives, sticky attachments, and paired observation

Camera presentation is an observation system, not a growth authority. Camera movement, attachment, framing, projection changes, and perspective switching must never modify actual scale, growth history, or stage-relative scale.

The portable camera contract defines explicit perspective identities for first-person, observer, over-the-shoulder, growing-toward-viewer, outstretched-hand, looking-down, elevated, low-angle, front, back, side-profile, top-down, free-form, and sticky views. These labels identify evaluation intent; they do not imply that every runtime camera mode is already implemented.

Sticky-camera attachment uses stable portable anchor identity, owner identity, coordinate space, source provenance, and a local position/orientation offset. Three attachment behaviors are distinguished:

- **Hard stick:** follows the anchor transform directly.
- **Soft stick:** follows with a configurable damping response.
- **Look-at stick:** follows an attachment while independently tracking a second anchor.

A missing or replaced attachment target must be reported as unavailable; it must not silently retarget to another anchor. A camera attachment is not an authored anatomical anchor and must not promote an arbitrary bone into a semantic body landmark.

Synchronized perspective capture requires every view to identify the same observed subject, configuration version, growth-state identity, and simulation timestamp. This permits child-view, adult-view, over-shoulder, outstretched-hand, and observer views to compare the same growth event rather than different moments.

Each perspective also records camera pose, projection, viewport, and framing intent. Full-body framing and intentional dramatic cropping are distinct declared intents. Off-screen projection and clipping diagnostics remain separate from physical dimensions and should be added by the framing-integrity implementation.

This contract establishes the data boundary only. It does not yet add player-facing sticky-camera controls or change the existing five CameraRig5Mode behaviors.


## 15. Renderer-neutral capability and Infinity Growth Presentation

The renderer capability contract declares representation kind, coordinate spaces, and explicit support for anchors, bounds, transforms, depth, parallax, projection, occlusion, and camera attachment behaviors. Supported representation kinds include 2D sprites, 2D vectors, 2.5D planes, 3D scenes, holograms, and composites. Missing capabilities are unsupported; they are never inferred. Translated or approximated capabilities must state how the mapping works.

Portable anchors and camera attachments accept sprite-local, plane-local, subject-local, stage-world, camera-relative, screen-normalized, and viewport-normalized spaces. These coordinate spaces preserve renderer semantics; they do not imply that a 2D sprite has world depth, a skeleton, or a 3D transform. The renderer descriptor remains the authority for which spaces and operations are actually available.

### Infinity Growth Presentation (IGP)

IGP is a reversible presentation strategy for cases where native camera presentation cannot reliably communicate continued growth. It contracts the *apparent rendered environment* around the subject so the character can remain compositionally legible without requiring unbounded camera distance, world-coordinate expansion, or far-plane growth. IGP does not shrink authoritative world objects, alter collision, or rewrite subject/world dimensions.

Two environment policies are explicit:

- **contract-all:** all environment references contract together. This emphasizes continuous reverse-world growth and does not preserve fixed visual calibration objects.
- **preserve-calibration:** selected, stable reference anchors remain visually calibrated while the rest of the apparent environment contracts. This keeps a known comparison point available while the wider world changes.

Calibration anchors retain their authoritative identity, source, and measurements. Their presentation exemption is recorded separately; it must not overwrite their world-space dimensions. The selected policy is part of the presentation configuration and experiment capture.

IGP defines three presentation modes: native, assisted, and infinity. Native uses the renderer's ordinary presentation. Assisted applies supported framing recovery without world contraction. Infinity enables explicit environment contraction. A transition must be tied to the exact framing-integrity assessment and the same subject, configuration, growth-state identity, and simulation timestamp. Assisted mode is reserved for a framing problem that native camera recovery can still resolve; infinity mode is reserved for a problem native recovery cannot resolve. The assessment sample ID must match the presentation snapshot. Arbitrary size thresholds alone are not sufficient evidence for a transition.

The initial IGP snapshot records:
- presentation mode and environment policy;
- apparent environment scale multiplier;
- stable calibration anchor IDs;
- optional normalized subject viewport anchor;
- background-only blur, camera shake, parallax accent, and horizon shift;
- framing-integrity sample identity;
- an explicit presentation-only authority boundary.

Background effects are independent controls. Blur is background-only in this contract; the subject's silhouette, body proportions, growth landmarks, and inspection detail must remain available by default. Camera shake and blur are optional surge accents, not required consequences of growth. Effect intensity is recorded so the same growth event can be compared with effects enabled or disabled.

### Framing-integrity boundary and implementation status

A framing-integrity assessment identifies clipping, exhausted depth range, unrecoverable framing, or unavailable projected bounds, along with visible viewport occupancy, depth-clipping state, and whether native recovery is available. It is a diagnostic input, not a growth command.

This implementation slice establishes validated data contracts and tests only. It does not yet transform live scene environments, pin calibration props, alter the live camera, apply blur/shake, or automatically switch presentation modes. Those require renderer-specific adapters that advertise and execute only supported capabilities. Existing CameraRig5Mode behavior, tube-ceiling-growth behavior, growth engines, stage-relative scale, and M1AS stream/GLB authority remain unchanged.


## 16. Persistent parent/child scale-reference hierarchy

The Colossus progression decision is a persistent scale-history rule:

- The active world has an explicit parent scale reference (for example, a 100 m Colossus).
- NPCs, bosses, environmental landmarks, and local interaction references may be nested beneath that parent.
- When the player advances to a larger world, the destination world promotes a new, larger parent reference.
- The previous parent is never deleted. It is retained either as a child beneath the newly promoted parent or as a historical reference, according to the authored transition.
- Promotion records preserve the source/destination world IDs, old/new parent identities, comparison metric and extents, simulation time, and configuration version.
- Reference identity and authoritative extents remain separate from presentation transforms, IGP contraction, camera framing, and stage-relative normalization.

The renderer-independent contract is `client/evaluation/scale-reference-hierarchy-contract.ts`. Its pure `promoteScaleParent` operation validates a larger destination parent with matching comparison units/metric/axis, preserves the previous parent, advances the world and hierarchy revision, and records the promotion. It does not move or resize any runtime entity and does not alter growth state.

The contract rejects duplicate identities, missing parent/source references, hierarchy cycles, invalid extents, mismatched comparison units, non-advancing world transitions, and promotions that do not increase the selected reference extent. It permits the previous parent to remain historically accessible even when it is no longer nested under the active parent.

This is a data and progression contract only. It does not yet instantiate Colossus geometry, generate nested world envelopes, select cameras, or trigger level transitions. Those remain downstream integrations that must consume the hierarchy without changing its authority.


## 17. Framing Integrity Monitor

The renderer-neutral `assessFramingIntegrity` function converts a measured projection observation into the existing IGP framing-assessment contract. It preserves full, unclamped normalized screen bounds as input and computes visible viewport occupancy from their intersection with the viewport.

- Full-body and environment-context framing treat offscreen subject bounds as a framing issue.
- Dramatic-crop and free framing do not treat screen-edge cropping alone as a failure.
- Near/far depth clipping takes precedence over screen framing.
- Missing projected bounds or missing depth evidence remains an explicit unavailable-projection trigger; it is never represented as zero size.
- Recoverable screen clipping is classified as `subject-clipped`; screen clipping that the camera adapter declares unrecoverable is `framing-unrecoverable`.
- Native recovery availability must be supplied explicitly by the camera/presentation adapter. The monitor does not guess that a camera can recover.
- The resulting assessment retains subject, growth-state, configuration, and simulation-time identity so IGP transitions can validate against the exact diagnostic sample.

This is a deterministic assessment layer, not a live camera controller. It does not change CameraRig5Mode, move a camera, modify near/far planes, contract the environment, or alter authoritative growth and stage scale. Renderer adapters remain responsible for producing trustworthy projection bounds, depth range, and recovery-capability evidence.


## 18. Configurable Colossus profile and world envelope

The renderer-independent `colossus-profile-contract.ts` defines a versioned JSON profile for a Colossus scale reference. Colossus identity is the stable reference ID and authored `kind: "colossus"` / `role: "parent"`; it is never inferred from a dimension threshold. A Colossus can therefore be configured at microscopic, character-sized, 1 m, 20 m, 100 m, or much larger dimensions without losing its identity.

The profile stores three independent dimension axes in canonical metres for both the Colossus and the world envelope. The envelope is intentionally not required to contain the Colossus: a 1 m Petri-dish test world can present a 20 m or 100 m Colossus through later presentation/world-generation systems. The authored world-envelope multiplier may also be below 1, so procedural world generation can preserve this inverse relationship. This contract records those dimensions; it does not itself shrink the world, generate geometry, or create an infinite space.

Runtime resizing is a pure profile operation controlled by an explicit flag. It changes configured dimensions and configuration version while preserving reference identity and world-envelope dimensions. A separate adapter maps the configured comparison axis into the existing persistent scale-reference hierarchy node, so the hierarchy is extended rather than duplicated.

Generation metadata records authored, procedural, or hybrid mode, a stable string or numeric seed, and the explicit `mulberry32-v1` algorithm version. Procedural mode can sample independent width/height/depth ranges reproducibly; a height-only range preserves the authored width-to-height and depth-to-height proportions. Authored NPC/boss ratios, next-parent scale factor, world-envelope generation multiplier, and ordered reference-landmark ratios provide deterministic inputs for future world-map generation. The `generateColossusDimensions` function generates dimensions only; world-map topology, assets, placement, NPC/boss instantiation, and Colossus mesh generation remain downstream systems.

Validation accepts any finite positive representable metre value, including very small scientific-notation values, and imposes no minimum/maximum gameplay size. Zero, negative, non-finite, or underflowed-to-zero values are rejected. Physical growth, stage-relative scale, camera framing, and IGP presentation remain separate authorities.


A runnable authored 1 m × 1 m × 1 m starting profile is provided at `examples/experiments/big3r-colossus-profile-petri-dish.json`. It deliberately keeps the Colossus and world envelope separate so the same stable Colossus reference can later be resized to a micro or macro test scale without changing its identity.

A second example, `examples/experiments/big3r-colossus-profile-procedural-petri-dish.json`, demonstrates seeded independent dimension ranges for an approximately 100 m Colossus in a 1 m world envelope, including a 0.01 world-envelope multiplier.


## 19. Deterministic Colossus world-generation plan

The renderer-neutral `buildColossusWorldGenerationPlan` function turns a validated Colossus profile into a deterministic world-generation blueprint. The plan records the source profile revision, configuration version, seed, algorithm, world identity, resolved Colossus dimensions, and the independent explicit world-envelope dimensions.

For procedural profiles, the plan resolves Colossus dimensions through the profile's seeded generation algorithm. Hybrid profiles use seeded generated dimensions when ranges are present and otherwise preserve their authored dimensions. Authored profiles always retain their configured dimensions. This makes the blueprint reproducible for a given profile revision and prevents a procedural profile's placeholder dimensions from being mistaken for its generated result.

The blueprint emits scale templates for the configured NPC and boss height ratios, plus ordered world-landmark templates for every configured reference ratio. Ratios above 1 are valid and deliberately create references larger than the current Colossus; they are progression landmarks, not limits. It also emits a larger next-parent candidate linked to the current Colossus reference and a destination-world ID. That candidate is only a proposal: the existing scale-reference hierarchy is not promoted until a separate, explicit world-transition operation is requested.

The plan preserves explicit world-envelope dimensions as authoritative and reports both the actual envelope-height/Colossus-height ratio and the configured world-envelope multiplier. A mismatch is diagnostic metadata, not an automatic resize or rejection. This permits an authored 1 m world envelope around a procedurally generated 100 m Colossus while making the relationship visible and testable.

This plan does not instantiate geometry, place objects, populate NPCs/bosses, load assets, move the camera, apply IGP, modify growth state, or promote the hierarchy. It is a deterministic data blueprint for downstream world-generation and presentation adapters. Its tests cover procedural dimension resolution, stable output, scale templates, beyond-parent landmarks, next-parent proposals, and explicit envelope/multiplier mismatches.


## 20. Deterministic world spatial layout

The renderer-neutral `buildWorldSpatialLayoutPlan` function consumes a validated Colossus world-generation blueprint and an independent spatial-layout configuration. It emits stable placement identities, parent-reference relationships, world-space ground anchors, normalized X/Z coordinates, preserved dimensions, source-template provenance, and layout diagnostics.

The initial `radial-rings-mulberry32-v1` algorithm creates:
- one Colossus parent anchor at the world-envelope center;
- a configurable count of NPC placements on an inner ring;
- a configurable count of boss placements on a separate ring;
- one placement for each authored scale-landmark template on an outer ring;
- an optional transition-gate anchor connected to the proposed next-parent reference.

The layout seed is combined with the source generation ID and layout ID. Identical source plans and layout configurations therefore produce identical placement coordinates. Changing only the layout seed changes spatial positions without changing generated dimensions or scale ratios. Stable IDs derive from layout ID, Colossus reference identity, placement kind, and index.

Normalized horizontal coordinates use the world-envelope center as (0,0) and the envelope half-extents as 0.5. They are converted into canonical metre coordinates using the actual width and depth independently, so non-cubic envelopes are supported. The vertical anchor is currently ground-contact Y=0; vertical stacking and authored elevation are future layout features.

The planner intentionally preserves object dimensions even when they are much larger than the world envelope. It reports whether each footprint fits and whether any extent exceeds the envelope. Anchors are constrained to the envelope's normalized X/Z range, but object bounds may extend outside it. This is deliberate for Petri-dish micro-to-macro tests: placement must not silently shrink a Colossus, landmark, or transition gate to fit a small room.

A broad-phase X/Z AABB overlap diagnostic reports placement pairs whose horizontal footprints may overlap. It does not perform collision resolution, infer vertical separation, move objects, or decide whether overlap is desirable. For very large entities, overlap is expected and remains visible in the diagnostic output for a downstream scene/level authoring policy to interpret.

The layout contract does not instantiate geometry, select assets, generate collision, populate animation, modify growth state, promote the reference hierarchy, or change camera/IGP presentation. It is a deterministic placement blueprint. The current tests cover stable generation, identity and parent links, configurable population, seed variation, non-cubic envelope mapping, oversized dimensions, overlap diagnostics, and authority boundaries.


The example input is `examples/experiments/big3r-world-spatial-layout-petri-dish.json`. Its `layout` object matches the `WorldSpatialLayoutConfig` passed to the planner; `sourceProfilePath` identifies the profile used to build the upstream world-generation plan.
