/**
 * Pure deterministic spatial layout math for the Colossal Grand Lakeside Microvoxel Park:
 * - Colossal centerpiece lake (10x larger area again: radius ~47.5m, ~95m diameter, ~7,100 m²!)
 * - Water surface almost flush with the ground & batako promenade (+0.11m..+0.12m above water!)
 * - Continuous interlocking batako brick promenade completely encircling the colossal lake
 * - Lakeside fence lining the water's edge along the promenade (with pier opening)
 * - Scenic batako overlook for the royal luxury lakeside bench & seated LEGO character
 */

export const WATER_LEVEL_Y = 0.0;
/** Promenade & lakeside ground sits almost flush (~11cm) above the lake water surface */
export const GROUND_BASE_Y = 0.11;
export const PATH_SURFACE_Y = 0.12;
export const COPING_RIM_Y = 0.135;

/**
 * Deterministic 2D hash noise in [0, 1] for micro-organic variation.
 */
export function hash2D(x: number, z: number): number {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

export function smoothNoise2D(x: number, z: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);

  const a = hash2D(ix, iz);
  const b = hash2D(ix + 1, iz);
  const c = hash2D(ix, iz + 1);
  const d = hash2D(ix + 1, iz + 1);

  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}

export function fbm2D(x: number, z: number): number {
  let value = 0;
  let amp = 0.5;
  let freq = 1;
  for (let i = 0; i < 3; i++) {
    value += amp * smoothNoise2D(x * freq, z * freq);
    freq *= 2.03;
    amp *= 0.5;
  }
  return value;
}

/**
 * Organic colossal lake shoreline radius as a function of polar angle (radians).
 * ~3.17x linear radius vs the previous 15m lake => ~10.0x surface area (~7,100 m², ~95m across)!
 */
export function getLakeShoreRadius(angle: number): number {
  return (
    47.5 +
    4.8 * Math.cos(angle * 2 - 0.55) +
    2.6 * Math.sin(angle * 3 + 0.4) +
    1.2 * Math.cos(angle * 4 + 1.2)
  );
}

/**
 * Centerline radius of the continuous batako promenade encircling the colossal lake.
 * Inner edge sits right at shoreR + 0.15m (with the lakeside fence right along the coping!).
 */
export function getPathCenterRadius(angle: number): number {
  return getLakeShoreRadius(angle) + 1.55;
}

export const PATH_HALF_WIDTH = 1.32;
export const PATH_CURB_WIDTH = 0.16;

/** Polar angle of the weathered wooden viewing pier on the far shore */
export const PIER_ANGLE = -1.96;

/**
 * Hero luxury lakeside bench placed along the sunny SE batako promenade right behind the lakeside fence,
 * gazing directly across the vast 95-meter reflective lake.
 */
export const BENCH_ANGLE = 1.24;

export function getBenchAnchor(): {
  x: number;
  z: number;
  y: number;
  facingYaw: number;
} {
  const shoreR = getLakeShoreRadius(BENCH_ANGLE);
  // Placed cleanly on the outer side of the batako promenade, leaving a walkable lane before the lakeside fence
  const r = shoreR + 2.12;
  const x = Math.cos(BENCH_ANGLE) * r;
  const z = Math.sin(BENCH_ANGLE) * r;
  const facingYaw = Math.atan2(-x, -z);
  return { x, z, y: PATH_SURFACE_Y, facingYaw };
}

export function getLanternAnchors(): { x: number; z: number; y: number; yaw: number }[] {
  // Primary heritage lanterns flanking the hero luxury bench + 10 more evenly spaced around the 300m promenade
  const angles = [
    BENCH_ANGLE - 0.055,
    BENCH_ANGLE + 0.065,
    BENCH_ANGLE + 0.55,
    BENCH_ANGLE + 1.08,
    2.85,
    -2.9,
    -2.35,
    -1.65,
    -1.08,
    -0.52,
    0.05,
    0.62,
  ];
  return angles.map((ang) => {
    const r = getLakeShoreRadius(ang) + 2.66;
    const x = Math.cos(ang) * r;
    const z = Math.sin(ang) * r;
    return {
      x,
      z,
      y: PATH_SURFACE_Y,
      yaw: Math.atan2(-x, -z),
    };
  });
}

export function getLanternAnchor(): { x: number; z: number; y: number } {
  const first = getLanternAnchors()[0];
  return { x: first.x, z: first.z, y: first.y };
}

/**
 * Returns whether a polar angle falls inside the wooden pier entrance opening
 * (~3.0m clean gap along the 47.5m shoreline where the lakeside fence pauses).
 */
export function isPierOpening(angle: number): boolean {
  const diff = Math.abs(Math.atan2(Math.sin(angle - PIER_ANGLE), Math.cos(angle - PIER_ANGLE)));
  return diff < 0.032;
}

export interface TerrainSample {
  height: number;
  zone: 'water' | 'shore' | 'overlook' | 'path' | 'curb' | 'meadow' | 'hill';
  distFromShore: number;
  distFromPathCenter: number;
}

/**
 * Samples deterministic ground height & semantic surface zone at world (x, z).
 * Ground & batako path sit nearly flush (+0.11m to +0.13m) with the water surface (0.0m)!
 */
export function sampleTerrain(x: number, z: number): TerrainSample {
  const r = Math.hypot(x, z);
  const angle = Math.atan2(z, x);
  const shoreR = getLakeShoreRadius(angle);
  const pathR = getPathCenterRadius(angle);

  const distFromShore = r - shoreR;
  const distFromPathCenter = Math.abs(r - pathR);

  // Inside the colossal lake basin: shallow sandy shelf near coping deepening to -2.6m basin
  if (distFromShore < 0) {
    const normalizedDepth = Math.min(1, -distFromShore / 16.0);
    const bedVariation = (fbm2D(x * 0.12 + 10, z * 0.12 - 5) - 0.5) * 0.28;
    const height = -0.1 - Math.pow(normalizedDepth, 0.85) * 2.55 + bedVariation;
    return {
      height,
      zone: 'water',
      distFromShore,
      distFromPathCenter,
    };
  }

  // Check luxury lakeside bench overlook plaza bay
  const bench = getBenchAnchor();
  const dBench = Math.hypot(x - bench.x, z - bench.z);
  if (dBench <= 2.45 && distFromShore >= 0.06) {
    return {
      height: PATH_SURFACE_Y,
      zone: 'overlook',
      distFromShore,
      distFromPathCenter,
    };
  }

  // Narrow concrete coping edge right where water meets land (nearly flush!)
  if (distFromShore <= 0.26) {
    return {
      height: COPING_RIM_Y,
      zone: 'curb',
      distFromShore,
      distFromPathCenter,
    };
  }

  // Continuous batako concrete brick walking promenade encircling the entire colossal lake
  if (distFromPathCenter <= PATH_HALF_WIDTH) {
    return {
      height: PATH_SURFACE_Y,
      zone: 'path',
      distFromShore,
      distFromPathCenter,
    };
  }

  // Outer curb bordering the batako promenade
  if (distFromPathCenter <= PATH_HALF_WIDTH + PATH_CURB_WIDTH) {
    return {
      height: COPING_RIM_Y,
      zone: 'curb',
      distFromShore,
      distFromPathCenter,
    };
  }

  // Lush almost-flat lakeside park lawn gently rising into soft woodland banks farther out
  const outerT = Math.max(0, r - (pathR + PATH_HALF_WIDTH + PATH_CURB_WIDTH));
  const noiseH = fbm2D(x * 0.055 + 3.1, z * 0.055 + 7.4);
  const fineH = (fbm2D(x * 0.24 - 2.3, z * 0.24 + 4.8) - 0.5) * 0.09;

  const gentleRoll = Math.pow(Math.max(0, outerT - 1.2) * 0.095, 1.32) * (0.48 + 0.78 * noiseH);
  const height = GROUND_BASE_Y + gentleRoll + fineH * Math.min(1, outerT * 0.35);

  return {
    height,
    zone: outerT > 8.5 ? 'hill' : 'meadow',
    distFromShore,
    distFromPathCenter,
  };
}
