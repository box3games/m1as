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

-----
