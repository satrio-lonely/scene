import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeSunState,
  getCompassLabel,
  normalizeAzimuth,
  SUN_PRESETS,
} from './sunMath';

test('sun direction vector is normalized and tracks elevation & azimuth accurately', () => {
  const noon = computeSunState(85, 180);
  const lenNoon = Math.hypot(
    noon.sunDirection.x,
    noon.sunDirection.y,
    noon.sunDirection.z,
  );
  assert.ok(Math.abs(lenNoon - 1) < 1e-6);
  assert.ok(noon.sunDirection.y > 0.99);

  // North (0°) points toward -Z; East (90°) points toward +X
  const northLow = computeSunState(10, 0);
  assert.ok(northLow.sunDirection.z < -0.9);
  assert.ok(Math.abs(northLow.sunDirection.x) < 1e-6);

  const eastLow = computeSunState(10, 90);
  assert.ok(eastLow.sunDirection.x > 0.9);
  assert.ok(Math.abs(eastLow.sunDirection.z) < 1e-6);
});

test('color temperature, intensity, and lantern glow adapt continuously from twilight to noon', () => {
  const twilight = computeSunState(1, 275);
  const golden = computeSunState(11, 255);
  const noon = computeSunState(65, 160);

  // Sun warms (higher red/blue ratio) near horizon vs noon
  const rbTwilight = twilight.sunColor.r / Math.max(twilight.sunColor.b, 0.01);
  const rbNoon = noon.sunColor.r / Math.max(noon.sunColor.b, 0.01);
  assert.ok(rbTwilight > rbNoon * 1.8);

  // Sun directional intensity increases with elevation
  assert.ok(noon.sunIntensity > golden.sunIntensity);
  assert.ok(golden.sunIntensity > twilight.sunIntensity);

  // Heritage lakeside lantern lights up at twilight and switches off at noon
  assert.ok(twilight.lanternIntensity > 2.5);
  assert.equal(noon.lanternIntensity, 0);
  assert.ok(twilight.starVisibility > 0.5);
  assert.equal(noon.starVisibility, 0);
});

test('compass bearings and azimuth normalization wrap cleanly across 0..360', () => {
  assert.equal(normalizeAzimuth(-45), 315);
  assert.equal(normalizeAzimuth(450), 90);
  assert.equal(getCompassLabel(0), 'U');
  assert.equal(getCompassLabel(90), 'T');
  assert.equal(getCompassLabel(180), 'S');
  assert.equal(getCompassLabel(270), 'B');
  assert.equal(SUN_PRESETS.length, 5);
});
