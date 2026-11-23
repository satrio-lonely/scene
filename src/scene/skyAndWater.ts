import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { SunEnvironmentState } from '../utils/sunMath';
import {
  BreezeState,
  MAX_WATER_RIPPLES,
  WaterRipple,
} from '../utils/waterRipples';

export interface PhotorealisticSkyRig {
  sky: Sky;
  cloudDome: THREE.Mesh;
  update: (sun: SunEnvironmentState, elapsedSec: number, breeze?: BreezeState) => void;
  dispose: () => void;
}

/**
 * Creates a photorealistic sky pairing Three.js Preetham Rayleigh/Mie atmospheric
 * scattering with a sun-lit multi-layer volumetric-style procedural cloud & star dome.
 */
export function createPhotorealisticSkyRig(): PhotorealisticSkyRig {
  const sky = new Sky();
  sky.scale.setScalar(1250);

  const cloudGeo = new THREE.SphereGeometry(820, 48, 32);
  const cloudMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uSunDir: { value: new THREE.Vector3(0, 0.5, -1) },
      uCloudLight: { value: new THREE.Color(0xffffff) },
      uCloudShadow: { value: new THREE.Color(0x88a4c4) },
      uHorizonColor: { value: new THREE.Color(0xdbe8f4) },
      uStarVisibility: { value: 0 },
      uWindSpeed: { value: 1.0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorldDir;
      void main() {
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldDir = normalize(worldPos.xyz);
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uSunDir;
      uniform vec3 uCloudLight;
      uniform vec3 uCloudShadow;
      uniform vec3 uHorizonColor;
      uniform float uStarVisibility;
      uniform float uWindSpeed;

      varying vec3 vWorldDir;

      float hash(vec2 p) {
        p = fract(p * vec2(123.34, 456.21));
        p += dot(p, p + 45.32);
        return fract(p.x * p.y);
      }

      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        float a = hash(i);
        float b = hash(i + vec2(1.0, 0.0));
        float c = hash(i + vec2(0.0, 1.0));
        float d = hash(i + vec2(1.0, 1.0));
        return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
      }

      float fbm(vec2 p) {
        float v = 0.0;
        float a = 0.5;
        mat2 rot = mat2(0.80, -0.60, 0.60, 0.80);
        for (int i = 0; i < 5; i++) {
          v += a * noise(p);
          p = rot * p * 2.04 + vec2(17.1, 31.7);
          a *= 0.5;
        }
        return v;
      }

      void main() {
        vec3 dir = normalize(vWorldDir);
        if (dir.y < -0.02) {
          discard;
        }

        float projY = max(dir.y, 0.045);
        vec2 skyUv = dir.xz / (projY + 0.16);

        float tDrift = uTime * (0.65 + uWindSpeed * 0.55);
        vec2 drift1 = vec2(tDrift * 0.011, tDrift * 0.004);
        vec2 drift2 = vec2(-tDrift * 0.006, tDrift * 0.008);

        // Layer 1: Sculpted multi-octave cumulus banks
        float baseShape = fbm(skyUv * 0.56 + drift1);
        float detail = fbm(skyUv * 1.85 + drift2 + baseShape * 0.65);
        float cumulus = smoothstep(0.41, 0.77, baseShape * 0.68 + detail * 0.42);

        // Layer 2: High wispy cirrus streaks
        float cirrusRaw = fbm(skyUv * vec2(1.05, 2.3) + drift1 * 0.5 + 4.3);
        float cirrus = smoothstep(0.55, 0.84, cirrusRaw) * 0.48;

        float cloudDensity = clamp(cumulus + cirrus * (1.0 - cumulus * 0.55), 0.0, 1.0);

        // Directional sun-facing silver-gold cloud rims
        vec2 sunStep = normalize(uSunDir.xz + vec2(0.0001)) * 0.22;
        float towardSun = fbm((skyUv + sunStep) * 0.56 + drift1);
        float selfLit = clamp(0.52 + (baseShape - towardSun) * 2.55, 0.0, 1.0);

        float sunCos = max(dot(dir, normalize(uSunDir)), 0.0);
        float silverLining = pow(sunCos, 8.0) * 0.7 + pow(sunCos, 36.0) * 0.9;

        vec3 cloudCol = mix(uCloudShadow, uCloudLight, clamp(selfLit * 0.86 + 0.14, 0.0, 1.0));
        cloudCol += uCloudLight * silverLining * (0.45 + 0.55 * (1.0 - cumulus));

        float horizonFade = smoothstep(0.005, 0.18, dir.y);
        cloudCol = mix(uHorizonColor, cloudCol, smoothstep(0.015, 0.26, dir.y));

        float alpha = cloudDensity * horizonFade * 0.94;

        // Visible luminous solar disk & corona
        float sunDisk = smoothstep(0.99915, 0.99975, sunCos) * smoothstep(-0.02, 0.04, uSunDir.y);
        float sunHalo = pow(sunCos, 90.0) * 0.65 * smoothstep(-0.03, 0.08, uSunDir.y);
        vec3 sunBoost = uCloudLight * (sunDisk * 2.4 + sunHalo) * (1.0 - cumulus * 0.72);

        vec3 finalCol = cloudCol + sunBoost;
        alpha = max(alpha, clamp((sunDisk + sunHalo * 0.6) * (1.0 - cumulus * 0.65), 0.0, 1.0));

        // Crisp twilight stars
        if (uStarVisibility > 0.01) {
          vec2 starGrid = floor(dir.xz / (dir.y + 0.35) * 145.0);
          float starRand = hash(starGrid);
          float star = step(0.9965, starRand) * smoothstep(0.14, 0.55, dir.y) * uStarVisibility * (1.0 - alpha);
          finalCol = mix(finalCol, vec3(0.96, 0.98, 1.0), clamp(star, 0.0, 1.0));
          alpha = max(alpha, star * 0.9);
        }

        if (alpha < 0.004) discard;
        gl_FragColor = vec4(finalCol, clamp(alpha, 0.0, 1.0));
      }
    `,
  });

  const cloudDome = new THREE.Mesh(cloudGeo, cloudMat);
  cloudDome.renderOrder = -1;
  cloudDome.frustumCulled = false;

  const sunVec = new THREE.Vector3();

  const update = (sun: SunEnvironmentState, elapsedSec: number, breeze?: BreezeState) => {
    const uniforms = sky.material.uniforms;
    uniforms['turbidity'].value = sun.skyTurbidity;
    uniforms['rayleigh'].value = sun.skyRayleigh;
    uniforms['mieCoefficient'].value = sun.skyMieCoefficient;
    uniforms['mieDirectionalG'].value = sun.skyMieDirectionalG;

    sunVec.set(sun.sunDirection.x, sun.sunDirection.y, sun.sunDirection.z);
    uniforms['sunPosition'].value.copy(sunVec);

    cloudMat.uniforms.uTime.value = elapsedSec;
    cloudMat.uniforms.uSunDir.value.copy(sunVec);
    cloudMat.uniforms.uCloudLight.value.setRGB(
      sun.cloudLightColor.r,
      sun.cloudLightColor.g,
      sun.cloudLightColor.b,
    );
    cloudMat.uniforms.uCloudShadow.value.setRGB(
      sun.cloudShadowColor.r,
      sun.cloudShadowColor.g,
      sun.cloudShadowColor.b,
    );
    cloudMat.uniforms.uHorizonColor.value.setRGB(
      sun.skyHorizonColor.r,
      sun.skyHorizonColor.g,
      sun.skyHorizonColor.b,
    );
    cloudMat.uniforms.uStarVisibility.value = sun.starVisibility;
    cloudMat.uniforms.uWindSpeed.value = breeze ? breeze.waveSpeed : 1.0;
  };

  const dispose = () => {
    sky.geometry.dispose();
    (sky.material as THREE.Material).dispose();
    cloudGeo.dispose();
    cloudMat.dispose();
  };

  return { sky, cloudDome, update, dispose };
}

export interface LakeWaterRig {
  mesh: THREE.Mesh;
  update: (
    sun: SunEnvironmentState,
    elapsedSec: number,
    breeze: BreezeState,
    ripples: readonly WaterRipple[],
  ) => void;
  dispose: () => void;
}

/**
 * Interactive, photorealistically reflective micro-voxel lake water surface:
 * - Up to 8 simultaneous interactive expanding concentric ripples (click/drag + ambient drops)
 * - Breeze-driven directional capillary waves & subtle micro-voxel quantized shimmer facets
 * - Realistic Schlick Fresnel reflections of sky zenith, horizon, drifting clouds, solar disk,
 *   and shaded lakeside foliage bounce along the shore perimeter
 * - Depth-based crystal transparency showing the microvoxel lakebed & pebbles underneath
 */
export function createLakeWaterRig(): LakeWaterRig {
  const geometry = new THREE.CircleGeometry(58.5, 160);
  geometry.rotateX(-Math.PI / 2);

  const rippleUniforms: THREE.Vector4[] = Array.from(
    { length: MAX_WATER_RIPPLES },
    () => new THREE.Vector4(0, 0, -100, 0),
  );

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uSunDir: { value: new THREE.Vector3(0.4, 0.4, -0.8) },
      uSunColor: { value: new THREE.Color(0xfff1d6) },
      uSunIntensity: { value: 3.4 },
      uDeepColor: { value: new THREE.Color(0x0d3b52) },
      uShallowColor: { value: new THREE.Color(0x278e8a) },
      uSkyZenith: { value: new THREE.Color(0x1359b8) },
      uSkyHorizon: { value: new THREE.Color(0xc2e2fc) },
      uCloudLight: { value: new THREE.Color(0xffffff) },
      uCloudShadow: { value: new THREE.Color(0x7c9cbe) },
      uFogColor: { value: new THREE.Color(0xb9daf7) },
      uFogDensity: { value: 0.005 },
      uWindStrength: { value: 0.35 },
      uWaveSpeed: { value: 0.95 },
      uWaveAmp: { value: 0.01 },
      uNormalStrength: { value: 0.55 },
      uRipples: { value: rippleUniforms },
    },
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform float uWaveSpeed;
      uniform float uWaveAmp;

      varying vec3 vWorldPos;

      void main() {
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        float t = uTime * uWaveSpeed;
        float w1 = sin(worldPos.x * 2.2 + t * 1.15) * cos(worldPos.z * 1.9 - t * 0.85);
        float w2 = sin((worldPos.x * 0.85 - worldPos.z * 0.72) * 4.1 + t * 1.65);
        worldPos.y += (w1 * 0.62 + w2 * 0.38) * uWaveAmp;

        vWorldPos = worldPos.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uSunDir;
      uniform vec3 uSunColor;
      uniform float uSunIntensity;
      uniform vec3 uDeepColor;
      uniform vec3 uShallowColor;
      uniform vec3 uSkyZenith;
      uniform vec3 uSkyHorizon;
      uniform vec3 uCloudLight;
      uniform vec3 uCloudShadow;
      uniform vec3 uFogColor;
      uniform float uFogDensity;
      uniform float uWindStrength;
      uniform float uWaveSpeed;
      uniform float uNormalStrength;
      uniform vec4 uRipples[${MAX_WATER_RIPPLES}];

      varying vec3 vWorldPos;

      float getLakeShoreRadius(float angle) {
        return 47.5
          + 4.8 * cos(angle * 2.0 - 0.55)
          + 2.6 * sin(angle * 3.0 + 0.4)
          + 1.2 * cos(angle * 4.0 + 1.2);
      }

      float hash2(vec2 p) {
        p = fract(p * vec2(123.34, 456.21));
        p += dot(p, p + 45.32);
        return fract(p.x * p.y);
      }

      float vnoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(hash2(i), hash2(i + vec2(1.0, 0.0)), u.x),
          mix(hash2(i + vec2(0.0, 1.0)), hash2(i + vec2(1.0, 1.0)), u.x),
          u.y
        );
      }

      float cloudFbm(vec2 p) {
        float v = 0.0;
        float a = 0.5;
        mat2 rot = mat2(0.80, -0.60, 0.60, 0.80);
        for (int i = 0; i < 3; i++) {
          v += a * vnoise(p);
          p = rot * p * 2.02 + vec2(11.3, 21.7);
          a *= 0.5;
        }
        return v;
      }

      // Breeze-driven directional swells + fine micro-voxelized capillary facets
      float breezeHeight(vec2 p, float t) {
        // Gentle directional wind gusts blowing across the lake
        vec2 windDir = normalize(vec2(0.82, 0.57));
        float gust = 0.65 + 0.35 * sin(dot(p, windDir) * 0.7 - t * 0.9);

        float h = 0.0;
        h += sin(dot(p, vec2(2.9, 1.4)) + t * 1.45 + sin(p.y * 2.1 - t * 0.8)) * 0.34;
        h += sin(dot(p, vec2(-1.7, 3.8)) - t * 1.75 + cos(p.x * 2.8 + t * 1.0)) * 0.26;
        h += sin((p.x * 5.6 + p.y * 4.4) + t * 2.4) * 0.14 * gust;
        h += cos((p.x * 9.8 - p.y * 8.9) - t * 3.1) * 0.08 * gust;

        // Subtle super-detailed micro-voxel shimmer cell (4.0cm grid) preserving ultra-fine diorama identity
        vec2 q = floor(p / 0.04) * 0.04;
        float microCell = sin(q.x * 16.0 + q.y * 14.0 + t * 2.2) * 0.028;

        return (h * uNormalStrength) + microCell * (0.45 + 0.55 * uWindStrength);
      }

      // Interactive expanding concentric ring ripples from user clicks & ambient drops
      float interactiveRipplesHeight(vec2 p) {
        float sum = 0.0;
        for (int i = 0; i < ${MAX_WATER_RIPPLES}; i++) {
          vec4 rip = uRipples[i];
          if (rip.w <= 0.001) continue;
          float age = uTime - rip.z;
          if (age < 0.0 || age > 5.5) continue;

          float dist = length(p - rip.xy);
          float waveRadius = age * 1.55;
          float delta = dist - waveRadius;
          float envelope = exp(-delta * delta * 2.2) * exp(-age * 0.62);
          sum += sin(delta * 13.5) * envelope * rip.w;
        }
        return sum * 0.85;
      }

      void main() {
        float r = length(vWorldPos.xz);
        float ang = atan(vWorldPos.z, vWorldPos.x);
        float shoreR = getLakeShoreRadius(ang);

        float edgeDist = shoreR - r;
        if (edgeDist < -0.28) discard;

        float t = uTime * uWaveSpeed;
        float eps = 0.038;

        // Combine breeze capillary ripples + interactive expanding rings into crisp surface normal
        vec2 p = vWorldPos.xz;
        float h0 = breezeHeight(p, t) + interactiveRipplesHeight(p);
        float hx = breezeHeight(p + vec2(eps, 0.0), t) + interactiveRipplesHeight(p + vec2(eps, 0.0));
        float hz = breezeHeight(p + vec2(0.0, eps), t) + interactiveRipplesHeight(p + vec2(0.0, eps));

        // Gently attenuate waves right at the sheltered shore edge
        float shoreCalm = smoothstep(0.0, 0.65, max(edgeDist, 0.0));
        float slopeScale = mix(0.32, 0.72, shoreCalm);
        vec3 N = normalize(vec3((h0 - hx) * slopeScale, 1.0, (h0 - hz) * slopeScale));

        vec3 V = normalize(cameraPosition - vWorldPos);
        vec3 L = normalize(uSunDir);

        // Physically-based Schlick Fresnel
        float NdotV = max(dot(N, V), 0.0);
        float fresnel = 0.035 + 0.965 * pow(1.0 - NdotV, 4.4);

        // Reflect view ray into the live procedural sky + clouds
        vec3 R = reflect(-V, N);
        float skyElev = clamp(R.y, 0.0, 1.0);
        vec3 reflectedSky = mix(uSkyHorizon, uSkyZenith, pow(skyElev, 0.62));

        // Project reflected ray onto cloud dome so drifting sunlit clouds mirror on the lake!
        vec2 reflSkyUv = R.xz / (max(R.y, 0.08) + 0.16);
        float cDrift = uTime * (0.65 + uWaveSpeed * 0.55);
        float reflCloud = smoothstep(0.45, 0.78, cloudFbm(reflSkyUv * 0.58 + vec2(cDrift * 0.011, cDrift * 0.004)));
        vec3 reflCloudCol = mix(uCloudShadow, uCloudLight, 0.72);
        reflectedSky = mix(reflectedSky, reflCloudCol, reflCloud * smoothstep(0.03, 0.25, skyElev) * 0.75);

        // Reflected atmospheric glow & solar disk shimmer on the water
        float reflectSunCos = max(dot(R, L), 0.0);
        float sunAbove = smoothstep(-0.02, 0.12, L.y);
        float sunDiskRefl = smoothstep(0.9965, 0.9994, reflectSunCos) * 2.2;
        float sunCoronaRefl = pow(reflectSunCos, 16.0) * 0.55;
        reflectedSky += uSunColor * (sunDiskRefl + sunCoronaRefl) * sunAbove * clamp(uSunIntensity * 0.42, 0.15, 1.45);

        // Natural reflected lakeside canopy & embankment silhouette darkening near the rim
        float rimShadow = 1.0 - smoothstep(0.0, 6.2, max(edgeDist, 0.0));
        vec3 canopyTint = mix(uDeepColor * 0.72, vec3(0.11, 0.22, 0.14), 0.52);
        reflectedSky = mix(reflectedSky, canopyTint, rimShadow * 0.42);

        // Depth-tinted clear water body (crystal teal shallows -> vast deep sapphire-emerald basin)
        float depthT = smoothstep(0.0, 14.5, max(edgeDist, 0.0));
        vec3 waterBody = mix(uShallowColor, uDeepColor, depthT);

        // Sunlit underwater caustics dancing on shallow sandy shore
        float causticWave = sin(p.x * 4.8 + t * 1.1) * cos(p.y * 5.1 - t * 1.3) * 0.5 + 0.5;
        float caustic = smoothstep(0.42, 0.94, causticWave);
        waterBody += uSunColor * caustic * (1.0 - depthT) * 0.15 * sunAbove * clamp(uSunIntensity * 0.3, 0.0, 1.0);

        // Combine water transmission & Fresnel sky reflection
        float reflectWeight = clamp(fresnel * 0.96 + 0.16, 0.0, 0.96);
        vec3 color = mix(waterBody, reflectedSky, reflectWeight);

        // Crisp Blinn-Phong sun glitter trail across wind ripples & interactive concentric rings
        vec3 H = normalize(L + V);
        float NdotH = max(dot(N, H), 0.0);
        float specTight = pow(NdotH, mix(460.0, 210.0, uWindStrength)) * 3.1;
        float specBroad = pow(NdotH, 42.0) * 0.34;
        color += uSunColor * (specTight + specBroad) * sunAbove * clamp(uSunIntensity * 0.48, 0.2, 1.4);

        // Delicate specular ring crest highlight on active interactive ripples
        float ripCrest = abs(interactiveRipplesHeight(p));
        color += mix(uSkyHorizon, uSunColor, 0.5) * smoothstep(0.08, 0.38, ripCrest) * 0.34;

        // Soft shoreline meniscus & micro-foam kissing the flush concrete coping
        float shoreLine = smoothstep(0.28, 0.0, abs(edgeDist - 0.03));
        float foamBreak = smoothstep(0.22, 0.78, sin(ang * 72.0 + t * 1.6) * 0.5 + 0.5);
        color = mix(color, mix(uSkyHorizon, vec3(0.95, 0.98, 1.0), 0.55), shoreLine * (0.28 + 0.26 * foamBreak));

        // Exponential distance fog synced with scene.fog
        float camDist = length(cameraPosition - vWorldPos);
        float fogFactor = 1.0 - exp(-uFogDensity * uFogDensity * camDist * camDist);
        color = mix(color, uFogColor, clamp(fogFactor, 0.0, 1.0));

        // Shallow water stays translucent so micro-pebbles & sandy shelf shine through near the coping
        float alpha = mix(0.56, 0.93, depthT);
        alpha = max(alpha, fresnel * 0.88);
        alpha *= smoothstep(-0.24, 0.04, edgeDist);

        gl_FragColor = vec4(color, clamp(alpha, 0.0, 0.96));
      }
    `,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = 0.015;
  mesh.renderOrder = 2;

  const update = (
    sun: SunEnvironmentState,
    elapsedSec: number,
    breeze: BreezeState,
    ripples: readonly WaterRipple[],
  ) => {
    material.uniforms.uTime.value = elapsedSec;
    material.uniforms.uSunDir.value.set(
      sun.sunDirection.x,
      sun.sunDirection.y,
      sun.sunDirection.z,
    );
    material.uniforms.uSunColor.value.setRGB(
      sun.sunColor.r,
      sun.sunColor.g,
      sun.sunColor.b,
    );
    material.uniforms.uSunIntensity.value = sun.sunIntensity;
    material.uniforms.uDeepColor.value.setRGB(
      sun.waterDeepColor.r,
      sun.waterDeepColor.g,
      sun.waterDeepColor.b,
    );
    material.uniforms.uShallowColor.value.setRGB(
      sun.waterShallowColor.r,
      sun.waterShallowColor.g,
      sun.waterShallowColor.b,
    );
    material.uniforms.uSkyZenith.value.setRGB(
      sun.skyZenithColor.r,
      sun.skyZenithColor.g,
      sun.skyZenithColor.b,
    );
    material.uniforms.uSkyHorizon.value.setRGB(
      sun.skyHorizonColor.r,
      sun.skyHorizonColor.g,
      sun.skyHorizonColor.b,
    );
    material.uniforms.uCloudLight.value.setRGB(
      sun.cloudLightColor.r,
      sun.cloudLightColor.g,
      sun.cloudLightColor.b,
    );
    material.uniforms.uCloudShadow.value.setRGB(
      sun.cloudShadowColor.r,
      sun.cloudShadowColor.g,
      sun.cloudShadowColor.b,
    );
    material.uniforms.uFogColor.value.setRGB(
      sun.fogColor.r,
      sun.fogColor.g,
      sun.fogColor.b,
    );
    material.uniforms.uFogDensity.value = sun.fogDensity;

    material.uniforms.uWindStrength.value = breeze.strength;
    material.uniforms.uWaveSpeed.value = breeze.waveSpeed;
    material.uniforms.uWaveAmp.value = breeze.waveAmplitude;
    material.uniforms.uNormalStrength.value = breeze.normalStrength;

    for (let i = 0; i < MAX_WATER_RIPPLES; i++) {
      const r = ripples[i];
      if (r) {
        rippleUniforms[i].set(r.x, r.z, r.startTime, r.strength);
      }
    }
  };

  const dispose = () => {
    geometry.dispose();
    material.dispose();
  };

  return { mesh, update, dispose };
}
