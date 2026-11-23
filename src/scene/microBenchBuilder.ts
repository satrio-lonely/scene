import { VoxelGrid, VoxelMaterialKind } from './voxelGrid';
import { hash2D } from './worldLayout';

/** Exact local Y surface height of the plush tufted velvet seat cushion (for seating characters flush!) */
export const BENCH_SEAT_TOP_Y = 0.456;

function jitterHex(hex: number, seedA: number, seedB: number, amount = 10): number {
  const n = (hash2D(seedA * 1.37, seedB * 2.13) - 0.5) * 2 * amount;
  const r = Math.max(0, Math.min(255, ((hex >> 16) & 0xff) + n));
  const g = Math.max(0, Math.min(255, ((hex >> 8) & 0xff) + n * 0.92));
  const b = Math.max(0, Math.min(255, (hex & 0xff) + n * 0.85));
  return ((r & 0xff) << 16) | ((g & 0xff) << 8) | (b & 0xff);
}

/**
 * Builds an OPULENT ROYAL ESTATE LUXURY BENCH at 1.2cm ultra-fine microvoxel resolution!
 * - Sculpted Carrara white marble pedestal bases with gilded gold molding collars
 * - Forged obsidian-bronze & 24k gilded brass baroque scrolled armrests with lion-crest medallions
 * - Deep polished royal mahogany timber frame & tall cathedral-arched backrest with inlaid gold filigree
 * - Grand sculpted royal crown emblem crest crowning the backrest arch + brass finial orbs
 * - Plush tufted deep royal burgundy velvet seat cushion & bolster piping with recessed gold buttons!
 * Pivot is bottom-center (x = 0, y = 0, z = 0) facing +Z toward the colossal lake.
 */
export function buildMicrovoxelBenchGrid(): VoxelGrid {
  const voxelSize = 0.012; // 1.2 cm super-microvoxels!
  const sizeX = 168; // ~2.02 m grand royal width
  const sizeY = 96; // ~1.15 m majestic arched crown height
  const sizeZ = 72; // ~0.86 m deep

  const grid = new VoxelGrid(
    sizeX,
    sizeY,
    sizeZ,
    voxelSize,
    -(sizeX * voxelSize) / 2,
    0,
    -(sizeZ * voxelSize) / 2,
  );

  // Opulent luxury material palette
  const MARBLE_LIGHT = 0xefeae2;
  const MARBLE_MID = 0xded8ce;
  const MARBLE_VEIN = 0xbeb7ac;
  const BRONZE_DARK = 0x1e1d20;
  const BRONZE_MID = 0x323036;
  const GOLD_BRIGHT = 0xf7cf60;
  const GOLD_RICH = 0xdba538;
  const GOLD_DEEP = 0xb58122;
  const MAHOGANY_DARK = 0x451b10;
  const MAHOGANY_MID = 0x642718;
  const MAHOGANY_WARM = 0x7c3420;
  const VELVET_DEEP = 0x5c111b;
  const VELVET_MID = 0x7b1927;
  const VELVET_HI = 0x992334;

  const cx = Math.floor(sizeX / 2);
  const leftFrameX = 12;
  const rightFrameX = sizeX - 13;

  const stampSide = (
    fx: number,
    inward: number,
    y: number,
    z: number,
    col: number,
    mat: VoxelMaterialKind,
    width = 4,
  ) => {
    for (let w = 0; w < width; w++) {
      grid.set(fx + inward * w, y, z, col, mat);
    }
  };

  // 1. Sculpted Carrara Marble Pedestal Bases + Gilded Baroque End Frames
  for (const fx of [leftFrameX, rightFrameX]) {
    const inward = fx < cx ? 1 : -1;

    // Wide stepped Carrara marble pedestal plinths under front & rear legs (y = 0..7)
    for (const [z0, z1] of [
      [48, 63],
      [7, 22],
    ] as const) {
      for (let y = 0; y <= 7; y++) {
        const inset = y >= 6 ? 2 : y >= 3 ? 1 : 0;
        const w = y < 3 ? 6 : y < 6 ? 5 : 4;
        for (let z = z0 + inset; z <= z1 - inset; z++) {
          const vein = Math.sin(z * 0.45 + y * 0.7) > 0.72;
          const mCol =
            y === 7
              ? GOLD_RICH
              : vein
                ? MARBLE_VEIN
                : y % 2 === 0
                  ? MARBLE_LIGHT
                  : MARBLE_MID;
          const mMat = y === 7 ? VoxelMaterialKind.Brass : VoxelMaterialKind.Stone;
          for (let dx = -1; dx < w; dx++) {
            grid.set(fx + inward * dx, y, z, jitterHex(mCol, z, y, 5), mMat);
          }
        }
      }
    }

    // Ornate carved marble & gold lower apron connecting front and rear pedestals (y = 3..9)
    for (let z = 22; z <= 48; z++) {
      const arch = Math.sin(((z - 22) / 26) * Math.PI) * 3;
      const yBase = Math.round(5 + arch);
      for (let dy = 0; dy <= 3; dy++) {
        const isGoldTrim = dy === 3 || dy === 0;
        stampSide(
          fx,
          inward,
          yBase + dy,
          z,
          isGoldTrim ? GOLD_RICH : MARBLE_MID,
          isGoldTrim ? VoxelMaterialKind.Brass : VoxelMaterialKind.Stone,
          3,
        );
      }
    }

    // Front fluted obsidian-bronze & gold column rising into scrolled royal armrest (y = 8..54)
    for (let y = 8; y <= 54; y++) {
      const t = (y - 8) / 46;
      const zCurve = Math.round(56 - Math.sin(t * Math.PI * 0.8) * 2.5 + t * 2.0);
      const isGoldRing = y === 9 || y === 26 || y === 42 || y === 53;
      stampSide(
        fx,
        inward,
        y,
        zCurve,
        isGoldRing ? GOLD_BRIGHT : BRONZE_DARK,
        isGoldRing ? VoxelMaterialKind.Brass : VoxelMaterialKind.CastIron,
        4,
      );
      stampSide(
        fx,
        inward,
        y,
        zCurve - 1,
        isGoldRing ? GOLD_RICH : BRONZE_MID,
        isGoldRing ? VoxelMaterialKind.Brass : VoxelMaterialKind.CastIron,
        4,
      );
      stampSide(fx, inward, y, zCurve - 2, BRONZE_DARK, VoxelMaterialKind.CastIron, 3);
    }

    // Rear mahogany & gilded spine sweeping gracefully into the tall royal backrest (y = 8..80)
    for (let y = 8; y <= 80; y++) {
      const zBack =
        y <= 32 ? Math.round(14 + ((y - 8) / 24) * 6.5) : Math.round(20.5 - (y - 32) * 0.28);
      const isGoldAccent = y === 34 || y === 58 || y === 78;
      stampSide(
        fx,
        inward,
        y,
        zBack,
        isGoldAccent ? GOLD_BRIGHT : MAHOGANY_DARK,
        isGoldAccent ? VoxelMaterialKind.Brass : VoxelMaterialKind.Wood,
        4,
      );
      stampSide(
        fx,
        inward,
        y,
        zBack + 1,
        isGoldAccent ? GOLD_RICH : MAHOGANY_MID,
        isGoldAccent ? VoxelMaterialKind.Brass : VoxelMaterialKind.Wood,
        4,
      );
      stampSide(fx, inward, y, zBack + 2, BRONZE_DARK, VoxelMaterialKind.CastIron, 3);
    }

    // Gilded royal orb finial crowning each rear corner post (y = 81..87)
    const finialZ = Math.round(20.5 - (80 - 32) * 0.28);
    for (let dy = 0; dy <= 6; dy++) {
      const r = dy === 0 || dy === 5 ? 1 : dy === 6 ? 0 : 2;
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) === 2 && Math.abs(dz) === 2) continue;
          grid.set(
            fx + inward + dx,
            81 + dy,
            finialZ + dz,
            dy >= 3 ? GOLD_BRIGHT : GOLD_RICH,
            VoxelMaterialKind.Brass,
          );
        }
      }
    }

    // Intricate golden baroque filigree scrollwork inside the side frame under seat (y = 12..32)
    for (let i = 0; i <= 72; i++) {
      const f = i / 72;
      const az = Math.round(18 + f * 35);
      const ay = Math.round(13 + Math.sin(f * Math.PI) * 14.5);
      grid.set(fx + inward, ay, az, GOLD_RICH, VoxelMaterialKind.Brass);
      grid.set(fx + inward * 2, ay, az, BRONZE_MID, VoxelMaterialKind.CastIron);
      grid.set(fx + inward, ay + 1, az, GOLD_BRIGHT, VoxelMaterialKind.Brass);
    }
    // Central gilded baroque ring medallion
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2;
      const rz = Math.round(36 + Math.cos(a) * 6.2);
      const ry = Math.round(21 + Math.sin(a) * 5.2);
      grid.set(fx + inward, ry, rz, GOLD_BRIGHT, VoxelMaterialKind.Brass);
      grid.set(fx + inward * 2, ry, rz, GOLD_DEEP, VoxelMaterialKind.Brass);
    }
    // Solid golden sunburst emblem in the heart of side medallion
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        grid.set(fx + inward, 21 + dy, 36 + dx, GOLD_BRIGHT, VoxelMaterialKind.Brass);
      }
    }

    // Wide plush-curved mahogany & gilded royal armrest (z = 16..63)
    for (let z = 16; z <= 63; z++) {
      const t = (z - 16) / 47;
      const armY = Math.round(
        53 + Math.sin(t * Math.PI) * 2.8 - (t > 0.88 ? 3.5 * ((t - 0.88) / 0.12) : 0),
      );
      stampSide(fx, inward, armY - 1, z, GOLD_RICH, VoxelMaterialKind.Brass, 4);
      stampSide(fx, inward, armY, z, MAHOGANY_MID, VoxelMaterialKind.Wood, 5);
      if (t > 0.08 && t < 0.92) {
        stampSide(fx, inward, armY + 1, z, MAHOGANY_WARM, VoxelMaterialKind.Wood, 4);
        // Thin 24k gold inlay strip running down the center of the luxury armrest
        grid.set(fx + inward * 2, armY + 2, z, GOLD_BRIGHT, VoxelMaterialKind.Brass);
      }
    }
    // Gilded volute lion-scroll curl at the front tip of each armrest
    for (let i = 0; i <= 24; i++) {
      const a = (i / 24) * Math.PI * 1.6;
      const cz = Math.round(61 + Math.cos(a) * 3.4);
      const cy = Math.round(49 + Math.sin(a) * 3.2);
      stampSide(fx, inward, cy, cz, i % 3 === 0 ? GOLD_BRIGHT : GOLD_RICH, VoxelMaterialKind.Brass, 4);
    }
  }

  // 2. Sculpted Front Royal Mahogany & Gilded Apron Beam + Structural Base (y = 26..33)
  for (let x = leftFrameX + 2; x <= rightFrameX - 2; x++) {
    // Decorative scalloped royal apron across the front of the bench
    const scallop = Math.round(Math.sin(((x - leftFrameX) / (rightFrameX - leftFrameX)) * Math.PI * 5) * 1.3);
    for (let y = 26 + Math.max(0, scallop); y <= 32; y++) {
      const isGoldEdge = y === 26 + Math.max(0, scallop) || y === 32;
      const col = isGoldEdge ? GOLD_RICH : jitterHex(MAHOGANY_DARK, x * 0.4, y, 7);
      const mat = isGoldEdge ? VoxelMaterialKind.Brass : VoxelMaterialKind.Wood;
      grid.set(x, y, 56, col, mat);
      grid.set(x, y, 57, isGoldEdge ? GOLD_BRIGHT : MAHOGANY_MID, mat);
    }
    // Solid rear & mid support beams
    for (let y = 28; y <= 32; y++) {
      grid.set(x, y, 21, MAHOGANY_DARK, VoxelMaterialKind.Wood);
      grid.set(x, y, 38, BRONZE_DARK, VoxelMaterialKind.CastIron);
    }
    // Lower gilded tie-rod stretcher
    grid.set(x, 15, 34, BRONZE_DARK, VoxelMaterialKind.CastIron);
    grid.set(x, 16, 34, GOLD_DEEP, VoxelMaterialKind.Brass);
  }
  // Ornate gilded diamond rosette at center of front apron
  for (let dx = -5; dx <= 5; dx++) {
    for (let dy = -3; dy <= 3; dy++) {
      if (Math.abs(dx) * 0.65 + Math.abs(dy) <= 3.4) {
        grid.set(cx + dx, 29 + dy, 58, GOLD_BRIGHT, VoxelMaterialKind.Brass);
      }
    }
  }

  // 3. Solid Polished Mahogany Seat Deck (y = 32..34, z = 20..56)
  for (let x = leftFrameX + 2; x <= rightFrameX - 2; x++) {
    for (let z = 20; z <= 56; z++) {
      const col = jitterHex(MAHOGANY_MID, x * 0.3, z * 0.5, 7);
      grid.set(x, 32, z, MAHOGANY_DARK, VoxelMaterialKind.Wood);
      grid.set(x, 33, z, col, VoxelMaterialKind.Wood);
    }
  }

  // 4. PLUSH DIAMOND-TUFTED ROYAL BURGUNDY VELVET CUSHION with Gold Piping & Recessed Brass Buttons!
  // Sits at y = 34..37 (top surface = 38 * 0.012 = 0.456m = BENCH_SEAT_TOP_Y!)
  const cushX0 = leftFrameX + 5;
  const cushX1 = rightFrameX - 5;
  const cushZ0 = 22;
  const cushZ1 = 54;

  for (let x = cushX0; x <= cushX1; x++) {
    for (let z = cushZ0; z <= cushZ1; z++) {
      const edgeDistX = Math.min(x - cushX0, cushX1 - x);
      const edgeDistZ = Math.min(z - cushZ0, cushZ1 - z);
      const isCorner = edgeDistX === 0 && edgeDistZ === 0;
      if (isCorner) continue;

      const isPiping = edgeDistX === 0 || edgeDistZ === 0;
      // Quilted diamond tuft pattern across the plush velvet cushion
      const tx = ((x - cushX0) % 16) - 8;
      const tz = ((z - cushZ0) % 16) - 8;
      const isTuftButton = Math.abs(tx) <= 0 && Math.abs(tz) <= 0 && edgeDistX > 3 && edgeDistZ > 3;
      const isTuftSeam =
        Math.abs(Math.abs(tx) + Math.abs(tz) - 8) <= 0.6 && edgeDistX > 1 && edgeDistZ > 1;

      for (let y = 34; y <= 37; y++) {
        if (y === 37 && (isPiping || isTuftButton)) {
          if (isPiping) {
            // Gold-braid piping rim along top perimeter of cushion!
            grid.set(x, 36, z, GOLD_BRIGHT, VoxelMaterialKind.Brass);
          } else if (isTuftButton) {
            // Recessed gleaming gold button tuft dimple!
            grid.set(x, 36, z, GOLD_BRIGHT, VoxelMaterialKind.Brass);
          }
          continue;
        }
        if (y === 37 && isTuftSeam) {
          // Subtle tufted valley shading
          grid.set(x, 36, z, VELVET_DEEP, VoxelMaterialKind.TerrainMatte);
          continue;
        }
        const vCol =
          y === 37
            ? jitterHex(VELVET_HI, x * 0.6, z * 0.6, 6)
            : y === 36
              ? jitterHex(VELVET_MID, x * 0.6, z * 0.6, 5)
              : VELVET_DEEP;
        grid.set(x, y, z, vCol, VoxelMaterialKind.TerrainMatte);
      }
    }
  }

  // 5. Majestic Cathedral-Arched Royal Mahogany, Velvet & Gold Filigree Backrest (y = 36..88)
  for (let x = leftFrameX + 2; x <= rightFrameX - 2; x++) {
    const normX = (x - cx) / (cx - leftFrameX - 2); // -1 .. +1
    // Graceful royal palace double-ogee arch curving highest at the center crown!
    const archHeight = Math.round(74 + Math.cos(normX * Math.PI * 0.5) * 11 + Math.exp(-normX * normX * 14) * 6);

    for (let y = 37; y <= archHeight; y++) {
      const zFront = Math.round(22.0 - (y - 32) * 0.28);
      const isTopFrame = y >= archHeight - 3;
      const isBottomFrame = y <= 40;
      const isSideFrame = Math.abs(x - leftFrameX) <= 5 || Math.abs(x - rightFrameX) <= 5;
      const isOuterGoldBead = y === archHeight - 3 || y === 41;

      if (isTopFrame || isBottomFrame || isSideFrame) {
        // Carved mahogany surround with 24k gold trim bead
        const isGoldCrownTrim = y === archHeight || isOuterGoldBead;
        const col = isGoldCrownTrim ? GOLD_RICH : jitterHex(MAHOGANY_MID, x * 0.35, y * 0.5, 8);
        const mat = isGoldCrownTrim ? VoxelMaterialKind.Brass : VoxelMaterialKind.Wood;
        grid.set(x, y, zFront - 1, MAHOGANY_DARK, VoxelMaterialKind.Wood);
        grid.set(x, y, zFront, col, mat);
        if (y === archHeight - 1 || y === archHeight - 2) {
          grid.set(x, y, zFront + 1, jitterHex(MAHOGANY_WARM, x, y, 7), VoxelMaterialKind.Wood);
        }
      } else {
        // Split luxury backrest interior:
        // Lower-mid upholstered tufted royal velvet lumbar panel (y = 42..61) + upper open golden palace filigree (y = 62..arch-4)!
        if (y <= 61) {
          const isVelvetBorder = y === 42 || y === 61 || Math.abs(x - leftFrameX) === 6 || Math.abs(x - rightFrameX) === 6;
          grid.set(x, y, zFront - 1, MAHOGANY_DARK, VoxelMaterialKind.Wood);
          if (isVelvetBorder) {
            grid.set(x, y, zFront, GOLD_BRIGHT, VoxelMaterialKind.Brass);
          } else {
            const tx = ((x - cushX0) % 14) - 7;
            const ty = ((y - 42) % 10) - 5;
            const isBtn = tx === 0 && ty === 0 && Math.abs(normX) < 0.85;
            const col = isBtn ? GOLD_BRIGHT : jitterHex(VELVET_MID, x * 0.5, y * 0.5, 7);
            const mat = isBtn ? VoxelMaterialKind.Brass : VoxelMaterialKind.TerrainMatte;
            grid.set(x, y, zFront, col, mat);
            if (!isBtn) {
              grid.set(x, y, zFront + 1, jitterHex(VELVET_HI, x * 0.5, y * 0.5, 6), VoxelMaterialKind.TerrainMatte);
            }
          }
        } else {
          // Openwork royal palace golden vertical balusters & ornate oval lattice medallions!
          const distFromCenter = Math.abs(x - cx);
          const isSpindle = distFromCenter % 10 === 0;
          const midY = 62 + (archHeight - 65) * 0.5;
          const inOvalRing =
            Math.abs(Math.hypot(((x - cx) % 20) - 10, (y - midY) * 1.15) - 5.2) < 0.9;
          if (isSpindle || inOvalRing) {
            grid.set(x, y, zFront, isSpindle ? GOLD_RICH : GOLD_BRIGHT, VoxelMaterialKind.Brass);
            grid.set(x, y, zFront - 1, BRONZE_DARK, VoxelMaterialKind.CastIron);
          }
        }
      }
    }
  }

  // 6. Grand Sculpted Golden Royal Crown Crest Emblem at Center Top of Backrest (y = 84..95)
  const crownZ = Math.round(22.0 - (86 - 32) * 0.28);
  for (let dx = -12; dx <= 12; dx++) {
    const absX = Math.abs(dx);
    const crownBase = 85;
    // 3-spire royal crown silhouette
    const spireBoost =
      absX <= 2
        ? 8 - absX
        : absX >= 6 && absX <= 10
          ? 6 - Math.abs(absX - 8) * 1.4
          : 2;
    const topY = Math.round(crownBase + spireBoost);
    for (let y = crownBase; y <= topY; y++) {
      const isJewel = y === crownBase + 2 && (dx === 0 || absX === 6);
      grid.set(
        cx + dx,
        y,
        crownZ,
        isJewel ? VELVET_HI : y === topY ? GOLD_BRIGHT : GOLD_RICH,
        isJewel ? VoxelMaterialKind.TerrainMatte : VoxelMaterialKind.Brass,
      );
      grid.set(cx + dx, y, crownZ - 1, GOLD_DEEP, VoxelMaterialKind.Brass);
    }
  }

  return grid;
}

/**
 * Builds an ultra-fine heritage cast-iron park lantern at 1.6cm voxel resolution!
 */
export function buildMicrovoxelLanternGrid(): VoxelGrid {
  const voxelSize = 0.016; // 1.6 cm ultra-fine microvoxels
  const sizeX = 35;
  const sizeY = 178; // ~2.85 m tall
  const sizeZ = 35;

  const grid = new VoxelGrid(
    sizeX,
    sizeY,
    sizeZ,
    voxelSize,
    -(sizeX * voxelSize) / 2,
    0,
    -(sizeZ * voxelSize) / 2,
  );

  const cx = 17;
  const cz = 17;
  const IRON = 0x20262e;
  const IRON_MID = 0x313a45;
  const IRON_HI = 0x475361;
  const BRASS = 0xe2ac4d;
  const GLASS_WARM = 0xffe4a8;
  const FILAMENT = 0xfff8e2;

  for (let y = 0; y <= 30; y++) {
    const rad = y < 6 ? 7 : y < 14 ? 5 : y < 24 ? 4 : 3;
    const isRing = y === 6 || y === 14 || y === 24 || y === 29;
    for (let dx = -rad; dx <= rad; dx++) {
      for (let dz = -rad; dz <= rad; dz++) {
        if (Math.abs(dx) + Math.abs(dz) > rad + Math.floor(rad * 0.52)) continue;
        grid.set(cx + dx, y, cz + dz, isRing ? IRON_HI : IRON, VoxelMaterialKind.CastIron);
      }
    }
  }

  for (let y = 31; y <= 128; y++) {
    const isCollar = y === 46 || y === 84 || y === 121 || y === 122;
    const r = y < 48 || isCollar ? 3 : 2;
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        if (Math.abs(dx) === r && Math.abs(dz) === r) continue;
        grid.set(cx + dx, y, cz + dz, isCollar ? IRON_HI : IRON, VoxelMaterialKind.CastIron);
      }
    }
  }

  for (let dx = -10; dx <= 10; dx++) {
    grid.set(cx + dx, 118, cz, IRON_MID, VoxelMaterialKind.CastIron);
    grid.set(cx + dx, 119, cz, IRON_HI, VoxelMaterialKind.CastIron);
  }
  for (const tip of [-10, 10]) {
    grid.set(cx + tip, 120, cz, BRASS, VoxelMaterialKind.Brass);
    grid.set(cx + tip, 117, cz, BRASS, VoxelMaterialKind.Brass);
  }

  for (let y = 129; y <= 136; y++) {
    const r = y < 132 ? 4 : 6;
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        if (Math.abs(dx) + Math.abs(dz) > r + 3) continue;
        grid.set(cx + dx, y, cz + dz, y === 135 ? IRON_HI : IRON, VoxelMaterialKind.CastIron);
      }
    }
  }

  for (let y = 137; y <= 157; y++) {
    const r = y >= 147 ? 7 : 6;
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        const ax = Math.abs(dx);
        const az = Math.abs(dz);
        if (ax === r && az === r) {
          grid.set(cx + dx, y, cz + dz, IRON, VoxelMaterialKind.CastIron);
        } else if (ax <= r - 2 && az <= r - 2 && y >= 139 && y <= 155) {
          const isCore = ax <= 2 && az <= 2 && y >= 144 && y <= 150;
          grid.set(
            cx + dx,
            y,
            cz + dz,
            isCore ? FILAMENT : GLASS_WARM,
            VoxelMaterialKind.LanternGlow,
          );
        }
      }
    }
  }

  for (let y = 158; y <= 169; y++) {
    const r = Math.max(1, 9 - Math.floor((y - 158) * 0.78));
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        if (Math.abs(dx) + Math.abs(dz) > r + Math.max(1, Math.floor(r * 0.45))) continue;
        grid.set(cx + dx, y, cz + dz, y === 158 ? IRON_HI : IRON, VoxelMaterialKind.CastIron);
      }
    }
  }
  for (let y = 170; y <= 176; y++) {
    grid.set(cx, y, cz, BRASS, VoxelMaterialKind.Brass);
  }
  for (const [dx, dz] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]) {
    grid.set(cx + dx, 171, cz + dz, BRASS, VoxelMaterialKind.Brass);
  }

  return grid;
}
