import { VoxelGrid, VoxelMaterialKind } from './voxelGrid';
import { hash2D } from './worldLayout';

function jitterHex(hex: number, a: number, b: number, c: number, amount = 14): number {
  const n = (hash2D(a * 1.73 + b * 0.91, c * 2.31 - b * 1.17) - 0.5) * 2 * amount;
  const r = Math.max(0, Math.min(255, ((hex >> 16) & 0xff) + n));
  const g = Math.max(0, Math.min(255, ((hex >> 8) & 0xff) + n * 0.96));
  const bCh = Math.max(0, Math.min(255, (hex & 0xff) + n * 0.9));
  return ((r & 0xff) << 16) | ((g & 0xff) << 8) | (bCh & 0xff);
}

/**
 * Helper to draw a 3D organic wooden branch/trunk segment between two voxel coords.
 */
function stampBranch(
  grid: VoxelGrid,
  x0: number,
  y0: number,
  z0: number,
  x1: number,
  y1: number,
  z1: number,
  r0: number,
  r1: number,
  barkMain: number,
  barkDeep: number,
): void {
  const steps = Math.max(
    1,
    Math.ceil(Math.hypot(x1 - x0, y1 - y0, z1 - z0) * 1.6),
  );
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = x0 + (x1 - x0) * t;
    const y = y0 + (y1 - y0) * t;
    const z = z0 + (z1 - z0) * t;
    const r = r0 + (r1 - r0) * t;
    const ir = Math.ceil(r);
    for (let dx = -ir; dx <= ir; dx++) {
      for (let dy = -ir; dy <= ir; dy++) {
        for (let dz = -ir; dz <= ir; dz++) {
          const d = Math.hypot(dx, dy, dz);
          if (d <= r + 0.2) {
            const vx = Math.round(x + dx);
            const vy = Math.round(y + dy);
            const vz = Math.round(z + dz);
            const col =
              (vx + vz + Math.floor(vy / 3)) % 3 === 0 ? barkDeep : barkMain;
            grid.set(vx, vy, vz, jitterHex(col, vx, vy, vz, 8), VoxelMaterialKind.Wood);
          }
        }
      }
    }
  }
}

/**
 * Helper to stamp airy, organic micro-leaf foliage clusters (allowing dappled sunlight & shadows).
 */
function stampFoliageCloud(
  grid: VoxelGrid,
  cx: number,
  cy: number,
  cz: number,
  rx: number,
  ry: number,
  rz: number,
  palette: [number, number, number],
  seed: number,
  porosity = 0.26,
): void {
  const irx = Math.ceil(rx);
  const iry = Math.ceil(ry);
  const irz = Math.ceil(rz);
  for (let dx = -irx; dx <= irx; dx++) {
    for (let dy = -iry; dy <= iry; dy++) {
      for (let dz = -irz; dz <= irz; dz++) {
        const nd =
          (dx * dx) / (rx * rx) +
          (dy * dy) / (ry * ry) +
          (dz * dz) / (rz * rz);
        const edgeNoise =
          (hash2D(dx * 1.9 + seed, dz * 2.3 + dy * 1.3) - 0.5) * 0.45;
        if (nd + edgeNoise > 1.0) continue;
        // Airy organic gaps near outer shell for realistic sunlit leaf silhouettes
        if (nd > 0.62 && hash2D(cx + dx * 3.1 + dy, cz + dz * 2.7 + seed) < porosity) {
          continue;
        }
        const col =
          dy > ry * 0.28
            ? palette[0]
            : dy < -ry * 0.25
              ? palette[2]
              : palette[1];
        grid.set(
          Math.round(cx + dx),
          Math.round(cy + dy),
          Math.round(cz + dz),
          jitterHex(col, dx + seed, dy, dz, 13),
          VoxelMaterialKind.Foliage,
        );
      }
    }
  }
}

/**
 * 1. Super-Detailed Microvoxel Weeping Willow (4.2cm microvoxels).
 * Features flared root buttresses, leaning furrowed trunk, arching primary boughs,
 * and dozens of delicate 1-microvoxel cascading willow leaf curtains.
 */
export function buildMicroWillowTree(): VoxelGrid {
  const vs = 0.044;
  const sx = 104;
  const sy = 114;
  const sz = 104;
  const grid = new VoxelGrid(sx, sy, sz, vs, -(sx * vs) / 2, -0.18, -(sz * vs) / 2);

  const cx = 44;
  const cz = 48;
  const BARK = 0x5c4a38;
  const BARK_DEEP = 0x433528;
  const LEAF_PALETTE: [number, number, number] = [0x82aa4e, 0x648d3f, 0x476b30];

  // Flared surface roots gripping the soil
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.3;
    stampBranch(
      grid,
      cx,
      10,
      cz,
      cx + Math.cos(a) * 10,
      1,
      cz + Math.sin(a) * 10,
      3.0,
      1.2,
      BARK,
      BARK_DEEP,
    );
  }

  // Graceful leaning trunk curving gently toward the water (+X)
  stampBranch(grid, cx, 2, cz, cx + 8, 30, cz + 3, 4.2, 3.0, BARK, BARK_DEEP);
  stampBranch(grid, cx + 8, 30, cz + 3, cx + 14, 58, cz + 5, 3.0, 2.0, BARK, BARK_DEEP);

  // Arching primary boughs radiating from crown hub
  const hubX = cx + 14;
  const hubY = 58;
  const hubZ = cz + 5;
  const boughCount = 7;
  for (let i = 0; i < boughCount; i++) {
    const a = (i / boughCount) * Math.PI * 2 + 0.25;
    const reach = 19 + (i % 3) * 4;
    const midX = hubX + Math.cos(a) * reach * 0.55;
    const midY = hubY + 14 + (i % 2) * 4;
    const midZ = hubZ + Math.sin(a) * reach * 0.55;
    const endX = hubX + Math.cos(a) * reach;
    const endY = hubY + 6 + (i % 3) * 2;
    const endZ = hubZ + Math.sin(a) * reach;

    stampBranch(grid, hubX, hubY, hubZ, midX, midY, midZ, 2.0, 1.3, BARK, BARK_DEEP);
    stampBranch(grid, midX, midY, midZ, endX, endY, endZ, 1.3, 0.7, BARK, BARK_DEEP);

    // Leafy umbrella pads along bough arches
    stampFoliageCloud(grid, midX, midY + 4, midZ, 12, 7, 12, LEAF_PALETTE, i * 17 + 3, 0.28);
    stampFoliageCloud(grid, endX, endY + 2, endZ, 10, 6, 10, LEAF_PALETTE, i * 29 + 9, 0.3);
  }
  // Upper crown cap
  stampFoliageCloud(grid, hubX, hubY + 19, hubZ, 17, 10, 17, LEAF_PALETTE, 91, 0.25);

  // Delicate hanging micro-voxel willow curtains cascading around the crown skirt
  for (let dx = -30; dx <= 30; dx++) {
    for (let dz = -30; dz <= 30; dz++) {
      const dist = Math.hypot(dx, dz);
      if (dist < 10 || dist > 29) continue;
      const roll = hash2D(dx * 2.9 + 11, dz * 3.7 - 7);
      if (roll < 0.78) continue;

      const startY = Math.round(hubY + 14 - (dist / 30) * 14 + (roll - 0.8) * 12);
      const dropLen = 18 + Math.floor(hash2D(dx + 41, dz - 23) * 28);
      for (let k = 0; k < dropLen; k++) {
        const vy = startY - k;
        if (vy < 14) break;
        const swayX = Math.round(Math.sin(k * 0.16 + dx) * 0.6);
        const col =
          k > dropLen * 0.65
            ? LEAF_PALETTE[0]
            : k % 3 === 0
              ? LEAF_PALETTE[2]
              : LEAF_PALETTE[1];
        grid.set(
          hubX + dx + swayX,
          vy,
          hubZ + dz,
          jitterHex(col, dx, vy, dz, 10),
          VoxelMaterialKind.Foliage,
        );
      }
    }
  }

  return grid;
}

/**
 * 2. Super-Detailed Microvoxel Layered Alpine Pine (4.2cm microvoxels).
 * Features furrowed bark trunk, drooping whorled boughs, and needle sprays with fresh tips.
 */
export function buildMicroPineTree(): VoxelGrid {
  const vs = 0.044;
  const sx = 68;
  const sy = 138;
  const sz = 68;
  const grid = new VoxelGrid(sx, sy, sz, vs, -(sx * vs) / 2, -0.18, -(sz * vs) / 2);

  const cx = 34;
  const cz = 34;
  const BARK = 0x543c29;
  const BARK_DEEP = 0x3b2a1d;
  const PINE_TIP = 0x56874d;
  const PINE_MID = 0x3a673c;
  const PINE_DEEP = 0x26492d;

  // Root flare + straight tapered trunk
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    stampBranch(
      grid,
      cx,
      8,
      cz,
      cx + Math.cos(a) * 6,
      1,
      cz + Math.sin(a) * 6,
      2.3,
      1.0,
      BARK,
      BARK_DEEP,
    );
  }
  stampBranch(grid, cx, 2, cz, cx, 124, cz, 3.2, 0.7, BARK, BARK_DEEP);

  // 13 natural whorled tiers of drooping needle boughs
  const tiers = 13;
  for (let tier = 0; tier < tiers; tier++) {
    const t = tier / (tiers - 1);
    const baseY = Math.round(24 + t * 96);
    const maxReach = (1 - t * 0.84) * 24 + 3;
    const branchesInTier = Math.max(4, Math.round(8 - t * 3.5));

    for (let b = 0; b < branchesInTier; b++) {
      const ang = (b / branchesInTier) * Math.PI * 2 + tier * 0.78;
      const len = maxReach * (0.85 + hash2D(tier * 3.1, b * 5.7) * 0.25);
      const droop = (1 - t * 0.55) * 6.5;

      const tipX = cx + Math.cos(ang) * len;
      const tipY = baseY - droop;
      const tipZ = cz + Math.sin(ang) * len;

      // Woody inner bough
      stampBranch(grid, cx, baseY, cz, tipX * 0.7 + cx * 0.3, baseY - droop * 0.5, tipZ * 0.7 + cz * 0.3, 1.0, 0.6, BARK, BARK_DEEP);

      // Feathered needle sprays fanning along the bough
      const sprays = Math.max(3, Math.round(len / 3.5));
      for (let s = 1; s <= sprays; s++) {
        const f = s / sprays;
        const sxPos = cx + Math.cos(ang) * len * f;
        const syPos = baseY - droop * f * f + Math.sin(f * Math.PI) * 1.6;
        const szPos = cz + Math.sin(ang) * len * f;
        const sprayR = Math.max(1.8, (1 - f * 0.45) * (4.6 - t * 1.8));
        stampFoliageCloud(
          grid,
          sxPos,
          syPos,
          szPos,
          sprayR,
          sprayR * 0.55,
          sprayR,
          [PINE_TIP, PINE_MID, PINE_DEEP],
          tier * 31 + b * 11 + s,
          0.22,
        );
      }
    }
  }

  // Slender pointed pine spire crown
  stampFoliageCloud(grid, cx, 126, cz, 4.2, 8.5, 4.2, [PINE_TIP, PINE_MID, PINE_DEEP], 501, 0.18);

  return grid;
}

/**
 * 3. Super-Detailed Microvoxel Broadleaf Tree (Heritage Oak or Japanese Red Maple, 4.2cm voxels).
 * Features visible exposed forked limbs & airy dappled micro-leaf foliage clouds.
 */
export function buildMicroBroadleafTree(variant: 'oak' | 'maple'): VoxelGrid {
  const vs = variant === 'maple' ? 0.039 : 0.044;
  const sx = 92;
  const sy = 104;
  const sz = 92;
  const grid = new VoxelGrid(sx, sy, sz, vs, -(sx * vs) / 2, -0.18, -(sz * vs) / 2);

  const cx = 46;
  const cz = 46;
  const BARK = variant === 'maple' ? 0x57433a : 0x5b4432;
  const BARK_DEEP = 0x3d2e23;
  const PALETTE: [number, number, number] =
    variant === 'maple'
      ? [0xdc6b35, 0xb84227, 0x872b1b]
      : [0x6fa149, 0x4f7f38, 0x355c28];

  // Sculpted buttress roots
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + (variant === 'maple' ? 0.5 : 0.1);
    stampBranch(
      grid,
      cx,
      9,
      cz,
      cx + Math.cos(a) * 8.5,
      1,
      cz + Math.sin(a) * 8.5,
      2.8,
      1.0,
      BARK,
      BARK_DEEP,
    );
  }

  // Slightly curved lower trunk forking into main scaffold limbs
  const splitY = variant === 'maple' ? 28 : 34;
  const leanX = variant === 'maple' ? 3 : -2;
  stampBranch(grid, cx, 2, cz, cx + leanX, splitY, cz + 1, 3.8, 2.7, BARK, BARK_DEEP);

  const limbConfigs = [
    { ang: 0.2, reach: 20, h: 24, rx: 14, ry: 9 },
    { ang: 1.45, reach: 18, h: 28, rx: 13, ry: 8 },
    { ang: 2.75, reach: 22, h: 21, rx: 15, ry: 9 },
    { ang: 4.05, reach: 19, h: 26, rx: 13, ry: 8 },
    { ang: 5.25, reach: 17, h: 20, rx: 12, ry: 8 },
  ];

  // Upper central crown leader
  stampBranch(
    grid,
    cx + leanX,
    splitY,
    cz + 1,
    cx + leanX - 1,
    splitY + 30,
    cz - 1,
    2.2,
    1.1,
    BARK,
    BARK_DEEP,
  );
  stampFoliageCloud(
    grid,
    cx + leanX,
    splitY + 34,
    cz,
    17,
    11,
    17,
    PALETTE,
    variant === 'maple' ? 77 : 19,
    0.3,
  );

  limbConfigs.forEach((limb, idx) => {
    const lx = cx + leanX + Math.cos(limb.ang) * limb.reach;
    const ly = splitY + limb.h;
    const lz = cz + 1 + Math.sin(limb.ang) * limb.reach;
    stampBranch(grid, cx + leanX, splitY, cz + 1, lx, ly, lz, 2.0, 0.9, BARK, BARK_DEEP);

    // Layered horizontal leaf clouds (maple gets slightly flatter, wider Japanese pads)
    const ry = variant === 'maple' ? limb.ry * 0.72 : limb.ry;
    stampFoliageCloud(
      grid,
      lx,
      ly + 3,
      lz,
      limb.rx,
      ry,
      limb.rx * 0.92,
      PALETTE,
      idx * 23 + (variant === 'maple' ? 40 : 10),
      0.32,
    );
    // Secondary sub-twig leaf tuft
    stampFoliageCloud(
      grid,
      lx * 0.65 + cx * 0.35,
      ly + 7,
      lz * 0.65 + cz * 0.35,
      limb.rx * 0.75,
      ry * 0.78,
      limb.rx * 0.75,
      PALETTE,
      idx * 37 + 5,
      0.28,
    );
  });

  return grid;
}

/**
 * 4. Super-Detailed Microvoxel Flowering Bush / Shrub (2.0cm voxels).
 */
export function buildMicroBush(hasBlossoms: boolean, blossomHex = 0xf0d7e2): VoxelGrid {
  const vs = 0.020;
  const sx = 38;
  const sy = 30;
  const sz = 38;
  const grid = new VoxelGrid(sx, sy, sz, vs, -(sx * vs) / 2, -0.04, -(sz * vs) / 2);

  const cx = 19;
  const cz = 19;
  const BARK = 0x523c2a;
  const PALETTE: [number, number, number] = [0x6c9944, 0x4d7934, 0x355825];

  // Woody base twigs peeking beneath shrub skirt
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.5;
    stampBranch(grid, cx, 1, cz, cx + Math.cos(a) * 6, 9, cz + Math.sin(a) * 6, 1.0, 0.6, BARK, BARK);
  }

  // Organic multi-lobe leafy shrub clusters
  const lobes = [
    { x: 0, y: 12, z: 0, rx: 11, ry: 9, rz: 11 },
    { x: -7, y: 9, z: 4, rx: 8, ry: 7, rz: 8 },
    { x: 7, y: 10, z: -3, rx: 8.5, ry: 7, rz: 8 },
    { x: 2, y: 8, z: 7, rx: 7.5, ry: 6, rz: 7.5 },
    { x: -3, y: 9, z: -6, rx: 7.5, ry: 6.5, rz: 7.5 },
  ];

  lobes.forEach((l, i) => {
    stampFoliageCloud(
      grid,
      cx + l.x,
      l.y,
      cz + l.z,
      l.rx,
      l.ry,
      l.rz,
      PALETTE,
      i * 19 + (hasBlossoms ? 7 : 3),
      0.34,
    );
  });

  // Delicate clustered microvoxel blossoms on top of flowering shrubs
  if (hasBlossoms) {
    for (let i = 0; i < 16; i++) {
      const a = i * 2.399;
      const r = 3 + (i % 5) * 2.5;
      const bx = Math.round(cx + Math.cos(a) * r);
      const bz = Math.round(cz + Math.sin(a) * r);
      for (let by = sy - 2; by >= 8; by--) {
        if (grid.isSolid(bx, by, bz)) {
          grid.set(bx, by + 1, bz, jitterHex(blossomHex, bx, by, bz, 12), VoxelMaterialKind.Foliage);
          grid.set(bx + 1, by + 1, bz, jitterHex(blossomHex, bx + 1, by, bz, 12), VoxelMaterialKind.Foliage);
          grid.set(bx, by + 1, bz + 1, jitterHex(blossomHex, bx, by, bz + 1, 12), VoxelMaterialKind.Foliage);
          break;
        }
      }
    }
  }

  return grid;
}

/**
 * 5. Super-Detailed Microvoxel Arching Grass Clump (1.4cm voxels).
 * 7 graceful arching multi-voxel blades tapering from deep emerald base to sunlit lime tips.
 */
export function buildMicroGrassClump(): VoxelGrid {
  const vs = 0.014;
  const sx = 24;
  const sy = 24;
  const sz = 24;
  const grid = new VoxelGrid(sx, sy, sz, vs, -(sx * vs) / 2, -0.02, -(sz * vs) / 2);

  const cx = 12;
  const cz = 12;
  const BASE = 0x3b632c;
  const MID = 0x5b893c;
  const TIP = 0x86b34b;

  const blades = [
    { ox: 0, oz: 0, ang: 0.2, h: 17, bend: 5.5 },
    { ox: -2, oz: 1, ang: 2.3, h: 14, bend: 5.0 },
    { ox: 2, oz: -1, ang: 4.1, h: 15, bend: 5.2 },
    { ox: -1, oz: -2, ang: 5.4, h: 12, bend: 4.4 },
    { ox: 2, oz: 2, ang: 1.1, h: 13, bend: 4.8 },
    { ox: -3, oz: -1, ang: 3.4, h: 10, bend: 4.0 },
    { ox: 1, oz: 3, ang: 0.8, h: 11, bend: 4.2 },
  ];

  for (const b of blades) {
    const dirX = Math.cos(b.ang);
    const dirZ = Math.sin(b.ang);
    for (let y = 0; y < b.h; y++) {
      const t = y / b.h;
      const bendOffset = t * t * b.bend;
      const vx = Math.round(cx + b.ox + dirX * bendOffset);
      const vz = Math.round(cz + b.oz + dirZ * bendOffset);
      const col = t < 0.35 ? BASE : t < 0.72 ? MID : TIP;
      grid.set(vx, y, vz, jitterHex(col, vx, y, vz, 9), VoxelMaterialKind.Foliage);
    }
  }

  return grid;
}

/**
 * 6. Super-Detailed Microvoxel Wildflower Bouquet (1.2cm voxels).
 * Slender arching stems, basal leaves, multi-voxel curved petals, and golden stamen center.
 */
export function buildMicroWildflowerCluster(
  petalHex: number,
  centerHex: number,
): VoxelGrid {
  const vs = 0.012;
  const sx = 24;
  const sy = 26;
  const sz = 24;
  const grid = new VoxelGrid(sx, sy, sz, vs, -(sx * vs) / 2, -0.02, -(sz * vs) / 2);

  const cx = 12;
  const cz = 12;
  const STEM = 0x487634;
  const LEAF = 0x5c8c3f;

  // Basal leafy rosette
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    for (let step = 1; step <= 4; step++) {
      const vx = Math.round(cx + Math.cos(a) * step);
      const vz = Math.round(cz + Math.sin(a) * step);
      const vy = step <= 2 ? 2 : 1;
      grid.set(vx, vy, vz, LEAF, VoxelMaterialKind.Foliage);
    }
  }

  // 3 graceful flowering stems of staggered heights
  const stems = [
    { ox: 0, oz: 0, dx: 0.3, dz: 0.2, h: 19 },
    { ox: -3, oz: 2, dx: -0.7, dz: 0.5, h: 14 },
    { ox: 3, oz: -2, dx: 0.6, dz: -0.6, h: 16 },
  ];

  for (const s of stems) {
    let tipX = cx + s.ox;
    let tipZ = cz + s.oz;
    for (let y = 0; y < s.h; y++) {
      const t = y / s.h;
      tipX = Math.round(cx + s.ox + s.dx * t * t * 3.5);
      tipZ = Math.round(cz + s.oz + s.dz * t * t * 3.5);
      grid.set(tipX, y, tipZ, STEM, VoxelMaterialKind.Foliage);
    }
    // Delicate 5-voxel star/cup bloom head + pollen center
    const by = s.h;
    grid.set(tipX, by, tipZ, centerHex, VoxelMaterialKind.Foliage);
    const petalOffsets: [number, number, number][] = [
      [1, 0, 0],
      [-1, 0, 0],
      [0, 0, 1],
      [0, 0, -1],
      [2, 1, 0],
      [-2, 1, 0],
      [0, 1, 2],
      [0, 1, -2],
      [1, 0, 1],
      [-1, 0, -1],
      [1, 0, -1],
      [-1, 0, 1],
    ];
    for (const [px, py, pz] of petalOffsets) {
      grid.set(
        tipX + px,
        by + py,
        tipZ + pz,
        jitterHex(petalHex, tipX + px, by + py, tipZ + pz, 9),
        VoxelMaterialKind.Foliage,
      );
    }
  }

  return grid;
}

/**
 * 7. Super-Detailed Microvoxel Lakeside Cattail Reed Cluster (1.7cm voxels).
 */
export function buildMicroReedCluster(): VoxelGrid {
  const vs = 0.017;
  const sx = 26;
  const sy = 56;
  const sz = 26;
  const grid = new VoxelGrid(sx, sy, sz, vs, -(sx * vs) / 2, -0.15, -(sz * vs) / 2);

  const cx = 13;
  const cz = 13;
  const STALK = 0x527a38;
  const BLADE = 0x679443;
  const CATTAIL = 0x5b3822;
  const CATTAIL_HI = 0x70482d;

  // 3 tall cattail stalks with velvet brown cylindrical seed heads
  const stalks = [
    { ox: -2, oz: 1, h: 48, leanX: -0.6, leanZ: 0.4 },
    { ox: 2, oz: -2, h: 42, leanX: 0.7, leanZ: -0.3 },
    { ox: 0, oz: 3, h: 37, leanX: 0.2, leanZ: 0.8 },
  ];

  for (const s of stalks) {
    for (let y = 0; y < s.h; y++) {
      const t = y / s.h;
      const vx = Math.round(cx + s.ox + s.leanX * t * t * 4);
      const vz = Math.round(cz + s.oz + s.leanZ * t * t * 4);
      grid.set(vx, y, vz, STALK, VoxelMaterialKind.Foliage);

      // Plump cylindrical cattail head near upper quarter
      if (y >= s.h - 12 && y <= s.h - 5) {
        grid.set(vx + 1, y, vz, CATTAIL, VoxelMaterialKind.Foliage);
        grid.set(vx - 1, y, vz, CATTAIL, VoxelMaterialKind.Foliage);
        grid.set(vx, y, vz + 1, CATTAIL_HI, VoxelMaterialKind.Foliage);
        grid.set(vx, y, vz - 1, CATTAIL, VoxelMaterialKind.Foliage);
        grid.set(vx, y, vz, CATTAIL_HI, VoxelMaterialKind.Foliage);
      }
    }
  }

  // 6 arching ribbon reed blades framing the stalks
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    const h = 24 + (i % 3) * 7;
    for (let y = 0; y < h; y++) {
      const t = y / h;
      const vx = Math.round(cx + Math.cos(a) * (2 + t * t * 8));
      const vz = Math.round(cz + Math.sin(a) * (2 + t * t * 8));
      grid.set(vx, y, vz, jitterHex(BLADE, vx, y, vz, 8), VoxelMaterialKind.Foliage);
    }
  }

  return grid;
}

/**
 * 8. Super-Detailed Microvoxel Lily Pad & Multi-Petal Lotus Bloom (1.8cm voxels).
 */
export function buildMicroLilyPad(withLotus: boolean, lotusHex = 0xf4a9be): VoxelGrid {
  const vs = 0.018;
  const sx = 24;
  const sy = 12;
  const sz = 24;
  const grid = new VoxelGrid(sx, sy, sz, vs, -(sx * vs) / 2, -0.01, -(sz * vs) / 2);

  const cx = 12;
  const cz = 12;
  const PAD_MAIN = 0x4b7f3e;
  const PAD_VEIN = 0x62964a;
  const PAD_EDGE = 0x3b6931;

  const r = 9.2;
  for (let dx = -10; dx <= 10; dx++) {
    for (let dz = -10; dz <= 10; dz++) {
      const d = Math.hypot(dx, dz);
      if (d > r) continue;
      // Classic triangular V-notch in the lily pad
      const ang = Math.atan2(dz, dx);
      if (Math.abs(ang) < 0.28 && d > 1.5) continue;

      const isRim = d > r - 1.2;
      const isVein = Math.abs(Math.sin(ang * 4)) < 0.14 && d < r - 1.5;
      const col = isRim ? PAD_EDGE : isVein ? PAD_VEIN : PAD_MAIN;
      grid.set(cx + dx, 1, cz + dz, jitterHex(col, dx, 1, dz, 8), VoxelMaterialKind.Foliage);
      // Subtle upturned lip around rim
      if (isRim && d > r - 0.85) {
        grid.set(cx + dx, 2, cz + dz, PAD_EDGE, VoxelMaterialKind.Foliage);
      }
    }
  }

  // Sculpted layered lotus blossom with golden center
  if (withLotus) {
    // Outer ring of 8 cupped petals
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      for (let step = 1; step <= 3; step++) {
        const px = Math.round(cx + Math.cos(a) * step);
        const pz = Math.round(cz + Math.sin(a) * step);
        const py = step === 1 ? 2 : step === 2 ? 3 : 4;
        grid.set(px, py, pz, jitterHex(lotusHex, px, py, pz, 8), VoxelMaterialKind.Foliage);
      }
    }
    // Inner upright petals + golden pollen heart
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      grid.set(Math.round(cx + Math.cos(a) * 1.3), 4, Math.round(cz + Math.sin(a) * 1.3), 0xfff5f8, VoxelMaterialKind.Foliage);
    }
    grid.set(cx, 3, cz, 0xf5cc4d, VoxelMaterialKind.Foliage);
    grid.set(cx, 4, cz, 0xffdf6b, VoxelMaterialKind.Foliage);
  }

  return grid;
}

/**
 * 9. Super-Detailed Microvoxel Weathered Wooden Pier / Viewing Deck (2.4cm voxels).
 * Individual spaced planks with beveled edges, iron nail heads, heavy timber stringers,
 * and mossy dock pilings extending down into the lakebed. Deck sits nearly flush (+0.15m)
 * with the batako promenade & lake water surface!
 */
export function buildMicroWoodenPier(): VoxelGrid {
  const vs = 0.024;
  const sx = 76; // ~1.82m wide
  const sy = 70; // pilings reach deep below water
  const sz = 132; // ~3.17m long extending proudly out into the vast lake
  const grid = new VoxelGrid(sx, sy, sz, vs, -(sx * vs) / 2, -1.08, 0);

  const deckY = 50; // top face at -1.08 + 52 * 0.024 = +0.168m (nearly flush with batako path!)
  const PLANK_A = 0x8f6c4c;
  const PLANK_B = 0x7d5d41;
  const TIMBER_DARK = 0x57402c;
  const PILING_WET = 0x3b3126;
  const MOSS = 0x4b6e37;
  const NAIL = 0x333942;

  // Longitudinal timber beams underneath the deck
  for (const bx of [10, 11, 37, 38, 64, 65]) {
    for (let z = 0; z < sz - 4; z++) {
      for (let y = deckY - 5; y <= deckY - 1; y++) {
        grid.set(bx, y, z, jitterHex(TIMBER_DARK, bx, y, z, 7), VoxelMaterialKind.Wood);
      }
    }
  }

  // Individual spaced cross-planks with crisp 1-voxel drainage gaps & iron nails
  for (let p = 0; p < 18; p++) {
    const z0 = 2 + p * 7;
    const tone = p % 2 === 0 ? PLANK_A : PLANK_B;
    for (let z = z0; z <= z0 + 5; z++) {
      for (let x = 2; x <= sx - 3; x++) {
        const isEdge = x === 2 || x === sx - 3 || z === z0 || z === z0 + 5;
        const col = isEdge ? TIMBER_DARK : jitterHex(tone, x * 0.6, p, z, 11);
        grid.set(x, deckY, z, col, VoxelMaterialKind.Wood);
        if (!isEdge) {
          grid.set(x, deckY + 1, z, col, VoxelMaterialKind.Wood);
        }
      }
    }
    // Iron nail heads fastening each plank to the beams
    for (const nx of [11, 38, 65]) {
      grid.set(nx, deckY + 1, z0 + 2, NAIL, VoxelMaterialKind.CastIron);
    }
  }

  // 6 weathered mooring pilings with mossy waterline & beveled caps
  const pilingPositions: [number, number][] = [
    [7, 36],
    [sx - 8, 36],
    [7, 82],
    [sx - 8, 82],
    [7, sz - 8],
    [sx - 8, sz - 8],
  ];

  for (const [px, pz] of pilingPositions) {
    const topY = deckY + 14;
    for (let y = 2; y <= topY; y++) {
      const r = y === topY ? 2 : 3;
      for (let dx = -r; dx <= r; dx++) {
        for (let dz = -r; dz <= r; dz++) {
          if (dx * dx + dz * dz > r * r + 0.5) continue;
          const isWaterline = y >= 42 && y <= 48;
          const col =
            y < 42
              ? PILING_WET
              : isWaterline && hash2D(px + dx, y + dz) > 0.45
                ? MOSS
                : TIMBER_DARK;
          grid.set(px + dx, y, pz + dz, jitterHex(col, px + dx, y, pz + dz, 8), VoxelMaterialKind.Wood);
        }
      }
    }
    // Natural mooring rope wrap near piling top
    for (let dx = -3; dx <= 3; dx++) {
      for (let dz = -3; dz <= 3; dz++) {
        if (Math.abs(dx) === 3 || Math.abs(dz) === 3) {
          if (Math.abs(dx) + Math.abs(dz) <= 5) {
            grid.set(px + dx, deckY + 9, pz + dz, 0xb59c72, VoxelMaterialKind.TerrainMatte);
            grid.set(px + dx, deckY + 10, pz + dz, 0xa38960, VoxelMaterialKind.TerrainMatte);
          }
        }
      }
    }
  }

  return grid;
}

/**
 * 10. Super-Detailed Microvoxel Mossy Shoreline Boulder (2.4cm voxels).
 */
export function buildMicroMossyBoulder(): VoxelGrid {
  const vs = 0.024;
  const sx = 42;
  const sy = 30;
  const sz = 38;
  const grid = new VoxelGrid(sx, sy, sz, vs, -(sx * vs) / 2, -0.14, -(sz * vs) / 2);

  const cx = 21;
  const cy = 11;
  const cz = 19;
  const STONE_LIGHT = 0x8f9089;
  const STONE_MID = 0x767872;
  const STONE_WET = 0x575b58;
  const MOSS_A = 0x4d7337;
  const MOSS_B = 0x628a42;

  for (let dx = -16; dx <= 16; dx++) {
    for (let dy = -9; dy <= 13; dy++) {
      for (let dz = -14; dz <= 14; dz++) {
        const nd =
          (dx * dx) / (15.5 * 15.5) +
          (dy * dy) / (11.5 * 11.5) +
          (dz * dz) / (13.5 * 13.5);
        const strata = Math.sin(dy * 0.55 + dx * 0.14) * 0.12;
        const n = (hash2D(dx * 1.1 + 7, dz * 1.3 + dy) - 0.5) * 0.24;
        if (nd + strata + n > 1.0) continue;

        const isTopMoss = dy > 4 && nd > 0.55 && hash2D(dx * 0.7 + 3, dz * 0.7 - 5) > 0.32;
        let col = dy < -1 ? STONE_WET : dy > 3 ? STONE_LIGHT : STONE_MID;
        let mat = VoxelMaterialKind.Stone;
        if (isTopMoss) {
          col = hash2D(dx, dz) > 0.5 ? MOSS_B : MOSS_A;
          mat = VoxelMaterialKind.TerrainMatte;
        }
        grid.set(cx + dx, cy + dy, cz + dz, jitterHex(col, dx, dy, dz, 9), mat);
      }
    }
  }

  return grid;
}
