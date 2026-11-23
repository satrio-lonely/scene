export type SunPresetId = 'fajar' | 'pagi' | 'siang' | 'senja' | 'magrib';

export interface SunPreset {
  id: SunPresetId;
  label: string;
  elevation: number;
  azimuth: number;
}

export const SUN_PRESETS: readonly SunPreset[] = [
  { id: 'fajar', label: 'Fajar', elevation: 6, azimuth: 78 },
  { id: 'pagi', label: 'Pagi', elevation: 26, azimuth: 112 },
  { id: 'siang', label: 'Siang', elevation: 64, azimuth: 162 },
  { id: 'senja', label: 'Senja', elevation: 12, azimuth: 252 },
  { id: 'magrib', label: 'Magrib', elevation: 1.5, azimuth: 276 },
] as const;

export const DEFAULT_SUN_ELEVATION = 22;
export const DEFAULT_SUN_AZIMUTH = 236;

export interface Vec3Tuple {
  x: number;
  y: number;
  z: number;
}

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export interface SunEnvironmentState {
  elevationDeg: number;
  azimuthDeg: number;
  sunDirection: Vec3Tuple;
  sunLightPosition: Vec3Tuple;
  sunColor: RGB;
  sunIntensity: number;
  hemiSkyColor: RGB;
  hemiGroundColor: RGB;
  hemiIntensity: number;
  fogColor: RGB;
  fogDensity: number;
  skyTurbidity: number;
  skyRayleigh: number;
  skyMieCoefficient: number;
  skyMieDirectionalG: number;
  skyZenithColor: RGB;
  skyHorizonColor: RGB;
  cloudLightColor: RGB;
  cloudShadowColor: RGB;
  waterDeepColor: RGB;
  waterShallowColor: RGB;
  waterReflectColor: RGB;
  lanternIntensity: number;
  starVisibility: number;
  exposure: number;
  environmentIntensity: number;
  phaseLabel: string;
  compassLabel: string;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpRGB(a: RGB, b: RGB, t: number): RGB {
  const k = clamp(t, 0, 1);
  return {
    r: lerp(a.r, b.r, k),
    g: lerp(a.g, b.g, k),
    b: lerp(a.b, b.b, k),
  };
}

function hexToRGB(hex: number): RGB {
  return {
    r: ((hex >> 16) & 0xff) / 255,
    g: ((hex >> 8) & 0xff) / 255,
    b: (hex & 0xff) / 255,
  };
}

export function normalizeAzimuth(deg: number): number {
  const m = ((deg % 360) + 360) % 360;
  return m;
}

export function getCompassLabel(azimuthDeg: number): string {
  const norm = normalizeAzimuth(azimuthDeg);
  const dirs = ['U', 'TL', 'T', 'TG', 'S', 'BD', 'B', 'BL'];
  const idx = Math.round(norm / 45) % 8;
  return dirs[idx];
}

export function getSolarPhaseLabel(elevationDeg: number, azimuthDeg: number): string {
  const az = normalizeAzimuth(azimuthDeg);
  const isMorningSide = az < 180;
  if (elevationDeg < 0.5) return 'Senja Gelap';
  if (elevationDeg < 6) return isMorningSide ? 'Fajar Menyingsing' : 'Magrib';
  if (elevationDeg < 18) return isMorningSide ? 'Pagi Emas' : 'Senja Emas';
  if (elevationDeg < 42) return isMorningSide ? 'Pagi Cerah' : 'Sore Cerah';
  return 'Siang Terik';
}

const C_SUN_TWILIGHT = hexToRGB(0xff6b35);
const C_SUN_GOLDEN = hexToRGB(0xffb56b);
const C_SUN_DAY = hexToRGB(0xfff5e4);

const C_HEMI_SKY_TWILIGHT = hexToRGB(0x22365c);
const C_HEMI_SKY_GOLDEN = hexToRGB(0x6b9bd2);
const C_HEMI_SKY_DAY = hexToRGB(0x7cb8f2);

const C_HEMI_GND_TWILIGHT = hexToRGB(0x161c26);
const C_HEMI_GND_GOLDEN = hexToRGB(0x3a3228);
const C_HEMI_GND_DAY = hexToRGB(0x364730);

const C_FOG_TWILIGHT = hexToRGB(0x3c3450);
const C_FOG_GOLDEN = hexToRGB(0xdfb28b);
const C_FOG_DAY = hexToRGB(0xb9daf7);

const C_ZENITH_TWILIGHT = hexToRGB(0x0d1a3a);
const C_ZENITH_GOLDEN = hexToRGB(0x1c4e94);
const C_ZENITH_DAY = hexToRGB(0x1359b8);

const C_HORIZON_TWILIGHT = hexToRGB(0xd9623f);
const C_HORIZON_GOLDEN = hexToRGB(0xf7b06d);
const C_HORIZON_DAY = hexToRGB(0xc2e2fc);

const C_CLOUD_LIGHT_TWILIGHT = hexToRGB(0xff945e);
const C_CLOUD_LIGHT_GOLDEN = hexToRGB(0xffe1b5);
const C_CLOUD_LIGHT_DAY = hexToRGB(0xffffff);

const C_CLOUD_SHADOW_TWILIGHT = hexToRGB(0x282a4a);
const C_CLOUD_SHADOW_GOLDEN = hexToRGB(0x696d8f);
const C_CLOUD_SHADOW_DAY = hexToRGB(0x7c9cbe);

const C_WATER_DEEP_TWILIGHT = hexToRGB(0x0b1c2d);
const C_WATER_DEEP_DAY = hexToRGB(0x0d4561);

const C_WATER_SHALLOW_TWILIGHT = hexToRGB(0x1e4754);
const C_WATER_SHALLOW_DAY = hexToRGB(0x278e8a);

/**
 * Pure physically-inspired lighting & atmospheric solver from solar elevation & azimuth.
 * Azimuth: 0° = North (-Z), 90° = East (+X), 180° = South (+Z), 270° = West (-X).
 */
export function computeSunState(
  elevationDegRaw: number,
  azimuthDegRaw: number,
  sunDistance = 30,
): SunEnvironmentState {
  const elevationDeg = clamp(elevationDegRaw, -3, 85);
  const azimuthDeg = normalizeAzimuth(azimuthDegRaw);

  const phi = ((90 - elevationDeg) * Math.PI) / 180;
  const theta = (azimuthDeg * Math.PI) / 180;

  // Spherical to Cartesian with Y-up, North = -Z, East = +X
  const sinPhi = Math.sin(phi);
  const x = sinPhi * Math.sin(theta);
  const y = Math.cos(phi);
  const z = -sinPhi * Math.cos(theta);

  const len = Math.hypot(x, y, z) || 1;
  const sunDirection: Vec3Tuple = { x: x / len, y: y / len, z: z / len };

  // Keep directional shadow caster slightly above horizon so grazing shadows stay crisp
  const effectiveElev = Math.max(elevationDeg, 4.5);
  const lightPhi = ((90 - effectiveElev) * Math.PI) / 180;
  const lightSinPhi = Math.sin(lightPhi);
  const sunLightPosition: Vec3Tuple = {
    x: lightSinPhi * Math.sin(theta) * sunDistance,
    y: Math.cos(lightPhi) * sunDistance,
    z: -lightSinPhi * Math.cos(theta) * sunDistance,
  };

  // Blend factors
  const goldenT = smoothstep(-2, 14, elevationDeg);
  const dayT = smoothstep(12, 42, elevationDeg);
  const horizonGlow = 1 - smoothstep(2, 26, elevationDeg);

  const sunColor = lerpRGB(
    lerpRGB(C_SUN_TWILIGHT, C_SUN_GOLDEN, goldenT),
    C_SUN_DAY,
    dayT,
  );

  // Strong directional sun key vs restrained cool hemisphere fill for unmistakable real-time shadows
  const aboveHorizon = smoothstep(-2.5, 8, elevationDeg);
  const sunIntensity = lerp(0.22, 4.1, aboveHorizon) * lerp(0.86, 1.0, dayT);

  const hemiSkyColor = lerpRGB(
    lerpRGB(C_HEMI_SKY_TWILIGHT, C_HEMI_SKY_GOLDEN, goldenT),
    C_HEMI_SKY_DAY,
    dayT,
  );
  const hemiGroundColor = lerpRGB(
    lerpRGB(C_HEMI_GND_TWILIGHT, C_HEMI_GND_GOLDEN, goldenT),
    C_HEMI_GND_DAY,
    dayT,
  );
  const hemiIntensity = lerp(0.24, 0.52, smoothstep(-3, 25, elevationDeg));

  const fogColor = lerpRGB(
    lerpRGB(C_FOG_TWILIGHT, C_FOG_GOLDEN, goldenT),
    C_FOG_DAY,
    dayT,
  );
  const fogDensity = lerp(0.0021, 0.00095, dayT);

  const skyZenithColor = lerpRGB(
    lerpRGB(C_ZENITH_TWILIGHT, C_ZENITH_GOLDEN, goldenT),
    C_ZENITH_DAY,
    dayT,
  );
  const skyHorizonColor = lerpRGB(
    lerpRGB(C_HORIZON_TWILIGHT, C_HORIZON_GOLDEN, goldenT),
    C_HORIZON_DAY,
    dayT,
  );

  const cloudLightColor = lerpRGB(
    lerpRGB(C_CLOUD_LIGHT_TWILIGHT, C_CLOUD_LIGHT_GOLDEN, goldenT),
    C_CLOUD_LIGHT_DAY,
    dayT,
  );
  const cloudShadowColor = lerpRGB(
    lerpRGB(C_CLOUD_SHADOW_TWILIGHT, C_CLOUD_SHADOW_GOLDEN, goldenT),
    C_CLOUD_SHADOW_DAY,
    dayT,
  );

  const waterDeepColor = lerpRGB(C_WATER_DEEP_TWILIGHT, C_WATER_DEEP_DAY, smoothstep(-1, 28, elevationDeg));
  const waterShallowColor = lerpRGB(C_WATER_SHALLOW_TWILIGHT, C_WATER_SHALLOW_DAY, smoothstep(-1, 28, elevationDeg));
  const waterReflectColor = lerpRGB(skyHorizonColor, skyZenithColor, 0.42);

  // Preetham Sky parameters tuned for crisp deep blue sky & glowing golden horizons
  const skyTurbidity = lerp(1.8, 6.2, horizonGlow);
  const skyRayleigh = lerp(1.45, 3.1, horizonGlow);
  const skyMieCoefficient = lerp(0.003, 0.0085, horizonGlow);
  const skyMieDirectionalG = lerp(0.82, 0.91, horizonGlow);

  // Lakeside vintage lantern glows warmly during golden hour & twilight
  const lanternIntensity = (1 - smoothstep(4, 17, elevationDeg)) * 3.8;
  const starVisibility = 1 - smoothstep(-2, 7.5, elevationDeg);
  const exposure = lerp(0.82, 1.04, smoothstep(-2, 22, elevationDeg));
  const environmentIntensity = lerp(0.18, 0.36, smoothstep(-2, 28, elevationDeg));

  return {
    elevationDeg,
    azimuthDeg,
    sunDirection,
    sunLightPosition,
    sunColor,
    sunIntensity,
    hemiSkyColor,
    hemiGroundColor,
    hemiIntensity,
    fogColor,
    fogDensity,
    skyTurbidity,
    skyRayleigh,
    skyMieCoefficient,
    skyMieDirectionalG,
    skyZenithColor,
    skyHorizonColor,
    cloudLightColor,
    cloudShadowColor,
    waterDeepColor,
    waterShallowColor,
    waterReflectColor,
    lanternIntensity,
    starVisibility,
    exposure,
    environmentIntensity,
    phaseLabel: getSolarPhaseLabel(elevationDeg, azimuthDeg),
    compassLabel: getCompassLabel(azimuthDeg),
  };
}
