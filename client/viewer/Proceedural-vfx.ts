
export type Big3rCameraAngle = 'ceiling' | 'left45' | 'right45' | 'topDown';
export type Big3rFramingMode = 'hybrid' | 'pullback' | 'locked';

export type ProceduralVfxPreset =
    | 'magic-smoke'
    | 'lightning'
    | 'metaball-fluid'
    | 'goo-pour'
    | 'spinning-coin'
    | 'spinning-skull'
    | 'big3r-tube-ceiling';

export interface ProceduralVfxConfig {
    preset: ProceduralVfxPreset;
    /** 0.0 (watery) to 1.0 (thick goo) */
    viscosity: number;
    primaryColor: string;
    secondaryColor: string;
    loopDurationSec: number;
    big3rAngle: Big3rCameraAngle;
    big3rFramingMode: Big3rFramingMode;
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

interface Big3rTubeVertex {
    v: number;
    theta: number;
    cosT: number;
    sinT: number;
}

interface Big3rPouchVertex {
    nx: number;
    ny: number;
    nz: number;
}

interface Big3rMesh {
    verts: Big3rTubeVertex[];
    faces: number[][];
}

interface Big3rPouchMesh {
    verts: Big3rPouchVertex[];
    faces: number[][];
}

interface Big3rMeshes {
    tube: Big3rMesh;
    pouch: Big3rPouchMesh;
}

interface Big3rProjectedPoint {
    x: number;
    y: number;
    z: number;
    scale: number;
    rootScale: number;
}

interface Big3rWorldPoint {
    x: number;
    y: number;
    z: number;
}

interface Big3rCameraPreset {
    anchorX: number;
    anchorY: number;
    baseDist: number;
    pullbackDist: number;
    basePitch: number;
    pitchGain: number;
    yaw: number;
    baseFov: number;
    fovZoomOut: number;
}

interface Big3rRenderQuad {
    avgZ: number;
    p0: Big3rWorldPoint;
    p1: Big3rWorldPoint;
    p2: Big3rWorldPoint;
    p3: Big3rWorldPoint;
    s0: Big3rProjectedPoint;
    s1: Big3rProjectedPoint;
    s2: Big3rProjectedPoint;
    s3: Big3rProjectedPoint;
    vNorm: number;
    isPouch: boolean;
}

const big3rCameraPresets: Record<Big3rCameraAngle, Big3rCameraPreset> = {
    ceiling: {
        anchorX: 256,
        anchorY: 468,
        baseDist: 310,
        pullbackDist: 145,
        basePitch: 0.34,
        pitchGain: 0.14,
        yaw: 0,
        baseFov: 410,
        fovZoomOut: 65,
    },
    left45: {
        anchorX: 165,
        anchorY: 455,
        baseDist: 320,
        pullbackDist: 140,
        basePitch: 0.14,
        pitchGain: 0.08,
        yaw: 0.68,
        baseFov: 410,
        fovZoomOut: 60,
    },
    right45: {
        anchorX: 347,
        anchorY: 455,
        baseDist: 320,
        pullbackDist: 140,
        basePitch: 0.14,
        pitchGain: 0.08,
        yaw: -0.68,
        baseFov: 410,
        fovZoomOut: 60,
    },
    topDown: {
        anchorX: 256,
        anchorY: 365,
        baseDist: 340,
        pullbackDist: 150,
        basePitch: -0.78,
        pitchGain: -0.10,
        yaw: 0,
        baseFov: 400,
        fovZoomOut: 70,
    },
};

function big3rLerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
}

function big3rSmoothstep(edge0: number, edge1: number, x: number): number {
    const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
}

function computeBig3rBalloonCurve(progress: number): {
    macro: number;
    radial: number;
    axial: number;
    rootPulse: number;
} {
    const p = Math.max(0, Math.min(1, progress));
    let macro = 0;

    if (p < 0.22) {
        macro = 0.10 * big3rSmoothstep(0, 1, p / 0.22);
    } else if (p < 0.44) {
        const t = (p - 0.22) / 0.22;
        macro = big3rLerp(0.10, 0.32, big3rSmoothstep(0, 1, t));
    } else if (p < 0.68) {
        const t = (p - 0.44) / 0.24;
        macro = big3rLerp(0.32, 0.65, Math.pow(t, 1.05));
    } else if (p < 0.86) {
        const t = (p - 0.68) / 0.18;
        macro = big3rLerp(0.65, 0.92, Math.pow(t, 1.08));
    } else {
        const t = (p - 0.86) / 0.14;
        macro = big3rLerp(0.92, 1.15, t);
    }

    const cycles = 10;
    const cyclePos = p * cycles;
    const cycleIdx = Math.floor(cyclePos);
    const cycleFrac = cyclePos - cycleIdx;

    const girthStep = big3rSmoothstep(0, 0.52, cycleFrac);
    const lengthStep = big3rSmoothstep(0.32, 0.96, cycleFrac);
    const stepUnit = 1 / cycles;

    const steppedGirth = (cycleIdx + girthStep) * stepUnit * 1.15;
    const steppedLength = (cycleIdx + lengthStep) * stepUnit * 1.15;

    const radial = big3rLerp(macro, steppedGirth, 0.28);
    const axial = big3rLerp(macro, steppedLength, 0.34);
    const rootPulse = Math.sin(cycleFrac * Math.PI) * (0.012 + macro * 0.028);

    return { macro, radial, axial, rootPulse };
}

function buildBig3rMeshes(): Big3rMeshes {
    const rings = 48;
    const sides = 28;
    const tubeVerts: Big3rTubeVertex[] = [];
    const tubeFaces: number[][] = [];

    for (let r = 0; r <= rings; r++) {
        const v = r / rings;

        for (let s = 0; s < sides; s++) {
            const theta = (s / sides) * Math.PI * 2;
            tubeVerts.push({
                v,
                theta,
                cosT: Math.cos(theta),
                sinT: Math.sin(theta),
            });
        }
    }

    for (let r = 0; r < rings; r++) {
        for (let s = 0; s < sides; s++) {
            const sNext = (s + 1) % sides;
            tubeFaces.push([
                r * sides + s,
                r * sides + sNext,
                (r + 1) * sides + sNext,
                (r + 1) * sides + s,
            ]);
        }
    }

    const lat = 12;
    const lon = 16;
    const pouchVerts: Big3rPouchVertex[] = [];
    const pouchFaces: number[][] = [];

    for (let i = 0; i <= lat; i++) {
        const phi = (i / lat) * Math.PI;

        for (let j = 0; j < lon; j++) {
            const theta = (j / lon) * Math.PI * 2;
            pouchVerts.push({
                nx: Math.sin(phi) * Math.cos(theta),
                ny: -Math.cos(phi),
                nz: Math.sin(phi) * Math.sin(theta),
            });
        }
    }

    for (let i = 0; i < lat; i++) {
        for (let j = 0; j < lon; j++) {
            const jNext = (j + 1) % lon;
            pouchFaces.push([
                i * lon + j,
                i * lon + jNext,
                (i + 1) * lon + jNext,
                (i + 1) * lon + j,
            ]);
        }
    }

    return {
        tube: { verts: tubeVerts, faces: tubeFaces },
        pouch: { verts: pouchVerts, faces: pouchFaces },
    };
}

function projectBig3rPoint(
    p: Big3rWorldPoint,
    cam: { dist: number; pitch: number; yaw: number },
    anchorX: number,
    anchorY: number,
    fov: number,
): Big3rProjectedPoint {
    const cy = Math.cos(cam.yaw);
    const sy = Math.sin(cam.yaw);
    const x1 = p.x * cy - p.z * sy;
    const z1 = p.x * sy + p.z * cy;

    const cp = Math.cos(cam.pitch);
    const sp = Math.sin(cam.pitch);
    const y2 = p.y * cp + z1 * sp;
    const z2 = -p.y * sp + z1 * cp;

    const depth = Math.max(45, cam.dist - z2);
    const scale = fov / depth;
    const rootScale = fov / Math.max(45, cam.dist);

    return {
        x: anchorX + x1 * scale,
        y: anchorY + y2 * scale,
        z: depth,
        scale,
        rootScale,
    };
}

function renderBig3rSurge(
    ctx: CanvasRenderingContext2D,
    progress: number,
    meshes: Big3rMeshes,
    angleKey: Big3rCameraAngle,
    framingMode: Big3rFramingMode,
): void {
    const preset = big3rCameraPresets[angleKey] ?? big3rCameraPresets.ceiling;
    const p = Math.max(0, Math.min(1, progress));
    const fadeOut = p > 0.95 ? Math.max(0, (1 - p) / 0.05) : 1;
    const popIn = Math.max(0.08, Math.min(1, p / 0.025));

    if (fadeOut <= 0.001) return;

    const { macro, radial, axial, rootPulse } = computeBig3rBalloonCurve(p);
    const tautness = Math.min(1, macro / 0.85);
    const totalHeight = (78 + axial * 205) * popIn;
    const shaftRadius = (14 + radial * 15) * popIn;

    const growthNorm = Math.min(1.15, macro);
    let camDist = preset.baseDist;
    let camPitch = preset.basePitch;
    let fov = preset.baseFov;

    if (framingMode === 'pullback') {
        camDist = preset.baseDist + growthNorm * preset.pullbackDist;
        camPitch = preset.basePitch + growthNorm * preset.pitchGain;
    } else if (framingMode === 'hybrid') {
        camDist = preset.baseDist + growthNorm * (preset.pullbackDist * 0.55);
        camPitch = preset.basePitch + growthNorm * (preset.pitchGain * 0.65);
        fov = preset.baseFov - growthNorm * preset.fovZoomOut;
    } else {
        camDist = preset.baseDist + 95;
        fov = preset.baseFov - 45;
    }

    const cam = {
        dist: camDist,
        pitch: camPitch,
        yaw: preset.yaw,
    };

    const anchorX = preset.anchorX;
    const anchorY = preset.anchorY;
    const worldVerts: Big3rWorldPoint[] = [];
    const projVerts: Big3rProjectedPoint[] = [];

    for (const vt of meshes.tube.verts) {
        const v = vt.v;
        const baseToTip = Math.pow(1 - v, 0.8);
        const localRootSwell = rootPulse * baseToTip;

        let profileR = shaftRadius;

        if (v < 0.08) {
            const t = 1 - v / 0.08;
            profileR = shaftRadius * (1 + 0.15 * t * t + localRootSwell);
        } else if (v < 0.76) {
            const chamberRow = Math.sin(v * Math.PI * 14);
            const chamberCol = Math.cos(vt.theta * 4);
            const chamberBump = Math.max(0, chamberRow * chamberCol) * tautness * 0.032;
            profileR = shaftRadius * (1 + localRootSwell + chamberBump);
        } else if (v < 0.84) {
            const t = (v - 0.76) / 0.08;
            const ridgeCurve = Math.sin(t * Math.PI);
            const ridgeStrength = 0.08 + tautness * 0.19;
            profileR = shaftRadius * (1 + ridgeCurve * ridgeStrength);
        } else {
            const t = (v - 0.84) / 0.16;
            const domeProfile = Math.cos(t * Math.PI * 0.5);
            const crownFullness = big3rLerp(0.84, 1.02, tautness);
            const domeExp = big3rLerp(0.86, 0.66, tautness);
            profileR = Math.max(
                0.35,
                shaftRadius * crownFullness * Math.pow(Math.max(0, domeProfile), domeExp),
            );
        }

        const wp = {
            x: vt.cosT * profileR,
            y: -v * totalHeight,
            z: vt.sinT * profileR,
        };

        worldVerts.push(wp);
        projVerts.push(projectBig3rPoint(wp, cam, anchorX, anchorY, fov));
    }

    const drawShadedQuad = (
        p0: Big3rWorldPoint,
        p1: Big3rWorldPoint,
        p2: Big3rWorldPoint,
        p3: Big3rWorldPoint,
        s0: Big3rProjectedPoint,
        s1: Big3rProjectedPoint,
        s2: Big3rProjectedPoint,
        s3: Big3rProjectedPoint,
        vNorm: number,
        isPouch: boolean,
    ) => {
        const area2D =
            (s1.x - s0.x) * (s2.y - s0.y) - (s1.y - s0.y) * (s2.x - s0.x) +
            (s2.x - s0.x) * (s3.y - s0.y) - (s2.y - s0.y) * (s3.x - s0.x);

        if (area2D >= 0) return;

        const ux = p2.x - p0.x;
        const uy = p2.y - p0.y;
        const uz = p2.z - p0.z;
        const vx = p3.x - p1.x;
        const vy = p3.y - p1.y;
        const vz = p3.z - p1.z;

        let nx = uy * vz - uz * vy;
        let ny = uz * vx - ux * vz;
        let nz = ux * vy - uy * vx;
        const nLen = Math.hypot(nx, ny, nz) || 1;

        nx /= nLen;
        ny /= nLen;
        nz /= nLen;

        if (nz < -0.25 && cam.pitch >= -0.3) {
            nx = -nx;
            ny = -ny;
            nz = -nz;
        }

        const keyDot = Math.max(0, -0.35 * nx - 0.55 * ny + 0.75 * nz);
        const fillDot = Math.max(0, 0.65 * nx - 0.25 * ny + 0.45 * nz);
        const rimDot = Math.max(0, -0.35 * ny + 0.60 * (1 - Math.abs(nx)));

        const hx = -0.22;
        const hy = -0.28;
        const hz = 0.93;
        const specDot = Math.max(0, nx * hx + ny * hy + nz * hz);
        const shininess = 8 + tautness * 36;
        const specIntensity = Math.pow(specDot, shininess) * (0.18 + tautness * 0.75);

        let chamberTint = 0;

        if (!isPouch && vNorm > 0.1 && vNorm < 0.76) {
            const angle = Math.atan2(nz, nx);
            const crossBrace =
                Math.abs(Math.sin(vNorm * Math.PI * 14 + angle * 2)) *
                Math.abs(Math.sin(vNorm * Math.PI * 14 - angle * 2));
            chamberTint = crossBrace * tautness * 0.20;
        }

        const crownBlush = vNorm > 0.76 ? 0.12 : 0;
        const r = 238 + keyDot * 17 + fillDot * 12 + specIntensity * 45 - chamberTint * 12 + rimDot * 14;
        const g = 190 + keyDot * 50 + fillDot * 26 + specIntensity * 56 - crownBlush * 28 - chamberTint * 30 + rimDot * 12;
        const b = 182 + keyDot * 54 + fillDot * 22 + specIntensity * 62 - crownBlush * 18 - chamberTint * 24 + rimDot * 16;

        ctx.beginPath();
        ctx.moveTo(s0.x, s0.y);
        ctx.lineTo(s1.x, s1.y);
        ctx.lineTo(s2.x, s2.y);
        ctx.lineTo(s3.x, s3.y);
        ctx.closePath();

        const fillStyle =
            `rgb(${Math.min(255, Math.max(0, Math.round(r)))},` +
            `${Math.min(255, Math.max(0, Math.round(g)))},` +
            `${Math.min(255, Math.max(0, Math.round(b)))})`;

        ctx.fillStyle = fillStyle;
        ctx.fill();
        ctx.strokeStyle = fillStyle;
        ctx.lineWidth = 0.85;
        ctx.stroke();
    };

    ctx.save();
    ctx.globalAlpha = fadeOut;

    const shadowRx = Math.max(22, 42 + radial * 36);
    const shadowRy = shadowRx * 0.34;
    const baseGrad = ctx.createRadialGradient(
        anchorX, anchorY + 4, 4,
        anchorX, anchorY + 4, shadowRx,
    );

    baseGrad.addColorStop(0, 'rgba(244, 162, 152, 0.42)');
    baseGrad.addColorStop(0.65, 'rgba(251, 207, 196, 0.18)');
    baseGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');

    ctx.fillStyle = baseGrad;
    ctx.beginPath();
    ctx.ellipse(anchorX, anchorY + 4, shadowRx, shadowRy, 0, 0, Math.PI * 2);
    ctx.fill();

    const renderList: Big3rRenderQuad[] = [];
    const pouchSpread = shaftRadius * 1.24;

    const pouchConfigs = [
        { cx: 0, cy: 0, cz: 0, rx: shaftRadius * 1.25, ry: (10 + radial * 4) * popIn, rz: shaftRadius * 1.25, vTag: 0.02 },
        { cx: -pouchSpread, cy: -2, cz: 3, rx: (13 + radial * 15) * popIn, ry: (11 + radial * 12) * popIn, rz: (13 + radial * 14) * popIn, vTag: 0.05 },
        { cx: pouchSpread, cy: -2, cz: 3, rx: (13 + radial * 15) * popIn, ry: (11 + radial * 12) * popIn, rz: (13 + radial * 14) * popIn, vTag: 0.05 },
    ];

    for (const pc of pouchConfigs) {
        const pWorld: Big3rWorldPoint[] = [];
        const pProj: Big3rProjectedPoint[] = [];

        for (const pv of meshes.pouch.verts) {
            const wp = {
                x: pc.cx + pv.nx * pc.rx,
                y: pc.cy + pv.ny * pc.ry,
                z: pc.cz + pv.nz * pc.rz,
            };

            pWorld.push(wp);
            pProj.push(projectBig3rPoint(wp, cam, anchorX, anchorY, fov));
        }

        for (const q of meshes.pouch.faces) {
            const s0 = pProj[q[0]];
            const s1 = pProj[q[1]];
            const s2 = pProj[q[2]];
            const s3 = pProj[q[3]];

            renderList.push({
                avgZ: (s0.z + s1.z + s2.z + s3.z) * 0.25,
                p0: pWorld[q[0]],
                p1: pWorld[q[1]],
                p2: pWorld[q[2]],
                p3: pWorld[q[3]],
                s0, s1, s2, s3,
                vNorm: pc.vTag,
                isPouch: true,
            });
        }
    }

    for (const q of meshes.tube.faces) {
        const s0 = projVerts[q[0]];
        const s1 = projVerts[q[1]];
        const s2 = projVerts[q[2]];
        const s3 = projVerts[q[3]];

        renderList.push({
            avgZ: (s0.z + s1.z + s2.z + s3.z) * 0.25,
            p0: worldVerts[q[0]],
            p1: worldVerts[q[1]],
            p2: worldVerts[q[2]],
            p3: worldVerts[q[3]],
            s0, s1, s2, s3,
            vNorm: meshes.tube.verts[q[0]].v,
            isPouch: false,
        });
    }

    renderList.sort((a, b) => b.avgZ - a.avgZ);

    for (const item of renderList) {
        drawShadedQuad(
            item.p0, item.p1, item.p2, item.p3,
            item.s0, item.s1, item.s2, item.s3,
            item.vNorm,
            item.isPouch,
        );
    }

    ctx.restore();
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
        big3rAngle: 'ceiling',
        big3rFramingMode: 'hybrid',
    };

    private fluidParticles: FluidParticle[] = [];
    private smokeParticles: SmokeParticle[] = [];
    private big3rMeshes: Big3rMeshes | null = null;
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
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
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
            case 'big3r-tube-ceiling':
                if (!this.big3rMeshes) this.big3rMeshes = buildBig3rMeshes();
                renderBig3rSurge(
                    this.ctx,
                    this.elapsedSec / 36,
                    this.big3rMeshes,
                    this.config.big3rAngle,
                    this.config.big3rFramingMode,
                );
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
            points: Array<{ x: number; y: number }>,
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
        this.ctx.strokeStyle = this.config.primaryColor;
        this.ctx.shadowColor = this.config.secondaryColor;
        this.ctx.shadowBlur = 22;
        this.ctx.lineWidth = 8;
        this.strokePolyline(pts);

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

    // 3 & 4. 2D Metaball Fluid & Thick Goo/Jelly Pour
    private renderMetaballFluid(dt: number, isGooPour: boolean): void {
        const { width, height } = this.canvas;
        const v = isGooPour ? Math.max(0.85, this.config.viscosity) : this.config.viscosity;
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
            p.vx += (width * 0.5 - p.x) * cohesion * dt * 12;
            p.vy += (320 + (1 - v) * 240) * dt;
            p.x += p.vx * dt;
            p.y += p.vy * dt;

            if (p.y > floorY) {
                p.y = floorY;
                p.vy *= -0.08 * (1 - v);
                p.vx *= 0.85 - v * 0.35;

                if (isGooPour) p.radius = Math.min(46, p.radius + 18 * dt);
            }

            if (p.life >= p.maxLife) this.fluidParticles.splice(i, 1);
        }

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
                    Math.PI * 2,
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
        this.ctx.fillStyle = '#b45309';
        this.ctx.beginPath();
        this.ctx.ellipse(thickness * 0.5, 0, Math.abs(scaleX) * radius + Math.abs(thickness), radius, 0, 0, Math.PI * 2);
        this.ctx.fill();

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

        if (Math.cos(phase) > -0.15) {
            const eyeOffsetX = yaw * 18;
            this.ctx.fillStyle = '#0f172a';
            this.ctx.beginPath();
            this.ctx.ellipse(-34 + eyeOffsetX, -8, 22, 26, -0.12, 0, Math.PI * 2);
            this.ctx.ellipse(34 + eyeOffsetX, -8, 22, 26, 0.12, 0, Math.PI * 2);
            this.ctx.fill();

            this.ctx.fillStyle = this.config.secondaryColor;
            this.ctx.beginPath();
            this.ctx.arc(-34 + eyeOffsetX, -8, 7, 0, Math.PI * 2);
            this.ctx.arc(34 + eyeOffsetX, -8, 7, 0, Math.PI * 2);
            this.ctx.fill();

            this.ctx.fillStyle = '#0f172a';
            this.ctx.beginPath();
            this.ctx.moveTo(eyeOffsetX, 18);
            this.ctx.lineTo(12 + eyeOffsetX, 42);
            this.ctx.lineTo(-12 + eyeOffsetX, 42);
            this.ctx.closePath();
            this.ctx.fill();

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
        this.big3rMeshes = null;
    }
}
