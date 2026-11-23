import { BENCH_ANGLE, getBenchAnchor, getLakeShoreRadius } from './worldLayout';

export type CameraPresetId = 'panorama' | 'bangku' | 'tepi' | 'atas';

export interface CameraPreset {
  id: CameraPresetId;
  label: string;
  position: [number, number, number];
  target: [number, number, number];
}

export function getCameraPresets(): readonly CameraPreset[] {
  const bench = getBenchAnchor();
  const bx = bench.x;
  const bz = bench.z;
  const by = bench.y;

  // Outward radial & tangent basis vectors at the SE lakeside luxury bench promenade
  const radX = Math.cos(BENCH_ANGLE);
  const radZ = Math.sin(BENCH_ANGLE);
  const tanX = -Math.sin(BENCH_ANGLE);
  const tanZ = Math.cos(BENCH_ANGLE);

  // Pedestrian promenade stroll further along the sweeping batako curve
  const walkAng = BENCH_ANGLE + 0.14;
  const walkR = getLakeShoreRadius(walkAng) + 1.38;
  const wx = Math.cos(walkAng) * walkR;
  const wz = Math.sin(walkAng) * walkR;

  return [
    {
      id: 'panorama',
      label: 'Panorama',
      // Sweeping SE lakeside vista framing the FULL luxury bench + seated smoking LEGO character
      // cleanly above the dock, the curving batako road & lakeside fence, and the COLOSSAL 95m lake!
      position: [bx + radX * 5.2 - tanX * 4.4, by + 2.85, bz + radZ * 5.2 - tanZ * 4.4],
      target: [bx - radX * 9.5 + tanX * 1.4, by + 1.05, bz - radZ * 9.5 + tanZ * 1.4],
    },
    {
      id: 'bangku',
      label: 'Bangku',
      // Collector-grade 3/4 front-side hero close-up showcasing the long-haired smoking LEGO character,
      // rising smoke wisps, gilded marble & tufted burgundy velvet luxury bench, 2.2cm batako bricks, & fence!
      position: [bx - radX * 1.65 - tanX * 1.75, by + 1.32, bz - radZ * 1.65 - tanZ * 1.75],
      target: [bx - radX * 0.05 + tanX * 0.08, by + 0.86, bz - radZ * 0.05 + tanZ * 0.08],
    },
    {
      id: 'tepi',
      label: 'Tepi Danau',
      // Pedestrian eye-level stroll along the batako road & lakeside fence looking across the colossal lake
      position: [wx, by + 1.55, wz],
      target: [bx - radX * 3.5, by + 1.0, bz - radZ * 3.5],
    },
    {
      id: 'atas',
      label: 'Atas',
      // Monumental aerial view capturing the ENTIRE 10x wider (~95m) lake encircled 360° by batako road & fence!
      position: [4.0, 114.0, 86.0],
      target: [0, 0.1, 0],
    },
  ] as const;
}
