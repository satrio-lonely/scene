/**
 * Pure interactive water ripple ring-buffer and breeze/wind parameter solver.
 * Feeds up to MAX_WATER_RIPPLES expanding concentric wave rings directly into
 * the lake water GLSL shader with zero per-frame garbage collection.
 */

export const MAX_WATER_RIPPLES = 8;

export interface WaterRipple {
  x: number;
  z: number;
  startTime: number;
  strength: number;
}

export interface BreezeState {
  strength: number; // 0 (calm) .. 1 (breezy)
  label: string;
  waveSpeed: number;
  waveAmplitude: number;
  normalStrength: number;
  foliageSwayAmplitude: number;
  foliageSwaySpeed: number;
}

export function clampWindStrength(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0.35));
}

export function computeBreezeState(rawStrength: number): BreezeState {
  const strength = clampWindStrength(rawStrength);
  let label = 'Sepoi';
  if (strength < 0.18) label = 'Tenang';
  else if (strength < 0.55) label = 'Sepoi';
  else if (strength < 0.82) label = 'Sedang';
  else label = 'Berangin';

  return {
    strength,
    label,
    waveSpeed: 0.45 + strength * 1.45,
    waveAmplitude: 0.004 + strength * 0.018,
    normalStrength: 0.28 + strength * 0.72,
    foliageSwayAmplitude: 0.008 + strength * 0.042,
    foliageSwaySpeed: 1.1 + strength * 2.2,
  };
}

/**
 * Computes the analytic displacement of a single expanding water ripple at (x, z, time).
 * Mirrors the GLSL formula used in the lake water fragment/vertex shader.
 */
export function evaluateRippleDisplacement(
  ripple: WaterRipple,
  x: number,
  z: number,
  nowSec: number,
): number {
  if (ripple.strength <= 0) return 0;
  const age = nowSec - ripple.startTime;
  if (age < 0 || age > 5.5) return 0;

  const dist = Math.hypot(x - ripple.x, z - ripple.z);
  const waveRadius = age * 1.35;
  const delta = dist - waveRadius;
  const envelope = Math.exp(-delta * delta * 3.8) * Math.exp(-age * 0.78);
  return Math.sin(delta * 16.5) * envelope * ripple.strength;
}

export class WaterRipplePool {
  readonly ripples: WaterRipple[];
  private cursor = 0;

  constructor() {
    this.ripples = Array.from({ length: MAX_WATER_RIPPLES }, () => ({
      x: 0,
      z: 0,
      startTime: -100,
      strength: 0,
    }));
  }

  /**
   * Adds an expanding concentric ripple at world (x, z) with given elapsed time & strength.
   */
  trigger(x: number, z: number, nowSec: number, strength = 1.0): WaterRipple {
    const slot = this.ripples[this.cursor];
    slot.x = x;
    slot.z = z;
    slot.startTime = nowSec;
    slot.strength = Math.max(0.1, Math.min(1.5, strength));
    this.cursor = (this.cursor + 1) % MAX_WATER_RIPPLES;
    return slot;
  }

  /**
   * Counts ripples that are still visibly active at `nowSec`.
   */
  activeCount(nowSec: number): number {
    let count = 0;
    for (const r of this.ripples) {
      const age = nowSec - r.startTime;
      if (r.strength > 0 && age >= 0 && age <= 5.5) {
        count++;
      }
    }
    return count;
  }
}
