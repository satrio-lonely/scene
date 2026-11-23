import test from 'node:test';
import assert from 'node:assert/strict';
import { VoxelGrid, VoxelMaterialKind } from './voxelGrid';
import {
  getBenchAnchor,
  getLakeShoreRadius,
  getLanternAnchors,
  getPathCenterRadius,
  GROUND_BASE_Y,
  isPierOpening,
  PATH_SURFACE_Y,
  PIER_ANGLE,
  sampleTerrain,
  WATER_LEVEL_Y,
} from './worldLayout';
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
import { buildGrandLakeTerrainBuffers } from './voxelLandscapeBuilder';
import {
  buildMicroBroadleafTree,
  buildMicroBush,
  buildMicroGrassClump,
  buildMicroLilyPad,
  buildMicroPineTree,
  buildMicroReedCluster,
  buildMicroWildflowerCluster,
  buildMicroWillowTree,
  buildMicroWoodenPier,
} from './microVegetationBuilder';

test('VoxelGrid culls shared internal faces between adjacent voxels', () => {
  const grid = new VoxelGrid(4, 4, 4, 0.1);
  grid.set(1, 1, 1, 0xffffff, VoxelMaterialKind.Stone);
  const single = grid.buildCulledMeshes(false);
  assert.equal(single.length, 1);
  assert.equal(single[0].faceCount, 6);

  grid.set(2, 1, 1, 0xffffff, VoxelMaterialKind.Stone);
  const pair = grid.buildCulledMeshes(false);
  assert.equal(pair[0].faceCount, 10);
});

test('VoxelGrid corner AO darkens concave voxel corners compared to open faces', () => {
  const grid = new VoxelGrid(5, 5, 5, 0.1);
  grid.set(2, 1, 2, 0xffffff, VoxelMaterialKind.Stone);
  grid.set(3, 1, 2, 0xffffff, VoxelMaterialKind.Stone);
  grid.set(3, 2, 2, 0xffffff, VoxelMaterialKind.Stone);

  const buffers = grid.buildCulledMeshes(true);
  const colors = buffers[0].colors;
  let minLum = Infinity;
  let maxLum = -Infinity;
  for (let i = 0; i < colors.length; i += 3) {
    const lum = colors[i];
    if (lum < minLum) minLum = lum;
    if (lum > maxLum) maxLum = lum;
  }
  assert.ok(minLum < maxLum * 0.85, 'Concave voxel corner should be darkened by baked AO');
});

test('colossal lake is 10x larger again (~7,000 m²) with water almost flush with ground & batako promenade', () => {
  const center = sampleTerrain(0, 0);
  assert.equal(center.zone, 'water');
  assert.ok(center.height < WATER_LEVEL_Y - 2.0);

  // Water surface almost flush with ground & batako path (~11-12cm difference)
  assert.ok(
    GROUND_BASE_Y - WATER_LEVEL_Y > 0.05 && GROUND_BASE_Y - WATER_LEVEL_Y <= 0.15,
    `Expected flush ground height, got ${GROUND_BASE_Y}`,
  );
  assert.ok(
    PATH_SURFACE_Y - WATER_LEVEL_Y > 0.05 && PATH_SURFACE_Y - WATER_LEVEL_Y <= 0.15,
    `Expected flush batako path height, got ${PATH_SURFACE_Y}`,
  );

  let radiusSum = 0;
  for (let i = 0; i < 72; i++) {
    const angle = (i / 72) * Math.PI * 2;
    const shoreR = getLakeShoreRadius(angle);
    const pathR = getPathCenterRadius(angle);
    radiusSum += shoreR;
    assert.ok(shoreR > 39.0, `Expected colossal lake shoreR > 39m, got ${shoreR}`);
    assert.ok(pathR > shoreR + 1.4, 'Batako path must remain outside the lake shoreline');

    const px = Math.cos(angle) * pathR;
    const pz = Math.sin(angle) * pathR;
    const sample = sampleTerrain(px, pz);
    assert.ok(
      sample.zone === 'path' || sample.zone === 'overlook',
      `Expected path/overlook at angle ${angle.toFixed(2)}, got ${sample.zone}`,
    );
  }
  const avgR = radiusSum / 72;
  const approxArea = Math.PI * avgR * avgR;
  assert.ok(
    approxArea > 6500,
    `Expected colossal lake area > 6500 m² (~10x previous 700m²), got ${approxArea.toFixed(1)} m²`,
  );

  assert.equal(isPierOpening(PIER_ANGLE), true);
  assert.equal(isPierOpening(PIER_ANGLE + 0.5), false);

  const bench = getBenchAnchor();
  const benchGround = sampleTerrain(bench.x, bench.z);
  assert.equal(benchGround.zone, 'overlook');
  assert.ok(Math.abs(benchGround.height - bench.y) < 0.02);
  assert.equal(getLanternAnchors().length, 12);
});

test('royal luxury bench (1.2cm), smoking long-haired LEGO minifigure (1.0cm), batako road & fence build cleanly', () => {
  const benchGrid = buildMicrovoxelBenchGrid();
  assert.equal(benchGrid.voxelSize, 0.012);
  assert.ok(BENCH_SEAT_TOP_Y > 0.42 && BENCH_SEAT_TOP_Y < 0.5);
  assert.ok(benchGrid.voxelCount > 35000, `Expected opulent luxury bench > 35000 voxels, got ${benchGrid.voxelCount}`);
  const benchMats = new Set(benchGrid.buildCulledMeshes(true).map((m) => m.material));
  assert.ok(benchMats.has(VoxelMaterialKind.Stone), 'Marble pedestals must exist');
  assert.ok(benchMats.has(VoxelMaterialKind.CastIron), 'Bronze frame must exist');
  assert.ok(benchMats.has(VoxelMaterialKind.Wood), 'Mahogany frame must exist');
  assert.ok(benchMats.has(VoxelMaterialKind.Brass), '24k gilded brass filigree & crown must exist');
  assert.ok(benchMats.has(VoxelMaterialKind.TerrainMatte), 'Tufted burgundy velvet cushion must exist');

  const legoGrid = buildMicroLegoCharacterGrid();
  assert.equal(legoGrid.voxelSize, 0.01);
  assert.ok(legoGrid.voxelCount > 25000, `Expected super-detailed LEGO character > 25000 voxels, got ${legoGrid.voxelCount}`);
  const legoMats = new Set(legoGrid.buildCulledMeshes(true).map((m) => m.material));
  assert.ok(legoMats.has(VoxelMaterialKind.Stone), 'LEGO head/torso/legs must exist');
  assert.ok(legoMats.has(VoxelMaterialKind.Wood), 'Long flowing hair locks must exist');
  assert.ok(legoMats.has(VoxelMaterialKind.LanternGlow), 'Glowing cigarette ember tip must exist');
  assert.ok(CIGARETTE_TIP_LOCAL.y > 0.5 && CIGARETTE_TIP_LOCAL.z > 0.3);

  const lanternGrid = buildMicrovoxelLanternGrid();
  assert.equal(lanternGrid.voxelSize, 0.016);
  assert.ok(lanternGrid.voxelCount > 4000);

  const batakoGrid = buildMicroBatakoPathSegment(1);
  assert.equal(batakoGrid.voxelSize, 0.022);
  assert.ok(batakoGrid.voxelCount > 25000);

  const fenceGrid = buildMicroLakesideFenceSegment();
  assert.equal(fenceGrid.voxelSize, 0.016);
  assert.ok(fenceGrid.voxelCount > 2000);

  const bollardGrid = buildMicroBollardPost();
  assert.ok(bollardGrid.voxelCount > 400);

  const terrainBufs = buildGrandLakeTerrainBuffers();
  assert.ok(terrainBufs.triangleCount > 8000);
});

test('super-detailed microvoxel trees, bushes, grass, flowers, reeds, lotus, and flush pier build cleanly', () => {
  const willow = buildMicroWillowTree();
  const pine = buildMicroPineTree();
  const oak = buildMicroBroadleafTree('oak');
  const maple = buildMicroBroadleafTree('maple');
  const bush = buildMicroBush(true, 0xf2c2d4);
  const grass = buildMicroGrassClump();
  const flower = buildMicroWildflowerCluster(0xfaf7ee, 0xf5cc48);
  const reed = buildMicroReedCluster();
  const lotus = buildMicroLilyPad(true, 0xf5a6bd);
  const pier = buildMicroWoodenPier();

  assert.ok(willow.voxelCount > 3000);
  assert.ok(pine.voxelCount > 3000);
  assert.ok(oak.voxelCount > 3000);
  assert.ok(maple.voxelCount > 3000);
  assert.ok(bush.voxelCount > 500);
  assert.ok(grass.voxelCount > 60);
  assert.ok(flower.voxelCount > 80);
  assert.ok(reed.voxelCount > 150);
  assert.ok(lotus.voxelCount > 150);
  assert.ok(pier.voxelCount > 6000);
});
