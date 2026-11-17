# M1AS & BIG3R Master Architecture & Handoff Specification

## 1. Core Philosophy & Technical Stack
- **M1AS:** TypeScript Node package providing a MERN-first asset service with **zero server compute** (server only issues short-lived signed URLs and manages storage orchestration; the browser executes all rendering, rasterization, spatial culling, scale math, and VFX).
- **BIG3R (`box3dev`):** Front-end WebGL visual prototyping and scale sandbox integrated into `dev/m1as-content-viewer.html` (smoke-test harness to toggle asset repository access points and verify streaming).
- **Build & Runtime Stack:** TypeScript + `esbuild` + `NodeNext` (explicitly **No Vite**).
- **Server Entry Point:** `dist/server/m1asServer.js` (started via `npm run big3rM1as`).
- **Hard Engineering Guardrails:**
  - Use exact class and method names.
  - Enforce `.js` import extensions for `NodeNext` compatibility.
  - Keep BIG3R (`box3dev`) strictly isolated from core M1AS.
  - Maintain a flat sawtooth VRAM profile: call `.dispose()` on geometries, materials, `VideoTexture`, and `CanvasTexture` instances; pause, scrub `src`, and destroy orphaned `<video>` and `<audio>` elements; cap concurrent hardware video decoders.

---

## 2. Current Repository Structure & Build Configuration
- **Core Engines:**
  - `client/M1ASVFXEngine.ts`
  - `client/M1ASFaceLayerEngine.ts`
- **Viewer & Sandbox Modules:**
  - `client/viewer/css.d.ts` (`declare module "*.css"`)
  - `client/viewer/styles.css` (all inline styles extracted; state utility classes: `.is-hidden`, `.is-visible`, `.url-display.is-signed`, `.prop-chip.is-broken`, `.posture-crawl`, `.posture-hunch`, `.posture-stand`)
  - `client/viewer/types.ts`
  - `client/viewer/m1as-api.ts`
  - `client/viewer/big3r-sandbox.ts`
  - `client/viewer/ccsa-stage.ts`
  - `client/viewer/vfx-recorder.ts`
  - `client/viewer/main.ts`
- **Dev Harness & Bundle Outputs:**
  - `dev/m1as-content-viewer.html`
  - `dev/m1as-viewer.js`
  - `dev/m1as-viewer.css`
- **`tsconfig.json`:** `target: "ES2020"`, `lib: ["ES2020", "DOM", "DOM.Iterable"]`, `module: "NodeNext"`, `moduleResolution: "NodeNext"`, `strict: true`, `rootDir: "."`, `outDir: "dist"`, `declaration: true`, `sourceMap: true`.
- **Viewer Bundle Command (`build:viewer`):**
  `esbuild ./client/viewer/main.ts --bundle --format=esm --minify --sourcemap --outfile=dev/m1as-viewer.js` (automatically emits `dev/m1as-viewer.css`).

---

## 3. Current Implemented Interfaces & Controllers
- **`IVfxEngine` (`client/M1ASVFXEngine.ts`):**
  `setMode`, `enqueueGrowth`, `startHoldGrowth`, `releaseHoldGrowth`, `triggerDelayedColossalChaos`, `resetGrowth`, `setRoomCeiling`, `setCinematicCamera`, `addSpatialProp`, `updatePropHeight`, `removeProp`, `resetAllProps`, `setVfxWebm`, `setTransparentBackground`, `getCanvas`, `destroy`
- **`IFaceLayerEngine` (`client/M1ASFaceLayerEngine.ts`):**
  `updateBackground`, `updateFace`, `setClickVfx`, `setTransparentBackground`, `getCanvas`, `destroy`
- **Dependency Injection (`client/viewer/main.ts`):** Injects `VfxEngineFactory` and `FaceLayerEngineFactory`.
- **`M1asApiClient` (`client/viewer/m1as-api.ts`):**
  - Endpoints: `GET /assets/public`, `GET /assets/:id/signed`, `GET /assets/:id/preview` (requires header `m1as-user-id: dev-user`).
  - Utilities: `autoHydrateRuntimeEngine` (scans `<script type="module">` for `litPropertyMetadata` -> `#m1as-runtime-engine`), `startCountdown(expires, ttl)`.
- **`Big3rSandboxController` (`client/viewer/big3r-sandbox.ts`):**
  - Modes: `click`, `tap`, `hold`, `chaos-delayed`.
  - Stimuli: `Consumption`, `Exercise`, `Buff`, `Environmental`.
  - Box Tiers: `BrokenJar` (`1.6m`), `SewerPipes` (`2.4m`), `LabSink`, `LabGrowthTank` (`3.2m`), `LabViewingRoom` (`5.0m`), `CeilingVentEscape`, `StreetWorld` (`9.5m`).
  - Prop Roles: `consumable` (`0.4m`, breaks @ `65%`), `wearable` (`0.9m` @ `85%`), `container` (`1.6m` @ `102%`), `growth-gate` (`2.6m` @ `102%`), `reference` (`1.8m`).
  - Postures: `stand`, `hunch`, `crawl`.
- **`CcsaStageController` (`client/viewer/ccsa-stage.ts`):**
  - Renders: `model/gltf-binary` (`.glb`), `video/*`, `audio/*`, `application/pdf`, `image/*`, `image/svg+xml`, `iframe` sandbox.
  - Slots: `bg`, `0..5`.
- **`VfxRecorderController` (`client/viewer/vfx-recorder.ts`):**
  - Encoder: VP9, 60 FPS, 4 Mbps via `MediaRecorder`.
  - Sources: `big3r`, `ccsa`, `procedural-growth` (`1.5s`), `procedural-fireball` (`1.5s`), `procedural-collapse` (`1.8s`).

---

## 4. Planned Epics COMPLETE SET (EPICS 1–3)

### Epic 1: CCSA Face-Mapping & Cinematography VFX (`BIG3R-CCSA-VFX`)
- Expose CCSA face-index selection (`bg`, cube faces `0–5` with inward normals / double-sided rendering for enclosed room staging, 2D planes face `0`) inside the BIG3R sandbox via `M1ASFaceLayerEngine` and `M1ASVFXEngine`.
- Bind signed-URL assets (`image/jpeg`, `image/png`, `image/webp`, `video/mp4`, `video/webm` with alpha, `audio/mpeg`).
- Layer lightweight 2D `.webm` alpha planes over sculpted `.glb` models with scale interpolation and camera/emissive lighting choreography (zero physics bodies).
- Wire raycast clicks on painted faces/planes to trigger `.mp3` playback, `.webm` burst overlays, smooth scale increments, and box transitions.
- Support `.json` composition export and reload for sandbox presets.

### Epic 2: M1AS CCSA-to-VFX Bridge & Procedural WebM Asset Architecture
- **`@m1as/client-textures` (`resolveM1ASTexture(signedUrl, mimeType)`):** Stateless browser resolver routing `application/json` and `image/svg+xml` through an offscreen 2D canvas rasterizer (`CanvasTexture` within 1 frame) and `video/webm` through a headless, muted, looping HTML5 `VideoTexture`.
- **Material Bridge:** `sandbox.assignPropFace(propId, faceIndex, texture)` for modular `.glb` slots, enforcing `.dispose()` and `<video>` purge on hot-swap or box unload.
- **Parametric HTML/Canvas VFX Generator:** Standalone browser emitters for additive purple magic smoke, midpoint-displacement lightning, and a 2D metaball fluid generator with a `0.0–1.0` viscosity slider (`0.90` gel: `<= 2°` dispersion, high cohesion, alpha threshold, top specular highlight; `0.10` water: `>= 15°` dispersion, high velocity, no clumping) exporting transparent VP9 `.webm` via `MediaRecorder`.
- **Scale-Illusion Parallax Windows (`m1as_window_pane`):** Bind UV vertical offset, zoom scale, and video scrub position to player scale (`1.0x -> 4.0x`).
- **Synchronized Injector Prop:** Raycast click on a 2D plane `.glb` injector plays its fluid-drain `.webm` from frame `0` while smoothly tweening target character scale over the exact clip duration.

### Epic 3: Zero-Bottleneck Asset Streaming & Psychological Scale Architecture
- **Three-Engine Spatial & Culling Pipeline:**
  1. **Map Engine:** Generates nested box rooms and hallways as low-poly quads with standardized M1AS slots (`m1as_wall_interior`, `m1as_window_portal`) and mathematical 2D portal bounding rectangles.
  2. **Asset Engine (CCSA Bridge):** Resolves signed URLs into offscreen `.json`/`.svg` textures, VP9 `.webm` streams, and modular `.glb` containers.
  3. **Level Orchestrator:** Coordinates tier pre-warming, world-inverse matrix rebasing, pre-render 2D screen-space portal frustum culling, off-screen `<video>` pausing, JSON rule-pack state evaluation, and deterministic tier disposal.
- **World-Inverse Scale Rebasing (`ScaleRebaseController`):** Keeps player local scale normalized within `[0.5, 2.0]` (preventing IEEE 754 floating-point jitter and shadow-map acne across 10+ tiers) by shrinking `ScaleTier_N` inversely (`1.0x -> 0.5x`) while `ScaleTier_N+1` is pre-warmed at `2.0x`. At `0.5x`, snaps `ScaleTier_N+1` to `1.0x`, resets player scale to `1.0x`, and calls `.dispose()` on all `ScaleTier_N` meshes, `VideoTextures`, and `CanvasTextures`.
- **Four-Phase Psychological Growth Curve (`GrowthCurveStateMachine` via `big3r_growth_curve.json`):**
  - **Phase 1 (`1.00x–1.08x` Dormant Grind):** Micro eye-level creep; static props.
  - **Phase 2 (`1.08x–1.35x` Curiosity & Excitement):** FOV widens (`60° -> 68°`); parallax window `.webm` shifts upward; small props unlock kickable physics.
  - **Phase 3 (`1.35x–1.85x` Anxious Panic):** Ceiling planes press into upper frustum; claustrophobic camera tilt and spring-shake; wall seams emit dust `.webm` overlays; doorways require crouch clearance.
  - **Phase 4 (`1.85x–2.00x` Overwhelmed Rampage):** Interior walls hot-swap to fractured `.webm` overlays; footsteps spawn scaled ground-pound shockwave `.webm` decals; executes tier rebase.
- **Doom-Style Culling & Volumetric Shaders:** Pre-render 2D screen-space frustum check on portal rectangles omits occluded rooms from the WebGL draw queue and pauses off-screen HTML5 `<video>` decoders; camera-vector UV offset shaders for depth walls (`books.webm`, `lab_shelves.webm`); Y-axis camera-locked cylindrical billboards (`fishbowl_animated.webm`).
- **Studio Manifest & Telemetry HUD:** Standardized JSON Level Manifest endpoint (seed ID -> signed URLs, MIME types, slots for Three.js/Unity C#/WebGL) + toggleable HTML/CSS Telemetry HUD (FPS, draw calls, active decoders, zero server compute verification).
- **Five-Mode Scale-Aware Camera Rig:** (1) Free Explore with prop height-ratio measurement reticle, (2) Observer 1, (3) Observer 2, (4) First-Person, (5) Worm's-Eye/Bird's-Eye with dynamic near-clipping plane adjustment.
- **Interactive Multi-Face Props & Lighting:** Self-illuminated `.glb` props (e.g., 4-face inner-screen TV in Observer Mode 2 tweens `90°` on Y-axis on click to switch `.webm` channel and pauses off-screen `<video>`) + tier-locked shadow mapping.

---

## 5. Open Flags & Conflicts to Resolve
1. **Scale Architecture Reconciliation:** Align current `Big3rSandboxController` metric `BoxTiers` (`BrokenJar` `1.6m` -> `StreetWorld` `9.5m`) with Epic 3 `ScaleRebaseController` normalized `[0.5, 2.0]` inverse tier rebasing.

-------------------
# M1AS & BIG3R Compressed Master Spec (`M1AS_BIG3R_SPEC.md`)

`DICT: $M1=M1AS|$B3=BIG3R|$CC=CCSA|$FLE=M1ASFaceLayerEngine|$VXE=M1ASVFXEngine|$CV=dev/m1as-content-viewer.html|$SU=signed-URL|$WM=.webm(alpha)|$VT=VideoTexture|$CT=CanvasTexture|$DSP=.dispose()+purge(<video>/<audio>)|$ZSC=zero-server-compute|$ST=ScaleTier|$LO=LevelOrchestrator|$ME=MapEngine|$AE=AssetEngine|$RC=RaycastClick|$RB=ScaleRebaseController|$GC=GrowthCurveStateMachine`

`PROTO: Role=SrTS&WebGLArchitect|Status=EPICS_90_91_92_COMPLETE_SET|Rules=ExactNames,NodeNext(.js),NoVite,IsolateB3FromM1,FlatSawtoothVRAM(0Leaks,$DSP,CapDecoders),UnifiedCrossSystemPhasesOnly|Trigger="msgAI"/"mesgAI"->audit_latest,dedupe,flag_conflicts,output_ONLY_single_code_block(<1200chars)_preserving_this_Trigger`

## 1. Current Repo & Build State
- **Core & Build:** `$M1`=TS NodePkg MERN asset service (`$ZSC`, issues `$SU` only) | Stack=TS+esbuild+NodeNext(NoVite) | Server=`dist/server/m1asServer.js` (`npm run big3rM1as`) | `$B3`=WebGL sandbox in `$CV` (dev w/ `box3dev`) | `tsconfig`=`{target:ES2020,lib:[ES2020,DOM,DOM.Iterable],module:NodeNext,moduleResolution:NodeNext,strict:true,rootDir:.,outDir:dist,declaration:true,sourceMap:true}` | `build:viewer`=`esbuild ./client/viewer/main.ts --bundle --format=esm --minify --sourcemap --outfile=dev/m1as-viewer.js` (+auto `dev/m1as-viewer.css`).
- **Files & CSS:** `client/{$VXE,$FLE}.ts`, `client/viewer/{css.d.ts,styles.css,types,m1as-api,big3r-sandbox,ccsa-stage,vfx-recorder,main}.ts`, `$CV`, `dev/m1as-viewer.{js,css}` | Inline styles extracted to `styles.css` (`[.is-hidden,.is-visible,.url-display.is-signed,.prop-chip.is-broken,.posture-crawl,.posture-hunch,.posture-stand]`).
- **Interfaces & DI:** `IVfxEngine`=`{setMode,enqueueGrowth,startHoldGrowth,releaseHoldGrowth,triggerDelayedColossalChaos,resetGrowth,setRoomCeiling,setCinematicCamera,addSpatialProp,updatePropHeight,removeProp,resetAllProps,setVfxWebm,setTransparentBackground,getCanvas,destroy}` | `IFaceLayerEngine`=`{updateBackground,updateFace,setClickVfx,setTransparentBackground,getCanvas,destroy}` | Factories injected in `main.ts`.
- **Controllers:**
  - `M1asApiClient`: `GET /assets/{public,:id/signed,:id/preview}` (hdr `m1as-user-id:dev-user`), `autoHydrateRuntimeEngine` (`litPropertyMetadata`->`#m1as-runtime-engine`), `startCountdown(expires,ttl)`.
  - `Big3rSandboxController`: modes=`[click,tap,hold,chaos-delayed]`, stimuli=`[Consumption,Exercise,Buff,Environmental]`, tiers=`[BrokenJar:1.6m,SewerPipes:2.4m,LabSink,LabGrowthTank:3.2m,LabViewingRoom:5m,CeilingVentEscape,StreetWorld:9.5m]`, props=`[consumable:0.4m@65%,wearable:0.9m@85%,container:1.6m@102%,growth-gate:2.6m@102%,reference:1.8m]`, postures=`[stand,hunch,crawl]`.
  - `CcsaStageController`: renders `[.glb,video/*,audio/*,pdf,image/*,svg,iframe]`, slots=`[bg,0..5]`.
  - `VfxRecorderController`: VP9 60fps 4Mbps `MediaRecorder`, sources=`[big3r,ccsa,procedural-{growth:1.5s,fireball:1.5s,collapse:1.8s}]`.

## 2. Planned Epics (1–3 of N)
- **E1 (`BIG3R-CCSA-VFX`):** Expose `$CC` face painting (`bg`, cube `0..5` w/ inward normals/double-sided room staging, 2D plane `0`) in `$B3` via `$FLE`/`$VXE`; bind `$SU` (`.jpeg/.png/.webp/.mp4/$WM/.mp3`); layer 2D `$WM` over `.glb` props w/ scale & emissive/cam choreography (0 physics); `$RC` triggers `.mp3`, `$WM` bursts, scale growth, box transitions; `.json` preset export/reload.
- **E2 (`CCSA-VFX Bridge & Proc WebM`):** `@m1as/client-textures:resolveM1ASTexture(url,mime)` -> `{json/svg:Offscreen2DCanvas->$CT(1frame); webm:MutedLoop->$VT}`; `sandbox.assignPropFace(propId,faceIdx,tex)` + `$DSP`; HTML5 Canvas VFX gen (additive purple magic smoke, midpoint lightning, 2D metaball fluid w/ `0–1` viscosity slider `{0.90:disp<=2deg,highCohesion,alphaThresh,topSpecular; 0.10:disp>=15deg,highVel,noClump}`) -> VP9 `$WM`; `m1as_window_pane` UV_Y/zoom/scrub bound to player scale (`1x->4x`); `$RC` on 2DPlane `.glb` injector plays fluid-drain `$WM` from frame 0 while tweening scale over exact clip duration.
- **E3 (`Zero-Bottleneck Streaming & Psych Scale`):** 3-Engine Pipeline: `1.$ME` (low-poly quads, slots `m1as_wall_interior|m1as_window_portal`, 2D portal rects) + `2.$AE` (`$CC` bridge) + `3.$LO` (tier prewarm, rebase, portal cull, pause offscreen vids, rule eval, `$DSP`); `$RB` keeps player scale `[0.5,2.0]` (elim IEEE754 jitter & shadow acne across 10+ tiers) by shrinking `$ST_N` (`1x->0.5x`) while `$ST_N+1` prewarms `@2x` -> at `0.5x` snap `$ST_N+1@1x`, reset player `@1x`, `$DSP($ST_N)`; `$GC` (`big3r_growth_curve.json`): `P1[1-1.08x:DormantGrind|eyeCreep]`, `P2[1.08-1.35x:Curiosity|FOV:60->68deg,winParallax,kickProps]`, `P3[1.35-1.85x:Panic|ceilingPress,camTilt/shake,seamDust_$WM,crouchDoors]`, `P4[1.85-2x:Rampage|fracturedWalls_$WM,stepShockwave_$WM,rebase]`; 2D portal frustum cull + pause offscreen `<video>`; cam-vec UV parallax walls (`books/lab_shelves.webm`) + Y-locked billboards (`fishbowl.webm`); `JSONLevelManifest` API + Telemetry HUD (FPS, draw calls, active decoders, `$ZSC`); 5-Mode CamRig (`1:FreeExplore+HeightReticle, 2:Obs1, 3:Obs2, 4:FP, 5:Worms/BirdsEye+DynamicNearClip`); 4-face emissive TV (`Obs2` `$RC`->`90deg` Y swap `$WM` + pause hidden `<video>`) + tier-locked shadows.

## 3. Flags & Conflicts
- `[CONFLICT]` Reconcile `Big3rSandboxController` metric `BoxTiers` (`1.6m–9.5m`) with E3 `$RB` normalized `[0.5,2.0]` inverse tier rebasing.
- `[CONFLICT]` Align `client/viewer/vfx-recorder.ts` (`VfxRecorderController`) with E2 standalone HTML5 Canvas fluid/magic/lightning generator.
- `[CHECK/MISSING]` Verify `LoadPublicAssets` button 200 status after `m1as-viewer.js` path fix; add `client/index.ts` & `package.json` `exports` map for npm release; confirm if E3 `$AE` intro had sub-components after `"looping VP9"`.

