/**
 * Pure, zero-DOM microvoxel grid with 6-neighbor face culling and
 * per-vertex baked ambient occlusion (MagicaVoxel-style corner AO).
 */

export enum VoxelMaterialKind {
  Empty = 0,
  TerrainMatte = 1,
  Stone = 2,
  Wood = 3,
  CastIron = 4,
  Brass = 5,
  LanternGlow = 6,
  Foliage = 7,
}

export interface CulledMeshBuffers {
  material: VoxelMaterialKind;
  positions: Float32Array;
  normals: Float32Array;
  colors: Float32Array;
  indices: Uint32Array;
  faceCount: number;
}

interface FaceDef {
  dir: [number, number, number];
  /** 4 corner offsets in [0..1] local voxel coords, ordered CCW looking from outside */
  corners: [
    [number, number, number],
    [number, number, number],
    [number, number, number],
    [number, number, number],
  ];
  /** Tangent axes u and v on the face plane for computing 3-neighbor corner AO */
  uAxis: [number, number, number];
  vAxis: [number, number, number];
  /** Corner sign pairs (su, sv) corresponding to corners[0..3] */
  cornerSigns: [[number, number], [number, number], [number, number], [number, number]];
  /** Subtle directional shading multiplier to enhance microvoxel readability */
  faceShade: number;
}

const FACES: readonly FaceDef[] = [
  // +Y (top)
  {
    dir: [0, 1, 0],
    corners: [
      [0, 1, 1],
      [1, 1, 1],
      [1, 1, 0],
      [0, 1, 0],
    ],
    uAxis: [1, 0, 0],
    vAxis: [0, 0, 1],
    cornerSigns: [
      [-1, 1],
      [1, 1],
      [1, -1],
      [-1, -1],
    ],
    faceShade: 1.0,
  },
  // -Y (bottom)
  {
    dir: [0, -1, 0],
    corners: [
      [0, 0, 0],
      [1, 0, 0],
      [1, 0, 1],
      [0, 0, 1],
    ],
    uAxis: [1, 0, 0],
    vAxis: [0, 0, 1],
    cornerSigns: [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ],
    faceShade: 0.78,
  },
  // +X (right)
  {
    dir: [1, 0, 0],
    corners: [
      [1, 0, 1],
      [1, 0, 0],
      [1, 1, 0],
      [1, 1, 1],
    ],
    uAxis: [0, 1, 0],
    vAxis: [0, 0, 1],
    cornerSigns: [
      [-1, 1],
      [-1, -1],
      [1, -1],
      [1, 1],
    ],
    faceShade: 0.94,
  },
  // -X (left)
  {
    dir: [-1, 0, 0],
    corners: [
      [0, 0, 0],
      [0, 0, 1],
      [0, 1, 1],
      [0, 1, 0],
    ],
    uAxis: [0, 1, 0],
    vAxis: [0, 0, 1],
    cornerSigns: [
      [-1, -1],
      [-1, 1],
      [1, 1],
      [1, -1],
    ],
    faceShade: 0.9,
  },
  // +Z (front)
  {
    dir: [0, 0, 1],
    corners: [
      [0, 0, 1],
      [1, 0, 1],
      [1, 1, 1],
      [0, 1, 1],
    ],
    uAxis: [1, 0, 0],
    vAxis: [0, 1, 0],
    cornerSigns: [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ],
    faceShade: 0.96,
  },
  // -Z (back)
  {
    dir: [0, 0, -1],
    corners: [
      [1, 0, 0],
      [0, 0, 0],
      [0, 1, 0],
      [1, 1, 0],
    ],
    uAxis: [1, 0, 0],
    vAxis: [0, 1, 0],
    cornerSigns: [
      [1, -1],
      [-1, -1],
      [-1, 1],
      [1, 1],
    ],
    faceShade: 0.88,
  },
];

// Corner AO attenuation curve (0..3 occluders)
const AO_CURVE = [1.0, 0.8, 0.62, 0.44];

function srgbByteToLinear(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

export class VoxelGrid {
  readonly sizeX: number;
  readonly sizeY: number;
  readonly sizeZ: number;
  readonly voxelSize: number;
  readonly originX: number;
  readonly originY: number;
  readonly originZ: number;

  private readonly materials: Uint8Array;
  private readonly colors: Uint32Array;
  private readonly colMinY: Int16Array;
  private readonly colMaxY: Int16Array;
  private _voxelCount = 0;

  constructor(
    sizeX: number,
    sizeY: number,
    sizeZ: number,
    voxelSize: number,
    originX = 0,
    originY = 0,
    originZ = 0,
  ) {
    this.sizeX = sizeX;
    this.sizeY = sizeY;
    this.sizeZ = sizeZ;
    this.voxelSize = voxelSize;
    this.originX = originX;
    this.originY = originY;
    this.originZ = originZ;

    const total = sizeX * sizeY * sizeZ;
    this.materials = new Uint8Array(total);
    this.colors = new Uint32Array(total);
    this.colMinY = new Int16Array(sizeX * sizeZ).fill(sizeY);
    this.colMaxY = new Int16Array(sizeX * sizeZ).fill(-1);
  }

  get voxelCount(): number {
    return this._voxelCount;
  }

  private index(x: number, y: number, z: number): number {
    return x + this.sizeX * (z + this.sizeZ * y);
  }

  inBounds(x: number, y: number, z: number): boolean {
    return (
      x >= 0 &&
      x < this.sizeX &&
      y >= 0 &&
      y < this.sizeY &&
      z >= 0 &&
      z < this.sizeZ
    );
  }

  set(
    x: number,
    y: number,
    z: number,
    colorHex: number,
    material: VoxelMaterialKind = VoxelMaterialKind.TerrainMatte,
  ): void {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const iz = Math.floor(z);
    if (!this.inBounds(ix, iy, iz)) return;

    const idx = this.index(ix, iy, iz);
    const prev = this.materials[idx];
    if (material === VoxelMaterialKind.Empty) {
      if (prev !== VoxelMaterialKind.Empty) {
        this._voxelCount--;
        this.materials[idx] = 0;
        this.colors[idx] = 0;
      }
      return;
    }

    if (prev === VoxelMaterialKind.Empty) {
      this._voxelCount++;
    }
    this.materials[idx] = material;
    this.colors[idx] = colorHex & 0xffffff;

    const col = ix + iz * this.sizeX;
    if (iy < this.colMinY[col]) this.colMinY[col] = iy;
    if (iy > this.colMaxY[col]) this.colMaxY[col] = iy;
  }

  getMaterial(x: number, y: number, z: number): VoxelMaterialKind {
    if (!this.inBounds(x, y, z)) return VoxelMaterialKind.Empty;
    return this.materials[this.index(x, y, z)] as VoxelMaterialKind;
  }

  isSolid(x: number, y: number, z: number): boolean {
    if (!this.inBounds(x, y, z)) return false;
    return this.materials[this.index(x, y, z)] !== VoxelMaterialKind.Empty;
  }

  /**
   * Builds face-culled, corner-AO-shaded mesh buffers grouped by VoxelMaterialKind.
   */
  buildCulledMeshes(enableAO = true): CulledMeshBuffers[] {
    const buckets = new Map<
      VoxelMaterialKind,
      {
        positions: number[];
        normals: number[];
        colors: number[];
        indices: number[];
        faceCount: number;
      }
    >();

    const getBucket = (mat: VoxelMaterialKind) => {
      let b = buckets.get(mat);
      if (!b) {
        b = { positions: [], normals: [], colors: [], indices: [], faceCount: 0 };
        buckets.set(mat, b);
      }
      return b;
    };

    const vs = this.voxelSize;
    const ox = this.originX;
    const oy = this.originY;
    const oz = this.originZ;

    for (let z = 0; z < this.sizeZ; z++) {
      for (let x = 0; x < this.sizeX; x++) {
        const col = x + z * this.sizeX;
        const minY = this.colMinY[col];
        const maxY = this.colMaxY[col];
        if (maxY < minY) continue;

        for (let y = minY; y <= maxY; y++) {
          const idx = this.index(x, y, z);
          const mat = this.materials[idx] as VoxelMaterialKind;
          if (mat === VoxelMaterialKind.Empty) continue;

          const hex = this.colors[idx];
          const baseR = srgbByteToLinear((hex >> 16) & 0xff);
          const baseG = srgbByteToLinear((hex >> 8) & 0xff);
          const baseB = srgbByteToLinear(hex & 0xff);
          const isEmissive = mat === VoxelMaterialKind.LanternGlow;

          const bucket = getBucket(mat);

          for (let f = 0; f < 6; f++) {
            const face = FACES[f];
            const nx = x + face.dir[0];
            const ny = y + face.dir[1];
            const nz = z + face.dir[2];

            // Cull internal faces shared with another solid voxel
            if (this.isSolid(nx, ny, nz)) continue;

            const baseVertex = bucket.positions.length / 3;
            const aoVals: [number, number, number, number] = [1, 1, 1, 1];

            for (let c = 0; c < 4; c++) {
              const corner = face.corners[c];
              bucket.positions.push(
                ox + (x + corner[0]) * vs,
                oy + (y + corner[1]) * vs,
                oz + (z + corner[2]) * vs,
              );
              bucket.normals.push(face.dir[0], face.dir[1], face.dir[2]);

              let shade = isEmissive ? 1.0 : face.faceShade;
              if (enableAO && !isEmissive) {
                const [su, sv] = face.cornerSigns[c];
                const u = face.uAxis;
                const v = face.vAxis;
                const side1 = this.isSolid(
                  nx + u[0] * su,
                  ny + u[1] * su,
                  nz + u[2] * su,
                )
                  ? 1
                  : 0;
                const side2 = this.isSolid(
                  nx + v[0] * sv,
                  ny + v[1] * sv,
                  nz + v[2] * sv,
                )
                  ? 1
                  : 0;
                const diag =
                  side1 && side2
                    ? 1
                    : this.isSolid(
                          nx + u[0] * su + v[0] * sv,
                          ny + u[1] * su + v[1] * sv,
                          nz + u[2] * su + v[2] * sv,
                        )
                      ? 1
                      : 0;
                const occluders = side1 && side2 ? 3 : side1 + side2 + diag;
                const ao = AO_CURVE[occluders];
                aoVals[c] = ao;
                shade *= ao;
              }

              bucket.colors.push(baseR * shade, baseG * shade, baseB * shade);
            }

            // Flip quad diagonal to eliminate AO interpolation artifacts
            if (aoVals[0] + aoVals[2] > aoVals[1] + aoVals[3]) {
              bucket.indices.push(
                baseVertex,
                baseVertex + 1,
                baseVertex + 2,
                baseVertex,
                baseVertex + 2,
                baseVertex + 3,
              );
            } else {
              bucket.indices.push(
                baseVertex + 1,
                baseVertex + 2,
                baseVertex + 3,
                baseVertex + 1,
                baseVertex + 3,
                baseVertex,
              );
            }
            bucket.faceCount++;
          }
        }
      }
    }

    const result: CulledMeshBuffers[] = [];
    for (const [material, b] of buckets.entries()) {
      if (b.faceCount === 0) continue;
      result.push({
        material,
        positions: new Float32Array(b.positions),
        normals: new Float32Array(b.normals),
        colors: new Float32Array(b.colors),
        indices: new Uint32Array(b.indices),
        faceCount: b.faceCount,
      });
    }
    return result;
  }
}
