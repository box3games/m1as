export type ProceduralVfxPreset =
    | 'magic-smoke'
    | 'lightning'
    | 'metaball-fluid'
    | 'goo-pour'
    | 'spinning-coin'
    | 'spinning-skull';

export interface ProceduralVfxConfig {
    preset: ProceduralVfxPreset;
    /** 0.0 (watery, >=15deg dispersion) to 1.0 (thick goo, <=2deg dispersion, high cohesion) */
    viscosity: number;
    primaryColor: string;
    secondaryColor: string;
    loopDurationSec: number;
}

interface FluidParticle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    radius: number;
    life: number;
    maxLife: number;
}

interface SmokeParticle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    size: number;
    alpha: number;
    seed: number;
}

export class ProceduralVfxCanvas {
    public readonly canvas: HTMLCanvasElement;
    private readonly ctx: CanvasRenderingContext2D;
    private readonly offscreen: HTMLCanvasElement;
    private readonly offCtx: CanvasRenderingContext2D;

    private config: ProceduralVfxConfig = {
        preset: 'metaball-fluid',
        viscosity: 0.9,
        primaryColor: '#a855f7',
        secondaryColor: '#38bdf8',
        loopDurationSec: 2.0,
    };

    private fluidParticles: FluidParticle[] = [];
    private smokeParticles: SmokeParticle[] = [];
    private elapsedSec = 0;
    private rafId: number | null = null;
    private lastTimestamp = 0;

    constructor(width = 512, height = 512) {
        this.canvas = document.createElement('canvas');
        this.canvas.width = width;
        this.canvas.height = height;
        this.ctx = this.canvas.getContext('2d', { alpha: true })!;

        this.offscreen = document.createElement('canvas');
        this.offscreen.width = width;
        this.offscreen.height = height;
        this.offCtx = this.offscreen.getContext('2d', { alpha: true })!;
    }

    public setConfig(partial: Partial<ProceduralVfxConfig>): void {
        const prevPreset = this.config.preset;
        this.config = {
            ...this.config,
            ...partial,
            viscosity: Math.max(0, Math.min(1, partial.viscosity ?? this.config.viscosity)),
        };
        if (partial.preset && partial.preset !== prevPreset) {
            this.resetSimulation();
        }
    }

    public getConfig(): ProceduralVfxConfig {
        return { ...this.config };
    }

    public resetSimulation(): void {
        this.elapsedSec = 0;
        this.fluidParticles = [];
        this.smokeParticles = [];
    }

    public startLoop(): void {
        if (this.rafId !== null) return;
        this.lastTimestamp = performance.now();
        const tick = (now: number) => {
            const dt = Math.min(0.05, Math.max(0.001, (now - this.lastTimestamp) / 1000));
            this.lastTimestamp = now;
            this.step(dt);
            this.rafId = requestAnimationFrame(tick);
        };
        this.rafId = requestAnimationFrame(tick);
    }

    public stopLoop(): void {
        if (this.rafId !== null) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
    }

    public step(dt: number): void {
        this.elapsedSec += dt;
        const { width, height } = this.canvas;
        this.ctx.clearRect(0, 0, width, height);

        switch (this.config.preset) {
            case 'magic-smoke':
                this.renderMagicSmoke(dt);
                break;
            case 'lightning':
                this.renderMidpointLightning();
                break;
            case 'metaball-fluid':
                this.renderMetaballFluid(dt, false);
                break;
            case 'goo-pour':
                this.renderMetaballFluid(dt, true);
                break;
            case 'spinning-coin':
                this.renderSpinningCoin();
                break;
            case 'spinning-skull':
                this.renderSpinningSkull();
                break;
        }
    }

    // 1. Additive Purple Magic Smoke
    private renderMagicSmoke(dt: number): void {
        const { width, height } = this.canvas;
        if (this.smokeParticles.length < 90) {
            this.smokeParticles.push({
                x: width * 0.5 + (Math.random() - 0.5) * 44,
                y: height * 0.82,
                vx: (Math.random() - 0.5) * 28,
                vy: -(55 + Math.random() * 65),
                size: 26 + Math.random() * 34,
                alpha: 0.55,
                seed: Math.random() * Math.PI * 2,
            });
        }

        this.ctx.save();
        this.ctx.globalCompositeOperation = 'lighter';

        for (let i = this.smokeParticles.length - 1; i >= 0; i--) {
            const p = this.smokeParticles[i];
            p.seed += dt * 3.2;
            p.x += (p.vx + Math.sin(p.seed) * 32) * dt;
            p.y += p.vy * dt;
            p.size += 24 * dt;
            p.alpha -= 0.28 * dt;

            if (p.alpha <= 0.01 || p.y < -p.size) {
                this.smokeParticles.splice(i, 1);
                continue;
            }

            const grad = this.ctx.createRadialGradient(p.x, p.y, 2, p.x, p.y, p.size);
            grad.addColorStop(0, `rgba(192, 132, 252, ${p.alpha.toFixed(3)})`);
            grad.addColorStop(0.5, `rgba(126, 34, 206, ${(p.alpha * 0.55).toFixed(3)})`);
            grad.addColorStop(1, 'rgba(88, 28, 135, 0)');

            this.ctx.fillStyle = grad;
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            this.ctx.fill();
        }
        this.ctx.restore();
    }

    // 2. Recursive Midpoint-Displacement Lightning
    private renderMidpointLightning(): void {
        const { width, height } = this.canvas;
        const drawBolt = (
            x1: number,
            y1: number,
            x2: number,
            y2: number,
            displace: number,
            points: Array<{ x: number; y: number }>
        ) => {
            if (displace < 4) {
                points.push({ x: x2, y: y2 });
                return;
            }
            const midX = (x1 + x2) * 0.5 + (Math.random() - 0.5) * displace;
            const midY = (y1 + y2) * 0.5 + (Math.random() - 0.5) * displace;
            drawBolt(x1, y1, midX, midY, displace * 0.52, points);
            drawBolt(midX, midY, x2, y2, displace * 0.52, points);
        };

        const pts: Array<{ x: number; y: number }> = [{ x: width * 0.5, y: height * 0.08 }];
        drawBolt(width * 0.5, height * 0.08, width * 0.5, height * 0.92, 135, pts);

        this.ctx.save();
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';

        // Outer glow
        this.ctx.strokeStyle = this.config.primaryColor;
        this.ctx.shadowColor = this.config.secondaryColor;
        this.ctx.shadowBlur = 22;
        this.ctx.lineWidth = 8;
        this.strokePolyline(pts);

        // Core hot arc
        this.ctx.strokeStyle = '#ffffff';
        this.ctx.shadowBlur = 8;
        this.ctx.lineWidth = 2.5;
        this.strokePolyline(pts);
        this.ctx.restore();
    }

    private strokePolyline(pts: Array<{ x: number; y: number }>): void {
        this.ctx.beginPath();
        for (let i = 0; i < pts.length; i++) {
            if (i === 0) this.ctx.moveTo(pts[i].x, pts[i].y);
            else this.ctx.lineTo(pts[i].x, pts[i].y);
        }
        this.ctx.stroke();
    }

    // 3 & 4. 2D Metaball Fluid & Thick Goo/Jelly Pour (Viscosity 0.0 - 1.0)
    private renderMetaballFluid(dt: number, isGooPour: boolean): void {
        const { width, height } = this.canvas;
        const v = isGooPour ? Math.max(0.85, this.config.viscosity) : this.config.viscosity;

        // Viscosity mapping:
        // v=0.90 -> <=2 deg dispersion, high cohesion, tight stream, top specular
        // v=0.10 -> >=15 deg dispersion, high velocity, spray spread
        const spreadDeg = 18 * (1 - v) + 1.2;
        const spreadRad = (spreadDeg * Math.PI) / 180;
        const baseSpeed = 160 + (1 - v) * 260;
        const cohesion = 0.04 + v * 0.22;

        const spawnCount = isGooPour ? 4 : 3;
        for (let s = 0; s < spawnCount; s++) {
            if (this.fluidParticles.length < 150) {
                const angle = Math.PI * 0.5 + (Math.random() - 0.5) * 2 * spreadRad;
                this.fluidParticles.push({
                    x: width * 0.5 + (Math.random() - 0.5) * (isGooPour ? 14 : 22),
                    y: isGooPour ? 24 : 56,
                    vx: Math.cos(angle) * baseSpeed,
                    vy: Math.sin(angle) * baseSpeed,
                    radius: (isGooPour ? 24 : 20) + v * 12,
                    life: 0,
                    maxLife: 2.4,
                });
            }
        }

        const floorY = height - 42;
        for (let i = this.fluidParticles.length - 1; i >= 0; i--) {
            const p = this.fluidParticles[i];
            p.life += dt;
            // Pull toward centerline when viscosity is high (cohesion)
            p.vx += (width * 0.5 - p.x) * cohesion * dt * 12;
            p.vy += (320 + (1 - v) * 240) * dt;
            p.x += p.vx * dt;
            p.y += p.vy * dt;

            if (p.y > floorY) {
                p.y = floorY;
                p.vy *= -0.08 * (1 - v);
                p.vx *= 0.85 - v * 0.35;
                if (isGooPour) {
                    p.radius = Math.min(46, p.radius + 18 * dt);
                }
            }

            if (p.life >= p.maxLife) {
                this.fluidParticles.splice(i, 1);
            }
        }

        // Draw soft radial blobs onto offscreen canvas, then alpha-threshold for crisp metaball surface
        this.offCtx.clearRect(0, 0, width, height);
        for (const p of this.fluidParticles) {
            const grad = this.offCtx.createRadialGradient(p.x, p.y, 1, p.x, p.y, p.radius);
            grad.addColorStop(0, 'rgba(255,255,255,1)');
            grad.addColorStop(0.55, 'rgba(255,255,255,0.75)');
            grad.addColorStop(1, 'rgba(255,255,255,0)');
            this.offCtx.fillStyle = grad;
            this.offCtx.beginPath();
            this.offCtx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
            this.offCtx.fill();
        }

        const imgData = this.offCtx.getImageData(0, 0, width, height);
        const data = imgData.data;
        const threshold = Math.round(115 + v * 65);
        const rgb = this.hexToRgb(this.config.primaryColor);

        for (let idx = 0; idx < data.length; idx += 4) {
            const a = data[idx + 3];
            if (a >= threshold) {
                data[idx] = rgb.r;
                data[idx + 1] = rgb.g;
                data[idx + 2] = rgb.b;
                data[idx + 3] = 242;
            } else {
                data[idx + 3] = 0;
            }
        }
        this.offCtx.putImageData(imgData, 0, 0);
        this.ctx.drawImage(this.offscreen, 0, 0);

        // Top specular highlight for high-viscosity goo/jelly
        if (v >= 0.65) {
            this.ctx.save();
            this.ctx.fillStyle = 'rgba(255, 255, 255, 0.42)';
            for (let i = 0; i < this.fluidParticles.length; i += 3) {
                const p = this.fluidParticles[i];
                this.ctx.beginPath();
                this.ctx.ellipse(
                    p.x - p.radius * 0.22,
                    p.y - p.radius * 0.25,
                    p.radius * 0.24,
                    p.radius * 0.12,
                    -0.4,
                    0,
                    Math.PI * 2
                );
                this.ctx.fill();
            }
            this.ctx.restore();
        }
    }
    // 5. Seamless Looping Spinning Coin
    private renderSpinningCoin(): void {
        const { width, height } = this.canvas;
        const cx = width * 0.5;
        const cy = height * 0.5;
        const phase = (this.elapsedSec / this.config.loopDurationSec) * Math.PI * 2;
        const scaleX = Math.cos(phase);
        const radius = 128;
        const thickness = 22 * Math.sin(phase);
        this.ctx.save();
        this.ctx.translate(cx, cy);
        // Coin edge extrusion
        this.ctx.fillStyle = '#b45309';
        this.ctx.beginPath();
        this.ctx.ellipse(thickness * 0.5, 0, Math.abs(scaleX) * radius + Math.abs(thickness), radius, 0, 0, Math.PI * 2);
        this.ctx.fill();
        // Coin face
        this.ctx.scale(Math.max(0.06, Math.abs(scaleX)), 1);
        const faceGrad = this.ctx.createLinearGradient(-radius, -radius, radius, radius);
        faceGrad.addColorStop(0, '#fde047');
        faceGrad.addColorStop(0.5, '#f59e0b');
        faceGrad.addColorStop(1, '#d97706');
        this.ctx.fillStyle = faceGrad;
        this.ctx.beginPath();
        this.ctx.arc(0, 0, radius, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.strokeStyle = '#fef08a';
        this.ctx.lineWidth = 8;
        this.ctx.beginPath();
        this.ctx.arc(0, 0, radius * 0.8, 0, Math.PI * 2);
        this.ctx.stroke();
        // Emblem
        this.ctx.fillStyle = '#78350f';
        this.ctx.font = 'bold 92px sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(scaleX >= 0 ? 'M1' : '★', 0, 4);
        this.ctx.restore();
    }
    // 6. Seamless Looping Spinning Stylized Skull
    private renderSpinningSkull(): void {
        const { width, height } = this.canvas;
        const cx = width * 0.5;
        const cy = height * 0.48;
        const phase = (this.elapsedSec / this.config.loopDurationSec) * Math.PI * 2;
        const yaw = Math.sin(phase);
        const scaleX = Math.max(0.18, Math.abs(Math.cos(phase)));
        const bobY = Math.sin(phase * 2) * 10;
        this.ctx.save();
        this.ctx.translate(cx, cy + bobY);
        this.ctx.scale(scaleX, 1);
        // Cranium
        this.ctx.fillStyle = '#f8fafc';
        this.ctx.shadowColor = this.config.primaryColor;
        this.ctx.shadowBlur = 24;
        this.ctx.beginPath();
        this.ctx.arc(0, -24, 96, Math.PI * 0.85, Math.PI * 2.15);
        this.ctx.lineTo(56, 56);
        this.ctx.lineTo(44, 108);
        this.ctx.lineTo(-44, 108);
        this.ctx.lineTo(-56, 56);
        this.ctx.closePath();
        this.ctx.fill();
        this.ctx.shadowBlur = 0;
        // Eye sockets & nasal cavity (only visible on front hemisphere)
        if (Math.cos(phase) > -0.15) {
            const eyeOffsetX = yaw * 18;
            this.ctx.fillStyle = '#0f172a';
            this.ctx.beginPath();
            this.ctx.ellipse(-34 + eyeOffsetX, -8, 22, 26, -0.12, 0, Math.PI * 2);
            this.ctx.ellipse(34 + eyeOffsetX, -8, 22, 26, 0.12, 0, Math.PI * 2);
            this.ctx.fill();
            // Glowing pupils
            this.ctx.fillStyle = this.config.secondaryColor;
            this.ctx.beginPath();
            this.ctx.arc(-34 + eyeOffsetX, -8, 7, 0, Math.PI * 2);
            this.ctx.arc(34 + eyeOffsetX, -8, 7, 0, Math.PI * 2);
            this.ctx.fill();
            // Nasal cavity
            this.ctx.fillStyle = '#0f172a';
            this.ctx.beginPath();
            this.ctx.moveTo(eyeOffsetX, 18);
            this.ctx.lineTo(12 + eyeOffsetX, 42);
            this.ctx.lineTo(-12 + eyeOffsetX, 42);
            this.ctx.closePath();
            this.ctx.fill();
            // Teeth slits
            this.ctx.strokeStyle = '#0f172a';
            this.ctx.lineWidth = 5;
            for (let tx = -24; tx <= 24; tx += 16) {
                this.ctx.beginPath();
                this.ctx.moveTo(tx + eyeOffsetX * 0.6, 74);
                this.ctx.lineTo(tx + eyeOffsetX * 0.6, 106);
                this.ctx.stroke();
            }
        }
        this.ctx.restore();
    }
    private hexToRgb(hex: string): { r: number; g: number; b: number } {
        const clean = hex.replace('#', '');
        const num = parseInt(clean.length === 3 ? clean.replace(/(.)/g, '$1$1') : clean, 16);
        return {
            r: (num >> 16) & 255,
            g: (num >> 8) & 255,
            b: num & 255,
        };
    }
    public destroy(): void {
        this.stopLoop();
        this.fluidParticles = [];
        this.smokeParticles = [];
    }
}