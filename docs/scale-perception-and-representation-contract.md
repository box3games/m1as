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


## 21. Scale-aware environment relationships and response cues

The renderer-neutral `scale-environment-relationship-contract.ts` measures a subject against any authored environment or scale reference using world-space axis-aligned bounds in canonical metres. It does not assume the reference is a room or the subject is a humanoid. The same measurement can describe a player inside a room, a hand against a chamber, a character beside an NPC, a Colossus relative to a building, or a building relative to a world landmark.

The measurement records independent subject/reference width, height, and depth ratios; horizontal footprint occupancy; minimum Euclidean AABB clearance; per-axis clearance; per-axis penetration depth; containment; and a spatial state of separated, touching, overlapping, subject-contained, reference-contained, or coincident. The full input bounds are preserved as the source observation and are never clamped to the world envelope. This allows a micro-to-macro subject to exceed a 1 m Petri dish without losing its actual measurements.

`placementToWorldAabbMeters` converts a ground-contact spatial placement from the deterministic layout planner into an axis-aligned world-space box. It uses the placement's X/Z center, ground-contact Y, and explicit width/height/depth dimensions. Renderer adapters with rotated or deforming geometry should provide measured world-space bounds directly instead of relying on this axis-aligned placement helper.

Declarative environment-response rules can observe scale ratios, occupancy, clearance, and penetration metrics. A rule can request a visual cue, audio cue, interaction gate, transition request, destruction candidate, or camera cue. Threshold direction, priority, and optional release threshold are explicit. Hysteresis prevents a threshold response from rapidly toggling when a measured value oscillates near its entry threshold. The caller supplies previously active rule IDs so each evaluation reports entered, maintained, exited, or inactive state.

Response evaluation is intentionally not execution. It produces ordered requests only; a downstream adapter must separately validate capability, ownership, safety policy, and execution permission before applying effects. No physics, movement, destruction, growth, camera change, or presentation effect is performed here. In particular, a `destruction-candidate` is a signal for a later destruction/structural-integrity system, not an instruction to break an object.

All measurements carry sample ID, subject/reference identity, simulation time, configuration version, and growth-state ID. These provenance fields allow the same growth event to be compared across different references and presentation views. The tests include room containment, outgrowing the room, separation/touching/overlap, world-envelope escape, conversion from layout placements, micro-scale values, threshold hysteresis, ordered requests, and validation failures.


## 22. Portable environmental structural responses across BIG3R and VFXR

The renderer-neutral `environment-structural-response-contract.ts` consumes scale/environment relationship measurements plus optional structural signals from an authoritative physics or structural source. It emits portable, provenance-bearing response events. It does not calculate force, stress, strain, fracture, or damage from AABB overlap. Geometry-derived penetration and clearance remain explicitly labeled `relationship-derived`; solver signals retain measured/estimated/authored confidence and source identity. Missing structural data is `unavailable`, never silently interpreted as zero.

Structural signal metrics include stress ratio, strain ratio, damage ratio, contact duration, and impact energy. Each metric has an expected unit and validates source/confidence metadata. Declarative rules support thresholds, hysteresis, severity, priority, response channel, effect kind, optional target ID, and authored asset reference. Events preserve subject/reference IDs, growth-state ID, configuration version, simulation time, observation ID, and deterministic event ID.

The shared event model deliberately separates response intent from execution. Channels distinguish visual effects, audio effects, physics, structural-integrity evaluation, and world-transition evaluation. Effect kinds include contact/impact flashes, stress glow, crack overlays, fracture previews, dust/debris overlays, sprite sequences, WEBM overlays, procedural overlays, particle layers, audio cues, displacement requests, damage/failure evaluations, and transition candidates. These are extensible vocabulary values; declaring one does not claim that a renderer or physics engine implements it.

### BIG3R and VFXR interoperability

BIG3R is the live scene/evaluation consumer: it supplies geometry relationships and can attach authoritative solver signals when available. A BIG3R physics or structural adapter may consume `physics` and `structural-integrity` events without transferring that authority to the shared contract.

VFXR consumes the exact same structural response event through `VfxrStructuralResponseAdapter`, registered with the existing `PortableEvaluationRouter` under the `structural-response` domain. VFXR targets explicitly declare supported effect kinds and asset kinds, then receive the complete event. Targets can render 2D sprite sequences, WEBM overlays, effect presets, or procedural layers. VFXR does not need a 3D collider, mesh, or physics body to render a crack, dust burst, impact flash, or debris sequence. It also cannot claim physics, structural-integrity, or world-transition ownership.

The VFXR adapter requires a registered target ID and an authored asset reference. Missing target, unsupported effect kind, unsupported asset kind, and unsupported response channel are reported as unsupported; there is no silent fallback. Execution telemetry identifies the VFXR target, event, effect kind, asset, and pipeline. The adapter can clear a specific event by target and event ID. Actual sprite/WEBM decoding, animation timing, compositing, and export remain in the registered VFXR effect target and existing VFXR authoring/recording pipeline.

This shared boundary is the synergy point: one BIG3R observation/rule evaluation can fan out the same event identity to a BIG3R scene adapter, a VFXR 2D effect target, audio, or another capable consumer. Each consumer advertises and enforces its own capabilities; no consumer is assumed to exist merely because the event vocabulary supports it.

The tests cover structural-signal unit/provenance validation, unavailable solver inputs, geometry-only contact cues, hysteresis, stable event IDs, sprite/WEBM/procedural asset references, VFXR portable routing, missing capabilities, and authority boundaries.


## 23. Shared character volume and skeletal-pose bridge

The renderer-neutral `character-volume-pose-bridge-contract.ts` defines one subject-local or stage-world volume envelope with independent width, height, and depth in canonical metres. A pose request specifies an authored pose kind (standing, hunch, compressed/tucked/deep squat, seated V, crawl, or custom), per-axis envelope scale, optional exact joint targets, supported representations, and simulation/configuration/growth provenance.

The resulting plan preserves both the uncompressed reference envelope and the current source envelope. It calculates target dimensions and ratios against the reference envelope, then exposes consistent projection data for 2D, 2.5D, and 3D consumers. The 2D projection uses width and height while retaining depth in the shared source plan; 2.5D and 3D retain all three axes. This allows VFXR to author a 2D square/rectangle or sprite silhouette from the same envelope that BIG3R uses to evaluate a volumetric subject.

Joint targets are explicit authored IDs and channels; this contract does not guess bone names from a sprite or infer that every discovered bone is safe to deform. A 3D skeletal adapter may translate supported targets to a rig, a 2.5D adapter may map them to its plane/rig representation, and a VFXR adapter may consume the envelope and pose kind to author or render a 2D sequence. Each adapter must advertise its actual capabilities and report unsupported mappings rather than inventing depth or skeletal behavior.

Envelope compression is not actual growth reversal or a change to authoritative growth scale. The plan is declarative: it does not apply bone transforms, resize sprites, run physics, render animation, or mutate the character. This keeps growth state, pose, volume constraints, and presentation as distinct authorities. Tests cover axis-independent compression, shared 2D/2.5D/3D projections, 2D-only use without a skeleton, microscopic dimensions, identity checks, and invalid/duplicate joint targets.

The renderer capability vocabulary includes `viewport-normalized` coordinates so 2D VFXR layouts can explicitly describe their normalized output space without mislabeling it as a 3D world transform.


## 24. Character volume/pose dispatch adapters

`character-volume-pose-adapters.ts` provides two explicit dispatch boundaries over the shared declarative pose plan. `Big3rCharacterPoseAdapter` requires a valid discovered rig topology, exact rig identity, a 3D-capable plan, and explicit target approval for every requested joint/channel before submitting the plan to a BIG3R rig evaluation port. It does not directly mutate bones or claim that discovery alone grants deformation authority.

`VfxrCharacterPoseAdapter` submits the same plan to a registered VFXR authoring target when the plan declares 2D support and the target explicitly supports the requested pose kind. No skeleton is required for the 2D path. The target owns sprite layout, keyframe authoring, compositing, playback and export; this adapter does not claim those operations are implemented by the shared contract.

Both dispatch results preserve request ID, subject ID, target ID and pipeline identity. Unsupported representations, joints, channels, rig identities, or pose kinds are reported explicitly; no fallback mapping is invented. These are target-port interfaces, not automatic runtime connections: actual BIG3R rig and VFXR authoring implementations must be registered by their respective workflows.


## 25. Synchronized character pose transitions

`character-pose-transition-contract.ts` defines a renderer-neutral timed sequence of pose keyframes. Each keyframe contains an independently authored width/height/depth envelope, a pose kind, and explicit joint targets. Envelope interpolation and joint interpolation have separate easing modes (linear, smoothstep, ease-in, ease-out), allowing the invisible box to begin collapsing before skeletal joints settle, or the spine to hunch before the knees bend.

A transition preserves subject identity, transition ID, supported representations, configuration version, and growth-state ID. Sampling is deterministic for a given transition and elapsed simulation time. The sampler clamps at the transition duration and emits both envelope dimensions and interpolated joint channels for BIG3R, 2.5D, and VFXR consumers. All keyframes must preserve the same joint/channel set so the transition never invents a missing joint target or silently drops one halfway through.

The contract is declarative and does not execute animation, apply bone transforms, resize sprites, run physics, or modify actual growth scale. BIG3R rig and VFXR authoring adapters can consume samples through their existing target interfaces. A 2D-only sequence may carry no joint targets and still use the same timed envelope and pose-kind progression. Tests cover independent envelope/joint easing, completed sampling, provenance/authority preservation, and invalid keyframes.


## 26. BIG3R / VFXR pose-transition dispatch

`character-pose-transition-adapters.ts` provides independent adapters that sample the same deterministic transition at the supplied simulation time and dispatch the resulting sample to a registered BIG3R or VFXR target. BIG3R requires the registered rig identity to match the discovered rig identity and the target to explicitly approve the transition. VFXR requires declared 2D representation support and explicit target approval. Both receive the same transition ID, subject ID, elapsed time, normalized progress, envelope dimensions, joint targets, configuration version, and growth-state ID.

The adapters do not own a timer or animation clock; the caller supplies elapsed simulation time. This allows both pipelines to sample the same authoritative timeline rather than running independent clocks that drift. The adapters do not directly mutate bones, sprites, physics, growth scale, or render output. Registered targets remain responsible for their own execution and reporting. Unsupported representation or capability is returned explicitly without fallback. Tests verify same-sample parity, rig identity enforcement, representation mismatch, and target capability rejection.


## 27. 2.5D pose transition adapter and parity recipe

`character-pose-25d-transition-adapter.ts` adds an explicit 2.5D plane/rig dispatch boundary. It requires the transition to declare 2.5D support, the target's plane/rig identity to match discovered identity, and every authored joint/channel to be explicitly supported. It dispatches the same deterministic transition sample used by BIG3R 3D and VFXR 2D. The result preserves the explicit depth dimension; it does not infer depth from a 2D projection or claim to execute parallax unless the registered target does so.

The example `examples/experiments/big3r-vfxr-pose-transition-parity.json` defines a shared standing → spine hunch → compressed squat sequence. It provides common sample times for 2D, 2.5D, and 3D consumers, expected measurements, and acceptance criteria. It is an evaluation recipe, not a claim that render targets are already connected. The recipe requires identical envelope samples and provenance at each time offset, while allowing each renderer to produce its native output.

The 2D target retains width/height and treats depth as source metadata; 2.5D retains all three dimensions and must declare plane/parallax support; 3D evaluates authored joint targets against discovered rig capabilities. Actual growth scale, growth history, physics, and destruction remain outside the pose transition.


## 28. VFXR pose-sequence authoring target

`client/vfxr/pose-sequence-authoring-target.ts` provides a concrete VFXR-owned authoring target for the shared pose transition samples. It records ordered 2D authoring frames, normalized width/height envelope ratios, source depth metadata, and source joint targets for later sprite-sequence, WEBM, or procedural authoring. It preserves transition, subject, configuration, growth-state and full transition-duration provenance.

The target is independent of BIG3R runtime and does not render or mutate sprites. VFXR owns the sequence document and can export/read a defensive copy or clear it. Duplicate samples at the same simulation time are idempotent; conflicting samples are rejected. Pose-kind capability and stable provenance are validated. The shared sample now carries total transition duration so a first sample at time zero still records the correct complete sequence duration.

This is a real VFXR authoring data target, not yet a canvas renderer, keyframe editor, WEBM encoder, or automatic sprite deformation system. Those remain separate VFXR workflow integrations.


## 29. VFXR authenticated M1AS streamed sprite input

`client/vfxr/m1as-streamed-sprite-adapter.ts` accepts an M1AS asset metadata record, its signed stream URL, and the authenticated user ID. It uses the existing M1AS multi-MIME surface resolver and creates a VFXR-owned Three.js Sprite plus a `TwoDimensionalSpriteGrowthModel`. The stable M1AS asset ID is retained as the growth subject's asset identity; the expiring signed URL is transport only. Initial sprite dimensions are derived from resolved image/video dimensions and a configurable target height in metres.

Supported inputs are M1AS image streams, video streams (including WEBM), and GLB only when the caller explicitly requests the existing static GLB snapshot projection. A GLB snapshot is not a live animated GLB-to-sprite renderer. Unsupported media such as audio are rejected rather than silently converted. Assets explicitly marked `canStream: false` are rejected. If stream capability metadata is absent, the source is accepted but marked as capability-unspecified.

Each streamed subject gets its own authenticated `M1ASFaceSurfaceResolver`, preventing the global shared texture resolver from accidentally retaining a different user's authentication context. The resolver and managed texture are disposed with the VFXR subject. The 2D growth model now advertises the three M1AS asset kinds, so the existing deterministic sprite experiment runner accepts these streamed subjects without changing its scheduling or growth semantics.

This adapter is a concrete VFXR input path and growth-model subject factory. It does not yet add an asset-picker UI or live skeletal GLB projection. It reuses the M1AS signed-stream and texture infrastructure rather than creating a parallel asset transport.


## 30. Dedicated VFXR streamed-character workflow

`client/vfxr/vfxr-workflow-controller.ts` adds an independent VFXR panel to the M1AS content viewer. After public assets are loaded, it lists stream-eligible image, video, and GLB assets. Selecting one obtains a fresh authenticated signed URL from the existing M1AS API client, then uses the VFXR streamed-sprite adapter to resolve the asset into a VFXR-owned 2D subject. It retains the stable M1AS asset ID and authenticated resolver lifecycle. The preview runs independently of BIG3R's sandbox and does not mount or mutate its GLB.

The panel exposes direct 2D growth controls, scale/time telemetry, editable shared pose-transition JSON, VFXR pose-sequence authoring, and JSON export. Authoring binds the transition to the loaded M1AS subject ID and validates the shared transition contract before dispatching its keyframes to the VFXR authoring target. The shared transition can declare 2D, 2.5D and 3D representations, retaining the same envelope and joint-target semantics for later paired pipeline consumers.

The workflow's video preview uses a continuous renderer loop so streamed WEBM/video textures continue updating. It does not yet implement skeletal-to-sprite deformation, a timeline editor, automatic pose extraction from GLB animation clips, or WEBM export. GLB remains an explicit static snapshot source in this 2D workflow; the live skeletal bridge is a separate subsequent milestone. The existing BIG3R workspace and M1AS streamed GLB growth-recipe path remain separate and unchanged.
