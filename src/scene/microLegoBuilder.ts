import { VoxelGrid, VoxelMaterialKind } from './voxelGrid';
import { hash2D } from './worldLayout';

/**
 * Exact local coordinates (meters, relative to character pivot at seated hip bottom y=0)
 * of the glowing orange cigarette ember tip, used to emit animated rising smoke wisps!
 */
export const CIGARETTE_TIP_LOCAL = {
  x: -0.175,
  y: 0.605,
  z: 0.41,
} as const;

function jitterHex(hex: number, a: number, b: number, c: number, amount = 8): number {
  const n = (hash2D(a * 1.43 + b * 0.89, c * 2.17 - b * 1.07) - 0.5) * 2 * amount;
  const r = Math.max(0, Math.min(255, ((hex >> 16) & 0xff) + n));
  const g = Math.max(0, Math.min(255, ((hex >> 8) & 0xff) + n * 0.94));
  const bCh = Math.max(0, Math.min(255, (hex & 0xff) + n * 0.9));
  return ((r & 0xff) << 16) | ((g & 0xff) << 8) | (bCh & 0xff);
}

/**
 * Helper to draw a smooth cylindrical limb or sculpted strand between two 3D voxel points.
 */
function stampTube(
  grid: VoxelGrid,
  x0: number,
  y0: number,
  z0: number,
  x1: number,
  y1: number,
  z1: number,
  r0: number,
  r1: number,
  color: number,
  mat: VoxelMaterialKind,
  jitterAmt = 6,
): void {
  const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0, z1 - z0) * 2.0));
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
          if (dx * dx + dy * dy + dz * dz <= (r + 0.15) * (r + 0.15)) {
            const vx = Math.round(x + dx);
            const vy = Math.round(y + dy);
            const vz = Math.round(z + dz);
            const col = jitterAmt > 0 ? jitterHex(color, vx, vy, vz, jitterAmt) : color;
            grid.set(vx, vy, vz, col, mat);
          }
        }
      }
    }
  }
}

/**
 * Builds an ultra-detailed 1.0cm microvoxel LEGO MINIFIGURE CHARACTER
 * with GORGEOUS LONG FLOWING HAIR (`rambut bagus gondrong`) sitting on the luxury bench
 * while casually smoking a glowing cigarette!
 *
 * Proportions (1.0cm microvoxels, ~1.04m seated height above cushion):
 * - Pivot (0, 0, 0) = bottom-center of seated LEGO hips resting flush on BENCH_SEAT_TOP_Y
 * - Faces +Z toward the colossal reflective lake
 * - Classic glossy LEGO yellow cylindrical head, expressive face, iconic C-claw hands
 * - Lush layered long wavy chestnut-espresso hair cascading past shoulders & down the back
 * - Stylish open dark charcoal leather jacket over crisp ivory tee + gold chain + indigo LEGO legs
 * - Right hand raised casually holding a finely rolled cigarette with glowing ember tip!
 */
export function buildMicroLegoCharacterGrid(): VoxelGrid {
  const vs = 0.01; // 1.0 cm collector-grade ultra-fine microvoxels!
  const sizeX = 80; // 80cm wide envelope
  const sizeY = 120; // -12cm below seat up to +108cm top of hair
  const sizeZ = 82; // -26cm behind back up to +56cm outstretched feet & cigarette

  const originX = -(sizeX * vs) / 2; // -0.40m
  const originY = -0.14; // yVoxel = 14 corresponds to y = 0.0 (cushion top!)
  const originZ = -0.26; // zVoxel = 26 corresponds to z = 0.0 (hip center!)

  const grid = new VoxelGrid(sizeX, sizeY, sizeZ, vs, originX, originY, originZ);

  const cx = 40; // x = 0.0
  const seatY = 14; // y = 0.0 (resting right on the velvet cushion)
  const cz = 26; // z = 0.0 (hip center)

  // Authentic glossy LEGO & apparel palette
  const LEGO_YELLOW = 0xffcf2e;
  const LEGO_YELLOW_SHADE = 0xe8b51c;
  const EYE_BLACK = 0x121418;
  const EYE_WHITE = 0xffffff;
  const MOUTH_DARK = 0x3b2618;

  const HAIR_DARK = 0x22150f;
  const HAIR_MID = 0x382217;
  const HAIR_WARM = 0x523322;
  const HAIR_HIGHLIGHT = 0x6e4730;

  const JACKET_MAIN = 0x212731;
  const JACKET_LAPEL = 0x313a48;
  const JACKET_DARK = 0x161a22;
  const TEE_WHITE = 0xf2eee4;
  const TEE_STRIPE = 0x8f2230;
  const GOLD_CHAIN = 0xf5cc58;

  const JEANS_MAIN = 0x294469;
  const JEANS_SHADE = 0x1e3350;
  const BELT_DARK = 0x2b1d14;
  const SHOE_DARK = 0x1c1f26;
  const SHOE_SOLE = 0xe8e5dc;

  const CIG_FILTER = 0xd9954c;
  const CIG_PAPER = 0xf7f5ef;
  const CIG_ASH = 0x919498;
  const CIG_EMBER = 0xff551a;

  // =========================================================================
  // 1. SEATED LEGO HIPS & HINGED BLOCKY LEGS EXTENDING FORWARD (+Z)
  // =========================================================================
  // Pelvis / hip block (classic LEGO square hip piece resting flush at y = seatY)
  for (let x = cx - 15; x <= cx + 15; x++) {
    for (let y = seatY; y <= seatY + 13; y++) {
      for (let z = cz - 9; z <= cz + 10; z++) {
        const isBelt = y >= seatY + 11;
        const isBuckle = isBelt && Math.abs(x - cx) <= 2 && z === cz + 10;
        const col = isBuckle
          ? GOLD_CHAIN
          : isBelt
            ? BELT_DARK
            : Math.abs(x - cx) <= 1
              ? JEANS_SHADE
              : JEANS_MAIN;
        const mat = isBuckle ? VoxelMaterialKind.Brass : VoxelMaterialKind.Stone;
        grid.set(x, y, z, jitterHex(col, x, y, z, 4), mat);
      }
    }
  }

  // Two distinct classic blocky LEGO legs extending forward along +Z (bent 90° at hips!)
  // Left leg (+X): x in [cx+2 .. cx+15], Right leg (-X): x in [cx-15 .. cx-2]
  for (const side of [-1, 1] as const) {
    const x0 = side < 0 ? cx - 15 : cx + 2;
    const x1 = side < 0 ? cx - 2 : cx + 15;
    // Slightly relaxed natural stance: legs extended straight forward on the cushion, boots at front
    for (let x = x0; x <= x1; x++) {
      const isSeamX = x === x0 || x === x1;
      for (let z = cz + 8; z <= cz + 42; z++) {
        const isFoot = z >= cz + 35;
        const yBottom = isFoot ? seatY - 7 : seatY;
        const yTop = isFoot ? seatY + 12 : seatY + 12;

        for (let y = yBottom; y <= yTop; y++) {
          // Tapered LEGO rounded hip cylinder joint near z = cz + 8..10
          if (z < cz + 11 && y < seatY + 2) continue;

          if (isFoot) {
            const isToe = y < seatY - 2;
            const isSole = z === cz + 42;
            const isCuff = z === cz + 35;
            const col = isSole
              ? SHOE_SOLE
              : isCuff
                ? JEANS_SHADE
                : isToe
                  ? SHOE_DARK
                  : SHOE_DARK;
            grid.set(x, y, z, jitterHex(col, x, y, z, 4), VoxelMaterialKind.Stone);
          } else {
            const col = isSeamX || y === seatY ? JEANS_SHADE : JEANS_MAIN;
            grid.set(x, y, z, jitterHex(col, x, y, z, 5), VoxelMaterialKind.Stone);
          }
        }
      }
    }
  }

  // =========================================================================
  // 2. ICONIC TAPERED LEGO TRAPEZOID TORSO (Open Jacket + Ivory Tee + Gold Chain)
  // =========================================================================
  const torsoY0 = seatY + 14; // y = 28 (0.14m above cushion)
  const torsoY1 = seatY + 51; // y = 65 (0.51m above cushion)

  for (let y = torsoY0; y <= torsoY1; y++) {
    const t = (y - torsoY0) / (torsoY1 - torsoY0); // 0 = waist, 1 = shoulders
    // Classic LEGO torso tapers gracefully inward from waist (15.5) to shoulders (12.5)
    const halfW = Math.round(15.5 - t * 3.0);
    const halfD = Math.round(9.5 - t * 1.2);
    // Slight relaxed recline back against the royal cushion
    const leanZ = Math.round(-t * 3.0);

    for (let x = cx - halfW; x <= cx + halfW; x++) {
      for (let z = cz + leanZ - halfD; z <= cz + leanZ + halfD; z++) {
        // Soft chamfered LEGO torso corners
        if (Math.abs(x - cx) === halfW && Math.abs(z - (cz + leanZ)) === halfD) continue;

        const isFront = z >= cz + leanZ + halfD - 1;
        const absX = Math.abs(x - cx);
        let col = JACKET_MAIN;
        let mat = VoxelMaterialKind.Stone;

        if (isFront) {
          // Open charcoal jacket revealing crisp ivory tee down center chest
          const openingHalfW = Math.round(4.5 + t * 2.2);
          if (absX < openingHalfW) {
            // Subtle burgundy chest stripe + sleek gold chain arc on upper tee
            const chainDist = Math.abs(Math.hypot(absX * 0.9, (y - (torsoY1 - 6)) * 1.1) - 4.4);
            if (y > torsoY1 - 12 && chainDist < 0.85) {
              col = GOLD_CHAIN;
              mat = VoxelMaterialKind.Brass;
            } else if (y >= torsoY0 + 17 && y <= torsoY0 + 20) {
              col = TEE_STRIPE;
            } else {
              col = TEE_WHITE;
            }
          } else if (absX <= openingHalfW + 2) {
            // Structured jacket lapel collar with tiny brass snaps
            const isSnap = (y === torsoY1 - 5 || y === torsoY0 + 10) && absX === openingHalfW + 1;
            col = isSnap ? GOLD_CHAIN : JACKET_LAPEL;
            mat = isSnap ? VoxelMaterialKind.Brass : VoxelMaterialKind.Stone;
          } else {
            col = y % 7 === 0 ? JACKET_DARK : JACKET_MAIN;
          }
        } else {
          col = y === torsoY0 || y === torsoY1 ? JACKET_DARK : JACKET_MAIN;
        }

        grid.set(x, y, z, jitterHex(col, x, y, z, 5), mat);
      }
    }
  }

  // =========================================================================
  // 3. CLASSIC CYLINDRICAL LEGO NECK & GLOSSY YELLOW MINIFIGURE HEAD
  // =========================================================================
  const headCenterZ = cz - 3;

  // Yellow neck cylinder (y = torsoY1+1 .. torsoY1+5)
  for (let y = torsoY1 + 1; y <= torsoY1 + 5; y++) {
    for (let dx = -6; dx <= 6; dx++) {
      for (let dz = -6; dz <= 6; dz++) {
        if (dx * dx + dz * dz <= 38) {
          grid.set(cx + dx, y, headCenterZ + dz, LEGO_YELLOW_SHADE, VoxelMaterialKind.Stone);
        }
      }
    }
  }

  // Iconic LEGO rounded-barrel yellow head (y = torsoY1+6 .. torsoY1+32 -> 27cm tall, 24cm wide)
  const headY0 = torsoY1 + 6; // 71
  const headY1 = torsoY1 + 32; // 97
  const headMidY = Math.round((headY0 + headY1) / 2); // 84

  for (let y = headY0; y <= headY1; y++) {
    // Classic LEGO head bevel at top & chin
    const distEnd = Math.min(y - headY0, headY1 - y);
    const rad = distEnd === 0 ? 8.5 : distEnd === 1 ? 10.2 : distEnd === 2 ? 11.4 : 12.2;

    for (let dx = -13; dx <= 13; dx++) {
      for (let dz = -13; dz <= 13; dz++) {
        if (dx * dx + dz * dz <= rad * rad) {
          let col = y <= headY0 + 1 ? LEGO_YELLOW_SHADE : LEGO_YELLOW;
          grid.set(cx + dx, y, headCenterZ + dz, col, VoxelMaterialKind.Stone);
        }
      }
    }
  }

  // Iconic LEGO top head stud (subtly sculpted at y = headY1+1 .. headY1+5 beneath hair crown)
  for (let y = headY1 + 1; y <= headY1 + 5; y++) {
    for (let dx = -6; dx <= 6; dx++) {
      for (let dz = -6; dz <= 6; dz++) {
        if (dx * dx + dz * dz <= 36) {
          grid.set(cx + dx, y, headCenterZ + dz, LEGO_YELLOW, VoxelMaterialKind.Stone);
        }
      }
    }
  }

  // Crisp Classic LEGO Face on front of head (+Z): oval eyes with sparkle catchlights, cool brows & chill smirk!
  const paintOnHeadFront = (dx: number, y: number, col: number) => {
    for (let dz = 13; dz >= 7; dz--) {
      if (grid.isSolid(cx + dx, y, headCenterZ + dz)) {
        grid.set(cx + dx, y, headCenterZ + dz, col, VoxelMaterialKind.Stone);
        break;
      }
    }
  };

  // Glossy black oval LEGO eyes + crisp white catchlight sparkle
  for (const eyeCenterX of [-4, 4]) {
    for (let ex = -1; ex <= 1; ex++) {
      for (let ey = -2; ey <= 2; ey++) {
        if (Math.abs(ex) === 1 && Math.abs(ey) === 2) continue;
        paintOnHeadFront(eyeCenterX + ex, headMidY + 1 + ey, EYE_BLACK);
      }
    }
    // Crisp white specular dot in upper-right of each LEGO eye
    paintOnHeadFront(eyeCenterX + 1, headMidY + 2, EYE_WHITE);

    // Cool relaxed dark-brown eyebrows
    for (let bx = -2; bx <= 2; bx++) {
      const browLift = eyeCenterX < 0 ? (bx < 0 ? 0 : 1) : bx > 0 ? 0 : 1;
      paintOnHeadFront(eyeCenterX + bx, headMidY + 5 + browLift, HAIR_DARK);
    }
  }

  // Relaxed confident half-smirk mouth (slightly tilted toward cigarette side!)
  const mouthPts: [number, number][] = [
    [-4, -5],
    [-3, -6],
    [-2, -6],
    [-1, -6],
    [0, -6],
    [1, -6],
    [2, -5],
    [3, -4],
  ];
  for (const [mx, my] of mouthPts) {
    paintOnHeadFront(mx, headMidY + my, MOUTH_DARK);
  }

  // =========================================================================
  // 4. GORGEOUS LONG FLOWING HAIR (`RAMBUT BAGUS GONDRONG`)!
  // Voluminous layered crown + stylish swept bangs + cascading wavy shoulder & back locks
  // =========================================================================
  const hairColorAt = (x: number, y: number, z: number, strandSeed: number): number => {
    const wave = Math.sin(y * 0.24 + strandSeed * 1.7 + x * 0.19);
    if (wave > 0.62) return jitterHex(HAIR_HIGHLIGHT, x, y, z, 6);
    if (wave > 0.05) return jitterHex(HAIR_WARM, x, y, z, 6);
    if (wave > -0.5) return jitterHex(HAIR_MID, x, y, z, 5);
    return jitterHex(HAIR_DARK, x, y, z, 4);
  };

  // 4A. Thick sculpted voluminous hair cap wrapping top, sides & back of LEGO head
  for (let y = headMidY - 2; y <= headY1 + 8; y++) {
    const tTop = Math.max(0, (y - headY1) / 8);
    const outerR = (1 - tTop * tTop * 0.62) * 14.8 + Math.sin(y * 0.45) * 0.6;
    const innerR = y <= headY1 ? 11.4 : 0;

    for (let dx = -16; dx <= 16; dx++) {
      for (let dz = -16; dz <= 16; dz++) {
        const d = Math.hypot(dx, dz);
        if (d > outerR || d < innerR) continue;

        // Leave the face clean & open in front (+Z), with stylish asymmetric side-swept curtain bangs!
        const ang = Math.atan2(dx, dz); // 0 = dead front (+Z), ±PI = back (-Z)
        const absAng = Math.abs(ang);

        // High forehead hairline swept elegantly to the left (+X) & framing temples
        const bangCutY = headY1 - 4 - Math.sin(dx * 0.22 + 0.55) * 3.5;
        if (dz > 5 && absAng < 0.72 && y < bangCutY) continue;
        // Side-temple framing cut so eyes and cheeks shine clearly
        if (dz > 2 && absAng < 1.05 && y < headMidY + 5) continue;

        const vx = cx + dx;
        const vz = headCenterZ + dz;
        grid.set(vx, y, vz, hairColorAt(vx, y, vz, Math.round(ang * 6)), VoxelMaterialKind.Wood);
      }
    }
  }

  // 4B. Stylish sweeping layered curtain bangs draping gracefully across upper forehead & temples
  const bangStrands = [
    // Sweeping right-to-left side fringe
    { x0: -2, y0: headY1 + 3, z0: 11, x1: 11, y1: headMidY + 4, z1: 12, r0: 2.4, r1: 1.4 },
    { x0: 1, y0: headY1 + 4, z0: 12, x1: 13, y1: headMidY - 2, z1: 9, r0: 2.3, r1: 1.5 },
    // Soft temple-framing wave on the left side of the face
    { x0: -5, y0: headY1 + 3, z0: 11, x1: -13, y1: headMidY - 3, z1: 8, r0: 2.3, r1: 1.5 },
    { x0: -8, y0: headY1 + 2, z0: 9, x1: -14, y1: headMidY - 12, z1: 6, r0: 2.4, r1: 1.6 },
    { x0: 8, y0: headY1 + 2, z0: 9, x1: 14, y1: headMidY - 12, z1: 6, r0: 2.4, r1: 1.6 },
  ];
  bangStrands.forEach((s, idx) => {
    stampTube(
      grid,
      cx + s.x0,
      s.y0,
      headCenterZ + s.z0,
      cx + s.x1,
      s.y1,
      headCenterZ + s.z1,
      s.r0,
      s.r1,
      idx % 2 === 0 ? HAIR_WARM : HAIR_MID,
      VoxelMaterialKind.Wood,
      7,
    );
  });

  // 4C. LUSH LONG FLOWING GONDRONG LOCKS cascading over both shoulders & sweeping down the entire back!
  // 28 sculpted wavy flowing hair ribbons draping organically from crown/temples down to mid-back & chest!
  const strandCount = 28;
  for (let i = 0; i < strandCount; i++) {
    // Distribute around sides and back: angle from +1.12 rad (left temple) around PI (back) to -1.12 rad (right temple)
    const f = i / (strandCount - 1); // 0 .. 1
    const ang = 1.08 + f * (Math.PI * 2 - 2.16); // wraps smoothly from left side -> full back -> right side!
    const isFrontShoulderLock = f < 0.16 || f > 0.84;

    const startR = 12.6;
    const startY = headMidY + 5 + Math.round(Math.sin(i * 1.9) * 2.5);
    // Long gondrong length! Back locks cascade ~52-60cm down to lower back; shoulder locks drape ~38-45cm over collarbone!
    const lockLen = isFrontShoulderLock
      ? 36 + Math.round(hash2D(i * 2.3, 4.1) * 10)
      : 48 + Math.round(hash2D(i * 3.1, 7.9) * 12);

    const waveFreq = 0.17 + hash2D(i, 9.2) * 0.06;
    const wavePhase = i * 1.45;
    const radialSpread = isFrontShoulderLock ? 4.2 : 5.5;

    for (let step = 0; step < lockLen; step++) {
      const t = step / lockLen;
      // Graceful S-wave flow + slight outward flare over the shoulders & jacket collar!
      const shoulderFlare = Math.sin(Math.min(1, t * 1.55) * Math.PI) * radialSpread;
      const swayAng = ang + Math.sin(step * waveFreq + wavePhase) * 0.11 * (0.4 + t);
      const curR = startR + shoulderFlare + Math.cos(step * waveFreq * 0.8 + wavePhase) * 1.1;

      let sx = cx + Math.sin(swayAng) * curR;
      let sz = headCenterZ + Math.cos(swayAng) * curR;
      const sy = startY - step;

      // Drape shoulder locks naturally forward over the jacket front, and back locks smoothly behind the jacket!
      if (isFrontShoulderLock) {
        sz += t * 6.5;
      } else {
        // Keep back locks neatly layered behind the reclined torso
        sz = Math.min(sz, cz - 10 - Math.round(t * 2.5));
      }

      // Taper each flowing strand gracefully into feathered pointed tips
      const rad = t > 0.78 ? 1.1 + (1 - t) * 4.5 : 2.35 - t * 0.35;
      const ir = Math.ceil(rad);
      for (let dx = -ir; dx <= ir; dx++) {
        for (let dz = -ir; dz <= ir; dz++) {
          if (dx * dx + dz * dz <= rad * rad) {
            const vx = Math.round(sx + dx);
            const vy = Math.round(sy);
            const vz = Math.round(sz + dz);
            grid.set(vx, vy, vz, hairColorAt(vx, vy, vz, i), VoxelMaterialKind.Wood);
          }
        }
      }
    }
  }

  // =========================================================================
  // 5. ICONIC LEGO ARMS, C-SHAPED YELLOW CLAW HANDS & GLOWING CIGARETTE!
  // =========================================================================
  // Left Arm (+X): relaxed casual drape resting near left knee/armrest
  const lShoulder = { x: cx + 15, y: torsoY1 - 6, z: cz - 2 };
  const lElbow = { x: cx + 22, y: torsoY1 - 24, z: cz + 4 };
  const lWrist = { x: cx + 18, y: torsoY0 + 4, z: cz + 18 };
  stampTube(grid, lShoulder.x, lShoulder.y, lShoulder.z, lElbow.x, lElbow.y, lElbow.z, 4.4, 3.8, JACKET_MAIN, VoxelMaterialKind.Stone, 5);
  stampTube(grid, lElbow.x, lElbow.y, lElbow.z, lWrist.x, lWrist.y, lWrist.z, 3.8, 3.4, JACKET_MAIN, VoxelMaterialKind.Stone, 5);
  // Left classic LEGO C-claw yellow hand resting forward
  for (let a = -120; a <= 120; a += 16) {
    const rad = (a * Math.PI) / 180;
    const hx = Math.round(lWrist.x + Math.sin(rad) * 3.6);
    const hy = Math.round(lWrist.y - 1 + Math.cos(rad) * 1.4);
    const hz = Math.round(lWrist.z + 4 + Math.cos(rad) * 3.6);
    stampTube(grid, hx, hy, hz, hx, hy + 2, hz, 1.3, 1.3, LEGO_YELLOW, VoxelMaterialKind.Stone, 3);
  }

  // Right Arm (-X): bent stylishly forward & up, holding the glowing cigarette in his C-claw hand!
  const rShoulder = { x: cx - 15, y: torsoY1 - 6, z: cz - 2 };
  const rElbow = { x: cx - 23, y: torsoY1 - 22, z: cz + 8 };
  const rWrist = { x: cx - 15, y: torsoY1 - 6, z: cz + 23 }; // raised smoothly in front of chest/chin!

  stampTube(grid, rShoulder.x, rShoulder.y, rShoulder.z, rElbow.x, rElbow.y, rElbow.z, 4.4, 3.8, JACKET_MAIN, VoxelMaterialKind.Stone, 5);
  stampTube(grid, rElbow.x, rElbow.y, rElbow.z, rWrist.x, rWrist.y, rWrist.z, 3.8, 3.4, JACKET_MAIN, VoxelMaterialKind.Stone, 5);
  // Subtle jacket cuff edge
  stampTube(grid, rWrist.x, rWrist.y, rWrist.z - 1, rWrist.x, rWrist.y, rWrist.z + 1, 3.6, 3.6, JACKET_LAPEL, VoxelMaterialKind.Stone, 4);

  // Right yellow LEGO wrist peg & iconic C-shaped claw gripping the cigarette!
  const handX = rWrist.x + 1;
  const handY = rWrist.y + 3;
  const handZ = rWrist.z + 5;
  stampTube(grid, rWrist.x, rWrist.y, rWrist.z + 1, handX, handY - 1, handZ - 2, 2.2, 2.2, LEGO_YELLOW_SHADE, VoxelMaterialKind.Stone, 3);
  for (let a = -125; a <= 125; a += 15) {
    const rad = (a * Math.PI) / 180;
    const hx = Math.round(handX + Math.cos(rad) * 3.5);
    const hy = Math.round(handY + Math.sin(rad) * 3.5);
    const hz = Math.round(handZ);
    stampTube(grid, hx, hy, hz - 1, hx, hy, hz + 1, 1.3, 1.3, LEGO_YELLOW, VoxelMaterialKind.Stone, 3);
  }

  // =========================================================================
  // 6. FINELY SCULPTED MICROVOXEL CIGARETTE WITH GLOWING ORANGE EMBER TIP!
  // Held naturally between the right LEGO C-claw fingers, angled gently forward & upward
  // =========================================================================
  const cigStart = { x: handX + 2, y: handY + 1, z: handZ - 2 };
  const cigEnd = { x: handX - 4, y: handY + 11, z: handZ + 12 }; // matches CIGARETTE_TIP_LOCAL!
  const cigSteps = 22;
  for (let i = 0; i <= cigSteps; i++) {
    const t = i / cigSteps;
    const vx = Math.round(cigStart.x + (cigEnd.x - cigStart.x) * t);
    const vy = Math.round(cigStart.y + (cigEnd.y - cigStart.y) * t);
    const vz = Math.round(cigStart.z + (cigEnd.z - cigStart.z) * t);

    let col = CIG_PAPER;
    let mat = VoxelMaterialKind.Stone;
    if (t < 0.28) {
      col = CIG_FILTER; // Tan cork filter
    } else if (t > 0.88) {
      col = CIG_EMBER; // Glowing fiery orange-red ember tip!
      mat = VoxelMaterialKind.LanternGlow;
    } else if (t > 0.78) {
      col = CIG_ASH; // Fine grey ash ring behind ember
    }

    // Crisp 2x2 microvoxel cigarette cylinder (2cm diameter for clear visual readability!)
    grid.set(vx, vy, vz, col, mat);
    grid.set(vx + 1, vy, vz, col, mat);
    grid.set(vx, vy + 1, vz, col, mat);
    grid.set(vx, vy, vz + 1, col, mat);
  }

  return grid;
}
