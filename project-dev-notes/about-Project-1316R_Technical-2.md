# M1AS Viewer, BIG3R, VFXR & Growth Lab — Technical Overview

> This document describes the development viewer as a connected system: its purpose, intended architecture, current implementation, and known gaps. It complements [the page/control reference](./README.md), which inventories the controls declared by the HTML.

## 1. What this project is

The development viewer is an integration and evaluation harness for streamed M1AS assets and the systems built around them. It is not just an asset browser, and it is not one monolithic 3D editor.

It brings together several related but distinct responsibilities:

- **M1AS** supplies asset identity, public-asset discovery, previews, and authenticated/signed asset streams.
- **BIG3R** evaluates 3D character growth, spatial scale, posture, environmental constraints, camera presentation, and progression through nested environments.
- **VFXR** is the 2D/2.5D-facing character and pose workflow. Its intended role is to develop image-based characters and pose/movement data toward a bridge to volumetric character evaluation.
- **CCSA** provides a separate 3D stage and face-layer composition path for streamed content.
- **The Growth Lab** provides a place to exercise growth recipes against the active streamed GLB and to run a separate image-based sprite experiment.
- **The recorder** captures selected stage or procedural VFX output as WebM and can bind recorded effects back into supported stage workflows.

These responsibilities share asset identity and growth/evaluation concepts, but they do not all share one renderer or one fully unified authoring pipeline today.

## 2. Intended system direction

The larger goal is to evaluate perceived character growth as a relationship between the character, its body/posture, the surrounding world, and the observing camera—not merely as a larger object or a zoomed camera.

The system is intended to keep several measurements and behaviors distinguishable:

1. **Character growth** — the growth model's accumulated change to the subject.
2. **Stage-relative scale** — the subject's size in relation to containers, rooms, props, and other world references.
3. **Body shape and posture** — how the character's proportions and pose respond as growth and spatial constraints change.
4. **Camera presentation** — framing, perspective, observer position, and camera motion.
5. **Perceived scale** — the visual impression produced by the combined subject, environment, and camera relationship.

BIG3R is the primary 3D environment for testing these relationships. VFXR is intended to provide a 2D character workflow that can grow toward 2.5D rather than remaining an isolated sprite effect. CCSA and the recorder support composition and presentation tests around those systems.

The intended 2D-to-2.5D progression is important: an image-based character should ultimately be representable through structured body/limb relationships and X/Y transforms, with pivots or anchors, pose and movement data, and growth behavior. That representation is intended to become a bridge toward a volumetric or cube-based character representation, where the same character state can be evaluated with depth and posture in a 3D environment. The current implementation has foundations for this direction, but it is not yet a completed articulated 2.5D character system.

## 3. Runtime composition and entry points

The visible page is assembled from both static HTML and runtime-created UI.

### Static page

`dev/m1as-content-viewer.html` declares the main page and its primary work areas:

1. WebM VFX & CCSA Composition Recorder
2. BIG3R Growth, Cinema & Spatial Progression Sandbox
3. Team Scratchpad
4. Composable Component Simulation Area
5. M1AS Asset Browser

The page references `m1as-viewer.css` and `m1as-viewer.js`. The source TypeScript entry point is `client/viewer/main.ts`.

### Runtime-created work areas

The TypeScript entry point creates controllers and inserts additional workspaces at runtime:

- `VfxrWorkflowController` inserts **VFXR · 2D Growth & Pose Authoring** after the asset-list host.
- `Big3rSandboxController` creates a **Character Growth Lab** after the BIG3R stage container.
- BIG3R also creates growth-model and experiment controls as part of its sandbox lifecycle.

This means the complete development interface cannot be understood by reading the HTML alone. The HTML describes the initial page structure; the controllers create additional UI and connect it to the engines and adapters.

There is no basis in the current source for describing this page as a generic left/center/right editor with an inspector or timeline. Those are not the layout or controls documented here.

## 4. M1AS asset access and identity

**Main implementation:** `client/viewer/main.ts`, `client/viewer/m1as-api.ts`, `client/viewer/types.ts`

The asset browser is the entry point for streamed content:

- Requests the public asset list through `M1asApiClient`.
- Displays asset metadata and supported actions.
- Requests signed URLs for assets that are streamed into the other workspaces.
- Supports preview, stream, URL signing/copying, GLB loading, prop loading, WebM VFX assignment, and supported CCSA face/background assignment.

The stable M1AS asset ID is significant. VFXR carries the asset ID into its streamed subject record rather than treating the stream as an anonymous image. BIG3R receives the asset identity when a GLB is launched from an asset card. Signed URLs are access mechanisms for loading the asset; they are not a replacement for the stable asset identity.

The asset browser filters and labels actions according to asset MIME type and the capabilities returned with the asset. A GLB can be launched as the primary BIG3R subject or added as a spatial prop. A WebM can be assigned as a growth VFX overlay. Streamable image, video, audio, and other supported content can be directed into the applicable CCSA composition path.

## 5. BIG3R — 3D growth, cinema, and spatial evaluation

**Main implementation:**
- `client/viewer/big3r-sandbox.ts`
- `client/M1ASVFXEngine.ts`
- `client/GrowthEventQueue.ts`
- `client/big3r/Big3rStageCoordinator.ts`
- `client/big3r/LevelOrchestrator.ts`
- `client/big3r/MapEngine.ts`
- `client/big3r/camera/CameraRig5Mode.ts`
- `client/big3r/scale/GrowthCurveStateMachine.ts`
- `client/big3r/scale/ScaleRebaseController.ts`

BIG3R is the 3D evaluation environment. It mounts a streamed GLB as the primary subject and provides controls for growth stimuli, spatial constraints, camera behavior, room composition, and reference props.

### Growth input and stimulus

The page exposes four growth input modes:

- Click/tap impulse
- Rapid mash cascade
- Hold-to-charge surge
- Delayed colossal/chaos mode

Stimulus categories include consumption, exercise, buff/growth tool, and environmental surge. These are routed into the active growth engine; the visible control labels are not themselves a separate growth model.

The sandbox also exposes a model comparison path between the existing M1AS VFX growth behavior and a baseline whole-object scale model. The baseline is a comparison/control model, not a replacement for the M1AS character-response path. The M1AS VFX adapter retains the existing engine queue and its timing/response behavior.

### Nested environment and spatial references

The nested environment presets represent increasingly large spatial constraints, from a broken jar and sewer pipes through a lab tank/viewing room and an exterior street scale. The ceiling can also be adjusted directly.

Scene props can be streamed as GLBs and assigned roles such as consumable, wearable/growth suit, container, growth gate, or scale reference. These roles provide contextual thresholds and reference geometry for spatial evaluation.

### Room surfaces and camera

The CCSA room-slot controls allow a backdrop or one of six cube faces to receive a color or supported streamed content. Room presets can be imported/exported. The sandbox also exposes camera rig choices, a four-face inspection TV, and JSON level-manifest loading.

Camera controls include direction/trajectory/morphology options in the recorder's BIG3R camera workflow, root-anchor X/Y settings, camera angle, framing mode, orbit/pan/zoom interaction, saved camera configurations, and camera-motion takes.

### Telemetry and capture

The BIG3R stage exposes height/streaming status and growth telemetry, including tier, scale, posture, and Golden Buffer readouts.

The implementation also includes structured experiment capture. The experiment recorder is designed to observe and append records without advancing the simulation or mutating the growth queue. IndexedDB is used for structured experiment persistence; browser local storage is used for bounded diagnostics and settings, not as the experiment database.

## 6. Growth Lab — GLB recipes and the separate sprite experiment

**Main implementation:** `client/viewer/two-dimensional-sprite-lab.ts`, connected by `Big3rSandboxController`

The Character Growth Lab is dynamically inserted after the BIG3R stage container. Despite the historical filename `two-dimensional-sprite-lab.ts`, it contains two distinct work areas.

### 6.1 Master growth recipe workspace (active GLB)

The primary workspace operates on the **same authenticated GLB already mounted in BIG3R**. It does not fetch or render a duplicate subject.

It provides:

- Active GLB identity/status.
- A master growth recipe JSON editor.
- Load Recipe from a JSON file.
- Schedule on GLB.
- Save Recipe JSON.

The recipe format identifies the currently mounted M1AS GLB as its subject and selects the M1AS VFX queue with simulation-time offsets. Commands can be scheduled with `atSeconds` offsets against the engine simulation clock. The example recipe includes discrete growth commands with typed relative-change amounts and stimulus labels.

The sandbox validates and schedules the recipe through its growth execution path. The UI is a recipe authoring/scheduling surface; it is not a second character renderer.

### 6.2 Optional 2D sprite adapter experiment

The second workspace is explicitly labelled **Optional 2D Sprite Adapter Test**. It accepts:

- A local PNG, JPEG, or WebP character image.
- An experiment JSON configuration.
- Play, Pause, Step, Reset, and Export Telemetry actions.

It creates a Three.js `Sprite` with a transparent material and runs a `TwoDimensionalSpriteExperimentRunner` using a `TwoDimensionalSpriteGrowthModel`. The selected image's aspect ratio is preserved when the sprite's initial dimensions are derived.

The experiment configuration has a versioned schema and includes a subject, duration, timestep, timed events, and optional biological-breathing settings. Events can carry growth commands or breathing activation changes. The runner validates configuration and commands, advances the experiment on simulation time, and produces time-stamped telemetry samples and command results.

This is a useful deterministic test surface for image-based growth behavior. It should not be mistaken for an articulated character editor: the current sprite growth adapter scales the sprite uniformly in X/Y, preserves image aspect ratio, and reports that it does not support regional growth, mesh deformation, or skeletal deformation.

## 7. VFXR — 2D streamed character growth and pose authoring

**Main implementation:**
- `client/vfxr/vfxr-workflow-controller.ts`
- `client/vfxr/m1as-streamed-sprite-adapter.ts`
- `client/vfxr/pose-sequence-authoring-target.ts`
- `client/evaluation/character-pose-transition-contract.ts`
- `client/evaluation/character-pose-transition-adapters.ts`

VFXR is a dedicated workflow separate from BIG3R's sandbox lifecycle and renderer. It selects an authenticated M1AS image, video/WebM, or GLB snapshot stream, preserves the M1AS asset identity, and presents a 2D streamed subject.

Its current visible controls provide:

- M1AS streamed asset selection.
- Target height in metres.
- Load M1AS stream.
- Grow +25%.
- Advance 1 second.
- Reset growth.
- Shared pose-transition JSON.
- Author VFXR pose sequence.
- Export sequence JSON.

The current manual growth action sends a relative +25% growth command to the streamed sprite growth model and advances the model. Telemetry reports the M1AS asset identity, source kind, current scale, and elapsed simulation time.

### Pose authoring behavior

The pose workflow parses and validates a shared pose-transition document, assigns the active subject identity, and dispatches the document's keyframe samples through a pose-transition adapter into a pose-sequence authoring target. The resulting document can be exported as JSON.

The default example describes a standing-to-compressed-squat transition and the supported pose-kind list includes standing, hunch, squat variants, seated, crawl, and custom. The transition contract can describe 2D, 2.5D, and 3D representations.

**Important current limitation:** authoring and exporting pose data is not the same as rendering that pose on the sprite. The controller itself reports that sprite deformation and WebM rendering are separate production steps. The current VFXR preview does not implement articulated limb transforms, joint-driven sprite deformation, pose playback, or a completed 2.5D volume bridge.

## 8. The intended 2D → 2.5D bridge, and what exists today

The 2D work is intended as a stepping stone toward 2.5D character evaluation, not merely a decorative sprite preview.

### Intended direction

The intended character representation should be able to carry more than a single image scale:

- A character image and layered visual components.
- A wire-form or skeletal hierarchy for body regions and limbs.
- X/Y limb transforms and meaningful pivots/anchors.
- Parent/child relationships and pose definitions.
- Time-based movement and growth data represented in JSON.
- Growth behavior that can be evaluated alongside posture and spatial constraints.
- A path from 2D pose/body data into a volumetric or cube-based 2.5D representation.
- Recordable playback/output once the presentation path is implemented.

The purpose of that bridge is to retain a consistent character/growth description as evaluation moves from a flat image to a representation with depth and then into the 3D environment.

### Current foundations

The repository contains growth-model contracts and adapters, a 2D sprite growth model and experiment runner, M1AS streamed-sprite loading, pose-transition contracts/adapters, a pose-sequence authoring target, and a 2.5D pose-transition adapter/bridge contract.

These are architectural and execution foundations. Their presence does not mean the complete visual bridge has been delivered.

### Not yet implemented as an end-to-end feature

The current implementation does not demonstrate:

- A multi-part articulated 2D rig with working limb pivots and X/Y transforms.
- Visible joint-driven pose deformation of the sprite.
- Pose-sequence playback on the rendered 2D character.
- A working skeleton-to-volume or cube-based 2.5D character conversion.
- A shared live pose/deformation evaluator that visibly drives both VFXR and BIG3R.
- A unified VFXR animation-to-WebM authoring/export workflow.

These should remain identified as intended development work, not described as existing controls or completed capabilities.

## 9. CCSA — 3D stage and face-layer composition

**Main implementation:** `client/viewer/ccsa-stage.ts`, `client/M1ASFaceLayerEngine.ts`, `client/M1ASFaceSurfaceResolver.ts`

CCSA is a separate 3D stage and face-layer composition path. It can render a streamed component instance and apply supported assets to a scene background or one of the six cube faces. It also supports click-triggered VFX binding.

The room-slot workflow in BIG3R exposes a related face-oriented composition surface, but CCSA remains a distinct stage/controller path in the application wiring. The recorder can obtain the CCSA canvas, toggle its transparent background, and bind a recorded WebM to the CCSA click-VFX workflow.

## 10. WebM VFX and composition recorder

**Main implementation:** `client/viewer/vfx-recorder.ts` and `client/viewer/Proceedural-vfx.ts`

The recorder is wired to both BIG3R and CCSA canvases and can also render procedural VFX sources. Its source choices include the live BIG3R sandbox, the live CCSA stage, procedural tube growth, growth surge, colossal burst, gate shatter/dust, magic smoke, lightning, 2D metaball fluid, goo/jelly pour, and spinning coin/skull effects.

The recorder supports:

- Loading and clearing a signed image/video backdrop.
- Transparent-foreground or flattened-backdrop-plus-foreground output.
- Transparent-background selection.
- VP9 WebM recording, preview, and download.
- Recording metadata JSON for the supported metadata path.
- Binding a recorded WebM to the active GLB click effect or BIG3R growth VFX.
- BIG3R recording camera direction, trajectory, morphology, anchor, angle, framing, saved camera presets, and camera-motion takes.

The existence of procedural 2D effects and a 2D sprite experiment does not mean VFXR character animation can already be recorded. The recorder's current integration is with the BIG3R and CCSA canvases and its own procedural VFX sources.

## 11. Grow Time and growth-model architecture

**Main implementation:**
- `client/growth/model-contract.ts`
- `client/growth/model-adapters.ts`
- `client/growth/grow-time.ts`
- `client/GrowthEventQueue.ts`

The growth-model contract separates common commands and telemetry from model-specific execution. Implementations include a baseline Three.js object-scale model, the M1AS VFX engine adapter, and the 2D sprite scale model.

Grow Time is a deterministic resource controller that uses the authoritative simulation clock. It tracks earned stack points, available reserve seconds, active growth time, phase, clock state, and flow multiplier. The browser sandbox exposes A (press), B (hold), and R (rest/grow) inputs. Conversion can be continuous, restricted to configured sources, or disabled. Duration and chaos consumption policies are supported; chaos receives an injected random sample so a run can be replayed from the same inputs.

For the M1AS VFX path, sustained Grow Time supply feeds the existing queue's spring target rather than enqueueing a new discrete event every frame. The queue retains ownership of its spring/damping and character-response behavior. The baseline scale model is a comparison path; the current sandbox Grow Time flow integration is tied to M1AS VFX mode.

Durable Grow Time values are persisted through a versioned local-storage snapshot. Active timers/events are not resumed after a page reload.

## 12. Experiment capture and diagnostics

**Main implementation:** `client/experiments/`

The experiment subsystem provides versioned contracts, validation, capture profiles, a coordinator, an append-only recorder, IndexedDB storage, and adapters for character presentation, camera perspective, and scale/perception observations.

The recorder is observational: it records structured events and samples but does not tick the simulation, mutate the growth queue, or control cameras. Storage errors are reported through a separate capture-error path so capture failures do not become simulation commands.

The browser diagnostic logger uses a bounded local-storage ring buffer for recent diagnostics. IndexedDB is the persistent store for structured experiment records. These storage responsibilities are intentionally different.

## 13. Current implementation summary

| Area | Present in the current code | Important boundary |
|---|---|---|
| M1AS asset browser | Public asset listing, previews, signed streams, asset-card actions, stable asset IDs | Asset discovery and signing are not the same as a character authoring system |
| BIG3R | Streamed GLB stage, growth stimuli, model selection, nested environments, props, camera/room controls, telemetry | 3D evaluation path; not the VFXR 2D authoring surface |
| Character Growth Lab | Active-GLB growth recipe editor/scheduler; optional local-image sprite experiment; playback controls and telemetry | Sprite adapter is uniform whole-image scale, not articulated deformation |
| VFXR | Streamed 2D subject preview, scale growth, pose JSON validation/authoring/export | Pose data is authored/exported; it is not yet visibly played back or deformed on the sprite |
| 2.5D bridge | Pose/growth contracts and adapter foundations | No demonstrated end-to-end skeleton-to-volume character conversion |
| CCSA | Separate 3D stage, component rendering, face/background assignment, click VFX | Separate from the BIG3R stage lifecycle |
| Recorder | BIG3R/CCSA/procedural WebM capture, preview/download, supported binding and metadata | Does not currently provide a complete VFXR character-animation recording pipeline |
| Experiment system | Versioned records, validation, IndexedDB capture, diagnostics | Capture observes execution; it is not the simulation engine |

## 14. Source map

| Responsibility | Source files |
|---|---|
| Viewer composition and asset browser | `client/viewer/main.ts`, `client/viewer/m1as-api.ts`, `client/viewer/types.ts` |
| BIG3R sandbox and stage | `client/viewer/big3r-sandbox.ts`, `client/M1ASVFXEngine.ts`, `client/big3r/` |
| Growth models and Grow Time | `client/growth/`, `client/GrowthEventQueue.ts` |
| Character Growth Lab | `client/viewer/two-dimensional-sprite-lab.ts` |
| VFXR | `client/vfxr/`, `client/evaluation/character-pose-transition-contract.ts`, `client/evaluation/character-pose-transition-adapters.ts` |
| 2D sprite experiment | `client/growth/two-dimensional-sprite-growth-model.ts`, `client/growth/two-dimensional-sprite-experiment-runner.ts` |
| 2.5D pose bridge foundations | `client/evaluation/character-pose-25d-transition-adapter.ts`, related character-volume pose bridge contracts/adapters |
| CCSA | `client/viewer/ccsa-stage.ts`, `client/M1ASFaceLayerEngine.ts`, `client/M1ASFaceSurfaceResolver.ts` |
| WebM recorder and procedural VFX | `client/viewer/vfx-recorder.ts`, `client/viewer/Proceedural-vfx.ts` |
| Experiment capture | `client/experiments/` |
| Static viewer page and styles | `dev/m1as-content-viewer.html`, `client/viewer/styles.css` |

## 15. Reading this document correctly

This README distinguishes source-level implementation from intended system direction. A class, contract, adapter, schema, or UI control may exist without the complete visual behavior being implemented or verified.

The current state described here was established by inspecting the source on the active development branch. This documentation change does not claim that a browser build, runtime walkthrough, visual regression check, or full test suite was run. Where the document identifies a limitation, it is deliberate: the README should not turn a design goal or an architectural foundation into a claim that the finished feature already works.

For a concise inventory of the controls declared directly in the HTML, see [the viewer page README](./README.md).

## 16. Screen-by-screen operator and tester reference

This section describes the actual viewing surfaces and controls, including controls created dynamically by TypeScript. It is intended to let a tester identify what they are looking at, what a control changes, and which runtime path it exercises.

### 16.1 Recorder / procedural preview screen

**HTML section:** `.webm VFX & CCSA Composition Recorder`  
**Runtime controller:** `VfxRecorderController`  
**Render targets:** BIG3R canvas, CCSA canvas, or the recorder's own procedural canvas.

The recorder is both a capture utility and a procedural-preview host. The selected source determines which canvas is captured.

| Control | Function |
|---|---|
| Source selector (`recSourceMode`) | Selects BIG3R, CCSA, the 36-second BIG3R tube-ceiling POC, or one of the short procedural VFX clips |
| Backdrop URL (`recBackdropUrl`) | Accepts a signed M1AS image/video stream URL or supported direct image/video URL |
| Load M1AS Stream | Loads the backdrop; signed M1AS URLs are fetched with the M1AS user header and converted to a local Blob URL |
| Clear Backdrop | Stops/removes the backdrop and releases its object URL; foreground remains transparent |
| Output mode | For tube-ceiling capture, selects transparent foreground or flattened backdrop plus foreground |
| Recorded preview | Displays the most recently captured WebM |
| Download .webm | Downloads the last recording |
| Download Recording JSON | Downloads tube-ceiling recording metadata when that metadata exists; disabled otherwise |
| Bind to Active .glb Click | Assigns the last recording to CCSA's click-triggered VFX path; requires an active CCSA GLB |
| Bind to BIG3R Growth VFX | Assigns the last recording as the BIG3R growth/prop-break VFX overlay; requires an active BIG3R stage |
| Fluid Viscosity | Changes the viscosity parameter used by the metaball and goo procedural renderers; range 0–1 |
| Transparent BG (CCSA) | Toggles transparent background on the selected live BIG3R or CCSA canvas; for procedural capture the recorder canvas itself is alpha-capable |
| Start Recording (.webm) | Captures the selected target at a requested 60 FPS using VP9 when supported, otherwise WebM |
| Stop & Preview | Stops capture, creates the WebM preview, and enables download/binding actions |

**Source selector values currently represented in the page:**

| Source | What is captured |
|---|---|
| BIG3R Growth & Cinema Sandbox | The live BIG3R 3D stage canvas |
| Live CCSA 3D Stage | The live CCSA stage canvas |
| BIG3R — Procedural Tube Growth (36s) | The dedicated BIG3R tube-ceiling procedural animation described in §17 |
| Procedural Alpha VFX: Growth Surge (1.5s) | Short radial/particle growth burst |
| Procedural Alpha VFX: Colossal Burst (1.5s) | Short warm-colored burst/fireball effect |
| Procedural Alpha VFX: Gate Shatter & Dust (1.8s) | Short outward collapse/shatter and dust effect |
| Procedural Alpha VFX: Purple Magic Smoke (2.0s) | Additive particle smoke |
| Procedural Alpha VFX: Midpoint Lightning (2.0s) | Procedural branching lightning |
| Procedural Alpha VFX: 2D Metaball Fluid (2.0s) | Particle field thresholded into a connected fluid silhouette |
| Procedural Alpha VFX: Thick Goo / Jelly Pour (2.0s) | Higher-viscosity, more cohesive fluid-pour variant |
| Procedural Alpha VFX: Spinning M1 Coin (2.0s) | Procedural coin spin loop |
| Procedural Alpha VFX: Spinning Skull (2.0s) | Procedural stylized skull spin loop |

The short legacy effects are generated by `runProceduralVfxClip` or their dedicated Canvas renderer methods. They are independent short effects, not growth models. The source selection is important: choosing BIG3R captures a live 3D simulation; choosing a procedural source captures an animation generated by the recorder itself.

### 16.2 BIG3R stage viewing screen

**HTML section:** `BIG3R Growth, Cinema & Spatial Progression Sandbox`  
**Runtime controller:** `Big3rSandboxController`  
**Stage/engine:** `M1ASVFXEngine` plus BIG3R stage coordinators.

The stage is the primary 3D GLB evaluation viewport. It displays the mounted character, environment, room surfaces, spawned props, camera view, and stage-level effects. The telemetry region above it is separate from the rendered stage.

| Control | Function |
|---|---|
| GLB signed URL | Direct input for a signed GLB stream; asset-card launch is preferred when stable M1AS identity is required |
| Optional WebM VFX URL | Optional overlay clip URL for the active stage |
| Launch VFX Stage | Mounts the GLB and initializes the BIG3R stage/engine |
| Growth Mode | Selects click/tap impulse, rapid mash cascade, hold-to-charge, or delayed colossal/chaos input behavior |
| Stimulus | Selects Consumption, Exercise, Buff, or Environmental stimulus mapping |
| Queue Stimulus (Space) | Queues one growth stimulus; Space is the displayed keyboard shortcut |
| Hold Charge | Begins the hold-growth input; release behavior is handled by the controller's hold input lifecycle |
| Colossal Chaos | Invokes the delayed/chaos growth path |
| Reset | Resets growth state through the active engine |
| Nested Box Stage | Selects preset ceiling/environment tier: Broken Jar 1.6m, Sewer Pipes 2.4m, Lab Growth Tank 3.2m, Lab Viewing Room/Vent 5.0m, or Street/Cars/Houses 9.5m |
| Ceiling slider | Sets the ceiling height directly from 1.5m to 12.0m |
| Cinematic Low-Angle & FOV Kick | Enables/disables the cinematic camera presentation effect |
| Room Slot | Selects scene background or cube face 0–5 |
| Room Asset Type | Selects color, image, video, audio visualizer, SVG preview, or text/JSON input |
| Room value | Hex color or supported asset URL/content value |
| Paint Slot | Applies the selected content to the selected room slot |
| Double-Sided Room | Toggles double-sided room surface rendering |
| Export Preset / Import Preset | Exports or imports the room/stage preset JSON through a file picker |
| Camera Rig | Selects one of five BIG3R camera rigs: FreeExplore + HeightReticle; Obs1 Scale Observer; Obs2 4-Face TV Inspect; FirstPerson Eye Creep + Shake; Worms/BirdsEye + DynamicNearClip |
| Spawn 4-Face TV | Adds the four-face inspection TV reference object |
| Load Level Manifest (.json) | Loads a JSON level manifest into the stage |
| Add Scene .glb URL | Signed URL for a spatial prop |
| Prop Role | Sets role: consumable, wearable/growth suit, container, growth gate, or scale reference |
| Height | Target height in metres for the spawned prop |
| Spawn Prop | Adds the selected GLB as a scene prop |
| Respawn Broken | Recreates props that have entered a broken state |

**Viewing and telemetry elements:**

- **Height Reticle** — camera/stage overlay for height/scale observation; initially hidden until enabled by the relevant camera rig.
- **Streaming HUD** — reports stage/streaming state and runtime information.
- **TTL status** — reports signed-stream time-to-live state from the M1AS API client.
- **Growth telemetry badge** — displays tier, scale, posture, and Golden Buffer information.
- **BIG3R stage container** — actual 3D render surface. Its idle placeholder is replaced when a stage is mounted.

**Input note:** the page subtitle advertises WASD/arrow movement and clicking the GLB. Those are stage navigation/interaction inputs, not JSON recipe controls.

### 16.3 Character Growth Lab screen

**Runtime-created by:** `TwoDimensionalSpriteLab`  
**Inserted:** immediately after the BIG3R stage container.

This is a separate screen below the BIG3R stage and contains two different workspaces. Do not conflate the primary GLB recipe controls with the optional 2D sprite adapter.

#### A. Master growth recipe workspace — active BIG3R GLB

| Control | Function |
|---|---|
| Active subject label | Shows whether an M1AS GLB is mounted and displays its name, asset ID, and asset kind |
| Master growth recipe JSON | Editable recipe document consumed by the BIG3R growth-recipe scheduler |
| Load Recipe | Opens a local JSON recipe and places its text into the editor; it does not execute it |
| Schedule on GLB | Validates the JSON and schedules its commands against the currently mounted GLB's M1AS simulation clock |
| Save Recipe JSON | Downloads the current editor contents as a JSON file |
| Recipe status | Reports validation, scheduling, or execution errors and the number of scheduled commands |

The recipe workspace controls the already-mounted GLB. It does not create a second GLB viewer. Only one recipe may be pending at a time. The current execution path requires the M1AS VFX Growth model; it rejects a recipe if the baseline object-scaling model is selected.

#### B. Optional 2D Sprite Adapter Test

| Control | Function |
|---|---|
| Character image | Local PNG, JPEG, or WebP input |
| Experiment JSON | Local versioned 2D sprite experiment configuration |
| Load Experiment | Validates both files, loads the texture, preserves source aspect ratio, creates the sprite, and initializes the fixed-step runner |
| Play | Advances the experiment using animation-frame timing accumulated into configured simulation steps |
| Pause | Stops playback without resetting current experiment state |
| Step | Advances one deterministic runner step, respecting the next event boundary |
| Reset | Recreates the runner from the original configuration and image texture |
| Export Telemetry | Downloads the captured experiment samples and command results |
| Preview | Orthographic Three.js sprite view |
| Status and telemetry | Shows load/playback status and current model telemetry |

The 2D preview's current model is a whole-sprite scale adapter. It does not currently provide regional sprite growth, per-limb transforms, skeletal deformation, or mesh deformation. The experiment runner is deterministic with respect to its fixed-step schedule and ordered events; biological breathing also has a seeded/configurable parameter profile, but the current demo's profile does not make every renderer effect deterministic.

### 16.4 VFXR — 2D Growth & Pose Authoring screen

**Runtime-created by:** `VfxrWorkflowController`  
**Inserted:** after the M1AS asset-list host.

This is the dedicated streamed 2D/pose authoring surface, not the optional local-image experiment inside Character Growth Lab.

| Control | Function |
|---|---|
| M1AS streamed asset | Selects a supported authenticated M1AS image, video/WebM, or GLB snapshot asset |
| Target height (m) | Sets the target height passed to the streamed-sprite loader |
| Load M1AS stream | Requests the signed asset URL, loads the subject into the VFXR preview, and initializes the growth model while retaining M1AS asset ID |
| Grow +25% | Applies a discrete relative growth command of 0.25 (25%) to the active VFXR subject |
| Advance 1 second | Advances the VFXR simulation clock by one second |
| Reset growth | Resets the active VFXR growth model and elapsed time |
| Shared pose transition JSON | Editable pose-transition contract document |
| Author VFXR pose sequence | Parses/validates the transition, assigns the active subject ID, dispatches its keyframe samples, and creates an authoring document |
| Export sequence JSON | Exports the authored pose sequence document; it does not export rendered sprite animation |
| Preview | Orthographic Three.js streamed-sprite preview |
| Telemetry | Reports source asset ID/kind, current scale, and elapsed time |
| Status | Reports loading, pose validation, authoring, and export outcomes |

The default transition contains two keyframes: neutral standing at 0 seconds and compressed squat at 1 second. Its keyframes carry an envelope (width, height, depth), pose kind, interpolation modes, and joint-target arrays. The default example's joint-target arrays are empty. The contract supports 2D, 2.5D, and 3D representation labels; that does not mean the current VFXR sprite renderer implements all three visual representations.

### 16.5 CCSA / Composable Component Simulation screen

**Runtime controller:** `CcsaStageController`  
**HTML areas:** `#viewer`, `#streamUrlInput`, `#componentStage`.

The CCSA stage is distinct from the BIG3R stage. It is used to render a streamed component instance and inspect face-layer composition.

| Control | Function |
|---|---|
| Stream on an asset card | Signs the selected asset and routes the stream to the CCSA component/stage path |
| Sign URL | Requests a signed URL and copies it to the clipboard |
| Preview | Loads the asset's preview document into the viewer preview iframe when supported |
| Paint Face / BG selector | Selects scene background or one of six cube faces; the click-VFX option binds an effect to mesh clicks |
| Signed stream URL | Allows a signed stream URL to be supplied directly |
| Render Component | Renders the supplied signed stream in the component stage |

The asset-card face assignment path requires an active CCSA GLB stage. Supported face content is selected based on asset MIME/capability; a GLB may be assigned as a snapshot projection. The page's component stage and BIG3R stage are separate viewing surfaces.

### 16.6 M1AS Asset Browser

| Control | Function |
|---|---|
| Load Public Assets | Fetches the public asset list and refreshes the asset cards |
| Preview | Opens the supported preview payload in the viewer preview area |
| Stream | Signs and streams the selected asset into the CCSA/component stage |
| Sign URL | Creates and copies a signed URL; the card displays the current signed URL |
| Load GLB · Growth Lab / VFX Stage | Mounts a GLB as the primary BIG3R character and associates its M1AS asset identity with the Growth Lab |
| + Prop | Loads the GLB signed URL into BIG3R's prop input and spawns it when a stage is active |
| Set Growth VFX | Assigns a WebM asset as the active BIG3R growth VFX overlay |
| Paint Face / BG | Assigns supported streamed content to CCSA scene background, cube face, or click-VFX target |

Cards are generated from API results. Their actions depend on MIME type and the asset's declared `canPreview` / `canStream` capabilities; not every card necessarily has every action.

### 16.7 Team Scratchpad

| Button/control | Function |
|---|---|
| Notes textarea | Stores free-form team notes in browser local storage on input |
| Save | Explicitly writes the current text to the `m1as_team_notes` local-storage key |
| Copy | Copies the textarea contents to the clipboard |
| Clear | Confirms, clears the textarea, and removes the local-storage key |

The scratchpad is browser-local and is not a shared server-side team notes system.

## 17. BIG3R Tube-Ceiling Growth — 2.5D procedural proof of concept

**Implementation:** `client/viewer/Proceedural-vfx.ts`, `client/viewer/vfx-recorder.ts`  
**Source selector value:** `procedural-big3r-tube-ceiling`  
**Displayed source label:** `BIG3R — Procedural Tube Growth (36s)`

This is a distinct technical path and should not be grouped with the short generic procedural VFX clips.

### 17.1 What it is

Tube-ceiling growth is a specialized 36-second, time-driven procedural geometry animation rendered into a transparent 2D Canvas. It builds a tube-like surface from a fixed mesh topology, computes a changing growth profile along its length, projects the geometry through a configurable camera, depth-sorts surface quads, and shades them.

The source mesh uses 48 longitudinal rings and 28 sides. A separate pouch/rounded-volume mesh uses 12 latitude segments and 16 longitude segments. The renderer computes radial and axial growth, a root pulse, chamber-like surface modulation, a ridge, and a terminal crown. This is not a loaded GLB and does not deform an M1AS character mesh. It is a procedural geometry POC designed to test the visual language of continuous growth, shape change, trajectory, root anchoring, and camera presentation.

### 17.2 Why it matters to the 2D/2.5D work

The tube-ceiling POC explores how a 2D-rendered animation can communicate a volumetric, continuously deforming form without requiring a conventional full 3D character rig. It provides a concrete experimental path toward enhanced 2D/2.5D animation.

The broader intended application is not limited to one tube-shaped subject. The strategy could inform localized body-part or limb growth effects, region-specific shape envelopes, animated growth segments, and minigame mechanics that need a clear visual representation of growth or pressure in a particular region.

That is the design/POC rationale. The current renderer is still a specialized tube-and-pouch procedural animation. It is **not yet** a general body-part animation system, a limb rig, or a reusable regional-growth editor. The 2D sprite adapter also remains whole-sprite scale only. Those are separate next-stage capabilities.

### 17.3 Growth timeline and geometry

The tube renderer clamps normalized progress to 0–1 over 36 seconds. Its macro growth curve uses staged intervals:

- 0–22%: initial expansion to 0.10.
- 22–44%: expansion from 0.10 to 0.32.
- 44–68%: expansion from 0.32 to 0.65.
- 68–86%: expansion from 0.65 to 0.92.
- 86–100%: terminal expansion from 0.92 to 1.15.

Ten internal cycles modulate radial and axial expansion independently. Radial growth blends 28% toward the stepped-girth curve; axial growth blends 34% toward the stepped-length curve. A sinusoidal root pulse is applied within each cycle. The profile also changes by normalized tube position: root swell, chamber modulation, ridge, and crown.

The renderer is a custom Canvas projection pipeline:
1. Build tube and pouch vertex/face data.
2. Evaluate the growth profile at each tube vertex.
3. Apply the selected growth direction/trajectory and root anchor.
4. Project world-space points through yaw, pitch, camera distance, and FOV.
5. Create render quads and sort by average projected depth.
6. Shade and draw the visible surface quads.
7. Render each frame from the 36-second simulation progress.

### 17.4 Tube-ceiling controls

These controls appear when the tube-ceiling source is selected.

| Control | Values / range | Effect |
|---|---|---|
| Growth Direction | North/Up, South/Down, East/Right, West/Left | Rotates the canonical growth axis and its screen anchor orientation |
| Growth Trajectory | Legacy Cardinal; Forward/Inflate → Bend North | Selects the original cardinal path or the later continuous forward-to-north path |
| Morphology | Elongated Body; Compressed Crown | Changes terminal crown compression during the late forward-to-north phase |
| Root Anchor X/Y | -256 to +256 | Offsets the procedural growth root relative to the camera preset anchor |
| Camera Angle | Top Down, Ceiling, 45° Left, 45° Right | Selects camera preset anchor, yaw, pitch, distance, and FOV |
| Framing | Hybrid, Pullback, Locked | Selects how camera distance/pitch/FOV respond as the tube grows |
| Drag | Pointer drag | Orbits camera yaw/pitch |
| Shift + drag or right-drag | Pointer pan | Pans the camera |
| Mouse wheel | Wheel delta | Changes camera distance |
| Reset Camera | Button | Resets interactive camera offsets; selected angle/framing remain |
| Record Camera Motion | Button | Captures camera keyframes while the operator moves the camera |
| Stop Motion Take | Button | Stops keyframe capture; the take can be replayed during the next 36-second recording |
| Clear Motion | Button | Removes the captured camera-motion keyframes |
| Camera configuration name | Text | Names the current camera snapshot |
| Save Camera | Button | Saves the camera snapshot in browser local storage |
| Saved camera configurations | Select | Chooses a previously saved snapshot |
| Restore | Button | Restores the selected camera/trajectory/morphology/anchor/framing snapshot |
| Delete | Button | Deletes the selected saved camera configuration |

Camera motion keyframes are sampled with a minimum 24 ms spacing, then interpolated during the recording. Yaw interpolation uses the shortest angular delta. Saved camera presets use local-storage key `m1as.big3r.camera-presets.v1`.

### 17.5 Legacy Cardinal versus Forward / Inflate → Bend North

- **Legacy Cardinal (Original)** keeps the canonical tube axis and applies the selected cardinal direction as an orientation transform.
- **Forward / Inflate → Bend North** retains the earlier distributed bend through approximately 21 seconds, then blends toward a continuous root-pivoted shaft pitching toward North. The late-phase blend runs from approximately 21 to 33 seconds and reaches a 60-degree root pitch.
- **Elongated Body** uses a terminal compression factor of 0.12.
- **Compressed Crown** uses a stronger terminal compression factor of 0.28.

The latter trajectory/morphology settings affect the tube POC only. They are not the BIG3R GLB growth engine's skeleton or posture settings.

### 17.6 Preview and recording behavior

Selecting the tube-ceiling source starts a continuously looping preview. The preview is useful for camera adjustment; it loops the 36-second sequence.

Starting recording stops the preview loop, locks manual camera input, snapshots the selected camera/trajectory/morphology/anchor configuration, and records a single 36-second take. If a camera-motion take exists, it is applied during the recording. A normal completion is marked as completed; manually stopping marks the stop reason as user.

The tube-ceiling recording metadata schema is version 6 and includes:
- Output mode (foreground or composite).
- Recording ID, source identifier, start time, duration, completion state, and stop reason.
- Canvas width/height, requested frame rate, and MIME type.
- Growth direction, trajectory snapshot, morphology, and root anchor.
- Camera snapshot and camera-motion keyframes.
- Backdrop descriptor (none, URL, or M1AS signed asset identity).

The metadata is available through **Download Recording JSON** after a tube-ceiling recording. Short procedural VFX recordings do not produce this tube-specific metadata document.

## 18. Procedural VFX versus tube-ceiling growth versus character growth

These are three different strategies and should be tested/documented separately.

| Strategy | Technical method | Intended/test use | What it does not do |
|---|---|---|---|
| Short procedural VFX | Canvas 2D particle, path, threshold, and shape drawing; fixed short clips | Bursts, smoke, lightning, fluid/goo, coin/skull loops, impact and transition overlays | Does not represent persistent character scale, body anatomy, or a growth model |
| BIG3R tube-ceiling POC | Procedural tube/pouch surface geometry, time-varying radial/axial profile, perspective projection, camera and trajectory controls | 2.5D visual growth research; continuous shape/volume illusion; potential foundation for localized growth and limb/body-part effects | Not a loaded character, not a skeletal rig, and not currently a generalized per-limb growth system |
| Character growth models | GrowthModel commands and telemetry applied to a GLB engine or 2D sprite adapter | Persistent subject scale/growth state, timed commands, sustained supply, hold, telemetry and experiment capture | The current 2D sprite adapter is uniform scale; regional/skeletal behavior depends on the selected model's actual capabilities |

### Short procedural VFX implementation details

The advanced Canvas presets in `ProceduralVfxCanvas` include:

- **Magic smoke:** additive smoke particles spawned near the lower center, drifting upward with seeded oscillation, expanding and fading.
- **Lightning:** recursive midpoint displacement creates a branching/jagged bolt, rendered with glow and a bright core.
- **Metaball fluid:** particles fall, attract toward the center, overlap in an offscreen alpha field, then alpha-threshold into a connected silhouette.
- **Goo pour:** the fluid variant increases minimum viscosity, particle spawn count, particle size/cohesion, and floor pooling.
- **Spinning coin:** a 2D ellipse/face construction with cosine width and sinusoidal edge thickness for a looped spin.
- **Spinning skull:** a stylized skull silhouette with horizontal compression, yaw-like eye movement, and vertical bob.

The recorder also contains separate short particle clips:
- Growth Surge: green upward/radial particles and expanding rings.
- Colossal Burst: warm fireball-like rings and particles.
- Gate Shatter & Dust: outward particles and pale dust rings.

The generic short effects are typically 1.5–2.0 seconds (Gate Shatter & Dust is 1.8 seconds). Advanced presets other than tube-ceiling use a 2-second capture window. Viscosity materially affects the fluid and goo simulations; it is not a growth-rate control.

**Engineering distinction:** procedural VFX are presentation assets. They can be bound as overlays to BIG3R growth or CCSA click events, but binding an effect does not make that effect the authority for character growth. Tube-ceiling is also a procedural Canvas source, but its time-varying surface geometry and camera/trajectory model make it a separate POC with a different purpose.

## 19. JSON authoring reference

There are two different JSON systems in the Growth Lab. They have different schemas, clocks, validation rules, and execution targets.

### 19.1 Master GLB growth recipe: `m1as-growth-recipe/1.0`

**Example files:**
- `examples/experiments/m1as-streamed-glb-growth-recipe.json`
- `examples/experiments/m1as-streamed-glb-growth-master-test-recipe.json`

The recipe is scheduled against the active M1AS GLB's engine simulation clock. `atSeconds` values are offsets from the time the recipe is scheduled, not wall-clock timestamps and not offsets from page load.

Top-level fields:

| Key | Meaning |
|---|---|
| `schemaVersion` | Must be `m1as-growth-recipe/1.0` |
| `id` | Required unique/recognizable recipe identifier |
| `title` | Human-readable recipe name |
| `description` | Optional test purpose/coverage |
| `subject.assetKind` | Should match the active GLB subject |
| `subject.assetSource` | Normally `currently-mounted-m1as-stream` |
| `execution.model` | `m1as-vfx-queue` for this scheduler |
| `execution.mode` | `simulation_time_offsets` |
| `testCoverage` | Optional human-readable coverage list in example recipes |
| `runNotes` | Optional operator instructions in example recipes |
| `commands` | Required non-empty ordered command array |

Every command has:
- `atSeconds`: finite, non-negative, non-decreasing simulation-time offset.
- `commandId`: required unique ID within the recipe.
- `kind`: `discrete`, `flow`, or `hold`.

**Discrete command:**

```json
{
  "atSeconds": 3,
  "kind": "discrete",
  "commandId": "growth-buff-01",
  "stimulus": "Buff",
  "amount": { "kind": "relative_change", "fraction": 0.25 }
}
```

- `stimulus`: string mapped by the M1AS adapter. Recognized values include Consumption, Buff, Exercise, Environmental, NPCInfluence, and ToolActivation. Unknown/default values map to Consumption in the adapter.
- `amount.kind = relative_change`: `fraction` is a non-negative proportional change. `0.25` requests +25% relative to the projected target scale, not +0.25 metres.
- `amount.kind = absolute_target`: `scale` is a positive target scale.
- `parameters`: optional object whose values must be scalar number/string/boolean. The recipe scheduler forwards these to the growth command/engine profile. Their meaning is parameter/profile-specific; do not assume arbitrary parameter names alter growth unless the selected engine path reads them.
- `requestedDurationSeconds`: **not accepted by the active GLB recipe scheduler**. The legacy M1AS queue owns its transition timing. Use `atSeconds` to choose when a command is submitted.

**Flow command:**

```json
{
  "atSeconds": 10,
  "kind": "flow",
  "commandId": "sustained-feed-01",
  "stimulus": "Buff",
  "supplySeconds": 3,
  "flowMultiplier": 2,
  "parameters": { "growthPerSupplySecond": 0.1 }
}
```

- `supplySeconds`: positive duration of supplied growth resource.
- `flowMultiplier`: positive supply-rate multiplier; 1 is nominal, 0.5 is half-rate, 2 is double-rate.
- `parameters.growthPerSupplySecond`: the explicit per-supply-second rate used by the model adapter/flow path (default is 0.1 where omitted in the adapters).
- `stimulus`: optional; defaults to Buff in the recipe scheduler.

**Hold command:**

```json
{
  "atSeconds": 15,
  "kind": "hold",
  "commandId": "hold-start",
  "stimulus": "Buff",
  "active": true
}
```

A matching command with `active: false` releases the hold. The command pair's timing determines hold duration. The M1AS VFX engine owns hold-growth behavior. The baseline and 2D sprite adapters have their own hold handling and must not be assumed to produce identical results.

**Recipe scheduling constraints:**

- A recipe requires a mounted GLB loaded from the M1AS asset list with stable asset identity.
- The active model must be **M1AS VFX Growth**; the scheduler rejects Baseline GLB Scaling.
- The recipe must have the expected schema version, an ID, and at least one command.
- Commands must be ordered by non-decreasing `atSeconds`, and IDs must be unique.
- Only one recipe can be pending at a time.
- Recipe commands are submitted when the engine simulation clock reaches each offset.
- Scheduling a recipe does not reset the character, switch models, or automatically invoke the separate biological-breathing UI controls.
- The master test recipe deliberately covers absolute/relative growth, six stimulus mappings, slow/nominal/fast flow, hold/release, and increasing stress increments through a final +100% relative-change command. Review its `runNotes` before using it on a test subject.

### 19.2 2D sprite experiment JSON: schema version 1

**Example:** `examples/experiments/2d-sprite-growth-breathing-demo.json`

This JSON is loaded together with a local PNG/JPEG/WebP image into the Optional 2D Sprite Adapter Test. It is not the master GLB recipe format.

Top-level keys:

| Key | Meaning |
|---|---|
| `schemaVersion` | Must be integer `1` |
| `experimentId` | Required experiment identifier |
| `configurationVersion` | Required configuration/version label |
| `subject` | Subject identity, asset metadata, dimensions, and world unit |
| `durationSeconds` | Positive total simulation duration |
| `timestepSeconds` | Positive fixed-step size; smaller values increase simulation/sample frequency and processing |
| `events` | Ordered array of timed growth or breathing actions |
| `biologicalBreathing` | Optional breathing enable flag and profile parameters |

Subject keys:
- `subjectId`: experiment-local subject ID.
- `assetId`: subject asset identifier; on local-image load the selected file name becomes the displayed asset ID.
- `assetKind`: must match the selected image extension normalized to `png`, `jpeg`, or `webp`.
- `initialDimensions.x`, `y`, `z`: positive X/Y and non-negative Z dimensions. The loader recalculates X from the actual image aspect ratio using Y as the height.
- `worldUnit`: non-empty unit label, normally `m`.

Event format:

```json
{
  "atSeconds": 5,
  "action": {
    "kind": "growth",
    "command": {
      "kind": "flow",
      "commandId": "sprite-flow-01",
      "flowMultiplier": 1,
      "supplySeconds": 3,
      "parameters": { "growthPerSupplySecond": 0.08 }
    }
  }
}
```

Event rules:
- `atSeconds` must be between zero and `durationSeconds`.
- Events must be ordered by non-decreasing simulation time.
- Growth command IDs must be unique.
- A growth action contains one of the supported growth command kinds: `discrete`, `flow`, or `hold`.
- A breathing action is `{ "kind": "breathing", "active": true|false }` and requires `biologicalBreathing.enabled = true`.

2D growth command fields:
- **Discrete:** `amount.kind` is `relative_change` with non-negative `fraction`, or `absolute_target` with positive `scale`. Optional `requestedDurationSeconds` is non-negative and controls interpolation duration in this sprite model. This differs from the active GLB recipe path, which rejects that field.
- **Flow:** `flowMultiplier` and `supplySeconds` must be finite and non-negative. Optional `parameters.growthPerSupplySecond` controls the sprite adapter's supply rate; default is 0.1.
- **Hold:** `active` is boolean. On release, optional `parameters.growthPerHoldSecond` sets growth per held simulation second; default is 0.25.
- **parameters:** values may be number, string, or boolean. Only parameters consumed by the selected model have an execution effect.

### 19.3 Biological breathing profile parameters

The optional `biologicalBreathing.profile` is merged with defaults in `client/growth/biological-breathing.ts`.

| Parameter | Default in implementation | Meaning |
|---|---:|---|
| `initialScale` | 1 | Starting accumulated scale |
| `growthMultiplierPerCycle` | 1.08 | Actual scale multiplier at each completed cycle; must be at least 1 |
| `baseCycleDurationSeconds` | 1 | Duration of the first cycle |
| `durationMultiplierPerCycle` | 1.25 | Multiplier applied to cycle duration for each next cycle; must be at least 1 |
| `inhaleFraction` | 0.35 | Fraction of cycle assigned to inhale |
| `holdFraction` | 0.30 | Fraction assigned to hold; release receives the remainder |
| `growthEnvelopeExponent` | 1 | Shapes the actual growth envelope during inhale |
| `visualPulseExponent` | 1 | Shapes the visual expansion/release envelope |
| `pressureMultiplierPerCycle` | 1.2 | Multiplier for internal pressure per cycle; must be at least 1 |
| `basePressure` | 1 | Initial pressure baseline |
| `waveResponseWeight` | 0.35 | Scales the oscillating pressure-wave contribution |
| `waveCyclesPerSecond` | 1.5 | Pressure-wave oscillation frequency |

The implementation deliberately separates accumulated scale from temporary visual expansion and pressure. Visual pulsing is not itself the authoritative scale increase. The model adapter receives actual growth delta and a separate visual multiplier/pressure-wave presentation state.

**Example profile:**

```json
{
  "biologicalBreathing": {
    "enabled": true,
    "profile": {
      "initialScale": 1,
      "growthMultiplierPerCycle": 1.08,
      "baseCycleDurationSeconds": 2,
      "durationMultiplierPerCycle": 1.15,
      "inhaleFraction": 0.35,
      "holdFraction": 0.3,
      "growthEnvelopeExponent": 1,
      "visualPulseExponent": 1,
      "pressureMultiplierPerCycle": 1.2,
      "basePressure": 1,
      "waveResponseWeight": 0.35,
      "waveCyclesPerSecond": 1.5
    }
  }
}
```

Validation requires positive scale/duration/multiplier values; growth, duration, and pressure multipliers must be at least 1. Inhale and hold fractions must be positive and sum to less than 1. Envelope exponents must be positive. Pressure and wave values must be non-negative.

## 20. Test planning: which surface should be used?

| Test question | Use this surface | Why |
|---|---|---|
| Does an authenticated asset load and preserve M1AS identity? | M1AS Asset Browser → VFXR or BIG3R | Exercises signing, stream loading, and identity handoff |
| Does the GLB growth queue respond to timed commands? | Character Growth Lab → Master growth recipe | Schedules discrete/flow/hold commands against the active engine clock |
| How do recipe offsets, stimulus mappings, and flow multipliers behave? | Master GLB test recipe | Provides staged command coverage and explicit run notes |
| Does a 2D image preserve aspect ratio and respond to deterministic growth events? | Optional 2D Sprite Adapter Test | Uses a local image, schema-validated config, fixed-step runner, and telemetry |
| How do inhale/hold/release, cycle duration, pressure, and pulse settings affect the 2D adapter? | 2D experiment JSON with biologicalBreathing profile | Exercises the biological profile adapter |
| Can a streamed 2D subject accept pose-transition documents? | VFXR | Tests transition validation, keyframe dispatch, authoring document, and JSON export |
| Can the system demonstrate a continuous volumetric-looking growth animation without a GLB rig? | Recorder → BIG3R — Procedural Tube Growth (36s) | Exercises the dedicated tube-ceiling geometry/camera POC |
| Can a burst, smoke, lightning, fluid, or goo effect be captured as an overlay? | Recorder → short procedural VFX source | Exercises independent procedural presentation effects |
| Does a live 3D subject interact with the nested world and props? | BIG3R stage | Tests spatial constraints, camera, prop roles, and growth behavior |
| Can a recorded WebM be reused as a stage effect? | Recorder bind actions | Tests CCSA click-VFX or BIG3R growth-VFX binding |
| Can structured runs be captured for later inspection? | BIG3R experiment capture controls | Uses capture profiles and IndexedDB-backed experiment records |

## 21. Engineering cautions and known boundaries

- **Do not equate a procedural animation with a growth model.** A procedural clip may depict growth but does not own the character's persistent scale or queue state.
- **Do not equate the tube-ceiling POC with the BIG3R GLB stage.** The former is a custom Canvas projection of procedural geometry; the latter is a live 3D engine and streamed GLB.
- **Do not equate the two JSON formats.** The master GLB recipe uses `m1as-growth-recipe/1.0` and engine-clock offsets; the local sprite experiment uses integer schema version 1, fixed timestep, duration, and an event list.
- **Do not assume every scalar in `parameters` is meaningful.** The validator permits scalar values, but only keys consumed by the selected adapter/engine profile affect behavior.
- **Do not treat `requestedDurationSeconds` as portable across models.** The local 2D sprite model accepts it; the active M1AS GLB recipe scheduler explicitly rejects it because the legacy queue owns transition timing.
- **Do not claim current per-limb deformation in VFXR.** Pose transition contracts and authoring exist; the current sprite renderer is not a skeletal renderer.
- **Do not claim the tube POC already drives body-part growth or minigame logic.** Those are potential applications of the POC strategy, not current generalized features.
- **Do not claim VFXR exports an animated WebM.** It currently exports a pose-sequence JSON document. The recorder's current live integrations are BIG3R and CCSA.
- **Keep simulation time and wall-clock time separate.** GLB recipe offsets and 2D experiment events use their simulation clocks; recorder camera keyframes use elapsed performance time during capture.
- **Storage is split by responsibility.** Camera presets and scratchpad notes use local storage; structured experiment capture uses IndexedDB; diagnostics use a bounded local-storage log.

## 22. Source map additions for the controls and POCs

| Responsibility | Source |
|---|---|
| Procedural tube-ceiling geometry, trajectory, camera projection, generic procedural Canvas presets | `client/viewer/Proceedural-vfx.ts` |
| Recorder source selection, camera controls, WebM capture, metadata, backdrop, binding | `client/viewer/vfx-recorder.ts` |
| BIG3R and CCSA recorder wiring | `client/viewer/main.ts` |
| Dynamic Character Growth Lab UI and 2D experiment preview | `client/viewer/two-dimensional-sprite-lab.ts` |
| GLB recipe validation/scheduling and dynamic BIG3R controls | `client/viewer/big3r-sandbox.ts` |
| 2D sprite command model and capabilities | `client/growth/two-dimensional-sprite-growth-model.ts` |
| 2D experiment JSON schema, validation, event runner and telemetry samples | `client/growth/two-dimensional-sprite-experiment-runner.ts` |
| Biological inhale/hold/release profile and parameter validation | `client/growth/biological-breathing.ts`, `client/growth/biological-breathing-model.ts` |
| GLB master recipe examples | `examples/experiments/m1as-streamed-glb-growth-recipe.json`, `examples/experiments/m1as-streamed-glb-growth-master-test-recipe.json` |
| 2D breathing experiment example | `examples/experiments/2d-sprite-growth-breathing-demo.json` |
