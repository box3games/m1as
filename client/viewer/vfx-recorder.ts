
import {
    ProceduralVfxCanvas,
    type ProceduralVfxPreset,
    type Big3rCameraAngle,
    type Big3rFramingMode,
    type Big3rCameraState,
    type Big3rCameraSnapshot,
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
    private readonly big3rFramingSelect = document.getElementById('recBig3rFraming') as HTMLSelectElement | null;
    private readonly big3rControls = document.getElementById('recBig3rControls') as HTMLElement | null;
    private readonly startBtn = document.getElementById('startRecBtn') as HTMLButtonElement;
    private readonly stopBtn = document.getElementById('stopRecBtn') as HTMLButtonElement;
    private readonly proceduralCanvas = document.getElementById('proceduralVfxCanvas') as HTMLCanvasElement;
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
    private lastBig3rCameraSnapshot: Big3rCameraSnapshot | null = null;

    private big3rPreviewActive = false;
    private big3rPreviewCopyRafId: number | null = null;

    private startBig3rPreview(): void {
        if (this.big3rPreviewActive || this.big3rCameraLocked) return;

        this.big3rPreviewActive = true;

        this.proceduralCanvas.classList.remove('is-hidden');

        this.big3rControls?.classList.remove('is-hidden');

        this.advancedProcedural.setConfig({
            preset: 'big3r-tube-ceiling',
            loopDurationSec: 36,
            big3rAngle: (this.big3rAngleSelect?.value || 'ceiling') as Big3rCameraAngle,
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
                this.big3rCameraLocked
            ) return;

            this.big3rPointerId = event.pointerId;
            this.big3rLastPointerX = event.clientX;
            this.big3rLastPointerY = event.clientY;
            this.big3rPanMode = event.button === 2 || event.shiftKey;

            canvas.setPointerCapture(event.pointerId);
            event.preventDefault();
        });

        canvas.addEventListener('pointermove', (event) => {
            if (
                this.big3rPointerId !== event.pointerId ||
                this.big3rCameraLocked
            ) return;

            const dx = event.clientX - this.big3rLastPointerX;
            const dy = event.clientY - this.big3rLastPointerY;

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
        });

        const releasePointer = (event: PointerEvent) => {
            if (this.big3rPointerId !== event.pointerId) return;
            this.big3rPointerId = null;
        };

        canvas.addEventListener('pointerup', releasePointer);
        canvas.addEventListener('pointercancel', releasePointer);
        canvas.addEventListener('contextmenu', (event) => event.preventDefault());

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
        }, { passive: false });
    }

    constructor(hooks: VfxRecorderHooks) {
        this.hooks = hooks;
        this.advancedProcedural = new ProceduralVfxCanvas(
            this.proceduralCanvas.width,
            this.proceduralCanvas.height,
        );
        this.bindEvents();
        this.bindBig3rOrbitControls();
    }

    private bindEvents(): void {

        this.sourceModeSelect.addEventListener('change', () => {
            const isBig3r =
                this.sourceModeSelect.value === 'procedural-big3r-tube-ceiling';

            if (isBig3r) {
                this.startBig3rPreview();
            } else {
                this.stopBig3rPreview();

                this.proceduralCanvas.classList.add('is-hidden');
                this.big3rControls?.classList.add('is-hidden');
            }
        });



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
            this.advancedProcedural.stopLoop();

            if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
                this.mediaRecorder.stop();
            }
        });

        this.downloadBtn.addEventListener('click', () => {
            if (!this.lastRecordedBlobUrl) return;

            const a = document.createElement('a');
            a.href = this.lastRecordedBlobUrl;
            a.download = `m1as-${this.sourceModeSelect.value}-${Date.now()}.webm`;
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
            this.stopBig3rPreview();

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
        }

        const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
            ? 'video/webm;codecs=vp9'
            : 'video/webm';

        const stream = targetCanvas.captureStream(60);
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

            if (mode === 'procedural-big3r-tube-ceiling') {
            this.big3rCameraLocked = false;
            this.big3rControls?.classList.remove('is-disabled');

            this.startBig3rPreview();
            } else if (mode.startsWith('procedural-')) {
            targetCanvas?.classList.add('is-hidden');
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

            if (mode.startsWith('procedural-')) {
                targetCanvas?.classList.add('is-hidden');
            }

            this.statusEl.textContent =
                `Captured ${(blob.size / 1024).toFixed(1)} KB (${mimeType}). Ready to download or bind!`;
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

            if (preset === 'big3r-tube-ceiling') {
                this.advancedProcedural.setConfig({
                    preset: 'big3r-tube-ceiling',
                    loopDurationSec: 36,
                    big3rAngle: (this.big3rAngleSelect?.value || 'ceiling') as Big3rCameraAngle,
                    big3rFramingMode: (this.big3rFramingSelect?.value || 'hybrid') as Big3rFramingMode,
                });

                this.advancedProcedural.setBig3rPreviewLoop(false);
                this.advancedProcedural.resetSimulation();
                this.advancedProcedural.startLoop();

                const targetCtx = targetCanvas?.getContext('2d', {
                    alpha: true,
                });

                const clipStartedAt = performance.now();

                const copyBig3rFrame = (now: number) => {
                    if (!targetCtx || !targetCanvas) return;

                    targetCtx.clearRect(
                        0,
                        0,
                        targetCanvas.width,
                        targetCanvas.height,
                    );

                    targetCtx.drawImage(
                        this.advancedProcedural.canvas,
                        0,
                        0,
                        targetCanvas.width,
                        targetCanvas.height,
                    );

                    if (
                        now - clipStartedAt < 36000 &&
                        this.mediaRecorder?.state === 'recording'
                    ) {
                        requestAnimationFrame(copyBig3rFrame);
                    } else {
                        this.advancedProcedural.stopLoop();
                        finishRecording();
                    }
                };

                requestAnimationFrame(copyBig3rFrame);
            }

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
                    big3rFramingMode,
                });

                if (isBig3r) {
                    this.big3rRecordingId =
                        globalThis.crypto?.randomUUID?.() ??
                        `big3r-${Date.now()}`;

                    this.lastBig3rCameraSnapshot = {
                        preset: 'big3r-tube-ceiling',
                        angle: big3rAngle,
                        framing: big3rFramingMode,
                        camera: this.advancedProcedural.getBig3rCameraState(),
                    };

                    // Keep the selected camera configuration fixed throughout capture.
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

                    if (targetCtx && targetCanvas) {
                        targetCtx.clearRect(0, 0, targetCanvas.width, targetCanvas.height);
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
