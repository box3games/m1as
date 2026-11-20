
import {
    ProceduralVfxCanvas,
    type ProceduralVfxPreset,
    type Big3rCameraAngle,
    type Big3rFramingMode,
    type Big3rCameraState,
    type Big3rAnchorState,
    type Big3rGrowthDirection,
    type Big3rCameraSnapshot,
    type Big3rTrajectoryPreset,
    type Big3rMorphologyStyle,
    type Big3rTrajectorySnapshot,
} from './Proceedural-vfx.js';

export interface VfxRecorderHooks {
    getBig3rCanvas: () => HTMLCanvasElement | null;
    setBig3rTransparentBg: (enabled: boolean) => void;
    bindBig3rVfxWebm: (blobUrl: string) => Promise<void>;
    getCcsaCanvas: () => HTMLCanvasElement | null;
    setCcsaTransparentBg: (enabled: boolean) => void;
    bindCcsaClickVfxWebm: (blobUrl: string) => Promise<void>;
}

interface VfxParticle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    size: number;
    hue: number;
    maxLife: number;
}

interface Big3rSavedCameraPreset {
    name: string;
    snapshot: Big3rCameraSnapshot;
    savedAt: string;
}

interface Big3rCameraKeyframe {
    timeMs: number;
    camera: Big3rCameraState;
}

interface Big3rRecordingMetadata {
    schemaVersion: 5;
    outputMode: 'foreground' | 'composite';
    recordingId: string;
    source: 'procedural-big3r-tube-ceiling';
    growthDirection: Big3rGrowthDirection;
    trajectory: Big3rTrajectorySnapshot;
    anchor: Big3rAnchorState;
    startedAt: string;
    durationMs: number;
    completed: boolean;
    stopReason: 'completed' | 'user' | 'unknown';
    width: number;
    height: number;
    requestedFrameRate: number;
    mimeType: string;
    camera: Big3rCameraSnapshot;
    cameraKeyframes: Big3rCameraKeyframe[];
    backdrop: { kind: 'url' | 'file' | 'none'; source: string | null };
}

const BIG3R_CAMERA_STORAGE_KEY = 'm1as.big3r.camera-presets.v1';

const ADVANCED_PRESETS = new Set<ProceduralVfxPreset>([
    'magic-smoke',
    'lightning',
    'metaball-fluid',
    'goo-pour',
    'spinning-coin',
    'spinning-skull',
    'big3r-tube-ceiling',
]);

export class VfxRecorderController {
    private readonly hooks: VfxRecorderHooks;
    private mediaRecorder: MediaRecorder | null = null;
    private recordedChunks: Blob[] = [];
    private lastRecordedBlobUrl: string | null = null;
    private readonly advancedProcedural: ProceduralVfxCanvas;

    private readonly sourceModeSelect = document.getElementById('recSourceMode') as HTMLSelectElement;
    private readonly alphaBgCheckbox = document.getElementById('recAlphaBg') as HTMLInputElement;
    private readonly viscositySlider = document.getElementById('recViscositySlider') as HTMLInputElement | null;
    private readonly viscosityValEl = document.getElementById('recViscosityVal') as HTMLElement | null;
    private readonly big3rAngleSelect = document.getElementById('recBig3rAngle') as HTMLSelectElement | null;
    private readonly big3rDirectionSelect = document.getElementById('recBig3rDirection') as HTMLSelectElement | null;
    private readonly big3rTrajectorySelect = document.getElementById('recBig3rTrajectory') as HTMLSelectElement | null;
    private readonly big3rMorphologySelect = document.getElementById('recBig3rMorphology') as HTMLSelectElement | null;
    private readonly big3rAnchorXInput = document.getElementById('recBig3rAnchorX') as HTMLInputElement | null;
    private readonly big3rAnchorYInput = document.getElementById('recBig3rAnchorY') as HTMLInputElement | null;
    private readonly big3rFramingSelect = document.getElementById('recBig3rFraming') as HTMLSelectElement | null;
    private readonly big3rControls = document.getElementById('recBig3rControls') as HTMLElement | null;
    private readonly big3rResetCameraBtn = document.getElementById('recBig3rResetCamera') as HTMLButtonElement | null;
    private readonly big3rSaveCameraBtn = document.getElementById('recBig3rSaveCamera') as HTMLButtonElement | null;
    private readonly big3rLoadCameraBtn = document.getElementById('recBig3rLoadCamera') as HTMLButtonElement | null;
    private readonly big3rDeleteCameraBtn = document.getElementById('recBig3rDeleteCamera') as HTMLButtonElement | null;
    private readonly big3rMotionStartBtn = document.getElementById('recBig3rMotionStart') as HTMLButtonElement | null;
    private readonly big3rMotionStopBtn = document.getElementById('recBig3rMotionStop') as HTMLButtonElement | null;
    private readonly big3rMotionClearBtn = document.getElementById('recBig3rMotionClear') as HTMLButtonElement | null;
    private readonly big3rMetadataDownloadBtn = document.getElementById('downloadRecMetadataBtn') as HTMLButtonElement | null;
    private readonly big3rCameraNameInput = document.getElementById('recBig3rCameraName') as HTMLInputElement | null;
    private readonly big3rCameraPresetSelect = document.getElementById('recBig3rCameraPreset') as HTMLSelectElement | null;
    private readonly startBtn = document.getElementById('startRecBtn') as HTMLButtonElement;
    private readonly stopBtn = document.getElementById('stopRecBtn') as HTMLButtonElement;
    private readonly proceduralCanvas = document.getElementById('proceduralVfxCanvas') as HTMLCanvasElement;
    private readonly proceduralPreviewStage = document.getElementById('proceduralPreviewStage') as HTMLElement | null;
    private readonly backdropVideo = document.getElementById('recBackdropVideo') as HTMLVideoElement | null;
    private readonly big3rOutputModeSelect = document.getElementById('recBig3rOutputMode') as HTMLSelectElement | null;
    private readonly big3rCompositeCanvas = document.createElement('canvas');
    private readonly backdropUrlInput = document.getElementById('recBackdropUrl') as HTMLInputElement | null;
    private readonly backdropFileInput = document.getElementById('recBackdropFile') as HTMLInputElement | null;
    private readonly backdropLoadBtn = document.getElementById('recBackdropLoad') as HTMLButtonElement | null;
    private readonly backdropClearBtn = document.getElementById('recBackdropClear') as HTMLButtonElement | null;
    private readonly previewBox = document.getElementById('recPreviewBox') as HTMLElement;
    private readonly previewVideo = document.getElementById('recPreviewVideo') as HTMLVideoElement;
    private readonly downloadBtn = document.getElementById('downloadRecBtn') as HTMLButtonElement;
    private readonly bindCcsaBtn = document.getElementById('bindRecClickVfxBtn') as HTMLButtonElement;
    private readonly bindBig3rBtn = document.getElementById('bindRecBig3rVfxBtn') as HTMLButtonElement | null;
    private readonly statusEl = document.getElementById('recStatus') as HTMLElement;

    private big3rCameraLocked = false;
    private big3rPointerId: number | null = null;
    private big3rLastPointerX = 0;
    private big3rLastPointerY = 0;
    private big3rPanMode = false;
    private big3rRecordingId: string | null = null;
    private backdropObjectUrl: string | null = null;
    private backdropDescriptor: { kind: 'url' | 'file' | 'none'; source: string | null } = { kind: 'none', source: null };
    private recordingBackdrop: { kind: 'url' | 'file' | 'none'; source: string | null } = { kind: 'none', source: null };
    private lastBig3rCameraSnapshot: Big3rCameraSnapshot | null = null;
    private lastBig3rMetadata: Big3rRecordingMetadata | null = null;
    private big3rRecordingStartedAt = '';
    private big3rRecordingStartedPerf = 0;
    private big3rStopReason: 'completed' | 'user' | 'unknown' = 'unknown';
    private big3rCameraKeyframes: Big3rCameraKeyframe[] = [];
    private big3rMotionCaptureActive = false;
    private big3rMotionCaptureStartedAt = 0;

    private big3rPreviewActive = false;
    private big3rPreviewCopyRafId: number | null = null;

    private readSavedBig3rCameraPresets(): Big3rSavedCameraPreset[] {
        try {
            const raw = localStorage.getItem(BIG3R_CAMERA_STORAGE_KEY);
            if (!raw) return [];
            const parsed: unknown = JSON.parse(raw);
            if (!Array.isArray(parsed)) return [];
            return parsed.filter((item): item is Big3rSavedCameraPreset =>
                !!item && typeof item.name === 'string' &&
                !!item.snapshot && item.snapshot.preset === 'big3r-tube-ceiling' &&
                !!item.snapshot.camera &&
                ['yawOffset','pitchOffset','distanceOffset','panX','panY'].every(
                    key => typeof item.snapshot.camera[key] === 'number'
                )
            );
        } catch {
            return [];
        }
    }

    private refreshBig3rCameraPresetSelect(): void {
        if (!this.big3rCameraPresetSelect) return;
        const selected = this.big3rCameraPresetSelect.value;
        const presets = this.readSavedBig3rCameraPresets();
        this.big3rCameraPresetSelect.replaceChildren(new Option('Saved camera configurations…', ''));
        for (const preset of presets) this.big3rCameraPresetSelect.add(new Option(preset.name, preset.name));
        if (presets.some(preset => preset.name === selected)) this.big3rCameraPresetSelect.value = selected;
        if (this.big3rDeleteCameraBtn) this.big3rDeleteCameraBtn.disabled = presets.length === 0;
        if (this.big3rLoadCameraBtn) this.big3rLoadCameraBtn.disabled = presets.length === 0;
    }

    private getBig3rTrajectorySnapshot(): Big3rTrajectorySnapshot {
        return this.advancedProcedural.getBig3rTrajectorySnapshot();
    }

    private getBig3rCameraSnapshot(): Big3rCameraSnapshot {
        return {
            preset: 'big3r-tube-ceiling',
            angle: (this.big3rAngleSelect?.value || 'ceiling') as Big3rCameraAngle,
            growthDirection: (this.big3rDirectionSelect?.value || 'north') as Big3rGrowthDirection,
            trajectoryPreset: (this.big3rTrajectorySelect?.value || 'legacy-cardinal') as Big3rTrajectoryPreset,
            morphologyStyle: (this.big3rMorphologySelect?.value || 'elongated') as Big3rMorphologyStyle,
            anchor: this.advancedProcedural.getBig3rAnchorState(),
            framing: (this.big3rFramingSelect?.value || 'hybrid') as Big3rFramingMode,
            camera: this.advancedProcedural.getBig3rCameraState(),
        };
    }

    private restoreBig3rCameraSnapshot(snapshot: Big3rCameraSnapshot): void {
        if (this.big3rAngleSelect) this.big3rAngleSelect.value = snapshot.angle;
        if (this.big3rDirectionSelect) this.big3rDirectionSelect.value = snapshot.growthDirection || 'north';
        if (this.big3rTrajectorySelect) this.big3rTrajectorySelect.value = snapshot.trajectoryPreset || 'legacy-cardinal';
        if (this.big3rMorphologySelect) this.big3rMorphologySelect.value = snapshot.morphologyStyle || 'elongated';
        const anchor = snapshot.anchor || { offsetX: 0, offsetY: 0 };
        this.advancedProcedural.setBig3rAnchorState(anchor);
        if (this.big3rAnchorXInput) this.big3rAnchorXInput.value = String(anchor.offsetX);
        if (this.big3rAnchorYInput) this.big3rAnchorYInput.value = String(anchor.offsetY);
        if (this.big3rFramingSelect) this.big3rFramingSelect.value = snapshot.framing;
        this.advancedProcedural.setConfig({
            preset: 'big3r-tube-ceiling',
            big3rAngle: snapshot.angle,
            big3rGrowthDirection: snapshot.growthDirection || 'north',
            big3rTrajectoryPreset: (snapshot.trajectoryPreset || 'legacy-cardinal') as Big3rTrajectoryPreset,
            big3rMorphologyStyle: (snapshot.morphologyStyle || 'elongated') as Big3rMorphologyStyle,
            big3rFramingMode: snapshot.framing,
        });
        this.advancedProcedural.setBig3rCameraState(snapshot.camera);
        this.statusEl.textContent = 'Restored BIG3R camera configuration.';
    }

    private saveBig3rCameraPreset(): void {
        const name = this.big3rCameraNameInput?.value.trim();
        if (!name) {
            this.statusEl.textContent = 'Enter a name before saving the camera configuration.';
            this.big3rCameraNameInput?.focus();
            return;
        }
        const presets = this.readSavedBig3rCameraPresets();
        const next: Big3rSavedCameraPreset = {
            name, snapshot: this.getBig3rCameraSnapshot(), savedAt: new Date().toISOString(),
        };
        const existing = presets.findIndex(item => item.name.toLowerCase() === name.toLowerCase());
        if (existing >= 0) presets[existing] = next;
        else presets.push(next);
        try {
            localStorage.setItem(BIG3R_CAMERA_STORAGE_KEY, JSON.stringify(presets));
            this.refreshBig3rCameraPresetSelect();
            if (this.big3rCameraPresetSelect) this.big3rCameraPresetSelect.value = name;
            this.statusEl.textContent = `Saved camera configuration “${name}”.`;
        } catch {
            this.statusEl.textContent = 'Could not save camera configuration in this browser.';
        }
    }

    private loadBig3rCameraPreset(): void {
        const name = this.big3rCameraPresetSelect?.value;
        if (!name) return;
        const preset = this.readSavedBig3rCameraPresets().find(item => item.name === name);
        if (preset) this.restoreBig3rCameraSnapshot(preset.snapshot);
    }

    private deleteBig3rCameraPreset(): void {
        const name = this.big3rCameraPresetSelect?.value;
        if (!name) return;
        const presets = this.readSavedBig3rCameraPresets().filter(item => item.name !== name);
        try {
            localStorage.setItem(BIG3R_CAMERA_STORAGE_KEY, JSON.stringify(presets));
            this.refreshBig3rCameraPresetSelect();
            this.statusEl.textContent = `Deleted camera configuration “${name}”.`;
        } catch {
            this.statusEl.textContent = 'Could not update saved camera configurations.';
        }
    }

    private resetBig3rCamera(): void {
        this.advancedProcedural.resetBig3rCameraState();
        this.statusEl.textContent = 'Camera reset to the selected BIG3R angle and framing.';
    }

    private captureBig3rCameraKeyframe(timeMs?: number): void {
        if (!this.big3rMotionCaptureActive) return;
        const now = performance.now();
        const time = Math.max(0, timeMs ?? now - this.big3rMotionCaptureStartedAt);
        const camera = this.advancedProcedural.getBig3rCameraState();
        const previous = this.big3rCameraKeyframes[this.big3rCameraKeyframes.length - 1];
        if (previous && time - previous.timeMs < 24) {
            previous.camera = camera;
            return;
        }
        this.big3rCameraKeyframes.push({ timeMs: time, camera });
    }

    private startBig3rMotionCapture(): void {
        if (this.big3rCameraLocked) return;
        this.big3rCameraKeyframes = [];
        this.big3rMotionCaptureStartedAt = performance.now();
        this.big3rMotionCaptureActive = true;
        this.captureBig3rCameraKeyframe(0);
        if (this.big3rMotionStartBtn) this.big3rMotionStartBtn.disabled = true;
        if (this.big3rMotionStopBtn) this.big3rMotionStopBtn.disabled = false;
        this.statusEl.textContent = 'Camera motion capture is recording. Move the camera, then stop to save the motion take.';
    }

    private stopBig3rMotionCapture(): void {
        if (!this.big3rMotionCaptureActive) return;
        this.captureBig3rCameraKeyframe();
        this.big3rMotionCaptureActive = false;
        if (this.big3rMotionStartBtn) this.big3rMotionStartBtn.disabled = false;
        if (this.big3rMotionStopBtn) this.big3rMotionStopBtn.disabled = true;
        this.statusEl.textContent = `Captured ${this.big3rCameraKeyframes.length} camera keyframes (${Math.round(this.big3rCameraKeyframes[this.big3rCameraKeyframes.length - 1]?.timeMs ?? 0)} ms). Start Recording to replay this move.`;
    }

    private clearBig3rMotionCapture(): void {
        this.big3rMotionCaptureActive = false;
        this.big3rCameraKeyframes = [];
        if (this.big3rMotionStartBtn) this.big3rMotionStartBtn.disabled = false;
        if (this.big3rMotionStopBtn) this.big3rMotionStopBtn.disabled = true;
        this.statusEl.textContent = 'Camera motion take cleared.';
    }

    private applyBig3rCameraMotion(timeMs: number): void {
        const frames = this.big3rCameraKeyframes;
        if (frames.length === 0) return;
        if (timeMs <= frames[0].timeMs) {
            this.advancedProcedural.setBig3rCameraState(frames[0].camera);
            return;
        }
        const last = frames[frames.length - 1];
        if (timeMs >= last.timeMs) {
            this.advancedProcedural.setBig3rCameraState(last.camera);
            return;
        }
        let rightIndex = frames.findIndex(frame => frame.timeMs >= timeMs);
        if (rightIndex < 1) rightIndex = 1;
        const left = frames[rightIndex - 1];
        const right = frames[rightIndex];
        const span = Math.max(1, right.timeMs - left.timeMs);
        const t = Math.max(0, Math.min(1, (timeMs - left.timeMs) / span));
        const lerp = (a: number, b: number) => a + (b - a) * t;
        const yawDelta = Math.atan2(
            Math.sin(right.camera.yawOffset - left.camera.yawOffset),
            Math.cos(right.camera.yawOffset - left.camera.yawOffset),
        );
        this.advancedProcedural.setBig3rCameraState({
            yawOffset: left.camera.yawOffset + yawDelta * t,
            pitchOffset: lerp(left.camera.pitchOffset, right.camera.pitchOffset),
            distanceOffset: lerp(left.camera.distanceOffset, right.camera.distanceOffset),
            panX: lerp(left.camera.panX, right.camera.panX),
            panY: lerp(left.camera.panY, right.camera.panY),
        });
    }

    private downloadBig3rMetadata(): void {
        if (!this.lastBig3rMetadata) return;
        const blob = new Blob([JSON.stringify(this.lastBig3rMetadata, null, 2)], {
            type: 'application/json',
        });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `m1as-big3r-${this.lastBig3rMetadata.recordingId}.json`;
        anchor.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    private startBig3rPreview(): void {
        if (this.big3rPreviewActive || this.big3rCameraLocked) return;

        this.big3rPreviewActive = true;

        this.proceduralPreviewStage?.classList.remove('is-hidden');
        this.proceduralCanvas.classList.remove('is-hidden');
        if (this.backdropVideo?.src) void this.backdropVideo.play().catch(() => {
            this.statusEl.textContent = 'Backdrop loaded but playback was blocked; press play in the backdrop preview.';
        });

        this.big3rControls?.classList.remove('is-hidden');

        this.advancedProcedural.setConfig({
            preset: 'big3r-tube-ceiling',
            loopDurationSec: 36,
            big3rAngle: (this.big3rAngleSelect?.value || 'ceiling') as Big3rCameraAngle,
            big3rGrowthDirection: (this.big3rDirectionSelect?.value || 'north') as Big3rGrowthDirection,
            big3rTrajectoryPreset: (this.big3rTrajectorySelect?.value || 'legacy-cardinal') as Big3rTrajectoryPreset,
            big3rMorphologyStyle: (this.big3rMorphologySelect?.value || 'elongated') as Big3rMorphologyStyle,
            big3rFramingMode: (this.big3rFramingSelect?.value || 'hybrid') as Big3rFramingMode,
        });

        this.advancedProcedural.setBig3rPreviewLoop(true);
        this.advancedProcedural.resetSimulation();
        this.advancedProcedural.startLoop();

        const targetCtx = this.proceduralCanvas.getContext('2d', {
            alpha: true,
        });

        const copyFrame = () => {
            if (!this.big3rPreviewActive || !targetCtx) return;

            targetCtx.clearRect(
                0,
                0,
                this.proceduralCanvas.width,
                this.proceduralCanvas.height,
            );

            targetCtx.drawImage(
                this.advancedProcedural.canvas,
                0,
                0,
                this.proceduralCanvas.width,
                this.proceduralCanvas.height,
            );

            this.big3rPreviewCopyRafId = requestAnimationFrame(copyFrame);
        };

        copyFrame();

        this.statusEl.textContent =
            'BIG3R preview playing — adjust the camera before recording.';
    }

    private stopBig3rPreview(): void {
        this.big3rPreviewActive = false;

        if (this.big3rPreviewCopyRafId !== null) {
            cancelAnimationFrame(this.big3rPreviewCopyRafId);
            this.big3rPreviewCopyRafId = null;
        }

        this.advancedProcedural.stopLoop();
        this.advancedProcedural.setBig3rPreviewLoop(false);
    }

    private bindBig3rOrbitControls(): void {
        const canvas = this.proceduralCanvas;

        canvas.style.touchAction = 'none';

        canvas.addEventListener('pointerdown', (event) => {
            if (
                this.sourceModeSelect.value !== 'procedural-big3r-tube-ceiling' ||
                this.big3rCameraLocked ||
                (event.button !== 0 && event.button !== 2)
            ) return;

            this.big3rPointerId = event.pointerId;
            this.big3rLastPointerX = event.clientX;
            this.big3rLastPointerY = event.clientY;
            this.big3rPanMode = event.button === 2 || event.shiftKey;

            try {
                canvas.setPointerCapture(event.pointerId);
            } catch {
                this.big3rPointerId = null;
                return;
            }
            event.preventDefault();
        });

        canvas.addEventListener('pointermove', (event) => {
            if (
                this.big3rPointerId !== event.pointerId ||
                this.big3rCameraLocked
            ) return;

            const rect = canvas.getBoundingClientRect();
            const dx = (event.clientX - this.big3rLastPointerX) * (canvas.width / Math.max(1, rect.width));
            const dy = (event.clientY - this.big3rLastPointerY) * (canvas.height / Math.max(1, rect.height));

            this.big3rLastPointerX = event.clientX;
            this.big3rLastPointerY = event.clientY;

            const current = this.advancedProcedural.getBig3rCameraState();

            if (this.big3rPanMode) {
                this.advancedProcedural.setBig3rCameraState({
                    panX: current.panX + dx,
                    panY: current.panY + dy,
                });
            } else {
                this.advancedProcedural.setBig3rCameraState({
                    yawOffset: current.yawOffset + dx * 0.008,
                    pitchOffset: current.pitchOffset + dy * 0.008,
                });
            }
            this.captureBig3rCameraKeyframe();
        });

        const releasePointer = (event: PointerEvent) => {
            if (this.big3rPointerId !== event.pointerId) return;
            this.big3rPointerId = null;
        };

        canvas.addEventListener('pointerup', releasePointer);
        canvas.addEventListener('pointercancel', releasePointer);
        canvas.addEventListener('lostpointercapture', releasePointer);
        canvas.addEventListener('contextmenu', (event) => {
            if (this.sourceModeSelect.value === 'procedural-big3r-tube-ceiling') event.preventDefault();
        });

        canvas.addEventListener('wheel', (event) => {
            if (
                this.sourceModeSelect.value !== 'procedural-big3r-tube-ceiling' ||
                this.big3rCameraLocked
            ) return;

            event.preventDefault();

            const current = this.advancedProcedural.getBig3rCameraState();

            this.advancedProcedural.setBig3rCameraState({
                distanceOffset: current.distanceOffset + event.deltaY * 0.35,
            });
            this.captureBig3rCameraKeyframe();
        }, { passive: false });
    }

    constructor(hooks: VfxRecorderHooks) {
        this.hooks = hooks;
        this.big3rCompositeCanvas.width = this.proceduralCanvas.width;
        this.big3rCompositeCanvas.height = this.proceduralCanvas.height;
        this.advancedProcedural = new ProceduralVfxCanvas(
            this.proceduralCanvas.width,
            this.proceduralCanvas.height,
        );
        this.bindEvents();
        this.bindBig3rOrbitControls();
        this.refreshBig3rCameraPresetSelect();
    }

    private sanitizeBackdropUrl(raw: string): string {
        try {
            const url = new URL(raw);
            return `${url.protocol}//${url.host}${url.pathname}`;
        } catch {
            return raw.split('?')[0].split('#')[0];
        }
    }

    private loadBackdropUrl(): void {
        const raw = this.backdropUrlInput?.value.trim();
        if (!raw || !this.backdropVideo) {
            this.statusEl.textContent = 'Enter a valid streamed video URL first.';
            return;
        }
        this.releaseBackdropObjectUrl();
        this.backdropVideo.pause();
        if (this.big3rOutputModeSelect?.value === 'composite') {
            this.backdropVideo.crossOrigin = 'anonymous';
        } else {
            this.backdropVideo.removeAttribute('crossorigin');
        }
        this.backdropVideo.src = raw;
        this.backdropVideo.load();
        this.backdropVideo.onloadeddata = () => {
            this.backdropDescriptor = { kind: 'url', source: this.sanitizeBackdropUrl(raw) };
            void this.backdropVideo?.play().catch(() => {
                this.statusEl.textContent = 'Backdrop loaded. Browser autoplay was blocked; start playback in the preview.';
            });
            this.statusEl.textContent = 'Streamed backdrop loaded behind the isolated alpha VFX canvas.';
        };
        this.backdropVideo.onerror = () => {
            this.statusEl.textContent = 'Backdrop could not be loaded. Check the URL, media format, and server access.';
        };
    }

    private loadBackdropFile(): void {
        const file = this.backdropFileInput?.files?.[0];
        if (!file || !this.backdropVideo) return;
        if (!file.type.startsWith('video/')) {
            this.statusEl.textContent = 'The backdrop file must be a video (WebM or MP4).';
            return;
        }
        this.releaseBackdropObjectUrl();
        this.backdropObjectUrl = URL.createObjectURL(file);
        this.backdropVideo.pause();
        this.backdropVideo.removeAttribute('crossorigin');
        this.backdropVideo.src = this.backdropObjectUrl;
        this.backdropVideo.load();
        this.backdropVideo.onloadeddata = () => {
            this.backdropDescriptor = { kind: 'file', source: file.name };
            void this.backdropVideo?.play().catch(() => undefined);
            this.statusEl.textContent = `Backdrop loaded: ${file.name}. Alpha recording remains isolated.`;
        };
        this.backdropVideo.onerror = () => {
            this.statusEl.textContent = 'Selected backdrop video could not be decoded by this browser.';
        };
    }

    private releaseBackdropObjectUrl(): void {
        if (this.backdropObjectUrl) {
            URL.revokeObjectURL(this.backdropObjectUrl);
            this.backdropObjectUrl = null;
        }
    }

    private clearBackdrop(): void {
        if (this.backdropVideo) {
            this.backdropVideo.pause();
            this.backdropVideo.removeAttribute('src');
            this.backdropVideo.load();
            this.backdropVideo.onloadeddata = null;
            this.backdropVideo.onerror = null;
        }
        this.releaseBackdropObjectUrl();
        this.backdropDescriptor = { kind: 'none', source: null };
        if (this.backdropFileInput) this.backdropFileInput.value = '';
        this.statusEl.textContent = 'Backdrop cleared. The foreground canvas remains transparent.';
    }

    private bindEvents(): void {

        this.sourceModeSelect.addEventListener('change', () => {
            const isBig3r =
                this.sourceModeSelect.value === 'procedural-big3r-tube-ceiling';

            if (isBig3r) {
                this.startBig3rPreview();
            } else {
                this.stopBig3rPreview();
                this.big3rCameraLocked = false;
                this.big3rPointerId = null;
                this.proceduralCanvas.classList.add('is-hidden');
                this.proceduralPreviewStage?.classList.add('is-hidden');
                this.big3rControls?.classList.add('is-hidden');
            }
        });

        this.big3rAngleSelect?.addEventListener('change', () => {
            this.advancedProcedural.setConfig({
                preset: 'big3r-tube-ceiling',
                big3rAngle: this.big3rAngleSelect!.value as Big3rCameraAngle,
            });
            this.advancedProcedural.resetBig3rCameraState();
        });

        this.big3rTrajectorySelect?.addEventListener('change', () => {
            this.advancedProcedural.setConfig({
                preset: 'big3r-tube-ceiling',
                big3rTrajectoryPreset: this.big3rTrajectorySelect!.value as Big3rTrajectoryPreset,
            });
        });

        this.big3rMorphologySelect?.addEventListener('change', () => {
            this.advancedProcedural.setConfig({
                preset: 'big3r-tube-ceiling',
                big3rMorphologyStyle: this.big3rMorphologySelect!.value as Big3rMorphologyStyle,
            });
        });

        this.big3rDirectionSelect?.addEventListener('change', () => {
            this.advancedProcedural.setConfig({
                preset: 'big3r-tube-ceiling',
                big3rGrowthDirection: (this.big3rDirectionSelect!.value || 'north') as Big3rGrowthDirection,
            });
        });

        const updateAnchor = () => {
            this.advancedProcedural.setBig3rAnchorState({
                offsetX: Number(this.big3rAnchorXInput?.value ?? 0),
                offsetY: Number(this.big3rAnchorYInput?.value ?? 0),
            });
        };
        this.big3rAnchorXInput?.addEventListener('input', updateAnchor);
        this.big3rAnchorYInput?.addEventListener('input', updateAnchor);

        this.big3rFramingSelect?.addEventListener('change', () => {
            this.advancedProcedural.setConfig({
                preset: 'big3r-tube-ceiling',
                big3rFramingMode: this.big3rFramingSelect!.value as Big3rFramingMode,
            });
        });

        this.big3rResetCameraBtn?.addEventListener('click', () => this.resetBig3rCamera());
        this.big3rSaveCameraBtn?.addEventListener('click', () => this.saveBig3rCameraPreset());
        this.big3rLoadCameraBtn?.addEventListener('click', () => this.loadBig3rCameraPreset());
        this.big3rDeleteCameraBtn?.addEventListener('click', () => this.deleteBig3rCameraPreset());
        this.big3rMotionStartBtn?.addEventListener('click', () => this.startBig3rMotionCapture());
        this.backdropLoadBtn?.addEventListener('click', () => this.loadBackdropUrl());
        this.backdropClearBtn?.addEventListener('click', () => this.clearBackdrop());
        this.big3rOutputModeSelect?.addEventListener('change', () => {
            if (this.backdropDescriptor.kind === 'url') this.loadBackdropUrl();
            else if (this.backdropDescriptor.kind === 'file') this.loadBackdropFile();
        });
        this.backdropFileInput?.addEventListener('change', () => this.loadBackdropFile());
        this.big3rMotionStopBtn?.addEventListener('click', () => this.stopBig3rMotionCapture());
        this.big3rMotionClearBtn?.addEventListener('click', () => this.clearBig3rMotionCapture());
        this.big3rMetadataDownloadBtn?.addEventListener('click', () => this.downloadBig3rMetadata());



        this.alphaBgCheckbox.addEventListener('change', () => {
            if (this.sourceModeSelect.value === 'big3r') {
                this.hooks.setBig3rTransparentBg(this.alphaBgCheckbox.checked);
            } else {
                this.hooks.setCcsaTransparentBg(this.alphaBgCheckbox.checked);
            }
        });

        this.viscositySlider?.addEventListener('input', () => {
            const val = parseFloat(this.viscositySlider!.value);

            if (!Number.isNaN(val)) {
                if (this.viscosityValEl) this.viscosityValEl.textContent = val.toFixed(2);
                this.advancedProcedural.setConfig({ viscosity: val });
            }
        });

        this.startBtn.addEventListener('click', () => this.startRecording());

        this.stopBtn.addEventListener('click', () => {
            if (this.sourceModeSelect.value === 'procedural-big3r-tube-ceiling') {
                this.big3rStopReason = 'user';
            }
            this.advancedProcedural.stopLoop();

            if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
                this.mediaRecorder.stop();
            }
        });

        this.downloadBtn.addEventListener('click', () => {
            if (!this.lastRecordedBlobUrl) return;

            const a = document.createElement('a');
            a.href = this.lastRecordedBlobUrl;
            a.download = this.lastBig3rMetadata
                ? `m1as-big3r-${this.lastBig3rMetadata.recordingId}.webm`
                : `m1as-${this.sourceModeSelect.value}-${Date.now()}.webm`;
            a.click();
        });

        this.bindCcsaBtn.addEventListener('click', async () => {
            if (!this.lastRecordedBlobUrl || !this.hooks.getCcsaCanvas()) {
                alert('Ensure a .glb is active in CCSA and you have recorded a .webm clip.');
                return;
            }

            await this.hooks.bindCcsaClickVfxWebm(this.lastRecordedBlobUrl);
            this.statusEl.textContent = '⚡ Recorded .webm bound to CCSA .glb click!';
        });

        this.bindBig3rBtn?.addEventListener('click', async () => {
            if (!this.lastRecordedBlobUrl || !this.hooks.getBig3rCanvas()) {
                alert('Launch the BIG3R VFX Stage and record a .webm clip first.');
                return;
            }

            await this.hooks.bindBig3rVfxWebm(this.lastRecordedBlobUrl);
            this.statusEl.textContent = '🍄 Bound recorded .webm directly into BIG3R Growth & Prop-Break VFX!';
        });
    }

    private startRecording(): void {
        const mode = this.sourceModeSelect.value;
        let targetCanvas: HTMLCanvasElement | null = null;

        const isProceduralBig3r =
            mode === 'procedural-big3r-tube-ceiling';

        if (isProceduralBig3r) {
            if (this.big3rMotionCaptureActive) this.stopBig3rMotionCapture();
            this.stopBig3rPreview();
            this.lastBig3rMetadata = null;
            if (this.big3rMetadataDownloadBtn) this.big3rMetadataDownloadBtn.disabled = true;

            this.big3rCameraLocked = true;
            this.proceduralCanvas.classList.remove('is-hidden');
            this.big3rControls?.classList.add('is-disabled');
        }

        if (mode === 'big3r') {
            targetCanvas = this.hooks.getBig3rCanvas();

            if (!targetCanvas) {
                alert('Launch the BIG3R VFX Stage first!');
                return;
            }

            this.hooks.setBig3rTransparentBg(this.alphaBgCheckbox.checked);
        } else if (mode === 'ccsa') {
            targetCanvas = this.hooks.getCcsaCanvas();

            if (!targetCanvas) {
                alert('Stream a .glb asset into the CCSA stage first!');
                return;
            }

            this.hooks.setCcsaTransparentBg(this.alphaBgCheckbox.checked);
        } else {
            targetCanvas = this.proceduralCanvas;
            targetCanvas.classList.remove('is-hidden');
            if (mode.startsWith('procedural-')) this.proceduralPreviewStage?.classList.remove('is-hidden');
        }

        const big3rOutputMode: 'foreground' | 'composite' = isProceduralBig3r && this.big3rOutputModeSelect?.value === 'composite'
            ? 'composite'
            : 'foreground';
        if (isProceduralBig3r && big3rOutputMode === 'composite') {
            targetCanvas = this.big3rCompositeCanvas;
            // Reset the canvas origin-clean flag before preflighting a remote video frame.
            targetCanvas.width = this.proceduralCanvas.width;
            targetCanvas.height = this.proceduralCanvas.height;
            const compositeCtx = targetCanvas.getContext('2d', { alpha: false });
            if (!compositeCtx) {
                this.big3rCameraLocked = false;
                this.big3rControls?.classList.remove('is-disabled');
                this.startBig3rPreview();
                this.statusEl.textContent = 'Composite canvas could not be initialized. Choose Transparent foreground instead.';
                return;
            }
            if (this.backdropVideo?.src) {
                if (this.backdropVideo.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
                    this.big3rCameraLocked = false;
                    this.big3rControls?.classList.remove('is-disabled');
                    this.startBig3rPreview();
                    this.statusEl.textContent = 'Wait for the backdrop video to finish loading before starting a composite recording.';
                    return;
                }
                compositeCtx.drawImage(this.backdropVideo, 0, 0, targetCanvas.width, targetCanvas.height);
            } else {
                compositeCtx.fillStyle = '#0f172a';
                compositeCtx.fillRect(0, 0, targetCanvas.width, targetCanvas.height);
            }
            if (this.backdropVideo?.src && this.backdropVideo.paused) {
                void this.backdropVideo.play().catch(() => undefined);
            }
        }

        const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
            ? 'video/webm;codecs=vp9'
            : 'video/webm';

        let stream: MediaStream;
        try {
            stream = targetCanvas.captureStream(60);
        } catch (error) {
            if (isProceduralBig3r && big3rOutputMode === 'composite') {
                this.big3rCameraLocked = false;
                this.big3rControls?.classList.remove('is-disabled');
                this.startBig3rPreview();
                this.statusEl.textContent = 'Composite capture failed. The backdrop may not allow cross-origin canvas capture; choose Transparent foreground or enable CORS on the media host.';
                return;
            }
            throw error;
        }
        this.recordedChunks = [];
        this.mediaRecorder = new MediaRecorder(stream, {
            mimeType,
            videoBitsPerSecond: 4000000,
        });

        this.mediaRecorder.ondataavailable = (e: BlobEvent) => {
            if (e.data && e.data.size > 0) {
                this.recordedChunks.push(e.data);
            }
        };

        this.mediaRecorder.onstop = () => {
            const blob = new Blob(this.recordedChunks, { type: 'video/webm' });

            if (mode === 'procedural-big3r-tube-ceiling' && this.big3rRecordingId && this.lastBig3rCameraSnapshot) {
                const durationMs = Math.max(0, Math.round(performance.now() - this.big3rRecordingStartedPerf));
                this.lastBig3rMetadata = {
                    schemaVersion: 5,
                    outputMode: big3rOutputMode,
                    recordingId: this.big3rRecordingId,
                    source: 'procedural-big3r-tube-ceiling',
                    growthDirection: this.lastBig3rCameraSnapshot.growthDirection,
                    trajectory: this.getBig3rTrajectorySnapshot(),
                    anchor: this.lastBig3rCameraSnapshot.anchor,
                    startedAt: this.big3rRecordingStartedAt,
                    durationMs,
                    completed: this.big3rStopReason === 'completed',
                    stopReason: this.big3rStopReason,
                    width: targetCanvas?.width ?? 512,
                    height: targetCanvas?.height ?? 512,
                    requestedFrameRate: 60,
                    mimeType,
                    camera: this.lastBig3rCameraSnapshot,
                    backdrop: { ...this.recordingBackdrop },
                    cameraKeyframes: this.big3rCameraKeyframes.map(frame => ({
                        timeMs: frame.timeMs,
                        camera: { ...frame.camera },
                    })),
                };
                if (this.big3rMetadataDownloadBtn) this.big3rMetadataDownloadBtn.disabled = false;
            } else if (mode !== 'procedural-big3r-tube-ceiling') {
                this.lastBig3rMetadata = null;
                this.big3rRecordingId = null;
                if (this.big3rMetadataDownloadBtn) this.big3rMetadataDownloadBtn.disabled = true;
            }

            if (mode === 'procedural-big3r-tube-ceiling') {
                this.big3rCameraLocked = false;
                this.big3rControls?.classList.remove('is-disabled');
                this.startBig3rPreview();
            } else if (mode.startsWith('procedural-')) {
                targetCanvas?.classList.add('is-hidden');
                this.proceduralPreviewStage?.classList.add('is-hidden');
            }

            this.previewVideo.pause();
            this.previewVideo.removeAttribute('src');
            this.previewVideo.load();

            if (this.lastRecordedBlobUrl) {
                URL.revokeObjectURL(this.lastRecordedBlobUrl);
            }

            this.lastRecordedBlobUrl = URL.createObjectURL(blob);
            this.previewVideo.src = this.lastRecordedBlobUrl;
            this.previewBox.classList.add('is-visible');
            this.startBtn.disabled = false;
            this.stopBtn.disabled = true;
            this.big3rCameraLocked = false;

            if (mode.startsWith('procedural-') && mode !== 'procedural-big3r-tube-ceiling') {
                targetCanvas?.classList.add('is-hidden');
                this.proceduralPreviewStage?.classList.add('is-hidden');
            }

            this.statusEl.textContent = this.lastBig3rMetadata
                ? `Captured ${(blob.size / 1024).toFixed(1)} KB. Recording metadata ready (${this.lastBig3rMetadata.durationMs} ms, ${this.lastBig3rMetadata.cameraKeyframes.length} camera keyframes).`
                : `Captured ${(blob.size / 1024).toFixed(1)} KB (${mimeType}). Ready to download or bind!`;
        };

        this.startBtn.disabled = true;
        this.stopBtn.disabled = false;
        this.statusEl.textContent = `Recording ${mode} at 60 FPS...`;
        this.mediaRecorder.start();

        if (mode.startsWith('procedural-')) {
            const preset = mode.replace('procedural-', '') as ProceduralVfxPreset;

            const finishRecording = () => {
                window.setTimeout(() => {
                    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
                        this.mediaRecorder.stop();
                    }
                }, 80);
            };

            if (ADVANCED_PRESETS.has(preset)) {
                const viscosity = this.viscositySlider
                    ? parseFloat(this.viscositySlider.value)
                    : 0.9;

                const big3rAngle = (this.big3rAngleSelect?.value || 'ceiling') as Big3rCameraAngle;
                const big3rFramingMode = (this.big3rFramingSelect?.value || 'hybrid') as Big3rFramingMode;
                const isBig3r = preset === 'big3r-tube-ceiling';
                const clipDurationMs = isBig3r ? 36000 : 2000;




                this.advancedProcedural.setConfig({
                    preset,
                    viscosity: Number.isNaN(viscosity) ? 0.9 : viscosity,
                    loopDurationSec: isBig3r ? 36 : 2,
                    big3rAngle,
                    big3rGrowthDirection: (this.big3rDirectionSelect?.value || 'north') as Big3rGrowthDirection,
                    big3rTrajectoryPreset: (this.big3rTrajectorySelect?.value || 'legacy-cardinal') as Big3rTrajectoryPreset,
                    big3rMorphologyStyle: (this.big3rMorphologySelect?.value || 'elongated') as Big3rMorphologyStyle,
                    big3rFramingMode,
                });

                if (isBig3r) {
                    this.big3rRecordingId =
                        globalThis.crypto?.randomUUID?.() ??
                        `big3r-${Date.now()}`;
                    this.big3rRecordingStartedAt = new Date().toISOString();
                    this.big3rRecordingStartedPerf = performance.now();
                    this.big3rStopReason = 'unknown';
                    this.recordingBackdrop = { ...this.backdropDescriptor };
                    this.lastBig3rCameraSnapshot = {
                        preset: 'big3r-tube-ceiling',
                        angle: big3rAngle,
                        growthDirection: (this.big3rDirectionSelect?.value || 'north') as Big3rGrowthDirection,
                        trajectoryPreset: (this.big3rTrajectorySelect?.value || 'legacy-cardinal') as Big3rTrajectoryPreset,
                        morphologyStyle: (this.big3rMorphologySelect?.value || 'elongated') as Big3rMorphologyStyle,
                        anchor: this.advancedProcedural.getBig3rAnchorState(),
                        framing: big3rFramingMode,
                        camera: this.advancedProcedural.getBig3rCameraState(),
                    };
                    // Camera is locked against manual input, but a captured motion take
                    // is still applied by the recording frame loop below.
                    this.big3rCameraLocked = true;
                }

                this.advancedProcedural.resetSimulation();
                this.advancedProcedural.startLoop();

                const targetCtx = targetCanvas?.getContext('2d', { alpha: true });
                const clipStartedAt = performance.now();

                const copyAdvancedFrame = (now: number) => {
                    if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
                        this.advancedProcedural.stopLoop();
                        return;
                    }

                    if (isBig3r && this.big3rCameraKeyframes.length > 0) {
                        this.applyBig3rCameraMotion(now - clipStartedAt);
                    }

                    if (targetCtx && targetCanvas) {
                        targetCtx.clearRect(0, 0, targetCanvas.width, targetCanvas.height);
                        if (isBig3r && big3rOutputMode === 'composite') {
                            if (this.backdropVideo && this.backdropVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
                                targetCtx.drawImage(this.backdropVideo, 0, 0, targetCanvas.width, targetCanvas.height);
                            } else {
                                targetCtx.fillStyle = '#0f172a';
                                targetCtx.fillRect(0, 0, targetCanvas.width, targetCanvas.height);
                            }
                        }
                        targetCtx.drawImage(
                            this.advancedProcedural.canvas,
                            0,
                            0,
                            targetCanvas.width,
                            targetCanvas.height,
                        );
                    }

                    if (now - clipStartedAt < clipDurationMs) {
                        requestAnimationFrame(copyAdvancedFrame);
                    } else {
                        this.big3rStopReason = isBig3r ? 'completed' : 'unknown';
                        this.advancedProcedural.stopLoop();
                        finishRecording();
                    }
                };

                requestAnimationFrame(copyAdvancedFrame);
            } else {
                this.runProceduralVfxClip(targetCanvas!, preset, finishRecording);
            }
        }
    }

    private runProceduralVfxClip(
        canvas: HTMLCanvasElement,
        preset: string,
        onComplete?: () => void,
    ): void {
        const ctx = canvas.getContext('2d', { alpha: true });
        if (!ctx) return;

        const W = canvas.width;
        const H = canvas.height;
        const CX = W / 2;
        const CY = H / 2;
        const durationMs = preset === 'collapse' ? 1800 : 1500;
        const particles: VfxParticle[] = [];

        for (let i = 0; i < 75; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 2 + Math.random() * 8;

            particles.push({
                x: CX + (preset === 'growth' ? Math.cos(angle) * (20 + Math.random() * 90) : 0),
                y: CY + (preset === 'growth' ? 60 : 0),
                vx: preset === 'growth' ? (Math.random() - 0.5) * 1.5 : Math.cos(angle) * speed,
                vy: preset === 'growth' ? -3 - Math.random() * 4 : Math.sin(angle) * speed,
                size: preset === 'collapse' ? 10 + Math.random() * 18 : 5 + Math.random() * 10,
                hue: preset === 'fireball' ? 15 + Math.random() * 35 : 148 + Math.random() * 30,
                maxLife: 0.65 + Math.random() * 0.35,
            });
        }

        const start = performance.now();

        const tick = (now: number) => {
            const progress = Math.min(1, (now - start) / durationMs);
            ctx.clearRect(0, 0, W, H);

            for (let r = 0; r < 3; r++) {
                const lp = Math.max(0, Math.min(1, (progress - r * 0.14) / 0.72));

                if (lp > 0 && lp < 1) {
                    ctx.beginPath();
                    ctx.arc(CX, CY, 25 + lp * 200, 0, Math.PI * 2);
                    ctx.strokeStyle =
                        preset === 'fireball'
                            ? `rgba(251, 146, 60, ${(1 - lp) * 0.85})`
                            : preset === 'collapse'
                                ? `rgba(148, 163, 184, ${(1 - lp) * 0.85})`
                                : `rgba(16, 185, 129, ${(1 - lp) * 0.85})`;

                    ctx.lineWidth = 8 * (1 - lp);
                    ctx.stroke();
                }
            }

            for (const p of particles) {
                p.x += p.vx;
                p.y += p.vy;

                const alpha = Math.max(0, 1 - progress / p.maxLife);
                if (alpha <= 0) continue;

                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size * (1 - progress * 0.35), 0, Math.PI * 2);
                ctx.fillStyle =
                    preset === 'collapse'
                        ? `rgba(203, 213, 225, ${alpha})`
                        : `hsla(${p.hue}, 95%, 62%, ${alpha})`;
                ctx.fill();
            }

            if (progress < 1) {
                requestAnimationFrame(tick);
            } else {
                ctx.clearRect(0, 0, W, H);
                onComplete?.();
            }
        };

        requestAnimationFrame(tick);
    }


    public destroy(): void {
        this.advancedProcedural.destroy();
        this.clearBackdrop();
        this.previewVideo.pause();
        this.previewVideo.removeAttribute('src');
        this.previewVideo.load();
        this.big3rCameraLocked = false;
        this.big3rPointerId = null;

        if (this.lastRecordedBlobUrl) {
            URL.revokeObjectURL(this.lastRecordedBlobUrl);
            this.lastRecordedBlobUrl = null;
        }
    }
}
