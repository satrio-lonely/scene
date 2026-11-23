import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeBreezeState,
  evaluateRippleDisplacement,
  MAX_WATER_RIPPLES,
  WaterRipplePool,
} from './waterRipples';

test('WaterRipplePool stores ripples up to MAX_WATER_RIPPLES and wraps cleanly', () => {
  const pool = new WaterRipplePool();
  assert.equal(pool.activeCount(10), 0);

  for (let i = 0; i < MAX_WATER_RIPPLES + 3; i++) {
    pool.trigger(i * 0.4, -i * 0.3, 10 + i * 0.1, 1.0);
  }
  assert.equal(pool.activeCount(11.5), MAX_WATER_RIPPLES);
  // After 6 seconds all older ripples decay out
  assert.equal(pool.activeCount(25), 0);
});

test('evaluateRippleDisplacement expands outward over time and decays smoothly', () => {
  const ripple = { x: 0, z: 0, startTime: 2.0, strength: 1.0 };
  // Before start -> 0
  assert.equal(evaluateRippleDisplacement(ripple, 0, 0, 1.5), 0);

  // At age = 1.0s, wavefront is around r = 1.35m; displacement near wavefront exceeds far field
  const nearWave = Math.abs(evaluateRippleDisplacement(ripple, 1.45, 0, 3.0));
  const farField = Math.abs(evaluateRippleDisplacement(ripple, 6.0, 0, 3.0));
  assert.ok(nearWave > 0.1, 'Wavefront should have clear amplitude');
  assert.ok(farField < 0.001, 'Far field should be unaffected');
});

test('computeBreezeState maps wind strength to labels and continuous wave/foliage dynamics', () => {
  const calm = computeBreezeState(0.05);
  const gentle = computeBreezeState(0.35);
  const breezy = computeBreezeState(0.92);

  assert.equal(calm.label, 'Tenang');
  assert.equal(gentle.label, 'Sepoi');
  assert.equal(breezy.label, 'Berangin');
  assert.ok(breezy.waveAmplitude > gentle.waveAmplitude);
  assert.ok(gentle.waveAmplitude > calm.waveAmplitude);
  assert.ok(breezy.foliageSwayAmplitude > calm.foliageSwayAmplitude);
});
