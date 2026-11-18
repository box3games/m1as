import {
  ProceduralVfxCanvas,
  type ProceduralVfxPreset,
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
  private readonly startBtn = document.getElementById('startRecBtn') as HTMLButtonElement;
  private readonly stopBtn = document.getElementById('stopRecBtn') as HTMLButtonElement;
  private readonly proceduralCanvas = document.getElementById('proceduralVfxCanvas') as HTMLCanvasElement;
  private readonly previewBox = document.getElementById('recPreviewBox') as HTMLElement;
  private readonly previewVideo = document.getElementById('recPreviewVideo') as HTMLVideoElement;
  private readonly downloadBtn = document.getElementById('downloadRecBtn') as HTMLButtonElement;
  private readonly bindCcsaBtn = document.getElementById('bindRecClickVfxBtn') as HTMLButtonElement;
  private readonly bindBig3rBtn = document.getElementById('bindRecBig3rVfxBtn') as HTMLButtonElement | null;
  private readonly statusEl = document.getElementById('recStatus') as HTMLElement;

  constructor(hooks: VfxRecorderHooks) {
    this.hooks = hooks;
    this.advancedProcedural = new ProceduralVfxCanvas(this.proceduralCanvas.width);
    this.bindEvents();
  }

  private bindEvents(): void {
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
    this.mediaRecorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 4000000 });

    this.mediaRecorder.ondataavailable = (e: BlobEvent) => {
      if (e.data && e.data.size > 0) {
        this.recordedChunks.push(e.data);
      }
    };

    this.mediaRecorder.onstop = () => {
      const blob = new Blob(this.recordedChunks, { type: 'video/webm' });
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
      if (mode.startsWith('procedural-')) {
        targetCanvas?.classList.add('is-hidden');
      }
      this.statusEl.textContent = `Captured ${(blob.size / 1024).toFixed(1)} KB (${mimeType}). Ready to download or bind!`;
    };

    this.startBtn.disabled = true;
    this.stopBtn.disabled = false;
    this.statusEl.textContent = `Recording ${mode} at 60 FPS...`;
    this.mediaRecorder.start();

    if (mode.startsWith('procedural-')) {
      const preset = mode.replace('procedural-', '');
      const finishRecording = () => {
        window.setTimeout(() => {
          if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            this.mediaRecorder.stop();
          }
        }, 80);
      };

      if (ADVANCED_PRESETS.has(preset as ProceduralVfxPreset)) {
        const viscosity = this.viscositySlider ? parseFloat(this.viscositySlider.value) : 0.9;
        this.advancedProcedural.setConfig({
          preset: preset as ProceduralVfxPreset,
          viscosity: Number.isNaN(viscosity) ? 0.9 : viscosity,
          loopDurationSec: 2.0,
        });
        this.advancedProcedural.resetSimulation();
        this.advancedProcedural.startLoop();

        const targetCtx = targetCanvas?.getContext('2d', { alpha: true });
        const clipStartedAt = performance.now();
        const copyAdvancedFrame = (now: number) => {
          if (targetCtx && targetCanvas) {
            targetCtx.clearRect(0, 0, targetCanvas.width, targetCanvas.height);
            targetCtx.drawImage(this.advancedProcedural.canvas, 0, 0, targetCanvas.width, targetCanvas.height);
          }

          if (now - clipStartedAt < 2000) {
            requestAnimationFrame(copyAdvancedFrame);
          } else {
            this.advancedProcedural.stopLoop();
            finishRecording();
          }
        };
        requestAnimationFrame(copyAdvancedFrame);
      } else {
        this.runProceduralVfxClip(targetCanvas, preset, finishRecording);
      }
    }
  }

  private runProceduralVfxClip(canvas: HTMLCanvasElement, preset: string, onComplete?: () => void): void {
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
    if (this.lastRecordedBlobUrl) {
      URL.revokeObjectURL(this.lastRecordedBlobUrl);
      this.lastRecordedBlobUrl = null;
    }
  }
}
