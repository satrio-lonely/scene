import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { computeSunState, SunEnvironmentState } from '../utils/sunMath';
import {
  BreezeState,
  computeBreezeState,
  WaterRipplePool,
} from '../utils/waterRipples';
import { CulledMeshBuffers, VoxelMaterialKind } from './voxelGrid';
import { buildGrandLakeTerrainBuffers } from './voxelLandscapeBuilder';
import {
  BENCH_SEAT_TOP_Y,
  buildMicrovoxelBenchGrid,
  buildMicrovoxelLanternGrid,
} from './microBenchBuilder';
import {
  buildMicroLegoCharacterGrid,
  CIGARETTE_TIP_LOCAL,
} from './microLegoBuilder';
import {
  buildMicroBatakoPathSegment,
  buildMicroBollardPost,
  buildMicroLakesideFenceSegment,
} from './microArchitectureBuilder';
import {
  buildMicroBroadleafTree,
  buildMicroBush,
  buildMicroGrassClump,
  buildMicroLilyPad,
  buildMicroMossyBoulder,
  buildMicroPineTree,
  buildMicroReedCluster,
  buildMicroWildflowerCluster,
  buildMicroWillowTree,
  buildMicroWoodenPier,
} from './microVegetationBuilder';
import {
  createLakeWaterRig,
  createPhotorealisticSkyRig,
  LakeWaterRig,
  PhotorealisticSkyRig,
} from './skyAndWater';
import {
  BENCH_ANGLE,
  fbm2D,
  getBenchAnchor,
  getLakeShoreRadius,
  getLanternAnchors,
  getPathCenterRadius,
  hash2D,
  isPierOpening,
  PATH_SURFACE_Y,
  PIER_ANGLE,
  sampleTerrain,
} from './worldLayout';
import { CameraPresetId, getCameraPresets } from './cameraPresets';

const SUN_LIGHT_DISTANCE = 64;

function detectSoftwareWebGL(): boolean {
  try {
    const probeCanvas = document.createElement('canvas');
    const gl = probeCanvas.getContext('webgl2') || probeCanvas.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) ?? '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

interface WindUniformRef {
  uWindTime: { value: number };
  uWindAmp: { value: number };
}

function createVoxelMaterials(): {
  materials: Map<VoxelMaterialKind, THREE.MeshStandardMaterial>;
  windUniforms: WindUniformRef;
} {
  const map = new Map<VoxelMaterialKind, THREE.MeshStandardMaterial>();
  const windUniforms: WindUniformRef = {
    uWindTime: { value: 0 },
    uWindAmp: { value: 0.022 },
  };

  map.set(
    VoxelMaterialKind.TerrainMatte,
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.91,
      metalness: 0.0,
    }),
  );
  map.set(
    VoxelMaterialKind.Stone,
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.72,
      metalness: 0.04,
    }),
  );
  map.set(
    VoxelMaterialKind.Wood,
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.62,
      metalness: 0.04,
    }),
  );
  map.set(
    VoxelMaterialKind.CastIron,
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.34,
      metalness: 0.78,
    }),
  );
  map.set(
    VoxelMaterialKind.Brass,
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.2,
      metalness: 0.9,
    }),
  );
  map.set(
    VoxelMaterialKind.LanternGlow,
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.25,
      metalness: 0.0,
      emissive: new THREE.Color(0xff9838),
      emissiveIntensity: 0.65,
    }),
  );

  // Foliage PBR material extended via onBeforeCompile for gentle real-time breeze sway
  const foliageMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.84,
    metalness: 0.0,
  });
  foliageMat.onBeforeCompile = (shader) => {
    shader.uniforms.uWindTime = windUniforms.uWindTime;
    shader.uniforms.uWindAmp = windUniforms.uWindAmp;
    shader.vertexShader =
      'uniform float uWindTime;\nuniform float uWindAmp;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `
      #include <begin_vertex>
      float swayHeight = clamp(position.y * 0.75, 0.0, 2.2);
      #ifdef USE_INSTANCING
        vec3 instOrigin = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
        float phase = instOrigin.x * 0.35 + instOrigin.z * 0.32 + position.y * 1.4;
      #else
        float phase = position.x * 0.65 + position.z * 0.55 + position.y * 1.2;
      #endif
      transformed.x += sin(uWindTime + phase) * uWindAmp * swayHeight;
      transformed.z += cos(uWindTime * 0.82 + phase * 1.15) * uWindAmp * 0.65 * swayHeight;
      `,
    );
  };
  map.set(VoxelMaterialKind.Foliage, foliageMat);

  return { materials: map, windUniforms };
}

interface CompiledArchetype {
  parts: { geometry: THREE.BufferGeometry; material: THREE.MeshStandardMaterial }[];
  voxelCount: number;
  faceCount: number;
}

function compileArchetype(
  buffers: CulledMeshBuffers[],
  voxelCount: number,
  materials: Map<VoxelMaterialKind, THREE.MeshStandardMaterial>,
): CompiledArchetype {
  const parts: { geometry: THREE.BufferGeometry; material: THREE.MeshStandardMaterial }[] = [];
  let faceCount = 0;

  for (const buf of buffers) {
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(buf.positions, 3));
    geom.setAttribute('normal', new THREE.BufferAttribute(buf.normals, 3));
    geom.setAttribute('color', new THREE.BufferAttribute(buf.colors, 3));
    geom.setIndex(new THREE.BufferAttribute(buf.indices, 1));
    geom.computeBoundingSphere();

    const mat =
      materials.get(buf.material) ?? materials.get(VoxelMaterialKind.TerrainMatte)!;
    parts.push({ geometry: geom, material: mat });
    faceCount += buf.faceCount;
  }

  return { parts, voxelCount, faceCount };
}

function instantiateArchetypeGroup(
  arch: CompiledArchetype,
  castShadow = true,
  receiveShadow = true,
): THREE.Group {
  const group = new THREE.Group();
  for (const part of arch.parts) {
    const mesh = new THREE.Mesh(part.geometry, part.material);
    mesh.castShadow = castShadow && part.material.emissiveIntensity === 0;
    mesh.receiveShadow = receiveShadow;
    group.add(mesh);
  }
  return group;
}

interface InstanceTransform {
  x: number;
  y: number;
  z: number;
  rotY: number;
  scale: number;
  scaleZ?: number;
}

function addInstancedArchetype(
  parent: THREE.Scene,
  arch: CompiledArchetype,
  transforms: readonly InstanceTransform[],
  castShadow = true,
  receiveShadow = true,
): THREE.InstancedMesh[] {
  if (transforms.length === 0) return [];
  const dummy = new THREE.Object3D();
  const created: THREE.InstancedMesh[] = [];

  for (const part of arch.parts) {
    const im = new THREE.InstancedMesh(part.geometry, part.material, transforms.length);
    for (let i = 0; i < transforms.length; i++) {
      const tr = transforms[i];
      dummy.position.set(tr.x, tr.y, tr.z);
      dummy.rotation.set(0, tr.rotY, 0);
      dummy.scale.set(tr.scale, tr.scale, tr.scaleZ ?? tr.scale);
      dummy.updateMatrix();
      im.setMatrixAt(i, dummy.matrix);
    }
    im.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere();
    im.castShadow = castShadow && part.material.emissiveIntensity === 0;
    im.receiveShadow = receiveShadow;
    parent.add(im);
    created.push(im);
  }

  return created;
}

/**
 * Samples evenly arc-length-spaced points along any polar curve r(angle) around 0..2PI.
 */
function sampleClosedPolarCurve(
  radiusFn: (angle: number) => number,
  targetCount: number,
): { x: number; z: number; angle: number }[] {
  const fineN = 1080;
  const finePts: { x: number; z: number; angle: number; s: number }[] = [];
  let totalLen = 0;
  for (let i = 0; i <= fineN; i++) {
    const angle = (i / fineN) * Math.PI * 2;
    const r = radiusFn(angle);
    const x = Math.cos(angle) * r;
    const z = Math.sin(angle) * r;
    if (i > 0) {
      const prev = finePts[i - 1];
      totalLen += Math.hypot(x - prev.x, z - prev.z);
    }
    finePts.push({ x, z, angle, s: totalLen });
  }

  const out: { x: number; z: number; angle: number }[] = [];
  const step = totalLen / targetCount;
  let cursor = 0;
  for (let k = 0; k < targetCount; k++) {
    const targetS = k * step;
    while (cursor < fineN - 1 && finePts[cursor + 1].s < targetS) {
      cursor++;
    }
    const p0 = finePts[cursor];
    const p1 = finePts[cursor + 1];
    const segLen = Math.max(1e-6, p1.s - p0.s);
    const t = (targetS - p0.s) / segLen;
    out.push({
      x: p0.x + (p1.x - p0.x) * t,
      z: p0.z + (p1.z - p0.z) * t,
      angle: p0.angle + (p1.angle - p0.angle) * t,
    });
  }
  return out;
}

/**
 * Animated curling translucent smoke wisps rising continuously from the LEGO character's
 * glowing cigarette ember tip, reacting live to the environmental `Angin` (breeze) slider!
 */
function createCigaretteSmokeRig(origin: { x: number; y: number; z: number }): {
  points: THREE.Points;
  update: (elapsed: number, breeze: BreezeState) => void;
  dispose: () => void;
} {
  const count = 24;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(32, 32, 3, 32, 32, 30);
  grad.addColorStop(0, 'rgba(242, 246, 252, 0.72)');
  grad.addColorStop(0.45, 'rgba(216, 224, 236, 0.36)');
  grad.addColorStop(1, 'rgba(200, 212, 226, 0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;

  const mat = new THREE.PointsMaterial({
    map: tex,
    size: 0.145,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    opacity: 0.78,
  });

  const points = new THREE.Points(geo, mat);
  points.renderOrder = 4;

  const update = (elapsed: number, breeze: BreezeState) => {
    const posAttr = geo.attributes.position as THREE.BufferAttribute;
    const colAttr = geo.attributes.color as THREE.BufferAttribute;
    const posArr = posAttr.array as Float32Array;
    const colArr = colAttr.array as Float32Array;

    const windDrift = 0.09 + breeze.strength * 0.42;

    for (let i = 0; i < count; i++) {
      // Staggered looping lifecycle t in [0, 1)
      const t = (elapsed * 0.36 + i / count) % 1;
      const rise = t * 0.88;
      const curlX = Math.sin(t * 7.5 + elapsed * 1.9 + i * 0.6) * (0.02 + t * 0.11);
      const curlZ = Math.cos(t * 6.2 + elapsed * 1.5 + i * 0.8) * (0.015 + t * 0.09);

      posArr[i * 3] = origin.x + curlX + t * t * windDrift;
      posArr[i * 3 + 1] = origin.y + rise;
      posArr[i * 3 + 2] = origin.z + curlZ + t * 0.12;

      // Soft warm-silver fade in near ember & dissolve smoothly at top
      const fade = Math.sin(Math.min(1, t * 4.5) * (Math.PI / 2)) * Math.pow(1 - t, 1.35);
      const bright = 0.78 * fade + 0.16;
      colArr[i * 3] = bright;
      colArr[i * 3 + 1] = bright * 1.01;
      colArr[i * 3 + 2] = bright * 1.04;
    }

    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
  };

  const dispose = () => {
    geo.dispose();
    mat.dispose();
    tex.dispose();
  };

  return { points, update, dispose };
}

/**
 * Seamless low-profile outer meadow & distant foothills extending naturally into horizon fog
 * around the colossal 95-meter lake.
 */
function createOuterHorizonTerrain(): THREE.Mesh {
  const radialSegs = 96;
  const ringSegs = 24;
  const outerR = 460.0;

  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  const colorLow = new THREE.Color(0x4b6e39);
  const colorMid = new THREE.Color(0x3e5c36);
  const colorFar = new THREE.Color(0x4e685d);
  const tmpColor = new THREE.Color();

  for (let ir = 0; ir <= ringSegs; ir++) {
    const t = ir / ringSegs;

    for (let ia = 0; ia <= radialSegs; ia++) {
      const wrappedIa = ia % radialSegs;
      const ang = (wrappedIa / radialSegs) * Math.PI * 2;
      // Overlap polar meadow outer ring (shoreR + 42.0m) by 2.5m at every angle -> zero seam!
      const localInnerR = getLakeShoreRadius(ang) + 39.5;
      const r = localInnerR + Math.pow(t, 1.85) * (outerR - localInnerR);
      const x = Math.cos(ang) * r;
      const z = Math.sin(ang) * r;

      const edgeY = sampleTerrain(Math.cos(ang) * localInnerR, Math.sin(ang) * localInnerR).height;
      let y: number;
      if (ir === 0) {
        y = edgeY - 0.12;
      } else {
        const hillNoise = fbm2D(x * 0.011 + 5.2, z * 0.011 - 3.8);
        const ridge = Math.pow(t, 1.32) * (2.5 + 14.0 * hillNoise);
        y = edgeY * (1 - Math.min(1, t * 2.0)) + ridge - 0.1;
      }

      positions.push(x, y, z);

      const n = fbm2D(x * 0.025, z * 0.025);
      tmpColor.copy(colorLow).lerp(colorMid, n);
      tmpColor.lerp(colorFar, Math.min(1, t * 1.18));
      colors.push(tmpColor.r, tmpColor.g, tmpColor.b);
    }
  }

  const stride = radialSegs + 1;
  for (let ir = 0; ir < ringSegs; ir++) {
    for (let ia = 0; ia < radialSegs; ia++) {
      const a = ir * stride + ia;
      const b = a + stride;
      const c = b + 1;
      const d = a + 1;
      indices.push(a, d, b, b, d, c);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.96,
    metalness: 0.0,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  return mesh;
}

function createBenchContactShadow(): THREE.Mesh {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(64, 64, 8, 64, 64, 60);
  grad.addColorStop(0, 'rgba(10, 14, 18, 0.54)');
  grad.addColorStop(0.55, 'rgba(10, 14, 18, 0.24)');
  grad.addColorStop(1, 'rgba(10, 14, 18, 0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
    opacity: 0.74,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const geo = new THREE.PlaneGeometry(2.45, 1.38);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 1;
  return mesh;
}

function createLakesideMotes(): {
  points: THREE.Points;
  update: (elapsed: number, sun: SunEnvironmentState, breeze: BreezeState) => void;
  dispose: () => void;
} {
  const count = 180;
  const basePos = new Float32Array(count * 3);
  const pos = new Float32Array(count * 3);
  const phase = new Float32Array(count);

  const bench = getBenchAnchor();
  for (let i = 0; i < count; i++) {
    // Cluster 40% gently near the hero lakeside bench promenade, 60% over the colossal lake
    let x: number;
    let z: number;
    if (i < count * 0.4) {
      const a = (i / (count * 0.4)) * Math.PI * 2 * 3.1;
      const r = 1.5 + ((i * 29) % 100) * 0.14;
      x = bench.x * 0.85 + Math.cos(a) * r;
      z = bench.z * 0.85 + Math.sin(a) * r;
    } else {
      const a = (i / count) * Math.PI * 2 * 5.7;
      const r = 6.0 + ((i * 37) % 100) * 0.46;
      x = Math.cos(a) * r;
      z = Math.sin(a) * r;
    }
    const y = 0.55 + ((i * 53) % 100) * 0.04;
    basePos[i * 3] = x;
    basePos[i * 3 + 1] = y;
    basePos[i * 3 + 2] = z;
    pos[i * 3] = x;
    pos[i * 3 + 1] = y;
    pos[i * 3 + 2] = z;
    phase[i] = i * 0.73;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));

  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(16, 16, 1, 16, 16, 15);
  grad.addColorStop(0, 'rgba(255, 245, 200, 1)');
  grad.addColorStop(0.5, 'rgba(255, 224, 150, 0.45)');
  grad.addColorStop(1, 'rgba(255, 220, 140, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 32, 32);

  const sprite = new THREE.CanvasTexture(canvas);
  sprite.colorSpace = THREE.SRGBColorSpace;

  const mat = new THREE.PointsMaterial({
    map: sprite,
    size: 0.18,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    opacity: 0.36,
    color: new THREE.Color(0xffe7b3),
  });

  const points = new THREE.Points(geo, mat);

  const update = (elapsed: number, sun: SunEnvironmentState, breeze: BreezeState) => {
    const attr = geo.attributes.position as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    const driftScale = 0.25 + breeze.strength * 0.42;
    for (let i = 0; i < count; i++) {
      const p = phase[i];
      arr[i * 3] = basePos[i * 3] + Math.sin(elapsed * 0.55 + p) * driftScale;
      arr[i * 3 + 1] = basePos[i * 3 + 1] + Math.sin(elapsed * 0.8 + p * 1.4) * 0.18;
      arr[i * 3 + 2] = basePos[i * 3 + 2] + Math.cos(elapsed * 0.45 + p * 0.8) * driftScale;
    }
    attr.needsUpdate = true;
    mat.opacity = 0.24 + Math.min(0.42, sun.lanternIntensity * 0.15);
  };

  const dispose = () => {
    geo.dispose();
    mat.dispose();
    sprite.dispose();
  };

  return { points, update, dispose };
}

export interface LakesideSceneStats {
  totalVoxels: number;
  exposedFaces: number;
  isSoftwareGl: boolean;
}

export interface LakesideSceneOptions {
  container: HTMLElement;
  initialElevation: number;
  initialAzimuth: number;
  initialWindStrength: number;
  onContextLost?: () => void;
  onContextRestored?: () => void;
  onReady?: (stats: LakesideSceneStats) => void;
  onSunOrbitTick?: (elevation: number, azimuth: number) => void;
  onWaterRipple?: () => void;
}

export class LakesideScene {
  private readonly container: HTMLElement;
  private readonly isSoftwareGl: boolean;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly controls: OrbitControls;
  private readonly sunLight: THREE.DirectionalLight;
  private readonly sunFocusCenter = new THREE.Vector3();
  private readonly hemiLight: THREE.HemisphereLight;
  private readonly lanternLights: THREE.PointLight[] = [];
  private readonly fog: THREE.FogExp2;
  private readonly skyRig: PhotorealisticSkyRig;
  private readonly waterRig: LakeWaterRig;
  private readonly smokeRig: ReturnType<typeof createCigaretteSmokeRig>;
  private readonly motes: ReturnType<typeof createLakesideMotes>;
  private readonly voxelMaterials: Map<VoxelMaterialKind, THREE.MeshStandardMaterial>;
  private readonly windUniforms: WindUniformRef;
  private readonly envRT: THREE.WebGLRenderTarget;

  private readonly presets = getCameraPresets();
  private readonly targetCamPos = new THREE.Vector3();
  private readonly targetLookAt = new THREE.Vector3();
  private isCameraTransitioning = false;

  private readonly ripplePool = new WaterRipplePool();
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointerNdc = new THREE.Vector2();
  private readonly waterPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.015);
  private readonly rayHit = new THREE.Vector3();
  private pointerDownClient = { x: 0, y: 0 };
  private lastHoverRippleSec = -10;
  private nextAmbientDropSec = 1.6;

  private sunElevation: number;
  private sunAzimuth: number;
  private sunState: SunEnvironmentState;
  private breezeState: BreezeState;
  private isOrbitingSun = false;
  private onSunOrbitTick?: (elevation: number, azimuth: number) => void;
  private onWaterRipple?: () => void;
  private lastOrbitNotifySec = 0;

  private frameId = 0;
  private disposed = false;
  private lastTimeMs = performance.now();
  private elapsedSec = 0;
  private windPhaseSec = 0;
  private resizeObserver: ResizeObserver;

  private readonly handleContextLost: (e: Event) => void;
  private readonly handleContextRestored: () => void;
  private readonly handlePointerDown: (e: PointerEvent) => void;
  private readonly handlePointerUp: (e: PointerEvent) => void;
  private readonly handlePointerMove: (e: PointerEvent) => void;

  constructor(options: LakesideSceneOptions) {
    this.container = options.container;
    this.sunElevation = options.initialElevation;
    this.sunAzimuth = options.initialAzimuth;
    this.breezeState = computeBreezeState(options.initialWindStrength);
    this.onSunOrbitTick = options.onSunOrbitTick;
    this.onWaterRipple = options.onWaterRipple;
    this.isSoftwareGl = detectSoftwareWebGL();

    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);

    // 1. Modern physically-based WebGLRenderer
    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.04;
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2),
    );
    this.renderer.setSize(width, height);

    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = this.isSoftwareGl
      ? THREE.PCFShadowMap
      : THREE.PCFSoftShadowMap;

    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.container.appendChild(this.renderer.domElement);

    this.handleContextLost = (e: Event) => {
      e.preventDefault();
      this.stopLoop();
      options.onContextLost?.();
    };
    this.handleContextRestored = () => {
      options.onContextRestored?.();
      this.startLoop();
    };
    this.renderer.domElement.addEventListener('webglcontextlost', this.handleContextLost);
    this.renderer.domElement.addEventListener(
      'webglcontextrestored',
      this.handleContextRestored,
    );

    // Interactive lake water ripple pointer listeners
    this.handlePointerDown = (e: PointerEvent) => {
      this.pointerDownClient.x = e.clientX;
      this.pointerDownClient.y = e.clientY;
    };
    this.handlePointerUp = (e: PointerEvent) => {
      const moved = Math.hypot(
        e.clientX - this.pointerDownClient.x,
        e.clientY - this.pointerDownClient.y,
      );
      if (moved < 8) {
        this.tryTriggerWaterRipple(e.clientX, e.clientY, 1.2);
      }
    };
    this.handlePointerMove = (e: PointerEvent) => {
      if (e.buttons !== 0) return;
      if (this.elapsedSec - this.lastHoverRippleSec < 0.28) return;
      if (this.tryTriggerWaterRipple(e.clientX, e.clientY, 0.5, false)) {
        this.lastHoverRippleSec = this.elapsedSec;
      }
    };
    this.renderer.domElement.addEventListener('pointerdown', this.handlePointerDown);
    this.renderer.domElement.addEventListener('pointerup', this.handlePointerUp);
    this.renderer.domElement.addEventListener('pointermove', this.handlePointerMove);

    // 2. Scene, Fog & Studio Environment Map
    this.scene = new THREE.Scene();
    this.fog = new THREE.FogExp2(0xb9daf7, 0.0011);
    this.scene.fog = this.fog;

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
    this.scene.environment = this.envRT.texture;
    pmrem.dispose();

    // 3. Camera & OrbitControls sized for the colossal 95-meter lake
    const initialPreset = this.presets[0];
    this.camera = new THREE.PerspectiveCamera(44, width / height, 0.1, 1650);
    this.camera.position.set(...initialPreset.position);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(...initialPreset.target);
    this.controls.enableDamping = !this.isSoftwareGl;
    this.controls.dampingFactor = 0.065;
    this.controls.maxPolarAngle = Math.PI * 0.482;
    this.controls.minPolarAngle = 0.1;
    this.controls.minDistance = 1.3;
    this.controls.maxDistance = 215;
    this.controls.panSpeed = 0.9;
    this.controls.addEventListener('start', () => {
      this.isCameraTransitioning = false;
    });
    this.controls.update();

    // 4. Real-Time Dynamic Sun Light (focused sharply around the hero SE luxury bench promenade!)
    const benchAnchor = getBenchAnchor();
    this.sunFocusCenter.set(benchAnchor.x * 0.92, 0, benchAnchor.z * 0.92);

    this.sunLight = new THREE.DirectionalLight(0xfff1d6, 3.8);
    this.sunLight.castShadow = true;
    const shadowRes = this.isSoftwareGl ? 1024 : 2048;
    this.sunLight.shadow.mapSize.width = shadowRes;
    this.sunLight.shadow.mapSize.height = shadowRes;
    const d = 24.0;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.camera.near = 2;
    this.sunLight.shadow.camera.far = 160;
    this.sunLight.shadow.bias = -0.00028;
    this.sunLight.shadow.normalBias = 0.014;
    this.sunLight.shadow.radius = 1.6;
    this.sunLight.target.position.copy(this.sunFocusCenter);
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    this.hemiLight = new THREE.HemisphereLight(0x7cb8f2, 0x364730, 0.45);
    this.scene.add(this.hemiLight);

    // 3 warm heritage lantern lights flanking the hero bench & far promenade
    const lanternAnchors = getLanternAnchors();
    for (const idx of [0, 1, 6]) {
      const lp = lanternAnchors[idx];
      if (!lp) continue;
      const light = new THREE.PointLight(0xffb454, 0, 16, 1.65);
      light.position.set(lp.x, lp.y + 2.45, lp.z);
      light.castShadow = false;
      this.scene.add(light);
      this.lanternLights.push(light);
    }

    // 5. Photorealistic Sky + Clouds & Interactive Reflective Colossal Lake Water
    this.skyRig = createPhotorealisticSkyRig();
    this.scene.add(this.skyRig.sky);
    this.scene.add(this.skyRig.cloudDome);

    this.waterRig = createLakeWaterRig();
    this.scene.add(this.waterRig.mesh);

    // 6. Build Ultra-Fine Multi-Scale Microvoxel World
    const matSetup = createVoxelMaterials();
    this.voxelMaterials = matSetup.materials;
    this.windUniforms = matSetup.windUniforms;

    let totalVoxels = 0;
    let exposedFaces = 0;
    const registerArch = (
      grid: ReturnType<typeof buildMicrovoxelBenchGrid>,
      instanceMultiplier = 1,
    ) => {
      const bufs = grid.buildCulledMeshes(true);
      const arch = compileArchetype(bufs, grid.voxelCount, this.voxelMaterials);
      totalVoxels += arch.voxelCount * instanceMultiplier;
      exposedFaces += arch.faceCount * instanceMultiplier;
      return arch;
    };

    // 6A. High-res contour-aligned colossal lake basin + flush park meadow terrain
    const terrainBufs = buildGrandLakeTerrainBuffers();
    const terrainGeo = new THREE.BufferGeometry();
    terrainGeo.setAttribute('position', new THREE.BufferAttribute(terrainBufs.positions, 3));
    terrainGeo.setAttribute('color', new THREE.BufferAttribute(terrainBufs.colors, 3));
    terrainGeo.setIndex(new THREE.BufferAttribute(terrainBufs.indices, 1));
    terrainGeo.computeVertexNormals();
    const terrainMesh = new THREE.Mesh(
      terrainGeo,
      this.voxelMaterials.get(VoxelMaterialKind.TerrainMatte)!,
    );
    terrainMesh.receiveShadow = true;
    terrainMesh.castShadow = false;
    this.scene.add(terrainMesh);

    // 6B. Continuous 360-degree 2.2cm microvoxel BATAKO concrete brick promenade encircling the 308m shoreline!
    const batakoCurve = sampleClosedPolarCurve(getPathCenterRadius, 196);
    const batakoArchA = registerArch(buildMicroBatakoPathSegment(1), 98);
    const batakoArchB = registerArch(buildMicroBatakoPathSegment(2), 98);
    const batakoTransformsA: InstanceTransform[] = [];
    const batakoTransformsB: InstanceTransform[] = [];

    for (let i = 0; i < batakoCurve.length; i++) {
      const p0 = batakoCurve[i];
      const p1 = batakoCurve[(i + 1) % batakoCurve.length];
      const mx = (p0.x + p1.x) * 0.5;
      const mz = (p0.z + p1.z) * 0.5;
      const dx = p1.x - p0.x;
      const dz = p1.z - p0.z;
      const chordLen = Math.hypot(dx, dz);
      const rotY = Math.atan2(dx, dz);

      const tr: InstanceTransform = {
        x: mx,
        y: i % 2 === 0 ? 0 : -0.0022,
        z: mz,
        rotY,
        scale: 1,
        scaleZ: (chordLen / 1.276) * 1.18,
      };
      if (i % 2 === 0) batakoTransformsA.push(tr);
      else batakoTransformsB.push(tr);
    }
    addInstancedArchetype(this.scene, batakoArchA, batakoTransformsA, false, true);
    addInstancedArchetype(this.scene, batakoArchB, batakoTransformsB, false, true);

    // 6C. Continuous 360-degree 1.6cm microvoxel LAKESIDE FENCE (pagar pinggir danau) along inner coping!
    const fenceCurve = sampleClosedPolarCurve((ang) => getLakeShoreRadius(ang) + 0.21, 184);
    const fenceTransforms: InstanceTransform[] = [];
    for (let i = 0; i < fenceCurve.length; i++) {
      const p0 = fenceCurve[i];
      const p1 = fenceCurve[(i + 1) % fenceCurve.length];
      const mx = (p0.x + p1.x) * 0.5;
      const mz = (p0.z + p1.z) * 0.5;
      const midAng = Math.atan2(mz, mx);
      if (isPierOpening(midAng)) continue;

      const dx = p1.x - p0.x;
      const dz = p1.z - p0.z;
      const chordLen = Math.hypot(dx, dz);
      const rotY = Math.atan2(dx, dz);
      fenceTransforms.push({
        x: mx,
        y: 0.142,
        z: mz,
        rotY,
        scale: 1,
        scaleZ: chordLen / 1.47,
      });
    }
    const fenceArch = registerArch(buildMicroLakesideFenceSegment(), fenceTransforms.length);
    addInstancedArchetype(this.scene, fenceArch, fenceTransforms, true, true);

    // 6D. Opulent 1.2cm Royal Estate LUXURY BENCH + Seated 1.0cm Long-Haired Smoking LEGO Character!
    const benchArch = registerArch(buildMicrovoxelBenchGrid());
    const benchGroup = instantiateArchetypeGroup(benchArch, true, true);
    benchGroup.position.set(benchAnchor.x, benchAnchor.y, benchAnchor.z);
    benchGroup.rotation.y = benchAnchor.facingYaw;
    this.scene.add(benchGroup);

    const legoArch = registerArch(buildMicroLegoCharacterGrid());
    const legoGroup = instantiateArchetypeGroup(legoArch, true, true);
    // Seated comfortably slightly left-of-center on the tufted royal burgundy velvet cushion!
    legoGroup.position.set(-0.14, BENCH_SEAT_TOP_Y, 0.04);
    benchGroup.add(legoGroup);

    // Animated rising cigarette smoke wisps curling directly from the glowing orange ember tip!
    this.smokeRig = createCigaretteSmokeRig(CIGARETTE_TIP_LOCAL);
    legoGroup.add(this.smokeRig.points);

    const benchShadow = createBenchContactShadow();
    benchShadow.position.set(benchAnchor.x, benchAnchor.y + 0.008, benchAnchor.z);
    benchShadow.rotation.y = benchAnchor.facingYaw;
    this.scene.add(benchShadow);

    // 6E. Twelve ultra-fine 1.6cm heritage lakeside lanterns encircling the colossal batako promenade
    const lanternArch = registerArch(buildMicrovoxelLanternGrid(), lanternAnchors.length);
    const lanternTransforms: InstanceTransform[] = lanternAnchors.map((la) => ({
      x: la.x,
      y: la.y,
      z: la.z,
      rotY: la.yaw,
      scale: 1,
    }));
    addInstancedArchetype(this.scene, lanternArch, lanternTransforms, true, true);

    // 6F. Twenty-four 1.8cm glowing iron path bollards along the outer kanstin curb
    const bollardTransforms: InstanceTransform[] = [];
    for (let i = 0; i < 24; i++) {
      const ang = (i / 24) * Math.PI * 2 + 0.09;
      const dBench = Math.abs(Math.atan2(Math.sin(ang - BENCH_ANGLE), Math.cos(ang - BENCH_ANGLE)));
      if (dBench < 0.08) continue;
      const r = getLakeShoreRadius(ang) + 2.86;
      bollardTransforms.push({
        x: Math.cos(ang) * r,
        y: PATH_SURFACE_Y,
        z: Math.sin(ang) * r,
        rotY: -ang,
        scale: 1,
      });
    }
    const bollardArch = registerArch(buildMicroBollardPost(), bollardTransforms.length);
    addInstancedArchetype(this.scene, bollardArch, bollardTransforms, true, true);

    // 6G. Ultra-fine 2.4cm weathered wooden viewing pier aligned with the fence opening (nearly flush!)
    const pierArch = registerArch(buildMicroWoodenPier());
    const pierGroup = instantiateArchetypeGroup(pierArch, true, true);
    const pierShoreR = getLakeShoreRadius(PIER_ANGLE);
    const pierStartX = Math.cos(PIER_ANGLE) * (pierShoreR + 0.28);
    const pierStartZ = Math.sin(PIER_ANGLE) * (pierShoreR + 0.28);
    pierGroup.position.set(pierStartX, 0, pierStartZ);
    pierGroup.rotation.y = Math.atan2(-pierStartX, -pierStartZ);
    pierGroup.scale.setScalar(1.35);
    this.scene.add(pierGroup);

    // 6H. 48 ultra-fine microvoxel trees encircling the colossal 95m lakeside park!
    const willowTransforms: InstanceTransform[] = [];
    const pineTransforms: InstanceTransform[] = [];
    const oakTransforms: InstanceTransform[] = [];
    const mapleTransforms: InstanceTransform[] = [];

    const totalTrees = 48;
    for (let i = 0; i < totalTrees; i++) {
      const ang = (i / totalTrees) * Math.PI * 2 + (hash2D(i * 3.1, 1.7) - 0.5) * 0.06;
      // Keep direct SE panorama camera sightline behind the luxury bench wide open
      const dBench = Math.abs(Math.atan2(Math.sin(ang - BENCH_ANGLE), Math.cos(ang - BENCH_ANGLE)));
      if (dBench < 0.14) continue;

      const tier = i % 3;
      const extraR =
        tier === 0
          ? 5.2 + hash2D(i, 4.3) * 2.4
          : tier === 1
            ? 9.2 + hash2D(i, 7.1) * 4.5
            : 15.5 + hash2D(i, 9.9) * 8.5;

      const r = getLakeShoreRadius(ang) + extraR;
      const x = Math.cos(ang) * r;
      const z = Math.sin(ang) * r;
      const groundH = sampleTerrain(x, z).height;
      const tr: InstanceTransform = {
        x,
        y: groundH,
        z,
        rotY: hash2D(x * 0.3, z * 0.3) * Math.PI * 2,
        scale: 1.35 + hash2D(z * 0.5, x * 0.5) * 0.55,
      };

      const speciesRoll = i % 7;
      if (speciesRoll === 0) willowTransforms.push(tr);
      else if (speciesRoll === 2) mapleTransforms.push(tr);
      else if (speciesRoll === 4 || speciesRoll === 6) oakTransforms.push(tr);
      else pineTransforms.push(tr);
    }

    const willowArch = registerArch(buildMicroWillowTree(), willowTransforms.length);
    const pineArch = registerArch(buildMicroPineTree(), pineTransforms.length);
    const oakArch = registerArch(buildMicroBroadleafTree('oak'), oakTransforms.length);
    const mapleArch = registerArch(buildMicroBroadleafTree('maple'), mapleTransforms.length);

    addInstancedArchetype(this.scene, willowArch, willowTransforms, true, true);
    addInstancedArchetype(this.scene, pineArch, pineTransforms, true, true);
    addInstancedArchetype(this.scene, oakArch, oakTransforms, true, true);
    addInstancedArchetype(this.scene, mapleArch, mapleTransforms, true, true);

    // 6I. Ultra-fine sub-2cm instanced microvoxel vegetation: bushes, grass, wildflowers, reeds, lotus & boulders
    const bushGreenArch = registerArch(buildMicroBush(false));
    const bushRoseArch = registerArch(buildMicroBush(true, 0xf2c2d4));
    const bushBlueArch = registerArch(buildMicroBush(true, 0xb2d2f5));
    const grassArch = registerArch(buildMicroGrassClump());
    const flowerDaisyArch = registerArch(buildMicroWildflowerCluster(0xfaf7ee, 0xf5cc48));
    const flowerLavenderArch = registerArch(buildMicroWildflowerCluster(0xb197e8, 0x8669c7));
    const flowerButtercupArch = registerArch(buildMicroWildflowerCluster(0xf7d24d, 0xd69620));
    const reedArch = registerArch(buildMicroReedCluster());
    const lilyPlainArch = registerArch(buildMicroLilyPad(false));
    const lilyPinkArch = registerArch(buildMicroLilyPad(true, 0xf5a6bd));
    const lilyIvoryArch = registerArch(buildMicroLilyPad(true, 0xfaf2e8));
    const boulderArch = registerArch(buildMicroMossyBoulder());

    this.populateMicroVegetation({
      bushGreenArch,
      bushRoseArch,
      bushBlueArch,
      grassArch,
      flowerDaisyArch,
      flowerLavenderArch,
      flowerButtercupArch,
      reedArch,
      lilyPlainArch,
      lilyPinkArch,
      lilyIvoryArch,
      boulderArch,
    });

    // Seamless outer horizon terrain
    const outerTerrain = createOuterHorizonTerrain();
    this.scene.add(outerTerrain);

    // Floating sunlit pollen / lakeside motes
    this.motes = createLakesideMotes();
    this.scene.add(this.motes.points);

    // Seed glowing ripples right in the foreground expanse in front of the SE luxury bench & across the lake!
    const shoreSE = getLakeShoreRadius(BENCH_ANGLE);
    const rip1R = shoreSE - 10.5;
    const rip2R = shoreSE - 22.0;
    this.ripplePool.trigger(
      Math.cos(BENCH_ANGLE + 0.08) * rip1R,
      Math.sin(BENCH_ANGLE + 0.08) * rip1R,
      0.0,
      0.95,
    );
    this.ripplePool.trigger(
      Math.cos(BENCH_ANGLE - 0.14) * rip2R,
      Math.sin(BENCH_ANGLE - 0.14) * rip2R,
      0.45,
      0.85,
    );

    // 7. Apply Initial Sun Lighting, Breeze & Sky State
    this.sunState = computeSunState(
      this.sunElevation,
      this.sunAzimuth,
      SUN_LIGHT_DISTANCE,
    );
    this.applySunState(this.sunState);

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(this.container);

    options.onReady?.({
      totalVoxels,
      exposedFaces,
      isSoftwareGl: this.isSoftwareGl,
    });

    this.startLoop();
  }

  private populateMicroVegetation(archs: {
    bushGreenArch: CompiledArchetype;
    bushRoseArch: CompiledArchetype;
    bushBlueArch: CompiledArchetype;
    grassArch: CompiledArchetype;
    flowerDaisyArch: CompiledArchetype;
    flowerLavenderArch: CompiledArchetype;
    flowerButtercupArch: CompiledArchetype;
    reedArch: CompiledArchetype;
    lilyPlainArch: CompiledArchetype;
    lilyPinkArch: CompiledArchetype;
    lilyIvoryArch: CompiledArchetype;
    boulderArch: CompiledArchetype;
  }): void {
    // 1. Mossy shoreline & park meadow boulders around the colossal lake
    const boulderTransforms: InstanceTransform[] = [];
    for (let i = 0; i < 24; i++) {
      const ang = (i / 24) * Math.PI * 2 + 0.15;
      const isWaterSide = i % 2 === 0;
      const off = isWaterSide ? -0.55 - (i % 3) * 0.25 : 4.2 + (i % 4) * 1.4;
      const r = getLakeShoreRadius(ang) + off;
      const x = Math.cos(ang) * r;
      const z = Math.sin(ang) * r;
      const h = sampleTerrain(x, z).height;
      boulderTransforms.push({
        x,
        y: Math.max(-0.1, h),
        z,
        rotY: i * 1.15,
        scale: 0.95 + (i % 3) * 0.35,
      });
    }
    addInstancedArchetype(this.scene, archs.boulderArch, boulderTransforms, true, true);

    // 2. Lush bushes & flowering shrubs along outer batako curb & park banks
    const bushGreen: InstanceTransform[] = [];
    const bushRose: InstanceTransform[] = [];
    const bushBlue: InstanceTransform[] = [];

    for (let i = 0; i < 200; i++) {
      const ang = (i / 200) * Math.PI * 2 + (hash2D(i * 2.1, 7.3) - 0.5) * 0.05;
      const angDistBench = Math.abs(
        Math.atan2(Math.sin(ang - BENCH_ANGLE), Math.cos(ang - BENCH_ANGLE)),
      );
      if (angDistBench < 0.09) continue;

      const shoreR = getLakeShoreRadius(ang);
      const r = shoreR + 3.7 + hash2D(i * 3.7, 1.9) * 18.0;
      const x = Math.cos(ang) * r;
      const z = Math.sin(ang) * r;
      const sample = sampleTerrain(x, z);
      if (sample.zone !== 'meadow' && sample.zone !== 'hill') continue;

      const tr: InstanceTransform = {
        x,
        y: sample.height,
        z,
        rotY: hash2D(x, z) * Math.PI * 2,
        scale: 1.0 + hash2D(z * 1.7, x * 2.3) * 0.72,
      };
      const kind = i % 5;
      if (kind === 0) bushRose.push(tr);
      else if (kind === 2) bushBlue.push(tr);
      else bushGreen.push(tr);
    }
    addInstancedArchetype(this.scene, archs.bushGreenArch, bushGreen, true, true);
    addInstancedArchetype(this.scene, archs.bushRoseArch, bushRose, true, true);
    addInstancedArchetype(this.scene, archs.bushBlueArch, bushBlue, true, true);

    // 3. Dense 1.4cm microvoxel arching grass clumps concentrated around SE bench curb + full 360° meadow
    const grassList: InstanceTransform[] = [];
    for (let i = 0; i < 560; i++) {
      // Dedicate 35% of tufts near the hero SE lakeside promenade so close-ups look ultra lush!
      const isHeroZone = i < 200;
      const ang = isHeroZone
        ? BENCH_ANGLE + (hash2D(i * 3.7, 1.3) - 0.5) * 0.75
        : i * 2.39996;
      const shoreR = getLakeShoreRadius(ang);
      const offset = isHeroZone
        ? 3.18 + hash2D(i * 4.1, 2.3) * 6.5
        : 3.25 + hash2D(i * 3.1, 5.9) * 19.0;
      const r = shoreR + offset;
      const x = Math.cos(ang) * r;
      const z = Math.sin(ang) * r;
      const sample = sampleTerrain(x, z);
      if (sample.zone !== 'meadow' && sample.zone !== 'hill') continue;

      grassList.push({
        x,
        y: sample.height,
        z,
        rotY: hash2D(x * 3.1, z * 2.9) * Math.PI * 2,
        scale: 1.0 + hash2D(z * 1.3, x * 4.1) * 0.65,
      });
    }
    addInstancedArchetype(this.scene, archs.grassArch, grassList, false, true);

    // 4. Three varieties of 1.2cm super-detailed wildflower bouquets framing the SE luxury bench & full park
    const daisies: InstanceTransform[] = [];
    const lavenders: InstanceTransform[] = [];
    const buttercups: InstanceTransform[] = [];

    for (let i = 0; i < 320; i++) {
      const isHeroZone = i < 120;
      const ang = isHeroZone
        ? BENCH_ANGLE + (hash2D(i * 4.9, 2.1) - 0.5) * 0.65
        : i * 2.39996 + 0.8;
      const shoreR = getLakeShoreRadius(ang);
      const offset = isHeroZone
        ? 3.3 + hash2D(i * 2.7, 6.1) * 5.2
        : 3.4 + hash2D(i * 2.7, 6.1) * 16.0;
      const r = shoreR + offset;
      const x = Math.cos(ang) * r;
      const z = Math.sin(ang) * r;
      const sample = sampleTerrain(x, z);
      if (sample.zone !== 'meadow' && sample.zone !== 'hill') continue;

      const tr: InstanceTransform = {
        x,
        y: sample.height,
        z,
        rotY: hash2D(x * 5.2, z * 3.4) * Math.PI * 2,
        scale: 1.0 + hash2D(i * 1.9, z) * 0.55,
      };
      const roll = i % 3;
      if (roll === 0) daisies.push(tr);
      else if (roll === 1) lavenders.push(tr);
      else buttercups.push(tr);
    }
    addInstancedArchetype(this.scene, archs.flowerDaisyArch, daisies, false, true);
    addInstancedArchetype(this.scene, archs.flowerLavenderArch, lavenders, false, true);
    addInstancedArchetype(this.scene, archs.flowerButtercupArch, buttercups, false, true);

    // 5. Lakeside 1.7cm cattail reed clusters nestled in shallow water pockets just inside the coping
    const reeds: InstanceTransform[] = [];
    for (let p = 0; p < 22; p++) {
      const ang = (p / 22) * Math.PI * 2 + 0.14;
      if (isPierOpening(ang)) continue;
      const baseR = getLakeShoreRadius(ang) - 0.65;
      for (let k = 0; k < 3; k++) {
        const a = ang + (hash2D(k * 3.1, p * 9.7) - 0.5) * 0.04;
        const r = baseR + (hash2D(p * 5.3, k * 2.9) - 0.5) * 0.65;
        const x = Math.cos(a) * r;
        const z = Math.sin(a) * r;
        reeds.push({
          x,
          y: 0.0,
          z,
          rotY: hash2D(x, z) * Math.PI * 2,
          scale: 1.0 + hash2D(z, x) * 0.4,
        });
      }
    }
    addInstancedArchetype(this.scene, archs.reedArch, reeds, true, true);

    // 6. Floating 1.8cm microvoxel lily pads & pink/ivory lotus blooms distributed across the colossal 95m lake
    const lilyPlain: InstanceTransform[] = [];
    const lilyPink: InstanceTransform[] = [];
    const lilyIvory: InstanceTransform[] = [];

    const shoreSE = getLakeShoreRadius(BENCH_ANGLE);
    const lilyClusters: { x: number; z: number; count: number }[] = [
      // Foreground scenic lotus pockets clearly visible right off the luxury bench shoreline!
      { x: Math.cos(BENCH_ANGLE + 0.12) * (shoreSE - 4.2), z: Math.sin(BENCH_ANGLE + 0.12) * (shoreSE - 4.2), count: 7 },
      { x: Math.cos(BENCH_ANGLE - 0.11) * (shoreSE - 5.8), z: Math.sin(BENCH_ANGLE - 0.11) * (shoreSE - 5.8), count: 7 },
      { x: Math.cos(BENCH_ANGLE + 0.03) * (shoreSE - 14.0), z: Math.sin(BENCH_ANGLE + 0.03) * (shoreSE - 14.0), count: 6 },
    ];
    // Plus 12 lush lotus clusters scattered across the colossal 95m lake expanse
    for (let c = 0; c < 12; c++) {
      const ang = (c / 12) * Math.PI * 2 + 0.35;
      const dist = (0.35 + hash2D(c * 2.9, 5.1) * 0.48) * getLakeShoreRadius(ang);
      lilyClusters.push({
        x: Math.cos(ang) * dist,
        z: Math.sin(ang) * dist,
        count: 5,
      });
    }

    for (const cluster of lilyClusters) {
      for (let i = 0; i < cluster.count; i++) {
        const ox = cluster.x + (hash2D(i * 3.1, cluster.x) - 0.5) * 4.5;
        const oz = cluster.z + (hash2D(cluster.z, i * 5.7) - 0.5) * 4.5;
        if (Math.hypot(ox, oz) > getLakeShoreRadius(Math.atan2(oz, ox)) - 1.2) continue;

        const tr: InstanceTransform = {
          x: ox,
          y: 0.02,
          z: oz,
          rotY: hash2D(ox * 2.7, oz * 3.1) * Math.PI * 2,
          scale: 1.05 + hash2D(i, ox) * 0.55,
        };
        if (i === 0) lilyPink.push(tr);
        else if (i === 3) lilyIvory.push(tr);
        else lilyPlain.push(tr);
      }
    }
    addInstancedArchetype(this.scene, archs.lilyPlainArch, lilyPlain, false, true);
    addInstancedArchetype(this.scene, archs.lilyPinkArch, lilyPink, false, true);
    addInstancedArchetype(this.scene, archs.lilyIvoryArch, lilyIvory, false, true);
  }

  private tryTriggerWaterRipple(
    clientX: number,
    clientY: number,
    strength = 1.0,
    notify = true,
  ): boolean {
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    this.pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointerNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.pointerNdc, this.camera);
    if (!this.raycaster.ray.intersectPlane(this.waterPlane, this.rayHit)) {
      return false;
    }

    const r = Math.hypot(this.rayHit.x, this.rayHit.z);
    const ang = Math.atan2(this.rayHit.z, this.rayHit.x);
    const shoreR = getLakeShoreRadius(ang);
    if (r > shoreR - 0.1) return false;

    this.ripplePool.trigger(this.rayHit.x, this.rayHit.z, this.elapsedSec, strength);
    if (notify) {
      this.onWaterRipple?.();
    }
    return true;
  }

  triggerRippleAt(x: number, z: number, strength = 1.2): void {
    this.ripplePool.trigger(x, z, this.elapsedSec, strength);
  }

  setSunPosition(elevationDeg: number, azimuthDeg: number): void {
    this.sunElevation = elevationDeg;
    this.sunAzimuth = azimuthDeg;
    this.sunState = computeSunState(elevationDeg, azimuthDeg, SUN_LIGHT_DISTANCE);
    this.applySunState(this.sunState);
  }

  setWindStrength(strength: number): void {
    this.breezeState = computeBreezeState(strength);
    this.windUniforms.uWindAmp.value = this.breezeState.foliageSwayAmplitude;
    this.waterRig.update(
      this.sunState,
      this.elapsedSec,
      this.breezeState,
      this.ripplePool.ripples,
    );
  }

  setAutoOrbit(enabled: boolean): void {
    this.isOrbitingSun = enabled;
  }

  setCameraPreset(presetId: CameraPresetId): void {
    const preset = this.presets.find((p) => p.id === presetId);
    if (!preset) return;
    this.targetCamPos.set(...preset.position);
    this.targetLookAt.set(...preset.target);
    if (this.isSoftwareGl) {
      this.camera.position.copy(this.targetCamPos);
      this.controls.target.copy(this.targetLookAt);
      this.controls.update();
      this.isCameraTransitioning = false;
      this.renderer.render(this.scene, this.camera);
    } else {
      this.isCameraTransitioning = true;
    }
  }

  private applySunState(sun: SunEnvironmentState): void {
    // Anchor directional shadow frustum cleanly around the hero luxury bench & promenade
    this.sunLight.position.set(
      this.sunFocusCenter.x + sun.sunLightPosition.x,
      this.sunFocusCenter.y + sun.sunLightPosition.y,
      this.sunFocusCenter.z + sun.sunLightPosition.z,
    );
    this.sunLight.color.setRGB(sun.sunColor.r, sun.sunColor.g, sun.sunColor.b);
    this.sunLight.intensity = sun.sunIntensity;

    this.hemiLight.color.setRGB(
      sun.hemiSkyColor.r,
      sun.hemiSkyColor.g,
      sun.hemiSkyColor.b,
    );
    this.hemiLight.groundColor.setRGB(
      sun.hemiGroundColor.r,
      sun.hemiGroundColor.g,
      sun.hemiGroundColor.b,
    );
    this.hemiLight.intensity = sun.hemiIntensity;

    this.fog.color.setRGB(sun.fogColor.r, sun.fogColor.g, sun.fogColor.b);
    this.fog.density = sun.fogDensity;

    this.renderer.toneMappingExposure = sun.exposure;
    this.scene.environmentIntensity = sun.environmentIntensity;

    for (const light of this.lanternLights) {
      light.intensity = sun.lanternIntensity;
    }
    const glowMat = this.voxelMaterials.get(VoxelMaterialKind.LanternGlow);
    if (glowMat) {
      glowMat.emissiveIntensity = 0.55 + sun.lanternIntensity * 0.85;
    }

    this.skyRig.update(sun, this.elapsedSec, this.breezeState);
    this.waterRig.update(
      sun,
      this.elapsedSec,
      this.breezeState,
      this.ripplePool.ripples,
    );
  }

  private handleResize(): void {
    if (this.disposed) return;
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.renderer.render(this.scene, this.camera);
  }

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (typeof gl.fenceSync === 'function') {
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (this.disposed) {
          if (sync) gl.deleteSync(sync);
          return;
        }
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          this.frameId = window.setTimeout(poll, 6);
        } else {
          if (sync) gl.deleteSync(sync);
          this.frameId = window.setTimeout(cb, 85);
        }
      };
      this.frameId = window.setTimeout(poll, 6);
    } else {
      this.frameId = window.setTimeout(cb, 90);
    }
  }

  private tick = (): void => {
    if (this.disposed) return;

    const nowMs = performance.now();
    const dt = Math.min(0.1, Math.max(0.001, (nowMs - this.lastTimeMs) / 1000));
    this.lastTimeMs = nowMs;
    this.elapsedSec += dt;

    // Advance live breeze phase smoothly for foliage sway & rising cigarette smoke
    this.windPhaseSec += dt * this.breezeState.foliageSwaySpeed;
    this.windUniforms.uWindTime.value = this.windPhaseSec;
    this.windUniforms.uWindAmp.value = this.breezeState.foliageSwayAmplitude;
    this.smokeRig.update(this.elapsedSec, this.breezeState);

    // Subtle periodic ambient ripples on the lake (biased gently toward the visible foreground & center)
    if (this.elapsedSec >= this.nextAmbientDropSec) {
      const seed = this.elapsedSec * 1.73;
      const dropAng = BENCH_ANGLE + (hash2D(seed, 3.1) - 0.5) * 1.8;
      const dropR = (0.35 + hash2D(7.4, seed) * 0.52) * getLakeShoreRadius(dropAng);
      this.ripplePool.trigger(
        Math.cos(dropAng) * dropR,
        Math.sin(dropAng) * dropR,
        this.elapsedSec,
        0.75 + this.breezeState.strength * 0.35,
      );
      this.nextAmbientDropSec =
        this.elapsedSec + Math.max(1.3, 3.4 - this.breezeState.strength * 1.8);
    }

    // Optional real-time solar arc animation
    if (this.isOrbitingSun) {
      this.sunAzimuth = (this.sunAzimuth + dt * 11) % 360;
      const arcPhase = ((this.sunAzimuth - 75) / 210) * Math.PI;
      const targetElev = 2 + Math.max(0, Math.sin(arcPhase)) * 58;
      this.sunElevation = THREE.MathUtils.damp(this.sunElevation, targetElev, 2.5, dt);
      this.sunState = computeSunState(
        this.sunElevation,
        this.sunAzimuth,
        SUN_LIGHT_DISTANCE,
      );
      this.applySunState(this.sunState);

      if (this.elapsedSec - this.lastOrbitNotifySec > 0.16) {
        this.lastOrbitNotifySec = this.elapsedSec;
        this.onSunOrbitTick?.(
          Math.round(this.sunElevation * 10) / 10,
          Math.round(this.sunAzimuth),
        );
      }
    } else {
      this.skyRig.update(this.sunState, this.elapsedSec, this.breezeState);
      this.waterRig.update(
        this.sunState,
        this.elapsedSec,
        this.breezeState,
        this.ripplePool.ripples,
      );
    }

    this.motes.update(this.elapsedSec, this.sunState, this.breezeState);

    // Smooth exponential camera preset damping (hardware GPU)
    if (this.isCameraTransitioning) {
      const lambda = 5.5;
      this.camera.position.x = THREE.MathUtils.damp(
        this.camera.position.x,
        this.targetCamPos.x,
        lambda,
        dt,
      );
      this.camera.position.y = THREE.MathUtils.damp(
        this.camera.position.y,
        this.targetCamPos.y,
        lambda,
        dt,
      );
      this.camera.position.z = THREE.MathUtils.damp(
        this.camera.position.z,
        this.targetCamPos.z,
        lambda,
        dt,
      );

      this.controls.target.x = THREE.MathUtils.damp(
        this.controls.target.x,
        this.targetLookAt.x,
        lambda,
        dt,
      );
      this.controls.target.y = THREE.MathUtils.damp(
        this.controls.target.y,
        this.targetLookAt.y,
        lambda,
        dt,
      );
      this.controls.target.z = THREE.MathUtils.damp(
        this.controls.target.z,
        this.targetLookAt.z,
        lambda,
        dt,
      );

      if (
        this.camera.position.distanceTo(this.targetCamPos) < 0.05 &&
        this.controls.target.distanceTo(this.targetLookAt) < 0.04
      ) {
        this.camera.position.copy(this.targetCamPos);
        this.controls.target.copy(this.targetLookAt);
        this.isCameraTransitioning = false;
      }
    }

    this.controls.update();
    this.renderer.render(this.scene, this.camera);

    if (this.isSoftwareGl) {
      this.afterDraw(this.tick);
    } else {
      this.frameId = requestAnimationFrame(this.tick);
    }
  };

  private startLoop(): void {
    this.lastTimeMs = performance.now();
    this.tick();
  }

  private stopLoop(): void {
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stopLoop();
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.renderer.domElement.removeEventListener('webglcontextlost', this.handleContextLost);
    this.renderer.domElement.removeEventListener(
      'webglcontextrestored',
      this.handleContextRestored,
    );
    this.renderer.domElement.removeEventListener('pointerdown', this.handlePointerDown);
    this.renderer.domElement.removeEventListener('pointerup', this.handlePointerUp);
    this.renderer.domElement.removeEventListener('pointermove', this.handlePointerMove);

    this.skyRig.dispose();
    this.waterRig.dispose();
    this.smokeRig.dispose();
    this.motes.dispose();
    this.envRT.dispose();

    const disposedGeos = new Set<THREE.BufferGeometry>();
    const disposedMats = new Set<THREE.Material>();
    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.InstancedMesh) {
        if (!disposedGeos.has(obj.geometry)) {
          disposedGeos.add(obj.geometry);
          obj.geometry.dispose();
        }
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const m of mats) {
          if (!disposedMats.has(m)) {
            disposedMats.add(m);
            m.dispose();
          }
        }
      }
    });

    this.renderer.dispose();
    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
