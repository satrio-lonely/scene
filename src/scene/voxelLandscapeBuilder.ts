import {
  fbm2D,
  getLakeShoreRadius,
  getPathCenterRadius,
  GROUND_BASE_Y,
  hash2D,
  PATH_CURB_WIDTH,
  PATH_HALF_WIDTH,
  sampleTerrain,
  WATER_LEVEL_Y,
} from './worldLayout';

export interface TerrainMeshBuffers {
  positions: Float32Array;
  colors: Float32Array;
  indices: Uint32Array;
  vertexCount: number;
  triangleCount: number;
}

function hexToRgbTuple(hex: number): [number, number, number] {
  return [
    ((hex >> 16) & 0xff) / 255,
    ((hex >> 8) & 0xff) / 255,
    (hex & 0xff) / 255,
  ];
}

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function lerp3(
  a: [number, number, number],
  b: [number, number, number],
  t: number,
): [number, number, number] {
  const k = Math.max(0, Math.min(1, t));
  return [
    a[0] + (b[0] - a[0]) * k,
    a[1] + (b[1] - a[1]) * k,
    a[2] + (b[2] - a[2]) * k,
  ];
}

/**
 * Builds the high-resolution polar basin & nearly-flush park meadow mesh for the
 * 10x larger grand lake (radius 0..34.5m, ~69m diameter):
 * - Contour-aligned rings hugging `getLakeShoreRadius(angle)` precisely so the shallow sandy shelf,
 *   submerged pebbles, concrete promenade sub-bed, and flush park lawn meet cleanly with zero gaps.
 * - Subtle 3.5cm micro-stepped contour terracing + crisp per-cell tonal dithering to harmonize
 *   with the 1.2cm–2.2cm microvoxel architecture & flora.
 */
export function buildGrandLakeTerrainBuffers(): TerrainMeshBuffers {
  const radialSegs = 160;

  // Normalized radial offsets relative to shoreline (shoreR = 14.6..16.8m):
  // Lakebed: rFrac in [0, 1.0] (22 rings, denser near shoreline shelf!)
  // Promenade sub-bed: offset in [+0.05, +2.98] (5 rings tucked cleanly below 2.2cm batako bricks)
  // Flush park meadow & outer banks: offset in [+3.02, +18.5] (32 rings)
  const ringProfile: { kind: 'lake' | 'offset'; val: number }[] = [];

  // Lake center -> deep basin -> shallow sandy shore shelf
  const lakeFracs = [
    0.0, 0.12, 0.24, 0.36, 0.48, 0.58, 0.67, 0.75, 0.81, 0.86, 0.90, 0.935,
    0.96, 0.978, 0.99, 0.998,
  ];
  for (const f of lakeFracs) {
    ringProfile.push({ kind: 'lake', val: f });
  }

  // Right under the lakeside coping & batako concrete brick promenade (tucked slightly below brick top)
  const bedOffsets = [0.06, 0.35, 1.55, 2.75, 2.98];
  for (const off of bedOffsets) {
    ringProfile.push({ kind: 'offset', val: off });
  }

  // Lush nearly-flush park lawn outside outer kanstin curb out to shoreR + 42m (~90m radius)
  const meadowOffsets = [
    3.08, 3.45, 4.0, 4.8, 5.9, 7.3, 9.0, 11.2, 13.8, 16.8, 20.2, 24.0, 28.5,
    33.0, 37.5, 42.0,
  ];
  for (const off of meadowOffsets) {
    ringProfile.push({ kind: 'offset', val: off });
  }

  const ringCount = ringProfile.length;
  const stride = radialSegs + 1;
  const vertexCount = ringCount * stride;

  const positions = new Float32Array(vertexCount * 3);
  const colors = new Float32Array(vertexCount * 3);

  const GRASS_FRESH = hexToRgbTuple(0x557e3c);
  const GRASS_SUN = hexToRgbTuple(0x6b9346);
  const GRASS_SHADE = hexToRgbTuple(0x416530);
  const SAND_SHALLOW = hexToRgbTuple(0xc6b48c);
  const PEBBLE_WET = hexToRgbTuple(0x787467);
  const LAKEBED_MID = hexToRgbTuple(0x4e5f56);
  const LAKEBED_DEEP = hexToRgbTuple(0x2d4147);
  const SUB_MORTAR = hexToRgbTuple(0x676964);

  let vIdx = 0;
  for (let ir = 0; ir < ringCount; ir++) {
    const prof = ringProfile[ir];

    for (let ia = 0; ia <= radialSegs; ia++) {
      const wrappedIa = ia % radialSegs;
      const ang = (wrappedIa / radialSegs) * Math.PI * 2;
      const shoreR = getLakeShoreRadius(ang);

      const r = prof.kind === 'lake' ? shoreR * prof.val : shoreR + prof.val;
      const x = Math.cos(ang) * r;
      const z = Math.sin(ang) * r;

      let y: number;
      let rgb: [number, number, number];

      if (prof.kind === 'lake') {
        const sample = sampleTerrain(x, z);
        const depth = WATER_LEVEL_Y - sample.height;
        // Subtle 4cm terraced lakebed micro-steps
        y = Math.round(sample.height / 0.04) * 0.04;
        if (prof.val > 0.992) {
          y = -0.1;
        }
        const pebNoise = hash2D(Math.floor(x * 3.5), Math.floor(z * 3.5));
        if (depth < 0.36) {
          rgb = pebNoise > 0.66 ? PEBBLE_WET : SAND_SHALLOW;
        } else if (depth < 0.88) {
          rgb = lerp3(SAND_SHALLOW, LAKEBED_MID, (depth - 0.36) / 0.52);
        } else {
          rgb = lerp3(LAKEBED_MID, LAKEBED_DEEP, Math.min(1, (depth - 0.88) / 1.1));
        }
      } else if (prof.val <= 3.0) {
        // Sub-grade foundation directly beneath the 2.2cm microvoxel batako bricks & coping
        // Kept slightly below the batako brick surface (+0.07m vs +0.12m) to prevent any Z-fighting
        const pathR = getPathCenterRadius(ang);
        const isEdge = Math.abs(r - pathR) > PATH_HALF_WIDTH + PATH_CURB_WIDTH - 0.08;
        y = isEdge ? GROUND_BASE_Y - 0.025 : 0.065;
        rgb = SUB_MORTAR;
      } else {
        // Lush park lawn nearly flush with water (+0.11m) then gently rolling out to woodland
        const sample = sampleTerrain(x, z);
        const rawY = sample.height;
        // Fine 3.5cm micro-stepped contour quantization on rolling outer lawn
        const smoothNearPath = Math.min(1, Math.max(0, (prof.val - 3.08) / 2.2));
        const steppedY = Math.round(rawY / 0.035) * 0.035;
        y = rawY * (1 - smoothNearPath * 0.55) + steppedY * (smoothNearPath * 0.55);

        const patch = fbm2D(x * 0.22 + 4.1, z * 0.22 - 2.7);
        const microCell = (hash2D(Math.floor(x * 2.4), Math.floor(z * 2.4)) - 0.5) * 0.14;
        const t = Math.max(0, Math.min(1, patch + microCell));
        rgb =
          t > 0.54
            ? lerp3(GRASS_FRESH, GRASS_SUN, (t - 0.54) / 0.46)
            : lerp3(GRASS_SHADE, GRASS_FRESH, t / 0.54);
      }

      // Subtle micro-tonal variation in linear vertex color space
      const jitter = (hash2D(wrappedIa * 1.7 + ir * 3.1, ir * 2.3 - wrappedIa * 0.9) - 0.5) * 0.04;
      positions[vIdx * 3] = x;
      positions[vIdx * 3 + 1] = y;
      positions[vIdx * 3 + 2] = z;

      colors[vIdx * 3] = srgbToLinear(Math.max(0, Math.min(1, rgb[0] + jitter)));
      colors[vIdx * 3 + 1] = srgbToLinear(Math.max(0, Math.min(1, rgb[1] + jitter * 0.95)));
      colors[vIdx * 3 + 2] = srgbToLinear(Math.max(0, Math.min(1, rgb[2] + jitter * 0.9)));
      vIdx++;
    }
  }

  const quadCount = (ringCount - 1) * radialSegs;
  const indices = new Uint32Array(quadCount * 6);
  let idx = 0;
  for (let ir = 0; ir < ringCount - 1; ir++) {
    for (let ia = 0; ia < radialSegs; ia++) {
      const a = ir * stride + ia;
      const b = a + stride;
      const c = b + 1;
      const d = a + 1;
      indices[idx++] = a;
      indices[idx++] = d;
      indices[idx++] = b;
      indices[idx++] = b;
      indices[idx++] = d;
      indices[idx++] = c;
    }
  }

  return {
    positions,
    colors,
    indices,
    vertexCount,
    triangleCount: quadCount * 2,
  };
}
