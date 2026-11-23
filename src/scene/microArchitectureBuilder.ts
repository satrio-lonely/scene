import { VoxelGrid, VoxelMaterialKind } from './voxelGrid';
import { hash2D } from './worldLayout';

function jitterHex(hex: number, a: number, b: number, c: number, amount = 10): number {
  const n = (hash2D(a * 1.63 + b * 0.87, c * 2.19 - b * 1.11) - 0.5) * 2 * amount;
  const r = Math.max(0, Math.min(255, ((hex >> 16) & 0xff) + n));
  const g = Math.max(0, Math.min(255, ((hex >> 8) & 0xff) + n * 0.96));
  const bCh = Math.max(0, Math.min(255, (hex & 0xff) + n * 0.94));
  return ((r & 0xff) << 16) | ((g & 0xff) << 8) | (bCh & 0xff);
}

/**
 * Builds an ultra-detailed microvoxel BATAKO (interlocking concrete brick) promenade segment
 * at 2.2cm microvoxel resolution!
 * - Width (X, radial from shore outward): ~2.92m (132 microvoxels)
 * - Length (Z, tangent along lake): ~1.28m (58 microvoxels)
 * - Height (Y): flush concrete sub-base + chamfered individual batako blocks + recessed mortar joints
 *   + raised concrete kanstin curbs on both lakeside & park edges!
 * Pivot: center of promenade width (X=0), ground water-datum Y=0 (surface sits at Y=+0.12m, almost flush with water!).
 */
export function buildMicroBatakoPathSegment(variantSeed = 1): VoxelGrid {
  const vs = 0.022; // 2.2 cm super-fine microvoxels for razor-crisp concrete batako bricks!
  const sizeX = 132; // 2.90 m total width (including inner coping & outer curb)
  const sizeY = 12; // -0.10 m below water datum up to +0.164 m
  const sizeZ = 58; // 1.276 m segment length (overlaps cleanly along curve)

  const grid = new VoxelGrid(
    sizeX,
    sizeY,
    sizeZ,
    vs,
    -(sizeX * vs) / 2,
    -0.122,
    -(sizeZ * vs) / 2,
  );

  // Authentic Indonesian concrete batako / paving block palette
  const BATAKO_LIGHT = 0xa9aba8;
  const BATAKO_MID = 0x979a97;
  const BATAKO_COOL = 0x8a8e8f;
  const BATAKO_WARM = 0xa4a199;
  const BATAKO_DAMP = 0x767a77;
  const MORTAR = 0x5c5f5b;
  const MOSS_JOINT = 0x4b683b;
  const CURB_LIGHT = 0xb5b7b2;
  const CURB_DARK = 0x898c88;

  // Y = 0..8 solid foundation reaching below waterline (-0.11m -> +0.088m)
  // Y = 9 mortar bed (+0.088m -> +0.110m)
  // Y = 10 individual batako brick top (+0.110m -> +0.132m)
  // Y = 11 raised lakeside coping & outer kanstin curb (+0.132m -> +0.154m)
  const brickTopY = 10;
  const curbTopY = 11;

  for (let x = 0; x < sizeX; x++) {
    const isInnerCoping = x < 9; // Concrete coping edge right against the lake water
    const isOuterCurb = x >= sizeX - 8; // Concrete kanstin curb bordering the park lawn

    for (let z = 0; z < sizeZ; z++) {
      // Solid concrete sub-foundation along edges (and thin bed underneath) so water never leaks under
      const baseBottom = isInnerCoping || isOuterCurb ? 0 : 7;
      for (let y = baseBottom; y <= brickTopY - 1; y++) {
        const subCol = y < 5 ? BATAKO_DAMP : MORTAR;
        grid.set(x, y, z, subCol, VoxelMaterialKind.Stone);
      }

      if (isInnerCoping || isOuterCurb) {
        // Large molded concrete kanstin / lakeside coping blocks (~32cm long each)
        const blockIdx = Math.floor(z / 15);
        const isJointZ = z % 15 === 0;
        const isChamfer =
          x === 0 || x === 8 || x === sizeX - 8 || x === sizeX - 1 || isJointZ;
        const baseCol = blockIdx % 2 === 0 ? CURB_LIGHT : CURB_DARK;

        grid.set(
          x,
          brickTopY,
          z,
          isJointZ ? MORTAR : jitterHex(baseCol, x, brickTopY, z + variantSeed * 13, 7),
          VoxelMaterialKind.Stone,
        );
        if (!isChamfer) {
          grid.set(
            x,
            curbTopY,
            z,
            jitterHex(CURB_LIGHT, x, curbTopY, z + variantSeed * 17, 6),
            VoxelMaterialKind.Stone,
          );
        }
        continue;
      }

      // Main promenade surface: Classic staggered running-bond BATAKO concrete bricks!
      // Each batako brick = 10 microvoxels wide (22cm) x 5 microvoxels deep (11cm) + 1 voxel mortar joint
      const localX = x - 9;
      const row = Math.floor(localX / 6); // 6 voxels per course (5 brick + 1 mortar seam)
      const inRow = localX % 6;

      // Running-bond stagger every alternate course
      const staggerZ = (row % 2) * 5;
      const col = Math.floor((z + staggerZ) / 11); // 11 voxels per brick length (10 brick + 1 mortar)
      const inCol = (z + staggerZ) % 11;

      const isMortarSeam = inRow === 0 || inCol === 0;
      if (isMortarSeam) {
        // Recessed mortar seam (sits 1 microvoxel lower at Y = brickTopY - 1 for real tactile 3D relief!)
        const nearLakeEdge = localX < 18 || localX > 96;
        const hasMoss =
          nearLakeEdge && hash2D(x * 0.9 + variantSeed * 7, z * 1.1) > 0.68;
        grid.set(
          x,
          brickTopY - 1,
          z,
          hasMoss ? jitterHex(MOSS_JOINT, x, 0, z, 9) : MORTAR,
          hasMoss ? VoxelMaterialKind.TerrainMatte : VoxelMaterialKind.Stone,
        );
      } else {
        // Individual sculpted concrete batako brick with subtle porous aggregate mottling
        const brickHash = hash2D(row * 3.17 + variantSeed * 19, col * 5.41 + variantSeed * 7);
        let brickBase = BATAKO_MID;
        if (brickHash < 0.28) brickBase = BATAKO_LIGHT;
        else if (brickHash < 0.56) brickBase = BATAKO_MID;
        else if (brickHash < 0.78) brickBase = BATAKO_COOL;
        else if (brickHash < 0.93) brickBase = BATAKO_WARM;
        else brickBase = BATAKO_DAMP;

        // Slight darkening along brick perimeter edge simulating pressed batako chamfer
        const isBrickRim = inRow === 1 || inRow === 5 || inCol === 1 || inCol === 10;
        const speck = jitterHex(brickBase, x + variantSeed * 3, row, z, isBrickRim ? 12 : 8);
        const finalCol = isBrickRim ? darkenHex(speck, 0.91) : speck;

        grid.set(x, brickTopY, z, finalCol, VoxelMaterialKind.Stone);
      }
    }
  }

  return grid;
}

function darkenHex(hex: number, factor: number): number {
  const r = Math.max(0, Math.min(255, Math.round(((hex >> 16) & 0xff) * factor)));
  const g = Math.max(0, Math.min(255, Math.round(((hex >> 8) & 0xff) * factor)));
  const b = Math.max(0, Math.min(255, Math.round((hex & 0xff) * factor)));
  return (r << 16) | (g << 8) | b;
}

/**
 * Builds an ultra-detailed microvoxel LAKESIDE FENCE segment (`Pagar Pinggir Danau`)
 * at 1.6cm microvoxel resolution!
 * - Concrete batako plinth base + dark forged cast-iron square pillar with pyramid cap & brass collar
 * - Warm oiled teak wood top handrail + sleek dark iron lower rail
 * - Delicate vertical cast-iron balusters + classic central ornamental ring motif
 * - Span along Z: 1.504m (94 microvoxels), Height: ~0.92m (58 microvoxels) — low enough to frame
 *   the lake view elegantly while standing unmistakably along the shoreline!
 * Pivot: bottom-center of fence base at (0, 0, 0), running along Z axis.
 */
export function buildMicroLakesideFenceSegment(): VoxelGrid {
  const vs = 0.016; // 1.6 cm ultra-fine microvoxels!
  const sizeX = 14; // ~22.4 cm thick at base plinth
  const sizeY = 60; // ~96 cm tall
  const sizeZ = 96; // ~1.536 m span per bay

  const grid = new VoxelGrid(
    sizeX,
    sizeY,
    sizeZ,
    vs,
    -(sizeX * vs) / 2,
    0,
    -(sizeZ * vs) / 2,
  );

  const cx = 7;
  const CONCRETE_BASE = 0xa3a5a1;
  const CONCRETE_TRIM = 0xb8bab5;
  const IRON_DARK = 0x222830;
  const IRON_MID = 0x333c47;
  const IRON_HI = 0x475361;
  const WOOD_RAIL = 0x9c5f34;
  const WOOD_RAIL_HI = 0xb06e3f;
  const BRASS = 0xdba74c;

  // 1. Primary Fence Pillar at Z = 4 (next segment provides the matching pillar at the far end!)
  const postZ = 4;

  // Molded concrete pedestal plinth (y = 0..10)
  for (let y = 0; y <= 10; y++) {
    const r = y < 3 ? 4 : y < 9 ? 3 : 4;
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        if (Math.abs(dx) === r && Math.abs(dz) === r && y === 10) continue;
        const col = y === 9 || y === 10 ? CONCRETE_TRIM : CONCRETE_BASE;
        grid.set(cx + dx, y, postZ + dz, jitterHex(col, dx, y, dz, 6), VoxelMaterialKind.Stone);
      }
    }
  }

  // Forged cast-iron pillar shaft (y = 11..54) + brass collar + tiered finial cap
  for (let y = 11; y <= 55; y++) {
    const isBand = y === 12 || y === 49 || y === 53;
    const r = isBand ? 3 : 2;
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        if (r === 3 && Math.abs(dx) === 3 && Math.abs(dz) === 3) continue;
        const col = y === 52 ? BRASS : isBand ? IRON_HI : IRON_DARK;
        const mat = y === 52 ? VoxelMaterialKind.Brass : VoxelMaterialKind.CastIron;
        grid.set(cx + dx, y, postZ + dz, col, mat);
      }
    }
  }
  // Pyramid cast-iron cap + brass finial tip (y = 56..58)
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      grid.set(cx + dx, 56, postZ + dz, IRON_MID, VoxelMaterialKind.CastIron);
    }
  }
  grid.set(cx, 57, postZ, BRASS, VoxelMaterialKind.Brass);
  grid.set(cx, 58, postZ, BRASS, VoxelMaterialKind.Brass);

  // 2. Continuous Horizontal Rails spanning Z = 6..95
  for (let z = 6; z < sizeZ; z++) {
    // Lower iron curb rail (y = 9..10)
    for (let dx = -1; dx <= 1; dx++) {
      grid.set(cx + dx, 9, z, IRON_DARK, VoxelMaterialKind.CastIron);
      grid.set(cx + dx, 10, z, IRON_MID, VoxelMaterialKind.CastIron);
    }

    // Upper-mid decorative iron frieze rail (y = 41..42)
    for (let dx = -1; dx <= 1; dx++) {
      grid.set(cx + dx, 41, z, IRON_DARK, VoxelMaterialKind.CastIron);
      grid.set(cx + dx, 42, z, IRON_MID, VoxelMaterialKind.CastIron);
    }

    // Top iron mounting bar (y = 49) + warm beveled teak handrail (y = 50..52)
    grid.set(cx, 49, z, IRON_DARK, VoxelMaterialKind.CastIron);
    for (let dx = -2; dx <= 2; dx++) {
      const col = jitterHex(dx === 0 ? WOOD_RAIL_HI : WOOD_RAIL, dx, 51, z * 0.4, 8);
      grid.set(cx + dx, 50, z, col, VoxelMaterialKind.Wood);
      grid.set(cx + dx, 51, z, col, VoxelMaterialKind.Wood);
      if (Math.abs(dx) <= 1) {
        grid.set(cx + dx, 52, z, jitterHex(WOOD_RAIL_HI, dx, 52, z * 0.4, 7), VoxelMaterialKind.Wood);
      }
    }
  }

  // 3. Delicate Vertical Cast-Iron Balusters spaced every 8 microvoxels (~12.8cm)
  for (let bz = 14; bz <= sizeZ - 6; bz += 8) {
    for (let y = 11; y <= 48; y++) {
      const col = y === 26 || y === 45 ? IRON_HI : IRON_DARK;
      grid.set(cx, y, bz, col, VoxelMaterialKind.CastIron);
      // Slight sculpted central collar on every baluster
      if (y === 26) {
        grid.set(cx + 1, y, bz, IRON_MID, VoxelMaterialKind.CastIron);
        grid.set(cx - 1, y, bz, IRON_MID, VoxelMaterialKind.CastIron);
      }
    }
  }

  // 4. Ornamental cast-iron rings in the upper frieze band (y = 43..48) between balusters
  for (let rz = 18; rz <= sizeZ - 10; rz += 16) {
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const py = Math.round(45.5 + Math.sin(a) * 2.4);
      const pz = Math.round(rz + Math.cos(a) * 2.6);
      grid.set(cx, py, pz, IRON_HI, VoxelMaterialKind.CastIron);
    }
  }

  return grid;
}

/**
 * Builds an ultra-fine lakeside coping & stone stair edge block for the bench overlook bay.
 */
export function buildMicroBollardPost(): VoxelGrid {
  const vs = 0.018;
  const sizeX = 13;
  const sizeY = 44;
  const sizeZ = 13;
  const grid = new VoxelGrid(
    sizeX,
    sizeY,
    sizeZ,
    vs,
    -(sizeX * vs) / 2,
    0,
    -(sizeZ * vs) / 2,
  );
  const cx = 6;
  const cz = 6;
  const IRON = 0x262d36;
  const IRON_HI = 0x3b4552;
  const GLOW = 0xffdd94;

  for (let y = 0; y <= 40; y++) {
    const r = y < 4 ? 3 : 2;
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        if (Math.abs(dx) === r && Math.abs(dz) === r) continue;
        const isLampBand = y >= 31 && y <= 36;
        if (isLampBand && (Math.abs(dx) === 2 || Math.abs(dz) === 2)) {
          grid.set(cx + dx, y, cz + dz, GLOW, VoxelMaterialKind.LanternGlow);
        } else {
          grid.set(cx + dx, y, cz + dz, y === 38 ? IRON_HI : IRON, VoxelMaterialKind.CastIron);
        }
      }
    }
  }
  return grid;
}
